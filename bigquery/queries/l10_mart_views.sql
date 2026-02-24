-- ============================================================
-- mart_l10: views complementares ao faturamento semanal
-- Projeto: operaciones-br | Dataset: mart_l10
-- Criado: 2026-02-24
-- ============================================================
-- 1. v_pipeline_consolidado
-- 2. v_faturamento_historico
-- 3. v_attainment
-- ============================================================


-- ============================================================
-- 1. v_pipeline_consolidado
--    Pipeline com vendedor_canonico, squad_canonico, portfolio
--    e classificação de conta foco derivados.
--    CE = Owner_Preventa quando presente.
-- ============================================================
CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_pipeline_consolidado` AS
WITH
dim AS (
  SELECT
    vendedor_canonico,
    COALESCE(alias_fat, vendedor_canonico) AS origem_nome,
    squad,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(alias_fat, vendedor_canonico, '')), NFD), r'[^a-z0-9]+', '')) AS origem_norm
  FROM `operaciones-br.mart_l10.dim_vendedor`
  WHERE ativo = TRUE AND vendedor_canonico != 'NAO_MAPEADO'
)
SELECT
  p.Oportunidade                                          AS oportunidade,
  p.Conta                                                 AS conta,
  p.Vendedor                                              AS vendedor_raw,
  p.Owner_Preventa                                        AS owner_preventa,
  COALESCE(
    dim.vendedor_canonico,
    NULLIF(TRIM(p.Vendedor), ''),
    'NAO_MAPEADO'
  )                                                       AS vendedor_canonico,
  CASE
    WHEN p.Owner_Preventa IS NOT NULL
         AND TRIM(p.Owner_Preventa) != ''                 THEN 'CE'
    WHEN dim.squad IS NOT NULL                            THEN dim.squad
    WHEN p.Segmento_consolidado IN
         ('SB','Mid Market','Digital Natives')            THEN 'NAO_GTM'
    WHEN p.Segmento_consolidado IS NOT NULL
         AND TRIM(p.Segmento_consolidado) NOT IN
         ('','-')                                         THEN 'Sales Outras GTM'
    ELSE 'PENDENTE'
  END                                                     AS squad_canonico,
  p.Segmento_consolidado                                  AS segmento,
  p.Subsegmento_de_mercado                                AS subsegmento,
  p.Portfolio                                             AS portfolio_raw,
  CASE
    WHEN UPPER(p.Portfolio) LIKE '%WT%'  OR p.Portfolio = 'WT'  THEN 'Workspace'
    WHEN UPPER(p.Portfolio) LIKE '%GCP%' OR p.Portfolio = 'GCP' THEN 'GCP'
    WHEN UPPER(p.Portfolio) LIKE '%MSP%'                         THEN 'MSP'
    ELSE COALESCE(NULLIF(TRIM(p.Portfolio), ''), 'NAO_INFORMADO')
  END                                                     AS portfolio_canonico,
  p.Gross                                                 AS gross,
  p.Net                                                   AS net_revenue,
  p.Confianca                                             AS confianca_pct,
  p.Fase_Atual                                            AS fase_atual,
  p.Forecast_IA                                           AS forecast_ia,
  p.Forecast_SF                                           AS forecast_sf,
  p.Fiscal_Q                                              AS fiscal_q,
  p.Idle_Dias                                             AS idle_dias,
  p.Cod_Acao                                              AS cod_acao,
  p.Acao_Sugerida                                         AS acao_sugerida,
  p.MEDDIC_Score                                          AS meddic_score,
  p.BANT_Score                                            AS bant_score,
  p.MEDDIC_Gaps                                           AS meddic_gaps,
  p.Flags_de_Risco                                        AS flags_risco,
  p.Regras_Aplicadas                                      AS regras_aplicadas,
  p.Run_ID,
  p.data_carga
FROM `operaciones-br.sales_intelligence.pipeline` p
LEFT JOIN dim
  ON LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(p.Vendedor, '')), NFD), r'[^a-z0-9]+', ''))
     = dim.origem_norm;


-- ============================================================
-- 2. v_faturamento_historico
--    União de faturamento_2025 + faturamento_2026 com
--    mesmas colunas derivadas da view semanal.
--    net_revenue = já líquido do custo Google.
-- ============================================================
CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_faturamento_historico` AS
WITH
oportunidade_map AS (
  SELECT Oportunidade, Vendedor,
    ROW_NUMBER() OVER (
      PARTITION BY Oportunidade
      ORDER BY CASE src WHEN 'closed_won' THEN 1 WHEN 'pipeline' THEN 2 ELSE 3 END
    ) AS rn
  FROM (
    SELECT Oportunidade, Vendedor, 'closed_won'  AS src
      FROM `operaciones-br.sales_intelligence.closed_deals_won`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
    UNION ALL
    SELECT Oportunidade, Vendedor, 'pipeline'    AS src
      FROM `operaciones-br.sales_intelligence.pipeline`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
    UNION ALL
    SELECT Oportunidade, Vendedor, 'closed_lost' AS src
      FROM `operaciones-br.sales_intelligence.closed_deals_lost`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
  )
),
dim AS (
  SELECT
    vendedor_canonico,
    squad,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(alias_fat, vendedor_canonico, '')), NFD), r'[^a-z0-9]+', '')) AS origem_norm
  FROM `operaciones-br.mart_l10.dim_vendedor`
  WHERE ativo = TRUE AND vendedor_canonico != 'NAO_MAPEADO'
),
base2025 AS (
  SELECT
    '2025'                         AS ano_fonte,
    mes, pais, cuenta_financeira, tipo_documento, fecha_factura,
    poliza_pais, cuenta_contable, valor_fatura_moeda_local_sem_iva,
    produto, oportunidade, cliente,
    NULL AS id_oportunidade, NULL AS billing_id,
    percentual_desconto_xertica_ns, tipo_produto, portafolio,
    timbradas, estado_pagamento, fecha_doc_timbrado,
    familia, NULL AS tipo_cambio_pactado, tipo_cambio_diario,
    valor_fatura_usd_comercial, net_revenue,
    custo_percentual, custo_moeda_local, net_ajustado_usd,
    percentual_margem, NULL AS incentivos_google, backlog_nomeado,
    pais_comercial, comercial, segmento, dominio,
    margem_percentual_final, etapa_oportunidade, desconto_xertica,
    CAST(Run_ID AS STRING)         AS Run_ID,
    data_carga
  FROM `operaciones-br.sales_intelligence.faturamento_2025`
),
base2026 AS (
  SELECT
    '2026'                         AS ano_fonte,
    mes, pais, cuenta_financeira, tipo_documento, fecha_factura,
    poliza_pais, cuenta_contable, valor_fatura_moeda_local_sem_iva,
    produto, oportunidade, cliente,
    NULL AS id_oportunidade, NULL AS billing_id,
    percentual_desconto_xertica_ns, tipo_produto, portafolio,
    timbradas, estado_pagamento, fecha_doc_timbrado,
    familia, NULL AS tipo_cambio_pactado, tipo_cambio_diario,
    valor_fatura_usd_comercial, net_revenue,
    custo_percentual, custo_moeda_local, net_ajustado_usd,
    percentual_margem, NULL AS incentivos_google, backlog_nomeado,
    pais_comercial, comercial, segmento, dominio,
    margem_percentual_final, etapa_oportunidade, desconto_xertica,
    CAST(Run_ID AS STRING)         AS Run_ID,
    data_carga
  FROM `operaciones-br.sales_intelligence.faturamento_2026`
),
combined AS (
  SELECT * FROM base2025
  UNION ALL
  SELECT * FROM base2026
),
enriched AS (
  SELECT
    c.*,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(c.comercial, '')), NFD), r'[^a-z0-9]+', '')) AS comercial_norm,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', c.fecha_factura),
      SAFE.PARSE_DATE('%d/%m/%Y', c.fecha_factura)
    ) AS fecha_factura_date
  FROM combined c
)
SELECT
  e.ano_fonte,
  e.mes, e.pais, e.cuenta_financeira, e.tipo_documento,
  e.fecha_factura, e.fecha_factura_date,
  DATE_TRUNC(e.fecha_factura_date, WEEK(MONDAY)) AS semana_inicio,
  DATE_TRUNC(e.fecha_factura_date, MONTH)         AS mes_inicio,
  DATE_TRUNC(e.fecha_factura_date, QUARTER)       AS quarter_inicio,
  FORMAT('FY%s-Q%s',
    SUBSTR(CAST(EXTRACT(YEAR FROM e.fecha_factura_date) AS STRING), 3),
    CAST(EXTRACT(QUARTER FROM e.fecha_factura_date) AS STRING)
  )                                               AS fiscal_q_derivado,
  e.poliza_pais, e.cuenta_contable,
  e.valor_fatura_moeda_local_sem_iva,
  e.produto, e.oportunidade, e.cliente,
  e.id_oportunidade, e.billing_id,
  e.percentual_desconto_xertica_ns, e.tipo_produto,
  e.portafolio,
  CASE
    WHEN UPPER(e.portafolio) LIKE '%WT%'  OR e.portafolio = 'WT'  THEN 'Workspace'
    WHEN UPPER(e.portafolio) LIKE '%GCP%' OR e.portafolio = 'GCP' THEN 'GCP'
    WHEN UPPER(e.portafolio) LIKE '%MSP%'                          THEN 'MSP'
    ELSE COALESCE(NULLIF(TRIM(e.portafolio), ''), 'NAO_INFORMADO')
  END                                             AS portfolio_fat_canonico,
  e.timbradas, e.estado_pagamento,
  COALESCE(NULLIF(TRIM(e.estado_pagamento), ''), 'NAO_INFORMADO') AS estado_pagamento_saneado,
  e.fecha_doc_timbrado, e.familia,
  e.tipo_cambio_pactado, e.tipo_cambio_diario,
  e.valor_fatura_usd_comercial,
  COALESCE(e.valor_fatura_usd_comercial, 0)       AS gross_revenue_saneado,
  e.net_revenue,
  COALESCE(e.net_revenue, 0)                      AS net_revenue_saneado,
  e.custo_percentual,
  e.custo_moeda_local,
  -- net_real = net_revenue (já descontado custo Google)
  COALESCE(e.net_revenue, 0)                      AS net_real,
  e.net_ajustado_usd,
  e.percentual_margem,
  e.incentivos_google, e.backlog_nomeado,
  e.pais_comercial, e.comercial, e.segmento, e.dominio,
  e.margem_percentual_final, e.etapa_oportunidade, e.desconto_xertica,
  COALESCE(
    dim.vendedor_canonico,
    om.Vendedor,
    NULLIF(TRIM(e.comercial), ''),
    'NAO_MAPEADO'
  )                                               AS vendedor_canonico,
  CASE
    WHEN dim.squad IS NOT NULL                    THEN dim.squad
    WHEN om.Vendedor IS NOT NULL                  THEN 'PENDENTE'
    WHEN e.segmento IN ('SB','Digital Natives','Mid Market') THEN 'NAO_GTM'
    WHEN e.segmento IS NOT NULL
         AND TRIM(e.segmento) NOT IN ('','-','Xertica') THEN 'Sales Outras GTM'
    ELSE 'PENDENTE'
  END                                             AS squad_canonico,
  CASE
    WHEN dim.vendedor_canonico IS NOT NULL        THEN 'dim_vendedor'
    WHEN om.Vendedor IS NOT NULL                  THEN 'oportunidade_join'
    WHEN e.comercial IS NOT NULL
         AND TRIM(e.comercial) != ''              THEN 'fallback_comercial'
    ELSE 'nao_mapeado'
  END                                             AS vendedor_match_source,
  e.Run_ID, e.data_carga
FROM enriched e
LEFT JOIN dim
  ON e.comercial_norm = dim.origem_norm
LEFT JOIN oportunidade_map om
  ON e.oportunidade = om.Oportunidade AND om.rn = 1;


-- ============================================================
-- 3. v_attainment
--    Realizado (faturamento_semanal) × Meta (tabela meta)
--    Granularidade: mensal + trimestral
--    net_real = net_revenue (líquido custo Google)
-- ============================================================
CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_attainment` AS
WITH
realizado_mensal AS (
  SELECT
    mes_inicio,
    fiscal_q_derivado                              AS fiscal_q,
    SUM(gross_revenue_saneado)                     AS gross_realizado,
    SUM(net_revenue_saneado)                       AS net_realizado
  FROM `operaciones-br.mart_l10.v_faturamento_semanal_consolidado`
  WHERE mes_inicio IS NOT NULL
  GROUP BY 1, 2
),
meta_mensal AS (
  SELECT
    PARSE_DATE('%m/%Y', Mes_Ano)                   AS mes_inicio,
    Periodo_Fiscal                                  AS fiscal_q,
    SUM(Gross)                                     AS meta_gross,
    SUM(Net)                                       AS meta_net
  FROM `operaciones-br.sales_intelligence.meta`
  GROUP BY 1, 2
)
SELECT
  COALESCE(r.mes_inicio, m.mes_inicio)             AS mes_inicio,
  COALESCE(r.fiscal_q, m.fiscal_q)                 AS fiscal_q,
  FORMAT_DATE('%m/%Y', COALESCE(r.mes_inicio, m.mes_inicio)) AS mes_ano_label,
  COALESCE(m.meta_gross, 0)                        AS meta_gross,
  COALESCE(m.meta_net, 0)                          AS meta_net,
  COALESCE(r.gross_realizado, 0)                   AS gross_realizado,
  COALESCE(r.net_realizado, 0)                     AS net_realizado,
  SAFE_DIVIDE(r.gross_realizado, m.meta_gross)     AS pct_attainment_gross,
  SAFE_DIVIDE(r.net_realizado,   m.meta_net)       AS pct_attainment_net,
  m.meta_gross - COALESCE(r.gross_realizado, 0)    AS gap_gross,
  m.meta_net   - COALESCE(r.net_realizado,   0)    AS gap_net
FROM meta_mensal m
FULL OUTER JOIN realizado_mensal r
  ON m.mes_inicio = r.mes_inicio;
