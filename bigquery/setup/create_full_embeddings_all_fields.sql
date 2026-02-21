-- ==========================================
-- CRIAÇÃO COMPLETA DE EMBEDDINGS
-- Todas as tabelas (lost, won, pipeline)
-- Todos os campos relevantes
-- ==========================================

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH all_deals AS (
  
  -- ========================================
  -- LOST DEALS (45 campos totais)
  -- ========================================
  SELECT 
    CONCAT('L', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'lost' as source,
    
    -- Identificação
    Oportunidade,
    Vendedor,
    Conta,
    Segmento,
    Portfolio,
    
    -- Valores
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    
    -- Produtos
    Produtos,
    Familia_Produto,
    
    -- Ciclo e Timing
    CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
    Data_Fechamento,
    outcome as Fase,
    
    -- Análise de Perda
    Causa_Raiz,
    Causas_Secundarias,
    Resumo_Analise,
    Licoes_Aprendidas,
    Evitavel,
    Momento_Critico,
    Sinais_Alerta,
    Tipo_Resultado,
    
    -- Fatores
    Fatores_Sucesso,
    Perfil_Cliente,
    
    -- Atividades
    CAST(Atividades AS INT64) as Atividades,
    CAST(Ativ_7d AS INT64) as Ativ_7d,
    CAST(Ativ_30d AS INT64) as Ativ_30d,
    Qualidade_Engajamento,
    Distribuicao_Tipos,
    CAST(Cadencia_Media_dias AS FLOAT64) as Cadencia_Media_dias,
    Periodo_Pico,
    
    -- Mudanças
    CAST(Total_Mudancas AS INT64) as Total_Mudancas,
    CAST(Mudancas_Valor AS INT64) as Mudancas_Valor,
    CAST(Mudancas_Close_Date AS INT64) as Mudancas_Close_Date,
    CAST(Mudancas_Stage AS INT64) as Mudancas_Stage,
    Mudancas_Criticas,
    Campos_Alterados,
    Freq_Mudancas,
    Padrao_Mudancas,
    
    -- Gestão
    Gestao_Oportunidade,
    Labels,
    Editores,
    Status,
    Ultima_Atualizacao,
    
    -- Scores (NULL para lost)
    CAST(NULL AS FLOAT64) as BANT_Score,
    CAST(NULL AS FLOAT64) as MEDDIC_Score,
    CAST(NULL AS FLOAT64) as Forecast_IA,
    CAST(NULL AS FLOAT64) as Confianca,
    CAST(NULL AS STRING) as Flags_de_Risco,
    CAST(NULL AS STRING) as Risco_Principal,
    CAST(NULL AS STRING) as BANT_Gaps,
    CAST(NULL AS STRING) as MEDDIC_Gaps,
    CAST(NULL AS STRING) as Acao_Sugerida,
    CAST(NULL AS INT64) as Idle_Dias,
    
    -- Metadata
    Run_ID,
    data_carga,
    
    -- CONTENT COMPLETO PARA EMBEDDING
    CONCAT(
      'Deal ID: L-', Oportunidade, '\n',
      'Status: PERDIDO\n',
      'Vendedor: ', COALESCE(Vendedor, 'N/A'), '\n',
      'Conta: ', COALESCE(Conta, 'N/A'), '\n',
      'Segmento: ', COALESCE(Segmento, 'N/A'), '\n',
      'Valor Gross: ', CAST(COALESCE(Gross, 0) AS STRING), '\n',
      'Valor Net: ', CAST(COALESCE(Net, 0) AS STRING), '\n',
      'Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'), '\n',
      'Produtos: ', COALESCE(Produtos, 'N/A'), '\n',
      'Família Produto: ', COALESCE(Familia_Produto, 'N/A'), '\n',
      'Portfolio: ', COALESCE(Portfolio, 'N/A'), '\n',
      'Ciclo de Venda: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias\n',
      '\n--- ANÁLISE DE PERDA ---\n',
      'Causa Raiz: ', COALESCE(Causa_Raiz, 'Não especificada'), '\n',
      'Causas Secundárias: ', COALESCE(Causas_Secundarias, 'N/A'), '\n',
      'Evitável: ', COALESCE(Evitavel, 'N/A'), '\n',
      'Momento Crítico: ', COALESCE(Momento_Critico, 'N/A'), '\n',
      'Sinais de Alerta: ', COALESCE(Sinais_Alerta, 'N/A'), '\n',
      'Resumo: ', COALESCE(Resumo_Analise, 'N/A'), '\n',
      'Lições Aprendidas: ', COALESCE(Licoes_Aprendidas, 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING), '\n',
      'Atividades 7d: ', CAST(COALESCE(Ativ_7d, 0) AS STRING), '\n',
      'Atividades 30d: ', CAST(COALESCE(Ativ_30d, 0) AS STRING), '\n',
      'Qualidade Engajamento: ', COALESCE(Qualidade_Engajamento, 'N/A'), '\n',
      'Distribuição Tipos: ', COALESCE(Distribuicao_Tipos, 'N/A'), '\n',
      '\n--- MUDANÇAS ---\n',
      'Total Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING), '\n',
      'Mudanças Críticas: ', COALESCE(Mudancas_Criticas, 'N/A'), '\n',
      'Padrão Mudanças: ', COALESCE(Padrao_Mudancas, 'N/A'), '\n',
      '\n--- CONTEXTO ---\n',
      'Perfil Cliente: ', COALESCE(Perfil_Cliente, 'N/A'), '\n',
      'Gestão Oportunidade: ', COALESCE(Gestao_Oportunidade, 'N/A'), '\n',
      'Fatores: ', COALESCE(Fatores_Sucesso, 'N/A'), '\n',
      'Labels: ', COALESCE(Labels, 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  
  UNION ALL
  
  -- ========================================
  -- WON DEALS (41 campos totais)
  -- ========================================
  SELECT 
    CONCAT('W', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'won' as source,
    
    -- Identificação
    Oportunidade,
    Vendedor,
    Conta,
    Segmento,
    Portfolio,
    
    -- Valores
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    
    -- Produtos
    Produtos,
    Familia_Produto,
    
    -- Ciclo e Timing
    CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
    Data_Fechamento,
    outcome as Fase,
    
    -- Análise de Sucesso (won não tem campos de perda específicos)
    CAST(NULL AS STRING) as Causa_Raiz,
    CAST(NULL AS STRING) as Causas_Secundarias,
    Resumo_Analise,
    Licoes_Aprendidas,
    CAST(NULL AS STRING) as Evitavel,
    CAST(NULL AS STRING) as Momento_Critico,
    CAST(NULL AS STRING) as Sinais_Alerta,
    Tipo_Resultado,
    
    -- Fatores
    Fatores_Sucesso,
    Perfil_Cliente,
    
    -- Atividades
    CAST(Atividades AS INT64) as Atividades,
    CAST(Ativ_7d AS INT64) as Ativ_7d,
    CAST(Ativ_30d AS INT64) as Ativ_30d,
    Qualidade_Engajamento,
    Distribuicao_Tipos,
    CAST(Cadencia_Media_dias AS FLOAT64) as Cadencia_Media_dias,
    Periodo_Pico,
    
    -- Mudanças
    CAST(Total_Mudancas AS INT64) as Total_Mudancas,
    CAST(Mudancas_Valor AS INT64) as Mudancas_Valor,
    CAST(Mudancas_Close_Date AS INT64) as Mudancas_Close_Date,
    CAST(Mudancas_Stage AS INT64) as Mudancas_Stage,
    Mudancas_Criticas,
    Campos_Alterados,
    Freq_Mudancas,
    Padrao_Mudancas,
    
    -- Gestão
    Gestao_Oportunidade,
    Labels,
    Editores,
    Status,
    Ultima_Atualizacao,
    
    -- Scores (NULL para won)
    CAST(NULL AS FLOAT64) as BANT_Score,
    CAST(NULL AS FLOAT64) as MEDDIC_Score,
    CAST(NULL AS FLOAT64) as Forecast_IA,
    CAST(NULL AS FLOAT64) as Confianca,
    CAST(NULL AS STRING) as Flags_de_Risco,
    CAST(NULL AS STRING) as Risco_Principal,
    CAST(NULL AS STRING) as BANT_Gaps,
    CAST(NULL AS STRING) as MEDDIC_Gaps,
    CAST(NULL AS STRING) as Acao_Sugerida,
    CAST(NULL AS INT64) as Idle_Dias,
    
    -- Metadata
    Run_ID,
    data_carga,
    
    -- CONTENT COMPLETO PARA EMBEDDING
    CONCAT(
      'Deal ID: W-', Oportunidade, '\n',
      'Status: GANHA ✓\n',
      'Vendedor: ', COALESCE(Vendedor, 'N/A'), '\n',
      'Conta: ', COALESCE(Conta, 'N/A'), '\n',
      'Segmento: ', COALESCE(Segmento, 'N/A'), '\n',
      'Valor Gross: ', CAST(COALESCE(Gross, 0) AS STRING), '\n',
      'Valor Net: ', CAST(COALESCE(Net, 0) AS STRING), '\n',
      'Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'), '\n',
      'Produtos: ', COALESCE(Produtos, 'N/A'), '\n',
      'Família Produto: ', COALESCE(Familia_Produto, 'N/A'), '\n',
      'Portfolio: ', COALESCE(Portfolio, 'N/A'), '\n',
      'Ciclo de Venda: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias\n',
      '\n--- ANÁLISE DE SUCESSO ---\n',
      'Tipo Resultado: ', COALESCE(Tipo_Resultado, 'N/A'), '\n',
      'Resumo: ', COALESCE(Resumo_Analise, 'N/A'), '\n',
      'Lições Aprendidas: ', COALESCE(Licoes_Aprendidas, 'N/A'), '\n',
      'Fatores de Sucesso: ', COALESCE(Fatores_Sucesso, 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING), '\n',
      'Atividades 7d: ', CAST(COALESCE(Ativ_7d, 0) AS STRING), '\n',
      'Atividades 30d: ', CAST(COALESCE(Ativ_30d, 0) AS STRING), '\n',
      'Qualidade Engajamento: ', COALESCE(Qualidade_Engajamento, 'N/A'), '\n',
      'Distribuição Tipos: ', COALESCE(Distribuicao_Tipos, 'N/A'), '\n',
      'Cadência Média: ', CAST(COALESCE(Cadencia_Media_dias, 0) AS STRING), ' dias\n',
      '\n--- MUDANÇAS ---\n',
      'Total Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING), '\n',
      'Mudanças Críticas: ', COALESCE(Mudancas_Criticas, 'N/A'), '\n',
      'Padrão Mudanças: ', COALESCE(Padrao_Mudancas, 'N/A'), '\n',
      '\n--- CONTEXTO ---\n',
      'Perfil Cliente: ', COALESCE(Perfil_Cliente, 'N/A'), '\n',
      'Gestão Oportunidade: ', COALESCE(Gestao_Oportunidade, 'N/A'), '\n',
      'Labels: ', COALESCE(Labels, 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  
  UNION ALL
  
  -- ========================================
  -- PIPELINE (62 campos totais)
  -- ========================================
  SELECT 
    CONCAT('P', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'pipeline' as source,
    
    -- Identificação
    Oportunidade,
    Vendedor,
    Conta,
    CAST(NULL AS STRING) as Segmento,
    CAST(NULL AS STRING) as Portfolio,
    
    -- Valores
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    Fiscal_Q,
    
    -- Produtos
    Produtos,
    CAST(NULL AS STRING) as Familia_Produto,
    
    -- Ciclo e Timing
    CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
    CAST(Data_Prevista AS STRING) as Data_Fechamento,
    Fase_Atual as Fase,
    
    -- Análise (pipeline não tem análise de perda/sucesso)
    CAST(NULL AS STRING) as Causa_Raiz,
    CAST(NULL AS STRING) as Causas_Secundarias,
    CAST(NULL AS STRING) as Resumo_Analise,
    CAST(NULL AS STRING) as Licoes_Aprendidas,
    CAST(NULL AS STRING) as Evitavel,
    CAST(NULL AS STRING) as Momento_Critico,
    CAST(NULL AS STRING) as Sinais_Alerta,
    CAST(NULL AS STRING) as Tipo_Resultado,
    
    -- Fatores
    CAST(NULL AS STRING) as Fatores_Sucesso,
    Perfil as Perfil_Cliente,
    
    -- Atividades
    CAST(Atividades AS INT64) as Atividades,
    CAST(NULL AS INT64) as Ativ_7d,
    CAST(NULL AS INT64) as Ativ_30d,
    Qualidade_Engajamento,
    Mix_Atividades as Distribuicao_Tipos,
    CAST(NULL AS FLOAT64) as Cadencia_Media_dias,
    CAST(NULL AS STRING) as Periodo_Pico,
    
    -- Mudanças
    CAST(Total_Mudancas AS INT64) as Total_Mudancas,
    CAST(Mudancas_Valor AS INT64) as Mudancas_Valor,
    CAST(Mudancas_Close_Date AS INT64) as Mudancas_Close_Date,
    CAST(Mudancas_Stage AS INT64) as Mudancas_Stage,
    Mudancas_Criticas,
    CAST(NULL AS STRING) as Campos_Alterados,
    CAST(NULL AS STRING) as Freq_Mudancas,
    CAST(NULL AS STRING) as Padrao_Mudancas,
    
    -- Gestão
    CAST(NULL AS STRING) as Gestao_Oportunidade,
    CAST(NULL AS STRING) as Labels,
    CAST(NULL AS STRING) as Editores,
    CAST(NULL AS STRING) as Status,
    Ultima_Atualizacao,
    
    -- Scores (pipeline TEM scores)
    CAST(BANT_Score AS FLOAT64) as BANT_Score,
    CAST(MEDDIC_Score AS FLOAT64) as MEDDIC_Score,
    CAST(Forecast_IA AS FLOAT64) as Forecast_IA,
    CAST(Confianca AS FLOAT64) as Confianca,
    Flags_de_Risco,
    Risco_Principal,
    BANT_Gaps,
    MEDDIC_Gaps,
    Acao_Sugerida,
    CAST(Idle_Dias AS INT64) as Idle_Dias,
    
    -- Metadata
    Run_ID,
    data_carga,
    
    -- CONTENT COMPLETO PARA EMBEDDING
    CONCAT(
      'Deal ID: P-', Oportunidade, '\n',
      'Status: EM ANDAMENTO (Pipeline)\n',
      'Fase Atual: ', COALESCE(Fase_Atual, 'N/A'), '\n',
      'Vendedor: ', COALESCE(Vendedor, 'N/A'), '\n',
      'Conta: ', COALESCE(Conta, 'N/A'), '\n',
      'Valor Gross: ', CAST(COALESCE(Gross, 0) AS STRING), '\n',
      'Valor Net: ', CAST(COALESCE(Net, 0) AS STRING), '\n',
      'Fiscal Q: ', COALESCE(Fiscal_Q, 'N/A'), '\n',
      'Produtos: ', COALESCE(Produtos, 'N/A'), '\n',
      'Data Prevista: ', COALESCE(CAST(Data_Prevista AS STRING), 'N/A'), '\n',
      'Dias no Funil: ', CAST(COALESCE(Ciclo_dias, 0) AS STRING), ' dias\n',
      'Dias Idle: ', CAST(COALESCE(Idle_Dias, 0) AS STRING), ' dias\n',
      '\n--- SCORES E QUALIFICAÇÃO ---\n',
      'BANT Score: ', CAST(COALESCE(BANT_Score, 0) AS STRING), '\n',
      'BANT Gaps: ', COALESCE(BANT_Gaps, 'N/A'), '\n',
      'MEDDIC Score: ', CAST(COALESCE(MEDDIC_Score, 0) AS STRING), '\n',
      'MEDDIC Gaps: ', COALESCE(MEDDIC_Gaps, 'N/A'), '\n',
      'Forecast IA: ', CAST(COALESCE(Forecast_IA, 0) AS STRING), '%\n',
      'Confiança: ', CAST(COALESCE(Confianca, 0) AS STRING), '%\n',
      '\n--- RISCOS E AÇÕES ---\n',
      'Flags de Risco: ', COALESCE(Flags_de_Risco, 'Nenhum'), '\n',
      'Risco Principal: ', COALESCE(Risco_Principal, 'N/A'), '\n',
      'Ação Sugerida: ', COALESCE(Acao_Sugerida, 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', CAST(COALESCE(Atividades, 0) AS STRING), '\n',
      'Qualidade Engajamento: ', COALESCE(Qualidade_Engajamento, 'N/A'), '\n',
      'Mix Atividades: ', COALESCE(Mix_Atividades, 'N/A'), '\n',
      '\n--- MUDANÇAS ---\n',
      'Total Mudanças: ', CAST(COALESCE(Total_Mudancas, 0) AS STRING), '\n',
      'Mudanças Críticas: ', COALESCE(Mudancas_Criticas, 'N/A'), '\n',
      'Anomalias: ', COALESCE(Anomalias_Detectadas, 'N/A'), '\n',
      '\n--- CONTEXTO ---\n',
      'Perfil Cliente: ', COALESCE(Perfil, 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.pipeline`
)

-- ========================================
-- GERAÇÃO DOS EMBEDDINGS
-- ========================================
SELECT 
  ad.deal_id,
  ad.source,
  ad.Oportunidade,
  ad.Vendedor,
  ad.Conta,
  ad.Segmento,
  ad.Portfolio,
  ad.Gross,
  ad.Net,
  ad.Fiscal_Q,
  ad.Produtos,
  ad.Familia_Produto,
  ad.Ciclo_dias,
  ad.Data_Fechamento,
  ad.Fase,
  ad.Causa_Raiz,
  ad.Causas_Secundarias,
  ad.Resumo_Analise,
  ad.Licoes_Aprendidas,
  ad.Evitavel,
  ad.Momento_Critico,
  ad.Sinais_Alerta,
  ad.Tipo_Resultado,
  ad.Fatores_Sucesso,
  ad.Perfil_Cliente,
  ad.Atividades,
  ad.Ativ_7d,
  ad.Ativ_30d,
  ad.Qualidade_Engajamento,
  ad.Distribuicao_Tipos,
  ad.Cadencia_Media_dias,
  ad.Periodo_Pico,
  ad.Total_Mudancas,
  ad.Mudancas_Valor,
  ad.Mudancas_Close_Date,
  ad.Mudancas_Stage,
  ad.Mudancas_Criticas,
  ad.Campos_Alterados,
  ad.Freq_Mudancas,
  ad.Padrao_Mudancas,
  ad.Gestao_Oportunidade,
  ad.Labels,
  ad.Editores,
  ad.Status,
  ad.Ultima_Atualizacao,
  ad.BANT_Score,
  ad.MEDDIC_Score,
  ad.Forecast_IA,
  ad.Confianca,
  ad.Flags_de_Risco,
  ad.Risco_Principal,
  ad.BANT_Gaps,
  ad.MEDDIC_Gaps,
  ad.Acao_Sugerida,
  ad.Idle_Dias,
  ad.Run_ID,
  ad.data_carga,
  ad.content,
  emb.text_embedding as embedding
FROM all_deals ad
CROSS JOIN ML.GENERATE_TEXT_EMBEDDING(
  MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
  (SELECT ad.content as content)
) emb;
