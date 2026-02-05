-- ============================================================================
-- VIEW 6: Próxima Ação Recomendada (RULE-BASED ENGINE)
-- ============================================================================

CREATE OR REPLACE VIEW `sales_intelligence.ml_proxima_acao_v2` AS

SELECT
  pr.Oportunidade,
  pr.Vendedor,
  pr.Perfil_Cliente,
  pr.Segmento,
  pr.Stage,
  pr.Close_Date,
  pr.Gross,
  pr.priority_score,
  pr.priority_level,
  pr.nivel_risco,
  pr.Atividades,
  pr.dias_em_pipeline,
  pr.dias_ate_close,
  
  -- CATEGORIA DA AÇÃO
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30 AND pr.nivel_risco = 'ALTO'
    THEN 'REATIVAR_URGENTE'
    
    WHEN pr.dias_ate_close < 0
    THEN 'REPLANEJAR_CLOSE'
    
    WHEN pr.dias_ate_close <= 7 AND pr.dias_ate_close >= 0 AND pr.nivel_risco IN ('ALTO', 'MÉDIO')
    THEN 'FECHAR_URGENTE'
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN 'PREVENIR_PERDA'
    
    WHEN pr.Gross > 100000 AND pr.priority_level IN ('CRÍTICO', 'ALTO')
    THEN 'PRIORIZAR_RECURSOS'
    
    WHEN pr.Atividades < 5 AND pr.nivel_risco IN ('ALTO', 'MÉDIO')
    THEN 'AUMENTAR_FREQUENCIA'
    
    ELSE 'MANTER_RITMO'
  END AS categoria_acao,
  
  -- URGÊNCIA
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30 AND pr.nivel_risco = 'ALTO'
    THEN 'ALTA'
    
    WHEN pr.dias_ate_close < 0
      OR (pr.dias_ate_close <= 7 AND pr.nivel_risco IN ('ALTO', 'MÉDIO'))
      OR pr.nivel_risco = 'ALTO'
    THEN 'ALTA'
    
    WHEN pr.nivel_risco = 'MÉDIO' OR pr.Atividades < 5
    THEN 'MÉDIA'
    
    ELSE 'BAIXA'
  END AS urgencia,
  
  -- AÇÃO RECOMENDADA
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30 AND pr.nivel_risco = 'ALTO'
    THEN CONCAT('🚨 REATIVAR: Deal parado há ', pr.dias_em_pipeline, ' dias com ', pr.Atividades, ' atividades')
    
    WHEN pr.dias_ate_close < 0
    THEN CONCAT('📅 REPLANEJAR: Close passou há ', ABS(pr.dias_ate_close), ' dias')
    
    WHEN pr.dias_ate_close <= 7 AND pr.nivel_risco IN ('ALTO', 'MÉDIO')
    THEN CONCAT('🎯 FECHAR AGORA: ', pr.dias_ate_close, ' dias restantes, risco ', pr.nivel_risco)
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN '⚠️ PREVENIR PERDA: Risco alto, envolver gestor'
    
    WHEN pr.Gross > 100000 AND pr.priority_level IN ('CRÍTICO', 'ALTO')
    THEN CONCAT('💎 PRIORIZAR: Deal valioso $', CAST(ROUND(pr.Gross, 0) AS STRING))
    
    WHEN pr.Atividades < 5
    THEN CONCAT('🔄 AUMENTAR FREQUÊNCIA: Apenas ', pr.Atividades, ' atividades')
    
    ELSE '✅ MANTER RITMO: Continuar follow-up'
  END AS acao_recomendada,
  
  -- DETALHES
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30
    THEN 'Ligar hoje → Validar interesse → Re-qualificar → Definir steps'
    
    WHEN pr.dias_ate_close < 0
    THEN 'Call urgente → Entender atraso → Atualizar CRM → Revisar forecast'
    
    WHEN pr.dias_ate_close <= 7
    THEN 'Confirmar proposta → Remover bloqueadores → Agendar assinatura'
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN 'Discovery call → Identificar objeções → Ajustar proposta → Envolver decision maker'
    
    WHEN pr.Gross > 100000
    THEN 'Escalar Manager → Alocar SE → Demo customizada → Business case'
    
    WHEN pr.Atividades < 5
    THEN 'Calls semanais → Enviar content → Propor workshop → Criar urgência'
    
    ELSE 'Follow-up regular → Atualizar CRM → Revisar steps → Check-in 1 semana'
  END AS detalhes_execucao,
  
  -- CHECKLIST
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30
    THEN ['Ligar hoje', 'Validar interesse', 'Re-qualificar', 'Definir next steps']
    
    WHEN pr.dias_ate_close < 0
    THEN ['Call urgente', 'Entender atraso', 'Atualizar close date', 'Revisar forecast']
    
    WHEN pr.dias_ate_close <= 7
    THEN ['Confirmar proposta', 'Remover bloqueadores', 'Agendar assinatura', 'Kick-off']
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN ['Discovery call', 'Identificar objeções', 'Ajustar proposta', 'Envolver DM']
    
    WHEN pr.Gross > 100000
    THEN ['Escalar Manager', 'Alocar SE', 'Demo custom', 'Business case']
    
    WHEN pr.Atividades < 5
    THEN ['Calls semanais', 'Content', 'Workshop', 'Urgência']
    
    ELSE ['Follow-up', 'Atualizar CRM', 'Próximos steps', 'Check-in']
  END AS checklist

FROM `sales_intelligence.ml_prioridade_deal_v2` pr
ORDER BY pr.priority_score DESC;
