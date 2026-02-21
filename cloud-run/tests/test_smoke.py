"""
Smoke tests – Sales Intelligence API
Verifica que os endpoints respondem sem erros estruturais.
Não requerem credenciais GCP reais: BigQuery é mockado.

Rodar:
    cd cloud-run
    pip install -r tests/requirements-test.txt
    pytest tests/ -v
"""

import sys
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Garante que app/ está no PYTHONPATH ao rodar de cloud-run/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Fixtures de mock ──────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_bigquery():
    """Mock global do BigQuery para todos os testes."""
    mock_client = MagicMock()
    mock_query_result = MagicMock()
    mock_query_result.__iter__ = MagicMock(return_value=iter([]))
    mock_query_result.total_rows = 0
    mock_client.query.return_value = mock_query_result
    mock_client.query.return_value.result.return_value = []

    with patch("google.cloud.bigquery.Client", return_value=mock_client):
        yield mock_client


@pytest.fixture(autouse=True)
def mock_gemini():
    """Mock do Gemini AI para testes que não precisam de IA real."""
    with patch("google.generativeai.configure"):
        with patch("google.generativeai.GenerativeModel"):
            yield


@pytest.fixture()
def client(mock_bigquery, mock_gemini):
    """TestClient do FastAPI com todos os mocks aplicados."""
    from app.simple_api import app
    return TestClient(app, raise_server_exceptions=False)


# ── Testes de saúde e estrutura ───────────────────────────────────────────────

class TestSaude:
    def test_health_retorna_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_tem_campo_status(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert "status" in data

    def test_raiz_retorna_2xx_ou_redirect(self, client):
        resp = client.get("/")
        assert resp.status_code in (200, 301, 302, 307, 308)


# ── Testes de endpoints de dados ─────────────────────────────────────────────

class TestEndpointsDados:
    def test_sellers_retorna_estrutura(self, client):
        resp = client.get("/api/sellers")
        assert resp.status_code in (200, 500)  # 500 aceitável sem BQ real
        if resp.status_code == 200:
            data = resp.json()
            assert "active" in data or isinstance(data, list)

    def test_user_context_retorna_2xx(self, client):
        resp = client.get("/api/user-context")
        assert resp.status_code in (200, 422)  # 422 se falta query param

    def test_metrics_nao_retorna_404(self, client):
        resp = client.get("/api/metrics")
        assert resp.status_code != 404

    def test_pipeline_nao_retorna_404(self, client):
        resp = client.get("/api/pipeline")
        assert resp.status_code != 404

    def test_closed_won_nao_retorna_404(self, client):
        resp = client.get("/api/closed/won")
        assert resp.status_code != 404

    def test_closed_lost_nao_retorna_404(self, client):
        resp = client.get("/api/closed/lost")
        assert resp.status_code != 404

    def test_sales_specialist_nao_retorna_404(self, client):
        resp = client.get("/api/sales-specialist")
        assert resp.status_code != 404


# ── Testes de endpoints dos módulos ──────────────────────────────────────────

class TestEndpointsModulos:
    def test_weekly_agenda_nao_retorna_404(self, client):
        resp = client.get("/weekly-agenda")
        assert resp.status_code != 404

    def test_performance_nao_retorna_404(self, client):
        resp = client.get("/performance")
        assert resp.status_code != 404

    def test_ml_predictions_nao_retorna_404(self, client):
        resp = client.get("/ml/predictions")
        assert resp.status_code != 404

    def test_ai_analysis_nao_retorna_404(self, client):
        resp = client.get("/ai-analysis")
        assert resp.status_code != 404


# ── Testes de inventário de rotas ─────────────────────────────────────────────

class TestInventarioRotas:
    """Garante que nenhuma rota esperada desapareceu após refatoração."""

    ROTAS_ESPERADAS = [
        "/health",
        "/api/sellers",
        "/api/metrics",
        "/api/pipeline",
        "/api/closed/won",
        "/api/closed/lost",
        "/api/sales-specialist",
        "/api/actions",
        "/api/priorities",
        "/weekly-agenda",
        "/performance",
        "/ml/predictions",
        "/ai-analysis",
        "/insights-rag",
        "/export/pauta-semanal-csv",
    ]

    def test_todas_rotas_registradas(self, client):
        rotas_registradas = {route.path for route in client.app.routes}
        faltando = []
        for rota in self.ROTAS_ESPERADAS:
            if rota not in rotas_registradas:
                faltando.append(rota)
        assert not faltando, f"Rotas não encontradas: {faltando}"
