# Implantação Revenue no Painel Executivo — Passo a Passo

Data: 2026-02-26  
Status: Em execução (faseado)

## Objetivo
Padronizar a visão de Revenue no painel executivo com:
- filtros de período iguais ao Booking (`Quarter`, `Ano`, `Mês`, `Período`),
- tabela `Top Contas por Revenue` com foco em produto,
- remoção de blocos não aplicáveis (Mapa de Palavras, Principais Oportunidades, Guia) quando em modo Revenue,
- drilldown específico para Revenue.

---

## 1) Fontes de dados oficiais

## 1.1 Tabelas base (`sales_intelligence`)
- `faturamento_2025`
- `faturamento_2026`
- `meta`
- `faturamento_semanal` (fora do escopo desta entrega, uso futuro)

## 1.2 Camada analítica (`mart_l10`)
- `v_faturamento_historico` (união 2025/2026; fonte principal Revenue)
- `v_attainment`
- `v_revenue_semanal` (não usar para esta visão no momento)

## 1.3 Campos principais validados
- Receita: `gross_revenue_saneado`, `net_revenue_saneado`
- Tempo: `fecha_factura_date`, `semana_inicio`, `mes_inicio`, `quarter_inicio`, `fiscal_q_derivado`
- Negócio: `cliente`, `oportunidade`, `produto`, `portfolio_fat_canonico`
- Gestão: `estado_pagamento_saneado`, `squad_canonico`, `vendedor_canonico`
- Meta: `meta.Periodo_Fiscal`, `meta.Mes_Ano`, `meta.Gross`, `meta.Net`

---

## 2) Escopo aprovado (o que entra agora)

## 2.1 Revenue view (UI)
- Esconder tabs não aplicáveis em Revenue:
  - `Mapa de Palavras`
  - `Principais Oportunidades`
  - `Guia`
- Em Revenue, manter foco em `Resumo`.

## 2.2 Top Contas por Revenue
- Trocar coluna de destaque de `Portfólio` para `Produto`.

## 2.3 Análise Gráfica em Revenue (fase temporária)
- Manter sem conteúdo funcional por enquanto (placeholder explícito “Em breve”).
- Não renderizar gráficos de Booking neste modo.

## 2.4 Drilldown Revenue
- Adaptar cards da visão Revenue para abrir drilldown com base em faturamento consolidado.

---

## 3) Plano faseado (seguir pouco a pouco)

## Fase R1 — Limpeza de navegação da view Revenue
Objetivo: remover distração e evitar conteúdo de Booking em Revenue.

Passos:
1. Ao alternar para `gross/net` (Revenue), forçar aba ativa para `resumo`.
2. Ocultar tabs/botões `mapas`, `oportunidades`, `guia` apenas nesse modo.
3. Em `booking_*`, restaurar tabs normalmente.

Critérios de aceite:
- Em Revenue, usuário vê apenas contexto de Revenue.
- Em Booking, comportamento atual permanece intacto.

Rollback:
- Reverter controle de visibilidade das tabs no script de alternância de modo.

---

## Fase R2 — Top Contas com foco em Produto
Objetivo: leitura comercial mais direta para faturamento.

Passos:
1. Backend: enriquecer `/api/revenue/top` com campo de produto principal por conta no recorte (ex.: item de maior contribuição líquida no grupo).
2. Frontend: trocar cabeçalho/coluna `Portfólio` por `Produto`.
3. Ajustar tooltip para mostrar multi-produto quando houver mix.

Critérios de aceite:
- Tabela “Top Contas por Revenue” exibe produto, não portfólio.
- Ordenação por `mode` (`net`/`gross`) continua correta.

Rollback:
- Reverter alias da coluna no endpoint e no render da tabela.

---

## Fase R3 — Análise Gráfica em Revenue (placeholder controlado)
Objetivo: evitar interpretação incorreta antes do desenho final.

Passos:
1. Em Revenue + `view-graficos`, exibir container vazio com mensagem de roadmap.
2. Bloquear init dos gráficos de Booking nesse modo.
3. Manter botão “Análise Gráfica” visível, porém com estado informativo.

Critérios de aceite:
- Nenhum gráfico de Booking aparece em Revenue.
- Usuário recebe mensagem clara de fase em construção.

Rollback:
- Reativar switch padrão entre `view-kpi-cards` e `view-graficos` sem guarda de modo.

---

## Fase R4 — Drilldown de cards Revenue
Objetivo: abrir detalhe acionável dos KPIs de Revenue.

Passos:
1. Criar endpoint dedicado (sugestão: `/api/revenue/drilldown`) com filtros:
   - `year`, `quarter`, `month`, `date_start`, `date_end`,
   - `squad`, `portfolio`, `status_pagamento`, `mode`.
2. Retornar linhas com:
   - `cliente`, `oportunidade`, `produto`, `estado_pagamento_saneado`,
   - `gross_revenue_saneado`, `net_revenue_saneado`,
   - `fecha_factura_date`, `vendedor_canonico`, `squad_canonico`.
3. Frontend: bind click dos cards ERP para abrir painel `exec-drilldown-panel` em modo Revenue.
4. SQL/base label no painel deve refletir faturamento, não pipeline.

Critérios de aceite:
- Todos os cards ERP clicáveis com drilldown coerente.
- Busca, ordenação e export CSV funcionam no painel.

Rollback:
- Manter cards sem clique enquanto endpoint não estiver estável.

---

## Fase R5 — Desenho final da Análise Gráfica Revenue (próxima etapa)
Objetivo: disponibilizar análise executiva financeira.

Sugestão de blocos:
1. `Gross vs Net por semana` (duas linhas)
2. `Pago vs Pendente vs Anulado por mês` (stacked)
3. `Top produtos por Net` (bar horizontal)
4. `Meta vs Realizado` (Gross e Net, mês a mês)

Dependências:
- consolidar regra de calendário fiscal e latência de `faturamento_2026`.

---

## 4) Regras de negócio consolidadas
- Moeda da visão Revenue: **USD (`$`)**.
- `net_pago`: somente `estado_pagamento_saneado = 'Pagada'`.
- `Intercompañia` não entra em pago efetivo (tratar como pendência interna, conforme regra vigente).
- Fonte principal da visão Revenue: `mart_l10.v_faturamento_historico`.

## 4.1 Matriz de status de pagamento (revisão de schema)
Distribuição observada em `v_faturamento_historico`:
- `Pendiente`: 1.947 linhas
- `NAO_INFORMADO`: 247 linhas
- `Pagada`: 129 linhas
- `Intercompañia`: 9 linhas
- Outros (`Anulada`, `INCENTIVOS`, `Nota de Credito`): baixo volume

Decisão recomendada para o painel:
- `Pago`: apenas `Pagada`
- `Pendente`: `Pendiente`, `NAO_INFORMADO`, `Intercompañia`
- `Anulado`: `Anulada` (valor absoluto para exibição)
- `Outros`: manter em bucket “Outros status” (evita perda silenciosa de valor)

## 4.2 Qualidade de dados relevante
- `net_revenue` nulo em `faturamento_2025`: 0,27% (6/2209)
- `net_revenue` nulo em `faturamento_2026`: 4,32% (6/139)
- `meta` disponível apenas para FY26 (`FY26-Q1`..`FY26-Q4`)

Implicação prática:
- KPIs de attainment devem indicar “sem meta” fora de FY26.
- Drilldown precisa exibir flag de `net_revenue` ausente para auditoria.

## 4.3 Regra explícita para “Produto principal” no Top Contas
Para trocar `Portfólio` por `Produto` sem ambiguidade, usar regra determinística:
1. Agrupar por conta + produto no recorte filtrado.
2. Ordenar por `SUM(net_revenue_saneado)` desc.
3. Em empate, usar maior `SUM(gross_revenue_saneado)`.
4. Persistir primeiro item como `produto_principal`.
5. Expor `produtos` (lista curta) em tooltip para transparência.

---

## 5) Matriz de validação (por fase)

## 5.1 API
- `/api/revenue/weekly?year=2026&quarter=Q1`
- `/api/revenue/top?year=2026&quarter=Q1&mode=net`
- `/api/attainment?year=2026&quarter=Q1`

## 5.2 UI
- Toggle `BOOKING_*` ↔ `REVENUE_*`
- Quick filters FY26 em Revenue
- Tabela Top com coluna `Produto`
- Drilldown dos cards ERP

## 5.3 Não regressão
- Pipeline Booking permanece com métricas e drilldowns atuais.
- Sem alteração de acesso/autenticação.

---

## 6) Execução recomendada
1. Concluir `R1` e validar com usuário.
2. Concluir `R2` e validar leitura da tabela Top.
3. Concluir `R3` para isolar escopo visual.
4. Concluir `R4` (drilldown) com testes de filtro.
5. Planejar e implementar `R5` em sprint própria.

## 6.1 Definition of Done por fase
- R1: Tabs não aplicáveis ocultas apenas em Revenue; retorno integral no modo Booking.
- R2: Coluna `Produto` ativa na tabela Top + ordenação `mode` validada.
- R3: View gráfica Revenue sem gráficos de Booking e com placeholder claro.
- R4: Cards ERP abrem drilldown com busca, ordenação e export CSV funcionando.
- R5: Gráficos Revenue usam apenas fonte consolidada (`v_faturamento_historico` + `meta`).

---

## 7) Status de acompanhamento
- [ ] R1 — Limpeza de navegação Revenue
- [ ] R2 — Top Contas por Produto
- [ ] R3 — Placeholder Análise Gráfica Revenue
- [ ] R4 — Drilldown Revenue
- [ ] R5 — Gráficos Revenue final
