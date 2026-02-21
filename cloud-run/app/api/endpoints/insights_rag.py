"""
Insights RAG Endpoint - Vector Search + Gemini
Uses BigQuery embeddings to retrieve relevant deals and generate insights.
"""
from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import google.generativeai as genai
import os
from datetime import datetime

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = os.getenv("BQ_DATASET", "sales_intelligence")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-preview-09-2025")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


def build_filters(
    year: Optional[str],
    quarter: Optional[str],
    seller: Optional[str],
    source: Optional[str]
) -> str:
    conditions = []

    if year and quarter:
        fiscal_q = f"FY{year[-2:]}-Q{quarter}"
        conditions.append(f"Fiscal_Q = '{fiscal_q}'")
    elif year:
        fiscal_prefix = f"FY{year[-2:]}-"
        conditions.append(f"STARTS_WITH(Fiscal_Q, '{fiscal_prefix}')")

    if seller:
        sellers = [s.strip() for s in seller.split(',') if s.strip()]
        if len(sellers) == 1:
            conditions.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            conditions.append(f"Vendedor IN ('{sellers_quoted}')")

    if source:
        conditions.append(f"source = '{source}'")

    return "WHERE " + " AND ".join(conditions) if conditions else ""


def build_closed_filters(year: Optional[str], quarter: Optional[str], seller: Optional[str], date_field: str) -> str:
    filters = []
    if year:
        filters.append(
            f"EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), SAFE.PARSE_DATE('%d-%m-%Y', {date_field}))) = {int(year)}"
        )
    if quarter:
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12)
        }
        q_num = int(quarter)
        if q_num in quarter_months:
            start_month, end_month = quarter_months[q_num]
            filters.append(
                f"EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), SAFE.PARSE_DATE('%d-%m-%Y', {date_field}))) BETWEEN {start_month} AND {end_month}"
            )
    if seller:
        sellers = [s.strip() for s in seller.split(',') if s.strip()]
        if len(sellers) == 1:
            filters.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            filters.append(f"Vendedor IN ('{sellers_quoted}')")
    return "WHERE " + " AND ".join(filters) if filters else ""


def build_pipeline_filters(year: Optional[str], quarter: Optional[str], seller: Optional[str]) -> str:
    filters = []
    if year:
        filters.append(f"EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {int(year)}")
    if quarter:
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12)
        }
        q_num = int(quarter)
        if q_num in quarter_months:
            start_month, end_month = quarter_months[q_num]
            filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}")
    if seller:
        sellers = [s.strip() for s in seller.split(',') if s.strip()]
        if len(sellers) == 1:
            filters.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            filters.append(f"Vendedor IN ('{sellers_quoted}')")
    return "WHERE " + " AND ".join(filters) if filters else ""


def summarize_deals_stats(deals: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not deals:
        return {
            "total": 0,
            "by_source": {},
            "avg_idle_days": 0,
            "avg_cycle_days": 0,
            "top_sellers": [],
            "top_accounts": []
        }

    by_source: Dict[str, int] = {}
    seller_totals: Dict[str, int] = {}
    account_totals: Dict[str, int] = {}
    idle_values: List[float] = []
    cycle_values: List[float] = []

    for d in deals:
        src = d.get("source") or "unknown"
        by_source[src] = by_source.get(src, 0) + 1

        try:
            idle_value = float(d.get("Dias_Idle") or d.get("dias_idle") or 0)
        except (TypeError, ValueError):
            idle_value = 0

        try:
            cycle_value = float(d.get("Ciclo_dias") or d.get("ciclo_dias") or d.get("Ciclo") or 0)
        except (TypeError, ValueError):
            cycle_value = 0

        if idle_value > 0:
            idle_values.append(idle_value)
        if cycle_value > 0:
            cycle_values.append(cycle_value)

        seller = d.get("Vendedor") or "N/A"
        seller_totals[seller] = seller_totals.get(seller, 0) + 1

        account = d.get("Conta") or "N/A"
        account_totals[account] = account_totals.get(account, 0) + 1

    avg_idle = sum(idle_values) / len(idle_values) if idle_values else 0
    avg_cycle = sum(cycle_values) / len(cycle_values) if cycle_values else 0

    top_sellers: List[Dict[str, Any]] = []
    top_accounts: List[Dict[str, Any]] = []

    return {
        "total": len(deals),
        "by_source": by_source,
        "avg_idle_days": round(avg_idle, 2),
        "avg_cycle_days": round(avg_cycle, 2),
        "top_sellers": top_sellers,
        "top_accounts": top_accounts
    }


def generate_ai_insights(query_text: str, deals: List[Dict[str, Any]], stats: Dict[str, Any]) -> Dict[str, Any]:
    if not deals:
        return {
            "status": "empty",
            "wins": "Sem dados suficientes para gerar insights.",
            "losses": "Sem dados suficientes para gerar insights.",
            "recommendations": []
        }

    wins_deals = [d for d in deals if (d.get("source") or "").lower() == "won"]
    losses_deals = [d for d in deals if (d.get("source") or "").lower() == "lost"]
    wins_stats = stats.get("wins_stats") or summarize_deals_stats(wins_deals)
    losses_stats = stats.get("losses_stats") or summarize_deals_stats(losses_deals)
    pipeline_stats = stats.get("pipeline") or {}

    context = f"""
Voce e um assistente de inteligencia comercial. Use SOMENTE os fatos abaixo.

Consulta: {query_text}
Total de deals: {stats.get('total')}
Por source: {stats.get('by_source')}

FATOS VITORIAS (source=won):
Total: {wins_stats.get('total')}
Ciclo medio (dias): {wins_stats.get('avg_cycle_days')}

FATOS PERDAS (source=lost):
Total: {losses_stats.get('total')}
Ciclo medio (dias): {losses_stats.get('avg_cycle_days')}

FATOS PIPELINE:
Total: {pipeline_stats.get('total')}
Idle medio (dias): {pipeline_stats.get('avg_idle_days')}

Instrucoes:
1. Gere 3-4 bullets para VITORIAS usando apenas FATOS VITORIAS.
2. Gere 3-4 bullets para PERDAS usando apenas FATOS PERDAS.
3. Gere 3 recomendacoes acionaveis considerando o funil completo.
4. Use numeros concretos dos fatos, priorizando idle medio e ciclo medio. Nao use valores financeiros.
5. Se nao houver dados em VITORIAS ou PERDAS, responda "Sem deals ganhos no filtro atual" ou "Sem deals perdidos no filtro atual".
6. Nao cite nomes de vendedores, contas ou clientes.
7. Nao use markdown, emojis ou asteriscos.
8. Responda em portugues.

Formato exato:
VITORIAS:
- ...
PERDAS:
- ...
RECOMENDACOES:
- ...
"""

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(context)
        text = response.text if response else ""
    except Exception:
        text = ""

    def clean_section(text_block: str) -> str:
        if not text_block:
            return ""
        cleaned: List[str] = []
        for raw_line in text_block.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if all(ch in "*-_" for ch in line):
                continue
            if not line.startswith(("- ", "• ")):
                line = f"- {line}"
            cleaned.append(line)
        return "\n".join(cleaned)

    wins = ""
    losses = ""
    recommendations: List[str] = []

    if text:
        parts = text.split("PERDAS:")
        wins = parts[0].replace("VITORIAS:", "").strip() if parts else ""
        if len(parts) > 1:
            losses_part = parts[1]
            rec_split = losses_part.split("RECOMENDACOES:")
            losses = rec_split[0].strip()
            if len(rec_split) > 1:
                recommendations = [r.strip("- ") for r in rec_split[1].split("\n") if r.strip()]

    if not wins_deals:
        wins = "- Sem deals ganhos no filtro atual."
    else:
        wins = clean_section(wins)

    if not losses_deals:
        losses = "- Sem deals perdidos no filtro atual."
    else:
        losses = clean_section(losses)
    recommendations = [r for r in (clean_section("\n".join(recommendations)).splitlines()) if r.strip()]

    return {
        "status": "rag",
        "wins": wins or "Sem insights de vitorias.",
        "losses": losses or "Sem insights de perdas.",
        "recommendations": recommendations,
        "full": text
    }


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
        if not GEMINI_API_KEY:
            return {
                "success": True,
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
                    "status": "disabled",
                    "wins": "Insights RAG desabilitado (GEMINI_API_KEY não configurada).",
                    "losses": "Insights RAG desabilitado (GEMINI_API_KEY não configurada).",
                    "recommendations": [],
                },
                "deals": [],
            }

        client = get_bq_client()
        where_clause = build_filters(year, quarter, seller, source)

        query_sql = f"""
        WITH query_embedding AS (
          SELECT text_embedding AS embedding
          FROM ML.GENERATE_TEXT_EMBEDDING(
            MODEL `{PROJECT_ID}.{DATASET_ID}.text_embedding_model`,
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
                        FROM `{PROJECT_ID}.{DATASET_ID}.deal_embeddings`
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
                bigquery.ScalarQueryParameter("query_text", "STRING", query),
                bigquery.ScalarQueryParameter("top_k", "INT64", top_k),
            ]
        )

        results = client.query(query_sql, job_config=job_config).result()
        deals = [dict(row) for row in results]

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

        ai_insights = generate_ai_insights(query, deals, stats)

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
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

    except Exception as e:
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
