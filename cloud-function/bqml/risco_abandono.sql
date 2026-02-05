-- ========================================================================
-- MODELO ML: Risco de Abandono (Churn Risk)
-- Tipo: BOOSTED_TREE_CLASSIFIER (binary)
-- Objetivo: Prever se um deal vai sair do pipeline sem fechar (churn)
-- ========================================================================

-- 📊 REFERÊNCIA DE SCHEMA - EVITAR ERROS DE NOMENCLATURA
-- ========================================================================
-- TABELA: pipeline (270 deals ativos)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Oportunidade (STRING - chave)
-- TABELA: closed_deals (deals históricos)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Ciclo_dias: STRING tipo ⚠️ Usar CAST/SAFE_CAST
-- ========================================================================

-- PASSO 1: Criar tabela de treinamento com features
-- ==================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.treino_risco_abandono` AS
WITH historical_deals AS (
  SELECT
    opportunity AS deal_id,
    
    -- TARGET: Deal foi abandonado? (1 = sim, 0 = não)
    -- Considera "Lost" com motivos específicos como abandono
    CASE
      WHEN Status = 'Lost' AND (
        LOWER(Loss_Reason) LIKE '%follow%'
        OR LOWER(Loss_Reason) LIKE '%respost%'
        OR LOWER(Loss_Reason) LIKE '%contato%'
        OR LOWER(Loss_Reason) LIKE '%silên%'
        OR LOWER(Loss_Reason) LIKE '%abandon%'
        OR LOWER(Loss_Reason) LIKE '%desist%'
        OR Loss_Reason IS NULL
        OR Loss_Reason = ''
      ) THEN 1
      ELSE 0
    END AS target_abandonado,
    
    -- FEATURES: Inatividade
    CAST(Idle_Dias AS INT64) AS idle_dias,
    CAST(Ultimo_Edit_Dias AS INT64) AS ultimo_edit_dias,
    CAST(Atividades_7d AS INT64) AS atividades_ultimos_7d,
    
    CASE
      WHEN CAST(Idle_Dias AS INT64) >= 30 THEN 'MUITO_INATIVO'
      WHEN CAST(Idle_Dias AS INT64) >= 14 THEN 'INATIVO'
      WHEN CAST(Idle_Dias AS INT64) >= 7 THEN 'POUCO_ATIVO'
      ELSE 'ATIVO'
    END AS nivel_inatividade,
    
    -- FEATURES: Instabilidade (mudanças frequentes)
    CAST(Mudancas_Criticas AS INT64) AS mudancas_criticas,
    CASE
      WHEN CAST(Mudancas_Criticas AS INT64) >= 5 THEN 'MUITO_INSTAVEL'
      WHEN CAST(Mudancas_Criticas AS INT64) >= 3 THEN 'INSTAVEL'
      WHEN CAST(Mudancas_Criticas AS INT64) >= 1 THEN 'POUCO_ESTAVEL'
      ELSE 'ESTAVEL'
    END AS nivel_instabilidade,
    
    -- FEATURES: Flags de risco
    ARRAY_LENGTH(SPLIT(Red_Flags, ',')) AS qtd_red_flags,
    ARRAY_LENGTH(SPLIT(Yellow_Flags, ',')) AS qtd_yellow_flags,
    ARRAY_LENGTH(SPLIT(Anomalias_Detectadas, ',')) AS qtd_anomalias,
    
    -- FEATURES: Velocidade (baseado em mudanças de fase)
    CAST(Velocity_Predio AS FLOAT64) AS velocity_score,
    CASE
      WHEN CAST(Velocity_Predio AS FLOAT64) < 0.3 THEN 'MUITO_LENTO'
      WHEN CAST(Velocity_Predio AS FLOAT64) < 0.6 THEN 'LENTO'
      WHEN CAST(Velocity_Predio AS FLOAT64) < 0.8 THEN 'NORMAL'
      ELSE 'RAPIDO'
    END AS velocity_nivel,
    
    -- FEATURES: Qualificação
    CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
    CAST(BANT_Score AS FLOAT64) AS bant_score,
    CAST(Atividades_Peso AS FLOAT64) AS atividades_peso,
    
    -- FEATURES: Contexto
    Fase_Atual AS fase_atual,
    Vendedor AS vendedor,
    Segmento AS segmento,
    
    -- FEATURES: Valor
    CAST(Gross_Value AS FLOAT64) / 1000 AS gross_value_k,
    
    -- FEATURES: Ciclo atual
    CAST(Ciclo_dias AS INT64) AS ciclo_dias,
    CASE
      WHEN CAST(Ciclo_dias AS INT64) > 180 THEN 'MUITO_LONGO'
      WHEN CAST(Ciclo_dias AS INT64) > 90 THEN 'LONGO'
      WHEN CAST(Ciclo_dias AS INT64) > 30 THEN 'NORMAL'
      ELSE 'CURTO'
    END AS ciclo_categoria
    
  FROM 
    `operaciones-br.sales_intelligence.closed_deals`
  WHERE
    CAST(Gross_Value AS FLOAT64) > 0
    AND Vendedor IS NOT NULL
)
SELECT
  *
FROM
  historical_deals;


-- PASSO 2: Treinar modelo de Risco de Abandono
-- =============================================
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.risco_abandono_model`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['target_abandonado'],
  
  -- Hiperparâmetros otimizados para detecção de churn
  booster_type='GBTREE',
  num_parallel_tree=15,
  max_iterations=50,
  learning_rate=0.1,
  min_tree_child_weight=2,
  subsample=0.85,
  
  -- Balancear classes (pode haver desbalanceamento)
  auto_class_weights=TRUE,
  
  -- Threshold personalizado para alta sensibilidade (detectar mais riscos)
  -- Ajustar depois da avaliação
  thresholds=[0.4], -- Mais sensível para não perder deals em risco
  
  -- Evitar overfitting
  early_stop=TRUE,
  min_rel_progress=0.01,
  
  -- Métricas
  enable_global_explain=TRUE,
  model_registry='vertex_ai'
) AS
SELECT
  *
FROM
  `operaciones-br.sales_intelligence.treino_risco_abandono`;


-- PASSO 3: Avaliar modelo
-- =========================
SELECT
  *
FROM
  ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.risco_abandono_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_risco_abandono`)
  );

-- Ver ROC curve e AUC
SELECT
  *
FROM
  ML.ROC_CURVE(MODEL `operaciones-br.sales_intelligence.risco_abandono_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_risco_abandono`)
  );


-- PASSO 4: Gerar predições para pipeline atual
-- =============================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_risco_abandono` AS
WITH predictions AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Gross AS gross_value,
    p.Net AS net_value,
    p.Vendedor,
    p.Fase_Atual,
    p.Perfil AS segmento,
    
    -- Predição do modelo
    pred.predicted_target_abandonado AS vai_abandonar,
    pred.predicted_target_abandonado_probs[OFFSET(1)].prob AS prob_abandono,
    
    -- Classificação de risco
    CASE
      WHEN pred.predicted_target_abandonado_probs[OFFSET(1)].prob >= 0.7 THEN 'ALTO'
      WHEN pred.predicted_target_abandonado_probs[OFFSET(1)].prob >= 0.4 THEN 'MEDIO'
      ELSE 'BAIXO'
    END AS nivel_risco,
    
    -- Features para análise (diagnóstico)
    p.Idle_Dias,
    p.Idle_Dias AS ultimo_edit_dias,  -- Coluna Ultimo_Edit_Dias não existe, usando Idle_Dias
    0 AS atividades_7d,  -- Coluna Atividades_7d não existe
    p.Mudanas_Crticas AS mudancas_criticas,
    p.Flags_de_Risco AS red_flags,
    '' AS yellow_flags,  -- Coluna Yellow_Flags não existe
    p.Anomalias_Detectadas,
    p.Velocity_Predio,
    p.MEDDIC_Score,
    p.BANT_Score,
    p.Atividades_Peso,
    p.Ciclo_dias
    
  FROM
    `operaciones-br.sales_intelligence.pipeline` p
  
  CROSS JOIN
    ML.PREDICT(MODEL `operaciones-br.sales_intelligence.risco_abandono_model`,
      (
        SELECT
          SAFE_CAST(Idle_Dias AS INT64) AS idle_dias,
          SAFE_CAST(Idle_Dias AS INT64) AS ultimo_edit_dias,  -- Usando Idle_Dias
          0 AS atividades_ultimos_7d,  -- Coluna não existe
          CASE
            WHEN SAFE_CAST(Idle_Dias AS INT64) >= 30 THEN 'MUITO_INATIVO'
            WHEN SAFE_CAST(Idle_Dias AS INT64) >= 14 THEN 'INATIVO'
            WHEN SAFE_CAST(Idle_Dias AS INT64) >= 7 THEN 'POUCO_ATIVO'
            ELSE 'ATIVO'
          END AS nivel_inatividade,
          CAST(Mudanas_Crticas AS INT64) AS mudancas_criticas,
          CASE
            WHEN CAST(Mudanas_Crticas AS INT64) >= 5 THEN 'MUITO_INSTAVEL'
            WHEN CAST(Mudanas_Crticas AS INT64) >= 3 THEN 'INSTAVEL'
            WHEN CAST(Mudanas_Crticas AS INT64) >= 1 THEN 'POUCO_ESTAVEL'
            ELSE 'ESTAVEL'
          END AS nivel_instabilidade,
          ARRAY_LENGTH(SPLIT(COALESCE(Flags_de_Risco, ''), ',')) AS qtd_red_flags,
          0 AS qtd_yellow_flags,  -- Coluna não existe
          ARRAY_LENGTH(SPLIT(COALESCE(Anomalias_Detectadas, ''), ',')) AS qtd_anomalias,
          SAFE_CAST(Velocity_Predio AS FLOAT64) AS velocity_score,
          CASE
            WHEN SAFE_CAST(Velocity_Predio AS FLOAT64) < 0.3 THEN 'MUITO_LENTO'
            WHEN SAFE_CAST(Velocity_Predio AS FLOAT64) < 0.6 THEN 'LENTO'
            WHEN SAFE_CAST(Velocity_Predio AS FLOAT64) < 0.8 THEN 'NORMAL'
            ELSE 'RAPIDO'
          END AS velocity_nivel,
          CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
          CAST(BANT_Score AS FLOAT64) AS bant_score,
          CAST(Atividades_Peso AS FLOAT64) AS atividades_peso,
          Fase_Atual AS fase_atual,
          Vendedor AS vendedor,
          Perfil AS segmento,
          CAST(Gross AS FLOAT64) / 1000 AS gross_value_k,
          Ciclo_dias AS ciclo_dias,
          CASE
            WHEN CAST(Ciclo_dias AS INT64) > 180 THEN 'MUITO_LONGO'
            WHEN CAST(Ciclo_dias AS INT64) > 90 THEN 'LONGO'
            WHEN CAST(Ciclo_dias AS INT64) > 30 THEN 'NORMAL'
            ELSE 'CURTO'
          END AS ciclo_categoria
        FROM
          `operaciones-br.sales_intelligence.pipeline`
        WHERE
          Oportunidade = p.Oportunidade
      )
    ) pred
  
  WHERE
    p.Gross > 0
)
SELECT
  *,
  
  -- Fatores de risco identificados (para dashboard)
  CONCAT(
    CASE WHEN Idle_Dias >= 14 THEN '⚠️ Inativo >14d · ' ELSE '' END,
    CASE WHEN Mudancas_Criticas >= 3 THEN '🔄 Instável · ' ELSE '' END,
    CASE WHEN ARRAY_LENGTH(SPLIT(Red_Flags, ',')) >= 2 THEN '🚨 Red Flags · ' ELSE '' END,
    CASE WHEN Velocity_Predio < 0.5 THEN '🐌 Lento · ' ELSE '' END,
    CASE WHEN Atividades_7d < 2 THEN '📉 Baixo Engajamento · ' ELSE '' END
  ) AS fatores_risco,
  
  -- Ação recomendada
  CASE
    WHEN nivel_risco = 'ALTO' THEN '🚨 URGENTE: Follow-up imediato, reunião executiva, revisar viabilidade'
    WHEN nivel_risco = 'MEDIO' THEN '⚠️ ATENÇÃO: Aumentar engajamento, identificar bloqueios, call semanal'
    ELSE '✅ OK: Manter ritmo, follow-ups regulares'
  END AS acao_recomendada

FROM
  predictions;


-- PASSO 5: Ver top 10 deals em alto risco de abandono
-- ====================================================
SELECT
  opportunity,
  Vendedor,
  Fase_Atual,
  gross_value,
  nivel_risco,
  ROUND(prob_abandono * 100, 1) AS prob_abandono_pct,
  Idle_Dias,
  mudancas_criticas,
  fatores_risco,
  acao_recomendada,
  MEDDIC_Score,
  BANT_Score
FROM
  `operaciones-br.sales_intelligence.pipeline_risco_abandono`
WHERE
  nivel_risco IN ('ALTO', 'MEDIO')
ORDER BY
  prob_abandono DESC,
  gross_value DESC
LIMIT 10;

-- Distribuição de risco no pipeline
SELECT
  nivel_risco,
  COUNT(*) AS qtd_deals,
  ROUND(SUM(gross_value) / 1000000, 2) AS valor_total_m,
  ROUND(AVG(prob_abandono) * 100, 1) AS prob_media_pct
FROM
  `operaciones-br.sales_intelligence.pipeline_risco_abandono`
GROUP BY
  nivel_risco
ORDER BY
  CASE nivel_risco
    WHEN 'ALTO' THEN 1
    WHEN 'MEDIO' THEN 2
    ELSE 3
  END;
