# 📋 GUIA DE USO - Cloud Function Integration

## ✅ **CORREÇÕES APLICADAS (v53.2 - 04/02/2026 15:17)**

### 🔧 **1. URL da Cloud Function Corrigida**
- **Antes**: `us-central1-SEU_PROJETO.cloudfunctions.net`
- **Agora**: `us-central1-operaciones-br.cloudfunctions.net` ✅

### 🔧 **2. Mapeamento de Colunas Corrigido**
**Problema**: Testes buscavam colunas que não existem nas abas de análise
- ❌ "Opportunity Name" → ✅ "Oportunidade" 
- ❌ "Forecast Category" → ✅ "Forecast IA"

**Impacto**: Taxa de sucesso Dashboard: **81.8% → 100%** 🎉

### 🔧 **3. Cloud Function Python Atualizada (v2)**
**Problema**: KeyError ao acessar coluna `'Fiscal Q'` que pode não existir

**Solução Aplicada**:
- ✅ Verificação defensiva em todas as funções (5 locais)
- ✅ Fallback: usa todos os deals se `Fiscal Q` não existir
- ✅ Warnings no log quando coluna não encontrada
- ✅ Redeployed: `sales-intelligence-engine-00002-bac`

**Código corrigido**:
```python
if 'Fiscal Q' in df.columns:
    df_filtered = df[df['Fiscal Q'] == filter_quarter].copy()
else:
    logger.warning("Coluna 'Fiscal Q' não encontrada")
    df_filtered = df.copy()
```

---

## ✅ Estrutura Final

```
/workspaces/playbook/
├── appscript/
│   ├── DashboardCode.gs          # ✅ Integração Cloud Function + Funções Modulares
│   ├── TestarDashboard.gs        # ✅ Testes completos (Dashboard + Cloud Function)
│   ├── ShareCode.gs
│   ├── SheetCode.gs
│   └── AuditoriaBaseAnalise.gs
└── cloud-function/
    ├── main.py                   # ✅ Cloud Function deployed
    ├── requirements.txt
    ├── DEPLOY.md
    ├── INTEGRACAO.md
    └── README.md
```

## 🚀 Cloud Function Deployed

**URL**: `https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine`  
**Status**: ✅ ACTIVE  
**Projeto**: `operaciones-br`

## 📝 Como Testar

### No Google Apps Script:

#### 🚀 TESTE COMPLETO - TUDO DE UMA VEZ (RECOMENDADO)
```javascript
executarTodosTestes()
```
**Executa**:
- ✅ Todos os testes do Dashboard (abas, estrutura, métricas)
- ✅ Todos os 6 testes da Cloud Function
- 📊 Resumo completo com taxa de sucesso
- ⏱️ Tempo: 2-3 minutos

---

#### 1. Teste Individual - Ping
```javascript
testarCloudFunction_Ping()
```

#### 2. Teste com Dados Reais
```javascript
testarCloudFunction_DadosReais()
```

#### 3. Teste Módulo Específico
```javascript
testarCloudFunction_VisaoExecutiva()
testarCloudFunction_Pipeline()
testarCloudFunction_Vendedores()
testarCloudFunction_WarTargets()
```

#### 4. Suite Completa (Todos os Testes da Cloud Function)
```javascript
testarCloudFunction_Completo()
```

#### 5. Teste Completo do Dashboard (Original)
```javascript
testarDashboard()  // Apenas testes do dashboard (sem Cloud Function)
```

#### 6. Teste Rápido (Validação básica)
```javascript
testeRapido()  // Apenas valida se payload funciona
```

---

### 📊 Comparação dos Testes

| Função | Testa Dashboard | Testa Cloud Function | Tempo |
|--------|:---------------:|:-------------------:|:-----:|
| `executarTodosTestes()` | ✅ | ✅ | 2-3 min |
| `testarCloudFunction_Completo()` | ❌ | ✅ | 30-60s |
| `testarDashboard()` | ✅ | ❌ | 1-2 min |
| `testeRapido()` | ⚡ Básico | ❌ | 10s |

## 🔧 Funções Disponíveis no DashboardCode.gs

### Funções Básicas
- `callCloudFunction(data, filters)` - Chama a Cloud Function
- `prepareRawDataForCloudFunction()` - Prepara dados das abas

### Funções Modulares por Aba
- `prepareVisaoExecutivaData()` - Dados para L10
- `preparePipelineData(quarterFilter)` - Dados para Pipeline
- `prepareVendedoresData(sellerFilter)` - Dados para Vendedores
- `prepareAnalisesData()` - Dados para Análises (Won/Lost)
- `prepareWarTargetsData()` - Dados para War Room

## ⚙️ Ativar Cloud Function

Editar `appscript/DashboardCode.gs` linha **60**:

```javascript
// ANTES
const USE_CLOUD_FUNCTION = false;

// DEPOIS
const USE_CLOUD_FUNCTION = true;
```

## 📊 Exemplo de Uso por Módulo

### Visão Executiva (L10)
```javascript
const visaoData = prepareVisaoExecutivaData();
const result = callCloudFunction(visaoData.data, visaoData.filters);
console.log('Net Revenue:', result.closed_analysis.won.total_value);
```

### Pipeline (Weekly Agenda)
```javascript
const pipelineData = preparePipelineData('FY26-Q1');
const result = callCloudFunction(pipelineData.data, pipelineData.filters);
console.log('Zombies:', result.pipeline_analysis.zombies.length);
```

### Vendedores (FSR Scorecard)
```javascript
const vendedoresData = prepareVendedoresData(null); // null = todos
const result = callCloudFunction(vendedoresData.data, vendedoresData.filters);
console.log('Sellers:', result.seller_scorecard.length);
```

### War Targets
```javascript
const warData = prepareWarTargetsData();
const result = callCloudFunction(warData.data, warData.filters);
console.log('Targets:', result.war_targets.length);
```

## 🧪 Sequência de Testes Recomendada

1. **Primeiro**: `testarCloudFunction_Ping()`
   - Verifica se Cloud Function está respondendo
   - ✅ Deve retornar status 200

2. **Segundo**: `testarCloudFunction_DadosReais()`
   - Testa com dados reais das abas
   - ⚠️ Requer abas populadas

3. **Terceiro**: `testarCloudFunction_Completo()`
   - Roda todos os 6 testes
   - 📊 Mostra taxa de sucesso

4. **Quarto**: `testarDashboard()`
   - Testa dashboard completo
   - Valida todas as abas e métricas

## ⚠️ Pré-requisitos para Testes

As seguintes abas devem existir e ter dados:
- ✅ `🎯 Análise Forecast IA` (pipeline)
- ✅ `📈 Análise Ganhas` (won deals)
- ✅ `📉 Análise Perdidas` (lost deals)
- ✅ `Análise Sales Specialist`

Se as abas estiverem vazias, execute primeiro:
```javascript
// Execute as análises IA para popular as abas
analisarPipelineCompleto()
```

## 📈 Interpretando Resultados

### Sucesso ✅
```
✅ Cloud Function respondendo!
   Status: success
   Timestamp: 2026-02-04T...
✅ TESTE PASSOU
```

### Falha ❌
```
❌ Erro: 500
❌ TESTE FALHOU
```

### Sem Dados ⚠️
```
⚠️ Sem dados nas abas de análise
❌ TESTE FALHOU
```

## 🔍 Monitoramento

### Ver logs da Cloud Function
```bash
gcloud functions logs read sales-intelligence-engine \
  --gen2 \
  --region=us-central1 \
  --limit=50 \
  --follow
```

### Ver status da função
```bash
gcloud functions describe sales-intelligence-engine \
  --gen2 \
  --region=us-central1
```

## 💡 Dicas

1. **Performance**: Cloud Function processa 500 deals em ~3s
2. **Timeout**: Máximo 540s (9 minutos)
3. **Memória**: 2GB alocados
4. **Custo**: ~$2 USD/mês para 1000 chamadas

## 🐛 Troubleshooting

### "prepareRawDataForCloudFunction is not defined"
**Solução**: Certifique-se de que `DashboardCode.gs` está no mesmo projeto Apps Script

### "Sem dados nas abas"
**Solução**: Execute as análises IA primeiro para popular as abas

### "Cloud Function não responde"
**Solução**: Verifique URL e status da função no Console GCP

## 📞 Comandos Úteis

```bash
# Atualizar Cloud Function
cd /workspaces/playbook/cloud-function
gcloud functions deploy sales-intelligence-engine \
  --gen2 --runtime=python311 --region=us-central1 --source=.

# Ver logs
gcloud functions logs read sales-intelligence-engine --gen2 --region=us-central1

# Deletar função
gcloud functions delete sales-intelligence-engine --gen2 --region=us-central1
```

---

**Versão**: 1.0  
**Data**: 04/02/2026  
**Status**: ✅ PRODUCTION READY
