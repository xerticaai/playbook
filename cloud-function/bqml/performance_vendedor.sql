-- ========================================================================
-- MODELO ML: Performance de Vendedor
-- Tipo: LINEAR_REG
-- Objetivo: Prever win rate esperado do vendedor no próximo quarter
-- ========================================================================

-- PASSO 1: Criar tabela de treinamento agregada por vendedor
-- ==================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.treino_performance_vendedor` AS
WITH vendedor_historico AS (
  SELECT
    Vendedor,
    
    -- Agregar deals por quarter (últimos 4 quarters)
    COUNT(*) AS total_deals,
    SUM(CASE WHEN Status = 'Won' THEN 1 ELSE 0 END) AS total_won,
    SUM(CASE WHEN Status = 'Lost' THEN 1 ELSE 0 END) AS total_lost,
    
    -- TARGET: Win rate histórico (%)
    ROUND(SUM(CASE WHEN Status = 'Won' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS target_win_rate,
    
    -- FEATURES: Qualidade média dos deals
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS avg_meddic_score,
    AVG(CAST(BANT_Score AS FLOAT64)) AS avg_bant_score,
    AVG(CAST(Atividades_Peso AS FLOAT64)) AS avg_atividades,
    
    -- FEATURES: Ciclo médio
    AVG(Ciclo_dias) AS avg_ciclo_dias,
    AVG(CASE WHEN Status = 'Won' THEN Ciclo_dias END) AS avg_ciclo_won,
    AVG(CASE WHEN Status = 'Lost' THEN Ciclo_dias END) AS avg_ciclo_lost,
    
    -- FEATURES: Valor médio
    AVG(CAST(Gross_Value AS FLOAT64)) AS avg_gross_value,
    AVG(CASE WHEN Status = 'Won' THEN CAST(Gross_Value AS FLOAT64) END) AS avg_gross_won,
    
    -- FEATURES: Segmentos atendidos (diversids segmentos)
    COUNT(DISTINCT Segmento) AS qtd_segmentos,
    
    -- FEATURES: Distribuição de fases finais
    SUM(CASE WHEN Fase_Atual IN ('Negotiation', 'Proposal', 'Closed Won') THEN 1 ELSE 0 END) AS deals_fase_final,
    
    -- FEATURES: Qualidade de engajamento
    AVG(CASE WHEN Status = 'Won' THEN CAST(Atividades_Peso AS FLOAT64) END) AS avg_atividades_won,
    AVG(CASE WHEN Status = 'Lost' THEN CAST(Atividades_Peso AS FLOAT64) END) AS avg_atividades_lost
    
  FROM 
    `operaciones-br.sales_intelligence.closed_deals`
  WHERE
    CAST(Gross_Value AS FLOAT64) > 0
    AND Vendedor IS NOT NULL
    AND Vendedor != ''
    -- Últimos 12 meses de dados
    AND CAST(Close_Date AS DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
  GROUP BY
    Vendedor
  HAVING
    COUNT(*) >= 5 -- Mínimo 5 deals para ter significância estatística
),
current_pipeline AS (
  -- Combina com pipeline atual para prever performance futura
  SELECT
    Vendedor,
    COUNT(*) AS pipeline_atual_deals,
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS pipeline_avg_meddic,
    AVG(CAST(BANT_Score AS FLOAT64)) AS pipeline_avg_bant,
    SUM(CAST(Gross AS FLOAT64)) AS pipeline_total_value
  FROM
    `operaciones-br.sales_intelligence.pipeline`
  WHERE
    Gross > 0
    AND Vendedor IS NOT NULL
  GROUP BY
    Vendedor
)
SELECT
  h.*,
  COALESCE(p.pipeline_atual_deals, 0) AS pipeline_atual_deals,
  COALESCE(p.pipeline_avg_meddic, 0) AS pipeline_avg_meddic,
  COALESCE(p.pipeline_avg_bant, 0) AS pipeline_avg_bant,
  COALESCE(p.pipeline_total_value, 0) AS pipeline_total_value
FROM
  vendedor_historico h
LEFT JOIN
  current_pipeline p
ON
  h.Vendedor = p.Vendedor;


-- PASSO 2: Treinar modelo de Performance de Vendedor
-- ===================================================
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.performance_vendedor_model`
OPTIONS(
  model_type='LINEAR_REG',
  input_label_cols=['target_win_rate'],
  
  -- Regularização para evitar overfitting
  l1_reg=0.1,
  l2_reg=0.1,
  
  -- Métricas
  enable_global_explain=TRUE,
  model_registry='vertex_ai'
) AS
SELECT
  *
FROM
  `operaciones-br.sales_intelligence.treino_performance_vendedor`;


-- PASSO 3: Avaliar modelo (R², MAE, RMSE)
-- ========================================
SELECT
  *
FROM
  ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.performance_vendedor_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_performance_vendedor`)
  );


-- PASSO 4: Gerar predições para vendedores ativos
-- ================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_performance_vendedor` AS
WITH vendedor_stats AS (
  -- Calcula stats atuais de cada vendedor
  SELECT
    Vendedor,
    COUNT(*) AS total_deals,
    SUM(CASE WHEN Status = 'Won' THEN 1 ELSE 0 END) AS total_won,
    SUM(CASE WHEN Status = 'Lost' THEN 1 ELSE 0 END) AS total_lost,
    ROUND(SUM(CASE WHEN Status = 'Won' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS win_rate_atual,
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS avg_meddic_score,
    AVG(CAST(BANT_Score AS FLOAT64)) AS avg_bant_score,
    AVG(CAST(Atividades_Peso AS FLOAT64)) AS avg_atividades,
    AVG(Ciclo_dias) AS avg_ciclo_dias,
    AVG(CASE WHEN Status = 'Won' THEN Ciclo_dias END) AS avg_ciclo_won,
    AVG(CASE WHEN Status = 'Lost' THEN Ciclo_dias END) AS avg_ciclo_lost,
    AVG(CAST(Gross AS FLOAT64)) AS avg_gross_value,
    AVG(CASE WHEN Status = 'Won' THEN CAST(Gross AS FLOAT64) END) AS avg_gross_won,
    COUNT(DISTINCT Segmento) AS qtd_segmentos,
    SUM(CASE WHEN Fase_Atual IN ('Negotiation', 'Proposal', 'Closed Won') THEN 1 ELSE 0 END) AS deals_fase_final,
    AVG(CASE WHEN Status = 'Won' THEN CAST(Atividades_Peso AS FLOAT64) END) AS avg_atividades_won,
    AVG(CASE WHEN Status = 'Lost' THEN CAST(Atividades_Peso AS FLOAT64) END) AS avg_atividades_lost
  FROM 
    `operaciones-br.sales_intelligence.closed_deals`
  WHERE
    Gross > 0
    AND Vendedor IS NOT NULL
    AND CAST(Close_Date AS DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
  GROUP BY
    Vendedor
),
pipeline_atual AS (
  SELECT
    Vendedor,
    COUNT(*) AS pipeline_atual_deals,
    AVG(CAST(MEDDIC_Score AS FLOAT64)) AS pipeline_avg_meddic,
    AVG(CAST(BANT_Score AS FLOAT64)) AS pipeline_avg_bant,
    SUM(CAST(Gross AS FLOAT64)) AS pipeline_total_value
  FROM
    `operaciones-br.sales_intelligence.pipeline`
  WHERE
    Gross > 0
    AND Vendedor IS NOT NULL
  GROUP BY
    Vendedor
),
predictions AS (
  SELECT
    s.Vendedor,
    s.win_rate_atual,
    s.total_deals AS deals_historicos,
    p.pipeline_atual_deals,
    p.pipeline_total_value,
    
    -- Predição do modelo
    pred.predicted_target_win_rate AS win_rate_previsto,
    
    -- Diferença entre previsto e atual
    pred.predicted_target_win_rate - s.win_rate_atual AS delta_performance,
    
    -- Total previsto de vendas no quarter
    ROUND((p.pipeline_total_value * pred.predicted_target_win_rate) / 100, 2) AS valor_previsto_venda,
    
    -- Features para análise
    s.avg_meddic_score,
    s.avg_bant_score,
    s.avg_atividades,
    s.avg_ciclo_dias,
    s.avg_ciclo_won
    
  FROM
    vendedor_stats s
  LEFT JOIN
    pipeline_atual p
  ON
    s.Vendedor = p.Vendedor
  
  CROSS JOIN
    ML.PREDICT(MODEL `operaciones-br.sales_intelligence.performance_vendedor_model`,
      (
        SELECT
          total_deals,
          total_won,
          total_lost,
          avg_meddic_score,
          avg_bant_score,
          avg_atividades,
          avg_ciclo_dias,
          avg_ciclo_won,
          avg_ciclo_lost,
          avg_gross_value,
          avg_gross_won,
          qtd_segmentos,
          deals_fase_final,
          avg_atividades_won,
          avg_atividades_lost,
          COALESCE(p.pipeline_atual_deals, 0) AS pipeline_atual_deals,
          COALESCE(p.pipeline_avg_meddic, 0) AS pipeline_avg_meddic,
          COALESCE(p.pipeline_avg_bant, 0) AS pipeline_avg_bant,
          COALESCE(p.pipeline_total_value, 0) AS pipeline_total_value
        FROM
          vendedor_stats
        WHERE
          Vendedor = s.Vendedor
      )
    ) pred
  
  WHERE
    p.pipeline_atual_deals > 0 -- Apenas vendedores com pipeline ativo
)
SELECT
  *,
  
  -- Classificação de performance
  CASE
    WHEN delta_performance >= 10 THEN 'SOBRE_PERFORMANDO' -- Esperado ganhar +10% a mais
    WHEN delta_performance >= 5 THEN 'BOM_DESEMPENHO'
    WHEN delta_performance >= -5 THEN 'ESPERADO'
    WHEN delta_performance >= -10 THEN 'ABAIXO_ESPERADO'
    ELSE 'SUB_PERFORMANDO' -- Esperado ganhar -10% menos
  END AS classificacao,
  
  -- Ação recomendada
  CASE
    WHEN delta_performance >= 10 THEN '🌟 Excelente! Reconhecer e compartilhar práticas'
    WHEN delta_performance >= 5 THEN '✅ Bom trabalho, manter foco'
    WHEN delta_performance >= -5 THEN '➡️ Performance esperada, seguir ritmo'
    WHEN delta_performance >= -10 THEN '⚠️ Coaching 1:1, identificar gaps'
    ELSE '🚨 Plano de ação urgente, suporte intensivo'
  END AS acao_recomendada,
  
  -- Ranking (1 = melhor)
  ROW_NUMBER() OVER (ORDER BY win_rate_previsto DESC, valor_previsto_venda DESC) AS ranking

FROM
  predictions;


-- PASSO 5: Ver ranking de vendedores
-- ===================================
-- Top 10 vendedores (melhor performance prevista)
SELECT
  ranking,
  Vendedor,
  ROUND(win_rate_atual, 1) AS win_rate_atual_pct,
  ROUND(win_rate_previsto, 1) AS win_rate_previsto_pct,
  ROUND(delta_performance, 1) AS delta_pct,
  classificacao,
  pipeline_atual_deals,
  ROUND(pipeline_total_value / 1000, 1) AS pipeline_k,
  ROUND(valor_previsto_venda / 1000, 1) AS prev_venda_k,
  acao_recomendada
FROM
  `operaciones-br.sales_intelligence.pipeline_performance_vendedor`
WHERE
  ranking <= 10
ORDER BY
  ranking;

-- Bottom 10 vendedores (precisam de coaching)
SELECT
  ranking,
  Vendedor,
  ROUND(win_rate_atual, 1) AS win_rate_atual_pct,
  ROUND(win_rate_previsto, 1) AS win_rate_previsto_pct,
  ROUND(delta_performance, 1) AS delta_pct,
  classificacao,
  pipeline_atual_deals,
  acao_recomendada
FROM
  `operaciones-br.sales_intelligence.pipeline_performance_vendedor`
ORDER BY
  ranking DESC
LIMIT 10;
