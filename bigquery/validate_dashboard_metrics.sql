-- ========================================
-- VALIDAÇÃO DE MÉTRICAS DO DASHBOARD
-- Dashboard: https://x-gtm.web.app/
-- Data: 2026-02-08
-- ========================================

-- 1. PIPELINE TOTAL (sem filtros)
SELECT 
  '1. PIPELINE TOTAL' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net
FROM `operaciones-br.sales_intelligence.pipeline`;

-- 2. PIPELINE FILTRADO Q1 2026
SELECT 
  '2. PIPELINE Q1 2026' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q = 'FY26-Q1';

-- 3. PREVISÃO PONDERADA IA (confiança média)
SELECT 
  '3. PREVISÃO PONDERADA' as metric,
  COUNT(*) as deals_count,
  ROUND(AVG(SAFE_CAST(Confianca AS FLOAT64)), 2) as avg_confidence,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Gross) * AVG(SAFE_CAST(Confianca AS FLOAT64)) / 100, 2) as weighted_forecast
FROM `operaciones-br.sales_intelligence.pipeline`;

-- 4. DEALS >= 50% CONFIANÇA
SELECT 
  '4. DEALS ≥50%' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE SAFE_CAST(Confianca AS FLOAT64) >= 50;

-- 5. FORECAST POR CATEGORIA (Forecast_SF)
SELECT 
  '5. FORECAST POR CATEGORIA' as metric,
  Forecast_SF as category,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net
FROM `operaciones-br.sales_intelligence.pipeline`
GROUP BY Forecast_SF
ORDER BY Forecast_SF;

-- 6. SALES SPECIALIST TOTAL
SELECT 
  '6. SALES SPECIALIST' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(booking_total_gross), 2) as total_gross,
  ROUND(SUM(booking_total_net), 2) as total_net,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.pipeline`), 2) as curadoria_deals_pct,
  ROUND(SUM(booking_total_gross) * 100.0 / (SELECT SUM(Gross) FROM `operaciones-br.sales_intelligence.pipeline`), 2) as curadoria_value_pct
FROM `operaciones-br.sales_intelligence.sales_specialist`;

-- 7. SALES SPECIALIST POR CATEGORIA
SELECT 
  '7. SS POR CATEGORIA' as metric,
  forecast_status as category,
  COUNT(*) as deals_count,
  ROUND(SUM(booking_total_gross), 2) as total_gross,
  ROUND(SUM(booking_total_net), 2) as total_net
FROM `operaciones-br.sales_intelligence.sales_specialist`
GROUP BY forecast_status
ORDER BY forecast_status;

-- 8. DEALS FECHADOS (GANHOS)
SELECT 
  '8. DEALS GANHOS' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net,
  ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 0) as avg_cycle_days
FROM `operaciones-br.sales_intelligence.closed_deals_won`;

-- 9. DEALS PERDIDOS
SELECT 
  '9. DEALS PERDIDOS' as metric,
  COUNT(*) as deals_count,
  ROUND(SUM(Gross), 2) as total_gross,
  ROUND(SUM(Net), 2) as total_net,
  ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 0) as avg_cycle_days
FROM `operaciones-br.sales_intelligence.closed_deals_lost`;

-- 10. TAXA DE WIN/LOSS
SELECT 
  '10. WIN/LOSS RATE' as metric,
  (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_won`) as won_count,
  (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) as lost_count,
  (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_won`) + 
  (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) as total_closed,
  ROUND((SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_won`) * 100.0 / 
    ((SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_won`) + 
     (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_lost`)), 2) as win_rate_pct,
  ROUND((SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) * 100.0 / 
    ((SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_won`) + 
     (SELECT COUNT(*) FROM `operaciones-br.sales_intelligence.closed_deals_lost`)), 2) as loss_rate_pct;

-- 11. TICKET MÉDIO (GANHOS vs PERDIDOS)
SELECT 
  '11. TICKET MÉDIO' as metric,
  ROUND((SELECT AVG(Gross) FROM `operaciones-br.sales_intelligence.closed_deals_won`), 2) as avg_won_gross,
  ROUND((SELECT AVG(Net) FROM `operaciones-br.sales_intelligence.closed_deals_won`), 2) as avg_won_net,
  ROUND((SELECT AVG(Gross) FROM `operaciones-br.sales_intelligence.closed_deals_lost`), 2) as avg_lost_gross,
  ROUND((SELECT AVG(Net) FROM `operaciones-br.sales_intelligence.closed_deals_lost`), 2) as avg_lost_net;

-- 12. VENDEDORES ÚNICOS
SELECT 
  '12. VENDEDORES' as metric,
  (SELECT COUNT(DISTINCT Vendedor) FROM `operaciones-br.sales_intelligence.pipeline`) as pipeline_sellers,
  (SELECT COUNT(DISTINCT Vendedor) FROM `operaciones-br.sales_intelligence.closed_deals_won`) as won_sellers,
  (SELECT COUNT(DISTINCT Vendedor) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) as lost_sellers;

-- 13. PERFORMANCE POR VENDEDOR (TOP 3 e BOTTOM 3)
WITH seller_stats AS (
  SELECT 
    COALESCE(w.Vendedor, l.Vendedor) as vendedor,
    COALESCE(won_count, 0) as won,
    COALESCE(lost_count, 0) as lost,
    COALESCE(won_gross, 0) as revenue,
    ROUND(COALESCE(won_count, 0) * 100.0 / NULLIF(COALESCE(won_count, 0) + COALESCE(lost_count, 0), 0), 2) as win_rate
  FROM (
    SELECT 
      Vendedor, 
      COUNT(*) as won_count, 
      SUM(Gross) as won_gross
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
    GROUP BY Vendedor
  ) w
  FULL OUTER JOIN (
    SELECT 
      Vendedor, 
      COUNT(*) as lost_count,
      SUM(Gross) as lost_gross
    FROM `operaciones-br.sales_intelligence.closed_deals_lost`
    GROUP BY Vendedor
  ) l ON w.Vendedor = l.Vendedor
)
SELECT 
  '13. TOP/BOTTOM SELLERS' as metric,
  vendedor,
  won,
  lost,
  ROUND(revenue, 2) as revenue_gross,
  win_rate as win_rate_pct
FROM seller_stats
WHERE vendedor IS NOT NULL
ORDER BY revenue DESC;

-- 14. EFICIÊNCIA DE CICLO
SELECT 
  '14. EFICIÊNCIA CICLO' as metric,
  ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 0) as avg_won_cycle,
  (SELECT ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 0) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) as avg_lost_cycle,
  ROUND(((SELECT AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)) FROM `operaciones-br.sales_intelligence.closed_deals_lost`) - 
         AVG(SAFE_CAST(Ciclo_dias AS FLOAT64))) * 100.0 / NULLIF(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 0), 0) as efficiency_pct
FROM `operaciones-br.sales_intelligence.closed_deals_won`;

-- 15. SALES SPECIALIST - TICKET MÉDIO
SELECT 
  '15. SS TICKET MÉDIO' as metric,
  ROUND(AVG(booking_total_gross), 2) as avg_gross,
  ROUND(AVG(booking_total_net), 2) as avg_net
FROM `operaciones-br.sales_intelligence.sales_specialist`;

-- 16. SALES SPECIALIST - TOP VENDEDOR
SELECT 
  '16. SS TOP VENDEDOR' as metric,
  vendedor,
  COUNT(*) as deals,
  ROUND(SUM(booking_total_gross), 2) as total_gross
FROM `operaciones-br.sales_intelligence.sales_specialist`
GROUP BY vendedor
ORDER BY SUM(booking_total_gross) DESC
LIMIT 1;
