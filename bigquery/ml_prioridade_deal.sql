-- ============================================================================
-- MODELO 5: PRIORIZAÇÃO DE DEALS (VIEW CALCULADA)
-- ============================================================================
-- Tipo: VIEW combinando outputs dos modelos 1-4
-- Objetivo: Ranquear deals por prioridade usando fórmula multi-critério
-- Output: priority_score (0-100), priority_level, ranking, recommended_action
--
-- Fórmula: (win_prob × 30%) + (value × 30%) + (urgency × 20%) + (retention × 20%)
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_prioridade_deal.sql
-- ============================================================================

-- Criar VIEW de priorização (atualiza automaticamente quando modelos são retreinados)
CREATE OR REPLACE VIEW `sales_intelligence.pipeline_prioridade_deals` AS
WITH deal_scores AS (
  SELECT
    p.opportunity_name AS opportunity,
    p.Gross_Value,
    p.Net_Value,
    p.Vendedor,
    p.Segmento,
    p.Stage AS Fase_Atual,
    p.Fiscal_Q AS Fiscal_Quarter,
    CAST(p.Confidence AS FLOAT64) AS confidence_base,
    
    -- Score 1: WIN PROBABILITY (0-100) - 30% do score final
    -- Baseado em confidence + MEDDIC + BANT
    (
      (CAST(p.Confidence AS FLOAT64) * 0.5) +
      (CAST(p.MEDDIC_Score AS FLOAT64) * 0.3) +
      (CAST(p.BANT_Score AS FLOAT64) * 0.2)
    ) AS win_prob_score,
    
    -- Score 2: VALUE SCORE (0-100) - 30% do score final
    -- Normaliza valor do deal (0 = menor, 100 = maior)
    PERCENT_RANK() OVER (ORDER BY p.Gross_Value) * 100 AS value_score,
    
    -- Score 3: URGENCY SCORE (0-100) - 20% do score final
    -- Baseado em velocidade prevista (Modelo 1) + Close Date proximity
    CASE
      WHEN ciclo.velocidade_prevista = 'RÁPIDO' THEN 100
      WHEN ciclo.velocidade_prevista = 'NORMAL' THEN 70
      WHEN ciclo.velocidade_prevista = 'LENTO' THEN 40
      WHEN ciclo.velocidade_prevista = 'MUITO_LENTO' THEN 20
      ELSE 50  -- Default se não tiver predição
    END AS urgency_score_ciclo,
    
    -- Ajuste por proximidade do Close Date
    CASE
      WHEN DATE_DIFF(PARSE_DATE('%d/%m/%Y', p.Close_Date), CURRENT_DATE(), DAY) <= 7 THEN 100
      WHEN DATE_DIFF(PARSE_DATE('%d/%m/%Y', p.Close_Date), CURRENT_DATE(), DAY) <= 30 THEN 80
      WHEN DATE_DIFF(PARSE_DATE('%d/%m/%Y', p.Close_Date), CURRENT_DATE(), DAY) <= 60 THEN 60
      WHEN DATE_DIFF(PARSE_DATE('%d/%m/%Y', p.Close_Date), CURRENT_DATE(), DAY) <= 90 THEN 40
      ELSE 20
    END AS urgency_score_date,
    
    -- Score 4: RETENTION SCORE (0-100) - 20% do score final
    -- Baseado em risco de abandono (Modelo 3)
    CASE
      WHEN risco.prob_abandono >= 0.6 THEN 0   -- ALTO risco = prioridade zero
      WHEN risco.prob_abandono >= 0.4 THEN 40  -- MÉDIO risco = prioridade baixa
      ELSE 100                                  -- BAIXO risco = prioridade máxima
    END AS retention_score,
    
    -- Contexto dos modelos ML
    ciclo.dias_previstos,
    ciclo.velocidade_prevista,
    risco.prob_abandono,
    risco.nivel_risco,
    perda.causa_prevista AS risco_perda_causa,
    
    -- Flags e métricas
    CAST(p.Red_Flags AS INT64) AS red_flags,
    CAST(p.Yellow_Flags AS INT64) AS yellow_flags,
    CAST(p.Idle_Days AS INT64) AS idle_days,
    CAST(p.MEDDIC_Score AS FLOAT64) AS meddic_score,
    CAST(p.BANT_Score AS FLOAT64) AS bant_score
    
  FROM `sales_intelligence.pipeline` p
  LEFT JOIN `sales_intelligence.pipeline_previsao_ciclo` ciclo 
    ON p.opportunity_name = ciclo.opportunity
  LEFT JOIN `sales_intelligence.pipeline_risco_abandono` risco 
    ON p.opportunity_name = risco.opportunity
  LEFT JOIN `sales_intelligence.pipeline_classificador_perda` perda 
    ON p.opportunity_name = perda.opportunity
)
SELECT
  opportunity,
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Fase_Atual,
  Fiscal_Quarter,
  
  -- PRIORITY SCORE FINAL (0-100)
  ROUND(
    (win_prob_score * 0.30) +
    (value_score * 0.30) +
    ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
    (retention_score * 0.20)
  , 1) AS priority_score,
  
  -- PRIORITY LEVEL
  CASE
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 80 THEN 'CRÍTICO'
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 60 THEN 'ALTO'
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 40 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS priority_level,
  
  -- RANKING (1 = mais prioritário)
  RANK() OVER (ORDER BY 
    ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) DESC
  ) AS ranking,
  
  -- RANKING POR VENDEDOR
  RANK() OVER (PARTITION BY Vendedor ORDER BY 
    ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) DESC
  ) AS ranking_vendedor,
  
  -- RECOMENDAÇÃO DE FOCO (baseada no priority level)
  CASE
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 80 
      THEN 'FOCO TOTAL: Dedicar 40-50% do tempo, daily check-ins, escalar se necessário'
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 60 
      THEN 'ALTA PRIORIDADE: 20-30% do tempo, check-in 2-3x/semana'
    WHEN ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      ((urgency_score_ciclo + urgency_score_date) / 2 * 0.20) +
      (retention_score * 0.20)
    , 1) >= 40 
      THEN 'MONITORAR: 10-15% do tempo, check-in semanal'
    ELSE 'BAIXO FOCO: Manter cadência mínima, reavaliar se situação mudar'
  END AS recomendacao_foco,
  
  -- Breakdown dos scores (para análise)
  win_prob_score,
  value_score,
  (urgency_score_ciclo + urgency_score_date) / 2 AS urgency_score,
  retention_score,
  
  -- Contexto ML
  dias_previstos,
  velocidade_prevista,
  prob_abandono,
  nivel_risco,
  risco_perda_causa,
  
  -- Métricas adicionais
  confidence_base,
  meddic_score,
  bant_score,
  red_flags,
  yellow_flags,
  idle_days

FROM deal_scores;

-- Estatísticas de priorização
SELECT
  priority_level,
  COUNT(*) AS deals_count,
  ROUND(AVG(priority_score), 1) AS avg_score,
  SUM(Gross_Value) AS total_value,
  ROUND(AVG(confidence_base), 1) AS avg_confidence,
  ROUND(AVG(prob_abandono), 2) AS avg_prob_abandono
FROM `sales_intelligence.pipeline_prioridade_deals`
GROUP BY priority_level
ORDER BY 
  CASE priority_level
    WHEN 'CRÍTICO' THEN 1
    WHEN 'ALTO' THEN 2
    WHEN 'MÉDIO' THEN 3
    WHEN 'BAIXO' THEN 4
  END;

-- Top 20 deals prioritários (para dashboard)
SELECT
  opportunity,
  Vendedor,
  Gross_Value,
  priority_score,
  priority_level,
  ranking,
  recomendacao_foco,
  dias_previstos,
  velocidade_prevista,
  nivel_risco
FROM `sales_intelligence.pipeline_prioridade_deals`
ORDER BY priority_score DESC
LIMIT 20;

-- Alocação de tempo por vendedor (baseada em prioridades)
SELECT
  Vendedor,
  COUNT(*) AS total_deals,
  SUM(CASE WHEN priority_level = 'CRÍTICO' THEN 1 ELSE 0 END) AS critico_count,
  SUM(CASE WHEN priority_level = 'ALTO' THEN 1 ELSE 0 END) AS alto_count,
  SUM(CASE WHEN priority_level = 'MÉDIO' THEN 1 ELSE 0 END) AS medio_count,
  SUM(CASE WHEN priority_level = 'BAIXO' THEN 1 ELSE 0 END) AS baixo_count,
  
  -- Recomendação de alocação de tempo (baseada na fórmula)
  ROUND(
    (SUM(CASE WHEN priority_level = 'CRÍTICO' THEN 1 ELSE 0 END) * 45) +
    (SUM(CASE WHEN priority_level = 'ALTO' THEN 1 ELSE 0 END) * 25) +
    (SUM(CASE WHEN priority_level = 'MÉDIO' THEN 1 ELSE 0 END) * 12.5) +
    (SUM(CASE WHEN priority_level = 'BAIXO' THEN 1 ELSE 0 END) * 5)
  , 0) AS horas_semana_recomendadas,
  
  SUM(Gross_Value) AS total_pipeline_value
FROM `sales_intelligence.pipeline_prioridade_deals`
GROUP BY Vendedor
ORDER BY horas_semana_recomendadas DESC;
