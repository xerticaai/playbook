-- ============================================================================
-- FIX: Corrigir VIEWs para converter Data_Prevista STRING → DATE
-- ============================================================================
-- PROBLEMA: Data_Prevista está como STRING (yyyy-mm-dd) mas VIEWs assumem DATE
-- SOLUÇÃO: Usar PARSE_DATE('%Y-%m-%d', Data_Prevista) ou SAFE.PARSE_DATE
-- ============================================================================

-- ============================================================================
-- VIEW 1: ml_prioridade_deal_v2 (FIXED)
-- ============================================================================

CREATE OR REPLACE VIEW `sales_intelligence.ml_prioridade_deal_v2` AS

SELECT
  p.Oportunidade,
  p.Vendedor,
  p.Perfil AS Perfil_Cliente,
  p.Produtos AS Segmento,
  p.Fase_Atual AS Stage,
  SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista) AS Close_Date,
  CAST(p.Gross AS FLOAT64) AS Gross,
  CAST(p.Net AS FLOAT64) AS Net,
  
  -- Métricas tempo
  COALESCE(p.Dias_Funil, 0) AS dias_em_pipeline,
  DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) AS dias_ate_close,
  COALESCE(p.Atividades, 0) AS Atividades,
  
  -- Normalizações
  (CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
    NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 AS valor_normalizado,
  
  CASE
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) < 0 THEN 0
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 60 THEN 60
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 90 THEN 40
    ELSE 20
  END AS urgencia_score,
  
  -- Score de risco simples
  CASE
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30 THEN 0.8
    WHEN COALESCE(p.Atividades, 0) < 5 AND COALESCE(p.Dias_Funil, 0) > 60 THEN 0.6
    WHEN COALESCE(p.Mudanas_Close_Date, 0) > 3 THEN 0.5
    WHEN COALESCE(p.Atividades, 0) < 3 THEN 0.4
    ELSE 0.2
  END AS risco_estimado,
  
  -- PRIORITY SCORE
  ROUND(
    ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
      NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
    (CASE
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) < 0 THEN 0
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 60 THEN 60
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 90 THEN 40
      ELSE 20
    END * 0.3) +
    (CASE
      WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30 THEN 0.8
      WHEN COALESCE(p.Atividades, 0) < 5 AND COALESCE(p.Dias_Funil, 0) > 60 THEN 0.6
      WHEN COALESCE(p.Mudanas_Close_Date, 0) > 3 THEN 0.5
      WHEN COALESCE(p.Atividades, 0) < 3 THEN 0.4
      ELSE 0.2
    END * 100 * 0.4)
  , 1) AS priority_score,
  
  -- Priority level
  CASE
    WHEN (
      ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
        NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
      (CASE
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
        ELSE 40
      END * 0.3) +
      (CASE
        WHEN COALESCE(p.Atividades, 0) < 2 THEN 0.8
        ELSE 0.2
      END * 100 * 0.4)
    ) >= 80 THEN 'CRÍTICO'
    WHEN (
      ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
        NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
      (CASE
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
        ELSE 40
      END * 0.3) +
      (0.4 * 100 * 0.4)
    ) >= 60 THEN 'ALTO'
    WHEN (
      (50 * 0.3) + (40 * 0.3) + (40)
    ) >= 40 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS priority_level,
  
  CASE
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30 THEN 'ALTO'
    WHEN COALESCE(p.Atividades, 0) < 5 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS nivel_risco,
  
  -- Justificativa
  ARRAY_TO_STRING([
    IF(COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30, 'RISCO ALTO DE ABANDONO', NULL),
    IF(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7, 'CLOSE IMINENTE (< 7 dias)', NULL),
    IF(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30, 'CLOSE PRÓXIMO', NULL),
    IF(CAST(p.Gross AS FLOAT64) > 100000, 'VALOR MUITO ALTO', NULL),
    IF(COALESCE(p.Mudanas_Close_Date, 0) > 2, 'MÚLTIPLAS POSTERGAÇÕES', NULL)
  ], ' | ') AS justificativa_prioridade,
  
  CASE
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30 
      AND DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 
    THEN 'RESGATAR URGENTE: Deal em risco com close próximo'
    
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30
    THEN 'REATIVAR: Deal parado, alta chance de perda'
    
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 
      AND CAST(p.Gross AS FLOAT64) > 50000
    THEN 'FECHAR AGORA: Deal valioso prestes a fechar'
    
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30
    THEN 'ACELERAR: Evitar atraso'
    
    WHEN CAST(p.Gross AS FLOAT64) > 100000
    THEN 'PRIORIZAR: Deal de alto valor'
    
    ELSE 'MANTER RITMO: Acompanhar evolução normal'
  END AS recomendacao_foco

FROM `sales_intelligence.pipeline` p
WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
  AND SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista) >= CURRENT_DATE()
ORDER BY priority_score DESC;

-- ============================================================================
-- VIEW 2: ml_proxima_acao_v2 (FIXED)
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
