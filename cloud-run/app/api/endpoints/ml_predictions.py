from __future__ import annotations

from fastapi import APIRouter
from google.cloud import bigquery
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Tuple
import os
import re

router = APIRouter()

# Configuration
PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = os.getenv("BQ_DATASET_ID", "sales_intelligence")


def get_bq_client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT_ID)


def _escape_sql_string(value: str) -> str:
    return value.replace("'", "''")


def _normalize_quarter(quarter: Optional[str]) -> Optional[str]:
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


def _build_fiscal_filter(year: Optional[str], quarter: Optional[str], column_name: str = "Fiscal_Quarter") -> str:
    quarter_norm = _normalize_quarter(quarter)
    if year and quarter_norm:
        fiscal_q = f"FY{str(year)[-2:]}-Q{quarter_norm}"
        return f"{column_name} = '{_escape_sql_string(fiscal_q)}'"
    if year:
        return f"{column_name} LIKE 'FY{_escape_sql_string(str(year)[-2:])}-%'"
    return "1=1"


def _build_seller_filter(seller: Optional[str], column_name: str = "Vendedor") -> str:
    if not seller:
        return "1=1"
    sellers = [s.strip() for s in str(seller).split(",") if s.strip()]
    if not sellers:
        return "1=1"
    if len(sellers) == 1:
        return f"{column_name} = '{_escape_sql_string(sellers[0])}'"
    sellers_quoted = "', '".join(_escape_sql_string(s) for s in sellers)
    return f"{column_name} IN ('{sellers_quoted}')"


def _query_to_dict(query: str) -> List[Dict[str, Any]]:
    client = get_bq_client()
    rows = client.query(query).result()
    return [dict(r) for r in rows]


def _table_path(table_or_view: str) -> str:
    return f"`{PROJECT_ID}.{DATASET_ID}.{table_or_view}`"


def _try_fetch(summary_query: str, rows_query: str) -> Tuple[bool, Dict[str, Any], List[Dict[str, Any]]]:
    try:
        summary_rows = _query_to_dict(summary_query)
        summary = summary_rows[0] if summary_rows else {}
        rows = _query_to_dict(rows_query)
        return True, summary, rows
    except Exception:
        return False, {}, []


class MLPredictionsRequest(BaseModel):
    model: str = "all"
    filters: Dict[str, Any] = Field(default_factory=dict)


@router.post("/ml/predictions")
async def ml_predictions(payload: MLPredictionsRequest) -> Dict[str, Any]:
    """Return the BQML model outputs in the shape expected by the dashboard.

    The frontend ML tab expects keys:
    - previsao_ciclo
    - classificador_perda
    - risco_abandono
    - performance_vendedor
    - prioridade_deals
    - proxima_acao
    - previsibilidade
    - recomendacao_produtos
    - deteccao_anomalias
    """

    filters = payload.filters or {}
    year = filters.get("year")
    quarter = filters.get("quarter")
    seller = filters.get("seller")
    limit = int(filters.get("limit") or 250)
    limit = max(25, min(limit, 1000))

    # Canonical column names in the ML pipeline_* artifacts
    fiscal_filter = _build_fiscal_filter(year, quarter, column_name="Fiscal_Q")
    seller_filter = _build_seller_filter(seller, column_name="Vendedor")
    where_clause = f"WHERE {fiscal_filter} AND {seller_filter}"

    # 1) Previsão de ciclo
    previsao_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        AVG(dias_previstos) AS avg_dias_previstos,
        COUNTIF(velocidade_prevista = 'RÁPIDO') AS rapidos,
        COUNTIF(velocidade_prevista = 'NORMAL') AS normais,
        COUNTIF(velocidade_prevista = 'LENTO') AS lentos,
        COUNTIF(velocidade_prevista = 'MUITO_LENTO') AS muito_lentos
      FROM {_table_path('pipeline_previsao_ciclo')}
      {where_clause}
    """
    previsao_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        Vendedor,
        dias_previstos,
        velocidade_prevista,
        SAFE_CAST(Confianca_pct AS FLOAT64) AS confidence_num,
        SAFE_CAST(MEDDIC_Score AS FLOAT64) AS meddic_score,
        SAFE_CAST(BANT_Score AS FLOAT64) AS bant_score,
        SAFE_CAST(Atividades AS INT64) AS atividades,
        SAFE_CAST(Idle_Dias AS INT64) AS idle_days,
        Ultima_Atualizacao AS ultima_atualizacao
      FROM {_table_path('pipeline_previsao_ciclo')}
      {where_clause}
      ORDER BY dias_previstos DESC
      LIMIT {limit}
    """
    enabled, s, deals = _try_fetch(previsao_summary_q, previsao_rows_q)
    previsao_ciclo = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": s,
        "deals": deals,
    }

    # 2) Classificador de perda
    perda_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        COUNTIF(causa_prevista = 'PRECO') AS preco,
        COUNTIF(causa_prevista = 'TIMING') AS timing,
        COUNTIF(causa_prevista = 'CONCORRENTE') AS concorrente,
        COUNTIF(causa_prevista = 'BUDGET') AS budget,
        COUNTIF(causa_prevista = 'FIT') AS fit,
        AVG(confianca_predicao) AS avg_confianca
      FROM {_table_path('pipeline_classificador_perda')}
      {where_clause}
    """
    perda_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        Vendedor,
        causa_prevista,
        confianca_predicao,
        SAFE_CAST(Atividades AS INT64) AS atividades,
        SAFE_CAST(Confianca_pct AS FLOAT64) AS confidence_num,
        prob_preco,
        prob_timing,
        SAFE_CAST(Idle_Dias AS INT64) AS idle_days,
        Ultima_Atualizacao AS ultima_atualizacao,
        prob_budget,
        prob_fit
      FROM {_table_path('pipeline_classificador_perda')}
      {where_clause}
      ORDER BY confianca_predicao DESC
      LIMIT {limit}
    """
    enabled, s, deals = _try_fetch(perda_summary_q, perda_rows_q)
    classificador_perda = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": s,
        "deals": deals,
    }

    # 3) Risco de abandono
    abandono_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        COUNTIF(nivel_risco = 'ALTO') AS alto_risco,
        COUNTIF(nivel_risco = 'MÉDIO') AS medio_risco,
        COUNTIF(nivel_risco = 'BAIXO') AS baixo_risco,
        AVG(prob_abandono) AS avg_prob_abandono
      FROM {_table_path('pipeline_risco_abandono')}
      {where_clause}
    """
    abandono_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        Vendedor,
        nivel_risco,
        prob_abandono,
        fatores_risco,
        acao_recomendada
      FROM {_table_path('pipeline_risco_abandono')}
      {where_clause}
      ORDER BY prob_abandono DESC
      LIMIT {limit}
    """
    enabled, s, deals = _try_fetch(abandono_summary_q, abandono_rows_q)
    risco_abandono = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": s,
        "deals": deals,
    }

    # 4) Performance vendedor
    perf_summary_q = f"""
      SELECT
        COUNT(*) AS total_sellers,
        COUNTIF(classificacao = 'SOBRE_PERFORMANDO') AS sobre_performando,
        COUNTIF(classificacao = 'PERFORMANDO_BEM') AS performando_bem,
        COUNTIF(classificacao = 'NA_META') AS na_meta,
        COUNTIF(classificacao IN ('ABAIXO_META','SUB_PERFORMANDO')) AS abaixo_meta,
        AVG(win_rate_previsto) / 100 AS avg_win_rate
      FROM {_table_path('pipeline_performance_vendedor')}
      WHERE {seller_filter}
    """
    perf_rows_q = f"""
      SELECT
        Vendedor,
        win_rate_previsto,
        delta_performance,
        classificacao,
        ranking,
        deals_pipeline,
        total_pipeline_value,
        valor_previsto_venda
      FROM {_table_path('pipeline_performance_vendedor')}
      WHERE {seller_filter}
      ORDER BY ranking ASC
      LIMIT {limit}
    """
    enabled, s, sellers = _try_fetch(perf_summary_q, perf_rows_q)
    performance_vendedor = {
        "enabled": enabled,
        "total_sellers": int(s.get("total_sellers") or 0),
        "summary": s,
        "sellers": sellers,
    }

    # 5) Priorização de deals
    prio_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        COUNTIF(priority_level = 'CRÍTICO') AS critico,
        COUNTIF(priority_level = 'ALTO') AS alto,
        COUNTIF(priority_level = 'MÉDIO') AS medio,
        COUNTIF(priority_level = 'BAIXO') AS baixo,
        AVG(priority_score) AS avg_priority_score
      FROM {_table_path('pipeline_prioridade_deals')}
      {where_clause}
    """
    prio_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        Vendedor,
        SAFE_CAST(Ciclo_dias AS INT64) AS ciclo_dias,
        SAFE_CAST(Atividades AS INT64) AS atividades,
        priority_score,
        priority_level,
        RANK() OVER (ORDER BY priority_score DESC) AS ranking_global
      FROM {_table_path('pipeline_prioridade_deals')}
      {where_clause}
      QUALIFY ranking_global <= {limit}
      ORDER BY ranking_global ASC
    """
    enabled, s, deals = _try_fetch(prio_summary_q, prio_rows_q)
    prioridade_deals = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": s,
        "deals": deals,
    }

    # 6) Próxima ação
    acao_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        COUNTIF(urgencia = 'ALTA') AS urgentes,
        COUNTIF(urgencia = 'MÉDIA') AS medias,
        COUNTIF(urgencia = 'BAIXA') AS baixas
      FROM {_table_path('pipeline_proxima_acao')}
      {where_clause}
    """
    acao_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        Vendedor,
        urgencia,
        categoria_acao,
        acao_recomendada,
        detalhes_execucao
      FROM {_table_path('pipeline_proxima_acao')}
      {where_clause}
      ORDER BY
        CASE urgencia WHEN 'ALTA' THEN 1 WHEN 'MÉDIA' THEN 2 ELSE 3 END,
        Gross_Value DESC
      LIMIT {limit}
    """
    enabled, s, deals = _try_fetch(acao_summary_q, acao_rows_q)

    # Top categorias (para o KPI "Top Categoria")
    top_categorias: Dict[str, int] = {}
    if enabled:
        try:
            top_q = f"""
              SELECT categoria_acao, COUNT(*) AS total
              FROM {_table_path('pipeline_proxima_acao')}
              {where_clause}
              GROUP BY categoria_acao
              ORDER BY total DESC
              LIMIT 10
            """
            top_rows = _query_to_dict(top_q)
            top_categorias = {str(r.get("categoria_acao")): int(r.get("total") or 0) for r in top_rows if r.get("categoria_acao") is not None}
        except Exception:
            top_categorias = {}

    proxima_acao = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": {**s, "top_categorias": top_categorias},
        "deals": deals,
    }

    # 7) Previsibilidade (win probability)
    previs_summary_q = f"""
      SELECT
        COUNT(*) AS total_deals,
        AVG(prob_win) AS avg_prob_win,
        SUM(expected_gross) AS expected_gross,
        SUM(expected_net) AS expected_net,
        COUNTIF(previsibilidade = 'ALTA') AS alta,
        COUNTIF(previsibilidade = 'MEDIA') AS media,
        COUNTIF(previsibilidade = 'BAIXA') AS baixa
      FROM {_table_path('pipeline_previsibilidade')}
      {where_clause}
    """
    previs_rows_q = f"""
      SELECT
        opportunity,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        Vendedor,
        prob_win,
        prob_loss,
        expected_gross,
        expected_net,
        previsibilidade
      FROM {_table_path('pipeline_previsibilidade')}
      {where_clause}
      ORDER BY expected_gross DESC
      LIMIT {limit}
    """
    enabled, s, deals = _try_fetch(previs_summary_q, previs_rows_q)

    backtest_summary: Dict[str, Any] = {}
    if enabled:
        try:
            backtest_q = f"""
              SELECT
                COUNT(*) AS total_closed,
                COUNTIF(outcome = 'WON') AS won_count,
                COUNTIF(outcome = 'LOST') AS lost_count,
                AVG(CASE WHEN outcome = 'WON' THEN prob_win END) AS avg_prob_win_won,
                AVG(CASE WHEN outcome = 'LOST' THEN prob_win END) AS avg_prob_win_lost,
                AVG(
                  CASE
                    WHEN outcome = 'WON' AND predicted_label = 1 THEN 1
                    WHEN outcome = 'LOST' AND predicted_label = 0 THEN 1
                    ELSE 0
                  END
                ) AS accuracy
              FROM {_table_path('closed_previsibilidade')}
              {where_clause}
            """
            backtest_rows = _query_to_dict(backtest_q)
            backtest_summary = backtest_rows[0] if backtest_rows else {}
        except Exception:
            backtest_summary = {}

    previsibilidade = {
        "enabled": enabled,
        "total_deals": int(s.get("total_deals") or 0),
        "summary": {**s, "backtest": backtest_summary},
        "deals": deals,
    }

    # 8) Recomendacao de produtos
    recomendacao_summary_q = f"""
      SELECT
        COUNT(*) AS total_recomendacoes,
        COUNT(DISTINCT Vendedor) AS total_sellers,
        AVG(score) AS avg_score
      FROM {_table_path('pipeline_recomendacao_produtos')}
      {where_clause}
    """
    recomendacao_rows_q = f"""
      SELECT
        Vendedor,
        Fiscal_Q,
        recomendacao_produto,
        score,
        wins_historico,
        avg_net,
        avg_gross,
        pipeline_deals,
        recomendacao_acao
      FROM {_table_path('pipeline_recomendacao_produtos')}
      {where_clause}
      ORDER BY score DESC
      LIMIT {limit}
    """
    enabled, s, rows = _try_fetch(recomendacao_summary_q, recomendacao_rows_q)
    recomendacao_produtos = {
        "enabled": enabled,
        "total_recomendacoes": int(s.get("total_recomendacoes") or 0),
        "summary": s,
        "rows": rows,
    }

    # 9) Deteccao de anomalias
    anomalia_summary_q = f"""
      SELECT
        COUNT(*) AS total_anomalias,
        COUNT(DISTINCT Vendedor) AS total_sellers,
        COUNTIF(severidade = 'ALTA') AS alta,
        COUNTIF(severidade = 'MEDIA') AS media,
        AVG(anomaly_score) AS avg_score
      FROM {_table_path('pipeline_deteccao_anomalias')}
      {where_clause}
    """
    anomalia_rows_q = f"""
      SELECT
        opportunity,
        Vendedor,
        Fiscal_Q,
        SAFE_CAST(Gross AS FLOAT64) AS Gross_Value,
        SAFE_CAST(Net AS FLOAT64) AS Net_Value,
        SAFE_CAST(Ciclo_dias AS INT64) AS ciclo_dias,
        SAFE_CAST(Idle_Dias AS INT64) AS idle_days,
        SAFE_CAST(Confianca AS FLOAT64) AS confianca,
        anomaly_score,
        severidade,
        acao_recomendada
      FROM {_table_path('pipeline_deteccao_anomalias')}
      {where_clause}
      ORDER BY anomaly_score DESC
      LIMIT {limit}
    """
    enabled, s, rows = _try_fetch(anomalia_summary_q, anomalia_rows_q)
    deteccao_anomalias = {
        "enabled": enabled,
        "total_anomalias": int(s.get("total_anomalias") or 0),
        "summary": s,
        "rows": rows,
    }

    # Response
    return {
        "previsao_ciclo": previsao_ciclo,
        "classificador_perda": classificador_perda,
        "risco_abandono": risco_abandono,
        "performance_vendedor": performance_vendedor,
        "prioridade_deals": prioridade_deals,
        "proxima_acao": proxima_acao,
        "previsibilidade": previsibilidade,
        "recomendacao_produtos": recomendacao_produtos,
        "deteccao_anomalias": deteccao_anomalias,
    }
