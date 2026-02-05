-- ============================================================================
-- MODELO 3: Previsão de Risco de Abandono (BINARY CLASSIFICATION)
-- ============================================================================
-- OBJETIVO: Identificar deals em risco de abandono no pipeline
-- TIPO: BOOSTED_TREE_CLASSIFIER (binary)
-- INPUT: Histórico de closed_deals + features de abandono
-- OUTPUT: Risco (ALTO/MÉDIO/BAIXO), probabilidade, fatores
-- ============================================================================

CREATE OR REPLACE MODEL `sales_intelligence.ml_risco_abandono_v2`
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

-- ============================================================================
-- 1. PREPARAÇÃO: Definir o que é "abandono" no histórico
-- ============================================================================
WITH historical_deals AS (
  -- Deals perdidos (já são abandono se Tipo_Resultado = ABANDONO)
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
    
    -- LABEL: Foi abandonado?
    CASE
      WHEN Tipo_Resultado = 'ABANDONO' THEN 1
      WHEN Tipo_Resultado = 'MA_QUALIFICACAO' AND SAFE_CAST(Atividades AS INT64) < 3 THEN 1
      ELSE 0
    END AS foi_abandonado,
    
    Tipo_Resultado
    
  FROM `sales_intelligence.closed_deals_lost`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND SAFE_CAST(Atividades AS INT64) IS NOT NULL
    AND Tipo_Resultado IS NOT NULL
  
  UNION ALL
  
  -- Deals ganhos (nunca são abandono)
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
    
    -- LABEL: Deals ganhos nunca são abandono
    0 AS foi_abandonado,
    
    Tipo_Resultado
    
  FROM `sales_intelligence.closed_deals_won`
  WHERE SAFE_CAST(Ciclo_dias AS INT64) IS NOT NULL
    AND SAFE_CAST(Atividades AS INT64) IS NOT NULL
    AND Tipo_Resultado IS NOT NULL
),

-- ============================================================================
-- 2. FEATURES: Criar indicadores de risco
-- ============================================================================
enriched_features AS (
  SELECT
    *,
    
    -- Flag de inatividade (cadência alta)
    CASE
      WHEN Cadencia_Media_dias > 90 THEN 1
      WHEN Cadencia_Media_dias > 60 THEN 0.5
      ELSE 0
    END AS flag_inatividade,
    
    -- Flag de baixo engajamento (poucas atividades)
    CASE
      WHEN Atividades < 3 THEN 1
      WHEN Atividades < 5 THEN 0.5
      ELSE 0
    END AS flag_baixo_engajamento,
    
    -- Flag de atividades recentes zeradas
    CASE
      WHEN Ativ_7d = 0 THEN 1
      WHEN Ativ_30d = 0 THEN 0.7
      ELSE 0
    END AS flag_sem_atividade_recente,
    
    -- Flag de mudanças excessivas (instabilidade)
    CASE
      WHEN Mudancas_Criticas > 5 THEN 1
      WHEN Mudancas_Criticas > 3 THEN 0.5
      ELSE 0
    END AS flag_instavel,
    
    -- Flag de mudanças de close date (postergação)
    CASE
      WHEN Mudancas_Close_Date > 3 THEN 1
      WHEN Mudancas_Close_Date > 1 THEN 0.5
      ELSE 0
    END AS flag_postergacao,
    
    -- Velocidade de atividades (atividades por dia)
    SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0)) AS velocidade_atividades,
    
    -- Razão atividades recentes
    SAFE_DIVIDE(Ativ_7d, NULLIF(Ativ_30d, 0)) AS razao_atividade_recente,
    
    -- Score composto de risco (soma flags)
    CASE
      WHEN Cadencia_Media_dias > 90 THEN 1 ELSE 0
    END +
    CASE
      WHEN Ativ_30d = 0 THEN 1 ELSE 0
    END +
    CASE
      WHEN Atividades < 3 THEN 1 ELSE 0
    END +
    CASE
      WHEN Mudancas_Criticas > 3 THEN 1 ELSE 0
    END AS score_risco_composto
    
  FROM historical_deals
),

-- ============================================================================
-- 3. AGREGAÇÕES: Stats por vendedor e segmento
-- ============================================================================
vendedor_stats AS (
  SELECT
    Vendedor,
    COUNT(*) AS vendedor_total_deals,
    AVG(Ciclo_dias) AS vendedor_avg_ciclo,
    AVG(Atividades) AS vendedor_avg_atividades,
    SUM(CASE WHEN foi_abandonado = 1 THEN 1 ELSE 0 END) / COUNT(*) AS vendedor_taxa_abandono
  FROM enriched_features
  GROUP BY Vendedor
),

segmento_stats AS (
  SELECT
    Segmento,
    COUNT(*) AS segmento_total_deals,
    AVG(Ciclo_dias) AS segmento_avg_ciclo,
    SUM(CASE WHEN foi_abandonado = 1 THEN 1 ELSE 0 END) / COUNT(*) AS segmento_taxa_abandono
  FROM enriched_features
  GROUP BY Segmento
)

-- ============================================================================
-- 4. DATASET FINAL: Join de features
-- ============================================================================
SELECT
  -- LABEL (target)
  ef.foi_abandonado,
  
  -- Features Deal
  ef.Gross,
  ef.Net,
  ef.Ciclo_dias,
  ef.Atividades,
  COALESCE(ef.Ativ_7d, 0) AS Ativ_7d,
  COALESCE(ef.Ativ_30d, 0) AS Ativ_30d,
  COALESCE(ef.Cadencia_Media_dias, 0) AS Cadencia_Media,
  COALESCE(ef.Total_Mudancas, 0) AS Total_Mudancas,
  COALESCE(ef.Mudancas_Criticas, 0) AS Mudancas_Criticas,
  COALESCE(ef.Mudancas_Close_Date, 0) AS Mudancas_Close_Date,
  COALESCE(ef.Mudancas_Stage, 0) AS Mudancas_Stage,
  
  -- Features Flags
  ef.flag_inatividade,
  ef.flag_baixo_engajamento,
  ef.flag_sem_atividade_recente,
  ef.flag_instavel,
  ef.flag_postergacao,
  ef.score_risco_composto,
  
  -- Features Calculadas
  COALESCE(ef.velocidade_atividades, 0) AS velocidade_atividades,
  COALESCE(ef.razao_atividade_recente, 0) AS razao_atividade_recente,
  
  -- Features Vendedor
  vs.vendedor_total_deals,
  vs.vendedor_avg_ciclo,
  vs.vendedor_avg_atividades,
  vs.vendedor_taxa_abandono,
  
  -- Features Segmento
  ss.segmento_total_deals,
  ss.segmento_avg_ciclo,
  ss.segmento_taxa_abandono,
  
  -- Features Categóricas
  ef.Segmento,
  ef.Portfolio,
  ef.Familia_Produto,
  ef.Fiscal_Q,
  ef.outcome

FROM enriched_features ef
LEFT JOIN vendedor_stats vs ON ef.Vendedor = vs.Vendedor
LEFT JOIN segmento_stats ss ON ef.Segmento = ss.Segmento;

-- ============================================================================
-- RESULTADO: Modelo treinado para prever abandono (binary)
-- Próximo passo: Aplicar em pipeline aberto com ML.PREDICT
-- ============================================================================
