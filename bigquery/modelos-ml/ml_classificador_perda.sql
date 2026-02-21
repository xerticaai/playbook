-- ==========================================================================
-- MODELO 2: Classificador de Causa de Perda (MULTICLASS)
-- ==========================================================================
-- Objetivo: classificar motivo/categoria de perda com histórico de LOST,
--           e aplicar no pipeline aberto.
-- Saídas consumidas pelo dashboard/API:
--   - MODEL: sales_intelligence.ml_classificador_perda
--   - TABLE: sales_intelligence.pipeline_classificador_perda
-- ============================================================================

-- 1) Treinar modelo (somente LOST)
CREATE OR REPLACE MODEL `sales_intelligence.ml_classificador_perda`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['categoria_perda'],
  data_split_method='AUTO_SPLIT',
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.01,
  l1_reg=0.1,
  l2_reg=0.1
) AS
WITH categorized_losses AS (
  SELECT
    Oportunidade,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,

    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
    SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
    SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,

    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    Segmento,
    Portfolio,
    Familia_Produto,

    Evitavel,
    Tipo_Resultado,

    CASE
      WHEN Tipo_Resultado = 'MA_QUALIFICACAO' THEN 'MA_QUALIFICACAO'
      WHEN Tipo_Resultado = 'ABANDONO' THEN 'ABANDONO'
      WHEN Tipo_Resultado = 'CONCORRENCIA' THEN 'CONCORRENCIA'
      WHEN Tipo_Resultado = 'TIMING' THEN 'TIMING'
      WHEN Tipo_Resultado = 'PRECO' THEN 'PRECO'
      WHEN Tipo_Resultado = 'BUDGET' THEN 'BUDGET'
      WHEN Tipo_Resultado = 'FIT' THEN 'FIT'
      WHEN Tipo_Resultado = 'CHAMPION_SAIU' THEN 'FIT'
      WHEN Tipo_Resultado = 'MUDANCA_ESCOPO' THEN 'FIT'
      ELSE 'OUTROS'
    END AS categoria_perda,

    CASE
      WHEN SAFE_CAST(Cadencia_Media_dias AS FLOAT64) > 90 THEN 1
      WHEN SAFE_CAST(Ativ_30d AS INT64) = 0 THEN 1
      ELSE 0
    END AS flag_abandono,

    CASE
      WHEN SAFE_CAST(Atividades AS INT64) < 3 AND SAFE_CAST(Ciclo_dias AS INT64) > 90 THEN 1
      ELSE 0
    END AS flag_ma_qualificacao,

    CASE Evitavel
      WHEN 'SIM' THEN 1
      WHEN 'PARCIALMENTE' THEN 0.5
      ELSE 0
    END AS score_evitavel

  FROM `sales_intelligence.closed_deals_lost`
  WHERE Tipo_Resultado IS NOT NULL
    AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND SAFE_CAST(Atividades AS INT64) IS NOT NULL
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_perdas,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades
  FROM categorized_losses
  GROUP BY Vendedor
),
segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_perdas,
    AVG(Ciclo_dias) AS segmento_avg_ciclo,
    AVG(Gross) AS segmento_avg_gross
  FROM categorized_losses
  GROUP BY Segmento
)
SELECT
  -- LABEL
  cl.categoria_perda,

  -- Features
  cl.Gross,
  cl.Net,
  cl.Ciclo_dias,
  cl.Atividades,
  COALESCE(cl.Ativ_7d, 0) AS Ativ_7d,
  COALESCE(cl.Ativ_30d, 0) AS Ativ_30d,
  COALESCE(cl.Cadencia_Media_dias, 0) AS Cadencia_Media_dias,
  COALESCE(cl.Total_Mudancas, 0) AS Total_Mudancas,
  COALESCE(cl.Mudancas_Criticas, 0) AS Mudancas_Criticas,
  COALESCE(cl.Mudancas_Close_Date, 0) AS Mudancas_Close_Date,
  COALESCE(cl.Mudancas_Stage, 0) AS Mudancas_Stage,
  COALESCE(cl.Mudancas_Valor, 0) AS Mudancas_Valor,

  cl.flag_abandono,
  cl.flag_ma_qualificacao,

  COALESCE(vs.vendedor_total_perdas, 0) AS vendedor_total_perdas,
  COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
  COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,

  COALESCE(ss.segmento_total_perdas, 0) AS segmento_total_perdas,
  COALESCE(ss.segmento_avg_ciclo, 0) AS segmento_avg_ciclo,
  COALESCE(ss.segmento_avg_gross, 0) AS segmento_avg_gross,

  cl.Segmento,
  cl.Portfolio,
  cl.Familia_Produto,
  cl.Fiscal_Q,

  COALESCE(cl.score_evitavel, 0) AS score_evitavel

FROM categorized_losses cl
LEFT JOIN vendedor_stats vs ON cl.Vendedor = vs.Vendedor
LEFT JOIN segmento_stats ss ON cl.Segmento = ss.Segmento
WHERE cl.categoria_perda != 'OUTROS';


-- 2) Aplicar no pipeline (materializar para o dashboard)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_classificador_perda` AS
WITH pipeline_base AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Vendedor,
    SAFE_CAST(p.Gross AS FLOAT64) AS Gross,
    SAFE_CAST(p.Net AS FLOAT64) AS Net,
    p.Fiscal_Q,

    COALESCE(SAFE_CAST(p.Ciclo_dias AS INT64), 0) AS Ciclo_dias,
    COALESCE(SAFE_CAST(p.Atividades AS INT64), 0) AS Atividades,
    CAST(NULL AS INT64) AS Ativ_7d,
    CAST(NULL AS INT64) AS Ativ_30d,
    CAST(NULL AS FLOAT64) AS Cadencia_Media_dias,

    CAST(NULL AS INT64) AS Total_Mudancas,
    CAST(NULL AS INT64) AS Mudancas_Criticas,
    CAST(NULL AS INT64) AS Mudancas_Close_Date,
    CAST(NULL AS INT64) AS Mudancas_Stage,
    CAST(NULL AS INT64) AS Mudancas_Valor,

    -- Categóricas (nem sempre existem no pipeline)
    p.Produtos AS Segmento,
    CAST(NULL AS STRING) AS Portfolio,
    CAST(NULL AS STRING) AS Familia_Produto,

    0 AS flag_abandono,
    0 AS flag_ma_qualificacao,

    0 AS score_evitavel

  FROM `sales_intelligence.pipeline` p
  WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_perdas,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS vendedor_avg_ciclo,
    AVG(SAFE_CAST(Atividades AS INT64)) AS vendedor_avg_atividades
  FROM `sales_intelligence.closed_deals_lost`
  WHERE Vendedor IS NOT NULL AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  GROUP BY Vendedor
),
segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_perdas,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS segmento_avg_ciclo,
    AVG(SAFE_CAST(Gross AS FLOAT64)) AS segmento_avg_gross
  FROM `sales_intelligence.closed_deals_lost`
  WHERE Segmento IS NOT NULL AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  GROUP BY Segmento
),
features AS (
  SELECT
    pb.*,
    COALESCE(vs.vendedor_total_perdas, 0) AS vendedor_total_perdas,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,

    COALESCE(ss.segmento_total_perdas, 0) AS segmento_total_perdas,
    COALESCE(ss.segmento_avg_ciclo, 0) AS segmento_avg_ciclo,
    COALESCE(ss.segmento_avg_gross, 0) AS segmento_avg_gross

  FROM pipeline_base pb
  LEFT JOIN vendedor_stats vs ON pb.Vendedor = vs.Vendedor
  LEFT JOIN segmento_stats ss ON pb.Segmento = ss.Segmento
),
pred AS (
  SELECT
    *
  FROM ML.PREDICT(
    MODEL `sales_intelligence.ml_classificador_perda`,
    (
      SELECT
        opportunity,
        Gross,
        Net,
        Ciclo_dias,
        Atividades,
        Ativ_7d,
        Ativ_30d,
        Cadencia_Media_dias,
        Total_Mudancas,
        Mudancas_Criticas,
        Mudancas_Close_Date,
        Mudancas_Stage,
        Mudancas_Valor,
        flag_abandono,
        flag_ma_qualificacao,
        vendedor_total_perdas,
        vendedor_avg_ciclo,
        vendedor_avg_atividades,
        segmento_total_perdas,
        segmento_avg_ciclo,
        segmento_avg_gross,
        Segmento,
        Portfolio,
        Familia_Produto,
        Fiscal_Q,
        score_evitavel,
        Vendedor
      FROM features
    )
  )
)
SELECT
  opportunity,
  Gross,
  Net,
  Vendedor,
  Fiscal_Q,
  Ciclo_dias,
  Atividades,

  predicted_categoria_perda AS causa_prevista,
  (SELECT MAX(prob) FROM UNNEST(predicted_categoria_perda_probs)) AS confianca_predicao,

  (SELECT prob FROM UNNEST(predicted_categoria_perda_probs) WHERE label = 'PRECO' LIMIT 1) AS prob_preco,
  (SELECT prob FROM UNNEST(predicted_categoria_perda_probs) WHERE label = 'TIMING' LIMIT 1) AS prob_timing,
  (SELECT prob FROM UNNEST(predicted_categoria_perda_probs) WHERE label = 'CONCORRENCIA' LIMIT 1) AS prob_concorrente,
  (SELECT prob FROM UNNEST(predicted_categoria_perda_probs) WHERE label = 'BUDGET' LIMIT 1) AS prob_budget,
  (SELECT prob FROM UNNEST(predicted_categoria_perda_probs) WHERE label = 'FIT' LIMIT 1) AS prob_fit

FROM pred;
