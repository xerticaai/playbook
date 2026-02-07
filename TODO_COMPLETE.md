# 📋 TODO LIST COMPLETA - Sales Intelligence Platform

## ✅ FASE 1: Validação e Organização (CONCLUÍDO PARCIALMENTE)

### 1.1 Validação BigQuery ✅
- [x] Criar SQLs de validação completa
- [x] Executar validação inicial Pipeline
- [x] Confirmar dados em todas as tabelas
- [ ] Executar validação completa de todas as queries
- [ ] Gerar relatório de qualidade de dados

### 1.2 Padronização Constants ✅
- [x] Criar constants.py centralizado
- [x] Definir PROJECT_ID, DATASET_ID, TABLE_NAMES
- [x] Definir colunas críticas de cada tabela
- [x] Configurar thresholds de ML
- [ ] Migrar main.py para usar constants

## 🔄 FASE 2: Reorganização cloud-function → cloud-run

### 2.1 Estrutura de Diretórios
```
cloud-run/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI/Flask app
│   ├── constants.py         # ✅ Criado
│   ├── config.py            # Environment config
│   ├── models/
│   │   ├── __init__.py
│   │   ├── schemas.py       # Pydantic models
│   │   └── types.py         # Type definitions
│   ├── services/
│   │   ├── __init__.py
│   │   ├── bigquery_service.py
│   │   ├── ml_service.py
│   │   └── metrics_service.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py        # API endpoints
│   │   └── dependencies.py  # Dependency injection
│   └── utils/
│       ├── __init__.py
│       ├── logger.py
│       └── cache.py
├── tests/
│   ├── __init__.py
│   ├── test_endpoints.py    # 🆕 Criar
│   ├── test_bigquery.py
│   └── test_ml_models.py
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

### 2.2 Arquivos a Migrar/Refatorar
- [ ] Renomear cloud-function/ → cloud-run/
- [ ] Refatorar main.py para FastAPI/Flask estruturado
- [ ] Mover bigquery_schema.py → app/models/schemas.py
- [ ] Mover column_mapping.py → app/models/types.py
- [ ] Mover metrics_calculators.py → app/services/metrics_service.py
- [ ] Atualizar imports em todos os arquivos

## 🔌 FASE 3: Atualização Cloud Run & Endpoints

### 3.1 Atualizar Queries para Novos Schemas
- [ ] Atualizar get_pipeline_data() com TODOS os campos
- [ ] Atualizar get_closed_data() com campos Lost exclusivos
- [ ] Adicionar get_sales_specialist_data()
- [ ] Implementar filtros por Fiscal_Q, Vendedor, Fase
- [ ] Adicionar paginação e sorting

### 3.2 Novos Endpoints
- [ ] GET /api/v1/pipeline - Lista pipeline completo
- [ ] GET /api/v1/pipeline/{oportunidade} - Detalhe deal
- [ ] GET /api/v1/closed/won - Deals ganhos
- [ ] GET /api/v1/closed/lost - Deals perdidos
- [ ] GET /api/v1/sales-specialist - Relatório SS
- [ ] GET /api/v1/metrics/summary - Resumo executivo
- [ ] GET /api/v1/ml/predict - Predições ML
- [ ] GET /api/health - Health check

### 3.3 Criar test_endpoints.py
```python
# Testes para validar todos os endpoints
- test_get_pipeline()
- test_get_pipeline_by_fiscal_q()
- test_get_closed_won()
- test_get_closed_lost()
- test_union_all_closed()
- test_ml_predictions()
- test_error_handling()
```

## 🎨 FASE 4: Atualização Frontend (index.html)

### 4.1 Atualizar URLs dos Endpoints
- [ ] Atualizar BASE_URL para Cloud Run
- [ ] Adicionar autenticação se necessário
- [ ] Implementar tratamento de erros
- [ ] Adicionar loading states

### 4.2 Novos Componentes UI
- [ ] Dashboard executivo (métricas resumidas)
- [ ] Tabela Pipeline com filtros
- [ ] Análise Won/Lost side-by-side
- [ ] Gráficos de distribuição (Fiscal Q, Vendedor)
- [ ] Cards de Forecast IA
- [ ] Visualização de scores MEDDIC/BANT

### 4.3 Funcionalidades
- [ ] Busca por Oportunidade
- [ ] Filtros interativos (Quarter, Vendedor, Fase)
- [ ] Export para CSV/Excel
- [ ] Refresh automático
- [ ] Dark mode toggle

## 🤖 FASE 5: Retreinar Modelos BQML

### 5.1 Preparação de Dados
- [ ] Validar features disponíveis nos novos schemas
- [ ] Criar views de treinamento com novos campos
- [ ] Adicionar campos de análise (Resumo_Analise, Causa_Raiz, etc)
- [ ] Balancear dataset (Won vs Lost)

### 5.2 Retreinar Modelos V3
```sql
-- Criar versão V3 de cada modelo
- ml_win_loss_model_v3
- ml_classificador_perda_v3
- ml_risco_abandono_v3
- ml_proxima_acao_v3
- ml_prioridade_deal_v3
- ml_previsao_ciclo_v3
- ml_performance_vendedor_v3
```

### 5.3 Novos Features para ML
- Atividades (quantidade e peso)
- Total_Mudancas e Mudancas_Criticas
- Idle_Dias
- Qualidade_Engajamento
- Text features: Resumo_Analise, Causa_Raiz (embeddings)

### 5.4 Avaliação e Deploy
- [ ] Comparar accuracy V2 vs V3
- [ ] Validar precision/recall melhorados
- [ ] A/B testing em produção
- [ ] Rollback se performance piorar

## 🚀 FASE 6: Deploy e Validação Final

### 6.1 Deploy Cloud Run
- [ ] Build Docker image
- [ ] Deploy para Cloud Run (staging)
- [ ] Configurar autoscaling
- [ ] Configurar monitoring/alerting
- [ ] Deploy produção

### 6.2 Validação End-to-End
- [ ] Testar todos os endpoints
- [ ] Validar frontend conectado
- [ ] Load testing (100+ req/s)
- [ ] Verificar logs e errors
- [ ] Smoke tests ML predictions

### 6.3 Documentação
- [ ] Atualizar README.md com nova estrutura
- [ ] Documentar API endpoints (OpenAPI/Swagger)
- [ ] Criar guia de deployment
- [ ] Documentar troubleshooting comum

## 📊 FASE 7: Otimizações e Melhorias

### 7.1 Performance
- [ ] Implementar cache Redis/Memcached
- [ ] Otimizar queries BigQuery (partitioning)
- [ ] Implementar connection pooling
- [ ] CDN para assets estáticos

### 7.2 Observabilidade
- [ ] Integrar Google Cloud Logging
- [ ] Configurar Cloud Monitoring dashboards
- [ ] Alertas para errors/latency
- [ ] Tracing distribuído

### 7.3 Segurança
- [ ] Implementar autenticação (OAuth2/JWT)
- [ ] Rate limiting
- [ ] Input validation
- [ ] CORS configurado corretamente

---

## 🎯 PRIORIDADES IMEDIATAS

1. **HOJE** (Crítico):
   - ✅ Criar constants.py
   - ✅ Criar validate_all_data.sql
   - 🔄 Executar validações completas BigQuery
   - 🔄 Criar test_endpoints.py básico
   - 🔄 Atualizar main.py para usar constants

2. **ESTA SEMANA**:
   - Reorganizar cloud-function → cloud-run
   - Refatorar estrutura de código
   - Atualizar queries para novos schemas
   - Testar endpoints atualizados

3. **PRÓXIMA SEMANA**:
   - Retreinar modelos BQML V3
   - Atualizar frontend
   - Deploy staging
   - Validação end-to-end

---

## 📝 CHECKLIST DE VALIDAÇÃO PRÉ-DEPLOY

- [ ] Todos os testes passando (unit + integration)
- [ ] Queries BigQuery validadas
- [ ] Endpoints retornando dados corretos
- [ ] Frontend conectado e funcional
- [ ] Modelos ML retreinados e validados
- [ ] Documentação atualizada
- [ ] Performance aceitável (<3s response time)
- [ ] Logs configurados
- [ ] Monitoramento ativo
- [ ] Rollback plan documentado
