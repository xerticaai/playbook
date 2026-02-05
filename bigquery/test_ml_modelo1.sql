-- ============================================================================
-- TESTE: MODELO 1 SIMPLIFICADO - PREVISÃO DE CICLO
-- ============================================================================
-- Usa apenas campos que EXISTEM no schema atual
-- ============================================================================

-- 1. Ver dados disponíveis
SELECT 
  Oportunidade,
  Gross,
  Net,
  Vendedor,
  Fiscal_Q,
  CAST(Confiana AS FLOAT64) AS confidence,
  CAST(MEDDIC_Score AS FLOAT64) AS meddic,
  CAST(BANT_Score AS FLOAT64) AS bant,
  Atividades,
  Ciclo_dias
FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE 
  outcome = 'WON'
  AND Ciclo_dias IS NOT NULL
  AND CAST(Ciclo_dias AS INT64) > 0
LIMIT 10;

-- 2. Criar tabela de treino SIMPLIFICADA
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.treino_previsao_ciclo_v1` AS
SELECT
  Oportunidade AS opportunity,
  Gross AS Gross_Value,
  Net AS Net_Value,
  Vendedor,
  Fiscal_Q AS Fiscal_Quarter,
  
  -- Features disponíveis
  SAFE_CAST(Confiana AS FLOAT64) AS confidence_num,
  SAFE_CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
  SAFE_CAST(BANT_Score AS FLOAT64) AS bant_score,
  SAFE_CAST(Atividades AS INT64) AS atividades,
  
  -- Target
  SAFE_CAST(Ciclo_dias AS INT64) AS ciclo_real_dias
  
FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE 
  outcome = 'WON'
  AND Ciclo_dias IS NOT NULL
  AND SAFE_CAST(Ciclo_dias AS INT64) > 0
  AND SAFE_CAST(Ciclo_dias AS INT64) < 730;

-- 3. Verificar dados de treino
SELECT 
  COUNT(*) AS total_deals,
  AVG(ciclo_real_dias) AS avg_ciclo,
  MIN(ciclo_real_dias) AS min_ciclo,
  MAX(ciclo_real_dias) AS max_ciclo
FROM `operaciones-br.sales_intelligence.treino_previsao_ciclo_v1`;

-- 4. Treinar modelo SIMPLIFICADO
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.modelo_previsao_ciclo_v1`
OPTIONS(
  model_type='BOOSTED_TREE_REGRESSOR',
  input_label_cols=['ciclo_real_dias'],
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE,
  data_split_method='AUTO_SPLIT',
  data_split_eval_fraction=0.2
) AS
SELECT
  Gross_Value,
  Net_Value,
  Vendedor,
  Fiscal_Quarter,
  confidence_num,
  meddic_score,
  bant_score,
  atividades,
  ciclo_real_dias
FROM `operaciones-br.sales_intelligence.treino_previsao_ciclo_v1`
WHERE confidence_num IS NOT NULL AND meddic_score IS NOT NULL;

-- 5. Avaliar modelo
SELECT
  mean_absolute_error,
  mean_squared_error,
  r2_score
FROM ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.modelo_previsao_ciclo_v1`);

-- 6. Predições no pipeline
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_previsao_ciclo` AS
SELECT
  p.Oportunidade AS opportunity,
  p.Gross AS Gross_Value,
  p.Vendedor,
  p.Fiscal_Q AS Fiscal_Quarter,
  
  CAST(pred.predicted_ciclo_real_dias AS INT64) AS dias_previstos,
  
  CASE
    WHEN pred.predicted_ciclo_real_dias <= 30 THEN 'RÁPIDO'
    WHEN pred.predicted_ciclo_real_dias <= 60 THEN 'NORMAL'
    WHEN pred.predicted_ciclo_real_dias <= 120 THEN 'LENTO'
    ELSE 'MUITO_LENTO'
  END AS velocidade_prevista
  
FROM `operaciones-br.sales_intelligence.pipeline` p
JOIN ML.PREDICT(
  MODEL `operaciones-br.sales_intelligence.modelo_previsao_ciclo_v1`,
  (
    SELECT
      Gross AS Gross_Value,
      Net AS Net_Value,
      Vendedor,
      Fiscal_Q AS Fiscal_Quarter,
      SAFE_CAST(Confiana AS FLOAT64) AS confidence_num,
      SAFE_CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
      SAFE_CAST(BANT_Score AS FLOAT64) AS bant_score,
      SAFE_CAST(Atividades_Peso AS INT64) AS atividades
    FROM `operaciones-br.sales_intelligence.pipeline`
    WHERE Confiana IS NOT NULL AND MEDDIC_Score IS NOT NULL
  )
) pred
ON TRUE;

-- 7. Ver resultados
SELECT 
  velocidade_prevista,
  COUNT(*) AS deals_count,
  AVG(dias_previstos) AS avg_dias,
  SUM(Gross_Value) AS total_value
FROM `operaciones-br.sales_intelligence.pipeline_previsao_ciclo`
GROUP BY velocidade_prevista
ORDER BY 
  CASE velocidade_prevista
    WHEN 'RÁPIDO' THEN 1
    WHEN 'NORMAL' THEN 2
    WHEN 'LENTO' THEN 3
    WHEN 'MUITO_LENTO' THEN 4
  END;
