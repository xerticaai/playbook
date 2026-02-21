-- ==========================================================================
-- MODELO 8: Recomendacao de Produtos (MATRIX_FACTORIZATION)
-- ==========================================================================
-- Objetivo: recomendar familias/portfolios com maior potencial por vendedor.
-- Saidas consumidas pelo dashboard/API:
--   - MODEL: sales_intelligence.ml_recomendacao_produtos
--   - TABLE: sales_intelligence.pipeline_recomendacao_produtos
-- ============================================================================

-- 1) Treinar modelo com historico de ganhos
CREATE OR REPLACE MODEL `sales_intelligence.ml_recomendacao_produtos`
OPTIONS(
  model_type='MATRIX_FACTORIZATION',
  user_col='Vendedor',
  item_col='produto_key',
  rating_col='rating',
  feedback_type='implicit',
  num_factors=20,
  max_iterations=40
) AS
WITH base AS (
  SELECT
    Vendedor,
    COALESCE(NULLIF(Familia_Produto, ''), NULLIF(Portfolio, ''), NULLIF(Segmento, ''), 'SEM_CATEGORIA') AS produto_key,
    SAFE_CAST(Net AS FLOAT64) AS rating
  FROM `sales_intelligence.closed_deals_won`
  WHERE Vendedor IS NOT NULL
    AND SAFE_CAST(Net AS FLOAT64) IS NOT NULL
)
SELECT
  Vendedor,
  produto_key,
  rating
FROM base;


-- 2) Gerar recomendacoes para o pipeline
CREATE OR REPLACE TABLE `sales_intelligence.pipeline_recomendacao_produtos` AS
WITH sellers AS (
  SELECT DISTINCT
    Vendedor,
    Fiscal_Q
  FROM `sales_intelligence.pipeline`
  WHERE Vendedor IS NOT NULL
    AND Fiscal_Q IS NOT NULL
),
recs AS (
  SELECT
    Vendedor,
    produto_key,
    predicted_rating AS score
  FROM ML.RECOMMEND(
    MODEL `sales_intelligence.ml_recomendacao_produtos`,
    (SELECT DISTINCT Vendedor FROM sellers),
    STRUCT(5 AS num_recommendations)
  )
),
hist AS (
  SELECT
    Vendedor,
    COALESCE(NULLIF(Familia_Produto, ''), NULLIF(Portfolio, ''), NULLIF(Segmento, ''), 'SEM_CATEGORIA') AS produto_key,
    COUNT(*) AS wins_historico,
    AVG(SAFE_CAST(Net AS FLOAT64)) AS avg_net,
    AVG(SAFE_CAST(Gross AS FLOAT64)) AS avg_gross
  FROM `sales_intelligence.closed_deals_won`
  GROUP BY Vendedor, produto_key
),
pipeline_stats AS (
  SELECT
    Vendedor,
    COALESCE(NULLIF(Familia_Produto, ''), NULLIF(Portfolio, ''), NULLIF(Segmento, ''), 'SEM_CATEGORIA') AS produto_key,
    COUNT(*) AS pipeline_deals
  FROM `sales_intelligence.pipeline`
  GROUP BY Vendedor, produto_key
)
SELECT
  s.Vendedor,
  s.Fiscal_Q,
  r.produto_key AS recomendacao_produto,
  r.score,
  COALESCE(h.wins_historico, 0) AS wins_historico,
  COALESCE(h.avg_net, 0) AS avg_net,
  COALESCE(h.avg_gross, 0) AS avg_gross,
  COALESCE(p.pipeline_deals, 0) AS pipeline_deals,
  CASE
    WHEN COALESCE(p.pipeline_deals, 0) = 0 THEN 'Expandir pipeline neste portfolio'
    WHEN COALESCE(h.wins_historico, 0) >= 3 THEN 'Reforcar deals com maior conversao historica'
    ELSE 'Testar fit e acelerar discovery'
  END AS recomendacao_acao
FROM sellers s
JOIN recs r
  ON s.Vendedor = r.Vendedor
LEFT JOIN hist h
  ON r.Vendedor = h.Vendedor AND r.produto_key = h.produto_key
LEFT JOIN pipeline_stats p
  ON r.Vendedor = p.Vendedor AND r.produto_key = p.produto_key;
