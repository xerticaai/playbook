-- Modelo de ML simplificado para Win/Loss prediction
-- Usa apenas colunas numéricas e categóricas básicas

-- 1. Criar view de treinamento com features simplificadas
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.training_data_v2` AS
SELECT
  -- Target
  CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END AS won,
  
  -- Features numéricas
  SAFE_CAST(Gross AS FLOAT64) AS gross,
  SAFE_CAST(Net AS FLOAT64) AS net,
  SAFE_CAST(Ciclo_dias AS INT64) AS ciclo_dias,
  SAFE_CAST(Atividades AS INT64) AS atividades,
  SAFE_CAST(Ativ_7d AS INT64) AS ativ_7d,
  SAFE_CAST(Ativ_30d AS INT64) AS ativ_30d,
  SAFE_CAST(Total_Mudanas AS INT64) AS total_mudancas,
  SAFE_CAST(Mudanas_Crticas AS INT64) AS mudancas_criticas,
  
  -- Features categóricas
  COALESCE(Vendedor, 'Unknown') AS vendedor,
  COALESCE(Segmento, 'Unknown') AS segmento,
  COALESCE(Fiscal_Q, 'Unknown') AS fiscal_q,
  COALESCE(Portflio, 'Unknown') AS portfolio,
  
  outcome
FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE outcome IN ('WON', 'LOST')
  AND Gross IS NOT NULL
  AND Net IS NOT NULL;

-- 2. Treinar modelo com XGBoost
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.win_loss_predictor_v2`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['won'],
  max_iterations=20,
  booster_type='GBTREE',
  num_parallel_tree=1,
  max_tree_depth=5,
  min_tree_child_weight=1,
  subsample=0.85,
  tree_method='HIST',
  early_stop=TRUE,
  data_split_method='RANDOM',
  data_split_eval_fraction=0.2
) AS
SELECT
  won,
  gross,
  net,
  ciclo_dias,
  atividades,
  ativ_7d,
  ativ_30d,
  total_mudancas,
  mudancas_criticas,
  vendedor,
  segmento,
  fiscal_q,
  portfolio
FROM `operaciones-br.sales_intelligence.training_data_v2`;

-- 3. Criar tabela de predições
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_predictions_v2` AS
SELECT
  p.Oportunidade AS oportunidade,
  p.Conta AS conta,
  p.Vendedor AS vendedor,
  SAFE_CAST(p.Gross AS FLOAT64) AS gross,
  SAFE_CAST(p.Net AS FLOAT64) AS net,
  p.Fiscal_Q AS fiscal_q,
  pred.prob AS win_probability,
  pred.predicted_won,
  CASE
    WHEN pred.prob >= 0.7 THEN 'HIGH'
    WHEN pred.prob >= 0.4 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS confidence,
  CURRENT_TIMESTAMP() AS prediction_date
FROM `operaciones-br.sales_intelligence.pipeline` p
CROSS JOIN (
  SELECT
    predicted_won,
    prob
  FROM ML.PREDICT(
    MODEL `operaciones-br.sales_intelligence.win_loss_predictor_v2`,
    (
      SELECT
        SAFE_CAST(Gross AS FLOAT64) AS gross,
        SAFE_CAST(Net AS FLOAT64) AS net,
        SAFE_CAST(Ciclo_dias AS INT64) AS ciclo_dias,
        SAFE_CAST(Atividades AS INT64) AS atividades,
        SAFE_CAST(Ativ_7d AS INT64) AS ativ_7d,
        SAFE_CAST(Ativ_30d AS INT64) AS ativ_30d,
        SAFE_CAST(Total_Mudanas AS INT64) AS total_mudancas,
        SAFE_CAST(Mudanas_Crticas AS INT64) AS mudancas_criticas,
        COALESCE(Vendedor, 'Unknown') AS vendedor,
        COALESCE(Segmento, 'Unknown') AS segmento,
        COALESCE(Fiscal_Q, 'Unknown') AS fiscal_q,
        COALESCE(Portflio, 'Unknown') AS portfolio
      FROM `operaciones-br.sales_intelligence.pipeline`
    )
  ),
  UNNEST(predicted_won_probs) AS pred
  WHERE pred.label = 1
) pred
WHERE p.Gross IS NOT NULL
  AND p.Net IS NOT NULL;

-- Mostrar métricas do modelo
SELECT
  'Model Evaluation' AS metric_type,
  *
FROM ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.win_loss_predictor_v2`);

-- Mostrar top 10 deals em risco
SELECT
  oportunidade,
  ROUND(gross, 0) AS valor,
  ROUND(win_probability * 100, 1) AS win_prob_pct,
  confidence
FROM `operaciones-br.sales_intelligence.pipeline_predictions_v2`
ORDER BY gross DESC, win_probability ASC
LIMIT 10;
