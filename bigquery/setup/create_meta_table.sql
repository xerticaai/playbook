-- =====================================================================
-- TABELA: meta (origem: Google Sheets aba "Meta")
-- Projeto: operaciones-br
-- Dataset: sales_intelligence
-- Objetivo: armazenar metas mensais (Budget Board)
-- Data: 2026-02-21
-- =====================================================================

CREATE TABLE IF NOT EXISTS `operaciones-br.sales_intelligence.meta` (
  Tipo_de_meta STRING,
  Mes_Ano STRING,
  Gross FLOAT64,
  Net FLOAT64,
  Periodo_Fiscal STRING,
  Run_ID TIMESTAMP,
  data_carga TIMESTAMP
)
PARTITION BY DATE(data_carga);
