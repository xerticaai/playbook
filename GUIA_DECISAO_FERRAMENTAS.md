# 🎯 GUIA DE DECISÃO: QUAL FERRAMENTA USAR?

## 📊 Cenários de Uso

```
┌─────────────────────────────────────────────────────────────────┐
│                     NECESSIDADE DO USUÁRIO                      │
└─────────────────────────────────────────────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │ Qual é o caso?  │
                    └─────────────────┘
                              ▼
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ PREPARAR 1:1  │    │ REVISÃO CEO   │    │ ANÁLISE AD-HOC│
│ COM VENDEDOR  │    │ SEMANAL       │    │ HISTÓRICA     │
└───────────────┘    └───────────────┘    └───────────────┘
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│📅 PAUTA       │    │🎯 WAR ROOM    │    │📈 DASHBOARD   │
│   SEMANAL     │    │  (APRESENTAÇÃO│    │   PRINCIPAL   │
│               │    │   SEMANAL)    │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## 📅 PAUTA SEMANAL

**🎯 Quando usar:**
- ✅ Preparar reunião 1:1 com vendedor específico
- ✅ Revisar deals prioritários da semana atual
- ✅ Gerar perguntas difíceis baseadas em dados
- ✅ Comparar deal atual com histórico do vendedor (RAG)
- ✅ Identificar próximas ações por deal

**❌ Quando NÃO usar:**
- ❌ Visão agregada de todo o time (use War Room)
- ❌ Análise de tendências mensais (use Dashboard Principal)
- ❌ Comparação entre vendedores (use Performance)

**📱 URL:** `https://xertica-dashboard.web.app/pautasemanal.html`

**⏱️ Tempo esperado:** 15 min (antes: 2h manual)

**🎬 Fluxo típico:**
```
1. Abrir Pauta Semanal
2. Filtrar: "Alex Araujo"
3. Ver 12 deals críticos/alta prioridade
4. Clicar "Sabatina" no Deal X (R$500k, Risco 4/5)
5. Ler perguntas geradas:
   - "❌ Deal abandonado? Data próxima reunião?"
   - "💰 Como garantir fechamento sem orçamento?"
6. Ver Contexto RAG: 3 deals similares que Alex ganhou
7. Anotar perguntas para 1:1
8. Repetir para próximo deal
```

**📊 Dados exibidos:**
- Deals filtrados por confiança (≥40%)
- Score de Risco (0-5)
- Tags visuais (ZUMBI, SEM_ATIVIDADE, DESALINHADO)
- Perguntas de sabatina geradas por IA
- Contexto RAG (deals similares históricos)

---

## 🎯 WAR ROOM (APRESENTAÇÃO SEMANAL)

**🎯 Quando usar:**
- ✅ Revisão semanal de forecast com CEO/VP
- ✅ Avaliar saúde geral do pipeline (notas A-F)
- ✅ Identificar vendedores com problemas de higiene
- ✅ Priorizar ações corretivas em deals críticos
- ✅ Comunicar "verdade nua e crua" para liderança

**❌ Quando NÃO usar:**
- ❌ Deep dive em um vendedor específico (use Pauta Semanal)
- ❌ Análise exploratória de dados (use Dashboard Principal)
- ❌ Relatórios mensais/trimestrais (use Dashboard Principal)

**📱 URL:** `https://xertica-dashboard.web.app/apresentacao.html`

**⏱️ Tempo esperado:** 30 min (reunião executiva)

**🎬 Fluxo típico:**
```
1. Abrir War Room (auto-detecta Q vigente e semana)
2. Revisar Resumo Executivo:
   - Fechado Q1: R$2.5M (45 deals)
   - Pipeline: R$5.0M (120 deals)
   - Zumbis: 15 deals (R$1.2M)
3. Navegar por vendedor na sidebar
4. Clicar "Maria Silva" (Nota F ⚠️)
   - Higiene: 52% podre
   - 3 deals zumbi
   - Hit List: 5 deals críticos
5. Ler Insights IA:
   "PONTOS DE ATENÇÃO:
    1. Maria tem 3 perdas consecutivas...
    2. Pipeline 60% zumbi...
    AÇÕES:
    1. Coaching urgente...
    2. Realocar deals de território..."
6. Decidir ações e comunicar ao time
```

**📊 Dados exibidos:**
- Metadados da semana (Q, Semana X/13)
- Resumo executivo (Fechado vs. Pipeline)
- Notas de Higiene A-F por vendedor
- % Pipeline Podre
- Hit List (Top 20 deals críticos)
- Perguntas de sabatina inline
- Insights IA executivos (Gemini)

---

## 📈 DASHBOARD PRINCIPAL

**🎯 Quando usar:**
- ✅ Análise exploratória geral
- ✅ Comparação de períodos (Q1 vs Q2)
- ✅ Métricas de performance por vendedor
- ✅ Análise de produtos/segmentos
- ✅ Visualizações de tendências

**❌ Quando NÃO usar:**
- ❌ Preparação de 1:1 (use Pauta Semanal)
- ❌ Revisão executiva semanal (use War Room)

**📱 URL:** `https://xertica-dashboard.web.app/index.html`

**Seções:**
- Overview (KPIs gerais)
- Pipeline (deals ativos)
- Análise de Vendedores
- Performance (win rate, ciclo)
- Aprendizados (deals ganhos/perdidos)
- Inteligência ML (6 modelos preditivos)

---

## 🔀 MATRIZ DE DECISÃO RÁPIDA

| Pergunta | Ferramenta |
|----------|-----------|
| "Preciso preparar 1:1 com Alex amanhã" | 📅 **Pauta Semanal** |
| "CEO quer saber saúde do pipeline TODAY" | 🎯 **War Room** |
| "Qual vendedor tem melhor win rate Q1?" | 📈 **Dashboard** (Performance) |
| "Quais deals estão parados >90 dias?" | 📅 **Pauta Semanal** (Categoria: ZUMBI) |
| "Maria tem nota F, quais são os problemas?" | 🎯 **War Room** (clicar Maria) |
| "Quanto fechamos em dezembro?" | 📈 **Dashboard** (filtros) |
| "Que perguntas fazer sobre Deal X?" | 📅 **Pauta Semanal** (Sabatina) |
| "Insights sobre padrões de perda?" | 📈 **Dashboard** (Aprendizados) |
| "Timeline de deals desta semana?" | 📅 **Pauta Semanal** |
| "Ranking vendedores por higiene?" | 🎯 **War Room** |

---

## 🎭 PERSONAS E CASOS DE USO

### 👔 **Gerente de Vendas (Sales Manager)**
**Dia-a-dia:**
- **Segunda 9h:** Abrir **War Room** → Revisar saúde da semana
- **Terça-Sexta:** Antes de cada 1:1, abrir **Pauta Semanal** → Filtrar vendedor
- **Sexta 17h:** Revisar **Dashboard** → Análise de tendências mensais

**Toolbox:**
1. 🎯 War Room (checagem semanal)
2. 📅 Pauta Semanal (preparação 1:1)
3. 📈 Dashboard (análise tática)

---

### 👨‍💼 **VP de Vendas / CRO**
**Dia-a-dia:**
- **Segunda 10h:** Reunião War Room com time → Usar **War Room**
- **Quarta:** Análise estratégica → Usar **Dashboard** (filtros personalizados)
- **Sexta:** Review executivo → Usar **War Room** + **Dashboard**

**Toolbox:**
1. 🎯 War Room (ritual semanal)
2. 📈 Dashboard (visão estratégica)
3. 📅 Pauta Semanal (raramente, se precisar de deep dive)

---

### 🧑‍💻 **Sales Ops Analyst**
**Dia-a-dia:**
- **Diariamente:** Monitorar **Dashboard** → Detectar anomalias
- **Antes de reuniões executivas:** Preparar dados no **War Room**
- **Para coaching:** Usar **Pauta Semanal** → Identificar problemas específicos

**Toolbox:**
1. 📈 Dashboard (monitoramento contínuo)
2. 🎯 War Room (preparação executiva)
3. 📅 Pauta Semanal (análise profunda)

---

## 🚦 FLUXO SEMANAL RECOMENDADO

```
┌─────────────────────────────────────────────────────────────────┐
│                         SEGUNDA-FEIRA                           │
├─────────────────────────────────────────────────────────────────┤
│ 09:00 - Gerente abre WAR ROOM                                   │
│         → Revisar resumo executivo                              │
│         → Identificar vendedores com Nota D/F                   │
│         → Ler insights IA (pontos de atenção)                   │
│         → Decidir ações da semana                               │
│                                                                 │
│ 10:00 - Reunião War Room com time (30 min)                     │
│         → Apresentar War Room no telão                          │
│         → Discutir deals críticos (hit list)                    │
│         → Alocar recursos (quem resolve o quê)                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      TERÇA - SEXTA                              │
├─────────────────────────────────────────────────────────────────┤
│ Antes de cada 1:1:                                              │
│   → Abrir PAUTA SEMANAL                                         │
│   → Filtrar por vendedor                                        │
│   → Revisar deals críticos (5-10 min)                           │
│   → Anotar perguntas de sabatina                                │
│                                                                 │
│ Durante 1:1:                                                    │
│   → Fazer perguntas de sabatina                                 │
│   → Mostrar contexto RAG (deals similares)                      │
│   → Definir next steps por deal                                 │
│                                                                 │
│ Pós 1:1:                                                        │
│   → Atualizar deals no Salesforce                               │
│   → Marcar follow-ups no calendário                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         SEXTA-FEIRA                             │
├─────────────────────────────────────────────────────────────────┤
│ 17:00 - Review da semana                                        │
│         → Abrir DASHBOARD                                       │
│         → Comparar semana atual vs. anterior                    │
│         → Identificar tendências                                │
│         → Atualizar forecast para próxima semana                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🆚 COMPARAÇÃO LADO A LADO

| Critério | 📅 Pauta Semanal | 🎯 War Room | 📈 Dashboard |
|----------|------------------|-------------|--------------|
| **Público** | Gerentes (1:1) | Executivos (reunião) | Todos (self-service) |
| **Frequência** | Diário | Semanal | Ad-hoc |
| **Tempo de uso** | 15 min | 30 min | Variável |
| **Foco** | Deal-level | Vendedor-level | Agregado |
| **Granularidade** | Muito alta | Alta | Média |
| **Acionabilidade** | Perguntas específicas | Ações estratégicas | Exploratória |
| **RAG Context** | ✅ Sim | ❌ Não (insights IA) | ❌ Não |
| **Filtros** | Vendedor, Semana | Nenhum (Q atual) | Year, Quarter, Seller |
| **Saída** | Perguntas 1:1 | Decisões executivas | Insights táticos |

---

## 💡 DICAS E BOAS PRÁTICAS

### ✅ **DO's (Faça)**
- ✅ Use **Pauta Semanal** ANTES de toda reunião 1:1
- ✅ Ritualize **War Room** toda segunda 10h com time completo
- ✅ Anote perguntas de sabatina e use-as literalmente
- ✅ Compartilhe contexto RAG com vendedor (mostre deals similares)
- ✅ Siga insights IA (são baseados em dados reais)
- ✅ Limpe deals zumbis semanalmente (kill or commit)

### ❌ **DON'Ts (Não faça)**
- ❌ NÃO ignore Nota F de higiene (agir imediatamente)
- ❌ NÃO use War Room para análise individual de deals
- ❌ NÃO faça 1:1 sem preparar Pauta Semanal antes
- ❌ NÃO trate insights IA como "sugestões opcionais" (são alertas!)
- ❌ NÃO deixe deals >90 dias sem atividade (zumbis matam pipeline)

---

## 📞 AJUDA E SUPORTE

**Dúvidas sobre qual ferramenta usar?**
- Slack: `#sales-intelligence-support`
- Wiki: [Link interno]

**Bugs ou problemas técnicos?**
- Abrir ticket: [Link Jira/Linear]
- Email: sales-ops@xertica.ai

**Feature requests?**
- Formulário: [Link Google Forms]
- Reunião mensal de roadmap

---

## 🎓 RECURSOS DE APRENDIZADO

- 📹 **Vídeo Tutorial:** [Link YouTube]
- 📄 **Documentação Completa:** [ARQUITETURA_PAUTA_WAR_ROOM.md](ARQUITETURA_PAUTA_WAR_ROOM.md)
- ✅ **Checklist de Implementação:** [CHECKLIST_IMPLEMENTACAO.md](CHECKLIST_IMPLEMENTACAO.md)
- 📊 **FAQ:** [Link Notion]

---

**Última atualização:** 2026-02-08  
**Versão:** 1.0  
**Mantido por:** Time de Sales Ops Xertica.ai
