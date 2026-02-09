# 📊 APRESENTAÇÃO EXECUTIVA: PAUTA SEMANAL + WAR ROOM

## 🎯 SLIDE 1: THE ASK

### **Problema:**
- ⏰ Gerentes gastam **2h/semana** preparando pautas manualmente
- 🤷 Falta contexto histórico ("já vendemos algo assim antes?")
- 💀 **30% dos deals zumbis** não são detectados
- 📊 Revisões executivas sem **dados objetivos de higiene**

### **Solução Proposta:**
**2 novas ferramentas automatizadas:**
1. 📅 **Pauta Semanal:** Preparação de 1:1s em 15 min (vs 2h)
2. 🎯 **War Room:** Dashboard executivo "verdade nua e crua"

### **Diferencial:**
🔥 **RAG (Busca Vetorial):** Contexto histórico automatizado  
🤖 **Gemini AI:** Perguntas de sabatina + insights executivos

---

## 💰 SLIDE 2: ROI (RETURN ON INVESTMENT)

### **Investimento:**
| Item | Valor |
|------|-------|
| Desenvolvimento | 8 dias úteis (160h @ R$100/h) = **R$16.000** |
| Custo operacional mensal | BigQuery + Gemini + Cloud Run = **R$18/mês** |
| **TOTAL Ano 1** | **R$16.216** |

### **Retorno:**
| Benefício | Valor/Mês | Valor/Ano |
|-----------|-----------|-----------|
| Tempo economizado Sales Ops | 7h/semana × R$50/h = **R$1.400** | **R$16.800** |
| Deals zumbis recuperados | 3 deals/mês × R$100k × 5% conv = **R$15.000** | **R$180.000** |
| Ramp-up vendedores acelerado | 50% mais rápido = **R$10.000** | **R$120.000** |
| **TOTAL Economia/Ano** | **R$26.400** | **R$316.800** |

### **Payback:**
R$16.216 investimento ÷ R$26.400/mês = **< 1 mês** 🎉

### **ROI Ano 1:**
(R$316.800 - R$16.216) ÷ R$16.216 = **1.854%** 🚀

---

## 🏗️ SLIDE 3: ARQUITETURA (VISUAL SIMPLIFICADO)

```
┌─────────────────────────────────────────────────────────┐
│  👤 USUÁRIO (Sales Manager / VP)                         │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  🎨 FRONTEND                                             │
│  ├─ pautasemanal.html    (Timeline + Sabatina)          │
│  └─ apresentacao.html    (War Room Dashboard)           │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  🛰️ API (Cloud Run - FastAPI)                           │
│  ├─ /api/weekly-agenda   (Pauta Enriquecida)            │
│  └─ /api/war-room        (Métricas + Insights)          │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  🗄️ BIGQUERY (operaciones-br.sales_intelligence)       │
│  ├─ pipeline, closed_deals_won, closed_deals_lost       │
│  ├─ deal_embeddings (🔥 RAG: 2848 deals, 768d vectors) │
│  ├─ VIEW: pauta_semanal_enriquecida                     │
│  └─ VIEW: war_room_metrics                              │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  🤖 IA SERVICES                                          │
│  ├─ Vertex AI: Busca Semântica (RAG)                    │
│  └─ Gemini 1.5 Flash: Insights + Perguntas              │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 SLIDE 4: PAUTA SEMANAL (DEMO)

### **Quando usar:**
✅ Antes de toda reunião 1:1 com vendedor

### **O que faz:**
1. **Lista deals prioritários** (confiança ≥40% ou zumbis)
2. **Score de Risco** (0-5) por deal
3. **Perguntas de Sabatina** geradas por IA
   - "❌ Deal abandonado? Data próxima reunião?"
   - "💰 Como fechar sem orçamento confirmado?"
4. **Contexto RAG:** "Deals similares que este vendedor ganhou/perdeu"

### **Screenshot Mockup:**
```
┌────────────────────────────────────────────────────────┐
│ 📅 PAUTA SEMANAL - Alex Araujo                         │
├────────────────────────────────────────────────────────┤
│ 12 deals  |  R$ 1.5M  |  Conf. média: 65%              │
├────────────────────────────────────────────────────────┤
│ 🔴 Deal X · R$ 500k · ZUMBI · Risco 5/5                │
│    IBM Watson Migration - Parado há 75 dias            │
│    [🎯 Sabatina] [📊 Ver Contexto RAG]                 │
│                                                        │
│    💬 PERGUNTAS SABATINA:                              │
│    ❌ Deal >90 dias sem atividade. Kill or Commit?     │
│    📊 Você ganhou 2 deals similares em <60 dias.       │
│       Por que este está parado há 75?                  │
│    💰 Cliente tem orçamento aprovado? Quem assina?     │
│                                                        │
│    📈 CONTEXTO RAG (Deals Similares):                  │
│    ✅ IBM Cloud 2024 - GANHO em 52 dias                │
│       "Reunião CFO desbloqueou assinatura"            │
│    ❌ IBM Watson 2023 - PERDIDO após 180 dias          │
│       "Falta de follow-up matou o deal"               │
└────────────────────────────────────────────────────────┘
```

### **Resultado:**
- ⏰ **15 min** de preparação (antes: 2h)
- ✅ Perguntas impossíveis de "enrolar"
- 📊 Contexto histórico rico

---

## 🎯 SLIDE 5: WAR ROOM (DEMO)

### **Quando usar:**
✅ Reunião semanal de forecast com CEO/VP (toda segunda 10h)

### **O que faz:**
1. **Resumo Executivo:** Fechado vs. Pipeline Q atual
2. **Notas A-F de Higiene** por vendedor
3. **Hit List:** Top 20 deals críticos (risco alto)
4. **Insights IA (Gemini):**
   - 3 pontos de atenção
   - 2 vitórias da semana
   - 3 ações imediatas

### **Screenshot Mockup:**
```
┌────────────────────────────────────────────────────────┐
│ 🎯 WAR ROOM - FY26-Q1 SEMANA 6/13                      │
├────────────────────────────────────────────────────────┤
│ Fechado: R$2.5M (45 deals)  |  Pipeline: R$5.0M       │
│ Zumbis: 15 deals (R$1.2M)   |  Risco: R$800k          │
├────────────────────────────────────────────────────────┤
│ [Nav Lateral]        [Painel Vendedor]                 │
│ ┌──────────┐        ┌─────────────────────────────┐   │
│ │Alex   [A]│        │ 🧑 ALEX ARAUJO              │   │
│ │Carlos [B]│        │ Nota Higiene: A (8% podre)  │   │
│ │Maria  [F]│ ◀────▶ │ Forecast: R$ 1.2M           │   │
│ │José   [C]│        │ Zumbis: 1 deal              │   │
│ │...       │        │                             │   │
│ └──────────┘        │ 📋 HIT LIST (Top 5):        │   │
│                     │ • IBM Watson (R$500k) 🔴5/5 │   │
│                     │   ❌ 75 dias sem atividade   │   │
│                     │   💰 Sem orçamento           │   │
│                     │ • Google GCP (R$300k) 🟡3/5 │   │
│                     │   ⚠️ Desalinhado Espec/SF   │   │
│                     └─────────────────────────────┘   │
│                                                        │
│ 🤖 INSIGHTS IA (Gemini):                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ PONTOS DE ATENÇÃO:                                     │
│ 1. 15 deals zumbis = R$2.5M (20% do pipeline)         │
│ 2. 3 vendedores com nota F - revisar território       │
│ 3. Pipeline Q1 abaixo da meta em 30%                  │
│                                                        │
│ AÇÕES IMEDIATAS:                                       │
│ 1. Limpar 15 deals zumbis até sexta (kill/commit)     │
│ 2. Coaching urgente: Maria (3 perdas consecutivas)    │
│ 3. Acelerar prospecção Q1 (+20 deals novos)           │
└────────────────────────────────────────────────────────┘
```

### **Resultado:**
- 📊 **100% visibilidade** de saúde de pipeline
- ⚠️ Notas F impossíveis de esconder
- 🎯 Ações claras e acionáveis

---

## 🔥 SLIDE 6: DIFERENCIAL - RAG (BUSCA VETORIAL)

### **O que é RAG?**
**Google semântico para deals:**
- Não busca por palavras-chave
- Busca por **significado** e **contexto**
- Entende similaridade entre deals

### **Exemplo Prático:**
```
Deal Atual (Pipeline):
  "Google Workspace 500 usuários | R$500k | Parado há 60 dias"

RAG encontra (histórico):
  ✅ Similarity 0.91: "Google Cloud 400 usuários | R$450k | 
                       GANHO em 45 dias | 
                       Lição: POC técnico desbloqueou"
  
  ❌ Similarity 0.85: "Google Suite 600 usuários | R$520k | 
                       PERDIDO após 180 dias | 
                       Causa: Deal parou >90 dias no jurídico"
```

### **Valor:**
- ✅ Contexto histórico **automatizado**
- ✅ Transferência de conhecimento **instantânea**
- ✅ Padrões identificados **objetivamente**

### **Casos de Uso:**
1. **1:1s:** "Você já ganhou 3 deals similares. O que é diferente agora?"
2. **Training:** Novos vendedores veem playbooks de veteranos
3. **Análise:** "Por que perdemos deals grandes em Q4?"

---

## 📅 SLIDE 7: TIMELINE DE IMPLEMENTAÇÃO

### **Sprint 1: Backend (3 dias úteis)**
- ✅ Criar VIEWs BigQuery (`pauta_semanal_enriquecida`, `war_room_metrics`)
- ✅ Implementar endpoints `/api/weekly-agenda` e `/api/war-room`
- ✅ Deploy Cloud Run

### **Sprint 2: Frontend (3 dias úteis)**
- ✅ Criar `pautasemanal.html` (Timeline + Sabatina)
- ✅ Criar `apresentacao.html` (War Room Dashboard)
- ✅ Integrar com API

### **Sprint 3: Go-Live (2 dias úteis)**
- ✅ Testes integrados
- ✅ Treinamento usuários (30 min demo)
- ✅ Deploy produção

### **Total: 8 dias úteis (2 semanas)**

---

## ✅ SLIDE 8: MÉTRICAS DE SUCESSO

### **Semana 1 (Pós-Go-Live):**
- [ ] 50% dos gerentes acessaram Pauta Semanal
- [ ] Feedback inicial coletado
- [ ] Zero bugs críticos

### **Semana 2:**
- [ ] 80% dos gerentes usam Pauta Semanal
- [ ] War Room vira ritual oficial (toda segunda)
- [ ] Pelo menos 5 deals zumbis limpos

### **Mês 1:**
- [ ] 100% adoção de Pauta Semanal
- [ ] 20+ deals zumbis identificados e resolvidos
- [ ] Tempo de prep 1:1: 2h → 15 min
- [ ] Pelo menos 1 deal grande salvo com base em contexto RAG

### **Mês 3:**
- [ ] Ramp-up novos vendedores: 6 meses → 3 meses
- [ ] 10+ padrões de perda identificados e corrigidos
- [ ] ROI confirmado (>1000%)

---

## 🚦 SLIDE 9: DECISÃO (GO / NO-GO)

### **GO se:**
✅ Time de Sales Ops tem capacidade (8 dias úteis)  
✅ Budget aprovado (R$16k desenvolvimento + R$18/mês operacional)  
✅ Liderança comprometida com adoção (ritual semanal War Room)  
✅ Gerentes dispostos a mudar processo (usar Pauta Semanal diariamente)

### **NO-GO se:**
❌ Time sobrecarregado (priorizar outras iniciativas)  
❌ Liderança não vai usar (ferramenta vira "shelf-ware")  
❌ Dados de baixa qualidade (pipeline não atualizado)  
❌ Resistência cultural (gerentes não querem "verdade nua e crua")

### **Riscos Mitigados:**
- ✅ **Técnico:** Stack comprovado (BigQuery + Cloud Run + Gemini)
- ✅ **Dados:** RAG já existe (2848 deals embedded)
- ✅ **Adoção:** Treinamento incluído (30 min demo)
- ✅ **Custo:** Operacional mínimo (R$18/mês)

---

## 🎯 SLIDE 10: PRÓXIMOS PASSOS

### **Se aprovado hoje:**

**Semana 1 (8-15 Fev):**
- [ ] Kickoff com time (2h)
- [ ] Sprint 1: Criar VIEWs + Endpoints
- [ ] Code Review + Ajustes

**Semana 2 (16-22 Fev):**
- [ ] Sprint 2: Frontend (HTMLs)
- [ ] Testes integrados
- [ ] Sprint 3: Go-Live

**Semana 3 (23 Fev):**
- [ ] Treinamento gerentes (30 min)
- [ ] Primeira reunião War Room oficial
- [ ] Coletar feedback inicial

**Mês 2-3 (Mar-Abr):**
- [ ] Iterar com base em feedback
- [ ] Expandir casos de uso do RAG
- [ ] Medir ROI real vs. projetado

---

## 📊 SLIDE 11: COMPARAÇÃO COM ALTERNATIVAS

| Solução | Custo/Mês | Implementação | Customização | RAG Context |
|---------|-----------|---------------|--------------|-------------|
| **Nossa Solução** ⭐ | R$18 | 8 dias | Total | ✅ Sim |
| Salesforce Einstein | $150/user | Imediato | Baixa | ❌ Não |
| Gong.io | $100/user | 2 semanas | Média | ⚠️ Limitado |
| Solução Manual | R$0 | - | Total | ❌ Não |
| Contratar Consultor | R$20k/mês | 3 meses | Alta | ❌ Não |

### **Por que nossa solução vence:**
- ✅ **Custo:** 1/100 do preço de SaaS comercial
- ✅ **RAG:** Único com contexto histórico automatizado
- ✅ **Customização:** 100% adaptado ao nosso processo
- ✅ **Dados:** Nossa fonte de verdade (BigQuery)

---

## 🎤 SLIDE 12: CALL TO ACTION

### **Pedindo aprovação para:**
1. ✅ **Budget:** R$16k desenvolvimento (1x) + R$18/mês operacional
2. ✅ **Time:** 2 developers por 8 dias úteis
3. ✅ **Compromisso liderança:** Usar War Room toda segunda 10h
4. ✅ **Compromisso gerentes:** Usar Pauta Semanal antes de 1:1s

### **Em troca, entregamos:**
- 📅 Pauta Semanal automatizada (15 min vs 2h)
- 🎯 War Room executivo "verdade nua e crua"
- 🔥 RAG: Contexto histórico que nenhuma ferramenta comercial tem
- 💰 ROI >1800% em 12 meses

### **Próxima ação:**
🚀 **Aprovar hoje → Kickoff segunda-feira → Go-Live em 2 semanas**

---

## 📞 SLIDE 13: CONTATOS

**Tech Lead:**  
[Nome] - [email] - Slack: @tech-lead

**Product Owner:**  
[Nome] - [email] - Slack: @product-owner

**Sales Ops:**  
[Nome] - [email] - Slack: @sales-ops

**Canal de Comunicação:**  
Slack `#sales-intelligence-project`

**Documentação Completa:**  
[Link para /workspaces/playbook/INDEX_DOCUMENTACAO.md]

---

## 🎉 SLIDE 14: THANK YOU

**Perguntas?**

---

**Anexos:**
- 📄 [ARQUITETURA_PAUTA_WAR_ROOM.md](ARQUITETURA_PAUTA_WAR_ROOM.md) - Detalhes técnicos
- ✅ [CHECKLIST_IMPLEMENTACAO.md](CHECKLIST_IMPLEMENTACAO.md) - Guia execução
- 🎯 [GUIA_DECISAO_FERRAMENTAS.md](GUIA_DECISAO_FERRAMENTAS.md) - Manual usuários
- 🔥 [RAG_CASOS_DE_USO.md](RAG_CASOS_DE_USO.md) - RAG em ação

---

**Data:** 2026-02-08  
**Versão:** 1.0  
**Preparado por:** Time de Sales Ops + Dev Xertica.ai
