# 🚀 Deploy da Cloud Function - Xertica.ai Sales Intelligence

## Pré-requisitos

1. **Google Cloud SDK** instalado
2. **Projeto GCP** configurado
3. **Permissões** de Cloud Functions Admin

## Deploy

### 1. Autenticar no GCP
```bash
gcloud auth login
gcloud config set project SEU_PROJETO_ID
```

### 2. Deploy da Function
```bash
cd cloud-function

gcloud functions deploy sales-intelligence-engine \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=sales_intelligence_engine \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2GB \
  --timeout=540s \
  --max-instances=10
```

### 3. Obter URL da Function
```bash
gcloud functions describe sales-intelligence-engine \
  --gen2 \
  --region=us-central1 \
  --format='value(serviceConfig.uri)'
```

## Segurança (Produção)

### Opção 1: IAM Authentication (Recomendado)
```bash
# Deploy COM autenticação
gcloud functions deploy sales-intelligence-engine \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=sales_intelligence_engine \
  --trigger-http \
  --memory=2GB \
  --timeout=540s

# Adicionar permissão para Apps Script
gcloud functions add-iam-policy-binding sales-intelligence-engine \
  --region=us-central1 \
  --member="serviceAccount:APPS_SCRIPT_SERVICE_ACCOUNT@appspot.gserviceaccount.com" \
  --role="roles/cloudfunctions.invoker"
```

### Opção 2: API Key
Adicionar validação de API Key no código:
```python
API_KEY = os.environ.get('API_KEY')
if request.headers.get('X-API-Key') != API_KEY:
    return ({'error': 'Unauthorized'}, 401, headers)
```

## Teste Local

```bash
# Instalar dependências
pip install -r requirements.txt

# Executar localmente
functions-framework --target=sales_intelligence_engine --debug
```

Testar com curl:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

## Monitoramento

```bash
# Ver logs em tempo real
gcloud functions logs read sales-intelligence-engine \
  --gen2 \
  --region=us-central1 \
  --limit=50 \
  --follow
```

## Custos Estimados

- **Invocações**: 1000/mês
- **Tempo execução**: ~3s média
- **Memória**: 2GB
- **Custo mensal**: **$1-3 USD**

## Troubleshooting

### Timeout
Se der timeout, aumentar `--timeout`:
```bash
--timeout=540s  # Máximo: 9 minutos
```

### Memória insuficiente
Aumentar `--memory`:
```bash
--memory=4GB  # Opções: 256MB, 512MB, 1GB, 2GB, 4GB, 8GB
```

### Erro de dependências
Verificar versions no requirements.txt
