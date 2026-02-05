-- ========================================================================
-- MODELO ML: Previsão de Ciclo de Vendas
-- Tipo: BOOSTED_TREE_REGRESSOR
-- Objetivo: Prever quantos dias até fechamento do deal
-- ========================================================================

-- � REFERÊNCIA DE SCHEMA - EVITAR ERROS DE NOMENCLATURA
-- ========================================================================
-- TABELA: pipeline (270 deals ativos)
--   Chave: Oportunidade (STRING)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Scores: MEDDIC_Score (INT64), BANT_Score (INT64), Confiana (INT64)
--   Engajamento: Atividades (INT64), Atividades_Peso (FLOAT64), Idle_Dias (STRING)
--   Mudanças: Mudanas_Crticas (INT64), Total_Mudanas (INT64)
--   Contexto: Vendedor, Perfil (segmento), Fase_Atual, Fiscal_Q
--   Tempo: Ciclo_dias (INT64), Data_Prevista (DATE)
--   Flags: Flags_de_Risco, Anomalias_Detectadas, Velocity_Predio
--
-- TABELA: closed_deals (deals históricos)
--   Chave: Oportunidade (STRING) ⚠️ NÃO opportunity!
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Status: Status (STRING: 'Won'/'Lost'), outcome (STRING)
--   Análise: Causa_Raiz, Fatores_Sucesso, Resumo_Anlise
--   Tempo: Ciclo_dias (STRING ⚠️ usar CAST), Data_Fechamento (STRING)
--   Atividades: Atividades (INT64), Ativ_7d, Ativ_30d
--   Mudanças: Mudanas_Crticas (INT64), Total_Mudanas (INT64)
--   ⚠️ NÃO TEM: Fase_Atual, MEDDIC_Score, BANT_Score, Atividades_Peso
-- ========================================================================

-- PASSO 1: Criar tabela de treinamento com features
-- ==================================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.treino_previsao_ciclo` AS
SELECT
  -- ID único
  Oportunidade AS deal_id,
  
  -- TARGET: Ciclo de vendas (dias)
  CAST(Ciclo_dias AS INT64) AS target_ciclo_dias,
  
  -- FEATURES: Engajamento (existem em closed_deals!)
  CAST(Atividades AS FLOAT64) AS atividades_total,
  CAST(Ativ_7d AS FLOAT64) AS atividades_7d,
  CAST(Ativ_30d AS FLOAT64) AS atividades_30d,
  CAST(Mudanas_Crticas AS INT64) AS mudancas_criticas,
  CAST(Total_Mudanas AS INT64) AS total_mudancas,
  
  -- FEATURES: Contexto
  Vendedor AS vendedor,
  Segmento AS segmento,
  
  -- FEATURES: Valor (normalized)
  CAST(Gross AS FLOAT64) / 1000 AS gross_value_k

FROM 
  `operaciones-br.sales_intelligence.closed_deals`
WHERE
  -- Apenas deals fechados (won ou lost) com ciclo válido
  SAFE_CAST(Ciclo_dias AS INT64) > 0
  AND SAFE_CAST(Ciclo_dias AS INT64) < 365 -- Remove outliers (>1 ano)
  AND CAST(Gross AS FLOAT64) > 0
  AND Vendedor IS NOT NULL;  -- Data_Fechamento tem formato inconsistente (DD-MM-YYYY e DD/MM/YYYY)


-- PASSO 2: Treinar modelo de Previsão de Ciclo
-- ==============================================
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.previsao_ciclo_model`
OPTIONS(
  model_type='BOOSTED_TREE_REGRESSOR',
  input_label_cols=['target_ciclo_dias'],
  
  -- Hiperparâmetros simplificados (apenas os suportados)
  max_iterations=50,
  early_stop=TRUE
) AS
SELECT
  *
FROM
  `operaciones-br.sales_intelligence.treino_previsao_ciclo`;


-- PASSO 3: Avaliar modelo
-- =========================
SELECT
  *
FROM
  ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.previsao_ciclo_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.treino_previsao_ciclo`)
  );


-- PASSO 4: Gerar predições para pipeline atual
-- ==============================================
CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.pipeline_previsao_ciclo` AS
SELECT
  p.Oportunidade AS opportunity,
  p.Gross AS gross_value,
  p.Net AS net_value,
  p.Vendedor,
  p.Fase_Atual,
  p.Perfil AS segmento,
  
  -- Predição do modelo
  CAST(p.predicted_target_ciclo_dias AS INT64) AS dias_previstos,
  
  -- Classificação por velocidade
  CASE
    WHEN CAST(p.predicted_target_ciclo_dias AS INT64) <= 30 THEN 'RÁPIDO'
    WHEN CAST(p.predicted_target_ciclo_dias AS INT64) <= 60 THEN 'NORMAL'
    WHEN CAST(p.predicted_target_ciclo_dias AS INT64) <= 90 THEN 'LENTO'
    ELSE 'MUITO_LENTO'
  END AS velocidade_prevista,
  
  -- Features para análise
  p.MEDDIC_Score,
  p.BANT_Score,
  p.Atividades,
  p.Mudanas_Crticas AS mudancas_criticas

FROM
  ML.PREDICT(
    MODEL `operaciones-br.sales_intelligence.previsao_ciclo_model`,
    (
      SELECT
        Oportunidade,
        Gross,
        Net,
        Perfil,
        MEDDIC_Score,
        BANT_Score,
        Atividades,
        Mudanas_Crticas,
        Vendedor,
        Total_Mudanas,
        -- Features para predição
        CAST(Atividades AS FLOAT64) AS atividades_total,
        0 AS atividades_7d,  -- Pipeline não tem Ativ_7d histórico
        0 AS atividades_30d,  -- Pipeline não tem Ativ_30d histórico  
        CAST(Mudanas_Crticas AS INT64) AS mudancas_criticas,
        CAST(Total_Mudanas AS INT64) AS total_mudancas,
        Vendedor AS vendedor,
        Perfil AS segmento,
        CAST(Gross AS FLOAT64) / 1000 AS gross_value_k
      FROM
        `operaciones-br.sales_intelligence.pipeline`
      WHERE
        Gross > 0
        AND Vendedor IS NOT NULL
    )
  ) p

WHERE
  p.Gross > 0
  AND p.Vendedor IS NOT NULL;


-- PASSO 5: Ver top 10 deals mais lentos previstos
-- ================================================
SELECT
  opportunity,
  Vendedor,
  Fase_Atual,
  gross_value,
  dias_previstos,
  velocidade_prevista,
  MEDDIC_Score,
  BANT_Score
FROM
  `operaciones-br.sales_intelligence.pipeline_previsao_ciclo`
WHERE
  velocidade_prevista IN ('LENTO', 'MUITO_LENTO')
ORDER BY
  dias_previstos DESC,
  gross_value DESC
LIMIT 10;


-- PASSO 6: Agendar atualização automática (opcional)
-- ===================================================
-- Criar scheduled query para rodar diariamente:
-- 1. Ir para BigQuery > Scheduled Queries
-- 2. Criar nova query agendada
-- 3. Copiar o código do PASSO 4 (gerar predições)
-- 4. Agendar para rodar todo dia às 6h da manhã
