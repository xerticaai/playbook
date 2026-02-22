"""Insights RAG endpoint orchestrator."""

from datetime import datetime
import os
import time
from typing import Optional, Dict, Any

from fastapi import APIRouter, Query
from google.cloud import bigquery

from api.rag import (
    apply_similarity_threshold,
    build_closed_filters,
    build_filters,
    build_quality_metrics,
    build_pipeline_filters,
    enrich_similarity_scores,
    generate_ai_insights,
    rerank_deals_by_context,
    retrieve_similar_deals,
    summarize_deals_stats,
)

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br").strip().rstrip("\\/")
DATASET_ID = os.getenv("BQ_DATASET", "sales_intelligence")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
VERTEX_AI_LOCATION = os.getenv("VERTEX_AI_LOCATION", "us-central1")
INSIGHTS_CACHE_TTL_SECONDS = int(os.getenv("INSIGHTS_CACHE_TTL_SECONDS", "180"))
_INSIGHTS_CACHE: Dict[str, Dict[str, Any]] = {}


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


def _build_cache_key(params: Dict[str, Any]) -> str:
    serialized = []
    for key in sorted(params.keys()):
        serialized.append(f"{key}={params.get(key) or ''}")
    return "|".join(serialized)


def _get_cache(key: str) -> Optional[Dict[str, Any]]:
    cached = _INSIGHTS_CACHE.get(key)
    if not cached:
        return None
    if cached.get("expires_at", 0) <= time.time():
        _INSIGHTS_CACHE.pop(key, None)
        return None
    return cached.get("payload")


def _set_cache(key: str, payload: Dict[str, Any]) -> None:
    _INSIGHTS_CACHE[key] = {
        "payload": payload,
        "expires_at": time.time() + INSIGHTS_CACHE_TTL_SECONDS,
    }


def get_embeddings_freshness(client: bigquery.Client) -> dict:
    try:
        query = f"""
        SELECT
          table_id,
          TIMESTAMP_MILLIS(last_modified_time) AS last_modified
        FROM `{PROJECT_ID}.{DATASET_ID}.__TABLES__`
        WHERE table_id IN ('pipeline', 'closed_deals_won', 'closed_deals_lost', 'deal_embeddings')
        """
        rows = list(client.query(query).result())
        if not rows:
            return {}

        by_table = {
            str(row.get("table_id")): row.get("last_modified")
            for row in rows
        }

        embeddings_ts = by_table.get("deal_embeddings")
        source_latest = max(
            [
                ts
                for name, ts in by_table.items()
                if name != "deal_embeddings" and ts is not None
            ],
            default=None,
        )

        lag_hours = 0.0
        if embeddings_ts and source_latest:
            lag_hours = max(
                0.0,
                (source_latest - embeddings_ts).total_seconds() / 3600.0,
            )

        return {
            "deal_embeddings_last_modified": embeddings_ts.isoformat() if embeddings_ts else None,
            "sources_last_modified": {
                "pipeline": by_table.get("pipeline").isoformat() if by_table.get("pipeline") else None,
                "closed_deals_won": by_table.get("closed_deals_won").isoformat() if by_table.get("closed_deals_won") else None,
                "closed_deals_lost": by_table.get("closed_deals_lost").isoformat() if by_table.get("closed_deals_lost") else None,
            },
            "embeddings_lag_hours": round(lag_hours, 2),
            "embeddings_stale": lag_hours >= 24.0,
        }
    except Exception:
        return {}


def get_business_highlights(
        client: bigquery.Client,
        *,
        won_where: str,
        lost_where: str,
        pipeline_where: str,
) -> Dict[str, Any]:
        highlights: Dict[str, Any] = {
                "top_wins": [],
                "top_losses": [],
                "top_pipeline": [],
                "top_gain_causes": [],
                "top_loss_causes": [],
        }
        try:
                top_wins_query = f"""
                SELECT
                    Oportunidade,
                    Conta,
                    Vendedor,
                    ROUND(SAFE_CAST(Gross AS FLOAT64), 2) AS gross,
                    ROUND(SAFE_CAST(Ciclo_dias AS FLOAT64), 1) AS ciclo_dias,
                    COALESCE(NULLIF(TRIM(Fatores_Sucesso), ''), 'Sem classificação') AS causa
                FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
                {won_where}
                ORDER BY SAFE_CAST(Gross AS FLOAT64) DESC
                LIMIT 5
                """

                top_losses_query = f"""
                SELECT
                    Oportunidade,
                    Conta,
                    Vendedor,
                    ROUND(SAFE_CAST(Gross AS FLOAT64), 2) AS gross,
                    ROUND(SAFE_CAST(Ciclo_dias AS FLOAT64), 1) AS ciclo_dias,
                    COALESCE(NULLIF(TRIM(Causa_Raiz), ''), 'Sem classificação') AS causa
                FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
                {lost_where}
                ORDER BY SAFE_CAST(Gross AS FLOAT64) DESC
                LIMIT 5
                """

                top_pipeline_query = f"""
                SELECT
                    Oportunidade,
                    Conta,
                    Vendedor,
                    ROUND(SAFE_CAST(Gross AS FLOAT64), 2) AS gross,
                    ROUND(SAFE_CAST(Idle_Dias AS FLOAT64), 1) AS idle_dias,
                    COALESCE(NULLIF(TRIM(Fase_Atual), ''), 'Sem classificação') AS fase
                FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
                {pipeline_where}
                ORDER BY SAFE_CAST(Gross AS FLOAT64) DESC
                LIMIT 5
                """

                top_gain_causes_query = f"""
                SELECT
                    COALESCE(NULLIF(TRIM(Fatores_Sucesso), ''), 'Sem classificação') AS causa,
                    COUNT(*) AS total
                FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
                {won_where}
                GROUP BY causa
                ORDER BY total DESC
                LIMIT 5
                """

                top_loss_causes_query = f"""
                SELECT
                    COALESCE(NULLIF(TRIM(Causa_Raiz), ''), 'Sem classificação') AS causa,
                    COUNT(*) AS total
                FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
                {lost_where}
                GROUP BY causa
                ORDER BY total DESC
                LIMIT 5
                """

                highlights["top_wins"] = [dict(row) for row in client.query(top_wins_query).result()]
                highlights["top_losses"] = [dict(row) for row in client.query(top_losses_query).result()]
                highlights["top_pipeline"] = [dict(row) for row in client.query(top_pipeline_query).result()]
                highlights["top_gain_causes"] = [dict(row) for row in client.query(top_gain_causes_query).result()]
                highlights["top_loss_causes"] = [dict(row) for row in client.query(top_loss_causes_query).result()]
        except Exception:
                return highlights

        return highlights


@router.get("/insights-rag")
async def get_insights_rag(
    query: str = Query("insights de vendas", description="Texto base para a busca semantica"),
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    month: Optional[str] = Query(None, description="Mês 1-12"),
    date_start: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    date_end: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    seller: Optional[str] = Query(None, description="Nome do vendedor ou multiplos separados por virgula"),
    phase: Optional[str] = Query(None, description="Fase atual do pipeline"),
    source: Optional[str] = Query(None, description="Filtrar por source: pipeline, won, lost"),
    top_k: int = Query(30, ge=5, le=200, description="Numero de resultados"),
    min_similarity: float = Query(0.15, ge=0.0, le=1.0, description="Threshold minimo de similaridade para filtrar resultados"),
):
    """
    Retrieve similar deals using embeddings and generate insights with Gemini.
    """
    try:
        cache_key = _build_cache_key(
            {
                "query": query,
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "phase": phase,
                "source": source,
                "top_k": top_k,
                "min_similarity": min_similarity,
            }
        )
        cached = _get_cache(cache_key)
        if cached:
            return cached

        request_start = time.perf_counter()
        timings_ms = {
            "retrieval": 0,
            "ranking": 0,
            "stats": 0,
            "insights": 0,
            "total": 0,
        }

        client = get_bq_client()
        where_clause = build_filters(year, quarter, seller, source, phase)
        effective_top_k = min(top_k, 40)

        retrieval_start = time.perf_counter()
        deals = retrieve_similar_deals(
            client,
            project_id=PROJECT_ID,
            dataset_id=DATASET_ID,
            query_text=query,
            top_k=effective_top_k,
            where_clause=where_clause,
        )
        raw_retrieved_count = len(deals)
        timings_ms["retrieval"] = int((time.perf_counter() - retrieval_start) * 1000)

        ranking_start = time.perf_counter()
        deals = enrich_similarity_scores(deals)

        fiscal_q = f"FY{year[-2:]}-Q{quarter}" if year and quarter else None
        deals = rerank_deals_by_context(
            deals,
            query_text=query,
            seller=seller,
            source=source,
            fiscal_q=fiscal_q,
        )

        thresholded_deals = apply_similarity_threshold(deals, min_similarity=min_similarity)
        threshold_relaxed = False
        if not thresholded_deals and deals:
            thresholded_deals = deals[: min(10, len(deals))]
            threshold_relaxed = True
        deals = thresholded_deals
        timings_ms["ranking"] = int((time.perf_counter() - ranking_start) * 1000)

        stats_start = time.perf_counter()
        stats = summarize_deals_stats(deals)
        wins_deals = [d for d in deals if (d.get("source") or "").lower() == "won"]
        losses_deals = [d for d in deals if (d.get("source") or "").lower() == "lost"]

        pipeline_where = build_pipeline_filters(year, quarter, month, date_start, date_end, seller, phase)
        won_where = build_closed_filters(year, quarter, month, date_start, date_end, seller, "Data_Fechamento")
        lost_where = build_closed_filters(year, quarter, month, date_start, date_end, seller, "Data_Fechamento")

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
        timings_ms["stats"] = int((time.perf_counter() - stats_start) * 1000)

        business_highlights = get_business_highlights(
            client,
            won_where=won_where,
            lost_where=lost_where,
            pipeline_where=pipeline_where,
        )

        insights_start = time.perf_counter()
        ai_insights = generate_ai_insights(
            query,
            deals,
            stats,
            gemini_api_key=GEMINI_API_KEY,
            gemini_model=GEMINI_MODEL,
            gcp_project=PROJECT_ID,
            vertex_location=VERTEX_AI_LOCATION,
            business_highlights=business_highlights,
            filters_context={
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "phase": phase,
                "source": source,
            },
        )
        timings_ms["insights"] = int((time.perf_counter() - insights_start) * 1000)
        timings_ms["total"] = int((time.perf_counter() - request_start) * 1000)

        quality = build_quality_metrics(
            deals,
            requested_top_k=top_k,
            min_similarity=min_similarity,
            threshold_relaxed=threshold_relaxed,
            raw_retrieved_count=raw_retrieved_count,
        )

        freshness = get_embeddings_freshness(client)

        response_payload = {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
            "rag": {
                "gemini_enabled": bool(GEMINI_API_KEY),
                "vertex_auth_enabled": True,
                "retrieved_count": len(deals),
                "min_similarity": min_similarity,
                "threshold_relaxed": threshold_relaxed,
                "freshness": freshness,
                "cache_ttl_seconds": INSIGHTS_CACHE_TTL_SECONDS,
            },
            "quality": quality,
            "latency_ms": timings_ms,
            "filters": {
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "phase": phase,
                "source": source
            },
            "stats": stats,
            "wins_stats": wins_stats,
            "losses_stats": losses_stats,
            "business_highlights": business_highlights,
            "aiInsights": ai_insights,
            "deals": deals
        }

        _set_cache(cache_key, response_payload)
        return response_payload

    except Exception:
        return {
            "success": False,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
            "rag": {
                "gemini_enabled": bool(GEMINI_API_KEY),
                "vertex_auth_enabled": True,
                "retrieved_count": 0,
                "min_similarity": min_similarity,
                "threshold_relaxed": False,
            },
            "quality": {
                "requested_top_k": top_k,
                "retrieved_count_pre_filter": 0,
                "retrieved_count_post_filter": 0,
                "coverage_ratio": 0.0,
                "coverage_ratio_pre_filter": 0.0,
                "min_similarity": round(float(min_similarity), 4),
                "avg_similarity": 0.0,
                "max_similarity": 0.0,
                "avg_rank_score": 0.0,
                "precision_at_5": 0.0,
                "precision_at_10": 0.0,
                "threshold_relaxed": False,
            },
            "latency_ms": {
                "retrieval": 0,
                "ranking": 0,
                "stats": 0,
                "insights": 0,
                "total": 0,
            },
            "filters": {
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "phase": phase,
                "source": source,
            },
            "stats": {"total": 0, "by_source": {}, "pipeline": {"total": 0, "avg_idle_days": 0}},
            "wins_stats": {"total": 0, "avg_cycle_days": 0},
            "losses_stats": {"total": 0, "avg_cycle_days": 0},
            "business_highlights": {
                "top_wins": [],
                "top_losses": [],
                "top_pipeline": [],
                "top_gain_causes": [],
                "top_loss_causes": [],
            },
            "aiInsights": {
                "status": "unavailable",
                "wins": "Insights RAG temporariamente indisponível.",
                "losses": "Insights RAG temporariamente indisponível.",
                "recommendations": [],
            },
            "deals": [],
        }
