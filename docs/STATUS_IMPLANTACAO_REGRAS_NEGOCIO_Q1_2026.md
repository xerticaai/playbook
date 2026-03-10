# Status de Implantacao das Regras de Negocio (Q1 2026)

Data da avaliacao: 2026-03-08  
Fonte de referencia: `docs/regrasdenegocio.md`

## Resumo Executivo

- Escopo auditado: `SheetCode.gs`, `ShareCode.gs`, demais arquivos em `appscript/`, frontend em `public/scripts/` e backend em `cloud-run/app/`.
- Resultado geral:
  - `Implantado`: regras de estagnacao 90/30, excecao de `GWS Renovacao` com alerta D-90 para CS, classificacao Base/New (por lista foco), motor de risco/governanca, painel de receita com net total e incremental.
  - `Parcial`: parte da logica GTM (classificacao ampla por orgao/vertical), booking por categorias de produto, expurgo de recorrencia no incremental.
  - `Nao implantado`: matematica de comissao (pool, acelerador, rateio), regra dos 120 dias para suspensao, anti zero-booking quinta 17h, integracao N8N de hand-off, auditoria de atestados.

---

## 1) Matriz de Aderencia por Regra

| Regra (`regrasdenegocio.md`) | Status | Onde existe | Evidencia tecnica | Observacao/GAP |
|---|---|---|---|---|
| 1.1 Perfil GTM (aprovado/bloqueado) | Parcial | `appscript/CorrigirFiscalQ.gs`, `appscript/SheetCode.gs` | `classificarContaPorRegrasGTM_` e `classificarContaFoco2026_`; labels GTM em fluxo de analise | Nao foi identificada implementacao literal da regra por `Industria` + excecao `GWS < 500` + bloqueio visual condicional a Contas Nomeadas.
| 1.2 Contas Nomeadas vs Novas | Implantado (classificacao) / Parcial (drilldown cruzado) | `appscript/CorrigirFiscalQ.gs`, `appscript/SheetCode.gs`, `appscript/BigQuerySync.gs` | `classificarContaFoco2026_` retorna `BASE INSTALADA`/`NOVO CLIENTE`; tabela `Contas_Nomeadas` sincronizada para BQ | Classificacao existe; drilldown explicitamente cruzado "Tipo de Conta x Status Cliente" depende da tela/consulta final.
| 2.1 Atividades: contar so `REUNIAO` | Parcial | `appscript/ShareCode.gs`, `appscript/SheetCode.gs` | `processActivityStatsSmart` usa pesos por canal (`meeting/reuniao=1`, `call=0.8`, `email=0.4`) | Regra de contar somente reuniao nao esta estritamente aplicada.
| 2.1 Cobertura 15 dias em contas nomeadas | Nao implantado (nao evidenciado) | - | - | Nao foi encontrada rotina consolidando `% contas nomeadas com >=1 reuniao nos ultimos 15 dias`.
| 2.2 Oportunidades geradas semana anterior + close Q+5/Q+6 | Nao implantado (nao evidenciado) | - | - | Nao encontrada regra deterministica com esse corte por papel BDM/CS e janela Q+5/Q+6.
| 2.3 Estagnadas 90/30 | Implantado | `public/scripts/metricas-executivas.js`, `appscript/ShareCode.gs`, `appscript/SheetCode.gs` | `buildStagnantCard` aplica `cycle >= 90 && idle >= 30`; `checkInactivityGate` reforca bloqueios/riscos | Regra principal implementada em camada executiva + governanca.
| 2.3 Excecao GWS renovacao + alerta 90 dias antes para CS | Implantado | `appscript/SheetCode.gs`, `appscript/ShareCode.gs` | `isGwsRenewalOpportunity_`, `maybeNotifyGwsRenewal90d_`, aplicacao de `excludeStagnationMetric` nos fluxos OPEN | Regra ativa: oportunidades `GWS Renovacao` sao excluidas da estagnacao e alerta D-90 e enviado com deduplicacao por oportunidade+data.
| 2.4 Pipeline aberto: Stage >= Proposta e close no quarter atual | Parcial | `cloud-run/app/simple_api.py` | Endpoints filtram quarter/mes e excluem fechados em varios cenarios | Nao foi encontrada regra unica e explicita `Stage >= Proposta` como criterio universal.
| 2.4 Booking incremental por 3 subcategorias | Parcial | `appscript/ShareCode.gs`, `cloud-run/app/simple_api.py` | `deriveCategoriaFDM_` categoriza produtos (Plataforma/Services/FDM/FDM+GIS/CoE); API calcula incremental | Subcategorias existem, mas nomenclatura/segmentacao exata "Plataforma/Servicos/Solucoes" nao esta 1:1 em todos os pontos.
| 2.4 Regra "Oportunidade de Faturacao" (ata vs funil real) | Nao implantado (nao evidenciado) | - | - | Nao encontrada validacao por checkbox para excluir guarda-chuva e aceitar apenas filhas faturaveis.
| 3.1 Painel L10: Net Faturado Total e Incremental | Implantado | `cloud-run/app/simple_api.py` | `/api/revenue/quarter-summary` retorna total e incremental por vendedor + agregados | Implementado no backend com drilldown especifico.
| 3.1 Expurgo: recorrencia | Implantado | `cloud-run/app/simple_api.py` | `NOT REGEXP_CONTAINS(... renov|renew|recorr|parcela|semad|mensal|anual|token|transfer)` | Expurgo de recorrencia esta presente.
| 3.1 Expurgo: refaturamento, rebates, deployment vouchers | Parcial / Nao evidenciado integralmente | `cloud-run/app/simple_api.py` | Nao foi localizada regra explicita para todos os itens citados | Pode haver limpeza em views BQ; no codigo auditado nao aparece cobertura completa desses 3 filtros.
| 3.2 Acelerador de meta e pool de comissao | Nao implantado | - | - | Nao identificados calculos de taxa 0/5/10 e formula do pool.
| 3.3 Rateio 70/30, SS elegivel >50k, gatilho gerente de conta, CS como BDM | Nao implantado | - | - | Nao identificadas regras de elegibilidade/rateio de comissao no appscript/frontend/backend.
| 3.4 Cash collection + regra 120 dias (suspensao) | Nao implantado | - | - | Nao encontrada flag `Comissao_Suspensa` por atraso >120 dias.
| 4. Anti zero-booking quinta 17h | Nao implantado | - | - | Nao foi encontrada automacao com esse agendamento e criterio.
| 4. Automacao N8N closed-won (ERP + atestado) | Nao implantado | - | - | Nao encontrada integracao operacional desse hand-off.
| 4. Auditoria de atestados (mensal/semanal) | Nao implantado | - | - | Nao encontrada rotina de reconciliacao contrato faturado x documento "Atestado".

---

## 2) O que ja esta implantado por arquivo

### 2.1 `SheetCode.gs`

- Orquestra o motor de analise OPEN/WON/LOST com governanca e saidas analiticas.
- Aplica classificacao de conta usando `classificarContaFoco2026_` para rotular Base/New no fluxo de decisao.
- Integra validacoes de inatividade, consistencia temporal, qualidade de engajamento e categorias de forecast.
- Usa e propaga sinais calculados para colunas analiticas (confianca, labels, acao sugerida, ciclo, dias funil, etc.).

Campos/calculos evidenciados no fluxo:
- `Confianca` com nudges deterministicos por tipo de deal x inatividade.
- `Forecast_IA` por faixa de confianca.
- `Dias Funil`, `Ciclo_dias`, `Idle_Dias`, `Atividades (peso)`, `Mix Atividades`.
- Flags de risco/governanca (ex.: estagnacao, incoerencia, gate de inatividade).

### 2.2 `ShareCode.gs`

- Contem o nucleo reutilizavel das regras deterministicas e prompts de auditoria.
- `processActivityStatsSmart` calcula atividade total + ponderada por canal (meeting/call/email), incluindo `lastDate` e resumo por tipo.
- `checkInactivityGate` implementa gates criticos e avisos por inatividade, fase e tempo de funil.
- `computeDealAdjustments_` aplica matriz de confianca por tipo de oportunidade e tier de idle.
- `deriveCategoriaFDM_` classifica produtos para familias de booking (Plataforma, Services, FDM, FDM+GIS, CoE, etc.).

### 2.3 Demais arquivos App Script

- `CorrigirFiscalQ.gs`:
  - `classificarContaFoco2026_` (Base Instalada/Novo Cliente por lista de contas foco).
  - `classificarContaPorRegrasGTM_` (classificacao por heuristicas de orgao/segmento, com abrangencia ampla de governo e outros).
- `BigQuerySync.gs`:
  - Sincroniza dados de analise para BigQuery.
  - Inclui agora a tabela `Contas_Nomeadas` com schema e carga dedicados.
- `SchemaDiagnostics.gs`:
  - Diagnostico de schema atualizado para incluir `Contas_Nomeadas`.
- `MenuOpen.gs`:
  - Trigger de sync BigQuery configurado para `everyHours(1)` (instalacao inicial e menu de configuracao).
- `StagnantOpportunityAlert.gs`:
  - Endpoint `doPost` para envio de alerta.
  - Regras de destinatarios, cooldown de 24h, secret de seguranca e template de email.
- `FaturamentoSync.gs`:
  - Rotina de migracao/sync de abas de faturamento (nao implementa matematica de comissao).

---

## 3) Codigo geral do app (frontend + backend)

### 3.1 Frontend (`public/scripts/metricas-executivas.js`)

- Card de oportunidades estagnadas com regra 90/30 (`cycle >= 90` e `idle >= 30`).
- Drilldown de estagnadas, ordenacao por idle e acao de disparo de alerta por item.
- Controle de cooldown no cliente + logs locais de tentativas/envios.

### 3.2 Backend (`cloud-run/app/simple_api.py`)

- Endpoint `/api/stagnant-alert/send` faz proxy seguro para webhook Apps Script e registra logs de envio.
- Endpoints de receita (`/api/revenue/quarter-summary` e drilldown) calculam:
  - Net total.
  - Net incremental (com base em closed-won, primeira cobranca e historico cliente+produto).
  - Expurgo por padroes de recorrencia (regex).
- Endpoints executivos agregam metricas de pipeline, won/lost, metas e attainment.

---

## 4) Gaps prioritarios para fechar aderencia ao documento de negocio

1. Implementar regra estrita de atividade "somente REUNIAO" + KPI de cobertura 15 dias para contas nomeadas.
2. Implementar regra de oportunidades geradas na semana anterior com validacao de close date (BDM Q+5, CS Q+6).
3. Implementar regra de booking por checkbox `Oportunidade de Faturacao` (filhas faturaveis).
4. Implementar modulo de comissoes:
   - acelerador de meta,
   - pool,
   - retencao 30% empresa,
   - rateio BDM/SS,
   - condicoes de CS e NRR.
5. Implementar regra de suspensao de comissao por 120 dias de atraso no pagamento.
6. Implementar automacoes de operacao:
   - anti zero-booking (quinta 17h),
   - hand-off N8N closed-won,
   - auditoria de atestados.

---

## 5) Evidencias tecnicas objetivas (referencias rapidas)

- `docs/regrasdenegocio.md`
- `appscript/SheetCode.gs`
- `appscript/ShareCode.gs`
- `appscript/CorrigirFiscalQ.gs`
- `appscript/StagnantOpportunityAlert.gs`
- `appscript/BigQuerySync.gs`
- `appscript/SchemaDiagnostics.gs`
- `appscript/MenuOpen.gs`
- `appscript/FaturamentoSync.gs`
- `public/scripts/metricas-executivas.js`
- `cloud-run/app/simple_api.py`
