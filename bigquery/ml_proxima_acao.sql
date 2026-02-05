-- ============================================================================
-- MODELO 6: RECOMENDADOR DE PRÓXIMA AÇÃO (RULE-BASED)
-- ============================================================================
-- Tipo: Rule-based recommendation engine
-- Objetivo: Recomendar próxima ação baseada em outputs de TODOS os modelos ML
-- Output: categoria_acao, acao_recomendada, urgencia, detalhes_execucao, checklist
--
-- Deploy:
--   bq query --use_legacy_sql=false < bigquery/ml_proxima_acao.sql
-- ============================================================================

-- Criar VIEW de recomendações (usa todos os modelos anteriores)
CREATE OR REPLACE VIEW `sales_intelligence.pipeline_proxima_acao` AS
WITH deal_context AS (
  SELECT
    p.opportunity_name AS opportunity,
    p.Gross_Value,
    p.Net_Value,
    p.Vendedor,
    p.Segmento,
    p.Stage AS Fase_Atual,
    p.Fiscal_Q AS Fiscal_Quarter,
    CAST(p.Confidence AS FLOAT64) AS confidence,
    CAST(p.MEDDIC_Score AS FLOAT64) AS meddic_score,
    CAST(p.BANT_Score AS FLOAT64) AS bant_score,
    CAST(p.Red_Flags AS INT64) AS red_flags,
    CAST(p.Yellow_Flags AS INT64) AS yellow_flags,
    CAST(p.Idle_Days AS INT64) AS idle_days,
    CAST(p.Atividades AS INT64) AS atividades,
    CAST(p.Qtd_Reunioes AS INT64) AS qtd_reunioes,
    
    -- Outputs dos modelos ML
    ciclo.dias_previstos,
    ciclo.velocidade_prevista,
    risco.prob_abandono,
    risco.nivel_risco,
    perda.causa_prevista,
    perda.confianca_predicao AS confianca_causa_perda,
    prio.priority_score,
    prio.priority_level,
    prio.ranking,
    
    -- Close date
    CASE
      WHEN p.Close_Date IS NOT NULL THEN DATE_DIFF(PARSE_DATE('%d/%m/%Y', p.Close_Date), CURRENT_DATE(), DAY)
      ELSE 999
    END AS dias_ate_close
    
  FROM `sales_intelligence.pipeline` p
  LEFT JOIN `sales_intelligence.pipeline_previsao_ciclo` ciclo 
    ON p.opportunity_name = ciclo.opportunity
  LEFT JOIN `sales_intelligence.pipeline_risco_abandono` risco 
    ON p.opportunity_name = risco.opportunity
  LEFT JOIN `sales_intelligence.pipeline_classificador_perda` perda 
    ON p.opportunity_name = perda.opportunity
  LEFT JOIN `sales_intelligence.pipeline_prioridade_deals` prio 
    ON p.opportunity_name = prio.opportunity
)
SELECT
  opportunity,
  Gross_Value,
  Net_Value,
  Vendedor,
  Segmento,
  Fase_Atual,
  Fiscal_Quarter,
  priority_level,
  ranking,
  
  -- ========== REGRA 1: REATIVAR DEAL URGENTE (Idle > 14 dias + Alta Prioridade) ==========
  CASE
    WHEN idle_days > 14 AND priority_level IN ('CRÍTICO', 'ALTO') 
    THEN 'REATIVAR_URGENTE'
    
    -- ========== REGRA 2: PREVENIR PERDA (Alto Risco Abandono) ==========
    WHEN prob_abandono >= 0.6 AND Gross_Value > 50000
    THEN 'PREVENIR_PERDA'
    
    -- ========== REGRA 3: QUALIFICAR MEDDIC/BANT (Scores baixos) ==========
    WHEN (meddic_score < 40 OR bant_score < 40) AND dias_ate_close <= 30
    THEN 'QUALIFICAR_MEDDIC_BANT'
    
    -- ========== REGRA 4: AUMENTAR ENGAJAMENTO (Poucas atividades recentes) ==========
    WHEN atividades < 3 AND idle_days > 7 AND priority_level != 'BAIXO'
    THEN 'AUMENTAR_ENGAJAMENTO'
    
    -- ========== REGRA 5: ACELERAR CICLO (Lento + Alta Confiança) ==========
    WHEN velocidade_prevista IN ('LENTO', 'MUITO_LENTO') AND confidence > 50
    THEN 'ACELERAR_CICLO'
    
    -- ========== REGRA 6: ESCALAR (Muitos Red Flags) ==========
    WHEN red_flags >= 3 OR (red_flags >= 2 AND Gross_Value > 100000)
    THEN 'ESCALAR_MANAGER'
    
    -- ========== REGRA 7: RESOLVER FLAGS (Yellow Flags acumulados) ==========
    WHEN yellow_flags >= 5 OR (yellow_flags >= 3 AND idle_days > 14)
    THEN 'RESOLVER_FLAGS'
    
    -- ========== REGRA 8: FECHAR URGENTE (Próximo do Close Date + Alta Confiança) ==========
    WHEN dias_ate_close <= 7 AND confidence > 60
    THEN 'FECHAR_URGENTE'
    
    -- ========== REGRA 9: REVISAR PROPOSTA (Risco de perda por PREÇO) ==========
    WHEN causa_prevista = 'PRECO' AND confianca_causa_perda > 0.5
    THEN 'REVISAR_PROPOSTA'
    
    -- ========== REGRA 10: MANTER CADÊNCIA (Default - tudo OK) ==========
    ELSE 'MANTER_CADENCIA'
  END AS categoria_acao,
  
  -- Ação recomendada detalhada (baseada na categoria)
  CASE
    WHEN idle_days > 14 AND priority_level IN ('CRÍTICO', 'ALTO') 
    THEN CONCAT('Call executiva HOJE com ', Vendedor, ' para reativar deal. Status: ', idle_days, ' dias sem atividade.')
    
    WHEN prob_abandono >= 0.6 AND Gross_Value > 50000
    THEN CONCAT('URGENTE: Deal em risco crítico (', ROUND(prob_abandono * 100, 0), '% prob abandono). Agendar reunião executiva.')
    
    WHEN (meddic_score < 40 OR bant_score < 40) AND dias_ate_close <= 30
    THEN CONCAT('Qualificar MEDDIC/BANT antes de avançar. MEDDIC: ', ROUND(meddic_score, 0), ', BANT: ', ROUND(bant_score, 0), '. Close previsto em ', dias_ate_close, ' dias.')
    
    WHEN atividades < 3 AND idle_days > 7 AND priority_level != 'BAIXO'
    THEN CONCAT('Aumentar engajamento: apenas ', atividades, ' atividades recentes. Agendar demo/workshop.')
    
    WHEN velocidade_prevista IN ('LENTO', 'MUITO_LENTO') AND confidence > 50
    THEN CONCAT('Acelerar ciclo: previsto ', dias_previstos, ' dias (', velocidade_prevista, '). Próximo passo: proposta ou contrato.')
    
    WHEN red_flags >= 3 OR (red_flags >= 2 AND Gross_Value > 100000)
    THEN CONCAT('ESCALAR: ', red_flags, ' Red Flags identificados. Envolver VP/Diretor.')
    
    WHEN yellow_flags >= 5 OR (yellow_flags >= 3 AND idle_days > 14)
    THEN CONCAT('Resolver ', yellow_flags, ' Yellow Flags acumulados: revisar objeções, validar stakeholders.')
    
    WHEN dias_ate_close <= 7 AND confidence > 60
    THEN CONCAT('FECHAR AGORA: Close previsto em ', dias_ate_close, ' dias com ', ROUND(confidence, 0), '% confiança. Push final!')
    
    WHEN causa_prevista = 'PRECO' AND confianca_causa_perda > 0.5
    THEN CONCAT('Risco de perda por PREÇO (', ROUND(confianca_causa_perda * 100, 0), '% confiança). Revisar proposta, considerar desconto/pacote.')
    
    ELSE 'Manter cadência atual de follow-up. Deal saudável.'
  END AS acao_recomendada,
  
  -- Urgência (ALTA/MÉDIA/BAIXA)
  CASE
    WHEN idle_days > 14 AND priority_level IN ('CRÍTICO', 'ALTO') THEN 'ALTA'
    WHEN prob_abandono >= 0.6 AND Gross_Value > 50000 THEN 'ALTA'
    WHEN dias_ate_close <= 7 AND confidence > 60 THEN 'ALTA'
    WHEN red_flags >= 3 OR (red_flags >= 2 AND Gross_Value > 100000) THEN 'ALTA'
    WHEN (meddic_score < 40 OR bant_score < 40) AND dias_ate_close <= 30 THEN 'MÉDIA'
    WHEN atividades < 3 AND idle_days > 7 AND priority_level != 'BAIXO' THEN 'MÉDIA'
    WHEN velocidade_prevista IN ('LENTO', 'MUITO_LENTO') AND confidence > 50 THEN 'MÉDIA'
    WHEN yellow_flags >= 5 OR (yellow_flags >= 3 AND idle_days > 14) THEN 'MÉDIA'
    WHEN causa_prevista = 'PRECO' AND confianca_causa_perda > 0.5 THEN 'MÉDIA'
    ELSE 'BAIXA'
  END AS urgencia,
  
  -- Detalhes de execução (quem, quando, como)
  CASE
    WHEN idle_days > 14 AND priority_level IN ('CRÍTICO', 'ALTO') 
    THEN 'QUEM: Vendedor + Manager | QUANDO: Hoje | COMO: Call executiva 30min'
    
    WHEN prob_abandono >= 0.6 AND Gross_Value > 50000
    THEN 'QUEM: Vendedor + VP | QUANDO: Próx 24h | COMO: Reunião presencial/Zoom com decisores'
    
    WHEN (meddic_score < 40 OR bant_score < 40) AND dias_ate_close <= 30
    THEN 'QUEM: Vendedor | QUANDO: Esta semana | COMO: Discovery call focado em MEDDIC/BANT'
    
    WHEN atividades < 3 AND idle_days > 7 AND priority_level != 'BAIXO'
    THEN 'QUEM: Vendedor | QUANDO: Próx 48h | COMO: Email + Call de reengajamento'
    
    WHEN velocidade_prevista IN ('LENTO', 'MUITO_LENTO') AND confidence > 50
    THEN 'QUEM: Vendedor | QUANDO: Esta semana | COMO: Proposta customizada ou contrato draft'
    
    WHEN red_flags >= 3 OR (red_flags >= 2 AND Gross_Value > 100000)
    THEN 'QUEM: Manager/VP | QUANDO: Próx 48h | COMO: Review deal com executivo + plano ação'
    
    WHEN yellow_flags >= 5 OR (yellow_flags >= 3 AND idle_days > 14)
    THEN 'QUEM: Vendedor | QUANDO: Esta semana | COMO: Workshop técnico ou validação stakeholders'
    
    WHEN dias_ate_close <= 7 AND confidence > 60
    THEN 'QUEM: Vendedor | QUANDO: Hoje/amanhã | COMO: Call de fechamento + envio contrato'
    
    WHEN causa_prevista = 'PRECO' AND confianca_causa_perda > 0.5
    THEN 'QUEM: Vendedor + Pricing | QUANDO: Esta semana | COMO: Proposta revisada com ROI'
    
    ELSE 'QUEM: Vendedor | QUANDO: Cadência normal | COMO: Follow-up semanal'
  END AS detalhes_execucao,
  
  -- Checklist de próximos passos
  CASE
    WHEN idle_days > 14 AND priority_level IN ('CRÍTICO', 'ALTO') 
    THEN '1. Call urgente agendada? 2. Motivo inatividade identificado? 3. Próximo step definido? 4. Manager informado?'
    
    WHEN prob_abandono >= 0.6 AND Gross_Value > 50000
    THEN '1. Reunião executiva agendada? 2. Objeções mapeadas? 3. Plano B preparado? 4. Escalação ativada?'
    
    WHEN (meddic_score < 40 OR bant_score < 40) AND dias_ate_close <= 30
    THEN '1. Metrics validadas? 2. Economic Buyer confirmado? 3. Decision Criteria definidos? 4. Decision Process mapeado?'
    
    WHEN atividades < 3 AND idle_days > 7 AND priority_level != 'BAIXO'
    THEN '1. Email de reengajamento enviado? 2. Call agendada? 3. Value proposition reforçado? 4. Next steps claros?'
    
    WHEN velocidade_prevista IN ('LENTO', 'MUITO_LENTO') AND confidence > 50
    THEN '1. Proposta enviada? 2. Timeline definida? 3. Objeções endereçadas? 4. Contrato draft pronto?'
    
    WHEN red_flags >= 3 OR (red_flags >= 2 AND Gross_Value > 100000)
    THEN '1. Flags documentados? 2. Executivo envolvido? 3. Plano mitigação criado? 4. Go/No-Go decidido?'
    
    WHEN yellow_flags >= 5 OR (yellow_flags >= 3 AND idle_days > 14)
    THEN '1. Flags listados? 2. Stakeholders validados? 3. Objeções resolvidas? 4. POC/Demo realizado?'
    
    WHEN dias_ate_close <= 7 AND confidence > 60
    THEN '1. Contrato enviado? 2. Assinatura solicitada? 3. Objeções finais resolvidas? 4. Onboarding preparado?'
    
    WHEN causa_prevista = 'PRECO' AND confianca_causa_perda > 0.5
    THEN '1. ROI calculado? 2. Proposta revisada? 3. Desconto/pacote oferecido? 4. Value justificado?'
    
    ELSE '1. Follow-up semanal? 2. Status atualizado? 3. Próximo milestone clear? 4. Pipeline review agendado?'
  END AS checklist,
  
  -- Contexto para análise
  confidence,
  meddic_score,
  bant_score,
  idle_days,
  red_flags,
  yellow_flags,
  dias_previstos,
  velocidade_prevista,
  prob_abandono,
  nivel_risco,
  causa_prevista,
  dias_ate_close

FROM deal_context;

-- Estatísticas de recomendações
SELECT
  categoria_acao,
  urgencia,
  COUNT(*) AS deals_count,
  SUM(CASE WHEN urgencia = 'ALTA' THEN 1 ELSE 0 END) AS urgentes,
  SUM(Gross_Value) AS total_value,
  ROUND(AVG(confidence), 1) AS avg_confidence
FROM `sales_intelligence.pipeline_proxima_acao`
GROUP BY categoria_acao, urgencia
ORDER BY urgentes DESC, deals_count DESC;

-- Top 20 ações urgentes (para dashboard)
SELECT
  opportunity,
  Vendedor,
  Gross_Value,
  categoria_acao,
  acao_recomendada,
  urgencia,
  detalhes_execucao,
  priority_level,
  ranking
FROM `sales_intelligence.pipeline_proxima_acao`
WHERE urgencia = 'ALTA'
ORDER BY 
  CASE urgencia
    WHEN 'ALTA' THEN 1
    WHEN 'MÉDIA' THEN 2
    WHEN 'BAIXA' THEN 3
  END,
  Gross_Value DESC
LIMIT 20;

-- Workload por vendedor (ações pendentes)
SELECT
  Vendedor,
  COUNT(*) AS total_acoes,
  SUM(CASE WHEN urgencia = 'ALTA' THEN 1 ELSE 0 END) AS urgentes,
  SUM(CASE WHEN urgencia = 'MÉDIA' THEN 1 ELSE 0 END) AS medias,
  SUM(CASE WHEN urgencia = 'BAIXA' THEN 1 ELSE 0 END) AS baixas,
  SUM(Gross_Value) AS total_value_pendente,
  
  -- Distribuição de categorias de ação
  SUM(CASE WHEN categoria_acao = 'REATIVAR_URGENTE' THEN 1 ELSE 0 END) AS reativar,
  SUM(CASE WHEN categoria_acao = 'PREVENIR_PERDA' THEN 1 ELSE 0 END) AS prevenir,
  SUM(CASE WHEN categoria_acao = 'FECHAR_URGENTE' THEN 1 ELSE 0 END) AS fechar,
  SUM(CASE WHEN categoria_acao = 'ESCALAR_MANAGER' THEN 1 ELSE 0 END) AS escalar
  
FROM `sales_intelligence.pipeline_proxima_acao`
WHERE urgencia IN ('ALTA', 'MÉDIA')
GROUP BY Vendedor
ORDER BY urgentes DESC, total_value_pendente DESC;
