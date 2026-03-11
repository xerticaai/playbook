-- ============================================================
-- V2 Portal Sales Views (RLS-ready)
-- Projeto: operaciones-br | Dataset: mart_l10
-- Sem alterar views existentes (convivencia em paralelo)
-- ============================================================

CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_bdmcs_net_faturado_qtr` AS
WITH base AS (
  SELECT
    LOWER(TRIM(comercial)) AS owner_key,
    oportunidade,
    cliente,
    SAFE_CAST(net_revenue AS NUMERIC) AS net_revenue,
    tipo_oportunidade_line,
    LOWER(CONCAT(COALESCE(produto, ''), ' ', COALESCE(familia, ''))) AS prod_fam_text,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
      SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
    ) AS dt_fatura,
    FORMAT('FY%s-Q%s',
      SUBSTR(CAST(EXTRACT(YEAR FROM COALESCE(
        SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
        SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
      )) AS STRING), 3),
      CAST(EXTRACT(QUARTER FROM COALESCE(
        SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
        SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
      )) AS STRING)
    ) AS fiscal_q
  FROM `operaciones-br.sales_intelligence.faturamento_2026`
)
SELECT
  owner_key,
  fiscal_q,
  ROUND(SUM(net_revenue), 2) AS net_faturado_incremental
FROM base
WHERE dt_fatura IS NOT NULL
  AND tipo_oportunidade_line IN ('Nova', 'Adicional')
  AND NOT REGEXP_CONTAINS(prod_fam_text, r'(rebate|incentiv|intercompanhia)')
GROUP BY 1, 2;


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_ss_net_gerado_qtr` AS
SELECT
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Fiscal_Q AS fiscal_q,
  ROUND(SUM(CASE WHEN UPPER(TRIM(Elegibilidade_SS)) = 'ELEGIVEL' THEN COALESCE(Net, 0) ELSE 0 END), 2) AS net_gerado_elegivel,
  COUNT(DISTINCT CASE WHEN UPPER(TRIM(Elegibilidade_SS)) = 'ELEGIVEL' THEN Oportunidade END) AS opps_elegiveis
FROM `operaciones-br.sales_intelligence.pipeline`
GROUP BY 1, 2;


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_bdmcs_meta_vs_realizado` AS
WITH meta AS (
  SELECT
    LOWER(TRIM(BDM)) AS owner_key,
    Periodo_Fiscal AS fiscal_q,
    ROUND(SUM(COALESCE(Net_faturado, 0)), 2) AS meta_net_faturado
  FROM `operaciones-br.sales_intelligence.meta_bdm`
  GROUP BY 1, 2
), real AS (
  SELECT owner_key, fiscal_q, net_faturado_incremental
  FROM `operaciones-br.mart_l10.v2_bdmcs_net_faturado_qtr`
)
SELECT
  COALESCE(m.owner_key, r.owner_key) AS owner_key,
  COALESCE(m.fiscal_q, r.fiscal_q) AS fiscal_q,
  COALESCE(m.meta_net_faturado, 0) AS meta_net_faturado,
  COALESCE(r.net_faturado_incremental, 0) AS net_faturado_incremental,
  ROUND(SAFE_DIVIDE(COALESCE(r.net_faturado_incremental, 0), NULLIF(COALESCE(m.meta_net_faturado, 0), 0)) * 100, 1) AS attainment_pct,
  ROUND(COALESCE(m.meta_net_faturado, 0) - COALESCE(r.net_faturado_incremental, 0), 2) AS gap_net
FROM meta m
FULL JOIN real r USING(owner_key, fiscal_q);


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_ss_meta_vs_realizado` AS
WITH meta AS (
  SELECT
    LOWER(TRIM(Sales_Specialist)) AS ss_key,
    Periodo_Fiscal AS fiscal_q,
    ROUND(SUM(COALESCE(Net_gerado, 0)), 2) AS meta_net_gerado
  FROM `operaciones-br.sales_intelligence.meta_bdm`
  GROUP BY 1, 2
), real AS (
  SELECT ss_key, fiscal_q, net_gerado_elegivel
  FROM `operaciones-br.mart_l10.v2_ss_net_gerado_qtr`
)
SELECT
  COALESCE(m.ss_key, r.ss_key) AS ss_key,
  COALESCE(m.fiscal_q, r.fiscal_q) AS fiscal_q,
  COALESCE(m.meta_net_gerado, 0) AS meta_net_gerado,
  COALESCE(r.net_gerado_elegivel, 0) AS net_gerado_elegivel,
  ROUND(SAFE_DIVIDE(COALESCE(r.net_gerado_elegivel, 0), NULLIF(COALESCE(m.meta_net_gerado, 0), 0)) * 100, 1) AS attainment_pct,
  ROUND(COALESCE(m.meta_net_gerado, 0) - COALESCE(r.net_gerado_elegivel, 0), 2) AS gap_net
FROM meta m
FULL JOIN real r USING(ss_key, fiscal_q);


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_bdmcs_daily_actions` AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Oportunidade,
  Conta,
  Fiscal_Q,
  Fase_Atual,
  Data_Prevista,
  Gross,
  Net,
  Velocity_Predicao,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Status_Governanca_SS,
  CASE UPPER(TRIM(COALESCE(Velocity_Predicao, '')))
    WHEN 'ESTAGNADO' THEN 1
    WHEN 'DESACELERANDO' THEN 2
    ELSE 3
  END AS action_sort_rank
FROM `operaciones-br.sales_intelligence.pipeline`;


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_bdmcs_handoff_status` AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Oportunidade,
  Conta,
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Data_Prevista,
  Net,
  Gross
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE NULLIF(TRIM(Sales_Specialist_Envolvido), '') IS NOT NULL;


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_ss_closing_queue` AS
SELECT
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Oportunidade,
  Conta,
  Fiscal_Q,
  Fase_Atual,
  Data_Prevista,
  Net,
  Gross,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Velocity_Predicao,
  Risco_Principal,
  Perguntas_de_Auditoria_IA
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE NULLIF(TRIM(Sales_Specialist_Envolvido), '') IS NOT NULL
  AND UPPER(TRIM(COALESCE(Elegibilidade_SS, ''))) = 'ELEGIVEL';


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_admin_governance_monitor` AS
SELECT
  Fiscal_Q,
  Vendedor,
  Sales_Specialist_Envolvido,
  Oportunidade,
  Conta,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Net,
  Gross,
  Data_Prevista
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE REGEXP_CONTAINS(UPPER(COALESCE(Status_Governanca_SS, '')), r'(ERRO|ALERTA)');


CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v2_admin_slippage_zumbis` AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Fiscal_Q,
  COUNT(*) AS total_opps,
  SUM(CASE WHEN COALESCE(Mudancas_Close_Date, 0) >= 2 THEN 1 ELSE 0 END) AS opps_slippage,
  SUM(CASE WHEN COALESCE(Idle_Dias, 0) >= 14 THEN 1 ELSE 0 END) AS opps_idle_14,
  SUM(CASE WHEN COALESCE(Idle_Dias, 0) >= 30 THEN 1 ELSE 0 END) AS opps_zumbi,
  SUM(CASE WHEN UPPER(COALESCE(Forecast_IA, '')) IN ('PIPELINE', 'BEST CASE') AND COALESCE(Idle_Dias, 0) >= 14 THEN 1 ELSE 0 END) AS risco_forecast_desalinhado,
  ROUND(SUM(COALESCE(Net, 0)), 2) AS net_pipeline
FROM `operaciones-br.sales_intelligence.pipeline`
GROUP BY 1, 2;
