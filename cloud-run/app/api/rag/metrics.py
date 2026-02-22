from typing import Any, Dict, List


def build_quality_metrics(
    deals: List[Dict[str, Any]],
    *,
    requested_top_k: int,
    min_similarity: float,
    threshold_relaxed: bool,
    raw_retrieved_count: int | None = None,
) -> Dict[str, Any]:
    similarities = [float(item.get("similarity") or 0.0) for item in deals]
    rank_scores = [float(item.get("rag_rank_score") or 0.0) for item in deals]

    post_filter_count = len(deals)
    pre_filter_count = int(raw_retrieved_count) if raw_retrieved_count is not None else post_filter_count
    coverage_ratio = (post_filter_count / requested_top_k) if requested_top_k > 0 else 0.0
    pre_filter_coverage_ratio = (pre_filter_count / requested_top_k) if requested_top_k > 0 else 0.0
    precision_at_5 = _precision_like(similarities, 5, min_similarity)
    precision_at_10 = _precision_like(similarities, 10, min_similarity)

    return {
        "requested_top_k": requested_top_k,
        "retrieved_count_pre_filter": pre_filter_count,
        "retrieved_count_post_filter": post_filter_count,
        "coverage_ratio": round(coverage_ratio, 4),
        "coverage_ratio_pre_filter": round(pre_filter_coverage_ratio, 4),
        "min_similarity": round(float(min_similarity), 4),
        "avg_similarity": round(_avg(similarities), 4),
        "max_similarity": round(max(similarities), 4) if similarities else 0.0,
        "avg_rank_score": round(_avg(rank_scores), 4),
        "precision_at_5": round(precision_at_5, 4),
        "precision_at_10": round(precision_at_10, 4),
        "threshold_relaxed": bool(threshold_relaxed),
    }


def _precision_like(similarities: List[float], k: int, min_similarity: float) -> float:
    if not similarities:
        return 0.0
    top = similarities[: max(1, k)]
    hits = sum(1 for value in top if value >= float(min_similarity))
    return hits / len(top)


def _avg(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)
