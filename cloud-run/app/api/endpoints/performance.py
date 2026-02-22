"""
Performance Endpoint - Índice de Performance do Vendedor (IPV)

Implementa IPV com capacidade (feriados + férias), consistência semanal e
consonância entre visão de equipe e individual.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import os
import re
import unicodedata
import uuid

from fastapi import APIRouter, HTTPException, Query, Request
from google.cloud import bigquery
from pydantic import BaseModel, Field

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br").strip().rstrip("\\/")
DATASET_ID = os.getenv("BQ_DATASET", "sales_intelligence")
ADMIN_ALLOWED_EMAILS = {
    email.strip().lower()
    for email in os.getenv(
        "ADMIN_ALLOWED_EMAILS",
        "amalia.silva@xertica.com,barbara.pessoa@xertica.com,gustavo.paula@xertica.com",
    ).split(",")
    if email.strip()
}
VACATIONS_TABLE = f"`{PROJECT_ID}.{DATASET_ID}.admin_vacations`"


def get_bq_client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT_ID)


def normalize_quarter(quarter: Optional[str]) -> Optional[str]:
    if quarter is None:
        return None
    q = str(quarter).strip()
    if not q:
        return None
    match = re.search(r"\bQ\s*([1-4])\b", q, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    if q in {"1", "2", "3", "4"}:
        return q
    return q


def normalize_email(raw_email: Optional[str]) -> Optional[str]:
    email = str(raw_email or "").strip().lower()
    if not email:
        return None
    if ":" in email:
        email = email.split(":")[-1].strip().lower()
    return email or None


def extract_request_email(request: Request) -> Optional[str]:
    candidates = [
        request.headers.get("x-goog-authenticated-user-email"),
        request.headers.get("x-authenticated-user-email"),
        request.headers.get("x-forwarded-email"),
        request.headers.get("x-user-email"),
    ]
    for value in candidates:
        parsed = normalize_email(value)
        if parsed:
            return parsed
    return None


def ensure_admin_access(request: Request) -> str:
    email = extract_request_email(request)
    if email not in ADMIN_ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="Acesso restrito ao admin")
    return email


def normalize_seller_key(value: Optional[str]) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text)


def build_fiscal_filter(year: Optional[str], quarter: Optional[str]) -> str:
    quarter_norm = normalize_quarter(quarter)
    if year and quarter_norm:
        return f"Fiscal_Q = 'FY{year[-2:]}-Q{quarter_norm}'"
    if year:
        return f"Fiscal_Q LIKE 'FY{year[-2:]}-%'"
    return "1=1"


def build_seller_filter(seller: Optional[str]) -> str:
    if not seller:
        return "1=1"
    sellers = [s.strip() for s in seller.split(",") if s.strip()]
    sellers_escaped = [s.replace("'", "\\'") for s in sellers]
    if not sellers_escaped:
        return "1=1"
    if len(sellers_escaped) == 1:
        return f"LOWER(TRIM(Vendedor)) = LOWER(TRIM('{sellers_escaped[0]}'))"
    quoted = "', '".join(sellers_escaped)
    return f"LOWER(TRIM(Vendedor)) IN (SELECT LOWER(TRIM(v)) FROM UNNEST(['{quoted}']) AS v)"


def period_bounds(year: Optional[str], quarter: Optional[str]) -> Tuple[date, date, str]:
    today = datetime.utcnow().date()
    if year:
        parsed_year = int(year)
        q = normalize_quarter(quarter)
        if q in {"1", "2", "3", "4"}:
            q_int = int(q)
            start_month = (q_int - 1) * 3 + 1
            start = date(parsed_year, start_month, 1)
            if q_int == 4:
                end = date(parsed_year, 12, 31)
            else:
                end = date(parsed_year, start_month + 3, 1) - timedelta(days=1)
            return start, end, f"FY{str(parsed_year)[-2:]}-Q{q_int}"
        return date(parsed_year, 1, 1), date(parsed_year, 12, 31), f"FY{str(parsed_year)[-2:]}"

    current_q = ((today.month - 1) // 3) + 1
    start_month = (current_q - 1) * 3 + 1
    start = date(today.year, start_month, 1)
    if current_q == 4:
        end = date(today.year, 12, 31)
    else:
        end = date(today.year, start_month + 3, 1) - timedelta(days=1)
    return start, end, f"FY{str(today.year)[-2:]}-Q{current_q}"


def monday_of_week(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_ranges(start: date, end: date) -> List[Tuple[date, date]]:
    ranges: List[Tuple[date, date]] = []
    current = monday_of_week(start)
    while current <= end:
        week_end = current + timedelta(days=6)
        ranges.append((current, week_end))
        current += timedelta(days=7)
    return ranges


def list_holidays_for_range(start: date, end: date) -> set[date]:
    raw = {
        "2025-01-01", "2025-03-03", "2025-03-04", "2025-04-18", "2025-04-21", "2025-05-01",
        "2025-06-19", "2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15", "2025-12-24",
        "2025-12-25", "2025-12-26", "2025-12-31",
        "2026-01-01", "2026-02-02", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21",
        "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15",
        "2026-12-25",
    }
    parsed = {date.fromisoformat(x) for x in raw}
    return {d for d in parsed if start <= d <= end}


def count_business_days(start: date, end: date, holidays: set[date]) -> int:
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in holidays:
            total += 1
        current += timedelta(days=1)
    return total


def overlap_period(a_start: date, a_end: date, b_start: date, b_end: date) -> Optional[Tuple[date, date]]:
    start = max(a_start, b_start)
    end = min(a_end, b_end)
    if start > end:
        return None
    return start, end


def ensure_vacations_table(client: bigquery.Client) -> None:
    query = f"""
    CREATE TABLE IF NOT EXISTS {VACATIONS_TABLE} (
      id STRING,
      seller STRING,
      start_date DATE,
      end_date DATE,
      type STRING,
      notes STRING,
      created_by STRING,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      is_active BOOL
    )
    """
    client.query(query).result()


def load_vacations(client: bigquery.Client, start_date: date, end_date: date) -> Dict[str, List[Tuple[date, date]]]:
    ensure_vacations_table(client)
    query = f"""
    SELECT seller, start_date, end_date
    FROM {VACATIONS_TABLE}
    WHERE is_active = TRUE
      AND start_date <= @end_date
      AND end_date >= @start_date
    """
    job = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_date", "DATE", start_date.isoformat()),
            bigquery.ScalarQueryParameter("end_date", "DATE", end_date.isoformat()),
        ]
    )
    vacations: Dict[str, List[Tuple[date, date]]] = {}
    for row in client.query(query, job_config=job).result():
        key = normalize_seller_key(row.get("seller"))
        if not key:
            continue
        vacations.setdefault(key, []).append((row["start_date"], row["end_date"]))
    return vacations


def load_weekly_activity_and_opps(
    client: bigquery.Client,
    sellers: List[str],
    start_date: date,
    end_date: date,
) -> Dict[str, Dict[str, Dict[str, int]]]:
    if not sellers:
        return {}

    query = f"""
    WITH seller_map AS (
      SELECT s AS seller
      FROM UNNEST(@sellers) s
    ),
    activities_base AS (
      SELECT
        sm.seller AS seller,
        DATE_TRUNC(
          COALESCE(
            SAFE_CAST(Data AS DATE),
            SAFE_CAST(Data_de_criacao AS DATE),
            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING))
          ),
          WEEK(MONDAY)
        ) AS week_start,
        LOWER(COALESCE(Tipo_de_Actividad, '')) AS tipo
      FROM `{PROJECT_ID}.{DATASET_ID}.atividades` a
      JOIN seller_map sm ON LOWER(TRIM(a.Atribuido)) = LOWER(TRIM(sm.seller))
      WHERE COALESCE(
            SAFE_CAST(Data AS DATE),
            SAFE_CAST(Data_de_criacao AS DATE),
            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING))
          ) BETWEEN @start_date AND @end_date
    ),
    activities_agg AS (
      SELECT
        seller,
        week_start,
        COUNT(*) AS total_activities,
        COUNTIF(REGEXP_CONTAINS(tipo, r'reuni[aã]o|videoconfer')) AS meetings
      FROM activities_base
      GROUP BY seller, week_start
    ),
    opps_agg AS (
      SELECT
        p.Vendedor AS seller,
        DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL SAFE_CAST(p.Dias_Funil AS INT64) DAY), WEEK(MONDAY)) AS week_start,
        COUNT(*) AS new_opps
      FROM `{PROJECT_ID}.{DATASET_ID}.pipeline` p
      JOIN seller_map sm ON LOWER(TRIM(p.Vendedor)) = LOWER(TRIM(sm.seller))
      WHERE DATE_SUB(CURRENT_DATE(), INTERVAL SAFE_CAST(p.Dias_Funil AS INT64) DAY) BETWEEN @start_date AND @end_date
        AND p.Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY seller, week_start
    )
    SELECT
      COALESCE(a.seller, o.seller) AS seller,
      COALESCE(a.week_start, o.week_start) AS week_start,
      COALESCE(a.total_activities, 0) AS total_activities,
      COALESCE(a.meetings, 0) AS meetings,
      COALESCE(o.new_opps, 0) AS new_opps
    FROM activities_agg a
    FULL OUTER JOIN opps_agg o
      ON a.seller = o.seller AND a.week_start = o.week_start
    """

    job = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("sellers", "STRING", sellers),
            bigquery.ScalarQueryParameter("start_date", "DATE", start_date.isoformat()),
            bigquery.ScalarQueryParameter("end_date", "DATE", end_date.isoformat()),
        ]
    )

    out: Dict[str, Dict[str, Dict[str, int]]] = {}
    for row in client.query(query, job_config=job).result():
        seller = row.get("seller")
        week_start = row.get("week_start")
        if not seller or not week_start:
            continue
        seller_data = out.setdefault(seller, {})
        seller_data[str(week_start)] = {
            "total_activities": int(row.get("total_activities") or 0),
            "meetings": int(row.get("meetings") or 0),
            "new_opps": int(row.get("new_opps") or 0),
        }
    return out


def compute_capacity_and_consistency(
    sellers: List[str],
    start_date: date,
    end_date: date,
    vacations_by_seller: Dict[str, List[Tuple[date, date]]],
    weekly_metrics: Dict[str, Dict[str, Dict[str, int]]],
) -> Dict[str, Dict[str, Any]]:
    holidays = list_holidays_for_range(start_date, end_date)
    weeks = week_ranges(start_date, end_date)
    per_seller: Dict[str, Dict[str, Any]] = {}

    for seller in sellers:
        vacations = vacations_by_seller.get(normalize_seller_key(seller), [])
        weekly_data = weekly_metrics.get(seller, {})

        business_days_total = 0
        business_days_effective = 0
        holiday_days = 0
        vacation_days = 0

        eligible_weeks = 0
        hit_meet = 0
        hit_opp = 0
        hit_both = 0

        current_streak_both = 0
        best_streak_both = 0

        total_activities = 0
        total_meetings = 0
        total_new_opps = 0
        meta_atividades_total = 0
        meta_novas_opps_total = 0

        for week_start, week_end in weeks:
            period_overlap = overlap_period(week_start, week_end, start_date, end_date)
            if not period_overlap:
                continue
            ws, we = period_overlap

            bd = count_business_days(ws, we, holidays)

            holiday_weekdays = 0
            day_cursor = ws
            while day_cursor <= we:
                if day_cursor.weekday() < 5 and day_cursor in holidays:
                    holiday_weekdays += 1
                day_cursor += timedelta(days=1)
            holiday_days += holiday_weekdays

            vac_bd = 0
            for vac_start, vac_end in vacations:
                overlap = overlap_period(ws, we, vac_start, vac_end)
                if not overlap:
                    continue
                ovs, ove = overlap
                vac_bd += count_business_days(ovs, ove, holidays)

            vac_bd = min(vac_bd, bd)
            ebd = max(0, bd - vac_bd)

            business_days_total += bd
            business_days_effective += ebd
            vacation_days += vac_bd

            key = str(monday_of_week(ws))
            activity_item = weekly_data.get(key, {"total_activities": 0, "meetings": 0, "new_opps": 0})
            meetings = int(activity_item.get("meetings", 0))
            new_opps = int(activity_item.get("new_opps", 0))
            week_activities = int(activity_item.get("total_activities", 0))

            total_activities += week_activities
            total_meetings += meetings
            total_new_opps += new_opps

            if ebd <= 0:
                continue

            eligible_weeks += 1
            goal_meet = round(1.6 * ebd)
            goal_opp = round(0.8 * ebd)

            meta_atividades_total += goal_meet
            meta_novas_opps_total += goal_opp

            meet_hit = 1 if meetings >= goal_meet else 0
            opp_hit = 1 if new_opps >= goal_opp else 0
            both_hit = 1 if (meet_hit and opp_hit) else 0

            hit_meet += meet_hit
            hit_opp += opp_hit
            hit_both += both_hit

            if both_hit:
                current_streak_both += 1
                best_streak_both = max(best_streak_both, current_streak_both)
            else:
                current_streak_both = 0

        hit_rate_meet = (hit_meet / eligible_weeks) if eligible_weeks > 0 else 0
        hit_rate_opp = (hit_opp / eligible_weeks) if eligible_weeks > 0 else 0
        hit_rate_both = (hit_both / eligible_weeks) if eligible_weeks > 0 else 0

        exec_consistency = ((hit_rate_meet * 0.4) + (hit_rate_opp * 0.4) + (hit_rate_both * 0.2)) * 100

        activities_per_effective_day = total_activities / max(1, business_days_effective)
        ativ_score = min(100, (activities_per_effective_day / 2.0) * 100)

        per_seller[seller] = {
            "business_days_total": business_days_total,
            "business_days_effective": business_days_effective,
            "holiday_days": holiday_days,
            "vacation_days": vacation_days,
            "capacity_factor": (business_days_effective / business_days_total) if business_days_total > 0 else 0,
            "eligible_weeks": eligible_weeks,
            "hit_rate_meetings": hit_rate_meet,
            "hit_rate_opps": hit_rate_opp,
            "hit_rate_both": hit_rate_both,
            "current_streak_both": current_streak_both,
            "best_streak_both": best_streak_both,
            "total_activities": total_activities,
            "total_meetings": total_meetings,
            "total_new_opps": total_new_opps,
            "meta_atividades_total": meta_atividades_total,
            "meta_novas_opps_total": meta_novas_opps_total,
            "exec_consistency": exec_consistency,
            "ativ_score_capacity": ativ_score,
        }

    return per_seller


class VacationCreateRequest(BaseModel):
    seller: str = Field(..., min_length=2, max_length=200)
    start_date: date
    end_date: date
    type: Optional[str] = Field(default="ferias", max_length=60)
    notes: Optional[str] = Field(default="", max_length=1000)


@router.get("/admin/vacations")
async def admin_list_vacations(
    request: Request,
    year: Optional[int] = Query(None, description="Filtra férias que tocam o ano informado"),
):
    ensure_admin_access(request)
    client = get_bq_client()
    ensure_vacations_table(client)

    where_year = ""
    if year:
        where_year = """
        AND (
          EXTRACT(YEAR FROM start_date) = @year
          OR EXTRACT(YEAR FROM end_date) = @year
          OR (start_date < DATE(@year, 1, 1) AND end_date > DATE(@year, 12, 31))
        )
        """

    query = f"""
    SELECT id, seller, start_date, end_date, type, notes, created_by, created_at, updated_at, is_active
    FROM {VACATIONS_TABLE}
    WHERE is_active = TRUE
    {where_year}
    ORDER BY start_date DESC, seller ASC
    """

    params: List[Any] = []
    if year:
        params.append(bigquery.ScalarQueryParameter("year", "INT64", year))

    job = bigquery.QueryJobConfig(query_parameters=params)
    rows = [dict(row) for row in client.query(query, job_config=job).result()]

    return {"success": True, "items": rows, "total": len(rows)}


@router.post("/admin/vacations")
async def admin_create_vacation(request: Request, payload: VacationCreateRequest):
    admin_email = ensure_admin_access(request)

    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail="start_date não pode ser maior que end_date")

    client = get_bq_client()
    ensure_vacations_table(client)

    vacation_id = str(uuid.uuid4())
    query = f"""
    INSERT INTO {VACATIONS_TABLE}
    (id, seller, start_date, end_date, type, notes, created_by, created_at, updated_at, is_active)
    VALUES
    (@id, @seller, @start_date, @end_date, @type, @notes, @created_by, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), TRUE)
    """

    job = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", vacation_id),
            bigquery.ScalarQueryParameter("seller", "STRING", payload.seller.strip()),
            bigquery.ScalarQueryParameter("start_date", "DATE", payload.start_date.isoformat()),
            bigquery.ScalarQueryParameter("end_date", "DATE", payload.end_date.isoformat()),
            bigquery.ScalarQueryParameter("type", "STRING", (payload.type or "ferias").strip()),
            bigquery.ScalarQueryParameter("notes", "STRING", (payload.notes or "").strip()),
            bigquery.ScalarQueryParameter("created_by", "STRING", admin_email),
        ]
    )
    client.query(query, job_config=job).result()

    return {"success": True, "id": vacation_id}


@router.delete("/admin/vacations/{vacation_id}")
async def admin_delete_vacation(request: Request, vacation_id: str):
    ensure_admin_access(request)

    client = get_bq_client()
    ensure_vacations_table(client)

    query = f"""
    UPDATE {VACATIONS_TABLE}
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP()
    WHERE id = @id
    """

    job = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("id", "STRING", vacation_id)]
    )
    client.query(query, job_config=job).result()

    return {"success": True, "id": vacation_id}


@router.get("/performance")
async def get_performance(
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    seller: Optional[str] = Query(None, description="Vendedor ou múltiplos separados por vírgula"),
):
    try:
        client = get_bq_client()
        fiscal_filter = build_fiscal_filter(year, quarter)
        seller_filter = build_seller_filter(seller)
        period_start, period_end, period_label = period_bounds(year, quarter)

        won_query = f"""
        SELECT
            Vendedor,
            COUNT(*) as total_ganhos,
            ROUND(SUM(Gross), 2) as gross_ganho,
            ROUND(SUM(Net), 2) as net_ganho,
            ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as ciclo_medio_win,
            ROUND(AVG(SAFE_CAST(Atividades AS FLOAT64)), 1) as ativ_media_win,
            APPROX_TOP_COUNT(COALESCE(Causa_Raiz, 'Não informado'), 1)[OFFSET(0)].value as top_win_factor
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE {fiscal_filter}
          AND {seller_filter}
          AND Vendedor IS NOT NULL
        GROUP BY Vendedor
        """

        lost_query = f"""
        SELECT
            Vendedor,
            COUNT(*) as total_perdas,
            ROUND(SUM(Gross), 2) as gross_perdido,
            ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as ciclo_medio_loss,
            ROUND(AVG(SAFE_CAST(Atividades AS FLOAT64)), 1) as ativ_media_loss,
            COUNTIF(Evitavel = 'Sim') as perdas_evitaveis,
            APPROX_TOP_COUNT(COALESCE(Causa_Raiz, 'Não informado'), 1)[OFFSET(0)].value as top_loss_cause
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        WHERE {fiscal_filter}
          AND {seller_filter}
          AND Vendedor IS NOT NULL
        GROUP BY Vendedor
        """

        pipeline_query = f"""
        SELECT
            Vendedor,
            COUNT(*) as total_pipeline,
            ROUND(AVG(Gross), 2) as ticket_medio_pipeline
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Vendedor IS NOT NULL
          AND {seller_filter}
          AND Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
        GROUP BY Vendedor
        """

        won_data = {row["Vendedor"]: dict(row) for row in client.query(won_query).result()}
        lost_data = {row["Vendedor"]: dict(row) for row in client.query(lost_query).result()}
        pipeline_data = {row["Vendedor"]: dict(row) for row in client.query(pipeline_query).result()}

        all_sellers_set = set(list(won_data.keys()) + list(lost_data.keys()))

        # Garante que vendedores explicitamente solicitados apareçam mesmo sem deals fechados
        if seller:
            for s in [s.strip() for s in seller.split(",") if s.strip()]:
                s_key = normalize_seller_key(s)
                # Procura o nome exato como está nos dados (insensível a case)
                match = next((k for k in all_sellers_set if normalize_seller_key(k) == s_key), None)
                if not match:
                    all_sellers_set.add(s)  # adiciona com nome original

        all_sellers = sorted(all_sellers_set)
        if not all_sellers:
            return {
                "success": True,
                "timestamp": datetime.utcnow().isoformat(),
                "filters": {"year": year, "quarter": quarter, "seller": seller},
                "period": {"label": period_label, "start": period_start.isoformat(), "end": period_end.isoformat()},
                "total_vendedores": 0,
                "ranking": [],
                "scorecard": [],
                "comportamento": [],
                "metadata": {},
            }

        vacations = load_vacations(client, period_start, period_end)
        weekly_metrics = load_weekly_activity_and_opps(client, all_sellers, period_start, period_end)
        capacity_metrics = compute_capacity_and_consistency(all_sellers, period_start, period_end, vacations, weekly_metrics)

        seller_performance: List[Dict[str, Any]] = []

        for vendedor in all_sellers:
            won = won_data.get(vendedor, {})
            lost = lost_data.get(vendedor, {})
            pipeline = pipeline_data.get(vendedor, {})
            capacity = capacity_metrics.get(vendedor, {})

            total_ganhos = won.get("total_ganhos", 0) or 0
            total_perdas = lost.get("total_perdas", 0) or 0
            total_deals = total_ganhos + total_perdas

            gross_ganho = won.get("gross_ganho", 0) or 0
            net_ganho = won.get("net_ganho", 0) or 0
            gross_perdido = lost.get("gross_perdido", 0) or 0

            ciclo_win = won.get("ciclo_medio_win", 0) or 0
            ciclo_loss = lost.get("ciclo_medio_loss", 0) or 0

            ativ_win = won.get("ativ_media_win", 0) or 0
            ativ_loss = lost.get("ativ_media_loss", 0) or 0
            perdas_evitaveis = lost.get("perdas_evitaveis", 0) or 0

            top_win_factor = won.get("top_win_factor", "N/A")
            top_loss_cause = lost.get("top_loss_cause", "N/A")

            ticket_medio = pipeline.get("ticket_medio_pipeline", 0) or (
                gross_ganho / total_ganhos if total_ganhos > 0 else 0
            )

            win_rate = (total_ganhos / total_deals * 100) if total_deals > 0 else 0

            if ciclo_loss > 0 and ciclo_win > 0:
                reducao_ciclo = (1 - (ciclo_win / ciclo_loss)) * 100
                eficiencia_ciclo = max(0, min(100, 50 + reducao_ciclo))
            elif ciclo_win > 0:
                eficiencia_ciclo = 50
            else:
                eficiencia_ciclo = 0

            eficiencia_score = (win_rate * 0.6) + (eficiencia_ciclo * 0.4)

            if total_perdas > 0:
                pct_evitavel = (perdas_evitaveis / total_perdas) * 100
                qualidade_processo = 100 - pct_evitavel
            else:
                qualidade_processo = 100

            ativ_score_capacity = capacity.get("ativ_score_capacity", 0)
            exec_consistency = capacity.get("exec_consistency", 0)

            meta_ativ = capacity.get("meta_atividades_total", 0)
            meta_opps = capacity.get("meta_novas_opps_total", 0)
            total_ativ = capacity.get("total_activities", 0)
            total_opps = capacity.get("total_new_opps", 0)

            atingimento_atividades = min(100, (total_ativ / meta_ativ) * 100) if meta_ativ > 0 else 0
            atingimento_novas_opps = min(100, (total_opps / meta_opps) * 100) if meta_opps > 0 else 0

            comportamento_score = (
                (atingimento_atividades * 0.35)
                + (atingimento_novas_opps * 0.20)
                + (qualidade_processo * 0.25)
                + (exec_consistency * 0.20)
            )

            seller_performance.append(
                {
                    "vendedor": vendedor,
                    "total_ganhos": total_ganhos,
                    "total_perdas": total_perdas,
                    "total_deals": total_deals,
                    "gross_ganho": gross_ganho,
                    "net_ganho": net_ganho,
                    "gross_perdido": gross_perdido,
                    "win_rate": round(win_rate, 1),
                    "ciclo_medio_win": round(ciclo_win, 1),
                    "ciclo_medio_loss": round(ciclo_loss, 1),
                    "ticket_medio": round(ticket_medio, 2),
                    "ativ_media_win": round(ativ_win, 1),
                    "ativ_media_loss": round(ativ_loss, 1),
                    "perdas_evitaveis": perdas_evitaveis,
                    "top_win_factor": top_win_factor,
                    "top_loss_cause": top_loss_cause,
                    "resultado_raw": {"deals_ganhos": total_ganhos, "revenue": net_ganho},
                    "eficiencia_score": round(eficiencia_score, 1),
                    "comportamento_score": round(comportamento_score, 1),
                    "eficiencia_ciclo": round(eficiencia_ciclo, 1),
                    "qualidade_processo": round(qualidade_processo, 1),
                    "ativ_score_capacity": round(ativ_score_capacity, 1),
                    "exec_consistency": round(exec_consistency, 1),
                    "atingimento_atividades": round(atingimento_atividades, 1),
                    "atingimento_novas_opps": round(atingimento_novas_opps, 1),
                    "meta_atividades": meta_ativ,
                    "meta_novas_opps": meta_opps,
                    "capacity": capacity,
                    "eligible_for_ranking": (capacity.get("eligible_weeks", 0) > 0),
                }
            )

        ranking_base = [s for s in seller_performance if s.get("eligible_for_ranking")]

        if ranking_base:
            max_deals = max(s["resultado_raw"]["deals_ganhos"] for s in ranking_base)
            max_revenue = max(max(0, s["resultado_raw"]["revenue"]) for s in ranking_base)

            for seller_item in ranking_base:
                deals_norm = (
                    seller_item["resultado_raw"]["deals_ganhos"] / max_deals * 100
                    if max_deals > 0
                    else 0
                )
                revenue_value = max(0, seller_item["resultado_raw"]["revenue"])
                revenue_norm = (revenue_value / max_revenue * 100) if max_revenue > 0 else 0

                resultado_score = (deals_norm * 0.25) + (revenue_norm * 0.75)
                seller_item["resultado_score"] = round(resultado_score, 1)

                ipv = (
                    (resultado_score * 0.40)
                    + (seller_item["eficiencia_score"] * 0.35)
                    + (seller_item["comportamento_score"] * 0.25)
                )

                if seller_item["net_ganho"] <= 0:
                    ipv = min(ipv, 20)

                seller_item["ipv"] = round(ipv, 1)

        for seller_item in seller_performance:
            if "ipv" not in seller_item:
                seller_item["resultado_score"] = 0.0
                seller_item["ipv"] = 0.0

        ranking_base.sort(key=lambda x: x["ipv"], reverse=True)

        ranking = []
        for idx, seller_item in enumerate(ranking_base):
            ranking.append(
                {
                    "rank": idx + 1,
                    "vendedor": seller_item["vendedor"],
                    "ipv": seller_item["ipv"],
                    "resultado": seller_item["resultado_score"],
                    "eficiencia": seller_item["eficiencia_score"],
                    "comportamento": seller_item["comportamento_score"],
                    "winRate": seller_item["win_rate"],
                    "grossGerado": seller_item["gross_ganho"],
                    "netGerado": seller_item["net_ganho"],
                }
            )

        scorecard = []
        for seller_item in seller_performance:
            cap = seller_item.get("capacity", {})
            scorecard.append(
                {
                    "vendedor": seller_item["vendedor"],
                    "winRate": seller_item["win_rate"],
                    "totalGanhos": seller_item["total_ganhos"],
                    "totalPerdas": seller_item["total_perdas"],
                    "cicloMedioWin": seller_item["ciclo_medio_win"],
                    "cicloMedioLoss": seller_item["ciclo_medio_loss"],
                    "ticketMedio": seller_item["ticket_medio"],
                    "grossGerado": seller_item["gross_ganho"],
                    "netGerado": seller_item["net_ganho"],
                    "totalAtividades": cap.get("total_activities", 0),
                    "businessDaysTotal": cap.get("business_days_total", 0),
                    "businessDaysEffective": cap.get("business_days_effective", 0),
                    "holidayDays": cap.get("holiday_days", 0),
                    "vacationDays": cap.get("vacation_days", 0),
                    "capacityFactor": round(cap.get("capacity_factor", 0) * 100, 1),
                    "eligibleWeeks": cap.get("eligible_weeks", 0),
                    "eligibleForRanking": seller_item.get("eligible_for_ranking", False),
                }
            )

        comportamento = []
        for seller_item in seller_performance:
            cap = seller_item.get("capacity", {})
            comportamento.append(
                {
                    "vendedor": seller_item["vendedor"],
                    "ativMediaWin": seller_item["ativ_media_win"],
                    "ativMediaLoss": seller_item["ativ_media_loss"],
                    "principalCausaPerda": seller_item["top_loss_cause"],
                    "principalFatorSucesso": seller_item["top_win_factor"],
                    "hitRateMeetings": round(cap.get("hit_rate_meetings", 0) * 100, 1),
                    "hitRateOpps": round(cap.get("hit_rate_opps", 0) * 100, 1),
                    "hitRateBoth": round(cap.get("hit_rate_both", 0) * 100, 1),
                    "currentStreakBoth": cap.get("current_streak_both", 0),
                    "bestStreakBoth": cap.get("best_streak_both", 0),
                    "execConsistency": round(seller_item.get("exec_consistency", 0), 1),
                    "ativScoreCapacity": round(seller_item.get("ativ_score_capacity", 0), 1),
                    "atingimentoAtividades": round(seller_item.get("atingimento_atividades", 0), 1),
                    "atingimentoNovasOpps": round(seller_item.get("atingimento_novas_opps", 0), 1),
                    "metaAtividades": seller_item.get("meta_atividades", 0),
                    "metaNovasOpps": seller_item.get("meta_novas_opps", 0),
                    "totalAtividades": cap.get("total_activities", 0),
                    "totalNovasOpps": cap.get("total_new_opps", 0),
                }
            )

        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "filters": {"year": year, "quarter": quarter, "seller": seller},
            "period": {"label": period_label, "start": period_start.isoformat(), "end": period_end.isoformat()},
            "total_vendedores": len(seller_performance),
            "ranking": ranking,
            "scorecard": scorecard,
            "comportamento": comportamento,
            "metadata": {
                "ipv_formula": "IPV = Resultado (40%) + Eficiencia (35%) + Comportamento (25%)",
                "resultado": "0.25*deals_norm + 0.75*net_norm (universo elegivel)",
                "eficiencia": "0.6*win_rate + 0.4*eficiencia_ciclo",
                "comportamento": "0.35*ating_atividades + 0.20*ating_novas_opps + 0.25*qualidade_processo + 0.20*exec_consistency",
                "capacity": "BD (dias uteis sem feriado), VAC (ferias em BD), EBD = BD - VAC",
                "goals": "meet=round(1.6*EBD), opp=round(0.8*EBD)",
                "sources": {
                    "won": "closed_deals_won",
                    "lost": "closed_deals_lost",
                    "pipeline": "pipeline",
                    "activities": "atividades",
                    "vacations": "admin_vacations",
                },
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance calculation error: {str(e)}")


@router.get("/performance/seller/{seller_name}")
async def get_seller_performance(
    request: Request,
    seller_name: str,
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
):
    try:
        result = await get_performance(year=year, quarter=quarter, seller=seller_name)

        key = normalize_seller_key(seller_name)
        performance_item = next((x for x in result.get("ranking", []) if normalize_seller_key(x.get("vendedor")) == key), None)
        scorecard_item = next((x for x in result.get("scorecard", []) if normalize_seller_key(x.get("vendedor")) == key), None)
        comportamento_item = next((x for x in result.get("comportamento", []) if normalize_seller_key(x.get("vendedor")) == key), None)

        if not performance_item:
            raise HTTPException(status_code=404, detail=f"Vendedor '{seller_name}' não encontrado no ranking elegível")

        return {
            "success": True,
            "vendedor": seller_name,
            "performance": performance_item,
            "scorecard": scorecard_item or {},
            "comportamento": comportamento_item or {},
            "filters": result.get("filters", {}),
            "period": result.get("period", {}),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller performance error: {str(e)}")


@router.get("/seller-timeline/{seller_name}")
async def get_seller_timeline(
    seller_name: str,
    quarters: int = Query(4, description="Número de quarters passados para análise (padrão: 4)"),
):
    try:
        client = get_bq_client()

        quarters_query = f"""
        SELECT DISTINCT Fiscal_Q
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE Fiscal_Q IS NOT NULL
        ORDER BY Fiscal_Q DESC
        LIMIT {quarters}
        """

        fiscal_quarters = [row["Fiscal_Q"] for row in client.query(quarters_query).result()]

        if not fiscal_quarters:
            return {
                "success": True,
                "vendedor": seller_name,
                "timeline": [],
                "media_time": {"ipv": 0, "winRate": 0},
            }

        timeline_data = []
        ipv_sum = 0
        wr_sum = 0

        for fiscal_q in fiscal_quarters:
            year_part = "20" + fiscal_q.split("-")[0][2:]
            quarter_part = fiscal_q.split("-Q")[1]

            result = await get_performance(year=year_part, quarter=quarter_part, seller=seller_name)
            key = normalize_seller_key(seller_name)
            seller_data = next((x for x in result.get("ranking", []) if normalize_seller_key(x.get("vendedor")) == key), None)

            if seller_data:
                timeline_data.append(
                    {
                        "quarter": fiscal_q,
                        "ipv": seller_data.get("ipv", 0),
                        "resultado": seller_data.get("resultado", 0),
                        "eficiencia": seller_data.get("eficiencia", 0),
                        "comportamento": seller_data.get("comportamento", 0),
                        "netGerado": seller_data.get("netGerado", 0),
                        "winRate": seller_data.get("winRate", 0),
                    }
                )
                ipv_sum += seller_data.get("ipv", 0)
                wr_sum += seller_data.get("winRate", 0)

        media_ipv = round(ipv_sum / len(timeline_data), 1) if timeline_data else 0
        media_wr = round(wr_sum / len(timeline_data), 1) if timeline_data else 0

        return {
            "success": True,
            "vendedor": seller_name,
            "timeline": timeline_data,
            "media_time": {"ipv": media_ipv, "winRate": media_wr},
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller timeline error: {str(e)}")


@router.get("/seller-deals/{seller_name}")
async def get_seller_deals(
    seller_name: str,
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    top_n: int = Query(5, description="Número de top deals para retornar (padrão: 5)"),
):
    try:
        client = get_bq_client()
        seller_name_escaped = seller_name.replace("'", "\\'")

        fiscal_filter = build_fiscal_filter(year, quarter)

        top_wins_query = f"""
        SELECT
            Oportunidade as nome,
            ROUND(Net, 2) as net,
            ROUND(Gross, 2) as gross,
            CAST(Ciclo_dias AS INT64) as ciclo_dias,
            Causa_Raiz as motivo,
            Fiscal_Q as quarter
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE {fiscal_filter}
          AND LOWER(TRIM(Vendedor)) = LOWER(TRIM('{seller_name_escaped}'))
          AND Oportunidade IS NOT NULL
        ORDER BY Net DESC
        LIMIT {top_n}
        """

        top_losses_query = f"""
        SELECT
            Oportunidade as nome,
            ROUND(Gross, 2) as gross_potencial,
            CAST(Ciclo_dias AS INT64) as ciclo_dias,
            Causa_Raiz as motivo,
            CAST(NULL AS STRING) as evitavel,
            Fiscal_Q as quarter
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        WHERE {fiscal_filter}
          AND LOWER(TRIM(Vendedor)) = LOWER(TRIM('{seller_name_escaped}'))
          AND Oportunidade IS NOT NULL
        ORDER BY Gross DESC
        LIMIT {top_n}
        """

        pipeline_hot_query = f"""
        SELECT
            Oportunidade as nome,
            ROUND(Net, 2) as net,
            ROUND(Gross, 2) as gross,
            CAST(Confianca AS INT64) as confianca,
            Fase_Atual as stage,
            ROUND(Net * (Confianca / 100), 2) as expected_value
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE LOWER(TRIM(Vendedor)) = LOWER(TRIM('{seller_name_escaped}'))
          AND Oportunidade IS NOT NULL
          AND Confianca >= 50
        ORDER BY expected_value DESC
        LIMIT {top_n}
        """

        top_wins = [dict(row) for row in client.query(top_wins_query).result()]
        top_losses = [dict(row) for row in client.query(top_losses_query).result()]
        pipeline_hot = [dict(row) for row in client.query(pipeline_hot_query).result()]

        return {
            "success": True,
            "vendedor": seller_name,
            "top_wins": top_wins,
            "top_losses": top_losses,
            "pipeline_hot": pipeline_hot,
            "filters": {"year": year, "quarter": quarter, "top_n": top_n},
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller deals error: {str(e)}")
