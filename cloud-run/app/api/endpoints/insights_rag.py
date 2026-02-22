"""Insights RAG endpoint orchestrator."""

from datetime import datetime
import os
from typing import Optional

from fastapi import APIRouter, Query
from google.cloud import bigquery

from api.rag import (
    apply_similarity_threshold,
    build_closed_filters,
    build_filters,
    build_pipeline_filters,
    enrich_similarity_scores,
    generate_ai_insights,
    retrieve_similar_deals,
    summarize_deals_stats,
)

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = os.getenv("BQ_DATASET", "sales_intelligence")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-preview-09-2025")


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


@router.get("/insights-rag")
async def get_insights_rag(
    query: str = Query("insights de vendas", description="Texto base para a busca semantica"),
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    seller: Optional[str] = Query(None, description="Nome do vendedor ou multiplos separados por virgula"),
    source: Optional[str] = Query(None, description="Filtrar por source: pipeline, won, lost"),
    top_k: int = Query(50, ge=5, le=200, description="Numero de resultados"),
):
    """
    Retrieve similar deals using embeddings and generate insights with Gemini.
    """
    try:
        client = get_bq_client()
        where_clause = build_filters(year, quarter, seller, source)

        deals = retrieve_similar_deals(
            client,
            project_id=PROJECT_ID,
            dataset_id=DATASET_ID,
            query_text=query,
            top_k=top_k,
            where_clause=where_clause,
        )
        deals = enrich_similarity_scores(deals)
        deals = apply_similarity_threshold(deals, min_similarity=0.0)

        stats = summarize_deals_stats(deals)
        wins_deals = [d for d in deals if (d.get("source") or "").lower() == "won"]
        losses_deals = [d for d in deals if (d.get("source") or "").lower() == "lost"]

        pipeline_where = build_pipeline_filters(year, quarter, seller)
        won_where = build_closed_filters(year, quarter, seller, "Data_Fechamento")
        lost_where = build_closed_filters(year, quarter, seller, "Data_Fechamento")

        pipeline_query = f"""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(SAFE_CAST(Idle_Dias AS FLOAT64)), 1) AS avg_idle_days
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {pipeline_where}
        """

        won_query = f"""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) AS avg_cycle_days
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        {won_where}
        """

        lost_query = f"""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) AS avg_cycle_days
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        {lost_where}
        """

        pipeline_rows = list(client.query(pipeline_query).result())
        wins_rows = list(client.query(won_query).result())
        losses_rows = list(client.query(lost_query).result())

        pipeline_stats = dict(pipeline_rows[0]) if pipeline_rows else {"total": 0, "avg_idle_days": 0}
        wins_stats = dict(wins_rows[0]) if wins_rows else {"total": 0, "avg_cycle_days": 0}
        losses_stats = dict(losses_rows[0]) if losses_rows else {"total": 0, "avg_cycle_days": 0}

        stats["pipeline"] = pipeline_stats
        stats["wins_stats"] = wins_stats
        stats["losses_stats"] = losses_stats
        for bucket in (stats, wins_stats, losses_stats):
            bucket["top_sellers"] = []
            bucket["top_accounts"] = []

        ai_insights = generate_ai_insights(
            query,
            deals,
            stats,
            gemini_api_key=GEMINI_API_KEY,
            gemini_model=GEMINI_MODEL,
        )

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
            "rag": {
                "gemini_enabled": bool(GEMINI_API_KEY),
                "retrieved_count": len(deals),
            },
            "filters": {
                "year": year,
                "quarter": quarter,
                "seller": seller,
                "source": source
            },
            "stats": stats,
            "wins_stats": wins_stats,
            "losses_stats": losses_stats,
            "aiInsights": ai_insights,
            "deals": deals
        }

    except Exception:
        return {
            "success": False,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
            "filters": {
                "year": year,
                "quarter": quarter,
                "seller": seller,
                "source": source,
            },
            "stats": {"total": 0, "by_source": {}, "pipeline": {"total": 0, "avg_idle_days": 0}},
            "wins_stats": {"total": 0, "avg_cycle_days": 0},
            "losses_stats": {"total": 0, "avg_cycle_days": 0},
            "aiInsights": {
                "status": "unavailable",
                "wins": "Insights RAG temporariamente indisponível.",
                "losses": "Insights RAG temporariamente indisponível.",
                "recommendations": [],
            },
            "deals": [],
        }
