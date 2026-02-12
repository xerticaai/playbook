// Weekly Agenda Functions - Enhanced for 1-on-1 Meetings
// Auto-loads current quarter with filters

function agendaIcon(symbolId) {
  const safeId = String(symbolId || '').trim();
  if (!safeId) return '';
  return `<svg class="icon" aria-hidden="true"><use href="#${safeId}" xlink:href="#${safeId}"></use></svg>`;
}

function normalizeTagList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map(v => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return v.label || v.key || '';
        return String(v);
      })
      .map(v => String(v).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n\t]+/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function formatDateDMY(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// escapeHtml is already defined in index.html - use global function

// Strip HTML tags and decode entities from text
function stripHtml(value) {
  const text = String(value ?? '');
  // Remove HTML tags
  const withoutTags = text.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = withoutTags;
  return textarea.value.trim();
}
// Toggle collapsible sections in Weekly Agenda
function toggleWeeklyAgendaSection(sectionId) {
  const el = document.getElementById(sectionId);
  const btn = document.getElementById(`${sectionId}-btn`);
  if (!el) return;
  
  const isVisible = el.style.display !== 'none';
  el.style.display = isVisible ? 'none' : 'block';
  
  // Update button icon
  if (btn) {
    btn.innerHTML = isVisible ? '▶' : '▼';
  }
}

// Render drill-down deals list
function renderDrillDownDeals(deals, type = 'closed') {
  if (!Array.isArray(deals) || deals.length === 0) {
    return '<div style="font-size: 12px; color: rgba(255,255,255,0.5); padding: 8px;">Nenhum deal encontrado.</div>';
  }
  
  const totalGross = deals.reduce((sum, d) => sum + (d.gross || 0), 0);
  const totalNet = deals.reduce((sum, d) => sum + (d.net || 0), 0);
  
  let titleColor, bgColor, borderColor;
  if (type === 'closed') {
    titleColor = 'var(--accent-green)';
    bgColor = 'rgba(192,255,125,0.08)';
    borderColor = 'rgba(192,255,125,0.3)';
  } else if (type === 'lost') {
    titleColor = 'var(--danger)';
    bgColor = 'rgba(255,61,87,0.08)';
    borderColor = 'rgba(255,61,87,0.3)';
  } else {
    titleColor = 'var(--warning)';
    bgColor = 'rgba(255,165,0,0.08)';
    borderColor = 'rgba(255,165,0,0.3)';
  }
  
  return `
    <div style="margin-top: 12px; padding: 12px; background: ${bgColor}; border-radius: 8px; border: 1px solid ${borderColor};">
      <div style="font-size: 11px; color: ${titleColor}; font-weight: 800; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="text-transform: uppercase;">Detalhes (${deals.length} deals)</span>
        <span>Gross: R$ ${(totalGross/1000).toFixed(0)}K | Net: R$ ${(totalNet/1000).toFixed(0)}K</span>
      </div>
      <div style="display: grid; gap: 8px; max-height: 300px; overflow-y: auto;">
        ${deals.map(d => `
          <div style="padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; border-left: 3px solid ${titleColor};">
            <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95); margin-bottom: 4px;">${escapeHtml(d.oportunidade || 'N/A')}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.75); margin-bottom: 6px;">${escapeHtml(d.conta || 'N/A')}</div>
            <div style="display: flex; gap: 12px; font-size: 11px; color: rgba(255,255,255,0.6); flex-wrap: wrap;">
              <span>Gross: <strong style="color: ${titleColor};">R$ ${(d.gross/1000 || 0).toFixed(1)}K</strong></span>
              <span>Net: <strong>R$ ${(d.net/1000 || 0).toFixed(1)}K</strong></span>
              ${d.forecast ? `<span>Forecast: <strong>${escapeHtml(d.forecast)}</strong></span>` : ''}
              ${d.data_fechamento ? `<span>Data: <strong>${formatDateDMY(d.data_fechamento)}</strong></span>` : ''}
              ${d.motivo_perda ? `<span style="color: var(--danger);">Motivo: <strong>${escapeHtml(d.motivo_perda)}</strong></span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function loadWeeklyAgenda() {
  console.log('[AGENDA] Carregando pauta semanal via API...');
  
  const container = document.getElementById('agenda-sellers-container');
  if (!container) {
    console.error('[AGENDA] Elemento agenda-sellers-container não encontrado no DOM');
    return;
  }
  
  container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading">Carregando pauta do quarter...</div></div>';
  
  try {
    // Use global dashboard filters (year/quarter/seller from top of page)
    const currentFilters = window.currentFilters || {};
    let year = currentFilters.year || new Date().getFullYear();
    let quarter = currentFilters.quarter || 'Q1';

    // Accept multiple quarter formats: "FY26-Q1", "Q1", etc.
    if (typeof quarter === 'string') {
      if (quarter.includes('-')) {
        const match = quarter.match(/FY(\d+)-Q(\d+)/i);
        if (match) {
          year = '20' + match[1];
          quarter = match[2];
        }
      } else if (quarter.toUpperCase().startsWith('Q')) {
        quarter = quarter.replace(/Q/i, '');
      }
    }

    // Convert to fiscal quarter format (FY26-Q1)
    const fiscalQuarter = `FY${String(year).slice(2)}-Q${quarter}`;
    
    // Build query params
    const params = new URLSearchParams();
    params.append('quarter', fiscalQuarter);
    params.append('include_rag', 'false'); // Speed up response

    if (currentFilters.seller) {
      params.append('seller', currentFilters.seller);
    }

    // Global date range filter for activities (by creation date)
    if (currentFilters.date_start) {
      params.append('start_date', currentFilters.date_start);
    }
    if (currentFilters.date_end) {
      params.append('end_date', currentFilters.date_end);
    }
    
    const url = `${window.API_BASE_URL}/api/weekly-agenda?${params.toString()}`;
    console.log(`[AGENDA] Fetching: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar pauta semanal');
    }
    
    const data = await response.json();
    
    if (!data.success || !data.sellers || data.sellers.length === 0) {
      const container = document.getElementById('agenda-sellers-container');
      if (container) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-gray); padding: 40px;">Nenhum deal encontrado para este quarter/vendedor</p>';
      }
      return;
    }
    
    const sellers = data.sellers;
    const summary = data.summary;
    
    // Atualiza informação do quarter
    const quarterEl = document.getElementById('agenda-quarter');
    if (quarterEl) quarterEl.textContent = summary.quarter;
    
    // Atualiza cards de resumo (com safe checks)
    const sellersCountEl = document.getElementById('agenda-sellers-count');
    if (sellersCountEl) sellersCountEl.textContent = summary.total_sellers;
    
    const totalDealsEl = document.getElementById('agenda-total-deals');
    if (totalDealsEl) totalDealsEl.textContent = summary.total_deals;
    
    const totalValueEl = document.getElementById('agenda-total-value');
    if (totalValueEl) totalValueEl.textContent = 'R$ ' + summary.total_gross_k + 'K';
    
    const criticosEl = document.getElementById('agenda-criticos-count');
    if (criticosEl) criticosEl.textContent = summary.total_criticos;
    
    const zumbisEl = document.getElementById('agenda-zumbis-count');
    if (zumbisEl) zumbisEl.textContent = summary.total_zumbis;
    
    // Renderiza vendedores com tabs (Atividades / Oportunidades)
    let html = `
      <div style="display:flex; gap: 10px; align-items:center; margin: 0 0 16px 0;">
        <button id="agenda-tab-activities" onclick="setWeeklyAgendaView('activities')" style="background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Atividades
        </button>
        <button id="agenda-tab-deals" onclick="setWeeklyAgendaView('deals')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Oportunidades
        </button>
      </div>
    `;
    
    sellers.forEach((seller, idx) => {
      const perf = seller.performance || {};
      const feedback = seller.feedback || {};
      const pulse = seller.pulse || {};
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
                ${agendaIcon('icon-user')} ${seller.vendedor}
              </h4>
              <div style="display: flex; gap: 12px; font-size: 13px; color: var(--text-gray);">
                <span><strong>${sellerSummary.total_deals}</strong> deals</span>
                <span class="val-cyan" style="font-weight: 700;">R$ ${Math.round(sellerSummary.total_gross_k)}K</span>
                <span><strong>${sellerSummary.avg_confianca}%</strong> conf. média</span>
                ${sellerSummary.zumbis > 0 ? `<span class="val-red" style="font-weight: 700;">${agendaIcon('icon-alert')} ${sellerSummary.zumbis} ZUMBIS</span>` : ''}
              </div>

              <!-- PULSO SEMANAL -->
              ${renderWeeklyPulseBar(pulse, idx)}
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 6px;">NOTA DE HIGIENE</div>
              <span class="badge" style="background: ${gradeColor}20; color: ${gradeColor}; border: 2px solid ${gradeColor}; font-size: 28px; padding: 8px 20px; font-weight: 900;">
                ${perf.nota_higiene}
              </span>
            </div>
          </div>

          <!-- TAB: ATIVIDADES (somente) -->
          <div id="agenda-activities-${idx}" style="display:block;">
            ${renderAgendaActivitiesOnly(pulse, idx)}
          </div>
          
          <!-- PERFORMANCE METRICS -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="padding: 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline</div>
              <div style="font-size: 14px; font-weight: 700; color: var(--primary-cyan);">R$ ${perf.pipeline_gross_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray); opacity: 0.7; margin-bottom: 2px;">Net: R$ ${perf.pipeline_net_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.pipeline_deals} deals</div>
            </div>
            
            <div style="padding: 12px; background: rgba(192,255,125,0.08); border-radius: 8px; border: 1px solid rgba(192,255,125,0.2); cursor: pointer;" onclick="toggleWeeklyAgendaSection('closed-deals-${idx}')">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="font-size: 11px; color: var(--text-gray);">Fechado (Q)</div>
                <span id="closed-deals-${idx}-btn" style="font-size: 10px; color: var(--text-gray);">▼</span>
              </div>
              <div style="font-size: 14px; font-weight: 700; color: var(--accent-green);">R$ ${perf.closed_gross_k}K</div>
              <div style="font-size: 10px; color: ${perf.closed_net_k < 0 ? 'var(--danger)' : 'var(--text-gray)'}; font-weight: ${perf.closed_net_k < 0 ? '700' : '400'}; margin-bottom: 2px;">Net: R$ ${perf.closed_net_k}K</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.closed_deals || 0} deals | ${perf.win_rate ? perf.win_rate.toFixed(0) + '% win' : 'N/A'}</div>
            </div>
            
            <div style="padding: 12px; background: rgba(255,165,0,0.08); border-radius: 8px; border: 1px solid rgba(255,165,0,0.2);">
              <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline sem cadência</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--warning);">${perf.pipeline_podre_pct}%</div>
              <div style="font-size: 10px; color: var(--text-gray);">${perf.deals_zumbi} zumbis</div>
            </div>
            
            <div style="padding: 12px; background: rgba(255,61,87,0.08); border-radius: 8px; border: 1px solid rgba(255,61,87,0.2); cursor: pointer;" onclick="toggleWeeklyAgendaSection('lost-deals-${idx}')">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="font-size: 11px; color: var(--text-gray);">Perdidos (Q)</div>
                <span id="lost-deals-${idx}-btn" style="font-size: 10px; color: var(--text-gray);">▼</span>
              </div>
              <div style="font-size: 14px; font-weight: 700; color: var(--danger);">${perf.lost_deals || 0} deals</div>
              <div style="font-size: 10px; color: var(--text-gray); margin-bottom: 2px;">Clique para detalhes</div>
              <div style="font-size: 10px; color: var(--text-gray);">de vendas perdidas</div>
            </div>
          </div>
          
          <!-- DRILL-DOWN: CLOSED DEALS -->
          <div id="closed-deals-${idx}" style="display:none; margin-bottom: 16px;">
            ${renderDrillDownDeals(seller.closed_deals_detail || [], 'closed')}
          </div>
          
          <!-- DRILL-DOWN: LOST DEALS -->
          <div id="lost-deals-${idx}" style="display:none; margin-bottom: 16px;">
            ${renderDrillDownDeals(seller.lost_deals_detail || [], 'lost')}
          </div>
          
          <!-- FEEDBACK DE PERFORMANCE -->
          <div style="padding: 14px; background: ${statusColor}15; border-left: 4px solid ${statusColor}; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px; color: ${statusColor};">
              ${agendaIcon('icon-chart')} Feedback de Performance
            </div>
            <div style="font-size: 13px; color: var(--text-main); margin-bottom: 10px; line-height: 1.5;">
              ${feedback.message || 'Performance sendo avaliada...'}
            </div>
            ${feedback.recommendations && feedback.recommendations.length > 0 ? `
              <div style="font-size: 11px; color: var(--text-gray); font-weight: 600; margin-bottom: 6px;">${agendaIcon('icon-idea')} AÇÕES RECOMENDADAS:</div>
              <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-gray); line-height: 1.8;">
                ${feedback.recommendations.map(rec => `<li>${rec}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
          
          
          <!-- TAB: NOVAS OPORTUNIDADES -->
          <div id="agenda-dealswrap-${idx}" style="display:none;">
            <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin: 0 0 12px 0;">
              <h5 style="margin: 0; font-size: 14px; color: var(--text-main); font-weight: 700;">
                ${agendaIcon('icon-briefcase')} Oportunidades (${deals.length})
              </h5>
              <button id="agenda-toggle-btn-${idx}" onclick="toggleAgendaSellerDeals(${idx})" style="background: rgba(255,255,255,0.04); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
                Expandir
              </button>
            </div>
            <div id="agenda-deals-${idx}" style="display:none;">
              <div style="display: grid; gap: 12px;">
                ${renderSeller1on1Deals(deals)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    const container = document.getElementById('agenda-sellers-container');
    if (container) {
      container.innerHTML = html;
      // Default view: activities
      setWeeklyAgendaView('activities');
      console.log('[AGENDA] OK Pauta carregada:', sellers.length, 'vendedores', summary.total_deals, 'deals');
    } else {
      console.error('[AGENDA] Container desapareceu antes de renderizar');
    }
    
  } catch (error) {
    console.error('[AGENDA] Erro:', error);
    const container = document.getElementById('agenda-sellers-container');
    if (container) {
      container.innerHTML = `<div class="ai-card" style="border-left: 3px solid var(--danger);"><strong>Erro ao carregar pauta:</strong> ${error.message}</div>`;
    }
  }
}

function setWeeklyAgendaView(view) {
  window.weeklyAgendaView = view;

  const tabActivities = document.getElementById('agenda-tab-activities');
  const tabDeals = document.getElementById('agenda-tab-deals');
  if (tabActivities && tabDeals) {
    const on = 'background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--glass-border);';
    const off = 'background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border);';
    if (view === 'deals') {
      tabDeals.style.cssText += on;
      tabActivities.style.cssText += off;
    } else {
      tabActivities.style.cssText += on;
      tabDeals.style.cssText += off;
    }
  }

  const container = document.getElementById('agenda-sellers-container');
  if (!container) return;
  const cards = container.querySelectorAll('[id^="agenda-activities-"]');
  cards.forEach(el => {
    const idx = el.id.replace('agenda-activities-', '');
    const act = document.getElementById(`agenda-activities-${idx}`);
    const deals = document.getElementById(`agenda-dealswrap-${idx}`);
    if (act) act.style.display = view === 'deals' ? 'none' : 'block';
    if (deals) deals.style.display = view === 'deals' ? 'block' : 'none';
  });
}

function renderAgendaActivitiesOnly(pulse, sellerIdx) {
  const p = pulse || {};
  const periodo = p.periodo || {};
  const inicio = formatDateDMY(periodo.inicio || '');
  const fim = formatDateDMY(periodo.fim || '');

  const periodLabel = (inicio && fim) ? `${inicio} até ${fim}` : (inicio || fim) ? `${inicio || fim}` : 'Semana atual';
  const last = Array.isArray(p.last_activities) ? p.last_activities : [];
  const activitiesId = `activities-list-${sellerIdx || 0}`;

  return `
    <div style="padding: 16px; background: linear-gradient(135deg, rgba(0,190,255,0.06) 0%, rgba(0,190,255,0.02) 100%); border-radius: 12px; border: 1px solid rgba(0,190,255,0.25); margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid rgba(0,190,255,0.2); cursor: pointer;" onclick="toggleWeeklyAgendaSection('${activitiesId}')">
        <div style="font-weight: 900; font-size: 14px; color: var(--primary-cyan); display: flex; align-items: center; gap: 6px;">
          <span id="${activitiesId}-btn" style="font-size: 12px; transition: transform 0.2s;">▼</span>
          ${agendaIcon('icon-activity')} <span>Últimas 15 atividades</span>
        </div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 800; background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 6px;">${periodLabel}</div>
      </div>

      <div id="${activitiesId}" style="display:block;">
        ${last.length ? `
          <div style="display:grid; gap: 12px;">
            ${last.map((it, idx) => {
              const dt = formatDateDMY(String(it.data_criacao || ''));
              const tipo = stripHtml(String(it.tipo || 'Atividade'));
              const status = stripHtml(String(it.status || ''));
              const cliente = stripHtml(String(it.cliente || ''));
              const oportunidade = stripHtml(String(it.oportunidade || ''));
              const assunto = stripHtml(String(it.assunto || ''));
              const contato = stripHtml(String(it.contato || ''));
              const comentarios = stripHtml(String(it.comentarios || ''));
              const resumoIA = it.resumo_ia ? stripHtml(String(it.resumo_ia)) : '';
            const headerLeft = [dt, tipo].filter(Boolean).join(' • ');
            const headerRight = [status].filter(Boolean).join('');
            const line1 = [cliente, oportunidade].filter(Boolean).join(' • ');
            const line2 = [assunto, contato].filter(Boolean).join(' • ');

            // Variação de cores baseada no tipo de atividade e index
            const hasIA = !!resumoIA;
            const isReuniao = tipo && tipo.toLowerCase().includes('reuniones');
            const isCompletada = status && status.toLowerCase() === 'completada';
            
            let cardBg, cardBorder, accentColor;
            if (hasIA) {
              cardBg = 'linear-gradient(135deg, rgba(192,255,125,0.12) 0%, rgba(192,255,125,0.06) 100%)';
              cardBorder = 'rgba(192,255,125,0.4)';
              accentColor = 'var(--accent-green)';
            } else if (isReuniao) {
              cardBg = 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.05) 100%)';
              cardBorder = 'rgba(139,92,246,0.35)';
              accentColor = 'var(--primary-purple)';
            } else if (isCompletada) {
              cardBg = 'linear-gradient(135deg, rgba(0,190,255,0.10) 0%, rgba(0,190,255,0.05) 100%)';
              cardBorder = 'rgba(0,190,255,0.35)';
              accentColor = 'var(--primary-cyan)';
            } else {
              cardBg = 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)';
              cardBorder = 'rgba(255,255,255,0.2)';
              accentColor = 'rgba(255,255,255,0.8)';
            }

            return `
              <div style="padding: 16px; background: ${cardBg}; border-radius: 12px; border-left: 4px solid ${accentColor}; border-right: 1px solid ${cardBorder}; border-top: 1px solid ${cardBorder}; border-bottom: 1px solid ${cardBorder}; backdrop-filter: blur(10px); transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.15); position: relative;">
                <div style="display:flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 10px;">
                  <div style="font-size: 13px; color: ${accentColor}; font-weight: 900; letter-spacing: 0.3px;">${headerLeft || 'Atividade'}</div>
                  ${headerRight ? `<div style="font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 800; background: ${isCompletada ? 'rgba(0,190,255,0.25)' : 'rgba(0,0,0,0.25)'}; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">${headerRight}</div>` : ''}
                </div>
                ${line1 ? `<div style="margin-top: 8px; font-size: 14px; color: rgba(255,255,255,0.95); line-height: 1.6; font-weight: 700;">${line1}</div>` : ''}
                ${line2 ? `<div style="margin-top: 6px; font-size: 13px; color: rgba(255,165,0,0.9); line-height: 1.5; font-weight: 600;">${line2}</div>` : ''}
                ${resumoIA ? `
                  <div style="margin-top: 14px; padding: 12px; background: rgba(192,255,125,0.15); border-left: 4px solid var(--accent-green); border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="font-size: 12px; color: var(--accent-green); font-weight: 900; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${agendaIcon('icon-idea')} RESUMO IA (MEDDIC)
                    </div>
                    <div style="font-size: 13px; color: rgba(255,255,255,0.95); line-height: 1.7; white-space: pre-line; font-weight: 500;">${resumoIA}</div>
                  </div>
                ` : ''}
                ${comentarios && !resumoIA && comentarios.length > 50 ? `
                  <div style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.15); border-radius: 8px; border-left: 3px solid rgba(255,165,0,0.5);">
                    <div style="font-size: 11px; color: rgba(255,165,0,0.8); font-weight: 800; margin-bottom: 6px; text-transform: uppercase;">COMENTÁRIOS</div>
                    <div style="font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.7;">${comentarios.length > 300 ? comentarios.substring(0, 300) + '...' : comentarios}</div>
                  </div>
                ` : comentarios && !resumoIA ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.15); font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.6;">${comentarios}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : '<div style="color: rgba(255,255,255,0.5); font-size: 14px; text-align: center; padding: 20px;">Sem atividades no período.</div>'}
      </div>
    </div>
  `;
}

function renderSellerActivitiesPulse(pulse) {
  if (!pulse || typeof pulse !== 'object') return '';
  const periodo = pulse.periodo || {};
  const inicio = formatDateDMY(periodo.inicio || '');
  const fim = formatDateDMY(periodo.fim || '');
  const atividades = Number(pulse.atividades_periodo || 0) || 0;
  const reunioes = Number(pulse.reunioes_periodo || 0) || 0;
  const trend = String(pulse.trend || 'flat');
  const qualidade = pulse.qualidade_registros || {};
  const poor = Number(qualidade.pobres || 0) || 0;
  const total = Number(qualidade.total || 0) || 0;
  const qScore = String(qualidade.score || 'N/A');
  const activitiesList = Array.isArray(pulse.activities) ? pulse.activities : [];

  const trendLabel = trend === 'up' ? 'Subindo' : trend === 'down' ? 'Caindo' : 'Estável';
  const trendColor = trend === 'up' ? 'var(--accent-green)' : trend === 'down' ? 'var(--danger)' : 'var(--text-gray)';
  const qualityColor = qScore === 'A' ? 'var(--accent-green)' : qScore === 'B' ? 'var(--success)' : qScore === 'C' ? 'var(--warning)' : qScore === 'D' ? 'var(--danger)' : 'var(--text-gray)';

  const periodLabel = (inicio && fim) ? `${inicio} até ${fim}` : (inicio || fim) ? `${inicio || fim}` : 'Período atual';

  return `
    <div style="padding: 14px; background: rgba(0,190,255,0.06); border-radius: 8px; border: 1px solid rgba(0,190,255,0.18); margin-bottom: 20px;">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin-bottom: 10px;">
        <div style="font-weight: 800; font-size: 13px; color: var(--primary-cyan);">
          ${agendaIcon('icon-activity')} Atividades (detalhes)
        </div>
        <div style="font-size: 11px; color: var(--text-gray); font-weight: 700;">
          ${periodLabel}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px;">
        <div style="padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid var(--glass-border);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Atividades</div>
          <div style="font-size: 15px; font-weight: 900; color: var(--text-main);">${atividades}</div>
          <div style="font-size: 10px; color: ${trendColor}; font-weight: 800;">${trendLabel}</div>
        </div>
        <div style="padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid var(--glass-border);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Reuniões concluídas</div>
          <div style="font-size: 15px; font-weight: 900; color: ${reunioes === 0 ? 'var(--danger)' : 'var(--text-main)'};">${reunioes}</div>
          ${reunioes === 0 ? `<div style="font-size: 10px; color: var(--danger); font-weight: 800;">Sem reuniões no período</div>` : `<div style="font-size: 10px; color: var(--text-gray);">OK</div>`}
        </div>
        <div style="padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid var(--glass-border);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Qualidade CRM</div>
          <div style="font-size: 15px; font-weight: 900; color: ${qualityColor};">${qScore}</div>
          <div style="font-size: 10px; color: var(--text-gray);">${poor}/${total} registros curtos</div>
        </div>
        <div style="padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid var(--glass-border);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Detalhes</div>
          <div style="font-size: 12px; color: var(--text-main); font-weight: 800;">${activitiesList.length} itens</div>
          <div style="font-size: 10px; color: var(--text-gray);">últimos registros</div>
        </div>
      </div>

      <div style="display: grid; gap: 8px;">
        ${activitiesList.length === 0 ? `
          <div style="font-size: 12px; color: var(--text-gray);">Nenhuma atividade registrada no período.</div>
        ` : activitiesList.map(a => {
          const created = formatDateDMY(a.data_criacao || '');
          const tipo = escapeHtml((a.tipo || '').toString().trim());
          const empresa = escapeHtml((a.empresa || '').toString().trim());
          const assunto = escapeHtml((a.assunto || '').toString().trim());
          const status = escapeHtml((a.status || '').toString().trim());
          const resumo = escapeHtml((a.resumo || '').toString().trim());
          const qualidade = escapeHtml((a.qualidade || '').toString().trim());
          const qColor = qualidade === 'ruim' ? 'var(--danger)' : 'var(--text-gray)';
          const left = [tipo, empresa].filter(Boolean).join(' • ');
          const right = [status].filter(Boolean).join('');
          return `
            <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
              <div style="display:flex; justify-content: space-between; gap: 10px; margin-bottom: 4px;">
                <div style="font-size: 12px; font-weight: 800; color: var(--text-main);">${left || 'Atividade'}</div>
                <div style="font-size: 11px; color: var(--text-gray);">${created}</div>
              </div>
              ${assunto ? `<div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">${assunto}</div>` : ''}
              <div style="display:flex; justify-content: space-between; gap: 10px; align-items: baseline;">
                <div style="font-size: 12px; color: var(--text-main); line-height: 1.4;">${resumo || '<span style="color: var(--text-gray);">Sem comentários</span>'}</div>
                <div style="font-size: 11px; font-weight: 900; color: ${qColor}; white-space: nowrap;">${qualidade ? qualidade.toUpperCase() : ''}${right ? ` • ${right}` : ''}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderWeeklyPulseBar(pulse, idx) {
  if (!pulse || typeof pulse !== 'object') return '';
  const atividades = Number(pulse.atividades_semana || 0) || 0;
  const metaAtv = Number(pulse.meta_atividades || 0) || 0;
  const reunioes = Number(pulse.reunioes_semana || 0) || 0;
  const metaReu = Number(pulse.meta_reunioes || 0) || 0;
  const qualidade = pulse.qualidade_registros || {};
  const pobres = Number(qualidade.pobres || 0) || 0;
  const total = Number(qualidade.total || 0) || 0;
  const score = String(qualidade.score || 'N/A');
  const drill = Array.isArray(pulse.drill_down) ? pulse.drill_down : [];

  const pctAtv = metaAtv > 0 ? Math.min(100, Math.round((atividades / metaAtv) * 100)) : 0;
  const pctReu = metaReu > 0 ? Math.min(100, Math.round((reunioes / metaReu) * 100)) : 0;

  const scoreColor = score === 'A' ? 'var(--accent-green)'
    : score === 'B' ? 'var(--success)'
    : score === 'C' ? 'var(--warning)'
    : score === 'D' ? 'var(--danger)'
    : 'var(--text-gray)';

  const qualityLabel = (pobres === 0 && total > 0)
    ? 'Registros completos'
    : (pobres > 0)
      ? `${pobres} registros pobres`
      : 'Sem registros';
  const qualityColor = (pobres === 0 && total > 0) ? 'var(--accent-green)'
    : (pobres > 0) ? (score === 'D' ? 'var(--danger)' : 'var(--warning)')
    : 'var(--text-gray)';

  const tooltipMeetId = `pulse-tooltip-meet-${idx}`;
  const tooltipQualId = `pulse-tooltip-qual-${idx}`;
  const tooltipInner = `
      <div style="font-size: 11px; font-weight: 900; color: var(--text-gray); margin-bottom: 8px; letter-spacing: 0.4px;">AUDITORIA (últimas atividades)</div>
      <div style="display:grid; gap: 8px;">
        ${drill.length === 0 ? `<div style="font-size: 12px; color: var(--text-gray);">Sem atividades no período.</div>` : drill.map(a => {
          const data = formatDateDMY((a.data || '').toString());
          const tipo = escapeHtml((a.tipo || '').toString());
          const cliente = escapeHtml((a.cliente || '').toString());
          const resumo = escapeHtml((a.resumo || '').toString());
          const qualidade = escapeHtml((a.qualidade || '').toString());
          const isPoor = qualidade.toLowerCase() === 'ruim' || (resumo || '').trim().length < 30;
          const resumoStyle = isPoor ? 'color: var(--danger); font-weight: 800;' : 'color: var(--text-main);';
          const metaLeft = [data, tipo].filter(Boolean).join(' • ');
          const metaRight = [cliente].filter(Boolean).join('');
          return `
            <div style="padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
              <div style="display:flex; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
                <div style="font-size: 11px; color: var(--text-gray); font-weight: 800;">${metaLeft || 'Atividade'}</div>
                <div style="font-size: 11px; color: var(--text-gray);">${metaRight}</div>
              </div>
              <div style="font-size: 12px; line-height: 1.4; ${resumoStyle}">${resumo || '<span style="color: var(--text-gray);">Sem comentários</span>'}</div>
            </div>
          `;
        }).join('')}
      </div>
  `;

  const tooltipBox = (id) => `
    <div id="${id}" style="display:none; position:absolute; left: 0; top: 100%; margin-top: 8px; width: 420px; max-width: 70vw; padding: 12px; background: rgba(8,14,23,0.96); border: 1px solid var(--glass-border); border-radius: 12px; z-index: 50; box-shadow: 0 16px 40px rgba(0,0,0,0.45);">
      ${tooltipInner}
    </div>
  `;

  const showTooltip = (id) => `const el=document.getElementById('${id}'); if(el){el.style.display='block';}`;
  const hideTooltip = (id) => `const el=document.getElementById('${id}'); if(el){el.style.display='none';}`;

  return `
    <div style="margin-top: 12px; position: relative;">
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
        <div style="padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
          <div style="font-size: 11px; color: var(--text-gray); font-weight: 800; margin-bottom: 6px;">${agendaIcon('icon-activity')} Atividades</div>
          <div style="font-size: 13px; font-weight: 900; color: var(--text-main); margin-bottom: 6px;">${atividades}/${metaAtv || '-'} </div>
          <div style="height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
            <div style="height: 100%; width: ${pctAtv}%; background: rgba(0,190,255,0.75);"></div>
          </div>
        </div>

        <div onmouseenter="${showTooltip(tooltipMeetId)}" onmouseleave="${hideTooltip(tooltipMeetId)}" style="padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; cursor: default;">
          <div style="font-size: 11px; color: var(--text-gray); font-weight: 800; margin-bottom: 6px;">${agendaIcon('icon-target')} Reuniões</div>
          <div style="font-size: 13px; font-weight: 900; color: ${reunioes === 0 ? 'var(--danger)' : 'var(--text-main)'}; margin-bottom: 6px;">${reunioes}/${metaReu || '-'}</div>
          <div style="height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
            <div style="height: 100%; width: ${pctReu}%; background: rgba(192,255,125,0.75);"></div>
          </div>
          ${tooltipBox(tooltipMeetId)}
        </div>

        <div onmouseenter="${showTooltip(tooltipQualId)}" onmouseleave="${hideTooltip(tooltipQualId)}" style="padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; cursor: default;">
          <div style="font-size: 11px; color: var(--text-gray); font-weight: 800; margin-bottom: 6px;">${agendaIcon('icon-alert')} Qualidade CRM</div>
          <div style="font-size: 13px; font-weight: 900; color: ${qualityColor}; margin-bottom: 2px;">${qualityLabel}</div>
          <div style="font-size: 11px; color: ${scoreColor}; font-weight: 900;">Nota: ${score}</div>
          ${tooltipBox(tooltipQualId)}
        </div>

        <div style="padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
          <div style="font-size: 11px; color: var(--text-gray); font-weight: 800; margin-bottom: 6px;">${agendaIcon('icon-briefcase')} Detalhes</div>
          <div style="font-size: 13px; font-weight: 900; color: var(--text-main); margin-bottom: 2px;">${drill.length} itens</div>
          <div style="font-size: 11px; color: var(--text-gray);">hover em Reuniões/Qualidade</div>
        </div>
      </div>
    </div>
  `;
}

function toggleAgendaSellerDeals(idx) {
  const container = document.getElementById(`agenda-deals-${idx}`);
  const btn = document.getElementById(`agenda-toggle-btn-${idx}`);
  if (!container || !btn) return;
  const isHidden = container.style.display === 'none' || !container.style.display;
  container.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? 'Recolher' : 'Expandir';
}


function renderSeller1on1Deals(deals) {
  if (!deals || deals.length === 0) {
    return '<p style="text-align: center; color: var(--text-gray); padding: 20px;">Nenhum deal no quarter atual</p>';
  }
  
  return deals.map(deal => {
    const ui = deal.ui || {};
    const confidence = parseFloat(deal.Confianca || 0) || 0;
    const gross = parseFloat(deal.Gross || 0) || 0;
    const net = parseFloat(deal.Net || 0) || 0;
    const categoria = deal.Categoria_Pauta || ui.categoria || 'MONITORAR';
    const categoriaLabel = ui.categoriaLabel || deal.Categoria_Pauta || 'MONITORAR';
    const riscoRaw = deal.Risco_Score || ui.riscoScore || 0;
    const risco = Math.max(0, Math.min(5, Number(riscoRaw) || 0));
    const questions = deal.sabatina_questions || [];

    const riskTags = normalizeTagList(ui.riskTags || deal.Risk_Tags || deal.risk_tags);
    const justificativaIA = ui.justificativaIA || deal.Justificativa_IA || deal.justificativaIA || deal.Motivo_Confianca || deal.motivo_confianca || '';
    const iaNotaLabel = ui.iaNotaLabel || ui.iaNota || '';
    const riscoPrincipal = (ui.riscoPrincipal || deal.Risco_Principal || '').trim();
    const faseAtual = deal.Fase_Atual || deal.Fase || deal.Stage || '';
    const fechamentoQuarter = (deal.Fechamento_Fiscal_Q || '').toString().trim();
    const pautaQuarter = (deal.Fiscal_Q || '').toString().trim();
    const fechamentoMismatch = fechamentoQuarter && pautaQuarter && fechamentoQuarter !== pautaQuarter;
    const riskReasons = Array.isArray(ui.riskReasons)
      ? ui.riskReasons
      : Array.isArray(deal.risk_reasons)
        ? deal.risk_reasons
        : Array.isArray(deal.Risk_Reasons)
          ? deal.Risk_Reasons
          : [];
    
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
                ${categoriaLabel}
              </span>
              <span style="font-size: 11px; color: var(--text-gray);">
                ${deal.Fiscal_Q || 'Q?'}${fechamentoQuarter ? ` | Fechamento: <span style="color:${fechamentoMismatch ? 'var(--warning)' : 'var(--text-gray)'}; font-weight:${fechamentoMismatch ? '900' : '700'};">${fechamentoQuarter}</span>` : ''} | ${deal.Dias_Funil || 0} dias funil${faseAtual ? ` | Fase: ${faseAtual}` : ''}
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
            ${riscoPrincipal ? `
              <div style="font-size: 11px; color: var(--text-gray); margin-top: 6px; line-height: 1.4; max-width: 320px;">
                <strong>Risco principal:</strong> ${riscoPrincipal}
              </div>
            ` : ''}
          </div>
        </div>

        ${(riskTags.length > 0 || justificativaIA || iaNotaLabel || riskReasons.length > 0 || riscoPrincipal) ? `
          <div style="margin-top: 12px; padding: 12px; background: rgba(255,165,0,0.06); border-radius: 8px; border: 1px solid rgba(255,165,0,0.18);">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; color: var(--warning);">
              ${agendaIcon('icon-alert')} Riscos e justificativa
            </div>
            ${(riscoPrincipal) ? `<div style="font-size: 12px; color: var(--text-gray); margin-bottom: 8px;"><strong>Risco principal:</strong> ${riscoPrincipal}</div>` : ''}
            ${(iaNotaLabel) ? `<div style="font-size: 12px; color: var(--text-gray); margin-bottom: 8px;"><strong>Nota IA:</strong> ${iaNotaLabel}</div>` : ''}
            ${(riskTags.length > 0) ? `
              <div style="display:flex; gap:6px; flex-wrap: wrap; margin-bottom: 8px;">
                ${riskTags.slice(0, 8).map(t => `<span class="badge" style="background: rgba(255,165,0,0.14); color: var(--warning); border: 1px solid rgba(255,165,0,0.25);">${t}</span>`).join('')}
              </div>
            ` : ''}
            ${(justificativaIA) ? `
              <div style="font-size: 12px; color: var(--text-gray); line-height: 1.6;">
                <strong>Justificativa:</strong> ${justificativaIA}
              </div>
            ` : ''}
            ${(riskReasons.length > 0) ? `
              <ul style="margin: 8px 0 0 0; padding-left: 18px; font-size: 12px; color: var(--text-gray); line-height: 1.7;">
                ${riskReasons.slice(0, 5).map(r => `<li>${r}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        ` : ''}

        <!-- Sabatina Questions -->
        ${questions.length > 0 ? `
          <div style="margin-top: 14px; padding: 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2);">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; color: var(--primary-cyan);">
              ${agendaIcon('icon-target')} Perguntas para 1-on-1:
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
