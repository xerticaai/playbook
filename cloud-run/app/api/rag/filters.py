from typing import Optional


def _date_expr(date_field: str) -> str:
    return (
        "COALESCE("
        f"SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), "
        f"SAFE.PARSE_DATE('%d-%m-%Y', {date_field})"
        ")"
    )


def build_filters(
    year: Optional[str],
    quarter: Optional[str],
    seller: Optional[str],
    source: Optional[str],
    phase: Optional[str] = None,
) -> str:
    conditions = []

    if year and quarter:
        fiscal_q = f"FY{year[-2:]}-Q{quarter}"
        conditions.append(f"Fiscal_Q = '{fiscal_q}'")
    elif year:
        fiscal_prefix = f"FY{year[-2:]}-"
        conditions.append(f"STARTS_WITH(Fiscal_Q, '{fiscal_prefix}')")

    if seller:
        sellers = [s.strip() for s in seller.split(",") if s.strip()]
        if len(sellers) == 1:
            conditions.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            conditions.append(f"Vendedor IN ('{sellers_quoted}')")

    if source:
        conditions.append(f"source = '{source}'")

    if phase:
        phases = [p.strip() for p in phase.split(",") if p.strip()]
        if len(phases) == 1:
            conditions.append(f"Fase = '{phases[0]}'")
        elif len(phases) > 1:
            phase_quoted = "', '".join(phases)
            conditions.append(f"Fase IN ('{phase_quoted}')")

    return "WHERE " + " AND ".join(conditions) if conditions else ""


def build_closed_filters(
    year: Optional[str],
    quarter: Optional[str],
    month: Optional[str],
    date_start: Optional[str],
    date_end: Optional[str],
    seller: Optional[str],
    date_field: str,
) -> str:
    filters = []

    parsed_date_expr = _date_expr(date_field)

    if year and quarter:
        fiscal_q = f"FY{year[-2:]}-Q{quarter}"
        filters.append(f"Fiscal_Q = '{fiscal_q}'")
    elif year:
        fiscal_prefix = f"FY{year[-2:]}-"
        filters.append(f"STARTS_WITH(Fiscal_Q, '{fiscal_prefix}')")

    if month and not quarter:
        filters.append(f"EXTRACT(MONTH FROM {parsed_date_expr}) = {int(month)}")

    if quarter and not (year and quarter):
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12),
        }
        q_num = int(quarter)
        if q_num in quarter_months:
            start_month, end_month = quarter_months[q_num]
            filters.append(
                f"EXTRACT(MONTH FROM {parsed_date_expr}) BETWEEN {start_month} AND {end_month}"
            )

    if date_start:
        filters.append(f"{parsed_date_expr} >= DATE('{date_start}')")
    if date_end:
        filters.append(f"{parsed_date_expr} <= DATE('{date_end}')")

    if seller:
        sellers = [s.strip() for s in seller.split(",") if s.strip()]
        if len(sellers) == 1:
            filters.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            filters.append(f"Vendedor IN ('{sellers_quoted}')")

    return "WHERE " + " AND ".join(filters) if filters else ""


def build_pipeline_filters(year: Optional[str], quarter: Optional[str], seller: Optional[str]) -> str:
def build_pipeline_filters(
    year: Optional[str],
    quarter: Optional[str],
    month: Optional[str],
    date_start: Optional[str],
    date_end: Optional[str],
    seller: Optional[str],
    phase: Optional[str] = None,
) -> str:
    filters = []

    parsed_date_expr = _date_expr("Data_Prevista")

    if year and quarter:
        fiscal_q = f"FY{year[-2:]}-Q{quarter}"
        filters.append(f"Fiscal_Q = '{fiscal_q}'")
    elif year:
        fiscal_prefix = f"FY{year[-2:]}-"
        filters.append(f"STARTS_WITH(Fiscal_Q, '{fiscal_prefix}')")

    if month and not quarter:
        filters.append(f"EXTRACT(MONTH FROM {parsed_date_expr}) = {int(month)}")

    if quarter and not (year and quarter):
        quarter_months = {
            1: (1, 3),
            2: (4, 6),
            3: (7, 9),
            4: (10, 12),
        }
        q_num = int(quarter)
        if q_num in quarter_months:
            start_month, end_month = quarter_months[q_num]
            filters.append(
                f"EXTRACT(MONTH FROM {parsed_date_expr}) BETWEEN {start_month} AND {end_month}"
            )

    if date_start:
        filters.append(f"{parsed_date_expr} >= DATE('{date_start}')")
    if date_end:
        filters.append(f"{parsed_date_expr} <= DATE('{date_end}')")

    if seller:
        sellers = [s.strip() for s in seller.split(",") if s.strip()]
        if len(sellers) == 1:
            filters.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            filters.append(f"Vendedor IN ('{sellers_quoted}')")

    if phase:
        phases = [p.strip() for p in phase.split(",") if p.strip()]
        if len(phases) == 1:
            filters.append(f"Fase_Atual = '{phases[0]}'")
        elif len(phases) > 1:
            phase_quoted = "', '".join(phases)
            filters.append(f"Fase_Atual IN ('{phase_quoted}')")

    return "WHERE " + " AND ".join(filters) if filters else ""
