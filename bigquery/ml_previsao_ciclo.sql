-- ==========================================================================
-- MODELO 1: Previsão de Ciclo de Vendas (REGRESSION)
-- ==========================================================================
-- Objetivo: prever o tempo de ciclo (Ciclo_dias) com base no histórico de
--           closed_deals_won + closed_deals_lost e aplicar no pipeline aberto.
-- Saídas consumidas pelo dashboard/API:
--   - MODEL:  sales_intelligence.ml_previsao_ciclo
--   - TABLE:  sales_intelligence.pipeline_previsao_ciclo
-- ============================================================================

-- 1) Treinar modelo (histórico WON + LOST)
CREATE OR REPLACE MODEL `sales_intelligence.ml_previsao_ciclo`
OPTIONS(
  model_type='BOOSTED_TREE_REGRESSOR',
  input_label_cols=['Ciclo_dias'],
  data_split_method='AUTO_SPLIT',
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.01,
  l1_reg=0.1,
  l2_reg=0.1
) AS
WITH all_closed_deals AS (
  SELECT
    Oportunidade,
    Vendedor,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,

    -- Métricas (podem ser NULL dependendo do sheet)
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
    SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
    SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,

    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    -- Scores
    CAST(NULL AS INT64) AS MEDDIC_Score,
    CAST(NULL AS INT64) AS BANT_Score,

    -- Categóricas
    Perfil_Cliente,
    Segmento,
    Portfolio,
    Familia_Produto,
    Qualidade_Engajamento,
    Gestao_Oportunidade,

    'WON' AS outcome
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
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,

    CAST(NULL AS INT64) AS MEDDIC_Score,
    CAST(NULL AS INT64) AS BANT_Score,

    Perfil_Cliente,
    Segmento,
    Portfolio,
    Familia_Produto,
    Qualidade_Engajamento,
    Gestao_Oportunidade,

    'LOST' AS outcome
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
),
filtered AS (
  SELECT
    *
  FROM all_closed_deals
  WHERE Ciclo_dias IS NOT NULL
    AND Ciclo_dias > 0
    AND Ciclo_dias < 730
    AND Gross IS NOT NULL
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades,
    SAFE_DIVIDE(SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_win_rate
  FROM filtered
  GROUP BY Vendedor
),
segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_deals,
    AVG(Ciclo_dias) AS segmento_avg_ciclo,
    AVG(Gross) AS segmento_avg_gross,
    SAFE_DIVIDE(SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END), COUNT(*)) AS segmento_win_rate
  FROM filtered
  GROUP BY Segmento
)
SELECT
  -- LABEL
  f.Ciclo_dias,

  -- Numéricas
  f.Gross,
  f.Net,
  COALESCE(f.Atividades, 0) AS Atividades,
  COALESCE(f.Ativ_7d, 0) AS Ativ_7d,
  COALESCE(f.Ativ_30d, 0) AS Ativ_30d,
  COALESCE(f.Cadencia_Media_dias, 0) AS Cadencia_Media_dias,
  COALESCE(f.Total_Mudancas, 0) AS Total_Mudancas,
  COALESCE(f.Mudancas_Criticas, 0) AS Mudancas_Criticas,
  COALESCE(f.Mudancas_Close_Date, 0) AS Mudancas_Close_Date,
  COALESCE(f.Mudancas_Stage, 0) AS Mudancas_Stage,
  COALESCE(f.Mudancas_Valor, 0) AS Mudancas_Valor,
  COALESCE(f.MEDDIC_Score, 0) AS MEDDIC_Score,
  COALESCE(f.BANT_Score, 0) AS BANT_Score,

  -- Categóricas
  f.Fiscal_Q,
  f.Perfil_Cliente,
  f.Segmento,
  f.Portfolio,
  f.Familia_Produto,
  f.Qualidade_Engajamento,
  f.Gestao_Oportunidade,

  -- Agregações
  COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
  COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
  COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,
  COALESCE(vs.vendedor_win_rate, 0) AS vendedor_win_rate,

  COALESCE(ss.segmento_total_deals, 0) AS segmento_total_deals,
  COALESCE(ss.segmento_avg_ciclo, 0) AS segmento_avg_ciclo,
  COALESCE(ss.segmento_avg_gross, 0) AS segmento_avg_gross,
  COALESCE(ss.segmento_win_rate, 0) AS segmento_win_rate

FROM filtered f
LEFT JOIN vendedor_stats vs ON f.Vendedor = vs.Vendedor
LEFT JOIN segmento_stats ss ON f.Segmento = ss.Segmento;


-- 2) Aplicar o modelo no pipeline aberto (materializa para o dashboard)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_previsao_ciclo` AS
WITH pipeline_base AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Vendedor,
    SAFE_CAST(p.Gross AS FLOAT64) AS Gross,
    SAFE_CAST(p.Net AS FLOAT64) AS Net,
    p.Fiscal_Q,

    COALESCE(SAFE_CAST(p.Atividades AS INT64), 0) AS Atividades,
    CAST(NULL AS INT64) AS Ativ_7d,
    CAST(NULL AS INT64) AS Ativ_30d,
    CAST(NULL AS FLOAT64) AS Cadencia_Media_dias,

    CAST(NULL AS INT64) AS Total_Mudancas,
    CAST(NULL AS INT64) AS Mudancas_Criticas,
    CAST(NULL AS INT64) AS Mudancas_Close_Date,
    CAST(NULL AS INT64) AS Mudancas_Stage,
    CAST(NULL AS INT64) AS Mudancas_Valor,

    COALESCE(SAFE_CAST(p.MEDDIC_Score AS INT64), 0) AS MEDDIC_Score,
    COALESCE(SAFE_CAST(p.BANT_Score AS INT64), 0) AS BANT_Score,

    -- Categóricas: pipeline nem sempre tem todas
    p.Perfil AS Perfil_Cliente,
    p.Produtos AS Segmento,
    CAST(NULL AS STRING) AS Portfolio,
    CAST(NULL AS STRING) AS Familia_Produto,
    p.Qualidade_Engajamento,
    CAST(NULL AS STRING) AS Gestao_Oportunidade,

    -- Campos esperados pelo backend/dashboard
    SAFE_CAST(p.Confianca AS FLOAT64) AS Confianca_pct,
    SAFE_CAST(p.Idle_Dias AS INT64) AS Idle_Dias,
    SAFE_CAST(p.ultima_atualizacao AS TIMESTAMP) AS Ultima_Atualizacao

  FROM `sales_intelligence.pipeline` p
  WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
),
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS vendedor_avg_ciclo,
    AVG(SAFE_CAST(Atividades AS INT64)) AS vendedor_avg_atividades,
    SAFE_DIVIDE(SUM(CASE WHEN src='WON' THEN 1 ELSE 0 END), COUNT(*)) AS vendedor_win_rate
  FROM (
    SELECT Vendedor, Ciclo_dias, Atividades, 'WON' AS src FROM `sales_intelligence.closed_deals_won`
    UNION ALL
    SELECT Vendedor, Ciclo_dias, Atividades, 'LOST' AS src FROM `sales_intelligence.closed_deals_lost`
  )
  WHERE Vendedor IS NOT NULL AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  GROUP BY Vendedor
),
segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_deals,
    AVG(SAFE_CAST(Ciclo_dias AS INT64)) AS segmento_avg_ciclo,
    AVG(SAFE_CAST(Gross AS FLOAT64)) AS segmento_avg_gross,
    SAFE_DIVIDE(SUM(CASE WHEN src='WON' THEN 1 ELSE 0 END), COUNT(*)) AS segmento_win_rate
  FROM (
    SELECT Segmento, Ciclo_dias, Gross, 'WON' AS src FROM `sales_intelligence.closed_deals_won`
    UNION ALL
    SELECT Segmento, Ciclo_dias, Gross, 'LOST' AS src FROM `sales_intelligence.closed_deals_lost`
  )
  WHERE Segmento IS NOT NULL AND SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
  GROUP BY Segmento
),
features AS (
  SELECT
    pb.*,
    COALESCE(vs.vendedor_total_deals, 0) AS vendedor_total_deals,
    COALESCE(vs.vendedor_avg_ciclo, 0) AS vendedor_avg_ciclo,
    COALESCE(vs.vendedor_avg_atividades, 0) AS vendedor_avg_atividades,
    COALESCE(vs.vendedor_win_rate, 0) AS vendedor_win_rate,

    COALESCE(ss.segmento_total_deals, 0) AS segmento_total_deals,
    COALESCE(ss.segmento_avg_ciclo, 0) AS segmento_avg_ciclo,
    COALESCE(ss.segmento_avg_gross, 0) AS segmento_avg_gross,
    COALESCE(ss.segmento_win_rate, 0) AS segmento_win_rate
  FROM pipeline_base pb
  LEFT JOIN vendedor_stats vs ON pb.Vendedor = vs.Vendedor
  LEFT JOIN segmento_stats ss ON pb.Segmento = ss.Segmento
)
SELECT
  opportunity,
  Gross,
  Net,
  Vendedor,
  Fiscal_Q,

  CAST(predicted_Ciclo_dias AS INT64) AS dias_previstos,

  CASE
    WHEN predicted_Ciclo_dias <= 30 THEN 'RÁPIDO'
    WHEN predicted_Ciclo_dias <= 60 THEN 'NORMAL'
    WHEN predicted_Ciclo_dias <= 120 THEN 'LENTO'
    ELSE 'MUITO_LENTO'
  END AS velocidade_prevista,

  -- Contexto para UI/API
  Confianca_pct,
  Atividades,
  SAFE_CAST(MEDDIC_Score AS FLOAT64) AS MEDDIC_Score,
  SAFE_CAST(BANT_Score AS FLOAT64) AS BANT_Score,
  Idle_Dias,
  Ultima_Atualizacao

FROM ML.PREDICT(
  MODEL `sales_intelligence.ml_previsao_ciclo`,
  (
    SELECT
      -- chaves/colunas pass-through
      opportunity,
      Gross,
      Net,
      Vendedor,
      Fiscal_Q,

      -- features
      Atividades,
      Ativ_7d,
      Ativ_30d,
      Cadencia_Media_dias,
      Total_Mudancas,
      Mudancas_Criticas,
      Mudancas_Close_Date,
      Mudancas_Stage,
      Mudancas_Valor,
      MEDDIC_Score,
      BANT_Score,

      Perfil_Cliente,
      Segmento,
      Portfolio,
      Familia_Produto,
      Qualidade_Engajamento,
      Gestao_Oportunidade,

      vendedor_total_deals,
      vendedor_avg_ciclo,
      vendedor_avg_atividades,
      vendedor_win_rate,
      segmento_total_deals,
      segmento_avg_ciclo,
      segmento_avg_gross,
      segmento_win_rate,

      -- contexto
      Confianca_pct,
      Idle_Dias,
      Ultima_Atualizacao

    FROM features
  )
);
