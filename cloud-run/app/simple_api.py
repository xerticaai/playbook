"""
Sales Intelligence API - FastAPI com Filtros Dinâmicos por Data
Filtros: year (2024-2030), month (1-12), seller
"""
from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.cloud import bigquery
from google.cloud import firestore as _fs_module
from typing import List, Dict, Any, Optional
import uuid
import os
import re
from datetime import datetime, date, timedelta
import time
from pathlib import Path
import json
import urllib.request
import urllib.error
import urllib.parse
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
        "https://x-sales.web.app",
        "https://x-sales.firebaseapp.com",
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
MART_L10_DATASET = "mart_l10"  # dataset curado — views B1–B5

STAGNANT_ALERT_WEBHOOK_URL = os.getenv(
    "STAGNANT_ALERT_WEBHOOK_URL",
    "https://script.google.com/a/macros/xertica.com/s/AKfycbyUrKHd-DZMfNI0_1dYl47S7MBAZuv_jnlm12_TD5vxA16WVUlOHLauQMmRtpJsLCF9/exec",
).strip()
STAGNANT_ALERT_SECRET = os.getenv("STAGNANT_ALERT_SECRET", "").strip()
STAGNANT_ALERT_LOG_MAX = int(os.getenv("STAGNANT_ALERT_LOG_MAX", "300"))
STAGNANT_ALERT_LOGS: List[Dict[str, Any]] = []

# Singleton BQ client (reused across requests within the same Cloud Run instance)
_BQ_CLIENT: Optional[bigquery.Client] = None

def get_bq_client() -> bigquery.Client:
    global _BQ_CLIENT
    if _BQ_CLIENT is None:
        _BQ_CLIENT = bigquery.Client(project=PROJECT_ID)
    return _BQ_CLIENT

# Singleton Firestore client
_FS_CLIENT = None

def get_fs_client():
    global _FS_CLIENT
    if _FS_CLIENT is None:
        _FS_CLIENT = _fs_module.Client(project=PROJECT_ID)
    return _FS_CLIENT

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


def _append_stagnant_alert_log(entry: Dict[str, Any]) -> None:
    STAGNANT_ALERT_LOGS.append(entry)
    if len(STAGNANT_ALERT_LOGS) > STAGNANT_ALERT_LOG_MAX:
        overflow = len(STAGNANT_ALERT_LOGS) - STAGNANT_ALERT_LOG_MAX
        del STAGNANT_ALERT_LOGS[:overflow]


def _extract_stagnant_alert_meta(payload: Dict[str, Any]) -> Dict[str, Any]:
    deal = payload.get("deal") or {}
    root = payload or {}

    def pick(*values: Any) -> str:
        for value in values:
            text = str(value or "").strip()
            if text:
                return text
        return ""

    return {
        "source": pick(payload.get("source"), "frontend"),
        "actor": pick(payload.get("actor"), "frontend"),
        "opportunity": pick(
            deal.get("oportunidade"), deal.get("name"), deal.get("Oportunidade"),
            root.get("oportunidade"), root.get("name"), root.get("Oportunidade")
        ),
        "seller": pick(
            deal.get("vendedor"), deal.get("seller"), deal.get("owner"), deal.get("Vendedor"),
            root.get("vendedor"), root.get("seller"), root.get("owner"), root.get("Vendedor")
        ),
        "account": pick(
            deal.get("conta"), deal.get("account"), deal.get("Conta"),
            root.get("conta"), root.get("account"), root.get("Conta")
        ),
    }


def _alt_apps_script_webhook_url(url: str) -> Optional[str]:
    raw = str(url or "").strip()
    if not raw:
        return None
    parsed = urllib.parse.urlparse(raw)
    host = (parsed.netloc or "").lower()
    path = parsed.path or ""
    if host != "script.google.com":
        return None

    # Convert /a/macros/<domain>/s/<SCRIPT_ID>/exec to /macros/s/<SCRIPT_ID>/exec
    match = re.search(r"/a/macros/[^/]+/s/([^/]+)/exec", path)
    if not match:
        return None
    script_id = match.group(1)
    return f"https://script.google.com/macros/s/{script_id}/exec"


def _post_json(url: str, payload: Dict[str, Any], timeout_sec: int = 20) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            data = {"raw": raw}
        return {
            "status_code": int(getattr(resp, "status", 200) or 200),
            "data": data,
            "raw": raw,
        }


@app.post("/api/stagnant-alert/send")
async def send_stagnant_alert_proxy(request: Request, payload: Dict[str, Any] = Body(default={})):  # type: ignore[valid-type]
    if not STAGNANT_ALERT_WEBHOOK_URL:
        raise HTTPException(status_code=500, detail="STAGNANT_ALERT_WEBHOOK_URL não configurada")

    forwarded_payload = dict(payload or {})
    if STAGNANT_ALERT_SECRET and not forwarded_payload.get("secret"):
        forwarded_payload["secret"] = STAGNANT_ALERT_SECRET

    now_iso = datetime.utcnow().isoformat() + "Z"
    request_email = _extract_request_email(request) or ""
    meta = _extract_stagnant_alert_meta(forwarded_payload)
    if request_email and not meta.get("actor"):
        meta["actor"] = request_email

    primary_url = STAGNANT_ALERT_WEBHOOK_URL
    fallback_url = _alt_apps_script_webhook_url(primary_url)

    def _build_success_log(response: Dict[str, Any], appscript_data: Any, used_url: str, tried_fallback: bool) -> Dict[str, Any]:
        return {
            "timestamp": now_iso,
            "webhook_status": response.get("status_code", 0),
            "success": bool(appscript_data.get("success", False)) if isinstance(appscript_data, dict) else False,
            "error": appscript_data.get("error") if isinstance(appscript_data, dict) else None,
            "webhook_url": used_url,
            "fallback_attempted": tried_fallback,
            **meta,
        }

    def _build_error_log(status_code: int, error_text: str, raw_text: str, used_url: str, tried_fallback: bool) -> Dict[str, Any]:
        return {
            "timestamp": now_iso,
            "webhook_status": int(status_code or 0),
            "success": False,
            "error": error_text,
            "raw": raw_text,
            "webhook_url": used_url,
            "fallback_attempted": tried_fallback,
            **meta,
        }

    try:
        response = _post_json(primary_url, forwarded_payload)
        appscript_data = response.get("data") or {}
        log_entry = _build_success_log(response, appscript_data, primary_url, False)
        _append_stagnant_alert_log(log_entry)

        return {
            "success": bool(log_entry.get("success")),
            "message": "alert_sent" if bool(log_entry.get("success")) else "alert_failed",
            "appscript": appscript_data,
            "log": log_entry,
        }
    except urllib.error.HTTPError as http_err:
        err_body = ""
        http_code = int(getattr(http_err, "code", 0) or 0)
        try:
            err_body = http_err.read().decode("utf-8", errors="replace")
        except Exception:
            err_body = ""

        if fallback_url and fallback_url != primary_url and http_code in {401, 403, 404}:
            try:
                fallback_response = _post_json(fallback_url, forwarded_payload)
                fallback_data = fallback_response.get("data") or {}
                log_entry = _build_success_log(fallback_response, fallback_data, fallback_url, True)
                _append_stagnant_alert_log(log_entry)
                return {
                    "success": bool(log_entry.get("success")),
                    "message": "alert_sent" if bool(log_entry.get("success")) else "alert_failed",
                    "appscript": fallback_data,
                    "log": log_entry,
                }
            except urllib.error.HTTPError as fallback_err:
                fallback_body = ""
                fallback_code = int(getattr(fallback_err, "code", 0) or 0)
                try:
                    fallback_body = fallback_err.read().decode("utf-8", errors="replace")
                except Exception:
                    fallback_body = ""
                log_entry = _build_error_log(
                    fallback_code,
                    f"HTTPError {fallback_code} (primary {http_code})",
                    fallback_body or err_body,
                    fallback_url,
                    True,
                )
                _append_stagnant_alert_log(log_entry)
                raise HTTPException(status_code=502, detail={
                    "message": "Falha ao acionar Apps Script (verifique deployment/permissão do Web App)",
                    "log": log_entry,
                })
            except Exception as fallback_ex:
                log_entry = _build_error_log(
                    0,
                    f"Fallback error: {str(fallback_ex)}",
                    err_body,
                    fallback_url,
                    True,
                )
                _append_stagnant_alert_log(log_entry)
                raise HTTPException(status_code=502, detail={
                    "message": "Falha ao acionar Apps Script (fallback também falhou)",
                    "log": log_entry,
                })

        log_entry = _build_error_log(http_code, f"HTTPError {http_code}", err_body, primary_url, False)
        _append_stagnant_alert_log(log_entry)
        raise HTTPException(status_code=502, detail={"message": "Falha ao acionar Apps Script", "log": log_entry})
    except Exception as e:
        log_entry = {
            "timestamp": now_iso,
            "webhook_status": 0,
            "success": False,
            "error": str(e),
            **meta,
        }
        _append_stagnant_alert_log(log_entry)
        raise HTTPException(status_code=500, detail={"message": "Erro interno no proxy de alertas", "log": log_entry})


@app.get("/api/stagnant-alert/logs")
async def get_stagnant_alert_logs(limit: int = 50):
    safe_limit = max(1, min(int(limit), 200))
    items = list(reversed(STAGNANT_ALERT_LOGS[-safe_limit:]))
    return {
        "success": True,
        "count": len(items),
        "items": items,
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
    max_attempts = 4
    for attempt in range(1, max_attempts + 1):
        try:
            query_job = client.query(query)
            results = query_job.result()
            return [dict(row) for row in results]
        except Exception as exc:
            message = str(exc or "")
            retryable = (
                "rate exceeded" in message.lower()
                or "too many requests" in message.lower()
                or "429" in message
                or "quota" in message.lower()
                or "backend error" in message.lower()
                or "internal error" in message.lower()
                or "service unavailable" in message.lower()
            )
            if not retryable or attempt >= max_attempts:
                raise
            backoff_seconds = min(0.6 * (2 ** (attempt - 1)), 4.0)
            time.sleep(backoff_seconds)


def sql_literal(value: str) -> str:
    return str(value).replace("'", "''")


def build_flexible_date_expr(column_name: str) -> str:
    """Build a BigQuery DATE expression that works for DATE or STRING sources."""
    col = str(column_name or "").strip()
    return (
        "COALESCE("
        f"SAFE_CAST({col} AS DATE), "
        f"SAFE.PARSE_DATE('%Y-%m-%d', CAST({col} AS STRING)), "
        f"SAFE.PARSE_DATE('%d-%m-%Y', CAST({col} AS STRING)), "
        f"SAFE.PARSE_DATE('%d/%m/%Y', CAST({col} AS STRING)), "
        f"SAFE.PARSE_DATE('%Y/%m/%d', CAST({col} AS STRING))"
        ")"
    )


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


def parse_quarter_number(raw_quarter: Optional[str]) -> Optional[int]:
    value = str(raw_quarter or "").strip().upper()
    if not value:
        return None
    if value in {"1", "2", "3", "4"}:
        return int(value)
    match = re.search(r"Q([1-4])", value)
    if match:
        return int(match.group(1))
    return None


def parse_fiscal_quarter_label(raw_fiscal_q: Optional[str]) -> Optional[tuple[int, int]]:
    value = str(raw_fiscal_q or "").strip().upper()
    if not value:
        return None
    match = re.match(r"^FY(\d{2})-Q([1-4])$", value)
    if not match:
        return None
    fiscal_year = 2000 + int(match.group(1))
    quarter_num = int(match.group(2))
    return (fiscal_year, quarter_num)


def derive_revenue_window(
    fiscal_q: Optional[str],
    year: Optional[str],
    quarter: Optional[str],
    month: Optional[str],
    date_start: Optional[str],
    date_end: Optional[str],
) -> tuple[Optional[date], Optional[date]]:
    parsed_start: Optional[date] = None
    parsed_end: Optional[date] = None

    if date_start:
        try:
            parsed_start = datetime.strptime(str(date_start).strip(), "%Y-%m-%d").date()
        except ValueError:
            parsed_start = None
    if date_end:
        try:
            parsed_end = datetime.strptime(str(date_end).strip(), "%Y-%m-%d").date()
        except ValueError:
            parsed_end = None

    if parsed_start and parsed_end:
        return parsed_start, parsed_end

    year_int: Optional[int] = None
    if year and str(year).strip().isdigit():
        year_int = int(str(year).strip())

    quarter_num = parse_quarter_number(quarter)
    fiscal_q_parsed = parse_fiscal_quarter_label(fiscal_q)
    if fiscal_q_parsed and year_int is None:
        year_int = fiscal_q_parsed[0]
    if fiscal_q_parsed and quarter_num is None:
        quarter_num = fiscal_q_parsed[1]

    month_num: Optional[int] = None
    if month and str(month).strip().isdigit():
        month_candidate = int(str(month).strip())
        if 1 <= month_candidate <= 12:
            month_num = month_candidate

    if parsed_start is None:
        if year_int and quarter_num:
            start_month = (quarter_num - 1) * 3 + 1
            parsed_start = date(year_int, start_month, 1)
        elif year_int and month_num:
            parsed_start = date(year_int, month_num, 1)
        elif year_int:
            parsed_start = date(year_int, 1, 1)

    if parsed_end is None:
        if year_int and quarter_num:
            end_month = quarter_num * 3
            if end_month == 12:
                parsed_end = date(year_int, 12, 31)
            else:
                parsed_end = date(year_int, end_month + 1, 1) - timedelta(days=1)
        elif year_int and month_num:
            if month_num == 12:
                parsed_end = date(year_int, 12, 31)
            else:
                parsed_end = date(year_int, month_num + 1, 1) - timedelta(days=1)
        elif year_int:
            parsed_end = date(year_int, 12, 31)

    return parsed_start, parsed_end


def get_dataset_table_columns(dataset_name: str, table_name: str) -> set[str]:
    cache_key = f"_table_columns_{dataset_name}_{table_name}"
    cached = get_cached_response(cache_key)
    if cached is not None:
        return cached

    query = f"""
    SELECT column_name
    FROM `{PROJECT_ID}.{dataset_name}.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = '{sql_literal(table_name)}'
    """
    columns = {str(row.get("column_name") or "") for row in query_to_dict(query)}
    set_cached_response(cache_key, columns, ttl_seconds=300)
    return columns


def get_table_columns(table_name: str) -> set[str]:
    return get_dataset_table_columns(DATASET_ID, table_name)


def append_pipeline_dimension_filters(
    filters: List[str],
    phase: Optional[str] = None,
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
) -> None:
    columns = get_table_columns("pipeline")

    if phase and "Fase_Atual" in columns:
        phase_filter = build_in_filter("Fase_Atual", phase)
        if phase_filter:
            filters.append(phase_filter)

    if tipo_oportunidade and "Tipo_Oportunidade" in columns:
        tipo_filter = build_in_filter("Tipo_Oportunidade", tipo_oportunidade)
        if tipo_filter:
            filters.append(tipo_filter)

    if processo and "Processo" in columns:
        processo_filter = build_in_filter("Processo", processo)
        if processo_filter:
            filters.append(processo_filter)

    if portfolio and "Portfolio" in columns:
        portfolio_filter = build_in_filter("TRIM(CAST(Portfolio AS STRING))", portfolio)
        if portfolio_filter:
            filters.append(portfolio_filter)

    filter_map = [
        ("Owner_Preventa", owner_preventa),
        ("Vertical_IA", vertical_ia),
        ("Sub_vertical_IA", sub_vertical_ia),
        ("Sub_sub_vertical_IA", sub_sub_vertical_ia),
        ("Subsegmento_de_mercado", subsegmento_mercado),
        ("Segmento_consolidado", segmento_consolidado),
        ("Perfil_Cliente", perfil_cliente),
        ("Status_GTM", status_gtm),
        ("Motivo_Status_GTM", motivo_status_gtm),
        ("Status_Cliente", status_cliente),
        ("Flag_Aprovacao_Previa", flag_aprovacao_previa),
        ("Sales_Specialist_Envolvido", sales_specialist_envolvido),
        ("Elegibilidade_SS", elegibilidade_ss),
        ("Status_Governanca_SS", status_governanca_ss),
    ]

    for column_name, filter_value in filter_map:
        if filter_value and column_name in columns:
            in_filter = build_in_filter(column_name, filter_value)
            if in_filter:
                filters.append(in_filter)

    if portfolio_fdm and "Portfolio_FDM" in columns:
        portfolio_fdm_filter = build_in_filter("TRIM(CAST(Portfolio_FDM AS STRING))", portfolio_fdm)
        if portfolio_fdm_filter:
            filters.append(portfolio_fdm_filter)

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


def append_closed_dimension_filters(
    filters: List[str],
    table_name: str,
    phase: Optional[str] = None,
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
) -> None:
    columns = get_table_columns(table_name)

    if phase:
        phase_column = "Status" if "Status" in columns else ("Fase_Atual" if "Fase_Atual" in columns else None)
        if phase_column:
            phase_filter = build_in_filter(phase_column, phase)
            if phase_filter:
                filters.append(phase_filter)

    if portfolio and "Portfolio" in columns:
        portfolio_filter = build_in_filter("TRIM(CAST(Portfolio AS STRING))", portfolio)
        if portfolio_filter:
            filters.append(portfolio_filter)

    filter_map = [
        ("Tipo_Oportunidade", tipo_oportunidade),
        ("Processo", processo),
        ("Owner_Preventa", owner_preventa),
        ("Vertical_IA", vertical_ia),
        ("Sub_vertical_IA", sub_vertical_ia),
        ("Sub_sub_vertical_IA", sub_sub_vertical_ia),
        ("Subsegmento_de_mercado", subsegmento_mercado),
        ("Segmento_consolidado", segmento_consolidado),
        ("Perfil_Cliente", perfil_cliente),
        ("Status_GTM", status_gtm),
        ("Motivo_Status_GTM", motivo_status_gtm),
        ("Status_Cliente", status_cliente),
        ("Flag_Aprovacao_Previa", flag_aprovacao_previa),
        ("Sales_Specialist_Envolvido", sales_specialist_envolvido),
        ("Elegibilidade_SS", elegibilidade_ss),
        ("Status_Governanca_SS", status_governanca_ss),
    ]

    for column_name, filter_value in filter_map:
        if filter_value and column_name in columns:
            in_filter = build_in_filter(column_name, filter_value)
            if in_filter:
                filters.append(in_filter)

    if portfolio_fdm and "Portfolio_FDM" in columns:
        portfolio_fdm_filter = build_in_filter("TRIM(CAST(Portfolio_FDM AS STRING))", portfolio_fdm)
        if portfolio_fdm_filter:
            filters.append(portfolio_fdm_filter)

    if billing_city:
        city_column = "Cidade_de_cobranca" if "Cidade_de_cobranca" in columns else None
        if city_column:
            city_filter = build_in_filter(city_column, billing_city)
            if city_filter:
                filters.append(city_filter)

    if billing_state:
        state_column = None
        if "Estado_Provincia_de_cobranca" in columns:
            state_column = "Estado_Provincia_de_cobranca"
        elif "EstadoProvincia_de_cobranca" in columns:
            state_column = "EstadoProvincia_de_cobranca"

        if state_column:
            state_filter = build_in_filter(state_column, billing_state)
            if state_filter:
                filters.append(state_filter)


def build_pipeline_filters_for_facets(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    month: Optional[int] = None,
    seller: Optional[str] = None,
    phase: Optional[str] = None,
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
    exclude_param: Optional[str] = None,
) -> List[str]:
    filters: List[str] = []
    pipeline_date_expr = build_flexible_date_expr("Data_Prevista")

    if year:
        filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")

    if quarter:
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12)
        }
        if quarter in quarter_months:
            start_month, end_month = quarter_months[quarter]
            filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) BETWEEN {start_month} AND {end_month}")
    elif month:
        filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) = {month}")

    if seller and exclude_param != "seller":
        seller_filter = build_seller_filter(seller)
        if seller_filter:
            filters.append(seller_filter)

    append_pipeline_dimension_filters(
        filters,
        phase=None if exclude_param == "phase" else phase,
        tipo_oportunidade=None if exclude_param == "tipo_oportunidade" else tipo_oportunidade,
        processo=None if exclude_param == "processo" else processo,
        owner_preventa=None if exclude_param == "owner_preventa" else owner_preventa,
        billing_city=None if exclude_param == "billing_city" else billing_city,
        billing_state=None if exclude_param == "billing_state" else billing_state,
        vertical_ia=None if exclude_param == "vertical_ia" else vertical_ia,
        sub_vertical_ia=None if exclude_param == "sub_vertical_ia" else sub_vertical_ia,
        sub_sub_vertical_ia=None if exclude_param == "sub_sub_vertical_ia" else sub_sub_vertical_ia,
        subsegmento_mercado=None if exclude_param == "subsegmento_mercado" else subsegmento_mercado,
        segmento_consolidado=None if exclude_param == "segmento_consolidado" else segmento_consolidado,
        portfolio=None if exclude_param == "portfolio" else portfolio,
        portfolio_fdm=None if exclude_param == "portfolio_fdm" else portfolio_fdm,
        perfil_cliente=None if exclude_param == "perfil_cliente" else perfil_cliente,
        status_gtm=None if exclude_param == "status_gtm" else status_gtm,
        motivo_status_gtm=None if exclude_param == "motivo_status_gtm" else motivo_status_gtm,
        status_cliente=None if exclude_param == "status_cliente" else status_cliente,
        flag_aprovacao_previa=None if exclude_param == "flag_aprovacao_previa" else flag_aprovacao_previa,
        sales_specialist_envolvido=None if exclude_param == "sales_specialist_envolvido" else sales_specialist_envolvido,
        elegibilidade_ss=None if exclude_param == "elegibilidade_ss" else elegibilidade_ss,
        status_governanca_ss=None if exclude_param == "status_governanca_ss" else status_governanca_ss,
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
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
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
            "tipo_oportunidade": tipo_oportunidade,
            "processo": processo,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio": portfolio,
            "portfolio_fdm": portfolio_fdm,
            "perfil_cliente": perfil_cliente,
            "status_gtm": status_gtm,
            "motivo_status_gtm": motivo_status_gtm,
            "status_cliente": status_cliente,
            "flag_aprovacao_previa": flag_aprovacao_previa,
            "sales_specialist_envolvido": sales_specialist_envolvido,
            "elegibilidade_ss": elegibilidade_ss,
            "status_governanca_ss": status_governanca_ss,
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
        pipeline_date_expr = "COALESCE(SAFE_CAST(Data_Prevista AS DATE), SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Prevista AS STRING)), SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Prevista AS STRING)), SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Prevista AS STRING)), SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Prevista AS STRING)))"
        closed_date_expr = "COALESCE(SAFE_CAST(Data_Fechamento AS DATE), SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Fechamento AS STRING)), SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Fechamento AS STRING)), SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Fechamento AS STRING)), SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Fechamento AS STRING)))"
        activities_expr = "SAFE_CAST(REPLACE(REGEXP_EXTRACT(CAST(Atividades AS STRING), r'-?[0-9]+(?:[\\.,][0-9]+)?'), ',', '.') AS FLOAT64)"
        
        fiscal_q_exact = f"FY{str(year)[-2:]}-Q{quarter}" if (year and quarter) else None

        if year:
            # Filtrar por ano usando Data_Prevista (pipeline) e Data_Fechamento (closed)
            pipeline_filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")
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
                pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) BETWEEN {start_month} AND {end_month}")
                # Closed Won: filtrar por Data_Fechamento
                if fiscal_q_exact:
                    closed_won_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                    closed_lost_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR Fiscal_Q = '{fiscal_q_exact}')")
                else:
                    closed_won_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
                    closed_lost_filters.append(f"(EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month} OR REGEXP_CONTAINS(COALESCE(Fiscal_Q, ''), r'-Q{quarter}$'))")
        elif month:
            # Se quarter não definido, usar month específico
            pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) = {month}")
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

        append_closed_dimension_filters(
            closed_won_filters,
            "closed_deals_won",
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
        )

        append_closed_dimension_filters(
            closed_lost_filters,
            "closed_deals_lost",
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
        )

        append_pipeline_dimension_filters(
            pipeline_filters,
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
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
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
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
            "tipo_oportunidade": tipo_oportunidade,
            "processo": processo,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio": portfolio,
            "portfolio_fdm": portfolio_fdm,
            "perfil_cliente": perfil_cliente,
            "status_gtm": status_gtm,
            "motivo_status_gtm": motivo_status_gtm,
            "status_cliente": status_cliente,
            "flag_aprovacao_previa": flag_aprovacao_previa,
            "sales_specialist_envolvido": sales_specialist_envolvido,
            "elegibilidade_ss": elegibilidade_ss,
            "status_governanca_ss": status_governanca_ss,
            "limit": limit,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        pipeline_date_expr = build_flexible_date_expr("Data_Prevista")
        pipeline_filters = []
        if year:
            pipeline_filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),   # Q1: Janeiro-Março
                2: (4, 6),   # Q2: Abril-Junho
                3: (7, 9),   # Q3: Julho-Setembro
                4: (10, 12)  # Q4: Outubro-Dezembro
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) BETWEEN {start_month} AND {end_month}")
        if month:
            pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) = {month}")
        if seller:
            # Support multiple sellers
            seller_filter = build_seller_filter(seller)
            if seller_filter:
                pipeline_filters.append(seller_filter)

        append_pipeline_dimension_filters(
            pipeline_filters,
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
        )
        
        where_clause = f"WHERE {' AND '.join(pipeline_filters)}" if pipeline_filters else ""
        
        query = f"""
        SELECT 
            Oportunidade, Vendedor, Fase_Atual,
            Fiscal_Q,
            Conta, Idle_Dias, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias, Atividades,
            Data_Prevista, SAFE_CAST(Confianca AS FLOAT64) as Confianca,
            SAFE_CAST(MEDDIC_Score AS FLOAT64) as MEDDIC_Score,
            SAFE_CAST(BANT_Score AS FLOAT64) as BANT_Score,
            SAFE_CAST(NULL AS FLOAT64) as Risco_Score,
            Gross, Net, Forecast_SF, Forecast_IA,
            Perfil, Produtos,
            COALESCE(CAST(Justificativa_IA AS STRING), '') as Justificativa_IA,
            COALESCE(CAST(Motivo_Confianca AS STRING), '') as Motivo_Confianca,
            COALESCE(CAST(Risco_Principal AS STRING), '') as Risco_Principal,
            COALESCE(CAST(Gaps_Identificados AS STRING), '') as Gaps_Identificados,
            COALESCE(CAST(Acao_Sugerida AS STRING), '') as Acao_Sugerida,
            Owner_Preventa, Vertical_IA, Sub_vertical_IA, Sub_sub_vertical_IA,
            Estado_Cidade_Detectado,
            COALESCE(CAST(Portfolio AS STRING), '') as Portfolio,
            COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
            COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
            COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
            COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
            COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca,
            COALESCE(CAST(Tipo_Oportunidade AS STRING), '') as Tipo_Oportunidade,
            COALESCE(CAST(Processo AS STRING), '') as Processo
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
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
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
            "tipo_oportunidade": tipo_oportunidade,
            "processo": processo,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio": portfolio,
            "portfolio_fdm": portfolio_fdm,
            "perfil_cliente": perfil_cliente,
            "status_gtm": status_gtm,
            "motivo_status_gtm": motivo_status_gtm,
            "status_cliente": status_cliente,
            "flag_aprovacao_previa": flag_aprovacao_previa,
            "sales_specialist_envolvido": sales_specialist_envolvido,
            "elegibilidade_ss": elegibilidade_ss,
            "status_governanca_ss": status_governanca_ss,
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
            "tipo_oportunidade": "Tipo_Oportunidade",
            "processo": "Processo",
            "owner_preventa": "Owner_Preventa",
            "billing_city": "Cidade_de_cobranca",
            "billing_state": "Estado_Provincia_de_cobranca",
            "vertical_ia": "Vertical_IA",
            "sub_vertical_ia": "Sub_vertical_IA",
            "sub_sub_vertical_ia": "Sub_sub_vertical_IA",
            "subsegmento_mercado": "Subsegmento_de_mercado",
            "segmento_consolidado": "Segmento_consolidado",
            "portfolio": "Portfolio",
            "portfolio_fdm": "Portfolio_FDM",
            "perfil_cliente": "Perfil_Cliente",
            "status_gtm": "Status_GTM",
            "motivo_status_gtm": "Motivo_Status_GTM",
            "status_cliente": "Status_Cliente",
            "flag_aprovacao_previa": "Flag_Aprovacao_Previa",
            "sales_specialist_envolvido": "Sales_Specialist_Envolvido",
            "elegibilidade_ss": "Elegibilidade_SS",
            "status_governanca_ss": "Status_Governanca_SS",
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
                tipo_oportunidade=tipo_oportunidade,
                processo=processo,
                owner_preventa=owner_preventa,
                billing_city=billing_city,
                billing_state=billing_state,
                vertical_ia=vertical_ia,
                sub_vertical_ia=sub_vertical_ia,
                sub_sub_vertical_ia=sub_sub_vertical_ia,
                subsegmento_mercado=subsegmento_mercado,
                segmento_consolidado=segmento_consolidado,
                portfolio=portfolio,
                portfolio_fdm=portfolio_fdm,
                perfil_cliente=perfil_cliente,
                status_gtm=status_gtm,
                motivo_status_gtm=motivo_status_gtm,
                status_cliente=status_cliente,
                flag_aprovacao_previa=flag_aprovacao_previa,
                sales_specialist_envolvido=sales_specialist_envolvido,
                elegibilidade_ss=elegibilidade_ss,
                status_governanca_ss=status_governanca_ss,
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

        def normalize_portfolio_value(raw_value: Optional[str]) -> Optional[str]:
            value = str(raw_value or "").strip()
            if not value:
                return None
            match = re.match(r"^([123])(?:\.0+)?$", value)
            if not match:
                return None
            return f"{match.group(1)}.0"

        def distinct_portfolio_global_with_counts() -> List[Dict[str, Any]]:
            portfolio_counts: Dict[str, int] = {"1.0": 0, "2.0": 0, "3.0": 0}

            table_specs = [
                ("pipeline", build_flexible_date_expr("Data_Prevista")),
                ("closed_deals_won", build_flexible_date_expr("Data_Fechamento")),
                ("closed_deals_lost", build_flexible_date_expr("Data_Fechamento")),
            ]

            for table_name, date_expr in table_specs:
                table_columns = get_table_columns(table_name)
                if "Portfolio" not in table_columns:
                    continue

                table_filters: List[str] = []

                if year:
                    table_filters.append(f"EXTRACT(YEAR FROM {date_expr}) = {year}")

                if quarter:
                    quarter_months = {
                        1: (1, 3),
                        2: (4, 6),
                        3: (7, 9),
                        4: (10, 12)
                    }
                    if quarter in quarter_months:
                        start_month, end_month = quarter_months[quarter]
                        table_filters.append(f"EXTRACT(MONTH FROM {date_expr}) BETWEEN {start_month} AND {end_month}")
                elif month:
                    table_filters.append(f"EXTRACT(MONTH FROM {date_expr}) = {month}")

                if seller:
                    seller_filter = build_seller_filter(seller)
                    if seller_filter:
                        table_filters.append(seller_filter)

                if table_name == "pipeline":
                    append_pipeline_dimension_filters(
                        table_filters,
                        phase=phase,
                        tipo_oportunidade=tipo_oportunidade,
                        processo=processo,
                        owner_preventa=owner_preventa,
                        billing_city=billing_city,
                        billing_state=billing_state,
                        vertical_ia=vertical_ia,
                        sub_vertical_ia=sub_vertical_ia,
                        sub_sub_vertical_ia=sub_sub_vertical_ia,
                        subsegmento_mercado=subsegmento_mercado,
                        segmento_consolidado=segmento_consolidado,
                        portfolio=None,
                        portfolio_fdm=portfolio_fdm,
                        perfil_cliente=perfil_cliente,
                        status_gtm=status_gtm,
                        motivo_status_gtm=motivo_status_gtm,
                        status_cliente=status_cliente,
                        flag_aprovacao_previa=flag_aprovacao_previa,
                        sales_specialist_envolvido=sales_specialist_envolvido,
                        elegibilidade_ss=elegibilidade_ss,
                        status_governanca_ss=status_governanca_ss,
                    )
                else:
                    append_closed_dimension_filters(
                        table_filters,
                        table_name,
                        phase=phase,
                        tipo_oportunidade=tipo_oportunidade,
                        processo=processo,
                        owner_preventa=owner_preventa,
                        billing_city=billing_city,
                        billing_state=billing_state,
                        vertical_ia=vertical_ia,
                        sub_vertical_ia=sub_vertical_ia,
                        sub_sub_vertical_ia=sub_sub_vertical_ia,
                        subsegmento_mercado=subsegmento_mercado,
                        segmento_consolidado=segmento_consolidado,
                        portfolio=None,
                        portfolio_fdm=portfolio_fdm,
                    )

                where_clause = "WHERE " + " AND ".join(table_filters) if table_filters else ""
                query = f"""
                SELECT TRIM(CAST(Portfolio AS STRING)) as value,
                       COUNT(DISTINCT Oportunidade) as count
                FROM `{PROJECT_ID}.{DATASET_ID}.{table_name}`
                {where_clause}
                  {"AND" if where_clause else "WHERE"} Portfolio IS NOT NULL
                  AND TRIM(CAST(Portfolio AS STRING)) != ''
                GROUP BY value
                """

                for row in query_to_dict(query):
                    normalized = normalize_portfolio_value(str(row.get("value") or ""))
                    if not normalized:
                        continue
                    portfolio_counts[normalized] = portfolio_counts.get(normalized, 0) + int(row.get("count") or 0)

            return [
                {"value": key, "count": portfolio_counts.get(key, 0)}
                for key in ["1.0", "2.0", "3.0"]
            ]

        result = {
            "phase": distinct_values_with_counts("phase", facet_column_map["phase"]),
            "tipo_oportunidade": distinct_values_with_counts("tipo_oportunidade", facet_column_map["tipo_oportunidade"]),
            "processo": distinct_values_with_counts("processo", facet_column_map["processo"]),
            "owner_preventa": distinct_values_with_counts("owner_preventa", facet_column_map["owner_preventa"]),
            "billing_city": distinct_values_with_counts("billing_city", facet_column_map["billing_city"]),
            "billing_state": distinct_values_with_counts("billing_state", facet_column_map["billing_state"]),
            "vertical_ia": distinct_values_with_counts("vertical_ia", facet_column_map["vertical_ia"]),
            "sub_vertical_ia": distinct_values_with_counts("sub_vertical_ia", facet_column_map["sub_vertical_ia"]),
            "sub_sub_vertical_ia": distinct_values_with_counts("sub_sub_vertical_ia", facet_column_map["sub_sub_vertical_ia"]),
            "subsegmento_mercado": distinct_values_with_counts("subsegmento_mercado", facet_column_map["subsegmento_mercado"]),
            "segmento_consolidado": distinct_values_with_counts("segmento_consolidado", facet_column_map["segmento_consolidado"]),
            "portfolio": distinct_portfolio_global_with_counts(),
            "portfolio_fdm": distinct_values_with_counts("portfolio_fdm", facet_column_map["portfolio_fdm"]),
            "perfil_cliente": distinct_values_with_counts("perfil_cliente", facet_column_map["perfil_cliente"]),
            "status_gtm": distinct_values_with_counts("status_gtm", facet_column_map["status_gtm"]),
            "motivo_status_gtm": distinct_values_with_counts("motivo_status_gtm", facet_column_map["motivo_status_gtm"]),
            "status_cliente": distinct_values_with_counts("status_cliente", facet_column_map["status_cliente"]),
            "flag_aprovacao_previa": distinct_values_with_counts("flag_aprovacao_previa", facet_column_map["flag_aprovacao_previa"]),
            "sales_specialist_envolvido": distinct_values_with_counts("sales_specialist_envolvido", facet_column_map["sales_specialist_envolvido"]),
            "elegibilidade_ss": distinct_values_with_counts("elegibilidade_ss", facet_column_map["elegibilidade_ss"]),
            "status_governanca_ss": distinct_values_with_counts("status_governanca_ss", facet_column_map["status_governanca_ss"]),
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
    phase: Optional[str] = None,
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
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
        {
            "year": year,
            "quarter": quarter,
            "month": month,
            "seller": seller,
            "phase": phase,
            "tipo_oportunidade": tipo_oportunidade,
            "processo": processo,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio": portfolio,
            "portfolio_fdm": portfolio_fdm,
            "perfil_cliente": perfil_cliente,
            "status_gtm": status_gtm,
            "motivo_status_gtm": motivo_status_gtm,
            "status_cliente": status_cliente,
            "flag_aprovacao_previa": flag_aprovacao_previa,
            "sales_specialist_envolvido": sales_specialist_envolvido,
            "elegibilidade_ss": elegibilidade_ss,
            "status_governanca_ss": status_governanca_ss,
            "limit": limit,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        closed_filters = []
        closed_date_expr = build_flexible_date_expr("Data_Fechamento")
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

        append_closed_dimension_filters(
            closed_filters,
            "closed_deals_won",
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
        )
        
        where_clause = f"WHERE {' AND '.join(closed_filters)}" if closed_filters else ""

        # closed_deals_won com dimensões para gráficos comparativos
        query = f"""
        SELECT
            Oportunidade, Vendedor, Status, Conta,
            Fiscal_Q,
            COALESCE(CAST(Status AS STRING), '') as Fase_Atual,
            Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
            Gross, Net, Tipo_Resultado, Fatores_Sucesso, Causa_Raiz, Atividades,
            COALESCE(Produtos, '') as Produtos,
            COALESCE(Perfil_Cliente, '') as Perfil_Cliente,
            COALESCE(CAST(Vertical_IA AS STRING), '') as Vertical_IA,
            COALESCE(CAST(Sub_vertical_IA AS STRING), '') as Sub_vertical_IA,
            COALESCE(CAST(Sub_sub_vertical_IA AS STRING), '') as Sub_sub_vertical_IA,
            COALESCE(CAST(Portfolio AS STRING), '') as Portfolio,
            COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
            COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
            COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
            COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
            COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), CAST(EstadoProvincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca,
            COALESCE(CAST(Tipo_Oportunidade AS STRING), '') as Tipo_Oportunidade,
            COALESCE(CAST(Processo AS STRING), '') as Processo,
            '' as Forecast_SF,
            '' as Forecast_IA
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
    phase: Optional[str] = None,
    tipo_oportunidade: Optional[str] = None,
    processo: Optional[str] = None,
    owner_preventa: Optional[str] = None,
    billing_city: Optional[str] = None,
    billing_state: Optional[str] = None,
    vertical_ia: Optional[str] = None,
    sub_vertical_ia: Optional[str] = None,
    sub_sub_vertical_ia: Optional[str] = None,
    subsegmento_mercado: Optional[str] = None,
    segmento_consolidado: Optional[str] = None,
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    perfil_cliente: Optional[str] = None,
    status_gtm: Optional[str] = None,
    motivo_status_gtm: Optional[str] = None,
    status_cliente: Optional[str] = None,
    flag_aprovacao_previa: Optional[str] = None,
    sales_specialist_envolvido: Optional[str] = None,
    elegibilidade_ss: Optional[str] = None,
    status_governanca_ss: Optional[str] = None,
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
        {
            "year": year,
            "quarter": quarter,
            "month": month,
            "seller": seller,
            "phase": phase,
            "tipo_oportunidade": tipo_oportunidade,
            "processo": processo,
            "owner_preventa": owner_preventa,
            "billing_city": billing_city,
            "billing_state": billing_state,
            "vertical_ia": vertical_ia,
            "sub_vertical_ia": sub_vertical_ia,
            "sub_sub_vertical_ia": sub_sub_vertical_ia,
            "subsegmento_mercado": subsegmento_mercado,
            "segmento_consolidado": segmento_consolidado,
            "portfolio": portfolio,
            "portfolio_fdm": portfolio_fdm,
            "perfil_cliente": perfil_cliente,
            "status_gtm": status_gtm,
            "motivo_status_gtm": motivo_status_gtm,
            "status_cliente": status_cliente,
            "flag_aprovacao_previa": flag_aprovacao_previa,
            "sales_specialist_envolvido": sales_specialist_envolvido,
            "elegibilidade_ss": elegibilidade_ss,
            "status_governanca_ss": status_governanca_ss,
            "limit": limit,
        }
    )
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        closed_filters = []
        closed_date_expr = build_flexible_date_expr("Data_Fechamento")
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

        append_closed_dimension_filters(
            closed_filters,
            "closed_deals_lost",
            phase=phase,
            tipo_oportunidade=tipo_oportunidade,
            processo=processo,
            owner_preventa=owner_preventa,
            billing_city=billing_city,
            billing_state=billing_state,
            vertical_ia=vertical_ia,
            sub_vertical_ia=sub_vertical_ia,
            sub_sub_vertical_ia=sub_sub_vertical_ia,
            subsegmento_mercado=subsegmento_mercado,
            segmento_consolidado=segmento_consolidado,
            portfolio=portfolio,
            portfolio_fdm=portfolio_fdm,
            perfil_cliente=perfil_cliente,
            status_gtm=status_gtm,
            motivo_status_gtm=motivo_status_gtm,
            status_cliente=status_cliente,
            flag_aprovacao_previa=flag_aprovacao_previa,
            sales_specialist_envolvido=sales_specialist_envolvido,
            elegibilidade_ss=elegibilidade_ss,
            status_governanca_ss=status_governanca_ss,
        )
        
        where_clause = f"WHERE {' AND '.join(closed_filters)}" if closed_filters else ""

        # closed_deals_lost tem schema completo com campos dimensionais e IA
        query = f"""
        SELECT
            Oportunidade, Vendedor, Status, Conta,
            Fiscal_Q,
            Data_Fechamento, SAFE_CAST(Ciclo_dias AS FLOAT64) as Ciclo_dias,
            Gross, Net, Tipo_Resultado, Causa_Raiz, Fatores_Sucesso, Atividades,
            COALESCE(CAST(Evitavel AS STRING), '') as Evitavel,
            COALESCE(Justificativa_IA, '') as Justificativa_IA,
            COALESCE(Owner_Preventa, '') as Owner_Preventa,
            COALESCE(CAST(Vertical_IA AS STRING), '') as Vertical_IA,
            COALESCE(CAST(Sub_vertical_IA AS STRING), '') as Sub_vertical_IA,
            COALESCE(CAST(Sub_sub_vertical_IA AS STRING), '') as Sub_sub_vertical_IA,
            COALESCE(CAST(Portfolio AS STRING), '') as Portfolio,
            COALESCE(CAST(Portfolio_FDM AS STRING), '') as Portfolio_FDM,
            COALESCE(CAST(Segmento_consolidado AS STRING), '') as Segmento_consolidado,
            COALESCE(CAST(Subsegmento_de_mercado AS STRING), '') as Subsegmento_de_mercado,
            COALESCE(CAST(Cidade_de_cobranca AS STRING), '') as Cidade_de_cobranca,
            COALESCE(CAST(Estado_Provincia_de_cobranca AS STRING), CAST(EstadoProvincia_de_cobranca AS STRING), '') as Estado_Provincia_de_cobranca,
            COALESCE(CAST(Status AS STRING), '') as Fase_Atual,
            COALESCE(CAST(Tipo_Oportunidade AS STRING), '') as Tipo_Oportunidade,
            COALESCE(CAST(Processo AS STRING), '') as Processo
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
    portfolio: Optional[str] = None,
    portfolio_fdm: Optional[str] = None,
    nocache: bool = False
):
    """Retorna deals prioritários (high confidence + high value) com suporte a filtros."""
    cache_key = build_cache_key("/api/priorities", {
        "limit": limit, "year": year, "quarter": quarter, "month": month,
        "seller": seller, "phase": phase, "owner_preventa": owner_preventa,
        "vertical_ia": vertical_ia, "sub_vertical_ia": sub_vertical_ia,
        "segmento_consolidado": segmento_consolidado, "portfolio": portfolio, "portfolio_fdm": portfolio_fdm
    })
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached
    try:
        pipeline_date_expr = build_flexible_date_expr("Data_Prevista")
        filters = ["SAFE_CAST(Confianca AS FLOAT64) >= 50"]
        if year:
            if quarter:
                fiscal_q = f"FY{str(year)[2:]}-Q{quarter}"
                filters.append(f"(EXTRACT(YEAR FROM {pipeline_date_expr}) = {year} OR Fiscal_Q = '{fiscal_q}')")
            elif month:
                filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")
                filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) = {month}")
            else:
                filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")
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
        if sub_vertical_ia:
            svf = build_in_filter("Sub_vertical_IA", sub_vertical_ia)
            if svf:
                filters.append(svf)
        if segmento_consolidado:
            scf = build_in_filter("Segmento_consolidado", segmento_consolidado)
            if scf:
                filters.append(scf)
        if portfolio:
            pf = build_in_filter("TRIM(CAST(Portfolio AS STRING))", portfolio)
            if pf:
                filters.append(pf)
        if portfolio_fdm:
            pff = build_in_filter("Portfolio_FDM", portfolio_fdm)
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
        closed_date_expr = build_flexible_date_expr("Data_Fechamento")
        if year:
            filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
        if quarter:
            quarter_months = {
                1: (1, 3),
                2: (4, 6),
                3: (7, 9),
                4: (10, 12)
            }
            if quarter in quarter_months:
                start_month, end_month = quarter_months[quarter]
                filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month}")
        elif month:
            filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
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
        pipeline_date_expr = build_flexible_date_expr("Data_Prevista")
        closed_date_expr = build_flexible_date_expr("Data_Fechamento")
        
        if year:
            pipeline_filters.append(f"EXTRACT(YEAR FROM {pipeline_date_expr}) = {year}")
            closed_filters.append(f"EXTRACT(YEAR FROM {closed_date_expr}) = {year}")
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
                pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) BETWEEN {start_month} AND {end_month}")
                closed_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) BETWEEN {start_month} AND {end_month}")
                specialist_filters.append(f"EXTRACT(MONTH FROM closed_date) BETWEEN {start_month} AND {end_month}")
        elif month:
            # Se quarter não definido, usar month
            pipeline_filters.append(f"EXTRACT(MONTH FROM {pipeline_date_expr}) = {month}")
            closed_filters.append(f"EXTRACT(MONTH FROM {closed_date_expr}) = {month}")
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
        pipeline_date_expr_for_agg = build_flexible_date_expr("Data_Prevista")
        pipeline_2026 = query_to_dict(f"""
        SELECT 
          COUNT(*) as deals_count,
          ROUND(SUM(Gross), 2) as gross,
          ROUND(SUM(Net), 2) as net
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
                WHERE Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
                    AND EXTRACT(YEAR FROM {pipeline_date_expr_for_agg}) = 2026
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
                    EXTRACT(YEAR FROM {pipeline_date_expr_for_agg}) as year,
                    EXTRACT(MONTH FROM {pipeline_date_expr_for_agg}) as month,
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
# MART L10 — REVENUE & ATTAINMENT (Sprint D)
# =============================================

@app.get("/api/revenue/quarter-summary")
def get_revenue_quarter_summary(
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    seller: Optional[str] = None,
    portfolio: Optional[str] = None,
    status_pagamento: Optional[str] = None,
    produto: Optional[str] = None,
    segmento: Optional[str] = None,
    nocache: bool = False,
):
    """
    Resumo do Quarter por vendedor:
      1) Net faturado total
      2) Net faturado novo (incremental)

        Regras do incremental / meta (cota):
      - somente Closed-Won
      - exclui recorrência (renovações/parcelas/SEMAD etc.)
            - exclui refaturamentos / notas de crédito
            - exclui intercompanhia
            - exclui incentivos Google (rebates/DAF/vouchers)
      - primeira cobrança da oportunidade
      - cliente+produto sem histórico de faturamento anterior ao início da janela
    """
    params = {
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
        "seller": seller,
        "portfolio": portfolio,
        "status_pagamento": status_pagamento,
        "produto": produto,
        "segmento": segmento,
    }
    cache_key = build_cache_key("/api/revenue/quarter-summary", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"
        revenue_source_historico = f"{mart}.v_faturamento_historico"
        revenue_source_q1_updated = f"{mart}.v_faturamento_semanal_consolidado"

        revenue_base_cte = f"""
        WITH source_union AS (
            SELECT
                CAST(COALESCE(h.ano_fonte, '') AS STRING) AS ano_fonte,
                CAST(h.fecha_factura_date AS DATE) AS fecha_factura_date,
                CAST(h.fiscal_q_derivado AS STRING) AS fiscal_q_derivado,
                CAST(h.vendedor_canonico AS STRING) AS vendedor_canonico,
                CAST(h.portfolio_fat_canonico AS STRING) AS portfolio_fat_canonico,
                CAST(h.estado_pagamento_saneado AS STRING) AS estado_pagamento_saneado,
                CAST(h.produto AS STRING) AS produto,
                CAST(h.segmento AS STRING) AS segmento,
                CAST(h.oportunidade AS STRING) AS oportunidade,
                CAST(h.cliente AS STRING) AS cliente,
                CAST(h.billing_id AS STRING) AS billing_id,
                SAFE_CAST(h.net_revenue_saneado AS NUMERIC) AS net_revenue_saneado,
                CAST(h.tipo_documento AS STRING) AS tipo_documento,
                CAST(h.cuenta_financeira AS STRING) AS cuenta_financeira,
                h.data_carga,
                CAST(h.Run_ID AS STRING) AS Run_ID,
                'historico_2025_2026' AS source_name,
                CASE WHEN CAST(COALESCE(h.ano_fonte, '') AS STRING) = '2026' THEN 2 ELSE 1 END AS source_priority
            FROM `{revenue_source_historico}` h

            UNION ALL

            SELECT
                '2026' AS ano_fonte,
                CAST(s.fecha_factura_date AS DATE) AS fecha_factura_date,
                CAST(s.fiscal_q_derivado AS STRING) AS fiscal_q_derivado,
                CAST(s.vendedor_canonico AS STRING) AS vendedor_canonico,
                CAST(s.portfolio_fat_canonico AS STRING) AS portfolio_fat_canonico,
                CAST(s.estado_pagamento_saneado AS STRING) AS estado_pagamento_saneado,
                CAST(s.produto AS STRING) AS produto,
                CAST(s.segmento AS STRING) AS segmento,
                CAST(s.oportunidade AS STRING) AS oportunidade,
                CAST(s.cliente AS STRING) AS cliente,
                CAST(s.billing_id AS STRING) AS billing_id,
                SAFE_CAST(s.net_revenue_saneado AS NUMERIC) AS net_revenue_saneado,
                CAST(s.tipo_documento AS STRING) AS tipo_documento,
                CAST(s.cuenta_financeira AS STRING) AS cuenta_financeira,
                s.data_carga,
                CAST(s.Run_ID AS STRING) AS Run_ID,
                'q1_2026_atualizado' AS source_name,
                3 AS source_priority
            FROM `{revenue_source_q1_updated}` s
            WHERE s.fecha_factura_date IS NOT NULL
              AND EXTRACT(YEAR FROM s.fecha_factura_date) = 2026
              AND EXTRACT(QUARTER FROM s.fecha_factura_date) = 1
        ),
        normalized AS (
            SELECT
                su.*,
                LOWER(CONCAT(
                    COALESCE(NULLIF(TRIM(CAST(su.oportunidade AS STRING)), ''), 'sem-op'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.cliente AS STRING)), ''), 'sem-cliente'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.produto AS STRING)), ''), 'sem-produto'), '|',
                    COALESCE(CAST(su.fecha_factura_date AS STRING), 'sem-data'), '|',
                    COALESCE(CAST(ROUND(COALESCE(su.net_revenue_saneado, 0), 2) AS STRING), '0'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.tipo_documento AS STRING)), ''), 'sem-doc'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.cuenta_financeira AS STRING)), ''), 'sem-conta')
                )) AS merge_key
            FROM source_union su
        ),
        revenue_base AS (
            SELECT * EXCEPT(source_priority)
            FROM normalized
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY merge_key
                ORDER BY
                    source_priority DESC,
                    SAFE.PARSE_TIMESTAMP(
                        '%Y-%m-%dT%H:%M:%E*S%Ez',
                        REGEXP_REPLACE(CAST(data_carga AS STRING), r'Z$', '+00:00')
                    ) DESC,
                    CAST(Run_ID AS STRING) DESC
            ) = 1
        )
        """

        window_start, window_end = derive_revenue_window(
            fiscal_q=fiscal_q,
            year=year,
            quarter=quarter,
            month=month,
            date_start=date_start,
            date_end=date_end,
        )

        filters: List[str] = [
            "fecha_factura_date IS NOT NULL",
            "COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO') <> 'Anulada'",
            "UPPER(TRIM(COALESCE(produto, ''))) <> 'INCENTIVOS'",
            "LOWER(TRIM(COALESCE(cuenta_financeira, ''))) NOT LIKE '%rebate%'",
            "NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))), r'intercompa')",
            "NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(tipo_documento, ''))), r'(nota\\s*de\\s*credito|credit\\s*note|refatur)')",
            "NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(produto, ''), ' ', COALESCE(cuenta_financeira, ''))), r'(incentiv|rebate|daf|voucher)')",
            "NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(cliente, ''), ' ', COALESCE(oportunidade, ''), ' ', COALESCE(cuenta_financeira, ''))), r'((c[eé]rtica|certica).*(mexic|colombi|chile)|(mexic|colombi|chile).*(c[eé]rtica|certica))')",
        ]
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q_derivado = {fqs[0]}")
            elif len(fqs) > 1:
                filters.append(f"fiscal_q_derivado IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM fecha_factura_date) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM fecha_factura_date) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM fecha_factura_date) = {month_num}")
        if date_start:
            filters.append(f"fecha_factura_date >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"fecha_factura_date <= DATE('{sql_literal(date_end)}')")
        if seller:
            f = build_in_filter("vendedor_canonico", seller)
            if f:
                filters.append(f)
        if portfolio:
            f = build_in_filter("portfolio_fat_canonico", portfolio)
            if f:
                filters.append(f)
        if status_pagamento:
            status_tokens = [s.strip().lower() for s in str(status_pagamento).split(",") if s and s.strip()]
            status_aliases = {
                "pagada": "pagada",
                "intercompañia": "intercompania",
                "intercompania": "intercompania",
                "pendiente": "pendiente",
                "anulada": "anulada",
                "nao_informado": "nao_informado",
                "não_informado": "nao_informado",
            }
            normalized_tokens = [status_aliases.get(token, token) for token in status_tokens]
            if normalized_tokens:
                status_col_norm = "REPLACE(LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))), 'ñ', 'n')"
                if len(normalized_tokens) == 1:
                    filters.append(
                        f"{status_col_norm} "
                        f"= '{sql_literal(normalized_tokens[0])}'"
                    )
                else:
                    status_values_sql = "', '".join(sql_literal(token) for token in normalized_tokens)
                    filters.append(
                        f"{status_col_norm} "
                        f"IN ('{status_values_sql}')"
                    )
        if produto:
            f = build_in_filter("COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado')", produto)
            if f:
                filters.append(f)
        if segmento:
            f = build_in_filter("COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado')", segmento)
            if f:
                filters.append(f)

        where = "WHERE " + " AND ".join(filters)

        q_total = f"""
        {revenue_base_cte}
        , filtered AS (
            SELECT *
            FROM revenue_base
            {where}
        )
        SELECT
            COALESCE(NULLIF(TRIM(vendedor_canonico), ''), 'Sem vendedor') AS vendedor,
            ROUND(SUM(COALESCE(net_revenue_saneado, 0)), 2) AS net_revenue,
            ROUND(SUM(CASE
                WHEN REPLACE(LOWER(TRIM(COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO'))), 'ñ', 'n') = 'pagada'
                THEN COALESCE(net_revenue_saneado, 0)
                ELSE 0
            END), 2) AS net_pagada,
            ROUND(SUM(CASE
                WHEN REPLACE(LOWER(TRIM(COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO'))), 'ñ', 'n') IN ('pendiente', 'nao_informado')
                THEN COALESCE(net_revenue_saneado, 0)
                ELSE 0
            END), 2) AS net_pendente,
            COUNT(DISTINCT COALESCE(NULLIF(TRIM(oportunidade), ''), CONCAT('linha-', CAST(billing_id AS STRING)))) AS oportunidades
        FROM filtered
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        window_start_sql = f"DATE('{window_start.isoformat()}')" if window_start else "DATE('1900-01-01')"

        q_incremental = f"""
        {revenue_base_cte}
        , won_opps AS (
            SELECT DISTINCT LOWER(TRIM(CAST(Oportunidade AS STRING))) AS opp_key
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            WHERE Oportunidade IS NOT NULL
        ),
        filtered AS (
            SELECT *
            FROM revenue_base
            {where}
        ),
        base AS (
            SELECT
                COALESCE(NULLIF(TRIM(vendedor_canonico), ''), 'Sem vendedor') AS vendedor,
                COALESCE(NULLIF(TRIM(cliente), ''), 'Cliente não informado') AS cliente,
                COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
                COALESCE(NULLIF(TRIM(oportunidade), ''), CONCAT('linha-', CAST(billing_id AS STRING))) AS oportunidade,
                LOWER(TRIM(COALESCE(oportunidade, CONCAT('linha-', CAST(billing_id AS STRING))))) AS opp_key,
                LOWER(TRIM(COALESCE(cliente, 'Cliente não informado'))) AS cliente_key,
                LOWER(TRIM(COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado'))) AS produto_key,
                fecha_factura_date,
                COALESCE(net_revenue_saneado, 0) AS net_revenue,
                COALESCE(NULLIF(TRIM(tipo_documento), ''), '-') AS tipo_documento,
                COALESCE(NULLIF(TRIM(estado_pagamento_saneado), ''), 'NAO_INFORMADO') AS status_pagamento,
                LOWER(CONCAT(
                    COALESCE(oportunidade, ''), ' ',
                    COALESCE(produto, ''), ' ',
                    COALESCE(portfolio_fat_canonico, '')
                )) AS recurring_text,
                ROW_NUMBER() OVER (
                    PARTITION BY LOWER(TRIM(COALESCE(oportunidade, CONCAT('linha-', CAST(billing_id AS STRING)))))
                    ORDER BY fecha_factura_date, billing_id
                ) AS rn_opp
            FROM filtered
        ),
        first_scope_history AS (
            SELECT
                LOWER(TRIM(COALESCE(cliente, 'Cliente não informado'))) AS cliente_key,
                LOWER(TRIM(COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado'))) AS produto_key,
                MIN(fecha_factura_date) AS first_invoice_date
            FROM revenue_base
            WHERE fecha_factura_date IS NOT NULL
              AND COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO') <> 'Anulada'
            GROUP BY 1, 2
        ),
        incremental AS (
            SELECT b.*
            FROM base b
            JOIN won_opps w ON b.opp_key = w.opp_key
            LEFT JOIN first_scope_history h
                ON b.cliente_key = h.cliente_key
               AND b.produto_key = h.produto_key
            WHERE b.rn_opp = 1
              AND NOT REGEXP_CONTAINS(b.recurring_text, r'(renov|renew|recorr|parcela|semad|mensal|anual|token|transfer)')
                            AND NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(b.tipo_documento, ''))), r'(nota[ ]*de[ ]*credito|credit[ ]*note|refatur)')
                            AND NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(b.cliente, ''), ' ', COALESCE(b.oportunidade, ''))), r'((c[eé]rtica|certica).*(mexic|colombi|chile)|(mexic|colombi|chile).*(c[eé]rtica|certica))')
              AND (
                  h.first_invoice_date IS NULL
                    OR h.first_invoice_date >= {window_start_sql}
                  )
        )
        SELECT
            vendedor,
            ROUND(SUM(net_revenue), 2) AS net_revenue,
            ROUND(SUM(CASE
                WHEN REPLACE(LOWER(TRIM(COALESCE(status_pagamento, 'NAO_INFORMADO'))), 'ñ', 'n') = 'pagada'
                THEN net_revenue
                ELSE 0
            END), 2) AS net_pagada,
            ROUND(SUM(CASE
                WHEN REPLACE(LOWER(TRIM(COALESCE(status_pagamento, 'NAO_INFORMADO'))), 'ñ', 'n') IN ('pendiente', 'nao_informado')
                THEN net_revenue
                ELSE 0
            END), 2) AS net_pendente,
            COUNT(DISTINCT oportunidade) AS oportunidades
        FROM incremental
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        parsed_meta_month_expr = (
            "COALESCE("
            "SAFE.PARSE_DATE('%Y-%m', REGEXP_EXTRACT(REPLACE(COALESCE(Mes_Ano, ''), '/', '-'), r'(20\\d{2}-\\d{1,2})')),"
            "SAFE.PARSE_DATE('%m-%Y', REGEXP_EXTRACT(REPLACE(COALESCE(Mes_Ano, ''), '/', '-'), r'([0-9]{1,2}-20\\d{2})'))"
            ")"
        )
        meta_month_num_applied: Optional[int] = None
        month_requested_num: Optional[int] = None
        if month and str(month).isdigit():
            _m = int(month)
            if 1 <= _m <= 12:
                month_requested_num = _m

        meta_filters: List[str] = []
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                meta_filters.append(f"Periodo_Fiscal = {fqs[0]}")
            elif len(fqs) > 1:
                meta_filters.append(f"Periodo_Fiscal IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            meta_filters.append(
                f"(" 
                f"(SAFE_CAST(REGEXP_EXTRACT(COALESCE(Periodo_Fiscal, ''), r'FY([0-9]{{2}})') AS INT64) + 2000 = {int(year)}) "
                f"OR SAFE_CAST(REGEXP_EXTRACT(COALESCE(Mes_Ano, ''), r'(20[0-9]{{2}})') AS INT64) = {int(year)}"
                f")"
            )
        if quarter_num is not None:
            meta_filters.append(
                f"(" 
                f"REGEXP_CONTAINS(COALESCE(Periodo_Fiscal, ''), r'-Q{quarter_num}$') "
                f"OR EXTRACT(QUARTER FROM {parsed_meta_month_expr}) = {quarter_num}"
                f")"
            )
        elif month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                meta_filters.append(f"EXTRACT(MONTH FROM {parsed_meta_month_expr}) = {month_num}")
                meta_month_num_applied = month_num
        if date_start:
            meta_filters.append(f"{parsed_meta_month_expr} >= DATE('{sql_literal(date_start)}')")
        if date_end:
            meta_filters.append(f"{parsed_meta_month_expr} <= DATE('{sql_literal(date_end)}')")
        if seller:
            seller_bdm_filter = build_in_filter("BDM", seller)
            seller_ss_filter = build_in_filter("Sales_Specialist", seller)
            if seller_bdm_filter and seller_ss_filter:
                meta_filters.append(f"(({seller_bdm_filter}) OR ({seller_ss_filter}))")
            elif seller_bdm_filter:
                meta_filters.append(seller_bdm_filter)
            elif seller_ss_filter:
                meta_filters.append(seller_ss_filter)

        meta_where = "WHERE " + " AND ".join(meta_filters) if meta_filters else ""
        q_meta_bdm = f"""
        WITH meta_dedup AS (
            SELECT *
            FROM `{PROJECT_ID}.{DATASET_ID}.meta_bdm`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY
                    COALESCE(NULLIF(TRIM(Tipo_de_meta), ''), 'NAO_INFORMADO'),
                    COALESCE(NULLIF(TRIM(BDM), ''), 'Sem vendedor'),
                    COALESCE(NULLIF(TRIM(Sales_Specialist), ''), 'Sem especialista'),
                    COALESCE(NULLIF(TRIM(Periodo_Fiscal), ''), 'SEM_Q'),
                    COALESCE(NULLIF(TRIM(Mes_Ano), ''), 'SEM_MES')
                ORDER BY data_carga DESC, Run_ID DESC
            ) = 1
        )
        SELECT
            CASE
                WHEN UPPER(TRIM(COALESCE(Tipo_de_meta, ''))) IN ('CS', 'SALES')
                    THEN COALESCE(NULLIF(TRIM(Sales_Specialist), ''), NULLIF(TRIM(BDM), ''), 'Sem vendedor')
                ELSE COALESCE(NULLIF(TRIM(BDM), ''), NULLIF(TRIM(Sales_Specialist), ''), 'Sem vendedor')
            END AS vendedor,
            COALESCE(NULLIF(TRIM(Tipo_de_meta), ''), 'NAO_INFORMADO') AS tipo_de_meta,
            ROUND(SUM(COALESCE(Net_faturado, Net_gerado, 0)), 2) AS meta_bdm
        FROM meta_dedup
        {meta_where}
        GROUP BY 1, 2
        """

        total_rows = query_to_dict(q_total)
        incremental_rows = query_to_dict(q_incremental)
        meta_bdm_rows = query_to_dict(q_meta_bdm)

        q_active_sellers = f"""
        SELECT DISTINCT COALESCE(NULLIF(TRIM(Vendedor), ''), 'Sem vendedor') AS vendedor
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Vendedor IS NOT NULL
        """
        active_seller_rows = query_to_dict(q_active_sellers)
        active_seller_keys = {
            _normalize_seller_key(row.get("vendedor"))
            for row in active_seller_rows
            if _normalize_seller_key(row.get("vendedor"))
        }
        active_seller_keys.update(FORCED_ACTIVE_SELLERS)

        meta_by_seller: Dict[str, float] = {}
        meta_by_seller_sales: Dict[str, float] = {}
        meta_by_seller_cs: Dict[str, float] = {}
        for row in meta_bdm_rows:
            seller_key = _normalize_seller_key(row.get("vendedor"))
            if not seller_key:
                continue
            tipo_meta_key = str(row.get("tipo_de_meta") or "").strip().upper()
            meta_value = float(row.get("meta_bdm") or 0)
            if tipo_meta_key == "SALES":
                meta_by_seller_sales[seller_key] = meta_by_seller_sales.get(seller_key, 0.0) + meta_value
            elif tipo_meta_key == "CS":
                meta_by_seller_cs[seller_key] = meta_by_seller_cs.get(seller_key, 0.0) + meta_value
            meta_by_seller[seller_key] = meta_by_seller.get(seller_key, 0.0) + meta_value

        meta_source_by_seller: Dict[str, str] = {}
        for seller_key in meta_by_seller.keys():
            if seller_key in meta_by_seller_sales or seller_key in meta_by_seller_cs:
                meta_source_by_seller[seller_key] = "meta_bdm_tipo_owner"
            else:
                meta_source_by_seller[seller_key] = "sem_meta"

        def _enrich_with_meta(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            enriched: List[Dict[str, Any]] = []
            for row in rows:
                net_revenue = float(row.get("net_revenue") or 0)
                seller_key = _normalize_seller_key(row.get("vendedor"))
                meta_bdm = meta_by_seller.get(seller_key, 0.0)
                attainment_pct = round((net_revenue / meta_bdm) * 100, 1) if meta_bdm > 0 else 0.0
                next_row = dict(row)
                next_row["meta_bdm"] = round(meta_bdm, 2)
                next_row["attainment_pct"] = attainment_pct
                next_row["meta_source"] = meta_source_by_seller.get(seller_key, "sem_meta")
                enriched.append(next_row)
            return enriched

        total_rows = _enrich_with_meta(total_rows)
        incremental_rows = _enrich_with_meta(incremental_rows)

        # Meta de cota é baseada em Net Incremental faturado (invoiced), não no total.
        incremental_attainment_by_seller: Dict[str, float] = {
            _normalize_seller_key(row.get("vendedor")): float(row.get("attainment_pct") or 0.0)
            for row in incremental_rows
        }
        for row in total_rows:
            row["attainment_pct_total"] = float(row.get("attainment_pct") or 0.0)
            row["attainment_pct"] = round(
                incremental_attainment_by_seller.get(_normalize_seller_key(row.get("vendedor")), 0.0),
                1,
            )
            row["attainment_basis"] = "incremental_invoiced"
        for row in incremental_rows:
            row["attainment_basis"] = "incremental_invoiced"

        # Revenue por vendedor na visão executiva exibe somente vendedores ativos.
        total_rows = [
            row for row in total_rows
            if _normalize_seller_key(row.get("vendedor")) in active_seller_keys
        ]
        incremental_rows = [
            row for row in incremental_rows
            if _normalize_seller_key(row.get("vendedor")) in active_seller_keys
        ]

        net_total_sum = round(sum(float(row.get("net_revenue") or 0) for row in total_rows), 2)
        net_incremental_sum = round(sum(float(row.get("net_revenue") or 0) for row in incremental_rows), 2)
        meta_bdm_total_sum = round(sum(float(row.get("meta_bdm") or 0) for row in total_rows), 2)
        attainment_total_pct = round((net_total_sum / meta_bdm_total_sum) * 100, 1) if meta_bdm_total_sum > 0 else 0.0
        attainment_incremental_pct = round((net_incremental_sum / meta_bdm_total_sum) * 100, 1) if meta_bdm_total_sum > 0 else 0.0

        result = {
            "filtros": {
                "fiscal_q": fiscal_q,
                "year": year,
                "quarter": quarter,
                "month": month,
                "meta_filter_scope": {
                    "applied_mode": (
                        "quarter" if quarter_num is not None
                        else ("month" if meta_month_num_applied is not None else "year_or_date_or_all")
                    ),
                    "quarter_num_applied": quarter_num,
                    "month_num_applied": meta_month_num_applied,
                    "month_ignored_due_to_quarter": bool(quarter_num is not None and month_requested_num is not None),
                },
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "portfolio": portfolio,
                "status_pagamento": status_pagamento,
                "produto": produto,
                "segmento": segmento,
                "window_start": window_start.isoformat() if window_start else None,
                "window_end": window_end.isoformat() if window_end else None,
            },
            "resumo": {
                "net_total": net_total_sum,
                "net_incremental": net_incremental_sum,
                "meta_bdm_total": meta_bdm_total_sum,
                "attainment_total_pct": attainment_total_pct,
                "attainment_incremental_pct": attainment_incremental_pct,
                "attainment_cota_pct": attainment_incremental_pct,
                "vendedores_total": len(total_rows),
                "vendedores_incremental": len(incremental_rows),
            },
            "attainment_policy": {
                "basis": "incremental_invoiced",
                "description": "Atingimento de cota por vendedor considera apenas Net Incremental faturado (invoiced), com expurgo de recorrencia, refaturamento, intercompanhia e incentivos.",
            },
            "source_policy": {
                "base_historico": "mart_l10.v_faturamento_historico (2025/2026)",
                "override_q1_2026": "mart_l10.v_faturamento_semanal_consolidado",
                "precedencia": ["q1_2026_atualizado", "historico_2026", "historico_2025"],
                "dedupe_key": "oportunidade+cliente+produto+data_fatura+net+tipo_documento+cuenta_financeira",
            },
            "meta_bdm_por_vendedor": meta_bdm_rows,
            "meta_assignment": {
                "owner_rules": {
                    "sales": "Sales_Specialist (fallback BDM)",
                    "cs": "Sales_Specialist (fallback BDM)",
                },
                "dedupe": "latest_by_tipo_bdm_sales_specialist_periodo_mes",
                "notes": "Meta por vendedor derivada da meta_bdm com consolidacao por Sales Specialist em Sales/CS, com fallback para BDM quando necessario.",
            },
            "net_total_por_vendedor": total_rows,
            "net_incremental_por_vendedor": incremental_rows,
        }

        set_cached_response(cache_key, result)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Revenue quarter summary error: {str(e)}")


@app.get("/api/revenue/quarter-summary/drilldown")
def get_revenue_quarter_summary_drilldown(
    seller_name: str,
    view: str = "total",
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    seller: Optional[str] = None,
    portfolio: Optional[str] = None,
    status_pagamento: Optional[str] = None,
    produto: Optional[str] = None,
    segmento: Optional[str] = None,
    limit: int = 500,
    nocache: bool = False,
):
    """
    Drilldown de linhas que compõem o valor por vendedor no resumo do quarter.

    view:
      - total       -> linhas do net total por vendedor
      - incremental -> linhas que entraram no net incremental por vendedor
    """
    if not seller_name or not str(seller_name).strip():
        raise HTTPException(status_code=400, detail="seller_name é obrigatório")

    drill_view = (view or "total").strip().lower()
    if drill_view not in {"total", "incremental"}:
        raise HTTPException(status_code=400, detail="view deve ser 'total' ou 'incremental'")

    safe_limit = max(1, min(int(limit or 500), 1000))

    params = {
        "seller_name": seller_name,
        "view": drill_view,
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
        "seller": seller,
        "portfolio": portfolio,
        "status_pagamento": status_pagamento,
        "produto": produto,
        "segmento": segmento,
        "limit": safe_limit,
    }
    cache_key = build_cache_key("/api/revenue/quarter-summary/drilldown", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"
        revenue_source_historico = f"{mart}.v_faturamento_historico"
        revenue_source_q1_updated = f"{mart}.v_faturamento_semanal_consolidado"

        revenue_base_cte = f"""
        WITH source_union AS (
            SELECT
                CAST(COALESCE(h.ano_fonte, '') AS STRING) AS ano_fonte,
                CAST(h.fecha_factura_date AS DATE) AS fecha_factura_date,
                CAST(h.fiscal_q_derivado AS STRING) AS fiscal_q_derivado,
                CAST(h.vendedor_canonico AS STRING) AS vendedor_canonico,
                CAST(h.portfolio_fat_canonico AS STRING) AS portfolio_fat_canonico,
                CAST(h.estado_pagamento_saneado AS STRING) AS estado_pagamento_saneado,
                CAST(h.produto AS STRING) AS produto,
                CAST(h.segmento AS STRING) AS segmento,
                CAST(h.oportunidade AS STRING) AS oportunidade,
                CAST(h.cliente AS STRING) AS cliente,
                CAST(h.billing_id AS STRING) AS billing_id,
                SAFE_CAST(h.net_revenue_saneado AS NUMERIC) AS net_revenue_saneado,
                CAST(h.tipo_documento AS STRING) AS tipo_documento,
                CAST(h.cuenta_financeira AS STRING) AS cuenta_financeira,
                h.data_carga,
                CAST(h.Run_ID AS STRING) AS Run_ID,
                'historico_2025_2026' AS source_name,
                CASE WHEN CAST(COALESCE(h.ano_fonte, '') AS STRING) = '2026' THEN 2 ELSE 1 END AS source_priority
            FROM `{revenue_source_historico}` h

            UNION ALL

            SELECT
                '2026' AS ano_fonte,
                CAST(s.fecha_factura_date AS DATE) AS fecha_factura_date,
                CAST(s.fiscal_q_derivado AS STRING) AS fiscal_q_derivado,
                CAST(s.vendedor_canonico AS STRING) AS vendedor_canonico,
                CAST(s.portfolio_fat_canonico AS STRING) AS portfolio_fat_canonico,
                CAST(s.estado_pagamento_saneado AS STRING) AS estado_pagamento_saneado,
                CAST(s.produto AS STRING) AS produto,
                CAST(s.segmento AS STRING) AS segmento,
                CAST(s.oportunidade AS STRING) AS oportunidade,
                CAST(s.cliente AS STRING) AS cliente,
                CAST(s.billing_id AS STRING) AS billing_id,
                SAFE_CAST(s.net_revenue_saneado AS NUMERIC) AS net_revenue_saneado,
                CAST(s.tipo_documento AS STRING) AS tipo_documento,
                CAST(s.cuenta_financeira AS STRING) AS cuenta_financeira,
                s.data_carga,
                CAST(s.Run_ID AS STRING) AS Run_ID,
                'q1_2026_atualizado' AS source_name,
                3 AS source_priority
            FROM `{revenue_source_q1_updated}` s
            WHERE s.fecha_factura_date IS NOT NULL
              AND EXTRACT(YEAR FROM s.fecha_factura_date) = 2026
              AND EXTRACT(QUARTER FROM s.fecha_factura_date) = 1
        ),
        normalized AS (
            SELECT
                su.*,
                LOWER(CONCAT(
                    COALESCE(NULLIF(TRIM(CAST(su.oportunidade AS STRING)), ''), 'sem-op'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.cliente AS STRING)), ''), 'sem-cliente'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.produto AS STRING)), ''), 'sem-produto'), '|',
                    COALESCE(CAST(su.fecha_factura_date AS STRING), 'sem-data'), '|',
                    COALESCE(CAST(ROUND(COALESCE(su.net_revenue_saneado, 0), 2) AS STRING), '0'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.tipo_documento AS STRING)), ''), 'sem-doc'), '|',
                    COALESCE(NULLIF(TRIM(CAST(su.cuenta_financeira AS STRING)), ''), 'sem-conta')
                )) AS merge_key
            FROM source_union su
        ),
        revenue_base AS (
            SELECT * EXCEPT(source_priority)
            FROM normalized
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY merge_key
                ORDER BY
                    source_priority DESC,
                    SAFE.PARSE_TIMESTAMP(
                        '%Y-%m-%dT%H:%M:%E*S%Ez',
                        REGEXP_REPLACE(CAST(data_carga AS STRING), r'Z$', '+00:00')
                    ) DESC,
                    CAST(Run_ID AS STRING) DESC
            ) = 1
        )
        """

        window_start, _window_end = derive_revenue_window(
            fiscal_q=fiscal_q,
            year=year,
            quarter=quarter,
            month=month,
            date_start=date_start,
            date_end=date_end,
        )

        filters: List[str] = [
            "fecha_factura_date IS NOT NULL",
            "COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO') <> 'Anulada'",
            "UPPER(TRIM(COALESCE(produto, ''))) <> 'INCENTIVOS'",
            "LOWER(TRIM(COALESCE(cuenta_financeira, ''))) NOT LIKE '%rebate%'",
            "NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))), r'intercompa')",
            "NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(tipo_documento, ''))), r'(nota\\s*de\\s*credito|credit\\s*note|refatur)')",
            "NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(produto, ''), ' ', COALESCE(cuenta_financeira, ''))), r'(incentiv|rebate|daf|voucher)')",
            "NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(cliente, ''), ' ', COALESCE(oportunidade, ''), ' ', COALESCE(cuenta_financeira, ''))), r'((c[eé]rtica|certica).*(mexic|colombi|chile)|(mexic|colombi|chile).*(c[eé]rtica|certica))')",
        ]
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q_derivado = {fqs[0]}")
            elif len(fqs) > 1:
                filters.append(f"fiscal_q_derivado IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM fecha_factura_date) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM fecha_factura_date) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM fecha_factura_date) = {month_num}")
        if date_start:
            filters.append(f"fecha_factura_date >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"fecha_factura_date <= DATE('{sql_literal(date_end)}')")
        if seller:
            f = build_in_filter("vendedor_canonico", seller)
            if f:
                filters.append(f)
        if portfolio:
            f = build_in_filter("portfolio_fat_canonico", portfolio)
            if f:
                filters.append(f)
        if status_pagamento:
            status_tokens = [s.strip().lower() for s in str(status_pagamento).split(",") if s and s.strip()]
            status_aliases = {
                "pagada": "pagada",
                "intercompañia": "intercompania",
                "intercompania": "intercompania",
                "pendiente": "pendiente",
                "anulada": "anulada",
                "nao_informado": "nao_informado",
                "não_informado": "nao_informado",
            }
            normalized_tokens = [status_aliases.get(token, token) for token in status_tokens]
            if normalized_tokens:
                status_col_norm = "REPLACE(LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))), 'ñ', 'n')"
                if len(normalized_tokens) == 1:
                    filters.append(
                        f"{status_col_norm} "
                        f"= '{sql_literal(normalized_tokens[0])}'"
                    )
                else:
                    status_values_sql = "', '".join(sql_literal(token) for token in normalized_tokens)
                    filters.append(
                        f"{status_col_norm} "
                        f"IN ('{status_values_sql}')"
                    )
        if produto:
            f = build_in_filter("COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado')", produto)
            if f:
                filters.append(f)
        if segmento:
            f = build_in_filter("COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado')", segmento)
            if f:
                filters.append(f)

        selected_seller = sql_literal(str(seller_name).strip())
        filters.append(f"COALESCE(NULLIF(TRIM(vendedor_canonico), ''), 'Sem vendedor') = '{selected_seller}'")
        where = "WHERE " + " AND ".join(filters)

        window_start_sql = f"DATE('{window_start.isoformat()}')" if window_start else "DATE('1900-01-01')"

        q_total = f"""
        {revenue_base_cte}
        , filtered AS (
            SELECT *
            FROM revenue_base
            {where}
        )
        SELECT
            CAST(fecha_factura_date AS STRING) AS fecha_factura_date,
            COALESCE(NULLIF(TRIM(oportunidade), ''), CONCAT('linha-', CAST(billing_id AS STRING))) AS oportunidade,
            COALESCE(NULLIF(TRIM(cliente), ''), 'Cliente não informado') AS cliente,
            COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
            COALESCE(NULLIF(TRIM(tipo_documento), ''), '-') AS tipo_documento,
            COALESCE(NULLIF(TRIM(cuenta_financeira), ''), '-') AS cuenta_financeira,
            COALESCE(NULLIF(TRIM(estado_pagamento_saneado), ''), 'NAO_INFORMADO') AS status_pagamento,
            COALESCE(NULLIF(TRIM(portfolio_fat_canonico), ''), 'Outros') AS portfolio,
            COALESCE(NULLIF(TRIM(source_name), ''), 'historico_2025_2026') AS source_name,
            ROUND(COALESCE(net_revenue_saneado, 0), 2) AS net_revenue
        FROM filtered
        ORDER BY net_revenue DESC, fecha_factura_date DESC
        LIMIT {safe_limit}
        """

        q_incremental = f"""
        {revenue_base_cte}
        , won_opps AS (
            SELECT DISTINCT LOWER(TRIM(CAST(Oportunidade AS STRING))) AS opp_key
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            WHERE Oportunidade IS NOT NULL
        ),
        filtered AS (
            SELECT *
            FROM revenue_base
            {where}
        ),
        base AS (
            SELECT
                COALESCE(NULLIF(TRIM(vendedor_canonico), ''), 'Sem vendedor') AS vendedor,
                COALESCE(NULLIF(TRIM(cliente), ''), 'Cliente não informado') AS cliente,
                COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
                COALESCE(NULLIF(TRIM(oportunidade), ''), CONCAT('linha-', CAST(billing_id AS STRING))) AS oportunidade,
                LOWER(TRIM(COALESCE(oportunidade, CONCAT('linha-', CAST(billing_id AS STRING))))) AS opp_key,
                LOWER(TRIM(COALESCE(cliente, 'Cliente não informado'))) AS cliente_key,
                LOWER(TRIM(COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado'))) AS produto_key,
                fecha_factura_date,
                COALESCE(net_revenue_saneado, 0) AS net_revenue,
                COALESCE(NULLIF(TRIM(tipo_documento), ''), '-') AS tipo_documento,
                COALESCE(NULLIF(TRIM(cuenta_financeira), ''), '-') AS cuenta_financeira,
                COALESCE(NULLIF(TRIM(estado_pagamento_saneado), ''), 'NAO_INFORMADO') AS status_pagamento,
                COALESCE(NULLIF(TRIM(portfolio_fat_canonico), ''), 'Outros') AS portfolio,
                COALESCE(NULLIF(TRIM(source_name), ''), 'historico_2025_2026') AS source_name,
                LOWER(CONCAT(
                    COALESCE(oportunidade, ''), ' ',
                    COALESCE(produto, ''), ' ',
                    COALESCE(portfolio_fat_canonico, '')
                )) AS recurring_text,
                ROW_NUMBER() OVER (
                    PARTITION BY LOWER(TRIM(COALESCE(oportunidade, CONCAT('linha-', CAST(billing_id AS STRING)))))
                    ORDER BY fecha_factura_date, billing_id
                ) AS rn_opp
            FROM filtered
        ),
        first_scope_history AS (
            SELECT
                LOWER(TRIM(COALESCE(cliente, 'Cliente não informado'))) AS cliente_key,
                LOWER(TRIM(COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado'))) AS produto_key,
                MIN(fecha_factura_date) AS first_invoice_date
            FROM revenue_base
            WHERE fecha_factura_date IS NOT NULL
              AND COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO') <> 'Anulada'
            GROUP BY 1, 2
        ),
        incremental AS (
            SELECT b.*
            FROM base b
            JOIN won_opps w ON b.opp_key = w.opp_key
            LEFT JOIN first_scope_history h
                ON b.cliente_key = h.cliente_key
               AND b.produto_key = h.produto_key
            WHERE b.rn_opp = 1
              AND NOT REGEXP_CONTAINS(b.recurring_text, r'(renov|renew|recorr|parcela|semad|mensal|anual|token|transfer)')
                            AND NOT REGEXP_CONTAINS(LOWER(TRIM(COALESCE(b.tipo_documento, ''))), r'(nota[ ]*de[ ]*credito|credit[ ]*note|refatur)')
                            AND NOT REGEXP_CONTAINS(LOWER(CONCAT(COALESCE(b.cliente, ''), ' ', COALESCE(b.oportunidade, ''))), r'((c[eé]rtica|certica).*(mexic|colombi|chile)|(mexic|colombi|chile).*(c[eé]rtica|certica))')
              AND (
                    h.first_invoice_date IS NULL
                    OR h.first_invoice_date >= {window_start_sql}
                  )
        )
        SELECT
            CAST(fecha_factura_date AS STRING) AS fecha_factura_date,
            oportunidade,
            cliente,
            produto,
            tipo_documento,
            cuenta_financeira,
            status_pagamento,
            portfolio,
            source_name,
            ROUND(net_revenue, 2) AS net_revenue
        FROM incremental
        ORDER BY net_revenue DESC, fecha_factura_date DESC
        LIMIT {safe_limit}
        """

        items = query_to_dict(q_incremental if drill_view == "incremental" else q_total)
        total_net = round(sum(float(row.get("net_revenue") or 0) for row in items), 2)

        result = {
            "seller_name": seller_name,
            "view": drill_view,
            "rows": len(items),
            "total_net": total_net,
            "items": items,
        }

        set_cached_response(cache_key, result)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Revenue quarter summary drilldown error: {str(e)}")

@app.get("/api/revenue/weekly")
def get_revenue_weekly(
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    seller: Optional[str] = None,
    portfolio: Optional[str] = None,
    status_pagamento: Optional[str] = None,
    produto: Optional[str] = None,
    tipo_oportunidade_line: Optional[str] = None,
    segmento: Optional[str] = None,
    nocache: bool = False,
):
    """
    D1 — Revenue semanal do ERP.
    Fonte: mart_l10.v_faturamento_historico (cadeia consolidada 2025/2026).

    Params:
            fiscal_q  — ex: "FY26-Q1" (opcional; compat legado)
            year      — ex: "2026" (opcional)
            quarter   — ex: "Q1" ou "1" (opcional)
            month     — ex: "1".."12" (opcional)
            date_start/date_end — ex: "2026-01-01".."2026-03-31" (opcional)
      seller    — vendedor_canonico, virgula-separado
      squad     — squad, virgula-separado
      portfolio — portfolio_fat_canonico, virgula-separado
            status_pagamento — estado_pagamento_saneado, virgula-separado

    Retorna:
      totais: { gross_revenue, net_revenue, net_pago, net_pendente, net_anulado, linhas }
      attainment: { meta_gross, meta_net, attainment_gross_pct, attainment_net_pct, gap_gross, gap_net }
      por_semana: [{ semana_inicio, gross_revenue, net_revenue, net_pago, net_pendente }]
      por_mes:    [{ mes_inicio, gross_revenue, net_revenue, net_pago, net_pendente }]
      por_portfolio: [{ portfolio_fat_canonico, gross_revenue, net_revenue, linhas }]
      por_squad:     [{ squad, gross_revenue, net_revenue, linhas }]
    """
    params = {
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
        "seller": seller,
        "portfolio": portfolio,
        "status_pagamento": status_pagamento,
        "produto": produto,
        "tipo_oportunidade_line": tipo_oportunidade_line,
        "segmento": segmento,
    }
    cache_key = build_cache_key("/api/revenue/weekly", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        client = get_bq_client()
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"
        revenue_source = f"{mart}.v_faturamento_historico"
        revenue_columns = get_dataset_table_columns(MART_L10_DATASET, "v_faturamento_historico")

        tipo_opp_expr = "COALESCE(NULLIF(TRIM(etapa_oportunidade), ''), 'Não informado')"
        if "tipo_oportunidade_line" in revenue_columns:
            tipo_opp_expr = "COALESCE(NULLIF(TRIM(tipo_oportunidade_line), ''), 'Não informado')"
        elif "tipo_oportunidade" in revenue_columns:
            tipo_opp_expr = "COALESCE(NULLIF(TRIM(tipo_oportunidade), ''), 'Não informado')"

        # --- build WHERE clauses ---
        filters: List[str] = []
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q_derivado = {fqs[0]}")
            else:
                filters.append(f"fiscal_q_derivado IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM fecha_factura_date) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM fecha_factura_date) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM fecha_factura_date) = {month_num}")
        if date_start:
            filters.append(f"fecha_factura_date >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"fecha_factura_date <= DATE('{sql_literal(date_end)}')")
        if seller:
            f = build_in_filter("vendedor_canonico", seller)
            if f:
                filters.append(f)
        if portfolio:
            f = build_in_filter("portfolio_fat_canonico", portfolio)
            if f:
                filters.append(f)
        if status_pagamento:
            f = build_in_filter("estado_pagamento_saneado", status_pagamento)
            if f:
                filters.append(f)
        if produto:
            f = build_in_filter("COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado')", produto)
            if f:
                filters.append(f)
        if tipo_oportunidade_line:
            f = build_in_filter(tipo_opp_expr, tipo_oportunidade_line)
            if f:
                filters.append(f)
        if segmento:
            f = build_in_filter("COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado')", segmento)
            if f:
                filters.append(f)

        where = ("WHERE " + " AND ".join(filters)) if filters else ""

        # --- pago / pendente / anulado classification ---
        # Regra oficial: Net Pago = Pagada + Intercompañia
        # Suporta variacoes com/sem acento em Intercompañia.
        _pago_expr = """
        CASE
            WHEN LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))) IN ('pagada', 'intercompañia', 'intercompania')
                THEN net_revenue_saneado
            ELSE 0
        END
        """
        _pendente_expr = """
        CASE
            WHEN LOWER(TRIM(COALESCE(estado_pagamento_saneado, ''))) IN ('pendiente', 'nao_informado')
                THEN net_revenue_saneado
            ELSE 0
        END
        """
        _anulado_expr = "CASE WHEN estado_pagamento_saneado = 'Anulada' THEN ABS(net_revenue_saneado) ELSE 0 END"

        # totais
        q_totais = f"""
        SELECT
                    ROUND(SUM(gross_revenue_saneado), 2)    AS gross_revenue,
          ROUND(SUM(net_revenue_saneado), 2)      AS net_revenue,
          ROUND(SUM({_pago_expr}), 2)             AS net_pago,
          ROUND(SUM({_pendente_expr}), 2)         AS net_pendente,
          ROUND(SUM({_anulado_expr}), 2)          AS net_anulado,
          COUNT(*)                                AS linhas
                FROM `{revenue_source}`
        {where}
        """

        # attainment — filtra pelo mesmo fiscal_q se fornecido
        att_filters: List[str] = []
        if fiscal_q:
            fqs_att = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs_att) == 1:
                att_filters.append(f"fiscal_q = {fqs_att[0]}")
            else:
                att_filters.append(f"fiscal_q IN ({', '.join(fqs_att)})")
        if year and str(year).isdigit():
            att_filters.append(f"EXTRACT(YEAR FROM mes_inicio) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            att_filters.append(f"EXTRACT(QUARTER FROM mes_inicio) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                att_filters.append(f"EXTRACT(MONTH FROM mes_inicio) = {month_num}")
        if date_start:
            att_filters.append(f"mes_inicio >= DATE('{sql_literal(date_start)}')")
        if date_end:
            att_filters.append(f"mes_inicio <= DATE('{sql_literal(date_end)}')")
        att_where = ("WHERE " + " AND ".join(att_filters)) if att_filters else ""

        q_attainment = f"""
        SELECT
          ROUND(SUM(meta_gross), 2)               AS meta_gross,
          ROUND(SUM(meta_net), 2)                 AS meta_net,
          ROUND(SUM(gross_realizado), 2)          AS gross_realizado,
          ROUND(SUM(net_realizado), 2)            AS net_realizado,
          ROUND(SAFE_DIVIDE(SUM(gross_realizado), NULLIF(SUM(meta_gross),0)) * 100, 1) AS attainment_gross_pct,
          ROUND(SAFE_DIVIDE(SUM(net_realizado),   NULLIF(SUM(meta_net),  0)) * 100, 1) AS attainment_net_pct,
          ROUND(SUM(meta_gross) - SUM(gross_realizado), 2) AS gap_gross,
          ROUND(SUM(meta_net)   - SUM(net_realizado),   2) AS gap_net
        FROM `{mart}.v_attainment`
        {att_where}
        """

        # por semana
        q_semanal = f"""
        SELECT
          CAST(semana_inicio AS STRING)           AS semana_inicio,
                    ROUND(SUM(gross_revenue_saneado), 2)    AS gross_revenue,
          ROUND(SUM(net_revenue_saneado), 2)      AS net_revenue,
          ROUND(SUM({_pago_expr}), 2)             AS net_pago,
          ROUND(SUM({_pendente_expr}), 2)         AS net_pendente
                FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY 1
        """

        # por mês (para gráfico empilhado)
        q_mensal = f"""
        SELECT
            CAST(mes_inicio AS STRING)            AS mes_inicio,
            ROUND(SUM(gross_revenue_saneado), 2)  AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)    AS net_revenue,
            ROUND(SUM({_pago_expr}), 2)           AS net_pago,
            ROUND(SUM({_pendente_expr}), 2)       AS net_pendente,
            ROUND(SUM({_anulado_expr}), 2)        AS net_anulado
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY 1
        """

        # por produto
        q_produto = f"""
        SELECT
            COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
            ROUND(SUM(gross_revenue_saneado), 2)                         AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                           AS net_revenue,
            COUNT(*)                                                     AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        # por portfolio
        q_portfolio = f"""
        SELECT
            COALESCE(portfolio_fat_canonico, 'Outros') AS portfolio,
            ROUND(SUM(gross_revenue_saneado), 2)       AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)         AS net_revenue,
            COUNT(*)                                   AS linhas
        FROM `{revenue_source}`
                {where}
                GROUP BY 1
                ORDER BY net_revenue DESC
                """

        # por comercial
        q_comercial = f"""
        SELECT
            COALESCE(NULLIF(TRIM(comercial), ''), 'Não informado') AS comercial,
            ROUND(SUM(gross_revenue_saneado), 2)                   AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                     AS net_revenue,
            COUNT(*)                                               AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        # por família
        q_familia = f"""
        SELECT
            COALESCE(NULLIF(TRIM(familia), ''), 'Não informado') AS familia,
            ROUND(SUM(gross_revenue_saneado), 2)                 AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                   AS net_revenue,
            COUNT(*)                                             AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        # por segmento
        q_segmento = f"""
        SELECT
            COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado') AS segmento,
            ROUND(SUM(gross_revenue_saneado), 2)                  AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                    AS net_revenue,
            COUNT(*)                                              AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        # por tipo de oportunidade (line)
        q_tipo_oportunidade_line = f"""
        SELECT
            {tipo_opp_expr}                                                       AS tipo_oportunidade_line,
            ROUND(SUM(gross_revenue_saneado), 2)                                 AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                                   AS net_revenue,
            COUNT(*)                                                              AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        # por quarter fiscal
        q_quarter = f"""
        SELECT
            COALESCE(NULLIF(TRIM(fiscal_q_derivado), ''), 'Não informado') AS fiscal_q,
            ROUND(SUM(gross_revenue_saneado), 2)                            AS gross_revenue,
            ROUND(SUM(net_revenue_saneado), 2)                              AS net_revenue,
            COUNT(*)                                                        AS linhas
        FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY fiscal_q
        """

        # por squad
        q_squad = f"""
        SELECT
                    COALESCE(squad_canonico, 'PENDENTE')    AS squad,
                    ROUND(SUM(gross_revenue_saneado), 2)    AS gross_revenue,
          ROUND(SUM(net_revenue_saneado), 2)      AS net_revenue,
          COUNT(*)                                AS linhas
                FROM `{revenue_source}`
        {where}
        GROUP BY 1
        ORDER BY net_revenue DESC
        """

        totais_rows    = query_to_dict(q_totais)
        attainment_row = query_to_dict(q_attainment)
        semanal_rows   = query_to_dict(q_semanal)
        mensal_rows    = query_to_dict(q_mensal)
        produto_rows   = query_to_dict(q_produto)
        portfolio_rows = query_to_dict(q_portfolio)
        comercial_rows = query_to_dict(q_comercial)
        familia_rows   = query_to_dict(q_familia)
        segmento_rows  = query_to_dict(q_segmento)
        tipo_opp_line_rows = query_to_dict(q_tipo_oportunidade_line)
        quarter_rows   = query_to_dict(q_quarter)
        squad_rows     = query_to_dict(q_squad)

        totais    = totais_rows[0] if totais_rows else {}
        att       = attainment_row[0] if attainment_row else {}

        result = {
            "filtros": {
                "fiscal_q": fiscal_q,
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
                "seller": seller,
                "portfolio": portfolio,
                "status_pagamento": status_pagamento,
                "produto": produto,
                "tipo_oportunidade_line": tipo_oportunidade_line,
                "segmento": segmento,
            },
            "totais": {
                "gross_revenue":  float(totais.get("gross_revenue") or 0),
                "net_revenue":    float(totais.get("net_revenue")   or 0),
                "net_pago":       float(totais.get("net_pago")      or 0),
                "net_pendente":   float(totais.get("net_pendente")  or 0),
                "net_anulado":    float(totais.get("net_anulado")   or 0),
                "linhas":         int(totais.get("linhas")          or 0),
            },
            "attainment": {
                "meta_gross":          float(att.get("meta_gross")          or 0),
                "meta_net":            float(att.get("meta_net")            or 0),
                "gross_realizado":     float(att.get("gross_realizado")     or 0),
                "net_realizado":       float(att.get("net_realizado")       or 0),
                "attainment_gross_pct": att.get("attainment_gross_pct"),
                "attainment_net_pct":   att.get("attainment_net_pct"),
                "gap_gross":           float(att.get("gap_gross")           or 0),
                "gap_net":             float(att.get("gap_net")             or 0),
            },
            "por_semana":    semanal_rows,
            "por_mes":       mensal_rows,
            "por_produto":   produto_rows,
            "por_portfolio": portfolio_rows,
            "por_comercial": comercial_rows,
            "por_familia":   familia_rows,
            "por_segmento":  segmento_rows,
            "por_tipo_oportunidade_line": tipo_opp_line_rows,
            "por_quarter":   quarter_rows,
            "por_squad":     squad_rows,
        }

        set_cached_response(cache_key, result)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Revenue weekly error: {str(e)}")


@app.get("/api/revenue/drilldown")
def get_revenue_drilldown(
    dimension: str,
    value: str,
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    seller: Optional[str] = None,
    portfolio: Optional[str] = None,
    status_pagamento: Optional[str] = None,
    produto: Optional[str] = None,
    tipo_oportunidade_line: Optional[str] = None,
    segmento: Optional[str] = None,
    limit: int = 300,
    nocache: bool = False,
):
    """
    Drilldown detalhado de Revenue com colunas financeiras expandidas.

    dimension: all | semana | mes | produto | comercial | familia | quarter | cliente | segmento | tipo_oportunidade_line
    value: valor da dimensão selecionada
    """
    safe_limit = max(1, min(int(limit or 300), 1000))
    params = {
        "dimension": dimension,
        "value": value,
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
        "seller": seller,
        "portfolio": portfolio,
        "status_pagamento": status_pagamento,
        "produto": produto,
        "tipo_oportunidade_line": tipo_oportunidade_line,
        "segmento": segmento,
        "limit": safe_limit,
    }

    cache_key = build_cache_key("/api/revenue/drilldown", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"
        revenue_source = f"{mart}.v_faturamento_historico"
        revenue_columns = get_dataset_table_columns(MART_L10_DATASET, "v_faturamento_historico")

        tipo_opp_expr = "COALESCE(NULLIF(TRIM(etapa_oportunidade), ''), 'Não informado')"
        if "tipo_oportunidade_line" in revenue_columns:
            tipo_opp_expr = "COALESCE(NULLIF(TRIM(tipo_oportunidade_line), ''), 'Não informado')"
        elif "tipo_oportunidade" in revenue_columns:
            tipo_opp_expr = "COALESCE(NULLIF(TRIM(tipo_oportunidade), ''), 'Não informado')"

        filters: List[str] = []
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q_derivado = {fqs[0]}")
            else:
                filters.append(f"fiscal_q_derivado IN ({', '.join(fqs)})")

        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM fecha_factura_date) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM fecha_factura_date) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM fecha_factura_date) = {month_num}")

        if date_start:
            filters.append(f"fecha_factura_date >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"fecha_factura_date <= DATE('{sql_literal(date_end)}')")

        if seller:
            f = build_in_filter("vendedor_canonico", seller)
            if f:
                filters.append(f)
        if portfolio:
            f = build_in_filter("portfolio_fat_canonico", portfolio)
            if f:
                filters.append(f)
        if status_pagamento:
            f = build_in_filter("estado_pagamento_saneado", status_pagamento)
            if f:
                filters.append(f)
        if produto:
            f = build_in_filter("COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado')", produto)
            if f:
                filters.append(f)
        if tipo_oportunidade_line:
            f = build_in_filter(tipo_opp_expr, tipo_oportunidade_line)
            if f:
                filters.append(f)
        if segmento:
            f = build_in_filter("COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado')", segmento)
            if f:
                filters.append(f)

        dim = (dimension or "").strip().lower()
        val = sql_literal(value or "")
        if dim == "all":
            pass
        elif dim == "semana":
            filters.append(f"CAST(semana_inicio AS STRING) = '{val}'")
        elif dim == "mes":
            filters.append(f"CAST(mes_inicio AS STRING) = '{val}'")
        elif dim == "produto":
            filters.append(f"COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') = '{val}'")
        elif dim == "comercial":
            filters.append(f"COALESCE(NULLIF(TRIM(comercial), ''), 'Não informado') = '{val}'")
        elif dim == "familia":
            filters.append(f"COALESCE(NULLIF(TRIM(familia), ''), 'Não informado') = '{val}'")
        elif dim == "quarter":
            filters.append(f"COALESCE(NULLIF(TRIM(fiscal_q_derivado), ''), 'Não informado') = '{val}'")
        elif dim == "cliente":
            filters.append(f"COALESCE(NULLIF(TRIM(cliente), ''), 'Não Informado') = '{val}'")
        elif dim == "segmento":
            filters.append(f"COALESCE(NULLIF(TRIM(segmento), ''), 'Não informado') = '{val}'")
        elif dim == "tipo_oportunidade_line":
            filters.append(f"{tipo_opp_expr} = '{val}'")
        else:
            raise HTTPException(status_code=400, detail="Dimension inválida para drilldown")

        where = ("WHERE " + " AND ".join(filters)) if filters else ""

        q = f"""
        SELECT
            CAST(fecha_factura_date AS STRING)                          AS fecha_factura_date,
            COALESCE(fiscal_q_derivado, '-')                            AS fiscal_q_derivado,
            COALESCE(cliente, 'Cliente não informado')                  AS cliente,
            COALESCE(oportunidade, 'Oportunidade não informada')       AS oportunidade,
            COALESCE(vendedor_canonico, 'N/A')                          AS vendedor_canonico,
            COALESCE(estado_pagamento_saneado, 'NAO_INFORMADO')         AS estado_pagamento_saneado,
            COALESCE(portfolio_fat_canonico, 'Outros')                  AS portfolio_fat_canonico,
            COALESCE(squad_canonico, 'PENDENTE')                        AS squad_canonico,
            COALESCE(NULLIF(TRIM(comercial), ''), 'Não informado')      AS comercial,
            COALESCE(NULLIF(TRIM(familia), ''), 'Não informado')        AS familia,
            COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
            COALESCE(tipo_documento, '')                                AS tipo_documento,
            COALESCE(tipo_produto, '')                                  AS tipo_produto,
            COALESCE(cuenta_contable, '')                               AS cuenta_contable,
            COALESCE(cuenta_financeira, '')                             AS cuenta_financeira,
            COALESCE(etapa_oportunidade, '')                            AS etapa_oportunidade,
            COALESCE(segmento, '')                                      AS segmento,
            {tipo_opp_expr}                                              AS tipo_oportunidade_line,
            ROUND(COALESCE(gross_revenue_saneado, 0), 2)                AS gross_revenue_saneado,
            ROUND(COALESCE(net_revenue_saneado, 0), 2)                  AS net_revenue_saneado,
            ROUND(COALESCE(valor_fatura_moeda_local_sem_iva, 0), 2)     AS valor_fatura_moeda_local_sem_iva,
            ROUND(COALESCE(valor_fatura_usd_comercial, 0), 2)           AS valor_fatura_usd_comercial,
            ROUND(COALESCE(net_ajustado_usd, 0), 2)                     AS net_ajustado_usd,
            ROUND(COALESCE(custo_moeda_local, 0), 2)                    AS custo_moeda_local,
            ROUND(COALESCE(custo_percentual, 0), 2)                     AS custo_percentual,
            ROUND(COALESCE(tipo_cambio_diario, 0), 6)                   AS tipo_cambio_diario,
            ROUND(COALESCE(tipo_cambio_pactado, 0), 6)                  AS tipo_cambio_pactado,
            ROUND(COALESCE(margem_percentual_final, 0), 2)              AS margem_percentual_final,
            ROUND(COALESCE(percentual_margem, 0), 2)                    AS percentual_margem,
            ROUND(COALESCE(desconto_xertica, 0), 2)                     AS desconto_xertica,
            ROUND(COALESCE(percentual_desconto_xertica_ns, 0), 2)       AS percentual_desconto_xertica_ns
        FROM `{revenue_source}`
        {where}
        ORDER BY fecha_factura_date DESC, net_revenue_saneado DESC
        LIMIT {safe_limit}
        """

        rows = query_to_dict(q)
        result = {
            "filtros": {
                **params,
            },
            "items": rows,
            "total_items": len(rows),
        }
        set_cached_response(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Revenue drilldown error: {str(e)}")


@app.get("/api/attainment")
def get_attainment(
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    nocache: bool = False,
):
    """
    D2 — Attainment mensal: realizado vs meta.
    Fonte: mart_l10.v_attainment (cadeia v_revenue_semanal × sales_intelligence.meta).

    Params:
    fiscal_q — ex: "FY26-Q1" (opcional)
    year/quarter/month/date_start/date_end — filtros de período (opcional)

    Retorna:
      resumo:  { meta_gross, meta_net, gross_realizado, net_realizado, attainment_gross_pct, attainment_net_pct }
      por_mes: [{ mes_inicio, fiscal_q, mes_ano_label, meta_gross, meta_net,
                  gross_realizado, net_realizado, attainment_gross_pct, attainment_net_pct,
                  gap_gross, gap_net }]
    """
    params = {
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
    }
    cache_key = build_cache_key("/api/attainment", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"
        filters: List[str] = []
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q = {fqs[0]}")
            else:
                filters.append(f"fiscal_q IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM mes_inicio) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM mes_inicio) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM mes_inicio) = {month_num}")
        if date_start:
            filters.append(f"mes_inicio >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"mes_inicio <= DATE('{sql_literal(date_end)}')")
        where = ("WHERE " + " AND ".join(filters)) if filters else ""

        q_meses = f"""
        SELECT
          CAST(mes_inicio AS STRING)       AS mes_inicio,
          fiscal_q,
          mes_ano_label,
          ROUND(meta_gross, 2)             AS meta_gross,
          ROUND(meta_net, 2)               AS meta_net,
          ROUND(gross_realizado, 2)        AS gross_realizado,
          ROUND(net_realizado, 2)          AS net_realizado,
          ROUND(attainment_gross_pct * 100, 1) AS attainment_gross_pct,
          ROUND(attainment_net_pct   * 100, 1) AS attainment_net_pct,
          ROUND(gap_gross, 2)              AS gap_gross,
          ROUND(gap_net, 2)               AS gap_net
        FROM `{mart}.v_attainment`
        {where}
        ORDER BY mes_inicio
        """

        meses = query_to_dict(q_meses)

        # resumo agregado
        meta_gross_total     = sum(float(r.get("meta_gross")     or 0) for r in meses)
        meta_net_total       = sum(float(r.get("meta_net")       or 0) for r in meses)
        gross_real_total     = sum(float(r.get("gross_realizado") or 0) for r in meses)
        net_real_total       = sum(float(r.get("net_realizado")   or 0) for r in meses)

        resumo = {
            "meta_gross":          round(meta_gross_total, 2),
            "meta_net":            round(meta_net_total, 2),
            "gross_realizado":     round(gross_real_total, 2),
            "net_realizado":       round(net_real_total, 2),
            "attainment_gross_pct": round(gross_real_total / meta_gross_total * 100, 1) if meta_gross_total else None,
            "attainment_net_pct":   round(net_real_total   / meta_net_total   * 100, 1) if meta_net_total   else None,
            "gap_gross":           round(meta_gross_total - gross_real_total, 2),
            "gap_net":             round(meta_net_total   - net_real_total,   2),
        }

        result = {
            "filtros": {
                "fiscal_q": fiscal_q,
                "year": year,
                "quarter": quarter,
                "month": month,
                "date_start": date_start,
                "date_end": date_end,
            },
            "resumo":  resumo,
            "por_mes": meses,
        }

        set_cached_response(cache_key, result)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Attainment error: {str(e)}")


# =============================================
# D6 — Top Contas por Revenue
# =============================================

@app.get("/api/revenue/top")
def get_revenue_top(
    fiscal_q: Optional[str] = None,
    year: Optional[str] = None,
    quarter: Optional[str] = None,
    month: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    squad: Optional[str] = None,
    portfolio: Optional[str] = None,
    status_pagamento: Optional[str] = None,
    mode: str = "net",
    limit: int = 20,
    nocache: bool = False,
):
    """
    D6 — Top contas por Revenue (Net ou Gross).
    Fonte: mart_l10.v_faturamento_historico (tem cliente, oportunidade, produto).

    Params:
            fiscal_q  — ex: "FY26-Q1" (opcional; compat legado)
            year/quarter/month/date_start/date_end — filtros de período (opcional)
      squad     — squad_canonico, virgula-separado
      portfolio — portfolio_fat_canonico, virgula-separado
            status_pagamento — estado_pagamento_saneado, virgula-separado
      mode      — "net" (default) ou "gross" (define ordenação)
      limit     — max 100, default 20

    Retorna:
      items: [{ cliente, portfolio, oportunidades, produtos,
                gross_revenue, net_revenue, pago, pendente }]
    """
    params = {
        "fiscal_q": fiscal_q,
        "year": year,
        "quarter": quarter,
        "month": month,
        "date_start": date_start,
        "date_end": date_end,
        "squad": squad,
        "portfolio": portfolio,
        "status_pagamento": status_pagamento,
        "mode": mode,
        "limit": limit,
    }
    cache_key = build_cache_key("/api/revenue/top", params)
    if not nocache:
        cached = get_cached_response(cache_key)
        if cached is not None:
            return cached

    try:
        client = get_bq_client()
        mart = f"{PROJECT_ID}.{MART_L10_DATASET}"

        filters: List[str] = ["fecha_factura_date IS NOT NULL"]
        if fiscal_q:
            fqs = [f"'{sql_literal(q.strip())}'" for q in fiscal_q.split(",") if q.strip()]
            if len(fqs) == 1:
                filters.append(f"fiscal_q_derivado = {fqs[0]}")
            else:
                filters.append(f"fiscal_q_derivado IN ({', '.join(fqs)})")
        if year and str(year).isdigit():
            filters.append(f"EXTRACT(YEAR FROM fecha_factura_date) = {int(year)}")
        quarter_num = parse_quarter_number(quarter)
        if quarter_num is not None:
            filters.append(f"EXTRACT(QUARTER FROM fecha_factura_date) = {quarter_num}")
        if month and str(month).isdigit():
            month_num = int(month)
            if 1 <= month_num <= 12:
                filters.append(f"EXTRACT(MONTH FROM fecha_factura_date) = {month_num}")
        if date_start:
            filters.append(f"fecha_factura_date >= DATE('{sql_literal(date_start)}')")
        if date_end:
            filters.append(f"fecha_factura_date <= DATE('{sql_literal(date_end)}')")
        if squad:
            f = build_in_filter("squad_canonico", squad)
            if f:
                filters.append(f)
        if portfolio:
            f = build_in_filter("portfolio_fat_canonico", portfolio)
            if f:
                filters.append(f)
        if status_pagamento:
            f = build_in_filter("estado_pagamento_saneado", status_pagamento)
            if f:
                filters.append(f)

        where = "WHERE " + " AND ".join(filters)
        sort_col = "net_revenue" if mode == "net" else "gross_revenue"
        lim = max(1, min(int(limit), 100))

        _pago_expr     = "CASE WHEN estado_pagamento_saneado = 'Pagada' THEN net_revenue_saneado ELSE 0 END"
        _pendente_expr = "CASE WHEN estado_pagamento_saneado IN ('Pendiente','NAO_INFORMADO','Intercompañia') THEN net_revenue_saneado ELSE 0 END"

        q = f"""
                WITH base AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(cliente), ''), 'Não Informado') AS cliente,
                        COALESCE(NULLIF(TRIM(produto), ''), 'Produto não informado') AS produto,
                        oportunidade,
                        gross_revenue_saneado,
                        net_revenue_saneado,
                        {_pago_expr}     AS pago_val,
                        {_pendente_expr} AS pendente_val
                    FROM `{mart}.v_faturamento_historico`
                    {where}
                ),
                acc AS (
                    SELECT
                        cliente,
                        STRING_AGG(DISTINCT oportunidade ORDER BY oportunidade LIMIT 5) AS oportunidades,
                        STRING_AGG(DISTINCT produto      ORDER BY produto      LIMIT 5) AS produtos,
                        ROUND(SUM(gross_revenue_saneado), 2)                          AS gross_revenue,
                        ROUND(SUM(net_revenue_saneado),   2)                          AS net_revenue,
                        ROUND(SUM(pago_val),               2)                         AS pago,
                        ROUND(SUM(pendente_val),           2)                         AS pendente
                    FROM base
                    GROUP BY cliente
                ),
                prod_rank AS (
                    SELECT
                        cliente,
                        produto,
                        ROW_NUMBER() OVER (
                            PARTITION BY cliente
                            ORDER BY SUM(net_revenue_saneado) DESC, SUM(gross_revenue_saneado) DESC, produto
                        ) AS rn
                    FROM base
                    GROUP BY cliente, produto
                )
                SELECT
                    a.cliente,
                    p.produto AS produto_principal,
                    a.oportunidades,
                    a.produtos,
                    a.gross_revenue,
                    a.net_revenue,
                    a.pago,
                    a.pendente
                FROM acc a
                LEFT JOIN prod_rank p
                    ON a.cliente = p.cliente
                 AND p.rn = 1
                ORDER BY {sort_col} DESC
                LIMIT {lim}
        """

        rows = client.query(q).result()
        items = [dict(row) for row in rows]
        result = {"items": items, "total_items": len(items), "mode": mode}
        set_cached_response(cache_key, result)
        return result

    except Exception as e:
        log(f"[revenue/top] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# XSALES USER MANAGEMENT  (Firestore-backed)
# =============================================

XSALES_USERS_COL    = "xsales_users"
XSALES_ADMIN_SECRET = os.getenv("XSALES_ADMIN_SECRET", "xertica")

def _check_admin(request: Request):
    provided = request.headers.get("X-Admin-Secret", "")
    if not provided or provided != XSALES_ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/api/xsales/users")
async def xsales_list_users(request: Request):
    """List all xsales users. Requires X-Admin-Secret header."""
    _check_admin(request)
    db = get_fs_client()
    docs = db.collection(XSALES_USERS_COL).stream()
    users = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        users.append(data)
    return {"users": users}


@app.get("/api/xsales/users/by-email")
async def xsales_get_user_by_email(email: str):
    """Look up a user by email (public — used for login)."""
    db = get_fs_client()
    docs = (
        db.collection(XSALES_USERS_COL)
        .where("email", "==", email.strip().lower())
        .limit(1)
        .stream()
    )
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        return {"user": data}
    return {"user": None}


@app.post("/api/xsales/users")
async def xsales_create_user(request: Request, payload: Dict[str, Any] = Body(...)):
    """Create a user. Requires X-Admin-Secret header."""
    _check_admin(request)
    db = get_fs_client()
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    # Duplicate check
    existing = db.collection(XSALES_USERS_COL).where("email", "==", email).limit(1).stream()
    if any(True for _ in existing):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    user_id = str(uuid.uuid4())
    seller = (payload.get("sellerCanonical") or "").strip().lower() or None
    user_data = {
        "email":           email,
        "displayName":     (payload.get("displayName") or "").strip(),
        "role":            payload.get("role", "sales"),
        "sellerCanonical": seller,
        "isActive":        bool(payload.get("isActive", True)),
        "createdAt":       datetime.utcnow().isoformat() + "Z",
        "createdBy":       payload.get("createdBy", "admin"),
    }
    db.collection(XSALES_USERS_COL).document(user_id).set(user_data)
    return {"user": {**user_data, "id": user_id}}


@app.put("/api/xsales/users/{user_id}")
async def xsales_update_user(
    user_id: str, request: Request, payload: Dict[str, Any] = Body(...)
):
    """Update one or more fields of a user. Requires X-Admin-Secret header."""
    _check_admin(request)
    db = get_fs_client()
    doc_ref = db.collection(XSALES_USERS_COL).document(user_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    update_data: Dict[str, Any] = {}
    for field in ["email", "displayName", "role", "sellerCanonical", "isActive"]:
        if field in payload:
            val = payload[field]
            if field == "email":
                val = (val or "").strip().lower()
            elif field == "sellerCanonical":
                val = (val or "").strip().lower() or None
            elif field == "displayName":
                val = (val or "").strip()
            update_data[field] = val
    doc_ref.update(update_data)
    updated = doc_ref.get().to_dict()
    updated["id"] = user_id
    return {"user": updated}


@app.delete("/api/xsales/users/{user_id}")
async def xsales_delete_user(user_id: str, request: Request):
    """Delete a user. Requires X-Admin-Secret header."""
    _check_admin(request)
    db = get_fs_client()
    doc_ref = db.collection(XSALES_USERS_COL).document(user_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    doc_ref.delete()
    return {"deleted": True}


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
