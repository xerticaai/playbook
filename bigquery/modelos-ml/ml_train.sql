-- ═══════════════════════════════════════════════════════════════
-- BIGQUERY ML: TREINAMENTO DE MODELO PREDITIVO
-- Objetivo: Prever probabilidade de WIN para deals no pipeline
-- Baseado em: 2575 closed deals (506 WON + 2069 LOST)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- ETAPA 1: VIEW DE TREINAMENTO (features + label)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.ml_training_features` AS
SELECT
  -- LABEL (0 = LOST, 1 = WON)
  CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END AS label,
  
  -- FEATURES NUMÉRICAS (6 features - apenas as disponíveis em pipeline)
  SAFE_CAST(Gross AS FLOAT64) AS gross_value,
  SAFE_CAST(Net AS FLOAT64) AS net_value,
  SAFE_CAST(Ciclo_dias AS INT64) AS sales_cycle_days,
  SAFE_CAST(Atividades AS INT64) AS activity_count,
  SAFE_CAST(Total_Mudanas AS INT64) AS total_changes,
  SAFE_CAST(Mudanas_Crticas AS INT64) AS critical_changes,
  
  -- FEATURES CATEGÓRICAS (5 features)
  COALESCE(Vendedor, 'Unknown') AS seller,
  COALESCE(Segmento, 'Unknown') AS segment,
  COALESCE(Fiscal_Q, 'Unknown') AS fiscal_quarter,
  COALESCE(Portflio, 'Unknown') AS portfolio,
  COALESCE(Perfil_Cliente, 'Unknown') AS customer_profile

FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE 
  outcome IN ('WON', 'LOST')
  AND Gross IS NOT NULL
  AND Net IS NOT NULL
  AND Ciclo_dias IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- ETAPA 2: TREINAR MODELO (⏱️ 3-5 minutos)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.win_loss_predictor`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['label'],
  
  -- Hiperparâmetros otimizados
  max_iterations=50,
  learn_rate=0.1,
  subsample=0.8,
  max_tree_depth=6,
  min_tree_child_weight=10,
  tree_method='HIST',
  early_stop=TRUE,
  
  -- Validação
  data_split_method='RANDOM',
  data_split_eval_fraction=0.2
) AS
SELECT * FROM `operaciones-br.sales_intelligence.ml_training_features`;

-- ═══════════════════════════════════════════════════════════════
-- ETAPA 3: GERAR PREDIÇÕES PARA PIPELINE (270 deals)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_ml_predictions` AS
SELECT
  p.Oportunidade AS opportunity,
  p.Conta AS account,
  p.Vendedor AS seller,
  SAFE_CAST(p.Gross AS FLOAT64) AS gross_value,
  SAFE_CAST(p.Net AS FLOAT64) AS net_value,
  p.Fase_Atual AS current_stage,
  p.Fiscal_Q AS fiscal_quarter,
  
  -- PREDIÇÕES DO MODELO
  predicted_label AS predicted_outcome,
  (SELECT prob FROM UNNEST(predicted_label_probs) WHERE label = 1) AS win_probability,
  
  -- CATEGORIZAÇÃO DE RISCO
  CASE
    WHEN (SELECT prob FROM UNNEST(predicted_label_probs) WHERE label = 1) >= 0.7 THEN 'HIGH_CONFIDENCE'
    WHEN (SELECT prob FROM UNNEST(predicted_label_probs) WHERE label = 1) >= 0.4 THEN 'MEDIUM_CONFIDENCE'
    ELSE 'HIGH_RISK'
  END AS risk_category,
  
  CURRENT_TIMESTAMP() AS prediction_timestamp

FROM ML.PREDICT(
  MODEL `operaciones-br.sales_intelligence.win_loss_predictor`,
  (
    SELECT
      SAFE_CAST(Gross AS FLOAT64) AS gross_value,
      SAFE_CAST(Net AS FLOAT64) AS net_value,
      SAFE_CAST(Ciclo_dias AS INT64) AS sales_cycle_days,
      SAFE_CAST(Atividades AS INT64) AS activity_count,
      SAFE_CAST(Total_Mudanas AS INT64) AS total_changes,
      SAFE_CAST(Mudanas_Crticas AS INT64) AS critical_changes,
      COALESCE(Vendedor, 'Unknown') AS seller,
      COALESCE(Segmento, 'Unknown') AS segment,
      COALESCE(Fiscal_Q, 'Unknown') AS fiscal_quarter,
      COALESCE(Portflio, 'Unknown') AS portfolio,
      COALESCE(Perfil_Cliente, 'Unknown') AS customer_profile,
      * -- Preserva todas as colunas originais
    FROM `operaciones-br.sales_intelligence.pipeline`
    WHERE Gross IS NOT NULL AND Net IS NOT NULL
  )
) AS p;
