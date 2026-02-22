import re
from typing import Any, Dict, List, Optional


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


def rerank_deals_by_context(
    deals: List[Dict[str, Any]],
    *,
    query_text: str,
    seller: Optional[str] = None,
    source: Optional[str] = None,
    fiscal_q: Optional[str] = None,
) -> List[Dict[str, Any]]:
    query_tokens = _tokenize(query_text)
    normalized_seller = str(seller or "").strip().lower()
    normalized_source = str(source or "").strip().lower()
    normalized_fiscal_q = str(fiscal_q or "").strip().upper()

    reranked: List[Dict[str, Any]] = []
    for deal in deals:
        similarity = float(deal.get("similarity") or 0.0)

        searchable_text = " ".join(
            [
                str(deal.get("Oportunidade") or ""),
                str(deal.get("Produtos") or ""),
                str(deal.get("Segmento") or ""),
                str(deal.get("Portfolio") or ""),
                str(deal.get("content") or ""),
            ]
        )
        lexical_score = _lexical_overlap_score(query_tokens, searchable_text)

        contextual_boost = 0.0

        if normalized_seller and str(deal.get("Vendedor") or "").strip().lower() == normalized_seller:
            contextual_boost += 0.12

        if normalized_source and str(deal.get("source") or "").strip().lower() == normalized_source:
            contextual_boost += 0.08

        if normalized_fiscal_q and str(deal.get("Fiscal_Q") or "").strip().upper() == normalized_fiscal_q:
            contextual_boost += 0.08

        rank_score = (0.72 * similarity) + (0.28 * lexical_score) + contextual_boost
        deal["rag_rank_score"] = round(rank_score, 4)
        deal["rag_lexical_score"] = round(lexical_score, 4)
        reranked.append(deal)

    reranked.sort(key=lambda item: float(item.get("rag_rank_score") or 0.0), reverse=True)
    return reranked


def _tokenize(text: str) -> List[str]:
    return [token for token in re.split(r"[^\wÀ-ÿ]+", str(text or "").lower()) if len(token) > 2]


def _lexical_overlap_score(query_tokens: List[str], candidate_text: str) -> float:
    if not query_tokens:
        return 0.0
    candidate_tokens = set(_tokenize(candidate_text))
    if not candidate_tokens:
        return 0.0
    overlap = sum(1 for token in query_tokens if token in candidate_tokens)
    return overlap / max(1, len(set(query_tokens)))
