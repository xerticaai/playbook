from typing import Any, Dict, List

from google.cloud import bigquery


def retrieve_similar_deals(
    client: bigquery.Client,
    *,
    project_id: str,
    dataset_id: str,
    query_text: str,
    top_k: int,
    where_clause: str,
) -> List[Dict[str, Any]]:
    query_sql = f"""
    WITH query_embedding AS (
      SELECT text_embedding AS embedding
      FROM ML.GENERATE_TEXT_EMBEDDING(
        MODEL `{project_id}.{dataset_id}.text_embedding_model`,
        (SELECT @query_text AS content)
      )
    )
    SELECT
      base.deal_id AS deal_id,
      base.source AS source,
      base.Oportunidade AS Oportunidade,
      base.Vendedor AS Vendedor,
      base.Conta AS Conta,
      base.Segmento AS Segmento,
      base.Portfolio AS Portfolio,
      base.Gross AS Gross,
      base.Net AS Net,
      base.Fiscal_Q AS Fiscal_Q,
      base.Produtos AS Produtos,
      base.Familia_Produto AS Familia_Produto,
      base.Fase AS Fase,
      base.content AS content,
      distance
    FROM VECTOR_SEARCH(
      (
        SELECT *
        FROM `{project_id}.{dataset_id}.deal_embeddings`
        {where_clause}
      ),
      'embedding',
      (SELECT embedding FROM query_embedding),
      top_k => @top_k,
      distance_type => 'COSINE'
    )
    ORDER BY distance ASC
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("query_text", "STRING", query_text),
            bigquery.ScalarQueryParameter("top_k", "INT64", top_k),
        ]
    )

    results = client.query(query_sql, job_config=job_config).result()
    return [dict(row) for row in results]
