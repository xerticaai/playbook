// Pauta semanal: loadWeeklyAgendaLegacy, renderSellerDeals, generateAgendaAlerts
async function loadWeeklyAgendaLegacy(period = 'all') {
  log('[AGENDA INLINE] Carregando pauta semanal via API (fallback)...');
  showLoading('Carregando pauta semanal com IA');
  
  const container = document.getElementById('agenda-sellers-container');
  if (!container) {
    console.error('[AGENDA] Elemento agenda-sellers-container não encontrado no DOM');
    hideLoading();
    return;
  }
  
  try {
    // Use NEW API format with quarter and dates
    const currentFilters = window.currentFilters || {};
    let year = currentFilters.year || new Date().getFullYear();
    let quarter = currentFilters.quarter || 'Q1';

    const params = new URLSearchParams();
    params.append('quarter', `FY${String(year).slice(-2)}-${quarter}`);

    if (currentFilters.seller) {
      params.append('seller', currentFilters.seller);
    }
    if (currentFilters.date_start) {
      params.append('start_date', currentFilters.date_start);
    }
    if (currentFilters.date_end) {
      params.append('end_date', currentFilters.date_end);
    }

    const url = `${window.API_BASE_URL}/api/weekly-agenda?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar pauta semanal');
    }
    
    const data = await response.json();
    
    // NEW FORMAT: data.sellers instead of data.deals
    if (!data.success || !data.sellers || data.sellers.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-gray); padding: 40px;">Nenhum deal encontrado para este quarter/vendedor</p>';
      hideLoading();
      return;
    }
    
    const sellers = data.sellers;
    const summary = data.summary || {};
    
    // Simple rendering for fallback
    let html = '<div style="color: var(--text-gray); font-size: 14px; margin-bottom: 20px;">';
    html += `<strong>Pauta Semanal:</strong> ${summary.total_sellers || 0} vendedores, ${summary.total_deals || 0} deals</div>`;
    
    sellers.forEach((seller, idx) => {
      const sellerSummary = seller.summary || {};
      html += `
        <div style="margin-bottom: 24px; padding: 20px; background: var(--glass-surface); border-radius: 16px; border: 1px solid var(--glass-border);">
          <h4 style="margin: 0 0 12px 0; color: var(--primary-cyan); font-size: 16px;">
            ${seller.vendedor || 'Vendedor'}
          </h4>
          <div style="font-size: 13px; color: var(--text-gray); margin-bottom: 12px;">
            <strong>${sellerSummary.total_deals || 0}</strong> deals • 
            $${Math.round(sellerSummary.total_gross_k || 0)}K
          </div>
        </div>
      `;
    });
    
    const finalContainer = document.getElementById('agenda-sellers-container');
    if (finalContainer) {
      finalContainer.innerHTML = html;
      log('[AGENDA INLINE] ✓ Pauta carregada (fallback):', sellers.length, 'vendedores');
    }
    
    hideLoading();
    
  } catch (error) {
    console.error('[AGENDA] Erro:', error);
    const errorContainer = document.getElementById('agenda-sellers-container');
    if (errorContainer) {
      errorContainer.innerHTML = `<div class="ai-card" style="border-left: 3px solid var(--danger);"><strong>Erro ao carregar pauta:</strong> ${error.message}</div>`;
    }
    hideLoading();
  }
}


function renderSellerDeals(deals) {
  return deals.map(deal => {
    const confidence = parseFloat(deal.Confianca ?? deal.confidence ?? 0) || 0;
    const value = parseFloat(deal.Gross ?? deal.gross ?? 0) || 0;
    const stage = deal.Fase || deal.Stage || deal.Estagio || 'N/A';
    const forecast = deal.Forecast || deal.Previsao || deal.Forecast_Category || 'N/A';
    const quarter = deal.Fiscal_Q || deal.Quarter || 'N/A';

    // Define badge por confiança
    let badgeClass = 'badge-warning';
    let urgencyLabel = 'MÉDIA';
    if (confidence >= 70) {
      badgeClass = 'badge-danger';
      urgencyLabel = 'CRÍTICA';
    } else if (confidence < 50) {
      badgeClass = 'badge-success';
      urgencyLabel = 'BAIXA';
    }

    // Calcula dias idle (se disponível)
    const daysIdle = parseInt(deal.Dias_Idle) || 0;
    const idleBadge = daysIdle > 14 ? `<span class="badge badge-danger">${daysIdle}d idle <svg class="icon" style="color:var(--error)"><use href="#icon-alert"/></svg></span>` : '';

    return `
      <div style="padding: 12px; background: rgba(255,255,255,0.03); border-left: 3px solid ${confidence >= 70 ? 'var(--danger)' : confidence >= 50 ? 'var(--warning)' : 'var(--primary-cyan)'}; border-radius: 8px; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">
              ${deal.Oportunidade || 'Sem nome'}
            </div>
            <div style="font-size: 12px; color: var(--text-gray);">
              <strong>Stage:</strong> ${stage} | <strong>Forecast:</strong> ${forecast} | ${quarter}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="val-cyan" style="font-weight: 700; font-size: 14px;">${formatMoney(value)}</div>
            <div style="font-size: 11px; color: var(--text-gray); margin-top: 2px;">${confidence}% confiança</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span class="badge ${badgeClass}">${urgencyLabel}</span>
          ${idleBadge}
          <span style="font-size: 11px; color: var(--text-gray);">
            ${deal.Conta || 'Conta não informada'}
          </span>
        </div>

        ${daysIdle > 14 ? `<div style="margin-top: 8px; padding: 8px; background: rgba(225,72,73,0.1); border-radius: 6px; font-size: 11px; color: var(--danger);">
          <svg class="icon"><use href="#icon-alert"/></svg> <strong>Ação requerida:</strong> Deal inativo há ${daysIdle} dias - agendar follow-up urgente
        </div>` : ''}
      </div>
    `;
  }).join('');
}
// Gera alertas e recomendações (ATUALIZADO)
function generateAgendaAlerts(criticalDeals, highPriorityDeals, zombieDeals) {
  const alerts = [];
  
  // Analisa deals críticos
  if (criticalDeals.length > 0) {
    const criticalValue = criticalDeals.reduce((sum, d) => sum + (parseFloat(d.Gross) || 0), 0);
    alerts.push({
      type: 'danger',
      icon: '<svg class="icon" style="color:var(--error)"><use href="#icon-alert"/></svg>',
      title: 'Deals Críticos Requerem Atenção',
      message: `${criticalDeals.length} deals com ≥70% confiança (${formatMoney(criticalValue)}) precisam de follow-up imediato para não perder momentum.`
    });
  }
  
  // Deals idle
  const idleDeals = [...criticalDeals, ...highPriorityDeals].filter(d => parseInt(d.Dias_Idle) > 14);
  if (idleDeals.length > 0) {
    const idleValue = idleDeals.reduce((sum, d) => sum + (parseFloat(d.Gross) || 0), 0);
    alerts.push({
      type: 'warning',
      icon: '<svg class="icon"><use href="#icon-clock"/></svg>',
      title: 'Deals Inativos Identificados',
      message: `${idleDeals.length} deals parados há mais de 14 dias (${formatMoney(idleValue)}). Reativar com urgência.`
    });
  }
  
  // Analisa pipeline por vendedor
  const sellerPipeline = {};
  [...criticalDeals, ...highPriorityDeals].forEach(d => {
    const seller = d.Vendedor || 'Sem Vendedor';
    if (!sellerPipeline[seller]) sellerPipeline[seller] = { count: 0, value: 0 };
    sellerPipeline[seller].count++;
    sellerPipeline[seller].value += parseFloat(d.Gross) || 0;
  });
  
  // Identifica vendedor com mais oportunidades
  const topSeller = Object.keys(sellerPipeline).reduce((a, b) => 
    sellerPipeline[a].count > sellerPipeline[b].count ? a : b, ''
  );
  
  if (topSeller && sellerPipeline[topSeller].count >= 5) {
    alerts.push({
      type: 'info',
      icon: '<svg class="icon"><use href="#icon-user"/></svg>',
      title: 'Vendedor com Alta Carga',
      message: `${topSeller} possui ${sellerPipeline[topSeller].count} deals prioritários (${formatMoney(sellerPipeline[topSeller].value)}). Considerar redistribuição ou suporte adicional.`
    });
  }
  
  // Recomendações gerais
  alerts.push({
    type: 'success',
    icon: '<svg class="icon"><use href="#icon-idea"/></svg>',
    title: 'Recomendação: Cadência de Follow-ups',
    message: 'Estabelecer check-ins diários para deals ≥70% e semanais para 40-69%. Usar templates de email para agilizar comunicação.'
  });
  
  // Renderiza alertas
  const html = alerts.map(alert => {
    const bgColor = {
      'danger': 'rgba(225,72,73,0.1)',
      'warning': 'rgba(255,165,0,0.1)',
      'info': 'rgba(0,190,255,0.1)',
      'success': 'rgba(192,255,125,0.1)'
    }[alert.type];
    
    const borderColor = {
      'danger': 'var(--danger)',
      'warning': 'var(--warning)',
      'info': 'var(--primary-cyan)',
      'success': 'var(--accent-green)'
    }[alert.type];
    
    return `
      <div style="padding: 16px; margin-bottom: 12px; background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px;">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: var(--text-main);">
          ${alert.icon} ${alert.title}
        </div>
        <div style="font-size: 13px; color: var(--text-gray); line-height: 1.6;">
          ${alert.message}
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('agenda-alerts').innerHTML = html;
}

// ============================================================================
// NOVA FUNÇÃO: Carrega War Room (Apresentação Executiva)
// ============================================================================
