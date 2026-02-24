-- L10 Hardening de dados: faturamento semanal
-- Projeto: operaciones-br
-- Dataset origem: sales_intelligence
-- Dataset destino: mart_l10

CREATE SCHEMA IF NOT EXISTS `operaciones-br.mart_l10`;

-- dim_vendedor: tabela mestre de vendedores canônicos
-- Substituiu dim_vendedor_manual (2026-02-24)
-- squad: Sales Nomeadas | Sales Outras GTM | CS | SS | PENDENTE | NAO_MAPEADO
-- alias_fat: valor exato em faturamento_*.comercial quando difere do nome canônico
CREATE TABLE IF NOT EXISTS `operaciones-br.mart_l10.dim_vendedor` (
  vendedor_canonico  STRING NOT NULL,
  alias_fat          STRING,
  squad              STRING,
  ativo              BOOL,
  updated_at         TIMESTAMP
);

-- Para adicionar ou corrigir um vendedor, use MERGE abaixo.
-- alias_fat só precisa ser preenchido se o nome no ERP (comercial) for diferente
-- do nome canônico. Para os 16 vendedores confirmados, alias_fat = NULL (match exato).
MERGE `operaciones-br.mart_l10.dim_vendedor` T
USING (
  SELECT CAST(NULL AS STRING) AS alias_fat, 'NAO_MAPEADO' AS vendedor_canonico, 'NAO_MAPEADO' AS squad, 'Xertica' AS chave UNION ALL
  SELECT CAST(NULL AS STRING),              'NAO_MAPEADO',                       'NAO_MAPEADO',          '#N/A'
) S
ON T.vendedor_canonico = S.vendedor_canonico
   AND COALESCE(T.alias_fat,'') = COALESCE(S.chave,'')
WHEN MATCHED THEN
  UPDATE SET squad = S.squad, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (vendedor_canonico, alias_fat, squad, ativo, updated_at)
  VALUES (S.vendedor_canonico, S.chave, S.squad, TRUE, CURRENT_TIMESTAMP());

CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_faturamento_semanal_consolidado` AS
WITH
base AS (
  SELECT
    f.*,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(f.comercial, '')), NFD), r'[^a-z0-9]+', '')) AS comercial_norm,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', f.fecha_factura),
      SAFE.PARSE_DATE('%d/%m/%Y', f.fecha_factura)
    ) AS fecha_factura_date,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', f.fecha_doc_timbrado),
      SAFE.PARSE_DATE('%d/%m/%Y', f.fecha_doc_timbrado)
    ) AS fecha_doc_timbrado_date
  FROM `operaciones-br.sales_intelligence.faturamento_semanal` f
),
manual_map AS (
  -- Usa alias_fat quando preenchido (buckets ERP: Xertica, #N/A);
  -- para os demais vendedor_canonico = nome exato do comercial (alias_fat = NULL)
  SELECT
    COALESCE(alias_fat, vendedor_canonico) AS origem_nome,
    vendedor_canonico,
    squad,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(alias_fat, vendedor_canonico, '')), NFD), r'[^a-z0-9]+', '')) AS origem_norm
  FROM `operaciones-br.mart_l10.dim_vendedor`
  WHERE ativo = TRUE AND vendedor_canonico != 'NAO_MAPEADO'
),
pipeline_vendedores AS (
  SELECT DISTINCT
    Vendedor AS vendedor_canonico,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(Vendedor, '')), NFD), r'[^a-z0-9]+', '')) AS vendedor_norm
  FROM `operaciones-br.sales_intelligence.pipeline`
  WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != ''
),
sales_specialist_vendedores AS (
  SELECT DISTINCT
    vendedor AS vendedor_canonico,
    LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(vendedor, '')), NFD), r'[^a-z0-9]+', '')) AS vendedor_norm
  FROM `operaciones-br.sales_intelligence.sales_specialist`
  WHERE vendedor IS NOT NULL AND TRIM(vendedor) != ''
),
-- Sprint A2: resolve comercial='Xertica' (e outros) via join por oportunidade
-- Prioridade: closed_won > pipeline > closed_lost
oportunidade_map AS (
  SELECT Oportunidade, Vendedor,
    ROW_NUMBER() OVER (
      PARTITION BY Oportunidade
      ORDER BY CASE src WHEN 'closed_won' THEN 1 WHEN 'pipeline' THEN 2 ELSE 3 END
    ) AS rn
  FROM (
    SELECT Oportunidade, Vendedor, 'closed_won'  AS src FROM `operaciones-br.sales_intelligence.closed_deals_won`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
    UNION ALL
    SELECT Oportunidade, Vendedor, 'pipeline'    AS src FROM `operaciones-br.sales_intelligence.pipeline`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
    UNION ALL
    SELECT Oportunidade, Vendedor, 'closed_lost' AS src FROM `operaciones-br.sales_intelligence.closed_deals_lost`
      WHERE Vendedor IS NOT NULL AND TRIM(Vendedor) != '' AND Oportunidade IS NOT NULL
  )
)
SELECT
  b.mes,
  b.pais,
  b.cuenta_financeira,
  b.tipo_documento,
  b.fecha_factura,
  b.fecha_factura_date,
  DATE_TRUNC(b.fecha_factura_date, WEEK(MONDAY)) AS semana_inicio,
  DATE_TRUNC(b.fecha_factura_date, MONTH) AS mes_inicio,
  DATE_TRUNC(b.fecha_factura_date, QUARTER) AS quarter_inicio,
  FORMAT('FY%s-Q%s',
    SUBSTR(CAST(EXTRACT(YEAR FROM b.fecha_factura_date) AS STRING), 3),
    CAST(EXTRACT(QUARTER FROM b.fecha_factura_date) AS STRING)
  ) AS fiscal_q_derivado,
  b.poliza_pais,
  b.cuenta_contable,
  b.valor_fatura_moeda_local_sem_iva,
  b.produto,
  b.oportunidade,
  b.cliente,
  b.id_oportunidade,
  b.billing_id,
  b.percentual_desconto_xertica_ns,
  b.tipo_produto,
  b.portafolio,
  CASE
    WHEN UPPER(b.portafolio) LIKE '%WT%'  OR b.portafolio = 'WT'  THEN 'Workspace'
    WHEN UPPER(b.portafolio) LIKE '%GCP%' OR b.portafolio = 'GCP' THEN 'GCP'
    WHEN UPPER(b.portafolio) LIKE '%MSP%'                          THEN 'MSP'
    ELSE COALESCE(NULLIF(TRIM(b.portafolio),''), 'NAO_INFORMADO')
  END AS portfolio_fat_canonico,
  b.timbradas,
  b.estado_pagamento,
  COALESCE(NULLIF(TRIM(b.estado_pagamento), ''), 'NAO_INFORMADO') AS estado_pagamento_saneado,
  b.fecha_doc_timbrado,
  b.fecha_doc_timbrado_date,
  b.familia,
  b.tipo_cambio_pactado,
  b.tipo_cambio_diario,
  b.valor_fatura_usd_comercial,
  COALESCE(b.valor_fatura_usd_comercial, 0) AS gross_revenue_saneado,
  b.net_revenue,
  COALESCE(b.net_revenue, 0) AS net_revenue_saneado,
  b.incentivos_google,
  b.backlog_nomeado,
  b.pais_comercial,
  b.comercial,
  COALESCE(
    mm.vendedor_canonico,
    om.Vendedor,
    pv.vendedor_canonico,
    sv.vendedor_canonico,
    NULLIF(TRIM(b.comercial), ''),
    'NAO_MAPEADO'
  ) AS vendedor_canonico,
  CASE
    WHEN mm.squad IS NOT NULL   THEN mm.squad
    WHEN dv_om.squad IS NOT NULL THEN dv_om.squad
    WHEN b.segmento IN ('SB', 'Digital Natives', 'Mid Market') THEN 'NAO_GTM'
    WHEN b.segmento IS NOT NULL
         AND TRIM(b.segmento) NOT IN ('', '-', 'Xertica')      THEN 'Sales Outras GTM'
    ELSE 'PENDENTE'
  END AS squad_canonico,
  CASE
    WHEN mm.vendedor_canonico IS NOT NULL THEN 'dim_vendedor'
    WHEN om.Vendedor IS NOT NULL           THEN 'oportunidade_join'
    WHEN pv.vendedor_canonico IS NOT NULL  THEN 'pipeline_exact'
    WHEN sv.vendedor_canonico IS NOT NULL  THEN 'sales_specialist_exact'
    WHEN b.comercial IS NOT NULL AND TRIM(b.comercial) != '' THEN 'fallback_comercial'
    ELSE 'nao_mapeado'
  END AS vendedor_match_source,
  b.ano_oportunidade,
  b.tipo_oportunidade_line,
  b.dominio,
  b.segmento,
  b.concatenar,
  b.margem_percentual_final,
  b.revisao_margem,
  b.etapa_oportunidade,
  b.desconto_xertica,
  b.cenario_nr,
  b.Run_ID,
  b.data_carga,
  b.fecha_factura_date IS NULL AS flag_fecha_factura_invalida,
  b.net_revenue IS NULL AS flag_net_revenue_nulo,
  (b.estado_pagamento IS NULL OR TRIM(b.estado_pagamento) = '') AS flag_estado_pagamento_nulo,
  (b.id_oportunidade IS NULL OR TRIM(b.id_oportunidade) = '') AS flag_id_oportunidade_nulo,
  (b.billing_id IS NULL OR TRIM(b.billing_id) = '') AS flag_billing_id_nulo
FROM base b
LEFT JOIN manual_map mm
  ON b.comercial_norm = mm.origem_norm
LEFT JOIN oportunidade_map om
  ON b.oportunidade = om.Oportunidade AND om.rn = 1
LEFT JOIN `operaciones-br.mart_l10.dim_vendedor` dv_om
  ON LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(om.Vendedor, '')), NFD), r'[^a-z0-9]+', ''))
     = LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(dv_om.vendedor_canonico, '')), NFD), r'[^a-z0-9]+', ''))
  AND dv_om.ativo = TRUE
LEFT JOIN pipeline_vendedores pv
  ON b.comercial_norm = pv.vendedor_norm
LEFT JOIN sales_specialist_vendedores sv
  ON b.comercial_norm = sv.vendedor_norm;

CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_faturamento_semanal_kpis` AS
SELECT
  semana_inicio,
  mes_inicio,
  quarter_inicio,
  vendedor_canonico,
  squad_canonico,
  estado_pagamento_saneado,
  SUM(gross_revenue_saneado) AS gross_revenue,
  SUM(net_revenue_saneado) AS net_revenue,
  COUNT(*) AS linhas,
  COUNTIF(flag_net_revenue_nulo) AS linhas_net_nulo,
  COUNTIF(flag_estado_pagamento_nulo) AS linhas_estado_nulo,
  COUNTIF(vendedor_match_source = 'nao_mapeado') AS linhas_vendedor_nao_mapeado
FROM `operaciones-br.mart_l10.v_faturamento_semanal_consolidado`
GROUP BY
  semana_inicio,
  mes_inicio,
  quarter_inicio,
  vendedor_canonico,
  squad_canonico,
  estado_pagamento_saneado;
