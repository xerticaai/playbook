# Consolidado: Hub x-sales — Plano de Execução Completo

**Criado:** 2026-03-09  
**Projeto GCP:** `operaciones-br`  
**Sites Firebase:** `x-gtm.web.app` (intocado) | `x-sales.web.app` (novo)  
**Fontes originais:** PLANO_HUB_UX_AUTOMATION_GCP_2026-03-08.md · PLANO_COMPLETO_HUB_X_GTM_AUDITORIA_2026-03-08.md · PLANO_CORRECOES_GTM_SS_UI_2026-03-09.md

---

## 1. Decisões de Arquitetura

| Decisão | Escolha |
|---|---|
| Estrutura do portal | Site separado `x-sales.web.app` (multisite Firebase) |
| Modelo de página | Hub de cards de redirecionamento — nenhuma dado exposto no hub |
| Design system | Brand Kit V.2 Xertica: Tailwind CDN + Phosphor Icons + Poppins/Roboto |
| Cores oficiais | xCyan `#00BEFF` · xGreen `#C0FF7D` · xPink `#FF89FF` · xDark `#03070d` |
| Backend | Cloud Run `sales-intelligence-api` em `us-central1` (prefixo `/api/`) |
| Dados | BigQuery `sales_intelligence` + `mart_l10` |
| Cálculos | Backend calcula e devolve métricas finais — frontend apenas renderiza |
| Automações | BigQuery (transformação) → Cloud Run (proxy/auditoria) → Apps Script (envio) |
| Apps Script | Mantido como camada oficial de integração Office/email |

---

## 2. Estado Atual do Hub (Fase 1 — CONCLUÍDA)

### 2.1 Infraestrutura

- Firebase Hosting multisite configurado em `firebase.json` + `.firebaserc`
- `public-x-sales/` isolado de `public/` (x-gtm intocado)
- Deploy funcionando: `firebase deploy --only hosting:xsales`

### 2.2 Páginas implantadas

| Arquivo | Rota | Acesso | Status |
|---|---|---|---|
| `public-x-sales/index.html` | `/` | Público | ✅ Live |
| `public-x-sales/executivo.html` | `/executivo` | Admin | ✅ Live |
| `public-x-sales/vendedores.html` | `/vendedores` | Equipe comercial | ✅ Live |
| `public-x-sales/automacao.html` | `/automacao` | Operações | ✅ Live |
| `public-x-sales/assets/hub.css` | — | Shared CSS | ✅ |
| `public-x-sales/assets/hub.js` | — | Shared JS | ✅ |

### 2.3 Funcionalidades do hub (`index.html`)

- Navbar glassmorphism sticky com logo Xertica + "Operations Portal"
- Título gradiente animado "Selecione o Módulo de Visão" + pílula "Acesso Seguro" pulsando
- 3 cards 3D parallax + efeito flashlight dinâmico por cursor:
  - **Visão Executiva** (cyan) → `/executivo`
  - **Visão Sales** (green) → `/vendedores`
  - **Automation Hub** (pink) → `/automacao`
- Modal "Verificação Segura" com laser scanner animado — navega após 2.2s
- Grid animado + noise overlay + floating orbs (fiel ao `mockhub.html`)
- Dimensionado para notebook 14" @ 100% de zoom

### 2.4 Funcionalidades das páginas internas

**`executivo.html`** — badge "Somente Administradores", KPI row (Pipeline Total, Forecast Ponderado, Win Rate, Negócios em Risco), tabela Top Oportunidades, tabela Performance por Segmento, tabela Negócios Estagnados — dados placeholder "Conectando à API…"

**`vendedores.html`** — KPI row (Carteira, Meta MTD, Realizado MTD, Atingimento), **calculadora de comissão funcional em JS** (atingimento + comissão base + acelerador — auto-calcula no input), tabela Carteira, tabela Plano de Ação

**`automacao.html`** — KPI row (Jobs Ativos, Execuções Hoje, Taxa de Sucesso, Falhas Pendentes), tabela Jobs Cadastrados (3 jobs pré-preenchidos: alerta estagnação, sync BQ↔Sheets, auditoria), tabela Log de Execuções, tabela Alertas Pendentes, tabela Integrações Configuradas

---

## 3. Fase 2 — Autenticação + Dados Reais

**Objetivo:** Substituir os placeholders por dados reais e proteger os módulos com autenticação.

### 3.1 Autenticação (Firebase Auth Google)

- Adicionar Firebase Auth com provider Google antes de qualquer página interna
- Redirect automático para login se não autenticado
- `index.html` mantém o hub público; páginas internas protegidas
- **RBAC** (baseado nas tabelas BigQuery abaixo):

| Role | Acesso |
|---|---|
| `admin` | Todos os módulos |
| `exec` | `/executivo` + `/automacao` |
| `sales` | `/vendedores` apenas (dados do próprio escopo) |
| `automation` | `/automacao` apenas |

### 3.2 Tabelas de governança a criar em BigQuery (`sales_intelligence`)

```sql
-- Usuários
admin_users (user_id, email, display_name, is_active, created_at, created_by, updated_at, updated_by)

-- Roles
admin_user_roles (user_id, role, is_active, valid_from, valid_to, created_at, created_by)

-- Escopo por vendedor (N:N)
admin_user_seller_scope (scope_id, user_id, seller_canonical, is_active, valid_from, valid_to, created_at, created_by)

-- Auditoria
admin_audit_log (event_id, event_type, target_type, target_id, actor_email, before_json, after_json, event_at, origin)

-- Regras de comissão (versionadas)
commission_rules (rule_id, role_target, metric_base, calc_type, rate, floor_value, cap_value, valid_from, valid_to, is_active, version)

-- Automações
automation_jobs (job_id, nome, descricao, status, canal, cron, owner, ativo)
automation_dispatch_log (job_id, run_id, destinatario, status, erro, timestamp)
```

### 3.3 Novos endpoints Cloud Run a implementar

```
GET  /api/hub/me                     → usuário, roles, escopos, permissões efetivas
GET  /api/hub/executive/summary      → kpis + charts + tables + insights + meta
GET  /api/hub/sales/summary          → idem, filtrado pelo escopo do vendedor
GET  /api/hub/sales/opportunities    → oportunidades do usuário
GET  /api/hub/sales/revenue          → faturamento do período
GET  /api/hub/sales/commission       → comissão calculada (base faturamento + regras ativas)
GET  /api/hub/automation/summary     → status dos jobs + log recente
GET  /api/hub/admin/users            → CRUD usuários
POST /api/hub/admin/users
PATCH /api/hub/admin/users/{user_id}
POST  /api/hub/admin/users/{user_id}/deactivate
GET  /api/hub/admin/scopes
POST /api/hub/admin/scopes
DELETE /api/hub/admin/scopes/{scope_id}
GET  /api/hub/admin/audit
```

### 3.4 Integração nas páginas internas

| Página | Endpoint principal | Dados a substituir |
|---|---|---|
| `executivo.html` | `/api/hub/executive/summary` | KPI row + 3 tabelas |
| `vendedores.html` | `/api/hub/sales/summary` + `/api/hub/sales/commission` | KPI row + calculadora + carteira |
| `automacao.html` | `/api/hub/automation/summary` | KPI row + tabela de jobs + log |

---

## 4. Fase 3 — Automation Hub Completo

- Generalizar padrão de `stagnant-alert` para jobs genéricos
- Endpoint único: `/api/automation/dispatch/{job_id}` — valida permissão, busca payload da view, chama Apps Script webhook
- Views BQ por automação: `mart_l10.v_auto_*` (apenas SQL/transformação)
- Cooldown idempotente via `run_id`
- Cloud Scheduler + Pub/Sub para execução agendada centralizada

---

## 5. Fase 4 — Hardening e Governança

- Observabilidade: erro > X% por job, latência acima de threshold, falha de envio
- Secret Manager para todos os webhooks: `STAGNANT_ALERT_WEBHOOK_URL`, `STAGNANT_ALERT_SECRET`, futuros `AUTOMATION_*_WEBHOOK_URL`
- Service Account dedicada para Cloud Run (escopo mínimo: leitura BQ + secrets específicos)
- Rotação periódica de secrets
- Feature flag por perfil + rollout por ondas

---

## 6. Bugs Identificados em x-gtm (pendentes de correção)

| # | Arquivo | Linha | Descrição |
|---|---|---|---|
| 1 | `public/scripts/metricas-executivas.js` | 57–58, 71–72 | KPI IDs no JS não batem com IDs dos elementos HTML |
| 2 | Múltiplos (`interface.js`, `metricas-executivas.js`, `filtros.js` ×2) | — | Cálculo de KPIs duplicado em 4 arquivos — risco de divergência |
| 3 | `public/scripts/interface.js` L126 + `performance-integration.js` L225 | — | Função `showSection()` declarada 2× |
| 4 | `cloud-run/README.md` | — | Documenta endpoints `/api/v1/*` que não existem (são `/api/*`) |
| 5 | `cloud-run/app/simple_api.py` L100–101 + Apps Script | — | Regras de negócio hardcoded — devem migrar para tabelas BQ |

---

## 7. Correções GTM + SS + UI Já Aplicadas (2026-03-09)

Arquivo `appscript/ShareCode.gs`:
- `getContaNomeadaMatchForGtm_` — matching aprimorado para variações de nome jurídico (LTDA, S/A, EIRELI, ME, EPP, pontuação)
- `evaluateSalesSpecialistGovernance` — critério de elegibilidade expandido para sinais de produto/família/serviços (corrige falso negativo de "somente plataforma")

Arquivo `public/scripts/agenda-semanal-weekly.js`:
- `renderBusinessContextTags` — removida tag `Status GTM`, mantidas Perfil Cliente / Status Cliente / SS Envolvido
- `extractDealRiskTags` — dedupe por chave normalizada, humanização de labels (sem underscores)
- Formatter Title Case aplicado em nomes BDM/CS/SS em todos os pontos de exibição

---

## 8. Checklist de Aceite — Fase 2

### Segurança
- [ ] Mecanismo de identificação de usuário validado no backend
- [ ] CORS e headers de autenticação revisados
- [ ] Autorização não depende do frontend
- [ ] Usuário Sales não consegue ver dados de outro vendedor

### Dados
- [ ] Canonicalização de vendedor entre pipeline e faturamento validada
- [ ] Regra de exceção para vendedores sem faturamento definida
- [ ] Timezone e janela fiscal confirmados

### Produto
- [ ] Regras oficiais de comissão fase 1 aprovadas (campos, percentuais, vigência)
- [ ] Comportamento para role múltipla definido (ex.: admin+sales)
- [ ] UX de usuário sem escopo ativo definida

### Operação
- [ ] Observabilidade de API configurada (latência/erros por endpoint)
- [ ] Plano de rollback por feature flag definido
- [ ] Comunicação para time comercial planejada

---

## 9. Próximos Passos Imediatos

1. **Aprovar RBAC e tabelas admin** — confirmar campos e roles com o time
2. **Aprovar regras de comissão fase 1** — percentuais, acelerador, vigência
3. **Implementar Firebase Auth** no x-sales (Google Login)
4. **Criar tabelas BQ** de governança (`admin_users`, `admin_user_roles`, `admin_user_seller_scope`, `admin_audit_log`)
5. **Implementar `/api/hub/me`** + middleware de RBAC no Cloud Run
6. **Conectar `executivo.html`** a `/api/hub/executive/summary`
7. **Conectar `vendedores.html`** a `/api/hub/sales/summary` + `/api/hub/sales/commission`
8. **Conectar `automacao.html`** a `/api/hub/automation/summary`
9. **Corrigir os 5 bugs** do x-gtm em branch dedicada

---

## 10. Referências de Código

| Arquivo | Papel |
|---|---|
| `firebase.json` | Multisite config (xgtm + xsales) |
| `.firebaserc` | Targets de deploy |
| `public-x-sales/index.html` | Hub portal — 515 linhas, design mockhub V.2 |
| `public-x-sales/executivo.html` | Módulo executivo (placeholder) |
| `public-x-sales/vendedores.html` | Módulo vendedores + calculadora JS |
| `public-x-sales/automacao.html` | Módulo automação |
| `public-x-sales/assets/hub.css` | CSS compartilhado das páginas internas |
| `public-x-sales/assets/hub.js` | JS mínimo (ano no footer) |
| `cloud-run/app/simple_api.py` | FastAPI — endpoints existentes |
| `appscript/StagnantOpportunityAlert.gs` | Referência de padrão de automação |
| `appscript/ShareCode.gs` | Correções GTM/SS aplicadas |
| `public/scripts/agenda-semanal-weekly.js` | Correções de tags/nomes aplicadas |
| `docs/mockhub.html` | Referência de design do hub |
