-- ===============================================
-- VALIDAÇÃO COMPLETA DE DADOS POR QUARTER
-- (SEM filtro de data_carga - TODOS os dados históricos)
-- ===============================================

-- ============== FY26-Q1 (Jan-Mar 2026) ==============

SELECT 
  'FY26-Q1 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confianca AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY26-Q1'

UNION ALL

SELECT 
  'FY26-Q1 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY26-Q1'

UNION ALL

SELECT 
  'FY26-Q1 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY26-Q1'

UNION ALL

-- ============== FY26-Q2 (Abr-Jun 2026) ==============

SELECT 
  'FY26-Q2 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confianca AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY26-Q2'

UNION ALL

SELECT 
  'FY26-Q2 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY26-Q2'

UNION ALL

SELECT 
  'FY26-Q2 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY26-Q2'

UNION ALL

-- ============== FY25-Q4 (Out-Dez 2025) ==============

SELECT 
  'FY25-Q4 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  ROUND(AVG(CAST(Confianca AS FLOAT64))/100, 2) AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY25-Q4'

UNION ALL

SELECT 
  'FY25-Q4 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q = 'FY25-Q4'

UNION ALL

SELECT 
  'FY25-Q4 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Fiscal_Q = 'FY25-Q4'

UNION ALL

-- ============== DISTRIBUIÇÃO COMPLETA DE QUARTERS ==============

SELECT 
  CONCAT('Pipeline - ', IFNULL(Fiscal_Q, 'SEM QUARTER')) AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.pipeline`
GROUP BY Fiscal_Q
HAVING deals_count > 0

UNION ALL

SELECT 
  CONCAT('Won - ', IFNULL(Fiscal_Q, 'SEM QUARTER')) AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_won`
GROUP BY Fiscal_Q
HAVING deals_count > 0

UNION ALL

SELECT 
  CONCAT('Lost - ', IFNULL(Fiscal_Q, 'SEM QUARTER')) AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio,
  0.0 AS confianca_media
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
GROUP BY Fiscal_Q
HAVING deals_count > 0

ORDER BY 
  CASE 
    WHEN metrica LIKE 'FY26-Q1%' THEN 1
    WHEN metrica LIKE 'FY26-Q2%' THEN 2
    WHEN metrica LIKE 'FY25-Q4%' THEN 3
    WHEN metrica LIKE 'Pipeline%' THEN 4
    WHEN metrica LIKE 'Won%' THEN 5
    WHEN metrica LIKE 'Lost%' THEN 6
    ELSE 7
  END,
  metrica;
