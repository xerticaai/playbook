# 🎯 SALES INTELLIGENCE: PAUTA SEMANAL + WAR ROOM

> **Automatização de preparação de 1:1s + Dashboard executivo "verdade nua e crua"**  
> Powered by BigQuery + RAG (Vertex AI) + Gemini 1.5 Flash

---

## 🚀 QUICK START

### **👨‍💼 Sou Gerente/VP - O que tenho que fazer?**
1. Ler: [GUIA_DECISAO_FERRAMENTAS.md](GUIA_DECISAO_FERRAMENTAS.md) (10 min)
2. Acessar: [pautasemanal.html](https://xertica-dashboard.web.app/pautasemanal.html)
3. Usar: Antes de toda reunião 1:1 com vendedor

### **👨‍💻 Sou Developer - Como implemento?**
1. Ler: [CHECKLIST_IMPLEMENTACAO.md](CHECKLIST_IMPLEMENTACAO.md) (30 min)
2. Executar: Tarefas Sprint 1 → Sprint 2 → Sprint 3 (8 dias úteis)
3. Deploy: Cloud Run + Firebase

### **🏗️ Sou Arquiteto - Onde está a arquitetura?**
1. Ler: [ARQUITETURA_PAUTA_WAR_ROOM.md](ARQUITETURA_PAUTA_WAR_ROOM.md) (45 min)
2. Ver: Diagramas, VIEWs SQL, Endpoints FastAPI
3. Validar: Código em [bigquery/views_pauta_war_room.sql](bigquery/views_pauta_war_room.sql)

---

## 📚 DOCUMENTAÇÃO COMPLETA

| Arquivo | Descrição | Público | Tempo |
|---------|-----------|---------|-------|
| [INDEX_DOCUMENTACAO.md](INDEX_DOCUMENTACAO.md) ⭐ | **Índice principal - COMECE AQUI** | Todos | 5 min |
| [RESUMO_EXECUTIVO_ARQUITETURA.md](RESUMO_EXECUTIVO_ARQUITETURA.md) | Overview para tomada de decisão | CEO/VP | 15 min |
| [ARQUITETURA_PAUTA_WAR_ROOM.md](ARQUITETURA_PAUTA_WAR_ROOM.md) | Arquitetura técnica completa | Arquitetos/Devs | 45 min |
| [CHECKLIST_IMPLEMENTACAO.md](CHECKLIST_IMPLEMENTACAO.md) | Guia passo a passo para execução | Developers | 8 dias |
| [GUIA_DECISAO_FERRAMENTAS.md](GUIA_DECISAO_FERRAMENTAS.md) | Manual de uso para end-users | Gerentes | 10 min |
| [RAG_CASOS_DE_USO.md](RAG_CASOS_DE_USO.md) | Como usar busca vetorial na prática | Sales Ops | 20 min |
| [APRESENTACAO_EXECUTIVA.md](APRESENTACAO_EXECUTIVA.md) | Slides para apresentação | Todos | 15 min |
| [bigquery/views_pauta_war_room.sql](bigquery/views_pauta_war_room.sql) | Scripts SQL completos | DBAs | 30 min |

---

## 🎯 O QUE ESTAMOS CONSTRUINDO?

### **1️⃣ PAUTA SEMANAL**
**Antes:** 2h de preparação manual para cada 1:1  
**Depois:** 15 min automatizados com contexto RAG

**Features:**
- ✅ Timeline de deals prioritários do vendedor
- ✅ Score de Risco (0-5) por deal
- ✅ **Perguntas de Sabatina** geradas por IA
- ✅ **Contexto RAG:** Deals similares históricos

**URL:** `https://xertica-dashboard.web.app/pautasemanal.html`

---

### **2️⃣ WAR ROOM (APRESENTAÇÃO SEMANAL)**
**Antes:** Revisões executivas sem métricas objetivas  
**Depois:** Dashboard "verdade nua e crua" com notas A-F

**Features:**
- ✅ Resumo executivo (Fechado vs. Pipeline Q atual)
- ✅ **Notas A-F de Higiene** por vendedor
- ✅ Hit List de deals críticos (top 20)
- ✅ **Insights IA (Gemini):** 3 pontos de atenção + 3 ações

**URL:** `https://xertica-dashboard.web.app/apresentacao.html`

---

## 🔥 DIFERENCIAL: RAG (RETRIEVAL-AUGMENTED GENERATION)

**O que é?**  
"Google semântico" para deals - busca por significado, não por palavras-chave.

**Como funciona?**
1. **2848 deals** convertidos em vetores de 768 dimensões (Vertex AI)
2. **Busca vetorial** por similaridade cosseno
3. **Contexto histórico** automatizado para IA e gerentes

**Valor prático:**
```
Deal atual (parado há 60 dias):
  "Google Workspace 500 users | R$500k"

RAG encontra:
  ✅ "Google Cloud 400 users | R$450k | GANHO em 45 dias"
     Lição: "POC técnico desbloqueou fechamento"
  
  ❌ "Google Suite 600 users | R$520k | PERDIDO após 180 dias"
     Causa: "Deal parou >90 dias no jurídico"

Pergunta gerada:
  "Você ganhou um deal similar em 45 dias ano passado.
   Por que este está parado há 60 dias?"
```

---

## 💰 ROI (RETURN ON INVESTMENT)

| Métrica | Valor |
|---------|-------|
| **Investimento** | R$16k (dev) + R$18/mês (operacional) |
| **Economia/Ano** | R$316k (tempo + deals salvos + ramp-up) |
| **Payback** | < 1 mês |
| **ROI Ano 1** | **1.854%** 🚀 |

**Breakdown economia mensal:**
- Tempo Sales Ops: 7h/semana × R$50/h = R$1.400
- Deals zumbis recuperados: 3/mês × R$100k × 5% = R$15.000
- Ramp-up acelerado: R$10.000

---

## 🏗️ STACK TECNOLÓGICO

```
Frontend:    HTML + Vanilla JS (Firebase Hosting)
Backend:     FastAPI + Cloud Run (Python 3.11)
Database:    BigQuery (operaciones-br.sales_intelligence)
RAG:         Vertex AI Text Embeddings (768d)
IA:          Gemini 1.5 Flash (insights + perguntas)
Custo:       ~R$18/mês (BigQuery + Gemini + Cloud Run)
```

---

## 📊 COMPONENTES PRINCIPAIS

### **BigQuery VIEWs:**
- `pauta_semanal_enriquecida` - Pipeline + ML + Risco Score
- `war_room_metrics` - Higiene por vendedor + Notas A-F

### **API Endpoints:**
- `GET /api/weekly-agenda` - Pauta semanal enriquecida
- `GET /api/war-room` - Dashboard executivo

### **Frontend:**
- `pautasemanal.html` - Timeline + Sabatina
- `apresentacao.html` - War Room Dashboard

### **RAG:**
- `deal_embeddings` - 2848 deals + embeddings 768d
- Busca vetorial por similaridade cosseno

---

## ⚡ IMPLEMENTAÇÃO RÁPIDA

### **Pré-requisitos:**
- [x] BigQuery dataset `operaciones-br.sales_intelligence`
- [x] Cloud Run API existente
- [x] RAG ativo (deal_embeddings com 2848 registros)
- [ ] 8 dias úteis de desenvolvimento

### **3 Sprints:**
1. **Sprint 1 (3 dias):** Backend (VIEWs + Endpoints + Deploy)
2. **Sprint 2 (3 dias):** Frontend (HTMLs + Integração)
3. **Sprint 3 (2 dias):** Go-Live (Testes + Treinamento)

**Timeline:** 2 semanas (8 dias úteis)

---

## 📅 PRÓXIMOS PASSOS

### **Se você é Tech Lead:**
1. ✅ Ler [RESUMO_EXECUTIVO_ARQUITETURA.md](RESUMO_EXECUTIVO_ARQUITETURA.md)
2. ⏭️ Aprovar arquitetura (Go/No-Go)
3. ⏭️ Criar tasks no Jira baseado no [CHECKLIST_IMPLEMENTACAO.md](CHECKLIST_IMPLEMENTACAO.md)
4. ⏭️ Kickoff com time (2h)

### **Se você é Developer:**
1. ✅ Familiarizar com [ARQUITETURA_PAUTA_WAR_ROOM.md](ARQUITETURA_PAUTA_WAR_ROOM.md)
2. ⏭️ Executar [Tarefa 1.1 do Checklist](CHECKLIST_IMPLEMENTACAO.md#tarefa-11-criar-view-pauta_semanal_enriquecida)
3. ⏭️ Seguir checklist sequencialmente

### **Se você é Gerente/VP:**
1. ✅ Ler [GUIA_DECISAO_FERRAMENTAS.md](GUIA_DECISAO_FERRAMENTAS.md)
2. ⏭️ Participar de demo ao vivo (30 min)
3. ⏭️ Começar a usar (Pauta Semanal diária + War Room segunda)

---

## 📞 SUPORTE

**Slack:** `#sales-intelligence-support`  
**Email:** sales-ops@xertica.ai  
**Docs:** [INDEX_DOCUMENTACAO.md](INDEX_DOCUMENTACAO.md)  
**GitHub:** [xerticaai/playbook](https://github.com/xerticaai/playbook)

---

## 🎯 MÉTRICAS DE SUCESSO

### **Semana 1:**
- [ ] 50% dos gerentes acessaram ferramentas
- [ ] Zero bugs críticos

### **Mês 1:**
- [ ] 100% adoção de Pauta Semanal
- [ ] War Room vira ritual oficial (toda segunda)
- [ ] 20+ deals zumbis limpos
- [ ] Tempo prep 1:1: 2h → 15 min

### **Mês 3:**
- [ ] ROI confirmado (>1000%)
- [ ] Ramp-up vendedores: 6 meses → 3 meses
- [ ] 10+ padrões de perda identificados

---

## 🏆 FEATURES DESTACADAS

### **🔥 RAG (Busca Vetorial)**
Único no mercado com contexto histórico automatizado

### **🤖 Perguntas de Sabatina**
IA gera perguntas impossíveis de "enrolar"

### **📊 Notas A-F de Higiene**
Pipeline "podre" não tem onde se esconder

### **💰 Custo Mínimo**
~R$18/mês (1/100 do preço de SaaS comercial)

### **⚡ Customização Total**
100% adaptado ao nosso processo de vendas

---

## 📖 GLOSSÁRIO

| Termo | Definição |
|-------|-----------|
| **RAG** | Retrieval-Augmented Generation (busca vetorial + IA) |
| **deal_embeddings** | Tabela com vetores de 768 dimensões |
| **Risco_Score** | Métrica 0-5 de risco por deal |
| **Nota_Higiene** | Nota A-F de qualidade de pipeline |
| **Zumbi** | Deal >90 dias sem atividade |
| **Sabatina** | Perguntas difíceis geradas por IA |
| **War Room** | Dashboard executivo "verdade nua e crua" |

---

## 🎉 CONTRIBUINDO

### **Reportar Bug:**
- Slack: `#sales-intelligence-support`
- GitHub Issues: [Link](https://github.com/xerticaai/playbook/issues)

### **Sugerir Feature:**
- Formulário: [Link Google Forms]
- Reunião mensal de roadmap

### **Contribuir com Código:**
- Fork → Branch → PR
- Code Review obrigatório

---

## 📜 LICENÇA

Propriedade de **Xertica.ai**  
Uso interno apenas  
© 2026 Xertica.ai

---

## 📅 HISTÓRICO DE VERSÕES

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0 | 2026-02-08 | Criação inicial da documentação completa |

---

## 🚀 STATUS DO PROJETO

**Fase:** 📐 Arquitetura Completa ✅  
**Próximo:** 🛠️ Implementação (Sprint 1)  
**Go-Live Previsto:** 22 de Fevereiro de 2026  
**Owner:** Time de Sales Ops + Dev Xertica.ai

---

**Última atualização:** 2026-02-08  
**Mantido por:** Time de Sales Ops Xertica.ai  
**Documentação:** [INDEX_DOCUMENTACAO.md](INDEX_DOCUMENTACAO.md) ⭐
