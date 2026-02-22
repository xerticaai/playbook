from typing import Optional


def build_filters(
    year: Optional[str],
    quarter: Optional[str],
    seller: Optional[str],
    source: Optional[str],
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

    return "WHERE " + " AND ".join(conditions) if conditions else ""


def build_closed_filters(
    year: Optional[str],
    quarter: Optional[str],
    seller: Optional[str],
    date_field: str,
) -> str:
    filters = []

    if year:
        filters.append(
            "EXTRACT(YEAR FROM COALESCE("
            f"SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), "
            f"SAFE.PARSE_DATE('%d-%m-%Y', {date_field})"
            f")) = {int(year)}"
        )

    if quarter:
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
                "EXTRACT(MONTH FROM COALESCE("
                f"SAFE.PARSE_DATE('%Y-%m-%d', {date_field}), "
                f"SAFE.PARSE_DATE('%d-%m-%Y', {date_field})"
                f")) BETWEEN {start_month} AND {end_month}"
            )

    if seller:
        sellers = [s.strip() for s in seller.split(",") if s.strip()]
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
            4: (10, 12),
        }
        q_num = int(quarter)
        if q_num in quarter_months:
            start_month, end_month = quarter_months[q_num]
            filters.append(
                f"EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) BETWEEN {start_month} AND {end_month}"
            )

    if seller:
        sellers = [s.strip() for s in seller.split(",") if s.strip()]
        if len(sellers) == 1:
            filters.append(f"Vendedor = '{sellers[0]}'")
        elif len(sellers) > 1:
            sellers_quoted = "', '".join(sellers)
            filters.append(f"Vendedor IN ('{sellers_quoted}')")

    return "WHERE " + " AND ".join(filters) if filters else ""
