-- ============================================================================
-- MODELO 2: CLASSIFICADOR DE CAUSA DE PERDA
-- ============================================================================
-- Tipo: BOOSTED_TREE_CLASSIFIER (multiclass)
-- Objetivo: Classificar por que um deal foi perdido
-- Output: causa_prevista (PRECO/TIMING/CONCORRENTE/BUDGET/FIT), confiança
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_classificador_perda.sql
-- ============================================================================

-- 1. Criar tabela de treino (deals PERDIDOS com motivo conhecido)
CREATE OR REPLACE TABLE `sales_intelligence.treino_classificador_perda` AS
SELECT
  opportunity_name AS opportunity,
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Stage AS Fase_Perda,
  Fiscal_Q AS Fiscal_Quarter,
  
  -- Features numéricas
  CAST(Confidence AS FLOAT64) AS confidence_num,
  CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
  CAST(BANT_Score AS FLOAT64) AS bant_score,
  CAST(Idle_Days AS INT64) AS idle_days,
  CAST(Atividades AS INT64) AS atividades,
  CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
  CAST(Red_Flags AS INT64) AS red_flags,
  CAST(Yellow_Flags AS INT64) AS yellow_flags,
  CAST(Cycle_Days AS INT64) AS cycle_days,
  
  -- Target: causa da perda (extraída do campo Loss_Reason)
  CASE
    WHEN UPPER(Loss_Reason) LIKE '%PREÇO%' OR UPPER(Loss_Reason) LIKE '%PRECO%' 
         OR UPPER(Loss_Reason) LIKE '%CARO%' OR UPPER(Loss_Reason) LIKE '%CUSTO%' THEN 'PRECO'
    WHEN UPPER(Loss_Reason) LIKE '%TIMING%' OR UPPER(Loss_Reason) LIKE '%TEMPO%' 
         OR UPPER(Loss_Reason) LIKE '%URGENCIA%' THEN 'TIMING'
    WHEN UPPER(Loss_Reason) LIKE '%CONCORR%' OR UPPER(Loss_Reason) LIKE '%COMPETIDOR%' THEN 'CONCORRENTE'
    WHEN UPPER(Loss_Reason) LIKE '%BUDGET%' OR UPPER(Loss_Reason) LIKE '%ORÇAMENTO%' 
         OR UPPER(Loss_Reason) LIKE '%VERBA%' THEN 'BUDGET'
    WHEN UPPER(Loss_Reason) LIKE '%FIT%' OR UPPER(Loss_Reason) LIKE '%ADEQU%' 
         OR UPPER(Loss_Reason) LIKE '%NÃO ATENDE%' OR UPPER(Loss_Reason) LIKE '%NAO ATENDE%' THEN 'FIT'
    ELSE 'FIT'  -- Default
  END AS causa_real
  
FROM `sales_intelligence.closed_deals`
WHERE 
  outcome = 'LOST'
  AND Loss_Reason IS NOT NULL
  AND TRIM(Loss_Reason) != '';

-- 2. Treinar modelo BOOSTED_TREE_CLASSIFIER (multiclass)
CREATE OR REPLACE MODEL `sales_intelligence.modelo_classificador_perda`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['causa_real'],
  max_iterations=100,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.001,
  l1_reg=0.1,
  l2_reg=0.1,
  max_tree_depth=8,
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
  Fase_Perda,
  Fiscal_Quarter,
  confidence_num,
  meddic_score,
  bant_score,
  idle_days,
  atividades,
  qtd_reunioes,
  red_flags,
  yellow_flags,
  cycle_days,
  
  -- Target
  causa_real
FROM `sales_intelligence.treino_classificador_perda`;

-- 3. Avaliar modelo (métricas multiclass)
SELECT
  'CLASSIFICADOR_PERDA' AS modelo,
  precision,
  recall,
  accuracy,
  f1_score,
  log_loss,
  roc_auc
FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_classificador_perda`);

-- 4. Criar tabela de predições para pipeline ATIVO (risco de perda)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_classificador_perda` AS
SELECT
  p.opportunity_name AS opportunity,
  p.Gross_Value,
  p.Vendedor,
  p.Segmento,
  p.Stage AS Fase_Atual,
  p.Fiscal_Q AS Fiscal_Quarter,
  
  -- Predição do modelo
  pred.predicted_causa_real AS causa_prevista,
  
  -- Probabilidades por categoria (top 3)
  (SELECT prob FROM UNNEST(pred.predicted_causa_real_probs) WHERE label = 'PRECO' LIMIT 1) AS prob_preco,
  (SELECT prob FROM UNNEST(pred.predicted_causa_real_probs) WHERE label = 'TIMING' LIMIT 1) AS prob_timing,
  (SELECT prob FROM UNNEST(pred.predicted_causa_real_probs) WHERE label = 'CONCORRENTE' LIMIT 1) AS prob_concorrente,
  (SELECT prob FROM UNNEST(pred.predicted_causa_real_probs) WHERE label = 'BUDGET' LIMIT 1) AS prob_budget,
  (SELECT prob FROM UNNEST(pred.predicted_causa_real_probs) WHERE label = 'FIT' LIMIT 1) AS prob_fit,
  
  -- Confiança da predição (máxima probabilidade)
  (SELECT MAX(prob) FROM UNNEST(pred.predicted_causa_real_probs)) AS confianca_predicao,
  
  -- Contexto para análise
  CAST(p.Confidence AS FLOAT64) AS confidence_num,
  CAST(p.MEDDIC_Score AS FLOAT64) AS meddic_score,
  CAST(p.BANT_Score AS FLOAT64) AS bant_score,
  CAST(p.Red_Flags AS INT64) AS red_flags,
  CAST(p.Yellow_Flags AS INT64) AS yellow_flags
  
FROM `sales_intelligence.pipeline` p
JOIN ML.PREDICT(
  MODEL `sales_intelligence.modelo_classificador_perda`,
  (
    SELECT
      Gross_Value,
      Net_Value,
      Vendedor,
      Segmento,
      Stage AS Fase_Perda,
      Fiscal_Q AS Fiscal_Quarter,
      CAST(Confidence AS FLOAT64) AS confidence_num,
      CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
      CAST(BANT_Score AS FLOAT64) AS bant_score,
      CAST(Idle_Days AS INT64) AS idle_days,
      CAST(Atividades AS INT64) AS atividades,
      CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
      CAST(Red_Flags AS INT64) AS red_flags,
      CAST(Yellow_Flags AS INT64) AS yellow_flags,
      CAST(Cycle_Days AS INT64) AS cycle_days
    FROM `sales_intelligence.pipeline`
  )
) pred
ON TRUE
WHERE (SELECT MAX(prob) FROM UNNEST(pred.predicted_causa_real_probs)) > 0.3;  -- Filtro mínimo de confiança

-- 5. Confusion Matrix (matriz de confusão)
SELECT
  *
FROM ML.CONFUSION_MATRIX(
  MODEL `sales_intelligence.modelo_classificador_perda`,
  (SELECT * FROM `sales_intelligence.treino_classificador_perda`)
);

-- 6. Análise de importância das features
SELECT
  feature,
  importance,
  RANK() OVER (ORDER BY importance DESC) AS rank
FROM ML.FEATURE_IMPORTANCE(MODEL `sales_intelligence.modelo_classificador_perda`)
ORDER BY importance DESC
LIMIT 20;

-- 7. Estatísticas das predições
SELECT
  causa_prevista,
  COUNT(*) AS deals_em_risco,
  AVG(confianca_predicao) AS avg_confianca,
  SUM(Gross_Value) AS total_value_em_risco,
  AVG(red_flags) AS avg_red_flags
FROM `sales_intelligence.pipeline_classificador_perda`
GROUP BY causa_prevista
ORDER BY deals_em_risco DESC;
