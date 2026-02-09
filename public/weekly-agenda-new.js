// Weekly Agenda Functions - Enhanced for 1-on-1 Meetings
// Auto-loads current quarter with filters

async function loadWeeklyAgenda() {
  console.log('[AGENDA] Carregando pauta semanal via API...');
  document.getElementById('agenda-sellers-container').innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading">Carregando pauta do quarter...</div></div>';
  
  try {
    // Use global dashboard filters (year/quarter from top of page)
    const currentFilters = window.currentFilters || {};
    const year = currentFilters.year || new Date().getFullYear();
    let quarter = currentFilters.quarter || 'Q1';
    
    // Extract quarter number (Q1 -> 1, Q2 -> 2, etc.)
    if (typeof quarter === 'string') {
      quarter = quarter.replace('Q', '');
    }
    
    // Convert to fiscal quarter format (FY26-Q1)
    const fiscalQuarter = `FY${String(year).slice(2)}-Q${quarter}`;
    
    // Build query params
    const params = new URLSearchParams();
    params.append('quarter', fiscalQuarter);
    params.append('include_rag', 'false'); // Speed up response
    
    const url = `${window.API_BASE_URL}/api/weekly-agenda?${params.toString()}`;
    console.log(`[AGENDA] Fetching: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar pauta semanal');
    }
    
    const data = await response.json();
    
    if (!data.success || !data.sellers || data.sellers.length === 0) {
      document.getElementById('agenda-sellers-container').innerHTML = '<p style="text-align: center; color: var(--text-gray); padding: 40px;">Nenhum deal encontrado para este quarter/vendedor</p>';
      return;
    }
    
    const sellers = data.sellers;
    const summary = data.summary;
    
    // Atualiza informação do quarter
    document.getElementById('agenda-quarter').textContent = summary.quarter;
    
    // Atualiza cards de resumo
    document.getElementById('agenda-sellers-count').textContent = summary.total_sellers;
    document.getElementById('agenda-total-deals').textContent = summary.total_deals;
    document.getElementById('agenda-total-value').textContent = 'R$ ' + summary.total_gross_k + 'K';
    document.getElementById('agenda-criticos-count').textContent = summary.total_criticos;
    document.getElementById('agenda-zumbis-count').textContent = summary.total_zumbis;
    
    // Renderiza vendedores com seus deals
    let html = '';
    
    sellers.forEach((seller, idx) => {
      const perf = seller.performance || {};
      const feedback = seller.feedback || {};
      const deals = seller.deals || [];
      const sellerSummary = seller.summary || {};
      
      // Define status color
      const statusColors = {
        'excellent': 'var(--accent-green)',
        'good': 'var(--success)',
        'needs_improvement': 'var(--warning)',
        'critical': 'var(--danger)'
      };
      const statusColor = statusColors[feedback.status] || 'var(--text-gray)';
      
      // Define grade color
      const gradeColors = {
        'A': 'var(--accent-green)',
        'B': 'var(--success)',
        'C': 'var(--warning)',
        'D': 'var(--danger)',
        'F': 'var(--error)'
      };
      const gradeColor = gradeColors[perf.nota_higiene] || 'var(--text-gray)';
      
      html += `
        <div style="margin-bottom: 32px; padding: 24px; background: var(--glass-surface); border-radius: 16px; border: 1px solid var(--glass-border); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
          <!-- SELLER HEADER -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid ${statusColor}30;">
            <div>
              <h4 style="margin: 0 0 8px 0; color: var(--primary-cyan); font-size: 18px; font-weight: 700;">
                <svg class="icon" width="16" height="16"><use href="#icon-user"/></svg> ${seller.vendedor}
              </h4>
              <div style="display: flex; gap: 12px; font-size: 13px; color: var(--text-gray);">
                <span><strong>${sellerSummary.total_deals}</strong> deals</span>
                <span class="val-cyan" style="font-weight: 700;">R$ ${Math.round(sellerSummary.total_gross_k)}K</span>
                <span><strong>${sellerSummary.avg_confianca}%</strong> conf. média</span>
                ${sellerSummary.zumbis > 0 ? `<span class="val-red" style="font-weight: 700;">⚠️ ${sellerSummary.zumbis} ZUMBIS</span>` : ''}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 6px;">NOTA DE HIGIENE</div>
              <span class="badge" style="background: ${gradeColor}20; color: ${gradeColor}; border: 2px solid ${gradeColor}; font-size: 28px; padding: 8px 20px; font-weight: 900;">
                ${perf.nota_higiene}
              </span>
            </div>
          </div>
          
          <!-- PERFORMANCE METRICS -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="padding: 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline</div>
              <div style="font-size: 14px; font-weight: 700; color: var(--primary-cyan);">R$ ${perf.pipeline_gross_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray); opacity: 0.7; margin-bottom: 2px;">Net: R$ ${perf.pipeline_net_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.pipeline_deals} deals</div>
            </div>
            <div style="padding: 12px; background: rgba(192,255,125,0.08); border-radius: 8px; border: 1px solid rgba(192,255,125,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Fechado (Q)</div>
              <div style="font-size: 14px; font-weight: 700; color: var(--accent-green);">R$ ${perf.closed_gross_k}K</div>
              <div style="font-size: 10px; color: ${perf.closed_net_k < 0 ? 'var(--danger)' : 'var(--text-gray)'}; font-weight: ${perf.closed_net_k < 0 ? '700' : '400'}; margin-bottom: 2px;">Net: R$ ${perf.closed_net_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.win_rate ? perf.win_rate.toFixed(0) + '% win rate' : 'N/A'}</div>
            </div>
            <div style="padding: 12px; background: rgba(255,165,0,0.08); border-radius: 8px; border: 1px solid rgba(255,165,0,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline Podre</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--warning);">${perf.pipeline_podre_pct}%</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.deals_zumbi} zumbis</div>
            </div>
            <div style="padding: 12px; background: rgba(139,92,246,0.08); border-radius: 8px; border: 1px solid rgba(139,92,246,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Forecast Total</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--primary-purple);">R$ ${perf.total_forecast_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray);">pipeline + closed</div>
            </div>
          </div>
          
          <!-- FEEDBACK DE PERFORMANCE -->
          <div style="padding: 14px; background: ${statusColor}15; border-left: 4px solid ${statusColor}; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px; color: ${statusColor};">
              📊 Feedback de Performance
            </div>
            <div style="font-size: 13px; color: var(--text-main); margin-bottom: 10px; line-height: 1.5;">
              ${feedback.message || 'Performance sendo avaliada...'}
            </div>
            ${feedback.recommendations && feedback.recommendations.length > 0 ? `
              <div style="font-size: 11px; color: var(--text-gray); font-weight: 600; margin-bottom: 6px;">💡 AÇÕES RECOMENDADAS:</div>
              <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-gray); line-height: 1.8;">
                ${feedback.recommendations.map(rec => `<li>${rec}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
          
          <!-- DEALS DO VENDEDOR -->
          <h5 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-main); font-weight: 700;">
            📋 Oportunidades (${deals.length})
          </h5>
          <div style="display: grid; gap: 12px;">
            ${renderSeller1on1Deals(deals)}
          </div>
        </div>
      `;
    });
    
    document.getElementById('agenda-sellers-container').innerHTML = html;
    
    console.log('[AGENDA] ✓ Pauta carregada:', sellers.length, 'vendedores', summary.total_deals, 'deals');
    
  } catch (error) {
    console.error('[AGENDA] Erro:', error);
    document.getElementById('agenda-sellers-container').innerHTML = `<div class="ai-card" style="border-left: 3px solid var(--danger);"><strong>Erro ao carregar pauta:</strong> ${error.message}</div>`;
  }
}


function renderSeller1on1Deals(deals) {
  if (!deals || deals.length === 0) {
    return '<p style="text-align: center; color: var(--text-gray); padding: 20px;">Nenhum deal no quarter atual</p>';
  }
  
  return deals.map(deal => {
    const confidence = parseFloat(deal.Confianca || 0) || 0;
    const gross = parseFloat(deal.Gross || 0) || 0;
    const net = parseFloat(deal.Net || 0) || 0;
    const categoria = deal.Categoria_Pauta || 'MONITORAR';
    const risco = deal.Risco_Score || 0;
    const questions = deal.sabatina_questions || [];
    
    // Define border color by category
    const borderColors = {
      'ZUMBI': 'var(--danger)',
      'CRITICO': 'var(--warning)',
      'ALTA_PRIORIDADE': 'var(--primary-cyan)',
      'MONITORAR': 'var(--text-gray)'
    };
    const borderColor = borderColors[categoria];
    
    const formatMoney = (val) => {
      if (!val) return 'R$ 0';
      const k = Math.round(val / 1000);
      return k >= 1000 ? `R$ ${(k/1000).toFixed(1)}M` : `R$ ${k}K`;
    };
    
    // Calculate margin percentage
    const marginPct = gross > 0 ? Math.round(100 * (net / gross)) : 0;
    const marginColor = marginPct < 0 ? 'var(--danger)' : 
                        marginPct < 50 ? 'var(--warning)' : 
                        marginPct < 80 ? 'var(--accent-green)' : 'var(--success)';
    
    return `
      <div style="padding: 16px; background: rgba(255,255,255,0.02); border-left: 4px solid ${borderColor}; border-radius: 10px; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
        <!-- Deal Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 6px;">
              ${deal.Oportunidade || 'Sem nome'}
            </div>
            <div style="font-size: 12px; color: var(--text-gray); margin-bottom: 4px;">
              ${deal.Conta || 'Conta não informada'}
              ${deal.Perfil_Cliente ? `<span class="badge" style="background: ${deal.Perfil_Cliente.toUpperCase().includes('BASE') ? 'rgba(0,190,255,0.15)' : 'rgba(192,255,125,0.15)'}; color: ${deal.Perfil_Cliente.toUpperCase().includes('BASE') ? 'var(--primary-cyan)' : 'var(--accent-green)'}; padding: 2px 8px; font-size: 10px; border-radius: 4px; font-weight: 600; margin-left: 8px;">${deal.Perfil_Cliente}</span>` : ''}
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px;">
              <span class="badge" style="background: ${borderColor}20; color: ${borderColor}; border: 1px solid ${borderColor};">
                ${categoria}
              </span>
              <span style="font-size: 11px; color: var(--text-gray);">
                ${deal.Fiscal_Q || 'Q?'} | ${deal.Dias_Funil || 0} dias funil
              </span>
              <span style="font-size: 11px; color: var(--text-gray);">
                ${deal.Atividades || 0} atividades
              </span>
            </div>
          </div>
          <div style="text-align: right;">
            <!-- Valores Gross e Net -->
            <div style="display: inline-block; padding: 8px 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2); margin-bottom: 8px;">
              <div style="font-size: 10px; color: var(--text-gray); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Gross</div>
              <div style="font-weight: 700; font-size: 15px; color: var(--primary-cyan); margin-bottom: 6px;">${formatMoney(gross)}</div>
              <div style="border-top: 1px solid rgba(0,190,255,0.3); padding-top: 6px; margin-top: 2px;">
                <div style="font-size: 10px; color: var(--text-gray); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Net</div>
                <div style="font-weight: 700; font-size: 15px; color: ${net < 0 ? 'var(--danger)' : 'var(--accent-green)'};">${formatMoney(net)}</div>
              </div>
              <div style="font-size: 9px; color: ${marginColor}; margin-top: 4px; font-weight: 600;">
                ${marginPct}% margem
              </div>
            </div>
            <div style="font-size: 11px; color: var(--text-gray); margin-top: 4px;">${confidence}% confiança</div>
            <div style="font-size: 11px; color: ${risco >= 4 ? 'var(--danger)' : risco >= 3 ? 'var(--warning)' : 'var(--text-gray)'}; margin-top: 2px; font-weight: 600;">
              Risco: ${risco}/5
            </div>
          </div>
        </div>

        <!-- Sabatina Questions -->
        ${questions.length > 0 ? `
          <div style="margin-top: 14px; padding: 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2);">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; color: var(--primary-cyan);">
              🎯 Perguntas para 1-on-1:
            </div>
            <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-gray); line-height: 1.8;">
              ${questions.slice(0, 5).map(q => `<li>${q}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Expõe funções para uso global
window.loadWeeklyAgenda = loadWeeklyAgenda;
window.renderSeller1on1Deals = renderSeller1on1Deals;

console.log('[WEEKLY-AGENDA-NEW] Script carregado - funções disponíveis: loadWeeklyAgenda, renderSeller1on1Deals');
