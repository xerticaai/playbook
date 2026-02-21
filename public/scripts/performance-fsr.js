// Performance FSR: buildPerformanceQuery, renderRankingIPV, renderScorecard, renderComportamento, showLoading/hideLoading
function buildPerformanceQuery() {
  const filters = window.currentFilters || {};
  const params = new URLSearchParams();
  
  // Extract year and quarter from filters
  let year = filters.year;
  let quarter = filters.quarter;
  
  // Processar quarter em diferentes formatos
  if (quarter) {
    // Formato: "FY26-Q1" -> extrair year e quarter
    if (quarter.includes('-')) {
      const parts = quarter.match(/FY(\d+)-Q(\d+)/);
      if (parts) {
        year = '20' + parts[1]; // FY26 -> 2026
        quarter = parts[2]; // Q1 -> 1
      }
    } 
    // Formato: "Q1", "Q2", etc -> extrair apenas número
    else if (quarter.startsWith('Q')) {
      quarter = quarter.replace('Q', ''); // Q1 -> 1
    }
  }
  
  // Adicionar year e quarter se disponíveis
  if (year) params.append('year', year);
  if (quarter) params.append('quarter', quarter);
  
  // Seller padrão da aba Performance Equipe:
  // - Se usuário aplicou filtro global de seller, respeitar seleção
  // - Se não aplicou, usar apenas vendedores ativos
  let performanceSellerFilter = filters.seller || '';
  if (!performanceSellerFilter && Array.isArray(availableSellers?.active) && availableSellers.active.length > 0) {
    performanceSellerFilter = availableSellers.active
      .map(s => (s && s.Vendedor ? String(s.Vendedor).trim() : ''))
      .filter(Boolean)
      .join(',');
  }

  if (performanceSellerFilter) {
    params.append('seller', performanceSellerFilter);
  }

  const advancedFilters = filters || {};
  [
    'phase',
    'owner_preventa',
    'billing_city',
    'billing_state',
    'vertical_ia',
    'sub_vertical_ia',
    'sub_sub_vertical_ia',
    'subsegmento_mercado',
    'segmento_consolidado',
    'portfolio_fdm'
  ].forEach(key => {
    if (advancedFilters[key]) {
      params.append(key, advancedFilters[key]);
    }
  });
  
  const queryString = params.toString();
  log('[PERFORMANCE FSR] Filtros aplicados:', {
    year,
    quarter,
    seller_global: filters.seller || '(nao definido)',
    seller_performance: performanceSellerFilter || '(todos)'
  });
  log('[PERFORMANCE FSR] Query string:', queryString);
  
  return queryString ? '?' + queryString : '';
}

// Load Performance Data from API with Filters
async function loadPerformanceData() {
  showLoading('Carregando Performance FSR');
  
  try {
    const queryString = buildPerformanceQuery();
    const url = `${API_BASE_URL}/api/performance${queryString}`;
    
    log('[PERFORMANCE FSR] Buscando:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('API returned error');
    }
    
    log('[PERFORMANCE FSR] Data loaded:', data);
    
    // Render IPV Ranking
    renderRankingIPV(data.ranking);
    
    // Render Scorecard
    renderScorecard(data.scorecard);
    
    // Render Comportamento
    renderComportamento(data.comportamento);
    
    hideLoading();
    
  } catch (error) {
    console.error('[PERFORMANCE FSR] Error:', error);
    hideLoading();
    alert(`Erro ao carregar dados de performance: ${error.message}`);
  }
}

// Apply Filters to Performance FSR (chamado quando filtros mudam)
function applyFiltersToPerformance() {
  // Verifica se a seção FSR está ativa
  const fsrSection = document.getElementById('fsr');
  if (fsrSection && fsrSection.classList.contains('active')) {
    log('[PERFORMANCE FSR] ↻ Recarregando com novos filtros...');
    loadPerformanceData();
  }
}

// Render IPV Ranking Table
function renderRankingIPV(ranking) {
  const tbody = document.getElementById('fsr-ipv-table');
  tbody.innerHTML = '';
  
  if (!ranking || ranking.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-gray)">Sem dados disponíveis</td></tr>';
    return;
  }
  
  ranking.forEach(seller => {
    const ipv = seller.ipv || 0;
    let ipvClass = 'badge-warning';
    if (ipv >= 80) ipvClass = 'badge-success';
    else if (ipv < 50) ipvClass = 'badge-danger';
    
    const resultClass = seller.resultado >= 70 ? 'badge-success' : 
                        seller.resultado >= 50 ? 'badge-warning' : 'badge-danger';
    const effClass = seller.eficiencia >= 70 ? 'badge-success' : 
                     seller.eficiencia >= 50 ? 'badge-warning' : 'badge-danger';
    const behavClass = seller.comportamento >= 70 ? 'badge-success' : 
                       seller.comportamento >= 50 ? 'badge-warning' : 'badge-danger';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700;color:var(--primary-cyan);font-size:1.2em;">#${seller.rank}</td>
      <td style="font-weight:600;color:#fff;">${seller.vendedor}</td>
      <td><span class="badge ${ipvClass}" style="font-size:1.1em;padding:8px 12px;">${ipv}</span></td>
      <td><span class="badge ${resultClass}">${seller.resultado}</span></td>
      <td><span class="badge ${effClass}">${seller.eficiencia}</span></td>
      <td><span class="badge ${behavClass}">${seller.comportamento}</span></td>
      <td>${seller.winRate}%</td>
      <td style="font-weight:600;color:var(--primary-cyan);">${formatMoney(seller.netGerado)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Scorecard Table
function renderScorecard(scorecard) {
  const tbody = document.getElementById('fsr-performance-active-body');
  tbody.innerHTML = '';
  
  if (!scorecard || scorecard.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-gray)">Sem dados disponíveis</td></tr>';
    return;
  }
  
  scorecard.forEach(seller => {
    const wr = seller.winRate || 0;
    let winRateClass = 'badge-warning';
    if (wr >= 80) winRateClass = 'badge-success';
    else if (wr < 40) winRateClass = 'badge-danger';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:#fff;">${seller.vendedor}</td>
      <td><span class="badge ${winRateClass}">${wr}%</span></td>
      <td>${seller.totalGanhos}</td>
      <td>${seller.totalPerdas}</td>
      <td style="color:var(--success);">${seller.cicloMedioWin}d</td>
      <td style="color:var(--danger);">${seller.cicloMedioLoss}d</td>
      <td>${formatMoney(seller.ticketMedio)}</td>
      <td style="font-weight:600;color:var(--success);">${formatMoney(seller.grossGerado)}</td>
      <td style="font-weight:600;color:var(--primary-cyan);">${formatMoney(seller.netGerado)}</td>
      <td style="font-weight:600;color:var(--text-main);">${seller.totalAtividades ?? 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Comportamento Table
function renderComportamento(comportamento) {
  const tbody = document.getElementById('fsr-behavior-active-body');
  tbody.innerHTML = '';
  
  if (!comportamento || comportamento.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-gray)">Sem dados disponíveis</td></tr>';
    return;
  }
  
  comportamento.forEach(seller => {
    const atingAtiv = seller.atingimentoAtividades ?? 0;
    const atingOpps = seller.atingimentoNovasOpps ?? 0;
    const metaAtiv = seller.metaAtividades ?? 0;
    const totalAtiv = seller.totalAtividades ?? 0;
    const metaOpps = seller.metaNovasOpps ?? 0;
    const totalOpps = seller.totalNovasOpps ?? 0;

    const ativColor = atingAtiv >= 80 ? 'var(--success)' : atingAtiv >= 50 ? 'var(--warning)' : 'var(--danger)';
    const oppsColor = atingOpps >= 80 ? 'var(--success)' : atingOpps >= 50 ? 'var(--warning)' : 'var(--danger)';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:#fff;">${seller.vendedor}</td>
      <td>
        <span style="font-weight:700;color:${ativColor};">${Math.round(atingAtiv)}%</span>
        <div style="font-size:11px;color:var(--text-gray);">${totalAtiv}/${metaAtiv}</div>
      </td>
      <td>
        <span style="font-weight:700;color:${oppsColor};">${Math.round(atingOpps)}%</span>
        <div style="font-size:11px;color:var(--text-gray);">${totalOpps}/${metaOpps}</div>
      </td>
      <td style="color:var(--success);">${seller.ativMediaWin}</td>
      <td style="color:var(--danger);">${seller.ativMediaLoss}</td>
      <td style="font-size:12px;color:var(--text-gray);">${seller.principalCausaPerda}</td>
      <td style="font-size:12px;color:var(--text-gray);">${seller.principalFatorSucesso}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== XERTICA LOADING OVERLAY ====================
function showLoading(message = 'Sincronizando dados') {
  const overlay = document.getElementById('xertica-loading-overlay');
  const textElement = document.getElementById('xertica-loading-text');
  if (textElement) textElement.innerHTML = message + '<span class="xertica-loading-dots"><span>.</span><span>.</span><span>.</span></span>';
  if (overlay) overlay.classList.add('active');
  log('[LOADING] ↻', message);
}

function hideLoading() {
  const overlay = document.getElementById('xertica-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.classList.remove('active');
      overlay.style.opacity = '';
    }, 300);
  }
  log('[LOADING] ✓ Concluído');
}
