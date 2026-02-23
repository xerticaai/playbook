// Utilitários: showError, formatMoney, escapeHtml, setTextSafe, showToast, loaders, etc.
function showError(message) {
  // Remove overlay anterior se houver
  const existing = document.getElementById('_error-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '_error-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99998',
    'background:rgba(5,10,16,0.92)', 'backdrop-filter:blur(8px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:40px', 'box-sizing:border-box'
  ].join(';');
  overlay.innerHTML = `
    <div style="text-align:center;max-width:480px;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h2 style="color:#E14849;font-family:'Poppins',sans-serif;margin:0 0 12px;">Erro ao carregar dashboard</h2>
      <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6;font-size:14px;">${message}</p>
      <button onclick="document.getElementById('_error-overlay').remove();location.reload()" style="
        background:#00BEFF;color:#050a10;border:none;
        padding:12px 28px;border-radius:10px;
        font-weight:700;cursor:pointer;font-size:14px;
        font-family:'Poppins',sans-serif;
        transition:opacity 0.2s;
      " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        Tentar Novamente
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Não há cache no frontend Firebase; apenas recarrega a página.
function clearDashboardCache() {
  // Limpa o cache local (localStorage) + força bypass do cache do servidor
  if (typeof clearDataCache === 'function') clearDataCache();
  if (typeof loadDashboardData === 'function') {
    loadDashboardData(true);
  } else {
    refreshDashboard();
  }
}

// Função para mostrar tempo desde última atualização
function updateTimeSinceUpdate() {
  if (!DATA || !DATA.updatedAt) return;
  
  const updateTime = new Date(DATA.updatedAt);
  const now = new Date();
  const diffMs = now - updateTime;
  const diffMins = Math.floor(diffMs / 60000);
  
  const updateElement = document.getElementById('last-update');
  if (updateElement) {
    let timeText = '';
    let color = '#10b981'; // green
    
    if (diffMins < 1) {
      timeText = 'agora mesmo';
    } else if (diffMins === 1) {
      timeText = 'há 1 minuto';
    } else if (diffMins < 5) {
      timeText = `há ${diffMins} minutos`;
    } else {
      timeText = `há ${diffMins} minutos`;
      color = '#f59e0b'; // orange - cache pode estar desatualizado
    }
    
    updateElement.textContent = timeText;
    updateElement.style.color = color;
    updateElement.style.fontWeight = '600';
  }
}

// Atualiza o tempo a cada 30 segundos
setInterval(updateTimeSinceUpdate, 30000);

// ========== LOADER FUNCTIONS ==========
const loaderOverlay = document.getElementById('loading-overlay');

let initialLoaderHidden = false;
function hideInitialLoader() {
  const loader = document.getElementById('loading-overlay');
  if (loader && !initialLoaderHidden) {
    initialLoaderHidden = true;
    loader.classList.add('hidden');
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500); // Aguarda animacao de fade out
  }
}

function showFilterLoader() {
  const filterLoader = document.getElementById('filter-loading');
  if (filterLoader) {
    filterLoader.style.display = 'flex';
    filterLoader.style.visibility = 'visible';
    filterLoader.style.transition = 'opacity 0.3s ease';
    setTimeout(() => { filterLoader.style.opacity = '1'; }, 10);
  }
}

function hideFilterLoader() {
  const filterLoader = document.getElementById('filter-loading');
  if (filterLoader) {
    filterLoader.style.opacity = '0';
    setTimeout(() => { 
      filterLoader.style.display = 'none';
      filterLoader.style.visibility = 'hidden';
    }, 300);
  }
}

// Debounce para filtros (evita múltiplas chamadas rápidas)
let filterDebounceTimer;
function debounceFilter(func, delay = 300) {
  clearTimeout(filterDebounceTimer);
  showFilterLoader();
  filterDebounceTimer = setTimeout(async () => {
    try {
      await func();
    } finally {
      hideFilterLoader();
    }
  }, delay);
}

// Helper para formatação de dinheiro (movido para antes de renderDashboard)
function formatMoney(val) {
  if (!val && val !== 0) return '$0';
  return '$' + Math.round(val).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

// Helper para formatar data e hora (movido para escopo global)
const formatDateTime = (isoString) => {
  if (!isoString || isoString === '-') return '-';
  try {
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} às ${timeStr}`;
  } catch (e) {
    return isoString;
  }
};

// Helper functions para manipulação segura do DOM (movido para escopo global)
const setTextSafe = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
};

const setHtmlSafe = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
};

const escapeHtml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Gross / Net display mode toggle ──────────────────────────────────────────
window.execDisplayMode = 'gross'; // default

// KPI card pairs: [mainValueId, subtitleId]
// Render functions always write Gross as main, "Net: $X" as subtitle.
// applyExecDisplayMode swaps the DOM values without triggering a re-render.
var EXEC_KPI_PAIRS = [
  ['exec-pipeline-year-total', 'exec-pipeline-year-net'],
  ['exec-pipeline-total',      'exec-pipeline-net'],
  ['exec-forecast-total',      'exec-forecast-net'],
  ['exec-forecast-weighted',   'exec-forecast-net'],
  ['exec-above50-total',       'exec-above50-net'],
  ['exec-above50-value',       'exec-above50-net'],
  ['exec-closed-total',        'exec-closed-net'],
  ['exec-lost-total',          'exec-lost-net'],
  ['exec-ticket-won',          'exec-ticket-won-net'],
  ['exec-ticket-lost',         'exec-ticket-lost-net'],
  ['exec-ss-total',            'exec-ss-net'],
  ['exec-ss-ticket',           'exec-ss-ticket-net'],
  ['forecast-ss-commit-value', 'forecast-ss-commit-net'],
  ['forecast-ss-upside-value', 'forecast-ss-upside-net'],
];

function updateExecutiveHighlightToggleUI(mode) {
  var btnGross = document.getElementById('btn-highlight-gross');
  var btnNet   = document.getElementById('btn-highlight-net');
  if (!btnGross || !btnNet) return;
  if (mode === 'net') {
    btnNet.classList.add('highlight-active');
    btnGross.classList.remove('highlight-active');
  } else {
    btnGross.classList.add('highlight-active');
    btnNet.classList.remove('highlight-active');
  }
  btnGross.style.removeProperty('background');
  btnGross.style.removeProperty('color');
  btnNet.style.removeProperty('background');
  btnNet.style.removeProperty('color');
}

function applyExecDisplayMode(mode) {
  EXEC_KPI_PAIRS.forEach(function(pair) {
    var mainEl = document.getElementById(pair[0]);
    var subEl  = document.getElementById(pair[1]);
    if (!mainEl || !subEl) return;
    var mainText = mainEl.textContent.trim();
    var subText  = subEl.textContent.trim();
    var isGrossMode = subText.indexOf('Net:') === 0;
    var isNetMode   = subText.indexOf('Gross:') === 0;
    if (mode === 'net' && isGrossMode) {
      // Subtitle: "Net: $567" → extract "$567"
      var netVal = subText.replace(/^Net:\s*/, '');
      subEl.textContent  = 'Gross: ' + mainText;
      mainEl.textContent = netVal;
    } else if (mode === 'gross' && isNetMode) {
      // Subtitle: "Gross: $1,234" → extract "$1,234"
      var grossVal = subText.replace(/^Gross:\s*/, '');
      subEl.textContent  = 'Net: ' + mainText;
      mainEl.textContent = grossVal;
    }
    // If mode already matches, no-op
  });
}

function setExecDisplayMode(mode) {
  window.execDisplayMode = mode;
  updateExecutiveHighlightToggleUI(mode);
  applyExecDisplayMode(mode);
  if (typeof window.switchTopOppsTab === 'function') {
    const activeTab = (window.topOppsState && window.topOppsState.tab) ? window.topOppsState.tab : 'open';
    window.switchTopOppsTab(activeTab);
  }
  if (typeof updateGlobalFiltersPanelUI === 'function') {
    updateGlobalFiltersPanelUI();
  }
}

