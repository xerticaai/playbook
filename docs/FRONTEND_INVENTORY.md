# Inventário Completo do Frontend
> Vistoria realizada em 22/02/2026 — base: commit `061036a`

---

## Estrutura de Diretórios

```
public/
├── index.html                   (2 438 linhas)  ← SPA principal
├── estilos/
│   ├── loader.css               (  458 linhas)  ← overlay de carregamento inicial
│   ├── animacoes-carregamento.css(  64 linhas)  ← dots/animação xertica-loading
│   ├── estilos-principais.css   (1 654 linhas)  ← estilos globais base
│   ├── estilos-refactor-v4.css  (    5 linhas)  ← bundle: apenas @imports dos refactor/
│   ├── refactor/
│   │   ├── 00-tokens.css        (   66 linhas)  ← CSS custom properties / design tokens
│   │   ├── 10-base.css          (   54 linhas)  ← reset + tipografia base
│   │   ├── 20-layout.css        (  254 linhas)  ← grid, sidebar, main, responsivo
│   │   ├── 30-components.css    (1 663 linhas)  ← cards, botões, modais, drilldown
│   │   └── 40-overrides.css     (  818 linhas)  ← patches de temas, estados, dark/light
│   └── backup/
│       ├── README.md
│       ├── estilos-principais.pre-refactor-2026-02-22.css
│       └── estilos-principais.pre-refactor-premium-2026-02-22.css
├── paginas/
│   ├── aprendizados.html        (  719 linhas)  ⚠️ ORPHANED — nunca linkada
│   └── performance.html         (  455 linhas)  ⚠️ ORPHANED — nunca linkada
└── scripts/
    ├── configuracao.js          (   41 linhas)  ← API_BASE_URL, ADMIN_ALLOWED_EMAILS, vars globais
    ├── estado-global.js         (   25 linhas)  ← DATA, availableSellers, selectedSellers
    ├── utilitarios.js           (  239 linhas)  ← formatMoney, setTextSafe, showToast, etc.
    ├── explicacoes-kpi.js       (  267 linhas)  ← tooltips / popover de KPIs
    ├── admin.js                 (  287 linhas)  ← applyAdminVisibility, gestão de férias
    ├── vendedores.js            (  142 linhas)  ← loadSellers, populateRepSelector
    ├── api-dados.js             (  917 linhas)  ← fetch pipeline, wonAgg, lostAgg, FSR, ML, etc.
    ├── dashboard.js             (2 263 linhas)  ← renderDashboard, KPIs executivos, drilldowns
    ├── metricas-executivas.js   (  686 linhas)  ← cards Visão Executiva, stagnant, MVP
    ├── detalhes-vendedor.js     (  582 linhas)  ← showRepDetails, sellers comparison, IPV
    ├── agenda-semanal.js        (  235 linhas)  ⚠️ LEGACY — co-existe com weekly
    ├── agenda-semanal-weekly.js (1 367 linhas)  ← pauta semanal atual (versão enhanced)
    ├── interface.js             (  205 linhas)  ← showSection, toggles, populateStaticKPIs
    ├── aprendizados.js          (  387 linhas)  ← loadAprendizados, insights de vendas
    ├── abas.js                  (   70 linhas)  ← switchExecTab, switchMLTab, toggleCategory
    ├── filtros.js               (1 181 linhas)  ← reloadDashboard, multi-select, filterByRep
    ├── ml.js                    (  542 linhas)  ← loadMLPredictions, 9 tabs de modelos
    ├── performance-fsr.js       (  258 linhas)  ← loadPerformanceData, scorecard, IPV rendering
    ├── performance-integration.js(254 linhas)  ← integra performance-fsr com estado global
    ├── inicializacao.js         (   58 linhas)  ← DOMContentLoaded, bootstrap da app
    ├── graficos.js              (  965 linhas)  ← Chart.js instances, onClick drilldowns
    ├── drilldown.js             (  480 linhas)  ← openDrilldown, aside panel, CSV export
    └── autenticacao.js          (   94 linhas)  ← Firebase Auth, resolveAdminAccess
```

**Totais:**
| Tipo | Arquivos | Linhas |
|------|----------|--------|
| HTML | 3 (1 SPA + 2 orphaned) | 3 612 |
| CSS | 8 ativos + 2 backup | 5 032 |
| JS | 24 | 10 761 |
| **Total** | **35** | **~20 000** |

---

## Seções da SPA (index.html)

| ID da seção | Nav item | Script responsável | Status |
|---|---|---|---|
| `#executive` | Visão Executiva | `dashboard.js`, `metricas-executivas.js` | ✅ Ativo |
| `#aprendizados` | Aprendizados | `aprendizados.js` | ✅ Ativo |
| `#fsr` | Performance Equipe | `performance-fsr.js` | ✅ Ativo |
| `#individual` | (via toggle) | `detalhes-vendedor.js` | ✅ Ativo |
| `#agenda` | Pauta Semanal | `agenda-semanal-weekly.js` | ✅ Ativo |
| `#admin` | Admin (restrito) | `admin.js` | ✅ Ativo |
| `#ml` | Inteligência ML (restrito) | `ml.js` | ✅ Ativo |
| `#dashboard` | Indicadores L10 (restrito) | `dashboard.js` | ✅ Ativo |
| `warroom` | — | `interface.js` | ❌ ORPHANED (seção removida do HTML) |

---

## Scripts por Ordem de Carregamento

```
1.  configuracao.js             ← define constantes e vars globais
2.  estado-global.js            ← DATA, sellers state
3.  utilitarios.js
4.  explicacoes-kpi.js
5.  admin.js
6.  vendedores.js
7.  api-dados.js
8.  dashboard.js
9.  metricas-executivas.js
10. detalhes-vendedor.js
11. agenda-semanal.js           ⚠️ legacy, carregada antes da semanal-weekly
12. interface.js
13. aprendizados.js
14. abas.js
15. filtros.js
16. ml.js
17. performance-fsr.js
18. inicializacao.js            ← DOMContentLoaded (bootstrap)
19. graficos.js
20. drilldown.js
21. autenticacao.js             ← Firebase Auth (carregada por último)
22. agenda-semanal-weekly.js    ← com ?v=20260212-0012
```

---

## CSS por Ordem de Carregamento

```
1. loader.css                    (458 linhas) — loading overlay
2. animacoes-carregamento.css    ( 64 linhas) — xertica-loading-dots
3. estilos-principais.css        (1654 linhas) — tudo
4. estilos-refactor-v4.css       (  5 linhas) — @imports:
   └── refactor/00-tokens.css   (  66 linhas)
   └── refactor/10-base.css     (  54 linhas)
   └── refactor/20-layout.css   (  254 linhas)
   └── refactor/30-components.css (1663 linhas)
   └── refactor/40-overrides.css  (818 linhas)
```
**Total: 7 arquivos CSS processados pelo browser** (4 `<link>` + 5 `@import`)

---

## Dependências Externas (CDN)

| Lib | Versão | Uso |
|---|---|---|
| Chart.js | 4.4.4 | Todos os gráficos |
| topojson-client | 3.1.0 | Mapa coroplético |
| chartjs-chart-geo | 4.3.3 | Mapa coroplético |
| Firebase App (compat) | 10.8.1 | Auth |
| Firebase Auth (compat) | 10.8.1 | Google SSO |
| Google Fonts (Poppins + Roboto) | — | Tipografia |

---

## Estado Global (window.*)

| Variável | Definida em | Uso |
|---|---|---|
| `DATA` | `estado-global.js` | Todos os dados da API |
| `availableSellers` | `estado-global.js` | Multi-select vendedores |
| `selectedSellers` | `estado-global.js` | Filtro multi-select |
| `API_BASE_URL` | `configuracao.js` | Fetch URL |
| `currentUserEmail` | `configuracao.js` | Auth |
| `isAdminUser` | `configuracao.js` | Gate de acesso admin |
| `adminPreviewEnabled` | `configuracao.js` | Toggle admin preview |
| `window.currentRepFilter` | `filtros.js` (L1065) | Filtro por vendedor único |
| `window._firebaseAuthEmail` | `autenticacao.js` | Email confirmado Firebase |
| `window.pipelineDataRaw` | `api-dados.js` | Raw pipeline deals |
| `window.wonAgg` | `api-dados.js` | Deals ganhos raw |
| `window.lostAgg` | `api-dados.js` | Deals perdidos raw |

---

## Modelo de Autorização

```
Firebase Auth (Google SSO)
    ↓
autenticacao.js → window._firebaseAuthEmail
    ↓
admin.js → resolveAdminAccess()
    ↓
ADMIN_ALLOWED_EMAILS (configuracao.js):
  - amalia.silva@xertica.com
  - barbara.pessoa@xertica.com
  - gustavo.paula@xertica.com
    ↓
isAdminUser = true/false → applyAdminVisibility()
```
