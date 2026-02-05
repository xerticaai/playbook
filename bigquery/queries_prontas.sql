-- ============================================================================
-- QUERIES PRONTAS - BQML Sales Intelligence
-- ============================================================================
-- Queries úteis para análise diária e tomada de decisão
-- Dataset: operaciones-br.sales_intelligence
-- ============================================================================

-- ============================================================================
-- 1. DEALS CRÍTICOS (Ação Imediata Necessária)
-- ============================================================================
-- Use: Ver deals que precisam de atenção URGENTE hoje
SELECT 
  Oportunidade,
  Vendedor,
  Perfil_Cliente,
  Segmento,
  CAST(Gross AS INT64) AS Valor_USD,
  priority_score,
  dias_ate_close,
  Atividades,
  categoria_acao,
  acao_recomendada,
  checklist
FROM `sales_intelligence.ml_proxima_acao_v2`
WHERE urgencia = 'ALTA'
ORDER BY priority_score DESC
LIMIT 20;

-- ============================================================================
-- 2. PIPELINE POR VENDEDOR (Performance Individual)
-- ============================================================================
-- Use: Distribuir trabalho, identificar quem precisa suporte
SELECT 
  Vendedor,
  COUNT(*) AS total_deals,
  
  -- Urgências
  SUM(CASE WHEN urgencia = 'ALTA' THEN 1 ELSE 0 END) AS deals_criticos,
  SUM(CASE WHEN urgencia = 'MÉDIA' THEN 1 ELSE 0 END) AS deals_medios,
  SUM(CASE WHEN urgencia = 'BAIXA' THEN 1 ELSE 0 END) AS deals_baixos,
  
  -- Valores
  CAST(SUM(Gross) AS INT64) AS pipeline_total_usd,
  CAST(SUM(CASE WHEN urgencia = 'ALTA' THEN Gross ELSE 0 END) AS INT64) AS valor_em_risco,
  
  -- Médias
  ROUND(AVG(priority_score), 1) AS avg_priority,
  ROUND(AVG(dias_ate_close), 0) AS avg_dias_close,
  ROUND(AVG(Atividades), 1) AS avg_atividades
  
FROM `sales_intelligence.ml_proxima_acao_v2`
GROUP BY Vendedor
ORDER BY deals_criticos DESC, valor_em_risco DESC;

-- ============================================================================
-- 3. AÇÕES RECOMENDADAS (Distribuição por Tipo)
-- ============================================================================
-- Use: Entender quais tipos de ação são mais comuns no pipeline
SELECT 
  categoria_acao,
  urgencia,
  COUNT(*) AS total_deals,
  CAST(SUM(Gross) AS INT64) AS valor_total_usd,
  ROUND(AVG(priority_score), 1) AS avg_priority,
  ROUND(AVG(dias_ate_close), 0) AS avg_dias_close,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS percentual
FROM `sales_intelligence.ml_proxima_acao_v2`
GROUP BY categoria_acao, urgencia
ORDER BY urgencia DESC, total_deals DESC;

-- ============================================================================
-- 4. DEALS PRÓXIMOS DO CLOSE (Próximos 7 dias)
-- ============================================================================
-- Use: Focar em deals que fecham esta semana
SELECT 
  Oportunidade,
  Vendedor,
  Close_Date,
  dias_ate_close,
  CAST(Gross AS INT64) AS Valor_USD,
  priority_level,
  nivel_risco,
  acao_recomendada,
  justificativa_prioridade
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE dias_ate_close <= 7 AND dias_ate_close >= 0
ORDER BY dias_ate_close ASC, priority_score DESC;

-- ============================================================================
-- 5. DEALS ATRASADOS (Close Date já passou)
-- ============================================================================
-- Use: Identificar deals que precisam replaneamento
SELECT 
  Oportunidade,
  Vendedor,
  Close_Date,
  ABS(dias_ate_close) AS dias_atrasado,
  CAST(Gross AS INT64) AS Valor_USD,
  Atividades,
  nivel_risco,
  acao_recomendada
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE dias_ate_close < 0
ORDER BY dias_atrasado DESC, Gross DESC;

-- ============================================================================
-- 6. DEALS PARADOS (Sem atividade recente, alto risco abandono)
-- ============================================================================
-- Use: Reativar deals que estão "esquecidos"
SELECT 
  Oportunidade,
  Vendedor,
  Perfil_Cliente,
  CAST(Gross AS INT64) AS Valor_USD,
  dias_em_pipeline,
  Atividades,
  dias_ate_close,
  nivel_risco,
  acao_recomendada,
  checklist
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE nivel_risco = 'ALTO'
  AND Atividades < 3
  AND dias_em_pipeline > 30
ORDER BY Gross DESC, dias_em_pipeline DESC;

-- ============================================================================
-- 7. FORECAST SEMANAL (Deals com close próximo por segmento)
-- ============================================================================
-- Use: Prever receita das próximas semanas
SELECT 
  Segmento,
  CASE 
    WHEN dias_ate_close <= 7 THEN 'Esta Semana'
    WHEN dias_ate_close <= 14 THEN 'Próxima Semana'
    WHEN dias_ate_close <= 30 THEN 'Este Mês'
    ELSE 'Próximo Mês+'
  END AS periodo,
  COUNT(*) AS num_deals,
  CAST(SUM(Gross) AS INT64) AS valor_previsto_usd,
  SUM(CASE WHEN nivel_risco = 'ALTO' THEN 1 ELSE 0 END) AS deals_em_risco,
  SUM(CASE WHEN nivel_risco = 'BAIXO' THEN 1 ELSE 0 END) AS deals_seguros
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE dias_ate_close >= 0 AND dias_ate_close <= 90
GROUP BY Segmento, periodo
ORDER BY 
  Segmento,
  CASE periodo
    WHEN 'Esta Semana' THEN 1
    WHEN 'Próxima Semana' THEN 2
    WHEN 'Este Mês' THEN 3
    ELSE 4
  END;

-- ============================================================================
-- 8. TOP OPORTUNIDADES (Maior valor + baixo risco)
-- ============================================================================
-- Use: Identificar "low-hanging fruit" - deals fáceis e valiosos
SELECT 
  Oportunidade,
  Vendedor,
  Perfil_Cliente,
  Segmento,
  CAST(Gross AS INT64) AS Valor_USD,
  priority_score,
  nivel_risco,
  dias_ate_close,
  Atividades,
  recomendacao_foco,
  justificativa_prioridade
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE nivel_risco IN ('BAIXO', 'MÉDIO')
  AND Gross > 50000
  AND dias_ate_close <= 60
ORDER BY Gross DESC, priority_score DESC
LIMIT 10;

-- ============================================================================
-- 9. ANÁLISE DE RISCO (Distribuição de risco no pipeline)
-- ============================================================================
-- Use: Entender saúde geral do pipeline
SELECT 
  nivel_risco,
  priority_level,
  COUNT(*) AS num_deals,
  CAST(SUM(Gross) AS INT64) AS valor_total_usd,
  ROUND(AVG(dias_ate_close), 0) AS avg_dias_close,
  ROUND(AVG(Atividades), 1) AS avg_atividades,
  ROUND(AVG(dias_em_pipeline), 0) AS avg_dias_pipeline,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS percentual_deals,
  ROUND(100.0 * SUM(Gross) / SUM(SUM(Gross)) OVER(), 1) AS percentual_valor
FROM `sales_intelligence.ml_prioridade_deal_v2`
GROUP BY nivel_risco, priority_level
ORDER BY 
  CASE nivel_risco WHEN 'ALTO' THEN 1 WHEN 'MÉDIO' THEN 2 ELSE 3 END,
  CASE priority_level WHEN 'CRÍTICO' THEN 1 WHEN 'ALTO' THEN 2 WHEN 'MÉDIO' THEN 3 ELSE 4 END;

-- ============================================================================
-- 10. DEALS POR SEGMENTO (Performance por produto/serviço)
-- ============================================================================
-- Use: Identificar quais segmentos precisam mais atenção
SELECT 
  Segmento,
  COUNT(*) AS total_deals,
  CAST(SUM(Gross) AS INT64) AS pipeline_usd,
  ROUND(AVG(Gross), 0) AS avg_deal_size,
  
  -- Risco
  SUM(CASE WHEN nivel_risco = 'ALTO' THEN 1 ELSE 0 END) AS deals_risco_alto,
  CAST(SUM(CASE WHEN nivel_risco = 'ALTO' THEN Gross ELSE 0 END) AS INT64) AS valor_em_risco,
  
  -- Timing
  ROUND(AVG(dias_ate_close), 0) AS avg_dias_close,
  SUM(CASE WHEN dias_ate_close <= 30 THEN 1 ELSE 0 END) AS deals_proximos,
  
  -- Saúde
  ROUND(AVG(Atividades), 1) AS avg_atividades,
  ROUND(AVG(priority_score), 1) AS avg_priority
  
FROM `sales_intelligence.ml_prioridade_deal_v2`
GROUP BY Segmento
ORDER BY pipeline_usd DESC;

-- ============================================================================
-- 11. HISTÓRICO DE PERDAS (Top causas de perda)
-- ============================================================================
-- Use: Aprender com perdas passadas para prevenir futuras
SELECT 
  Tipo_Resultado AS causa_perda,
  COUNT(*) AS total_perdas,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS percentual,
  
  -- Métricas
  ROUND(AVG(SAFE_CAST(Ciclo_dias AS INT64)), 0) AS avg_ciclo_dias,
  ROUND(AVG(SAFE_CAST(Atividades AS INT64)), 1) AS avg_atividades,
  ROUND(AVG(SAFE_CAST(Cadencia_Media_dias AS FLOAT64)), 1) AS avg_cadencia,
  
  -- Evitabilidade
  SUM(CASE WHEN Evitavel = 'SIM' THEN 1 ELSE 0 END) AS evitaveis,
  SUM(CASE WHEN Evitavel = 'PARCIALMENTE' THEN 1 ELSE 0 END) AS parcialmente_evitaveis,
  
  -- Sinais mais comuns
  APPROX_TOP_COUNT(Sinais_Alerta, 3) AS sinais_alerta_top3
  
FROM `sales_intelligence.closed_deals_lost`
WHERE Tipo_Resultado IS NOT NULL
GROUP BY Tipo_Resultado
ORDER BY total_perdas DESC;

-- ============================================================================
-- 12. WIN RATE POR VENDEDOR (Performance histórica)
-- ============================================================================
-- Use: Avaliar performance de vendedores
WITH vendedor_stats AS (
  SELECT 
    Vendedor,
    'WON' AS outcome,
    COUNT(*) AS deals
  FROM `sales_intelligence.closed_deals_won`
  GROUP BY Vendedor
  
  UNION ALL
  
  SELECT 
    Vendedor,
    'LOST' AS outcome,
    COUNT(*) AS deals
  FROM `sales_intelligence.closed_deals_lost`
  GROUP BY Vendedor
)
SELECT 
  Vendedor,
  SUM(CASE WHEN outcome = 'WON' THEN deals ELSE 0 END) AS deals_ganhos,
  SUM(CASE WHEN outcome = 'LOST' THEN deals ELSE 0 END) AS deals_perdidos,
  SUM(deals) AS total_deals,
  
  -- Win Rate
  ROUND(100.0 * SUM(CASE WHEN outcome = 'WON' THEN deals ELSE 0 END) / SUM(deals), 1) AS win_rate_pct,
  
  -- Classificação
  CASE 
    WHEN 100.0 * SUM(CASE WHEN outcome = 'WON' THEN deals ELSE 0 END) / SUM(deals) >= 30 THEN 'TOP'
    WHEN 100.0 * SUM(CASE WHEN outcome = 'WON' THEN deals ELSE 0 END) / SUM(deals) >= 20 THEN 'MÉDIO'
    ELSE 'BAIXO'
  END AS classificacao
  
FROM vendedor_stats
GROUP BY Vendedor
HAVING SUM(deals) >= 5  -- Mínimo 5 deals para considerar
ORDER BY win_rate_pct DESC, total_deals DESC;

-- ============================================================================
-- 13. EXPORT PARA SALESFORCE (Atualizar CRM)
-- ============================================================================
-- Use: Exportar priority_score e acao_recomendada para sync com Salesforce
SELECT 
  Oportunidade AS Opportunity_ID,
  priority_score AS Priority_Score__c,
  priority_level AS Priority_Level__c,
  nivel_risco AS Risk_Level__c,
  categoria_acao AS Next_Action_Category__c,
  urgencia AS Action_Urgency__c,
  acao_recomendada AS Action_Recommendation__c
FROM `sales_intelligence.ml_proxima_acao_v2`
ORDER BY priority_score DESC;

-- ============================================================================
-- 14. KPIs DASHBOARD (Métricas gerais para dashboard executivo)
-- ============================================================================
-- Use: Monitorar saúde geral do pipeline
SELECT 
  'Pipeline Total' AS metrica,
  COUNT(*) AS valor,
  CONCAT('$', FORMAT('%,.0f', SUM(Gross))) AS valor_formatado
FROM `sales_intelligence.ml_prioridade_deal_v2`

UNION ALL

SELECT 
  'Deals Críticos' AS metrica,
  COUNT(*) AS valor,
  CONCAT('$', FORMAT('%,.0f', SUM(Gross))) AS valor_formatado
FROM `sales_intelligence.ml_proxima_acao_v2`
WHERE urgencia = 'ALTA'

UNION ALL

SELECT 
  'Deals Esta Semana' AS metrica,
  COUNT(*) AS valor,
  CONCAT('$', FORMAT('%,.0f', SUM(Gross))) AS valor_formatado
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE dias_ate_close <= 7 AND dias_ate_close >= 0

UNION ALL

SELECT 
  'Deals Atrasados' AS metrica,
  COUNT(*) AS valor,
  CONCAT('$', FORMAT('%,.0f', SUM(Gross))) AS valor_formatado
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE dias_ate_close < 0

UNION ALL

SELECT 
  'Deals Alto Risco' AS metrica,
  COUNT(*) AS valor,
  CONCAT('$', FORMAT('%,.0f', SUM(Gross))) AS valor_formatado
FROM `sales_intelligence.ml_prioridade_deal_v2`
WHERE nivel_risco = 'ALTO';

-- ============================================================================
-- FIM - QUERIES PRONTAS
-- ============================================================================
-- Salve este arquivo para acesso rápido!
-- Para executar: bq query --project_id=operaciones-br --use_legacy_sql=false "QUERY AQUI"
-- ============================================================================
