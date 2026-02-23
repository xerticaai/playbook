"""
Sales Intelligence API - FastAPI com Filtros Dinâmicos por Data
Filtros: year (2024-2030), month (1-12), seller
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.cloud import bigquery
from typing import List, Dict, Any, Optional
import os
from datetime import datetime
import time
from pathlib import Path
import google.generativeai as genai

# Import modular endpoints
from api.endpoints.ai_analysis import router as ai_router
from api.endpoints.insights_rag import router as insights_rag_router
from api.endpoints.performance import router as performance_router
from api.endpoints.weekly_agenda import router as weekly_agenda_router
# War Room REMOVED - functionality merged into Weekly Agenda
# from api.endpoints.war_room import router as war_room_router
from api.endpoints.export import router as export_router
from api.endpoints.ml_predictions import router as ml_predictions_router

app = FastAPI(
    title="Sales Intelligence API",
    description="BigQuery data with dynamic date filters + AI Analysis + Insights + Performance + Weekly Agenda + War Room + Export",
    version="2.5.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://x-gtm.web.app",
        "https://x-gtm.firebaseapp.com",
        "http://localhost:3000",
        "http://localhost:5000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend é servido pelo Firebase Hosting — Cloud Run só expõe a API (/api/**).
# O mount de /static abaixo só é ativo em dev local (quando public_path existir).
public_path = Path(__file__).parent / "public"
if public_path.exists():
    app.mount("/static", StaticFiles(directory=str(public_path)), name="static")
    print(f"✅ Static files mounted from: {public_path}")

# Include modular routers
app.include_router(ai_router, prefix="/api", tags=["AI Analysis"])
app.include_router(insights_rag_router, prefix="/api", tags=["Insights RAG"])
app.include_router(performance_router, prefix="/api", tags=["Performance"])
app.include_router(weekly_agenda_router, prefix="/api", tags=["Weekly Agenda"])
# War Room REMOVED - functionality merged into Weekly Agenda
# app.include_router(war_room_router, prefix="/api", tags=["War Room"])
app.include_router(export_router, prefix="/api", tags=["Export"])
app.include_router(ml_predictions_router, prefix="/api", tags=["ML Predictions"])

# BigQuery
PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br").strip().rstrip("\\/")
DATASET_ID = os.getenv("BQ_DATASET", "sales_intelligence")

# Singleton BQ client (reused across requests within the same Cloud Run instance)
_BQ_CLIENT: Optional[bigquery.Client] = None

def get_bq_client() -> bigquery.Client:
    global _BQ_CLIENT
    if _BQ_CLIENT is None:
        _BQ_CLIENT = bigquery.Client(project=PROJECT_ID)
    return _BQ_CLIENT

# Gemini Configuration (optional)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)  # type: ignore[attr-defined]

# Short-lived in-memory cache (per Cloud Run instance)
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "120"))
CACHE: Dict[str, Dict[str, Any]] = {}

FORCED_ACTIVE_SELLERS = {"rayssa zevolli"}
SELLER_DISPLAY_OVERRIDES = {
    "rayssa zevolli": "Rayssa Zevolli",
}

def build_cache_key(endpoint: str, params: Dict[str, Any]) -> str:
    parts = []
    for key in sorted(params.keys()):
        value = params[key]
        if value is None:
            value = ""
        parts.append(f"{key}={value}")
    if not parts:
        return endpoint
    return f"{endpoint}?{'&'.join(parts)}"

def get_cached_response(cache_key: str) -> Optional[Any]:
    cached = CACHE.get(cache_key)
    if not cached:
        return None
    if cached["expires_at"] <= time.time():
        CACHE.pop(cache_key, None)
        return None
    return cached["data"]

def set_cached_response(cache_key: str, data: Any, ttl_seconds: int = CACHE_TTL_SECONDS) -> None:
    CACHE[cache_key] = {
        "data": data,
        "expires_at": time.time() + ttl_seconds
    }


def _normalize_seller_key(name: Optional[str]) -> str:
    return str(name or "").strip().lower()


def _display_seller_name(name: Optional[str]) -> str:
    original = str(name or "").strip()
    if not original:
        return ""
    normalized = _normalize_seller_key(original)
    return SELLER_DISPLAY_OVERRIDES.get(normalized, original)


def _normalize_email(raw_email: Optional[str]) -> Optional[str]:
    email = str(raw_email or "").strip().lower()
    if not email:
        return None
    if ":" in email:
        email = email.split(":")[-1].strip().lower()
    return email or None


def _extract_request_email(request: Request) -> Optional[str]:
    candidates = [
        request.headers.get("x-goog-authenticated-user-email"),
        request.headers.get("x-authenticated-user-email"),
        request.headers.get("x-forwarded-email"),
        request.headers.get("x-user-email"),
    ]
    for value in candidates:
        normalized = _normalize_email(value)
        if normalized:
            return normalized
    return None

def query_to_dict(query: str) -> List[Dict[str, Any]]:
    client = get_bq_client()
    query_job = client.query(query)
    results = query_job.result()
    return [dict(row) for row in results]


def sql_literal(value: str) -> str:
    return str(value).replace("'", "''")


def parse_csv_values(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).split(',') if item and item.strip()]


def build_in_filter(column_name: str, raw_value: Optional[str]) -> Optional[str]:
    values = parse_csv_values(raw_value)
    if not values:
        return None
    if len(values) == 1:
        return f"{column_name} = '{sql_literal(values[0])}'"
    values_quoted = "', '".join(sql_literal(v) for v in values)
    return f"{column_name} IN ('{values_quoted}')"


def get_table_columns(table_name: str) -> set[str]:
    cache_key = f"_table_columns_{table_name}"
    cached = get_cached_response(cache_key)
    if cached is not None:
        return cached

    query = f"""
    SELECT column_name
    FROM `{PROJECT_ID}.{DATASET_ID}.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = '{sql_literal(table_name)}'
    """
    columns = {str(row.get("column_name") or "") for row in query_to_dict(query)}
    set_cached_response(cache_key, columns, ttl_seconds=300)
    return columns


def append_pipeline_dimension_filters(
    filters: List[str],
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
) -> None:
    columns = get_table_columns("pipeline")

    if phase and "Fase_Atual" in columns:
        phase_filter = build_in_filter("Fase_Atual", phase)
        if phase_filter:
            filters.append(phase_filter)

    filter_map = [
        ("Owner_Preventa", owner_preventa),
        ("Vertical_IA", vertical_ia),
        ("Sub_vertical_IA", sub_vertical_ia),
        ("Sub_sub_vertical_IA", sub_sub_vertical_ia),
        ("Subsegmento_de_mercado", subsegmento_mercado),
        ("Segmento_consolidado", segmento_consolidado),
        ("Portfolio_FDM", portfolio_fdm),
    ]

    for column_name, filter_value in filter_map:
        if filter_value and column_name in columns:
            in_filter = build_in_filter(column_name, filter_value)
            if in_filter:
                filters.append(in_filter)

    billing_cities = parse_csv_values(billing_city)
    if billing_cities and "Cidade_de_cobranca" in columns:
        billing_city_filter = build_in_filter("Cidade_de_cobranca", billing_city)
        if billing_city_filter:
            filters.append(billing_city_filter)
    elif billing_cities and "Estado_Cidade_Detectado" in columns:
        city_terms = " OR ".join(
            f"LOWER(Estado_Cidade_Detectado) LIKE LOWER('%{sql_literal(city)}%')" for city in billing_cities
        )
        filters.append(f"({city_terms})")

    billing_states = parse_csv_values(billing_state)
    if billing_states and "Estado_Provincia_de_cobranca" in columns:
        billing_state_filter = build_in_filter("Estado_Provincia_de_cobranca", billing_state)
        if billing_state_filter:
            filters.append(billing_state_filter)
    elif billing_states and "Estado_Cidade_Detectado" in columns:
        state_terms = " OR ".join(
            f"LOWER(Estado_Cidade_Detectado) LIKE LOWER('%{sql_literal(state)}%')" for state in billing_states
        )
        filters.append(f"({state_terms})")


def build_pipeline_filters_for_facets(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    exclude_param: Optional[str] = None,
) -> List[str]:
    filters: List[str] = []

    if year:
        filters.append(f"EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year}")

    if quarter:
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12)
        }
        if quarter in quarter_months:
            start_month, end_month = quarter_months[quarter]
            filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}")
    elif month:
        filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {month}")

    if seller and exclude_param != "seller":
        seller_filter = build_seller_filter(seller)
        if seller_filter:
            filters.append(seller_filter)

    append_pipeline_dimension_filters(
        filters,
        phase=None if exclude_param == "phase" else phase,
        owner_preventa=None if exclude_param == "owner_preventa" else owner_preventa,
        billing_city=None if exclude_param == "billing_city" else billing_city,
        billing_state=None if exclude_param == "billing_state" else billing_state,
        vertical_ia=None if exclude_param == "vertical_ia" else vertical_ia,
        sub_vertical_ia=None if exclude_param == "sub_vertical_ia" else sub_vertical_ia,
        sub_sub_vertical_ia=None if exclude_param == "sub_sub_vertical_ia" else sub_sub_vertical_ia,
        subsegmento_mercado=None if exclude_param == "subsegmento_mercado" else subsegmento_mercado,
        segmento_consolidado=None if exclude_param == "segmento_consolidado" else segmento_consolidado,
        portfolio_fdm=None if exclude_param == "portfolio_fdm" else portfolio_fdm,
    )
    return filters

def build_seller_filter(seller: Optional[str], column_name: str = "Vendedor") -> Optional[str]:
    """
    Helper function to build seller filter supporting multiple sellers.
    Input: seller = "Alex Araujo,Carlos Moll" or "Alex Araujo" or None
    Output: "Vendedor IN ('Alex Araujo', 'Carlos Moll')" or "Vendedor = 'Alex Araujo'" or None
    """
    if not seller:
        return None
    
    sellers = [s.strip() for s in seller.split(',')]
    if len(sellers) == 1:
        return f"{column_name} = '{sql_literal(sellers[0])}'"
    else:
        sellers_quoted = "', '".join(sql_literal(s) for s in sellers)
        return f"{column_name} IN ('{sellers_quoted}')"

# =============================================
# HEALTH & ROOT
# =============================================

@app.get("/health")
async def health_check():
    try:
        client = get_bq_client()
        query = f"SELECT COUNT(*) as total FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`"
        result = list(client.query(query).result())[0]
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "bigquery": "connected",
            "pipeline_records": result["total"]
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.get("/")
async def root():
    """Serve the dashboard HTML"""
    html_path = Path(__file__).parent / "public" / "index.html"
    if html_path.exists():
        return FileResponse(html_path)
    else:
        # Fallback to API info if index.html not found
        return {
            "message": "Sales Intelligence API v2.4",
            "version": "2.4.0",
            "filters": "year, quarter, month, seller (comma-separated for multiple)",
            "endpoints": [
                "/health", 
                "/api/dashboard", 
                "/api/metrics", 
                "/api/sellers", 
                "/api/pipeline", 
                "/api/closed/won", 
                "/api/closed/lost", 
                "/api/actions", 
                "/api/priorities",
                "/api/performance",
                "/api/performance/seller/{name}",
                "/api/insights-rag",
                "/api/ai-analysis",
                "/api/weekly-agenda",
                "/api/export/pauta-semanal-csv"
            ]
        }

@app.get("/dashboard")
async def dashboard():
    """Serve the dashboard HTML (alternative endpoint)"""
    html_path = Path(__file__).parent / "public" / "index.html"
    if html_path.exists():
        return FileResponse(html_path)
    else:
        raise HTTPException(status_code=404, detail="Dashboard not found")


@app.get("/api/user-context")
async def get_user_context(request: Request):
    email = _extract_request_email(request)
    return {
        "email": email,
        "can_access_salesforce_indicators": email == "amalia.silva@xertica.com"
    }

# =============================================
# SELLERS ENDPOINT
# =============================================

@app.get("/api/sellers")
def get_sellers(nocache: bool = False):
    """Retorna lista de todos os vendedores (ativos + históricos)"""
    cache_key = build_cache_key("/api/sellers", {})
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        query = f"""
        SELECT 
          Vendedor,
          COUNTIF(source = 'pipeline') as deals_pipeline,
          COUNTIF(source = 'won') as deals_won,
          COUNTIF(source = 'lost') as deals_lost,
          ROUND(SUM(net_value), 2) as total_net
        FROM (
          SELECT Vendedor, Net as net_value, 'pipeline' as source
          FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
          WHERE Vendedor IS NOT NULL
          
          UNION ALL
          
          SELECT Vendedor, Net as net_value, 'won' as source
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
          WHERE Vendedor IS NOT NULL
          
          UNION ALL
          
          SELECT Vendedor, 0 as net_value, 'lost' as source
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
          WHERE Vendedor IS NOT NULL
        )
        WHERE Vendedor IS NOT NULL
        GROUP BY Vendedor
        ORDER BY deals_pipeline DESC, deals_won DESC
        """
        
        sellers_raw = query_to_dict(query)

        normalized_index: Dict[str, Dict[str, Any]] = {}
        for seller in sellers_raw:
            seller_name = _display_seller_name(seller.get("Vendedor"))
            seller_key = _normalize_seller_key(seller_name)
            if not seller_key:
                continue

            if seller_key not in normalized_index:
                normalized_index[seller_key] = {
                    "Vendedor": seller_name,
                    "deals_pipeline": int(seller.get("deals_pipeline") or 0),
                    "deals_won": int(seller.get("deals_won") or 0),
                    "deals_lost": int(seller.get("deals_lost") or 0),
                    "total_net": float(seller.get("total_net") or 0),
                }
            else:
                normalized_index[seller_key]["deals_pipeline"] += int(seller.get("deals_pipeline") or 0)
                normalized_index[seller_key]["deals_won"] += int(seller.get("deals_won") or 0)
                normalized_index[seller_key]["deals_lost"] += int(seller.get("deals_lost") or 0)
                normalized_index[seller_key]["total_net"] += float(seller.get("total_net") or 0)

        # Garante presença explícita de vendedores forçados como ativos
        for forced_key in FORCED_ACTIVE_SELLERS:
            if forced_key not in normalized_index:
                forced_name = SELLER_DISPLAY_OVERRIDES.get(forced_key, forced_key.title())
                synthetic = {
                    "Vendedor": forced_name,
                    "deals_pipeline": 0,
                    "deals_won": 0,
                    "deals_lost": 0,
                    "total_net": 0,
                }
                normalized_index[forced_key] = synthetic

        sellers = list(normalized_index.values())
        
        # Separar vendedores ativos (com pipeline + exceções manuais) dos históricos
        active_sellers = [
            s for s in sellers
            if (s['deals_pipeline'] > 0) or (_normalize_seller_key(s.get("Vendedor")) in FORCED_ACTIVE_SELLERS)
        ]
        historical_sellers = [
            s for s in sellers
            if (s['deals_pipeline'] == 0) and (_normalize_seller_key(s.get("Vendedor")) not in FORCED_ACTIVE_SELLERS)
        ]

        active_sellers.sort(key=lambda s: s.get("Vendedor", ""))
        historical_sellers.sort(key=lambda s: s.get("Vendedor", ""))
        
        result = {
            "active": active_sellers,
            "historical": historical_sellers,
            "total": len(sellers)
        }
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sellers error: {str(e)}")

# =============================================
# INDIVIDUAL ENDPOINTS
# =============================================

@app.get("/api/metrics")
def get_metrics(
    year: Optional[int] = None, 
    quarter: Optional[int] = None,
    month: Optional[int] = None, 
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    nocache: bool = False
):
    """Endpoint de métricas consolidadas com dados corretos do BigQuery
    
    Parâmetros:
    - year: 2024, 2025, 2026... (optional)
    - quarter: 1-4 (Q1=jan-mar, Q2=abr-jun, Q3=jul-set, Q4=out-dez) (optional)
    - month: 1-12 (optional) - se quarter estiver definido, month será ignorado
    - seller: nome do vendedor ou lista separada por vírgula (optional)
    """
    cache_key = build_cache_key(
        "/api/metrics",
        {
            "year": year,
            "quarter": quarter,
            "month": month,
            "seller": seller,
            "phase": phase,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio_fdm": portfolio_fdm,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        # Build filter clauses
        pipeline_filters = ["Fase_Atual NOT IN ('Closed Won', 'Closed Lost')"]
        closed_won_filters = []
        closed_lost_filters = []
        closed_date_expr = "COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento), SAFE.PARSE_DATE('%d/%m/%Y', Data_Fechamento), SAFE.PARSE_DATE('%Y/%m/%d', Data_Fechamento))"
        activities_expr = "SAFE_CAST(REPLACE(REGEXP_EXTRACT(CAST(Atividades AS STRING), r'-?[0-9]+(?:[\\.,][0-9]+)?'), ',', '.') AS FLOAT64)"
        
        fiscal_q_exact = f"FY{str(year)[-2:]}-Q{quarter}" if (year and quarter) else None

        if year:
            # Filtrar por ano usando Data_Prevista (pipeline) e Data_Fechamento (closed)
            pipeline_filters.append(f"EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year}")
            if fiscal_q_exact:
                closed_won_filters.append(f"(EXTRACT(YEAR FROM {closed_date_expr}) = {year} OR Fiscal_Q = '{fiscal_q_exact}')")
                closed_lost_filters.append(f"(EXTRACT(YEAR FROM {closed_date_expr}) = {year} OR Fiscal_Q = '{fiscal_q_exact}')")
            else:
                closed_won_filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
                closed_lost_filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
        
        # Quarter tem prioridade sobre month (Calendar Quarters: Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez)
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                # Pipeline: filtrar por Data_Prevista
                pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}")
                # Closed Won: filtrar por Data_Fechamento
                if fiscal_q_exact:
                    closed_won_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                    closed_lost_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                else:
                    closed_won_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
                    closed_lost_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
        elif month:
            # Se quarter não definido, usar month específico
            pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {month}")
            closed_won_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
            closed_lost_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
        
        if seller:
            # Support multiple sellers: "Alex Araujo,Carlos Moll" -> IN ('Alex Araujo', 'Carlos Moll')
            sellers = [s.strip() for s in seller.split(',')]
            if len(sellers) == 1:
                seller_escaped = sql_literal(sellers[0])
                pipeline_filters.append(f"Vendedor = '{seller_escaped}'")
                closed_won_filters.append(f"Vendedor = '{seller_escaped}'")
                closed_lost_filters.append(f"Vendedor = '{seller_escaped}'")
            else:
                sellers_quoted = "', '".join(sql_literal(s) for s in sellers)
                pipeline_filters.append(f"Vendedor IN ('{sellers_quoted}')")
                closed_won_filters.append(f"Vendedor IN ('{sellers_quoted}')")
                closed_lost_filters.append(f"Vendedor IN ('{sellers_quoted}')")

        append_pipeline_dimension_filters(
            pipeline_filters,
            phase=phase,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio_fdm=portfolio_fdm,
        )

        pipeline_where = "WHERE " + " AND ".join(pipeline_filters)
        won_where = "WHERE " + " AND ".join(closed_won_filters) if closed_won_filters else ""
        lost_where = "WHERE " + " AND ".join(closed_lost_filters) if closed_lost_filters else ""
        
        # Pipeline metrics (com idle days, scores MEDDIC/BANT e avg_confidence)
        pipeline_query = f"""
        SELECT 
            COUNT(*) as deals_count,
            ROUND(SUM(Gross), 2) as gross,
            ROUND(SUM(Net), 2) as net,
            ROUND(AVG(SAFE_CAST(Idle_Dias AS FLOAT64)), 1) as avg_idle_days,
            ROUND(AVG(SAFE_CAST(MEDDIC_Score AS FLOAT64)), 1) as avg_meddic,
            ROUND(AVG(SAFE_CAST(BANT_Score AS FLOAT64)), 1) as avg_bant,
            ROUND(AVG(SAFE_CAST(Confianca AS FLOAT64)), 1) as avg_confidence,
            COUNTIF(SAFE_CAST(Idle_Dias AS FLOAT64) > 30) as high_risk_idle,
            COUNTIF(SAFE_CAST(Idle_Dias AS FLOAT64) BETWEEN 15 AND 30) as medium_risk_idle
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {pipeline_where}
        """
        
        # Won deals (com atividades e ciclo corretos)
        won_query = f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as avg_cycle_days,
          ROUND(AVG({activities_expr}), 1) as avg_activities
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        {won_where}
        """
        
        # Lost deals (com evitabilidade e atividades)
        lost_query = f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
                    ROUND(SUM(Net), 2) as net,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as avg_cycle_days,
          ROUND(AVG({activities_expr}), 1) as avg_activities,
          COUNTIF(Evitavel = 'Sim') as evitavel_count,
          ROUND(SAFE_DIVIDE(COUNTIF(Evitavel = 'Sim'), COUNT(*)) * 100, 1) as evitavel_pct
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        {lost_where}
        """
        
        # High confidence deals (>=50%)
        high_confidence_query = f"""
        SELECT 
            COUNT(*) as deals_count,
            ROUND(SUM(Gross), 2) as gross,
            ROUND(SUM(Net), 2) as net,
            ROUND(AVG(SAFE_CAST(Confianca AS FLOAT64)), 1) as avg_confidence
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {pipeline_where} AND SAFE_CAST(Confianca AS FLOAT64) >= 50
        """

        meta_filters = []
        parsed_meta_month_expr = (
            "COALESCE("
            "SAFE.PARSE_DATE('%Y-%m', REGEXP_EXTRACT(REPLACE(COALESCE(Mes_Ano, ''), '/', '-'), r'(20\\d{2}-\\d{1,2})')),"
            "SAFE.PARSE_DATE('%m-%Y', REGEXP_EXTRACT(REPLACE(COALESCE(Mes_Ano, ''), '/', '-'), r'([0-9]{1,2}-20\\d{2})'))"
            ")"
        )

        if year:
            meta_filters.append(
                f"(" 
                f"(SAFE_CAST(REGEXP_EXTRACT(COALESCE(Periodo_Fiscal, ''), r'FY([0-9]{{2}})') AS INT64) + 2000 = {year}) "
                f"OR SAFE_CAST(REGEXP_EXTRACT(COALESCE(Mes_Ano, ''), r'(20[0-9]{{2}})') AS INT64) = {year}"
                f")"
            )

        if quarter:
            meta_filters.append(
                f"(" 
                f"REGEXP_CONTAINS(COALESCE(Periodo_Fiscal, ''), r'-Q{quarter}$') "
                f"OR EXTRACT(QUARTER FROM {parsed_meta_month_expr}) = {quarter}"
                f")"
            )
        elif month:
            meta_filters.append(f"EXTRACT(MONTH FROM {parsed_meta_month_expr}) = {month}")

        meta_where = "WHERE " + " AND ".join(meta_filters) if meta_filters else ""
        meta_query = f"""
        SELECT
            ROUND(SUM(Gross), 2) as gross,
            ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.meta`
        {meta_where}
        """
        
        # Pipeline TOTAL (sem filtros - sempre retorna todos os deals)
        pipeline_total_query = f"""
        SELECT 
            COUNT(*) as deals_count,
            ROUND(SUM(Gross), 2) as gross,
            ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
        """
        
        # Execute queries
        pipeline_result = query_to_dict(pipeline_query)[0]
        pipeline_total_result = query_to_dict(pipeline_total_query)[0]
        won_result = query_to_dict(won_query)[0]
        lost_result = query_to_dict(lost_query)[0]
        high_conf_result = query_to_dict(high_confidence_query)[0]
        meta_result = query_to_dict(meta_query)[0]
        
        # Calculate win rate and cycle efficiency
        total_closed = (won_result['deals_count'] or 0) + (lost_result['deals_count'] or 0)
        win_rate = round((won_result['deals_count'] or 0) / total_closed * 100, 1) if total_closed > 0 else 0
        
        won_cycle = won_result['avg_cycle_days'] or 0
        lost_cycle = lost_result['avg_cycle_days'] or 0
        cycle_efficiency = round((1 - (won_cycle / lost_cycle)) * 100, 1) if lost_cycle > 0 else 0

        pipeline_plus_closed_gross = (pipeline_result['gross'] or 0) + (won_result['gross'] or 0)
        pipeline_plus_closed_net = (pipeline_result['net'] or 0) + (won_result['net'] or 0)
        meta_gross = meta_result['gross'] or 0
        meta_net = meta_result['net'] or 0
        closed_gross = won_result['gross'] or 0
        closed_net = won_result['net'] or 0

        pipeline_closed_attainment_gross = round((pipeline_plus_closed_gross / meta_gross) * 100, 1) if meta_gross > 0 else 0
        pipeline_closed_attainment_net = round((pipeline_plus_closed_net / meta_net) * 100, 1) if meta_net > 0 else 0
        closed_attainment_gross = round((closed_gross / meta_gross) * 100, 1) if meta_gross > 0 else 0
        closed_attainment_net = round((closed_net / meta_net) * 100, 1) if meta_net > 0 else 0
        
        result = {
            "pipeline_total": {
                "deals_count": pipeline_total_result['deals_count'] or 0,
                "gross": pipeline_total_result['gross'] or 0,
                "net": pipeline_total_result['net'] or 0
            },
            "pipeline_filtered": {
                "deals_count": pipeline_result['deals_count'] or 0,
                "gross": pipeline_result['gross'] or 0,
                "net": pipeline_result['net'] or 0,
                "avg_idle_days": pipeline_result['avg_idle_days'] or 0,
                "high_risk_idle": pipeline_result['high_risk_idle'] or 0,
                "medium_risk_idle": pipeline_result['medium_risk_idle'] or 0,
                "avg_meddic": pipeline_result['avg_meddic'] or 0,
                "avg_bant": pipeline_result['avg_bant'] or 0,
                "avg_confidence": pipeline_result['avg_confidence'] or 0
            },
            "closed_won": {
                "deals_count": won_result['deals_count'] or 0,
                "gross": won_result['gross'] or 0,
                "net": won_result['net'] or 0,
                "avg_cycle_days": won_result['avg_cycle_days'] or 0,
                "avg_activities": won_result['avg_activities'] or 0
            },
            "closed_lost": {
                "deals_count": lost_result['deals_count'] or 0,
                "gross": lost_result['gross'] or 0,
                "net": lost_result['net'] or 0,
                "avg_cycle_days": lost_result['avg_cycle_days'] or 0,
                "avg_activities": lost_result['avg_activities'] or 0,
                "evitavel_count": lost_result['evitavel_count'] or 0,
                "evitavel_pct": lost_result['evitavel_pct'] or 0
            },
            "win_rate": win_rate,
            "cycle_efficiency_pct": cycle_efficiency,
            "high_confidence": {
                "deals_count": high_conf_result['deals_count'] or 0,
                "gross": high_conf_result['gross'] or 0,
                "net": high_conf_result['net'] or 0,
                "avg_confidence": high_conf_result['avg_confidence'] or 0
            },
            "meta_analysis": {
                "meta": {
                    "gross": meta_gross,
                    "net": meta_net
                },
                "pipeline_plus_closed": {
                    "gross": pipeline_plus_closed_gross,
                    "net": pipeline_plus_closed_net,
                    "attainment_gross_pct": pipeline_closed_attainment_gross,
                    "attainment_net_pct": pipeline_closed_attainment_net,
                    "gap_gross": round(meta_gross - pipeline_plus_closed_gross, 2),
                    "gap_net": round(meta_net - pipeline_plus_closed_net, 2)
                },
                "closed_vs_meta": {
                    "gross": closed_gross,
                    "net": closed_net,
                    "attainment_gross_pct": closed_attainment_gross,
                    "attainment_net_pct": closed_attainment_net,
                    "gap_gross": round(meta_gross - closed_gross, 2),
                    "gap_net": round(meta_net - closed_net, 2)
                }
            }
        }
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metrics error: {str(e)}")

@app.get("/api/pipeline")
def get_pipeline(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    limit: int = 2000,
    nocache: bool = False
):
    """Retorna deals do pipeline
    
    Filtros disponíveis:
    - year: ano de Data_Prevista
    - quarter: 1-4 (Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez)
    - month: mês específico (1-12)
    - seller: nome do vendedor
    """
    cache_key = build_cache_key(
        "/api/pipeline",
        {
            "year": year,
            "quarter": quarter,
            "month": month,
            "seller": seller,
            "phase": phase,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio_fdm": portfolio_fdm,
            "limit": limit,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        pipeline_filters = []
        if year:
            pipeline_filters.append(f"EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}")
        if month:
            pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {month}")
        if seller:
            # Support multiple sellers
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                pipeline_filters.append(seller_filter)

        append_pipeline_dimension_filters(
            pipeline_filters,
            phase=phase,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio_fdm=portfolio_fdm,
        )
        
        where_clause = f"WHERE {' AND '.join(pipeline_filters)}" if pipeline_filters else ""
        
        query = f"""
        SELECT 
            Oportunidade, Vendedor, Fase_Atual,
            Fiscal_Q,
            Conta, Idle_Dias, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias, Atividades,
            Data_Prevista, SAFE_CAST(Confianca AS FLOAT64) as Confianca,
            Gross, Net, Forecast_SF, Forecast_IA,
            Perfil, Produtos,
            Owner_Preventa, Vertical_IA, Sub_vertical_IA, Sub_sub_vertical_IA,
            Estado_Cidade_Detectado,
            COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
            COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
            COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
            COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
            COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {where_clause}
        ORDER BY Gross DESC
        LIMIT {limit}
        """
        result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.get("/api/filter-options")
def get_filter_options(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    nocache: bool = False
):
    cache_key = build_cache_key(
        "/api/filter-options",
        {
            "year": year,
            "quarter": quarter,
            "month": month,
            "seller": seller,
            "phase": phase,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio_fdm": portfolio_fdm,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        columns = get_table_columns("pipeline")

        facet_column_map = {
            "phase": "Fase_Atual",
            "owner_preventa": "Owner_Preventa",
            "billing_city": "Cidade_de_cobranca",
            "billing_state": "Estado_Provincia_de_cobranca",
            "vertical_ia": "Vertical_IA",
            "sub_vertical_ia": "Sub_vertical_IA",
            "sub_sub_vertical_ia": "Sub_sub_vertical_IA",
            "subsegmento_mercado": "Subsegmento_de_mercado",
            "segmento_consolidado": "Segmento_consolidado",
            "portfolio_fdm": "Portfolio_FDM",
        }

        def distinct_values_with_counts(param_name: str, column_name: str) -> List[Dict[str, Any]]:
            if column_name not in columns:
                return []

            facet_filters = build_pipeline_filters_for_facets(
                year=year,
                quarter=quarter,
                month=month,
                seller=seller,
                phase=phase,
                owner_preventa=owner_preventa,
                billing_city=billing_city,
                billing_state=billing_state,
                vertical_ia=vertical_ia,
                sub_vertical_ia=sub_vertical_ia,
                sub_sub_vertical_ia=sub_sub_vertical_ia,
                subsegmento_mercado=subsegmento_mercado,
                segmento_consolidado=segmento_consolidado,
                portfolio_fdm=portfolio_fdm,
                exclude_param=param_name,
            )

            where_clause = "WHERE " + " AND ".join(facet_filters) if facet_filters else ""
            query = f"""
            SELECT TRIM(CAST({column_name} AS STRING)) as value,
                   COUNT(DISTINCT Oportunidade) as count
            FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
            {where_clause}
              {"AND" if where_clause else "WHERE"} {column_name} IS NOT NULL
              AND TRIM(CAST({column_name} AS STRING)) != ''
            GROUP BY value
            ORDER BY count DESC, value
            LIMIT 500
            """
            return [
                {"value": str(row.get("value") or ""), "count": int(row.get("count") or 0)}
                for row in query_to_dict(query)
                if row.get("value")
            ]

        result = {
            "phase": distinct_values_with_counts("phase", facet_column_map["phase"]),
            "owner_preventa": distinct_values_with_counts("owner_preventa", facet_column_map["owner_preventa"]),
            "billing_city": distinct_values_with_counts("billing_city", facet_column_map["billing_city"]),
            "billing_state": distinct_values_with_counts("billing_state", facet_column_map["billing_state"]),
            "vertical_ia": distinct_values_with_counts("vertical_ia", facet_column_map["vertical_ia"]),
            "sub_vertical_ia": distinct_values_with_counts("sub_vertical_ia", facet_column_map["sub_vertical_ia"]),
            "sub_sub_vertical_ia": distinct_values_with_counts("sub_sub_vertical_ia", facet_column_map["sub_sub_vertical_ia"]),
            "subsegmento_mercado": distinct_values_with_counts("subsegmento_mercado", facet_column_map["subsegmento_mercado"]),
            "segmento_consolidado": distinct_values_with_counts("segmento_consolidado", facet_column_map["segmento_consolidado"]),
            "portfolio_fdm": distinct_values_with_counts("portfolio_fdm", facet_column_map["portfolio_fdm"]),
        }

        if not result["billing_city"] and "Estado_Cidade_Detectado" in columns:
            result["billing_city"] = distinct_values_with_counts("billing_city", "Estado_Cidade_Detectado")
        if not result["billing_state"] and "Estado_Cidade_Detectado" in columns:
            result["billing_state"] = distinct_values_with_counts("billing_state", "Estado_Cidade_Detectado")

        set_cached_response(cache_key, result, ttl_seconds=300)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Filter options error: {str(e)}")

@app.get("/api/closed/won")
def get_closed_won(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    limit: int = 5000,
    nocache: bool = False
):
    """Retorna deals ganhos
    
    Filtros disponíveis:
    - year: ano de Data_Fechamento
    - quarter: 1-4 (Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez)
    - month: mês específico (1-12)
    - seller: nome do vendedor
    """
    cache_key = build_cache_key(
        "/api/closed/won",
        {"year": year, "quarter": quarter, "month": month, "seller": seller, "limit": limit}
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        closed_filters = []
        closed_date_expr = "COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento), SAFE.PARSE_DATE('%d/%m/%Y', Data_Fechamento), SAFE.PARSE_DATE('%Y/%m/%d', Data_Fechamento))"
        fiscal_q_exact = f"FY{str(year)[-2:]}-Q{quarter}" if (year and quarter) else None
        if year:
            if fiscal_q_exact:
                closed_filters.append(f"(EXTRACT(YEAR FROM {closed_date_expr}) = {year} OR Fiscal_Q = '{fiscal_q_exact}')")
            else:
                closed_filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                if fiscal_q_exact:
                    closed_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                else:
                    closed_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
        if month:
            closed_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
        if seller:
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                closed_filters.append(seller_filter)
        
        where_clause = f"WHERE {' AND '.join(closed_filters)}" if closed_filters else ""

        # Try extended query with dimensional fields; fall back to simple query if columns missing
        try:
            query = f"""
            SELECT
                Oportunidade, Vendedor, Status, Conta,
                Fiscal_Q,
                Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
                Gross, Net, Tipo_Resultado, Fatores_Sucesso, Atividades,
                COALESCE(CAST(Vertical_IA AS STRING), '') as Vertical_IA,
                COALESCE(CAST(Sub_vertical_IA AS STRING), '') as Sub_vertical_IA,
                COALESCE(CAST(Sub_sub_vertical_IA AS STRING), '') as Sub_sub_vertical_IA,
                COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
                COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
                COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
                COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
                COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            {where_clause}
            ORDER BY Gross DESC
            LIMIT {limit}
            """
            result = query_to_dict(query)
        except Exception:
            query = f"""
            SELECT
                Oportunidade, Vendedor, Status, Conta,
                Fiscal_Q,
                Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
                Gross, Net, Tipo_Resultado, Fatores_Sucesso, Atividades
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            {where_clause}
            ORDER BY Gross DESC
            LIMIT {limit}
            """
            result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Closed won error: {str(e)}")

@app.get("/api/closed/lost")
def get_closed_lost(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    limit: int = 5000,
    nocache: bool = False
):
    """Retorna deals perdidos
    
    Filtros disponíveis:
    - year: ano de Data_Fechamento
    - quarter: 1-4 (Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez)
    - month: mês específico (1-12)
    - seller: nome do vendedor
    """
    cache_key = build_cache_key(
        "/api/closed/lost",
        {"year": year, "quarter": quarter, "month": month, "seller": seller, "limit": limit}
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        closed_filters = []
        closed_date_expr = "COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento), SAFE.PARSE_DATE('%d/%m/%Y', Data_Fechamento), SAFE.PARSE_DATE('%Y/%m/%d', Data_Fechamento))"
        fiscal_q_exact = f"FY{str(year)[-2:]}-Q{quarter}" if (year and quarter) else None
        if year:
            if fiscal_q_exact:
                closed_filters.append(f"(EXTRACT(YEAR FROM {closed_date_expr}) = {year} OR Fiscal_Q = '{fiscal_q_exact}')")
            else:
                closed_filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                if fiscal_q_exact:
                    closed_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                else:
                    closed_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
        if month:
            closed_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
        if seller:
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                closed_filters.append(seller_filter)
        
        where_clause = f"WHERE {' AND '.join(closed_filters)}" if closed_filters else ""

        # Try extended query with dimensional fields; fall back to simple query if columns missing
        try:
            query = f"""
            SELECT
                Oportunidade, Vendedor, Status, Conta,
                Fiscal_Q,
                Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
                Gross, Net, Tipo_Resultado, Causa_Raiz, Atividades,
                COALESCE(CAST(Vertical_IA AS STRING), '') as Vertical_IA,
                COALESCE(CAST(Sub_vertical_IA AS STRING), '') as Sub_vertical_IA,
                COALESCE(CAST(Sub_sub_vertical_IA AS STRING), '') as Sub_sub_vertical_IA,
                COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
                COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
                COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
                COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
                COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
            {where_clause}
            ORDER BY Gross DESC
            LIMIT {limit}
            """
            result = query_to_dict(query)
        except Exception:
            query = f"""
            SELECT
                Oportunidade, Vendedor, Status, Conta,
                Fiscal_Q,
                Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
                Gross, Net, Tipo_Resultado, Causa_Raiz, Atividades
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
            {where_clause}
            ORDER BY Gross DESC
            LIMIT {limit}
            """
            result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Closed lost error: {str(e)}")

@app.get("/api/actions")
def get_actions(
    urgencia: Optional[str] = None, 
    limit: int = 50,
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    seller: Optional[str] = None,
    nocache: bool = False
):
    """Retorna ações sugeridas (baseado em pipeline)
    
    Parâmetros opcionais:
    - urgencia: ALTA (confiança < 30), MÉDIA (30-50), ou todas se None
    - year: filtro por ano fiscal
    - quarter: filtro por quarter (1-4)
    - seller: nome do vendedor (suporta múltiplos separados por vírgula)
    """
    cache_key = build_cache_key(
        "/api/actions",
        {"urgencia": urgencia, "limit": limit, "year": year, "quarter": quarter, "seller": seller}
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        filters = []
        
        # Filtro de urgência
        if urgencia == "ALTA":
            filters.append("SAFE_CAST(Confianca AS FLOAT64) < 30")
        
        # Filtro de vendedor
        if seller:
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                filters.append(seller_filter)
        
        # Filtro de período (year + quarter)
        if year and quarter:
            fiscal_q = f"FY{str(year)[2:]}-Q{quarter}"
            filters.append(f"Fiscal_Q = '{fiscal_q}'")
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
        SELECT 
            Oportunidade, Vendedor, Fase_Atual, Fiscal_Q,
            Data_Prevista, SAFE_CAST(Confianca AS FLOAT64) as Confianca,
            Gross, Net,
            CASE 
                WHEN SAFE_CAST(Confianca AS FLOAT64) < 30 THEN 'ALTA'
                WHEN SAFE_CAST(Confianca AS FLOAT64) < 50 THEN 'MÉDIA'
                ELSE 'BAIXA'
            END as urgencia_nivel
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {where_clause}
        ORDER BY SAFE_CAST(Confianca AS FLOAT64) ASC, Gross DESC
        LIMIT {limit}
        """
        result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Actions error: {str(e)}")

@app.get("/api/sales-specialist")
def get_sales_specialist(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    seller: Optional[str] = None,
    nocache: bool = False
):
    """Retorna dados curados pelo Sales Specialist com filtros
    
    Filtragem por período:
    - year: filtra por ano de closed_date
    - quarter: 1-4 (Q1=Jan-Mar, Q2=Abr-Jun, Q3=Jul-Set, Q4=Out-Dez) calculado sobre closed_date
    - seller: nome do vendedor
    """
    cache_key = build_cache_key(
        "/api/sales-specialist",
        {"year": year, "quarter": quarter, "seller": seller}
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        filters = []
        
        # Filtro de ano usando closed_date
        if year:
            filters.append(f"EXTRACT(YEAR FROM closed_date) = {year}")
        
        # Filtro de quarter usando closed_date (Calendar Quarters: Q1=Jan-Mar, etc)
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                filters.append(f"EXTRACT(MONTH FROM closed_date) BETWEEN {start_month} AND {end_month}")
        
        # Filtro de vendedor
        if seller and seller != 'all':
            seller_filter = build_seller_filter(seller, "vendedor")
            if seller_filter:
                filters.append(seller_filter)
        
        where_clause = " WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
        SELECT 
            opportunity_name,
            vendedor,
            fiscal_quarter,
            opportunity_status,
            forecast_status,
            booking_total_gross,
            booking_total_net,
            gtm_2026,
            closed_date
        FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
        {where_clause}
        ORDER BY booking_total_gross DESC
        """
        result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sales Specialist error: {str(e)}")

@app.get("/api/priorities")
def get_priorities(
    limit: int = 100,
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    nocache: bool = False
):
    """Retorna deals prioritários (high confidence + high value) com suporte a filtros."""
    cache_key = build_cache_key("/api/priorities", {
        "limit": limit, "year": year, "quarter": quarter, "month": month,
        "seller": seller, "phase": phase, "owner_preventa": owner_preventa,
        "vertical_ia": vertical_ia, "sub_vertical_ia": sub_vertical_ia,
        "segmento_consolidado": segmento_consolidado, "portfolio_fdm": portfolio_fdm
    })
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        filters = ["SAFE_CAST(Confianca AS FLOAT64) >= 50"]
        if year:
            if quarter:
                fiscal_q = f"FY{str(year)[2:]}-Q{quarter}"
                filters.append(f"(EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year} OR Fiscal_Q = '{fiscal_q}')")
            else:
                filters.append(f"EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year}")
        if seller:
            sf = build_seller_filter(seller)
            if sf:
                filters.append(sf)
        if phase:
            pf = build_in_filter("Fase_Atual", phase)
            if pf:
                filters.append(pf)
        if owner_preventa:
            opf = build_in_filter("Owner_Preventa", owner_preventa)
            if opf:
                filters.append(opf)
        if vertical_ia:
            vf = build_in_filter("Vertical_IA", vertical_ia)
            if vf:
                filters.append(vf)
        if portfolio_fdm:
            pff = build_in_filter("CAST(Portfolio_FDM AS STRING)", portfolio_fdm)
            if pff:
                filters.append(pff)
        where_clause = "WHERE " + " AND ".join(filters)
        query = f"""
        SELECT 
            Oportunidade, Vendedor, Fase_Atual, Fiscal_Q,
            Data_Prevista, SAFE_CAST(Confianca AS FLOAT64) as Confianca,
            Gross, Net, Forecast_SF,
            (SAFE_CAST(Confianca AS FLOAT64) * Gross / 100) as prioridade_score
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {where_clause}
        ORDER BY prioridade_score DESC
        LIMIT {limit}
        """
        result = query_to_dict(query)
        set_cached_response(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Priorities error: {str(e)}")

@app.get("/api/analyze-patterns")
def analyze_patterns(year: Optional[int] = None, quarter: Optional[int] = None, month: Optional[int] = None, seller: Optional[str] = None):
    """
    Análise avançada de padrões de vitória e perda usando Gemini API
    """
    try:
        if not GEMINI_API_KEY:
            return {
                "win_insights": "Análise temporariamente indisponível.",
                "loss_insights": "Análise temporariamente indisponível.",
                "recommendations": [
                    "Focar em qualificação MEDDIC rigorosa",
                    "Engajar champions cedo no ciclo",
                    "Criar cadência de follow-up estruturada",
                ],
                "status": "disabled",
            }

        client = bigquery.Client(project=PROJECT_ID)
        
        # Filtros
        filters = []
        if year:
            filters.append(f"EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),
                2: (4, 6),
                3: (7, 9),
                4: (10, 12)
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                filters.append(
                    f"EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN {start_month} AND {end_month}"
                )
        elif month:
            filters.append(f"EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = {month}")
        if seller:
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                filters.append(seller_filter)
        
        where_clause = " AND " + " AND ".join(filters) if filters else ""
        
        # Buscar deals ganhos
        won_query = f"""
        SELECT 
            Oportunidade, Vendedor, Tipo_Resultado, Fatores_Sucesso,
            SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE Fatores_Sucesso IS NOT NULL{where_clause}
        LIMIT 100
        """
        won_deals = list(client.query(won_query).result())
        
        # Buscar deals perdidos
        lost_query = f"""
        SELECT 
            Oportunidade, Vendedor, Tipo_Resultado, Causa_Raiz,
            SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        WHERE Causa_Raiz IS NOT NULL{where_clause}
        LIMIT 100
        """
        lost_deals = list(client.query(lost_query).result())
        
        # Preparar dados para análise
        won_summary = []
        for deal in won_deals[:20]:  # Limitar para evitar context overflow
            won_summary.append({
                "oportunidade": deal.Oportunidade or "N/A",
                "tipo": deal.Tipo_Resultado or "N/A",
                "fatores": deal.Fatores_Sucesso[:200] if deal.Fatores_Sucesso else "N/A",
                "ciclo_dias": deal.Ciclo_dias or 0
            })
        
        lost_summary = []
        for deal in lost_deals[:20]:  # Limitar para evitar context overflow
            lost_summary.append({
                "oportunidade": deal.Oportunidade or "N/A",
                "tipo": deal.Tipo_Resultado or "N/A",
                "causa": deal.Causa_Raiz[:200] if deal.Causa_Raiz else "N/A",
                "ciclo_dias": deal.Ciclo_dias or 0
            })
        
        # Preparar prompt para Gemini
        prompt = f"""
Você é um especialista em análise de vendas B2B. Analise os dados de vendas abaixo e forneça insights acionáveis.

**DADOS DE VITÓRIAS ({len(won_deals)} deals):**
{format_deals_for_gemini(won_summary[:10])}

**DADOS DE PERDAS ({len(lost_deals)} deals):**
{format_deals_for_gemini(lost_summary[:10])}

**INSTRUÇÕES:**
1. Identifique os 3-5 fatores mais importantes que levam ao sucesso (baseado em Fatores_Sucesso)
2. Identifique as 3-5 causas principais de perda (baseado em Causa_Raiz)
3. Forneça 6-8 recomendações práticas e específicas para melhorar a taxa de conversão
4. Em cada seção (vitória e perda), inclua 2 exemplos curtos dentro do texto (com Oportunidade, Tipo e Ciclo)
5. Não cite valores financeiros nem nomes de vendedores/contas

**FORMATO DE RESPOSTA (JSON):**
{{
    "win_insights": "Parágrafo conciso com os principais padrões de vitória (máx 150 palavras), incluindo 2 exemplos no próprio texto",
    "loss_insights": "Parágrafo conciso com os principais padrões de perda (máx 150 palavras), incluindo 2 exemplos no próprio texto",
  "recommendations": [
    "Recomendação 1 (1 frase curta e acionável)",
    "Recomendação 2",
    "Recomendação 3",
        "Recomendação 4",
        "Recomendação 5",
        "Recomendação 6"
  ]
}}

Responda APENAS com o JSON, sem markdown ou texto adicional.
"""
        
        # Chamar Gemini API (usando modelo especificado pelo usuário)
        model = genai.GenerativeModel('gemini-2.5-flash-preview-09-2025')  # type: ignore[attr-defined]
        response = model.generate_content(prompt)
        
        # Parse response
        import json
        try:
            # Remove markdown code blocks se existirem
            response_text = response.text.strip()
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
            response_text = response_text.strip()
            
            analysis = json.loads(response_text)
            analysis["status"] = "gemini"
            analysis["deals_analyzed"] = {"won": len(won_deals), "lost": len(lost_deals)}
            return analysis
        except json.JSONDecodeError:
            # Fallback: retornar texto bruto estruturado
            return {
                "win_insights": extract_section(response.text, "win"),
                "loss_insights": extract_section(response.text, "loss"),
                "recommendations": extract_bullets(response.text),
                "status": "gemini_text",
                "deals_analyzed": {"won": len(won_deals), "lost": len(lost_deals)}
            }
    except Exception as e:
        # Fallback em caso de erro
        return {
            "win_insights": "Análise temporariamente indisponível.",
            "loss_insights": "Análise temporariamente indisponível.",
            "recommendations": [
                "Focar em qualificação MEDDIC rigorosa",
                "Engajar champions cedo no ciclo",
                "Criar cadência de follow-up estruturada"
            ],
            "status": "error",
        }

def format_deals_for_gemini(deals_list: List[Dict]) -> str:
    """Formata lista de deals para o prompt do Gemini"""
    lines = []
    for i, deal in enumerate(deals_list, 1):
        oportunidade = deal.get('oportunidade', 'N/A')
        tipo = deal.get('tipo', 'N/A')
        fatores = deal.get('fatores', deal.get('causa', 'N/A'))
        ciclo = deal.get('ciclo_dias', 0)
        lines.append(f"{i}. Oportunidade: {oportunidade} | Tipo: {tipo} | Ciclo: {ciclo} dias")
        lines.append(f"   Detalhes: {fatores}")
    return "\n".join(lines)

def extract_section(text: str, keyword: str) -> str:
    """Extrai seção específica do texto"""
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if keyword.lower() in line.lower():
            # Pega as próximas 3-5 linhas
            return ' '.join(lines[i:i+5]).strip()[:300]
    return text[:300]  # Fallback: primeiros 300 caracteres

def extract_bullets(text: str) -> List[str]:
    """Extrai bullets/recomendações do texto"""
    recommendations = []
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith(('-', '•', '*', '1.', '2.', '3.', '4.')):
            clean_line = line.lstrip('-•*123456789. ').strip()
            if len(clean_line) > 10:
                recommendations.append(clean_line)
    return recommendations[:8] if recommendations else [
        "Focar em qualificação MEDDIC rigorosa",
        "Engajar champions cedo no ciclo",
        "Criar cadência de follow-up estruturada",
        "Mapear critérios mínimos de qualificação por tipo de deal",
        "Criar gatilhos de abandono com base em idle"
    ]

# =============================================
# DASHBOARD ENDPOINT
# =============================================

@app.get("/api/dashboard")
def get_dashboard(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    nocache: bool = False
):
    """
    Dashboard completo com filtros dinâmicos
    - year: 2024, 2025, 2026... (optional)
    - quarter: 1-4 (Q1=jan-mar, Q2=abr-jun, Q3=jul-set, Q4=out-dez) (optional)
    - month: 1-12 (optional) - se quarter estiver definido, month será ignorado
    - seller: nome do vendedor (optional)
    """
    cache_key = build_cache_key(
        "/api/dashboard",
        {"year": year, "quarter": quarter, "month": month, "seller": seller}
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        # Build filter clauses
        pipeline_filters = []
        closed_filters = []
        specialist_filters = []
        
        if year:
            pipeline_filters.append(f"EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {year}")
            closed_filters.append(f"EXTRACT(YEAR FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = {year}")
            specialist_filters.append(f"EXTRACT(YEAR FROM closed_date) = {year}")
        
        # Quarter tem prioridade sobre month
        if quarter:
            # Converter quarter para range de meses: Q1=1-3, Q2=4-6, Q3=7-9, Q4=10-12
            quarter_months = {
                1: (1, 3),   # Q1: Jan-Mar
                2: (4, 6),   # Q2: Abr-Jun
                3: (7, 9),   # Q3: Jul-Set
                4: (10, 12)  # Q4: Out-Dez
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}")
                closed_filters.append(f"EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) BETWEEN {start_month} AND {end_month}")
                specialist_filters.append(f"EXTRACT(MONTH FROM closed_date) BETWEEN {start_month} AND {end_month}")
        elif month:
            # Se quarter não definido, usar month
            pipeline_filters.append(f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = {month}")
            closed_filters.append(f"EXTRACT(MONTH FROM COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento))) = {month}")
            specialist_filters.append(f"EXTRACT(MONTH FROM closed_date) = {month}")
        
        if seller:
            seller_filter_pipeline = build_seller_filter(seller, "Vendedor")
            seller_filter_closed = build_seller_filter(seller, "Vendedor")
            seller_filter_specialist = build_seller_filter(seller, "vendedor")
            
            if seller_filter_pipeline:
                pipeline_filters.append(seller_filter_pipeline)
            if seller_filter_closed:
                closed_filters.append(seller_filter_closed)
            if seller_filter_specialist:
                # Need to handle LOWER() case for specialist
                sellers = [s.strip() for s in seller.split(',')]
                if len(sellers) == 1:
                    specialist_filters.append(f"LOWER(vendedor) = LOWER('{sellers[0]}')")
                else:
                    sellers_quoted = "', '".join(sellers)
                    specialist_filters.append(f"LOWER(vendedor) IN ({', '.join(['LOWER(' + chr(39) + s + chr(39) + ')' for s in sellers])})")
        
        pipeline_where = "WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost') AND Data_Prevista IS NOT NULL"
        if pipeline_filters:
            pipeline_where += " AND " + " AND ".join(pipeline_filters)
        
        closed_where = "WHERE Data_Fechamento IS NOT NULL"
        if closed_filters:
            closed_where += " AND " + " AND ".join(closed_filters)
        
        specialist_where = "WHERE closed_date IS NOT NULL"
        if specialist_filters:
            specialist_where += " AND " + " AND ".join(specialist_filters)
        
        # ========== PIPELINE METRICS ==========
        
        # Total Pipeline (sem filtros)
        pipeline_all = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
        """)[0]
        
        # Pipeline 2026
        pipeline_2026 = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
          AND EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = 2026
        """)[0]
        
        # Pipeline Filtrado
        pipeline_filtered_result = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        {pipeline_where}
        """)
        pipeline_filtered = pipeline_filtered_result[0] if pipeline_filtered_result else {
            'deals_count': 0, 'gross': 0, 'net': 0
        }
        
        # Pipeline por Mês
        pipeline_by_month = query_to_dict(f"""
        SELECT 
          EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) as year,
          EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) as month,
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost') AND Data_Prevista IS NOT NULL
        GROUP BY year, month
        ORDER BY year, month
        """)
        
        # Pipeline por Forecast Category
        pipeline_by_forecast = query_to_dict(f"""
        SELECT 
          Forecast_SF as category,
          COUNT(*) as count,
          ROUND(SUM(Gross), 2) as total_gross,
          ROUND(SUM(Net), 2) as total_net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost') AND Forecast_SF IS NOT NULL
        GROUP BY Forecast_SF
        ORDER BY CASE Forecast_SF
          WHEN 'COMMIT' THEN 1
          WHEN 'UPSIDE' THEN 2
          WHEN 'PIPELINE' THEN 3
          ELSE 4
        END
        """)
        
        # Pipeline por Vendedor
        pipeline_by_seller = query_to_dict(f"""
        SELECT 
          Vendedor as seller,
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net,
          ROUND(AVG(SAFE_CAST(Confianca AS FLOAT64)), 1) as avg_confidence
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost') AND Vendedor IS NOT NULL
        GROUP BY Vendedor
        ORDER BY gross DESC
        """)
        
        # High Confidence Deals
        high_confidence_result = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net,
          ROUND(AVG(SAFE_CAST(Confianca AS FLOAT64)), 1) as avg_confidence
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost') 
          AND SAFE_CAST(Confianca AS FLOAT64) >= 50
        """)
        high_confidence = high_confidence_result[0] if high_confidence_result else {
            'deals_count': 0, 'gross': 0, 'net': 0, 'avg_confidence': 0
        }
        
        # ========== SALES SPECIALIST ==========
        
        sales_specialist_total_result = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(booking_total_gross), 2) as gross,
          ROUND(SUM(booking_total_net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
        {specialist_where}
        """)
        sales_specialist_total = sales_specialist_total_result[0] if sales_specialist_total_result else {
            'deals_count': 0, 'gross': 0, 'net': 0
        }
        
        sales_specialist_data = query_to_dict(f"""
        SELECT 
          EXTRACT(YEAR FROM closed_date) as year,
          EXTRACT(MONTH FROM closed_date) as month,
          forecast_status as category,
          COUNT(*) as deals_count,
          ROUND(SUM(booking_total_gross), 2) as gross,
          ROUND(SUM(booking_total_net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
        {specialist_where}
        GROUP BY year, month, forecast_status
        ORDER BY year, month
        """)
        
        # ========== CLOSED DEALS ==========
        
        closed_won_result = query_to_dict(f"""
        SELECT 
          COUNT(*)  as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as avg_cycle_days
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        {closed_where}
        """)
        closed_won_summary = closed_won_result[0] if closed_won_result else {
            'deals_count': 0, 'gross': 0, 'net': 0, 'avg_cycle_days': 0
        }
        
        closed_lost_result = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as avg_cycle_days
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        {closed_where}
        """)
        closed_lost_summary = closed_lost_result[0] if closed_lost_result else {
            'deals_count': 0, 'gross': 0, 'avg_cycle_days': 0
        }
        
        total_closed = closed_won_summary["deals_count"] + closed_lost_summary["deals_count"]
        win_rate = round((closed_won_summary["deals_count"] / total_closed * 100), 1) if total_closed > 0 else 0
        
        # Win Rate por Vendedor
        win_rate_by_seller = query_to_dict(f"""
        WITH won AS (
          SELECT Vendedor, COUNT(*) as won_count
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
          {closed_where}
          GROUP BY Vendedor
        ),
        lost AS (
          SELECT Vendedor, COUNT(*) as lost_count
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
          {closed_where}
          GROUP BY Vendedor
        )
        SELECT 
          COALESCE(w.Vendedor, l.Vendedor) as seller,
          COALESCE(w.won_count, 0) as won,
          COALESCE(l.lost_count, 0) as lost,
          ROUND(COALESCE(w.won_count, 0) / NULLIF(COALESCE(w.won_count, 0) + COALESCE(l.lost_count, 0), 0) * 100, 1) as win_rate
        FROM won w
        FULL OUTER JOIN lost l ON w.Vendedor = l.Vendedor
        ORDER BY win_rate DESC
        """)
        
        # Loss Reasons
        loss_reasons = query_to_dict(f"""
        SELECT 
          Causa_Raiz as reason,
          COUNT(*) as count,
          ROUND(SUM(Gross), 2) as total_gross
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        {closed_where} AND Causa_Raiz IS NOT NULL
        GROUP BY Causa_Raiz
        ORDER BY count DESC
        LIMIT 10
        """)
        
        # ========== WORD CLOUDS ==========
        
        win_types = query_to_dict(f"""
        SELECT TRIM(word) as text, COUNT(*) as value
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`,
        UNNEST(SPLIT(Tipo_Resultado, ',')) as word
        {closed_where} AND Tipo_Resultado IS NOT NULL AND TRIM(word) != ''
        GROUP BY text ORDER BY value DESC LIMIT 20
        """)
        
        win_labels = query_to_dict(f"""
        SELECT TRIM(word) as text, COUNT(*) as value
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`,
        UNNEST(SPLIT(Fatores_Sucesso, ',')) as word
        {closed_where} AND Fatores_Sucesso IS NOT NULL AND TRIM(word) != ''
        GROUP BY text ORDER BY value DESC LIMIT 20
        """)
        
        loss_types = query_to_dict(f"""
        SELECT TRIM(word) as text, COUNT(*) as value
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`,
        UNNEST(SPLIT(Tipo_Resultado, ',')) as word
        {closed_where} AND Tipo_Resultado IS NOT NULL AND TRIM(word) != ''
        GROUP BY text ORDER BY value DESC LIMIT 20
        """)
        
        loss_labels = query_to_dict(f"""
        SELECT TRIM(word) as text, COUNT(*) as value
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`,
        UNNEST(SPLIT(Causa_Raiz, ',')) as word
        {closed_where} AND Causa_Raiz IS NOT NULL AND TRIM(word) != ''
        GROUP BY text ORDER BY value DESC LIMIT 20
        """)
        
        # ========== AI ANALYSIS ==========
        
        top_seller = pipeline_by_seller[0]['seller'] if pipeline_by_seller else 'N/A'
        top_seller_value = pipeline_by_seller[0]['gross'] if pipeline_by_seller else 0
        
        period_label = f"{year}" if year else "Todos os períodos"
        if month:
            month_names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
            period_label += f" - {month_names[month-1]}"
        
        # Proteções contra None
        pipeline_all_gross = pipeline_all.get('gross') or 0
        pipeline_all_deals = pipeline_all.get('deals_count') or 0
        pipeline_filtered_gross = pipeline_filtered.get('gross') or 0
        pipeline_filtered_deals = pipeline_filtered.get('deals_count') or 0
        won_deals = closed_won_summary.get('deals_count') or 0
        won_gross = closed_won_summary.get('gross') or 0
        cycle_won = closed_won_summary.get('avg_cycle_days') or 0
        cycle_lost = closed_lost_summary.get('avg_cycle_days') or 0
        high_conf_deals = high_confidence.get('deals_count') or 0
        high_conf_gross = high_confidence.get('gross') or 0
        
        executive_analysis = f"""📊 **RESUMO EXECUTIVO - {period_label}**

Pipeline Total: ${pipeline_all_gross:,.0f} ({pipeline_all_deals} deals)
Pipeline Filtrado: ${pipeline_filtered_gross:,.0f} ({pipeline_filtered_deals} deals)
Taxa de Conversão: {win_rate}% ({won_deals} ganhos / {total_closed} fechados)

🎯 **DESTAQUES:**
- Maior vendedor: {top_seller} (${top_seller_value:,.0f})
- Ciclo médio Won: {cycle_won:.0f} dias
- Ciclo médio Lost: {cycle_lost:.0f} dias
- High Confidence (≥50%): {high_conf_deals} deals (${high_conf_gross:,.0f})
        """.strip()
        
        top_win_factor = win_labels[0]['text'] if win_labels else "N/A"
        top_win_count = win_labels[0]['value'] if win_labels else 0
        
        wins_insights = f"""🏆 **FATORES DE SUCESSO**

Principal fator: **{top_win_factor}** ({top_win_count} menções)
Deals ganhos: {won_deals} (${won_gross:,.0f})

💡 **RECOMENDAÇÃO:** Replicar estratégias de "{top_win_factor}".
        """.strip()
        
        top_loss_reason = loss_reasons[0]['reason'] if loss_reasons else "N/A"
        lost_deals = closed_lost_summary.get('deals_count') or 0
        lost_gross = closed_lost_summary.get('gross') or 0
        
        loss_insights = f"""⚠️ **ANÁLISE DE PERDAS**

Principal causa: **{top_loss_reason}**
Deals perdidos: {lost_deals} (${lost_gross:,.0f})

🎯 **AÇÃO:** Criar playbook para mitigar "{top_loss_reason}".
        """.strip()
        
        # ========== RESPONSE ==========
        
        result = {
            "timestamp": datetime.utcnow().isoformat(),
            "filters": {"year": year, "month": month, "seller": seller},
            "cloudAnalysis": {
                "pipeline_analysis": {
                    "executive": {
                        "pipeline_all": pipeline_all,
                        "pipeline_2026": pipeline_2026,
                        "pipeline_filtered": pipeline_filtered,
                        "pipeline_by_month": pipeline_by_month,
                        "high_confidence": high_confidence
                    },
                    "sellers": pipeline_by_seller
                },
                "closed_analysis": {
                    "closed_quarter": {
                        "won": closed_won_summary,
                        "lost": closed_lost_summary,
                        "win_rate": win_rate,
                        "total_closed": total_closed
                    },
                    "forecast_specialist": {
                        "total": sales_specialist_total,
                        "by_period": sales_specialist_data
                    },
                    "win_rate_by_seller": {s['seller']: s for s in win_rate_by_seller},
                    "loss_reasons": loss_reasons,
                    "avg_cycle_won_days": closed_won_summary['avg_cycle_days'],
                    "avg_cycle_lost_days": closed_lost_summary['avg_cycle_days']
                },
                "aggregations": {
                    "by_forecast_category": pipeline_by_forecast,
                    "by_month": pipeline_by_month
                }
            },
            "word_clouds": {
                "winTypes": win_types,
                "winLabels": win_labels,
                "lossTypes": loss_types,
                "lossLabels": loss_labels
            },
            "ai_analysis": {
                "executive": executive_analysis,
                "winsInsights": wins_insights,
                "lossInsights": loss_insights
            }
        }
        set_cached_response(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")

# =============================================
# RUN
# =============================================

@app.get("/{filename:path}")
async def serve_static_files(filename: str):
    """Catch-all route to serve static files from public directory"""
    # Prevent serving directories or going up the tree
    if ".." in filename or filename.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Skip API routes
    if filename.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    file_path = Path(__file__).parent / "public" / filename
    if file_path.exists() and file_path.is_file():
        # Determine media type based on extension
        media_types = {
            ".css": "text/css",
            ".js": "application/javascript",
            ".html": "text/html",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon"
        }
        suffix = file_path.suffix.lower()
        media_type = media_types.get(suffix, "application/octet-stream")
        return FileResponse(file_path, media_type=media_type)
    else:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
# rebuild Fri Feb  6 17:39:54 UTC 2026
