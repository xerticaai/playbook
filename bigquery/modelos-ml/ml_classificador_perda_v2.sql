-- ============================================================================
-- MODELO 2: Classificador de Causa de Perda (MULTICLASS)
-- ============================================================================
-- OBJETIVO: Classificar causas de perda usando BQML com dados enriquecidos
-- TIPO: BOOSTED_TREE_CLASSIFIER (multiclass)
-- INPUT: closed_deals_lost (tabela enriquecida)
-- OUTPUT: Predição de Causa_Raiz (5 categorias)
-- ============================================================================

CREATE OR REPLACE MODEL `sales_intelligence.ml_classificador_perda_v2`
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

-- ============================================================================
-- 1. PREPARAÇÃO: Categorizar causas de perda
-- ============================================================================
WITH categorized_losses AS (
  SELECT
    Oportunidade,
    Vendedor,
    Perfil_Cliente,
    Segmento,
    Portfolio,
    Familia_Produto,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    Fiscal_Q,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    
    -- Análise IA
    Causa_Raiz,
    Resumo_Analise,
    Causas_Secundarias,
    Tipo_Resultado,
    Evitavel,
    Sinais_Alerta,
    Momento_Critico,
    
    -- Qualidade gestão (NÃO EXISTE EM LOST)
    CAST(NULL AS STRING) AS Qualidade_Engajamento,
    
    -- Métricas atividade
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Ativ_7d AS INT64) AS Ativ_7d,
    SAFE_CAST(Ativ_30d AS INT64) AS Ativ_30d,
    SAFE_CAST(Cadencia_Media_dias AS FLOAT64) AS Cadencia_Media_dias,
    
    -- Métricas mudanças
    SAFE_CAST(Total_Mudancas AS INT64) AS Total_Mudancas,
    SAFE_CAST(Mudancas_Criticas AS INT64) AS Mudancas_Criticas,
    SAFE_CAST(Mudancas_Close_Date AS INT64) AS Mudancas_Close_Date,
    SAFE_CAST(Mudancas_Stage AS INT64) AS Mudancas_Stage,
    SAFE_CAST(Mudancas_Valor AS INT64) AS Mudancas_Valor,
    
    -- CATEGORIZAÇÃO: Mapear Tipo_Resultado para 5 categorias
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
    
    -- Features adicionais
    COALESCE(SAFE_CAST(Ativ_7d AS INT64), 0) AS ativ_7d_filled,
    COALESCE(SAFE_CAST(Ativ_30d AS INT64), 0) AS ativ_30d_filled,
    COALESCE(SAFE_CAST(Cadencia_Media_dias AS FLOAT64), 0) AS cadencia_filled,
    
    -- Flag de abandono (>90 dias sem atividade)
    CASE
      WHEN SAFE_CAST(Cadencia_Media_dias AS FLOAT64) > 90 THEN 1
      WHEN SAFE_CAST(Ativ_30d AS INT64) = 0 THEN 1
      ELSE 0
    END AS flag_abandono,
    
    -- Flag de má qualificação (poucas atividades + ciclo longo)
    CASE
      WHEN SAFE_CAST(Atividades AS INT64) < 3 AND SAFE_CAST(Ciclo_dias AS INT64) > 90 THEN 1
      ELSE 0
    END AS flag_ma_qualificacao,
    
    -- Score de qualidade engajamento (NÃO EXISTE EM LOST, sempre 0)
    0 AS score_qualidade_engajamento
    
  FROM `sales_intelligence.closed_deals_lost`
  WHERE Tipo_Resultado IS NOT NULL
    AND Causa_Raiz IS NOT NULL
    AND Ciclo_dias IS NOT NULL
    AND Atividades IS NOT NULL
),

-- ============================================================================
-- 2. AGREGAÇÃO: Features por vendedor e segmento
-- ============================================================================
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_perdas,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades,
    AVG(score_qualidade_engajamento) AS vendedor_avg_engajamento
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

-- ============================================================================
-- 3. DATASET FINAL: Join de features
-- ============================================================================
SELECT
  -- LABEL (target)
  cl.categoria_perda,
  
  -- Features Deal
  cl.Gross,
  cl.Net,
  cl.Ciclo_dias,
  cl.Atividades,
  cl.ativ_7d_filled AS Ativ_7d,
  cl.ativ_30d_filled AS Ativ_30d,
  cl.cadencia_filled AS Cadencia_Media,
  cl.Total_Mudancas,
  cl.Mudancas_Criticas,
  cl.Mudancas_Close_Date,
  cl.Mudancas_Stage,
  cl.Mudancas_Valor,
  
  -- Features Qualitativas (flags)
  cl.flag_abandono,
  cl.flag_ma_qualificacao,
  cl.score_qualidade_engajamento,
  
  -- Features Vendedor
  vs.vendedor_total_perdas,
  vs.vendedor_avg_ciclo,
  vs.vendedor_avg_atividades,
  vs.vendedor_avg_engajamento,
  
  -- Features Segmento
  ss.segmento_total_perdas,
  ss.segmento_avg_ciclo,
  ss.segmento_avg_gross,
  
  -- Features Categóricas
  cl.Segmento,
  cl.Portfolio,
  cl.Familia_Produto,
  cl.Fiscal_Q,
  
  -- Evitável (indicador adicional)
  CASE cl.Evitavel
    WHEN 'SIM' THEN 1
    WHEN 'PARCIALMENTE' THEN 0.5
    ELSE 0
  END AS score_evitavel

FROM categorized_losses cl
LEFT JOIN vendedor_stats vs ON cl.Vendedor = vs.Vendedor
LEFT JOIN segmento_stats ss ON cl.Segmento = ss.Segmento
WHERE cl.categoria_perda != 'OUTROS';

-- ============================================================================
-- RESULTADO: Modelo treinado para 5 categorias
-- Próximo passo: Avaliar precisão com ML.EVALUATE
-- ============================================================================
