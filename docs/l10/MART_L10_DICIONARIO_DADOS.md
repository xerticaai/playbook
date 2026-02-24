# Dicionário de Dados — `mart_l10`

> Dataset BigQuery: `operaciones-br.mart_l10`
> Atualizado em: 2026-02-24
> Sprint de referência: A (completo) + B (completo)
>
> 📂 **Documentação relacionada:** [Planejamento L10](PAINEL_L10_PLANEJAMENTO.md)

---

## Princípio de design

```
sales_intelligence.*   (fonte bruta: ERP + CRM)
        │
        ▼
mart_l10.dim_vendedor   (tabela manual: squads + aliases)
        │
        ▼
mart_l10.v_dim_vendedor (VIEW — fonte única de squad para tudo)
        │
   ┌────┴────────────────────────┐
   ▼                             ▼
v_booking_incremental      v_faturamento_semanal_consolidado
(CRM: deals fechados)      (ERP: faturamento linha a linha)
                                 │
                                 ▼
                          v_revenue_semanal   ◄── B4 (alias limpo)
                                 │
                                 ▼
                           v_attainment        ◄── B5 (meta × realizado)

v_pipeline_aberto          (CRM: pipeline ativo)
```

Todas as views consomem `v_dim_vendedor` para resolver `vendedor_canonico` e `squad`. Código externo (API Python, AppScript, JS) não acessa `sales_intelligence.*` diretamente — passa pelas views de `mart_l10`.

---

## Tabela: `dim_vendedor`

**Tipo:** TABLE (alimentada manualmente via INSERT/UPDATE)
**Grain:** 1 linha por vendedor

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `vendedor_canonico` | STRING | ✓ | Nome canônico do vendedor. Chave principal. Usado como chave de join nas demais views. Exemplo: `"Gabriel Leick"` |
| `alias_fat` | STRING | — | Variante do nome usada no **sistema de faturamento** (ERP / tabelas `portafolio_*`). Preenchido apenas quando difere de `vendedor_canonico`. Exemplo: `"rayssa zevolli"` (minúsculo, sem acento) |
| `squad` | STRING | ✓ | Squad comercial. Valores: `CS`, `Contas Nomeadas`, `SS`, `Sales Outras GTM`, `NAO_GTM`, `NAO_MAPEADO`, `PENDENTE` |
| `ativo` | BOOL | ✓ | `TRUE` = vendedor ativo (na empresa). `FALSE` = ex-vendedor (preservado para histórico, excluído dos joins) |
| `updated_at` | TIMESTAMP | ✓ | Timestamp da última atualização manual desta linha |

**Squads e significado:**

| Squad | Significado |
|-------|-------------|
| `CS` | Customer Success — Alex Araujo, Rayssa Zevolli |
| `Contas Nomeadas` | Vendedores por território: Alexsandra Junqueira (MG), Carlos Moll (Centro-Oeste), Denilson Goes (N/NE), Gabriel Leick (Sul), Luciana Fonseca (SP) |
| `SS` | Sales Specialists — Emilio Goncalves, Gabriele Oliveira |
| `Sales Outras GTM` | Segmentos que não são SB / Mid Market / Digital Natives (derivado do campo `Segmento_consolidado` no CRM) |
| `NAO_GTM` | Deals em SB, Mid Market ou Digital Natives — fora do escopo GTM |
| `NAO_MAPEADO` | Linha identificada mas sem vendedor mapeável (ex: Xertica, #N/A no ERP) |
| `PENDENTE` | Ex-vendedores (`ativo=FALSE`) — aparecem no histórico mas não recebem squad ativo |

---

## View: `v_dim_vendedor` — Sprint B1

**Tipo:** VIEW sobre `dim_vendedor`
**Grain:** 1 linha por vendedor (todos, ativos e inativos)
**Papel:** **Fonte única de squad** para todas as demais views. Nenhuma outra view deve fazer JOIN direto em `dim_vendedor`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `vendedor_canonico` | STRING | Nome canônico. Chave de join. |
| `squad` | STRING | Squad comercial (ver tabela acima) |
| `ativo` | BOOL | `TRUE` = ativo. Filtrar `WHERE ativo = TRUE` para excluir ex-vendedores |
| `alias_fat` | STRING | Alias no sistema de faturamento (ERP). NULL = usa `vendedor_canonico` |
| `alias_crm` | STRING | Alias no CRM (campo `Vendedor` em `pipeline` e `closed_deals_won`). Atualmente igual a `alias_fat`. Separado para evolução futura caso ERP e CRM divirjam |
| `updated_at` | TIMESTAMP | Timestamp da última atualização na tabela base |

**Como fazer JOIN:**
```sql
LEFT JOIN `operaciones-br.mart_l10.v_dim_vendedor` dv
  ON  LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(fonte.Vendedor, '')), NFD), r'[^a-z0-9]+', ''))
    = LOWER(REGEXP_REPLACE(NORMALIZE(TRIM(COALESCE(dv.alias_crm, dv.vendedor_canonico, '')), NFD), r'[^a-z0-9]+', ''))
 AND dv.ativo = TRUE
```
O JOIN é normalizado (remove acentos, pontuação, maiúsculas) para cobrir variantes como `rayssa zevolli` × `Rayssa Zevolli`.

---

## View: `v_booking_incremental` — Sprint B2

**Tipo:** VIEW
**Fonte:** `sales_intelligence.closed_deals_won` + `v_dim_vendedor`
**Grain:** 1 linha por deal fechado (won)
**Uso:** Bookings por semana/vendedor/squad/portfolio. Agregue com SUM(gross), SUM(linhas) etc.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `semana_inicio` | DATE | Segunda-feira da semana de fechamento do deal (DATE_TRUNC WEEK MONDAY) |
| `mes_inicio` | DATE | Primeiro dia do mês de fechamento |
| `quarter_inicio` | DATE | Primeiro dia do quarter de fechamento |
| `fiscal_q` | STRING | Fiscal quarter conforme CRM. Formato: `FY26-Q1` |
| `vendedor_canonico` | STRING | Vendedor resolvido via `v_dim_vendedor`. `"NAO_MAPEADO"` se não encontrado |
| `squad` | STRING | Squad do vendedor. `"PENDENTE"` se sem mapeamento |
| `portfolio_label` | STRING | Portfolio canônico: `Plataforma`, `Serviços`, `Soluções`, `Outros` (derivado de `Portfolio_FDM`) |
| `segmento_canonico` | STRING | Segmento: hierarquia `Segmento_consolidado > Segmento > Subsegmento_de_mercado`. `"INDEFINIDO"` se vazio |
| `oportunidade` | STRING | Nome da oportunidade no CRM |
| `conta` | STRING | Conta/cliente |
| `gross` | FLOAT64 | Valor bruto do deal (Gross no CRM). **Validado:** SUM(gross) = SUM(closed_deals_won.Gross) |
| `net` | FLOAT64 | Valor líquido do deal (Net no CRM) |
| `linhas` | INT64 | Sempre `1` por deal — somável para contar deals |

**Mapeamento `portfolio_label`:**

| `Portfolio_FDM` (CRM) | `portfolio_label` |
|-----------------------|-------------------|
| `Plataforma` | `Plataforma` |
| `Services` | `Serviços` |
| `Outros Aceleradores` | `Soluções` |
| NULL | `Outros` |

---

## View: `v_pipeline_aberto` — Sprint B3

**Tipo:** VIEW
**Fonte:** `sales_intelligence.pipeline` + `v_dim_vendedor`
**Grain:** 1 linha por oportunidade ativa no pipeline
**Uso:** Visibilidade de pipeline atual — fase, forecast, qualidade, idle, squad.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `semana_snapshot` | DATE | Segunda-feira da semana do último snapshot do pipeline (de `data_carga`) |
| `fiscal_q` | STRING | Fiscal quarter previsto para fechamento. Formato: `FY26-Q1` |
| `oportunidade` | STRING | Nome da oportunidade no CRM |
| `conta` | STRING | Conta/cliente |
| `vendedor_raw` | STRING | Nome original do vendedor no CRM (para auditoria) |
| `vendedor_canonico` | STRING | Vendedor resolvido via `v_dim_vendedor`. `"NAO_MAPEADO"` se não encontrado |
| `squad` | STRING | Squad do vendedor. Fallback por segmento: SB/Mid Market/Digital Natives → `NAO_GTM`; demais → `Sales Outras GTM` |
| `owner_preventa` | STRING | **CE (Customer Engineer)** — papel de pré-venda associado ao deal. **Não é squad.** NULL se sem pré-venda |
| `portfolio_label` | STRING | Portfolio canônico. Mesmo mapeamento de `v_booking_incremental` via `Portfolio_FDM` |
| `segmento_canonico` | STRING | Segmento derivado de `Segmento_consolidado`. `"INDEFINIDO"` se vazio |
| `fase_atual` | STRING | Fase/stage atual da oportunidade no CRM |
| `confianca_score` | INT64 | Score de confiança (0–100). Campo `Confianca` do CRM — INT64 nativo, **nunca** `Confiana` (typo histórico) |
| `forecast_sf` | STRING | Categoria de forecast do Salesforce. Ex: `Commit`, `Best Case`, `Pipeline` |
| `gross` | FLOAT64 | Valor bruto da oportunidade |
| `net` | FLOAT64 | Valor líquido da oportunidade |
| `idle_dias` | INT64 | Dias sem atividade registrada no CRM |
| `flag_idle_alto` | BOOL | `TRUE` se `idle_dias > 14` — deal parado |
| `flag_sem_qualificacao` | BOOL | `TRUE` se `confianca_score < 30` ou NULL — deal sem qualificação mínima |
| `data_carga` | TIMESTAMP | Timestamp do snapshot (quando o pipeline foi carregado no BQ) |
| `Run_ID` | TIMESTAMP | ID da carga que gerou esta linha |

---

## View: `v_faturamento_semanal_consolidado` _(interno — não consumir diretamente)_

**Tipo:** VIEW (interna — prefira `v_revenue_semanal`)
**Fonte:** `sales_intelligence.portafolio_*` + `dim_vendedor`
**Grain:** 1 linha por linha de fatura (ERP)
**Nota:** Inclui colunas de diagnóstico (flags, match_source, campos brutos). Usado como fonte de `v_revenue_semanal`. Acesso direto apenas para depuração.

Colunas relevantes expostas pelo alias `v_revenue_semanal`:

| Coluna interna | Alias em v_revenue_semanal | Descrição |
|----------------|---------------------------|-----------|
| `gross_revenue_saneado` | `gross_revenue` | Revenue bruto com tratamento de nulos e negativos |
| `net_revenue` | `net_revenue` | Revenue líquido (após dedução de custo Google) |
| `net_revenue_saneado` | `net_revenue_saneado` | Revenue líquido com tratamento adicional |
| `squad_canonico` | `squad` | Squad resolvido |
| `fiscal_q_derivado` | `fiscal_q_derivado` | Fiscal quarter derivado da data da fatura. Ex: `FY26-Q1` |

---

## View: `v_revenue_semanal` — Sprint B4

**Tipo:** VIEW (alias limpo de `v_faturamento_semanal_consolidado`)
**Grain:** 1 linha por linha de fatura (ERP)
**Uso:** Fonte oficial de revenue para UI, endpoints (`/api/revenue/weekly`) e `v_attainment`. **Não expõe flags de diagnóstico.**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `semana_inicio` | DATE | Segunda-feira da semana da fatura |
| `mes_inicio` | DATE | Primeiro dia do mês da fatura |
| `quarter_inicio` | DATE | Primeiro dia do quarter da fatura |
| `fiscal_q_derivado` | STRING | Fiscal quarter derivado da data da fatura. Ex: `FY26-Q1`. **Diferente de `Fiscal_Q` do CRM** — este é calculado a partir do ERP |
| `vendedor_canonico` | STRING | Vendedor resolvido. `"NAO_MAPEADO"` se sem mapeamento |
| `squad` | STRING | Squad do vendedor |
| `portfolio_fat_canonico` | STRING | Portfolio canônico do ERP: `Workspace`, `GCP`, `MSP` (derivado do campo `portafolio`) |
| `gross_revenue` | FLOAT64 | Revenue bruto saneado (ERP) |
| `net_revenue` | FLOAT64 | Revenue líquido = `gross_revenue` menos custo Google. **Este é o valor real de margem** |
| `net_revenue_saneado` | FLOAT64 | Revenue líquido com tratamento adicional de outliers |
| `estado_pagamento_saneado` | STRING | Status de pagamento normalizado. Ex: `Pago`, `Pendente` |

> **Nota sobre net_revenue:** net já está líquido do custo Google. É o valor que conta para o L10 de margem. Não confundir com `gross_revenue` que é o valor bruto faturado.

---

## View: `v_attainment` — Sprint B5

**Tipo:** VIEW
**Fonte:** `v_revenue_semanal` (realizado) + `sales_intelligence.meta` (meta Budget Board)
**Grain:** 1 linha por mês × fiscal_quarter
**Uso:** Card executivo de attainment no L10. Fonte para endpoint `/api/attainment` (Sprint D2).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `mes_inicio` | DATE | Primeiro dia do mês |
| `fiscal_q` | STRING | Fiscal quarter. Ex: `FY26-Q1` |
| `mes_ano_label` | STRING | Label formatado. Ex: `"02/2026"` |
| `meta_gross` | FLOAT64 | Meta de revenue bruto (Gross) para o mês, da tabela `meta` com `Tipo_de_meta = 'Budget Board'` |
| `meta_net` | FLOAT64 | Meta de revenue líquido (Net) para o mês |
| `gross_realizado` | FLOAT64 | Revenue bruto faturado no mês (de `v_revenue_semanal`) |
| `net_realizado` | FLOAT64 | Revenue líquido faturado no mês |
| `attainment_gross_pct` | FLOAT64 | `gross_realizado / meta_gross`. Ex: `3.435` = 343.5% |
| `attainment_net_pct` | FLOAT64 | `net_realizado / meta_net` |
| `gap_gross` | FLOAT64 | `meta_gross - gross_realizado`. Negativo = acima da meta |
| `gap_net` | FLOAT64 | `meta_net - net_realizado`. Negativo = acima da meta |

---

## Dependências entre objetos

```
dim_vendedor  (TABLE — alimentada manualmente)
     │
     ▼
v_dim_vendedor  ──────────────────────────────────┐
     │                                            │
     ▼                                            ▼
v_booking_incremental              v_faturamento_semanal_consolidado
(closed_deals_won)                         │
                                           ▼
v_pipeline_aberto ◄── v_dim_vendedor   v_revenue_semanal  (B4)
(pipeline)                                 │
                                           ▼
                                     v_attainment  (B5)
                                   (+ sales_intelligence.meta)
```

---

## Objetos legados (manter mas não consumir diretamente)

| Objeto | Status | Substituto |
|--------|--------|-----------|
| `v_pipeline_consolidado` | Legado | `v_pipeline_aberto` |
| `v_faturamento_historico` | Legado / fora do plano | `v_revenue_semanal` + filtro histórico |
| `v_faturamento_semanal_kpis` | Legado | `v_revenue_semanal` agregado |

---

## Sprint C — próximos objetos ⏸️ PENDENTE

> Bloqueio: metas semanais por vendedor (`fct_weekly_goal`) ainda não definidas. Sprint C inteiro e D4 aguardam. D1, D2 e D5 estão desbloqueados mas diferidos para a fase de UI.

| Objeto | Sprint | Bloqueio | Descrição |
|--------|--------|----------|-----------|
| `fct_weekly_goal` | C1 | ⏸️ sem weekly goals | Tabela manual: metas semanais por vendedor × measurable |
| `v_weekly_actual` | C2 | ⏸️ sem weekly goals | UNION de v_booking_incremental + v_revenue_semanal por semana/vendedor/measurable |
| `v_scorecard_vendedor` | C3 | ⏸️ depende C1 | Join fct_weekly_goal × v_weekly_actual com semáforo On Track / At Risk / Off Track |
| `v_weekly_issues` | C4 | ⏸️ depende C3 | Filtro de v_scorecard_vendedor — apenas Off Track e At Risk |
| `/api/revenue/weekly` | D1 | ⏸️ diferido UI | Endpoint consumindo v_revenue_semanal |
| `/api/attainment` | D2 | ⏸️ diferido UI | Endpoint consumindo v_attainment |
| Toggle Booking/Revenue | D3 | ⏸️ diferido UI | Depende D1 + D2 |
| Tela Scorecard | D4 | ⏸️ depende C3 | Depende v_scorecard_vendedor |
| Filtro Squad | D5 | ⏸️ diferido UI | Param squad nos endpoints + v_dim_vendedor |
