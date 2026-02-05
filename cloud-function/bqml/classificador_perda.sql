-- ========================================================================
-- MODELO ML: Classificador de Motivo de Perda
-- Tipo: BOOSTED_TREE_CLASSIFIER (multiclass)
-- Objetivo: Identificar a causa raiz da perda (Preço, Timing, Concorrente, Budget, Fit)
-- ========================================================================

-- 📊 REFERÊNCIA DE SCHEMA - EVITAR ERROS DE NOMENCLATURA
-- ========================================================================
-- TABELA: pipeline (270 deals ativos)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Oportunidade (STRING - chave)
-- TABELA: closed_deals (deals históricos)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Status: 'Won'/'Lost', Causa_Raiz (TARGET)
--   Ciclo_dias: STRING tipo ⚠️ Usar CAST/SAFE_CAST
-- ========================================================================

-- PASSO 1: Criar tabela de treinamento com features
-- ==================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.treino_classificador_perda` AS
WITH parsed_loss AS (
  SELECT
    opportunity AS deal_id,
    
    -- TARGET: Categoria de perda (extraída de Loss_Reason ou Causa_Raiz)
    CASE
      WHEN LOWER(Loss_Reason) LIKE '%preço%' OR LOWER(Loss_Reason) LIKE '%pre%o%' OR LOWER(Loss_Reason) LIKE '%caro%' OR LOWER(Loss_Reason) LIKE '%custo%' THEN 'PRECO'
      WHEN LOWER(Loss_Reason) LIKE '%timing%' OR LOWER(Loss_Reason) LIKE '%prazo%' OR LOWER(Loss_Reason) LIKE '%tempo%' THEN 'TIMING'
      WHEN LOWER(Loss_Reason) LIKE '%concorr%' OR LOWER(Loss_Reason) LIKE '%competitor%' THEN 'CONCORRENTE'
      WHEN LOWER(Loss_Reason) LIKE '%budget%' OR LOWER(Loss_Reason) LIKE '%or%amento%' OR LOWER(Loss_Reason) LIKE '%falta%verba%' THEN 'BUDGET'
      WHEN LOWER(Loss_Reason) LIKE '%fit%' OR LOWER(Loss_Reason) LIKE '%adequa%' OR LOWER(Loss_Reason) LIKE '%necessidade%' THEN 'FIT'
      ELSE 'OUTRO'
    END AS target_causa_perda,
    
    -- FEATURES: Flags de risco (contagem)
    ARRAY_LENGTH(SPLIT(Red_Flags, ',')) AS qtd_red_flags,
    ARRAY_LENGTH(SPLIT(Yellow_Flags, ',')) AS qtd_yellow_flags,
    
    -- FEATURES: Gaps de qualificação
    CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
    CAST(BANT_Score AS FLOAT64) AS bant_score,
    100 - CAST(MEDDIC_Score AS FLOAT64) AS meddic_gap,
    100 - CAST(BANT_Score AS FLOAT64) AS bant_gap,
    
    -- FEATURES: Engajamento
    CAST(Atividades_Peso AS FLOAT64) AS atividades_peso,
    CAST(Idle_Dias AS INT64) AS idle_dias,
    
    CASE
      WHEN CAST(Atividades_Peso AS FLOAT64) < 5 THEN 'BAIXO'
      WHEN CAST(Atividades_Peso AS FLOAT64) < 15 THEN 'MEDIO'
      ELSE 'ALTO'
    END AS engajamento_nivel,
    
    -- FEATURES: Contexto
    Fase_Atual AS fase_atual,
    Vendedor AS vendedor,
    Segmento AS segmento,
    
    -- FEATURES: Valor
    CAST(Gross_Value AS FLOAT64) / 1000 AS gross_value_k,
    
    -- FEATURES: Ciclo
    Ciclo_dias AS ciclo_dias,
    CASE
      WHEN Ciclo_dias < 30 THEN 'CURTO'
      WHEN Ciclo_dias < 90 THEN 'NORMAL'
      ELSE 'LONGO'
    END AS ciclo_categoria
    
  FROM 
    `operaciones-br.sales_intelligence.closed_deals`
  WHERE
    Status = 'Lost'
    AND Loss_Reason IS NOT NULL
    AND Loss_Reason != ''
    AND CAST(Gross_Value AS FLOAT64) > 0
)
SELECT
  *
FROM
  parsed_loss
WHERE
  target_causa_perda != 'OUTRO'; -- Remove casos não classificáveis


-- PASSO 2: Treinar modelo Classificador de Perda
-- ===============================================
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.classificador_perda_model`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['target_causa_perda'],
  
  -- Hiperparâmetros
  booster_type='GBTREE',
  num_parallel_tree=10,
  max_iterations=50,
  learning_rate=0.15,
  min_tree_child_weight=2,
  subsample=0.8,
  
  -- Classe multiclasse
  auto_class_weights=TRUE, -- Balancear classes desiguais
  
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
  `operaciones-br.sales_intelligence.treino_classificador_perda`;


-- PASSO 3: Avaliar modelo (confusão matrix, precisão por classe)
-- ===============================================================
SELECT
  *
FROM
  ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.classificador_perda_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_classificador_perda`)
  );

-- Ver confusion matrix
SELECT
  *
FROM
  ML.CONFUSION_MATRIX(MODEL `operaciones-br.sales_intelligence.classificador_perda_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_classificador_perda`)
  );


-- PASSO 4: Gerar predições para pipeline atual (em risco)
-- =========================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_classificador_perda` AS
WITH predictions AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Gross AS gross_value,
    p.Net AS net_value,
    p.Vendedor,
    p.Fase_Atual,
    p.Perfil AS segmento,
    
    -- Predição do modelo
    pred.predicted_target_causa_perda AS causa_prevista,
    pred.predicted_target_causa_perda_probs[OFFSET(0)].prob AS confianca_predicao,
    
    -- Probabilidades por classe
    (SELECT prob FROM UNNEST(pred.predicted_target_causa_perda_probs) WHERE label = 'PRECO') AS prob_preco,
    (SELECT prob FROM UNNEST(pred.predicted_target_causa_perda_probs) WHERE label = 'TIMING') AS prob_timing,
    (SELECT prob FROM UNNEST(pred.predicted_target_causa_perda_probs) WHERE label = 'CONCORRENTE') AS prob_concorrente,
    (SELECT prob FROM UNNEST(pred.predicted_target_causa_perda_probs) WHERE label = 'BUDGET') AS prob_budget,
    (SELECT prob FROM UNNEST(pred.predicted_target_causa_perda_probs) WHERE label = 'FIT') AS prob_fit,
    
    -- Features para análise
    p.MEDDIC_Score,
    p.BANT_Score,
    p.Atividades_Peso,
    p.Idle_Dias,
    p.Flags_de_Risco
    
  FROM
    `operaciones-br.sales_intelligence.pipeline` p
  
  CROSS JOIN
    ML.PREDICT(MODEL `operaciones-br.sales_intelligence.classificador_perda_model`,
      (
        SELECT
          ARRAY_LENGTH(SPLIT(COALESCE(Flags_de_Risco, ''), ',')) AS qtd_red_flags,
          0 AS qtd_yellow_flags,  -- Coluna não existe em pipeline
          CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
          CAST(BANT_Score AS FLOAT64) AS bant_score,
          100 - CAST(MEDDIC_Score AS FLOAT64) AS meddic_gap,
          100 - CAST(BANT_Score AS FLOAT64) AS bant_gap,
          CAST(Atividades_Peso AS FLOAT64) AS atividades_peso,
          CAST(Idle_Dias AS INT64) AS idle_dias,
          CASE
            WHEN CAST(Atividades_Peso AS FLOAT64) < 5 THEN 'BAIXO'
            WHEN CAST(Atividades_Peso AS FLOAT64) < 15 THEN 'MEDIO'
            ELSE 'ALTO'
          END AS engajamento_nivel,
          Fase_Atual AS fase_atual,
          Vendedor AS vendedor,
          Perfil AS segmento,
          CAST(Gross AS FLOAT64) / 1000 AS gross_value_k,
          Ciclo_dias AS ciclo_dias,
          CASE
            WHEN Ciclo_dias < 30 THEN 'CURTO'
            WHEN Ciclo_dias < 90 THEN 'NORMAL'
            ELSE 'LONGO'
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
  
  -- Ação preventiva recomendada
  CASE causa_prevista
    WHEN 'PRECO' THEN 'Reforçar ROI e valor, apresentar casos de uso similares'
    WHEN 'TIMING' THEN 'Identificar bloqueios, criar urgência, revisar timeline'
    WHEN 'CONCORRENTE' THEN 'Análise competitiva, destacar diferenciais, battle cards'
    WHEN 'BUDGET' THEN 'Falar com decisor financeiro, propor phasing, ROI claro'
    WHEN 'FIT' THEN 'Revisar fit, entender necessidades reais, considerar descontinuar'
    ELSE 'Análise manual necessária'
  END AS acao_preventiva

FROM
  predictions;


-- PASSO 5: Ver top 10 deals em risco por causa
-- =============================================
-- Deals com alto risco de perder por PREÇO
SELECT
  opportunity,
  Vendedor,
  gross_value,
  causa_prevista,
  confianca_predicao,
  prob_preco,
  acao_preventiva,
  MEDDIC_Score,
  BANT_Score
FROM
  `operaciones-br.sales_intelligence.pipeline_classificador_perda`
WHERE
  causa_prevista = 'PRECO'
ORDER BY
  confianca_predicao DESC,
  gross_value DESC
LIMIT 10;

-- Distribuição de causas previstas no pipeline
SELECT
  causa_prevista,
  COUNT(*) AS qtd_deals,
  ROUND(SUM(gross_value) / 1000000, 2) AS valor_total_m,
  ROUND(AVG(confianca_predicao) * 100, 1) AS confianca_media_pct
FROM
  `operaciones-br.sales_intelligence.pipeline_classificador_perda`
GROUP BY
  causa_prevista
ORDER BY
  qtd_deals DESC;
