-- ====================================================================
-- MODELO DE EMBEDDINGS: Cria vetores semânticos para análise de deals
-- ====================================================================
-- Usa: text-embedding-004 (768 dimensões, multilingual)
-- Custo: ~$0.0001 por 1000 caracteres
-- ====================================================================

CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.deal_embeddings_model`
REMOTE WITH CONNECTION `operaciones-br.us.vertex_ai_conn`
OPTIONS(
  endpoint = 'text-embedding-004'
);

-- ====================================================================
-- TESTE: Gerar embedding de teste
-- ====================================================================
SELECT 
  *
FROM
  ML.GENERATE_TEXT_EMBEDDING(
    MODEL `operaciones-br.sales_intelligence.deal_embeddings_model`,
    (SELECT 'Deal perdido por preço alto. Concorrente ofereceu 30% desconto.' AS content)
  );
