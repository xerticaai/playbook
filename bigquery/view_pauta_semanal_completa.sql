-- =====================================================================
-- VIEW: pauta_semanal_completa
-- Objetivo: TODOS os deals do pipeline (não só críticos) para reuniões
-- Baseado em: pauta_semanal_enriquecida (mas sem filtro WHERE)
-- Data: 2026-02-09
-- =====================================================================

CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.pauta_semanal_completa` AS
WITH pipeline_ativo AS (
  SELECT 
    p.Oportunidade,
    p.Vendedor,
    p.Conta,
    p.Perfil_Cliente,
    p.Produtos,
    p.Portfolio,
    p.Segmento,
    p.Familia_Produto,
    p.Gross,
    p.Net,
    p.Fiscal_Q,
    p.Data_Criacao,
    p.Ultima_Atualizacao,
    p.Ciclo_dias,
    p.Atividades,
    p.Confiana as Confianca,
    p.Forecast_SF,
    p.Dias_Funil,
    p.Territorio,
    p.Flags_de_Risco,
    p.Status_Engajamento,
    p.Health_Score,
    p.Risco_Abandono,
    p.Proxima_Acao as Proxima_Acao_Pipeline,
    
    -- Enriquecimento: Sales Specialist
    ss.Status as Status_Especialista,
    ss.Comentario as Comentario_Especialista,
    ss.Confianca_Especialista,
    
    -- Enriquecimento: ML Prioridade
    ml_prior.priority_score as Prioridade_ML,
    ml_prior.priority_level as Categoria_ML,
    
    -- Enriquecimento: ML Próxima Ação
    ml_acao.acao_recomendada as Proxima_Acao_ML,
    CAST(NULL AS FLOAT64) as Confianca_ML_Acao,
    
    -- Calcular semana no quarter
    DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), QUARTER), WEEK) + 1 as Semana_Quarter,
    
    -- Metadados
    CURRENT_DATE() as Data_Calculo
    
  FROM `operaciones-br.sales_intelligence.pipeline` p
  
  LEFT JOIN `operaciones-br.sales_intelligence.sales_specialist` ss
    ON p.Oportunidade = ss.opportunity_name
  
  LEFT JOIN `operaciones-br.sales_intelligence.pipeline_prioridade_deals` ml_prior
    ON p.Oportunidade = ml_prior.opportunity
  
  LEFT JOIN `operaciones-br.sales_intelligence.pipeline_proxima_acao` ml_acao
    ON p.Oportunidade = ml_acao.opportunity
),

deals_com_risco AS (
  SELECT *,
    -- Score de Risco (0-5) baseado em flags
    CAST(
      -- Flag 1: Sem atividades
      (CASE WHEN Atividades IS NULL OR Atividades = 0 THEN 1 ELSE 0 END) +
      
      -- Flag 2: Muito tempo no funil (>90 dias)
      (CASE 
        WHEN Dias_Funil IS NOT NULL AND SAFE_CAST(Dias_Funil AS INT64) > 90 
        THEN 1 
        ELSE 0 
      END) +
      
      -- Flag 3: Território incorreto
      (CASE WHEN Territorio = 'Incorreto' THEN 1 ELSE 0 END) +
      
      -- Flag 4: Confiança muito baixa (<30%)
      (CASE WHEN Confianca IS NOT NULL AND Confianca < 30 THEN 1 ELSE 0 END) +
      
      -- Flag 5: Desalinhamento Especialista vs. Salesforce
      (CASE 
        WHEN Status_Especialista = 'Commit' AND Forecast_SF != 'Committed' 
        THEN 1 
        ELSE 0 
      END)
    AS INT64) as Risco_Score,
    
    -- Categoria de Pauta (priorização)
    CASE 
      -- ZUMBI: >90 dias sem atividade
      WHEN (Atividades IS NULL OR Atividades = 0) 
        AND Dias_Funil IS NOT NULL 
        AND SAFE_CAST(Dias_Funil AS INT64) > 90 
      THEN 'ZUMBI'
      
      -- CRITICO: Confiança alta (>=70%)
      WHEN Confianca >= 70 
      THEN 'CRITICO'
      
      -- ALTA_PRIORIDADE: Confiança média (40-69%)
      WHEN Confianca >= 40 AND Confianca < 70 
      THEN 'ALTA_PRIORIDADE'
      
      -- MONITORAR: Resto
      ELSE 'MONITORAR'
    END as Categoria_Pauta,
    
    -- Tags de Risco (para UI)
    CASE 
      WHEN Atividades IS NULL OR Atividades = 0 THEN 'SEM_ATIVIDADE,'
      ELSE ''
    END ||
    CASE 
      WHEN Territorio = 'Incorreto' THEN 'TERRITORIO_ERRADO,'
      ELSE ''
    END ||
    CASE 
      WHEN Status_Especialista = 'Commit' AND Forecast_SF != 'Committed' THEN 'DESALINHADO,'
      ELSE ''
    END ||
    CASE 
      WHEN Flags_de_Risco LIKE '%SEM_ORCAMENTO%' THEN 'SEM_ORCAMENTO,'
      ELSE ''
    END as Risk_Tags
    
  FROM pipeline_ativo
)

-- Output final: TODOS OS DEALS (incluindo MONITORAR)
SELECT * 
FROM deals_com_risco
ORDER BY 
  CASE Categoria_Pauta
    WHEN 'ZUMBI' THEN 1
    WHEN 'CRITICO' THEN 2
    WHEN 'ALTA_PRIORIDADE' THEN 3
    ELSE 4  -- MONITORAR por último
  END,
  Risco_Score DESC, 
  Gross DESC;
