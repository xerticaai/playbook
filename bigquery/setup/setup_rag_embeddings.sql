-- =====================================================================
-- RAG UNIFICADO: Embeddings de Pipeline, Won, Lost
-- Arquitetura reutilizável para múltiplos contextos (insights, ML, etc)
-- =====================================================================
-- Autor: GitHub Copilot
-- Data: 2026-02-08
-- Custo estimado: ~$2 para 2000 deals (text-embedding-004)
-- =====================================================================

-- =====================================================================
-- STEP 1: Criar modelo de embeddings (reutilizável)
-- =====================================================================
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.text_embedding_model`
REMOTE WITH CONNECTION `operaciones-br.us-central1.vertex_ai_conn`
OPTIONS(
  endpoint = 'text-embedding-004'  -- 768 dimensões, multilingual, $0.00001/1K chars
);

-- =====================================================================
-- STEP 2: Criar tabela unificada com embeddings (MATERIALIZADA)
-- =====================================================================
-- Estratégia: 1 tabela com field 'source' (pipeline/won/lost)
-- Benefícios:
--   - Busca vetorial em todas as tabelas simultaneamente
--   - Filtro por source quando necessário
--   - Reutilizável para qualquer contexto
-- =====================================================================

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH unified_deals AS (
  -- ===== PIPELINE (deals ativos) =====
  SELECT 
    CONCAT('PIPELINE-', CAST(ROW_NUMBER() OVER (ORDER BY Ultima_Atualizacao DESC) AS STRING)) as deal_id,
    'pipeline' as source,
    Oportunidade,
    Vendedor,
    Conta,
    Perfil_Cliente,
    Produtos,
    Portfolio,
    Segmento,
    Familia_Produto,
    Stage,
    Gross,
    Net,
    Fiscal_Q,
    Data_Criacao,
    Ultima_Atualizacao,
    Ciclo_dias_atual,
    Atividades,
    Prioridade_Score,
    Proxima_Acao,
    -- Campos específicos de pipeline
    Status_Engajamento,
    Health_Score,
    Risco_Abandono,
    NULL as Resumo_Analise,
    NULL as Causa_Raiz,
    NULL as Licoes_Aprendidas,
    NULL as Fatores_Sucesso,
    NULL as outcome,
    -- Criar texto rico para embedding
    CONCAT(
      'Deal: ', COALESCE(Oportunidade, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Produtos: ', COALESCE(Produtos, ''),
      ' | Stage: ', COALESCE(Stage, ''),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0) AS STRING),
      ' | Prioridade: ', COALESCE(Prioridade_Score, ''),
      ' | Próxima Ação: ', COALESCE(Proxima_Acao, ''),
      ' | Status: ', COALESCE(Status_Engajamento, '')
    ) as content_text
  FROM `operaciones-br.sales_intelligence.pipeline`
  WHERE Oportunidade IS NOT NULL
  
  UNION ALL
  
  -- ===== WON (vitórias) =====
  SELECT 
    CONCAT('WON-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'won' as source,
    Oportunidade,
    Vendedor,
    Conta,
    Perfil_Cliente,
    Produtos,
    Portfolio,
    Segmento,
    Familia_Produto,
    NULL as Stage,
    Gross,
    Net,
    Fiscal_Q,
    NULL as Data_Criacao,
    Ultima_Atualizacao,
    Ciclo_dias as Ciclo_dias_atual,
    Atividades,
    NULL as Prioridade_Score,
    NULL as Proxima_Acao,
    NULL as Status_Engajamento,
    NULL as Health_Score,
    NULL as Risco_Abandono,
    Resumo_Analise,
    Causa_Raiz,
    Licoes_Aprendidas,
    Fatores_Sucesso,
    outcome,
    -- Criar texto rico para embedding (com análise)
    CONCAT(
      'Deal GANHO: ', COALESCE(Oportunidade, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Produtos: ', COALESCE(Produtos, ''),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0) AS STRING),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias',
      ' | Fatores de Sucesso: ', COALESCE(Fatores_Sucesso, ''),
      ' | Causa Raiz: ', COALESCE(Causa_Raiz, ''),
      ' | Resumo: ', COALESCE(Resumo_Analise, ''),
      ' | Lições: ', COALESCE(Licoes_Aprendidas, '')
    ) as content_text
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  WHERE Oportunidade IS NOT NULL
  
  UNION ALL
  
  -- ===== LOST (perdas) =====
  SELECT 
    CONCAT('LOST-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'lost' as source,
    Oportunidade,
    Vendedor,
    Conta,
    Perfil_Cliente,
    Produtos,
    Portfolio,
    Segmento,
    Familia_Produto,
    NULL as Stage,
    Gross,
    Net,
    Fiscal_Q,
    NULL as Data_Criacao,
    Ultima_Atualizacao,
    Ciclo_dias as Ciclo_dias_atual,
    Atividades,
    NULL as Prioridade_Score,
    NULL as Proxima_Acao,
    NULL as Status_Engajamento,
    NULL as Health_Score,
    NULL as Risco_Abandono,
    Resumo_Analise,
    Causa_Raiz,
    Licoes_Aprendidas,
    Fatores_Sucesso,
    outcome,
    -- Criar texto rico para embedding (com análise de perda)
    CONCAT(
      'Deal PERDIDO: ', COALESCE(Oportunidade, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Produtos: ', COALESCE(Produtos, ''),
      ' | Valor perdido: R$ ', CAST(COALESCE(Gross, 0) AS STRING),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias',
      ' | Causa Raiz: ', COALESCE(Causa_Raiz, ''),
      ' | Resumo: ', COALESCE(Resumo_Analise, ''),
      ' | Lições: ', COALESCE(Licoes_Aprendidas, '')
    ) as content_text
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  WHERE Oportunidade IS NOT NULL
)

-- Gerar embeddings (768 dimensões)
SELECT 
  deal_id,
  source,
  Oportunidade,
  Vendedor,
  Conta,
  Perfil_Cliente,
  Produtos,
  Portfolio,
  Segmento,
  Familia_Produto,
  Stage,
  Gross,
  Net,
  Fiscal_Q,
  Data_Criacao,
  Ultima_Atualizacao,
  Ciclo_dias_atual,
  Atividades,
  Prioridade_Score,
  Proxima_Acao,
  Status_Engajamento,
  Health_Score,
  Risco_Abandono,
  Resumo_Analise,
  Causa_Raiz,
  Licoes_Aprendidas,
  Fatores_Sucesso,
  outcome,
  content_text,
  -- Gerar embedding (Vertex AI Text Embedding)
  ml_generate_embedding_result as embedding
FROM
  ML.GENERATE_TEXT_EMBEDDING(
    MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
    (SELECT * FROM unified_deals),
    STRUCT(TRUE AS flatten_json_output)
  );

-- =====================================================================
-- STEP 3: Criar índice de busca vetorial (performance)
-- =====================================================================
-- Nota: BigQuery cria índice automático para VECTOR_SEARCH
-- Mas podemos forçar clustering por source para otimizar filtros

ALTER TABLE `operaciones-br.sales_intelligence.deal_embeddings`
CLUSTER BY source;

-- =====================================================================
-- VERIFICAÇÃO: Contar embeddings gerados
-- =====================================================================
SELECT 
  source,
  COUNT(*) as total_deals,
  AVG(ARRAY_LENGTH(embedding)) as embedding_dimension
FROM `operaciones-br.sales_intelligence.deal_embeddings`
GROUP BY source
ORDER BY source;
