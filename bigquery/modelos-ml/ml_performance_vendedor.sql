-- ==========================================================================
-- MODELO 4: Performance de Vendedor (REGRESSION)
-- ==========================================================================
-- Objetivo: prever win rate esperado por vendedor com base no histórico de
--           closed_deals_won + closed_deals_lost e combinar com pipeline atual.
-- Saídas consumidas pelo dashboard/API:
--   - MODEL: sales_intelligence.ml_performance_vendedor
--   - TABLE: sales_intelligence.pipeline_performance_vendedor
-- ============================================================================

-- 1) Treinar modelo (features agregadas por vendedor)
CREATE OR REPLACE MODEL `sales_intelligence.ml_performance_vendedor`
OPTIONS(
  model_type='LINEAR_REG',
  input_label_cols=['win_rate_real'],
  data_split_method='AUTO_SPLIT',
  optimize_strategy='NORMAL_EQUATION',
  l2_reg=0.1
) AS
WITH vendedor_metrics AS (
  SELECT
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
    SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
    SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,
    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    'WON' AS outcome
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND SAFE_CAST(Atividades AS INT64) IS NOT NULL
    AND Vendedor IS NOT NULL

  UNION ALL

  SELECT
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
    SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
    SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,
    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    'LOST' AS outcome
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND SAFE_CAST(Atividades AS INT64) IS NOT NULL
    AND Vendedor IS NOT NULL
),
vendedor_stats AS (
  SELECT
    Vendedor,

    COUNT(*) AS total_deals,
    SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) AS total_ganhos,
    SUM(CASE WHEN outcome = 'LOST' THEN 1 ELSE 0 END) AS total_perdas,

    SAFE_DIVIDE(SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END), COUNT(*)) AS win_rate_real,

    AVG(Gross) AS avg_gross,
    AVG(Net) AS avg_net,
    AVG(CASE WHEN outcome = 'WON' THEN Gross END) AS avg_gross_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Gross END) AS avg_gross_lost,

    AVG(Ciclo_dias) AS avg_ciclo,
    AVG(CASE WHEN outcome = 'WON' THEN Ciclo_dias END) AS avg_ciclo_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Ciclo_dias END) AS avg_ciclo_lost,

    AVG(Atividades) AS avg_atividades,
    AVG(CASE WHEN outcome = 'WON' THEN Atividades END) AS avg_atividades_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Atividades END) AS avg_atividades_lost,

    AVG(Cadencia_Media_dias) AS avg_cadencia,
    AVG(CASE WHEN outcome = 'WON' THEN Cadencia_Media_dias END) AS avg_cadencia_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Cadencia_Media_dias END) AS avg_cadencia_lost,

    AVG(Total_Mudancas) AS avg_mudancas,
    AVG(Mudancas_Criticas) AS avg_mudancas_criticas,
    AVG(CASE WHEN outcome = 'WON' THEN Total_Mudancas END) AS avg_mudancas_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Total_Mudancas END) AS avg_mudancas_lost,

    AVG(SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0))) AS avg_velocidade_atividades,

    MIN(Ciclo_dias) AS min_ciclo,
    MAX(Ciclo_dias) AS max_ciclo,
    STDDEV(Ciclo_dias) AS stddev_ciclo,

    MIN(Atividades) AS min_atividades,
    MAX(Atividades) AS max_atividades,
    STDDEV(Atividades) AS stddev_atividades

  FROM vendedor_metrics
  GROUP BY Vendedor
  HAVING COUNT(*) >= 3
)
SELECT
  win_rate_real,

  total_deals,
  total_ganhos,
  total_perdas,

  COALESCE(avg_gross, 0) AS avg_gross,
  COALESCE(avg_net, 0) AS avg_net,
  COALESCE(avg_gross_won, 0) AS avg_gross_won,
  COALESCE(avg_gross_lost, 0) AS avg_gross_lost,

  COALESCE(avg_ciclo, 0) AS avg_ciclo,
  COALESCE(avg_ciclo_won, 0) AS avg_ciclo_won,
  COALESCE(avg_ciclo_lost, 0) AS avg_ciclo_lost,

  COALESCE(avg_atividades, 0) AS avg_atividades,
  COALESCE(avg_atividades_won, 0) AS avg_atividades_won,
  COALESCE(avg_atividades_lost, 0) AS avg_atividades_lost,

  COALESCE(avg_cadencia, 0) AS avg_cadencia,
  COALESCE(avg_cadencia_won, 0) AS avg_cadencia_won,
  COALESCE(avg_cadencia_lost, 0) AS avg_cadencia_lost,

  COALESCE(avg_mudancas, 0) AS avg_mudancas,
  COALESCE(avg_mudancas_criticas, 0) AS avg_mudancas_criticas,
  COALESCE(avg_mudancas_won, 0) AS avg_mudancas_won,
  COALESCE(avg_mudancas_lost, 0) AS avg_mudancas_lost,

  COALESCE(avg_velocidade_atividades, 0) AS avg_velocidade_atividades,

  COALESCE(min_ciclo, 0) AS min_ciclo,
  COALESCE(max_ciclo, 0) AS max_ciclo,
  COALESCE(stddev_ciclo, 0) AS stddev_ciclo,
  COALESCE(min_atividades, 0) AS min_atividades,
  COALESCE(max_atividades, 0) AS max_atividades,
  COALESCE(stddev_atividades, 0) AS stddev_atividades,

  COALESCE(avg_ciclo_won - avg_ciclo_lost, 0) AS delta_ciclo_won_vs_lost,
  COALESCE(avg_atividades_won - avg_atividades_lost, 0) AS delta_atividades_won_vs_lost,
  COALESCE(avg_cadencia_won - avg_cadencia_lost, 0) AS delta_cadencia_won_vs_lost

FROM vendedor_stats;


-- 2) Materializar tabela para o dashboard (combina pipeline + histórico + predição)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_performance_vendedor` AS
WITH vendedor_pipeline AS (
  SELECT
    Vendedor,
    COUNT(*) AS deals_pipeline,
    SUM(SAFE_CAST(Gross AS FLOAT64)) AS total_pipeline_value
  FROM `sales_intelligence.pipeline`
  WHERE Vendedor IS NOT NULL
    AND Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
  GROUP BY Vendedor
),
vendedor_historico AS (
  SELECT
    Vendedor,
    COUNT(*) AS total_deals_hist,
    SAFE_DIVIDE(SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END), COUNT(*)) * 100 AS win_rate_historico
  FROM (
    SELECT Vendedor, 'WON' AS outcome, Data_Fechamento FROM `sales_intelligence.closed_deals_won`
    UNION ALL
    SELECT Vendedor, 'LOST' AS outcome, Data_Fechamento FROM `sales_intelligence.closed_deals_lost`
  )
  WHERE Vendedor IS NOT NULL
    AND Data_Fechamento IS NOT NULL
    AND COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento),
      SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento)
    ) >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
  GROUP BY Vendedor
),
vendedor_features AS (
  -- mesmas features usadas no treino (por vendedor)
  WITH vendedor_metrics AS (
    SELECT
      Vendedor,
      SAFE_CAST(Gross AS FLOAT64) AS Gross,
      SAFE_CAST(Net AS FLOAT64) AS Net,
      SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
      SAFE_CAST(Atividades AS INT64) AS Atividades,
      SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
      SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
      SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,
      SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
      SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
      'WON' AS outcome
    FROM `sales_intelligence.closed_deals_won`
    WHERE Vendedor IS NOT NULL
      AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL

    UNION ALL

    SELECT
      Vendedor,
      SAFE_CAST(Gross AS FLOAT64) AS Gross,
      SAFE_CAST(Net AS FLOAT64) AS Net,
      SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
      SAFE_CAST(Atividades AS INT64) AS Atividades,
      SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
      SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
      SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,
      SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
      SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
      'LOST' AS outcome
    FROM `sales_intelligence.closed_deals_lost`
    WHERE Vendedor IS NOT NULL
      AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  ),
  vendedor_stats AS (
    SELECT
      Vendedor,
      COUNT(*) AS total_deals,
      SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) AS total_ganhos,
      SUM(CASE WHEN outcome = 'LOST' THEN 1 ELSE 0 END) AS total_perdas,
      SAFE_DIVIDE(SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END), COUNT(*)) AS win_rate_real,
      AVG(Gross) AS avg_gross,
      AVG(Net) AS avg_net,
      AVG(CASE WHEN outcome='WON' THEN Gross END) AS avg_gross_won,
      AVG(CASE WHEN outcome='LOST' THEN Gross END) AS avg_gross_lost,
      AVG(Ciclo_dias) AS avg_ciclo,
      AVG(CASE WHEN outcome='WON' THEN Ciclo_dias END) AS avg_ciclo_won,
      AVG(CASE WHEN outcome='LOST' THEN Ciclo_dias END) AS avg_ciclo_lost,
      AVG(Atividades) AS avg_atividades,
      AVG(CASE WHEN outcome='WON' THEN Atividades END) AS avg_atividades_won,
      AVG(CASE WHEN outcome='LOST' THEN Atividades END) AS avg_atividades_lost,
      AVG(Cadencia_Media_dias) AS avg_cadencia,
      AVG(CASE WHEN outcome='WON' THEN Cadencia_Media_dias END) AS avg_cadencia_won,
      AVG(CASE WHEN outcome='LOST' THEN Cadencia_Media_dias END) AS avg_cadencia_lost,
      AVG(Total_Mudancas) AS avg_mudancas,
      AVG(Mudancas_Criticas) AS avg_mudancas_criticas,
      AVG(CASE WHEN outcome='WON' THEN Total_Mudancas END) AS avg_mudancas_won,
      AVG(CASE WHEN outcome='LOST' THEN Total_Mudancas END) AS avg_mudancas_lost,
      AVG(SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0))) AS avg_velocidade_atividades,
      MIN(Ciclo_dias) AS min_ciclo,
      MAX(Ciclo_dias) AS max_ciclo,
      STDDEV(Ciclo_dias) AS stddev_ciclo,
      MIN(Atividades) AS min_atividades,
      MAX(Atividades) AS max_atividades,
      STDDEV(Atividades) AS stddev_atividades
    FROM vendedor_metrics
    GROUP BY Vendedor
    HAVING COUNT(*) >= 3
  )
  SELECT
    Vendedor,
    total_deals,
    total_ganhos,
    total_perdas,
    COALESCE(avg_gross, 0) AS avg_gross,
    COALESCE(avg_net, 0) AS avg_net,
    COALESCE(avg_gross_won, 0) AS avg_gross_won,
    COALESCE(avg_gross_lost, 0) AS avg_gross_lost,
    COALESCE(avg_ciclo, 0) AS avg_ciclo,
    COALESCE(avg_ciclo_won, 0) AS avg_ciclo_won,
    COALESCE(avg_ciclo_lost, 0) AS avg_ciclo_lost,
    COALESCE(avg_atividades, 0) AS avg_atividades,
    COALESCE(avg_atividades_won, 0) AS avg_atividades_won,
    COALESCE(avg_atividades_lost, 0) AS avg_atividades_lost,
    COALESCE(avg_cadencia, 0) AS avg_cadencia,
    COALESCE(avg_cadencia_won, 0) AS avg_cadencia_won,
    COALESCE(avg_cadencia_lost, 0) AS avg_cadencia_lost,
    COALESCE(avg_mudancas, 0) AS avg_mudancas,
    COALESCE(avg_mudancas_criticas, 0) AS avg_mudancas_criticas,
    COALESCE(avg_mudancas_won, 0) AS avg_mudancas_won,
    COALESCE(avg_mudancas_lost, 0) AS avg_mudancas_lost,
    COALESCE(avg_velocidade_atividades, 0) AS avg_velocidade_atividades,
    COALESCE(min_ciclo, 0) AS min_ciclo,
    COALESCE(max_ciclo, 0) AS max_ciclo,
    COALESCE(stddev_ciclo, 0) AS stddev_ciclo,
    COALESCE(min_atividades, 0) AS min_atividades,
    COALESCE(max_atividades, 0) AS max_atividades,
    COALESCE(stddev_atividades, 0) AS stddev_atividades,
    COALESCE(avg_ciclo_won - avg_ciclo_lost, 0) AS delta_ciclo_won_vs_lost,
    COALESCE(avg_atividades_won - avg_atividades_lost, 0) AS delta_atividades_won_vs_lost,
    COALESCE(avg_cadencia_won - avg_cadencia_lost, 0) AS delta_cadencia_won_vs_lost
  FROM vendedor_stats
),
pred AS (
  SELECT
    Vendedor,
    predicted_win_rate_real
  FROM ML.PREDICT(
    MODEL `sales_intelligence.ml_performance_vendedor`,
    (
      SELECT
        total_deals,
        total_ganhos,
        total_perdas,
        avg_gross,
        avg_net,
        avg_gross_won,
        avg_gross_lost,
        avg_ciclo,
        avg_ciclo_won,
        avg_ciclo_lost,
        avg_atividades,
        avg_atividades_won,
        avg_atividades_lost,
        avg_cadencia,
        avg_cadencia_won,
        avg_cadencia_lost,
        avg_mudancas,
        avg_mudancas_criticas,
        avg_mudancas_won,
        avg_mudancas_lost,
        avg_velocidade_atividades,
        min_ciclo,
        max_ciclo,
        stddev_ciclo,
        min_atividades,
        max_atividades,
        stddev_atividades,
        delta_ciclo_won_vs_lost,
        delta_atividades_won_vs_lost,
        delta_cadencia_won_vs_lost,
        Vendedor
      FROM vendedor_features
    )
  )
)
SELECT
  vp.Vendedor,

  -- percent (0-100)
  LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100 AS win_rate_previsto,
  (LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100) - COALESCE(vh.win_rate_historico, 0) AS delta_performance,

  vp.total_pipeline_value * LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) AS valor_previsto_venda,

  CASE
    WHEN (LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100) - COALESCE(vh.win_rate_historico, 0) > 10 THEN 'SOBRE_PERFORMANDO'
    WHEN (LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100) - COALESCE(vh.win_rate_historico, 0) > 5 THEN 'PERFORMANDO_BEM'
    WHEN (LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100) - COALESCE(vh.win_rate_historico, 0) >= -5 THEN 'NA_META'
    WHEN (LEAST(GREATEST(pred.predicted_win_rate_real, 0), 1) * 100) - COALESCE(vh.win_rate_historico, 0) >= -10 THEN 'ABAIXO_META'
    ELSE 'SUB_PERFORMANDO'
  END AS classificacao,

  RANK() OVER (ORDER BY pred.predicted_win_rate_real DESC) AS ranking,

  vp.deals_pipeline,
  vp.total_pipeline_value,
  COALESCE(vh.win_rate_historico, 0) AS win_rate_historico

FROM vendedor_pipeline vp
LEFT JOIN vendedor_historico vh ON vp.Vendedor = vh.Vendedor
LEFT JOIN pred ON vp.Vendedor = pred.Vendedor;
