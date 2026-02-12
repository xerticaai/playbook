-- ==========================================================================
-- VIEW 5: Prioridade de Deals (SCORING)
-- ==========================================================================
-- Objetivo: gerar score (0-100) e nível de prioridade para o pipeline.
-- Saída consumida pelo dashboard/API:
--   - VIEW: sales_intelligence.pipeline_prioridade_deals
-- ============================================================================

CREATE OR REPLACE VIEW `sales_intelligence.pipeline_prioridade_deals` AS
WITH base AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Vendedor,
    SAFE_CAST(p.Gross AS FLOAT64) AS Gross,
    SAFE_CAST(p.Net AS FLOAT64) AS Net,
    p.Fase_Atual,
    p.Fiscal_Q,
    p.Data_Prevista,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista),
      SAFE.PARSE_DATE('%d-%m-%Y', p.Data_Prevista)
    ) AS Data_Prevista_Date,

    SAFE_CAST(p.Confianca AS FLOAT64) AS Confianca_pct,
    SAFE_CAST(p.MEDDIC_Score AS FLOAT64) AS MEDDIC_Score,
    SAFE_CAST(p.BANT_Score AS FLOAT64) AS BANT_Score,
    SAFE_CAST(p.Idle_Dias AS INT64) AS Idle_Dias,
    SAFE_CAST(p.Atividades AS INT64) AS Atividades,
    SAFE_CAST(p.Dias_Funil AS INT64) AS Dias_Funil,

    ciclo.dias_previstos,
    ciclo.velocidade_prevista,
    risco.prob_abandono,
    risco.nivel_risco,
    perda.causa_prevista

  FROM `sales_intelligence.pipeline` p
  LEFT JOIN `sales_intelligence.pipeline_previsao_ciclo` ciclo
    ON p.Oportunidade = ciclo.opportunity
  LEFT JOIN `sales_intelligence.pipeline_risco_abandono` risco
    ON p.Oportunidade = risco.opportunity
  LEFT JOIN `sales_intelligence.pipeline_classificador_perda` perda
    ON p.Oportunidade = perda.opportunity
  WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
),
scored AS (
  SELECT
    *,

    -- Probabilidade de win (0-100) aproximada
    (
      COALESCE(Confianca_pct, 0) * 0.5 +
      COALESCE(MEDDIC_Score, 0) * 0.3 +
      COALESCE(BANT_Score, 0) * 0.2
    ) AS win_prob_score,

    -- Valor normalizado (0-100)
    PERCENT_RANK() OVER (ORDER BY Gross) * 100 AS value_score,

    -- Urgência por data prevista
    CASE
      WHEN Data_Prevista_Date IS NULL THEN 40
      WHEN DATE_DIFF(Data_Prevista_Date, CURRENT_DATE(), DAY) <= 7 THEN 100
      WHEN DATE_DIFF(Data_Prevista_Date, CURRENT_DATE(), DAY) <= 30 THEN 80
      WHEN DATE_DIFF(Data_Prevista_Date, CURRENT_DATE(), DAY) <= 60 THEN 60
      WHEN DATE_DIFF(Data_Prevista_Date, CURRENT_DATE(), DAY) <= 90 THEN 40
      ELSE 20
    END AS urgency_score_date,

    -- Urgência por velocidade prevista (modelo 1)
    CASE
      WHEN velocidade_prevista = 'RÁPIDO' THEN 100
      WHEN velocidade_prevista = 'NORMAL' THEN 70
      WHEN velocidade_prevista = 'LENTO' THEN 40
      WHEN velocidade_prevista = 'MUITO_LENTO' THEN 20
      ELSE 50
    END AS urgency_score_ciclo,

    -- Retenção: quanto menor o risco, maior o score
    CASE
      WHEN COALESCE(prob_abandono, 0) >= 0.6 THEN 0
      WHEN COALESCE(prob_abandono, 0) >= 0.4 THEN 40
      ELSE 100
    END AS retention_score

  FROM base
)
SELECT
  opportunity,
  Gross,
  Net,
  Vendedor,
  Fiscal_Q,
  priority_score,
  CASE
    WHEN priority_score >= 80 THEN 'CRÍTICO'
    WHEN priority_score >= 60 THEN 'ALTO'
    WHEN priority_score >= 40 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS priority_level,
  RANK() OVER (ORDER BY priority_score DESC) AS ranking_global,
  dias_previstos,
  velocidade_prevista,
  prob_abandono,
  nivel_risco,
  causa_prevista
FROM (
  SELECT
    opportunity,
    Gross,
    Net,
    Vendedor,
    Fiscal_Q,
    dias_previstos,
    velocidade_prevista,
    prob_abandono,
    nivel_risco,
    causa_prevista,
    ROUND(
      (win_prob_score * 0.30) +
      (value_score * 0.30) +
      (((urgency_score_ciclo + urgency_score_date) / 2) * 0.20) +
      (retention_score * 0.20)
    , 1) AS priority_score
  FROM scored
)
;
