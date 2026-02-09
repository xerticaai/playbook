-- ==========================================
-- CRIAÇÃO DE EMBEDDINGS - TIPOS CORRETOS
-- Todas as tabelas com tipos alinhados
-- ==========================================

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.deal_embeddings` AS
WITH all_deals AS (
  
  -- ========================================
  -- LOST DEALS
  -- ========================================
  SELECT 
    CONCAT('L', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'lost' as source,
    
    -- Campos estruturados (tipos unificados para UNION)
    CAST(Oportunidade AS STRING) as Oportunidade,
    CAST(Vendedor AS STRING) as Vendedor,
    CAST(Conta AS STRING) as Conta,
    CAST(Segmento AS STRING) as Segmento,
    CAST(Portfolio AS STRING) as Portfolio,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    CAST(Fiscal_Q AS STRING) as Fiscal_Q,
    CAST(Produtos AS STRING) as Produtos,
    CAST(Familia_Produto AS STRING) as Familia_Produto,
    CAST(outcome AS STRING) as Fase,
    
    -- Content completo para embedding
    CONCAT(
      'Deal ID: L-', COALESCE(CAST(Oportunidade AS STRING), 'N/A'), '\n',
      'Status: PERDIDO\n',
      'Vendedor: ', COALESCE(CAST(Vendedor AS STRING), 'N/A'), '\n',
      'Conta: ', COALESCE(CAST(Conta AS STRING), 'N/A'), '\n',
      'Segmento: ', COALESCE(CAST(Segmento AS STRING), 'N/A'), '\n',
      'Portfolio: ', COALESCE(CAST(Portfolio AS STRING), 'N/A'), '\n',
      'Valor Gross: R$ ', COALESCE(CAST(Gross AS STRING), '0'), '\n',
      'Valor Net: R$ ', COALESCE(CAST(Net AS STRING), '0'), '\n',
      'Fiscal Q: ', COALESCE(CAST(Fiscal_Q AS STRING), 'N/A'), '\n',
      'Produtos: ', COALESCE(CAST(Produtos AS STRING), 'N/A'), '\n',
      'Família Produto: ', COALESCE(CAST(Familia_Produto AS STRING), 'N/A'), '\n',
      'Ciclo de Venda: ', COALESCE(CAST(Ciclo_dias AS STRING), '0'), ' dias\n',
      'Data Fechamento: ', COALESCE(CAST(Data_Fechamento AS STRING), 'N/A'), '\n',
      '\n--- ANÁLISE DE PERDA ---\n',
      'Causa Raiz: ', COALESCE(CAST(Causa_Raiz AS STRING), 'Não especificada'), '\n',
      'Causas Secundárias: ', COALESCE(CAST(Causas_Secundarias AS STRING), 'N/A'), '\n',
      'Evitável: ', COALESCE(CAST(Evitavel AS STRING), 'N/A'), '\n',
      'Momento Crítico: ', COALESCE(CAST(Momento_Critico AS STRING), 'N/A'), '\n',
      'Sinais de Alerta: ', COALESCE(CAST(Sinais_Alerta AS STRING), 'N/A'), '\n',
      'Tipo Resultado: ', COALESCE(CAST(Tipo_Resultado AS STRING), 'N/A'), '\n',
      'Resumo: ', COALESCE(CAST(Resumo_Analise AS STRING), 'N/A'), '\n',
      'Lições Aprendidas: ', COALESCE(CAST(Licoes_Aprendidas AS STRING), 'N/A'), '\n',
      '\n--- PERFIL E GESTÃO ---\n',
      'Perfil Cliente: ', COALESCE(CAST(Perfil_Cliente AS STRING), 'N/A'), '\n',
      'Gestão Oportunidade: ', COALESCE(CAST(Gestao_Oportunidade AS STRING), 'N/A'), '\n',
      'Fatores: ', COALESCE(CAST(Fatores_Sucesso AS STRING), 'N/A'), '\n',
      'Status: ', COALESCE(CAST(Status AS STRING), 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', COALESCE(CAST(Atividades AS STRING), '0'), '\n',
      'Atividades 7d: ', COALESCE(CAST(Ativ_7d AS STRING), '0'), '\n',
      'Atividades 30d: ', COALESCE(CAST(Ativ_30d AS STRING), '0'), '\n',
      'Qualidade Engajamento: ', COALESCE(CAST(Qualidade_Engajamento AS STRING), 'N/A'), '\n',
      'Distribuição Tipos: ', COALESCE(CAST(Distribuicao_Tipos AS STRING), 'N/A'), '\n',
      'Cadência Média: ', COALESCE(CAST(Cadencia_Media_dias AS STRING), '0'), ' dias\n',
      'Período Pico: ', COALESCE(CAST(Periodo_Pico AS STRING), 'N/A'), '\n',
      '\n--- MUDANÇAS E EVOLUÇÃO ---\n',
      'Total Mudanças: ', COALESCE(CAST(Total_Mudancas AS STRING), '0'), '\n',
      'Mudanças Valor: ', COALESCE(CAST(Mudancas_Valor AS STRING), '0'), '\n',
      'Mudanças Close Date: ', COALESCE(CAST(Mudancas_Close_Date AS STRING), '0'), '\n',
      'Mudanças Stage: ', COALESCE(CAST(Mudancas_Stage AS STRING), '0'), '\n',
      'Mudanças Críticas: ', COALESCE(CAST(Mudancas_Criticas AS STRING), 'N/A'), '\n',
      'Frequência Mudanças: ', COALESCE(CAST(Freq_Mudancas AS STRING), 'N/A'), '\n',
      'Padrão Mudanças: ', COALESCE(CAST(Padrao_Mudancas AS STRING), 'N/A'), '\n',
      'Campos Alterados: ', COALESCE(CAST(Campos_Alterados AS STRING), 'N/A'), '\n',
      '\n--- CONTEXTO ADICIONAL ---\n',
      'Labels: ', COALESCE(CAST(Labels AS STRING), 'N/A'), '\n',
      'Editores: ', COALESCE(CAST(Editores AS STRING), 'N/A'), '\n',
      'Última Atualização: ', COALESCE(CAST(Ultima_Atualizacao AS STRING), 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
  
  UNION ALL
  
  -- ========================================
  -- WON DEALS
  -- ========================================
  SELECT 
    CONCAT('W', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'won' as source,
    
    -- Campos estruturados
    CAST(Oportunidade AS STRING) as Oportunidade,
    CAST(Vendedor AS STRING) as Vendedor,
    CAST(Conta AS STRING) as Conta,
    CAST(Segmento AS STRING) as Segmento,
    CAST(Portfolio AS STRING) as Portfolio,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    CAST(Fiscal_Q AS STRING) as Fiscal_Q,
    CAST(Produtos AS STRING) as Produtos,
    CAST(Familia_Produto AS STRING) as Familia_Produto,
    CAST(outcome AS STRING) as Fase,
    
    -- Content completo
    CONCAT(
      'Deal ID: W-', COALESCE(CAST(Oportunidade AS STRING), 'N/A'), '\n',
      'Status: GANHA ✓\n',
      'Vendedor: ', COALESCE(CAST(Vendedor AS STRING), 'N/A'), '\n',
      'Conta: ', COALESCE(CAST(Conta AS STRING), 'N/A'), '\n',
      'Segmento: ', COALESCE(CAST(Segmento AS STRING), 'N/A'), '\n',
      'Portfolio: ', COALESCE(CAST(Portfolio AS STRING), 'N/A'), '\n',
      'Valor Gross: R$ ', COALESCE(CAST(Gross AS STRING), '0'), '\n',
      'Valor Net: R$ ', COALESCE(CAST(Net AS STRING), '0'), '\n',
      'Fiscal Q: ', COALESCE(CAST(Fiscal_Q AS STRING), 'N/A'), '\n',
      'Produtos: ', COALESCE(CAST(Produtos AS STRING), 'N/A'), '\n',
      'Família Produto: ', COALESCE(CAST(Familia_Produto AS STRING), 'N/A'), '\n',
      'Ciclo de Venda: ', COALESCE(CAST(Ciclo_dias AS STRING), '0'), ' dias\n',
      'Data Fechamento: ', COALESCE(CAST(Data_Fechamento AS STRING), 'N/A'), '\n',
      '\n--- ANÁLISE DE SUCESSO ---\n',
      'Tipo Resultado: ', COALESCE(CAST(Tipo_Resultado AS STRING), 'N/A'), '\n',
      'Resumo: ', COALESCE(CAST(Resumo_Analise AS STRING), 'N/A'), '\n',
      'Lições Aprendidas: ', COALESCE(CAST(Licoes_Aprendidas AS STRING), 'N/A'), '\n',
      'Fatores de Sucesso: ', COALESCE(CAST(Fatores_Sucesso AS STRING), 'N/A'), '\n',
      '\n--- PERFIL E GESTÃO ---\n',
      'Perfil Cliente: ', COALESCE(CAST(Perfil_Cliente AS STRING), 'N/A'), '\n',
      'Gestão Oportunidade: ', COALESCE(CAST(Gestao_Oportunidade AS STRING), 'N/A'), '\n',
      'Status: ', COALESCE(CAST(Status AS STRING), 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', COALESCE(CAST(Atividades AS STRING), '0'), '\n',
      'Atividades 7d: ', COALESCE(CAST(Ativ_7d AS STRING), '0'), '\n',
      'Atividades 30d: ', COALESCE(CAST(Ativ_30d AS STRING), '0'), '\n',
      'Qualidade Engajamento: ', COALESCE(CAST(Qualidade_Engajamento AS STRING), 'N/A'), '\n',
      'Distribuição Tipos: ', COALESCE(CAST(Distribuicao_Tipos AS STRING), 'N/A'), '\n',
      'Cadência Média: ', COALESCE(CAST(Cadencia_Media_dias AS STRING), '0'), ' dias\n',
      'Período Pico: ', COALESCE(CAST(Periodo_Pico AS STRING), 'N/A'), '\n',
      '\n--- MUDANÇAS E EVOLUÇÃO ---\n',
      'Total Mudanças: ', COALESCE(CAST(Total_Mudancas AS STRING), '0'), '\n',
      'Mudanças Valor: ', COALESCE(CAST(Mudancas_Valor AS STRING), '0'), '\n',
      'Mudanças Close Date: ', COALESCE(CAST(Mudancas_Close_Date AS STRING), '0'), '\n',
      'Mudanças Stage: ', COALESCE(CAST(Mudancas_Stage AS STRING), '0'), '\n',
      'Mudanças Críticas: ', COALESCE(CAST(Mudancas_Criticas AS STRING), 'N/A'), '\n',
      'Frequência Mudanças: ', COALESCE(CAST(Freq_Mudancas AS STRING), 'N/A'), '\n',
      'Padrão Mudanças: ', COALESCE(CAST(Padrao_Mudancas AS STRING), 'N/A'), '\n',
      'Campos Alterados: ', COALESCE(CAST(Campos_Alterados AS STRING), 'N/A'), '\n',
      '\n--- CONTEXTO ADICIONAL ---\n',
      'Labels: ', COALESCE(CAST(Labels AS STRING), 'N/A'), '\n',
      'Editores: ', COALESCE(CAST(Editores AS STRING), 'N/A'), '\n',
      'Última Atualização: ', COALESCE(CAST(Ultima_Atualizacao AS STRING), 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  
  UNION ALL
  
  -- ========================================
  -- PIPELINE
  -- ========================================
  SELECT 
    CONCAT('P', CAST(ROW_NUMBER() OVER (ORDER BY Oportunidade) AS STRING)) as deal_id,
    'pipeline' as source,
    
    -- Campos estruturados
    CAST(Oportunidade AS STRING) as Oportunidade,
    CAST(Vendedor AS STRING) as Vendedor,
    CAST(Conta AS STRING) as Conta,
    CAST(NULL AS STRING) as Segmento,
    CAST(NULL AS STRING) as Portfolio,
    CAST(Gross AS FLOAT64) as Gross,
    CAST(Net AS FLOAT64) as Net,
    CAST(Fiscal_Q AS STRING) as Fiscal_Q,
    CAST(Produtos AS STRING) as Produtos,
    CAST(NULL AS STRING) as Familia_Produto,
    CAST(Fase_Atual AS STRING) as Fase,
    
    -- Content completo
    CONCAT(
      'Deal ID: P-', COALESCE(CAST(Oportunidade AS STRING), 'N/A'), '\n',
      'Status: EM ANDAMENTO (Pipeline)\n',
      'Fase Atual: ', COALESCE(CAST(Fase_Atual AS STRING), 'N/A'), '\n',
      'Vendedor: ', COALESCE(CAST(Vendedor AS STRING), 'N/A'), '\n',
      'Conta: ', COALESCE(CAST(Conta AS STRING), 'N/A'), '\n',
      'Valor Gross: R$ ', COALESCE(CAST(Gross AS STRING), '0'), '\n',
      'Valor Net: R$ ', COALESCE(CAST(Net AS STRING), '0'), '\n',
      'Fiscal Q: ', COALESCE(CAST(Fiscal_Q AS STRING), 'N/A'), '\n',
      'Produtos: ', COALESCE(CAST(Produtos AS STRING), 'N/A'), '\n',
      'Data Prevista: ', COALESCE(CAST(Data_Prevista AS STRING), 'N/A'), '\n',
      'Dias no Funil: ', COALESCE(CAST(Ciclo_dias AS STRING), '0'), ' dias\n',
      'Dias Idle: ', COALESCE(CAST(Idle_Dias AS STRING), '0'), ' dias\n',
      '\n--- QUALIFICAÇÃO E SCORES ---\n',
      'BANT Score: ', COALESCE(CAST(BANT_Score AS STRING), 'N/A'), '\n',
      'BANT Gaps: ', COALESCE(CAST(BANT_Gaps AS STRING), 'N/A'), '\n',
      'BANT Evidências: ', COALESCE(CAST(BANT_Evidencias AS STRING), 'N/A'), '\n',
      'MEDDIC Score: ', COALESCE(CAST(MEDDIC_Score AS STRING), 'N/A'), '\n',
      'MEDDIC Gaps: ', COALESCE(CAST(MEDDIC_Gaps AS STRING), 'N/A'), '\n',
      'MEDDIC Evidências: ', COALESCE(CAST(MEDDIC_Evidencias AS STRING), 'N/A'), '\n',
      'Forecast IA: ', COALESCE(CAST(Forecast_IA AS STRING), 'N/A'), '%\n',
      'Confiança: ', COALESCE(CAST(Confianca AS STRING), 'N/A'), '%\n',
      'Motivo Confiança: ', COALESCE(CAST(Motivo_Confianca AS STRING), 'N/A'), '\n',
      'Forecast SF: ', COALESCE(CAST(Forecast_SF AS STRING), 'N/A'), '\n',
      '\n--- RISCOS E AÇÕES ---\n',
      'Flags de Risco: ', COALESCE(CAST(Flags_de_Risco AS STRING), 'Nenhum'), '\n',
      'Risco Principal: ', COALESCE(CAST(Risco_Principal AS STRING), 'N/A'), '\n',
      'Ação Sugerida: ', COALESCE(CAST(Acao_Sugerida AS STRING), 'N/A'), '\n',
      'Código Ação: ', COALESCE(CAST(Cd_Ao AS STRING), 'N/A'), '\n',
      'Gaps Identificados: ', COALESCE(CAST(Gaps_Identificados AS STRING), 'N/A'), '\n',
      '\n--- ANÁLISE IA ---\n',
      'Justificativa IA: ', COALESCE(CAST(Justificativa_IA AS STRING), 'N/A'), '\n',
      'Regras Aplicadas: ', COALESCE(CAST(Regras_Aplicadas AS STRING), 'N/A'), '\n',
      'Incoerência Detectada: ', COALESCE(CAST(Incoerencia_Detectada AS STRING), 'N/A'), '\n',
      'Perguntas Auditoria IA: ', COALESCE(CAST(Perguntas_de_Auditoria_IA AS STRING), 'N/A'), '\n',
      '\n--- ATIVIDADES ---\n',
      'Total Atividades: ', COALESCE(CAST(Atividades AS STRING), '0'), '\n',
      'Atividades Peso: ', COALESCE(CAST(Atividades_Peso AS STRING), 'N/A'), '\n',
      'Qualidade Engajamento: ', COALESCE(CAST(Qualidade_Engajamento AS STRING), 'N/A'), '\n',
      'Mix Atividades: ', COALESCE(CAST(Mix_Atividades AS STRING), 'N/A'), '\n',
      '\n--- MUDANÇAS E EVOLUÇÃO ---\n',
      'Total Mudanças: ', COALESCE(CAST(Total_Mudancas AS STRING), '0'), '\n',
      'Mudanças Valor: ', COALESCE(CAST(Mudancas_Valor AS STRING), '0'), '\n',
      'Mudanças Close Date: ', COALESCE(CAST(Mudancas_Close_Date AS STRING), '0'), '\n',
      'Mudanças Stage: ', COALESCE(CAST(Mudancas_Stage AS STRING), '0'), '\n',
      'Mudanças Críticas: ', COALESCE(CAST(Mudancas_Criticas AS STRING), 'N/A'), '\n',
      'Anomalias Detectadas: ', COALESCE(CAST(Anomalias_Detectadas AS STRING), 'N/A'), '\n',
      '\n--- VELOCITY E PREDIÇÕES ---\n',
      'Velocity Predição: ', COALESCE(CAST(Velocity_Predicao AS STRING), 'N/A'), '\n',
      'Velocity Detalhes: ', COALESCE(CAST(Velocity_Detalhes AS STRING), 'N/A'), '\n',
      '\n--- TERRITÓRIO E ATRIBUIÇÃO ---\n',
      'Território Correto: ', COALESCE(CAST(Territorio_Correto AS STRING), 'N/A'), '\n',
      'Vendedor Designado: ', COALESCE(CAST(Vendedor_Designado AS STRING), 'N/A'), '\n',
      'Estado/Cidade Detectado: ', COALESCE(CAST(Estado_Cidade_Detectado AS STRING), 'N/A'), '\n',
      'Fonte Detecção: ', COALESCE(CAST(Fonte_Deteccao AS STRING), 'N/A'), '\n',
      '\n--- CALENDÁRIO E RECONHECIMENTO ---\n',
      'Calendário Faturação: ', COALESCE(CAST(Calendario_Faturacao AS STRING), 'N/A'), '\n',
      'Valor Reconhecido Q1: ', COALESCE(CAST(Valor_Reconhecido_Q1 AS STRING), '0'), '\n',
      'Valor Reconhecido Q2: ', COALESCE(CAST(Valor_Reconhecido_Q2 AS STRING), '0'), '\n',
      'Valor Reconhecido Q3: ', COALESCE(CAST(Valor_Reconhecido_Q3 AS STRING), '0'), '\n',
      'Valor Reconhecido Q4: ', COALESCE(CAST(Valor_Reconhecido_Q4 AS STRING), '0'), '\n',
      '\n--- CONTEXTO ADICIONAL ---\n',
      'Perfil: ', COALESCE(CAST(Perfil AS STRING), 'N/A'), '\n',
      'Última Atualização: ', COALESCE(CAST(Ultima_Atualizacao AS STRING), 'N/A')
    ) as content
    
  FROM `operaciones-br.sales_intelligence.pipeline`
)

-- ========================================
-- GERAÇÃO DOS EMBEDDINGS
-- ========================================
SELECT 
  deal_id,
  source,
  Oportunidade,
  Vendedor,
  Conta,
  Segmento,
  Portfolio,
  Gross,
  Net,
  Fiscal_Q,
  Produtos,
  Familia_Produto,
  Fase,
  content,
  text_embedding as embedding
FROM ML.GENERATE_TEXT_EMBEDDING(
  MODEL `operaciones-br.sales_intelligence.text_embedding_model`,
  TABLE all_deals,
  STRUCT(TRUE AS flatten_json_output)
);
