-- Gerar predições para os 270 deals de pipeline
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
      'Unknown' AS segment,  -- Não existe em pipeline
      COALESCE(Fiscal_Q, 'Unknown') AS fiscal_quarter,
      'Unknown' AS portfolio,  -- Não existe em pipeline
      'Unknown' AS customer_profile,  -- Não existe em pipeline
      * -- Preserva todas as colunas originais
    FROM `operaciones-br.sales_intelligence.pipeline`
    WHERE Gross IS NOT NULL AND Net IS NOT NULL
  )
) AS p;
