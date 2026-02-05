-- ============================================================================
-- MODELO 3: RISCO DE ABANDONO (CHURN RISK)
-- ============================================================================
-- Tipo: BOOSTED_TREE_CLASSIFIER (binary)
-- Objetivo: Predizer se um deal vai ser abandonado (churn)
-- Output: nivel_risco (ALTO/MEDIO/BAIXO), prob_abandono, fatores_risco
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_risco_abandono.sql
-- ============================================================================

-- 1. Criar tabela de treino (deals FECHADOS - churn = LOST)
CREATE OR REPLACE TABLE `sales_intelligence.treino_risco_abandono` AS
SELECT
  opportunity_name AS opportunity,
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Stage AS Fase_Atual,
  Fiscal_Q AS Fiscal_Quarter,
  
  -- Features numéricas
  CAST(Confidence AS FLOAT64) AS confidence_num,
  CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
  CAST(BANT_Score AS FLOAT64) AS bant_score,
  CAST(Idle_Days AS INT64) AS idle_days,
  CAST(Atividades AS INT64) AS atividades,
  CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
  CAST(Red_Flags AS INT64) AS red_flags,
  CAST(Yellow_Flags AS INT64) AS yellow_flags,
  CAST(Cycle_Days AS INT64) AS cycle_days,
  CAST(Qtd_Emails AS INT64) AS qtd_emails,
  
  -- Features booleanas
  CAST(
    CASE 
      WHEN UPPER(Loss_Reason) LIKE '%SEM RESPOSTA%' 
           OR UPPER(Loss_Reason) LIKE '%NAO RESPONDEU%'
           OR UPPER(Loss_Reason) LIKE '%NÃO RESPONDEU%' THEN 1
      ELSE 0
    END AS INT64
  ) AS sem_resposta,
  
  -- Target: abandonou? (1 = LOST, 0 = WON)
  CASE 
    WHEN outcome = 'LOST' THEN 1
    WHEN outcome = 'WON' THEN 0
  END AS abandonou
  
FROM `sales_intelligence.closed_deals`
WHERE 
  outcome IN ('WON', 'LOST')
  AND Confidence IS NOT NULL
  AND Idle_Days IS NOT NULL;

-- 2. Treinar modelo BOOSTED_TREE_CLASSIFIER (binary)
CREATE OR REPLACE MODEL `sales_intelligence.modelo_risco_abandono`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['abandonou'],
  max_iterations=100,
  learn_rate=0.1,
  early_stop=TRUE,
  min_rel_progress=0.001,
  l1_reg=0.1,
  l2_reg=0.1,
  max_tree_depth=10,
  subsample=0.8,
  data_split_method='AUTO_SPLIT',
  data_split_eval_fraction=0.2,
  -- Threshold mais baixo = mais sensibilidade (detecta mais riscos)
  class_weights=[(0, 1.0), (1, 2.0)]  -- Peso 2x para abandonados
) AS
SELECT
  -- Features
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Fase_Atual,
  Fiscal_Quarter,
  confidence_num,
  meddic_score,
  bant_score,
  idle_days,
  atividades,
  qtd_reunioes,
  red_flags,
  yellow_flags,
  cycle_days,
  qtd_emails,
  sem_resposta,
  
  -- Target
  abandonou
FROM `sales_intelligence.treino_risco_abandono`;

-- 3. Avaliar modelo (métricas binary)
SELECT
  'RISCO_ABANDONO' AS modelo,
  precision,
  recall,
  accuracy,
  f1_score,
  log_loss,
  roc_auc
FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_risco_abandono`);

-- 4. Criar tabela de predições para pipeline ATIVO
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_risco_abandono` AS
SELECT
  p.opportunity_name AS opportunity,
  p.Gross_Value,
  p.Vendedor,
  p.Segmento,
  p.Stage AS Fase_Atual,
  p.Fiscal_Q AS Fiscal_Quarter,
  
  -- Probabilidade de abandono
  (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) AS prob_abandono,
  
  -- Nível de risco baseado no threshold 0.4 (alta sensibilidade)
  CASE
    WHEN (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) >= 0.6 THEN 'ALTO'
    WHEN (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) >= 0.4 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS nivel_risco,
  
  -- Fatores de risco (concatenados)
  ARRAY_TO_STRING([
    IF(CAST(p.Idle_Days AS INT64) > 30, 'INATIVO_' || CAST(p.Idle_Days AS STRING) || 'D', NULL),
    IF(CAST(p.Red_Flags AS INT64) > 0, 'RED_FLAGS_' || CAST(p.Red_Flags AS STRING), NULL),
    IF(CAST(p.Yellow_Flags AS INT64) > 2, 'YELLOW_FLAGS_' || CAST(p.Yellow_Flags AS STRING), NULL),
    IF(CAST(p.Confidence AS FLOAT64) < 30, 'BAIXA_CONFIANCA', NULL),
    IF(CAST(p.MEDDIC_Score AS FLOAT64) < 40, 'MEDDIC_BAIXO', NULL),
    IF(CAST(p.BANT_Score AS FLOAT64) < 40, 'BANT_BAIXO', NULL),
    IF(CAST(p.Atividades AS INT64) < 3, 'POUCAS_ATIVIDADES', NULL)
  ], ', ') AS fatores_risco,
  
  -- Ação recomendada baseada no risco
  CASE
    WHEN (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) >= 0.6 
      THEN 'URGENTE: Agendar call executiva, revisar proposta, escalar para manager'
    WHEN (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) >= 0.4 
      THEN 'IMPORTANTE: Reativar engajamento, validar MEDDIC/BANT, próximo passo claro'
    ELSE 'MANTER: Monitorar atividades, manter cadência de follow-up'
  END AS acao_recomendada,
  
  -- Contexto para análise
  CAST(p.Idle_Days AS INT64) AS Idle_Dias,
  CAST(p.MEDDIC_Score AS FLOAT64) AS MEDDIC_Score,
  CAST(p.BANT_Score AS FLOAT64) AS BANT_Score,
  CAST(p.Red_Flags AS INT64) AS Red_Flags,
  CAST(p.Yellow_Flags AS INT64) AS Yellow_Flags
  
FROM `sales_intelligence.pipeline` p
JOIN ML.PREDICT(
  MODEL `sales_intelligence.modelo_risco_abandono`,
  (
    SELECT
      Gross_Value,
      Net_Value,
      Vendedor,
      Segmento,
      Stage AS Fase_Atual,
      Fiscal_Q AS Fiscal_Quarter,
      CAST(Confidence AS FLOAT64) AS confidence_num,
      CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
      CAST(BANT_Score AS FLOAT64) AS bant_score,
      CAST(Idle_Days AS INT64) AS idle_days,
      CAST(Atividades AS INT64) AS atividades,
      CAST(Qtd_Reunioes AS INT64) AS qtd_reunioes,
      CAST(Red_Flags AS INT64) AS red_flags,
      CAST(Yellow_Flags AS INT64) AS yellow_flags,
      CAST(Cycle_Days AS INT64) AS cycle_days,
      CAST(Qtd_Emails AS INT64) AS qtd_emails,
      CAST(
        CASE 
          WHEN UPPER(Loss_Reason) LIKE '%SEM RESPOSTA%' THEN 1
          ELSE 0
        END AS INT64
      ) AS sem_resposta
    FROM `sales_intelligence.pipeline`
  )
) pred
ON TRUE
WHERE (SELECT prob FROM UNNEST(pred.predicted_abandonou_probs) WHERE label = 1 LIMIT 1) >= 0.3;  -- Só deals com risco >= 30%

-- 5. ROC Curve (curva ROC)
SELECT
  *
FROM ML.ROC_CURVE(
  MODEL `sales_intelligence.modelo_risco_abandono`,
  (SELECT * FROM `sales_intelligence.treino_risco_abandono`)
);

-- 6. Análise de importância das features
SELECT
  feature,
  importance,
  RANK() OVER (ORDER BY importance DESC) AS rank
FROM ML.FEATURE_IMPORTANCE(MODEL `sales_intelligence.modelo_risco_abandono`)
ORDER BY importance DESC
LIMIT 20;

-- 7. Estatísticas das predições
SELECT
  nivel_risco,
  COUNT(*) AS deals_em_risco,
  AVG(prob_abandono) AS avg_prob_abandono,
  SUM(Gross_Value) AS total_value_em_risco,
  AVG(Idle_Dias) AS avg_idle_days,
  AVG(MEDDIC_Score) AS avg_meddic
FROM `sales_intelligence.pipeline_risco_abandono`
GROUP BY nivel_risco
ORDER BY 
  CASE nivel_risco
    WHEN 'ALTO' THEN 1
    WHEN 'MÉDIO' THEN 2
    WHEN 'BAIXO' THEN 3
  END;

-- 8. Top 10 deals em maior risco (para dashboard)
SELECT
  opportunity,
  Vendedor,
  Gross_Value,
  prob_abandono,
  nivel_risco,
  fatores_risco,
  acao_recomendada
FROM `sales_intelligence.pipeline_risco_abandono`
WHERE nivel_risco IN ('ALTO', 'MÉDIO')
ORDER BY prob_abandono DESC, Gross_Value DESC
LIMIT 10;
