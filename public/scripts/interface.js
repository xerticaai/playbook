// Navegação e interface: showSection, showPerformanceView, loadWarRoom, populateStaticKPIs
async function loadWarRoom() {
  // War Room endpoint foi removido do backend (war_room.py excluído).
  // Mantemos a seção no front, mas sem chamar /api/war-room.
  log('[WAR-ROOM] War Room desativado (endpoint removido).');
  try {
    setTextSafe('war-forecast-total', '—');
    setTextSafe('war-closed-total', '—');
    setTextSafe('war-closed-perc', '');
    setTextSafe('war-zumbis-count', '—');
    setTextSafe('war-zumbis-value', '');
    setTextSafe('war-confianca-avg', '—');
    setHtmlSafe('war-ai-attention', '<p style="color: var(--text-gray);">War Room desativado</p>');
    setHtmlSafe('war-ai-wins', '<p style="color: var(--text-gray);">War Room desativado</p>');
    setHtmlSafe('war-ai-actions', '<p style="color: var(--text-gray);">War Room desativado</p>');
    document.querySelector('#warroom-sellers-table tbody').innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-gray);">War Room desativado</td></tr>';
    document.querySelector('#warroom-deals-table tbody').innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-gray);">War Room desativado</td></tr>';
  } catch (e) {
    // Non-blocking
  }
  showToast('War Room foi desativado. Use a aba Pauta Semanal.', 'info');
  return;
}

// ============================================================================
// FUNÇÃO: Exporta War Room para CSV
// ============================================================================
function exportWarRoomCSV() {
  log('[WAR-ROOM] Export War Room desativado.');
  showToast('Export do War Room foi desativado.', 'info');
}


// ============================================================================
// NOVA FUNÇÃO: Popula KPIs estáticos da aba 📊 Dashboard_Metrics
// ============================================================================
function populateStaticKPIs(metrics) {
  if (!metrics) {
    log('[STATIC] ⚠ Nenhuma métrica estática disponível');
    return;
  }
  
  log('[STATIC] Populando KPIs estáticos...');
  
  try {
    // Pipeline Total (TODOS OS ANOS) - Não muda com filtros
    setTextSafe('exec-pipeline-year-total', formatMoney(metrics.allPipelineGross));
    setTextSafe('exec-pipeline-year-deals', metrics.allPipelineDeals + ' deals abertos');
    setTextSafe('exec-pipeline-year-net', 'Net: ' + formatMoney(metrics.allPipelineNet));
    
    // Pipeline (Período Filtrado) - Inicia com todos os anos
    setTextSafe('exec-pipeline-total', formatMoney(metrics.allPipelineGross));
    setTextSafe('exec-pipeline-deals', metrics.allPipelineDeals + ' deals abertos');
    setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(metrics.allPipelineNet));
    
    // Sales Specialist
    setTextSafe('exec-pipeline-specialist-total', formatMoney(metrics.salesSpecGross));
    setTextSafe('exec-pipeline-specialist-deals', metrics.salesSpecDeals + ' deals curados');
    setTextSafe('exec-pipeline-specialist-net', 'Net: ' + formatMoney(metrics.salesSpecNet));
    
    // Vendedores Ativos
    setTextSafe('exec-active-reps', metrics.activeRepsCount);
    
    // Deals >= 50% Confiança
    setTextSafe('exec-above50-value', formatMoney(metrics.highConfGross));
    setTextSafe('exec-above50-count', metrics.highConfDeals + ' deals');
    setTextSafe('exec-above50-net', 'Net: ' + formatMoney(metrics.highConfNet));
    
    // Confiança Média
    const avgConfPercent = Math.round(metrics.avgConfidence);
    setTextSafe('exec-forecast-percent', avgConfPercent + '% confiança média');
    
    // Calcula Previsão Ponderada (Pipeline Total × Confiança Média)
    const forecastWeighted = metrics.allPipelineGross * (metrics.avgConfidence / 100);
    setTextSafe('exec-forecast-weighted', formatMoney(forecastWeighted));
    const forecastNetWeighted = metrics.allPipelineNet * (metrics.avgConfidence / 100);
    setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNetWeighted));
    
    log('[STATIC] ✓ KPIs estáticos populados com sucesso');
    
  } catch (e) {
    log('[STATIC] ✖ Erro ao popular KPIs estáticos:', e.message);
  }
}

function updatePerformanceToggleButtons(activeSection) {
  document.querySelectorAll('.perf-toggle-btn').forEach((btn) => {
    const isActive = btn.dataset && btn.dataset.target === activeSection;
    btn.style.background = isActive ? 'rgba(0,190,255,0.18)' : 'rgba(255,255,255,0.04)';
    btn.style.color = isActive ? 'var(--primary-cyan)' : 'var(--text-gray)';
    btn.style.borderColor = isActive ? 'var(--primary-cyan)' : 'var(--glass-border)';
  });
}

function showPerformanceView(sectionId) {
  const performanceNav = document.getElementById('nav-performance-item');
  showSection(performanceNav, sectionId);
}

function toggleIpvGuide(triggerEl) {
  const content = document.getElementById('ipv-guide-content');
  if (!content || !triggerEl) return;

  const isCollapsed = content.classList.contains('collapsed');

  if (isCollapsed) {
    content.classList.remove('collapsed');
    content.style.maxHeight = content.scrollHeight + 'px';
    triggerEl.setAttribute('aria-expanded', 'true');
    const chev = triggerEl.querySelector('.chevron-icon');
    if (chev) chev.classList.add('rotated');
    return;
  }

  content.classList.add('collapsed');
  content.style.maxHeight = '0px';
  triggerEl.setAttribute('aria-expanded', 'false');
  const chev = triggerEl.querySelector('.chevron-icon');
  if (chev) chev.classList.remove('rotated');
}

// ==========================================================================
// Navegação corrigida com argumentos explícitos
function showSection(element, sectionId) {
  if ((sectionId === 'dashboard' || sectionId === 'ml') && !(isAdminUser && adminPreviewEnabled)) {
    const executiveNav = document.querySelector('.nav-item[onclick="showSection(this, \'executive\')"]');
    showSection(executiveNav, 'executive');
    return;
  }

  if (sectionId === 'admin' && !isAdminUser) {
    const executiveNav = document.querySelector('.nav-item[onclick="showSection(this, \'executive\')"]');
    showSection(executiveNav, 'executive');
    return;
  }

  // Remove active de todas as seções e nav items
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  // Adiciona active ao elemento clicado e à seção correspondente
  const target = document.getElementById(sectionId);
  if (target) target.classList.add('active');
  if (element) element.classList.add('active');

  if ((sectionId === 'individual' || sectionId === 'fsr') && !element) {
    const performanceNav = document.getElementById('nav-performance-item');
    if (performanceNav) performanceNav.classList.add('active');
  }
  if (sectionId === 'individual' || sectionId === 'fsr') {
    updatePerformanceToggleButtons(sectionId);
  }
  
  // Atualiza título
  const titles = { 
    'executive': 'Visão Executiva',
    'dashboard': 'Indicadores L10', 
    'aprendizados': 'Aprendizados',
    'fsr': 'Performance Equipe',
    'individual': 'Performance Equipe', 
    'agenda': 'Pauta Semanal',
    'admin': 'Admin - Gestão de Férias',
    'warroom': '🎯 War Room - Apresentação Executiva',
    'ml': '🤖 Inteligência ML'
  };
  setTextSafe('page-title', titles[sectionId] || 'Dashboard');

  if (sectionId === 'aprendizados') {
    loadAprendizados();
  }
  
  // Se aba ML for ativada, carrega predições automaticamente
  if (sectionId === 'ml' && !ML_DATA) {
    loadMLPredictions();
  }
  
    // Se aba Agenda for ativada, carrega pauta automaticamente
  if (sectionId === 'agenda') {
    // Usa nova função do weekly-agenda-new.js se disponível
    if (typeof window.loadWeeklyAgenda === 'function') {
      window.loadWeeklyAgenda();
    } else {
      loadWeeklyAgendaLegacy('all'); // Fallback legado
    }
  }

  // Se aba War Room for ativada, carrega automaticamente
  if (sectionId === 'warroom') {
    loadWarRoom();
  }

  // Se aba Performance FSR for ativada, carrega dados da API
  if (sectionId === 'fsr') {
    loadPerformanceData();
  }

  if (sectionId === 'admin') {
    initAdminSection();
  }
}

// ==========================================================================
// Aprendizados (inline)
