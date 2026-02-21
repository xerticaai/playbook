// Inteligência ML: predições, tabs ML, renderPrevisaoCiclo, renderClassificadorPerda, etc.
let ML_DATA = null;

function formatPercentSmart(value) {
  if (value === null || value === undefined) return '0%';
  const num = Number(value) || 0;
  const normalized = num > 1.5 ? num : num * 100;
  return Math.round(normalized) + '%';
}

function formatPercentDetailed(value) {
  if (value === null || value === undefined) return '0.0%';
  const num = Number(value) || 0;
  const normalized = num > 1.5 ? num : num * 100;
  return (Math.round(normalized * 10) / 10).toFixed(1) + '%';
}

function formatPercentDelta(value) {
  const num = Number(value) || 0;
  const normalized = num > 1.5 ? num : num * 100;
  const sign = normalized > 0 ? '+' : normalized < 0 ? '-' : '';
  return sign + Math.round(Math.abs(normalized)) + '%';
}

function formatDateShort(value) {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString('pt-BR');
}

function parseIdleDays(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function estimateLastActivity(idleDays) {
  if (idleDays === null || idleDays === undefined) return null;
  const days = Number(idleDays);
  if (!Number.isFinite(days)) return null;
  const ms = Date.now() - (days * 24 * 60 * 60 * 1000);
  return formatDateShort(new Date(ms));
}

function formatVelocityLabel(label) {
  if (label === 'RÁPIDO') return 'Rapido (<=30d)';
  if (label === 'NORMAL') return 'Normal (31-60d)';
  if (label === 'LENTO') return 'Lento (61-120d)';
  if (label === 'MUITO_LENTO') return 'Muito lento (121+d)';
  return label || 'N/A';
}

function formatLossCause(label) {
  if (!label) return 'N/A';
  const map = {
    MA_QUALIFICACAO: 'Ma qualificacao',
    CONCORRENCIA: 'Concorrente',
    PRECO: 'Preco',
    TIMING: 'Timing',
    BUDGET: 'Budget',
    FIT: 'Fit',
    ABANDONO: 'Abandono',
    CHAMPION_SAIU: 'Champion saiu',
    MUDANCA_ESCOPO: 'Mudanca de escopo',
    OUTROS: 'Outros'
  };
  return map[label] || label;
}

function buildMLFilters() {
  const filters = window.currentFilters || {};
  let year = filters.year || '';
  let quarter = filters.quarter || '';
  const seller = filters.seller || '';

  if (quarter) {
    if (quarter.includes('-')) {
      const parts = quarter.match(/FY(\d+)-Q(\d+)/i);
      if (parts) {
        year = year || ('20' + parts[1]);
        quarter = parts[2];
      }
    } else if (quarter.toUpperCase().startsWith('Q')) {
      quarter = quarter.replace(/[^0-9]/g, '');
    }
  }

  const payload = {};
  if (year) payload.year = year;
  if (quarter) payload.quarter = quarter;
  if (seller) payload.seller = seller;
  return payload;
}

function loadMLPredictions() {
  log('[ML] Carregando predições...');
  document.getElementById('ml-content-area').innerHTML = '<div class="loading"><svg class="icon"><use href="#icon-robot"/></svg> Carregando predições ML...</div>';

  const filters = buildMLFilters();
  fetch(`${ML_API_URL}/api/ml/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'all', filters })
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`ML HTTP ${response.status}: ${text}`);
      }
      return response.json();
    })
    .then((data) => {
      ML_DATA = data;
      log('[ML] ✓ Dados ML carregados');
      switchMLTab('previsao-ciclo');
    })
    .catch((error) => {
      console.error('[ML] ✖ Erro:', error);
      document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--danger);">✖ Erro ao carregar ML</h2></div>';
    });
}

// ==================== CLICK & DRILL-DOWN LOGIC ====================
window.ML_DEAL_MAP = {}; // Maps unique ID -> Deal Object
window.ML_DEAL_Counter = 0;

function registerDeal(deal) {
  if (!deal) return '';
  const id = 'ml_deal_' + (++window.ML_DEAL_Counter);
  window.ML_DEAL_MAP[id] = deal;
  return id;
}

function createModalStructure() {
  if (document.getElementById('deal-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'deal-modal';
  modal.className = 'deal-modal';
  modal.innerHTML = `
    <div class="deal-modal-content">
      <div class="dm-header">
        <div class="dm-title">Deal Profile</div>
        <button class="dm-close" onclick="closeDealModal()">&times;</button>
      </div>
      <div class="dm-body" id="deal-modal-body">
        <!-- Content injected here -->
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Close on BG click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDealModal();
  });
  // Close on Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeDealModal();
  });
}

// Call this once on init
window.addEventListener('DOMContentLoaded', createModalStructure);

function closeDealModal() {
  const m = document.getElementById('deal-modal');
  if (m) m.classList.remove('active');
}

function showOpportunityDetails(dealId) {
  const deal = window.ML_DEAL_MAP[dealId];
  if (!deal) return;
  
  createModalStructure(); // Ensure exists
  
  const modal = document.getElementById('deal-modal');
  const body = document.getElementById('deal-modal-body');
  
  const formatVal = (v) => (v === null || v === undefined) ? '-' : v;
  const formatMoneySafe = (v) => (v ? formatMoney(v) : '-');
  const formatPctSafe = (v) => (v ? Math.round(v) + '%' : '-');

  // Helper to iterate object keys
  const buildGrid = (obj, keys) => {
    return keys.map(k => `
      <div class="dm-field">
        <div class="dm-label">${k.replace(/_/g, ' ')}</div>
        <div class="dm-value text-white">${formatVal(obj[k])}</div>
      </div>`).join('');
  };

  // Construct content
  let content = `
    <div class="dm-section-title">Overview</div>
    <div class="dm-grid" style="grid-template-columns: 2fr 1fr 1fr;">
       <div class="dm-field"><div class="dm-label">Opportunity</div><div class="dm-value" style="font-size:16px; font-weight:700; color:var(--primary-cyan);">${formatVal(deal.opportunity || deal.Opportunity)}</div></div>
       <div class="dm-field"><div class="dm-label">Account</div><div class="dm-value">${formatVal(deal.Account_Name || deal.Cliente)}</div></div>
       <div class="dm-field"><div class="dm-label">Vendedor</div><div class="dm-value">${formatVal(deal.Vendedor)}</div></div>
    </div>
    
    <div class="dm-grid">
       <div class="dm-field"><div class="dm-label">Gross Value</div><div class="dm-value val-cyan" style="font-size:18px;">${formatMoneySafe(deal.Gross_Value || deal.valor || deal.Valor)}</div></div>
       <div class="dm-field"><div class="dm-label">Net Value</div><div class="dm-value text-white">${formatMoneySafe(deal.Net_Value)}</div></div>
       <div class="dm-field"><div class="dm-label">Close Date</div><div class="dm-value">${formatVal(deal.Close_Date || deal.data_fechamento)}</div></div>
       <div class="dm-field"><div class="dm-label">Stage</div><div class="dm-value">${formatVal(deal.Stage)}</div></div>
    </div>

    <div class="dm-section-title">AI Insights</div>
    <div class="dm-grid">
       <div class="dm-field"><div class="dm-label">Win Probability</div><div class="dm-value val-green">${formatPctSafe(deal.prob_win || deal.prob_ganho)}</div></div>
       <div class="dm-field"><div class="dm-label">Confidence</div><div class="dm-value">${formatPctSafe(deal.confidence_num || deal.confianca)}</div></div>
       <div class="dm-field"><div class="dm-label">Anomaly Score</div><div class="dm-value ${deal.anomaly_score > 0.5 ? 'val-red' : 'val-cyan'}">${formatVal(deal.anomaly_score)}</div></div>
       <div class="dm-field"><div class="dm-label">Predicted Cause</div><div class="dm-value val-warning">${formatVal(deal.causa_prevista || deal.loss_reason_prediction)}</div></div>
    </div>
    
    <div class="dm-section-title">Activity & Health</div>
    <div class="dm-grid">
       <div class="dm-field"><div class="dm-label">Idle Days</div><div class="dm-value ${deal.idle_days > 30 ? 'val-red' : ''}">${formatVal(Math.round(deal.idle_days || 0))}d</div></div>
       <div class="dm-field"><div class="dm-label">Total Activities</div><div class="dm-value">${formatVal(deal.atividades || deal.total_activities)}</div></div>
       <div class="dm-field"><div class="dm-label">Meetings</div><div class="dm-value">${formatVal(deal.meetings_count)}</div></div>
       <div class="dm-field"><div class="dm-label">Last Activity</div><div class="dm-value">${formatVal(formatDateShort(deal.ultima_atualizacao))}</div></div>
       <div class="dm-field"><div class="dm-label">Next Action</div><div class="dm-value">${formatVal(deal.Next_Step || deal.Proximos_Passos)}</div></div>
    </div>

    <div class="dm-section-title">Raw Data (All Fields)</div>
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px;">
      ${Object.keys(deal).map(k => {
         // Skip already shown or object fields
         if (typeof deal[k] === 'object' && deal[k] !== null) return '';
         return `<div style="font-size:10px; color:var(--text-gray); overflow:hidden; text-overflow:ellipsis;">
           <strong style="color:var(--primary-dark);">${k}:</strong> <span style="color:var(--text-muted);">${deal[k]}</span>
         </div>`;
      }).join('')}
    </div>
  `;
  
  body.innerHTML = content;
  modal.classList.add('active');
}

function switchMLTab(tabName) {
  document.querySelectorAll('.ml-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.style.color = 'var(--text-gray)';
    tab.style.borderBottom = '3px solid transparent';
  });
  
  const activeTab = document.querySelector(`.ml-tab[data-tab="${tabName}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.color = 'var(--primary-cyan)';
    activeTab.style.borderBottom = '3px solid var(--primary-cyan)';
  }
  
  if (!ML_DATA) return;
  
  if (tabName === 'previsao-ciclo') renderPrevisaoCiclo();
  else if (tabName === 'previsibilidade') renderPrevisibilidade();
  else if (tabName === 'classificador-perda') renderClassificadorPerda();
  else if (tabName === 'risco-abandono') renderRiscoAbandono();
  else if (tabName === 'performance-vendedor') renderPerformanceVendedor();
  else if (tabName === 'prioridade-deals') renderPrioridadeDeals();
  else if (tabName === 'proxima-acao') renderProximaAcao();
  else if (tabName === 'recomendacao-produtos') renderRecomendacaoProdutos();
  else if (tabName === 'deteccao-anomalias') renderDeteccaoAnomalias();
}

// Render functions (simplified for space - complete versions inline)
function renderPrevisaoCiclo() {
  const data = ML_DATA.previsao_ciclo;
  if (!data?.enabled) {
    document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>';
    return;
  }
  const s = data.summary;
  const deals = [...(data.deals || [])].sort((a,b) => (b.dias_previstos||0)-(a.dias_previstos||0)).slice(0,15);
  const topGrossSum = deals.reduce((sum, d) => sum + (d.Gross_Value || 0), 0);
  const topNetSum = deals.reduce((sum, d) => sum + (d.Net_Value || 0), 0);
  const hasNetData = deals.some(d => (d.Net_Value || 0) > 0);
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> dias previstos ate o fechamento com base no historico (ganhos + perdidos) e sinais do pipeline.
      <br><strong>Faixas:</strong> Rapido (<=30d), Normal (31-60d), Lento (61-120d), Muito lento (121+d).
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Deals</div><div class="kpi-value val-cyan">${data.total_deals}</div></div>
    <div class="kpi-card"><div class="kpi-title">Ciclo Médio</div><div class="kpi-value val-cyan">${Math.round(s.avg_dias_previstos||0)}d</div></div>
    <div class="kpi-card"><div class="kpi-title">Rapidos (<=30d)</div><div class="kpi-value val-green">${s.rapidos||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Lentos (>=61d)</div><div class="kpi-value val-warning">${(s.lentos||0)+(s.muito_lentos||0)}</div></div>
  </div>
  <div class="ai-card" style="margin: 16px 0; padding: 12px;">
    <div style="font-size: 12px; color: var(--text-gray);">Soma Top 15: <strong>${formatMoney(topGrossSum)}</strong> Gross${hasNetData ? ` | <strong>${formatMoney(topNetSum)}</strong> Net` : ' | Net indisponivel'}</div>
  </div>
  <h4>⏱️ Top 15 Deals Mais Lentos</h4>
  <table><thead><tr><th>Deal</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Dias previstos</th><th>Dias sem atividade</th><th>Ultima atividade</th><th>Velocidade</th><th>Justificativa</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    const idleDays = parseIdleDays(d.idle_days);
    const lastActivity = d.ultima_atualizacao ? formatDateShort(d.ultima_atualizacao) : estimateLastActivity(idleDays);
    const reasonParts = [];
    if (idleDays !== null) reasonParts.push(`Inativo ${Math.round(idleDays)}d`);
    if (d.confidence_num !== null && d.confidence_num !== undefined) reasonParts.push(`Conf ${Math.round(d.confidence_num||0)}%`);
    if (d.atividades !== null && d.atividades !== undefined) reasonParts.push(`Ativ ${Math.round(d.atividades||0)}`);
    const reason = reasonParts.length ? reasonParts.join(' • ') : 'Sem sinais adicionais';
    const netValue = (d.Net_Value || 0) > 0 ? formatMoney(d.Net_Value||0) : '-';
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td style="font-weight:600;">${netValue}</td><td class="${d.velocidade_prevista==='MUITO_LENTO'?'val-red':d.velocidade_prevista==='LENTO'?'val-warning':'val-cyan'}" style="font-weight:700;">${Math.round(d.dias_previstos||0)}d</td><td>${idleDays !== null ? Math.round(idleDays) + 'd' : 'N/A'}</td><td>${lastActivity || 'N/A'}</td><td><span class="badge badge-${d.velocidade_prevista==='RÁPIDO'?'success':d.velocidade_prevista==='NORMAL'?'warning':'danger'}">${formatVelocityLabel(d.velocidade_prevista)}</span></td><td style="font-size:12px;max-width:260px;">${reason}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderPrevisibilidade() {
  const data = ML_DATA.previsibilidade;
  if (!data?.enabled) {
    document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>';
    return;
  }
  const s = data.summary || {};
  const backtest = s.backtest || {};
  const deals = [...(data.deals || [])].sort((a,b) => (b.expected_gross||0)-(a.expected_gross||0)).slice(0,15);
  const avgProb = formatPercentDetailed(s.avg_prob_win || 0);
  const totalClosed = backtest.total_closed || 0;
  const winRate = totalClosed > 0 ? Math.round(((backtest.won_count || 0) / totalClosed) * 100) : 0;
  const accuracy = formatPercentDetailed(backtest.accuracy || 0);
  const avgProbWon = formatPercentDetailed(backtest.avg_prob_win_won || 0);
  const avgProbLost = formatPercentDetailed(backtest.avg_prob_win_lost || 0);

  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> probabilidade de ganho vem do modelo treinado em historico (ganhos + perdidos).
      <br><strong>Provisionado:</strong> Gross/Net × Prob Win. Isso representa previsao para pipeline aberto (nao fechado).
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Provisionado (Gross)</div><div class="kpi-value val-cyan">${formatMoney(s.expected_gross||0)}</div></div>
    <div class="kpi-card"><div class="kpi-title">Provisionado (Net)</div><div class="kpi-value val-cyan">${formatMoney(s.expected_net||0)}</div></div>
    <div class="kpi-card"><div class="kpi-title">Prob Media</div><div class="kpi-value val-cyan">${avgProb}</div></div>
    <div class="kpi-card"><div class="kpi-title">Alta Previsibilidade</div><div class="kpi-value val-green">${s.alta||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Baixa Previsibilidade</div><div class="kpi-value val-warning">${s.baixa||0}</div></div>
  </div>`;

  if (totalClosed > 0) {
    html += `<div class="ai-card" style="margin: 16px 0; padding: 16px;">
      <h4 style="margin: 0 0 12px 0;">✓ Backtest em Fechados</h4>
      <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="kpi-card"><div class="kpi-title">Win Rate Real</div><div class="kpi-value val-green">${winRate}%</div><div class="kpi-subtitle">${backtest.won_count||0} ganhos / ${backtest.lost_count||0} perdidos</div></div>
        <div class="kpi-card"><div class="kpi-title">Prob Media (Won)</div><div class="kpi-value val-green">${avgProbWon}</div></div>
        <div class="kpi-card"><div class="kpi-title">Prob Media (Lost)</div><div class="kpi-value val-red">${avgProbLost}</div></div>
        <div class="kpi-card"><div class="kpi-title">Acuracia</div><div class="kpi-value val-cyan">${accuracy}</div></div>
      </div>
    </div>`;
  } else {
    html += `<div class="ai-card" style="margin: 16px 0; padding: 16px;">
      <h4 style="margin: 0 0 8px 0;">⚠ Backtest indisponivel</h4>
      <div style="font-size: 12px; color: var(--text-gray);">Sem fechados para o filtro atual ou modelo ainda nao foi atualizado.</div>
    </div>`;
  }

  html += `<h4><svg class="icon"><use href="#icon-target"/></svg> Top 15 por Provisionado (Gross)</h4>
    <table><thead><tr><th>Deal</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Prob</th><th>Gross Prov.</th><th>Net Prov.</th><th>Faixa</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td style="font-weight:600;">${formatMoney(d.Net_Value||0)}</td><td class="val-cyan" style="font-weight:700;">${formatPercentDetailed(d.prob_win||0)}</td><td style="font-weight:700;">${formatMoney(d.expected_gross||0)}</td><td style="font-weight:700;">${formatMoney(d.expected_net||0)}</td><td><span class="badge badge-${d.previsibilidade==='ALTA'?'success':d.previsibilidade==='MEDIA'?'warning':'danger'}">${d.previsibilidade||'N/A'}</span></td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderClassificadorPerda() {
  const data = ML_DATA.classificador_perda;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary;
  const deals = [...(data.deals || [])].sort((a,b) => (b.confianca_predicao||0)-(a.confianca_predicao||0)).slice(0,15);
  const buildFactors = (d) => {
    const candidates = [
      { label: 'Preco', prob: d.prob_preco },
      { label: 'Timing', prob: d.prob_timing },
      { label: 'Concorrente', prob: d.prob_concorrente },
      { label: 'Budget', prob: d.prob_budget },
      { label: 'Fit', prob: d.prob_fit }
    ].filter(item => item.prob !== null && item.prob !== undefined);
    candidates.sort((a, b) => (b.prob || 0) - (a.prob || 0));
    return candidates.slice(0, 2).map(item => `${item.label} ${formatPercentDetailed(item.prob || 0)}`).join(' | ') || 'N/A';
  };
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> causa prevista pelo modelo com base no historico de perdas.
      <br><strong>Confianca:</strong> probabilidade da causa ser a principal.
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">PREÇO</div><div class="kpi-value val-red">${s.preco||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">TIMING</div><div class="kpi-value val-warning">${s.timing||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">CONCORRENTE</div><div class="kpi-value val-red">${s.concorrente||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">BUDGET</div><div class="kpi-value val-warning">${s.budget||0}</div></div>
  </div><h4>✖ Top 15 em Risco de Perda</h4><table><thead><tr><th>Deal</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Causa</th><th>Confiança</th><th>Fatores</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td style="font-weight:600;">${formatMoney(d.Net_Value||0)}</td><td><span class="badge badge-${d.causa_prevista==='PRECO'||d.causa_prevista==='CONCORRENTE'?'danger':'warning'}">${formatLossCause(d.causa_prevista)}</span></td><td class="val-cyan" style="font-weight:700;">${formatPercentDetailed(d.confianca_predicao||0)}</td><td style="font-size:12px;max-width:220px;">${buildFactors(d)}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderRiscoAbandono() {
  const data = ML_DATA.risco_abandono;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary;
  const deals = [...(data.deals || [])].sort((a,b) => (b.prob_abandono||0)-(a.prob_abandono||0)).slice(0,15);
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> o modelo estima probabilidade de abandono com base em inatividade, sinais de risco e historico.
      <br><strong>Faixas:</strong> Alto (>=60%), Medio (40-59%), Baixo (<40%).
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">ALTO Risco</div><div class="kpi-value val-red">${s.alto_risco||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">MÉDIO Risco</div><div class="kpi-value val-warning">${s.medio_risco||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">BAIXO Risco</div><div class="kpi-value val-green">${s.baixo_risco||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Prob Média</div><div class="kpi-value val-cyan">${formatPercentDetailed(s.avg_prob_abandono||0)}</div></div>
  </div><h4><svg class="icon" style="color:var(--error)"><use href="#icon-alert"/></svg> Top 15 em Risco de Abandono</h4><table><thead><tr><th>Deal</th><th>Vendedor</th><th>Valor</th><th>Nível</th><th>Prob.</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td><span class="badge badge-${d.nivel_risco==='ALTO'?'danger':d.nivel_risco==='MÉDIO'?'warning':'success'}">${d.nivel_risco||'N/A'}</span></td><td class="val-red" style="font-weight:700;">${formatPercentDetailed(d.prob_abandono||0)}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderPerformanceVendedor() {
  const data = ML_DATA.performance_vendedor;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary;
  const sellers = [...(data.sellers || [])].sort((a,b) => (a.ranking||999)-(b.ranking||999));
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> win rate previsto vem do modelo treinado em historico (ganhos + perdidos).
      <br><strong>Delta:</strong> diferenca entre previsto e historico do vendedor.
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Sobre-performando</div><div class="kpi-value val-green">${s.sobre_performando||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Na Meta</div><div class="kpi-value val-cyan">${s.na_meta||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Abaixo Meta</div><div class="kpi-value val-warning">${s.abaixo_meta||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Win Rate Medio</div><div class="kpi-value val-cyan">${formatPercentSmart(s.avg_win_rate||0)}</div></div>
  </div><h4><svg class="icon"><use href="#icon-user"/></svg> Ranking de Performance</h4><table><thead><tr><th>#</th><th>Vendedor</th><th>Win Rate</th><th>Delta</th><th>Valor</th><th>Classe</th></tr></thead><tbody>`;
  sellers.forEach(v => html += `<tr><td style="font-weight:700;color:var(--primary-cyan);">#${v.ranking||'N/A'}</td><td style="font-weight:600;">${v.Vendedor||'N/A'}</td><td class="val-cyan" style="font-weight:700;">${formatPercentSmart(v.win_rate_previsto||0)}</td><td class="${(v.delta_performance||0)>0?'val-green':(v.delta_performance||0)<0?'val-red':'val-cyan'}" style="font-weight:600;">${formatPercentDelta(v.delta_performance||0)}</td><td style="font-weight:600;">${formatMoney(v.valor_previsto_venda||0)}</td><td><span class="badge badge-${v.classificacao==='SOBRE_PERFORMANDO'||v.classificacao==='PERFORMANDO_BEM'?'success':v.classificacao==='NA_META'?'warning':'danger'}">${v.classificacao||'N/A'}</span></td></tr>`);
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderPrioridadeDeals() {
  const data = ML_DATA.prioridade_deals;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary;
  const deals = [...(data.deals || [])].sort((a,b) => (a.ranking_global||999)-(b.ranking_global||999)).slice(0,20);
  let html = `<div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">CRÍTICO</div><div class="kpi-value val-red">${s.critico||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">ALTO</div><div class="kpi-value val-warning">${s.alto||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">MÉDIO</div><div class="kpi-value val-cyan">${s.medio||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Score Médio</div><div class="kpi-value val-cyan">${Math.round(s.avg_priority_score||0)}</div></div>
  </div><h4><svg class="icon"><use href="#icon-star"/></svg> Top 20 Prioridade MÁXIMA</h4><table><thead><tr><th>#</th><th>Deal</th><th>Vendedor</th><th>Valor</th><th>Score</th><th>Nível</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:700;color:var(--primary-cyan);">#${d.ranking_global||'N/A'}</td><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td class="val-cyan" style="font-weight:700;font-size:16px;">${Math.round(d.priority_score||0)}</td><td><span class="badge badge-${d.priority_level==='CRÍTICO'?'danger':d.priority_level==='ALTO'?'warning':'warning'}">${d.priority_level||'N/A'}</span></td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderProximaAcao() {
  const data = ML_DATA.proxima_acao;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary;
  const urgOrder = {'ALTA': 1, 'MÉDIA': 2, 'BAIXA': 3};
  const deals = [...(data.deals || [])].sort((a,b) => {
    const urgA = urgOrder[a.urgencia] || 9;
    const urgB = urgOrder[b.urgencia] || 9;
    return urgA !== urgB ? urgA - urgB : (b.Gross_Value||0) - (a.Gross_Value||0);
  }).slice(0,25);
  let html = `<div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">URGENTES</div><div class="kpi-value val-red">${s.urgentes||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">MÉDIAS</div><div class="kpi-value val-warning">${s.medias||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">BAIXAS</div><div class="kpi-value val-cyan">${s.baixas||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Top Categoria</div><div class="kpi-value val-cyan" style="font-size:14px;">${Object.keys(s.top_categorias||{})[0]||'N/A'}</div></div>
  </div><h4><svg class="icon"><use href="#icon-idea"/></svg> Top 25 Ações Prioritárias</h4><table><thead><tr><th>Deal</th><th>Vendedor</th><th>Valor</th><th>Urgência</th><th>Ação Recomendada</th></tr></thead><tbody>`;
  deals.forEach(d => {
    const dealId = registerDeal(d);
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${d.opportunity||'N/A'}</td><td>${d.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(d.Gross_Value||0)}</td><td><span class="badge badge-${d.urgencia==='ALTA'?'danger':d.urgencia==='MÉDIA'?'warning':'success'}">${d.urgencia||'N/A'}</span></td><td style="font-size:12px;max-width:300px;">${d.acao_recomendada||'N/A'}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderRecomendacaoProdutos() {
  const data = ML_DATA.recomendacao_produtos;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary || {};
  const rows = [...(data.rows || [])].slice(0, 25);
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> recomendacoes baseadas em ganhos historicos por vendedor e portfolio.
      <br><strong>Score:</strong> forca da recomendacao pelo modelo de fatores latentes.
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Vendedores</div><div class="kpi-value val-cyan">${s.total_sellers||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Recomendações</div><div class="kpi-value val-cyan">${s.total_recomendacoes||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Score Médio</div><div class="kpi-value val-cyan">${(s.avg_score||0).toFixed(2)}</div></div>
  </div><h4><svg class="icon"><use href="#icon-idea"/></svg> Top Recomendações</h4><table><thead><tr><th>Vendedor</th><th>Quarter</th><th>Produto</th><th>Score</th><th>Wins</th><th>Avg Net</th><th>Pipeline</th><th>Ação</th></tr></thead><tbody>`;
  rows.forEach(r => {
    const avgNet = formatMoney(r.avg_net || 0);
    html += `<tr><td style="font-weight:600;">${r.Vendedor||'N/A'}</td><td>${r.Fiscal_Q||'N/A'}</td><td>${r.recomendacao_produto||'N/A'}</td><td class="val-cyan" style="font-weight:700;">${(r.score||0).toFixed(2)}</td><td>${r.wins_historico||0}</td><td style="font-weight:600;">${avgNet}</td><td>${r.pipeline_deals||0}</td><td style="font-size:12px;max-width:260px;">${r.recomendacao_acao||'N/A'}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

function renderDeteccaoAnomalias() {
  const data = ML_DATA.deteccao_anomalias;
  if (!data?.enabled) { document.getElementById('ml-content-area').innerHTML = '<div class="ai-card"><h2 style="color:var(--warning);">⚠ Modelo Indisponível</h2></div>'; return; }
  const s = data.summary || {};
  const rows = [...(data.rows || [])].slice(0, 25);
  let html = `<div class="ai-card" style="margin-bottom: 16px; padding: 14px;">
    <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
      <strong>Como calcular:</strong> identifica deals fora do padrao de valor, ciclo e atividade.
      <br><strong>Severidade:</strong> score alto indica maior desvio do cluster.
    </div>
  </div><div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Anomalias</div><div class="kpi-value val-red">${s.total_anomalias||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Vendedores</div><div class="kpi-value val-cyan">${s.total_sellers||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Alta Severidade</div><div class="kpi-value val-red">${s.alta||0}</div></div>
    <div class="kpi-card"><div class="kpi-title">Score Médio</div><div class="kpi-value val-cyan">${(s.avg_score||0).toFixed(2)}</div></div>
  </div><h4>⚠ Top Anomalias</h4><table><thead><tr><th>Deal</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Ciclo</th><th>Idle</th><th>Conf.</th><th>Score</th><th>Sev.</th><th>Ação</th></tr></thead><tbody>`;
  rows.forEach(r => {
    const dealId = registerDeal(r);
    const sev = r.severidade || 'N/A';
    const sevClass = sev === 'ALTA' ? 'danger' : sev === 'MEDIA' ? 'warning' : 'success';
    html += `<tr class="clickable-row" onclick="showOpportunityDetails('${dealId}')"><td style="font-weight:600;">${r.opportunity||'N/A'}</td><td>${r.Vendedor||'N/A'}</td><td style="font-weight:600;">${formatMoney(r.Gross_Value||0)}</td><td style="font-weight:600;">${formatMoney(r.Net_Value||0)}</td><td>${r.ciclo_dias||0}d</td><td>${r.idle_days||0}d</td><td>${formatPercentDetailed(r.confianca||0)}</td><td class="val-cyan" style="font-weight:700;">${(r.anomaly_score||0).toFixed(2)}</td><td><span class="badge badge-${sevClass}">${sev}</span></td><td style="font-size:12px;max-width:240px;">${r.acao_recomendada||'N/A'}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('ml-content-area').innerHTML = html;
}

// ==================== PERFORMANCE FSR FUNCTIONS ====================

// Build Performance API Query with Global Filters
