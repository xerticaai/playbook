-- ============================================================================
-- SIMPLIFIED VIEWS - Apenas campos essenciais (SEM conversões problemáticas)
-- ============================================================================

-- VIEW 1: Pipeline Priorizado (VERSÃO SIMPLIFICADA)
CREATE OR REPLACE VIEW `sales_intelligence.ml_prioridade_deal_v2` AS

SELECT
  p.Oportunidade,
  p.Vendedor,
  p.Perfil AS Perfil_Cliente,
  p.Produtos AS Segmento,
  p.Fase_Atual AS Stage,
  
  -- Data como está (STRING)
  p.Data_Prevista AS Close_Date,
  
  -- Valores (já são FLOAT/INT)
  CAST(p.Gross AS FLOAT64) AS Gross,
  CAST(p.Net AS FLOAT64) AS Net,
  p.Atividades,
  
  -- Converter campos STRING para INT (com SAFE_CAST para evitar erros)
  COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) AS dias_em_pipeline,
  
  -- Calcular dias até close (converter Data_Prevista STRING → DATE)
  DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) AS dias_ate_close,
  
  -- Score de urgência baseado em dias até close
  CASE
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) < 0 THEN 0
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 60 THEN 60
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 90 THEN 40
    ELSE 20
  END AS urgencia_score,
  
  -- Score de risco baseado em atividades
  CASE
    WHEN p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30 THEN 80
    WHEN p.Atividades < 5 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 60 THEN 60
    WHEN p.Atividades < 3 THEN 40
    ELSE 20
  END AS risco_score,
  
  -- Normalizar valor do deal (0-100)
  ROUND(
    (CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
    NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100
  , 1) AS valor_normalizado,
  
  -- PRIORITY SCORE FINAL (média ponderada)
  ROUND(
    -- Valor (30%)
    ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
      NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
    
    -- Urgência (30%)
    (CASE
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) < 0 THEN 0
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 60 THEN 60
      WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 90 THEN 40
      ELSE 20
    END * 0.3) +
    
    -- Risco (40%)
    (CASE
      WHEN p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30 THEN 80
      WHEN p.Atividades < 5 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 60 THEN 60
      WHEN p.Atividades < 3 THEN 40
      ELSE 20
    END * 0.4)
  , 1) AS priority_score,
  
  -- Priority Level (categórico)
  CASE
    WHEN ROUND(
      ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
        NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
      (CASE
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 THEN 100
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
        ELSE 40
      END * 0.3) +
      (CASE
        WHEN p.Atividades < 2 THEN 80
        ELSE 20
      END * 0.4)
    , 1) >= 80 THEN 'CRÍTICO'
    WHEN ROUND(
      ((CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
        NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 * 0.3) +
      (CASE
        WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 THEN 80
        ELSE 40
      END * 0.3) +
      (40 * 0.4)
    , 1) >= 60 THEN 'ALTO'
    WHEN ROUND(
      (50 * 0.3) + (40 * 0.3) + (40 * 0.4)
    , 1) >= 40 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS priority_level,
  
  -- Nível de Risco
  CASE
    WHEN p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30 THEN 'ALTO'
    WHEN p.Atividades < 5 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS nivel_risco,
  
  -- Justificativa
  ARRAY_TO_STRING([
    IF(p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30, 'RISCO ALTO ABANDONO', NULL),
    IF(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7, 'CLOSE < 7 DIAS', NULL),
    IF(DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30, 'CLOSE < 30 DIAS', NULL),
    IF(CAST(p.Gross AS FLOAT64) > 100000, 'VALOR ALTO', NULL)
  ], ' | ') AS justificativa_prioridade,
  
  -- Recomendação
  CASE
    WHEN p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30 
      AND DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30 
    THEN '🚨 RESGATAR URGENTE'
    
    WHEN p.Atividades < 2 AND COALESCE(SAFE_CAST(p.Dias_Funil AS INT64), 0) > 30
    THEN '⚠️ REATIVAR DEAL'
    
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 7 
      AND CAST(p.Gross AS FLOAT64) > 50000
    THEN '🎯 FECHAR AGORA'
    
    WHEN DATE_DIFF(SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista), CURRENT_DATE(), DAY) <= 30
    THEN '⏱️ ACELERAR'
    
    WHEN CAST(p.Gross AS FLOAT64) > 100000
    THEN '💎 PRIORIZAR'
    
    ELSE '✅ MANTER RITMO'
  END AS recomendacao_foco

FROM `sales_intelligence.pipeline` p
WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
  AND SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista) IS NOT NULL
  AND SAFE.PARSE_DATE('%Y-%m-%d', p.Data_Prevista) >= CURRENT_DATE()
ORDER BY priority_score DESC;


-- ============================================================================
-- VIEW 2: Próximas Ações (baseada na VIEW de prioridades)
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
  
  -- Categoria da Ação
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
  
  -- Urgência
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30
      OR pr.dias_ate_close < 0
      OR (pr.dias_ate_close <= 7 AND pr.nivel_risco IN ('ALTO', 'MÉDIO'))
      OR pr.nivel_risco = 'ALTO'
    THEN 'ALTA'
    
    WHEN pr.nivel_risco = 'MÉDIO' OR pr.Atividades < 5
    THEN 'MÉDIA'
    
    ELSE 'BAIXA'
  END AS urgencia,
  
  -- Ação Recomendada
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30
    THEN CONCAT('🚨 REATIVAR: Parado ', pr.dias_em_pipeline, ' dias')
    
    WHEN pr.dias_ate_close < 0
    THEN CONCAT('📅 REPLANEJAR: Atrasado ', ABS(pr.dias_ate_close), ' dias')
    
    WHEN pr.dias_ate_close <= 7
    THEN CONCAT('🎯 FECHAR: ', pr.dias_ate_close, ' dias restantes')
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN '⚠️ PREVENIR PERDA: Envolver gestor'
    
    WHEN pr.Gross > 100000
    THEN CONCAT('💎 PRIORIZAR: $', CAST(ROUND(pr.Gross/1000, 0) AS STRING), 'K')
    
    WHEN pr.Atividades < 5
    THEN '🔄 AUMENTAR FREQUÊNCIA'
    
    ELSE '✅ MANTER RITMO'
  END AS acao_recomendada,
  
  -- Checklist simplificado
  CASE
    WHEN pr.Atividades < 2 AND pr.dias_em_pipeline > 30
    THEN ['Ligar hoje', 'Re-qualificar', 'Definir steps']
    
    WHEN pr.dias_ate_close < 0
    THEN ['Call urgente', 'Atualizar close date', 'Revisar forecast']
    
    WHEN pr.dias_ate_close <= 7
    THEN ['Confirmar proposta', 'Remover bloqueadores', 'Agendar assinatura']
    
    WHEN pr.nivel_risco = 'ALTO'
    THEN ['Discovery call', 'Ajustar proposta', 'Envolver DM']
    
    WHEN pr.Gross > 100000
    THEN ['Escalar Manager', 'Demo custom', 'Business case']
    
    ELSE ['Follow-up', 'Atualizar CRM', 'Check-in']
  END AS checklist

FROM `sales_intelligence.ml_prioridade_deal_v2` pr
ORDER BY pr.priority_score DESC;
