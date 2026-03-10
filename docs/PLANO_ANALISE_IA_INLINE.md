# Plano: Análise Estratégica de IA — Migração para Aba Inline

**Data:** 2026-02-26  
**Status:** Planejamento  
**Prioridade:** Alta — UX quebrada no painel slide atual

---

## 1. Contexto e Problema

### Situação Atual
A Análise Estratégica de IA vive hoje em um **painel deslizante lateral** (`#ai-strategy-panel`) acionado por um botão trigger. O painel aparece como overlay por cima do conteúdo.

**Problemas reportados:**
- O card fica visualmente desagregado — o painel slide flutua sobre a UI sem ancoragem clara
- Experiência inconsistente com o restante do dashboard (que é baseado em seções inline)
- O conteúdo fica escondido atrás de uma camada de interação extra (clique no botão → painel abre)
- Em telas menores o painel ocupa espaço crítico e conflita com outros elementos

### Referência Visual Desejada
O visual do componente **Aprendizados** (`#aprendizados .apr-shell`) é o benchmark:
- Shell com borda suave, `border-radius: 16px`, fundo com gradiente escuro
- Header com título + ícone de sparkles + subtítulo + badges de contexto de filtros
- Botão "Atualizar" no canto superior direito
- KPI cards em grid responsivo antes do conteúdo
- Cards de insight em layout 2 colunas com divisores nomeados

---

## 2. Solução Proposta

### Abordagem: Nova Aba "Análise IA" antes de "Guia"

**Mudanças estruturais:**

1. **Remover** o slide panel (`#ai-strategy-panel`, overlay, botão trigger `ai-strategy-trigger-btn`)
2. **Adicionar** nova aba na barra de tabs, posicionada **antes do "Guia"**:
   ```
   [Resumo] [Mapa de Palavras] [Principais Oportunidades] [Análise IA ✦] [Guia]
   ```
3. **Criar** o conteúdo da aba com shell estilo Aprendizados
4. **Redirecionar** a lógica de dashboard.js para popular `#exec-ia-content` (novo container inline) ao invés de `#executive-content` (panel)
5. **Garantir** reatividade total aos filtros globais de booking

---

## 3. Arquitetura Detalhada

### 3.1 HTML — Nova Aba (index.html)

**Tab button** — inserir antes do botão "Guia" (linha ~581):
```html
<button class="exec-tab" data-tab="analise-ia" onclick="switchExecTab('analise-ia')">
  <svg class="exec-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
  Análise IA
</button>
```

**Tab content** — inserir antes do bloco "TAB CONTENT: GUIA DE INTERPRETAÇÃO":

```html
<!-- TAB CONTENT: ANÁLISE ESTRATÉGICA IA -->
<div class="exec-tab-content" data-content="analise-ia" style="display: none;">
  <style>
    /* Scoped — mesmo padrão do #aprendizados */
    .ia-shell { display:flex; flex-direction:column; gap:20px; padding:18px;
      border:1px solid var(--ui-border-soft); border-radius:16px;
      background:linear-gradient(180deg, var(--ui-bg-surface-1), var(--ui-bg-surface-2)); }
    .ia-header { display:flex; align-items:flex-start; justify-content:space-between;
      gap:14px; flex-wrap:wrap; }
    .ia-title { margin:0; display:flex; align-items:center; gap:10px; color:var(--ui-text-1); }
    .ia-sub { margin:6px 0 0; color:var(--ui-text-2); font-size:12px; max-width:760px; }
    .ia-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .ia-meta-badge { padding:5px 10px; border-radius:999px;
      border:1px solid var(--ui-border-soft); background:var(--ui-bg-surface-2);
      color:var(--ui-text-2); font-size:11px; font-weight:700; letter-spacing:0.02em; }
    .ia-meta-badge.active { border-color:var(--ui-cyan); color:var(--ui-cyan);
      background:rgba(0,190,255,0.06); }
    .ia-refresh { display:flex; align-items:center; gap:6px; padding:8px 14px;
      border-radius:999px; border:1px solid var(--ui-border-soft);
      background:var(--ui-bg-surface-1); color:var(--ui-text-2);
      font-size:12px; font-weight:700; cursor:pointer; transition:all .18s ease; }
    .ia-refresh:hover { color:var(--ui-text-1); border-color:var(--ui-border-strong);
      background:var(--ui-bg-surface-hover); }
    .ia-divider { position:relative; margin:8px 0 4px;
      border-top:1px solid var(--ui-border-soft); }
    .ia-divider span { position:relative; top:-10px; display:inline-flex;
      align-items:center; padding:2px 10px; border-radius:999px;
      border:1px solid var(--ui-border-soft); background:var(--ui-bg-surface-2);
      color:var(--ui-text-2); font-size:10px; font-weight:700;
      letter-spacing:.08em; text-transform:uppercase; }
    .ia-cards-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    @media (max-width: 767px) {
      .ia-cards-grid { grid-template-columns:1fr; }
      .ia-shell { padding:14px; gap:16px; }
    }
  </style>

  <div class="ia-shell">
    <!-- Header — espelha apr-header do Aprendizados -->
    <div class="ia-header">
      <div>
        <h3 class="ia-title">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:var(--ui-cyan);">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Análise Estratégica
          <span id="ia-badge-label" style="font-size:10px;font-weight:700;
            letter-spacing:.06em;padding:3px 8px;border-radius:999px;
            background:rgba(0,190,255,0.12);color:var(--ui-cyan);
            border:1px solid rgba(0,190,255,0.25);text-transform:uppercase;">IA</span>
        </h3>
        <p class="ia-sub">Diagnóstico automático com base nos dados filtrados do quarter.</p>
        <div id="ia-filter-badges" class="ia-meta">
          <!-- Populado por JS quando há filtros ativos -->
        </div>
      </div>
      <button class="ia-refresh" id="ia-refresh-btn" onclick="window.refreshIAAnalysis && window.refreshIAAnalysis()">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
          stroke="currentColor" stroke-width="2.5">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Atualizar
      </button>
    </div>

    <!-- Divisor: Diagnósticos -->
    <div class="ia-divider"><span>Diagnósticos</span></div>

    <!-- Grid de cards de diagnóstico — populado por JS -->
    <div id="exec-ia-content" class="ia-cards-grid">
      <!-- Estado inicial de loading -->
      <div style="grid-column:1/-1;display:flex;align-items:center;
        gap:10px;padding:18px;color:var(--ui-text-2);font-size:13px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="width:18px;height:18px;animation:spin 1s linear infinite;flex-shrink:0;">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Carregando análise estratégica…
      </div>
    </div>

    <!-- Divisor: Próximas Ações -->
    <div class="ia-divider"><span>Próximas Ações</span></div>

    <!-- Action steps — populado por JS -->
    <div id="exec-ia-actions" style="display:flex;flex-direction:column;gap:8px;">
    </div>

  </div><!-- /ia-shell -->
</div><!-- /TAB: ANÁLISE IA -->
```

**Remoções no HTML:**
- Remover o bloco `#ai-strategy-overlay` e `#ai-strategy-panel` (linhas ~1226–1270)
- Remover a âncora de comentário `<!-- ANÁLISE ESTRATÉGICA (IA) — slide panel trigger slot -->`
- Remover qualquer `ai-strategy-trigger-btn` restante

---

### 3.2 JS — dashboard.js

**Redirect do container de saída (linha ~643):**

Alterar a referência de `#executive-content` para `#exec-ia-content`:
```js
// ANTES
const execContentEl = document.getElementById('executive-content');

// DEPOIS
const execContentEl = document.getElementById('exec-ia-content');
const execActionsEl = document.getElementById('exec-ia-actions');
```

**Badges de filtro ativos (dentro de updateDashboard, após gerar diagCards):**

```js
// Popula badges de contexto de filtro na aba de Análise IA
const iaBadgesEl = document.getElementById('ia-filter-badges');
if (iaBadgesEl) {
  const badges = [];
  if (window.currentFilters) {
    const f = window.currentFilters;
    if (f.year)    badges.push(`Ano: ${f.year}`);
    if (f.quarter) badges.push(`Q${f.quarter}`);
    if (f.month)   badges.push(`Mês: ${f.month}`);
    if (f.seller)  badges.push(`Vendedor: ${f.seller}`);
    if (f.vertical_ia) badges.push(`Vertical: ${f.vertical_ia}`);
    if (f.billing_state) badges.push(`Estado: ${f.billing_state}`);
    // ... demais filtros relevantes
  }
  if (badges.length === 0) {
    iaBadgesEl.innerHTML =
      '<span class="ia-meta-badge">Todos os dados do quarter</span>';
  } else {
    iaBadgesEl.innerHTML = badges
      .map(b => `<span class="ia-meta-badge active">${b}</span>`)
      .join('');
  }
}
```

**Separar ações em container próprio:**

Atualmente `actionSteps` são renderizados dentro do mesmo `innerHTML` que os `diagCards`. Refatorar para:
1. `exec-ia-content` recebe apenas os `diagCards` (grid 2 colunas)
2. `exec-ia-actions` recebe os `actionSteps` em lista

**Exposição do refresh (dentro de updateDashboard):**
```js
// Permite que o botão "Atualizar" da aba reexecute o dashboard
window.refreshIAAnalysis = () => {
  if (typeof updateDashboard === 'function') updateDashboard();
};
```

**Remover** `openAIPanel` / `closeAIPanel` / `toggleExecutiveAnalysis` de `abas.js` (ou mantê-los como stubs vazios para backward-compat com qualquer referência legada).

---

### 3.3 JS — abas.js

Adicionar `refreshIAAnalysis` wrapper e garantir que ao entrar na aba `analise-ia` o conteúdo seja válido (já existe pois é gerado ao carregar dashboard):

```js
// Após switchExecTab existente — garantir que conteúdo IA seja visível ao entrar na aba
// (nada extra necessário: o conteúdo já é populado ao loadDashboard)
```

Remover ou esvaziar `openAIPanel` / `closeAIPanel` / `toggleExecutiveAnalysis`.

---

### 3.4 CSS — 40-overrides.css

**Adicionar:**
- Regras `.ia-tab-pulse` — animação sutil no ícone da aba para indicar que a análise foi atualizada
- Variante de cor para badge IA (`background: rgba(0,190,255,0.12)`)
- Suporte `[data-theme="light"]` nos elementos `.ia-*` (espelhar padrão das regras existentes de `.apr-*`)

**Remover (ou comentar para backup):**
- Bloco `.ai-strategy-panel` (linhas 532–665)
- Bloco `.ai-strategy-trigger-btn` (linhas 634–661)
- Bloco light-theme overrides para `ai-strategy-*` (linhas 666–679)

---

## 4. Reatividade a Filtros Globais

A análise já é **totalmente reativa** porque é recalculada dentro de `updateDashboard()`, que é disparado pelo `reloadDashboard()` em `filtros.js` a cada mudança de filtro. O fluxo completo:

```
Usuário muda filtro
  → filtros.js: reloadDashboard()
    → dashboard.js: updateDashboard(data, filters)
      → recalcula diagCards com displayPipelineGross, displayConversionRate, etc.
        (que já usam apiFilteredData quando hasActiveFilters=true)
      → popula #exec-ia-content com novo HTML
      → atualiza #ia-filter-badges com filtros ativos
```

**Nenhuma lógica adicional de filtragem é necessária** — basta redirecionar o output para o novo container.

---

## 5. Checklist de Implementação

### Fase 1 — HTML (index.html)
- [ ] Adicionar botão da aba `analise-ia` antes do botão `guia` (linha ~581)
- [ ] Adicionar bloco `exec-tab-content[data-content="analise-ia"]` antes do bloco guia (linha ~1537)
- [ ] Remover `#ai-strategy-overlay` e `#ai-strategy-panel` (linhas ~1226–1270)
- [ ] Remover comentário/slot "slide panel trigger slot"

### Fase 2 — JavaScript (dashboard.js)
- [ ] Trocar `document.getElementById('executive-content')` → `'exec-ia-content'`
- [ ] Extrair `actionSteps` HTML para `#exec-ia-actions` (separado dos diagCards)
- [ ] Adicionar lógica de badges de filtro em `#ia-filter-badges`
- [ ] Expor `window.refreshIAAnalysis`

### Fase 3 — JavaScript (abas.js)
- [ ] Remover `openAIPanel`, `closeAIPanel`, `toggleExecutiveAnalysis` (ou tornar stubs)

### Fase 4 — CSS (40-overrides.css)
- [ ] Remover bloco `.ai-strategy-panel` e relacionados
- [ ] Confirmar que variáveis `--ui-*` usadas nas regras `.ia-*` existem (ou usar fallbacks)

### Fase 5 — QA
- [ ] Verificar que a aba aparece ativa com conteúdo ao abrir o dashboard
- [ ] Trocar filtro de ano/quarter → badges atualizam + cards recalculam
- [ ] Trocar filtro de vendedor → impacto visível nos valores dos cards
- [ ] Testar em mobile (< 768px) — layout single-column
- [ ] Verificar tema claro (light mode)
- [ ] Confirmar que nenhuma referência a `openAIPanel` quebra em produção

---

## 6. Wireframe Comparativo

```
ANTES (Slide Panel)
─────────────────────────────────────────────────────
[Resumo] [Mapa] [Oportunidades] [Guia]
  ↕
  [Botão trigger: "Ver Análise Estratégica →"]
         ↓ (clique)
  ┌──────────────────────────┐
  │  Análise Estratégica  ✦ │  ← painel slide sobreposto
  │  ──────────────────────  │
  │  🚨 Win Rate Crítico     │
  │  ...                     │
  └──────────────────────────┘


DEPOIS (Aba Inline — estilo Aprendizados)
─────────────────────────────────────────────────────
[Resumo] [Mapa] [Oportunidades] [Análise IA ✦] [Guia]
                                       ↓ (aba ativa)
┌──────────────────────────────────────────────────────┐
│  ✦ Análise Estratégica  [IA]              [Atualizar]│
│  Diagnóstico automático com base nos dados filtrados  │
│  ├─ [Q1 2026] [Vendedor: João] ← badges de filtro    │
│                                                        │
│  ── DIAGNÓSTICOS ───────────────────────────────────  │
│  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ 🚨 Win Rate Crítico │  │ 📊 Pipeline Saudável   │ │
│  │ $36M em perdas      │  │ Cobertura 18.5×         │ │
│  │ ...                 │  │ ...                     │ │
│  └─────────────────────┘  └─────────────────────────┘ │
│  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ ⏰ Risco de Quarter │  │ 💼 Curadoria Ausente   │ │
│  │ ...                 │  │ ...                     │ │
│  └─────────────────────┘  └─────────────────────────┘ │
│                                                        │
│  ── PRÓXIMAS AÇÕES ─────────────────────────────────  │
│  1. [URGENTE] Filtro de Entrada — ...                 │
│  2. Qualificação BANT — ...                           │
└──────────────────────────────────────────────────────┘
```

---

## 7. Impacto e Riscos

| Item | Impacto | Mitigação |
|------|---------|-----------|
| Remoção do slide panel | Visual limpo, sem overhead de interação | Manter stubs das funções `openAIPanel`/`closeAIPanel` para evitar erros JS |
| Reuso do `executive-content` ID | Nenhum impacto — apenas atualiza o destino | Buscar no codebase por outros usos de `#executive-content` antes de remover |
| `DATA.aiAnalysis.executive` (path alternativo) | A lógica de cache de análise (`DATA.aiAnalysis`) já existe | Redirecionar para o mesmo novo container |
| CSS `ai-strategy-*` removido | Reduz CSS morto | Mover para arquivo `backup/` antes de deletar |

---

## 8. Estimativa de Esforço

| Tarefa | Estimativa |
|--------|-----------|
| HTML: nova aba + remoção do panel | ~30 min |
| JS: redirect container + badges + actions split | ~45 min |
| CSS: remoção do slide panel + ajustes | ~20 min |
| QA completo (filtros + móvel + tema) | ~30 min |
| **Total** | **~2h 15min** |
