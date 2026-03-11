# Plano de Implantacao — Camada de Vendedores (BQ + UX)

Data: 2026-03-10
Status: Proposta de implantacao (pronta para execucao incremental)
Objetivo: desenhar a camada de vendedores com base nas tabelas e views reais de BigQuery ja existentes, priorizando visibilidade de atividade (proximas acoes) e calculadora vinculada a meta + faturamento.

## 1. Base real ja disponivel (sem reinventar)

## 1.1 Revenue e attainment
- `operaciones-br.mart_l10.v_faturamento_historico`
  - base consolidada 2025/2026 para revenue
  - campos centrais: `vendedor_canonico`, `net_revenue_saneado`, `gross_revenue_saneado`, `fiscal_q_derivado`, `portfolio_fat_canonico`, `segmento`, `estado_pagamento_saneado`, `oportunidade`, `cliente`
- `operaciones-br.mart_l10.v_faturamento_semanal_consolidado`
  - override usado para Q1 2026
- `operaciones-br.mart_l10.v_attainment`
  - attainment mensal agregado (meta x realizado) — foco executivo global
- endpoint atual: `/api/revenue/quarter-summary`
  - ja calcula por vendedor: `net_total_por_vendedor`, `net_incremental_por_vendedor`, `meta_bdm`, `attainment_pct`
  - politica de cota ja definida: incremental faturado

## 1.2 Atividade e proxima acao
- `operaciones-br.sales_intelligence.pipeline_proxima_acao`
  - campos chave para camada de atividades:
    - `opportunity`
    - `categoria_acao`
    - `acao_recomendada`
    - `urgencia`
    - `detalhes_execucao`
    - `checklist`
- `operaciones-br.sales_intelligence.pipeline_prioridade_deals`
  - prioridade por deal (`priority_score`, `priority_level`, `ranking_vendedor`)
- `operaciones-br.sales_intelligence.pauta_semanal_enriquecida`
  - une pipeline + risco + proxima acao + contexto para war-room

## 1.3 Pipeline vendedor
- `operaciones-br.mart_l10.v_pipeline_consolidado`
  - padroniza vendedor, squad, portfolio, score, fase e acao sugerida
  - ideal para cards e tabela de funil por vendedor

## 2. Proposta de camada de vendedores (arquitetura)

Criar 3 views finais para o frontend de Vendedores:

1. `mart_l10.v_seller_activity_feed`
2. `mart_l10.v_seller_calculator_base`
3. `mart_l10.v_seller_dashboard_360`

Isso evita o frontend montar regras complexas e reduz divergencia entre telas.

## 3. View 1 — Atividades (pipeline de proximas acoes)

## 3.1 Objetivo UX
Painel "Atividades" orientado a execucao, nao so historico:
- "o que eu faco hoje"
- "o que vence em 24-72h"
- "quais deals travam minha meta"

## 3.2 Definicao proposta
`mart_l10.v_seller_activity_feed`

### Fontes
- `sales_intelligence.pipeline_proxima_acao` (principal)
- `sales_intelligence.pipeline_prioridade_deals` (prioridade)
- `mart_l10.v_pipeline_consolidado` (contexto de pipeline)

### Colunas recomendadas
- `vendedor_canonico`
- `opportunity`
- `conta`
- `fase_atual`
- `gross`
- `net_revenue`
- `priority_score`
- `priority_level`
- `categoria_acao`
- `acao_recomendada`
- `urgencia`
- `detalhes_execucao`
- `checklist`
- `cod_acao`
- `idle_dias`
- `dias_para_close`
- `activity_due_bucket` (`HOJE`, `48H`, `SEMANA`, `BACKLOG`)
- `action_rank` (ordem de execucao)

### Regra de ordenacao
1. `urgencia` (ALTA > MEDIA > BAIXA)
2. `priority_score` desc
3. `dias_para_close` asc
4. `gross` desc

## 3.3 SQL base (esqueleto)
```sql
CREATE OR REPLACE VIEW `operaciones-br.mart_l10.v_seller_activity_feed` AS
SELECT
  pc.vendedor_canonico,
  pa.opportunity,
  pc.conta,
  pc.fase_atual,
  pc.gross,
  pc.net_revenue,
  pd.priority_score,
  pd.priority_level,
  pa.categoria_acao,
  pa.acao_recomendada,
  pa.urgencia,
  pa.detalhes_execucao,
  pa.checklist,
  pc.cod_acao,
  pc.idle_dias,
  DATE_DIFF(CAST(pc.data_prevista AS DATE), CURRENT_DATE(), DAY) AS dias_para_close,
  CASE
    WHEN DATE_DIFF(CAST(pc.data_prevista AS DATE), CURRENT_DATE(), DAY) <= 0 THEN 'HOJE'
    WHEN DATE_DIFF(CAST(pc.data_prevista AS DATE), CURRENT_DATE(), DAY) <= 2 THEN '48H'
    WHEN DATE_DIFF(CAST(pc.data_prevista AS DATE), CURRENT_DATE(), DAY) <= 7 THEN 'SEMANA'
    ELSE 'BACKLOG'
  END AS activity_due_bucket,
  CASE pa.urgencia
    WHEN 'ALTA' THEN 1
    WHEN 'MÉDIA' THEN 2
    ELSE 3
  END AS action_rank
FROM `operaciones-br.sales_intelligence.pipeline_proxima_acao` pa
LEFT JOIN `operaciones-br.sales_intelligence.pipeline_prioridade_deals` pd
  ON pa.opportunity = pd.opportunity
LEFT JOIN `operaciones-br.mart_l10.v_pipeline_consolidado` pc
  ON pa.opportunity = pc.oportunidade;
```

## 4. View 2 — Calculadora (meta + faturamento)

## 4.1 Objetivo UX
A calculadora deve responder 3 perguntas em 5 segundos:
1. Quanto falta para minha meta (net incremental)?
2. Qual mix de deals fecha o gap com melhor probabilidade?
3. Qual comissao esperada por cenario?

## 4.2 Definicao proposta
`mart_l10.v_seller_calculator_base`

### Fontes
- agregado de `/api/revenue/quarter-summary` (mesma logica em SQL)
- `sales_intelligence.meta_bdm` (meta por owner)
- `mart_l10.v_faturamento_historico` + `v_faturamento_semanal_consolidado` (faturado)
- `mart_l10.v_pipeline_consolidado` (pipeline restante)

### Colunas recomendadas
- `vendedor_canonico`
- `fiscal_q`
- `meta_bdm_net`
- `net_incremental_faturado`
- `net_total_faturado`
- `gap_para_meta`
- `pipeline_net_aberto`
- `pipeline_commit_net`
- `attainment_incremental_pct`
- `runway_deals_needed` (qtd estimada de deals para fechar gap)
- `comissao_estimada_p25`, `comissao_estimada_p50`, `comissao_estimada_p75`

## 4.3 Regra de negocio
- Base de cota: `net_incremental_faturado` (politica ja aplicada no endpoint)
- Mostrar tambem `net_total_faturado`, mas como secundaria
- Se `meta_bdm_net = 0`, status = `SEM_META_CADASTRADA`

## 5. View 3 — Dashboard 360 do vendedor

## 5.1 Objetivo UX
Concentrar acima da dobra todos os sinais para decisao diaria.

## 5.2 Definicao proposta
`mart_l10.v_seller_dashboard_360`

### Fontes
- `v_pipeline_consolidado`
- `v_seller_activity_feed`
- `v_seller_calculator_base`

### Colunas sinteticas
- `vendedor_canonico`
- `fiscal_q`
- `deals_abertos`
- `pipeline_net_total`
- `pipeline_gross_total`
- `deals_risco_alto`
- `deals_sem_atividade`
- `acoes_alta_urgencia`
- `atualizacoes_necessarias_48h`
- `attainment_incremental_pct`
- `gap_para_meta`
- `top_3_deals_para_fechar_gap` (ARRAY<STRING>)

## 6. UX detalhada (visualizacao recomendada)

## 6.1 Estrutura da tela Vendedores

A. Top strip (fixa)
- Filtro: Quarter, vendedor, portfolio
- KPI 1: Net Incremental Faturado
- KPI 2: Meta Net
- KPI 3: Atingimento %
- KPI 4: Gap para Meta

B. Bloco "Plano de Hoje" (principal)
- Lista priorizada de 5-10 cards de acao
- Cada card: deal, valor, urgencia, checklist em 3 passos
- CTA por card: `Marcar como executada`, `Escalar manager`, `Abrir oportunidade`

C. Bloco "Calculadora de Fechamento"
- Slider: taxa de conversao esperada
- Slider: desconto medio
- Slider: prazo medio de fechamento
- Resultado em tempo real:
  - comissao estimada p50
  - meta atingida em %
  - quantos deals adicionais precisa

D. Bloco "Heatmap de Risco"
- eixo X: dias para close
- eixo Y: prioridade
- tamanho: net
- cor: urgencia

E. Bloco "Higiene de Pipeline"
- sem atividade > 7 dias
- fase sem evolucao > 14 dias
- sem proxima acao definida

## 6.2 Regras de semantica visual
- Verde: acima da meta / em rota
- Amarelo: ate 10% abaixo da rota
- Vermelho: abaixo de 10% com acoes ALTA pendentes
- Cinza: sem meta cadastrada

## 6.3 Microinteracoes
- Hover do card mostra `detalhes_execucao`
- Checklist inline com progresso visual
- Toast de impacto: "acao executada reduz gap em X"

## 7. Endpoints sugeridos (incremental, baixo risco)

1. `GET /api/seller/dashboard-360`
- payload compacto para topo + saude + gap

2. `GET /api/seller/activity-feed`
- baseado em `v_seller_activity_feed`
- filtros: seller, urgency, due_bucket, priority_level

3. `GET /api/seller/calculator`
- baseado em `v_seller_calculator_base`
- filtros: seller, fiscal_q

4. `POST /api/seller/calculator/simulate`
- recebe sliders de simulacao
- retorna cenarios p25/p50/p75

## 8. Plano de implantacao em fases

## Fase 1 (1-2 dias) — Atividades primeiro
- Criar `v_seller_activity_feed`
- Ligar aba Atividades na UI ao feed novo
- Adicionar filtros por urgencia e due_bucket

## Fase 2 (2-3 dias) — Calculadora conectada a meta/faturamento
- Criar `v_seller_calculator_base`
- Substituir calculadora local por dados reais (`meta_bdm + faturamento`)
- Exibir gap e attainment incremental no topo da calculadora

## Fase 3 (2-4 dias) — Dashboard 360
- Criar `v_seller_dashboard_360`
- Consolidar cards e heatmap
- Adicionar alertas e priorizacao automatica

## 9. KPIs de sucesso da camada de vendedores

- Tempo para identificar proxima acao critica < 10s
- Taxa de uso da aba Atividades > 70% dos usuarios Sales
- Queda de deals sem atividade por >7 dias em 25%
- Aumento de attainment incremental medio por vendedor
- Diminuicao de reclamacoes sobre "calculadora desconectada da realidade"

## 10. Recomendacao final

Sim, sua direcao esta correta:
- Atividade deve ser centrada na `pipeline_proxima_acao`.
- Calculadora deve ser ancorada em `meta_bdm` + faturamento incremental (na mesma politica do `quarter-summary`).

A melhor estrategia para velocidade e confiabilidade e criar as 3 views finais em `mart_l10` e manter o frontend consumindo payload sem regra pesada no browser.
