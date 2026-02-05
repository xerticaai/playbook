-- ============================================================================
-- MODELO 1: PREVISÃO DE CICLO DE VENDAS
-- ============================================================================
-- Tipo: BOOSTED_TREE_REGRESSOR
-- Objetivo: Prever quantos dias faltam para fechar um deal
-- Output: dias_previstos, velocidade_prevista (RÁPIDO/NORMAL/LENTO/MUITO_LENTO)
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_previsao_ciclo.sql
-- ============================================================================

-- 1. Criar tabela de treino (deals FECHADOS com ciclo conhecido)
CREATE OR REPLACE TABLE `sales_intelligence.treino_previsao_ciclo` AS
SELECT
  opportunity_name AS opportunity,
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Stage AS Fase_Atual,
  Fiscal_Q AS Fiscal_Quarter,
  
  -- Features numéricas
  CAST(Confidence AS FLOAT64) AS confidence_num,
  CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
  CAST(BANT_Score AS FLOAT64) AS bant_score,
  CAST(Idle_Days AS INT64) AS idle_days,
  CAST(Atividades AS INT64) AS atividades,
  CAST(Qtd_Produtos AS INT64) AS qtd_produtos,
  CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
  CAST(Red_Flags AS INT64) AS red_flags,
  CAST(Yellow_Flags AS INT64) AS yellow_flags,
  
  -- Target: ciclo real (dias entre criação e fechamento)
  CAST(Cycle_Days AS INT64) AS ciclo_real_dias
  
FROM `sales_intelligence.closed_deals`
WHERE 
  outcome = 'WON'
  AND Cycle_Days IS NOT NULL
  AND CAST(Cycle_Days AS INT64) > 0
  AND CAST(Cycle_Days AS INT64) < 730  -- Máximo 2 anos
  AND Data_Created IS NOT NULL
  AND Close_Date IS NOT NULL;

-- 2. Treinar modelo BOOSTED_TREE_REGRESSOR
CREATE OR REPLACE MODEL `sales_intelligence.modelo_previsao_ciclo`
OPTIONS(
  model_type='BOOSTED_TREE_REGRESSOR',
  input_label_cols=['ciclo_real_dias'],
  max_iterations=100,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.001,
  l1_reg=0.1,
  l2_reg=0.1,
  max_tree_depth=10,
  subsample=0.8,
  data_split_method='AUTO_SPLIT',
  data_split_eval_fraction=0.2
) AS
SELECT
  -- Features
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Fase_Atual,
  Fiscal_Quarter,
  confidence_num,
  meddic_score,
  bant_score,
  idle_days,
  atividades,
  qtd_produtos,
  qtd_reunioes,
  red_flags,
  yellow_flags,
  
  -- Target
  ciclo_real_dias
FROM `sales_intelligence.treino_previsao_ciclo`;

-- 3. Avaliar modelo (métricas)
SELECT
  'PREVISAO_CICLO' AS modelo,
  mean_absolute_error,
  mean_squared_error,
  mean_squared_log_error,
  median_absolute_error,
  r2_score,
  explained_variance
FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_previsao_ciclo`);

-- 4. Criar tabela de predições para pipeline ATIVO
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_previsao_ciclo` AS
SELECT
  p.opportunity_name AS opportunity,
  p.Gross_Value,
  p.Vendedor,
  p.Segmento,
  p.Stage AS Fase_Atual,
  p.Fiscal_Q AS Fiscal_Quarter,
  
  -- Predição do modelo
  CAST(pred.predicted_ciclo_real_dias AS INT64) AS dias_previstos,
  
  -- Classificação de velocidade
  CASE
    WHEN pred.predicted_ciclo_real_dias <= 30 THEN 'RÁPIDO'
    WHEN pred.predicted_ciclo_real_dias <= 60 THEN 'NORMAL'
    WHEN pred.predicted_ciclo_real_dias <= 120 THEN 'LENTO'
    ELSE 'MUITO_LENTO'
  END AS velocidade_prevista,
  
  -- Contexto para análise
  CAST(p.Confidence AS FLOAT64) AS confidence_num,
  CAST(p.MEDDIC_Score AS FLOAT64) AS meddic_score,
  CAST(p.BANT_Score AS FLOAT64) AS bant_score,
  CAST(p.Idle_Days AS INT64) AS idle_days,
  CAST(p.Atividades AS INT64) AS Atividades_Peso
  
FROM `sales_intelligence.pipeline` p
JOIN ML.PREDICT(
  MODEL `sales_intelligence.modelo_previsao_ciclo`,
  (
    SELECT
      Gross_Value,
      Net_Value,
      Vendedor,
      Segmento,
      Stage AS Fase_Atual,
      Fiscal_Q AS Fiscal_Quarter,
      CAST(Confidence AS FLOAT64) AS confidence_num,
      CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
      CAST(BANT_Score AS FLOAT64) AS bant_score,
      CAST(Idle_Days AS INT64) AS idle_days,
      CAST(Atividades AS INT64) AS atividades,
      CAST(Qtd_Produtos AS INT64) AS qtd_produtos,
      CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
      CAST(Red_Flags AS INT64) AS red_flags,
      CAST(Yellow_Flags AS INT64) AS yellow_flags
    FROM `sales_intelligence.pipeline`
  )
) pred
ON TRUE;

-- 5. Análise de importância das features
SELECT
  feature,
  importance,
  RANK() OVER (ORDER BY importance DESC) AS rank
FROM ML.FEATURE_IMPORTANCE(MODEL `sales_intelligence.modelo_previsao_ciclo`)
ORDER BY importance DESC
LIMIT 20;

-- 6. Estatísticas das predições
SELECT
  velocidade_prevista,
  COUNT(*) AS deals_count,
  AVG(dias_previstos) AS avg_dias,
  MIN(dias_previstos) AS min_dias,
  MAX(dias_previstos) AS max_dias,
  SUM(Gross_Value) AS total_value
FROM `sales_intelligence.pipeline_previsao_ciclo`
GROUP BY velocidade_prevista
ORDER BY 
  CASE velocidade_prevista
    WHEN 'RÁPIDO' THEN 1
    WHEN 'NORMAL' THEN 2
    WHEN 'LENTO' THEN 3
    WHEN 'MUITO_LENTO' THEN 4
  END;
