# Plano de Coerencia e Eficiencia do Hub (UX + Calculos + Automation + GCP)

Data: 2026-03-08
Escopo: consolidar padrao para evoluir o `x-gtm.web.app` com minimo impacto, mantendo SPA unica e padronizando Visao Executiva, Visao Sales e Automation Hub.

---

## 1. Resumo Executivo

Para garantir maxima coerencia e eficiencia, o melhor caminho e:

1. Manter a arquitetura atual de URL unica (`x-gtm.web.app`) e SPA por secoes.
2. Usar a Visao Executiva atual como padrao visual e funcional para novos modulos.
3. Unificar calculos em uma camada unica (fonte de verdade no backend) para evitar divergencias entre telas.
4. Usar BigQuery para transformacoes e agregacoes, e Apps Script para entrega operacional (email/workflow), com Cloud Run como camada de seguranca e observabilidade.
5. Habilitar e padronizar configuracoes GCP/IAM/Secrets para operacao segura e auditavel.

---

## 2. O Que Foi Verificado (Estrutura e UX)

### 2.1 Estrutura atual da SPA

Evidencias:
- `public/index.html` contem a secao `#executive` como experiencia principal, com tabs e subviews.
- Navegacao e troca de secoes ocorre por `showSection(...)` em `public/scripts/interface.js`.
- Troca de sub-aba da executiva ocorre por `switchExecTab(...)` em `public/scripts/abas.js`.

Padrao observado:
- 1 URL unica.
- Navegacao por secao ativa/inativa.
- Subnavegacao por tabs dentro da secao executiva.
- Mesma linguagem visual entre KPI cards, tabelas e drilldowns.

### 2.2 Padrao de UX da Visao Executiva (template para os proximos hubs)

A estrutura atual da executiva, em `public/index.html`, ja define um bom design system funcional:

1. Barra de tabs da experiencia (`Resumo Executivo`, `Mapa de Palavras`, `Principais Oportunidades`, `Estagnadas`, `Analise IA`, `Guia`).
2. Toggle de visualizacao (`Metricas` x `Analise Grafica`).
3. Blocos de KPI por dominio (pipeline, ganhos, perdas, sellers, sales specialist, revenue ERP).
4. Cards narrativos (destaques, MVP, ponto de atencao).
5. Drilldown tabular com detalhamento operacional.
6. Estados de loading/empty e texto explicativo de metricas.

Esse padrao deve ser replicado para `Visao Sales` e `Automation Hub` para preservar continuidade cognitiva.

### 2.3 Paginas em `public/paginas/`

Arquivos encontrados:
- `public/paginas/performance.html`
- `public/paginas/revenue.html`
- `public/paginas/aprendizados.html`

Status:
- Nao foram encontrados links ativos para essas paginas no fluxo atual da SPA.
- Funcionam como referencia de estilo/legacy, mas o fluxo oficial segue concentrado no `index.html`.

Recomendacao:
- Evitar criar novas paginas isoladas.
- Implementar os novos hubs dentro da mesma SPA, reaproveitando componentes e padrao da executiva.

---

## 3. O Que Foi Verificado (Calculos e Fonte de Verdade)

### 3.1 Onde os calculos estao hoje

Foi identificado calculo/atualizacao de KPIs em multiplos arquivos:
- `public/scripts/metricas-executivas.js`
- `public/scripts/filtros.js`
- `public/scripts/dashboard.js`
- `public/scripts/interface.js`
- `public/scripts/api-dados.js`

Exemplos:
- Forecast ponderado e cards de pipeline/above50 atualizados em mais de um ponto.
- Conversao e taxa de perda com logicas locais e fallback.
- KPI de receita/attainment com enriquecimento em `api-dados.js`.

### 3.2 Risco atual

Duplicacao de regra de calculo no frontend aumenta risco de:
- valores diferentes em abas/filtros;
- manutencao lenta;
- regressao ao expandir para Sales e Automation.

### 3.3 Padrao recomendado (obrigatorio para os novos hubs)

1. Backend calcula e devolve metricas finais.
2. Frontend apenas renderiza.
3. Filtros enviados para API como contrato unico.
4. Sem logica de negocio duplicada em arquivos distintos do front.

Contrato sugerido:
- `GET /api/hub/executive/summary`
- `GET /api/hub/sales/summary`
- `GET /api/hub/automation/summary`

Cada endpoint devolve:
- `kpis`
- `charts`
- `tables`
- `insights`
- `meta` (periodo, filtros aplicados, ultima atualizacao)

---

## 4. Automation Hub (Apps Script + BigQuery) - Melhor Caminho

Voce pediu foco em automacoes gerais da companhia com Apps Script para codigo e envio de emails com base em BigQuery. O melhor desenho tecnico e:

### 4.1 Principio de arquitetura

1. BigQuery faz transformacoes e selecao de publico (quem recebe o que e por qual regra).
2. Cloud Run faz proxy seguro, auditoria e rate control.
3. Apps Script faz montagem final de mensagem e envio (GmailApp), com templates e regras de destinatario.

### 4.2 Evidencia de base pronta

Ja existe este padrao funcionando para alertas de estagnacao:
- Endpoint proxy no backend: `POST /api/stagnant-alert/send` em `cloud-run/app/simple_api.py`.
- Logs consultaveis: `GET /api/stagnant-alert/logs`.
- Script de envio com segredo, cooldown e roteamento: `appscript/StagnantOpportunityAlert.gs`.

### 4.3 Padrao alvo para Automation Hub

Criar framework de automacoes com 4 blocos:

1. Catalogo de automacoes
- tabela: `sales_intelligence.automation_jobs`
- campos: `job_id`, `nome`, `descricao`, `status`, `canal`, `cron`, `owner`, `ativo`

2. Regras e publico
- views no `mart_l10` para cada automacao (`v_auto_*`).
- somente SQL/transformacao aqui, sem envio.

3. Execucao
- endpoint unico Cloud Run: `/api/automation/dispatch/{job_id}`.
- valida permissao, busca payload da view, chama Apps Script webhook.

4. Auditoria
- tabela: `sales_intelligence.automation_dispatch_log`.
- campos: `job_id`, `run_id`, `destinatario`, `status`, `erro`, `timestamp`.

### 4.4 Diretriz de eficiencia

- Transformar dados no BigQuery, nao no Apps Script.
- Apps Script so faz formatacao e envio.
- Reprocessamento idempotente via `run_id`.
- Cooldown por chave de negocio (como ja existe no alerta de estagnacao).

---

## 5. GCP - Habilitacoes e Configuracoes

### 5.1 APIs confirmadas como habilitadas no projeto `operaciones-br`

Validadas:
- `run.googleapis.com`
- `bigquery.googleapis.com`
- `cloudbuild.googleapis.com`
- `artifactregistry.googleapis.com`
- `secretmanager.googleapis.com`
- `cloudscheduler.googleapis.com`
- `pubsub.googleapis.com`
- `iam.googleapis.com`
- `iamcredentials.googleapis.com`
- `logging.googleapis.com`
- `monitoring.googleapis.com`
- `script.googleapis.com`
- `drive.googleapis.com`

### 5.2 Habilitacoes/configuracoes recomendadas para fase de expansao

1. Secret Manager para todos os webhooks/secrets de automacao:
- `STAGNANT_ALERT_WEBHOOK_URL`
- `STAGNANT_ALERT_SECRET`
- futuros `AUTOMATION_*_WEBHOOK_URL`

2. Service Account dedicada do Cloud Run (nao usar conta ampla por padrao):
- leitura BigQuery em datasets necessarios;
- acesso a secrets especificos;
- logs/metricas.

3. Cloud Scheduler + Pub/Sub para execucao agendada centralizada:
- Scheduler aciona topico por job;
- Cloud Run consome e executa.

4. Alertas de observabilidade:
- erro > X% por job;
- latencia acima de threshold;
- falha de envio de email.

5. Tabelas de governanca:
- `admin_users`
- `admin_user_roles`
- `admin_user_seller_scope`
- `admin_audit_log`

---

## 6. Blueprint UX para os Novos Modulos

### 6.1 Visao Sales

Objetivo:
- mostrar apenas dados do vendedor logado (ou escopo permitido), com mesma linguagem da executiva.

Layout recomendado:
1. Header + badges de filtro ativo.
2. KPI row (pipeline, meta, fechamentos, conversao, ciclo).
3. Grafico principal + tabela de oportunidades prioritarias.
4. Bloco de recomendacoes (acoes da semana).

Regras:
- backend sempre aplica seller scope.
- sem fallback de seguranca no frontend.

### 6.2 Automation Hub

Objetivo:
- cockpit de automacoes corporativas.

Layout recomendado:
1. Catalogo de jobs (cards com status: ativo/pausado/falha).
2. Historico de execucoes (ultima rodada, sucesso, erros).
3. Controle por job (executar agora, pausar, editar destinatarios).
4. Painel de impacto (emails enviados, taxa de abertura futura, cobertura).

Padrao visual:
- reutilizar tokens, cards, tabelas e tratamento de estado da executiva.

---

## 7. Plano de Implementacao (Ordem Recomendada)

### Fase 1 - Coerencia de calculo e contrato

1. Criar endpoints `hub/*/summary` no backend.
2. Migrar frontend para renderer-only nos KPIs principais.
3. Congelar calculos duplicados no frontend (depreciar gradualmente).

### Fase 2 - Visao Sales com isolamento

1. Implementar escopo por vendedor no backend.
2. Criar secao `sales` em SPA usando template executivo.
3. Validar sem regressao na Visao Executiva.

### Fase 3 - Automation Hub MVP

1. Generalizar padrao de `stagnant-alert` para jobs genericos.
2. Criar catalogo e log de automacoes no BigQuery.
3. Tela de operacao e monitoramento no hub.

### Fase 4 - Operacao e governanca

1. Dashboard de saude operacional (erros/latencia/envio).
2. Alerting e runbook.
3. Hardening IAM + rotacao de secrets.

---

## 8. Decisoes Praticas Para Seguir Agora

1. Continuar em SPA unica (`index.html`) sem split de dominio/pagina.
2. Usar Visao Executiva como blueprint visual para novos hubs.
3. Tratar BigQuery como camada oficial de transformacao.
4. Tratar Apps Script como camada oficial de envio e automacao office/email.
5. Padronizar Cloud Run como gateway de seguranca, auditoria e controle.

---

## 9. Referencias de Codigo Auditadas

- `public/index.html`
- `public/scripts/interface.js`
- `public/scripts/abas.js`
- `public/scripts/metricas-executivas.js`
- `public/scripts/filtros.js`
- `public/scripts/dashboard.js`
- `public/scripts/api-dados.js`
- `public/scripts/resumo-quarter.js`
- `public/scripts/utilitarios.js`
- `public/paginas/performance.html`
- `public/paginas/revenue.html`
- `public/paginas/aprendizados.html`
- `cloud-run/app/simple_api.py`
- `cloud-run/deploy.sh`
- `.env.example`
- `appscript/BigQuerySync.gs`
- `appscript/StagnantOpportunityAlert.gs`
