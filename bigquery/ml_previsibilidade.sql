-- ==========================================================================
-- MODELO 5: Previsibilidade (Win Probability)
-- ==========================================================================
-- Objetivo: estimar a probabilidade de ganho por deal e calcular provisionado.
-- Saidas consumidas pelo dashboard/API:
--   - MODEL:  sales_intelligence.ml_previsibilidade
--   - TABLE:  sales_intelligence.pipeline_previsibilidade
--   - TABLE:  sales_intelligence.closed_previsibilidade
-- ============================================================================

-- 1) Treinar modelo (WON + LOST)
CREATE OR REPLACE MODEL `sales_intelligence.ml_previsibilidade`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['won'],
  data_split_method='AUTO_SPLIT',
  auto_class_weights=TRUE,
  max_iterations=60,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.01,
  l1_reg=0.1,
  l2_reg=0.1
) AS
WITH closed_base AS (
  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,

    SAFE_CAST(Atividades AS INT64) AS Atividades,

    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    CAST(0 AS INT64) AS MEDDIC_Score,
    CAST(0 AS INT64) AS BANT_Score,

    1 AS won
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL

  UNION ALL

  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,

    SAFE_CAST(Atividades AS INT64) AS Atividades,

    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    CAST(0 AS INT64) AS MEDDIC_Score,
    CAST(0 AS INT64) AS BANT_Score,

    0 AS won
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL
),
closed_features AS (
  SELECT
    *
  FROM closed_base
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(Gross) AS vendedor_avg_gross,
    AVG(Net) AS vendedor_avg_net,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    SAFE_DIVIDE(SUM(won), COUNT(*)) AS vendedor_win_rate
  FROM closed_features
  GROUP BY Vendedor
),
features AS (
  SELECT
    cf.*,
    COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
    COALESCE(vs.vendedor_avg_gross, 0) AS vendedor_avg_gross,
    COALESCE(vs.vendedor_avg_net, 0) AS vendedor_avg_net,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_win_rate, 0) AS vendedor_win_rate,

    SAFE_CAST(REGEXP_EXTRACT(Fiscal_Q, r'FY(\d{2})') AS INT64) + 2000 AS fiscal_year,
    SAFE_CAST(REGEXP_EXTRACT(Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_quarter,
    SAFE_CAST(REGEXP_EXTRACT(Fiscal_Q, r'FY(\d{2})') AS INT64) * 4
      + SAFE_CAST(REGEXP_EXTRACT(Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_q_index
  FROM closed_features cf
  LEFT JOIN vendedor_stats vs ON cf.Vendedor = vs.Vendedor
)
SELECT
  won,
  opportunity,
  Vendedor,
  Gross,
  Net,
  Fiscal_Q,
  fiscal_year,
  fiscal_quarter,
  fiscal_q_index,

  Ciclo_dias,
  Atividades,
  Total_Mudancas,
  Mudancas_Criticas,
  Mudancas_Close_Date,
  Mudancas_Stage,
  Mudancas_Valor,
  MEDDIC_Score,
  BANT_Score,

  vendedor_total_deals,
  vendedor_avg_gross,
  vendedor_avg_net,
  vendedor_avg_ciclo,
  vendedor_win_rate
FROM features;


-- 2) Previsao no pipeline aberto
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_previsibilidade` AS
WITH pipeline_base AS (
  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,

    SAFE_CAST(Atividades AS INT64) AS Atividades,

    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    CAST(0 AS INT64) AS MEDDIC_Score,
    CAST(0 AS INT64) AS BANT_Score,

    CAST(NULL AS STRING) AS perfil_placeholder
  FROM `sales_intelligence.pipeline`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(SAFE_CAST(Gross AS FLOAT64)) AS vendedor_avg_gross,
    AVG(SAFE_CAST(Net AS FLOAT64)) AS vendedor_avg_net,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS vendedor_avg_ciclo,
    SAFE_DIVIDE(SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_win_rate
  FROM (
    SELECT Vendedor, Gross, Net, Ciclo_dias, 'WON' AS outcome FROM `sales_intelligence.closed_deals_won`
    UNION ALL
    SELECT Vendedor, Gross, Net, Ciclo_dias, 'LOST' AS outcome FROM `sales_intelligence.closed_deals_lost`
  )
  GROUP BY Vendedor
),
features AS (
  SELECT
    pb.*,
    COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
    COALESCE(vs.vendedor_avg_gross, 0) AS vendedor_avg_gross,
    COALESCE(vs.vendedor_avg_net, 0) AS vendedor_avg_net,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_win_rate, 0) AS vendedor_win_rate,

    SAFE_CAST(REGEXP_EXTRACT(pb.Fiscal_Q, r'FY(\d{2})') AS INT64) + 2000 AS fiscal_year,
    SAFE_CAST(REGEXP_EXTRACT(pb.Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_quarter,
    SAFE_CAST(REGEXP_EXTRACT(pb.Fiscal_Q, r'FY(\d{2})') AS INT64) * 4
      + SAFE_CAST(REGEXP_EXTRACT(pb.Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_q_index
  FROM pipeline_base pb
  LEFT JOIN vendedor_stats vs ON pb.Vendedor = vs.Vendedor
),
predicted AS (
  SELECT
    opportunity,
    Vendedor,
    Gross,
    Net,
    Fiscal_Q,
    CAST(predicted_won AS INT64) AS predicted_label,
    (SELECT prob FROM UNNEST(predicted_won_probs) WHERE label = 1) AS prob_win,
    (SELECT prob FROM UNNEST(predicted_won_probs) WHERE label = 0) AS prob_loss
  FROM ML.PREDICT(
    MODEL `sales_intelligence.ml_previsibilidade`,
    (
      SELECT
        opportunity,
        Vendedor,
        Gross,
        Net,
        Fiscal_Q,
        fiscal_year,
        fiscal_quarter,
        fiscal_q_index,

        Ciclo_dias,
        Atividades,
        Total_Mudancas,
        Mudancas_Criticas,
        Mudancas_Close_Date,
        Mudancas_Stage,
        Mudancas_Valor,
        MEDDIC_Score,
        BANT_Score,

        vendedor_total_deals,
        vendedor_avg_gross,
        vendedor_avg_net,
        vendedor_avg_ciclo,
        vendedor_win_rate
      FROM features
    )
  )
)
SELECT
  opportunity,
  Vendedor,
  Gross,
  Net,
  Fiscal_Q,
  predicted_label,
  prob_win,
  prob_loss,
  ROUND(Gross * prob_win, 2) AS expected_gross,
  ROUND(Net * prob_win, 2) AS expected_net,
  CASE
    WHEN prob_win >= 0.7 THEN 'ALTA'
    WHEN prob_win >= 0.5 THEN 'MEDIA'
    ELSE 'BAIXA'
  END AS previsibilidade,
  CURRENT_TIMESTAMP() AS prediction_timestamp
FROM predicted;


-- 3) Backtest em fechados (validacao simples para o dashboard)
CREATE OR REPLACE TABLE `sales_intelligence.closed_previsibilidade` AS
WITH closed_base AS (
  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,
    CAST(0 AS INT64) AS MEDDIC_Score,
    CAST(0 AS INT64) AS BANT_Score,
    CAST(NULL AS STRING) AS perfil_placeholder,
    'WON' AS outcome
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL

  UNION ALL

  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,
    CAST(NULL AS INT64) AS MEDDIC_Score,
    CAST(NULL AS INT64) AS BANT_Score,
    CAST(NULL AS STRING) AS perfil_placeholder,
    'LOST' AS outcome
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(SAFE_CAST(Gross AS FLOAT64)) AS vendedor_avg_gross,
    AVG(SAFE_CAST(Net AS FLOAT64)) AS vendedor_avg_net,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS vendedor_avg_ciclo,
    SAFE_DIVIDE(SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_win_rate
  FROM closed_base
  GROUP BY Vendedor
),
features AS (
  SELECT
    cb.*,
    COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
    COALESCE(vs.vendedor_avg_gross, 0) AS vendedor_avg_gross,
    COALESCE(vs.vendedor_avg_net, 0) AS vendedor_avg_net,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_win_rate, 0) AS vendedor_win_rate,

    SAFE_CAST(REGEXP_EXTRACT(cb.Fiscal_Q, r'FY(\d{2})') AS INT64) + 2000 AS fiscal_year,
    SAFE_CAST(REGEXP_EXTRACT(cb.Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_quarter,
    SAFE_CAST(REGEXP_EXTRACT(cb.Fiscal_Q, r'FY(\d{2})') AS INT64) * 4
      + SAFE_CAST(REGEXP_EXTRACT(cb.Fiscal_Q, r'Q([1-4])') AS INT64) AS fiscal_q_index
  FROM closed_base cb
  LEFT JOIN vendedor_stats vs ON cb.Vendedor = vs.Vendedor
),
predicted AS (
  SELECT
    opportunity,
    Vendedor,
    Gross,
    Net,
    Fiscal_Q,
    CAST(predicted_won AS INT64) AS predicted_label,
    (SELECT prob FROM UNNEST(predicted_won_probs) WHERE label = 1) AS prob_win,
    (SELECT prob FROM UNNEST(predicted_won_probs) WHERE label = 0) AS prob_loss
  FROM ML.PREDICT(
    MODEL `sales_intelligence.ml_previsibilidade`,
    (
      SELECT
        opportunity,
        Vendedor,
        Gross,
        Net,
        Fiscal_Q,
        fiscal_year,
        fiscal_quarter,
        fiscal_q_index,

        Ciclo_dias,
        Atividades,
        Total_Mudancas,
        Mudancas_Criticas,
        Mudancas_Close_Date,
        Mudancas_Stage,
        Mudancas_Valor,
        MEDDIC_Score,
        BANT_Score,

        vendedor_total_deals,
        vendedor_avg_gross,
        vendedor_avg_net,
        vendedor_avg_ciclo,
        vendedor_win_rate
      FROM features
    )
  )
)
SELECT
  p.opportunity,
  p.Vendedor,
  p.Gross,
  p.Net,
  p.Fiscal_Q,
  cb.outcome,
  p.predicted_label,
  p.prob_win,
  p.prob_loss,
  CURRENT_TIMESTAMP() AS prediction_timestamp
FROM predicted p
LEFT JOIN closed_base cb
  ON p.opportunity = cb.opportunity
  AND p.Vendedor = cb.Vendedor
  AND p.Fiscal_Q = cb.Fiscal_Q;
