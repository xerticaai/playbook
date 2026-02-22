// Filtros: reloadDashboard, applyQuickFilter, syncQuarterMonth, filterPipeline, etc.
function reloadDashboard() {
  log('[RELOAD] ↻ Recarregando dashboard com novos filtros...');
  updateGlobalFiltersPanelUI();
  clearDataCache();
  showFilterLoader();
  
  // Debounce: aguarda 400ms antes de executar
  clearTimeout(window.reloadDebounceTimer);
  window.reloadDebounceTimer = setTimeout(() => {
    loadDashboardData();
    if (document.getElementById('aprendizados')?.classList.contains('active')) {
      loadAprendizados();
    }
    // Atualiza Pauta Semanal se estiver ativa
    if (document.getElementById('agenda')?.classList.contains('active') && typeof window.loadWeeklyAgenda === 'function') {
      window.loadWeeklyAgenda();
    }
  }, 400);
}

const GLOBAL_FILTERS_COLLAPSE_KEY = 'global_filters_collapsed';
const ADVANCED_MULTI_FILTER_IDS = [
  'fase-atual-filter',
  'owner-preventa-filter',
  'billing-city-filter',
  'billing-state-filter',
  'vertical-ia-filter',
  'sub-vertical-ia-filter',
  'sub-sub-vertical-ia-filter',
  'subsegmento-mercado-filter',
  'segmento-consolidado-filter',
  'portfolio-fdm-filter'
];

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAdvancedFilterLabel(selectId) {
  const map = {
    'fase-atual-filter': 'Fase',
    'owner-preventa-filter': 'Pré-venda',
    'billing-city-filter': 'Cidade (Cobrança)',
    'billing-state-filter': 'Estado (Cobrança)',
    'vertical-ia-filter': 'Vertical IA',
    'sub-vertical-ia-filter': 'Subvertical IA',
    'sub-sub-vertical-ia-filter': 'Sub-subvertical IA',
    'subsegmento-mercado-filter': 'Subsegmento',
    'segmento-consolidado-filter': 'Segmento de Mercado',
    'portfolio-fdm-filter': 'Portfólio FDM'
  };
  return map[selectId] || selectId;
}

function ensureAdvancedSelectionsState() {
  if (!window.advancedFilterSelections) {
    window.advancedFilterSelections = {};
  }
  ADVANCED_MULTI_FILTER_IDS.forEach(id => {
    if (!Array.isArray(window.advancedFilterSelections[id])) {
      window.advancedFilterSelections[id] = [];
    }
  });
}

function initAdvancedMultiSelects() {
  ensureAdvancedSelectionsState();

  ADVANCED_MULTI_FILTER_IDS.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select || select.dataset.multiInit === '1') return;

    select.style.display = 'none';

    const container = document.createElement('div');
    container.className = 'multi-select-container generic-filter-multi-select';
    container.id = `${selectId}-multi`;
    container.style.minWidth = '210px';

    container.innerHTML = `
      <div class="multi-select-trigger" onclick="toggleGenericFilterDropdown('${selectId}')">
        <span id="${selectId}-selected-text">Todos</span>
      </div>
      <div class="multi-select-dropdown" id="${selectId}-dropdown">
        <div class="multi-select-group" id="${selectId}-options-group">
          <div class="multi-select-group-title">${escapeHtmlText(getAdvancedFilterLabel(selectId))}</div>
        </div>
        <div class="multi-select-actions">
          <button class="multi-select-btn" onclick="selectAllGenericFilterOptions('${selectId}')">Todos</button>
          <button class="multi-select-btn" onclick="clearGenericFilterOptions('${selectId}')">Limpar</button>
        </div>
      </div>
    `;

    select.insertAdjacentElement('afterend', container);
    select.dataset.multiInit = '1';
    updateGenericFilterTriggerText(selectId);
  });
}

function toggleGenericFilterDropdown(selectId) {
  const container = document.getElementById(`${selectId}-multi`);
  const trigger = container?.querySelector('.multi-select-trigger');
  const dropdown = document.getElementById(`${selectId}-dropdown`);
  if (!container || !trigger || !dropdown) return;

  trigger.classList.toggle('open');
  dropdown.classList.toggle('open');
}

function updateGenericFilterTriggerText(selectId) {
  ensureAdvancedSelectionsState();
  const target = document.getElementById(`${selectId}-selected-text`);
  if (!target) return;

  const selections = window.advancedFilterSelections[selectId] || [];
  const label = getAdvancedFilterLabel(selectId);

  if (!selections.length) {
    target.textContent = `Todos (${label})`;
    target.style.color = '#ffffff';
  } else if (selections.length === 1) {
    target.textContent = selections[0];
    target.style.color = 'var(--primary-cyan)';
  } else {
    target.textContent = `${selections.length} selecionados`;
    target.style.color = 'var(--primary-cyan)';
  }
}

function syncHiddenSelectWithSelections(selectId, options) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const selectedValues = window.advancedFilterSelections?.[selectId] || [];
  select.innerHTML = ['<option value="">Todos</option>']
    .concat((options || []).map(item => `<option value="${escapeHtmlText(item.value || item)}">${escapeHtmlText(item.value || item)}</option>`))
    .join('');
  select.value = selectedValues.length ? selectedValues.join(',') : '';
}

function renderGenericFilterOptions(selectId, options) {
  ensureAdvancedSelectionsState();

  const group = document.getElementById(`${selectId}-options-group`);
  if (!group) return;
  const trigger = document.querySelector(`#${selectId}-multi .multi-select-trigger`);

  const normalizedOptions = (options || []).map(item => {
    if (typeof item === 'string') return { value: item, count: 0 };
    return { value: item?.value || '', count: Number(item?.count || 0) };
  }).filter(item => item.value);

  if (!normalizedOptions.length) {
    group.innerHTML = `
      <div class="multi-select-group-title">${escapeHtmlText(getAdvancedFilterLabel(selectId))}</div>
      <div class="multi-select-option" style="cursor: default; opacity: 0.75;">
        <span>Sem dados disponíveis</span>
      </div>
    `;
    window.advancedFilterSelections[selectId] = [];
    syncHiddenSelectWithSelections(selectId, []);
    updateGenericFilterTriggerText(selectId);
    if (trigger) {
      trigger.style.opacity = '0.6';
      trigger.style.pointerEvents = 'none';
    }
    return;
  }

  if (trigger) {
    trigger.style.opacity = '1';
    trigger.style.pointerEvents = 'auto';
  }

  const previousSelections = window.advancedFilterSelections[selectId] || [];
  const validValues = new Set(normalizedOptions.map(item => item.value));
  window.advancedFilterSelections[selectId] = previousSelections.filter(v => validValues.has(v));

  const selectedSet = new Set(window.advancedFilterSelections[selectId]);
  const title = `<div class="multi-select-group-title">${escapeHtmlText(getAdvancedFilterLabel(selectId))}</div>`;

  const items = normalizedOptions.map(item => {
    const checked = selectedSet.has(item.value) ? 'checked' : '';
    const safeValue = escapeHtmlText(item.value);
    return `
      <div class="multi-select-option">
        <input type="checkbox" id="${selectId}-${safeValue}" value="${safeValue}" ${checked} onchange="onGenericFilterChange('${selectId}')" />
        <label for="${selectId}-${safeValue}">
          <span>${safeValue}</span>
          <span class="multi-select-option-badge">${item.count || 0}</span>
        </label>
      </div>
    `;
  }).join('');

  group.innerHTML = title + items;
  syncHiddenSelectWithSelections(selectId, normalizedOptions);
  updateGenericFilterTriggerText(selectId);
}

function onGenericFilterChange(selectId) {
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  window.advancedFilterSelections[selectId] = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  updateGenericFilterTriggerText(selectId);
  updateGlobalFiltersPanelUI();
  loadAdvancedFilterOptions();
  reloadDashboard();
}

function selectAllGenericFilterOptions(selectId) {
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  checkboxes.forEach(cb => { cb.checked = true; });
  onGenericFilterChange(selectId);
}

function clearGenericFilterOptions(selectId) {
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  checkboxes.forEach(cb => { cb.checked = false; });
  onGenericFilterChange(selectId);
}

function countActiveGlobalFilters() {
  const f = getAdvancedFiltersFromUI();
  const year = document.getElementById('year-filter')?.value || '';
  const quarter = document.getElementById('quarter-filter')?.value || '';
  const month = document.getElementById('month-filter')?.value || '';
  const dateStart = document.getElementById('date-start-filter')?.value || '';
  const dateEnd = document.getElementById('date-end-filter')?.value || '';
  const sellersCount = Array.isArray(selectedSellers) ? selectedSellers.length : 0;

  let total = 0;
  if (year) total++;
  if (quarter) total++;
  if (month) total++;
  if (dateStart || dateEnd) total++;
  if (sellersCount > 0) total++;
  Object.values(f).forEach(value => {
    if (value) total++;
  });
  return total;
}

function getPeriodSummaryLabel() {
  const year = document.getElementById('year-filter')?.value || '';
  const quarter = document.getElementById('quarter-filter')?.value || '';
  const month = document.getElementById('month-filter')?.value || '';
  const dateStart = document.getElementById('date-start-filter')?.value || '';
  const dateEnd = document.getElementById('date-end-filter')?.value || '';

  if (dateStart || dateEnd) {
    return `${dateStart || 'Início'} → ${dateEnd || 'Fim'}`;
  }

  if (quarter && year) {
    return `${quarter} ${year}`;
  }

  if (month && year) {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIndex = Number(month) - 1;
    const monthLabel = monthNames[monthIndex] || `M${month}`;
    return `${monthLabel} ${year}`;
  }

  if (year) {
    return `FY ${year}`;
  }

  return 'Todos';
}

function syncQuickFilterPillState() {
  const year = document.getElementById('year-filter')?.value || '';
  const quarter = document.getElementById('quarter-filter')?.value || '';
  const pills = document.querySelectorAll('.filter-quick-bar .filter-pill');

  pills.forEach((pill) => pill.classList.remove('active'));

  if (year === '2026' && quarter) {
    const activeQuarterPill = Array.from(pills).find((pill) => (pill.textContent || '').trim().toUpperCase() === `${quarter} 2026`);
    if (activeQuarterPill) activeQuarterPill.classList.add('active');
  } else if (year === '2026' && !quarter) {
    const fullYearPill = Array.from(pills).find((pill) => (pill.textContent || '').trim().toUpperCase() === 'FULL YEAR');
    if (fullYearPill) fullYearPill.classList.add('active');
  }
}

function updateFiltersSummaryChip() {
  const summaryChip = document.getElementById('filters-active-summary');
  if (!summaryChip) return;

  const periodLabel = getPeriodSummaryLabel();
  const mode = (window.execDisplayMode || 'gross') === 'net' ? 'Net Revenue' : 'Gross Revenue';
  const activeCount = countActiveGlobalFilters();
  const sellersCount = Array.isArray(window.selectedSellers) ? window.selectedSellers.length : 0;
  const sellersLabel = sellersCount > 0 ? ` · ${sellersCount} vendedores` : '';

  summaryChip.textContent = `Período: ${periodLabel} · Visão ${mode} · ${activeCount} filtros ativos${sellersLabel}`;
  summaryChip.setAttribute('title', summaryChip.textContent);
}

function setGlobalFiltersPanelCollapsed(collapsed) {
  const panel = document.getElementById('global-filters-panel');
  if (!panel) return;

  if (collapsed) {
    panel.style.overflow = 'hidden';
    panel.style.maxHeight = '0px';
    panel.style.opacity = '0';
    panel.style.marginTop = '0';
  } else {
    panel.style.overflow = 'visible';
    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.style.opacity = '1';
    panel.style.marginTop = '10px';
  }

  window.globalFiltersCollapsed = collapsed;
  try {
    localStorage.setItem(GLOBAL_FILTERS_COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch (e) {
    // no-op
  }
}

function updateGlobalFiltersPanelUI() {
  const btn = document.getElementById('global-filters-toggle-btn');
  const panel = document.getElementById('global-filters-panel');
  if (!btn || !panel) return;

  const collapsed = window.globalFiltersCollapsed !== false;
  const activeCount = countActiveGlobalFilters();

  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg><span>Filtros</span>';
  btn.setAttribute('aria-label', collapsed ? `Mostrar filtros avançados (${activeCount} ativos)` : `Ocultar filtros avançados (${activeCount} ativos)`);
  btn.setAttribute('title', collapsed ? `Mostrar filtros avançados (${activeCount} ativos)` : `Ocultar filtros avançados (${activeCount} ativos)`);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

  syncQuickFilterPillState();
  updateFiltersSummaryChip();
}

function toggleGlobalFiltersPanel() {
  const collapsed = window.globalFiltersCollapsed !== false;
  setGlobalFiltersPanelCollapsed(!collapsed);
  updateGlobalFiltersPanelUI();
}

function initGlobalFiltersPanel() {
  const panel = document.getElementById('global-filters-panel');
  if (!panel) return;

  let collapsed = true;
  try {
    const saved = localStorage.getItem(GLOBAL_FILTERS_COLLAPSE_KEY);
    collapsed = saved === null ? true : saved === '1';
  } catch (e) {
    collapsed = true;
  }

  setGlobalFiltersPanelCollapsed(collapsed);
  updateGlobalFiltersPanelUI();

  window.addEventListener('resize', () => {
    if (window.globalFiltersCollapsed === false) {
      panel.style.maxHeight = panel.scrollHeight + 'px';
    }
  });

  const summaryWatchedFilters = [
    'year-filter',
    'quarter-filter',
    'month-filter',
    'date-start-filter',
    'date-end-filter'
  ];

  summaryWatchedFilters.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', updateGlobalFiltersPanelUI);
      el.addEventListener('input', updateGlobalFiltersPanelUI);
    }
  });

  updateFiltersSummaryChip();
}

// Toggle Sidebar
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main');
  const toggle = document.querySelector('.sidebar-toggle');
  
  sidebar.classList.toggle('collapsed');
  main.classList.toggle('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed');
  
  // Rotaciona ícone
  const icon = toggle.querySelector('svg');
  if (sidebar.classList.contains('collapsed')) {
    icon.style.transform = 'rotate(180deg)';
  } else {
    icon.style.transform = 'rotate(0deg)';
  }
}

// Função para aplicar filtros rápidos de FY26
function applyQuickFilter(year, quarter) {
  const yearFilter = document.getElementById('year-filter');
  const quarterFilter = document.getElementById('quarter-filter');
  const monthFilter = document.getElementById('month-filter');
  
  // Define valores
  if (yearFilter) yearFilter.value = year;
  if (quarterFilter) quarterFilter.value = quarter;
  if (monthFilter) monthFilter.value = '';

  syncQuickFilterPillState();
  
  log(`[QUICK FILTER] Aplicando: Year=${year}, Quarter=${quarter}`);
  reloadDashboard();
}

// Função para limpar todos os filtros
function clearAllFilters() {
  const yearFilter = document.getElementById('year-filter');
  const quarterFilter = document.getElementById('quarter-filter');
  const monthFilter = document.getElementById('month-filter');
  const faseAtualFilter = document.getElementById('fase-atual-filter');
  const repFilter = document.getElementById('rep-filter');
  const dateStartFilter = document.getElementById('date-start-filter');
  const dateEndFilter = document.getElementById('date-end-filter');
  const ownerPreventaFilter = document.getElementById('owner-preventa-filter');
  const billingCityFilter = document.getElementById('billing-city-filter');
  const billingStateFilter = document.getElementById('billing-state-filter');
  const verticalIaFilter = document.getElementById('vertical-ia-filter');
  const subVerticalIaFilter = document.getElementById('sub-vertical-ia-filter');
  const subSubVerticalIaFilter = document.getElementById('sub-sub-vertical-ia-filter');
  const subsegmentoMercadoFilter = document.getElementById('subsegmento-mercado-filter');
  const segmentoConsolidadoFilter = document.getElementById('segmento-consolidado-filter');
  const portfolioFdmFilter = document.getElementById('portfolio-fdm-filter');
  
  if (yearFilter) yearFilter.value = '';
  if (quarterFilter) quarterFilter.value = '';
  if (monthFilter) monthFilter.value = '';
  if (faseAtualFilter) faseAtualFilter.value = '';
  if (repFilter) repFilter.value = 'all';
  if (dateStartFilter) dateStartFilter.value = '';
  if (dateEndFilter) dateEndFilter.value = '';
  if (ownerPreventaFilter) ownerPreventaFilter.value = '';
  if (billingCityFilter) billingCityFilter.value = '';
  if (billingStateFilter) billingStateFilter.value = '';
  if (verticalIaFilter) verticalIaFilter.value = '';
  if (subVerticalIaFilter) subVerticalIaFilter.value = '';
  if (subSubVerticalIaFilter) subSubVerticalIaFilter.value = '';
  if (subsegmentoMercadoFilter) subsegmentoMercadoFilter.value = '';
  if (segmentoConsolidadoFilter) segmentoConsolidadoFilter.value = '';
  if (portfolioFdmFilter) portfolioFdmFilter.value = '';
  ensureAdvancedSelectionsState();
  ADVANCED_MULTI_FILTER_IDS.forEach(id => {
    window.advancedFilterSelections[id] = [];
    updateGenericFilterTriggerText(id);
  });

  syncQuickFilterPillState();
  
  log('[CLEAR] Todos os filtros limpos');
  updateGlobalFiltersPanelUI();
  loadAdvancedFilterOptions();
  reloadDashboard();
}

function getAdvancedFiltersFromUI() {
  ensureAdvancedSelectionsState();
  const valueFrom = (selectId) => (window.advancedFilterSelections[selectId] || []).join(',');
  return {
    owner_preventa: valueFrom('owner-preventa-filter'),
    phase: valueFrom('fase-atual-filter'),
    billing_city: valueFrom('billing-city-filter'),
    billing_state: valueFrom('billing-state-filter'),
    vertical_ia: valueFrom('vertical-ia-filter'),
    sub_vertical_ia: valueFrom('sub-vertical-ia-filter'),
    sub_sub_vertical_ia: valueFrom('sub-sub-vertical-ia-filter'),
    subsegmento_mercado: valueFrom('subsegmento-mercado-filter'),
    segmento_consolidado: valueFrom('segmento-consolidado-filter'),
    portfolio_fdm: valueFrom('portfolio-fdm-filter')
  };
}

function populateAdvancedSelect(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentValue = select.value || '';
  const options = ['<option value="" style="background: #1a1d29; color: #ffffff;">Todos</option>'];
  (values || []).forEach(value => {
    const safeValue = String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
    options.push(`<option value="${safeValue}" style="background: #1a1d29; color: #ffffff;">${safeValue}</option>`);
  });

  select.innerHTML = options.join('');
  if (currentValue && (values || []).includes(currentValue)) {
    select.value = currentValue;
  }
}

async function loadAdvancedFilterOptions() {
  try {
    initAdvancedMultiSelects();

    const year = document.getElementById('year-filter')?.value || '';
    const quarterRaw = document.getElementById('quarter-filter')?.value || '';
    const quarter = quarterRaw ? quarterRaw.replace('Q', '') : '';
    const month = document.getElementById('month-filter')?.value || '';
    const seller = selectedSellers.length > 0 ? selectedSellers.join(',') : '';
    const advanced = getAdvancedFiltersFromUI();

    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    if (!quarter && month) params.set('month', month);
    if (seller) params.set('seller', seller);
    Object.entries(advanced).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const data = await fetchJsonNoCache(`${API_BASE_URL}/api/filter-options?${params.toString()}`);

    renderGenericFilterOptions('owner-preventa-filter', data.owner_preventa || []);
    renderGenericFilterOptions('fase-atual-filter', data.phase || []);
    renderGenericFilterOptions('billing-city-filter', data.billing_city || []);
    renderGenericFilterOptions('billing-state-filter', data.billing_state || []);
    renderGenericFilterOptions('vertical-ia-filter', data.vertical_ia || []);
    renderGenericFilterOptions('sub-vertical-ia-filter', data.sub_vertical_ia || []);
    renderGenericFilterOptions('sub-sub-vertical-ia-filter', data.sub_sub_vertical_ia || []);
    renderGenericFilterOptions('subsegmento-mercado-filter', data.subsegmento_mercado || []);
    renderGenericFilterOptions('segmento-consolidado-filter', data.segmento_consolidado || []);
    renderGenericFilterOptions('portfolio-fdm-filter', data.portfolio_fdm || []);

    updateGlobalFiltersPanelUI();
    log('[FILTERS] Opções avançadas carregadas');
  } catch (error) {
    log('[FILTERS] ⚠ Erro ao carregar opções avançadas:', error?.message || error);
  }
}

document.addEventListener('click', function(e) {
  document.querySelectorAll('.generic-filter-multi-select').forEach(container => {
    if (!container.contains(e.target)) {
      const trigger = container.querySelector('.multi-select-trigger');
      const dropdown = container.querySelector('.multi-select-dropdown');
      trigger?.classList.remove('open');
      dropdown?.classList.remove('open');
    }
  });
});

// Função para sincronizar filtros de quarter e month
function syncQuarterMonth(changedFilter) {
  const quarterFilter = document.getElementById('quarter-filter');
  const monthFilter = document.getElementById('month-filter');
  const dateStartFilter = document.getElementById('date-start-filter');
  const dateEndFilter = document.getElementById('date-end-filter');
  
  if (changedFilter === 'quarter' && quarterFilter?.value) {
    // Se quarter foi selecionado, limpar month
    if (monthFilter) monthFilter.value = '';
    
    // Auto-ajustar datas para o quarter selecionado
    const year = document.getElementById('year-filter')?.value || new Date().getFullYear();
    const quarter = quarterFilter.value;
    
    if (quarter && year) {
      const quarterNum = parseInt(quarter.replace(/[^0-9]/g, ''));
      if (quarterNum >= 1 && quarterNum <= 4) {
        const startMonth = (quarterNum - 1) * 3 + 1; // Q1=1, Q2=4, Q3=7, Q4=10
        const endMonth = startMonth + 2; // Q1=3, Q2=6, Q3=9, Q4=12
        
        const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
        const endDate = new Date(year, endMonth, 0); // Last day of quarter
        const endDateStr = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        
        if (dateStartFilter) dateStartFilter.value = startDate;
        if (dateEndFilter) dateEndFilter.value = endDateStr;
        
        console.log(`[SYNC] Auto-ajustado datas para ${quarter}: ${startDate} até ${endDateStr}`);
      }
    }
  } else if (changedFilter === 'month' && monthFilter?.value) {
    // Se month foi selecionado, limpar quarter
    if (quarterFilter) quarterFilter.value = '';
  }
  
  reloadDashboard();
}

// ========== CACHE HELPER ==========


// ── Funções de filtro de pipeline ──────────────────────────────────────────

function filterPipeline(period) {
  showLoading('Aplicando filtros');
  
  log('[FILTER] ========== FILTRO DE PIPELINE ==========');
  log('[FILTER] Período selecionado:', period);
  
  // Armazena filtro atual para debug
  window.currentPeriodFilter = period;
  
  // ✓ NOVA ARQUITETURA: Quando filtrar por quarter, CHAMA API
  if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
    log('[FILTER] ✓ Chamando API com filtro de quarter:', period);
    
    const quarterNum = period.replace('q', ''); // "q2" -> "2"
    const currentYear = 2026; // FY26 = 2026
    
    // Chama API com filtros year + quarter
    fetch(`${API_BASE_URL}/api/metrics?year=${currentYear}&quarter=${quarterNum}`)
      .then(res => res.json())
      .then(metrics => {
        log('[FILTER API] Métricas filtradas recebidas:', metrics);
        
        // Armazena resposta filtrada globalmente
        window.lastApiFilteredResponse = { executive: metrics };
        
        // Atualiza Pipeline (Período Filtrado) com dados da API
        const pipelineFiltered = metrics.pipeline_filtered || {};
        setTextSafe('exec-pipeline-total', formatMoney(pipelineFiltered.gross || 0));
        setTextSafe('exec-pipeline-deals', (pipelineFiltered.deals_count || 0) + ' deals no período');
        setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(pipelineFiltered.net || 0));
        
        // Atualiza Previsão Ponderada IA com avg_confidence DA API
        const avgConf = pipelineFiltered.avg_confidence || 0;
        const forecastGross = (pipelineFiltered.gross || 0) * (avgConf / 100);
        const forecastNet = (pipelineFiltered.net || 0) * (avgConf / 100);
        
        setTextSafe('exec-forecast-weighted', formatMoney(forecastGross));
        setTextSafe('exec-forecast-percent', Math.round(avgConf) + '% confiança média');
        setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNet));
        
        log('[FILTER API] Previsão Ponderada:', {
          avgConfidence: avgConf + '%',
          forecastGross: formatMoney(forecastGross),
          forecastNet: formatMoney(forecastNet)
        });
        
        // Atualiza Deals ≥50% Confiança com dados DA API
        const highConf = metrics.high_confidence || {};
        setTextSafe('exec-above50-value', formatMoney(highConf.gross || 0));
        setTextSafe('exec-above50-count', (highConf.deals_count || 0) + ' deals');
        setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConf.net || 0));
        
        // Atualiza botões de período
        document.querySelectorAll('.period-filter').forEach(btn => {
          btn.classList.remove('active');
          btn.style.border = '1px solid rgba(176,184,196,0.3)';
          btn.style.background = 'transparent';
        });
        
        const activeBtn = document.querySelector(`.period-filter[data-period="${period}"]`);
        if (activeBtn) {
          activeBtn.classList.add('active');
          activeBtn.style.border = '2px solid var(--primary-cyan)';
          activeBtn.style.background = 'rgba(0,190,255,0.08)';
        }
        
        // Atualiza Sales Specialist e Forecast Health com dados locais (menos crítico)
        updateConversionMetricsForPeriod(period);
        if (window.updateForecastHealth) window.updateForecastHealth(period);
        if (window.updateTop5Opps) window.updateTop5Opps(period);
        
        hideLoading();
      })
      .catch(err => {
        log('[FILTER API] ✖ Erro ao chamar API:', err);
        // Fallback: usa filtro local
        filterPipelineLocal(period);
      });
    
    return; // Sai da função, aguarda callback da API
  }
  
  // Para "all" ou "total", usa dados GLOBAIS da API (sem filtros)
  if (period === 'all' || period === 'total') {
    log('[FILTER] ✓ Usando dados GLOBAIS da API (sem filtros)');
    
    // Pega métricas globais da resposta inicial da API
    const globalMetrics = window.DATA?.cloudAnalysis?.pipeline_analysis?.executive || {};
    const pipelineAll = globalMetrics.pipeline_all || {};
    const highConfGlobal = globalMetrics.high_confidence || {};
    
    // Atualiza Pipeline (Período Filtrado) com dados globais
    setTextSafe('exec-pipeline-total', formatMoney(pipelineAll.gross || 0));
    setTextSafe('exec-pipeline-deals', (pipelineAll.deals_count || 0) + ' deals abertos');
    setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(pipelineAll.net || 0));
    
    // Calcula Previsão Ponderada usando avg_confidence GLOBAL do BigQuery
    // Pega de pipeline_filtered (que tem avg_confidence calculado de todos os deals)
    const pipelineFiltered = globalMetrics.pipeline_filtered || {};
    const avgConfGlobal = pipelineFiltered.avg_confidence || 0;
    const forecastGross = (pipelineAll.gross || 0) * (avgConfGlobal / 100);
    const forecastNet = (pipelineAll.net || 0) * (avgConfGlobal / 100);
    
    setTextSafe('exec-forecast-weighted', formatMoney(forecastGross));
    setTextSafe('exec-forecast-percent', Math.round(avgConfGlobal) + '% confiança média');
    setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNet));
    
    log('[FILTER] Previsão Ponderada GLOBAL:', {
      avgConfidence: avgConfGlobal + '%',
      forecastGross: formatMoney(forecastGross),
      forecastNet: formatMoney(forecastNet)
    });
    
    // Atualiza Deals ≥50% com dados globais
    setTextSafe('exec-above50-value', formatMoney(highConfGlobal.gross || 0));
    setTextSafe('exec-above50-count', (highConfGlobal.deals_count || 0) + ' deals');
    setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConfGlobal.net || 0));
    
    // Atualiza botões
    document.querySelectorAll('.period-filter').forEach(btn => {
      btn.classList.remove('active');
      btn.style.border = '1px solid rgba(176,184,196,0.3)';
      btn.style.background = 'transparent';
    });
    
    const activeBtn = document.querySelector(`.period-filter[data-period=\"${period}\"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.style.border = '2px solid var(--primary-cyan)';
      activeBtn.style.background = 'rgba(0,190,255,0.08)';
    }
    
    // Atualiza Sales Specialist, Forecast Health e Top5 com dados locais
    updateConversionMetricsForPeriod(period);
    if (window.updateForecastHealth) window.updateForecastHealth(period);
    if (window.updateTop5Opps) window.updateTop5Opps(period);
    
    hideLoading();
    return;
  }
  
  // Para outros casos, usa filtro local (fallback)
  filterPipelineLocal(period);
}

// Função auxiliar para filtro local (fallback)
function filterPipelineLocal(period) {
  
  const data = getPipelineDataForPeriod(period);
  if (!data) {
    log('[FILTER] ⚠ Dados do período não encontrados:', period);
    hideLoading();
    return;
  }
  
  // ============================================================================
  // ARQUITETURA HÍBRIDA: FILTROS DINÂMICOS
  // ============================================================================
  // Esta função manipula APENAS dados DINÂMICOS do payload JSON (window.pipelineData)
  // KPIs ESTÁTICOS (Pipeline Total, Vendedores Ativos) vêm da aba e NÃO são recalculados aqui
  // 
  // REGRAS:
  // - "Pipeline Total Ano" (exec-pipeline-year-*) → ESTÁTICO (da aba)
  // - "Pipeline (Período Filtrado)" (exec-pipeline-*) → DINÂMICO (recalculado aqui)
  // - "Top 5 Oportunidades" → DINÂMICO (filtrado por quarter)
  // - "Saúde do Forecast" → DINÂMICO (recalculado por período)
  // ============================================================================
  
  log('[FILTER] Aplicando filtro:', {
    'período': period,
    'gross': formatMoney(data.gross),
    'net': formatMoney(data.net),
    'deals': data.count
  });
  
  // ATUALIZA APENAS O CARD "Pipeline (Período Filtrado)"
  // O card "Pipeline Total Ano" (exec-pipeline-year-*) é ESTÁTICO e NÃO é alterado
  setTextSafe('exec-pipeline-total', formatMoney(data.gross));
  setTextSafe('exec-pipeline-deals', data.count + ' deals no período');
  setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(data.net));
  
  // RECALCULA PREVISÃO PONDERADA IA ADAPTATIVA AO FILTRO
  // CRÍTICO: Se há filtros ativos, usar confiança média da API
  const hasActiveFilters = window.currentFilters && (window.currentFilters.year || window.currentFilters.quarter || window.currentFilters.month || window.currentFilters.seller);
  if (hasActiveFilters && window.DATA && window.DATA.cloudAnalysis && window.DATA.cloudAnalysis.pipeline_analysis) {
    const apiMetrics = window.DATA.cloudAnalysis.pipeline_analysis.executive || {};
    log('[FORECAST] Usando confiança da API filtrada');
    
    // Atualizar Previsão Ponderada IA com dados da API
    if (apiMetrics.pipeline_filtered) {
      const avgConf = apiMetrics.pipeline_filtered.avg_confidence || 0;
      const pipelineGross = apiMetrics.pipeline_filtered.gross || 0;
      const forecastWeighted = pipelineGross * (avgConf / 100);
      
      setTextSafe('exec-forecast-pipeline', formatMoney(pipelineGross));
      setTextSafe('exec-forecast-confidence', (avgConf).toFixed(1) + '% confiança média');
      setTextSafe('exec-forecast-value', 'Net: ' + formatMoney(forecastWeighted));
      
      log('[FORECAST] Previsão da API:', {
        pipeline: formatMoney(pipelineGross),
        confiança: avgConf.toFixed(1) + '%',
        previsão: formatMoney(forecastWeighted)
      });
    }
    
    // Atualizar Deals ≥50% com dados da API
    if (apiMetrics.high_confidence) {
      const highConfGross = apiMetrics.high_confidence.gross || 0;
      const highConfNet = apiMetrics.high_confidence.net || 0;
      const highConfCount = apiMetrics.high_confidence.deals_count || 0;
      
      setTextSafe('exec-above50-value', formatMoney(highConfGross));
      setTextSafe('exec-above50-count', highConfCount + ' deals');
      setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConfNet));
      
      log('[HIGH-CONF] Deals ≥50% da API:', {
        total: highConfCount,
        gross: formatMoney(highConfGross),
        net: formatMoney(highConfNet)
      });
    }
  } else {
    // Fallback: Recalcular localmente
    updateForecastPrediction(period, data);
    updateHighConfidenceDeals(period);
  }
  
  // Métricas de Idle Days agora vêm do endpoint /api/metrics
  // A chamada updateExecutiveMetricsFromAPI já foi feita em loadData
  
  // Atualiza métricas de conversão (Ganhas/Perdidas com Gross/Net)
  updateConversionMetricsForPeriod(period);
  
  // Atualiza Sales Specialist por quarter (Closed Date)
  if (window.salesSpecData) {
    const salesAll = window.salesSpecData.all || { gross: 0, net: 0, count: 0 };
    const byFiscalQ = window.salesSpecData.byFiscalQ || {};
    const fy = window.currentFY || 'FY26';

    if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
      const fiscalLabel = `${fy}-${period.toUpperCase()}`;
      const spec = byFiscalQ[fiscalLabel] || { gross: 0, net: 0, count: 0 };
      setTextSafe('exec-pipeline-specialist-total', formatMoney(spec.gross));
      setTextSafe('exec-pipeline-specialist-deals', spec.count + ' deals curados');
      setTextSafe('exec-pipeline-specialist-net', 'Net: ' + formatMoney(spec.net));
    } else {
      setTextSafe('exec-pipeline-specialist-total', formatMoney(salesAll.gross));
      setTextSafe('exec-pipeline-specialist-deals', salesAll.count + ' deals curados');
      setTextSafe('exec-pipeline-specialist-net', 'Net: ' + formatMoney(salesAll.net));
    }
  }
  
  // Recalcula Saúde do Forecast para o período
  if (window.updateForecastHealth) {
    log('[FILTER] Atualizando saúde do forecast...');
    window.updateForecastHealth(period);
  }
  
  // Atualiza Top 5 Oportunidades por período
  if (window.updateTop5Opps) {
    log('[FILTER] Atualizando Top 5 Oportunidades...');
    window.updateTop5Opps(period);
  }
  
  // Atualiza botões
  document.querySelectorAll('.period-filter').forEach(btn => {
    btn.classList.remove('active');
    btn.style.border = '1px solid rgba(176,184,196,0.3)';
    btn.style.background = 'transparent';
    btn.style.color = 'var(--text-gray)';
    btn.style.fontWeight = '500';
    btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
  });
  
  const activeBtn = document.querySelector(`.period-filter[data-period="${period}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.border = '1px solid var(--primary-cyan)';
    activeBtn.style.background = 'rgba(0,190,255,0.15)';
    activeBtn.style.color = 'var(--primary-cyan)';
    activeBtn.style.fontWeight = '600';
    activeBtn.style.boxShadow = '0 2px 4px rgba(0,190,255,0.2)';
  }
  
  log('[FILTER] ========== FILTRO APLICADO COM SUCESSO ==========');
  hideLoading();
}

function getPipelineDataForPeriod(period) {
  const fy = window.currentFY || 'FY26';
  const repFilter = window.currentRepFilter && window.currentRepFilter !== 'all'
    ? window.currentRepFilter
    : null;

  const byQuarter = window.pipelineAggByQuarter || [];
  const bySellerQuarter = window.pipelineAggBySellerQuarter || [];
  const netRatio = window.pipelineNetRatio || 0;

  // Se period é 'all', retorna o total do pipelineData
  if (period === 'all' && window.pipelineData && window.pipelineData.all) {
    return {
      gross: window.pipelineData.all.gross || 0,
      net: window.pipelineData.all.net || 0,
      count: window.pipelineData.all.count || 0
    };
  }

  const matchQuarter = (quarter) => {
    if (period === 'all') return true;
    if (!quarter) return false;
    if (period === 'total') return quarter.startsWith(fy + '-');
    if (['q1', 'q2', 'q3', 'q4'].includes(period)) {
      return quarter === fy + '-' + period.toUpperCase();
    }
    return false;
  };

  if (repFilter) {
    let gross = 0;
    let count = 0;
    bySellerQuarter.forEach(item => {
      if (item.seller === repFilter && matchQuarter(item.quarter)) {
        gross += item.total_gross || 0;
        count += item.count || 0;
      }
    });

    return {
      gross: gross,
      net: gross * netRatio,
      count: count
    };
  }

  let gross = 0;
  let net = 0;
  let count = 0;
  
  // CORREÇÃO: Se byQuarter estiver vazio, usar window.pipelineData como fallback
  if (byQuarter.length === 0 && window.pipelineData) {
    log('[FILTER] ⚠ byQuarter vazio, usando window.pipelineData');
    const data = window.pipelineData[period] || window.pipelineData.all;
    return {
      gross: data.gross || 0,
      net: data.net || 0,
      count: data.count || 0
    };
  }
  
  byQuarter.forEach(item => {
    if (matchQuarter(item.quarter)) {
      gross += item.total_gross || 0;
      net += item.total_net || 0;
      count += item.count || 0;
    }
  });

  return {
    gross: gross,
    net: net,
    count: count
  };
}

function populateYearFilter() {
  const select = document.getElementById('year-filter');
  if (!select) return;

  const byQuarter = safe(DATA, 'cloudAnalysis.aggregations.by_quarter', []);
  const years = Array.from(new Set(byQuarter
    .map(item => (item.quarter || '').split('-')[0])
    .filter(Boolean)
  ));

  years.sort();
  if (years.length === 0) {
    years.push(window.currentFY || 'FY26');
  }

  select.innerHTML = '';
  years.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });

  const defaultYear = years.includes(window.currentFY) ? window.currentFY : years[0];
  select.value = defaultYear;
  window.currentFY = defaultYear;
  updateYearLabels();
}

function updateYearLabels() {
  const currentFY = window.currentFY || 'FY26';
  setTextSafe('filter-total-label', 'Todo Pipeline (' + currentFY + ')');
  setTextSafe('filter-q1-label', currentFY + '-Q1');
  setTextSafe('filter-q2-label', currentFY + '-Q2');
  setTextSafe('filter-q3-label', currentFY + '-Q3');
  setTextSafe('filter-q4-label', currentFY + '-Q4');
}

function setYearFilter(year) {
  window.currentFY = year;
  updateYearLabels();
  const currentPeriod = window.currentPeriodFilter || 'all';
  filterPipeline(currentPeriod);
}

// Função para popular dropdown de vendedores ativos
function populateRepFilter() {
  if (!DATA.fsrScorecard) {
    log('[REP FILTER] fsrScorecard não disponível');
    return;
  }
  
  const activeReps = DATA.fsrScorecard.filter(r => r.isActive);
  const select = document.getElementById('rep-filter');
  
  if (!select) {
    log('[REP FILTER] ⚠ Elemento select não encontrado');
    return;
  }
  
  // Limpa options existentes (exceto "Todos")
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  // Adiciona vendedores ativos ordenados por nome
  activeReps
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(rep => {
      const option = document.createElement('option');
      option.value = rep.name;
      option.text = rep.name;
      select.add(option);
    });
  
  log('[REP FILTER] ✓ Dropdown populado com', activeReps.length, 'vendedores ativos');
}

// Função para filtrar por vendedor
function filterByRep(repName) {
  log('[REP FILTER] ========== FILTRO POR VENDEDOR ==========');
  log('[REP FILTER] Vendedor selecionado:', repName);
  
  // Armazena filtro atual
  window.currentRepFilter = repName;
  
  if (repName === 'all') {
    log('[REP FILTER] Exibindo todos os vendedores');
    // Reaplica o filtro de período atual (sem filtro de vendedor)
    const currentPeriod = window.currentPeriodFilter || 'all';
    filterPipeline(currentPeriod);
    return;
  }
  
  // Filtra pelo vendedor selecionado
  if (!DATA.fsrScorecard) {
    log('[REP FILTER] ⚠ fsrScorecard não disponível');
    return;
  }
  
  const rep = DATA.fsrScorecard.find(r => r.name === repName);
  if (!rep) {
    log('[REP FILTER] ⚠ Vendedor não encontrado:', repName);
    return;
  }
  
  log('[REP FILTER] Dados do vendedor:', {
    nome: rep.name,
    pipeline: formatMoney(rep.pipeline || 0),
    revenue: formatMoney(rep.revenue || 0),
    revenueGross: formatMoney(rep.revenueGross || 0),
    totalWonQuarter: rep.totalWonQuarter || 0,
    totalWon: rep.totalWon || 0,
    totalLost: rep.totalLost || 0
  });
  
  // Atualiza "Fechado no Quarter" com dados do vendedor (APENAS QUARTER ATUAL)
  const currentQuarter = window.currentQuarterLabel || safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.quarter', 'FY26-Q1');
  const repWons = (window.wonAgg || []).filter(d => d.owner === rep.name && d.fiscalQ === currentQuarter);
  const repGross = repWons.reduce((sum, d) => sum + (d.gross || 0), 0);
  const repNet = repWons.reduce((sum, d) => sum + (d.net || 0), 0);
  setTextSafe('exec-closed-total', formatMoney(repGross));
  setTextSafe('exec-closed-net', 'Net: ' + formatMoney(repNet));
  setTextSafe('exec-closed-deals', repWons.length + ' deals ganhos');
  setTextSafe('exec-closed-deals', (rep.totalWonQuarter || 0) + ' deals ganhos');
  setTextSafe('exec-closed-net', 'Net: ' + formatMoney(rep.revenue || 0));
  
  // Atualiza "Taxa de Conversão" com dados do vendedor
  const totalDealsRep = (rep.totalWon || 0) + (rep.totalLost || 0);
  const conversionRep = totalDealsRep > 0 ? Math.round(((rep.totalWon || 0) / totalDealsRep) * 100) : 0;
  setTextSafe('exec-conversion-rate', conversionRep + '%');
  setTextSafe('exec-conversion-detail', (rep.totalWon || 0) + '/' + totalDealsRep + ' deals');
  
  // Filtra deals abertos do vendedor no weeklyAgenda
  let repDealsGross = 0;
  let repDealsNet = 0;
  let repDealsCount = 0;
  let repDealsAbove50Gross = 0;
  let repDealsAbove50Net = 0;
  let repDealsAbove50Count = 0;
  
  if (DATA.weeklyAgenda) {
    Object.values(DATA.weeklyAgenda).forEach(quarterDeals => {
      if (Array.isArray(quarterDeals)) {
        quarterDeals.forEach(d => {
          if (d.owner === repName) {
            repDealsGross += d.val || 0;
            repDealsNet += d.net || 0;
            repDealsCount++;
            
            const conf = (d.confidence || 0) > 1 ? (d.confidence / 100) : (d.confidence || 0);
            if (conf >= 0.50) {
              repDealsAbove50Gross += d.val || 0;
              repDealsAbove50Net += d.net || 0;
              repDealsAbove50Count++;
            }
          }
        });
      }
    });
  }
  
  log('[REP FILTER] Pipeline do vendedor:', {
    gross: formatMoney(repDealsGross),
    net: formatMoney(repDealsNet),
    count: repDealsCount,
    above50Gross: formatMoney(repDealsAbove50Gross),
    above50Count: repDealsAbove50Count
  });
  
  // Atualiza "Pipeline (Período Filtrado)" - usa pipeline do vendedor
  setTextSafe('exec-pipeline-total', formatMoney(rep.pipeline || 0));
  setTextSafe('exec-pipeline-deals', repDealsCount + ' deals do vendedor');
  setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(repDealsNet));
  
  // Atualiza "Deals ≥50% Confiança IA"
  setTextSafe('exec-above50-value', formatMoney(repDealsAbove50Gross));
  setTextSafe('exec-above50-count', repDealsAbove50Count + ' deals');
  setTextSafe('exec-above50-net', 'Net: ' + formatMoney(repDealsAbove50Net));
  
  log('[REP FILTER] ========== FILTRO APLICADO ==========');
}

// Função para atualizar dashboard (limpa cache e recarrega)
function refreshDashboard() {
  const btn = document.querySelector('.refresh-btn');
  btn.classList.add('loading');
  btn.innerHTML = '⏳';
  
  // Adiciona parâmetro de timestamp para forçar bypass de cache
  const url = new URL(window.location.href);
  url.searchParams.set('nocache', Date.now());
  
  // Recarrega com novo URL
  window.location.href = url.toString();
}

// ============================================================================
// FUNÇÕES ML INTELLIGENCE 
// ============================================================================

