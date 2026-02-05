-- =====================================================================
-- BigQuery ML - Win/Loss Prediction Model
-- Modelo de Machine Learning para prever probabilidade de vitória
-- =====================================================================

-- ========== PARTE 1: Criar Dataset de Treinamento ==========
-- Combina dados históricos fechados com features relevantes

CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.training_data` AS
SELECT
  -- Label (o que queremos prever)
  CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END AS won,
  
  -- Features numéricas
  gross,
  net,
  ciclo_dias,
  atividades,
  atividades_peso,
  meddic_score,
  bant_score,
  
  -- Features categóricas
  perfil,
  vendedor,
  fiscal_q,
  
  -- Engenharia de features
  CASE 
    WHEN gross < 10000 THEN 'small'
    WHEN gross < 50000 THEN 'medium'
    WHEN gross < 200000 THEN 'large'
    ELSE 'enterprise'
  END AS deal_size_category,
  
  CASE 
    WHEN ciclo_dias < 30 THEN 'fast'
    WHEN ciclo_dias < 90 THEN 'normal'
    WHEN ciclo_dias < 180 THEN 'slow'
    ELSE 'very_slow'
  END AS cycle_category,
  
  CASE 
    WHEN meddic_score >= 75 THEN 'strong'
    WHEN meddic_score >= 50 THEN 'moderate'
    WHEN meddic_score >= 25 THEN 'weak'
    ELSE 'very_weak'
  END AS meddic_category,
  
  CASE
    WHEN atividades >= 10 THEN 'high'
    WHEN atividades >= 5 THEN 'medium'
    ELSE 'low'
  END AS engagement_level

FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE 
  -- Remover linhas com valores nulos críticos
  gross IS NOT NULL
  AND vendedor IS NOT NULL
  AND outcome IN ('WON', 'LOST');


-- ========== PARTE 2: Criar Modelo de Classificação (XGBoost) ==========
-- XGBoost geralmente performa melhor que redes neurais para dados tabulares

CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.win_loss_predictor`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['won'],
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.01,
  data_split_method='AUTO_SPLIT',
  data_split_eval_fraction=0.2
) AS
SELECT
  won,
  gross,
  net,
  ciclo_dias,
  atividades,
  atividades_peso,
  meddic_score,
  bant_score,
  perfil,
  vendedor,
  fiscal_q,
  deal_size_category,
  cycle_category,
  meddic_category,
  engagement_level
FROM `operaciones-br.sales_intelligence.training_data`;


-- ========== PARTE 3: Avaliar Modelo ==========
-- Métricas de performance do modelo

SELECT
  *
FROM ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.win_loss_predictor`);


-- ========== PARTE 4: Feature Importance ==========
-- Quais features são mais importantes para a predição?

SELECT
  *
FROM ML.FEATURE_IMPORTANCE(MODEL `operaciones-br.sales_intelligence.win_loss_predictor`)
ORDER BY importance_weight DESC;


-- ========== PARTE 5: Aplicar Predições no Pipeline ==========
-- Gera predições para todas as oportunidades abertas no pipeline

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_predictions` AS
SELECT
  p.run_id,
  p.oportunidade,
  p.conta,
  p.vendedor,
  p.gross,
  p.fiscal_q,
  p.data_prevista,
  p.fase_atual,
  p.forecast_ia,
  p.meddic_score,
  p.bant_score,
  
  -- Predição do modelo
  pred.prob AS win_probability,
  pred.predicted_label AS predicted_outcome,
  
  -- Score de confiança do modelo
  CASE 
    WHEN pred.prob >= 0.7 THEN 'HIGH_CONFIDENCE'
    WHEN pred.prob >= 0.5 THEN 'MEDIUM_CONFIDENCE'
    WHEN pred.prob >= 0.3 THEN 'LOW_CONFIDENCE'
    ELSE 'VERY_LOW_CONFIDENCE'
  END AS prediction_confidence,
  
  -- Alertas baseados em ML
  CASE
    WHEN pred.prob < 0.3 AND p.gross > 50000 THEN 'HIGH_VALUE_AT_RISK'
    WHEN pred.prob < 0.5 AND p.data_prevista < DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY) THEN 'NEAR_TERM_RISK'
    WHEN pred.prob > 0.8 AND p.fase_atual NOT IN ('Negociação', 'Aprobación de Deal Desk') THEN 'UNDERVALUED_OPPORTUNITY'
    ELSE NULL
  END AS ml_alert,
  
  CURRENT_TIMESTAMP() AS prediction_timestamp

FROM `operaciones-br.sales_intelligence.pipeline` p,
ML.PREDICT(
  MODEL `operaciones-br.sales_intelligence.win_loss_predictor`,
  (
    SELECT
      p.gross,
      p.net,
      p.ciclo_dias,
      p.atividades,
      p.atividades_peso,
      p.meddic_score,
      p.bant_score,
      p.perfil,
      p.vendedor,
      p.fiscal_q,
      
      -- Engenharia de features (mesma lógica do treinamento)
      CASE 
        WHEN p.gross < 10000 THEN 'small'
        WHEN p.gross < 50000 THEN 'medium'
        WHEN p.gross < 200000 THEN 'large'
        ELSE 'enterprise'
      END AS deal_size_category,
      
      CASE 
        WHEN p.ciclo_dias < 30 THEN 'fast'
        WHEN p.ciclo_dias < 90 THEN 'normal'
        WHEN p.ciclo_dias < 180 THEN 'slow'
        ELSE 'very_slow'
      END AS cycle_category,
      
      CASE 
        WHEN p.meddic_score >= 75 THEN 'strong'
        WHEN p.meddic_score >= 50 THEN 'moderate'
        WHEN p.meddic_score >= 25 THEN 'weak'
        ELSE 'very_weak'
      END AS meddic_category,
      
      CASE
        WHEN p.atividades >= 10 THEN 'high'
        WHEN p.atividades >= 5 THEN 'medium'
        ELSE 'low'
      END AS engagement_level
    FROM `operaciones-br.sales_intelligence.pipeline` p
  )
) AS pred;


-- ========== PARTE 6: Dashboard de Insights de ML ==========
-- Query para visualizar oportunidades por risco

SELECT
  prediction_confidence,
  ml_alert,
  COUNT(*) AS num_deals,
  SUM(gross) AS total_value,
  AVG(win_probability) AS avg_win_prob,
  STRING_AGG(
    CONCAT(oportunidade, ' (', CAST(ROUND(win_probability * 100) AS STRING), '%)'),
    ', '
    LIMIT 5
  ) AS sample_deals
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
GROUP BY prediction_confidence, ml_alert
ORDER BY 
  CASE prediction_confidence
    WHEN 'HIGH_CONFIDENCE' THEN 1
    WHEN 'MEDIUM_CONFIDENCE' THEN 2
    WHEN 'LOW_CONFIDENCE' THEN 3
    ELSE 4
  END,
  total_value DESC;


-- ========== PARTE 7: Top Oportunidades em Risco ==========
-- Deals de alto valor com baixa probabilidade de vitória

SELECT
  oportunidade,
  conta,
  vendedor,
  gross,
  win_probability,
  ml_alert,
  fase_atual,
  data_prevista,
  meddic_score,
  bant_score
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
WHERE win_probability < 0.5
  AND gross > 50000
ORDER BY gross DESC
LIMIT 20;


-- ========== PARTE 8: Comparação: Forecast IA vs. ML Prediction ==========
-- Compara o forecast manual da IA com a predição do modelo de ML

SELECT
  forecast_ia,
  COUNT(*) AS num_deals,
  AVG(win_probability) AS avg_ml_prediction,
  SUM(gross) AS total_value,
  
  -- Divergência entre forecast e ML
  CASE
    WHEN forecast_ia = 'PIPELINE' AND AVG(win_probability) > 0.6 THEN 'ML_MORE_OPTIMISTIC'
    WHEN forecast_ia = 'POTENCIAL' AND AVG(win_probability) < 0.4 THEN 'ML_MORE_PESSIMISTIC'
    WHEN forecast_ia IN ('COMMIT', 'BEST_CASE') AND AVG(win_probability) < 0.5 THEN 'HIGH_RISK_COMMIT'
    ELSE 'ALIGNED'
  END AS forecast_vs_ml
  
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
GROUP BY forecast_ia
ORDER BY avg_ml_prediction DESC;
