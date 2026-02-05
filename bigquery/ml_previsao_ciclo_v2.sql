-- ============================================================================
-- MODELO 1: Previsão de Ciclo de Vendas (REGRESSION)
-- ============================================================================
-- OBJETIVO: Prever tempo de ciclo usando dados enriquecidos de WON e LOST
-- TIPO: BOOSTED_TREE_REGRESSOR
-- INPUT: closed_deals_won + closed_deals_lost (união)
-- OUTPUT: Predição de Ciclo_dias
-- ============================================================================

CREATE OR REPLACE MODEL `sales_intelligence.ml_previsao_ciclo_v2`
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

-- ============================================================================
-- 1. UNIÃO: Ganhas + Perdidas (campos compatíveis)
-- ============================================================================
WITH all_closed_deals AS (
  -- Deals ganhos
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
    'WON' AS outcome,
    
    -- Análise IA
    Causa_Raiz,
    Resumo_Analise,
    Tipo_Resultado,
    Licoes_Aprendidas,
    
    -- Qualidade gestão
    Qualidade_Engajamento,
    Gestao_Oportunidade,
    
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
    
    -- Específicos de ganhas
    Fatores_Sucesso AS analise_especifica,
    NULL AS Evitavel,
    NULL AS Sinais_Alerta
    
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL  -- Filtrar valores inválidos
  
  UNION ALL
  
  -- Deals perdidos
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
    'LOST' AS outcome,
    
    -- Análise IA
    Causa_Raiz,
    Resumo_Analise,
    Tipo_Resultado,
    Licoes_Aprendidas,
    
    -- Qualidade gestão (NÃO EXISTEM EM LOST)
    NULL AS Qualidade_Engajamento,
    NULL AS Gestao_Oportunidade,
    
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
    
    -- Específicos de perdidas
    Causas_Secundarias AS analise_especifica,
    Evitavel,
    Sinais_Alerta
    
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL  -- Filtrar valores inválidos
),

-- ============================================================================
-- 2. FEATURES: Criar variáveis numéricas
-- ============================================================================
enriched_features AS (
  SELECT
    *,
    
    -- Score de qualidade engajamento
    CASE Qualidade_Engajamento
      WHEN 'EXCELENTE' THEN 4
      WHEN 'BOM' THEN 3
      WHEN 'MODERADO' THEN 2
      WHEN 'FRACO' THEN 1
      ELSE 0
    END AS score_qualidade_engajamento,
    
    -- Score de gestão oportunidade
    CASE Gestao_Oportunidade
      WHEN 'EXCELENTE' THEN 4
      WHEN 'PROATIVA' THEN 3
      WHEN 'REATIVA' THEN 2
      WHEN 'NEGLIGENTE' THEN 1
      ELSE 0
    END AS score_gestao,
    
    -- Flags de risco
    CASE
      WHEN Cadencia_Media_dias > 60 THEN 1
      WHEN Ativ_30d = 0 THEN 1
      ELSE 0
    END AS flag_baixa_cadencia,
    
    CASE
      WHEN Mudancas_Criticas > 3 THEN 1
      ELSE 0
    END AS flag_mudancas_criticas,
    
    CASE
      WHEN Atividades < 3 THEN 1
      ELSE 0
    END AS flag_poucas_atividades,
    
    -- Razão atividades recentes
    SAFE_DIVIDE(Ativ_7d, NULLIF(Ativ_30d, 0)) AS razao_atividade_recente,
    
    -- Velocidade de atividades
    SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0)) AS atividades_por_dia,
    
    -- Intensidade de mudanças
    SAFE_DIVIDE(Total_Mudancas, NULLIF(Ciclo_dias, 0)) AS mudancas_por_dia
    
  FROM all_closed_deals
  WHERE Ciclo_dias IS NOT NULL
    AND Ciclo_dias > 0
    AND Ciclo_dias < 730  -- Excluir outliers > 2 anos
    AND Atividades IS NOT NULL
    AND Gross IS NOT NULL
),

-- ============================================================================
-- 3. AGREGAÇÕES: Features por vendedor e segmento
-- ============================================================================
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades,
    AVG(score_qualidade_engajamento) AS vendedor_avg_engajamento,
    SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) / COUNT(*) AS vendedor_win_rate
  FROM enriched_features
  GROUP BY Vendedor
),

segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_deals,
    AVG(Ciclo_dias) AS segmento_avg_ciclo,
    AVG(Gross) AS segmento_avg_gross,
    SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) / COUNT(*) AS segmento_win_rate
  FROM enriched_features
  GROUP BY Segmento
)

-- ============================================================================
-- 4. DATASET FINAL: Join de features
-- ============================================================================
SELECT
  -- LABEL (target)
  ef.Ciclo_dias,
  
  -- Features Deal
  ef.Gross,
  ef.Net,
  ef.Atividades,
  IFNULL(ef.Ativ_7d, 0) AS Ativ_7d,
  IFNULL(ef.Ativ_30d, 0) AS Ativ_30d,
  IFNULL(ef.Cadencia_Media_dias, 0) AS Cadencia_Media,
  IFNULL(ef.Total_Mudancas, 0) AS Total_Mudancas,
  IFNULL(ef.Mudancas_Criticas, 0) AS Mudancas_Criticas,
  IFNULL(ef.Mudancas_Close_Date, 0) AS Mudancas_Close_Date,
  IFNULL(ef.Mudancas_Stage, 0) AS Mudancas_Stage,
  IFNULL(ef.Mudancas_Valor, 0) AS Mudancas_Valor,
  
  -- Features Qualitativas (scores)
  ef.score_qualidade_engajamento,
  IFNULL(ef.score_gestao, 0) AS score_gestao,
  
  -- Features Flags
  ef.flag_baixa_cadencia,
  ef.flag_mudancas_criticas,
  ef.flag_poucas_atividades,
  
  -- Features Calculadas
  IFNULL(ef.razao_atividade_recente, 0) AS razao_atividade_recente,
  IFNULL(ef.atividades_por_dia, 0) AS atividades_por_dia,
  IFNULL(ef.mudancas_por_dia, 0) AS mudancas_por_dia,
  
  -- Features Vendedor
  vs.vendedor_total_deals,
  vs.vendedor_avg_ciclo,
  vs.vendedor_avg_atividades,
  vs.vendedor_avg_engajamento,
  vs.vendedor_win_rate,
  
  -- Features Segmento
  ss.segmento_total_deals,
  ss.segmento_avg_ciclo,
  ss.segmento_avg_gross,
  ss.segmento_win_rate,
  
  -- Features Categóricas
  ef.Segmento,
  ef.Portfolio,
  ef.Familia_Produto,
  ef.Fiscal_Q,
  ef.outcome,
  ef.Tipo_Resultado

FROM enriched_features ef
LEFT JOIN vendedor_stats vs ON ef.Vendedor = vs.Vendedor
LEFT JOIN segmento_stats ss ON ef.Segmento = ss.Segmento;

-- ============================================================================
-- RESULTADO: Modelo treinado para prever Ciclo_dias
-- Próximo passo: Aplicar em pipeline aberto com ML.PREDICT
-- ============================================================================
