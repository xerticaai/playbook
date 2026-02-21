-- ===============================================
-- VALIDAÇÃO DE DADOS POR QUARTER
-- Projeto: operaciones-br
-- Dataset: sales_intelligence
-- Data: 2026-02-08
-- 
-- Objetivo: Criar referência "de-para" para validar
-- filtros de quarter no dashboard
-- ===============================================

-- ============== FY26-Q1 (Jan-Mar 2026) ==============
-- Fiscal Year 26, Quarter 1 = Fev-Abr 2026 (meses 2, 3, 4)
-- Mas pelo contexto fornecido parece ser Jan-Mar

-- Pipeline FY26-Q1
SELECT 
  'FY26-Q1 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confiana AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY26-Q1'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.pipeline`
  )

UNION ALL

-- Deals Fechados GANHOS FY26-Q1
SELECT 
  'FY26-Q1 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY26-Q1'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
  )

UNION ALL

-- Deals Fechados PERDIDOS FY26-Q1
SELECT 
  'FY26-Q1 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY26-Q1'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  )

UNION ALL

-- ============== FY26-Q2 (Abr-Jun 2026) ==============
-- Fiscal Year 26, Quarter 2 = Mai-Jul 2026 (meses 5, 6, 7)

-- Pipeline FY26-Q2
SELECT 
  'FY26-Q2 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confiana AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY26-Q2'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.pipeline`
  )

UNION ALL

-- Deals Fechados GANHOS FY26-Q2
SELECT 
  'FY26-Q2 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY26-Q2'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
  )

UNION ALL

-- Deals Fechados PERDIDOS FY26-Q2
SELECT 
  'FY26-Q2 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY26-Q2'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  )

UNION ALL

-- ============== FY25-Q4 (Out-Dez 2025) ==============
-- Fiscal Year 25, Quarter 4

-- Pipeline FY25-Q4
SELECT 
  'FY25-Q4 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confiana AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY25-Q4'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.pipeline`
  )

UNION ALL

-- Deals Fechados GANHOS FY25-Q4
SELECT 
  'FY25-Q4 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY25-Q4'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
  )

UNION ALL

-- Deals Fechados PERDIDOS FY25-Q4
SELECT 
  'FY25-Q4 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY25-Q4'
  AND data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  )

UNION ALL

-- ============== TOTAIS GLOBAIS (Todos os Quarters) ==============

-- Pipeline Total (Todos Anos)
SELECT 
  'TOTAL Pipeline (Todos)' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confiana AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.pipeline`
  )

UNION ALL

-- Deals Fechados GANHOS (Todos Quarters)
SELECT 
  'TOTAL Deals Ganhos (Todos)' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
  )

UNION ALL

-- Deals Fechados PERDIDOS (Todos Quarters)
SELECT 
  'TOTAL Deals Perdidos (Todos)' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE data_carga = (
    SELECT MAX(data_carga) 
    FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  )

ORDER BY 
  CASE 
    WHEN metrica LIKE 'FY26-Q1%' THEN 1
    WHEN metrica LIKE 'FY26-Q2%' THEN 2
    WHEN metrica LIKE 'FY25-Q4%' THEN 3
    ELSE 4
  END,
  metrica;
