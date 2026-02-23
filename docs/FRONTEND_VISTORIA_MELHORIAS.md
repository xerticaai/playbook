# Planejamento de Melhorias — Vistoria Frontend + Backend
> Vistoria inicial: 22/02/2026 — base: commit `061036a`  
> Aprofundamento por-arquivo: 23/02/2026 — audit completo de JS + backend  
> Prioridade: 🔴 Crítico · 🟡 Importante · 🟢 Melhoria · 🔵 Técnico/Dívida · ⚫ Backend/API

---

## Resumo Executivo

| Categoria | Qtd de itens |
|---|---|
| 🔴 Bugs críticos / funcionalidades quebradas | 8 |
| 🟡 Incoerências estruturais importantes | 11 |
| 🟢 Melhorias de UX / usabilidade | 8 |
| 🔵 Dívida técnica / code quality | 18 |
| ⚫ Backend / API / cross-reference | 7 |
| **Total** | **52** |

> **Arquivos auditados em profundidade:** `utilitarios.js` (240L), `admin.js` (288L), `vendedores.js` (143L),  
> `autenticacao.js` (95L), `api-dados.js` (918L), `dashboard.js` (2263L — assinaturas),  
> `filtros.js` (1181L — assinaturas), `graficos.js` (965L — assinaturas), `drilldown.js` (480L — assinaturas),  
> `metricas-executivas.js` (686L — assinaturas), `simple_api.py` (2059L), todos os endpoints modulares.

---

## 🔴 BUGS CRÍTICOS

### BUG-01 — `#rep-filter` não existe no HTML (filtro por vendedor quebrado)

**Arquivo:** `filtros.js` (L441, L1034), `dashboard.js`, `graficos.js`

**Problema:** O sistema de filtro por vendedor único (`filterByRep()`) faz `getElementById('rep-filter')` que retorna `null` porque esse elemento não existe no `index.html`. Como consequência:
- `window.currentRepFilter` **nunca é atribuído** via UI
- Todo o código de cross-filter adicionado em `dashboard.js` e `graficos.js` (drilldowns respeitando rep filter) **não é acionável pelo usuário**
- A função `populateRepFilterDropdown()` em `filtros.js` popula um `<select>` que não está no DOM

**Solução:** Adicionar um controle `<select id="rep-filter">` no painel de filtros globais ou na barra do topo, conectado ao evento `onchange="filterByRep(this.value)"`. Ele já existe funcionalmente no JS — só falta o HTML.

```html
<!-- Sugestão: Em #global-filters-panel, dentro do grupo "Comercial" -->
<div class="filters-field">
  <span class="filters-field-label">Filtro Rápido Vendedor:</span>
  <select id="rep-filter" onchange="filterByRep(this.value)">
    <option value="all">Todos</option>
  </select>
</div>
```

---

### BUG-02 — Aba "Guia de Interpretação" inacessível (conteúdo órfão)

**Arquivo:** `index.html` (L~1272–1320)

**Problema:** Existe um `<div class="exec-tab-content" data-content="guia">` com 40+ linhas de conteúdo explicando todas as métricas, mas **não há botão tab** correspondente no `exec-tabs-row`. O conteúdo é totalmente invisível e inacessível para o usuário.

**Solução:** Adicionar o tab button na row de tabs:

```html
<button class="exec-tab" data-tab="guia" onclick="switchExecTab('guia')">
  <svg class="exec-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
  Guia
</button>
```

---

### BUG-03 — IDs DOM referenciados em JS mas ausentes no HTML

**Arquivo:** `interface.js` (L51–66, `populateStaticKPIs`)

**Problema:** `populateStaticKPIs()` usa `setTextSafe()` em 3 IDs que não existem no HTML atual:
- `exec-pipeline-specialist-total`
- `exec-pipeline-specialist-deals`
- `exec-pipeline-specialist-net`

`setTextSafe` é null-safe (não lança erro), mas o dado do Sales Specialist no topo nunca é exibido. Esses campos foram removidos do HTML em algum momento sem atualizar o JS.

**Solução:** Remover as 3 chamadas órfãs de `populateStaticKPIs()`, ou re-adicionar os elementos HTML se o dado for necessário.

---

### BUG-04 — War Room completamente morto (JS + HTML desconexos)

**Arquivo:** `interface.js` (L1–65, L168–182)

**Problema:** `interface.js` ainda contém:
- Função `loadWarRoom()` com ~50 linhas referenciando IDs (`#war-forecast-total`, `#war-sellers-table`, etc.) que não existem no HTML
- `showSection()` com entrada `'warroom'` no dict de títulos
- `exportWarRoomCSV()` (função stub)
- Chamada condicional `if (sectionId === 'warroom') loadWarRoom()`

A seção `<div id="warroom">` foi removida do HTML. Todo esse código é dead code não removido.

**Solução:** Remover as funções `loadWarRoom()` e `exportWarRoomCSV()`, a entry `'warroom'` no dict `titles`, e o condicional em `showSection()`.

---

### BUG-05 — Duplo ícone renderizado em seções headers

**Arquivo:** `index.html` (múltiplos locais)

**Problema:** Vários `<h4 class="metric-section-header">` têm **dois ícones simultâneos**: um SVG inline completo e depois um `<svg class="icon"><use href="#icon-..."/></svg>`. Exemplo:

```html
<h4 class="metric-section-header sales-specialist">
  <!-- Ícone 1: SVG inline completo (17 linhas) -->
  <svg viewBox="0 0 24 24" ...>
    <path d="M17 21v-2..."/><circle cx="9".../>...
  </svg>
  <!-- Ícone 2: use href (desnecessário - renderiza um 2º ícone) -->
  <svg class="icon"><use href="#icon-user"/></svg>
  SALES SPECIALIST (Curadoria Manual)
</h4>
```

Resultado visual: dois ícones aparecem lado a lado antes do título.

**Solução:** Remover o SVG inline duplicado em cada header que já tem `<use href>` ou vice-versa. Padronizar um único estilo por elemento.

Ocorrências identificadas: `sales-specialist`, `won` (seção DEALS FECHADOS), `sellers` (seção PERFORMANCE DOS VENDEDORES).

---

### BUG-06 — `agenda-semanal.js` legacy carregado junto com `agenda-semanal-weekly.js`

**Arquivo:** `index.html` (L2401, L2410)

**Problema:** Ambos os scripts são carregados:
```html
<script src="scripts/agenda-semanal.js"></script>          <!-- legacy, 235 linhas -->
...
<script src="scripts/agenda-semanal-weekly.js?v=20260212-0012"></script>  <!-- atual -->
```

O arquivo legacy define funções como `loadWeeklyAgendaLegacy()` e outras que podem colidir silenciosamente com as do arquivo weekly. `interface.js` chama `loadWeeklyAgendaLegacy()` como fallback, então a remoção precisa ser cuidadosa.

**Solução:** Verificar se `agenda-semanal.js` define alguma função usada por `interface.js` ou outra parte do código. Se o `loadWeeklyAgendaLegacy` é o único uso, mover essa função inline para `interface.js` e remover `agenda-semanal.js` do carregamento.

---

### BUG-07 — `debounceFilter` esconde loader antes da operação async terminar

**Arquivo:** `utilitarios.js` (função `debounceFilter`)

**Problema:** Implementação atual:
```js
function debounceFilter(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    showFilterLoader();
    timer = setTimeout(() => {
      hideFilterLoader();   // ← chamado imediatamente ao timeout disparar
      func(...args);         // ← func é async; dados chegam depois
    }, delay);
  };
}
```
`hideFilterLoader()` é chamado **síncronamente** assim que o timeout dispara, antes de `func()` (que é `reloadDashboard()`) fazer qualquer requisição à API. O loader desaparece antes dos dados chegarem, deixando o painel exibindo dados antigos sem indicação de carregamento.

**Solução:**
```js
timer = setTimeout(async () => {
  try {
    await func(...args);
  } finally {
    hideFilterLoader();
  }
}, delay);
```

---

### BUG-08 — `clearDashboardCache()` não limpa cache — chama `refreshDashboard()`

**Arquivo:** `utilitarios.js` (função `clearDashboardCache`)

**Problema:**
```js
function clearDashboardCache() {
  refreshDashboard();  // ← isso não limpa nenhum cache
}
```
A função com nome `clearDashboardCache` não chama `clearDataCache()` (de `api-dados.js` — que sim limpa o `localStorage`). Qualquer código que chama `clearDashboardCache()` esperando limpar o cache fica com dados potencialmente stale. O nome engana completamente os leitores do código.

**Solução:**
```js
function clearDashboardCache() {
  if (typeof clearDataCache === 'function') clearDataCache();
  refreshDashboard();
}
```

---

## 🟡 INCOERÊNCIAS ESTRUTURAIS

### INC-01 — Comentário de seção errado: Admin rotulado como "INTELIGÊNCIA ML"

**Arquivo:** `index.html` (L~1935)

**Problema:** O comentário acima da `<div id="admin">` diz:
```html
<!-- SEÇÃO 6: INTELIGÊNCIA ML -->
<div id="admin" class="section">
```

Mas a seção `#admin` é gestão de férias, não ML. A seção de ML é `<div id="ml">`.

**Solução:** Corrigir o comentário para `<!-- SEÇÃO: ADMIN - GESTÃO DE FÉRIAS -->`.

---

### INC-02 — Nav item `nav-fsr-item` duplica `nav-performance-item`

**Arquivo:** `index.html` (L~258–271, L~342–357)

**Problema:** Existem dois nav items para "Performance Equipe":
- `id="nav-performance-item"` — visível, chama `showPerformanceView('fsr')`
- `id="nav-fsr-item"` — oculto (`style="display:none"`), chama `showSection(this, 'fsr')`

O `nav-fsr-item` foi mantido como fallback hidden mas nunca é exibido. Polui o código e cria confusão.

**Solução:** Remover `nav-fsr-item` e garantir que `nav-performance-item` seja suficiente.

---

### INC-03 — Cache-bust manual em um único script

**Arquivo:** `index.html` (L2410)

**Problema:** Somente `agenda-semanal-weekly.js` tem cache-bust manual (`?v=20260212-0012`). Todos os outros scripts não têm versão. Se o deployment usa Firebase Hosting com cache longo, outros scripts poderão ficar em cache stale enquanto `agenda-semanal-weekly.js` é sempre re-baixado.

**Solução:** Usar `firebase.json` com `"headers"` de cache apropriados, ou adotar um build step com hash de conteúdo em todos os scripts. No mínimo, remover o `?v=` hardcoded que causa impressão de "esse arquivo precisa de tratamento especial".

---

### INC-04 — `paginas/aprendizados.html` e `paginas/performance.html` orphaned

**Arquivo:** `public/paginas/`

**Problema:** Dois arquivos HTML completos (~1174 linhas combinadas) que nunca são linkados ou carregados. O conteúdo de "Aprendizados" e "Performance" está implementado como seções dentro de `index.html`. As páginas em `paginas/` são provavelmente versões antigas.

**Solução:** Deletar `paginas/aprendizados.html` e `paginas/performance.html`, ou mover para `public/estilos/backup/` se houver valor histórico.

---

### INC-05 — 7 requisições HTTP para CSS (4 links + 5 @imports)

**Arquivo:** `index.html` + `estilos-refactor-v4.css`

**Problema:** O `estilos-refactor-v4.css` é um bundle de apenas `@import`s:
```css
@import url("./refactor/00-tokens.css");    /* 66 linhas */
@import url("./refactor/10-base.css");      /* 54 linhas */
@import url("./refactor/20-layout.css");    /* 254 linhas */
@import url("./refactor/30-components.css"); /* 1663 linhas */
@import url("./refactor/40-overrides.css");  /* 818 linhas */
```

Isso gera 5 requisições HTTP extras além dos outros 3 `<link>` CSS. Total: 7 reqs de CSS antes do first paint, bloqueando renderização. Os `@import` CSS são serialmente bloqueantes.

**Solução:** Concatenar os 5 arquivos de refactor diretamente em `estilos-refactor-v4.css` durante o build (ou manualmente por enquanto), eliminando os `@imports`.

---

### INC-06 — Inconsistência nos patterns de ícone SVG

**Arquivo:** `index.html` (toda a extensão)

**Problema:** O projeto usa dois sistemas de ícone conflitantes sem regra clara:
1. **SVG inline direto** — `<svg viewBox="..." fill="none" stroke="currentColor">...paths...</svg>` (usado na maioria)
2. **Symbol + use** — `<svg class="icon"><use href="#icon-user"/></svg>` (usado em alguns)

Resultado: mistura visual com diferentes tamanhos implícitos, e nos headers com bug BUG-05 os dois são usados simultaneamente.

**Solução:** Definir regra: usar `<use href="#icon-...">` para os ícones do sprite, e SVG inline apenas onde o ícone não existe no sprite. Auditar e migrar os ~45 `use href` para consistência.

---

### INC-07 — `estado-global.js` inicializa `DATA` com tipos errados

**Arquivo:** `estado-global.js`

**Problema:**
```js
let DATA = {
  l10: {},        // inicializado como object
  executive: {},  // inicializado como object
  fsrScorecard: [],
  ...
```

Mas `api-dados.js` provavelmente atribui arrays a `DATA.l10`, `DATA.executive`, etc. Se algum código acessar propriedades (`.filter()`, `.map()`) antes da API retornar, vai falhar com `{}.filter is not a function`.

**Solução:** Revisar `estado-global.js` e garantir que cada campo seja inicializado com o tipo correto (arrays como `[]`, objetos como `{}`). Adicionar guards `Array.isArray()` nas funções que consomem esses dados.

---

### INC-08 — `div.header.top-header-bar` vazio

**Arquivo:** `index.html` (L~371)

**Problema:**
```html
<div class="header top-header-bar"></div>
```
Div vazio sem conteúdo e sem referência JS. Ocupa espaço no DOM sem propósito visível.

**Solução:** Remover, ou usar para exibir `#page-title` (o título da página setado por `showSection()` em `interface.js`).

---

### INC-09 — `performance-fsr.js` e `performance-integration.js` — responsabilidades sobrepostas

**Arquivo:** `performance-fsr.js` (258 linhas), `performance-integration.js` (254 linhas)

**Problema:** Os dois scripts têm quase o mesmo tamanho e nomes relacionados a performance. Sem leitura completa não é possível garantir, mas o padrão `*-integration.js` sugere que um deles integra o outro ao estado global, introduzindo dependência de ordem e potencial colisão de funções.

**Solução:** Documentar explicitamente no cabeçalho de cada arquivo as responsabilidades e quais funções são públicas vs internas. Considerar merge se houver overlap real.

---

### INC-10 — `ALLOWED_EMAILS` em `autenticacao.js` duplica `ADMIN_ALLOWED_EMAILS` em `configuracao.js`

**Arquivos:** `autenticacao.js` (L~10–20), `configuracao.js` (L~5–15)

**Problema:** Existem dois arrays de emails separados:
- `ALLOWED_EMAILS` em `autenticacao.js` — controla **quem pode fazer login**
- `ADMIN_ALLOWED_EMAILS` em `configuracao.js` — controla **quem recebe permissões de admin**

Para usuários admin estes dois arrays devem ser sincronizados (um admin que não estiver em `ALLOWED_EMAILS` não consegue nem logar). Na prática, toda alteração de email admin requer atualização manual em **dois arquivos diferentes**. Uma omissão silenciosamente nega o acesso.

**Solução:** `ADMIN_ALLOWED_EMAILS` deve ser um subconjunto de `ALLOWED_EMAILS`. Centralizar os dois em `configuracao.js` e importar em `autenticacao.js`:
```js
// configuracao.js
const ALLOWED_EMAILS = ['user@xertica.com', 'admin@xertica.com'];
const ADMIN_ALLOWED_EMAILS = ['admin@xertica.com'];
```
```js
// autenticacao.js — importa do configuracao
if (!ALLOWED_EMAILS.includes(email)) { /* block login */ }
```

---

### INC-11 — `processWordClouds()` usa matching de keywords hardcoded (29 frases fixas)

**Arquivo:** `api-dados.js` (função `processWordClouds`, L~760–870)

**Problema:** A análise de word clouds extrai insights de campos de texto livre (`Fatores_Sucesso`, `Causa_Raiz`) usando uma lista hardcoded de 29 frases:
```js
const keyPhrases = [
  'base instalada', 'relacionamento', 'confiança', 'champion', 'sponsor',
  'orçamento', 'budget', 'timing', 'mandato', 'urgência', ...
];
```
- Qualquer variação de grafia não detectada (ex: "confiança" vs "confianca" sem til)
- Termos novos do negócio requerem deploy de código
- Textos longos retornam no máximo 3 keywords independente do conteúdo
- Campos `Tipo_Resultado` de negócios ganhos/perdidos podem ser vazios → cloud vazia

**Solução imediata:** Aumentar cobertura adicionando variações de acentuação. Normalizar o texto com `text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` antes do match.  
**Solução ideal:** Mover essa análise para o backend `/api/analyze-patterns` que já existe, retornando os termos mais frequentes calculados pelo BigQuery.

---

## 🟢 MELHORIAS DE UX

### UX-01 — Feedback visual do filtro ativo por vendedor

**Problema:** Mesmo após implementar o `filterByRep()` e o `currentRepFilter` no JS, o usuário não tem indicação visual clara de que um filtro por vendedor está ativo enquanto navega pelas métricas. Os KPI cards não mostram "Filtrado por: João".

**Solução:**
- Exibir um chip/badge removível no topo do `#filters-container` quando `currentRepFilter !== 'all'`
- Adicionar borda colorida ou indicador nos KPI cards quando filtro de rep está ativo
- Incluir "(Vendedor: X)" no subtítulo do `filters-active-summary`

---

### UX-02 — Nav items sem feedback de hover/active acessível

**Problema:** Os itens de navegação são `<div onclick>` em vez de `<button>` ou `<a>`. Resultado:
- Não ativam com teclado (Tab + Enter)
- Nenhum `role` ARIA declarado
- Apenas 6 `aria-label` em todo o HTML de 2438 linhas

**Solução:**
- Converter `<div class="nav-item">` para `<button class="nav-item">` com `type="button"`
- Adicionar `role="menuitem"` e `aria-current="page"` no item ativo
- Garantir `tabindex="0"` nos elementos interativos que não são nativamente focáveis

---

### UX-03 — Estado de loading sem indicador por seção

**Problema:** O loading geral cobre toda a tela, mas quando o usuário muda de aba (ex: Executive → Aprendizados) e os dados ainda estão carregando, não há indicador inline. `loadAprendizados()` preenche `class="loading"` em cada container, que é bom, mas inconsistente com as outras seções.

**Solução:** Padronizar um componente `<div class="section-loading">` reutilizável com spinner, usado em todas as seções durante carregamento parcial.

---

### UX-04 — "Saúde do Forecast" bars sem labels quando largura é zero

**Problema:** As barras de forecast health usam `display: flex` com `width` proporcional. Quando uma categoria é 0%, a `div` tem largura 0 e o texto "-" fica invisível (ou o texto estoura). Em viewports menores isso piora.

**Solução:**
- Não renderizar `<div>` quando percent = 0 (ou usar `display:none`)
- Usar `min-width` condicional quando o valor é > 0 mas muito pequeno
- Adicionar `overflow: visible` ou tooltip para labels em barras estreitas

---

### UX-05 — Filtros avançados não salvo entre sessões

**Problema:** Ao recarregar a página, todos os filtros voltam ao padrão. O `localStorage` é usado para o tema (dark/light) mas não para os filtros selecionados.

**Solução:** Salvar o estado dos filtros em `localStorage.setItem('xertica-filters', JSON.stringify({quarter, year, sellers, ...}))` ao aplicar, e restaurar em `inicializacao.js`. Atenção: não deve bloquear a experiência se o estado salvo for inválido.

---

### UX-06 — Drilldown sem opção de "abrir no CRM"

**Problema:** O painel de drilldown exibe deals com nome, conta, valor, vendedor — mas não tem link para abrir o deal diretamente no CRM (Pipedrive/Salesforce).

**Solução:** Se o deal tiver campo `deal_url` ou `crm_id`, adicionar botão/link "Ver no CRM" no card do deal dentro do drilldown.

---

### UX-07 — Gráfico de mapa geográfico com altura excessiva (600px)

**Arquivo:** `index.html` (L~1150)

**Problema:**
```html
<div class="chart-wrapper" style="height:600px;"><canvas id="chart-estado"></canvas></div>
```
600px de altura inline para o mapa de estados é muito alto em telas menores, empurrando o resto do conteúdo. O mapa de cidades logo ao lado tem 420px. Alturas hardcoded inline.

**Solução:** Usar uma classe CSS `.chart-wrapper--map` com altura responsiva (ex: `min(600px, 90vw)`), remover o inline style.

---

### UX-08 — Toast notifications sem fila / pilha

**Problema:** Se múltiplos `showToast()` forem chamados em sequência (ex: filtro aplicado + dados carregados), os toasts se sobrepõem ou o último cancela o anterior antes de ser lido.

**Solução:** Implementar fila de toasts com posicionamento empilhado, ou garantir que novos toasts apareçam abaixo dos existentes até timeout individual.

---

## 🔵 DÍVIDA TÉCNICA

### DT-01 — 326 atributos `style=""` inline no HTML

**Arquivo:** `index.html`

**Problema:** `python3` detectou 326 ocorrências de `style="..."` inline. Isso torna impossível aplicar temas consistentemente, aumenta o tamanho do HTML, e impede reutilização.

Top ofensores:
- Forecast health bars (toda a seção usa inline `style="background: linear-gradient(...);"`)
- `filters-container` div com ~150 chars de CSS inline
- Gráficos: `style="height:280px"` em cada `chart-wrapper`
- Deal cards (`Oportunidade-Chave`, `Vitória Destaque`, `Perda Destaque`) com múltiplos inline styles

**Solução:** Migrar progressivamente para classes CSS. Prioridade:
1. Forecast bars → `.forecast-bar--commit`, `.forecast-bar--upside`, etc.
2. Heights dos charts → classes `.chart-h-280`, `.chart-h-300`, `.chart-h-600`
3. `filters-container` → mover para `.filters-container` no CSS

---

### DT-02 — Sem `<meta name="description">` e link rel="preconnect"

**Arquivo:** `index.html` (head)

**Problema:**
- Falta `<meta name="description">` — impacta SEO/indexação mínima
- Falta `<link rel="preconnect" href="https://fonts.googleapis.com">` — carregamento de fonte demora mais
- Falta `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`

**Solução:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<meta name="description" content="Xertica.ai Intelligence Dashboard — Pipeline, Performance e Análise de Vendas">
```

---

### DT-03 — Fonte Google Fonts bloqueia rendering

**Arquivo:** `index.html` (L12)

**Problema:** `<link href="https://fonts.googleapis.com/css2?family=Poppins...">` está no `<head>` sem `media="print" onload="this.media='all'"` ou `rel="preload"`. Bloqueia o render em conexões lentas.

**Solução:**
```html
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Roboto:wght@300;400;500;700&display=swap">
<link rel="stylesheet" href="...fonts..." media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="...fonts..."></noscript>
```

---

### DT-04 — CSS duplicado entre `estilos-principais.css` e `refactor/30-components.css`

**Arquivos:** `estilos/estilos-principais.css` (1654L), `estilos/refactor/30-components.css` (1663L)

**Problema:** Dois arquivos CSS enormes carregados juntos, com convenção de nomenclatura diferente. É muito provável que haja classes duplicadas ou conflitantes (ex: `.kpi-card`, `.ai-card`, `.deal-card`). O refator foi feito sem remover o original.

**Solução:**
1. Rodar uma ferramenta de detecção de duplicatas CSS (ex: `PurgeCSS` ou `stylelint` com plugin)
2. Migrar progressivamente o que está em `estilos-principais.css` para `refactor/30-components.css`
3. Eventual objetivo: eliminar `estilos-principais.css` completamente

---

### DT-05 — `loader.css` com 458 linhas para um loading overlay

**Arquivo:** `loader.css`

**Problema:** 458 linhas para animações de carregamento é excessivo. Parte desse CSS provavelmente cobre casos que não existem mais no HTML (ex: classes do loader antigo).

**Solução:** Auditar `loader.css` e remover classes não referenciadas no HTML. Mover o que restante para `refactor/30-components.css`. Provider: `PurgeCSS` detect unused.

---

### DT-06 — Variáveis globais `isAdminUser`, `currentUserEmail` sem encapsulamento

**Arquivo:** `configuracao.js`

**Problema:**
```js
let currentUserEmail = null;
let isAdminUser = false;
let adminPreviewEnabled = false;
```

Declaradas como `let` em escopo global. Qualquer script pode sobrescrever `isAdminUser = true` no console, dando acesso admin. Já que é um dashboard interno isso é aceitável, mas é arquiteturalmente fraco.

**Solução minimamente melhorada:** Mover para um objeto `AppState` não-enumerável, ou ao menos documentar explicitamente que isso é intencional para compatibilidade de scripts múltiplos.

---

### DT-07 — `inicializacao.js` não awaita `loadDashboardData()`

**Arquivo:** `inicializacao.js` (L43)

**Problema:**
```js
loadDashboardData();      // sem await
enhanceAllKpiCards(document);   // executa imediatamente
initKpiCardInfoObserver();      // executa imediatamente
```

`enhanceAllKpiCards` e `initKpiCardInfoObserver` rodam antes dos dados da API chegarem. Se essas funções dependem de elementos injetados por `loadDashboardData()`, podem falhar silenciosamente.

**Solução:** Encadear via callback ou Promise:
```js
await loadDashboardData();
enhanceAllKpiCards(document);
```
Ou garantir que `enhanceAllKpiCards` use `MutationObserver` e funcione em qualquer momento.

---

### DT-08 — Sem nenhum lint / formatter / build step

**Problema:** O projeto não tem `package.json`, `eslint`, `prettier`, nem build pipeline. Cada JS é servido diretamente como está. Erros de sintaxe JS ou CSS só são descobertos em produção.

**Solução:** Adicionar ao menos:
- `package.json` simples com `eslint` (previne bugs silenciosos)
- `.eslintrc` com `no-undef`, `no-unused-vars`
- Script `npm run lint` executável no CI
- Opcionalmente: `esbuild` ou `vite build` para bundling + minificação

---

### DT-09 — Nenhum tratamento de erro global em fetch

**Arquivo:** `api-dados.js`

**Problema:** Se a Cloud Run API estiver indisponível (503, timeout), cada fetch individual manuseia o erro diferentemente — algunos mostram toast, alguns ficam em loading eterno, alguns silenciam. Não há handler global de `unhandledrejection` ou interceptor de fetch.

**Solução:** Adicionar um wrapper global:
```js
window.addEventListener('unhandledrejection', (e) => {
  console.error('Fetch não tratado:', e.reason);
  showToast('Erro de conexão com a API. Tente atualizar.', 'error');
});
```

---

### DT-10 — Hardcoded ano `2027` como máximo no filtro de ano

**Arquivo:** `index.html` (L~360)

```html
<option value="2027">2027</option>
```

**Problema:** O filtro de ano tem `2024`, `2025`, `2026`, `2027` hardcoded. Em 2028 isso precisará de atualização manual.

**Solução:** Popular o `<select id="year-filter">` dinamicamente em `filtros.js`, gerando opções de `currentYear - 2` até `currentYear + 2`.

---

### DT-11 — `setInterval` de 30s inicia no parse do módulo `utilitarios.js`

**Arquivo:** `utilitarios.js` (fim do arquivo)

**Problema:**
```js
setInterval(updateTimeSinceUpdate, 30000);  // parse-time, não init-time
```
Esse timer começa a correr assim que o browser faz parsing de `utilitarios.js`, que é carregado antes da autenticação e antes dos dados chegarem. Durante os primeiros ciclos, `DATA` é `null` e `updateTimeSinceUpdate()` pode lançar ou exibir "Atualizado: -" de forma enganosa.

**Solução:** Mover para `inicializacao.js` após `loadDashboardData()` resolver, ou proteger com `if (!DATA) return;` dentro de `updateTimeSinceUpdate`.

---

### DT-12 — Listener de click global para fechar dropdown adicionado em parse-time

**Arquivo:** `vendedores.js` (module level)

**Problema:**
```js
document.addEventListener('click', function(e) {
  // fecha seller dropdown se click fora
});
```
Esse listener é registrado no momento do parsing do módulo, antes do usuário abrir qualquer dropdown. Ele fica ativo **para sempre** em cada click do app — mesmo se o dropdown de vendedores nunca foi aberto. Em apps com muitos clicks isso é desperdício de micre-cycles e dificulta debugging de eventos.

**Solução:** Registrar o listener apenas quando o dropdown é aberto (`toggleSellerDropdown` → `document.addEventListener(..., { once: false })`), e remover com `removeEventListener` quando fechado.

---

### DT-13 — `deleteAdminVacation()` sem confirmação de exclusão

**Arquivo:** `admin.js` (função `deleteAdminVacation`)

**Problema:** Um click no botão deletar aciona imediatamente o `DELETE /api/admin/vacations/{id}` sem nenhuma confirmação. Não há como desfazer. Um clique acidental apaga um registro de férias permanentemente no BigQuery.

**Solução:**
```js
async function deleteAdminVacation(vacationId) {
  if (!confirm('Confirmar exclusão desta férias? Esta ação não pode ser desfeita.')) return;
  // ... resto da função
}
```
Ou usar um modal de confirmação customizado alinhado ao design system.

---

### DT-14 — `Promise.all` com 12 APIs sem isolamento de falha individual

**Arquivo:** `api-dados.js` (função `loadDashboardData`, L~60–130)

**Problema:**
```js
const [metrics, pipelineData, prioritiesData, actionsData, wonData, lostData,
       patternsData, salesSpecialistData, insightsRag, fbPipeline, fbWon, fbLost]
  = await Promise.all([...12 calls...]);
```
Se **qualquer uma** das 12 promessas rejeitar (ex: `/api/closed/lost` retorna 500), o `Promise.all` rejeita inteiro e o dashboard não carrega — mesmo que 11 de 12 APIs estejam saudáveis. O usuário vê erro total ao invés de degradação graceful.

**Solução:** Usar `Promise.allSettled()` e processar individualmente os resultados rejeitados:
```js
const results = await Promise.allSettled([...12 calls...]);
const [metrics, pipelineData, ...] = results.map(r => r.status === 'fulfilled' ? r.value : null);
```

---

### DT-15 — `wonAgg` e `lostAgg` com ~35 campos e triple-redundância de nomes

**Arquivo:** `api-dados.js` (função `normalizeCloudResponse`, L~320–520)

**Problema:** Cada objeto em `wonAgg`/`lostAgg` tem ~35 campos, com o mesmo dado exposto sob nomes diferentes:
```js
{
  Vendedor: deal.Vendedor || deal.Owner || deal.owner,  // PascalCase
  seller: deal.Vendedor || deal.Owner || deal.owner,   // snake_case
  owner: deal.Vendedor || deal.Owner || deal.owner,    // duplicata 3
  Conta: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa,
  account: deal.Conta || ...,  // duplicata
  // ...
}
```
Esse padrão torna os objetos 3x maiores, multiplica confusão ao ler código downstream, e impossibilita grep de "onde `seller` é usado" vs "onde `Vendedor` é usado" (são a mesma coisa).

**Solução:** Escolher UMA convenção (recomendado: `camelCase` para campos derivados) e migrar todos os consumidores. Documentar o mapeamento campo-a-campo em um comentário de referência.

---

### DT-16 — `normalizeCloudResponse()` tem 500+ linhas — mega-função não decomponível

**Arquivo:** `api-dados.js` (L~170–770)

**Problema:** Uma única função de 600 linhas que:
1. Itera pipeline e constrói `wonAgg`/`lostAgg`
2. Calcula `fsrScorecard` por vendedor
3. Processa `salesSpecialist` com agregações
4. Monta `cloudAnalysis` completo
5. Chama `processWordClouds()`
6. Define closure `deriveFiscalQuarter()` internamente

Isso impossibilita testes unitários, profiling de performance individual, e qualquer forma de lazy evaluation.

**Solução:** Decompor em funções nomeadas extraídas:
- `buildDealAggregation(pipelineDeals, wonDeals, lostDeals)` → `{ wonAgg, lostAgg }`
- `buildFsrScorecard(sellerStats)` → `fsrScorecard`
- `buildSalesSpecialistAgg(salesSpecialistDeals)` → `salesSpecialist`
- `buildCloudAnalysis(pipeline, metrics)` → `cloudAnalysis`

---

### DT-17 — `USE_MINIMAL_LOADER = false` — constante dead code

**Arquivo:** `utilitarios.js` (L~5)

**Problema:**
```js
const USE_MINIMAL_LOADER = false;  // Never changed, never read
```
Constante declarada mas nunca lida nem alternada em nenhum lugar do codebase. Poluição.

**Solução:** Remover.

---

### DT-18 — `createAdminVacation()` não limpa campos de data após salvar

**Arquivo:** `admin.js` (função `createAdminVacation`)

**Problema:** Após salvar uma férias com sucesso, o código faz `form.notes.value = ''` mas não faz reset dos campos `start_date` e `end_date`. O usuário que cadastra múltiplas férias consecutivas pode inadvertidamente submeter novamente com as mesmas datas sem perceber.

**Solução:** Após salvar com sucesso:
```js
form.reset();  // ou limpar cada campo explicitamente
form.start_date.value = '';
form.end_date.value = '';
form.notes.value = '';
```

---

## ⚫ BACKEND / API / CROSS-REFERENCE

> Findings do audit de `simple_api.py` (2059L), `performance.py` (1047L), `weekly_agenda.py` (1927L), e demais endpoints.

---

### API-01 — CORS `allow_origins=["*"]` + `allow_credentials=True` é inválido por spec

**Arquivo:** `cloud-run/app/simple_api.py` (L~34–40)

**Problema:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # wildcard
    allow_credentials=True,    # credenciais
    ...
)
```
A especificação CORS proíbe explicitamente a combinação `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Credentials: true`. Qualquer browser moderno **rejeita** a resposta quando ambos estão presentes em conjunto para requests credenciados. O requisito aqui é especificar origens exatas.

**Solução:**
```python
allow_origins=["https://x-gtm.web.app", "https://x-gtm.firebaseapp.com"],
allow_credentials=True,
```
Ou se não precisar de credentials, manter `"*"` e remover `allow_credentials=True`.

---

### API-02 — Cache in-memory não compartilhado entre instâncias Cloud Run

**Arquivo:** `cloud-run/app/simple_api.py` (L~70–100)

**Problema:**
```python
CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 120  # 2 minutos
```
O dicionário `CACHE` é in-process. Cloud Run escala horizontalmente — com 3 instâncias ativas, cada uma tem sua própria cópia do cache. Um usuário pode receber dados com 0s de cache ou 119s de cache dependendo de qual instância atende o request. Não há invalidação global.

**Solução:** Para o contexto atual (dados de BI que atualizam a cada hora), o impacto é baixo. Mas para futuro: usar Cloud Memorystore (Redis) como cache compartilhado, ou aumentar o TTL para 300s e aceitar o eventual consistency.

---

### API-03 — `get_bq_client()` cria cliente BigQuery em cada requisição (sem pooling)

**Arquivo:** `cloud-run/app/simple_api.py` (L~138–139), replicado em `performance.py`, `weekly_agenda.py`

**Problema:**
```python
def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)  # nova instância a cada call
```
Esse padrão é repetido em 4 arquivos diferentes. A inicialização do `bigquery.Client` envolve autenticação e configuração de transporte HTTP — é custosa. Em endpoints sem cache, cada HTTP request cria um novo cliente BQ.

**Solução:** Usar um singleton local por módulo:
```python
_bq_client = None
def get_bq_client():
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client
```

---

### API-04 — Endpoint `/api/filter-options` existe mas não é chamado pelo frontend

**Arquivo:** `simple_api.py` (L~925), `api-dados.js`

**Problema:** O backend expõe `GET /api/filter-options` que retorna os valores distintos disponíveis para todos os filtros (vertical, sub-vertical, segmento, cidade, estado, etc.). O frontend **não chama esse endpoint** — em vez disso, as opções de filtro avançado são populadas estaticamente ou ficam em branco até que o usuário veja dados.

Isso significa que os filtros avançados dropdown (`Vertical`, `Sub-Vertical`, `Segmento`, `Cidade`, `Estado`) não refletem os valores reais que existem nos dados — podem mostrar opções que não têm deals, ou não mostrar valores que existem.

**Solução:** Em `filtros.js`, ao inicializar os filtros avançados, chamar:
```js
fetch(`${API_BASE}/api/filter-options?seller=${currentSeller}`)
  .then(r => r.json())
  .then(opts => populateAdvancedFilterOptions(opts));
```

---

### API-05 — `FORCED_ACTIVE_SELLERS` com nome hardcoded em source code

**Arquivo:** `cloud-run/app/simple_api.py` (L~67–70)

**Problema:**
```python
FORCED_ACTIVE_SELLERS = {"rayssa zevolli"}
SELLER_DISPLAY_OVERRIDES = {
    "rayssa zevolli": "Rayssa Zevolli",
}
```
Nome de vendedor hardcoded no source code. Uma mudança de nome ou entrada de novo vendedor com capitalização irregular requer alteração de código e redeploy.

**Solução:** Mover para variável de ambiente `FORCED_ACTIVE_SELLERS=rayssa zevolli` e `SELLER_DISPLAY_OVERRIDES=rayssa zevolli:Rayssa Zevolli`, ou gerenciar via tabela BigQuery de configuração.

---

### API-06 — Sem autenticação no nível da API — qualquer pessoa com a URL acessa todos os dados

**Arquivo:** `cloud-run/app/simple_api.py` — todos os endpoints

**Problema:** Os endpoints `/api/closed/won`, `/api/closed/lost`, `/api/pipeline`, etc. retornam até 5.000 registros de deals com nomes de clientes, valores, e dados comerciais sensíveis. Não há verificação de token Firebase nem de header de autenticação antes de servir os dados. A segurança perimetral depende inteiramente do Google Cloud Run IAM (`allUsers` negado) + Cloud IAP se configurado.

Se a URL da API vazar (está hardcoded em `api-dados.js` e portanto visível no fonte do site público), qualquer pessoa pode chamá-la diretamente.

**Solução imediata (sem redesign):** Verificar se Cloud IAP está habilitado no Cloud Run. Se não, habilitar.  
**Solução robusta:** O frontend já envia o Firebase ID token via header — adicionar middleware FastAPI que valida o token antes de servir `/api/*`:
```python
from google.oauth2 import id_token as google_id_token
@app.middleware("http")
async def verify_firebase_token(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        # validate with Firebase Admin SDK
```

---

### API-07 — `deriveFiscalQuarter()` duplicado em frontend e backend sem fonte única de verdade

**Arquivos:** `api-dados.js` (closure dentro de `normalizeCloudResponse`), `performance.py` (`fiscal_quarter_from_date`), `weekly_agenda.py` (`fiscal_quarter_from_date`), `simple_api.py` (inline computation)

**Problema:** A lógica de "qual trimestre fiscal corresponde a esta data" está implementada em pelo menos 4 lugares diferentes (1 JS, 3 Python). Se as regras do fiscal year mudarem (ex: FY começa em fevereiro ao invés de janeiro), é necessário alterar 4 arquivos. Já foram observadas divergências onde o frontend exibe "FY26-Q2" e o backend retorna dados para "FY26-Q1" para o mesmo conjunto de deals.

**Solução:** Centralizar no backend em `simple_api.py` como função canônica. Frontend não deve recomputar fiscal quarter — deve usar os campos `Fiscal_Quarter` já normalizados que vêm dos dados.

---

## Priorização Sugerida

### Sprint 1 — Bugs que afetam funcionalidade ativa (impacto imediato)
| # | Item | Esforço |
|---|---|---|
| 1 | BUG-01: Adicionar `#rep-filter` no HTML | 1h |
| 2 | BUG-02: Adicionar aba "Guia" no tab row | 30min |
| 3 | BUG-05: Remover ícones duplos nos section headers | 30min |
| 4 | BUG-07: Corrigir `debounceFilter` para awaitar async | 30min |
| 5 | BUG-08: Corrigir `clearDashboardCache` para limpar cache de fato | 20min |
| 6 | DT-13: Adicionar confirmação em `deleteAdminVacation` | 20min |
| 7 | INC-01: Corrigir comentário Admin/ML | 5min |
| 8 | INC-02: Remover `nav-fsr-item` duplicado | 15min |
| 9 | INC-08: Remover div vazio `.top-header-bar` | 5min |

### Sprint 2 — Limpeza de código morto
| # | Item | Esforço |
|---|---|---|
| 10 | BUG-04: Remover War Room do interface.js | 1h |
| 11 | BUG-03: Limpar IDs órfãos em populateStaticKPIs | 30min |
| 12 | BUG-06: Consolidar agenda-semanal scripts | 2h |
| 13 | INC-04: Deletar paginas/ orphaned | 5min |
| 14 | DT-10: `year-filter` dinâmico | 30min |
| 15 | DT-17: Remover `USE_MINIMAL_LOADER` dead constant | 5min |
| 16 | DT-11: Mover `setInterval` para após init | 20min |
| 17 | DT-12: Registrar click listener on-demand (seller dropdown) | 30min |

### Sprint 3 — CSS / Performance
| # | Item | Esforço |
|---|---|---|
| 18 | INC-05: Concatenar refactor CSS (eliminar @imports) | 1h |
| 19 | DT-02: Adicionar preconnect e meta description | 15min |
| 20 | DT-03: Font loading não-bloqueante | 30min |
| 21 | DT-01: Migrar top 50 inline styles para classes | 3h |
| 22 | DT-04: Auditoria CSS duplicado | 4h |
| 23 | DT-05: Reduzir loader.css | 2h |

### Sprint 4 — UX e Acessibilidade
| # | Item | Esforço |
|---|---|---|
| 24 | UX-01: Chip de filtro ativo por vendedor | 2h |
| 25 | UX-02: Nav items como `<button>` + ARIA | 2h |
| 26 | UX-04: Forecast bars sem glitch zero-width | 1h |
| 27 | UX-05: Salvar filtros em localStorage | 3h |
| 28 | UX-07: Alturas de gráficos responsive | 1h |
| 29 | UX-08: Fila de toasts | 1h |

### Sprint 5 — Arquitetura Frontend
| # | Item | Esforço |
|---|---|---|
| 30 | DT-07: `await loadDashboardData()` | 1h |
| 31 | DT-08: Adicionar ESLint + npm scripts | 3h |
| 32 | DT-09: Handler global de fetch errors | 2h |
| 33 | DT-14: Migrar `Promise.all` para `Promise.allSettled` | 2h |
| 34 | DT-15: Normalizar nomenclatura wonAgg/lostAgg | 4h |
| 35 | DT-16: Decompor `normalizeCloudResponse` em sub-funções | 4h |
| 36 | DT-18: Reset campos data após salvar férias | 15min |
| 37 | INC-07: Corrigir tipos iniciais em estado-global.js | 1h |
| 38 | INC-09: Documentar performance-fsr vs integration | 1h |
| 39 | INC-10: Centralizar ALLOWED_EMAILS + ADMIN_ALLOWED_EMAILS | 1h |
| 40 | INC-11: Melhorar NLP do processWordClouds | 3h |

### Sprint 6 — Backend / API
| # | Item | Esforço |
|---|---|---|
| 41 | API-01: Fixar CORS (origins explícitas) | 30min |
| 42 | API-03: Singleton `get_bq_client()` em todos os módulos | 1h |
| 43 | API-05: Mover FORCED_ACTIVE_SELLERS para env var | 30min |
| 44 | API-04: Chamar `/api/filter-options` no frontend | 2h |
| 45 | API-07: Centralizar `deriveFiscalQuarter` no backend | 3h |
| 46 | API-02: Documentar limitação de cache multi-instância | 30min |
| 47 | API-06: Avaliar e configurar Cloud IAP + token validation | 4h |

---

## Notas de Arquitetura para o Futuro

### Frontend
1. **Componentização:** Com 2438 linhas de HTML e 10k+ de JS, a manutenibilidade está no limite. A próxima evolução natural é migrar para um framework leve (Lit, Alpine.js, ou mesmo Vue 3 CDN) que permita componentes reutilizáveis.

2. **State Management:** O estado atual é um mix de variáveis globais (`DATA`, `window.*`, `let` no escopo de módulo). Foram contados **79 globals únicos** via `window.*` no codebase. Um padrão simples de pub/sub ou um objeto `Store` centralizado evitaria bugs de timing e order-dependency.

3. **API Layer unificado:** `api-dados.js` (918 linhas) é o único ponto de contato com o backend. Está bem centralizado, mas seria melhorado com interceptors de erro, retry logic, e cache inteligente (hoje `clearDataCache()` existe mas é manual).

4. **CSS Architecture:** O projeto já iniciou o refactor (pasta `refactor/`) com tokens, base, layout, components, overrides. O trabalho está 70% feito — falta completar a migração saindo de `estilos-principais.css` e remover os @imports em cascata.

### Backend
5. **Sem auth middleware:** Todos os dados de CRM (deals, valores, contas) são acessíveis a qualquer um com a URL da API. Configurar Cloud IAP ou validar Firebase tokens no middleware FastAPI antes do próximo crescimento de dados sensíveis.

6. **Lógica fiscal duplicada:** `deriveFiscalQuarter` implementada em 4 lugares diferentes. Centralizar no backend como única source of truth.

7. **Endpoints não utilizados:** `/api/filter-options` existe mas nunca é chamado pelo frontend. Isso representa trabalho desperdiçado e filtros que não refletem a realidade dos dados.

8. **Arquitetura de arquivo único:** `simple_api.py` tem 2059 linhas com todos os endpoints principais. Os módulos de `endpoints/` foram criados para endereçar isso, mas a migração está incompleta (performance, metrics, pipeline ainda em `simple_api.py`).
