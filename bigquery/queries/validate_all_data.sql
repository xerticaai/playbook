-- ========================================
-- VALIDAÇÃO COMPLETA DE DADOS NO BIGQUERY
-- ========================================
-- Execute estas queries para validar a integridade dos dados sincronizados

-- ========================================
-- 1. PIPELINE - Validação Completa
-- ========================================

-- 1.1 Contagem geral e cobertura de campos críticos
SELECT 
  'PIPELINE' as tabela,
  COUNT(*) as total_registros,
  COUNT(DISTINCT Oportunidade) as oportunidades_unicas,
  COUNT(DISTINCT Vendedor) as vendedores_unicos,
  COUNTIF(Forecast_IA IS NOT NULL) as com_forecast_ia,
  COUNTIF(MEDDIC_Score IS NOT NULL) as com_meddic,
  COUNTIF(BANT_Score IS NOT NULL) as com_bant,
  COUNTIF(Atividades IS NOT NULL) as com_atividades,
  COUNTIF(Total_Mudancas IS NOT NULL) as com_mudancas,
  ROUND(AVG(Gross), 2) as gross_medio,
  ROUND(SUM(Gross), 2) as gross_total
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);

-- 1.2 Distribuição por Fiscal Quarter
SELECT 
  Fiscal_Q,
  COUNT(*) as deals,
  ROUND(SUM(Gross), 2) as valor_total,
  ROUND(AVG(Gross), 2) as ticket_medio,
  COUNT(DISTINCT Vendedor) as vendedores
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Fiscal_Q IS NOT NULL
  AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY Fiscal_Q
ORDER BY Fiscal_Q;

-- 1.3 Validar qualidade de dados - campos vazios críticos
SELECT 
  COUNTIF(Oportunidade IS NULL) as sem_oportunidade,
  COUNTIF(Conta IS NULL) as sem_conta,
  COUNTIF(Vendedor IS NULL) as sem_vendedor,
  COUNTIF(Gross IS NULL) as sem_gross,
  COUNTIF(Fiscal_Q IS NULL) as sem_fiscal_q,
  COUNTIF(Fase_Atual IS NULL) as sem_fase,
  COUNTIF(Data_Prevista IS NULL) as sem_data_prevista
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);

-- ========================================
-- 2. CLOSED DEALS WON - Validação Completa
-- ========================================

-- 2.1 Contagem e cobertura de análises
SELECT 
  'CLOSED_WON' as tabela,
  COUNT(*) as total_registros,
  COUNT(DISTINCT Oportunidade) as oportunidades_unicas,
  COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as com_resumo,
  COUNTIF(Causa_Raiz IS NOT NULL AND LENGTH(Causa_Raiz) > 0) as com_causa_raiz,
  COUNTIF(Fatores_Sucesso IS NOT NULL AND LENGTH(Fatores_Sucesso) > 0) as com_fatores,
  COUNTIF(Atividades IS NOT NULL) as com_atividades,
  COUNTIF(Total_Mudancas IS NOT NULL) as com_mudancas,
  ROUND(AVG(CAST(Ciclo_dias AS INT64)), 1) as ciclo_medio_dias,
  ROUND(SUM(Gross), 2) as valor_total_won
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);

-- 2.2 Análise de Fatores de Sucesso mais comuns
SELECT 
  Fiscal_Q,
  COUNT(*) as deals_ganhos,
  ROUND(AVG(Gross), 2) as ticket_medio,
  ROUND(AVG(CAST(Ciclo_dias AS INT64)), 1) as ciclo_medio
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Fiscal_Q IS NOT NULL
  AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY Fiscal_Q
ORDER BY Fiscal_Q DESC;

-- ========================================
-- 3. CLOSED DEALS LOST - Validação Completa
-- ========================================

-- 3.1 Contagem e cobertura de análises de perda
SELECT 
  'CLOSED_LOST' as tabela,
  COUNT(*) as total_registros,
  COUNT(DISTINCT Oportunidade) as oportunidades_unicas,
  COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as com_resumo,
  COUNTIF(Causa_Raiz IS NOT NULL AND LENGTH(Causa_Raiz) > 0) as com_causa_raiz,
  COUNTIF(Causas_Secundarias IS NOT NULL AND LENGTH(Causas_Secundarias) > 0) as com_causas_sec,
  COUNTIF(Evitavel IS NOT NULL) as com_evitavel,
  COUNTIF(Sinais_Alerta IS NOT NULL AND LENGTH(Sinais_Alerta) > 0) as com_sinais,
  COUNTIF(Momento_Critico IS NOT NULL) as com_momento_critico,
  ROUND(AVG(CAST(Ciclo_dias AS INT64)), 1) as ciclo_medio_dias,
  ROUND(SUM(Gross), 2) as valor_total_perdido
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);

-- 3.2 Análise de perdas evitáveis
SELECT 
  Evitavel,
  COUNT(*) as deals_perdidos,
  ROUND(SUM(Gross), 2) as valor_perdido,
  ROUND(AVG(Gross), 2) as ticket_medio
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE Evitavel IS NOT NULL
  AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY Evitavel
ORDER BY deals_perdidos DESC;

-- ========================================
-- 4. UNION ALL - Validar compatibilidade Cloud Run
-- ========================================

-- 4.1 Testar query similar à Cloud Function
SELECT 
  COUNT(*) as total_deals_fechados,
  SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) as ganhos,
  SUM(CASE WHEN outcome = 'LOST' THEN 1 ELSE 0 END) as perdidos,
  ROUND(SUM(CASE WHEN outcome = 'WON' THEN Gross ELSE 0 END), 2) as valor_ganho,
  ROUND(SUM(CASE WHEN outcome = 'LOST' THEN Gross ELSE 0 END), 2) as valor_perdido,
  ROUND(AVG(Gross), 2) as ticket_medio
FROM (
  SELECT 
    Oportunidade, Conta, Gross, Fiscal_Q, Data_Fechamento,
    Resumo_Analise, Causa_Raiz, Atividades, Total_Mudancas,
    'WON' as outcome
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  
  UNION ALL
  
  SELECT 
    Oportunidade, Conta, Gross, Fiscal_Q, Data_Fechamento,
    Resumo_Analise, Causa_Raiz, Atividades, Total_Mudancas,
    'LOST' as outcome
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
);

-- ========================================
-- 5. SALES SPECIALIST - Validação
-- ========================================

SELECT 
  'SALES_SPECIALIST' as tabela,
  COUNT(*) as total_registros,
  COUNT(DISTINCT Account_Name) as contas_unicas,
  COUNTIF(Opportunity_Name IS NOT NULL) as com_opportunity,
  COUNTIF(Closed_Date IS NOT NULL) as com_data_fechamento,
  ROUND(SUM(Booking_Total_Gross), 2) as booking_total,
  ROUND(AVG(Booking_Total_Gross), 2) as booking_medio
FROM `operaciones-br.sales_intelligence.sales_specialist`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);

-- ========================================
-- 6. VALIDAÇÃO CROSS-TABLE - Integridade Referencial
-- ========================================

-- 6.1 Verificar oportunidades que aparecem em múltiplas tabelas
SELECT 
  p.Oportunidade,
  'Pipeline + Won' as conflito,
  p.Fase_Atual as fase_pipeline,
  w.Fiscal_Q as fiscal_q_won
FROM `operaciones-br.sales_intelligence.pipeline` p
INNER JOIN `operaciones-br.sales_intelligence.closed_deals_won` w
  ON p.Oportunidade = w.Oportunidade
WHERE p.data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  AND w.data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
LIMIT 10;

-- ========================================
-- 7. RESUMO EXECUTIVO - Todas as Tabelas
-- ========================================

SELECT 
  'Pipeline' as tabela,
  COUNT(*) as registros,
  ROUND(SUM(Gross), 2) as valor_total,
  COUNT(DISTINCT Vendedor) as vendedores
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)

UNION ALL

SELECT 
  'Won' as tabela,
  COUNT(*) as registros,
  ROUND(SUM(Gross), 2) as valor_total,
  COUNT(DISTINCT Vendedor) as vendedores
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)

UNION ALL

SELECT 
  'Lost' as tabela,
  COUNT(*) as registros,
  ROUND(SUM(Gross), 2) as valor_total,
  COUNT(DISTINCT Vendedor) as vendedores
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)

ORDER BY tabela;

-- ========================================
-- 8. VALIDAÇÃO DE TIPOS DE DADOS
-- ========================================

-- Verificar se campos numéricos têm valores válidos
SELECT 
  'Pipeline' as tabela,
  COUNTIF(SAFE_CAST(Gross AS FLOAT64) IS NULL AND Gross IS NOT NULL) as gross_invalido,
  COUNTIF(SAFE_CAST(Net AS FLOAT64) IS NULL AND Net IS NOT NULL) as net_invalido,
  COUNTIF(SAFE_CAST(Atividades AS INT64) IS NULL AND Atividades IS NOT NULL) as atividades_invalido,
  COUNTIF(SAFE_CAST(MEDDIC_Score AS INT64) IS NULL AND MEDDIC_Score IS NOT NULL) as meddic_invalido
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);
