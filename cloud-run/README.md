# ☁️ Sales Intelligence Cloud Run API

**FastAPI application for BigQuery data access and ML predictions**

---

## 📁 Project Structure

```
cloud-run/
├── app/
│   ├── simple_api.py           # FastAPI application entry point
│   └── api/
│       └── endpoints/          # Endpoints modulares
│           ├── ai_analysis.py
│           └── performance.py
├── tests/
│   └── test_endpoints.py       # API endpoint tests
├── bqml/                       # BigQuery ML model queries
│   ├── classificador_perda.sql
│   ├── performance_vendedor.sql
│   ├── previsao_ciclo.sql
│   ├── prioridade_deal.sql
│   ├── proxima_acao.sql
│   └── risco_abandono.sql
├── requirements.txt
├── Dockerfile
├── deploy.sh                   # Cloud Run deployment script
└── README.md
```

---

## 🚀 Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   cd cloud-run
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Set environment variables**:
   ```bash
   export PROJECT_ID="operaciones-br"
   export DATASET_ID="sales_intelligence"
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
   ```

3. **Run locally**:
   ```bash
  uvicorn simple_api:app --reload --port 8080
   ```

4. **Access**:
   - API: http://localhost:8080
   - Interactive Docs: http://localhost:8080/docs
   - ReDoc: http://localhost:8080/redoc
   - Health Check: http://localhost:8080/health

---

## 🌐 API Endpoints

### Health & Info
- `GET /` - Root endpoint with API info
- `GET /health` - Health check with service status

### Pipeline
- `GET /api/pipeline` - Get pipeline records
  - Query params: `fiscal_q`, `vendedor`, `forecast_category`, `min_gross`, `limit`

### Closed Deals
- `GET /api/closed/won` - Get closed won deals
  - Query params: `fiscal_q`, `vendedor`, `has_analysis`, `limit`
- `GET /api/closed/lost` - Get closed lost deals
  - Query params: `fiscal_q`, `vendedor`, `has_deep_analysis`, `evitavel`, `limit`

### Metrics
- `GET /api/metrics` - Summary metrics across all tables
  - Query params: `fiscal_q`, `vendedor`

### Analytics
- `GET /api/top-sellers` - Top performing vendors
  - Query params: `fiscal_q`, `metric`, `limit`
- `GET /api/analyze-patterns` - Win/Loss analysis with reasons
  - Query params: `fiscal_q`, `vendedor`

### ML Predictions
- `POST /api/ml/predictions` - Fetch ML outputs for the dashboard
  - Body: `{ "year": 2026, "quarter": 1, "seller": "Nome" }` (todos opcionais)
  - Returns: 6 seções agregadas (previsão ciclo, classificador perda, risco abandono, performance vendedor, prioridade deals, próxima ação)

---

## 🐳 Docker Build

```bash
# Build image
docker build -t sales-intelligence-api .

# Run container locally
docker run -p 8080:8080 \
  -e PROJECT_ID=operaciones-br \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  -v $(pwd)/credentials.json:/app/credentials.json:ro \
  sales-intelligence-api

# Test
curl http://localhost:8080/health
```

---

## ☁️ Cloud Run Deployment

### Automated Deployment

```bash
./deploy.sh
```

This will:
1. Build Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run
4. Test health endpoint
5. Return service URL

### Manual Deployment

```bash
# Build and push
docker build -t gcr.io/operaciones-br/sales-intelligence-api:latest .
docker push gcr.io/operaciones-br/sales-intelligence-api:latest

# Deploy
gcloud run deploy sales-intelligence-api \
  --image gcr.io/operaciones-br/sales-intelligence-api:latest \
  --project operaciones-br \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
pytest tests/ -v

# Run BigQuery tests only
pytest tests/test_endpoints.py::TestBigQueryData -v

# Run API tests only
pytest tests/test_endpoints.py::TestAPIEndpoints -v

# With coverage
pytest tests/ --cov=app --cov-report=html
```

### Manual API Testing

```bash
# Health check
curl https://your-service-url.run.app/health

# Get pipeline
curl "https://your-service-url.run.app/api/pipeline?fiscal_q=FY26-Q1&limit=10"

# Get metrics
curl "https://your-service-url.run.app/api/metrics?year=2026&quarter=1"

# ML Predictions (dashboard payload)
curl -X POST "https://your-service-url.run.app/api/ml/predictions" \
  -H "Content-Type: application/json" \
  -d '{
    "year": 2026,
    "quarter": 1,
    "seller": "Alex Araujo"
  }'
```

---

## 📊 BigQuery ML Models

The API/dashboard uses 4 BQML models + 2 views (pipeline outputs):

1. **ml_previsao_ciclo** - Sales cycle duration prediction
2. **ml_classificador_perda** - Loss reason classification
3. **ml_risco_abandono** - Abandonment risk assessment
4. **ml_performance_vendedor** - Vendor performance analysis
5. **pipeline_prioridade_deals** (view) - Deal priority (Alta/Média/Baixa)
6. **pipeline_proxima_acao** (view) - Recommended next action

### Retrain Models

See [/bigquery/ML_MODELS_README.md](../bigquery/ML_MODELS_README.md) for training instructions.

---

## ⚙️ Configuration

Todas as variáveis de ambiente estão documentadas em [../.env.example](../.env.example).
Copie para `.env` na raiz e preencha os valores antes de rodar localmente:

```bash
cp ../.env.example ../.env
# edite .env com os valores reais
```

Variáveis principais lidas pela API:

| Variável | Padrão | Descrição |
|---|---|---|
| `GCP_PROJECT` | `operaciones-br` | ID do projeto GCP |
| `BQ_DATASET` | `sales_intelligence` | Dataset do BigQuery |
| `USE_VERTEX_AI` | `true` | Usa Vertex AI com autenticação da service account (recomendado) |
| `VERTEX_AI_LOCATION` | `us-central1` | Região do Vertex AI |
| `GEMINI_API_KEY` | — | Fallback opcional (evite em produção quando usar Vertex AI) |
| `CACHE_TTL_SECONDS` | `120` | TTL do cache interno da API |

### Recomendações de segurança para IA

- Preferir Vertex AI com service account do Cloud Run (sem API key no código/frontend).
- Garantir IAM mínimo para a service account do serviço: `roles/aiplatform.user`.
- Usar `GEMINI_API_KEY` apenas como fallback em Secret Manager, nunca hardcoded.

---

## 🔒 Security

- **Authentication**: Service account with BigQuery read access
- **CORS**: Configured for specific origins (update in constants.py)
- **Rate Limiting**: Cloud Run handles request throttling
- **Secrets**: Use Secret Manager for sensitive configs

---

## 📈 Monitoring

### Cloud Run Metrics

```bash
# View logs
gcloud run services logs tail sales-intelligence-api \
  --region us-central1 \
  --project operaciones-br

# View metrics
gcloud run services describe sales-intelligence-api \
  --region us-central1 \
  --project operaciones-br
```

### Application Logs

Logs include:
- Request/response times
- Query execution logs
- Error traces with stack traces
- ML prediction logs

---

## 🐛 Troubleshooting

### Common Issues

1. **BigQuery Permission Denied**
   - Ensure service account has `roles/bigquery.dataViewer`
   - Check `GOOGLE_APPLICATION_CREDENTIALS` environment variable

2. **Model Not Found**
   - Verify models are trained: `bq ls operaciones-br:sales_intelligence`
   - Retrain models if needed

3. **Slow Queries**
   - Check BigQuery table size
   - Add indexes/partitioning
   - Implement caching

4. **Health Check Fails**
   - Check logs: `gcloud run services logs tail ...`
   - Verify BigQuery connection
   - Test locally first

---

## 📝 Development Notes

### Adding New Endpoints

1. Add endpoint in `app/api/endpoints/*.py`
2. Import and include router in `app/simple_api.py`
3. Update this README

### Code Style

- **PEP 8** formatting
- **Type hints** on all functions
- **Docstrings** for all public methods
- **Async** where appropriate (FastAPI async routes)

---

## 🔄 CI/CD

### GitHub Actions (Coming Soon)

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
    paths: ['cloud-run/**']
```

### Cloud Build

```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml
```

---

## 📚 Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [BigQuery ML Documentation](https://cloud.google.com/bigquery/docs/bqml-introduction)
- [Pydantic Documentation](https://docs.pydantic.dev/)

---

## 👥 Team

Questions? Contact:
- **Backend**: Analytics Team
- **ML Models**: Data Science Team
- **Infrastructure**: DevOps Team

---

**Version**: 2.0.0  
**Last Updated**: 2025-01-XX
