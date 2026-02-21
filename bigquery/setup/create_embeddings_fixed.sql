-- =====================================================================
-- RAG COMPLETO: Embedding corrigido com CAST adequado
-- =====================================================================

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH 
-- ===== LOST DEALS =====
lost_deals AS (
  SELECT 
    CONCAT('LOST-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'lost' as source,
    Oportunidade, Vendedor, Conta, Gross, Fiscal_Q, Ciclo_dias, Resumo_Analise, Causa_Raiz, 
    Causas_Secundarias, Evitavel, Momento_Critico, Licoes_Aprendidas, Labels, Fatores_Sucesso,
    CONCAT(
      '🔴 PERDIDO | ', COALESCE(Oportunidade, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Q: ', COALESCE(Fiscal_Q, ''),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), 'd',
      ' | Evitável: ', COALESCE(Evitavel, ''),
      ' | CAUSA: ', COALESCE(Causa_Raiz, ''),
      ' | Sec: ', COALESCE(Causas_Secundarias, ''),
      ' | Momento: ', COALESCE(Momento_Critico, ''),
      ' | ', COALESCE(Resumo_Analise, ''),
      ' | Lições: ', COALESCE(Licoes_Aprendidas, ''),
      ' | Tags: ', COALESCE(Labels, '')
    ) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  WHERE Oportunidade IS NOT NULL
),

-- ===== WON DEALS =====
won_deals AS (
  SELECT 
    CONCAT('WON-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'won' as source,
    Oportunidade, Vendedor, Conta, Gross, Fiscal_Q, Ciclo_dias, Resumo_Analise, Causa_Raiz,
    NULL as Causas_Secundarias, NULL as Evitavel, NULL as Momento_Critico, Licoes_Aprendidas, Labels, Fatores_Sucesso,
    CONCAT(
      '🟢 GANHO | ', COALESCE(Oportunidade, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Q: ', COALESCE(Fiscal_Q, ''),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), 'd',
      ' | CAUSA: ', COALESCE(Causa_Raiz, ''),
      ' | Fatores: ', COALESCE(Fatores_Sucesso, ''),
      ' | ', COALESCE(Resumo_Analise, ''),
      ' | Lições: ', COALESCE(Licoes_Aprendidas, ''),
      ' | Tags: ', COALESCE(Labels, '')
    ) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  WHERE Oportunidade IS NOT NULL
),

-- ===== PIPELINE DEALS =====
pipeline_deals AS (
  SELECT 
    CONCAT('PIPELINE-', CAST(ROW_NUMBER() OVER (ORDER BY Ultima_Atualizacao DESC) AS STRING)) as deal_id,
    'pipeline' as source,
    Oportunidade, Vendedor, Conta, Gross, Fiscal_Q, Ciclo_dias_atual as Ciclo_dias, 
    NULL as Resumo_Analise, NULL as Causa_Raiz, NULL as Causas_Secundarias, NULL as Evitavel,
    NULL as Momento_Critico, NULL as Licoes_Aprendidas, Labels, NULL as Fatores_Sucesso,
    CONCAT(
      '🔵 PIPELINE | ', COALESCE(Oportunidade, ''),
      ' | Vendedor: ', COALESCE(Vendedor, ''),
      ' | Cliente: ', COALESCE(Conta, ''),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Q: ', COALESCE(Fiscal_Q, ''),
      ' | Stage: ', COALESCE(Stage, ''),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias_atual, 0) AS STRING), 'd',
      ' | Prioridade: ', COALESCE(Prioridade_Score, ''),
      ' | Ação: ', COALESCE(Proxima_Acao, ''),
      ' | Risco: ', COALESCE(Risco_Abandono, ''),
      ' | Tags: ', COALESCE(Labels, '')
    ) as content
  FROM `operaciones-br.sales_intelligence.pipeline`
  WHERE Oportunidade IS NOT NULL
),

-- ===== UNIÃO =====
unified_deals AS (
  SELECT * FROM lost_deals
  UNION ALL
  SELECT * FROM won_deals
  UNION ALL
  SELECT * FROM pipeline_deals
)

-- ===== GERAR EMBEDDINGS =====
SELECT 
  deal_id, source, Oportunidade, Vendedor, Conta, Gross, Fiscal_Q, Ciclo_dias,
  Resumo_Analise, Causa_Raiz, Causas_Secundarias, Evitavel, Momento_Critico,
  Licoes_Aprendidas, Labels, Fatores_Sucesso, content,
  ml_generate_embedding_result as embedding
FROM ML.GENERATE_TEXT_EMBEDDING(
  MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
  (SELECT * FROM unified_deals),
  STRUCT(TRUE AS flatten_json_output)
);
