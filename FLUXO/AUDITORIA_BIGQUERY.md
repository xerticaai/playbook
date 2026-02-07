# 🔍 Auditoria BigQuery - Estado Atual e Recomendações

**Data**: 06/02/2026  
**Objetivo**: Verificar o que existe, o que reaproveitar, e o que deletar antes de conectar ao Dashboard

---

## 📊 Estado Atual do BigQuery

### ✅ **TABELAS VÁLIDAS** (Manter e usar)

| Tabela | Registros | Status | Uso |
|--------|-----------|--------|-----|
| `pipeline` | 268 | ✅ Validado | Deals ativos, forecast IA |
| `closed_deals_won` | 506 | ✅ Validado | Análise de ganhos |
| `closed_deals_lost` | 2,069 | ✅ Validado | Análise de perdas |
| `sales_specialist` | 21 | ✅ Validado | Oportunidades especiais |

**Total validado**: 2,864 registros (zero duplicação confirmada)

---

### ❌ **TABELA LEGADA** (Deletar)

| Tabela | Registros | Problema | Ação |
|--------|-----------|----------|------|
| `closed_deals` | 2,575 | Duplicada/antiga | 🗑️ **DELETAR** |

**Motivo**: Tabela antiga que une won+lost. Agora temos tabelas separadas validadas.

**Comando para deletar**:
```bash
bq rm -f operaciones-br:sales_intelligence.closed_deals
```

---

### 🧮 **VIEWS SQL** (Manter e usar - SEM modelos ML!)

| View | Tipo | Descrição | Status |
|------|------|-----------|--------|
| `ml_prioridade_deal_v2` | SQL puro | Calcula priority_score com fórmulas | ✅ **FUNCIONAL** |
| `ml_proxima_acao_v2` | SQL puro | Gera ações recomendadas com CASE WHEN | ✅ **FUNCIONAL** |

**Descoberta importante**: 🎯 **Essas VIEWs NÃO usam Machine Learning real!**

São **heurísticas SQL inteligentes**:
- `ml_prioridade_deal_v2`: Calcula priority score baseado em:
  - Valor normalizado (30%)
  - Urgência por data (30%)
  - Risco estimado (40%)
  - Fórmula: `(valor_norm * 0.3) + (urgencia * 0.3) + (risco * 0.4)`

- `ml_proxima_acao_v2`: Recomenda ações baseado em:
  - Atividades < 2 + dias > 30 → "REATIVAR_URGENTE"
  - Close em 7 dias + risco alto → "FECHAR_URGENTE"
  - Valor > $100K → "PRIORIZAR_RECURSOS"
  - Etc.

**Vantagem**: Já funcionam, não precisam treinamento, resultados imediatos!

**Query de exemplo**:
```sql
-- Ver top 10 deals prioritários
SELECT 
  Oportunidade,
  Vendedor,
  Gross,
  priority_score,
  priority_level,
  nivel_risco,
  justificativa_prioridade
FROM `operaciones-br.sales_intelligence.ml_prioridade_deal_v2`
ORDER BY priority_score DESC
LIMIT 10;
```

---

## 🏗️ Estrutura Cloud Run

### ✅ **FastAPI App** (Usar este!)

**Localização**: `/workspaces/playbook/cloud-run/app/`

**Estrutura moderna**:
```
cloud-run/app/
├── main.py                     # 337 linhas - FastAPI entry point
├── models/
│   └── schemas.py              # Pydantic validation models
├── services/
│   ├── bigquery_service.py     # BigQuery data access
│   └── ml_service.py           # BQML predictions
└── utils/
    └── constants.py            # Configuration
```

**Vantagens**:
- ✅ FastAPI moderna e rápida
- ✅ Código organizado e modular
- ✅ Documentação automática (`/docs`)
- ✅ Type hints e validação
- ✅ Fácil de testar e manter

**Status**: 🟢 **PRONTO PARA DEPLOY**

---

### ❌ **Cloud Function legada** (Deletar)

**Localização**: `/workspaces/playbook/cloud-run/cloud-function/`

**Problemas**:
- ❌ 2,527 linhas em um único arquivo
- ❌ Usa Google Cloud Functions (legado)
- ❌ Código desorganizado
- ❌ Imports faltando (`metrics_calculators.py` não existe)
- ❌ Difícil de manter

**Ação**: 🗑️ **DELETAR** ou **ARQUIVAR**

---

## 📋 Arquivos SQL BigQuery

### ✅ **Queries Prontas** (Manter)

**Arquivo**: `/workspaces/playbook/bigquery/queries_prontas.sql` (359 linhas)

**Conteúdo**:
1. Deals críticos (urgência ALTA)
2. Pipeline por vendedor
3. Ações recomendadas por tipo
4. Deals próximos do close (7 dias)
5. Deals atrasados
6. Deals parados (risco abandono)
7. Forecast semanal por segmento
8. Top oportunidades (valor alto + baixo risco)
9. Análise de risco (distribuição)
10. Deals por segmento
11. Histórico de perdas (causas)

**Status**: ✅ **MUITO ÚTIL** - Queries já testadas e documentadas

---

### ⚠️ **Modelos ML v1** (Não treinar)

**Arquivos para IGNORAR**:
```
ml_classificador_perda.sql       # v1 antiga
ml_performance_vendedor.sql      # v1 antiga
ml_previsao_ciclo.sql            # v1 antiga
ml_prioridade_deal.sql           # v1 antiga
ml_proxima_acao.sql              # v1 antiga
ml_risco_abandono.sql            # v1 antiga
```

**Status**: 🔸 **IGNORAR** (usar v2 quando necessário)

---

### 🤖 **Modelos ML v2** (Treinar DEPOIS)

**Arquivos**:
```
ml_classificador_perda_v2.sql    # Classificar perdas evitáveis
ml_performance_vendedor_v2.sql   # Avaliar performance
ml_previsao_ciclo_v2.sql         # Prever duração ciclo
ml_prioridade_deal_v2.sql        # Priorizar deals (já é VIEW!)
ml_proxima_acao_v2.sql           # Recomendar ações (já é VIEW!)
ml_risco_abandono_v2.sql         # Detectar abandono
ml_win_loss_model.sql            # Prever Win/Loss
```

**Status**: 🟡 **TREINAR DEPOIS** (quando conectar Dashboard)

**Motivo**: As VIEWs SQL já fornecem resultados bons. Treinar ML é otimização futura.

---

## 🎯 Estratégia Recomendada

### **FASE 1: Conectar Dashboard (AGORA)** 🚀

**Prioridade**: ALTA  
**Tempo estimado**: 2-3 horas

**Passos**:

1. **Limpar BigQuery** (5 min)
   ```bash
   # Deletar tabela legada
   bq rm -f operaciones-br:sales_intelligence.closed_deals
   
   # Validar tabelas restantes
   bq ls operaciones-br:sales_intelligence
   ```

2. **Deploy FastAPI para Cloud Run** (30 min)
   ```bash
   cd /workspaces/playbook/cloud-run
   ./deploy.sh
   ```
   
   Output esperado:
   ```
   Service URL: https://sales-intelligence-api-[hash]-uc.a.run.app
   ```

3. **Testar Endpoints** (15 min)
   ```bash
   # Testar métricas gerais
   curl https://[URL]/api/metrics
   
   # Testar pipeline
   curl https://[URL]/api/pipeline?fiscal_q=FY26-Q2
   
   # Testar prioridades
   curl https://[URL]/api/priorities
   ```

4. **Conectar Dashboard ao Cloud Run** (1-2h)
   - Atualizar `public/index.html` com URL da API
   - Implementar funções `fetch()` JavaScript
   - Renderizar KPIs e tabelas
   - Testar localmente

5. **Deploy Dashboard** (10 min)
   ```bash
   firebase deploy --only hosting
   ```

**Resultado**: 🎉 **Dashboard funcional com dados reais do BigQuery!**

---

### **FASE 2: Otimizar com ML Real (DEPOIS)** 🤖

**Prioridade**: MÉDIA  
**Tempo estimado**: 3-4 horas

**Quando fazer**: Após Dashboard funcionando em produção por 1-2 semanas

**Modelos a treinar**:
1. `ml_win_loss_model` - Prever probabilidade de ganho
2. `ml_risco_abandono_v2` - Detectar deals em risco
3. `ml_classificador_perda_v2` - Classificar perdas evitáveis
4. `ml_previsao_ciclo_v2` - Prever duração do ciclo

**Passos**:
```bash
cd /workspaces/playbook/bigquery
./deploy_ml_v2.sh  # Treina todos os modelos
```

**Substituir VIEWs SQL por modelos BQML**:
- `ml_prioridade_deal_v2` → Usar `ML.PREDICT` do modelo treinado
- `ml_proxima_acao_v2` → Usar `ML.PREDICT` do modelo treinado

---

## 🗑️ Itens para Deletar

### **Arquivos BigQuery**
```bash
# Tabela legada
bq rm -f operaciones-br:sales_intelligence.closed_deals

# Arquivos SQL v1 (não deletar, apenas ignorar)
# Manter no repo como histórico/backup
```

### **Código Cloud Run**
```bash
# Arquivar Cloud Function legada
cd /workspaces/playbook/cloud-run
mkdir _archived
mv cloud-function _archived/

# Ou deletar permanentemente
rm -rf cloud-run/cloud-function
```

### **Arquivos não usados**
```bash
# Verificar e deletar:
- bigquery/ml_train.sql (genérico demais)
- bigquery/ml_predict.sql (genérico demais)
- bigquery/test_ml_modelo1.sql (teste antigo)
- bigquery/load_from_csvs.py (já usamos Google Sheets)
- bigquery/load_initial_data.py (dados já carregados)
```

---

## ✅ Checklist de Ações

### **Limpeza (5 min)**
- [ ] Deletar `closed_deals` do BigQuery
- [ ] Arquivar `cloud-run/cloud-function/`
- [ ] Validar 4 tabelas restantes (268+506+2069+21 = 2,864)

### **Deploy Cloud Run (30 min)**
- [ ] Revisar `cloud-run/app/main.py`
- [ ] Testar localmente: `uvicorn app.main:app --reload`
- [ ] Deploy: `./deploy.sh`
- [ ] Obter URL do serviço
- [ ] Testar endpoints com `curl`

### **Conectar Dashboard (2h)**
- [ ] Atualizar `public/index.html` com URL da API
- [ ] Implementar `loadMetrics()` JavaScript
- [ ] Implementar `loadPipeline()` JavaScript
- [ ] Implementar `loadPriorities()` JavaScript
- [ ] Adicionar gráficos Chart.js
- [ ] Testar responsividade
- [ ] Deploy Firebase: `firebase deploy`

### **Validação E2E (30 min)**
- [ ] Modificar deal no Google Sheets
- [ ] Sync para BigQuery
- [ ] Verificar API retorna novos dados
- [ ] Confirmar Dashboard atualiza
- [ ] Testar performance (<2s)

### **Otimização Futura**
- [ ] Treinar modelos BQML v2 (quando Dashboard estiver estável)
- [ ] Substituir VIEWs SQL por `ML.PREDICT`
- [ ] Comparar acurácia SQL vs ML
- [ ] Documentar melhorias

---

## 🎯 Decisão Recomendada

**PRIORIDADE AGORA**: 🚀 **CONECTAR DASHBOARD COM VIEWS SQL EXISTENTES**

**POR QUÊ**:
1. ✅ Views SQL já funcionam e têm lógica boa
2. ✅ Resultados imediatos (não precisa treinar)
3. ✅ FastAPI já está pronta para deploy
4. ✅ Dashboard pode ser testado rapidamente
5. ✅ ML real pode ser adicionado depois como otimização

**DEPOIS**: 🤖 **Treinar ML quando sistema estiver estável em produção**

---

## 📊 Resumo Executivo

| Item | Estado Atual | Ação | Prioridade |
|------|--------------|------|------------|
| Tabelas BigQuery | 4 válidas + 1 legada | Deletar legada | 🔴 ALTA |
| Views SQL | 2 funcionais | Usar no Dashboard | 🟢 USAR |
| FastAPI App | Pronta | Deploy Cloud Run | 🔴 ALTA |
| Cloud Function | Legada | Arquivar | 🟡 MÉDIA |
| Dashboard | HTML base | Conectar API | 🔴 ALTA |
| Modelos BQML | Não treinados | Treinar depois | 🔵 BAIXA |

**Próximo comando**: 
```bash
# Limpar BigQuery e começar deploy
bq rm -f operaciones-br:sales_intelligence.closed_deals && \
cd /workspaces/playbook/cloud-run && \
cat README.md  # Revisar instruções de deploy
```

---

**Criado em**: 06/02/2026  
**Próxima revisão**: Após deploy do Dashboard
