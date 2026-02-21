CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH all_deals AS (
  SELECT 
    CONCAT('L', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'lost' as source, Oportunidade, Vendedor, Gross, Fiscal_Q, Ciclo_dias,
    Resumo_Analise, Causa_Raiz, Licoes_Aprendidas,
    CONCAT('PERDIDO: ', COALESCE(Oportunidade, ''), ' | Vendedor: ', COALESCE(Vendedor, ''),
           ' | Causa Raiz: ', COALESCE(Causa_Raiz, ''), ' | Resumo: ', COALESCE(SUBSTR(Resumo_Analise, 1, 500), ''),
           ' | Lições Aprendidas: ', COALESCE(SUBSTR(Licoes_Aprendidas, 1, 400), '')) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_lost` WHERE Oportunidade IS NOT NULL
  
  UNION ALL
  
  SELECT 
    CONCAT('W', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'won' as source, Oportunidade, Vendedor, Gross, Fiscal_Q, Ciclo_dias,
    Resumo_Analise, Causa_Raiz, Licoes_Aprendidas,
    CONCAT('GANHO: ', COALESCE(Oportunidade, ''), ' | Vendedor: ', COALESCE(Vendedor, ''),
           ' | Causa Raiz: ', COALESCE(Causa_Raiz, ''), ' | Resumo: ', COALESCE(SUBSTR(Resumo_Analise, 1, 500), ''),
           ' | Lições Aprendidas: ', COALESCE(SUBSTR(Licoes_Aprendidas, 1, 400), '')) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_won` WHERE Oportunidade IS NOT NULL
  
  UNION ALL
  
  SELECT 
    CONCAT('P', CAST(ROW_NUMBER() OVER (ORDER BY Ultima_Atualizacao DESC) AS STRING)) as deal_id,
    'pipeline' as source, Oportunidade, Vendedor, Gross, Fiscal_Q, Ciclo_dias,
    NULL as Resumo_Analise, NULL as Causa_Raiz, NULL as Licoes_Aprendidas,
    CONCAT('PIPELINE: ', COALESCE(Oportunidade, ''), ' | Vendedor: ', COALESCE(Vendedor, ''),
           ' | Stage: ', COALESCE(Stage, ''), ' | Prioridade: ', COALESCE(Prioridade_Score, '')) as content
  FROM `operaciones-br.sales_intelligence.pipeline` WHERE Oportunidade IS NOT NULL
)
SELECT 
  ad.deal_id, ad.source, ad.Oportunidade, ad.Vendedor, ad.Gross, ad.Fiscal_Q, ad.Ciclo_dias,
  ad.Resumo_Analise, ad.Causa_Raiz, ad.Licoes_Aprendidas, ad.content,
  emb.text_embedding as embedding
FROM all_deals ad
JOIN (
  SELECT content, text_embedding
  FROM ML.GENERATE_TEXT_EMBEDDING(
    MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
    (SELECT content FROM all_deals),
    STRUCT(TRUE AS flatten_json_output)
  )
) emb ON ad.content = emb.content;
