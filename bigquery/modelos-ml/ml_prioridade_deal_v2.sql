-- ============================================================================
-- VIEW 5: Prioridade de Deals (SCORING SYSTEM)
-- ============================================================================
-- OBJETIVO: Combinar predições dos modelos para criar score de prioridade
-- TIPO: VIEW (não é modelo treinado)
-- INPUT: Pipeline aberto + predições dos 3 modelos
-- OUTPUT: Priority score (0-100), nível, justificativa
-- ============================================================================

CREATE OR REPLACE VIEW `sales_intelligence.ml_prioridade_deal_v2` AS

SELECT
  p.Oportunidade,
  p.Vendedor,
  p.Perfil AS Perfil_Cliente,
  p.Produtos AS Segmento,
  p.Fase_Atual AS Stage,
  p.Data_Prevista AS Close_Date,
  CAST(p.Gross AS FLOAT64) AS Gross,
  CAST(p.Net AS FLOAT64) AS Net,
  
  -- Métricas tempo
  COALESCE(p.Dias_Funil, 0) AS dias_em_pipeline,
  DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) AS dias_ate_close,
  COALESCE(p.Atividades, 0) AS Atividades,
  
  -- Normalizações
  (CAST(p.Gross AS FLOAT64) - MIN(CAST(p.Gross AS FLOAT64)) OVER()) / 
    NULLIF(MAX(CAST(p.Gross AS FLOAT64)) OVER() - MIN(CAST(p.Gross AS FLOAT64)) OVER(), 0) * 100 AS valor_normalizado,
  
  CASE
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) < 0 THEN 0
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 7 THEN 100
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30 THEN 80
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 60 THEN 60
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 90 THEN 40
    ELSE 20
  END AS urgencia_score,
  
  -- Score de risco simples (sem ML por enquanto)
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
      WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) < 0 THEN 0
      WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 7 THEN 100
      WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30 THEN 80
      WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 60 THEN 60
      WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 90 THEN 40
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
        WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 7 THEN 100
        WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30 THEN 80
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
        WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30 THEN 80
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
  
  -- Justific ativa
  ARRAY_TO_STRING([
    IF(COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30, 'RISCO ALTO DE ABANDONO', NULL),
    IF(DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 7, 'CLOSE IMINENTE (< 7 dias)', NULL),
    IF(DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30, 'CLOSE PRÓXIMO', NULL),
    IF(CAST(p.Gross AS FLOAT64) > 100000, 'VALOR MUITO ALTO', NULL),
    IF(COALESCE(p.Mudanas_Close_Date, 0) > 2, 'MÚLTIPLAS POSTERGAÇÕES', NULL)
  ], ' | ') AS justificativa_prioridade,
  
  CASE
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30 
      AND DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30 
    THEN 'RESGATAR URGENTE: Deal em risco com close próximo'
    
    WHEN COALESCE(p.Atividades, 0) < 2 AND COALESCE(p.Dias_Funil, 0) > 30
    THEN 'REATIVAR: Deal parado, alta chance de perda'
    
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 7 
      AND CAST(p.Gross AS FLOAT64) > 50000
    THEN 'FECHAR AGORA: Deal valioso prestes a fechar'
    
    WHEN DATE_DIFF(p.Data_Prevista, CURRENT_DATE(), DAY) <= 30
    THEN 'ACELERAR: Evitar atraso'
    
    WHEN CAST(p.Gross AS FLOAT64) > 100000
    THEN 'PRIORIZAR: Deal de alto valor'
    
    ELSE 'MANTER RITMO: Acompanhar evolução normal'
  END AS recomendacao_foco

FROM `sales_intelligence.pipeline` p
WHERE p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
  AND p.Data_Prevista >= CURRENT_DATE()
ORDER BY priority_score DESC;

-- ============================================================================
-- RESULTADO: VIEW com todos os deals priorizados
-- Uso: SELECT * FROM ml_prioridade_deal_v2 WHERE priority_level = 'CRÍTICO'
-- ============================================================================
