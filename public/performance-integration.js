/**
 * Performance API Integration - Frontend JavaScript
 * Integrar no index.html para substituir cálculos locais por dados da API
 */

// =================================================================
// FETCH PERFORMANCE DATA FROM API
// =================================================================

async function fetchPerformanceData(year = null, quarter = null, seller = null) {
  try {
    // Construir URL com filtros
    const params = new URLSearchParams();
    if (year) params.append('year', year);
    if (quarter) params.append('quarter', quarter);
    if (seller) params.append('seller', seller);
    
    const url = `/api/performance${params.toString() ? '?' + params.toString() : ''}`;
    
    showLoading('Carregando dados de performance...');
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    hideLoading();
    
    return data;
  } catch (error) {
    console.error('[PERFORMANCE API ERROR]', error);
    hideLoading();
    showError(`Erro ao carregar performance: ${error.message}`);
    return null;
  }
}

// =================================================================
// RENDER RANKING IPV TABLE
// =================================================================

function renderRankingIPV(ranking) {
  const tableBody = document.getElementById('fsr-ipv-table');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (!ranking || ranking.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
    return;
  }
  
  ranking.forEach((seller, idx) => {
    const tr = document.createElement('tr');
    
    // Determina cor do IPV
    let ipvClass = 'badge-warning';
    const ipv = seller.ipv || 0;
    if (ipv >= 80) ipvClass = 'badge-success';
    else if (ipv < 50) ipvClass = 'badge-danger';
    
    // Badges coloridos para os pilares
    const resultClass = seller.resultado >= 70 ? 'badge-success' : 
                        seller.resultado >= 50 ? 'badge-warning' : 'badge-danger';
    const effClass = seller.eficiencia >= 70 ? 'badge-success' : 
                     seller.eficiencia >= 50 ? 'badge-warning' : 'badge-danger';
    const behavClass = seller.comportamento >= 70 ? 'badge-success' : 
                       seller.comportamento >= 50 ? 'badge-warning' : 'badge-danger';
    
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--primary-cyan); font-size: 1.2em;">#${seller.rank}</td>
      <td style="font-weight: 600; color: #fff;">${seller.vendedor}</td>
      <td><span class="badge ${ipvClass}" style="font-size: 1.1em; padding: 8px 12px;">${ipv}</span></td>
      <td><span class="badge ${resultClass}">${seller.resultado}</span></td>
      <td><span class="badge ${effClass}">${seller.eficiencia}</span></td>
      <td><span class="badge ${behavClass}">${seller.comportamento}</span></td>
      <td>${seller.winRate}%</td>
      <td style="font-weight: 600;">${formatMoney(seller.grossGerado)}</td>
    `;
    
    tableBody.appendChild(tr);
  });
}

// =================================================================
// RENDER SCORECARD TABLE
// =================================================================

function renderScorecardPerformance(scorecard) {
  const tableBody = document.getElementById('fsr-performance-active-body');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (!scorecard || scorecard.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
    return;
  }
  
  scorecard.forEach(seller => {
    const tr = document.createElement('tr');
    
    // Determina cor do Win Rate
    let winRateClass = 'badge-warning';
    const wr = seller.winRate || 0;
    if (wr >= 80) winRateClass = 'badge-success';
    else if (wr < 40) winRateClass = 'badge-danger';
    
    tr.innerHTML = `
      <td style="font-weight: 600; color: #fff;">${seller.vendedor}</td>
      <td><span class="badge ${winRateClass}">${wr}%</span></td>
      <td>${seller.totalGanhos}</td>
      <td>${seller.totalPerdas}</td>
      <td style="color: var(--success);">${seller.cicloMedioWin}d</td>
      <td style="color: var(--danger);">${seller.cicloMedioLoss}d</td>
      <td>${formatMoney(seller.ticketMedio)}</td>
      <td style="font-weight: 600; color: var(--success);">${formatMoney(seller.grossGerado)}</td>
      <td style="font-weight: 600; color: var(--primary-cyan);">${formatMoney(seller.netGerado)}</td>
    `;
    
    tableBody.appendChild(tr);
  });
}

// =================================================================
// RENDER COMPORTAMENTO TABLE
// =================================================================

function renderComportamento(comportamento) {
  const tableBody = document.getElementById('fsr-behavior-active-body');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (!comportamento || comportamento.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
    return;
  }
  
  comportamento.forEach(seller => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600; color: #fff;">${seller.vendedor}</td>
      <td style="color: var(--success);">${seller.ativMediaWin}</td>
      <td style="color: var(--danger);">${seller.ativMediaLoss}</td>
      <td style="font-size: 12px; color: var(--text-gray);">${seller.principalCausaPerda}</td>
      <td style="font-size: 12px; color: var(--text-gray);">${seller.principalFatorSucesso}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// =================================================================
// MAIN FUNCTION - LOAD AND RENDER PERFORMANCE
// =================================================================

async function loadPerformanceSection() {
  console.log('[PERFORMANCE] Loading performance data from API...');
  
  // Pegar filtros atuais (do seletor de filtros da página)
  const year = FILTERS.year || '2026';  // Default 2026
  const quarter = FILTERS.quarter || null;  // Opcional
  const seller = FILTERS.seller || null;  // Opcional
  
  // Fetch data from API
  const data = await fetchPerformanceData(year, quarter, seller);
  
  if (!data || !data.success) {
    console.error('[PERFORMANCE] Failed to load data');
    return;
  }
  
  console.log(`[PERFORMANCE] Loaded ${data.total_vendedores} vendedores`);
  
  // Render all sections
  renderRankingIPV(data.ranking);
  renderScorecardPerformance(data.scorecard);
  renderComportamento(data.comportamento);
  
  console.log('[PERFORMANCE] All tables rendered successfully ✓');
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

function formatMoney(value) {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function showLoading(message = 'Carregando...') {
  const overlay = document.querySelector('.xertica-loading-overlay');
  if (overlay) {
    const text = overlay.querySelector('.xertica-loading-text');
    if (text) text.textContent = message;
    overlay.classList.add('active');
  }
}

function hideLoading() {
  const overlay = document.querySelector('.xertica-loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function showError(message) {
  console.error('[ERROR]', message);
  alert(message); // ou usar um componente de notificação mais sofisticado
}

// =================================================================
// INTEGRATION POINT
// =================================================================

// Chamar quando a seção FSR for exibida
function showSection(element, sectionId) {
  // ... código existente para trocar de seção ...
  
  // Se for a seção FSR, carregar dados da API
  if (sectionId === 'fsr') {
    loadPerformanceSection();
  }
}

// Ou chamar no carregamento inicial da página
window.addEventListener('DOMContentLoaded', () => {
  // Se a seção FSR estiver ativa por padrão
  const fsrSection = document.getElementById('fsr');
  if (fsrSection && fsrSection.classList.contains('active')) {
    loadPerformanceSection();
  }
});

// =================================================================
// EXPORT FOR USE
// =================================================================

// Disponibilizar funções globalmente
window.PerformanceAPI = {
  fetch: fetchPerformanceData,
  load: loadPerformanceSection,
  renderRanking: renderRankingIPV,
  renderScorecard: renderScorecardPerformance,
  renderComportamento: renderComportamento
};
