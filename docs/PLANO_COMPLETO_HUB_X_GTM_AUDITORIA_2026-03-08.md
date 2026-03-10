# Plano Completo - Hub x-gtm (Auditoria + Arquitetura + Implantacao)

Data: 2026-03-08
Responsavel pela analise: GitHub Copilot (GPT-5.3-Codex)
Escopo: Definir arquitetura de baixo impacto para evoluir o x-gtm em um Hub com Visao Executiva, Visao Sales, Automation Hub e Painel Admin de acesso, com calculadora baseada em faturamento.

## 1) Resumo Executivo

A aplicacao atual do x-gtm ja opera como SPA unica em `https://x-gtm.web.app/` e usa Cloud Run para `/api/**`.
Nao ha necessidade de separar em multiplos sites agora.

Recomendacao:
- Manter 1 SPA e 1 backend.
- Criar divisao logica por modulos internos (Hub): `executive`, `sales`, `automation`, `admin`.
- Introduzir RBAC + escopo por vendedor no backend.
- Criar painel admin para cadastro/descadastro e trilha de auditoria.
- Fase 1 de comissao baseada somente em faturamento (sem exigir link forte com pipeline/won/lost).

## 2) Evidencias Coletadas (Repositorio + BigQuery)

### 2.1 Estado da infraestrutura

- Projeto ativo GCP: `operaciones-br`
- Conta autenticada no gcloud: `amalia.silva@xertica.com`
- CLI BigQuery funcional

Datasets detectados em BigQuery:
- `sales_intelligence`
- `mart_l10`
- `billing_gcp`

### 2.2 Inventario de objetos relevantes no BQ

`sales_intelligence` contem, entre outros:
- `pipeline`
- `closed_deals_won`
- `closed_deals_lost`
- `faturamento_2025`
- `faturamento_2026`
- `faturamento_semanal`
- `admin_vacations`
- `sales_specialist`

`mart_l10` contem, entre outros:
- `v_faturamento_historico`
- `v_faturamento_semanal_consolidado`
- `v_revenue_semanal`
- `v_attainment`
- `v_booking_incremental`

### 2.3 Volumetria atual (amostra de auditoria)

| Fonte | Linhas | Vendedores Distintos | Oportunidades Distintas |
|---|---:|---:|---:|
| pipeline | 211 | 10 | 211 |
| closed_deals_won | 506 | 19 | 506 |
| closed_deals_lost | 2098 | 22 | 2098 |
| faturamento_2025 | 2209 | 24 (comercial) | 217 |
| faturamento_2026 | 273 | 20 (comercial) | 109 |
| faturamento_semanal | 275 | 9 (comercial) | 109 |

### 2.4 Qualidade de linkage oportunidade x faturamento

Resultados de auditoria:
- Intersecao de vendedores entre dominio de oportunidade e dominio de faturamento: 19 de 24.
- 5 vendedores em oportunidades sem cobertura em faturamento canonico.
- Match exato por nome de oportunidade (`closed_deals_won` x `v_faturamento_historico`):
  - 202 matches em 506 oportunidades won (~39.92%).

Conclusao:
- Confirmada a sua premissa: os dominios nao estao 1:1 para uso confiavel imediato.
- Fase inicial da calculadora deve usar faturamento como base primaria.

### 2.5 Cobertura de IDs tecnicos no faturamento

| Fonte | Linhas | id_oportunidade preenchido | billing_id preenchido |
|---|---:|---:|---:|
| faturamento_2026 | 273 | 90 (32.97%) | 45 (16.48%) |
| faturamento_semanal | 275 | 228 (82.91%) | 45 (16.36%) |

Conclusao:
- `id_oportunidade` melhora bastante em `faturamento_semanal`, mas `billing_id` ainda baixo.
- Linkagem tecnica e possivel no futuro, mas nao robusta para basear fase inicial inteira.

## 3) Diagnostico da Arquitetura Atual (x-gtm)

### 3.1 Frontend

- Aplicacao e SPA unica em `public/index.html`.
- Navegacao por secoes internas via `showSection(...)`.
- Nao existe divisao por paginas/rotas reais hoje (somente seções).

### 3.2 Backend

- FastAPI em `cloud-run/app/simple_api.py` + routers modulares.
- Endpoints de oportunidade (pipeline/won/lost) e faturamento (revenue/attainment) coexistem e estao separados.

### 3.3 Admin atual

- Existe admin para ferias (`/api/admin/vacations`) no router de performance.
- Nao existe admin para usuarios/roles/escopos de vendedor.

### 3.4 Risco de governanca atual

- Listas de emails autorizados em JS (hardcoded) no frontend.
- Isso dificulta cadastro/descadastro com trilha e aumenta risco de divergencia.

## 4) Principios de Implementacao (Baixo Impacto)

1. Nao quebrar `x-gtm.web.app`.
2. Nao reescrever dashboard atual.
3. Adicionar capacidades por modulo incremental.
4. Seguranca no backend primeiro (nao confiar na UI para corte de dados).
5. Comissao fase 1 baseada em faturamento real.

## 5) Arquitetura Alvo (Hub dentro da SPA)

### 5.1 Modulos do Hub

- `Visao Executiva`:
  - Reuso do que ja existe (KPIs, pipeline, attainment, performance).
- `Visao Sales`:
  - Oportunidades do usuario (quando aplicavel).
  - Faturamento do usuario.
  - Calculadora de comissao (base faturamento).
- `Automation Hub`:
  - Catalogo de automacoes e status de execucao.
- `Admin`:
  - Gestao de usuarios, roles, escopos e auditoria.

### 5.2 Roteamento

Manter SPA unica, com rotas internas (hash/query):
- `/#/hub/executive`
- `/#/hub/sales`
- `/#/hub/automation`
- `/#/hub/admin/users`

Sem criar novo dominio e sem split de deploy nesta fase.

## 6) Modelo de Seguranca e Acesso

### 6.1 RBAC proposto

Roles:
- `admin`
- `exec`
- `sales`
- `automation`

Regra:
- `sales` so ve dados do proprio escopo de vendedor.
- `exec/admin` podem ver consolidado.

### 6.2 Escopo por vendedor

Tabela de escopo por usuario e vendedor (N:N), com vigencia e ativo/inativo.

### 6.3 Enforcement

- Backend deve aplicar filtro obrigatorio por escopo.
- Frontend apenas melhora UX (nao e camada de seguranca).

## 7) Modelo de Dados Proposto (Admin + Governanca)

Dataset sugerido: `sales_intelligence` (mesmo dataset para reduzir impacto operacional)

### 7.1 Tabelas novas

1. `admin_users`
- `user_id STRING`
- `email STRING`
- `display_name STRING`
- `is_active BOOL`
- `created_at TIMESTAMP`
- `created_by STRING`
- `updated_at TIMESTAMP`
- `updated_by STRING`

2. `admin_user_roles`
- `user_id STRING`
- `role STRING`  -- admin/exec/sales/automation
- `is_active BOOL`
- `valid_from DATE`
- `valid_to DATE`
- `created_at TIMESTAMP`
- `created_by STRING`

3. `admin_user_seller_scope`
- `scope_id STRING`
- `user_id STRING`
- `seller_canonical STRING`
- `is_active BOOL`
- `valid_from DATE`
- `valid_to DATE`
- `created_at TIMESTAMP`
- `created_by STRING`

4. `admin_audit_log`
- `event_id STRING`
- `event_type STRING`       -- CREATE_USER, DISABLE_USER, ADD_SCOPE, etc.
- `target_type STRING`      -- user, role, scope
- `target_id STRING`
- `actor_email STRING`
- `before_json STRING`
- `after_json STRING`
- `event_at TIMESTAMP`
- `origin STRING`

## 8) Calculadora de Comissao (Fase 1: Faturamento)

### 8.1 Escopo funcional fase 1

- Base de calculo: `net_revenue` realizado no periodo.
- Sem dependencia de linkagem obrigatoria com pipeline/won/lost.
- Regras parametrizadas por tabela (sem hardcode na UI).

### 8.2 Tabela de regras

`commission_rules`
- `rule_id STRING`
- `role_target STRING`               -- sales, cs, ce etc.
- `metric_base STRING`               -- net_revenue_saneado
- `calc_type STRING`                 -- percentage, tiered
- `rate FLOAT64`
- `floor_value FLOAT64`
- `cap_value FLOAT64`
- `valid_from DATE`
- `valid_to DATE`
- `is_active BOOL`
- `version STRING`

### 8.3 Saidas minimas

Por usuario + periodo:
- `faturamento_realizado`
- `comissao_calculada`
- `detalhamento_regras_aplicadas`
- `linhas_base_utilizadas`

## 9) API Alvo (novos endpoints)

Prefixo sugerido: `/api/hub`

### 9.1 Contexto do usuario

`GET /api/hub/me`
- Retorna usuario, roles, escopos e permissoes efetivas.

### 9.2 Sales

`GET /api/hub/sales/opportunities`
- Para role `sales`, aplica escopo automatico no backend.

`GET /api/hub/sales/revenue`
- Retorna faturamento do usuario no periodo.

`GET /api/hub/sales/commission`
- Calcula comissao com base em faturamento + regras ativas.

### 9.3 Admin

`GET /api/hub/admin/users`
`POST /api/hub/admin/users`
`PATCH /api/hub/admin/users/{user_id}`
`POST /api/hub/admin/users/{user_id}/deactivate`

`GET /api/hub/admin/scopes`
`POST /api/hub/admin/scopes`
`DELETE /api/hub/admin/scopes/{scope_id}`

`GET /api/hub/admin/audit`

## 10) Plano de Implantacao por Fases

### Fase 0 - Preparacao e validacoes (3-5 dias)

- Congelar regras de acesso atuais para baseline.
- Criar tabelas admin/rbac/auditoria.
- Criar script de backfill inicial de usuarios permitidos.
- Definir canonicalizacao oficial de vendedor.

Criterio de aceite:
- Tabelas criadas e consultaveis.
- Backfill concluido sem perda de acesso dos admins atuais.

### Fase 1 - Painel Admin de acesso (5-7 dias)

- Implementar CRUD de usuarios e escopos.
- Implementar trilha de auditoria.
- Reaproveitar secao admin existente na SPA.

Criterio de aceite:
- Cadastrar/descadastrar funcionando.
- Toda alteracao gera registro em `admin_audit_log`.

### Fase 2 - Enforcement backend de RBAC (4-6 dias)

- `GET /api/hub/me`.
- Middleware/guard para validar permissao e escopo.
- Aplicar corte por seller nos endpoints Hub Sales.

Criterio de aceite:
- Usuario Sales nao consegue ver dados de outro vendedor, mesmo alterando query params manualmente.

### Fase 3 - Visao Sales + calculadora faturamento (6-10 dias)

- Construir modulo Sales no frontend (SPA).
- Integrar `revenue` e `commission`.
- Exibir detalhamento de calculo.

Criterio de aceite:
- Resultado reproduzivel para mesmo periodo e regras.
- Latencia aceitavel (<2s para agregados principais).

### Fase 4 - Automation Hub MVP (3-5 dias)

- Inventario de automacoes e status (somente leitura inicialmente).
- Logs/ultima execucao/proxima execucao.

Criterio de aceite:
- Operacao visual com status confiavel das automacoes criticas.

### Fase 5 - Hardening e rollout controlado (4-6 dias)

- Testes de seguranca e regressao.
- Feature flag por perfil.
- Rollout por ondas.

Criterio de aceite:
- Sem regressao em Visao Executiva.
- Zero vazamento cross-seller em testes negativos.

## 11) Checklist obrigatorio pre-implantacao

1. Seguranca
- [ ] Validar mecanismo definitivo de identificacao de usuario no backend.
- [ ] Revisar CORS e headers de autenticacao.
- [ ] Garantir que autorizacao nao depende apenas do frontend.

2. Dados
- [ ] Validar canonicalizacao vendedor entre pipeline e faturamento.
- [ ] Definir regra de excecao para vendedores sem faturamento.
- [ ] Validar timezone e janela fiscal usada nos calculos.

3. Produto
- [ ] Definir regras oficiais de comissao da fase 1.
- [ ] Definir comportamento para role multipla (ex: admin+sales).
- [ ] Definir UX de usuario sem escopo ativo.

4. Operacao
- [ ] Observabilidade de API (latencia/erros por endpoint).
- [ ] Plano de rollback por feature flag.
- [ ] Plano de comunicacao para time comercial.

## 12) Riscos e Mitigacoes

Risco: divergencia de nomes de vendedor.
Mitigacao: tabela de mapeamento canonico + validacao automatica.

Risco: tentativa de bypass via query string.
Mitigacao: filtro obrigatorio no backend para role sales.

Risco: regras de comissao mudando com frequencia.
Mitigacao: `commission_rules` versionada por vigencia.

Risco: dados de faturamento incompletos em janelas recentes.
Mitigacao: sinalizar `data_quality_status` no retorno da API.

## 13) Decisoes ja tomadas nesta analise

1. Manter uma unica aplicacao em `x-gtm.web.app` nesta fase.
2. Nao forcar linkagem oportunidade-faturamento para liberar fase 1.
3. Priorizar Painel Admin de acesso antes de abrir Visao Sales para todos.
4. Comissao inicial calculada com base em faturamento realizado.

## 14) Proximos passos recomendados (imediatos)

1. Aprovar o modelo de RBAC e tabelas admin.
2. Aprovar regras de comissao fase 1 (campos, percentuais, vigencia).
3. Implementar Fase 0 e Fase 1 em branch dedicada com feature flag `hub_access_control_v1`.
4. Rodar bateria de testes de seguranca antes de liberar Visao Sales.

---

## Anexo A - Consultas de auditoria executadas no BQ

As seguintes verificacoes foram realizadas diretamente no BigQuery:
- Listagem de datasets e tabelas de `sales_intelligence` e `mart_l10`.
- Inspecao de schema em `INFORMATION_SCHEMA.COLUMNS` para campos-chave.
- Volumetria por tabela relevante.
- Intersecao de vendedores entre oportunidades e faturamento.
- Taxa de match por nome de oportunidade.
- Cobertura de `id_oportunidade` e `billing_id` em faturamento.

Nao houve alteracao de dados em BigQuery nesta auditoria (somente leitura).
