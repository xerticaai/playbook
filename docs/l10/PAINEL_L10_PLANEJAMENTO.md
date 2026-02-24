# Planejamento L10 com dados reais do BigQuery (`operaciones-br`)

Data da análise: **2026-02-24**  
Fonte validada diretamente no BigQuery do projeto **`operaciones-br`** (conta ativa: `amalia.silva@xertica.com`).

> 📂 **Documentação relacionada:** [Dicionário de Dados — mart_l10](MART_L10_DICIONARIO_DADOS.md)

## 1) Inventário real de esquemas (datasets)

## 1.1 Dataset `sales_intelligence`

Tabelas/views encontradas:

- `admin_vacations` (TABLE, 0 linhas)
- `atividades` (TABLE, 5.126 linhas)
- `closed_deals_lost` (TABLE, 2.091 linhas)
- `closed_deals_won` (TABLE, 506 linhas)
- `closed_previsibilidade` (TABLE, 2.583 linhas)
- `deal_embeddings` (TABLE, 2.848 linhas)
- `faturamento_2025` (TABLE, 2.209 linhas)
- `faturamento_2026` (TABLE, 139 linhas)
- `meta` (TABLE, 12 linhas)
- `pauta_semanal_enriquecida` (VIEW, 0 linhas materializadas)
- `pipeline` (TABLE, 264 linhas)
- `pipeline_classificador_perda` (TABLE, 269 linhas)
- `pipeline_deteccao_anomalias` (TABLE, 13 linhas)
- `pipeline_performance_vendedor` (TABLE, 10 linhas)
- `pipeline_previsao_ciclo` (TABLE, 269 linhas)
- `pipeline_previsibilidade` (TABLE, 269 linhas)
- `pipeline_prioridade_deals` (VIEW, 0 linhas materializadas)
- `pipeline_proxima_acao` (VIEW, 0 linhas materializadas)
- `pipeline_risco_abandono` (TABLE, 268 linhas)
- `sales_specialist` (TABLE, 18 linhas)

> Observação: existem objetos `ml_*`, mas **foram desconsiderados** neste plano conforme pedido.

### Colunas relevantes identificadas por tabela (para L10)

#### `pipeline` (principal para oportunidades abertas)

- Chaves e identificação: `Oportunidade`, `Conta`, `Vendedor`
- Classificação comercial: `Perfil`, `Portfolio`, `Produtos`, `Forecast_SF`, `Fiscal_Q`, `Fase_Atual`
- Datas: `Data_de_criacao` (DATE), `Data_Prevista` (STRING em formato `%Y-%m-%d`), `data_carga` (TIMESTAMP)
- Valores: `Gross`, `Net`, `Confianca`, `Atividades`, `Dias_Funil`, `Idle_Dias`

Validações reais:
- `Data_Prevista` parseável em ISO (`%Y-%m-%d`) em 264/264 linhas.
- `Perfil` = `NOVO CLIENTE` e `BASE INSTALADA`.
- `Fiscal_Q` em formato tipo `FY26-Q1` ... `FY30-Q1`.
- Todas as 264 linhas atuais são oportunidades abertas (não há `Closed Won/Lost` neste snapshot).

#### `sales_specialist` (apoio para segmentação e booking)

- Identificação: `opportunity_name`, `account_name`, `vendedor`
- Segmentação: `perfil` (`New`, `Base Instalada`), `forecast_status` (`Commit`, `Upside`), `gtm_2026`
- Datas/período: `closed_date` (DATE), `fiscal_quarter`, `billing_quarter_gross`
- Valores: `booking_total_gross`, `booking_total_net`

#### `closed_deals_won` (bookings realizados)

- Identificação: `Oportunidade`, `Conta`, `Vendedor`
- Segmentação: `Perfil_Cliente`, `Segmento_consolidado`, `Portfolio_FDM`
- Valores: `Gross`, `Net`
- Datas/período: `Data_Fechamento`, `Fiscal_Q`, `data_carga`

Validação importante:
- `Portfolio_FDM` contém categorias de negócio úteis para L10: `Plataforma`, `Services`, `Outros Aceleradores`.

#### `atividades` (execução comercial)

- Dono/ator: `Atribuido`
- Data de atividade: `Data`
- Vínculos: `EmpresaConta`, `Oportunidade`
- Controle: `Status`, `Tipo_de_atividade`, `Data_de_criacao`

Validação importante:
- `Status` contém `Completada` e `Completed` (há necessidade de normalização para “realizada”).

#### `faturamento_2025` + `faturamento_2026` (receita e margem)

- Datas/período: `fecha_factura` (STRING), `mes`, `q`
- Valores: `valor_fatura_usd_comercial`, `net_revenue`, `net_ajustado_usd`, `receita_usd`, `net_real`
- Margens/custos: `percentual_margem`, `margem_percentual_final`, `percentual_margem_net_comissoes`, `custo_usd`
- Segmentação produto: `produto`, `familia`, `portafolio`, `tipo_produto`
- Cobrança: `estado_pagamento`

Validação importante:
- `familia` contém classes úteis para agrupamento: `G Workspace Licenciamiento`, `GCP Consumo`, `GCP Servicios Data`, `MSP Services`, `Own Products GR`, `Incentivos`.

#### `meta` (metas para attainment)

- `Tipo_de_meta`, `Mes_Ano`, `Gross`, `Net`, `Periodo_Fiscal`
- Tipos atuais: `Budget Board`
- Períodos atuais: `FY26-Q1` a `FY26-Q4`

## 1.2 Dataset `billing_gcp` (NÃO USAR)

Tabela encontrada:

- `gcp_billing_export_resource_v1_01E910_CB479F_E463A5` (TABLE)

Colunas relevantes (29 colunas total):

- Tempo/custo: `_PARTITIONTIME`, `usage_start_time`, `usage_end_time`, `export_time`, `cost`, `cost_at_list`
- Contexto: `project`, `service`, `sku`, `labels`, `location`, `resource`
- Financeiro: `currency`, `currency_conversion_rate`, `credits`, `invoice`, `cost_type`

> Este dataset é útil para custos cloud, mas **não é a fonte principal** dos KPIs comerciais L10 listados.

---

## 2) Inferência de cálculos dos KPIs L10 (sem modelos-ml)

## 2.1 Regras de normalização base (recomendadas)

### Perfil (para New/CS/SS)

- `NEW` = `UPPER(perfil/perfil_cliente) IN ('NEW', 'NOVO CLIENTE')`
- `BASE` = `UPPER(perfil/perfil_cliente) IN ('BASE INSTALADA', 'BASE INSTALADA')`

**Inferência operacional**:
- `New` já está claro.
- `CS` e `SS` **não estão claramente separados por coluna dedicada** no snapshot atual.
- Proxy sugerido:
	- `CS` = Base Instalada Customer Success
	- `SS` = Base Instalada Sales Specialist 

    Sales Specialist: Gabriele Oliveira (Cuida de New)  e Emilio Goncalves (Cuida da base, ta diretamente ligado ao CS)
    
### Produto (Plataforma / Serviços / Soluções)

- Para bookings, usar `closed_deals_won.Portfolio_FDM`:
	- `Plataforma` => `Portfolio_FDM = 'Plataforma'`
	- `Serviços` => `Portfolio_FDM = 'Services'`
	- `Soluções` => `Portfolio_FDM = 'Outros Aceleradores'` (proxy atual)
- Para pipeline aberto, enquanto `Portfolio` do `pipeline` não está semântico, usar fallback por `Produtos`/`Familia` via tabela de mapeamento de negócio.

### Datas

- Criação da oportunidade: `pipeline.Data_de_criacao`
- Close date previsto: `DATE(pipeline.Data_Prevista)` via `SAFE.PARSE_DATE('%Y-%m-%d', Data_Prevista)`
- Semana anterior: `Data_de_criacao` entre segunda/domingo da semana passada
- Quarter offset (Q+N): comparar quarter de `Data_Prevista` vs quarter da data de referência

---

## 2.2 Matriz KPI → fonte e cálculo inferido

| KPI | Fonte principal | Cálculo inferido |
|---|---|---|
| Oportunidades Geradas New ($ / QNT) | `pipeline` | `Data_de_criacao` na semana anterior + perfil `NEW` + close até Q+1/Q+2; soma `Gross` e contagem de `Oportunidade` |
| Oportunidades Geradas CS ($ / QNT) | `pipeline` | Mesmo cálculo, com perfil `BASE` (proxy CS) e close até Q+5/Q+6 |
| Touch contas SS (#) | `atividades` + `pipeline` | Contagem de atividades por `EmpresaConta`/`Oportunidade` com dono SS (proxy via join para perfil BASE), recorte semanal e close até Q+3 |
| Atividades realizadas New/SS/CS (#) | `atividades` (+ mapeamento pessoa→squad) | `COUNT(*)` com `Status IN ('Completada','Completed')` + segmentação por time |
| Pipeline Incremental Plataforma/Serviços/Soluções ($) - quarter | `pipeline` | Soma `Gross` de oportunidades abertas no quarter por produto (mapeamento) |
| Pipeline Incremental Plataforma/Serviços/Soluções ($) - mês | `pipeline` | Soma `Gross` de oportunidades abertas no mês por produto (mapeamento) |
| Booking Incremental Plataforma/Serviços/Soluções ($) | `closed_deals_won` | Soma `Gross` por `Portfolio_FDM` e período de fechamento |
| Booking Incremental GTM ($) | `sales_specialist` | Soma `booking_total_gross` para registros alinhados a `gtm_2026` (definir regra de alinhamento) |
| Margem promedio Booking Plataforma/Serviços/Soluções (%) | `faturamento_2025/2026` | Média ponderada de margem (`margem_percentual_final` ou `percentual_margem_net_comissoes`) por família/produto |
| Confiabilidade média opps forecast Sales/CS (%) | `pipeline` + `sales_specialist` | Média de `Confianca` para deals em forecast (ex.: `Forecast_SF IN ('Committed','Upside')`) por perfil |
| Confiabilidade média opps pipeline Sales/CS (%) | `pipeline` | Média de `Confianca` no pipeline aberto por perfil |
| Gross Revenue Weekly/Month/Quarter ($) | `faturamento_2025/2026` | Soma de `valor_fatura_usd_comercial` (ou `receita_usd`, definir oficial) por janela temporal |
| Gross Revenue ATTAINT (%) | `faturamento_*` + `meta` | `realizado_gross / meta.gross` por período fiscal |
| Net Revenue Weekly/Month/Quarter ($) | `faturamento_2025/2026` | Soma de `net_revenue` (ou `net_real`, definir oficial) por janela temporal |
| Net Revenue ATTAINT (%) | `faturamento_*` + `meta` | `realizado_net / meta.net` por período fiscal |
| Inadimplência ($) | `faturamento_2025/2026` | Soma de valores com `estado_pagamento` em status em aberto/pendência (ex.: `Pendiente`) |

---

## 3) SQL base (esqueleto) para o painel

```sql
WITH base_pipeline AS (
	SELECT
		Oportunidade,
		Data_de_criacao,
		SAFE.PARSE_DATE('%Y-%m-%d', Data_Prevista) AS close_date,
		UPPER(Perfil) AS perfil,
		SAFE_CAST(Gross AS FLOAT64) AS gross,
		SAFE_CAST(Net AS FLOAT64) AS net,
		SAFE_CAST(Confianca AS FLOAT64) AS confianca,
		Forecast_SF,
		Fase_Atual,
		Produtos,
		Portfolio
	FROM `operaciones-br.sales_intelligence.pipeline`
),
semanas AS (
	SELECT
		DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 WEEK), WEEK(MONDAY)) AS sem_ini,
		DATE_ADD(DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 WEEK), WEEK(MONDAY)), INTERVAL 6 DAY) AS sem_fim
)
SELECT *
FROM base_pipeline, semanas
WHERE Data_de_criacao BETWEEN sem_ini AND sem_fim;
```

---

## 4) Gaps identificados para fechar o painel L10

1. **Separação CS vs SS**: hoje não há coluna explícita para distinguir os dois (existe `perfil` com New/Base).
2. **Mapeamento formal de produto** para `Plataforma/Serviços/Soluções` no pipeline aberto.
3. **Definição oficial de campo de receita** (`valor_fatura_usd_comercial` vs `receita_usd`; `net_revenue` vs `net_real`).
4. **Regra oficial de GTM** usando `gtm_2026` (normalização dos valores `1`, `3 / FDM`, etc.).
5. **Inadimplência**: confirmar quais `estado_pagamento` entram na métrica (ex.: apenas `Pendiente` ou mais estados).

---

## 5) Entregável recomendado (próxima etapa)

Criar uma camada `mart_l10` no BigQuery com views padronizadas:

- `mart_l10.dim_deal` (normalizações de perfil/produto/quarter)
- `mart_l10.fct_opps_geradas_semana`
- `mart_l10.fct_atividades_semana`
- `mart_l10.fct_pipeline_incremental`
- `mart_l10.fct_booking_incremental`
- `mart_l10.fct_revenue_realizado`
- `mart_l10.fct_attainment`

Isso permite ligar o painel com métricas estáveis, sem depender de lógica duplicada na ferramenta de BI.

---

## 6) Filtros: cenário atual e recomendação

## 6.1 O que já conseguimos filtrar hoje (com base nas colunas existentes)

### Filtros globais viáveis imediatamente

- Tempo: semana, mês, quarter (via `Data_de_criacao`, `Data`, `closed_date`, `fecha_factura`, `Fiscal_Q`, `q`)
- Pessoa: vendedor (`Vendedor`, `Atribuido`, `vendedor`)
- Perfil comercial: New / Base (`Perfil`, `perfil`, `Perfil_Cliente`)
- Forecast: `Forecast_SF`, `forecast_status`
- Produto (proxy): `Portfolio_FDM`, `familia`, `produto`
- Segmento: `Segmento_consolidado`, `segmento`

### Filtros que ainda são proxies (não perfeitos)

- CS vs SS: hoje depende de mapeamento manual de pessoas, não existe coluna nativa separando squads.
- Plataforma / Serviços / Soluções no pipeline aberto: ainda requer dicionário de mapeamento por `Produtos`.
- GTM: `gtm_2026` existe, mas precisa normalização de domínio.

## 6.2 Filtros recomendados no curto prazo (ordem de implementação)

1. Período (`Semana`, `Mês`, `Quarter`)
2. Dono (`Vendedor`)
3. Squad (`Sales Nomeadas`, `Sales Outras GTM`, `CS`, `CE`, `SS`) via tabela de mapeamento
4. Produto consolidado (`Plataforma`, `Serviços`, `Soluções`)
5. Tipo de valor (`Booking Gross`, `Booking Net`, `Net Revenue`)
6. Status de pagamento (`Pagada`, `Pendiente`, etc.) para visão financeira

---

## 7) Ajustes da visão executiva (fora do painel L10)

Você confirmou que os números atuais de Net/Gross na visão executiva são de **booking**.

## 7.1 Mudança de nomenclatura (obrigatória)

- Trocar botões atuais:
  - `Gross` -> `Booking Gross`
  - `Net` -> `Booking Net`

## 7.2 Novo chaveamento de valor

Adicionar 4 opções de chaveamento:

1. `Booking Gross`
2. `Booking Net`
3. `Net Revenue`
4. `Gross Revenue`

Regra esperada (revisada):
- `Booking Gross` e `Booking Net` podem compartilhar a mesma estrutura de cards/gráficos, mudando apenas a métrica.
- `Net Revenue` e `Gross Revenue` devem abrir **visão financeira** com cards e gráficos próprios (não reaproveitar os mesmos cards de booking).
- A tela inferior também muda conforme o modo.
- Quando modo = `Net Revenue` ou `Gross Revenue`, fonte principal deve ser `faturamento_2025/2026` (não bookings).
- Nos modos de receita (`Net Revenue` e `Gross Revenue`), incluir card visual de meta/attainment no topo.

## 7.3 Definição técnica de cada modo

- `Booking Gross`: soma de `booking_total_gross` (fallback `closed_deals_won.Gross`)
- `Booking Net`: soma de `booking_total_net` (fallback `closed_deals_won.Net`)
- `Net Revenue`: soma de `net_revenue` (ou `net_real`, após decisão oficial)
- `Gross Revenue`: soma de `valor_fatura_usd_comercial` (ou `receita_usd`, após decisão oficial)

## 7.4 Desenho funcional da tela por modo

### Modo A: Booking (`Booking Gross` / `Booking Net`)

Cards superiores recomendados:

- Booking do período (valor)
- Booking incremental (valor e #)
- Pipeline incremental relacionado
- Booking por produto (Plataforma/Serviços/Soluções)

Gráficos recomendados:

- Série semanal de booking
- Barra por produto
- Ranking por vendedor

Tabela inferior:

- Principais oportunidades e vendedores por booking (valor e quantidade)

### Modo B: `Net Revenue` (visão separada)

Cards superiores recomendados (novos):

- Net Revenue realizado no período
- Net Revenue pago
- Net Revenue pendente
- Attainment Net Revenue vs meta

Gráficos recomendados (novos):

- Série temporal de Net Revenue (semanal/mensal)
- Barra empilhada `Pagada vs Pendiente`
- Realizado vs Meta por quarter

Tabela inferior (nova lógica):

- Top clientes/produtos por Net Revenue
- Quebra por status de pagamento
- Identificação de concentração de risco financeiro

### Modo C: `Gross Revenue` (visão separada)

Cards superiores recomendados (novos):

- Gross Revenue realizado no período
- Gross Revenue pago
- Gross Revenue pendente
- Attainment Gross Revenue vs meta

Gráficos recomendados (novos):

- Série temporal de Gross Revenue (semanal/mensal)
- Barra empilhada `Pagada vs Pendiente`
- Realizado vs Meta por quarter

Tabela inferior (nova lógica):

- Top clientes/produtos por Gross Revenue
- Quebra por status de pagamento
- Identificação de concentração de risco financeiro

### Regra de produto/UX

- O chaveamento continua único na UI (`Booking Gross` / `Booking Net` / `Net Revenue` / `Gross Revenue`).
- Quando usuário seleciona `Net Revenue` ou `Gross Revenue`, a aplicação troca para dataset e componentes da visão financeira.
- Evitar “misturar” booking e receita no mesmo card para não gerar leitura incorreta.

---

## 8) Planejamento da visão de Meta x Faturado x Pago

## 8.1 Objetivo da visão

Mostrar de forma simples:

- Quanto já foi faturado
- Quanto já foi pago
- Quanto falta para meta
- Quanto representa em Gross e em Net Revenue

## 8.2 Fonte e regras de cálculo

- Meta: `sales_intelligence.meta` (`Gross`, `Net`, `Periodo_Fiscal`)
- Faturado: soma financeira no período (base faturamento)
- Pago: subconjunto com `estado_pagamento = 'Pagada'`
- Pendente/Em aberto: `estado_pagamento IN ('Pendiente', 'Nota de Credito', ...)` conforme regra financeira final

## 8.3 Visualizações recomendadas

1. Gauge/Bullet de attainment por quarter:
	- `Gross realizado / Meta Gross`
	- `Net realizado / Meta Net`
2. Barra empilhada por mês:
	- `Pagada` vs `Pendiente`
3. Série temporal semanal:
	- evolução de `Net Revenue` e acumulado do quarter

---

## 9) Nova tela: Scorecard do Vendedor

Links do Salesforce desconsiderados conforme solicitado.

## 9.1 Granularidade dos dados

Granularidade proposta para a tela:

- Nível principal: `Semana x Vendedor x Measurable`
- Nível secundário: `Squad x Vendedor x Semana`
- Nível executivo: `Squad x Semana` (agregado)

## 9.2 Dimensões e métricas do scorecard

Dimensões:

- `week_start_date`
- `vendedor`
- `squad` (Sales Nomeadas, Sales Outras GTM, CS, CE, SS)
- `measurable`

Medidas:

- `weekly_goal_value`
- `actual_value_numerator`
- `actual_value_denominator` (quando métrica for tipo `$ / #` ou `# / #`)
- `attainment_pct`
- `status` (On Track, At Risk, Off Track)

## 9.3 Estrutura mínima recomendada

### Tabela de metas semanais

`mart_l10.fct_weekly_goal`

- week_start_date
- vendedor
- squad
- measurable
- goal_num
- goal_den
- owner (Who)

### Tabela de realizado semanal

`mart_l10.fct_weekly_actual`

- week_start_date
- vendedor
- squad
- measurable
- actual_num
- actual_den
- fonte_dado

### View de score final

`mart_l10.v_scorecard_vendedor`

- une meta + realizado
- calcula attainment e status
- gera os campos já prontos para visualização

## 9.4 Regras de status (sugestão)

- `On Track`: attainment >= 100%
- `At Risk`: attainment entre 70% e 99%
- `Off Track`: attainment < 70%

---

## 10) Planejamento de "Issues" semanais

Você trouxe exemplos de issues em 13/2/2026 e 23/2/2026 (métrica + nomes).

## 10.1 Definição de issue

Issue = combinação `Semana + Measurable + Vendedor` com:

- resultado zerado quando havia meta > 0, ou
- attainment abaixo de limiar (ex.: <70%), ou
- queda forte vs semana anterior (ex.: -30% ou mais)

## 10.2 Estrutura recomendada

`mart_l10.fct_weekly_issues`

- issue_date
- week_start_date
- measurable
- vendedor
- squad
- issue_type (`ZERO_RESULT`, `LOW_ATTAINMENT`, `NEGATIVE_TREND`)
- issue_severity (`HIGH`, `MEDIUM`, `LOW`)
- observed_value
- goal_value
- comentario

## 10.3 Como usar na tela

- Bloco "Issues da Semana" com agrupamento por measurable
- Ordenação por severidade e impacto
- Drill-down por vendedor para ações de recuperação

---

## 11) O que devemos adicionar (resumo objetivo)

1. **Dicionário de mapeamento de pessoas para squad** (resolve CS/SS/CE/Sales Nomeadas/Outras GTM)
2. **Dicionário de mapeamento de produto** (resolve Plataforma/Serviços/Soluções no pipeline)
3. **Camada semanal padrão** (`fct_weekly_goal`, `fct_weekly_actual`, `fct_weekly_issues`)
4. **Padronização de nomenclatura executiva** (Booking Gross/Net vs Net Revenue)
5. **Regra financeira oficial** para:
	- campo oficial de Gross faturado
	- campo oficial de Net Revenue
	- status que compõem Pago e Inadimplência

Com esses 5 itens, o planejamento fica executável tanto para evolução da visão executiva quanto para a nova tela de scorecard.

---

## 12) Blueprint visual (como fica na prática)

Objetivo desta seção: mostrar o desenho de tela final para validação de negócio/UX antes da implementação.

## 12.1 Tela 1 — Visão Executiva (com chaveamento)

### Barra superior (fixa)

- Título: `Visão Executiva`
- Chaveamento principal (segmentado):
	- `Booking Gross`
	- `Booking Net`
	- `Net Revenue`
	- `Gross Revenue`
- Filtros globais:
	- Período (`Semana`, `Mês`, `Quarter`)
	- Quarter fiscal
	- Vendedor
	- Squad
	- Produto consolidado (`Plataforma`, `Serviços`, `Soluções`)

### Wireframe (estrutura)

```text
[Header: Visão Executiva] [Toggle: Booking Gross | Booking Net | Net Revenue | Gross Revenue]
[Filtros: Período | Quarter | Vendedor | Squad | Produto]

[Card 1] [Card 2] [Card 3] [Card 4]
[Gráfico A.....................] [Gráfico B.....................]
[Tabela Detalhe / Principais dados.................................]
```

### Modo A: Booking (`Booking Gross` / `Booking Net`)

Cards (linha 1):

1. Booking do período
2. Booking incremental
3. Pipeline incremental
4. Booking por produto (total)

Gráficos (linha 2):

- Gráfico A: série temporal de booking (semanal/mensal)
- Gráfico B: barra por produto (`Plataforma`, `Serviços`, `Soluções`)

Tabela inferior:

- Colunas: Vendedor, Squad, Produto, Booking Valor, # Opps, Variação vs semana anterior

### Modo B: Receita (`Net Revenue`)

Cards (linha 1):

1. Net Revenue realizado
2. Net Revenue pago
3. Net Revenue pendente
4. Attainment Net Revenue vs Meta

Gráficos (linha 2):

- Gráfico A: série temporal de Net Revenue
- Gráfico B: barra empilhada `Pagada` vs `Pendiente`

Tabela inferior:

- Colunas: Cliente, Produto/Família, Net Revenue, Status Pagamento, % participação

### Modo C: Receita (`Gross Revenue`)

Cards (linha 1):

1. Gross Revenue realizado
2. Gross Revenue pago
3. Gross Revenue pendente
4. Attainment Gross Revenue vs Meta

Gráficos (linha 2):

- Gráfico A: série temporal de Gross Revenue
- Gráfico B: barra empilhada `Pagada` vs `Pendiente`

Tabela inferior:

- Colunas: Cliente, Produto/Família, Gross Revenue, Status Pagamento, % participação

### Regras visuais importantes

- Ao trocar para `Net Revenue` ou `Gross Revenue`, os cards e gráficos mudam de estrutura (não só de métrica).
- Cores financeiras consistentes:
	- Pago = positivo
	- Pendente = alerta
	- Abaixo da meta = crítico
- Sempre exibir no card de attainment:
	- valor realizado
	- valor meta
	- percentual (`realizado/meta`)

---

## 12.2 Tela 2 — Visão Meta x Faturado x Pago (Financeira)

### Wireframe

```text
[Header: Meta x Faturado x Pago] [Filtros: Quarter | Mês | Produto | Squad]

[Meta Gross] [Realizado Gross] [Attainment Gross] [Gap Gross]
[Meta Net  ] [Realizado Net  ] [Attainment Net  ] [Gap Net  ]

[Linha: Realizado vs Meta por período................................]
[Barras: Pago vs Pendente por período................................]
[Tabela: detalhamento financeiro.....................................]
```

Tabela detalhada sugerida:

- Período
- Produto/Família
- Gross realizado
- Net realizado
- Pago
- Pendente
- Meta Gross
- Meta Net
- Attainment Gross
- Attainment Net

---

## 12.3 Tela 3 — Scorecard do Vendedor

### Wireframe

```text
[Header: Scorecard do Vendedor] [Filtros: Semana | Squad | Vendedor | Measurable]

[Total On Track] [Total At Risk] [Total Off Track] [Attainment Médio]

[Matriz: Vendedor x Measurable com semáforo..........................]
[Tabela: metas vs realizado por semana...............................]
[Painel lateral: Issues da semana....................................]
```

### Bloco principal (matriz de desempenho)

Linhas:

- Vendedores

Colunas:

- Measurables (Atividades, Oportunidades, Pipeline, Booking, Net Revenue etc.)

Célula:

- `realizado/meta`
- `% attainment`
- cor de status (`On Track`, `At Risk`, `Off Track`)

### Tabela de detalhe

Colunas:

- Semana
- Squad
- Vendedor
- Measurable
- Meta
- Realizado
- % Attainment
- Tendência vs semana anterior

### Painel de issues (lado direito ou bloco inferior)

Seções:

1. `Issues HIGH`
2. `Issues MEDIUM`
3. `Issues LOW`

Cada item mostra:

- Data/semana
- Measurable
- Vendedor
- Tipo de issue
- Valor observado vs meta

---

## 12.4 Comportamento de filtros e navegação entre telas

### Princípios

- Filtros globais de tempo e squad persistem ao navegar entre telas.
- Filtros específicos por tela não “vazam” para outra tela.
- Reset de filtros sempre visível.

### Exemplo prático de navegação

1. Usuário seleciona `Quarter = FY26-Q3` + `Squad = CS` na Visão Executiva.
2. Troca o modo para `Net Revenue` e vê cards financeiros + attainment.
3. Navega para Scorecard mantendo quarter/squad.
4. Abre issue da semana e entra no detalhe do vendedor.

---

## 12.5 Estados de tela necessários

- `Loading`: skeleton nos cards e gráficos.
- `Sem dados`: mensagem clara + dica de ajuste de filtro.
- `Erro de dados`: bloco com causa técnica e botão de tentar novamente.
- `Dados parciais`: badge avisando ausência de algum dataset (ex.: meta faltante no período).

---

## 12.6 Entrega visual mínima (MVP)

Para uma primeira versão utilizável:

1. Visão Executiva com 4 modos de chaveamento e cards corretos por modo.
2. Scorecard do vendedor com matriz + issues semanais.
3. Uma tela financeira consolidada de Meta x Faturado x Pago.

Com isso já é possível operar reunião executiva e rotina semanal de gestão com leitura correta de booking x receita.

---

## 13) Padrão UX/UI obrigatório (alinhado ao app atual)

Esta seção define como implementar o novo escopo com **máximo de UX design** sem romper o conceito visual já presente no app.

## 13.1 Princípios obrigatórios (herdados do produto atual)

1. **Hierarchy First**: insight principal visível na primeira dobra.
2. **Progressive Disclosure**: resumo primeiro, detalhe sob clique.
3. **Signal over Noise**: menos texto concorrente, mais semântica visual.
4. **Net First em contexto executivo**: quando houver disputa de leitura, destacar Net em visão executiva de receita.
5. **Consistency**: mesmo comportamento de filtros, estados e componentes em todas as telas.
6. **Actionability**: todo alerta/issue deve levar a ação ou drilldown.

## 13.2 Linguagem visual que deve ser mantida

### Identidade

- Manter paleta e tokens já usados (base ciano + fundos escuros + superfícies glass).
- Manter contraste alto para números-chave e KPIs.
- Não criar nova família tipográfica: continuar com a hierarquia atual de títulos e texto.

### Componentes

- Cards com o mesmo estilo de superfície (glass, borda sutil, hover controlado).
- Seções com cabeçalhos já padronizados por categoria.
- Tabelas com leitura analítica (linha zebra discreta, hover semântico, cabeçalho estável).
- Chips/pills com semântica consistente de estado ativo.

### Interação

- Um único padrão de toggle para chaveamento de modo.
- Drilldown com shell único (lista/detalhe/toolbar/chips).
- Persistência de filtros globais entre telas.

## 13.3 Sistema de estados visuais (padronização)

Aplicar o mesmo mapa semântico em todas as telas:

- `success`: atingiu meta / status saudável
- `warning`: atenção / risco moderado
- `danger`: crítico / abaixo do limiar
- `info`: contexto auxiliar

Regras:

- Nunca comunicar estado só por cor (sempre com texto/ícone).
- Semáforo de scorecard deve repetir a mesma semântica dos cards de attainment.

## 13.4 Densidade e legibilidade (qualidade executiva)

### Primeira dobra (sem scroll)

- Máximo de 4 cards por linha.
- No máximo 1 insight textual principal + 1 ação recomendada.
- Evitar blocos longos de texto explicativo no topo.

### Tipos de bloco por prioridade

1. KPI principal (valor + variação + estado)
2. Tendência (gráfico série)
3. Distribuição/comparação (barra/stack)
4. Detalhe (tabela/drilldown)

## 13.5 Comportamento por modo (consistência visual)

- `Booking Gross` e `Booking Net`: mesma anatomia visual (troca só métrica).
- `Net Revenue` e `Gross Revenue`: anatomia financeira própria, com cards de pago/pendente/meta.
- Ao mudar o modo, manter posição dos blocos (layout estável), mudando conteúdo e fonte.

## 13.6 Padrão de filtros (UX operacional)

### Barra de filtros compacta (sempre visível)

- Período
- Quarter
- Squad
- Vendedor
- Produto
- Indicador de filtros ativos

### Regras

- Exibir resumo persistente de contexto (ex.: `FY26-Q3 | CS | Net Revenue`).
- Botão de reset sempre visível.
- Não esconder filtros críticos atrás de múltiplos cliques.

## 13.7 Acessibilidade mínima obrigatória

- Foco visível em botões, tabs, chips e selects.
- Navegação por teclado nos fluxos principais (toggle, filtros, drilldown, tabela).
- Contraste mínimo AA em textos e números críticos.
- `aria-label` em botões de ícone e ações sem texto.

## 13.8 Microcopy e nomenclatura (padronização de negócio)

### Rótulos oficiais

- `Booking Gross`
- `Booking Net`
- `Gross Revenue`
- `Net Revenue`
- `Attainment vs Meta`

### Proibições

- Não exibir `Gross`/`Net` isolado em contexto executivo sem prefixo (`Booking` ou `Revenue`).
- Não misturar métricas de booking e faturamento no mesmo card.

## 13.9 Critérios de aceite UX (para aprovação)

1. Em até 60s, usuário identifica estado do período e principal risco.
2. Em até 2 cliques, usuário chega da visão executiva ao detalhe (drilldown).
3. Chaveamento de modo não gera ambiguidade de fonte de dados.
4. Scorecard e Issues usam semântica visual idêntica aos cards executivos.
5. Não há regressão do padrão visual existente do app.

## 13.10 Checklist de implementação visual por tela

### Visão Executiva

- [ ] Toggle com 4 modos padronizados
- [ ] Cards corretos por modo
- [ ] Gráficos corretos por modo
- [ ] Tabela inferior contextual ao modo
- [ ] Meta/attainment visível nos modos de receita

### Meta x Faturado x Pago

- [ ] Realizado vs meta (Gross e Net)
- [ ] Pago vs pendente
- [ ] Gap até meta
- [ ] Drilldown por período/produto/cliente

### Scorecard

- [ ] Matriz vendedor x measurable com semáforo
- [ ] Meta vs realizado por semana
- [ ] Painel de issues com severidade
- [ ] Navegação para detalhe acionável

Com esta padronização, o avanço de UX fica premium e consistente com o produto atual, sem quebrar identidade visual, semântica de dados ou ergonomia de uso executivo.

---

## 14) Revisão completa do plano (consolidado)

## 14.1 Decisões já fechadas

1. O painel executivo terá 4 modos de leitura:
	- Booking Gross
	- Booking Net
	- Net Revenue
	- Gross Revenue
2. Net Revenue e Gross Revenue usarão visão financeira própria (cards/gráficos/tabela diferentes de booking).
3. Meta/attainment é obrigatória nos modos de receita.
4. Scorecard semanal do vendedor entra como tela dedicada com issues acionáveis.
5. UX deve seguir exatamente o padrão visual atual do app (tokens, hierarquia, estados e interação).

## 14.2 Itens ainda em aberto para fechar regra de negócio

1. Campo oficial de Gross Revenue (`valor_fatura_usd_comercial` vs `receita_usd`).
2. Campo oficial de Net Revenue (`net_revenue` vs `net_real`).
3. Regra oficial de `Pago` e `Pendente` por `estado_pagamento`.
4. Mapeamento definitivo de squads (CS, SS, CE, Sales Nomeadas, Sales Outras GTM).
5. Mapeamento definitivo de produto consolidado para pipeline aberto.

## 14.3 Ordem final de execução

1. Fechar regras de negócio pendentes.
2. Criar camada de dados mart_l10.
3. Validar métricas com amostra semanal.
4. Implementar visão executiva com chaveamento 4 modos.
5. Implementar visão financeira (Meta x Faturado x Pago).
6. Implementar Scorecard + Issues.
7. Rodar validação UX final com checklist.

---

## 15) Mapa de documentação (existentes e novos por diretório)

## 15.1 Diretório `docs/`

### Já existentes (relevantes para este escopo)

- `PAINEL_L10_PLANEJAMENTO.md` (documento mestre deste plano)
- `UX_EXECUTIVO_IMPLANTACAO.md`
- `UI_UX_CHECKLIST_IMPLANTACAO.md`
- `UI_UX_ROADMAP_INDEX.md`
- `UX_VISTORIA_AVANCADA_2026-02-22.md`
- `FRONTEND_INVENTORY.md`
- `BACKEND_INVENTORY.md`

### Novos documentos a criar

1. `docs/L10_EXECUCAO_FASES.md`
	- Conteúdo: plano faseado (Fase 1 dados, Fase 2 UI executiva, Fase 3 scorecard).
2. `docs/L10_CONTRATO_DADOS.md`
	- Conteúdo: definição oficial de métricas, fórmulas e fontes por modo.
3. `docs/L10_MAPA_FILTROS.md`
	- Conteúdo: filtros globais, filtros por tela, persistência e prioridades.
4. `docs/L10_SCORECARD_REGRAS.md`
	- Conteúdo: granularidade semanal, metas, attainment, issues e severidade.
5. `docs/L10_CRITERIOS_ACEITE.md`
	- Conteúdo: critérios funcionais + UX para homologação final.

---

## 15.2 Diretório `docs/sprints/`

### Já existentes

- `SPRINT_00_UX_DESDENSIFICACAO.md`
- `SPRINT_01_NET_E_TOP5.md`
- `SPRINT_02_META_BUDGET_E_GRAFICOS.md`
- `SPRINT_03_ALERTAS_DRILLDOWN.md`
- `SPRINT_04_PREVENDA_SLA.md`
- `SPRINT_05_TEMA_CLARO_ESCURO.md`

### Novos documentos a criar

1. `docs/sprints/SPRINT_06_EXECUTIVO_4_MODOS.md`
	- Conteúdo: implementação do toggle 4 modos + cards e gráficos por modo.
2. `docs/sprints/SPRINT_07_VISAO_FINANCEIRA_META_PAGO.md`
	- Conteúdo: tela de Meta x Faturado x Pago com attainment.
3. `docs/sprints/SPRINT_08_SCORECARD_ISSUES_SEMANAIS.md`
	- Conteúdo: scorecard semanal + painel de issues + drilldown.

---

## 15.3 Diretório `bigquery/docs/`

### Já existentes

- `README.md`
- `INDEX.md`
- `QUICK_REFERENCE.md`
- `DATA_QUALITY_REPORT.md`
- `DEPLOYMENT_GUIDE.md`
- `RESUMO_EXECUTIVO.md`

### Observação de revisão

- O arquivo `bigquery/docs/INDEX.md` referencia documentos/scripts que não existem hoje neste diretório (por exemplo: `DEPLOYMENT_CHECKLIST.md`, `setup_bigquery.sh`, `load_initial_data.py`, `quick_test.sh`).
- Esse índice deve ser corrigido para refletir o estado real do repositório.

### Novos documentos a criar

1. `bigquery/docs/L10_DATA_MART_README.md`
	- Conteúdo: arquitetura da camada `mart_l10` e dependências.
2. `bigquery/docs/L10_DICIONARIO_METRICAS.md`
	- Conteúdo: definição técnica de cada KPI (Booking/Revenue/Scorecard).
3. `bigquery/docs/L10_QUALIDADE_E_VALIDACAO.md`
	- Conteúdo: checks de qualidade e reconciliação com números de negócio.
4. `bigquery/docs/L10_MAPEAMENTO_SQUAD_PRODUTO.md`
	- Conteúdo: regras oficiais de mapeamento de pessoas/squad e produto consolidado.
5. `bigquery/docs/L10_QUERY_CATALOG.md`
	- Conteúdo: catálogo de queries e views com finalidade e dono.

---

## 15.4 Diretório `cloud-run/`

### Já existentes

- `cloud-run/README.md`
- `cloud-run/app/api/endpoints/README_PERFORMANCE.md`

### Novos documentos a criar

1. `cloud-run/README_DASHBOARD_MODES.md`
	- Conteúdo: contrato API para modos Booking/Revenue e parâmetros de filtro.
2. `cloud-run/README_FINANCIAL_ENDPOINTS.md`
	- Conteúdo: endpoints de receita/meta/pagamento e payloads esperados.
3. `cloud-run/tests/README_L10_TEST_PLAN.md`
	- Conteúdo: estratégia de teste para visão executiva, financeira e scorecard.

---

## 15.5 Diretório `public/` e `public/estilos/`

### Já existentes

- `public/estilos/refactor/README.md`
- `public/estilos/backup/README.md`

### Novos documentos a criar

1. `public/README_EXECUTIVO_UX.md`
	- Conteúdo: guia rápido de layout e comportamento da Visão Executiva.
2. `public/estilos/refactor/README_DESIGN_TOKENS_EXECUTIVO.md`
	- Conteúdo: regras de uso dos tokens visuais e estados para novas telas.
3. `public/README_SCORECARD_LAYOUT.md`
	- Conteúdo: blueprint de componentes da tela de scorecard.

---

## 15.6 Sequência de criação dos documentos (prioridade)

### Prioridade P0 (imediata)

1. `docs/L10_CONTRATO_DADOS.md`
2. `bigquery/docs/L10_DICIONARIO_METRICAS.md`
3. `docs/L10_MAPA_FILTROS.md`
4. `docs/L10_CRITERIOS_ACEITE.md`

### Prioridade P1 (durante construção)

5. `bigquery/docs/L10_DATA_MART_README.md`
6. `bigquery/docs/L10_QUERY_CATALOG.md`
7. `cloud-run/README_DASHBOARD_MODES.md`
8. `cloud-run/README_FINANCIAL_ENDPOINTS.md`

### Prioridade P2 (fechamento)

9. `docs/L10_SCORECARD_REGRAS.md`
10. `cloud-run/tests/README_L10_TEST_PLAN.md`
11. `public/README_EXECUTIVO_UX.md`
12. `public/README_SCORECARD_LAYOUT.md`

Com esse mapa, a documentação fica rastreável por diretório, elimina ambiguidade entre times (dados, backend, frontend e negócio) e permite execução faseada sem perda de contexto.

---

## 16) Melhorias recomendadas + análises gráficas de Revenue/Gross

## 16.1 Melhorias prioritárias (dados + produto)

1. **Fonte oficial por métrica**
	- Definir e congelar campos oficiais:
	  - `Gross Revenue`: `valor_fatura_usd_comercial` (ou `receita_usd`)
	  - `Net Revenue`: `net_revenue` (ou `net_real`)
	  - `Pago/Pendente`: regra oficial por `estado_pagamento`
2. **Camada semântica única para consumo do dashboard**
	- Consolidar em `mart_l10` para evitar lógica duplicada no frontend.
3. **Calendário único de análise**
	- Mesma lógica de semana/mês/quarter em booking e faturamento.
4. **Reconciliação automática**
	- Check diário de soma do dashboard vs soma da base para detectar divergência.
5. **Dicionários de negócio obrigatórios**
	- `dim_squad_vendedor` (mapeia vendedor para squad)
	- `dim_produto_consolidado` (Plataforma/Serviços/Soluções)

## 16.2 Reaproveitamento de filtros globais (obrigatório)

Sim — os filtros globais devem ser reaproveitados também na visão de faturamento.

### Regra central

- O mesmo painel de filtros globais deve controlar os modos:
  - `Booking Gross`
  - `Booking Net`
  - `Net Revenue`
  - `Gross Revenue`

### Filtros globais que devem continuar iguais

1. `Período` (Semana/Mês/Quarter)
2. `Quarter fiscal`
3. `Vendedor` (**obrigatório**)
4. `Squad`
5. `Produto consolidado`

### Como ligar o filtro global de `Vendedor` ao faturamento

Como as bases têm granularidade diferente, aplicar fallback em camadas:

1. **Join principal por oportunidade**
	- `faturamento_*.oportunidade` ↔ tabela comercial com `Vendedor`.
2. **Fallback por conta/cliente**
	- Quando não houver oportunidade preenchida, tentar vínculo por cliente/conta.
3. **Sem mapeamento**
	- Classificar como `Vendedor = NÃO MAPEADO` para transparência.

### Critério de aceite para filtro global

- Ao selecionar `Vendedor = X`, os 4 modos devem responder com o mesmo universo filtrado (respeitando a fonte de cada modo).
- A UI deve exibir badge de cobertura do filtro (ex.: `% de linhas de faturamento mapeadas para vendedor`).

## 16.3 Análises gráficas recomendadas (Revenue/Gross de faturamento)

### Núcleo executivo (primeira entrega)

1. **Série temporal Gross vs Net Revenue**
	- Visual: linha dupla por semana/mês.
	- Objetivo: tendência e distância entre Gross e Net.
2. **Attainment vs Meta (Gross e Net)**
	- Visual: bullet/gauge + valor do gap.
	- Objetivo: leitura instantânea de realizado vs meta.
3. **Pago vs Pendente no período**
	- Visual: barras empilhadas por mês/quarter.
	- Objetivo: saúde de caixa e risco de recebimento.
4. **Top concentração por cliente/produto**
	- Visual: Pareto (barra + acumulado).
	- Objetivo: identificar concentração e dependência.

### Camada analítica (segunda entrega)

5. **Waterfall Gross -> Net**
	- Visual: ponte de variação por descontos/ajustes.
	- Objetivo: explicar perda entre faturamento bruto e líquido.
6. **Bridge QoQ (quarter over quarter)**
	- Visual: waterfall de variação entre quarters.
	- Objetivo: decompor aumento/queda por produto/squad/cliente.
7. **Heatmap de inadimplência**
	- Visual: matriz `mês x status_pagamento` com valor.
	- Objetivo: detectar sazonalidade de risco financeiro.
8. **Scatter Receita x Margem x Risco**
	- Visual: X = receita, Y = margem, tamanho = pendente.
	- Objetivo: priorizar ações comerciais/financeiras.

## 16.4 Layout recomendado da visão financeira (prática)

### Linha 1 (cards)

- Gross Revenue Realizado
- Net Revenue Realizado
- Pago
- Pendente
- Attainment Gross
- Attainment Net

### Linha 2 (gráficos principais)

- Série Gross vs Net
- Pago vs Pendente

### Linha 3 (diagnóstico)

- Pareto Cliente/Produto
- Waterfall Gross -> Net

### Linha 4 (tabela detalhada)

Colunas mínimas:
- Período
- Vendedor
- Squad
- Cliente
- Produto consolidado
- Gross Revenue
- Net Revenue
- Status pagamento
- Meta aplicável
- Attainment

## 16.5 Backlog de implementação (curto prazo)

### Sprint A (rápido impacto)

1. Reaproveitar filtros globais nos 4 modos.
2. Garantir mapeamento de vendedor no faturamento (com fallback e `% cobertura`).
3. Entregar 4 visuais núcleo executivo.

### Sprint B (profundidade analítica)

4. Entregar waterfall e bridge QoQ.
5. Entregar heatmap de inadimplência e scatter receita/margem.
6. Publicar validação de consistência dos números (reconciliação).

Com esta seção, Revenue/Gross de faturamento fica integrado ao mesmo fluxo de filtros globais do app, sem perder consistência de UX e sem quebrar a leitura executiva.

---

## 17) Faturamento semanal (nova origem) — integração AppScript + BigQuery

## 17.1 Origem oficial

- Planilha origem: `18PDjdprqBZCQsJxA8Jc7xQNX7iLsfpPWQ-AuBDF4OgQ`
- Aba origem: `Q1 2026`
- Aba destino no appscript: `Faturamento_Week`
- Tabela BigQuery: `operaciones-br.sales_intelligence.faturamento_semanal`

## 17.2 Regra de normalização de cabeçalho (na migração)

O cabeçalho é normalizado já na entrada para facilitar o sync com BigQuery.

Exemplos principais:

- `Mes` -> `mes`
- `País` -> `pais`
- `Cuenta Financiera` -> `cuenta_financeira`
- `Tipo de Documento` -> `tipo_documento`
- `Fecha de factura` -> `fecha_factura`
- `Cueta contable` / `Cuenta contable` -> `cuenta_contable`
- `(Moneda Local) Valor de Factura (Sin IVA)` -> `valor_fatura_moeda_local_sem_iva`
- `Producto` -> `produto`
- `Oportunidad` -> `oportunidade`
- `Cliente` -> `cliente`
- `ID oportunidad` -> `id_oportunidade`
- `Billing ID` -> `billing_id`
- `% Desc. Xertica (NS)` -> `percentual_desconto_xertica_ns`
- `Tipo de Producto` -> `tipo_produto`
- `Portafolio` -> `portafolio`
- `Estado de Pago` -> `estado_pagamento`
- `Fecha Doc. Timbrado` -> `fecha_doc_timbrado`
- `Familia` -> `familia`
- `Tipo cambio pactado` -> `tipo_cambio_pactado`
- `Tipo de cambio diario` -> `tipo_cambio_diario`
- `Valor de Factura en USD (Comercial)` -> `valor_fatura_usd_comercial`
- `Net Revenue` -> `net_revenue`
- `Incentivos Google` -> `incentivos_google`
- `Backlog nombrado` -> `backlog_nomeado`
- `País del comercial` -> `pais_comercial`
- `Comercial` -> `comercial`
- `Año oportunidad` -> `ano_oportunidade`
- `Tipo de Oportunidad (Line)` -> `tipo_oportunidade_line`
- `Dominio` -> `dominio`
- `Segmento` -> `segmento`
- `Margen % Final` -> `margem_percentual_final`
- `Revisión margen` -> `revisao_margem`
- `Etapa de la oportunidad` -> `etapa_oportunidade`
- `Descuento Xertica` -> `desconto_xertica`
- `Escenario NR` -> `cenario_nr`

## 17.3 Cadência e gatilho

- Trigger de migração de faturamento: **a cada 12 horas**.
- O trigger agora cobre: `FATURAMENTO_2025`, `FATURAMENTO_2026` e `Faturamento_Week`.
- Após a migração, o `BigQuerySync` passa a carregar também `faturamento_semanal` no dataset `sales_intelligence`.

## 17.4 Onde mostrar no produto (visão prática)

### Visão Executiva (modos `Net Revenue` e `Gross Revenue`)

- Série semanal de receita deve priorizar `faturamento_semanal` quando o filtro de período estiver em semana.
- Para períodos mensais/trimestrais, usar consolidação `faturamento_2025/2026` + `faturamento_semanal` sem dupla contagem (regra de reconciliação).

### Visão Financeira (Meta x Faturado x Pago)

- Blocos semanais usam `faturamento_semanal`.
- Blocos mensais/quarter usam base consolidada financeira.
- Sempre manter os filtros globais (incluindo `Vendedor`) aplicados também na visão semanal.

## 17.5 Critérios de aceite da nova origem semanal

1. Aba `Faturamento_Week` é preenchida com cabeçalho já normalizado.
2. Tabela `faturamento_semanal` recebe dados em toda execução de sync (quando há linhas).
3. Modos de receita exibem os dados semanais com os mesmos filtros globais.
4. Não há quebra de schema ao adicionar novas colunas no source (evolução segura).

---

## 18) Validação final (execução real + BigQuery)

Data da validação: **2026-02-24**

## 18.1 Resultado geral

Status: **OK para seguir com planejamento**, com alguns ajustes recomendados antes da etapa de dashboard produtivo.

## 18.2 Evidências confirmadas no BigQuery

- Tabela criada: `sales_intelligence.faturamento_semanal`
- Linhas carregadas: **237**
- Colunas no schema: **40**
- Metadados técnicos:
  - `Run_ID` preenchido em 237/237
  - `data_carga` preenchido em 237/237

Volumetria pós-sync (batendo com logs):

- `pipeline`: 264
- `closed_deals_won`: 506
- `closed_deals_lost`: 2091
- `atividades`: 5126
- `meta`: 12
- `sales_specialist`: 18
- `faturamento_2025`: 2209
- `faturamento_2026`: 139
- `faturamento_semanal`: 237

## 18.3 Achados importantes (qualidade de dados)

1. **Formato de `fecha_factura` no semanal está em ISO (`%Y-%m-%d`)**
	- Parse válido ISO: 237/237
	- Parse válido dd/mm/yyyy: 0/237
	- Implicação: padronizar no planejamento/queries para ISO nesta tabela.

2. **Campos nulos relevantes no semanal**
	- `estado_pagamento` vazio: 13/237
	- `net_revenue` nulo: 4/237

3. **Cobertura de vínculo com vendedor (filtro global)**
	- Vendedores únicos em `faturamento_semanal.comercial`: 18
	- Match exato com `pipeline.Vendedor`: 7
	- Implicação: ainda precisa tabela de mapeamento (`dim_squad_vendedor`) para garantir filtro global consistente.

4. **Chaves de reconciliação**
	- `billing_id` vazio: 190/237
	- `id_oportunidade` vazio: 2/237
	- Implicação: `id_oportunidade` tem boa cobertura e deve ser chave principal de vínculo; `billing_id` não pode ser chave única.

## 18.4 O que falta para fechar 100%

1. Criar regra de fallback para filtro global de vendedor no faturamento:
	- primeiro por `id_oportunidade` -> vendedor comercial
	- fallback por `comercial`
	- não mapeados em bucket explícito

2. Criar regra de saneamento para `estado_pagamento` vazio (`NÃO INFORMADO`).

3. Definir política para `net_revenue` nulo:
	- ou excluir de KPI de Net
	- ou tratar com regra contábil acordada

4. Criar view de consumo para dashboard financeiro:
	- `mart_l10.v_faturamento_semanal_consolidado`
	- com datas parseadas, status saneado e vínculo de vendedor resolvido

## 18.5 Recomendação final

Eu seguiria com a implementação da UI agora, mas adicionaria **uma sprint curta de hardening de dados** antes da publicação executiva:

- Duração: 1–2 dias
- Objetivo: fechar mapeamento de vendedor + saneamento de status + view consolidada semanal
- Benefício: garante que o filtro global (especialmente `Vendedor`) funcione com alta confiabilidade em `Booking`, `Net Revenue` e `Gross Revenue`.

---

## 19) Sprint de hardening executada (2026-02-24)

Implementação realizada no BigQuery e versionada em:

- `bigquery/queries/l10_hardening_faturamento_semanal.sql`

## 19.1 Objetos criados

- Tabela: `operaciones-br.mart_l10.dim_vendedor_manual`
- View: `operaciones-br.mart_l10.v_faturamento_semanal_consolidado`
- View: `operaciones-br.mart_l10.v_faturamento_semanal_kpis`

## 19.2 O que a sprint resolveu

1. Saneamento de status de pagamento:
	- `estado_pagamento_saneado` com fallback `NAO_INFORMADO`.
2. Saneamento de valores:
	- `gross_revenue_saneado = COALESCE(valor_fatura_usd_comercial, 0)`
	- `net_revenue_saneado = COALESCE(net_revenue, 0)`
3. Padronização de datas:
	- `fecha_factura_date` com parse ISO e fallback alternativo.
4. Estrutura para filtro global de vendedor:
	- `vendedor_canonico`
	- `squad_canonico`
	- `vendedor_match_source`
	- flags de qualidade por linha

## 19.3 Resultado de validação pós-hardening

- Linhas da view consolidada: 237
- `estado_pagamento_saneado = NAO_INFORMADO`: 13
- `flag_net_revenue_nulo`: 4
- Match de vendedor por fonte:
  - `manual_map`: 140
  - `pipeline_exact`: 52
  - `fallback_comercial`: 45

## 19.4 Próximo ajuste recomendado (rápido)

Para elevar cobertura do filtro global de vendedor, completar `dim_vendedor_manual` com mapeamentos adicionais de nomes de `comercial` para `vendedor_canonico/squad`.

Isso é simples (DML em tabela pequena) e melhora diretamente a consistência dos filtros em Revenue/Gross.

---

## 20) TODO List — Execução por sprint

> **Princípio:** tudo que a UI e o L10 consomem passa pelas views `mart_l10`. O código existente (API Python, AppScript, JS) **não muda** enquanto as views estiverem estáveis. Cada tarefa é independente e entregável sozinha.

---

### SPRINT A — Hardening de dados _(BQ only, sem tocar código)_

#### A1 · Completar `dim_vendedor_manual` com squads ✅
- [x] Inserir os 16 vendedores confirmados com `vendedor_canonico` + `squad` + `alias_fat`
- [x] Squads: `Contas Nomeadas`, `Sales Outras GTM`, `CS`, `SS` (renomeado: Sales Nomeadas → Contas Nomeadas)
- [x] Confirmar entrada `Xertica` → squad `NAO_MAPEADO`
- **Arquivo:** `bigquery/queries/l10_hardening_faturamento_semanal.sql`
- **Validação:** `SELECT squad_canonico, COUNT(*) FROM mart_l10.v_faturamento_semanal_kpis GROUP BY 1`
- **Resultado:** 11 ativos (CS×2, Contas Nomeadas×5, SS×2, NAO_MAPEADO×2) + 11 ex-vendedores ativo=FALSE

#### A2 · Resolver bucket `Xertica` via join por `oportunidade` ✅
- [x] Adicionar CTE `oportunidade_map` em `v_faturamento_semanal_consolidado`
  - LEFT JOIN `closed_deals_won ON oportunidade = Oportunidade`
  - LEFT JOIN `pipeline ON oportunidade = Oportunidade`
- [x] Expandir COALESCE de `vendedor_canonico`: `manual_map → oportunidade_join → fallback_comercial`
- [x] `vendedor_match_source` inclui valor `'oportunidade_join'`
- **Meta:** reduzir `linhas_vendedor_nao_mapeado` de 140 para < 20
- **Resultado:** 138 resolvidas via oportunidade_join; 2 com oportunidade=NULL; 2 multi-value irredutíveis

#### A3 · Fix `Confiana` (typo) nas constantes de schema ✅
- [x] `cloud-run/app/schema_constants.py`: `Confiana` → `Confianca`
- [x] `public/scripts/schema-constants.js`: idem
- [x] `BigQuerySync.gs`: mantido intencional (define o nome da coluna BQ — mudar quebraria sync)
- [x] Outros arquivos SQL com typo corrigidos: `validate_quarters.sql`, `validate_quarters_full.sql`, `test_ml_modelo1.sql`, `view_pauta_semanal_completa.sql`
- **Impacto:** 13 referências retornando NULL silenciosamente passam a retornar o valor real

#### A4 · Adicionar `fiscal_q_derivado` e `portfolio_fat_canonico` nas views ✅
- [x] `fiscal_q_derivado` adicionado em `v_faturamento_semanal_consolidado` — derivado de `fecha_factura_date`, formato `FY26-Q1`
- [x] `portfolio_fat_canonico` adicionado — `WT`→`Workspace`, `GCP`→`GCP`, `%MSP%`→`MSP`
- [x] Permite JOIN com `closed_deals_won.Fiscal_Q` para comparação cross-source

---

### SPRINT B — Camada mart_l10 de bookings e pipeline

#### B1 · `mart_l10.v_dim_vendedor` _(view, não tabela)_ ✅
- [x] VIEW sobre `mart_l10.dim_vendedor` (TABLE manual)
- [x] Colunas: `vendedor_canonico`, `squad`, `ativo`, `alias_fat`, `alias_crm`, `updated_at`
- [x] Fonte única de squad — todas as views B2/B3/B4 fazem JOIN aqui
- [x] JOIN normalizado (remove acentos, caixa, pontuação) para cobrir `rayssa zevolli` → `Rayssa Zevolli`

#### B2 · `mart_l10.v_booking_incremental` ✅
- [x] Fonte: `closed_deals_won` + join `v_dim_vendedor`
- [x] Colunas: `semana_inicio`, `mes_inicio`, `quarter_inicio`, `fiscal_q`, `vendedor_canonico`, `squad`, `portfolio_label`, `segmento_canonico`, `oportunidade`, `conta`, `gross`, `net`, `linhas`
- [x] `portfolio_label`: `Plataforma` / `Serviços` / `Soluções` / `Outros` via `Portfolio_FDM`
- [x] `segmento_canonico = COALESCE(Segmento_consolidado, Segmento, Subsegmento_de_mercado)`
- **Validação:** 506 deals, SUM(gross) = R$ 109.8M = match exato com `closed_deals_won.Gross` ✅

#### B3 · `mart_l10.v_pipeline_aberto` ✅
- [x] Fonte: `pipeline` + join `v_dim_vendedor`
- [x] Colunas: `semana_snapshot`, `fiscal_q`, `vendedor_canonico`, `squad`, `owner_preventa` (CE — papel, não squad), `portfolio_label`, `segmento_canonico`, `fase_atual`, `gross`, `net`, `confianca_score`, `forecast_sf`, `idle_dias`
- [x] `confianca_score` = `Confianca` INT64 nativo — nunca `Confiana`
- [x] Flags: `flag_idle_alto` (idle > 14d), `flag_sem_qualificacao` (confianca < 30 ou NULL)
- **Resultado:** 264 oportunidades; `v_pipeline_consolidado` mantido como legado

#### B4 · `mart_l10.v_revenue_semanal` _(alias limpo sobre view existente)_ ✅
- [x] Fonte: `v_faturamento_semanal_consolidado`
- [x] Expõe: `semana_inicio`, `mes_inicio`, `quarter_inicio`, `fiscal_q_derivado`, `vendedor_canonico`, `squad`, `portfolio_fat_canonico`, `gross_revenue`, `net_revenue`, `net_revenue_saneado`, `estado_pagamento_saneado`
- [x] Flags de diagnóstico, `match_source` e campos brutos excluídos

#### B5 · `mart_l10.v_attainment` ✅
- [x] Fonte: `v_revenue_semanal` (B4) + `sales_intelligence.meta`
- [x] Join por `mes_inicio` (FULL OUTER JOIN — meses sem realizado aparecem com realizado=0)
- [x] Colunas: `mes_inicio`, `fiscal_q`, `mes_ano_label`, `meta_gross`, `meta_net`, `gross_realizado`, `net_realizado`, `attainment_gross_pct`, `attainment_net_pct`, `gap_gross`, `gap_net`
- **Resultado:** Jan/26=343.5% (dado em dia), Fev/26=35.1% (parcial), Mar–Dez/26=0% (futuros)

---

### SPRINT C — Scorecard semanal ⏸️ PENDENTE

> **Bloqueio:** Sprint C inteiro aguarda definição dos valores de meta semanal por vendedor (`fct_weekly_goal`). Sem esses números C2, C3 e C4 não têm sentido. Retomar quando as metas semanais estiverem definidas.

#### C1 · `mart_l10.fct_weekly_goal` _(tabela manual)_
- [ ] Schema: `week_start_date`, `vendedor`, `squad`, `measurable`, `goal_value`, `goal_unit`
- [ ] Measurables iniciais: `opps_geradas_new`, `atividades_new`, `booking_gross`, `net_revenue`, `pipeline_incremental`
- [ ] Alimentar via planilha ou INSERT manual

#### C2 · `mart_l10.v_weekly_actual`
- [ ] Union de `v_booking_incremental`, `v_revenue_semanal`, contagem de `atividades`
- [ ] Grain: `week_start_date`, `vendedor_canonico`, `squad`, `measurable`, `actual_value`

#### C3 · `mart_l10.v_scorecard_vendedor`
- [ ] Left join `fct_weekly_goal` + `v_weekly_actual`
- [ ] `attainment_pct = actual_value / goal_value`
- [ ] `status`: `On Track` (≥100%), `At Risk` (70–99%), `Off Track` (<70%)
- [ ] `tendencia`: LAG() para comparar com semana anterior

#### C4 · `mart_l10.v_weekly_issues`
- [ ] Derivar de `v_scorecard_vendedor`
- [ ] Filtrar: `Off Track` ou `actual_value = 0 AND goal_value > 0`
- [ ] `issue_severity`: `HIGH` (off track), `MEDIUM` (at risk), `LOW` (queda >30% vs anterior)

---

### SPRINT D — UI Executiva ⏸️ PENDENTE

> **Status:** Views B1–B5 prontas. D1, D2 e D5 estão tecnicamente desbloqueados. D3 depende de D1+D2. D4 depende de C3 (scorecard). Retomar quando for iniciada a fase de UI.

#### D1 · Endpoint `GET /api/revenue/weekly`
- [ ] Consumir `mart_l10.v_revenue_semanal`
- [ ] Params: `year`, `quarter`, `seller`, `squad`
- [ ] Retorno: `{ gross_revenue, net_revenue, por_semana: [...] }`

#### D2 · Endpoint `GET /api/attainment`
- [ ] Consumir `mart_l10.v_attainment`
- [ ] Retorno: `{ quarter, gross_meta, gross_realizado, attainment_gross_pct, net_meta, net_realizado, attainment_net_pct }`

#### D3 · Chaveamento Booking / Revenue na UI
- [ ] Adicionar toggle: `Booking Gross | Booking Net | Net Revenue | Gross Revenue`
- [ ] Modos `Net Revenue` / `Gross Revenue`: consumir `/api/revenue/weekly` + card de attainment
- [ ] Modo `Booking`: comportamento atual sem mudança
- [ ] Renomear labels: `Gross` → `Booking Gross`, `Net` → `Booking Net`

#### D4 · Tela de Scorecard do Vendedor
- [ ] Criar `paginas/scorecard.html` + `scripts/scorecard.js`
- [ ] Endpoint `GET /api/l10/scorecard` (sobre `v_scorecard_vendedor`)
- [ ] Matriz vendedor × measurable com semáforo + bloco de issues

#### D5 · Filtro global de Squad
- [ ] Adicionar param `squad` nos endpoints existentes
- [ ] Fonte: `mart_l10.v_dim_vendedor`
- [ ] UI: dropdown `Squad` nos filtros globais

---

### Ordem de execução e dependências

```
A1 ─┐
A2 ─┤  (paralelo entre si)
A3 ─┤
A4 ─┘
     │
     ▼
    B1
     │
     ▼
B2 ─┬─ B3 ─┬─ B4
    │       │   │
    └───────┘   ▼
               B5
                │
    C1 ─────── ▼
    (paralelo) C2
                │
               C3 → C4
                │
               D4

B4 → D1 → D3
B5 → D2 → D3
B1 → D5
```

---

### SPRINT E — Toggle 4 modos (Booking Gross · Booking Net · Gross · Net) 🔲 PLANEJADO

> **Objetivo:** expandir o toggle de 2 botões (GROSS / NET) para 4 modos, integrando os dados do ERP (`/api/revenue/weekly`) diretamente no `index.html`. Quando o modo é `GROSS` ou `NET` (ERP), a UI oculta filtros irrelevantes de pipeline e exibe os filtros de faturamento.

---

#### Visão geral dos 4 modos

| Modo | Label | Fonte de dados | API |
|---|---|---|---|
| `booking_gross` | BOOKING GROSS | Salesforce pipeline/booking | `/api/pipeline`, `/api/booking` |
| `booking_net` | BOOKING NET | Salesforce pipeline/booking | idem — troca valores Gross↔Net |
| `gross` | GROSS | ERP faturamento | `/api/revenue/weekly` |
| `net` | NET | ERP faturamento | `/api/revenue/weekly` |

Default mantido: `booking_gross` (compatível com comportamento atual de `gross`).

---

#### E1 · `public/index.html`

**Onde:** bloco `<!-- Chaveamento Gross / Net -->` (~linha 311)

**Mudança:** substituir os 2 botões por 4:
```html
<button id="btn-mode-booking-gross" … onclick="setExecDisplayMode('booking_gross')">BOOKING GROSS</button>
<button id="btn-mode-booking-net"   … onclick="setExecDisplayMode('booking_net')">BOOKING NET</button>
<button id="btn-mode-gross"         … onclick="setExecDisplayMode('gross')">GROSS</button>
<button id="btn-mode-net"           … onclick="setExecDisplayMode('net')">NET</button>
```

**Adicionar** seção de cards ERP logo após os cards de booking existentes, com `id="erp-kpi-section"` e `display:none` por padrão:
- Card: Net Revenue total (`id="erp-net-total"`)
- Card: Net Pago (`id="erp-net-pago"`)
- Card: Net Pendente (`id="erp-net-pend"`)
- Card: Attainment vs Meta (`id="erp-att-pct"`)

**Adicionar** grupo de filtros ERP dentro do `global-filters-panel`, com `id="filters-group-erp"` e `display:none` por padrão:
- Select `id="erp-quarter-filter"` (FY26-Q1…Q4)
- Select `id="erp-portfolio-filter"` (Workspace / GCP / MSP)
- Select `id="erp-squad-filter"` (Mensurável: Contas Nomeadas / GTM / CS / SS)

---

#### E2 · `public/scripts/utilitarios.js`

**Onde:** função `setExecDisplayMode` e `updateExecutiveHighlightToggleUI` (~linha 169)

**Mudanças:**
1. Alterar `window.execDisplayMode = 'gross'` → `window.execDisplayMode = 'booking_gross'`
2. Expandir `updateExecutiveHighlightToggleUI(mode)` para ativar/desativar os 4 botões pelo id
3. Expandir `setExecDisplayMode(mode)` para:
   - Chamar `updateExecutiveHighlightToggleUI(mode)`
   - Chamar `applyExecDisplayMode(mode)` (lógica booking permanece para `booking_gross`/`booking_net`)
   - Chamar `toggleErpSection(mode)` — nova função que mostra/oculta `erp-kpi-section`
   - Chamar `loadErpData()` quando mode é `gross` ou `net`

**Adicionar** `toggleErpSection(mode)`:
```js
function toggleErpSection(mode) {
  const erpSection = document.getElementById('erp-kpi-section');
  const bookingSection = document.getElementById('exec-kpi-section'); // seção atual
  const isErp = mode === 'gross' || mode === 'net';
  if (erpSection)     erpSection.style.display    = isErp ? '' : 'none';
  if (bookingSection) bookingSection.style.display = isErp ? 'none' : '';
}
```

---

#### E3 · `public/scripts/filtros.js`

**Onde:** `updateGlobalFiltersPanelUI` (~linha 340) e `countActiveGlobalFilters` (~linha 236)

**Mudanças:**
1. Em `updateGlobalFiltersPanelUI`: ao detectar modo ERP, ocultar os `filters-group-card` de "Comercial" (Fase, Tipo, Pré-venda, Vendedor) e "Oportunidade", e exibir `filters-group-erp`; reverter quando voltar para booking
2. Em `countActiveGlobalFilters`: incluir contagem dos filtros ERP quando modo for `gross`/`net`
3. Em `updateFiltersSummaryChip`: mostrar `Visão Gross ERP` / `Visão Net ERP` no chip de status conforme modo

---

#### E4 · `public/scripts/api-dados.js`

**Adicionar** função `loadErpData()`:
```js
async function loadErpData() {
  const fiscalQ   = document.getElementById('erp-quarter-filter')?.value || '';
  const portfolio = document.getElementById('erp-portfolio-filter')?.value || '';
  const squad     = document.getElementById('erp-squad-filter')?.value || '';
  const params    = new URLSearchParams();
  if (fiscalQ)   params.set('fiscal_q', fiscalQ);
  if (portfolio) params.set('portfolio', portfolio);
  if (squad)     params.set('squad', squad);

  const [rev, att] = await Promise.all([
    fetch(`/api/revenue/weekly?${params}`).then(r => r.json()),
    fetch(`/api/attainment?${params}`).then(r => r.json()),
  ]);
  renderErpKpiCards(rev, att);
}
```

**Adicionar** `renderErpKpiCards(rev, att)` — preenche os 4 cards ERP com `setTextSafe` / `formatMoney`.

Chamar `loadErpData()` dentro de `reloadDashboard()` quando `window.execDisplayMode === 'gross' || 'net'`.

---

#### Ordem de execução das subtarefas

```
E1 (HTML: botões + seções) → E2 (utilitarios.js: toggle) → E3 (filtros.js: hide/show) → E4 (api-dados.js: load ERP)
```

Cada subtarefa é independente o suficiente para ser entregue e testada individualmente.

---

#### Impacto em arquivos existentes

| Arquivo | Tipo de mudança | Risco |
|---|---|---|
| `public/index.html` | Additive: novos botões + seção ERP + grupo filtros | Baixo — não remove nada existente |
| `public/scripts/utilitarios.js` | Modify: `setExecDisplayMode` expandido + nova `toggleErpSection` | Médio — cobre os 2 modos antigos com os 4 novos |
| `public/scripts/filtros.js` | Modify: `updateGlobalFiltersPanelUI` + `countActiveGlobalFilters` | Médio — lógica de contagem/display |
| `public/scripts/api-dados.js` | Additive: `loadErpData` + `renderErpKpiCards` | Baixo — não toca código booking |

---

### O que **não** está neste backlog (decisão explícita)

| Item | Motivo |
|---|---|
| Renomear `comercial` → `Vendedor` nas tabelas ERP | Quebraria AppScript + 27 refs. Views resolvem. |
| Renomear `portafolio` → `Portfolio` | Idem. |
| `dim_portfolio` como tabela BQ | CASE WHEN com 3 valores é suficiente. |
| `dim_segmento` como tabela BQ | COALESCE cobre 100% — tabela seria over-engineering. |
| `dim_cliente` (normalização razão social) | Join via `oportunidade` já resolve. |
| Modelos ML | Fora do escopo L10. |
| Tela Meta × Faturado × Pago | Entra depois de D2 (attainment pronto). |

