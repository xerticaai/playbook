# 📚 Sales Intelligence - BigQuery + ML Documentation

## 🎯 Início Rápido

### Novo aqui? Comece por aqui:
1. 📖 [**README.md**](README.md) - Visão geral e introdução
2. ✅ [**DEPLOYMENT_CHECKLIST.md**](DEPLOYMENT_CHECKLIST.md) - Checklist passo a passo
3. ⚡ [**QUICK_REFERENCE.md**](QUICK_REFERENCE.md) - Comandos essenciais

### Já fez o deployment? Continue aqui:
- 🔍 [**RESUMO_EXECUTIVO.md**](RESUMO_EXECUTIVO.md) - Arquitetura e casos de uso
- 📘 [**DEPLOYMENT_GUIDE.md**](DEPLOYMENT_GUIDE.md) - Documentação técnica completa

---

## 📂 Estrutura da Documentação

### 🚀 Deployment
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - ✅ Checklist interativo (~20 min)
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 📘 Guia técnico completo

### 📊 Uso
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - ⚡ Comandos do dia a dia
- [RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md) - 🎯 Arquitetura e casos de uso

### 💻 Código
- [setup_bigquery.sh](setup_bigquery.sh) - 🔧 Setup inicial (dataset + tabelas)
- [load_initial_data.py](load_initial_data.py) - 📥 Carrega CSVs para BigQuery
- [ml_win_loss_model.sql](ml_win_loss_model.sql) - 🧠 Modelo de ML (comentado)
- [quick_test.sh](quick_test.sh) - 🧪 Testa toda a stack

### 📐 Schema
- [schema_pipeline.json](schema_pipeline.json) - Schema da tabela `pipeline`
- [schema_closed.json](schema_closed.json) - Schema da tabela `closed_deals`

---

## 🗺️ Guia por Perfil

### 👨‍💻 Sou Tech Lead / DevOps
**Seu objetivo:** Deploy completo da infraestrutura

1. Execute: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
2. Valide: `./quick_test.sh`
3. Mantenha: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

**Tempo:** ~20 minutos

### 📊 Sou Sales Ops / Analista
**Seu objetivo:** Configurar Apps Script e usar o sistema

1. Leia: [README.md](README.md) - Entenda a arquitetura
2. Configure: Seção "Fase 5" do [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
3. Use: Queries do [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

**Tempo:** ~10 minutos

### 🎯 Sou Business / C-Level
**Seu objetivo:** Entender o valor e ROI

1. Leia: [RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md)
2. Explore: Seção "Casos de Uso"
3. Visualize: BigQuery Console (peça ao tech lead)

**Tempo:** ~5 minutos

---

## 🎯 Por onde começar?

### ❓ "Nunca usei BigQuery antes"
→ Comece por: [README.md](README.md)  
Depois: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

### ⚡ "Quero fazer deploy agora"
→ Vá direto para: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

### 🔍 "Quero entender a arquitetura"
→ Leia: [RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md)

### 💡 "Quero ver exemplos de queries"
→ Consulte: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)  
E também: [ml_win_loss_model.sql](ml_win_loss_model.sql) (Partes 6-8)

### 🐛 "Estou com um erro"
→ Veja: Seção "Troubleshooting" do [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)  
Ou: Seção "Troubleshooting" do [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

---

## 📖 Conteúdo dos Arquivos

### [README.md](README.md)
**O que é:** Introdução completa ao projeto  
**Quando ler:** Primeiro contato com o sistema  
**Tempo:** 10 minutos  
**Inclui:**
- O que é Sales Intelligence BigQuery + ML
- Comparação: Antes vs. Depois
- Estrutura do projeto
- Quick Start (4 passos)
- Exemplos de queries
- Métricas de performance

### [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
**O que é:** Checklist interativo de deployment  
**Quando usar:** Durante o deployment inicial  
**Tempo:** 20 minutos (executando os comandos)  
**Inclui:**
- Checklist passo a passo com comandos
- Resultados esperados para cada etapa
- Seção de troubleshooting
- Validação final

### [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
**O que é:** Documentação técnica completa  
**Quando ler:** Para entendimento profundo  
**Tempo:** 30-45 minutos  
**Inclui:**
- Diagrama de arquitetura detalhado
- Explicação de cada componente
- Deployment passo a passo com contexto
- Queries SQL explicadas
- Vantagens e ROI
- Roadmap de evolução

### [RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md)
**O que é:** Visão executiva e estratégica  
**Quando ler:** Para decisões de negócio  
**Tempo:** 15 minutos  
**Inclui:**
- Problema → Solução
- Diagrama de arquitetura visual
- Casos de uso práticos
- Métricas de performance e custo
- ROI e próximos passos

### [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
**O que é:** Manual de referência rápida  
**Quando usar:** No dia a dia  
**Tempo:** Consulta conforme necessário  
**Inclui:**
- Comandos de setup
- Queries úteis
- Operações diárias
- Testes e troubleshooting
- Funções do Apps Script

### [ml_win_loss_model.sql](ml_win_loss_model.sql)
**O que é:** Código SQL do modelo de ML  
**Quando usar:** Para treinar/retreinar modelo  
**Tempo:** 3-5 minutos (execução)  
**Inclui:**
- Criação de view de treinamento
- Criação do modelo XGBoost
- Queries de avaliação
- Queries de predição
- Queries de análise

---

## 🔄 Fluxo de Trabalho Recomendado

### Primeira Vez (Deployment Inicial)
```
1. README.md (10 min)
   ↓
2. DEPLOYMENT_CHECKLIST.md (20 min - com execução)
   ↓
3. ./quick_test.sh (2 min)
   ↓
4. RESUMO_EXECUTIVO.md (15 min)
```

### Uso Diário
```
Apps Script: runFullAnalysis()
   ↓
BigQuery Console: Queries customizadas
   ↓
QUICK_REFERENCE.md: Comandos conforme necessário
```

### Manutenção Semanal
```
1. ./load_initial_data.py (recarregar dados)
   ↓
2. bq query < ml_win_loss_model.sql (retreinar modelo)
   ↓
3. ./quick_test.sh (validar)
```

---

## 📊 Comandos Essenciais

### Setup Inicial
```bash
cd /workspaces/playbook/bigquery
./setup_bigquery.sh
./load_initial_data.py
bq query < ml_win_loss_model.sql
```

### Teste Rápido
```bash
./quick_test.sh
```

### Deploy Cloud Function
```bash
cd ../cloud-function
cp main_bigquery.py main.py
gcloud functions deploy sales-intelligence-engine ...
```

### Query Útil (Top Deals em Risco)
```sql
SELECT oportunidade, gross, win_probability
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
WHERE win_probability < 0.5
ORDER BY gross DESC LIMIT 10;
```

---

## 🆘 Precisa de Ajuda?

### Erros durante deployment
→ [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Seção "Troubleshooting"

### Dúvidas sobre queries SQL
→ [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Seção "Queries de Análise"  
→ [ml_win_loss_model.sql](ml_win_loss_model.sql) - Código comentado

### Entender performance e custo
→ [RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md) - Seção "Performance e Custo"

### Evolução da arquitetura
→ [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Seção "Próximos Passos"

---

## 🎉 Status do Projeto

```
Status: ✅ COMPLETO E PRONTO PARA DEPLOYMENT

Componentes:
├── BigQuery Schema         ✅ Pronto
├── Scripts de Setup        ✅ Pronto
├── Modelo de ML           ✅ Pronto
├── Cloud Function         ✅ Pronto
├── Apps Script            ✅ Pronto
└── Documentação           ✅ Completa

Próximo Passo: Execute DEPLOYMENT_CHECKLIST.md
```

---

## 📈 Versão

**Versão:** 1.0.0  
**Data:** Fevereiro 2026  
**Autor:** Sales Intelligence Team  
**Projeto:** operaciones-br

---

## 🔗 Links Rápidos

- [BigQuery Console](https://console.cloud.google.com/bigquery?project=operaciones-br)
- [Cloud Functions Console](https://console.cloud.google.com/functions?project=operaciones-br)
- [Cloud Logging](https://console.cloud.google.com/logs?project=operaciones-br)
- [BigQuery ML Docs](https://cloud.google.com/bigquery-ml/docs)

---

**🚀 Pronto para começar? Vá para: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)**
