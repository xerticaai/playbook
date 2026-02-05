-- ============================================================================
-- MODELO 4: PERFORMANCE DO VENDEDOR
-- ============================================================================
-- Tipo: LINEAR_REG
-- Objetivo: Prever win rate do vendedor baseado no comportamento atual
-- Output: win_rate_previsto, delta_performance, classificação, ranking
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_performance_vendedor.sql
-- ============================================================================

-- 1. Criar tabela de treino (histórico de vendedores)
CREATE OR REPLACE TABLE `sales_intelligence.treino_performance_vendedor` AS
WITH vendedor_historico AS (
  SELECT
    Vendedor,
    
    -- Métricas de performance (últimos 90 dias)
    COUNT(*) AS total_deals,
    SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) AS won_deals,
    SUM(CASE WHEN outcome = 'LOST' THEN 1 ELSE 0 END) AS lost_deals,
    
    -- Win rate real (target)
    SAFE_DIVIDE(
      SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END),
      COUNT(*)
    ) * 100 AS win_rate_real,
    
    -- Features: comportamento do vendedor
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS avg_meddic,
    AVG(CAST(BANT_Score AS FLOAT64)) AS avg_bant,
    AVG(CAST(Atividades AS INT64)) AS avg_atividades,
    AVG(CAST(Qtd_Reunioes AS INT64)) AS avg_reunioes,
    AVG(CAST(Qtd_Emails AS INT64)) AS avg_emails,
    AVG(CAST(Cycle_Days AS INT64)) AS avg_cycle_days,
    AVG(CAST(Idle_Days AS INT64)) AS avg_idle_days,
    AVG(CAST(Red_Flags AS INT64)) AS avg_red_flags,
    AVG(CAST(Yellow_Flags AS INT64)) AS avg_yellow_flags,
    
    -- Valor médio de deals
    AVG(Gross_Value) AS avg_deal_value,
    
    -- Diversidade de segmentos
    COUNT(DISTINCT Segmento) AS qtd_segmentos
    
  FROM `sales_intelligence.closed_deals`
  WHERE 
    Vendedor IS NOT NULL
    AND outcome IN ('WON', 'LOST')
    AND Close_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)  -- Últimos 6 meses
  GROUP BY Vendedor
  HAVING total_deals >= 5  -- Mínimo de deals para análise
)
SELECT * FROM vendedor_historico
WHERE win_rate_real IS NOT NULL;

-- 2. Treinar modelo LINEAR_REG
CREATE OR REPLACE MODEL `sales_intelligence.modelo_performance_vendedor`
OPTIONS(
  model_type='LINEAR_REG',
  input_label_cols=['win_rate_real'],
  optimize_strategy='NORMAL',
  l1_reg=0.1,
  l2_reg=0.1,
  max_iterations=50,
  learn_rate_strategy='LINE_SEARCH',
  early_stop=TRUE,
  min_rel_progress=0.01,
  data_split_method='AUTO_SPLIT',
  data_split_eval_fraction=0.2
) AS
SELECT
  -- Features
  avg_meddic,
  avg_bant,
  avg_atividades,
  avg_reunioes,
  avg_emails,
  avg_cycle_days,
  avg_idle_days,
  avg_red_flags,
  avg_yellow_flags,
  avg_deal_value,
  qtd_segmentos,
  total_deals,
  
  -- Target
  win_rate_real
FROM `sales_intelligence.treino_performance_vendedor`;

-- 3. Avaliar modelo (métricas)
SELECT
  'PERFORMANCE_VENDEDOR' AS modelo,
  mean_absolute_error,
  mean_squared_error,
  median_absolute_error,
  r2_score,
  explained_variance
FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_performance_vendedor`);

-- 4. Criar tabela de predições (vendedores ATIVOS no pipeline)
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_performance_vendedor` AS
WITH vendedor_atual AS (
  SELECT
    Vendedor,
    
    -- Métricas atuais do pipeline
    COUNT(*) AS deals_pipeline,
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS avg_meddic,
    AVG(CAST(BANT_Score AS FLOAT64)) AS avg_bant,
    AVG(CAST(Atividades AS INT64)) AS avg_atividades,
    AVG(CAST(Qtd_Reunioes AS INT64)) AS avg_reunioes,
    AVG(CAST(Qtd_Emails AS INT64)) AS avg_emails,
    AVG(CAST(Cycle_Days AS INT64)) AS avg_cycle_days,
    AVG(CAST(Idle_Days AS INT64)) AS avg_idle_days,
    AVG(CAST(Red_Flags AS INT64)) AS avg_red_flags,
    AVG(CAST(Yellow_Flags AS INT64)) AS avg_yellow_flags,
    AVG(Gross_Value) AS avg_deal_value,
    COUNT(DISTINCT Segmento) AS qtd_segmentos,
    SUM(Gross_Value) AS total_pipeline_value
    
  FROM `sales_intelligence.pipeline`
  WHERE Vendedor IS NOT NULL
  GROUP BY Vendedor
),
vendedor_historico AS (
  SELECT
    Vendedor,
    COUNT(*) AS total_deals,
    SAFE_DIVIDE(
      SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END),
      COUNT(*)
    ) * 100 AS win_rate_historico,
    AVG(CASE WHEN outcome = 'WON' THEN CAST(Cycle_Days AS INT64) END) AS avg_cycle_won
  FROM `sales_intelligence.closed_deals`
  WHERE 
    Vendedor IS NOT NULL
    AND outcome IN ('WON', 'LOST')
    AND Close_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
  GROUP BY Vendedor
)
SELECT
  va.Vendedor,
  
  -- Predição do modelo
  pred.predicted_win_rate_real AS win_rate_previsto,
  
  -- Delta de performance (previsto vs histórico)
  pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) AS delta_performance,
  
  -- Valor previsto de vendas (pipeline × win rate previsto)
  va.total_pipeline_value * (pred.predicted_win_rate_real / 100) AS valor_previsto_venda,
  
  -- Classificação de performance
  CASE
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) > 10 THEN 'SOBRE_PERFORMANDO'
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) > 5 THEN 'PERFORMANDO_BEM'
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) >= -5 THEN 'NA_META'
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) >= -10 THEN 'ABAIXO_META'
    ELSE 'SUB_PERFORMANDO'
  END AS classificacao,
  
  -- Ação recomendada
  CASE
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) < -10 
      THEN 'URGENTE: 1-on-1 com manager, revisar pipeline, coaching intensivo'
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) < -5 
      THEN 'IMPORTANTE: Revisar qualidade dos deals, reforçar MEDDIC/BANT'
    WHEN pred.predicted_win_rate_real - COALESCE(vh.win_rate_historico, 0) > 10 
      THEN 'RECONHECER: Compartilhar best practices, considerar expansão de território'
    ELSE 'MANTER: Continuar cadência atual, monitorar resultados'
  END AS acao_recomendada,
  
  -- Ranking (1 = melhor performando)
  RANK() OVER (ORDER BY pred.predicted_win_rate_real DESC) AS ranking,
  
  -- Contexto para análise
  va.deals_pipeline,
  vh.win_rate_historico,
  va.avg_meddic,
  va.avg_bant,
  va.avg_cycle_won AS avg_cycle_won,
  va.total_pipeline_value
  
FROM vendedor_atual va
LEFT JOIN vendedor_historico vh ON va.Vendedor = vh.Vendedor
JOIN ML.PREDICT(
  MODEL `sales_intelligence.modelo_performance_vendedor`,
  (SELECT * FROM vendedor_atual)
) pred
ON TRUE;

-- 5. Análise de importância das features
SELECT
  feature,
  importance,
  RANK() OVER (ORDER BY importance DESC) AS rank
FROM ML.FEATURE_IMPORTANCE(MODEL `sales_intelligence.modelo_performance_vendedor`)
ORDER BY importance DESC
LIMIT 20;

-- 6. Estatísticas das predições
SELECT
  classificacao,
  COUNT(*) AS sellers_count,
  AVG(win_rate_previsto) AS avg_win_rate,
  AVG(delta_performance) AS avg_delta,
  SUM(valor_previsto_venda) AS total_valor_previsto
FROM `sales_intelligence.pipeline_performance_vendedor`
GROUP BY classificacao
ORDER BY 
  CASE classificacao
    WHEN 'SOBRE_PERFORMANDO' THEN 1
    WHEN 'PERFORMANDO_BEM' THEN 2
    WHEN 'NA_META' THEN 3
    WHEN 'ABAIXO_META' THEN 4
    WHEN 'SUB_PERFORMANDO' THEN 5
  END;

-- 7. Top performers (para dashboard)
SELECT
  Vendedor,
  win_rate_previsto,
  delta_performance,
  classificacao,
  ranking,
  deals_pipeline,
  total_pipeline_value,
  valor_previsto_venda
FROM `sales_intelligence.pipeline_performance_vendedor`
ORDER BY win_rate_previsto DESC
LIMIT 10;

-- 8. Underperformers (necessitam atenção)
SELECT
  Vendedor,
  win_rate_previsto,
  delta_performance,
  classificacao,
  acao_recomendada,
  deals_pipeline,
  avg_meddic,
  avg_bant
FROM `sales_intelligence.pipeline_performance_vendedor`
WHERE classificacao IN ('SUB_PERFORMANDO', 'ABAIXO_META')
ORDER BY delta_performance ASC;
