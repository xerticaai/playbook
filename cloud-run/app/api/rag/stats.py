from typing import Any, Dict, List


def summarize_deals_stats(deals: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not deals:
        return {
            "total": 0,
            "by_source": {},
            "avg_idle_days": 0,
            "avg_cycle_days": 0,
            "top_sellers": [],
            "top_accounts": [],
        }

    by_source: Dict[str, int] = {}
    seller_totals: Dict[str, int] = {}
    account_totals: Dict[str, int] = {}
    seller_gross_totals: Dict[str, float] = {}
    account_gross_totals: Dict[str, float] = {}
    idle_values: List[float] = []
    cycle_values: List[float] = []

    for deal in deals:
        source = deal.get("source") or "unknown"
        by_source[source] = by_source.get(source, 0) + 1

        try:
            idle_value = float(deal.get("Dias_Idle") or deal.get("dias_idle") or 0)
        except (TypeError, ValueError):
            idle_value = 0

        try:
            cycle_value = float(deal.get("Ciclo_dias") or deal.get("ciclo_dias") or deal.get("Ciclo") or 0)
        except (TypeError, ValueError):
            cycle_value = 0

        if idle_value > 0:
            idle_values.append(idle_value)
        if cycle_value > 0:
            cycle_values.append(cycle_value)

        seller = deal.get("Vendedor") or "N/A"
        seller_totals[seller] = seller_totals.get(seller, 0) + 1

        try:
            gross_value = float(deal.get("Gross") or 0)
        except (TypeError, ValueError):
            gross_value = 0

        seller_gross_totals[seller] = seller_gross_totals.get(seller, 0.0) + gross_value

        account = deal.get("Conta") or "N/A"
        account_totals[account] = account_totals.get(account, 0) + 1
        account_gross_totals[account] = account_gross_totals.get(account, 0.0) + gross_value

    avg_idle = sum(idle_values) / len(idle_values) if idle_values else 0
    avg_cycle = sum(cycle_values) / len(cycle_values) if cycle_values else 0

    top_sellers: List[Dict[str, Any]] = [
        {
            "name": name,
            "count": count,
            "total_gross": round(seller_gross_totals.get(name, 0.0), 2),
            "avg_gross": round((seller_gross_totals.get(name, 0.0) / count), 2) if count else 0,
        }
        for name, count in sorted(seller_totals.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    top_accounts: List[Dict[str, Any]] = [
        {
            "name": name,
            "count": count,
            "total_gross": round(account_gross_totals.get(name, 0.0), 2),
            "avg_gross": round((account_gross_totals.get(name, 0.0) / count), 2) if count else 0,
        }
        for name, count in sorted(account_totals.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    return {
        "total": len(deals),
        "by_source": by_source,
        "avg_idle_days": round(avg_idle, 2),
        "avg_cycle_days": round(avg_cycle, 2),
        "top_sellers": top_sellers,
        "top_accounts": top_accounts,
    }
