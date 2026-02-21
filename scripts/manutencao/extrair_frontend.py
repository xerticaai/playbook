#!/usr/bin/env python3
"""
Extrai o monólito public/index.html em arquivos separados organizados por função.
Cria:
  public/estilos/animacoes-carregamento.css
  public/estilos/estilos-principais.css
  public/scripts/configuracao.js
  public/scripts/estado-global.js
  public/scripts/utilitarios.js
  public/scripts/explicacoes-kpi.js
  public/scripts/admin.js
  public/scripts/vendedores.js
  public/scripts/filtros.js
  public/scripts/api-dados.js
  public/scripts/dashboard.js
  public/scripts/metricas-executivas.js
  public/scripts/detalhes-vendedor.js
  public/scripts/agenda-semanal.js
  public/scripts/interface.js
  public/scripts/aprendizados.js
  public/scripts/abas.js
  public/scripts/ml.js
  public/scripts/performance-fsr.js
  public/scripts/autenticacao.js
  public/scripts/inicializacao.js
"""
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
HTML_FILE = ROOT / "public" / "index.html"
BACKUP_FILE = ROOT / "public" / "index.html.bak"

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def read_lines():
    with open(HTML_FILE, encoding="utf-8") as f:
        return f.readlines()

def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✓  {path.relative_to(ROOT)}")

def strip_indent(lines, strip_leading=4):
    """Remove up to `strip_leading` spaces from each line (preserves relative indent)."""
    result = []
    for ln in lines:
        if ln.startswith(" " * strip_leading):
            result.append(ln[strip_leading:])
        else:
            result.append(ln)
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 – read the file and locate block boundaries
# ─────────────────────────────────────────────────────────────────────────────

lines = read_lines()
print(f"Lendo {HTML_FILE.name}: {len(lines)} linhas")

# Back up original
shutil.copy(HTML_FILE, BACKUP_FILE)
print(f"Backup: {BACKUP_FILE.name}")

# ── find <style> blocks ──────────────────────────────────────────────────────
style_blocks = []  # list of (start_line_idx, end_line_idx) – 0-based, inclusive
i = 0
while i < len(lines):
    if re.match(r"\s*<style\b", lines[i]):
        start = i
        while i < len(lines) and not re.match(r"\s*</style>", lines[i]):
            i += 1
        style_blocks.append((start, i))  # end points at </style> line
    i += 1

print(f"Blocos <style> encontrados: {len(style_blocks)}  "
      f"(linhas {[f'{s+1}-{e+1}' for s,e in style_blocks]})")

# ── find <script> blocks ─────────────────────────────────────────────────────
# We want:
#   script_main  – the big inline block (first large inline <script>)
#   script_auth  – the Firebase auth block (last inline <script>)
# External <script src="..."> tags are kept in HTML.

script_blocks = []  # list of (start_idx, end_idx, kind)
i = 0
while i < len(lines):
    ln = lines[i]
    # Inline script without src=
    if re.match(r"\s*<script\b", ln) and "src=" not in ln:
        start = i
        while i < len(lines) and not re.match(r"\s*</script>", lines[i]):
            i += 1
        script_blocks.append((start, i))
    i += 1

print(f"Blocos <script> inline encontrados: {len(script_blocks)}  "
      f"(linhas {[f'{s+1}-{e+1}' for s,e in script_blocks]})")

# The big JS block is the longest one; the auth block is typically last
script_blocks.sort(key=lambda x: x[1] - x[0], reverse=True)
main_js_block = script_blocks[0]  # biggest block

# Auth block = the one that contains FIREBASE_CONFIG or ALLOWED_EMAILS
auth_js_block = None
for blk in script_blocks[1:]:
    blk_text = "".join(lines[blk[0]:blk[1]])
    if "FIREBASE_CONFIG" in blk_text or "ALLOWED_EMAILS" in blk_text:
        auth_js_block = blk
        break

print(f"Bloco JS principal: linhas {main_js_block[0]+1}–{main_js_block[1]+1}")
if auth_js_block:
    print(f"Bloco JS auth: linhas {auth_js_block[0]+1}–{auth_js_block[1]+1}")

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 – extract CSS blocks
# ─────────────────────────────────────────────────────────────────────────────
print("\n── Extraindo CSS ──────────────────────────────────────────")

def extract_css(block_idx):
    s, e = style_blocks[block_idx]
    # Skip the <style> and </style> lines themselves
    inner = lines[s+1:e]
    return "".join(strip_indent(inner, 4))

if len(style_blocks) >= 1:
    write_file(ROOT / "public/estilos/animacoes-carregamento.css",
               extract_css(0))

if len(style_blocks) >= 2:
    write_file(ROOT / "public/estilos/estilos-principais.css",
               extract_css(1))

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 – extract and split main JS block
# ─────────────────────────────────────────────────────────────────────────────
print("\n── Extraindo JavaScript ────────────────────────────────────")

js_start, js_end = main_js_block
# Skip the <script> opening line and </script> closing line
js_lines = lines[js_start+1:js_end]

# We'll work with the raw JS line array.
# Use 0-based indices *within* js_lines.
# The mapping: js_lines[k]  == lines[js_start + 1 + k]
# html_line_1based = js_start + 2 + k

def html_to_js_idx(html_line_1based):
    """Convert 1-based HTML line number to 0-based index in js_lines."""
    return html_line_1based - (js_start + 2)

def js_slice(from_html, to_html_inclusive):
    """Return js_lines[from:to+1] by 1-based HTML line numbers."""
    return js_lines[html_to_js_idx(from_html): html_to_js_idx(to_html_inclusive) + 1]

def write_js(rel_path, content_lines, header_comment=""):
    code = (header_comment + "\n" if header_comment else "") + "".join(strip_indent(content_lines, 4))
    write_file(ROOT / "public" / rel_path, code)

# ── Locate section boundaries dynamically using pattern matching ─────────────

def find_line_matching(pattern, start_idx=0, end_idx=None):
    """Return first 0-based index in js_lines where pattern matches."""
    rng = js_lines[start_idx: end_idx]
    for i, ln in enumerate(rng):
        if re.search(pattern, ln):
            return start_idx + i
    return None

def find_last_line_matching(pattern, start_idx=0, end_idx=None):
    rng = js_lines[start_idx: end_idx]
    result = None
    for i, ln in enumerate(rng):
        if re.search(pattern, ln):
            result = start_idx + i
    return result

# Boundary detection: find the start of each logical section using distinctive patterns.

def find_first(patterns):
    """Return the 0-based js_line index for the first matching pattern."""
    for p in patterns:
        idx = find_line_matching(p)
        if idx is not None:
            return idx
    raise ValueError(f"Could not find boundary for patterns: {patterns}")

# Boundaries (0-based in js_lines)
idx_admin_start     = find_first([r"function normalizeUserEmail", r"normalizeUserEmail"])
idx_global_start    = find_first([r"let DATA\s*=", r"window\.DATA\s*="])
idx_sellers_start   = find_first([r"async function loadSellers", r"function loadSellers"])
idx_domready_start  = find_first([r"document\.addEventListener\('DOMContentLoaded'", r"window\.addEventListener\('DOMContentLoaded'"])
idx_reload_start    = find_first([r"function reloadDashboard", r"let reloadTimer"])
idx_togglesidebar   = find_first([r"function toggleSidebar"])
idx_fetchjson       = find_first([r"async function fetchJsonNoCache", r"function fetchJsonNoCache"])
idx_loaddash        = find_first([r"async function loadDashboardData"])
idx_normcloud       = find_first([r"function normalizeCloudResponse"])
idx_wordclouds      = find_first([r"function processWordClouds"])
idx_showerror       = find_first([r"function showError"])
idx_updatetime      = find_first([r"function updateTimeSinceUpdate"])
idx_hideloader      = find_first([r"const USE_MINIMAL_LOADER", r"function hideInitialLoader"])
idx_formatmoney     = find_first([r"function formatMoney"])
idx_kpi_expl        = find_first([r"const KPI_CARD_EXPLANATIONS", r"KPI_CARD_EXPLANATIONS\s*="])
idx_attachbadge     = find_first([r"function attachInfoBadgeToKpiCard"])
idx_renderdash      = find_first([r"function renderDashboard\s*\("])
idx_showrep         = find_first([r"function showRepDetails"])
idx_sellertimeline  = find_first([r"async function loadSellerTimeline", r"function loadSellerTimeline"])
idx_sellertopdeals  = find_first([r"async function loadSellerTopDeals", r"function loadSellerTopDeals"])
idx_sellergen       = find_first([r"function generateSellerRecommendations"])
idx_sellerscomp     = find_first([r"function loadSellersComparison"])
idx_agenda          = find_first([r"async function loadWeeklyAgendaLegacy", r"function loadWeeklyAgendaLegacy"])
idx_renderdeals     = find_first([r"function renderSellerDeals"])
idx_agendaalerts    = find_first([r"function generateAgendaAlerts"])
idx_warroom         = find_first([r"async function loadWarRoom"])
idx_exportwar       = find_first([r"function exportWarRoomCSV"])
idx_populatekpis    = find_first([r"function populateStaticKPIs"])
idx_perftoggles     = find_first([r"function updatePerformanceToggleButtons"])
idx_showperf        = find_first([r"function showPerformanceView"])
idx_showsection     = find_first([r"function showSection"])
idx_aprendizados    = find_first([r"async function loadAprendizados"])
idx_renderaprend    = find_first([r"function renderAprendizadosFromPatterns"])
idx_switchexec      = find_first([r"function switchExecTab"])
idx_toggleai        = find_first([r"function toggleAIAnalysis"])
idx_toggleexec      = find_first([r"function toggleExecutiveAnalysis"])
idx_execmetrics     = find_first([r"function updateExecutiveMetricsFromAPI"])
idx_updateidle      = find_first([r"function updateIdleDaysMetrics"])
idx_filterperiod    = find_first([r"function filterPipelineByPeriod_"])
idx_convmetrics     = find_first([r"function updateConversionMetricsForPeriod"])
idx_salesspec       = find_first([r"function updateSalesSpecialistMetrics"])
idx_forecast        = find_first([r"function updateForecastPrediction"])
idx_highconf        = find_first([r"function updateHighConfidenceDeals"])
idx_filterpipeline  = find_first([r"function filterPipeline\b"])
idx_filterlocal     = find_first([r"function filterPipelineLocal"])
idx_getpipeline     = find_first([r"function getPipelineDataForPeriod"])
idx_populateyear    = find_first([r"function populateYearFilter"])
idx_updateyear      = find_first([r"function updateYearLabels"])
idx_setyear         = find_first([r"function setYearFilter"])
idx_populaterep     = find_first([r"function populateRepFilter"])
idx_filterbyrep     = find_first([r"function filterByRep"])
idx_refreshdash     = find_first([r"function refreshDashboard"])
idx_ml_start        = find_first([r"let ML_DATA\s*="])
idx_formatpct       = find_first([r"function formatPercentSmart"])
idx_perf_fsr        = find_first([r"function buildPerformanceQuery"])
idx_loadperfdata    = find_first([r"async function loadPerformanceData"])
idx_showloading     = find_first([r"function showLoading"])
idx_hideloading     = find_first([r"function hideLoading"])

# End of js_lines
end_idx = len(js_lines) - 1

print(f"  Seções JS localizadas: {len([x for x in [idx_admin_start, idx_global_start, idx_sellers_start] if x is not None])} verificadas")

# ─────────────────────────────────────────────────────────────────────────────
# Collect and write JS modules
# Note: slices are [start_idx : end_idx] in js_lines (0-based)
# ─────────────────────────────────────────────────────────────────────────────

# ── configuracao.js ──────────────────────────────────────────────────────────
# From start of JS block up to (but not including) admin section
write_js("scripts/configuracao.js",
         js_lines[0 : idx_admin_start],
         "// Configuração global: URL da API, constantes, helpers log/icon")

# ── admin.js ─────────────────────────────────────────────────────────────────
write_js("scripts/admin.js",
         js_lines[idx_admin_start : idx_global_start],
         "// Gestão de férias e acesso do administrador")

# ── estado-global.js ─────────────────────────────────────────────────────────
write_js("scripts/estado-global.js",
         js_lines[idx_global_start : idx_sellers_start],
         "// Estado global: DATA, availableSellers, selectedSellers")

# ── vendedores.js ─────────────────────────────────────────────────────────────
# From loadSellers up to (but not including) DOMContentLoaded
write_js("scripts/vendedores.js",
         js_lines[idx_sellers_start : idx_domready_start],
         "// Multi-select de vendedores: loadSellers, renderSellerOptions, etc.")

# ── inicializacao.js ──────────────────────────────────────────────────────────
# DOMContentLoaded block up to reloadDashboard
write_js("scripts/inicializacao.js",
         js_lines[idx_domready_start : idx_reload_start],
         "// Inicialização: DOMContentLoaded – ponto de entrada da aplicação")

# ── filtros.js ────────────────────────────────────────────────────────────────
# reloadDashboard + toggleSidebar + applyQuickFilter etc + filterPipeline family + populateRepFilter + filterByRep + refreshDashboard
# Range: from reloadDashboard up to ML section  (skip fetchJson which comes in the middle)
# We need to combine: [idx_reload_start..idx_fetchjson) + [idx_filterpipeline..idx_ml_start)
filtros_lines = (
    js_lines[idx_reload_start : idx_fetchjson]
    + ["\n\n// ── Funções de filtro de pipeline ──────────────────────────────────────────\n\n"]
    + js_lines[idx_filterpipeline : idx_ml_start]
)
write_js("scripts/filtros.js",
         filtros_lines,
         "// Filtros: reloadDashboard, applyQuickFilter, syncQuarterMonth, filterPipeline, etc.")

# ── api-dados.js ──────────────────────────────────────────────────────────────
# fetchJsonNoCache, fetchWithCache, clearDataCache, loadDashboardData, normalizeCloudResponse, processWordClouds
write_js("scripts/api-dados.js",
         js_lines[idx_fetchjson : idx_showerror],
         "// Comunicação com a API: fetch, cache, loadDashboardData, normalizeCloudResponse, processWordClouds")

# ── utilitarios.js ────────────────────────────────────────────────────────────
# showError, clearDashboardCache, updateTimeSinceUpdate, loaders, formatMoney, formatDateTime, DOM helpers
# Up to KPI explanations
write_js("scripts/utilitarios.js",
         js_lines[idx_showerror : idx_kpi_expl],
         "// Utilitários: showError, formatMoney, escapeHtml, setTextSafe, showToast, loaders, etc.")

# ── explicacoes-kpi.js ────────────────────────────────────────────────────────
# KPI_CARD_EXPLANATIONS dict + attachInfoBadgeToKpiCard + enhanceAllKpiCards + initKpiCardInfoObserver
# Up to renderDashboard
write_js("scripts/explicacoes-kpi.js",
         js_lines[idx_kpi_expl : idx_renderdash],
         "// Explicações dos KPIs: dicionários e lógica de badges informativos")

# ── dashboard.js ─────────────────────────────────────────────────────────────
# renderDashboard (huge) up to showRepDetails
write_js("scripts/dashboard.js",
         js_lines[idx_renderdash : idx_showrep],
         "// Renderização principal do dashboard: renderDashboard e funções auxiliares")

# ── detalhes-vendedor.js ────────────────────────────────────────────────────
# showRepDetails, loadSellerTimeline, loadSellerTopDeals, generateSellerRecommendations, loadSellersComparison
# Up to agenda section
write_js("scripts/detalhes-vendedor.js",
         js_lines[idx_showrep : idx_agenda],
         "// Detalhes individuais de vendedor: showRepDetails, timeline, top deals, comparação")

# ── agenda-semanal.js ────────────────────────────────────────────────────────
# loadWeeklyAgendaLegacy, renderSellerDeals, generateAgendaAlerts
# Up to warroom
write_js("scripts/agenda-semanal.js",
         js_lines[idx_agenda : idx_warroom],
         "// Pauta semanal: loadWeeklyAgendaLegacy, renderSellerDeals, generateAgendaAlerts")

# ── interface.js ─────────────────────────────────────────────────────────────
# loadWarRoom, exportWarRoomCSV, populateStaticKPIs, updatePerformanceToggleButtons, showPerformanceView, showSection
# Up to aprendizados
write_js("scripts/interface.js",
         js_lines[idx_warroom : idx_aprendizados],
         "// Navegação e interface: showSection, showPerformanceView, loadWarRoom, populateStaticKPIs")

# ── aprendizados.js ──────────────────────────────────────────────────────────
# loadAprendizados, renderAprendizadosFromPatterns
# Up to switchExecTab
write_js("scripts/aprendizados.js",
         js_lines[idx_aprendizados : idx_switchexec],
         "// Seção Aprendizados: loadAprendizados, renderAprendizadosFromPatterns")

# ── abas.js ──────────────────────────────────────────────────────────────────
# switchExecTab, toggleAIAnalysis, toggleExecutiveAnalysis
# Up to updateExecutiveMetricsFromAPI
write_js("scripts/abas.js",
         js_lines[idx_switchexec : idx_execmetrics],
         "// Controle de abas: switchExecTab, toggleAIAnalysis, toggleExecutiveAnalysis")

# ── metricas-executivas.js ───────────────────────────────────────────────────
# updateExecutiveMetricsFromAPI, updateIdleDaysMetrics, filterPipelineByPeriod_, ...
# Up to filterPipeline (which goes to filtros.js)
write_js("scripts/metricas-executivas.js",
         js_lines[idx_execmetrics : idx_filterpipeline],
         "// Métricas executivas: updateExecutiveMetricsFromAPI, updateConversionMetrics, SalesSpecialist, etc.")

# ── ml.js ────────────────────────────────────────────────────────────────────
# Everything from ML_DATA declaration up to Performance FSR
write_js("scripts/ml.js",
         js_lines[idx_ml_start : idx_perf_fsr],
         "// Inteligência ML: predições, tabs ML, renderPrevisaoCiclo, renderClassificadorPerda, etc.")

# ── performance-fsr.js ───────────────────────────────────────────────────────
# buildPerformanceQuery, loadPerformanceData, renderRankingIPV, renderScorecard, renderComportamento, showLoading, hideLoading
write_js("scripts/performance-fsr.js",
         js_lines[idx_perf_fsr : end_idx + 1],
         "// Performance FSR: buildPerformanceQuery, renderRankingIPV, renderScorecard, renderComportamento, showLoading/hideLoading")

# ── autenticacao.js ──────────────────────────────────────────────────────────
if auth_js_block:
    auth_s, auth_e = auth_js_block
    auth_content = js_lines_auth = lines[auth_s+1:auth_e]
    write_js("scripts/autenticacao.js",
             auth_content,
             "// Firebase Auth: FIREBASE_CONFIG, ALLOWED_EMAILS, signInWithGoogle, onAuthStateChanged")

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 – build new index.html
# ─────────────────────────────────────────────────────────────────────────────
print("\n── Reescrevendo index.html ─────────────────────────────────")

# Build a set of line indices to REMOVE (style blocks, main script block, auth script block)
remove_line_indices = set()

for s, e in style_blocks:
    for idx in range(s, e + 1):
        remove_line_indices.add(idx)

main_s, main_e = main_js_block
for idx in range(main_s, main_e + 1):
    remove_line_indices.add(idx)

if auth_js_block:
    auth_s2, auth_e2 = auth_js_block
    for idx in range(auth_s2, auth_e2 + 1):
        remove_line_indices.add(idx)

# Build replacement map: line_idx -> replacement text to insert BEFORE that line
replacements = {}

# Replace first <style> with <link> for animacoes-carregamento.css
replacements[style_blocks[0][0]] = '  <link rel="stylesheet" href="estilos/animacoes-carregamento.css">\n'

# Replace second <style> with <link> for estilos-principais.css
if len(style_blocks) >= 2:
    replacements[style_blocks[1][0]] = '  <link rel="stylesheet" href="estilos/estilos-principais.css">\n'

# Replace main <script> block with ordered <script src="..."> tags
script_order = [
    "scripts/configuracao.js",
    "scripts/estado-global.js",
    "scripts/utilitarios.js",
    "scripts/explicacoes-kpi.js",
    "scripts/admin.js",
    "scripts/vendedores.js",
    "scripts/api-dados.js",
    "scripts/dashboard.js",
    "scripts/metricas-executivas.js",
    "scripts/detalhes-vendedor.js",
    "scripts/agenda-semanal.js",
    "scripts/interface.js",
    "scripts/aprendizados.js",
    "scripts/abas.js",
    "scripts/filtros.js",
    "scripts/ml.js",
    "scripts/performance-fsr.js",
    "scripts/inicializacao.js",
]
replacements[main_js_block[0]] = "".join(
    f'  <script src="{s}"></script>\n' for s in script_order
)

# Replace auth <script> block
if auth_js_block:
    replacements[auth_js_block[0]] = '  <script src="scripts/autenticacao.js"></script>\n'

# Build new HTML
new_html_lines = []
for idx, ln in enumerate(lines):
    if idx in remove_line_indices:
        if idx in replacements:
            new_html_lines.append(replacements[idx])
        # else: line is removed (it was inside a block we extracted)
    else:
        new_html_lines.append(ln)

new_html = "".join(new_html_lines)
with open(HTML_FILE, "w", encoding="utf-8") as f:
    f.write(new_html)

new_count = new_html.count("\n")
print(f"  ✓  index.html reescrito: {len(lines)} → ~{new_count} linhas")

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print("\n✔  Extração concluída! Estrutura criada:")
print("  public/")
print("  ├── index.html  (esqueleto HTML + <link>/<script> tags)")
print("  ├── estilos/")
print("  │   ├── animacoes-carregamento.css")
print("  │   └── estilos-principais.css")
print("  └── scripts/")
scripts = [
    "configuracao.js", "estado-global.js", "utilitarios.js",
    "explicacoes-kpi.js", "admin.js", "vendedores.js",
    "api-dados.js", "dashboard.js", "metricas-executivas.js",
    "detalhes-vendedor.js", "agenda-semanal.js", "interface.js",
    "aprendizados.js", "abas.js", "filtros.js",
    "ml.js", "performance-fsr.js", "inicializacao.js", "autenticacao.js",
]
for s in scripts:
    print(f"      ├── {s}")
print()
print("  Para reverter: cp public/index.html.bak public/index.html")
