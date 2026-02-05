-- ============================================================================
-- MODELO 4: Performance de Vendedor (REGRESSION)
-- ============================================================================
-- OBJETIVO: Prever win rate esperado e performance de cada vendedor
-- TIPO: LINEAR_REG
-- INPUT: Agregações de closed_deals por vendedor
-- OUTPUT: Win rate previsto, delta performance, ranking
-- ============================================================================

CREATE OR REPLACE MODEL `sales_intelligence.ml_performance_vendedor_v2`
OPTIONS(
  model_type='LINEAR_REG',
  input_label_cols=['win_rate_real'],
  data_split_method='AUTO_SPLIT',
  optimize_strategy='NORMAL_EQUATION',
  l2_reg=0.1
) AS

-- ============================================================================
-- 1. AGREGAÇÃO: Métricas por vendedor
-- ============================================================================
WITH vendedor_metrics AS (
  -- União de ganhos e perdas
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

-- ============================================================================
-- 2. AGREGAÇÕES: Stats detalhadas por vendedor
-- ============================================================================
vendedor_stats AS (
  SELECT
    Vendedor,
    
    -- Contadores
    COUNT(*) AS total_deals,
    SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) AS total_ganhos,
    SUM(CASE WHEN outcome = 'LOST' THEN 1 ELSE 0 END) AS total_perdas,
    
    -- LABEL: Win Rate Real
    SAFE_DIVIDE(
      SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END),
      COUNT(*)
    ) AS win_rate_real,
    
    -- Médias de valor
    AVG(Gross) AS avg_gross,
    AVG(Net) AS avg_net,
    AVG(CASE WHEN outcome = 'WON' THEN Gross END) AS avg_gross_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Gross END) AS avg_gross_lost,
    
    -- Médias de ciclo
    AVG(Ciclo_dias) AS avg_ciclo,
    AVG(CASE WHEN outcome = 'WON' THEN Ciclo_dias END) AS avg_ciclo_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Ciclo_dias END) AS avg_ciclo_lost,
    
    -- Médias de atividades
    AVG(Atividades) AS avg_atividades,
    AVG(CASE WHEN outcome = 'WON' THEN Atividades END) AS avg_atividades_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Atividades END) AS avg_atividades_lost,
    
    -- Médias de cadência
    AVG(Cadencia_Media_dias) AS avg_cadencia,
    AVG(CASE WHEN outcome = 'WON' THEN Cadencia_Media_dias END) AS avg_cadencia_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Cadencia_Media_dias END) AS avg_cadencia_lost,
    
    -- Médias de mudanças
    AVG(Total_Mudancas) AS avg_mudancas,
    AVG(Mudancas_Criticas) AS avg_mudancas_criticas,
    AVG(CASE WHEN outcome = 'WON' THEN Total_Mudancas END) AS avg_mudancas_won,
    AVG(CASE WHEN outcome = 'LOST' THEN Total_Mudancas END) AS avg_mudancas_lost,
    
    -- Velocidade
    AVG(SAFE_DIVIDE(Atividades, NULLIF(Ciclo_dias, 0))) AS avg_velocidade_atividades,
    
    -- Distribuições
    MIN(Ciclo_dias) AS min_ciclo,
    MAX(Ciclo_dias) AS max_ciclo,
    STDDEV(Ciclo_dias) AS stddev_ciclo,
    
    MIN(Atividades) AS min_atividades,
    MAX(Atividades) AS max_atividades,
    STDDEV(Atividades) AS stddev_atividades
    
  FROM vendedor_metrics
  GROUP BY Vendedor
  HAVING COUNT(*) >= 3  -- Mínimo 3 deals para treinar
)

-- ============================================================================
-- 3. DATASET FINAL: Features para predição
-- ============================================================================
SELECT
  -- LABEL (target)
  win_rate_real,
  
  -- Features básicas
  total_deals,
  total_ganhos,
  total_perdas,
  
  -- Features de valor
  COALESCE(avg_gross, 0) AS avg_gross,
  COALESCE(avg_net, 0) AS avg_net,
  COALESCE(avg_gross_won, 0) AS avg_gross_won,
  COALESCE(avg_gross_lost, 0) AS avg_gross_lost,
  
  -- Features de ciclo
  COALESCE(avg_ciclo, 0) AS avg_ciclo,
  COALESCE(avg_ciclo_won, 0) AS avg_ciclo_won,
  COALESCE(avg_ciclo_lost, 0) AS avg_ciclo_lost,
  
  -- Features de atividades
  COALESCE(avg_atividades, 0) AS avg_atividades,
  COALESCE(avg_atividades_won, 0) AS avg_atividades_won,
  COALESCE(avg_atividades_lost, 0) AS avg_atividades_lost,
  
  -- Features de cadência
  COALESCE(avg_cadencia, 0) AS avg_cadencia,
  COALESCE(avg_cadencia_won, 0) AS avg_cadencia_won,
  COALESCE(avg_cadencia_lost, 0) AS avg_cadencia_lost,
  
  -- Features de mudanças
  COALESCE(avg_mudancas, 0) AS avg_mudancas,
  COALESCE(avg_mudancas_criticas, 0) AS avg_mudancas_criticas,
  COALESCE(avg_mudancas_won, 0) AS avg_mudancas_won,
  COALESCE(avg_mudancas_lost, 0) AS avg_mudancas_lost,
  
  -- Features de velocidade
  COALESCE(avg_velocidade_atividades, 0) AS avg_velocidade_atividades,
  
  -- Features de dispersão
  COALESCE(min_ciclo, 0) AS min_ciclo,
  COALESCE(max_ciclo, 0) AS max_ciclo,
  COALESCE(stddev_ciclo, 0) AS stddev_ciclo,
  COALESCE(min_atividades, 0) AS min_atividades,
  COALESCE(max_atividades, 0) AS max_atividades,
  COALESCE(stddev_atividades, 0) AS stddev_atividades,
  
  -- Diferenças (won vs lost) - Indicadores de consistência
  COALESCE(avg_ciclo_won - avg_ciclo_lost, 0) AS delta_ciclo_won_vs_lost,
  COALESCE(avg_atividades_won - avg_atividades_lost, 0) AS delta_atividades_won_vs_lost,
  COALESCE(avg_cadencia_won - avg_cadencia_lost, 0) AS delta_cadencia_won_vs_lost

FROM vendedor_stats;

-- ============================================================================
-- RESULTADO: Modelo treinado para prever win rate de vendedores
-- Uso: Identificar vendedores de alta/baixa performance
-- ============================================================================
