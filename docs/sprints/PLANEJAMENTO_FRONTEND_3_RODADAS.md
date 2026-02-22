# Planejamento Frontend — 3 Rodadas Completas
**Data:** 22 Fev 2026 | **Base:** auditoria completa de 14.685 linhas de código-fonte

---

## Diagnóstico Geral

### Arquitetura atual

| Camada | Arquivos-chave | LOC | Estado |
|---|---|---|---|
| HTML | `index.html` | 2.399 | 🔴 ~40% inline styles, HTML misturado com lógica |
| CSS | `estilos-principais.css` | 1.524 | 🟡 Base sólida + Brand Kit v.2 adicionado no fim; duplicações |
| JS – Dados | `api-dados.js`, `filtros.js` | 870 + 1.097 | 🟡 Funcional, mas sem abort de fetch, sem error boundaries |
| JS – UI | `metricas-executivas.js`, `graficos.js`, `dashboard.js` | 593 + 585 + 2.418 | 🔴 `dashboard.js` monolito |
| Backend (Cloud Run) | `simple_api.py` + 6 routers | 2.059 | 🟢 Bem estruturado; 15 endpoints REST |

### Endpoints backend disponíveis (não todos usados no frontend)

```
GET  /api/metrics            — KPIs agregados (pipeline, won, lost, forecast)
GET  /api/pipeline           — deals brutos com filtros
GET  /api/filter-options     — valores disponíveis para selects
GET  /api/closed/won         — deals ganhos
GET  /api/closed/lost        — deals perdidos
GET  /api/sellers            — lista de vendedores
GET  /api/actions            — próximas ações ← SUBUTILIZADO no frontend
GET  /api/priorities         — prioridades de deals ← NÃO CONECTADO
GET  /api/analyze-patterns   — análise de padrões ← NÃO CONECTADO
GET  /api/sales-specialist   — dados FSR
GET  /api/dashboard          — payload completo (tudo de uma vez)
GET  /api/user-context       — usuário autenticado
POST /api/ai-analysis        — análise IA de deals
GET  /api/insights-rag       — insights RAG
GET  /api/performance/*      — performance + vacations + admin
```

### Problemas críticos identificados

1. **Header bar** não reflete o mockup desejado (imagem). Hoje é só texto "quarter-label | timestamp". Faltam: pill de período ativo, "Visão: Net Revenue" dropdown, ícone de filtros.
2. **Suspensão de filtros** inexistente. Ao clicar "Limpar" os valores são perdidos. Precisa de modo "pause" que desativa sem destruir.
3. **Filtros com 300+ linhas de inline styles** em `index.html` — impossível manter e torna o CSS ineficaz.
4. **Brasil Map** falhou: `chartjs-chart-geo` carrega assincronamente mas `buildEstado()` é chamado antes. Além disso, o TopoJSON da vega-datasets usa nomes em inglês (não corresponde ao mapeamento).
5. **`dashboard.js` tem 2.418 linhas** — monolito que mistura renderização, lógica de negócio e I/O. Risco de bugs silenciosos.
6. **Modo Gross/Net não persiste** entre abas (navegação destroi o estado).
7. **Aba "Mapas"** existe no HTML mas está vazia/padrão — pior seção do app.
8. **Cards KPI** ainda usam classes legacy (`.kpi-card`) misturadas com o novo `.card` do Brand Kit v.2.
9. **Drilldown lateral** (`chart-drilldown-modal`) renderiza lista genérica — não usa `dd-badge` correto.
10. **`/api/actions`, `/api/priorities`, `/api/analyze-patterns`** nunca chamados no frontend — features existem no backend mas estão invisíveis.

---

## RODADA 1 — Header Inteligente + Sistema de Filtros Redesenhado
**Foco:** O que o usuário vê e usa primeiro. Fundação visual e de interação.  
**Estimativa:** 1 sessão de trabalho

### R1.1 — Header Bar Redesign (conforme mockup)

**Mockup alvo (imagem enviada):**
```
[ 🌙 ]  [ Q1 2026 ]   Visão: Net Revenue ▾    [ ⧉ ]
```

**Implementação:**
- Substituir `.top-header-bar` atual (texto simples) por uma barra horizontal com 4 zonas:
  - **Zona Esquerda:** logo/marca mínima
  - **Zona Central:** pill do período ativo (`#header-period-pill`) — clicável abre calendar picker rápido
  - **Zona Central-Direita:** dropdown "Visão" que unifica o toggle GROSS / NET + futuramente outras métricas
  - **Zona Direita:** ícone de filtros (`⧉`) que abre/fecha o painel, com badge de contagem de filtros ativos

```html
<!-- Nova estrutura do header -->
<header class="app-header">
  <div class="app-header-left">
    <span class="app-brand">X-GTM</span>
  </div>
  <div class="app-header-center">
    <button class="period-pill" id="header-period-pill">Q1 2026</button>
    <button class="visao-dropdown" id="header-visao-btn">
      Visão: <strong id="header-visao-label">Net Revenue</strong>
      <svg><!-- chevron --></svg>
    </button>
  </div>
  <div class="app-header-right">
    <button class="filter-toggle-btn" id="header-filter-btn" 
            onclick="toggleGlobalFiltersPanel()">
      <svg><!-- sliders --></svg>
      <span class="filter-badge" id="header-filter-badge"></span>
    </button>
    <button class="icon-btn" onclick="toggleTheme()" id="theme-toggle-btn">
      <!-- moon/sun svg -->
    </button>
  </div>
</header>
```

**CSS necessário:**
- `.app-header` — `position: sticky; top: 0; z-index: 1000; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; backdrop-filter: blur(20px); border-bottom: 1px solid var(--glass-border)`
- `.period-pill` — pill com fundo `var(--x-cyan-bg)`, cor `var(--x-cyan-50)`, `border-radius: 99px`
- `.visao-dropdown` — botão flat com chevron, fundo transparente, hover sutil
- `.filter-badge` — badge circular `var(--x-cyan-50)` com contagem (aparece só se > 0)

**JS:** Mover `setExecDisplayMode()` para trabalhar juntamente com o header — atualizar `#header-visao-label`.

---

### R1.2 — Suspend/Pause de Filtros Globais

**Comportamento desejado:**
- Botão **"Pausar Filtros"** (ícone ⏸) — desativa todos os filtros globais SEM limpar os valores
- Os `select` e pills ficam visualmente "dimmed" (opacity 0.45)
- O dashboard recarrega com todos os dados (sem filtros)
- Ao clicar "Retomar" (▶) os filtros voltam exatamente como estavam
- Estado persiste em `sessionStorage` (não em `localStorage` — é temporário)

**Implementação em `filtros.js`:**
```javascript
window.globalFiltersSuspended = false;

function suspendGlobalFilters() {
  window.globalFiltersSuspended = true;
  sessionStorage.setItem('filtersSuspended', '1');
  document.getElementById('filters-container').classList.add('filters-suspended');
  document.getElementById('btn-suspend-filters').textContent = '▶ Retomar Filtros';
  reloadDashboard();
}

function resumeGlobalFilters() {
  window.globalFiltersSuspended = false;
  sessionStorage.removeItem('filtersSuspended');
  document.getElementById('filters-container').classList.remove('filters-suspended');
  document.getElementById('btn-suspend-filters').textContent = '⏸ Pausar Filtros';
  reloadDashboard();
}

function toggleSuspendFilters() {
  window.globalFiltersSuspended ? resumeGlobalFilters() : suspendGlobalFilters();
}
```

**Em todos os `getAdvancedFiltersFromUI()` e funções de filtro:**
```javascript
if (window.globalFiltersSuspended) return {}; // retorna filtros vazios
```

**CSS:**
```css
.filters-suspended .filter-pill,
.filters-suspended select,
.filters-suspended .multi-select-trigger {
  opacity: 0.4;
  pointer-events: none;
}
.filters-suspended::after {
  content: 'FILTROS PAUSADOS';
  position: absolute; top: 8px; right: 80px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  color: var(--x-warning); border: 1px solid var(--x-warning);
  padding: 2px 8px; border-radius: 99px;
}
```

---

### R1.3 — Limpeza do Painel de Filtros (remover inline styles)

**Problema:** O `#filters-container` tem ~180 linhas de atributos `style="..."` diretamente no HTML.

**Solução:** Extrair todos para classes CSS no `estilos-principais.css`:
- `.filters-container` — substitui o div com todos os estilos inline
- `.filter-quick-bar` — já existe, mas precisa de variante `.filter-quick-bar + label`
- `.filter-section-card` — substitui o div interno com `border: 1px solid rgba(255,255,255,0.12)`
- `.filter-section-title` — substitui o span de label azul uppercase
- Todos os `<select>` inline com `onmouseover/onmouseout` JS → substituir por `:hover` no CSS

**Resultado:** `#filters-container` cai de ~180 para ~15 linhas no HTML.

---

### R1.4 — Pill de Período com Quick-Picker

Ao clicar no `header-period-pill`, abre um dropdown com pills de quarter (como a barra de filtros atual, mas inline e compacto):

```
[ Q1 2026 ]  ← clica abre:
┌─────────────────────────────┐
│  FY26: Q1  Q2  Q3  Q4  Full │
│  FY25: Q1  Q2  Q3  Q4  Full │
└─────────────────────────────┘
```

Ao selecionar, fecha o dropdown, atualiza o pill e dispara o filtro em uma ação. Remove necessidade da "barra de filtros rápidos" do corpo principal.

---

## RODADA 2 — Cards KPI, Gráficos e Integridade de Dados
**Foco:** Corrigir o que é exibido — dados certos na tela certa, design consistente.  
**Estimativa:** 2 sessões de trabalho

### R2.1 — Unificação do Design de Cards KPI

**Problema:** Mix entre `.kpi-card` (legacy com `background: var(--bg-card)`) e `.card` (novo Brand Kit v.2 com glassmorphism).

**Plano:**
1. Identificar todos os `<div class="kpi-card">` no HTML (existem ~20)
2. Migrar para `.card` + variante `.card-kpi`
3. `.card-kpi` herda tudo do `.card` base + adiciona:
   - Linha superior colorida (`border-top: 2px solid`) com cor variável por tipo
   - Área de ícone no canto superior direito (opcional)
   - Layout interno: `card-label` (topo) → `card-value xl` (centro) → `card-subtext` (base)
4. Remover do CSS as declarações duplicadas de `.kpi-card` após migração

**Estrutura padronizada:**
```html
<div class="card card-kpi glow-cyan">
  <div class="card-label">Pipeline Ativo</div>
  <div class="card-value xl text-cyan" id="exec-pipeline-total">—</div>
  <div class="card-subtext">
    Net: <span id="exec-pipeline-net">—</span>
  </div>
</div>
```

---

### R2.2 — Mapa do Brasil (abordagem correta)

**Por que falhou:** `chartjs-chart-geo` é carregado de CDN e pode não estar disponível quando `buildEstado()` executa. O TopoJSON da vega-datasets usa nomes em **inglês** ("Para", "Mato Grosso do Sul") que não batem com o mapeamento atual.

**Nova abordagem — SVG Inline + D3-lite:**

Em vez de chartjs-chart-geo (outro plugin externo que pode falhar), usar **SVG estático do Brasil** com coloração via JavaScript puro:

1. Criar `public/assets/brasil-estados.svg` — SVG com um path `<path id="BR-SP">` por estado (27 paths). Arquivo estático, ~80KB, sem CDN dependency.
2. Em `graficos.js`, `buildEstado()` busca o SVG, aplica fill colorido por valor:
```javascript
function buildEstado() {
  var container = document.getElementById('chart-estado');
  // Agrega dados por estado
  var mP = groupBy(pipelineDataRaw, getE);
  var maxVal = Math.max(...Object.values(mP).map(v => v.gross));
  
  // Injeta o SVG no container (fetch uma vez, depois reutiliza)
  getSvgMap().then(function(svgEl) {
    container.innerHTML = '';
    container.appendChild(svgEl);
    // Colorir cada path
    svgEl.querySelectorAll('[id^="BR-"]').forEach(function(path) {
      var abbrev = path.id.replace('BR-','');
      var val = (mP[abbrev]||{gross:0}).gross;
      var alpha = val ? 0.15 + (val/maxVal)*0.75 : 0.04;
      path.style.fill = `rgba(0,190,255,${alpha.toFixed(2)})`;
      path.style.stroke = 'rgba(0,190,255,0.2)';
      // Tooltip hover
      path.addEventListener('mouseenter', function(e) {
        showMapTooltip(abbrev, mP[abbrev], e);
      });
    });
  });
}
```

3. Tooltip flutuante aparece com Pipeline / Won / Lost formatados.
4. Clique em estado abre o drilldown lateral com os deals daquele estado.
5. Fallback para bar chart se SVG falhar.

**Arquivo SVG:** pode ser gerado de https://simplemaps.com/resources/svg-br ou do repositório `south-america-maps` (MIT license). Cards existem para SP, RJ, MG, RS, PR, BA, CE, PE, GO, SC, DF e outros 16.

---

### R2.3 — Todos os 8 Gráficos: Inicialização Confiável

**Problema atual:** `window.initDashboardCharts()` é chamado como callback de carregamento de dados. Se o DOM do `#view-graficos` ainda não estiver visível (display:none do view-toggle), os canvas têm `offsetWidth=0` e o Chart.js não renderiza corretamente.

**Solução:**
```javascript
// Em switchMetricView():
function switchMetricView(targetId, btn) {
  // ...existing show/hide logic...
  if (targetId === 'view-graficos') {
    // Aguarda o próximo frame para garantir que o DOM está visível
    requestAnimationFrame(function() {
      if (window.initDashboardCharts) window.initDashboardCharts();
    });
  }
}
```

Também: registrar um `ResizeObserver` em cada `.chart-wrapper` para chamar `.resize()` quando o container aparece.

---

### R2.4 — Endpoints Não Conectados → Conectar

| Endpoint | Feature backend | Onde exibir no frontend |
|---|---|---|
| `/api/priorities` | Score de prioridade por deal | Aba "Oportunidades" — badge de prioridade em cada deal card |
| `/api/actions` | Próximas ações recomendadas | Nova sub-seção na aba "Resumo" → cards de ação por vendedor |
| `/api/analyze-patterns` | Padrões de ciclo/verticais | Seção Analytics dentro de Gráficos → card "Insights Automáticos" |

**Como conectar:**
```javascript
// Em api-dados.js, adicionar ao loadDashboardData():
async function loadPriorities() {
  const url = getApiUrl('/api/priorities' + buildQueryString());
  const data = await fetchWithCache(url, 'cache_priorities', 10);
  window.prioritiesData = data.priorities || [];
  renderPriorityBadges();
}

async function loadNextActions() {
  const url = getApiUrl('/api/actions' + buildQueryString());
  const data = await fetchWithCache(url, 'cache_actions', 10);
  window.actionsData = data.actions || [];
  renderNextActionsSection();
}
```

---

### R2.5 — Aba "Mapas" (Tab vazia)

A aba "Mapas" (`data-content="mapas"`) hoje está vazia de conteúdo útil. Aproveitar para:

1. **Mapa Brasil interativo** (do R2.2) como visualização principal em tela cheia
2. Barra lateral com ranking de estados (10 maiores pipelines)
3. Toggle: Pipeline vs Won vs Lost (coloração muda)
4. Filtro de vertical IA para refinar o mapa

```html
<div class="exec-tab-content" data-content="mapas">
  <div style="display:grid; grid-template-columns: 1fr 280px; gap:20px; height:calc(100vh - 200px)">
    <div class="card" style="padding:0; overflow:hidden;">
      <div id="mapa-brasil-container" style="width:100%; height:100%;"></div>
    </div>
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="card" id="estado-ranking-card">
        <!-- Top 10 estados por pipeline -->
      </div>
    </div>
  </div>
</div>
```

---

### R2.6 — Drilldown Premium: Renderização Correta

O `openDrilldown()` em `graficos.js` popula `#chart-dd-body` com HTML genérico. Refatorar para usar a estrutura de tabela com `dd-badge` definida no CSS:

```javascript
function renderDrilldownTable(items, title) {
  const cols = ['deal', 'vendedor', 'gross', 'net', 'fase', 'status'];
  let html = `<table><thead><tr>
    <th>Oportunidade</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Fase</th>
  </tr></thead><tbody>`;
  items.forEach(function(d) {
    var src = d._src || 'pipe';
    var badgeClass = src==='won' ? 'won' : src==='lost' ? 'lost' : 'pipe';
    var badgeLabel = src==='won' ? 'Ganho' : src==='lost' ? 'Perdido' : 'Pipeline';
    html += `<tr>
      <td><span class="dd-badge ${badgeClass}">${badgeLabel}</span> ${d.Oportunidade||d.name||'—'}</td>
      <td>${d.Vendedor||'—'}</td>
      <td>${fmt(d.Gross||d.gross||0)}</td>
      <td>${fmt(d.Net||d.net||0)}</td>
      <td>${d.Fase_Atual||d.stage||'—'}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}
```

---

## RODADA 3 — Features Avançadas: Performance, IA, ML, Agenda e Responsivo
**Foco:** Completar as seções secundárias e polir toda a experiência.  
**Estimativa:** 3 sessões de trabalho

### R3.1 — Seção Performance: Redesign Completo

**Estado atual:** Usa `performance-fsr.js` + `performance-integration.js` (512 LOC combinados) mas a UI usa `.deal-card` antigos.

**Plano:**
1. Substituir deal cards por bento-grid com `.card` Brand Kit v.2
2. Header do vendedor: avatar inicial + nome + total de deals + badge de performance
3. Bar chart de metas vs realizado (por semana do quarter)  — já existe o `agenda-semanal-weekly.js` de 1.367 linhas
4. "Dias de Idle" como card com cor condicional: verde (< 7 dias), amarelo (7-14), vermelho (> 14)
5. Aba performance vira: `Visão Geral | Por Vendedor | Capacidade`

---

### R3.2 — AI Insights: Seção Visível

**Endpoint:** `POST /api/ai-analysis` recebe lista de deals e retorna análise textual.  
**Hoje:** Existe no backend, mas no frontend é só invocado condicionalmente dentro de `dashboard.js`.

**Plano:**
1. Criar card "Próximas Recomendações IA" na aba Resumo (abaixo dos KPIs)
2. Botão "Analisar com IA" → spinner → resultado textual em `.ai-card` existente
3. O contexto enviado inclui filtros ativos: analisa somente deals do período selecionado
4. Cache de 30min para não re-chamar desnecessariamente
5. Indicador "Filtros pausados — análise usa todos os deals" quando suspend está ativo

---

### R3.3 — ML Predictions: UI Completa

**Endpoint:** `/api/ml-predictions` (router `ml_predictions.py`)  
**Estado atual:** Tab ML no sidebar está oculta (`display:none`) para usuários não-admin.

**Plano:**
1. Tornar visível para todos os usuários como "Previsões" (view somente-leitura)
2. Exibir: Score de risco de perda por deal (badge cor), Score de prioridade, Próxima ação prevista
3. Integrar na aba "Oportunidades": cada deal tem mini-chips com predições
4. Card "Previsão de Receita" no topo da aba Resumo: linha de tendência dos próximos 30 dias

---

### R3.4 — Estado Global: Persistência Completa

**Arquivo:** `estado-global.js` (25 linhas apenas — muito simples)

**Ampliar para persistir:**
```javascript
var AppState = {
  // Filtros
  year: '',
  quarter: '',
  month: '',
  sellers: [],
  verticals: [],
  // UI
  displayMode: 'gross',  // 'gross' | 'net'
  filtersSuspended: false,
  themeMode: 'dark',
  sidebarCollapsed: false,
  activeSection: 'executive',
  activeExecTab: 'resumo',
  activeMetricView: 'view-kpi-cards',
  // Salvar em localStorage
  save: function() { localStorage.setItem('appState', JSON.stringify(this)); },
  load: function() {
    var s = localStorage.getItem('appState');
    if (s) Object.assign(this, JSON.parse(s));
  }
};
```

Ao clicar em qualquer filtro, tab, ou toggle → `AppState.save()`.  
Ao abrir o app → `AppState.load()` → restaura exatamente o último estado.

---

### R3.5 — Responsivo Mobile (640px–1024px)

**Breakpoints a adicionar no CSS:**
```css
/* Tablet */
@media (max-width: 1024px) {
  .sidebar { width: 60px; }
  .sidebar .nav-label { display: none; }
  .bento-grid .col-8 { grid-column: span 12; }
  .bento-grid .col-4 { grid-column: span 6; }
}

/* Mobile */
@media (max-width: 640px) {
  .app-header { padding: 0 12px; }
  .bento-grid { grid-template-columns: 1fr; }
  .bento-grid [class*="col-"] { grid-column: span 12; }
  #chart-drilldown-modal { width: 100vw; }
  .exec-tabs { overflow-x: auto; white-space: nowrap; }
}
```

---

### R3.6 — Limpeza de Dívidas Técnicas

| Item | Ação |
|---|---|
| `dashboard.js` 2.418 linhas | Separar em `dashboard-pipeline.js`, `dashboard-kpi.js`, `dashboard-render.js` |
| inline styles no HTML | Extrair todas as 300+ ocorrências para CSS classes |
| `onmouseover/onmouseout` nos selects | Substituir por `.filter-select:hover` no CSS |
| console.log em produção | Envolver em `if(window.DEBUG)` |
| `fetchWithCache` sem AbortController | Adicionar `AbortController` + timeout de 15s |
| `chart-drilldown-modal` HTML duplo | Remover o `exec-drilldown-panel` duplicado ou unificar em único componente |

---

## Roadmap de Implementação

```
RODADA 1 (prioridade alta — impacto visual imediato)
├── R1.1  Header bar redesign ← PRÓXIMO implementar
├── R1.2  Suspend/Pause de filtros  
├── R1.3  Limpeza inline styles filtros
└── R1.4  Period quick-picker

RODADA 2 (prioridade média — dados e gráficos corretos)
├── R2.1  Unificação cards KPI
├── R2.2  Mapa Brasil (SVG inline)
├── R2.3  Inicialização confiável dos 8 charts
├── R2.4  Conectar /api/priorities e /api/actions
├── R2.5  Aba Mapas completa
└── R2.6  Drilldown com tabela + dd-badge

RODADA 3 (prioridade normal — completude e polimento)
├── R3.1  Performance redesign
├── R3.2  AI Insights visível
├── R3.3  ML badges inline
├── R3.4  Estado global persistente  
├── R3.5  Responsivo mobile
└── R3.6  Dívidas técnicas (refactor dashboard.js)
```

---

## Decisões de Design Pendentes (confirmar antes de implementar)

| # | Pergunta | Opção A | Opção B |
|---|---|---|---|
| D1 | Mapa do Brasil: SVG estático local ou CDN? | SVG local (arquivo no repo) ~80KB | Fetch de CDN (risco offline) |
| D2 | Header "Visão" — dropdown ou toggle simples? | Dropdown com GROSS / NET + futuramente mais opções | Toggle binário simples |
| D3 | Suspender filtros: fica no header ou no painel? | Badge/ícone no header (no ícone ⧉) | Botão dentro do painel expandido |
| D4 | Split de `dashboard.js`: fazer agora ou pós-Rodada 2? | Agora (correto mas arriscado) | Pós-Rodada 2 (seguro) |
| D5 | ML predictions: todos os usuários veem ou só admin? | Todos veem (somente-leitura) | Só admin vê |

---

## Adendos — Rodada 2 (atualização pós-sprint)

### HOTFIX entregue (commit anterior a este adendo)

| Item | Arquivo | Descrição |
|------|---------|-----------|
| HF-1 | `api-dados.js` | `wonAgg`/`lostAgg` — campos dimensionais adicionados: `Vertical_IA`, `Sub_vertical_IA`, `Segmento_consolidado`, `Portfolio_FDM`, `Estado_Provincia_de_cobranca`, `Fase_Atual`, `Confianca`, `BANT_Score`, `MEDDIC_Score`, `Risco_Score`, `Idle_Dias`, `Forecast_SF/IA`. Corrige gráficos de tripleBar (Vertical, Sub-Vertical, Segmento, Estado) que retornavam vazio. |
| HF-2 | `scripts/drilldown.js` *(novo)* | Módulo canônico de drilldown. Define `window.openDrilldown(title, items)` com tabela acordeão expansível por deal. Cada linha abre card completo com: nome/conta/vendedor, FiscalQ/data/ciclo/fase, financeiros (Gross/Net/Margem), scorecard (Confiança/Risco/BANT/MEDDIC), badges de risco (Sem Atividade, Funil Longo, Confiança Baixa, BANT Baixo, MEDDIC Baixo), chips de dimensão, nota IA (Fatores_Sucesso / Causa_Raiz). |
| HF-3 | `graficos.js` | Delegação `openDrilldown` local → `window.openDrilldown` se definido. Permite override sem tocar no IIFE. |
| HF-4 | `dashboard.js` | `createWordCloud` atualizada com 4º parâmetro `clickContext`. Todos os containers de word cloud (winTypes, lossTypes, winLabels, lossLabels, riskFlags, actionLabels) agora têm `onclick` que abre drilldown filtrando deals pelo texto clicado. |
| HF-5 | `estilos-principais.css` | Adicionados: `.deal-expanded`, `.deal-exp-header/financials`, `.deal-score-grid`, `.deal-dims`, `.deal-dim-chip`, `.risk-flag-badge` (flag-red/orange/yellow), `.deal-ai-note`, `.deal-row` (hover/expanded), `.wcloud-item-clickable`. |

### Regra permanente — NÃO TOCAR

> **`agenda-semanal-weekly.js`** e **`agenda-semanal.js`** são **OFF LIMITS**.  
> Nenhuma modificação, refactor ou migração deve ser feita nestes arquivos.  
> A Pauta Semanal tem lógica própria e qualquer toque pode quebrar funcionalidades críticas de agendamento.

### R2.6 — Drilldown Canônico (spec confirmada pelo usuário)

Campos obrigatórios no card expandido (exemplo: MMDJ-130794):

```
[OPPORTUNITY NAME]
[CONTA] — [TIPO: BASE INSTALADA / NOVO] — <badge: Ganho|Perdido|Pipeline>
[VENDEDOR]
[FISCAL_Q] • Fechamento: [DATA] • [CICLO] dias funil • Fase: [FASE_ATUAL] • [N] atividades

Gross: R$ X.X M   Net: R$ X.X M   Margem: X%

Confiança: X%   Risco: X/5   BANT: X/5   MEDDIC: X/5

<chips de dimensão: Vertical | Sub-vertical | Segmento | Estado | Portfolio | Tipo | Forecast>
<badges de risco: Sem Atividade | Funil Longo | Confiança Baixa | BANT Baixo | MEDDIC Baixo>

Fatores de Sucesso / Causa Raiz: [texto]
```

### R2.7 — Word Cloud → Drilldown (implementado)

- Clique em qualquer palavra nos containers Mapas/Word Cloud → `window._wcloudClick(span)` → filtra `wonAgg`/`lostAgg`/`pipelineDataRaw` pelo campo mapeado → abre `openDrilldown` com os deals relevantes.
- Mapeamento: winTypes/lossTypes → `Tipo_Resultado`; winLabels → `Fatores_Sucesso`; lossLabels → `Causa_Raiz`; actionLabels → `Forecast_IA`; riskFlags → `Forecast_IA`.
- Visual: chips clicáveis têm `cursor: pointer` e scale hover via `.wcloud-item-clickable`.

