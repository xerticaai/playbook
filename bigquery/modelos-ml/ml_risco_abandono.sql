-- ==========================================================================
-- MODELO 3: Risco de Abandono (BINARY CLASSIFICATION)
-- ==========================================================================
-- Objetivo: estimar probabilidade de abandono (foi_abandonado) com histórico
--           de closed_deals_won + closed_deals_lost e aplicar no pipeline.
-- Saídas consumidas pelo dashboard/API:
--   - MODEL: sales_intelligence.ml_risco_abandono
--   - TABLE: sales_intelligence.pipeline_risco_abandono
-- ============================================================================

-- 1) Treinar modelo
CREATE OR REPLACE MODEL `sales_intelligence.ml_risco_abandono`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['foi_abandonado'],
  data_split_method='AUTO_SPLIT',
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.01,
  l1_reg=0.1,
  l2_reg=0.1
) AS
WITH historical_deals AS (
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

    -- LABEL
    0 AS foi_abandonado,

    'WON' AS outcome,
    Tipo_Resultado
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL

  UNION ALL

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

    CASE
      WHEN Tipo_Resultado = 'ABANDONO' THEN 1
      WHEN Tipo_Resultado = 'MA_QUALIFICACAO' AND SAFE_CAST(Atividades AS INT64) < 3 THEN 1
      ELSE 0
    END AS foi_abandonado,

    'LOST' AS outcome,
    Tipo_Resultado
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND Tipo_Resultado IS NOT NULL
),
enriched AS (
  SELECT
    *,

    CASE
      WHEN Cadencia_Media_dias > 90 THEN 1
      WHEN Cadencia_Media_dias > 60 THEN 0.5
      ELSE 0
    END AS flag_inatividade,

    CASE
      WHEN Atividades < 3 THEN 1
      WHEN Atividades < 5 THEN 0.5
      ELSE 0
    END AS flag_baixo_engajamento,

    CASE
      WHEN Ativ_7d = 0 THEN 1
      WHEN Ativ_30d = 0 THEN 0.7
      ELSE 0
    END AS flag_sem_atividade_recente,

    CASE
      WHEN Mudancas_Criticas > 5 THEN 1
      WHEN Mudancas_Criticas > 3 THEN 0.5
      ELSE 0
    END AS flag_instavel,

    CASE
      WHEN Mudancas_Close_Date > 3 THEN 1
      WHEN Mudancas_Close_Date > 1 THEN 0.5
      ELSE 0
    END AS flag_postergacao,

    SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0)) AS velocidade_atividades,
    SAFE_DIVIDE(Ativ_7d, NULLIF(Ativ_30d, 0)) AS razao_atividade_recente

  FROM historical_deals
  WHERE Gross IS NOT NULL
    AND Atividades IS NOT NULL
    AND Ciclo_dias IS NOT NULL
    AND Ciclo_dias > 0
    AND Ciclo_dias < 730
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades,
    SAFE_DIVIDE(SUM(CASE WHEN foi_abandonado = 1 THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_taxa_abandono
  FROM enriched
  GROUP BY Vendedor
),
segmento_stats AS (
  SELECT
    CAST(NULL AS STRING) AS Segmento,
    0 AS segmento_total_deals,
    0 AS segmento_avg_ciclo,
    0 AS segmento_taxa_abandono
)
SELECT
  foi_abandonado,

  -- Features deal
  Gross,
  Net,
  Ciclo_dias,
  Atividades,
  COALESCE(Ativ_7d, 0) AS Ativ_7d,
  COALESCE(Ativ_30d, 0) AS Ativ_30d,
  COALESCE(Cadencia_Media_dias, 0) AS Cadencia_Media_dias,
  COALESCE(Total_Mudancas, 0) AS Total_Mudancas,
  COALESCE(Mudancas_Criticas, 0) AS Mudancas_Criticas,
  COALESCE(Mudancas_Close_Date, 0) AS Mudancas_Close_Date,
  COALESCE(Mudancas_Stage, 0) AS Mudancas_Stage,

  -- Flags
  flag_inatividade,
  flag_baixo_engajamento,
  flag_sem_atividade_recente,
  flag_instavel,
  flag_postergacao,
  COALESCE(velocidade_atividades, 0) AS velocidade_atividades,
  COALESCE(razao_atividade_recente, 0) AS razao_atividade_recente,

  -- Vendedor
  COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
  COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
  COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,
  COALESCE(vs.vendedor_taxa_abandono, 0) AS vendedor_taxa_abandono,

  -- Contexto
  Fiscal_Q

FROM enriched e
LEFT JOIN vendedor_stats vs ON e.Vendedor = vs.Vendedor;


-- 2) Aplicar no pipeline (materializar para o dashboard)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_risco_abandono` AS
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
    CAST(NULL AS INT64) AS Mudancas_Stage

  FROM `sales_intelligence.pipeline` p
  WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS vendedor_avg_ciclo,
    AVG(SAFE_CAST(Atividades AS INT64)) AS vendedor_avg_atividades,
    SAFE_DIVIDE(SUM(CASE WHEN src='LOST' AND Tipo_Resultado='ABANDONO' THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_taxa_abandono
  FROM (
    SELECT Vendedor, Ciclo_dias, Atividades, Tipo_Resultado, 'LOST' AS src FROM `sales_intelligence.closed_deals_lost`
    UNION ALL
    SELECT Vendedor, Ciclo_dias, Atividades, CAST(NULL AS STRING) AS Tipo_Resultado, 'WON' AS src FROM `sales_intelligence.closed_deals_won`
  )
  WHERE Vendedor IS NOT NULL AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  GROUP BY Vendedor
),
features AS (
  SELECT
    pb.*,

    CASE
      WHEN pb.Cadencia_Media_dias > 90 THEN 1
      WHEN pb.Cadencia_Media_dias > 60 THEN 0.5
      ELSE 0
    END AS flag_inatividade,

    CASE
      WHEN pb.Atividades < 3 THEN 1
      WHEN pb.Atividades < 5 THEN 0.5
      ELSE 0
    END AS flag_baixo_engajamento,

    CASE
      WHEN pb.Ativ_7d = 0 THEN 1
      WHEN pb.Ativ_30d = 0 THEN 0.7
      ELSE 0
    END AS flag_sem_atividade_recente,

    CASE
      WHEN pb.Mudancas_Criticas > 5 THEN 1
      WHEN pb.Mudancas_Criticas > 3 THEN 0.5
      ELSE 0
    END AS flag_instavel,

    CASE
      WHEN pb.Mudancas_Close_Date > 3 THEN 1
      WHEN pb.Mudancas_Close_Date > 1 THEN 0.5
      ELSE 0
    END AS flag_postergacao,

    SAFE_DIVIDE(pb.Atividades, NULLIF(pb.Ciclo_dias, 0)) AS velocidade_atividades,
    SAFE_DIVIDE(pb.Ativ_7d, NULLIF(pb.Ativ_30d, 0)) AS razao_atividade_recente,

    COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,
    COALESCE(vs.vendedor_taxa_abandono, 0) AS vendedor_taxa_abandono

  FROM pipeline_base pb
  LEFT JOIN vendedor_stats vs ON pb.Vendedor = vs.Vendedor
)
SELECT
  opportunity,
  Gross,
  Net,
  Vendedor,
  Fiscal_Q,

  (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) AS prob_abandono,

  CASE
    WHEN (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) >= 0.6 THEN 'ALTO'
    WHEN (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) >= 0.4 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS nivel_risco,

  ARRAY_TO_STRING([
    IF(Cadencia_Media_dias > 60, CONCAT('CADENCIA_', CAST(Cadencia_Media_dias AS STRING), 'D'), NULL),
    IF(Ativ_30d = 0, 'SEM_ATIV_30D', NULL),
    IF(Atividades < 3, 'POUCAS_ATIVIDADES', NULL),
    IF(Mudancas_Criticas > 3, CONCAT('MUDANCAS_CRITICAS_', CAST(Mudancas_Criticas AS STRING)), NULL),
    IF(Mudancas_Close_Date > 1, CONCAT('POSTERGACOES_', CAST(Mudancas_Close_Date AS STRING)), NULL)
  ], ', ') AS fatores_risco,

  CASE
    WHEN (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) >= 0.6
      THEN 'URGENTE: reativar engajamento hoje e envolver gestor'
    WHEN (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) >= 0.4
      THEN 'IMPORTANTE: reforçar cadência e definir próximo passo objetivo'
    ELSE 'MANTER: monitorar e manter follow-up'
  END AS acao_recomendada

FROM ML.PREDICT(
  MODEL `sales_intelligence.ml_risco_abandono`,
  (
    SELECT
      opportunity,
      Gross,
      Net,
      Vendedor,
      Fiscal_Q,
      Ciclo_dias,
      Atividades,
      Ativ_7d,
      Ativ_30d,
      Cadencia_Media_dias,
      Total_Mudancas,
      Mudancas_Criticas,
      Mudancas_Close_Date,
      Mudancas_Stage,

      flag_inatividade,
      flag_baixo_engajamento,
      flag_sem_atividade_recente,
      flag_instavel,
      flag_postergacao,
      COALESCE(velocidade_atividades, 0) AS velocidade_atividades,
      COALESCE(razao_atividade_recente, 0) AS razao_atividade_recente,

      vendedor_total_deals,
      vendedor_avg_ciclo,
      vendedor_avg_atividades,
      vendedor_taxa_abandono

    FROM features
  )
)
WHERE (SELECT prob FROM UNNEST(predicted_foi_abandonado_probs) WHERE label = 1 LIMIT 1) >= 0.3;
