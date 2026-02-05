-- ========================================================================
-- VIEW: Prioridade de Deals (Deal Priority Score)
-- Tipo: View calculada (combina múltiplos modelos ML)
-- Objetivo: Ranquear deals do pipeline para foco do time de vendas
-- ========================================================================

-- NOTA: Esta view depende de 3 tabelas de predições já existentes:
-- 1. pipeline_ml_predictions (win/loss probability)
-- 2. pipeline_previsao_ciclo (sales cycle prediction)
-- 3. pipeline_risco_abandono (churn risk prediction)

-- PASSO 1: Criar view de priorização
-- ===================================
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.pipeline_prioridade_deals_v` AS
WITH deal_scores AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Gross AS gross_value,
    p.Net AS net_value,
    p.Vendedor,
    p.Fase_Atual,
    p.Perfil AS segmento,
    p.Fiscal_Q AS fiscal_quarter,
    
    -- Scores dos modelos ML (normalizar 0-100)
    COALESCE(wl.win_probability * 100, 50) AS win_prob_score, -- Default 50 se não tiver predição
    
    -- Urgência baseada em ciclo previsto (inverter: menor ciclo = maior urgência)
    COALESCE(
      CASE
        WHEN pc.dias_previstos <= 30 THEN 100
        WHEN pc.dias_previstos <= 60 THEN 75
        WHEN pc.dias_previstos <= 90 THEN 50
        ELSE 25
      END,
      50
    ) AS urgency_score,
    
    -- Risco de abandono (inverter: maior risco = maior prioridade para salvar)
    COALESCE((1 - ra.prob_abandono) * 100, 70) AS retention_score,
    
    -- Valor normalizado (0-100, baseado em quantile do pipeline)
    PERCENT_RANK() OVER (ORDER BY p.Gross) * 100 AS value_score,
    
    -- Features adicionais para análise
    p.MEDDIC_Score,
    p.BANT_Score,
    p.Atividades_Peso,
    p.Idle_Dias,
    pc.dias_previstos,
    pc.velocidade_prevista,
    ra.nivel_risco AS risco_abandono,
    wl.risk_category AS risco_perda
    
  FROM
    `operaciones-br.sales_intelligence.pipeline` p
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_ml_predictions` wl
  ON
    p.Oportunidade = wl.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_previsao_ciclo` pc
  ON
    p.Oportunidade = pc.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_risco_abandono` ra
  ON
    p.Oportunidade = ra.opportunity
  
  WHERE
    p.Gross > 0
),
final_scores AS (
  SELECT
    *,
    
    -- Fórmula de priorização (pesos ajustáveis)
    ROUND(
      (win_prob_score * 0.30) +      -- 30% peso: probabilidade de ganhar
      (value_score * 0.30) +          -- 30% peso: valor do deal
      (urgency_score * 0.20) +        -- 20% peso: urgência (ciclo curto)
      (retention_score * 0.20),       -- 20% peso: risco de abandono
      2
    ) AS priority_score,
    
    -- Classificação de prioridade
    CASE
      WHEN (
        (win_prob_score * 0.30) +
        (value_score * 0.30) +
        (urgency_score * 0.20) +
        (retention_score * 0.20)
      ) >= 80 THEN 'CRÍTICO'
      WHEN (
        (win_prob_score * 0.30) +
        (value_score * 0.30) +
        (urgency_score * 0.20) +
        (retention_score * 0.20)
      ) >= 60 THEN 'ALTO'
      WHEN (
        (win_prob_score * 0.30) +
        (value_score * 0.30) +
        (urgency_score * 0.20) +
        (retention_score * 0.20)
      ) >= 40 THEN 'MÉDIO'
      ELSE 'BAIXO'
    END AS priority_level
    
  FROM
    deal_scores
)
SELECT
  opportunity,
  Vendedor,
  Segmento,
  Fase_Atual,
  gross_value,
  net_value,
  Fiscal_Quarter AS fiscal_quarter,
  
  -- Scores finais
  priority_score,
  priority_level,
  
  -- Breakdown dos scores
  ROUND(win_prob_score, 1) AS win_prob_pct,
  ROUND(value_score, 1) AS value_percentile,
  ROUND(urgency_score, 1) AS urgency_pct,
  ROUND(retention_score, 1) AS retention_pct,
  
  -- Diagnóstico
  MEDDIC_Score,
  BANT_Score,
  Atividades_Peso,
  Idle_Dias,
  dias_previstos,
  velocidade_prevista,
  risco_abandono,
  risco_perda,
  
  -- Recomendação de foco
  CASE priority_level
    WHEN 'CRÍTICO' THEN '🔥 MÁXIMA PRIORIDADE: Foco imediato, daily check-ins, escalar se necessário'
    WHEN 'ALTO' THEN '🎯 ALTA PRIORIDADE: Dedicar 60%+ do tempo, follow-ups frequentes'
    WHEN 'MÉDIO' THEN '➡️ MÉDIA PRIORIDADE: Manter no radar, follow-ups semanais'
    ELSE '⬇️ BAIXA PRIORIDADE: Cultivar, follow-ups mensais'
  END AS recomendacao_foco,
  
  -- Ranking global
  ROW_NUMBER() OVER (ORDER BY priority_score DESC, gross_value DESC) AS ranking_global,
  
  -- Ranking por vendedor
  ROW_NUMBER() OVER (PARTITION BY Vendedor ORDER BY priority_score DESC, gross_value DESC) AS ranking_vendedor
  
FROM
  final_scores;


-- PASSO 2: Materializar view em tabela (para performance)
-- =========================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_prioridade_deals` AS
SELECT * FROM `operaciones-br.sales_intelligence.pipeline_prioridade_deals_v`;


-- PASSO 3: Ver top 20 deals para focar AGORA
-- ===========================================
SELECT
  ranking_global,
  opportunity,
  Vendedor,
  Fase_Atual,
  ROUND(gross_value / 1000, 1) AS gross_k,
  priority_score,
  priority_level,
  ROUND(win_prob_pct, 0) AS win_pct,
  dias_previstos,
  risco_abandono,
  recomendacao_foco
FROM
  `operaciones-br.sales_intelligence.pipeline_prioridade_deals`
WHERE
  priority_level IN ('CRÍTICO', 'ALTO')
ORDER BY
  ranking_global
LIMIT 20;


-- PASSO 4: Top 10 por vendedor (para distribuição de foco)
-- =========================================================
SELECT
  Vendedor,
  COUNT(CASE WHEN priority_level = 'CRÍTICO' THEN 1 END) AS criticos,
  COUNT(CASE WHEN priority_level = 'ALTO' THEN 1 END) AS altos,
  COUNT(CASE WHEN priority_level = 'MÉDIO' THEN 1 END) AS medios,
  COUNT(CASE WHEN priority_level = 'BAIXO' THEN 1 END) AS baixos,
  COUNT(*) AS total_deals,
  ROUND(AVG(priority_score), 1) AS avg_score,
  ROUND(SUM(CASE WHEN priority_level = 'CRÍTICO' THEN gross_value ELSE 0 END) / 1000000, 2) AS valor_critico_m
FROM
  `operaciones-br.sales_intelligence.pipeline_prioridade_deals`
GROUP BY
  Vendedor
ORDER BY
  criticos DESC,
  avg_score DESC;


-- PASSO 5: Deals depriorizados (considerar descontinuar)
-- =======================================================
SELECT
  opportunity,
  Vendedor,
  Fase_Atual,
  ROUND(gross_value / 1000, 1) AS gross_k,
  priority_score,
  priority_level,
  ROUND(win_prob_pct, 0) AS win_pct,
  dias_previstos,
  risco_abandono,
  Idle_Dias,
  MEDDIC_Score,
  'Considerar descontinuar se não houver mudança significativa' AS sugestao
FROM
  `operaciones-br.sales_intelligence.pipeline_prioridade_deals`
WHERE
  priority_level = 'BAIXO'
  AND Idle_Dias > 14
  AND MEDDIC_Score < 50
ORDER BY
  priority_score ASC
LIMIT 20;


-- PASSO 6: Análise de alocação de tempo recomendada
-- ===================================================
WITH time_allocation AS (
  SELECT
    Vendedor,
    priority_level,
    COUNT(*) AS qtd_deals,
    CASE priority_level
      WHEN 'CRÍTICO' THEN 60 -- 60% do tempo
      WHEN 'ALTO' THEN 30    -- 30% do tempo
      WHEN 'MÉDIO' THEN 8    -- 8% do tempo
      WHEN 'BAIXO' THEN 2    -- 2% do tempo
    END AS peso_tempo
  FROM
    `operaciones-br.sales_intelligence.pipeline_prioridade_deals`
  GROUP BY
    Vendedor,
    priority_level
)
SELECT
  Vendedor,
  SUM(CASE WHEN priority_level = 'CRÍTICO' THEN qtd_deals ELSE 0 END) AS deals_criticos,
  SUM(CASE WHEN priority_level = 'ALTO' THEN qtd_deals ELSE 0 END) AS deals_altos,
  SUM(qtd_deals) AS total_deals,
  CONCAT(
    ROUND(SUM(CASE WHEN priority_level = 'CRÍTICO' THEN peso_tempo * qtd_deals END) / SUM(peso_tempo * qtd_deals) * 100, 0),
    '% em Críticos, ',
    ROUND(SUM(CASE WHEN priority_level = 'ALTO' THEN peso_tempo * qtd_deals END) / SUM(peso_tempo * qtd_deals) * 100, 0),
    '% em Altos'
  ) AS alocacao_recomendada
FROM
  time_allocation
GROUP BY
  Vendedor
ORDER BY
  deals_criticos DESC;


-- PASSO 7: Agendar atualização automática (scheduled query)
-- ==========================================================
-- Criar scheduled query para rodar diariamente:
-- 1. Ir para BigQuery > Scheduled Queries
-- 2. Criar nova query agendada
-- 3. Copiar o código do PASSO 2 (materializar tabela)
-- 4. Agendar para rodar todo dia às 6h30 da manhã (após outros modelos)
