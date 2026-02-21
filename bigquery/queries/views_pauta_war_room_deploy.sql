-- =====================================================================
-- DEPLOY SCRIPT: PAUTA SEMANAL + WAR ROOM (APENAS VIEWS)
-- Projeto: operaciones-br.sales_intelligence
-- Objetivo: aplicar as VIEWS sem executar queries de teste
-- Data: 2026-02-10
-- =====================================================================

-- =====================================================================
-- VIEW 1: pauta_semanal_enriquecida
-- Objetivo: Combinar pipeline com análise Sales Ops, ML e calcular riscos
-- =====================================================================

CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.pauta_semanal_enriquecida` AS
WITH
pipeline_dedup AS (
  -- Garantir 1 linha por Oportunidade mesmo se o snapshot vier duplicado
  SELECT p.*
  FROM `operaciones-br.sales_intelligence.pipeline` p
  WHERE p.Oportunidade IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY p.Oportunidade
    ORDER BY SAFE.PARSE_TIMESTAMP(
      '%Y-%m-%dT%H:%M:%E*S%Ez',
      REGEXP_REPLACE(CAST(p.data_carga AS STRING), r'Z$', '+00:00')
    ) DESC, p.Run_ID DESC
  ) = 1
),

sales_specialist_dedup AS (
  -- Garantir 1 linha por Oportunidade no join (evita multiplicação 1:N)
  SELECT ss.*
  FROM `operaciones-br.sales_intelligence.sales_specialist` ss
  WHERE ss.opportunity_name IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ss.opportunity_name
    ORDER BY SAFE.PARSE_TIMESTAMP(
      '%Y-%m-%dT%H:%M:%E*S%Ez',
      REGEXP_REPLACE(CAST(ss.data_carga AS STRING), r'Z$', '+00:00')
    ) DESC
  ) = 1
),

ml_prioridade_dedup AS (
  -- Views de ML podem duplicar se a fonte tiver duplicidade
  SELECT mp.*
  FROM `operaciones-br.sales_intelligence.pipeline_prioridade_deals` mp
  WHERE mp.Oportunidade IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY mp.Oportunidade
    ORDER BY SAFE_CAST(mp.priority_score AS FLOAT64) DESC
  ) = 1
),

ml_acao_dedup AS (
  SELECT ma.*
  FROM `operaciones-br.sales_intelligence.pipeline_proxima_acao` ma
  WHERE ma.Oportunidade IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ma.Oportunidade
    ORDER BY SAFE_CAST(ma.priority_score AS FLOAT64) DESC
  ) = 1
),

pipeline_ativo AS (
  SELECT 
    p.Oportunidade,
    p.Vendedor,
    p.Conta,
    p.Perfil as Perfil_Cliente,
    p.Produtos,
    CAST(NULL AS STRING) as Portfolio,
    CAST(NULL AS STRING) as Segmento,
    CAST(NULL AS STRING) as Familia_Produto,
    p.Gross,
    p.Net,
    p.Fase_Atual,
    p.Fiscal_Q,
    p.Data_Prevista,
    CAST(NULL AS DATE) as Data_Criacao,
    p.Ultima_Atualizacao,
    p.Ciclo_dias,
    p.Idle_Dias,
    p.Atividades,
    p.Confianca,
    p.Forecast_SF,
    p.Forecast_IA,
    p.MEDDIC_Score,
    p.BANT_Score,
    p.Dias_Funil,
    p.Territorio_Correto as Territorio,
    p.Flags_de_Risco,
    p.Risco_Principal,
    p.Acao_Sugerida as Proxima_Acao_Pipeline,
    p.Cod_Acao,
    p.Justificativa_IA,
    p.Perguntas_de_Auditoria_IA,
    p.Regras_Aplicadas,
    p.Incoerencia_Detectada,
    p.Gaps_Identificados,
    p.Motivo_Confianca,
    p.Qualidade_Engajamento as Status_Engajamento,
    CAST(NULL AS FLOAT64) as Health_Score,
    CAST(NULL AS STRING) as Risco_Abandono,
    
    -- Enriquecimento: Sales Specialist
    ss.Status as Status_Especialista,
    CAST(NULL AS STRING) as Comentario_Especialista,
    CAST(NULL AS FLOAT64) as Confianca_Especialista,
    
    -- Enriquecimento: ML Prioridade
    ml_prior.priority_score as Prioridade_ML,
    ml_prior.priority_level as Categoria_ML,
    
    -- Enriquecimento: ML Próxima Ação
    ml_acao.acao_recomendada as Proxima_Acao_ML,
    CAST(NULL AS FLOAT64) as Confianca_ML_Acao,
    
    -- Calcular semana no quarter
    DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), QUARTER), WEEK) + 1 as Semana_Quarter,
    
    -- Metadados
    CURRENT_DATE() as Data_Calculo,
    p.Run_ID,
    p.data_carga
    
  FROM pipeline_dedup p
  
  LEFT JOIN sales_specialist_dedup ss
    ON p.Oportunidade = ss.opportunity_name

  LEFT JOIN ml_prioridade_dedup ml_prior
    ON p.Oportunidade = ml_prior.Oportunidade

  LEFT JOIN ml_acao_dedup ml_acao
    ON p.Oportunidade = ml_acao.Oportunidade
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

-- Output final: TODOS OS DEALS (incluindo MONITORAR) para flexibilidade
SELECT * 
FROM deals_com_risco
ORDER BY 
  CASE Categoria_Pauta
    WHEN 'ZUMBI' THEN 1
    WHEN 'CRITICO' THEN 2
    WHEN 'ALTA_PRIORIDADE' THEN 3
    ELSE 4  -- MONITORAR
  END,
  Risco_Score DESC, 
  Gross DESC;

-- =====================================================================
-- War Room removido: este deploy script aplica apenas a pauta semanal.
-- =====================================================================
