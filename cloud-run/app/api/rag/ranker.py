from typing import Any, Dict, List


def enrich_similarity_scores(deals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for deal in deals:
        try:
            distance = float(deal.get("distance") or 0)
        except (TypeError, ValueError):
            distance = 1.0

        similarity = max(0.0, min(1.0, 1.0 - distance))
        deal["similarity"] = round(similarity, 4)

    return deals


def apply_similarity_threshold(deals: List[Dict[str, Any]], min_similarity: float = 0.0) -> List[Dict[str, Any]]:
    threshold = max(0.0, min(1.0, float(min_similarity)))
    return [deal for deal in deals if float(deal.get("similarity") or 0.0) >= threshold]
