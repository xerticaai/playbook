-- =====================================================================
-- RAG COMPLETO: Embedding de TODAS as colunas texto relevantes
-- Pipeline + Won + Lost (3 tabelas unificadas)
-- =====================================================================

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH 
-- ===== LOST DEALS (com TODAS as colunas) =====
lost_deals AS (
  SELECT 
    CONCAT('LOST-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'lost' as source,
    Oportunidade, Vendedor, Conta, Perfil_Cliente, Produtos, Portfolio, Segmento, Familia_Produto,
    Status, Fiscal_Q, Data_Fechamento, Ciclo_dias, Resumo_Analise, Causa_Raiz, Causas_Secundarias,
    Tipo_Resultado, Evitavel, Momento_Critico, Licoes_Aprendidas, Atividades, Ativ_7d, Ativ_30d,
    Distribuicao_Tipos, Periodo_Pico, Cadencia_Media_dias, Total_Mudancas, Mudancas_Criticas,
    Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor, Campos_Alterados, Padrao_Mudancas,
    Freq_Mudancas, Editores, Labels, Gross, Net, Ultima_Atualizacao, outcome,
    NULL as Stage, NULL as Prioridade_Score, NULL as Proxima_Acao, NULL as Health_Score, 
    NULL as Risco_Abandono, NULL as Fatores_Sucesso,
    CONCAT(
      '🔴 DEAL PERDIDO',
      ' | Oportunidade: ', COALESCE(Oportunidade, 'N/A'),
      ' | Cliente: ', COALESCE(Conta, 'N/A'),
      ' | Perfil: ', COALESCE(Perfil_Cliente, 'N/A'),
      ' | Vendedor: ', COALESCE(Vendedor, 'N/A'),
      ' | Produtos: ', COALESCE(Produtos, 'N/A'),
      ' | Portfólio: ', COALESCE(Portfolio, 'N/A'),
      ' | Segmento: ', COALESCE(Segmento, 'N/A'),
      ' | Família: ', COALESCE(Familia_Produto, 'N/A'),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Net: R$ ', CAST(COALESCE(Net, 0.0) AS STRING),
      ' | Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias',
      ' | Evitável: ', COALESCE(Evitavel, 'N/A'),
      ' | 🎯 Causa Raiz: ', COALESCE(Causa_Raiz, 'N/A'),
      ' | ⚠️ Causas Secundárias: ', COALESCE(Causas_Secundarias, 'N/A'),
      ' | 📝 Resumo: ', COALESCE(Resumo_Analise, 'N/A'),
      ' | 🚨 Momento Crítico: ', COALESCE(Momento_Critico, 'N/A'),
      ' | 💡 Lições: ', COALESCE(Licoes_Aprendidas, 'N/A'),
      ' | Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING),
      ' | Ativ 7d: ', CAST(COALESCE(Ativ_7d, 0) AS STRING),
      ' | Ativ 30d: ', CAST(COALESCE(Ativ_30d, 0) AS STRING),
      ' | Distribuição: ', COALESCE(Distribuicao_Tipos, 'N/A'),
      ' | Período Pico: ', COALESCE(Periodo_Pico, 'N/A'),
      ' | Cadência: ', CAST(COALESCE(Cadencia_Media_dias, 0.0) AS STRING), ' dias',
      ' | Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING),
      ' | Mudanças Críticas: ', CAST(COALESCE(Mudancas_Criticas, 0) AS STRING),
      ' | Mudanças Close Date: ', CAST(COALESCE(Mudancas_Close_Date, 0) AS STRING),
      ' | Mudanças Stage: ', CAST(COALESCE(Mudancas_Stage, 0) AS STRING),
      ' | Mudanças Valor: ', CAST(COALESCE(Mudancas_Valor, 0) AS STRING),
      ' | Campos Alterados: ', COALESCE(Campos_Alterados, 'N/A'),
      ' | Padrão Mudanças: ', COALESCE(Padrao_Mudancas, 'N/A'),
      ' | Freq. Mudanças: ', COALESCE(Freq_Mudancas, 'N/A'),
      ' | Editores: ', CAST(COALESCE(Editores, 0) AS STRING),
      ' | 🏷️ Labels: ', COALESCE(Labels, 'N/A')
    ) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  WHERE Oportunidade IS NOT NULL
),

-- ===== WON DEALS (com TODAS as colunas) =====
won_deals AS (
  SELECT 
    CONCAT('WON-', CAST(ROW_NUMBER() OVER (ORDER BY Data_Fechamento DESC) AS STRING)) as deal_id,
    'won' as source,
    Oportunidade, Vendedor, Conta, Perfil_Cliente, Produtos, Portfolio, Segmento, Familia_Produto,
    Status, Fiscal_Q, Data_Fechamento, Ciclo_dias, Resumo_Analise, Causa_Raiz, NULL as Causas_Secundarias,
    Tipo_Resultado, NULL as Evitavel, NULL as Momento_Critico, Licoes_Aprendidas, Atividades, Ativ_7d, Ativ_30d,
    Distribuicao_Tipos, Periodo_Pico, Cadencia_Media_dias, Total_Mudancas, Mudancas_Criticas,
    Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor, Campos_Alterados, Padrao_Mudancas,
    Freq_Mudancas, Editores, Labels, Gross, Net, Ultima_Atualizacao, outcome,
    NULL as Stage, NULL as Prioridade_Score, NULL as Proxima_Acao, NULL as Health_Score,
    NULL as Risco_Abandono, Fatores_Sucesso,
    CONCAT(
      '🟢 DEAL GANHO',
      ' | Oportunidade: ', COALESCE(Oportunidade, 'N/A'),
      ' | Cliente: ', COALESCE(Conta, 'N/A'),
      ' | Perfil: ', COALESCE(Perfil_Cliente, 'N/A'),
      ' | Vendedor: ', COALESCE(Vendedor, 'N/A'),
      ' | Produtos: ', COALESCE(Produtos, 'N/A'),
      ' | Portfólio: ', COALESCE(Portfolio, 'N/A'),
      ' | Segmento: ', COALESCE(Segmento, 'N/A'),
      ' | Família: ', COALESCE(Familia_Produto, 'N/A'),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Net: R$ ', CAST(COALESCE(Net, 0.0) AS STRING),
      ' | Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'),
      ' | Ciclo: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias',
      ' | 🎯 Causa Raiz: ', COALESCE(Causa_Raiz, 'N/A'),
      ' | ✨ Fatores Sucesso: ', COALESCE(Fatores_Sucesso, 'N/A'),
      ' | Qualidade: ', COALESCE(Qualidade_Engajamento, 'N/A'),
      ' | Gestão: ', COALESCE(Gestao_Oportunidade, 'N/A'),
      ' | 📝 Resumo: ', COALESCE(Resumo_Analise, 'N/A'),
      ' | 💡 Lições: ', COALESCE(Licoes_Aprendidas, 'N/A'),
      ' | Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING),
      ' | Ativ 7d: ', CAST(COALESCE(Ativ_7d, 0) AS STRING),
      ' | Ativ 30d: ', CAST(COALESCE(Ativ_30d, 0) AS STRING),
      ' | Distribuição: ', COALESCE(Distribuicao_Tipos, 'N/A'),
      ' | Período Pico: ', COALESCE(Periodo_Pico, 'N/A'),
      ' | Cadência: ', CAST(COALESCE(Cadencia_Media_dias, 0.0) AS STRING), ' dias',
      ' | Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING),
      ' | Mudanças Críticas: ', CAST(COALESCE(Mudancas_Criticas, 0) AS STRING),
      ' | Campos Alterados: ', COALESCE(Campos_Alterados, 'N/A'),
      ' | Padrão Mudanças: ', COALESCE(Padrao_Mudancas, 'N/A'),
      ' | 🏷️ Labels: ', COALESCE(Labels, 'N/A')
    ) as content
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  WHERE Oportunidade IS NOT NULL
),

-- ===== PIPELINE DEALS (com TODAS as colunas) =====
pipeline_deals AS (
  SELECT 
    CONCAT('PIPELINE-', CAST(ROW_NUMBER() OVER (ORDER BY Ultima_Atualizacao DESC) AS STRING)) as deal_id,
    'pipeline' as source,
    Oportunidade, Vendedor, Conta, Perfil_Cliente, Produtos, Portfolio, Segmento, Familia_Produto,
    Status_Engajamento as Status, Fiscal_Q, NULL as Data_Fechamento, Ciclo_dias_atual as Ciclo_dias,
    NULL as Resumo_Analise, NULL as Causa_Raiz, NULL as Causas_Secundarias, NULL as Tipo_Resultado,
    NULL as Evitavel, NULL as Momento_Critico, NULL as Licoes_Aprendidas, Atividades, Ativ_7d, Ativ_30d,
    Distribuicao_Tipos, Periodo_Pico, Cadencia_Media_dias, Total_Mudancas, Mudancas_Criticas,
    Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor, Campos_Alterados, Padrao_Mudancas,
    Freq_Mudancas, Editores, Labels, Gross, Net, Ultima_Atualizacao, NULL as outcome,
    Stage, Prioridade_Score, Proxima_Acao, Health_Score, Risco_Abandono, NULL as Fatores_Sucesso,
    CONCAT(
      '🔵 DEAL PIPELINE',
      ' | Oportunidade: ', COALESCE(Oportunidade, 'N/A'),
      ' | Cliente: ', COALESCE(Conta, 'N/A'),
      ' | Perfil: ', COALESCE(Perfil_Cliente, 'N/A'),
      ' | Vendedor: ', COALESCE(Vendedor, 'N/A'),
      ' | Produtos: ', COALESCE(Produtos, 'N/A'),
      ' | Portfólio: ', COALESCE(Portfolio, 'N/A'),
      ' | Segmento: ', COALESCE(Segmento, 'N/A'),
      ' | Família: ', COALESCE(Familia_Produto, 'N/A'),
      ' | Stage: ', COALESCE(Stage, 'N/A'),
      ' | Valor: R$ ', CAST(COALESCE(Gross, 0.0) AS STRING),
      ' | Net: R$ ', CAST(COALESCE(Net, 0.0) AS STRING),
      ' | Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'),
      ' | Ciclo Atual: ', CAST(COALESCE(Ciclo_dias_atual, 0) AS STRING), ' dias',
      ' | Prioridade: ', COALESCE(Prioridade_Score, 'N/A'),
      ' | Health Score: ', CAST(COALESCE(Health_Score, 0) AS STRING),
      ' | Risco Abandono: ', COALESCE(Risco_Abandono, 'N/A'),
      ' | Próxima Ação: ', COALESCE(Proxima_Acao, 'N/A'),
      ' | Status Engajamento: ', COALESCE(Status_Engajamento, 'N/A'),
      ' | Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING),
      ' | Distribuição: ', COALESCE(Distribuicao_Tipos, 'N/A'),
      ' | Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING),
      ' | Padrão Mudanças: ', COALESCE(Padrao_Mudancas, 'N/A'),
      ' | 🏷️ Labels: ', COALESCE(Labels, 'N/A')
    ) as content
  FROM `operaciones-br.sales_intelligence.pipeline`
  WHERE Oportunidade IS NOT NULL
),

-- ===== UNIÃO DAS 3 TABELAS =====
unified_deals AS (
  SELECT * FROM lost_deals
  UNION ALL
  SELECT * FROM won_deals
  UNION ALL
  SELECT * FROM pipeline_deals
)

-- ===== GERAR EMBEDDINGS =====
SELECT 
  deal_id, source, Oportunidade, Vendedor, Conta, Perfil_Cliente, Produtos, Portfolio, Segmento, Familia_Produto,
  Status, Fiscal_Q, Data_Fechamento, Ciclo_dias, Resumo_Analise, Causa_Raiz, Causas_Secundarias, Tipo_Resultado,
  Evitavel, Momento_Critico, Licoes_Aprendidas, Atividades, Ativ_7d, Ativ_30d, Distribuicao_Tipos, Periodo_Pico,
  Cadencia_Media_dias, Total_Mudancas, Mudancas_Criticas, Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor,
  Campos_Alterados, Padrao_Mudancas, Freq_Mudancas, Editores, Labels, Gross, Net, Ultima_Atualizacao, outcome,
  Stage, Prioridade_Score, Proxima_Acao, Health_Score, Risco_Abandono, Fatores_Sucesso, content,
  ml_generate_embedding_result as embedding
FROM ML.GENERATE_TEXT_EMBEDDING(
  MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
  (SELECT * FROM unified_deals),
  STRUCT(TRUE AS flatten_json_output)
);
