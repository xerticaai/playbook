from typing import Optional


def _date_expr(date_field: str) -> str:
    return (
        "COALESCE("
        f"SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), "
        f"SAFE.PARSE_DATE('%d-%m-%Y', {date_field})"
        ")"
    )


def _sql_literal(value: str) -> str:
    return str(value).replace("'", "''")


def _build_in_filter(column_name: str, csv_value: Optional[str]) -> Optional[str]:
    values = [item.strip() for item in str(csv_value or "").split(",") if item and item.strip()]
    if not values:
        return None
    if len(values) == 1:
        return f"{column_name} = '{_sql_literal(values[0])}'"
    quoted = "', '".join(_sql_literal(item) for item in values)
    return f"{column_name} IN ('{quoted}')"


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

    seller_filter = _build_in_filter("Vendedor", seller)
    if seller_filter:
        conditions.append(seller_filter)

    if source:
        conditions.append(f"source = '{_sql_literal(source)}'")

    phase_filter = _build_in_filter("Fase", phase)
    if phase_filter:
        conditions.append(phase_filter)

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
        filters.append(f"{parsed_date_expr} >= DATE('{_sql_literal(date_start)}')")
    if date_end:
        filters.append(f"{parsed_date_expr} <= DATE('{_sql_literal(date_end)}')")

    seller_filter = _build_in_filter("Vendedor", seller)
    if seller_filter:
        filters.append(seller_filter)

    return "WHERE " + " AND ".join(filters) if filters else ""


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
        filters.append(f"{parsed_date_expr} >= DATE('{_sql_literal(date_start)}')")
    if date_end:
        filters.append(f"{parsed_date_expr} <= DATE('{_sql_literal(date_end)}')")

    seller_filter = _build_in_filter("Vendedor", seller)
    if seller_filter:
        filters.append(seller_filter)

    phase_filter = _build_in_filter("Fase_Atual", phase)
    if phase_filter:
        filters.append(phase_filter)

    return "WHERE " + " AND ".join(filters) if filters else ""
