-- Audit table for GWS/Workspace product token variations observed in sales_intelligence.
-- Purpose:
-- 1) Materialize token frequencies by source table (pipeline/won/lost)
-- 2) Flag tokens matched by current app detector logic
-- 3) Flag probable new variants for review

CREATE OR REPLACE TABLE `operaciones-br.sales_intelligence.audit_gws_product_tokens` AS
WITH src AS (
  SELECT 'pipeline' AS source_table, CAST(Produtos AS STRING) AS produtos
  FROM `operaciones-br.sales_intelligence.pipeline`
  UNION ALL
  SELECT 'closed_deals_won' AS source_table, CAST(Produtos AS STRING) AS produtos
  FROM `operaciones-br.sales_intelligence.closed_deals_won`
  UNION ALL
  SELECT 'closed_deals_lost' AS source_table, CAST(Produtos AS STRING) AS produtos
  FROM `operaciones-br.sales_intelligence.closed_deals_lost`
),
normalized AS (
  SELECT
    source_table,
    UPPER(TRIM(token)) AS token,
    UPPER(REGEXP_REPLACE(TRIM(token), r'\s+', ' ')) AS token_norm
  FROM src,
  UNNEST(
    SPLIT(
      REGEXP_REPLACE(COALESCE(produtos, ''), r'\s*[|,;/]+\s*', '|'),
      '|'
    )
  ) AS token
),
filtered AS (
  SELECT
    source_table,
    token,
    token_norm
  FROM normalized
  WHERE token_norm != ''
    AND REGEXP_CONTAINS(token_norm, r'GWS|GWORKSPACE|GOOGLE\s*WORKSPACE|\bWORKSPACE\b')
),
agg AS (
  SELECT
    token_norm AS token,
    COUNT(*) AS occurrences,
    COUNT(DISTINCT source_table) AS source_tables_count,
    ARRAY_AGG(DISTINCT source_table ORDER BY source_table) AS source_tables
  FROM filtered
  GROUP BY token_norm
),
classified AS (
  SELECT
    token,
    occurrences,
    source_tables_count,
    source_tables,
    -- Mirrors current detector logic in appscript/ShareCode.gs:isGwsProductLine_
    (
      REGEXP_CONTAINS(token, r'(^|\W)GWS(\W|$)')
      OR REGEXP_CONTAINS(token, r'GWORKSPACE')
      OR REGEXP_CONTAINS(token, r'GOOGLE\s*WORKSPACE')
      OR (
        REGEXP_CONTAINS(token, r'\bWORKSPACE\b')
        AND (
          REGEXP_CONTAINS(token, r'\b(BUSINESS|ENTERPRISE|FRONTLINE|EDUCATION|STARTER|STANDARD|PLUS|ESSENTIALS|LICENSING|SERVICES|SERVICIOS|IMPLEMENTACION|IMPLEMENTACAO|ENTRENAMIENTO|ENTRENAMIENTOS|TREINAMENTO)\b')
          OR REGEXP_CONTAINS(token, r'\b(TRANSFERTOKEN|RENOVACAO|RENOVACION|NUEVA|NUEVO|ADICIONAL|UPGRADE)\b')
        )
      )
    ) AS matched_by_current_detector,
    (
      REGEXP_CONTAINS(token, r'\bWORKSPACE\b')
      AND NOT REGEXP_CONTAINS(token, r'GWS|GWORKSPACE|GOOGLE\s*WORKSPACE')
      AND NOT REGEXP_CONTAINS(token, r'\b(BUSINESS|ENTERPRISE|FRONTLINE|EDUCATION|STARTER|STANDARD|PLUS|ESSENTIALS|LICENSING|SERVICES|SERVICIOS|IMPLEMENTACION|IMPLEMENTACAO|ENTRENAMIENTO|ENTRENAMIENTOS|TREINAMENTO|TRANSFERTOKEN|RENOVACAO|RENOVACION|NUEVA|NUEVO|ADICIONAL|UPGRADE)\b')
    ) AS probable_new_variant,
    CURRENT_TIMESTAMP() AS audit_ts
  FROM agg
)
SELECT *
FROM classified
ORDER BY occurrences DESC;
