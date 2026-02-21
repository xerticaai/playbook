-- ==========================================================================
-- MODELO 9: Deteccao de Anomalias (KMEANS)
-- ==========================================================================
-- Objetivo: identificar deals fora do padrao de ciclo, valor ou atividade.
-- Saidas consumidas pelo dashboard/API:
--   - MODEL: sales_intelligence.ml_deteccao_anomalias
--   - TABLE: sales_intelligence.pipeline_deteccao_anomalias
-- ============================================================================

-- 1) Treinar modelo com o pipeline atual
CREATE OR REPLACE MODEL `sales_intelligence.ml_deteccao_anomalias`
OPTIONS(
  model_type='KMEANS',
  num_clusters=8,
  standardize_features=TRUE,
  max_iterations=25
) AS
SELECT
  SAFE_CAST(Gross AS FLOAT64) AS Gross,
  SAFE_CAST(Net AS FLOAT64) AS Net,
  SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
  SAFE_CAST(Atividades AS INT64) AS Atividades,
  SAFE_CAST(Idle_Dias AS INT64) AS Idle_Dias,
  SAFE_CAST(Confianca AS FLOAT64) AS Confianca
FROM `sales_intelligence.pipeline`
WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL
  AND SAFE_CAST(Net AS FLOAT64) IS NOT NULL;


-- 2) Detectar anomalias no pipeline
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_deteccao_anomalias` AS
WITH features AS (
  SELECT
    Oportunidade AS opportunity,
    Vendedor,
    Fiscal_Q,
    SAFE_CAST(Gross AS FLOAT64) AS Gross,
    SAFE_CAST(Net AS FLOAT64) AS Net,
    SAFE_CAST(Ciclo_dias AS INT64) AS Ciclo_dias,
    SAFE_CAST(Atividades AS INT64) AS Atividades,
    SAFE_CAST(Idle_Dias AS INT64) AS Idle_Dias,
    SAFE_CAST(Confianca AS FLOAT64) AS Confianca
  FROM `sales_intelligence.pipeline`
  WHERE SAFE_CAST(Gross AS FLOAT64) IS NOT NULL
)
SELECT
  opportunity,
  Vendedor,
  Fiscal_Q,
  Gross,
  Net,
  Ciclo_dias,
  Atividades,
  Idle_Dias,
  Confianca,
  normalized_distance AS anomaly_score,
  is_anomaly,
  CASE
    WHEN normalized_distance >= 1.5 THEN 'ALTA'
    WHEN normalized_distance >= 1.1 THEN 'MEDIA'
    ELSE 'BAIXA'
  END AS severidade,
  CASE
    WHEN normalized_distance >= 1.5 THEN 'Revisar imediatamente: valor/ciclo fora do padrao'
    WHEN normalized_distance >= 1.1 THEN 'Validar dados e ajustar estrategia do deal'
    ELSE 'Monitorar sinais incomuns'
  END AS acao_recomendada
FROM ML.DETECT_ANOMALIES(
  MODEL `sales_intelligence.ml_deteccao_anomalias`,
  STRUCT(0.05 AS contamination),
  TABLE features
)
WHERE is_anomaly = TRUE;
