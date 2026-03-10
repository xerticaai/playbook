# 🏆 AI Olympics — Candidatura Xertica Brasil
**Categoria Recomendada:** 🏛️ Categoria 1 — *The Prompt Architect* (Data & Insights)
**Projeto:** Sales Intelligence Engine — Hub x-sales
**Equipe:** Operations Brazil · GCP Project `operaciones-br`
**Data de submissão:** Março 2026

---

## 1. O que é o sistema?

O **Sales Intelligence Engine** é uma plataforma completa de inteligência comercial construída inteiramente sobre Google Cloud Platform e potencializada por IA Generativa (Gemini) e BigQuery ML. Ele transforma dados brutos de um pipeline de vendas B2B/B2G em decisões de negócio automáticas e acionáveis — em tempo real.

O sistema nasceu para resolver um problema real: gestão manual de um pipeline com mais de 2.800 deals históricos e 264 oportunidades abertas, onde qualquer análise levava horas e dependia de planilhas estáticas. Hoje, a IA faz isso em segundos.

---

## 2. Arquitetura Geral

```
Google Sheets (fonte de dados)
        │
        ▼
Apps Script (automação + IA inline)
        │
        ▼
BigQuery  ←─── BigQuery ML (6 modelos preditivos)
        │
        ▼
Cloud Run API (FastAPI · Python 3.12)
        │
        ▼
Firebase Hosting (frontend)
   ├── x-sales.web.app/executivo  ← Visão Executiva
   ├── x-sales.web.app/vendedores ← Visão Sales
   └── x-sales.web.app/automacao  ← Automation Hub
```

Todo o stack roda em GCP (`operaciones-br`), sem nenhum servidor próprio, com custo estimado de ~$5/mês para o volume atual.

---

## 3. Componentes e o Papel da IA em Cada Um

### 3.1 BigQuery ML — 6 Modelos Preditivos Nativos

Treinados sobre 2.583 deals históricos (506 ganhos + 2.077 perdidos).

| Modelo | O que faz |
|--------|-----------|
| `win_loss_predictor` | Probabilidade de vitória por deal (XGBoost) |
| `classificador_perda` | Classifica a causa provável de perda antes que aconteça |
| `previsao_ciclo` | Estima quantos dias faltam para fechar o deal |
| `risco_abandono` | Score de risco de abandono/estagnação por oportunidade |
| `pipeline_prioridade_deals` | Ranqueia deals por prioridade de ação imediata |
| `pipeline_proxima_acao` | Sugere a próxima ação comercial baseada no histórico |

**Resultado prático:** o sistema detecta automaticamente, por exemplo, que um deal de $150K tem apenas 28% de probabilidade de fechar — e sinaliza como `HIGH_VALUE_AT_RISK` antes que o vendedor perceba.

### 3.2 Gemini Inline (Apps Script) — Copiloto de Oportunidades

Cada oportunidade do pipeline pode ser analisada individualmente pela IA Gemini diretamente na planilha. O prompt estruturado envia:

- Dados da conta, valor, fase, ciclo, atividades recentes
- Framework MEDDIC para qualificação B2B
- Critérios internos de categorização (COMMIT / UPSIDE / PIPELINE / OMITIDO)

E retorna um JSON estruturado com:
- Categoria de forecast com confiança percentual
- Resumo executivo em 2–3 linhas
- Riscos identificados
- Gaps de qualificação MEDDIC
- Próximos passos recomendados
- Alerta crítico (Sim/Não)

**Resultado prático:** um vendedor analisa 20 oportunidades em minutos, com qualidade equivalente a uma revisão de pipeline com um Sales Director.

### 3.3 RAG — Insight Generator para Executivos

O endpoint `/api/ai-analysis` implementa um gerador de insights baseado em Retrieval Augmented Generation (RAG):

1. Busca os deals mais relevantes (top wins, top losses, pipeline aberto) no BigQuery
2. Monta contexto dinâmico com métricas reais (win rate, ciclos, causas de perda)
3. Envia ao Gemini um prompt executivo com todos os fatos numéricos
4. Retorna entre 4–6 bullets cada para: Vitórias, Perdas e Recomendações

O painel executivo (`/executivo`) exibe esses insights em tempo real, com filtros por quarter, mês, vendedor e fase — sem intervenção manual.

### 3.4 Cloud Run API — Camada de Inteligência

FastAPI servindo os dados processados com endpoints de alta performance:

- `GET /api/pipeline` — pipeline com filtros dinâmicos
- `GET /api/metrics` — métricas consolidadas por quarter/vendedor
- `GET /api/top-sellers` — rank de performance da equipe
- `GET /api/analyze-patterns` — análise de padrões Win/Loss
- `POST /api/ml/predictions` — todas as predições ML consolidadas (6 modelos) em uma única chamada

### 3.5 Apps Script — Automações e Orquestração

Camada de automação que conecta Google Sheets ao restante da stack:

- **Auto-Sync Universal:** monitora mudanças em tempo real em todas as análises (Open, Won, Lost) e dispara reprocessamento automático via trigger
- **BigQuery Sync:** carrega dados do Sheets para BigQuery sem intervenção manual
- **Email Notifications:** envia alertas automáticos para oportunidades estagnadas (regra 90/30 dias) e renovações próximas
- **Auditoria de Base:** detecta anomalias e inconsistências nos dados com classificação de severidade (CRITICAL / HIGH / MEDIUM / LOW)
- **Schema Diagnostics:** valida integridade do dataset BigQuery automaticamente

### 3.6 Frontend — Três Painéis de Inteligência

Hospedado no Firebase (`x-sales.web.app`), desenvolvido com Tailwind CSS + design system Xertica:

| Painel | Usuário | Principais recursos |
|--------|---------|---------------------|
| **Visão Executiva** | C-Level / Management | KPIs de pipeline, forecast ponderado, win rate, negócios em risco, análise IA inline |
| **Visão Sales** | Equipe comercial | Carteira individual, calculadora de comissão automática (com acelerador de meta), plano de ação |
| **Automation Hub** | Operations | Status de jobs, log de execuções, alertas pendentes, integrações configuradas |

---

## 4. Impacto Mensurável — O Critério do Júri

| Antes | Depois |
|-------|--------|
| Análise de pipeline: **3–4 horas** por reunião de revisão | Análise completa: **< 30 segundos** |
| Previsão de fechamento: **estimativa manual** do vendedor | Win probability: **modelo treinado com 2.583 deals** |
| Identificação de deals em risco: **reativa** (já perdido) | Detecção proativa: **score de risco antes da perda** |
| Relatório executivo: **1 dia de trabalho** de Sales Ops | Painel atualizado: **automático, real-time** |
| Payload de 6,4 MB travando análises | Queries BigQuery em **< 2 segundos** |
| Custo de infra de análise | **~$5/mês** para todo o volume |

**Dados no sistema hoje:**
- 264 oportunidades abertas em análise contínua
- 2.583 deals históricos treinando os modelos
- 5.126 atividades comerciais indexadas
- 2.348 notas de faturamento (2025–2026)
- 6 modelos BigQuery ML rodando em paralelo

---

## 5. Regras de Negócio Implementadas pela IA

O sistema codificou regras complexas de Sales Ops que antes viviam na cabeça de especialistas:

- **Regra GTM:** classifica automaticamente se cada deal está dentro ou fora do go-to-market aprovado (Gobierno, Corporate, Enterprise, Educativo) e dispara alerta visual se fora do GTM
- **Regra 90/30:** detecta oportunidades estagnadas há >90 dias na mesma fase + sem atividades há >30 dias → alerta automático
- **Regra dos 120 Dias:** monitora o prazo de pagamento das faturas e sinaliza comissões suspensas
- **Calculadora de Comissão:** implementa toda a lógica de acelerador de meta (0% / 5% / 10%), rateio BDM × Sales Specialist × Customer Success, e exclui automaticamente refaturamentos e rebates
- **MEDDIC Scoring:** avalia gaps de qualificação em cada deal usando o framework e gera próximos passos

---

## 6. Stack Tecnológico Completo

| Camada | Tecnologia |
|--------|-----------|
| IA Generativa | Google Gemini (via API + Vertex AI) |
| Machine Learning | BigQuery ML (XGBoost, DNN) |
| Data Warehouse | BigQuery (`sales_intelligence` dataset) |
| Backend | FastAPI · Python 3.12 · Cloud Run |
| Automações | Google Apps Script (8 módulos) |
| Frontend | Firebase Hosting · Tailwind CSS · Phosphor Icons |
| CI/CD | Cloud Build + deploy automático |
| Monitoramento | Cloud Logging + audit log no BigQuery |

---

## 7. Categoria Recomendada e Justificativa

### 🏛️ Categoria 1 — The Prompt Architect (Data & Insights)

> *"Uso de IA para análise massiva de dados, limpeza de bancos de dados ou geração de insights acionáveis."*

**Por que esta categoria é a mais forte:**

1. **Análise massiva de dados:** 2.583 deals históricos + 5.126 atividades + 2.348 notas de faturamento processados de forma contínua
2. **Limpeza e governança de dados:** o módulo de Auditoria de Base e Schema Diagnostics detecta e corrige inconsistências automaticamente
3. **Insights acionáveis:** o RAG Insight Generator entrega bullets executivos com fatos numéricos reais — não templates genéricos
4. **Modelos preditivos treinados:** 6 modelos BigQuery ML que aprendem continuamente com novos dados
5. **Prompt engineering avançado:** prompts estruturados com contexto de negócio (MEDDIC, GTM rules, deal history) que geram outputs JSON prontos para consumo

### Argumento secundário — 🤖 Categoria 3: The Bot Master

O sistema também se encaixa em "Agentes & Gemas" pela natureza autônoma do Auto-Sync, das análises inline no Sheets e do pipeline de RAG → Gemini → dashboard. Se a organização preferir destacar o aspecto de **copiloto autônomo para vendedores**, esta categoria é igualmente defensável.

---

## 8. Como se Inscrever

1. Acesse o portal da AI Olympics Xertica e clique em **"Participe Agora"**
2. Selecione **Categoria 1 — The Prompt Architect**
3. No campo de descrição do projeto, use o resumo abaixo:

> **Título:** Sales Intelligence Engine — Copiloto de IA para Pipeline Comercial B2B/B2G
>
> **Resumo (200 palavras):** Construímos uma plataforma end-to-end de inteligência comercial sobre Google Cloud Platform que usa Gemini + BigQuery ML para transformar dados brutos de pipeline de vendas em decisões automáticas. O sistema processa 264 oportunidades abertas e 2.583 deals históricos em tempo real, rodando 6 modelos preditivos nativos de BigQuery ML (win probability, risco de abandono, previsão de ciclo, prioridade de deal, classificador de perda, próxima ação). Um módulo de RAG gera insights executivos automáticos — 4 a 6 bullets por categoria (vitórias, perdas, recomendações) — com base em fatos numéricos reais, sem intervenção manual. O copiloto Gemini inline no Google Sheets analisa cada oportunidade usando framework MEDDIC e devolve JSON estruturado com score de confiança, riscos, gaps e próximos passos. O impacto mensurável: análise de pipeline que levava 3–4 horas agora leva menos de 30 segundos; custo de infra de ~$5/mês para todo o volume. A IA não substitui o vendedor — ela multiplica a capacidade de análise e decisão de cada um.

4. Preparar um **vídeo de 2–3 minutos** demonstrando:
   - O dashboard executivo carregando com insights de IA em tempo real
   - O copiloto Gemini analisando uma oportunidade no Sheets
   - Um dos modelos BigQuery ML retornando predições

5. Deadline de inscrições: **24 de Março de 2026**

---

## 9. Contatos do Projeto

| Papel | Email |
|-------|-------|
| Suporte técnico AI Olympics | pablo.jauregui@xertica.com |
| Design e testes | camila.pasquino@xertica.com |

---

*Documento gerado em 09/03/2026 · Projeto `operaciones-br` · Site: `x-sales.web.app`*
