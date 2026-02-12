-- =====================================================================
-- VIEWS PARA PAUTA SEMANAL + WAR ROOM
-- Projeto: operaciones-br.sales_intelligence
-- Autor: GitHub Copilot (Claude Sonnet 4.5)
-- Data: 2026-02-08
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
-- Quem quiser filtrar pode fazer WHERE Categoria_Pauta IN (...) na query
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
-- VIEW 2: war_room_metrics
-- Objetivo: Métricas de higiene de pipeline por vendedor
-- =====================================================================

CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.war_room_metrics` AS
WITH quarter_atual AS (
  -- Calcular Fiscal Quarter atual (ex: FY26-Q1)
  SELECT 
    CONCAT(
      'FY', 
      CAST(EXTRACT(YEAR FROM CURRENT_DATE()) - 2000 AS STRING), 
      '-Q', 
      CAST(EXTRACT(QUARTER FROM CURRENT_DATE()) AS STRING)
    ) as Fiscal_Q_Atual
),

dados_unificados AS (
  -- UNION ALL: Pipeline + Won + Lost
  SELECT 
    Vendedor,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    'pipeline' as source,
    SAFE_CAST(Atividades AS INT64) as Atividades,
    Territorio_Correto as Territorio,
    SAFE_CAST(Dias_Funil AS INT64) as Dias_Funil,
    NULL as Data_Fechamento
  FROM `operaciones-br.sales_intelligence.pipeline`
  
  UNION ALL
  
  SELECT 
    Vendedor,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    'won' as source,
    SAFE_CAST(Atividades AS INT64) as Atividades,
    NULL as Territorio,
    NULL as Dias_Funil,
    Data_Fechamento
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  
  UNION ALL
  
  SELECT 
    Vendedor,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    'lost' as source,
    SAFE_CAST(Atividades AS INT64) as Atividades,
    NULL as Territorio,
    NULL as Dias_Funil,
    Data_Fechamento
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
),

metricas_por_vendedor AS (
  SELECT 
    Vendedor,
    
    -- Pipeline (deals ativos)
    ROUND(SUM(CASE WHEN source = 'pipeline' THEN Gross ELSE 0 END), 2) as Pipeline_Gross,
    ROUND(SUM(CASE WHEN source = 'pipeline' THEN Net ELSE 0 END), 2) as Pipeline_Net,
    COUNT(CASE WHEN source = 'pipeline' THEN 1 END) as Pipeline_Deals,
    
    -- Fechado no Q atual (Won)
    ROUND(SUM(
      CASE 
        WHEN source = 'won' 
          AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
        THEN Gross 
        ELSE 0 
      END
    ), 2) as Closed_Gross,
    ROUND(SUM(
      CASE 
        WHEN source = 'won' 
          AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
        THEN Net 
        ELSE 0 
      END
    ), 2) as Closed_Net,
    COUNT(
      CASE 
        WHEN source = 'won' 
          AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
        THEN 1 
      END
    ) as Closed_Deals,
    
    -- Perdas no Q atual
    COUNT(
      CASE 
        WHEN source = 'lost' 
          AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
        THEN 1 
      END
    ) as Lost_Deals,
    
    -- Higiene de Pipeline: % de deals "podres"
    -- Definição "podre": Atividades = 0 OU Território = 'Incorreto'
    ROUND(
      100.0 * COUNT(
        CASE 
          WHEN source = 'pipeline' 
            AND (
              (Atividades IS NULL OR Atividades = 0) 
              OR Territorio = 'Incorreto'
            )
          THEN 1 
        END
      ) / NULLIF(
        COUNT(CASE WHEN source = 'pipeline' THEN 1 END), 
        0
      ), 
      2
    ) as Percent_Pipeline_Podre,
    
    -- Zumbis: >90 dias sem atividade
    COUNT(
      CASE 
        WHEN source = 'pipeline' 
          AND (Atividades IS NULL OR Atividades = 0)
          AND Dias_Funil IS NOT NULL
          AND SAFE_CAST(Dias_Funil AS INT64) > 90
        THEN 1 
      END
    ) as Deals_Zumbi,
    
    -- Valor em risco (Zumbis)
    ROUND(
      SUM(
        CASE 
          WHEN source = 'pipeline' 
            AND (Atividades IS NULL OR Atividades = 0)
            AND Dias_Funil IS NOT NULL
            AND SAFE_CAST(Dias_Funil AS INT64) > 90
          THEN Gross 
          ELSE 0 
        END
      ), 
      2
    ) as Valor_Zumbi
    
  FROM dados_unificados
  GROUP BY Vendedor
)

SELECT 
  Vendedor,
  
  -- Métricas de Pipeline
  Pipeline_Gross,
  Pipeline_Net,
  Pipeline_Deals,
  
  -- Métricas de Fechamento (Q atual)
  Closed_Gross,
  Closed_Net,
  Closed_Deals,
  Lost_Deals,
  
  -- Forecast Total (Closed + Pipeline)
  ROUND(Closed_Gross + Pipeline_Gross, 2) as Total_Forecast,
  
  -- Higiene
  Percent_Pipeline_Podre,
  Deals_Zumbi,
  Valor_Zumbi,
  
  -- Nota de Higiene (A a F)
  CASE 
    WHEN Percent_Pipeline_Podre IS NULL THEN 'N/A'
    WHEN Percent_Pipeline_Podre <= 10 THEN 'A'
    WHEN Percent_Pipeline_Podre <= 20 THEN 'B'
    WHEN Percent_Pipeline_Podre <= 35 THEN 'C'
    WHEN Percent_Pipeline_Podre <= 50 THEN 'D'
    ELSE 'F'
  END as Nota_Higiene,
  
  -- Win Rate (Wins / (Wins + Losses)) no Q atual
  CASE 
    WHEN (Closed_Deals + Lost_Deals) > 0 
    THEN ROUND(100.0 * Closed_Deals / (Closed_Deals + Lost_Deals), 2)
    ELSE NULL
  END as Win_Rate,
  
  -- Metadados
  (SELECT Fiscal_Q_Atual FROM quarter_atual) as Fiscal_Q_Referencia,
  CURRENT_DATE() as Data_Calculo
  
FROM metricas_por_vendedor
WHERE Pipeline_Deals > 0 OR Closed_Deals > 0  -- Apenas vendedores ativos
ORDER BY Total_Forecast DESC;


-- =====================================================================
-- QUERY DE TESTE 1: Top 10 Deals Críticos
-- Uso: Validar VIEW pauta_semanal_enriquecida
-- =====================================================================

SELECT 
  Vendedor,
  Oportunidade,
  Conta,
  Gross,
  Confianca,
  Risco_Score,
  Categoria_Pauta,
  Risk_Tags,
  Atividades,
  Dias_Funil,
  Status_Especialista,
  Forecast_SF
FROM `operaciones-br.sales_intelligence.pauta_semanal_enriquecida`
WHERE Categoria_Pauta IN ('CRITICO', 'ZUMBI')
ORDER BY Risco_Score DESC, Gross DESC
LIMIT 10;


-- =====================================================================
-- QUERY DE TESTE 2: Ranking de Vendedores por Higiene
-- Uso: Validar VIEW war_room_metrics
-- =====================================================================

SELECT 
  Vendedor,
  Total_Forecast,
  Nota_Higiene,
  Percent_Pipeline_Podre,
  Deals_Zumbi,
  Valor_Zumbi,
  Win_Rate,
  Pipeline_Deals,
  Closed_Deals
FROM `operaciones-br.sales_intelligence.war_room_metrics`
ORDER BY 
  CASE Nota_Higiene
    WHEN 'A' THEN 1
    WHEN 'B' THEN 2
    WHEN 'C' THEN 3
    WHEN 'D' THEN 4
    WHEN 'F' THEN 5
    ELSE 6
  END,
  Total_Forecast DESC
LIMIT 20;


-- =====================================================================
-- QUERY DE TESTE 3: Resumo Executivo Semanal
-- Uso: Dados para header do War Room Report
-- =====================================================================

WITH quarter_atual AS (
  SELECT 
    CONCAT(
      'FY', 
      CAST(EXTRACT(YEAR FROM CURRENT_DATE()) - 2000 AS STRING), 
      '-Q', 
      CAST(EXTRACT(QUARTER FROM CURRENT_DATE()) AS STRING)
    ) as Fiscal_Q_Atual
)

SELECT 
  (SELECT Fiscal_Q_Atual FROM quarter_atual) as Quarter,
  DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), QUARTER), WEEK) + 1 as Semana_Quarter,
  13 as Total_Semanas_Quarter,
  
  -- Pipeline
  COUNT(CASE WHEN source = 'pipeline' THEN 1 END) as Pipeline_Deals,
  ROUND(SUM(CASE WHEN source = 'pipeline' THEN Gross ELSE 0 END), 2) as Pipeline_Gross,
  
  -- Fechado no Q atual
  COUNT(
    CASE 
      WHEN source = 'won' 
        AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
      THEN 1 
    END
  ) as Closed_Deals,
  ROUND(
    SUM(
      CASE 
        WHEN source = 'won' 
          AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
        THEN Gross 
        ELSE 0 
      END
    ), 
    2
  ) as Closed_Gross,
  
  -- Perdas no Q atual
  COUNT(
    CASE 
      WHEN source = 'lost' 
        AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) 
      THEN 1 
    END
  ) as Lost_Deals,
  
  -- Zumbis
  COUNT(
    CASE 
      WHEN source = 'pipeline' 
        AND (Atividades IS NULL OR Atividades = 0)
        AND Dias_Funil IS NOT NULL
        AND SAFE_CAST(Dias_Funil AS INT64) > 90
      THEN 1 
    END
  ) as Total_Zumbis,
  ROUND(
    SUM(
      CASE 
        WHEN source = 'pipeline' 
          AND (Atividades IS NULL OR Atividades = 0)
          AND Dias_Funil IS NOT NULL
          AND SAFE_CAST(Dias_Funil AS INT64) > 90
        THEN Gross 
        ELSE 0 
      END
    ), 
    2
  ) as Valor_Zumbis

FROM (
  SELECT 
    Gross, 
    'pipeline' as source, 
    Fiscal_Q, 
    Atividades, 
    Dias_Funil
  FROM `operaciones-br.sales_intelligence.pipeline`
  
  UNION ALL
  
  SELECT 
    Gross, 
    'won' as source, 
    Fiscal_Q, 
    Atividades, 
    NULL as Dias_Funil
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  
  UNION ALL
  
  SELECT 
    Gross, 
    'lost' as source, 
    Fiscal_Q, 
    Atividades, 
    NULL as Dias_Funil
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
);


-- =====================================================================
-- QUERY DE TESTE 4: RAG - Similar Deals por Vendedor
-- Uso: Contexto histórico para perguntas de sabatina
-- Nota: Substituir @oportunidade e @vendedor por valores reais
-- =====================================================================

-- Exemplo de busca vetorial usando embeddings
WITH target_embedding AS (
  SELECT embedding
  FROM `operaciones-br.sales_intelligence.deal_embeddings`
  WHERE Oportunidade = 'Nome da Oportunidade Alvo'  -- Substituir
  LIMIT 1
)

SELECT 
  de.deal_id,
  de.source,
  de.Oportunidade,
  de.Conta,
  de.Vendedor,
  de.Gross,
  de.Net,
  de.Fiscal_Q,
  de.Fase,
  SUBSTR(de.content, 1, 200) as content_preview,  -- Primeiros 200 chars
  
  -- Calcular similaridade cosseno
  (
    SELECT 
      SUM(a * b) / (
        SQRT(SUM(a * a)) * SQRT(SUM(b * b))
      )
    FROM UNNEST(de.embedding) a WITH OFFSET pos
    JOIN UNNEST((SELECT embedding FROM target_embedding)) b WITH OFFSET pos2
      ON pos = pos2
  ) as similarity_score

FROM `operaciones-br.sales_intelligence.deal_embeddings` de
WHERE 
  de.source IN ('won', 'lost')  -- Apenas histórico
  AND de.Vendedor = 'Alex Araujo'  -- Substituir pelo vendedor alvo
  AND EXISTS (SELECT 1 FROM target_embedding)  -- Garantir que embedding existe
  
ORDER BY similarity_score DESC
LIMIT 5;


-- =====================================================================
-- MANUTENÇÃO: Refresh das VIEWs
-- =====================================================================

-- As VIEWs são recalculadas automaticamente a cada query.
-- Para forçar refresh de cache (se aplicável):

-- DROP VIEW IF EXISTS `operaciones-br.sales_intelligence.pauta_semanal_enriquecida`;
-- DROP VIEW IF EXISTS `operaciones-br.sales_intelligence.war_room_metrics`;

-- Depois recriar com os CREATE OR REPLACE acima.


-- =====================================================================
-- MONITORAMENTO: Custo de Queries
-- =====================================================================

-- Query para estimar bytes processados (custo)
SELECT 
  SUM(
    CASE 
      WHEN table_name = 'pipeline' THEN total_rows * avg_row_bytes
      WHEN table_name = 'closed_deals_won' THEN total_rows * avg_row_bytes
      WHEN table_name = 'closed_deals_lost' THEN total_rows * avg_row_bytes
      WHEN table_name = 'deal_embeddings' THEN total_rows * avg_row_bytes
      ELSE 0
    END
  ) / POW(1024, 3) as estimated_gb_processed

FROM (
  SELECT 
    table_name,
    row_count as total_rows,
    size_bytes / NULLIF(row_count, 0) as avg_row_bytes
  FROM `operaciones-br.sales_intelligence.__TABLES__`
  WHERE table_name IN ('pipeline', 'closed_deals_won', 'closed_deals_lost', 'deal_embeddings')
);

-- Custo estimado: ~$5 por TB processado
-- Se processamos ~50 GB/mês → ~$0.25/mês em queries BigQuery


-- =====================================================================
-- FIM DO ARQUIVO
-- =====================================================================
-- Para deploy:
-- bq query --use_legacy_sql=false --project_id=operaciones-br < este_arquivo.sql
