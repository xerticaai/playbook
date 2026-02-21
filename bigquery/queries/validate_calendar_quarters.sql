-- ===============================================
-- VALIDAÇÃO DE DADOS POR CALENDAR QUARTERS
-- Usando Data_Prevista (pipeline) e Data_Fechamento (closed)
-- Q1 = Jan-Mar, Q2 = Abr-Jun, Q3 = Jul-Set, Q4 = Out-Dez
-- ===============================================

-- ============== 2026 Q1 (Janeiro-Março) ==============

SELECT 
  '2026-Q1 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = 2026
  AND EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN 1 AND 3

UNION ALL

SELECT 
  '2026-Q1 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2026
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 1 AND 3

UNION ALL

SELECT 
  '2026-Q1 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2026
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 1 AND 3

UNION ALL

-- ============== 2026 Q2 (Abril-Junho) ==============

SELECT 
  '2026-Q2 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = 2026
  AND EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN 4 AND 6

UNION ALL

SELECT 
  '2026-Q2 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2026
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 4 AND 6

UNION ALL

SELECT 
  '2026-Q2 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2026
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 4 AND 6

UNION ALL

-- ============== 2025 Q4 (Outubro-Dezembro) ==============

SELECT 
  '2025-Q4 Pipeline' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = 2025
  AND EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN 10 AND 12

UNION ALL

SELECT 
  '2025-Q4 Deals Ganhos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2025
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 10 AND 12

UNION ALL

SELECT 
  '2025-Q4 Deals Perdidos' AS metrica,
  COUNT(*) AS deals_count,
  ROUND(SUM(Gross), 2) AS gross_total,
  ROUND(SUM(Net), 2) AS net_total,
  ROUND(AVG(Gross), 2) AS gross_medio
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = 2025
  AND EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN 10 AND 12

ORDER BY 
  CASE 
    WHEN metrica LIKE '2026-Q1%' THEN 1
    WHEN metrica LIKE '2026-Q2%' THEN 2
    WHEN metrica LIKE '2025-Q4%' THEN 3
    ELSE 4
  END,
  metrica;
