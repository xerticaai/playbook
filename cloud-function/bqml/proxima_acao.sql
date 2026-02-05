-- ========================================================================
-- VIEW: Próxima Ação (Next Best Action)
-- Tipo: Rule-based recommendation engine
-- Objetivo: Sugerir a próxima melhor ação para cada deal do pipeline
-- ========================================================================

-- 📊 REFERÊNCIA DE SCHEMA - EVITAR ERROS DE NOMENCLATURA
-- ========================================================================
-- TABELA: pipeline (270 deals ativos)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Oportunidade (STRING - chave)
-- ========================================================================

-- NOTA: Esta view depende de múltiplas tabelas de predições:
-- 1. pipeline_ml_predictions (win/loss probability)
-- 2. pipeline_classificador_perda (loss cause classifier)
-- 3. pipeline_risco_abandono (churn risk)
-- 4. pipeline_previsao_ciclo (cycle prediction)
-- 5. pipeline_prioridade_deals (priority score)

-- PASSO 1: Criar view de recomendações
-- =====================================
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.pipeline_proxima_acao_v` AS
WITH deal_analysis AS (
  SELECT
    p.Oportunidade AS opportunity,
    p.Vendedor,
    p.Perfil AS segmento,
    p.Fase_Atual,
    p.Gross AS gross_value,
    p.Net AS net_value,
    p.Fiscal_Q AS fiscal_quarter,
    
    -- Scores e métricas
    p.MEDDIC_Score,
    p.BANT_Score,
    p.Atividades_Peso,
    p.Idle_Dias,
    p.Flags_de_Risco AS red_flags,
    '' AS yellow_flags,  -- Coluna não existe em pipeline
    p.Mudanas_Crticas AS mudancas_criticas,
    
    -- Predições dos modelos
    COALESCE(wl.win_probability, 0.5) AS win_prob,
    COALESCE(wl.risk_category, 'MÉDIO') AS risco_perda,
    
    COALESCE(cp.causa_prevista, 'DESCONHECIDO') AS causa_provavel_perda,
    COALESCE(cp.confianca_predicao, 0) AS confianca_perda,
    
    COALESCE(ra.nivel_risco, 'MÉDIO') AS risco_abandono,
    COALESCE(ra.prob_abandono, 0.5) AS prob_abandono,
    
    COALESCE(pc.dias_previstos, 60) AS dias_para_fechar,
    COALESCE(pc.velocidade_prevista, 'NORMAL') AS velocidade,
    
    COALESCE(pr.priority_score, 50) AS prioridade,
    COALESCE(pr.priority_level, 'MÉDIO') AS nivel_prioridade,
    
    -- Gaps de qualificação
    CASE WHEN p.MEDDIC_Score < 50 THEN TRUE ELSE FALSE END AS meddic_gap,
    CASE WHEN p.BANT_Score < 50 THEN TRUE ELSE FALSE END AS bant_gap,
    CASE WHEN p.Atividades_Peso < 10 THEN TRUE ELSE FALSE END AS engagement_gap,
    CASE WHEN p.Idle_Dias > 7 THEN TRUE ELSE FALSE END AS idle_gap
    
  FROM
    `operaciones-br.sales_intelligence.pipeline` p
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_ml_predictions` wl
  ON p.Oportunidade = wl.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_classificador_perda` cp
  ON p.Oportunidade = cp.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_risco_abandono` ra
  ON p.Oportunidade = ra.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_previsao_ciclo` pc
  ON p.Oportunidade = pc.opportunity
  
  LEFT JOIN
    `operaciones-br.sales_intelligence.pipeline_prioridade_deals` pr
  ON p.Oportunidade = pr.opportunity
  
  WHERE
    p.Gross > 0
),
action_logic AS (
  SELECT
    *,
    
    -- REGRA 1: Deals em risco de abandono (máxima urgência)
    CASE
      WHEN risco_abandono = 'ALTO' AND Idle_Dias > 14 THEN 
        STRUCT(
          'URGENTE_REATIVAR' AS categoria,
          '🚨 Follow-up urgente em 24h: Deal parado há ' || CAST(Idle_Dias AS STRING) || ' dias com alto risco de abandono' AS acao,
          'ALTA' AS urgencia,
          1 AS ordem_prioridade,
          CONCAT('Ligar para ', Vendedor, ' e agendar reunião com stakeholder principal. Risco abandono: ', CAST(ROUND(prob_abandono * 100, 0) AS STRING), '%') AS detalhes
        )
      
      -- REGRA 2: Deals com causa de perda previsível (ação preventiva)
      WHEN causa_provavel_perda = 'PRECO' AND confianca_perda >= 0.6 THEN
        STRUCT(
          'PREVENIR_PERDA_PRECO' AS categoria,
          '💰 Reforçar ROI e value proposition: Modelo prevê perda por PREÇO com ' || CAST(ROUND(confianca_perda * 100, 0) AS STRING) || '% confiança' AS acao,
          'ALTA' AS urgencia,
          2 AS ordem_prioridade,
          'Preparar case study de ROI, agendar call com Finance para justificar investimento, considerar desconto estratégico se necessário' AS detalhes
        )
      
      WHEN causa_provavel_perda = 'TIMING' AND confianca_perda >= 0.6 THEN
        STRUCT(
          'PREVENIR_PERDA_TIMING' AS categoria,
          '⏰ Criar urgência e ajustar timeline: Modelo prevê perda por TIMING com ' || CAST(ROUND(confianca_perda * 100, 0) AS STRING) || '% confiança' AS acao,
          'ALTA' AS urgencia,
          2 AS ordem_prioridade,
          'Identificar trigger event, criar senso de urgência, considerar pilotos rápidos, reduzir escopo para acelerar' AS detalhes
        )
      
      WHEN causa_provavel_perda = 'CONCORRENTE' AND confianca_perda >= 0.6 THEN
        STRUCT(
          'PREVENIR_PERDA_CONCORRENTE' AS categoria,
          '🎯 Reforçar diferenciais competitivos: Modelo prevê perda por CONCORRENTE com ' || CAST(ROUND(confianca_perda * 100, 0) AS STRING) || '% confiança' AS acao,
          'ALTA' AS urgencia,
          2 AS ordem_prioridade,
          'Battle card contra concorrente, highlight features exclusivos, customer references similares, considerar POC comparativa' AS detalhes
        )
      
      WHEN causa_provavel_perda = 'BUDGET' AND confianca_perda >= 0.6 THEN
        STRUCT(
          'PREVENIR_PERDA_BUDGET' AS categoria,
          '💸 Validar budget e envolver Finance: Modelo prevê perda por BUDGET com ' || CAST(ROUND(confianca_perda * 100, 0) AS STRING) || '% confiança' AS acao,
          'ALTA' AS urgencia,
          2 AS ordem_prioridade,
          'Multi-thread com CFO, propor phased approach, considerar financing options, reduzir escopo se necessário' AS detalhes
        )
      
      -- REGRA 3: Gaps de qualificação (corrigir antes que seja tarde)
      WHEN meddic_gap AND BANT_Score > 50 THEN
        STRUCT(
          'QUALIFICAR_MEDDIC' AS categoria,
          '📋 Qualificação MEDDIC: Score atual ' || CAST(MEDDIC_Score AS STRING) || ' (abaixo de 50)' AS acao,
          'MÉDIA' AS urgencia,
          3 AS ordem_prioridade,
          'Identificar Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain. Usar template MEDDIC' AS detalhes
        )
      
      WHEN bant_gap AND MEDDIC_Score > 50 THEN
        STRUCT(
          'QUALIFICAR_BANT' AS categoria,
          '📋 Qualificação BANT: Score atual ' || CAST(BANT_Score AS STRING) || ' (abaixo de 50)' AS acao,
          'MÉDIA' AS urgencia,
          3 AS ordem_prioridade,
          'Validar Budget, Authority, Need, Timeline. Marcar reunião com decision maker e Finance' AS detalhes
        )
      
      -- REGRA 4: Baixo engajamento (reativar stakeholders)
      WHEN engagement_gap AND risco_abandono != 'BAIXO' THEN
        STRUCT(
          'AUMENTAR_ENGAJAMENTO' AS categoria,
          '🤝 Aumentar engajamento: Apenas ' || CAST(Atividades_Peso AS STRING) || ' atividades recentes' AS acao,
          'MÉDIA' AS urgencia,
          4 AS ordem_prioridade,
          'Agendar demo/workshop, envolver champion, criar executive briefing, multi-thread com outros stakeholders' AS detalhes
        )
      
      -- REGRA 5: Deal lento mas saudável (acelerar)
      WHEN velocidade = 'LENTO' AND win_prob > 0.6 AND risco_abandono = 'BAIXO' THEN
        STRUCT(
          'ACELERAR_DEAL' AS categoria,
          '⚡ Acelerar fechamento: Ciclo previsto de ' || CAST(dias_para_fechar AS STRING) || ' dias (acima da média)' AS acao,
          'MÉDIA' AS urgencia,
          5 AS ordem_prioridade,
          'Identificar blockers, envolver executive sponsor, criar urgência artificial, considerar incentivos de fechamento rápido' AS detalhes
        )
      
      -- REGRA 6: Deal rápido (não perder momentum)
      WHEN velocidade = 'RÁPIDO' AND win_prob > 0.5 THEN
        STRUCT(
          'MANTER_MOMENTUM' AS categoria,
          '🚀 Manter momentum: Deal avançando rápido (' || CAST(dias_para_fechar AS STRING) || ' dias para fechamento)' AS acao,
          'BAIXA' AS urgencia,
          6 AS ordem_prioridade,
          'Garantir que contratos estão prontos, legal review em paralelo, confirmar próximos passos semanalmente' AS detalhes
        )
      
      -- REGRA 7: Deal alto valor + alta prioridade (escalar)
      WHEN nivel_prioridade = 'CRÍTICO' AND gross_value > 100000 THEN
        STRUCT(
          'ESCALAR_EXECUTIVO' AS categoria,
          '👔 Escalar para executivo: Deal de $' || CAST(ROUND(gross_value / 1000, 0) AS STRING) || 'k com prioridade CRÍTICA' AS acao,
          'ALTA' AS urgencia,
          1 AS ordem_prioridade,
          'Envolver VP Sales, agendar executive dinner, considerar C-level engagement, criar war room se necessário' AS detalhes
        )
      
      -- REGRA 8: Deal com red flags (investigar e resolver)
      WHEN Red_Flags > 2 THEN
        STRUCT(
          'RESOLVER_RED_FLAGS' AS categoria,
          '🚩 Resolver red flags críticos: ' || CAST(Red_Flags AS STRING) || ' red flags detectados' AS acao,
          'ALTA' AS urgencia,
          2 AS ordem_prioridade,
          'Revisar cada red flag, criar plano de mitigação, escalar para manager se não resolver em 48h' AS detalhes
        )
      
      -- REGRA 9: Deal com yellow flags (monitorar)
      WHEN Yellow_Flags > 3 AND Red_Flags = 0 THEN
        STRUCT(
          'RESOLVER_YELLOW_FLAGS' AS categoria,
          '⚠️ Resolver yellow flags: ' || CAST(Yellow_Flags AS STRING) || ' alertas detectados' AS acao,
          'MÉDIA' AS urgencia,
          5 AS ordem_prioridade,
          'Revisar yellow flags, validar próximos passos, confirmar timeline, verificar stakeholder engagement' AS detalhes
        )
      
      -- REGRA 10: Deal saudável (cultivar)
      WHEN win_prob > 0.7 AND risco_abandono = 'BAIXO' AND Red_Flags = 0 THEN
        STRUCT(
          'CULTIVAR_RELACIONAMENTO' AS categoria,
          '✅ Deal saudável: Manter cadência regular de follow-ups' AS acao,
          'BAIXA' AS urgencia,
          7 AS ordem_prioridade,
          'Check-in semanal, manter stakeholders engajados, preparar próxima fase, garantir documentação atualizada' AS detalhes
        )
      
      -- REGRA DEFAULT: Análise manual necessária
      ELSE
        STRUCT(
          'ANALISE_MANUAL' AS categoria,
          '🔍 Análise manual recomendada: Situação não mapeada pelo modelo' AS acao,
          'MÉDIA' AS urgencia,
          6 AS ordem_prioridade,
          'Revisar deal com manager, validar estratégia atual, considerar ajustes de approach' AS detalhes
        )
    END AS proxima_acao
    
  FROM
    deal_analysis
)
SELECT
  opportunity,
  Vendedor,
  Segmento,
  Fase_Atual,
  Gross_Value,
  Net_Value,
  Fiscal_Quarter,
  
  -- Ação recomendada
  proxima_acao.categoria AS categoria_acao,
  proxima_acao.acao AS acao_recomendada,
  proxima_acao.urgencia AS urgencia,
  proxima_acao.detalhes AS detalhes_execucao,
  proxima_acao.ordem_prioridade,
  
  -- Diagnóstico
  ROUND(win_prob * 100, 0) AS win_probability_pct,
  risco_perda,
  causa_provavel_perda,
  risco_abandono,
  nivel_prioridade,
  
  -- Métricas de saúde
  MEDDIC_Score,
  BANT_Score,
  Atividades_Peso,
  Idle_Dias,
  Red_Flags,
  Yellow_Flags,
  
  -- Timeline
  dias_para_fechar,
  velocidade,
  
  -- Flags de gaps
  meddic_gap,
  bant_gap,
  engagement_gap,
  idle_gap
  
FROM
  action_logic;


-- PASSO 2: Materializar view em tabela (para performance)
-- =========================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_proxima_acao` AS
SELECT * FROM `operaciones-br.sales_intelligence.pipeline_proxima_acao_v`;


-- PASSO 3: Ações urgentes para HOJE (prioridade máxima)
-- =======================================================
SELECT
  ordem_prioridade,
  categoria_acao,
  opportunity,
  Vendedor,
  ROUND(Gross_Value / 1000, 1) AS gross_k,
  urgencia,
  acao_recomendada,
  detalhes_execucao
FROM
  `operaciones-br.sales_intelligence.pipeline_proxima_acao`
WHERE
  urgencia = 'ALTA'
ORDER BY
  ordem_prioridade,
  Gross_Value DESC;


-- PASSO 4: Ações por vendedor (para planejamento semanal)
-- ========================================================
SELECT
  Vendedor,
  COUNT(CASE WHEN urgencia = 'ALTA' THEN 1 END) AS acoes_urgentes,
  COUNT(CASE WHEN urgencia = 'MÉDIA' THEN 1 END) AS acoes_medias,
  COUNT(CASE WHEN urgencia = 'BAIXA' THEN 1 END) AS acoes_baixas,
  COUNT(*) AS total_deals,
  ROUND(SUM(CASE WHEN urgencia = 'ALTA' THEN Gross_Value ELSE 0 END) / 1000000, 2) AS valor_urgente_m,
  ROUND(SUM(Gross_Value) / 1000000, 2) AS valor_total_m
FROM
  `operaciones-br.sales_intelligence.pipeline_proxima_acao`
GROUP BY
  Vendedor
ORDER BY
  acoes_urgentes DESC,
  valor_urgente_m DESC;


-- PASSO 5: Distribuição de ações por categoria
-- ==============================================
SELECT
  categoria_acao,
  urgencia,
  COUNT(*) AS qtd_deals,
  ROUND(AVG(win_probability_pct), 0) AS avg_win_prob,
  ROUND(SUM(Gross_Value) / 1000000, 2) AS valor_total_m,
  ARRAY_AGG(DISTINCT Vendedor LIMIT 3) AS vendedores_afetados
FROM
  `operaciones-br.sales_intelligence.pipeline_proxima_acao`
GROUP BY
  categoria_acao,
  urgencia
ORDER BY
  urgencia DESC,
  qtd_deals DESC;


-- PASSO 6: Playbook de ações (top 5 por urgência)
-- =================================================
WITH top_actions AS (
  SELECT
    categoria_acao,
    urgencia,
    COUNT(*) AS frequencia,
    AVG(win_probability_pct) AS avg_win_prob,
    SUM(Gross_Value) / 1000000 AS valor_total_m
  FROM
    `operaciones-br.sales_intelligence.pipeline_proxima_acao`
  GROUP BY
    categoria_acao,
    urgencia
)
SELECT
  categoria_acao,
  urgencia,
  frequencia,
  ROUND(avg_win_prob, 0) AS avg_win_prob_pct,
  ROUND(valor_total_m, 2) AS valor_m,
  CASE categoria_acao
    WHEN 'URGENTE_REATIVAR' THEN '1. Ligar em 24h | 2. Agendar reunião | 3. Escalar se necessário'
    WHEN 'PREVENIR_PERDA_PRECO' THEN '1. ROI calculator | 2. Case study | 3. Finance call | 4. Considerar desconto'
    WHEN 'PREVENIR_PERDA_TIMING' THEN '1. Identificar trigger | 2. Criar urgência | 3. Propor piloto | 4. Reduzir escopo'
    WHEN 'PREVENIR_PERDA_CONCORRENTE' THEN '1. Battle card | 2. Highlight diferenciais | 3. Reference account | 4. POC'
    WHEN 'PREVENIR_PERDA_BUDGET' THEN '1. Multi-thread CFO | 2. Phased approach | 3. Financing options | 4. Reduzir escopo'
    WHEN 'QUALIFICAR_MEDDIC' THEN '1. Template MEDDIC | 2. Gap analysis | 3. Stakeholder mapping | 4. Next steps'
    WHEN 'QUALIFICAR_BANT' THEN '1. Budget validation | 2. Authority confirmation | 3. Need assessment | 4. Timeline'
    WHEN 'AUMENTAR_ENGAJAMENTO' THEN '1. Demo/workshop | 2. Champion activation | 3. Executive briefing | 4. Multi-thread'
    WHEN 'ACELERAR_DEAL' THEN '1. Identify blockers | 2. Executive sponsor | 3. Create urgency | 4. Incentivos'
    WHEN 'MANTER_MOMENTUM' THEN '1. Contracts ready | 2. Legal review | 3. Weekly check-ins | 4. Remove friction'
    WHEN 'ESCALAR_EXECUTIVO' THEN '1. VP Sales | 2. Executive dinner | 3. C-level engagement | 4. War room'
    WHEN 'RESOLVER_RED_FLAGS' THEN '1. List all flags | 2. Mitigation plan | 3. 48h deadline | 4. Escalar manager'
    WHEN 'RESOLVER_YELLOW_FLAGS' THEN '1. Review flags | 2. Validate next steps | 3. Confirm timeline | 4. Stakeholder check'
    WHEN 'CULTIVAR_RELACIONAMENTO' THEN '1. Weekly check-in | 2. Keep engaged | 3. Prepare next phase | 4. Update docs'
    ELSE '1. Manager review | 2. Strategy validation | 3. Approach adjustment'
  END AS checklist_acao
FROM
  top_actions
WHERE
  urgencia IN ('ALTA', 'MÉDIA')
ORDER BY
  urgencia DESC,
  frequencia DESC
LIMIT 10;


-- PASSO 7: Agendar atualização automática (scheduled query)
-- ==========================================================
-- Criar scheduled query para rodar diariamente:
-- 1. Ir para BigQuery > Scheduled Queries
-- 2. Criar nova query agendada
-- 3. Copiar o código do PASSO 2 (materializar tabela)
-- 4. Agendar para rodar todo dia às 7h da manhã (após todos outros modelos)
