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

function normalizeRiskTagKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function humanizeLabelToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lowerWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return normalized
    .split(' ')
    .map((part, idx) => {
      const lower = part.toLowerCase();
      if (idx > 0 && lowerWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function toUiCaps(value) {
  const txt = humanizeLabelToken(String(value || '').trim());
  return txt ? txt.toUpperCase() : '';
}

function formatPersonDisplayName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return raw
    .split(',')
    .map((chunk) => humanizeLabelToken(chunk))
    .filter(Boolean)
    .join(', ');
}

function formatSalesSpecialistInvolvementLabel(data) {
  const boolRaw = String(data?.Sales_Specialist_Envolvido || data?.sales_specialist_envolvido || '').trim();
  const namesRaw = String(
    data?.Sales_Specialist ||
    data?.sales_specialist ||
    data?.Sales_Specialist_Name ||
    data?.sales_specialist_name ||
    data?.ss_owner ||
    data?.owner_preventa ||
    ''
  ).trim();

  const names = normalizeTagList(namesRaw)
    .map((name) => formatPersonDisplayName(name))
    .filter(Boolean);

  if (names.length) return Array.from(new Set(names)).join(', ');
  return normalizeBooleanLabel(boolRaw, 'Com SS', 'Sem SS');
}

function extractDealRiskTags(deal) {
  const uiTags = normalizeTagList((deal?.ui && deal.ui.riskTags) || []);
  const rawTags = normalizeTagList(deal?.Risk_Tags || deal?.risk_tags || '');

  const labels = [];
  const seenKeys = new Set();
  const addUnique = (tag) => {
    const txt = humanizeLabelToken(tag);
    if (!txt) return;
    const key = normalizeRiskTagKey(txt);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    if (!labels.some((x) => x.toLowerCase() === txt.toLowerCase())) {
      labels.push(txt);
    }
  };

  uiTags.forEach((t) => {
    if (typeof t === 'object') {
      addUnique(t.label || t.key || '');
    } else {
      addUnique(t);
    }
  });
  rawTags.forEach(addUnique);

  return labels;
}

function formatDateDMY(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function formatDateTimeBR(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function renderEmptyState(message) {
  return `<div style="text-align:center; color: var(--text-gray); padding: 20px; font-size: 12px;">${escapeHtml(message || 'Sem dados no período.')}</div>`;
}

function formatAiSummaryText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\s*(⚠️\s*RISCOS\/BLOQUEIOS:)/g, '\n\n$1')
    .replace(/\s*(🚀\s*PRÓXIMOS PASSOS \(Actionable\):)/g, '\n\n$1')
    .replace(/:\s*-\s+/g, ':\n- ')
    .replace(/\s+-\s+\[/g, '\n- [')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeFeedbackCopy(text) {
  const raw = String(text || '');
  if (!raw) return '';
  return raw
    .replace(/pipeline\s+podre/gi, 'pipeline sem avanço')
    .replace(/deals\s+zumbis?/gi, 'oportunidades sem avanço')
    .replace(/\bdeals\b/gi, 'oportunidades');
}

function normalizeOpportunityType(value) {
  const raw = String(value || '').trim();
  if (!raw) return { key: 'unknown', label: 'Não informado' };

  const normalizedText = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const compact = normalizedText.replace(/[^a-z0-9]+/g, '');

  if (normalizedText.includes('novo') || normalizedText.includes('nova') || compact.includes('new')) {
    return { key: 'nova', label: 'Nova' };
  }
  if (compact.includes('renov') || compact.includes('renew')) {
    return { key: 'renovacao', label: 'Renovação' };
  }
  if (compact.includes('transfertoken') || compact.includes('transfertokem') || compact.includes('transfert') || compact.includes('transfer')) {
    return { key: 'transfertoken', label: 'TransferToken' };
  }

  return { key: 'other', label: raw };
}

function renderOpportunityTypeTag(schemaTypeValue, fallbackTypeValue = '') {
  const primary = normalizeOpportunityType(schemaTypeValue);
  const finalType = primary.key !== 'unknown' ? primary : normalizeOpportunityType(fallbackTypeValue);

  const styleMap = {
    nova: {
      color: '#86efac',
      bg: 'rgba(134,239,172,0.16)',
      border: 'rgba(134,239,172,0.34)'
    },
    renovacao: {
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.16)',
      border: 'rgba(251,191,36,0.34)'
    },
    transfertoken: {
      color: '#c4b5fd',
      bg: 'rgba(196,181,253,0.16)',
      border: 'rgba(196,181,253,0.34)'
    },
    other: {
      color: 'var(--primary-cyan)',
      bg: 'rgba(0,190,255,0.10)',
      border: 'rgba(0,190,255,0.28)'
    },
    unknown: {
      color: 'var(--text-gray)',
      bg: 'rgba(148,163,184,0.12)',
      border: 'rgba(148,163,184,0.22)'
    }
  };

  const s = styleMap[finalType.key] || styleMap.other;
  return `<span style="font-size: 11px; font-weight: 800; color: ${s.color}; background: ${s.bg}; border: 1px solid ${s.border}; border-radius: 999px; padding: 3px 10px; letter-spacing: 0.2px; text-transform: uppercase;">${escapeHtml(toUiCaps(finalType.label) || finalType.label)}</span>`;
}

function normalizeBooleanLabel(value, yesLabel, noLabel) {
  const lowered = String(value || '').trim().toLowerCase();
  if (['sim', 'yes', 'true', '1', 'y'].includes(lowered)) return yesLabel;
  if (['nao', 'não', 'no', 'false', '0', 'n'].includes(lowered)) return noLabel;
  return String(value || '').trim() || 'Não informado';
}

function renderBusinessContextTags(data) {
  const perfilCliente = toUiCaps(String(data?.Perfil_Cliente || data?.perfil_cliente || data?.Perfil || '').trim()) || 'NAO INFORMADO';
  const statusCliente = toUiCaps(String(data?.Status_Cliente || data?.status_cliente || '').trim()) || 'NAO INFORMADO';
  const ssEnvolvido = formatSalesSpecialistInvolvementLabel(data);
  const ssEnvolvidoCaps = toUiCaps(ssEnvolvido) || 'SEM SS';

  const tagStyle = 'font-size: 11px; border-radius: 999px; padding: 3px 8px;';
  return `
    <span style="${tagStyle} color: rgba(255,255,255,0.95); background: rgba(148,163,184,0.22); border: 1px solid rgba(148,163,184,0.42); text-transform: uppercase;">${escapeHtml(perfilCliente)}</span>
    <span style="${tagStyle} color: #fbbf24; background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.30); text-transform: uppercase;">${escapeHtml(statusCliente)}</span>
    <span style="${tagStyle} color: #86efac; background: rgba(134,239,172,0.10); border: 1px solid rgba(134,239,172,0.30); text-transform: uppercase;">SS: ${escapeHtml(ssEnvolvidoCaps)}</span>
  `;
}

function toggleClampText(contentId, button) {
  const el = document.getElementById(contentId);
  if (!el || !button) return;
  const expanded = button.getAttribute('data-expanded') === 'true';
  if (expanded) {
    el.style.display = '-webkit-box';
    el.style.webkitBoxOrient = 'vertical';
    el.style.webkitLineClamp = button.getAttribute('data-lines') || '3';
    el.style.overflow = 'hidden';
    button.setAttribute('data-expanded', 'false');
    button.textContent = 'ver mais';
  } else {
    el.style.display = 'block';
    el.style.webkitBoxOrient = 'unset';
    el.style.webkitLineClamp = 'unset';
    el.style.overflow = 'visible';
    button.setAttribute('data-expanded', 'true');
    button.textContent = 'ver menos';
  }
}

function renderClampText(text, contentId, maxLines = 3) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const safe = escapeHtml(raw);
  if (raw.length <= 180) {
    return `<div style="font-size: 12px; color: var(--text-main); line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word;">${safe}</div>`;
  }
  return `
    <div id="${contentId}" style="font-size: 12px; color: var(--text-main); line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${maxLines}; overflow: hidden;">
      ${safe}
    </div>
    <button data-expanded="false" data-lines="${maxLines}" onclick="toggleClampText('${contentId}', this)" style="margin-top: 6px; background: transparent; color: var(--primary-cyan); border: 1px solid rgba(0,190,255,0.35); padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; cursor: pointer;">ver mais</button>
  `;
}

function sectionLabel(text) {
  return `<span style="display:inline-flex; align-items:center; margin-bottom: 8px; padding: 3px 10px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-gray); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px;">${escapeHtml(text || 'Seção')}</span>`;
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

function normalizeActivityType(value) {
  const raw = String(value || '').trim();
  if (!raw) return { key: 'sem_tipo', label: 'Sem tipo' };
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return { key: key || 'sem_tipo', label: raw };
}

function isMeetingActivity(tipo) {
  const text = String(tipo || '').toLowerCase();
  return /(reun|meeting|video|call|kickoff|sync)/.test(text);
}

function normalizeLocalMode(local) {
  const text = String(local || '').toLowerCase();
  if (!text) return 'nao_informado';
  if (/(online|meet|teams|zoom|video|remoto|virtual)/.test(text)) return 'online';
  if (/(presencial|office|escritorio|in loco|inloco|cliente)/.test(text)) return 'presencial';
  return 'nao_informado';
}

function summarizeActivitiesByType(activities) {
  const map = new Map();
  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    const normalized = normalizeActivityType(activity?.tipo);
    if (!map.has(normalized.key)) {
      map.set(normalized.key, { key: normalized.key, label: normalized.label, total: 0 });
    }
    map.get(normalized.key).total += 1;
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function filterAgendaActivitiesByType(sellerIdx, typeKey) {
  const listEl = document.getElementById(`activities-grid-${sellerIdx}`);
  if (!listEl) return;
  const value = String(typeKey || 'all');
  const rows = listEl.querySelectorAll('.agenda-activity-row');
  rows.forEach((row) => {
    const rowType = row.getAttribute('data-activity-type') || 'sem_tipo';
    row.style.display = (value === 'all' || rowType === value) ? 'block' : 'none';
  });
}

function filterWeeklyAgendaDealsByRiskTag(sellerIdx, rawTagKey) {
  const grid = document.getElementById(`agenda-deals-grid-${sellerIdx}`);
  if (!grid) return;
  const selectedKey = String(rawTagKey || 'all');
  const rows = grid.querySelectorAll('.agenda-deal-row');
  rows.forEach((row) => {
    const tags = String(row.getAttribute('data-risk-tags') || '');
    const rowKeys = tags.split('|').filter(Boolean);
    const visible = selectedKey === 'all' || rowKeys.includes(selectedKey);
    row.style.display = visible ? 'block' : 'none';
  });
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

function toggleWeeklyAgendaBlock(sectionId) {
  const el = document.getElementById(sectionId);
  const btn = document.getElementById(`${sectionId}-btn`);
  if (!el) return;
  const isVisible = el.style.display !== 'none';
  el.style.display = isVisible ? 'none' : 'block';
  if (btn) {
    btn.textContent = isVisible ? '▶ Expandir' : '▼ Recolher';
  }
}

function toggleAgendaPersonCard(contentId) {
  const el = document.getElementById(contentId);
  const btn = document.getElementById(`${contentId}-btn`);
  if (!el) return;
  const isVisible = el.style.display !== 'none';
  el.style.display = isVisible ? 'none' : 'block';
  if (btn) {
    btn.textContent = isVisible ? '▶ Expandir' : '▼ Recolher';
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
        <span>Gross: $${(totalGross/1000).toFixed(0)}K | Net: $${(totalNet/1000).toFixed(0)}K</span>
      </div>
      <div style="display: grid; gap: 8px; max-height: 300px; overflow-y: auto;">
        ${deals.map(d => `
          <div style="padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; border-left: 3px solid ${titleColor};">
            <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95); margin-bottom: 4px;">${escapeHtml(d.oportunidade || 'N/A')}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.75); margin-bottom: 6px;">${escapeHtml(d.conta || 'N/A')}</div>
            <div style="display: flex; gap: 12px; font-size: 11px; color: rgba(255,255,255,0.6); flex-wrap: wrap;">
              <span>Gross: <strong style="color: ${titleColor};">$${(d.gross/1000 || 0).toFixed(1)}K</strong></span>
              <span>Net: <strong>$${(d.net/1000 || 0).toFixed(1)}K</strong></span>
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

function renderWeeklyAgendaSellerCard(seller, idx) {
  const perf = seller.performance || {};
  const feedback = seller.feedback || {};
  const pulse = seller.pulse || {};
  const deals = seller.deals || [];
  const newDeals = seller.new_deals_detail || [];
  const activitiesCount = Array.isArray(pulse.last_activities)
    ? pulse.last_activities.length
    : (Number(pulse.atividades_periodo || 0) || 0);
  const reunioesCount = Number(pulse.reunioes_semana || 0) || 0;
  const novasCount = Number(pulse.novas_oportunidades_periodo || 0) || 0;
  const sellerSummary = seller.summary || {};
  const normalizedFeedbackMessage = normalizeFeedbackCopy(feedback.message || 'Performance sendo avaliada...');
  const normalizedRecommendations = (feedback.recommendations || []).map(rec => normalizeFeedbackCopy(rec));

  const statusColors = {
    'excellent': 'var(--accent-green)',
    'good': 'var(--success)',
    'needs_improvement': 'var(--warning)',
    'critical': 'var(--danger)'
  };
  const statusColor = statusColors[feedback.status] || 'var(--text-gray)';
  const sellerContentId = `agenda-seller-content-${idx}`;
  const sellerDisplayName = formatPersonDisplayName(seller.vendedor || 'Sem vendedor');
  const isSsOwnerCard = Number(idx) >= 3000;
  const cardBg = isSsOwnerCard
    ? 'rgba(255,255,255,0.045)'
    : 'rgba(255,255,255,0.07)';
  const cardBorder = isSsOwnerCard
    ? '1px solid rgba(255,255,255,0.12)'
    : '1px solid rgba(255,255,255,0.16)';
  const cardShadow = isSsOwnerCard
    ? 'inset 0 1px 0 rgba(255,255,255,0.03)'
    : 'none';

  return `
    <div style="margin-bottom: 16px; padding: 14px; background: ${cardBg}; border-radius: 14px; border: ${cardBorder}; box-shadow: ${cardShadow}; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
      <div onclick="toggleAgendaPersonCard('${sellerContentId}')" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid ${statusColor}55; cursor: pointer;">
        <div>
          <h4 style="margin: 0 0 8px 0; color: var(--primary-cyan); font-size: 18px; font-weight: 700;">
            ${agendaIcon('icon-user')} ${sellerDisplayName}
          </h4>
          <div style="display: flex; gap: 12px; font-size: 13px; color: var(--text-gray);">
            <span><strong>${sellerSummary.total_deals || 0}</strong> deals</span>
            <span class="val-cyan" style="font-weight: 700;">$${Math.round(sellerSummary.total_gross_k || 0)}K</span>
            <span><strong>${sellerSummary.avg_confianca || 0}%</strong> conf. média</span>
            <span><strong>${reunioesCount}</strong> reuniões</span>
            <span><strong>${novasCount}</strong> novas</span>
            ${(sellerSummary.zumbis || 0) > 0 ? `<span class="val-red" style="font-weight: 700;">${agendaIcon('icon-alert')} ${sellerSummary.zumbis} ZUMBIS</span>` : ''}
          </div>
        </div>
        <button id="${sellerContentId}-btn" onclick="event.stopPropagation(); toggleAgendaPersonCard('${sellerContentId}')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">▶ Expandir</button>
      </div>

      <div id="${sellerContentId}" style="display:none;">

      <div style="margin-bottom: 16px;">
        ${sectionLabel('KPIs de Execução')}
        ${renderWeeklyPulseBar(pulse, idx, perf)}
      </div>

      ${sectionLabel('KPIs de Resultado do Quarter')}
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-bottom: 20px;">
        <div style="padding: 12px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--primary-cyan);">$${perf.pipeline_gross_k || 0}K</div>
          <div style="font-size: 10px; color: var(--text-gray); opacity: 0.7; margin-bottom: 2px;">Net: $${perf.pipeline_net_k || 0}K</div>
          <div style="font-size: 10px; color: var(--text-gray);">${perf.pipeline_deals || 0} deals</div>
        </div>

        <div style="padding: 12px; background: rgba(192,255,125,0.08); border-radius: 8px; border: 1px solid rgba(192,255,125,0.2); cursor: pointer;" onclick="toggleWeeklyAgendaSection('closed-deals-${idx}')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 11px; color: var(--text-gray);">Fechado (Q)</div>
            <span id="closed-deals-${idx}-btn" style="font-size: 10px; color: var(--text-gray);">▼</span>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--accent-green);">$${perf.closed_gross_k || 0}K</div>
          <div style="font-size: 10px; color: ${(perf.closed_net_k || 0) < 0 ? 'var(--danger)' : 'var(--text-gray)'}; font-weight: ${(perf.closed_net_k || 0) < 0 ? '700' : '400'}; margin-bottom: 2px;">Net: $${perf.closed_net_k || 0}K</div>
          <div style="font-size: 10px; color: var(--text-gray);">${perf.closed_deals || 0} deals | ${perf.win_rate ? perf.win_rate.toFixed(0) + '% win' : 'N/A'}</div>
        </div>

        <div style="padding: 12px; background: rgba(255,165,0,0.08); border-radius: 8px; border: 1px solid rgba(255,165,0,0.2);">
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pipeline sem avanço</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--warning);">${perf.pipeline_podre_pct || 0}%</div>
          <div style="font-size: 10px; color: var(--text-gray);">${perf.deals_zumbi || 0} sem avanço</div>
          <div style="font-size: 10px; color: var(--text-gray); opacity: 0.8;">Oportunidades sem atividade registrada</div>
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

      <div id="closed-deals-${idx}" style="display:none; margin-bottom: 16px;">
        ${renderDrillDownDeals(seller.closed_deals_detail || [], 'closed')}
      </div>

      <div id="lost-deals-${idx}" style="display:none; margin-bottom: 16px;">
        ${renderDrillDownDeals(seller.lost_deals_detail || [], 'lost')}
      </div>

      <div style="padding: 14px; background: ${statusColor}15; border-left: 4px solid ${statusColor}; border-radius: 8px; margin-bottom: 20px;">
        <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px; color: ${statusColor};">
          ${agendaIcon('icon-chart')} Feedback de Performance
        </div>
        ${renderClampText(normalizedFeedbackMessage, `feedback-clamp-${idx}`, 3)}
        ${normalizedRecommendations.length > 0 ? `
          <div style="font-size: 11px; color: var(--text-gray); font-weight: 600; margin-bottom: 6px;">${agendaIcon('icon-idea')} AÇÕES RECOMENDADAS:</div>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-gray); line-height: 1.8;">
            ${normalizedRecommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        ` : ''}
      </div>

      <div id="agenda-activitieswrap-${idx}" style="display:block; margin-bottom: 10px;">
        ${sectionLabel('Atividades do Período')}
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin: 0 0 12px 0;">
          <h5 style="margin: 0; font-size: 14px; color: var(--text-main); font-weight: 700;">
            ${agendaIcon('icon-activity')} Atividades (${activitiesCount})
          </h5>
          <button id="agenda-toggle-activities-btn-${idx}" onclick="toggleAgendaSellerActivities(${idx})" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            ▶ Expandir
          </button>
        </div>
        <div id="agenda-activities-${idx}" style="display:none;">
          ${renderAgendaActivitiesOnly(pulse, idx)}
        </div>
      </div>

      <div id="agenda-dealswrap-${idx}" style="display:none;">
        ${sectionLabel('Oportunidades')}
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin: 0 0 12px 0;">
          <h5 style="margin: 0; font-size: 14px; color: var(--text-main); font-weight: 700;">
            ${agendaIcon('icon-briefcase')} Oportunidades (${deals.length})
          </h5>
          <button id="agenda-toggle-btn-${idx}" onclick="toggleAgendaSellerDeals(${idx})" style="background: rgba(255,255,255,0.04); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            ▶ Expandir
          </button>
        </div>
        <div id="agenda-deals-${idx}" style="display:none;">
          <div style="display: grid; gap: 12px;">
            ${renderSeller1on1Deals(deals, idx)}
          </div>
        </div>
      </div>

      <div id="agenda-newwrap-${idx}" style="display:none;">
        ${sectionLabel('Novas Oportunidades')}
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin: 6px 0 12px 0;">
          <h5 style="margin: 0; font-size: 14px; color: var(--text-main); font-weight: 700;">
            ${agendaIcon('icon-chart')} Novas Oportunidades (${newDeals.length})
          </h5>
          <button id="agenda-toggle-new-btn-${idx}" onclick="toggleAgendaSellerNewDeals(${idx})" style="background: rgba(255,255,255,0.04); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            ▶ Expandir
          </button>
        </div>
        <div id="agenda-newdeals-${idx}" style="display:none;">
          <div style="display: grid; gap: 12px;">
            ${renderSellerNewDeals(newDeals)}
          </div>
        </div>
      </div>
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
    const year = currentFilters.year || new Date().getFullYear();
    const quarterRaw = String(currentFilters.quarter || '').trim();
    const customerEngineerNames = [
      'joao bransford',
      'joao baria',
      'joao santos',
      'leandro steele'
    ];
    const customerSuccessFocusNames = ['alex araujo', 'rayssa zevolli'];
    
    // Build query params
    const params = new URLSearchParams();

    // Só envia quarter quando ele foi explicitamente selecionado.
    // Se não houver quarter, o backend usa o quarter atual por padrão.
    if (quarterRaw) {
      let quarter = quarterRaw;
      if (quarter.includes('-')) {
        const match = quarter.match(/FY(\d+)-Q(\d+)/i);
        if (match) {
          const fiscalQuarter = `FY${match[1]}-Q${match[2]}`;
          params.append('quarter', fiscalQuarter);
        }
      } else {
        if (quarter.toUpperCase().startsWith('Q')) {
          quarter = quarter.replace(/Q/i, '');
        }
        const fiscalQuarter = `FY${String(year).slice(2)}-Q${quarter}`;
        params.append('quarter', fiscalQuarter);
      }
    }

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
    params.append('cs_names', customerEngineerNames.join(','));
    
    const url = `${window.API_BASE_URL}/api/weekly-agenda?${params.toString()}`;
    console.log(`[AGENDA] Fetching: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar pauta semanal');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      const container = document.getElementById('agenda-sellers-container');
      if (container) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-gray); padding: 40px;">Nenhum deal encontrado para este quarter/vendedor</p>';
      }
      return;
    }
    
    const sellers = data.sellers;
    const summary = data.summary;
    const customerEngineer = data.customer_success || {};
    const salesSpecialistPayload = data.sales_specialist || { summary: {}, members: [] };

    const normalizeName = (value) => String(value || '').trim().toLowerCase();
    const normalizeKey = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const dealLookupKey = (opp, conta) => `${normalizeKey(opp)}|${normalizeKey(conta)}`;
    const customerSuccessSet = new Set(customerSuccessFocusNames.map(normalizeName));
    const bdmSellers = sellers.filter(s => !customerSuccessSet.has(normalizeName(s?.vendedor)));
    const customerSuccessFromDeals = sellers.filter(s => customerSuccessSet.has(normalizeName(s?.vendedor)));

    const bdmSellerIndex = new Map();
    bdmSellers.forEach((seller) => {
      const key = normalizeKey(seller?.vendedor || '');
      if (key) bdmSellerIndex.set(key, seller);
    });

    // Build an index of full BDM deals so SS view can reuse the same rich payload.
    const fullDealsByOppConta = new Map();
    const fullDealsByOpp = new Map();
    const dealRichnessScore = (deal) => {
      const checks = [
        'Perfil_Cliente', 'Status_Cliente', 'Tipo_Oportunidade', 'Produtos',
        'Data_Criacao', 'Data_Prevista', 'Fase_Atual', 'Portfolio_FDM',
        'Acao_Sugerida', 'Proxima_Acao_Pipeline', 'Risk_Tags', 'Atividades'
      ];
      return checks.reduce((score, key) => score + (String(deal?.[key] || '').trim() ? 1 : 0), 0);
    };
    bdmSellers.forEach((seller) => {
      const deals = Array.isArray(seller?.deals) ? seller.deals : [];
      deals.forEach((deal) => {
        const opp = deal?.Oportunidade || deal?.oportunidade || '';
        const conta = deal?.Conta || deal?.conta || '';
        if (!opp) return;

        const byOppKey = normalizeKey(opp);
        const byOppContaKey = dealLookupKey(opp, conta);
        const currentScore = dealRichnessScore(deal);

        const existingOpp = fullDealsByOpp.get(byOppKey);
        if (!existingOpp || currentScore > dealRichnessScore(existingOpp)) {
          fullDealsByOpp.set(byOppKey, deal);
        }

        const existingOppConta = fullDealsByOppConta.get(byOppContaKey);
        if (!existingOppConta || currentScore > dealRichnessScore(existingOppConta)) {
          fullDealsByOppConta.set(byOppContaKey, deal);
        }
      });
    });

    const ssFullDealIndex = {
      byOpp: fullDealsByOpp,
      byOppConta: fullDealsByOppConta,
      normalizeKey,
      dealLookupKey,
    };

    // Build owner-centric SS index: deals where specialist is also the pipeline owner.
    const ownerDealsBySpecialist = new Map();
    const addOwnerDeal = (name, deal) => {
      const key = normalizeKey(name);
      if (!key) return;
      if (!ownerDealsBySpecialist.has(key)) {
        ownerDealsBySpecialist.set(key, {
          name: formatPersonDisplayName(name),
          deals: []
        });
      }
      ownerDealsBySpecialist.get(key).deals.push(deal);
    };

    bdmSellers.forEach((seller) => {
      const deals = Array.isArray(seller?.deals) ? seller.deals : [];
      deals.forEach((deal) => {
        const ownerName = String(deal?.Vendedor || deal?.vendedor || '').trim();
        if (!ownerName) return;

        const ssField = String(
          deal?.Sales_Specialist_Envolvido ||
          deal?.sales_specialist_envolvido ||
          deal?.Sales_Specialist ||
          deal?.sales_specialist ||
          ''
        ).trim();
        const statusGov = String(deal?.Status_Governanca_SS || deal?.status_governanca_ss || '').trim().toUpperCase();

        const ownerNorm = normalizeKey(ownerName);
        const ssNorm = normalizeKey(ssField);
        const ownerIsAlsoSpecialist = !!ssNorm && (ssNorm.includes(ownerNorm) || ownerNorm.includes(ssNorm));
        const isGovernanceOwnerError = statusGov.includes('IGUAL OWNER');

        // Include owner deals in SS view when owner is flagged as specialist in governance context.
        if (ownerIsAlsoSpecialist || isGovernanceOwnerError) {
          addOwnerDeal(ownerName, deal);
        }
      });
    });

    const csFocusParams = new URLSearchParams(params.toString());
    csFocusParams.set('cs_names', customerSuccessFocusNames.join(','));
    const csFocusUrl = `${window.API_BASE_URL}/api/weekly-agenda?${csFocusParams.toString()}`;
    let customerSuccessFocusPayload = { members: [] };
    try {
      const csFocusResponse = await fetch(csFocusUrl);
      if (csFocusResponse.ok) {
        const csFocusData = await csFocusResponse.json();
        customerSuccessFocusPayload = csFocusData?.customer_success || { members: [] };
      }
    } catch (e) {
      console.warn('[AGENDA] WARN: não foi possível carregar payload de Customer Success (Alex/Rayssa):', e);
    }

    const bySellerName = new Map(customerSuccessFromDeals.map(s => [normalizeName(s.vendedor), s]));
    const customerSuccessSellers = customerSuccessFocusNames.map((name) => {
      const existing = bySellerName.get(normalizeName(name));
      if (existing) return existing;
      const member = (customerSuccessFocusPayload?.members || []).find(m => normalizeName(m.requested_name || m.display_name) === normalizeName(name));
      const atividades = Number(member?.total_activities || 0) || 0;
      const reunioes = Number(member?.total_meetings || 0) || 0;
      const lastActivities = Array.isArray(member?.last_activities) ? member.last_activities : [];
      return {
        vendedor: member?.display_name || name,
        performance: {
          nota_higiene: 'N/A',
          pipeline_podre_pct: 0,
          deals_zumbi: 0,
          pipeline_net_k: 0,
          closed_net_k: 0,
          win_rate: null,
          total_forecast_k: 0,
          pipeline_deals: 0,
          closed_deals: 0,
          lost_deals: 0,
          ciclo_medio_dias: 0,
          pipeline_gross_k: 0,
          closed_gross_k: 0,
        },
        feedback: {
          status: 'good',
          message: 'Sem oportunidades no quarter para cálculo completo de performance. Exibindo execução por atividades.',
          recommendations: [],
        },
        pulse: {
          atividades_semana: atividades,
          meta_atividades: 20,
          reunioes_semana: reunioes,
          meta_reunioes: 8,
          novas_oportunidades_periodo: 0,
          meta_novas_oportunidades: 4,
          dias_uteis_periodo: 0,
          qualidade_registros: {
            pobres: 0,
            total: atividades,
            score: 'N/A',
          },
          drill_down: [],
          last_activities: lastActivities,
          periodo: {
            inicio: currentFilters.date_start || null,
            fim: currentFilters.date_end || null,
          },
        },
        deals: [],
        lost_deals_detail: [],
        closed_deals_detail: [],
        new_deals_detail: [],
        summary: {
          total_deals: 0,
          zumbis: 0,
          criticos: 0,
          alta_prioridade: 0,
          monitorar: 0,
          total_gross_k: 0,
          total_net_k: 0,
          avg_confianca: 0,
        },
      };
    });
    
    // Atualiza informação do quarter
    const quarterEl = document.getElementById('agenda-quarter');
    if (quarterEl) quarterEl.textContent = summary.quarter;
    
    // Atualiza cards de resumo (com safe checks)
    const sellersCountEl = document.getElementById('agenda-sellers-count');
    if (sellersCountEl) sellersCountEl.textContent = summary.total_sellers;
    
    const totalDealsEl = document.getElementById('agenda-total-deals');
    if (totalDealsEl) totalDealsEl.textContent = summary.total_deals;
    
    const totalValueEl = document.getElementById('agenda-total-value');
    if (totalValueEl) totalValueEl.textContent = '$' + summary.total_gross_k + 'K';
    
    const criticosEl = document.getElementById('agenda-criticos-count');
    if (criticosEl) criticosEl.textContent = summary.total_criticos;
    
    const zumbisEl = document.getElementById('agenda-zumbis-count');
    if (zumbisEl) zumbisEl.textContent = summary.total_zumbis;
    
    const updatedAtLabel = formatDateTimeBR(data.timestamp || '');

    // Renderiza blocos com separação visual: BDMs e Customer Engineer
    let html = `
      <div style="margin: 0 0 10px 0; padding: 10px 12px; background: rgba(255,255,255,0.04); border-radius: 10px; border: 1px solid rgba(255,255,255,0.10); font-size: 11px; color: var(--text-gray); display:flex; justify-content: space-between; align-items:center; gap: 8px;">
        <span>${agendaIcon('icon-activity')} Última atualização dos dados</span>
        <strong style="color: var(--text-main); font-size: 11px;">${updatedAtLabel || 'N/A'}</strong>
      </div>
      <div style="margin: 10px 0 12px 0; padding: 12px 14px; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
          <div>
            ${sectionLabel('BDMs - Business Development Manager')}
          </div>
            <button id="agenda-bdm-block-btn" onclick="toggleWeeklyAgendaBlock('agenda-bdm-block')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">▶ Expandir</button>
        </div>
        <div style="display:flex; gap: 10px; align-items:center; margin: 0 0 12px 0;">
        <button id="agenda-tab-all" onclick="setWeeklyAgendaView('all')" style="background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Tudo
        </button>
        <button id="agenda-tab-activities" onclick="setWeeklyAgendaView('activities')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Atividades
        </button>
        <button id="agenda-tab-deals" onclick="setWeeklyAgendaView('deals')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Oportunidades
        </button>
        <button id="agenda-tab-new" onclick="setWeeklyAgendaView('newdeals')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Novas Oportunidades
        </button>
      </div>
      <div id="agenda-bdm-block" style="display:none;">
    `;
    
    bdmSellers.forEach((seller, idx) => {
      html += renderWeeklyAgendaSellerCard(seller, idx);
    });
    
    html += `</div></div>

      <div style="margin-top: 12px; padding: 12px 14px; background: rgba(255,255,255,0.06); border-radius: 12px; border: 1px solid rgba(255,255,255,0.14);">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
          <div>
            ${sectionLabel('CS - Customer Success')}
          </div>
            <button id="agenda-css-block-btn" onclick="toggleWeeklyAgendaBlock('agenda-css-block')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">▶ Expandir</button>
        </div>
        <div style="display:flex; gap: 10px; align-items:center; margin: 0 0 12px 0;">
        <button id="agenda-cs-tab-all" onclick="setWeeklyAgendaView('all')" style="background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Tudo
        </button>
        <button id="agenda-cs-tab-activities" onclick="setWeeklyAgendaView('activities')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Atividades
        </button>
        <button id="agenda-cs-tab-deals" onclick="setWeeklyAgendaView('deals')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Oportunidades
        </button>
        <button id="agenda-cs-tab-new" onclick="setWeeklyAgendaView('newdeals')" style="background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border); padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; cursor: pointer;">
          Novas Oportunidades
        </button>
      </div>
        <div id="agenda-css-block" style="display:none;">
          ${customerSuccessSellers.length ? customerSuccessSellers.map((seller, idx) => renderWeeklyAgendaSellerCard(seller, 1000 + idx)).join('') : '<div style="font-size: 12px; color: var(--text-gray);">Sem dados para Alex/Rayssa no filtro atual.</div>'}
        </div>
      </div>

      <div style="margin-top: 12px; padding: 12px 14px; background: rgba(255,255,255,0.06); border-radius: 12px; border: 1px solid rgba(255,255,255,0.14);">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
          <div>
            ${sectionLabel('SS · Sales Specialist')}
          </div>
          <button id="agenda-ss-block-btn" onclick="toggleWeeklyAgendaBlock('agenda-ss-block')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">▶ Expandir</button>
        </div>
        <div id="agenda-ss-block" style="display:none;">
          ${renderSalesSpecialistSection(salesSpecialistPayload, ssFullDealIndex, ownerDealsBySpecialist, bdmSellerIndex)}
        </div>
      </div>

      <div style="margin-top: 12px; padding: 12px 14px; background: rgba(255,255,255,0.06); border-radius: 12px; border: 1px solid rgba(255,255,255,0.14);">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
          <div>
            ${sectionLabel('CE · Customer Engineer')}
          </div>
            <button id="agenda-cs-block-btn" onclick="toggleWeeklyAgendaBlock('agenda-cs-block')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">▶ Expandir</button>
        </div>
        <div id="agenda-cs-block" style="display:none;">
          ${renderCustomerSuccessSection(customerEngineer)}
        </div>
      </div>`;

    const container = document.getElementById('agenda-sellers-container');
    if (container) {
      container.innerHTML = html;
      // Default view: all
      setWeeklyAgendaView('all');
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

  const applyTabState = (prefix) => {
    const tabAll = document.getElementById(`${prefix}-all`);
    const tabActivities = document.getElementById(`${prefix}-activities`);
    const tabDeals = document.getElementById(`${prefix}-deals`);
    const tabNew = document.getElementById(`${prefix}-new`);
    if (!(tabAll && tabActivities && tabDeals && tabNew)) return;
    const on = 'background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--glass-border);';
    const off = 'background: rgba(255,255,255,0.03); color: var(--text-gray); border: 1px solid var(--glass-border);';
    if (view === 'all') {
      tabAll.style.cssText += on;
      tabActivities.style.cssText += off;
      tabDeals.style.cssText += off;
      tabNew.style.cssText += off;
    } else if (view === 'deals') {
      tabDeals.style.cssText += on;
      tabAll.style.cssText += off;
      tabActivities.style.cssText += off;
      tabNew.style.cssText += off;
    } else if (view === 'newdeals') {
      tabNew.style.cssText += on;
      tabAll.style.cssText += off;
      tabActivities.style.cssText += off;
      tabDeals.style.cssText += off;
    } else {
      tabActivities.style.cssText += on;
      tabAll.style.cssText += off;
      tabDeals.style.cssText += off;
      tabNew.style.cssText += off;
    }
  };

  applyTabState('agenda-tab');
  applyTabState('agenda-cs-tab');
  applyTabState('agenda-ss-tab');

  const container = document.getElementById('agenda-sellers-container');
  if (!container) return;
  const cards = container.querySelectorAll('[id^="agenda-activitieswrap-"]');
  cards.forEach(el => {
    const idx = el.id.replace('agenda-activitieswrap-', '');
    const act = document.getElementById(`agenda-activitieswrap-${idx}`);
    const deals = document.getElementById(`agenda-dealswrap-${idx}`);
    const newDeals = document.getElementById(`agenda-newwrap-${idx}`);
    if (view === 'all') {
      if (act) act.style.display = 'block';
      if (deals) deals.style.display = 'block';
      if (newDeals) newDeals.style.display = 'block';
    } else {
      if (act) act.style.display = view === 'activities' ? 'block' : 'none';
      if (deals) deals.style.display = view === 'deals' ? 'block' : 'none';
      if (newDeals) newDeals.style.display = view === 'newdeals' ? 'block' : 'none';
    }
  });
}

function renderCustomerSuccessSection(customerSuccess) {
  const members = Array.isArray(customerSuccess?.members) ? customerSuccess.members : [];
  const summary = customerSuccess?.summary || {};
  if (!members.length) {
    return '';
  }

  return `
    <div style="margin-bottom: 0; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap: 12px; margin-bottom: 10px;">
        <h4 style="margin:0; color: var(--primary-cyan); font-size: 14px; font-weight: 700;">${agendaIcon('icon-activity')} Atividades Executadas</h4>
        <div style="font-size: 12px; color: var(--text-gray); font-weight: 700;">
          ${summary.total_activities || 0} atividades | ${summary.total_meetings || 0} reuniões
        </div>
      </div>
      <div style="display:grid; gap: 12px;">
        ${members.map((member, idx) => {
          const requestedName = escapeHtml(member.display_name || member.requested_name || '-');
          const matched = Array.isArray(member.matched_assignees) ? member.matched_assignees : [];
          const matchedText = matched.length ? matched.map(v => escapeHtml(v)).join(', ') : 'sem correspondência encontrada';
          const activities = Array.isArray(member.last_activities) ? member.last_activities : [];
          const namePalette = ['var(--primary-cyan)', 'var(--accent-green)', 'var(--warning)', 'var(--primary-purple)'];
          const nameColor = namePalette[idx % namePalette.length];
          const cardBg = idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)';
          const qualityCount = activities.reduce((count, item) => {
            const hasDesc = String(item?.comentarios || '').trim().length >= 20;
            const hasConta = String(item?.cliente || item?.oportunidade || '').trim().length > 0;
            return hasDesc && hasConta ? count + 1 : count;
          }, 0);
          const qualityPct = activities.length ? Math.round((qualityCount / activities.length) * 100) : 0;
          const qualityColor = qualityPct >= 80 ? 'var(--accent-green)' : qualityPct >= 60 ? 'var(--warning)' : 'var(--danger)';
          const memberContentId = `ce-member-content-${idx}`;
          return `
            <div style="padding: 12px; background: ${cardBg}; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);">
              <div onclick="toggleAgendaPersonCard('${memberContentId}')" style="display:flex; justify-content:space-between; align-items:center; gap: 12px; margin-bottom: 8px; cursor: pointer;">
                <div>
                  <div style="font-size: 14px; font-weight: 900; color: ${nameColor};">${requestedName}</div>
                  <div style="font-size: 11px; color: rgba(176,184,196,0.95);">Correspondências: ${matchedText}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size: 12px; font-weight: 800; color: var(--text-main);">${member.total_activities || 0} atividades</div>
                  <div style="font-size: 11px; color: rgba(176,184,196,0.95);">${member.total_meetings || 0} reuniões</div>
                  <div style="font-size: 11px; color: ${qualityColor}; font-weight: 700;">Índice qualidade: ${qualityPct}%</div>
                </div>
              </div>
              <button id="${memberContentId}-btn" onclick="event.stopPropagation(); toggleAgendaPersonCard('${memberContentId}')" style="background: rgba(255,255,255,0.04); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; margin-bottom: 8px;">▶ Expandir</button>
              <div id="${memberContentId}" style="display:none;">
              <div style="display:block;">
                ${activities.length ? activities.map((activity, actIdx) => {
                  const dt = formatDateDMY(activity.data_criacao || '');
                  const title = escapeHtml(activity.assunto || activity.tipo || 'Atividade');
                  const oppClient = [activity.oportunidade, activity.cliente].map(v => String(v || '').trim()).filter(Boolean).map(v => escapeHtml(v)).join(' | ');
                  const statusLine = [dt, activity.status].map(v => String(v || '').trim()).filter(Boolean).map(v => escapeHtml(v)).join(' | ');
                  const description = String(activity.comentarios || '').trim();
                  const resumoIA = String(activity.resumo_ia || '').trim();
                  const statusText = String(activity.status || '').toLowerCase();
                  const statusColor = statusText.includes('complet')
                    ? 'var(--accent-green)'
                    : statusText.includes('cancel')
                      ? 'var(--danger)'
                      : statusText.includes('agend') || statusText.includes('pend')
                        ? 'var(--warning)'
                        : 'var(--text-gray)';
                  return `
                    <div style="padding: 8px; margin-bottom: 8px; background: rgba(255,255,255,0.07); border-radius: 8px; border-left: 3px solid ${nameColor};">
                      <div style="font-size: 12px; color: var(--text-main); font-weight: 700; margin-bottom: 3px;">${title}</div>
                      ${oppClient ? `<div style="font-size: 11px; color: var(--primary-cyan); margin-bottom: 3px; font-weight: 600;">Conta: ${oppClient}</div>` : ''}
                      ${statusLine ? `<div style="font-size: 11px; color: ${statusColor}; margin-bottom: 6px; font-weight: 700;">${statusLine}</div>` : ''}
                      ${resumoIA ? `
                        <div style="margin-top: 10px; padding: 10px; background: rgba(192,255,125,0.15); border-left: 4px solid var(--accent-green); border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                          <div style="font-size: 11px; color: var(--accent-green); font-weight: 900; margin-bottom: 8px; display:flex; align-items:center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${agendaIcon('icon-idea')} RESUMO IA (MEDDIC)</div>
                          ${renderClampText(resumoIA, `ce-ia-${idx}-${actIdx}`, 4)}
                        </div>
                      ` : ''}
                      ${description ? `<div style="padding: 8px; border-radius: 6px; background: rgba(12,18,28,0.45); border: 1px solid rgba(255,255,255,0.08); margin-top: ${resumoIA ? '8px' : '0'};">${renderClampText(description, `ce-desc-${idx}-${actIdx}`, 3)}</div>` : ''}
                    </div>
                  `;
                }).join('') : renderEmptyState('Sem atividades no período.')}
              </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderSalesSpecialistSection(payload, fullDealIndex, ownerDealsBySpecialist, bdmSellerIndex) {
  const summary = payload?.summary || {};
  const members = Array.isArray(payload?.members) ? payload.members : [];

  if (!members.length) {
    return renderEmptyState('Sem dados de Sales Specialist para o filtro atual.');
  }

  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const norm = (v) => String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const matchesPerson = (left, right) => {
    const a = norm(left).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const b = norm(right).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!a || !b) return false;
    if (a === b) return true;
    // Allow partial match for cases like "Gabriele" vs "Gabriele Oliveira".
    return a.includes(b) || b.includes(a);
  };

  const lookupFullDeal = (deal) => {
    if (!fullDealIndex) return null;
    const opp = deal?.oportunidade || deal?.Oportunidade || '';
    const conta = deal?.conta || deal?.Conta || '';
    const byOppContaKey = fullDealIndex.dealLookupKey ? fullDealIndex.dealLookupKey(opp, conta) : '';
    const byOppKey = fullDealIndex.normalizeKey ? fullDealIndex.normalizeKey(opp) : '';
    if (byOppContaKey && fullDealIndex.byOppConta?.has(byOppContaKey)) {
      return fullDealIndex.byOppConta.get(byOppContaKey);
    }
    if (byOppKey && fullDealIndex.byOpp?.has(byOppKey)) {
      return fullDealIndex.byOpp.get(byOppKey);
    }
    return null;
  };

  const mapToFullDeal = (deal, ssName) => {
    const source = lookupFullDeal(deal) || {};
    const bdmOwner = formatPersonDisplayName(deal?.bdm_owner || deal?.vendedor || 'Não informado');
    const ssDisplay = formatPersonDisplayName(ssName || deal?.ss_vinculo || deal?.sales_specialist_envolvido || 'Não informado');
    const justificativa = String(deal?.justificativa_ss || '').trim();
    const extra = [`SS Owner: ${ssDisplay}`, `BDM Owner: ${bdmOwner}`];
    if (justificativa) extra.push(justificativa);
    return {
      ...source,
      Oportunidade: source?.Oportunidade || deal?.oportunidade || 'N/A',
      Conta: source?.Conta || deal?.conta || 'N/A',
      Vendedor: source?.Vendedor || deal?.vendedor || '',
      BDM_Owner: bdmOwner,
      Fiscal_Q: source?.Fiscal_Q || deal?.fiscal_q || '-',
      Gross: toNumber(source?.Gross ?? deal?.gross),
      Net: toNumber(source?.Net ?? deal?.net),
      Confianca: toNumber(source?.Confianca ?? deal?.confianca),
      Fase_Atual: source?.Fase_Atual || source?.Fase || deal?.fase_atual || '-',
      Fase: source?.Fase || source?.Fase_Atual || deal?.fase_atual || '-',
      Data_Prevista: source?.Data_Prevista || deal?.data_prevista || '',
      Data_Criacao: source?.Data_Criacao || source?.Data_de_criacao || deal?.data_criacao || '',
      Data_de_criacao: source?.Data_de_criacao || source?.Data_Criacao || deal?.data_criacao || '',
      Dias_Funil: toNumber(source?.Dias_Funil ?? deal?.dias_funil),
      Produtos: source?.Produtos || deal?.produtos || '',
      Portfolio_FDM: source?.Portfolio_FDM || source?.Portfolio || deal?.portfolio_fdm || deal?.portfolio || '',
      Portfolio: source?.Portfolio || source?.Portfolio_FDM || deal?.portfolio || deal?.portfolio_fdm || '',
      Tipo_Oportunidade: source?.Tipo_Oportunidade || deal?.tipo_oportunidade || '',
      Perfil_Cliente: source?.Perfil_Cliente || deal?.perfil_cliente || '',
      Status_Cliente: source?.Status_Cliente || deal?.status_cliente || '',
      Acao_Sugerida: source?.Acao_Sugerida || source?.Proxima_Acao_Pipeline || deal?.acao_sugerida || '',
      Proxima_Acao_Pipeline: source?.Proxima_Acao_Pipeline || source?.Acao_Sugerida || deal?.acao_sugerida || '',
      Atividades: toNumber(source?.Atividades ?? deal?.atividades),
      Categoria_Pauta: deal?.categoria || 'MONITORAR',
      Risk_Tags: source?.Risk_Tags || normalizeTagList(deal?.risk_tags || []).join(', '),
      Sales_Specialist_Envolvido: ssDisplay,
      Elegibilidade_SS: deal?.elegibilidade_ss || '-',
      Status_Governanca_SS: deal?.status_governanca_ss || '-',
      Justificativa_Elegibilidade_SS: justificativa || '-',
      Justificativa_IA: extra.join(' | '),
      ui: {
        categoria: deal?.categoria || 'MONITORAR',
        categoriaLabel: deal?.categoria || 'MONITORAR',
        riscoScore: 3,
        justificativaIA: extra.join(' | ')
      }
    };
  };

  // Re-bucket "Sem Especialista" when governance says SS==owner.
  const rebucketedMap = new Map();
  const addDealToMember = (memberName, deal) => {
    const key = formatPersonDisplayName(memberName || 'Sem Especialista');
    if (!rebucketedMap.has(key)) {
      rebucketedMap.set(key, { name: key, deals: [] });
    }
    rebucketedMap.get(key).deals.push(deal);
  };

  members.forEach((member) => {
    const baseName = formatPersonDisplayName(member?.name || 'Sem Especialista');
    const deals = Array.isArray(member?.deals) ? member.deals : [];
    deals.forEach((deal) => {
      const statusNorm = norm(deal?.status_governanca_ss || '');
      const ownerName = formatPersonDisplayName(deal?.bdm_owner || deal?.vendedor || '');
      if (norm(baseName) === 'sem especialista' && statusNorm.includes('igual owner') && ownerName) {
        addDealToMember(ownerName, deal);
      } else {
        addDealToMember(baseName, deal);
      }
    });
  });

  const effectiveMembers = Array.from(rebucketedMap.values());

  // Merge with owner-based specialists from pipeline (detentor da oportunidade).
  const membersByNorm = new Map();
  effectiveMembers.forEach((member) => {
    const key = norm(member?.name || '');
    if (!key) return;
    membersByNorm.set(key, {
      name: formatPersonDisplayName(member?.name || ''),
      deals: Array.isArray(member?.deals) ? member.deals : []
    });
  });

  if (ownerDealsBySpecialist && ownerDealsBySpecialist.forEach) {
    ownerDealsBySpecialist.forEach((entry, key) => {
      const nKey = norm(entry?.name || key || '');
      if (!nKey) return;
      if (!membersByNorm.has(nKey)) {
        membersByNorm.set(nKey, {
          name: formatPersonDisplayName(entry?.name || key),
          deals: []
        });
      }
    });
  }

  const mergedMembers = Array.from(membersByNorm.values())
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const buildSellerCardModelFromDeals = (ssName, ownerDeals, memberSummary) => {
    const sourceSeller = bdmSellerIndex?.get?.(norm(ssName));
    const sourceSummary = sourceSeller?.summary || {};
    const sourcePerformance = sourceSeller?.performance || {};
    const sourceFeedback = sourceSeller?.feedback || {};
    const sourcePulse = sourceSeller?.pulse || {};

    const totalGross = ownerDeals.reduce((sum, d) => sum + toNumber(d?.Gross), 0);
    const totalNet = ownerDeals.reduce((sum, d) => sum + toNumber(d?.Net), 0);
    const avgConf = ownerDeals.length
      ? Math.round(ownerDeals.reduce((sum, d) => sum + toNumber(d?.Confianca), 0) / ownerDeals.length)
      : 0;

    return {
      vendedor: ssName,
      deals: ownerDeals,
      new_deals_detail: [],
      lost_deals_detail: [],
      closed_deals_detail: [],
      summary: {
        total_deals: ownerDeals.length,
        total_gross_k: Math.round(totalGross / 1000),
        total_net_k: Math.round(totalNet / 1000),
        avg_confianca: avgConf,
        zumbis: Number(sourceSummary?.zumbis || 0),
        criticos: Number(sourceSummary?.criticos || 0),
        alta_prioridade: Number(sourceSummary?.alta_prioridade || 0),
        monitorar: ownerDeals.length
      },
      performance: {
        ...sourcePerformance,
        nota_higiene: sourcePerformance?.nota_higiene || 'N/A',
        pipeline_podre_pct: Number(sourcePerformance?.pipeline_podre_pct || 0),
        deals_zumbi: Number(sourcePerformance?.deals_zumbi || 0),
        pipeline_net_k: Math.round(totalNet / 1000),
        closed_net_k: Number(sourcePerformance?.closed_net_k || 0),
        win_rate: sourcePerformance?.win_rate ?? null,
        total_forecast_k: Number(sourcePerformance?.total_forecast_k || 0),
        pipeline_deals: ownerDeals.length,
        closed_deals: Number(sourcePerformance?.closed_deals || 0),
        lost_deals: Number(sourcePerformance?.lost_deals || 0),
        ciclo_medio_dias: Number(sourcePerformance?.ciclo_medio_dias || 0),
        pipeline_gross_k: Math.round(totalGross / 1000),
        closed_gross_k: Number(sourcePerformance?.closed_gross_k || 0)
      },
      feedback: {
        status: sourceFeedback?.status || 'good',
        message: sourceFeedback?.message || `Visão SS owner com ${ownerDeals.length} oportunidade(s).`,
        recommendations: Array.isArray(sourceFeedback?.recommendations) ? sourceFeedback.recommendations : []
      },
      pulse: {
        ...sourcePulse,
        atividades_semana: Number(sourcePulse?.atividades_semana || sourcePulse?.atividades_periodo || 0),
        meta_atividades: Number(sourcePulse?.meta_atividades || 0),
        reunioes_semana: Number(sourcePulse?.reunioes_semana || sourcePulse?.total_meetings || 0),
        meta_reunioes: Number(sourcePulse?.meta_reunioes || 0),
        novas_oportunidades_periodo: Number(sourcePulse?.novas_oportunidades_periodo || 0),
        meta_novas_oportunidades: Number(sourcePulse?.meta_novas_oportunidades || 0),
        dias_uteis_periodo: Number(sourcePulse?.dias_uteis_periodo || 0),
        qualidade_registros: sourcePulse?.qualidade_registros || { pobres: 0, total: 0, score: 'N/A' },
        drill_down: Array.isArray(sourcePulse?.drill_down) ? sourcePulse.drill_down : [],
        last_activities: Array.isArray(sourcePulse?.last_activities) ? sourcePulse.last_activities : [],
        periodo: sourcePulse?.periodo || { inicio: null, fim: null }
      }
    };
  };

  const statusCounts = summary.status_counts || {};
  const statusBadges = Object.keys(statusCounts)
    .sort((a, b) => Number(statusCounts[b] || 0) - Number(statusCounts[a] || 0))
    .slice(0, 6)
    .map((status) => `<span class="badge" style="background: rgba(255,255,255,0.10); color: var(--text-main); border: 1px solid rgba(255,255,255,0.18);">${escapeHtml(status)}: ${statusCounts[status]}</span>`)
    .join('');

  return `
    <div style="margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
      <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px; margin-bottom: 10px;">
        <div style="font-size: 13px; color: var(--primary-cyan); font-weight: 800;">${agendaIcon('icon-briefcase')} Visão Sales Specialist</div>
        <div style="font-size: 11px; color: var(--text-gray); font-weight: 700;">Curadoria SS + Owner em pipeline</div>
      </div>
      ${statusBadges ? `<div style="display:flex; gap:6px; flex-wrap: wrap; margin-bottom: 10px;">${statusBadges}</div>` : ''}
      <div style="display:grid; gap: 12px;">
        ${mergedMembers.map((member, idx) => {
          const ssName = formatPersonDisplayName(member?.name || 'Sem Especialista');
          if (norm(ssName) === 'sem especialista') {
            return '';
          }

          const allDeals = Array.isArray(member?.deals) ? member.deals : [];
          const elegiveis = allDeals.filter((d) => norm(d?.elegibilidade_ss) === 'elegivel');

          const ownerEntry = ownerDealsBySpecialist?.get?.(norm(ssName));
          const ownerRawDeals = Array.isArray(ownerEntry?.deals) ? ownerEntry.deals : [];
          const ownerPipelineDeals = ownerRawDeals.map((d) => mapToFullDeal({
            oportunidade: d?.Oportunidade || d?.oportunidade,
            conta: d?.Conta || d?.conta,
            vendedor: d?.Vendedor || d?.vendedor,
            bdm_owner: d?.Vendedor || d?.vendedor,
            fiscal_q: d?.Fiscal_Q || d?.fiscal_q,
            categoria: d?.Categoria_Pauta || d?.categoria,
            gross: d?.Gross || d?.gross,
            net: d?.Net || d?.net,
            confianca: d?.Confianca || d?.confianca,
            fase_atual: d?.Fase_Atual || d?.Fase || d?.fase_atual,
            data_prevista: d?.Data_Prevista || d?.data_prevista,
            data_criacao: d?.Data_Criacao || d?.Data_de_criacao || d?.data_criacao,
            dias_funil: d?.Dias_Funil || d?.dias_funil,
            produtos: d?.Produtos || d?.produtos,
            portfolio: d?.Portfolio || d?.portfolio,
            portfolio_fdm: d?.Portfolio_FDM || d?.portfolio_fdm,
            tipo_oportunidade: d?.Tipo_Oportunidade || d?.tipo_oportunidade,
            perfil_cliente: d?.Perfil_Cliente || d?.perfil_cliente,
            status_cliente: d?.Status_Cliente || d?.status_cliente,
            acao_sugerida: d?.Proxima_Acao_Pipeline || d?.Acao_Sugerida || d?.acao_sugerida,
            risk_tags: d?.Risk_Tags || d?.risk_tags,
            elegibilidade_ss: d?.Elegibilidade_SS || d?.elegibilidade_ss,
            status_governanca_ss: d?.Status_Governanca_SS || d?.status_governanca_ss,
            justificativa_ss: d?.Justificativa_Elegibilidade_SS || d?.justificativa_ss,
            ss_vinculo: d?.Sales_Specialist_Envolvido || d?.sales_specialist_envolvido || ssName,
          }, ssName));

          const ownerDealsFromCuration = elegiveis.filter((d) => {
            const ownerName = d?.bdm_owner || d?.vendedor || '';
            return matchesPerson(ownerName, ssName);
          });
          const linkedDeals = elegiveis.filter((d) => {
            const ownerName = d?.bdm_owner || d?.vendedor || '';
            return !matchesPerson(ownerName, ssName);
          });
          const ownerFromCurationFullDeals = ownerDealsFromCuration.map((d) => mapToFullDeal(d, ssName));
          const linkedFullDeals = linkedDeals.map((d) => mapToFullDeal(d, ssName));

          const ownerByOppConta = new Map();
          [...ownerPipelineDeals, ...ownerFromCurationFullDeals].forEach((d) => {
            const key = `${norm(d?.Oportunidade || '')}|${norm(d?.Conta || '')}`;
            if (!ownerByOppConta.has(key)) ownerByOppConta.set(key, d);
          });
          const ownerFinalDeals = Array.from(ownerByOppConta.values());

          if (!ownerFinalDeals.length && !linkedFullDeals.length) {
            return `
              <div style="padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);">
                <div style="font-size: 14px; color: var(--text-main); font-weight: 900; margin-bottom: 6px;">${escapeHtml(ssName)}</div>
                <div style="font-size: 12px; color: var(--text-gray);">Sem oportunidades no recorte atual.</div>
              </div>
            `;
          }

          const ssSellerModel = buildSellerCardModelFromDeals(ssName, ownerFinalDeals, member?.summary || {});
          const ssCardIdx = 3000 + idx;
          const linkedSectionId = `ss-linked-section-${idx}`;

          const summaryLine = `Curadoria elegível: ${elegiveis.length} | Owner pipeline: ${ownerFinalDeals.length} | Vinculados a BDM: ${linkedDeals.length}`;

          return `
            <div style="padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
                <div style="font-size: 14px; color: var(--text-main); font-weight: 900;">${escapeHtml(ssName)}</div>
                <div style="font-size: 11px; color: var(--text-gray); font-weight:700;">${escapeHtml(summaryLine)}</div>
              </div>

              <div style="margin-bottom: 10px;">
                <div style="font-size: 11px; color: var(--accent-green); font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;">Deal Owner SS</div>
                ${ownerFinalDeals.length
                  ? renderWeeklyAgendaSellerCard(ssSellerModel, ssCardIdx)
                  : '<div style="font-size:12px;color:var(--text-gray);padding:8px;border:1px dashed rgba(255,255,255,0.2);border-radius:8px;">Sem deal owner no pipeline para este especialista.</div>'}
              </div>

              <div>
                <div style="font-size: 11px; color: #93c5fd; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;">Deal BDM vinculado ao SS</div>
                ${linkedFullDeals.length ? `
                  <button id="${linkedSectionId}-btn" onclick="toggleAgendaPersonCard('${linkedSectionId}')" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; margin-bottom: 8px;">▶ Expandir</button>
                  <div id="${linkedSectionId}" style="display:none;">
                    ${renderSeller1on1Deals(linkedFullDeals, `ss-linked-${idx}`)}
                  </div>
                ` : '<div style="font-size:12px;color:var(--text-gray);padding:8px;border:1px dashed rgba(255,255,255,0.2);border-radius:8px;">Sem deal BDM vinculado elegível.</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderAgendaActivitiesOnly(pulse, sellerIdx) {
  const p = pulse || {};
  const periodo = p.periodo || {};
  const inicio = formatDateDMY(periodo.inicio || '');
  const fim = formatDateDMY(periodo.fim || '');

  const periodLabel = (inicio && fim) ? `${inicio} até ${fim}` : (inicio || fim) ? `${inicio || fim}` : 'Semana atual';
  const last = Array.isArray(p.last_activities) ? p.last_activities : [];
  const activitiesId = `activities-list-${sellerIdx || 0}`;
  const activityTypes = summarizeActivitiesByType(last);
  const onlineMeetings = last.filter(a => isMeetingActivity(a?.tipo) && normalizeLocalMode(a?.local) === 'online').length;
  const presencialMeetings = last.filter(a => isMeetingActivity(a?.tipo) && normalizeLocalMode(a?.local) === 'presencial').length;
  const notInformedMeetings = last.filter(a => isMeetingActivity(a?.tipo) && normalizeLocalMode(a?.local) === 'nao_informado').length;

  return `
    <div style="padding: 16px; background: linear-gradient(135deg, rgba(0,190,255,0.10) 0%, rgba(255,255,255,0.04) 100%); border-radius: 12px; border: 1px solid rgba(0,190,255,0.25); margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid rgba(0,190,255,0.2); cursor: pointer;" onclick="toggleWeeklyAgendaSection('${activitiesId}')">
        <div style="font-weight: 900; font-size: 14px; color: var(--primary-cyan); display: flex; align-items: center; gap: 6px;">
          <span id="${activitiesId}-btn" style="font-size: 12px; transition: transform 0.2s;">▶</span>
          ${agendaIcon('icon-activity')} <span>Atividades do período</span>
        </div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.75); font-weight: 800; background: rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 6px;">${periodLabel}</div>
      </div>

      <div id="${activitiesId}" style="display:none;">
        ${last.length ? `
          <div style="display:grid; gap: 10px; margin-bottom: 14px;">
            <div style="display:flex; gap: 8px; flex-wrap: wrap; align-items:center; justify-content: space-between;">
              <div style="font-size: 11px; color: var(--text-gray); font-weight: 700;">Drill-down por tipo (somatório)</div>
              <div style="font-size: 11px; color: var(--text-gray); font-weight: 700;">Reuniões • Online: ${onlineMeetings} | Presencial: ${presencialMeetings}${notInformedMeetings ? ` | N/I: ${notInformedMeetings}` : ''}</div>
            </div>
            <div style="display:flex; gap: 6px; flex-wrap: wrap;">
              ${activityTypes.map(t => `<span style="font-size: 11px; color: var(--text-main); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 4px 8px;">${escapeHtml(t.label)}: <strong>${t.total}</strong></span>`).join('')}
            </div>
            <div style="display:flex; align-items:center; gap: 8px;">
              <label for="activities-type-filter-${sellerIdx}" style="font-size: 11px; color: var(--text-gray); font-weight: 700;">Filtrar tipo:</label>
              <select id="activities-type-filter-${sellerIdx}" onchange="filterAgendaActivitiesByType(${sellerIdx}, this.value)" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 8px; font-size: 12px;">
                <option value="all">Todos</option>
                ${activityTypes.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)} (${t.total})</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="activities-grid-${sellerIdx}" style="display:grid; gap: 12px;">
            ${last.map((it, idx) => {
              const dt = formatDateDMY(String(it.data_criacao || ''));
              const tipo = stripHtml(String(it.tipo || 'Atividade'));
              const tipoNorm = normalizeActivityType(tipo);
              const status = stripHtml(String(it.status || ''));
              const cliente = stripHtml(String(it.cliente || ''));
              const oportunidade = stripHtml(String(it.oportunidade || ''));
              const assunto = stripHtml(String(it.assunto || ''));
              const contato = stripHtml(String(it.contato || ''));
              const local = stripHtml(String(it.local || ''));
              const comentarios = stripHtml(String(it.comentarios || ''));
              const resumoIA = it.resumo_ia ? formatAiSummaryText(stripHtml(String(it.resumo_ia))) : '';
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
              <div class="agenda-activity-row" data-activity-type="${escapeHtml(tipoNorm.key)}" style="padding: 16px; background: ${cardBg}; border-radius: 12px; border-left: 4px solid ${accentColor}; border-right: 1px solid ${cardBorder}; border-top: 1px solid ${cardBorder}; border-bottom: 1px solid ${cardBorder}; backdrop-filter: blur(10px); transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.15); position: relative;">
                <div style="display:flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 10px;">
                  <div style="font-size: 13px; color: ${accentColor}; font-weight: 900; letter-spacing: 0.3px;">${headerLeft || 'Atividade'}</div>
                  ${headerRight ? `<div style="font-size: 11px; color: rgba(255,255,255,0.95); font-weight: 800; background: ${isCompletada ? 'rgba(0,190,255,0.25)' : 'rgba(255,255,255,0.10)'}; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">${headerRight}</div>` : ''}
                </div>
                ${line1 ? `<div style="margin-top: 8px; font-size: 14px; color: rgba(255,255,255,0.95); line-height: 1.6; font-weight: 700;">${line1}</div>` : ''}
                ${line2 ? `<div style="margin-top: 6px; font-size: 13px; color: rgba(255,165,0,0.9); line-height: 1.5; font-weight: 600;">${line2}</div>` : ''}
                ${local ? `<div style="margin-top: 6px; font-size: 12px; color: var(--text-gray);">Local: <strong style="color: var(--text-main);">${local}</strong></div>` : '<div style="margin-top: 6px; font-size: 12px; color: var(--text-gray);">Local: <strong style="color: var(--text-main);">Não informado</strong></div>'}
                ${resumoIA ? `
                  <div style="margin-top: 14px; padding: 12px; background: rgba(192,255,125,0.15); border-left: 4px solid var(--accent-green); border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="font-size: 12px; color: var(--accent-green); font-weight: 900; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${agendaIcon('icon-idea')} RESUMO IA (MEDDIC)
                    </div>
                    ${renderClampText(resumoIA, `act-ia-${sellerIdx}-${idx}`, 4)}
                  </div>
                ` : ''}
                ${comentarios && !resumoIA && comentarios.length > 50 ? `
                  <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.08); border-radius: 8px; border-left: 3px solid rgba(255,165,0,0.5);">
                    <div style="font-size: 11px; color: rgba(255,165,0,0.8); font-weight: 800; margin-bottom: 6px; text-transform: uppercase;">COMENTÁRIOS</div>
                    ${renderClampText(comentarios, `act-comment-${sellerIdx}-${idx}`, 3)}
                  </div>
                ` : comentarios && !resumoIA ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.15);">${renderClampText(comentarios, `act-comment-inline-${sellerIdx}-${idx}`, 3)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : renderEmptyState('Sem atividades no período.')}
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

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-bottom: 12px;">
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

function renderWeeklyPulseBar(pulse, idx, perf = {}) {
  if (!pulse || typeof pulse !== 'object') return '';
  const reunioes = Number(pulse.reunioes_semana || 0) || 0;
  const metaReu = Number(pulse.meta_reunioes || 0) || 0;
  const atividades = Number(pulse.atividades_semana || 0) || 0;
  const metaAtividades = Number(pulse.meta_atividades || 0) || 0;
  const novasOportunidades = Number(pulse.novas_oportunidades_periodo || 0) || 0;
  const metaNovas = Number(pulse.meta_novas_oportunidades || 0) || 0;
  const diasUteis = Number(pulse.dias_uteis_periodo || 0) || 0;
  const qualidade = pulse.qualidade_registros || {};
  const pobres = Number(qualidade.pobres || 0) || 0;
  const total = Number(qualidade.total || 0) || 0;
  const score = String(qualidade.score || 'N/A');
  const notaHigiene = String(perf.nota_higiene || 'N/A');
  const lastActivities = Array.isArray(pulse.last_activities) ? pulse.last_activities : [];

  const reunioesOnline = lastActivities.filter(a => isMeetingActivity(a?.tipo) && normalizeLocalMode(a?.local) === 'online').length;
  const reunioesPresencial = lastActivities.filter(a => isMeetingActivity(a?.tipo) && normalizeLocalMode(a?.local) === 'presencial').length;

  const pctNovas = metaNovas > 0 ? Math.min(100, Math.round((novasOportunidades / metaNovas) * 100)) : 0;
  const pctReu = metaReu > 0 ? Math.min(100, Math.round((reunioes / metaReu) * 100)) : 0;

  const scoreColor = score === 'A' ? 'var(--accent-green)'
    : score === 'B' ? 'var(--success)'
    : score === 'C' ? 'var(--warning)'
    : score === 'D' ? 'var(--danger)'
    : 'var(--text-gray)';
  const notaColor = notaHigiene === 'A' ? 'var(--accent-green)'
    : notaHigiene === 'B' ? 'var(--success)'
    : notaHigiene === 'C' ? 'var(--warning)'
    : notaHigiene === 'D' || notaHigiene === 'F' ? 'var(--danger)'
    : 'var(--text-gray)';

  const qualityLabel = (pobres === 0 && total > 0)
    ? 'Registros completos'
    : (pobres > 0)
      ? `${pobres} registros incompletos`
      : 'Sem registros';
  const qualityColor = (pobres === 0 && total > 0) ? 'var(--accent-green)'
    : (pobres > 0) ? (score === 'D' ? 'var(--danger)' : 'var(--warning)')
    : 'var(--text-gray)';

  const auditQualityCount = lastActivities.reduce((acc, item) => {
    const resumo = String(item?.comentarios || item?.resumo || '').trim();
    const cliente = String(item?.cliente || item?.oportunidade || '').trim();
    return (resumo.length >= 20 && cliente) ? acc + 1 : acc;
  }, 0);
  const auditQualityPct = lastActivities.length ? Math.round((auditQualityCount / lastActivities.length) * 100) : 0;
  const auditQualityColor = auditQualityPct >= 80 ? 'var(--accent-green)' : auditQualityPct >= 60 ? 'var(--warning)' : 'var(--danger)';

  return `
    <div style="margin-top: 12px; position: relative;">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px;">
        <div style="padding: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); border-radius: 8px;">
          <div style="font-size: 10px; color: var(--text-gray); font-weight: 500; margin-bottom: 5px;">${agendaIcon('icon-chart')} Novas Oportunidades</div>
          <div style="font-size: 11px; font-weight: 700; color: ${novasOportunidades === 0 ? 'var(--danger)' : 'var(--text-main)'}; margin-bottom: 4px;">${novasOportunidades}/${metaNovas || '-'}</div>
          <div style="height: 7px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
            <div style="height: 100%; width: ${pctNovas}%; background: rgba(0,190,255,0.75);"></div>
          </div>
        </div>

        <div style="padding: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); border-radius: 8px; cursor: default;">
          <div style="font-size: 10px; color: var(--text-gray); font-weight: 500; margin-bottom: 5px;">${agendaIcon('icon-target')} Reuniões</div>
          <div style="font-size: 11px; font-weight: 700; color: ${reunioes === 0 ? 'var(--danger)' : 'var(--text-main)'}; margin-bottom: 4px;">${reunioes}/${metaReu || '-'}</div>
          <div style="font-size: 9px; color: var(--text-gray); margin-bottom: 3px;">Atividades: ${atividades}/${metaAtividades || '-'}</div>
          <div style="font-size: 9px; color: var(--text-gray); margin-bottom: 4px;">Online: ${reunioesOnline} | Presencial: ${reunioesPresencial}</div>
          <div style="height: 7px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
            <div style="height: 100%; width: ${pctReu}%; background: rgba(192,255,125,0.75);"></div>
          </div>
        </div>

        <div style="padding: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); border-radius: 8px; cursor: default;">
          <div style="font-size: 10px; color: var(--text-gray); font-weight: 500; margin-bottom: 5px;">${agendaIcon('icon-alert')} Qualidade CRM</div>
          <div style="font-size: 11px; font-weight: 700; color: ${qualityColor}; margin-bottom: 2px;">${qualityLabel}</div>
          <div style="font-size: 9px; color: ${scoreColor}; font-weight: 700;">Nota: ${score}</div>
          <div style="font-size: 9px; color: ${auditQualityColor}; font-weight: 700; margin-top: 3px;">Índice info: ${auditQualityPct}%</div>
        </div>

        <div style="padding: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); border-radius: 8px;">
          <div style="font-size: 10px; color: var(--text-gray); font-weight: 500; margin-bottom: 5px;">${agendaIcon('icon-briefcase')} Detalhes</div>
          <div style="font-size: 11px; font-weight: 700; color: var(--text-main); margin-bottom: 2px;">${lastActivities.length} atividades no período</div>
          <div style="font-size: 9px; color: var(--text-gray); margin-bottom: 2px;">${diasUteis > 0 ? `${diasUteis} dias úteis no período` : 'sem dias úteis no período'}</div>
          <div style="font-size: 9px; color: ${notaColor}; font-weight: 700;">Nota de Higiene: ${notaHigiene}</div>
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
  btn.textContent = isHidden ? '▼ Recolher' : '▶ Expandir';
}

function toggleAgendaSellerActivities(idx) {
  const container = document.getElementById(`agenda-activities-${idx}`);
  const btn = document.getElementById(`agenda-toggle-activities-btn-${idx}`);
  if (!container || !btn) return;
  const isHidden = container.style.display === 'none' || !container.style.display;
  container.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '▼ Recolher' : '▶ Expandir';
}

function toggleAgendaSellerNewDeals(idx) {
  const container = document.getElementById(`agenda-newdeals-${idx}`);
  const btn = document.getElementById(`agenda-toggle-new-btn-${idx}`);
  if (!container || !btn) return;
  const isHidden = container.style.display === 'none' || !container.style.display;
  container.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '▼ Recolher' : '▶ Expandir';
}

function renderSellerNewDeals(newDeals) {
  if (!newDeals || newDeals.length === 0) {
    return renderEmptyState('Sem novas oportunidades no período.');
  }

  const formatMoney = (val) => {
    const num = Number(val || 0);
    if (!num) return '$0';
    const k = Math.round(num / 1000);
    return k >= 1000 ? `$${(k / 1000).toFixed(1)}M` : `$${k}K`;
  };

  return newDeals.map(d => {
    const confianca = Number(d.confianca || 0);
    const fase = String(d.fase_atual || '').trim() || 'N/A';
    const dataCriacaoRaw = d.Data_de_criacao || d.Data_Criacao || d.data_criacao || d.created_date || '';
    const dataCriacao = formatDateDMY(dataCriacaoRaw);
    const dataPrevista = formatDateDMY(d.data_prevista || d.data_fechamento || d.close_date || '');
    const produtos = String(d.produtos || d.product_name || d.products || '').trim() || 'Não informado';
    const portfolio = String(d.Portfolio_FDM || d.Portfolio || d.portfolio_fdm || d.portfolio || '').trim() || 'Não informado';
    const tipoOportunidade = String(d.Tipo_Oportunidade || d.tipo_oportunidade || '').trim() || 'Não informado';
    const tipoOportunidadeSchemaRaw = d.Tipo_Oportunidade || d.tipo_oportunidade || '';
    const acaoSugerida = String(d.Proxima_Acao_Pipeline || d.Acao_Sugerida || d.acao_sugerida || d.Acao_Recomendada || d.acao_recomendada || '').trim() || 'Não informado na fonte';
    const diasFunil = Number(d.dias_funil || 0);
    const dataCriacaoLabel = dataCriacao || 'Não informado na fonte';
    const portfolioLabel = portfolio || 'Não informado na fonte';
    const tipoOportunidadeTag = renderOpportunityTypeTag(tipoOportunidadeSchemaRaw, tipoOportunidade);

    return `
      <div style="padding: 14px; background: rgba(255,255,255,0.02); border-left: 4px solid var(--warning); border-radius: 10px;">
        <div style="display:flex; justify-content: space-between; align-items: start; gap: 12px;">
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 6px;">
              ${escapeHtml(d.oportunidade || 'Sem nome')}
            </div>
            <div style="font-size: 12px; color: var(--text-gray); margin-bottom: 6px;">
              ${escapeHtml(d.conta || 'Conta não informada')}
            </div>
            <div style="display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 2px;">
              ${renderBusinessContextTags(d)}
              ${tipoOportunidadeTag}
              <span style="font-size: 11px; color: var(--text-gray); background: rgba(0,190,255,0.08); border: 1px solid rgba(0,190,255,0.2); border-radius: 999px; padding: 3px 8px;">Criada: ${escapeHtml(dataCriacaoLabel)}</span>
              <span style="font-size: 11px; color: var(--text-gray); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 3px 8px;">${diasFunil} dias funil</span>
              <span style="font-size: 11px; color: var(--primary-cyan); background: rgba(0,190,255,0.08); border: 1px solid rgba(0,190,255,0.2); border-radius: 999px; padding: 3px 8px;">Fase: ${escapeHtml(fase)}</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-main); line-height: 1.45; background: rgba(255,255,255,0.04); border-left: 3px solid rgba(0,190,255,0.55); border-radius: 6px; padding: 6px 8px;">
              <strong style="color: var(--primary-cyan);">Produtos:</strong> ${escapeHtml(produtos)}
            </div>
          </div>
          <div style="text-align: right; min-width: 140px;">
            <div style="font-size: 12px; color: var(--warning); font-weight: 700;">Gross: ${formatMoney(d.gross)}</div>
            <div style="font-size: 12px; color: var(--text-main);">Net: ${formatMoney(d.net)}</div>
            <div style="font-size: 11px; color: ${confianca >= 50 ? 'var(--accent-green)' : 'var(--warning)'}; margin-top: 4px;">
              ${confianca}% confiança
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);">
          <div style="font-weight: 800; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-gray); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            ${agendaIcon('icon-calendar')} Resumo da Oportunidade
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Data de criação</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHtml(dataCriacaoLabel)}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Data prevista</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHtml(dataPrevista || 'N/A')}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Fase atual</div>
              <div style="font-size: 12px; color: var(--primary-cyan); font-weight: 700;">${escapeHtml(fase)}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Portfólio</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700; line-height: 1.4;">${escapeHtml(portfolioLabel)}</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding: 10px; border-radius: 8px; background: rgba(0,190,255,0.08); border-left: 3px solid var(--primary-cyan);">
            <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Ação sugerida</div>
            <div style="font-size: 12px; color: var(--text-main); font-weight: 700; line-height: 1.5;">${escapeHtml(acaoSugerida)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


function renderSeller1on1Deals(deals, sellerIdx) {
  if (!deals || deals.length === 0) {
    return renderEmptyState('Sem oportunidades no período.');
  }

  const allRiskTags = [];
  deals.forEach((deal) => {
    extractDealRiskTags(deal).forEach((tag) => {
      if (!allRiskTags.some((x) => x.toLowerCase() === String(tag).toLowerCase())) {
        allRiskTags.push(tag);
      }
    });
  });
  
  return `
    ${allRiskTags.length ? `
      <div style="padding: 10px 12px; margin-bottom: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; display:flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <div style="font-size: 11px; color: var(--text-gray); font-weight: 700;">Filtrar por tag de risco:</div>
        <select onchange="filterWeeklyAgendaDealsByRiskTag('${sellerIdx}', this.value)" style="background: rgba(255,255,255,0.07); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; min-width: 220px;">
          <option value="all">Todas</option>
          ${allRiskTags.map((t) => `<option value="${escapeHtml(normalizeRiskTagKey(t))}">${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
    ` : ''}
    <div id="agenda-deals-grid-${sellerIdx}" style="display: grid; gap: 12px;">
      ${deals.map(deal => {
    const ui = deal.ui || {};
    const confidence = parseFloat(deal.Confianca || 0) || 0;
    const gross = parseFloat(deal.Gross || 0) || 0;
    const net = parseFloat(deal.Net || 0) || 0;
    const categoria = deal.Categoria_Pauta || ui.categoria || 'MONITORAR';
    const categoriaLabel = ui.categoriaLabel || deal.Categoria_Pauta || 'MONITORAR';
    const riscoRaw = deal.Risco_Score || ui.riscoScore || 0;
    const risco = Math.max(0, Math.min(5, Number(riscoRaw) || 0));
    const questions = deal.sabatina_questions || [];

    const riskTags = extractDealRiskTags(deal);
    const riskTagKeys = riskTags.map((t) => normalizeRiskTagKey(t)).filter(Boolean);
    const justificativaIA = ui.justificativaIA || deal.Justificativa_IA || deal.justificativaIA || deal.Motivo_Confianca || deal.motivo_confianca || '';
    const iaNotaLabel = ui.iaNotaLabel || ui.iaNota || '';
    const riscoPrincipal = (ui.riscoPrincipal || deal.Risco_Principal || '').trim();
    const faseAtual = deal.Fase_Atual || deal.Fase || deal.Stage || '';
    const dataCriacaoRaw = deal.Data_de_criacao || deal.Data_Criacao || deal.Created_Date || deal.CreatedDate || deal.Created || '';
    const dataPrevistaRaw = deal.Data_Prevista || deal.Close_Date || deal.CloseDate || deal.Data_Fechamento || deal.Data_de_Fechamento || '';
    const produtosRaw = deal.Produtos || deal.Product_Name || deal.Product || deal.products || '';
    const portfolioRaw = deal.Portfolio_FDM || deal.Portfolio || deal.portfolio_fdm || deal.portfolio || '';
    const tipoOportunidadeRaw = deal.Tipo_Oportunidade || deal.tipo_oportunidade || '';
    const tipoOportunidadeSchemaRaw = deal.Tipo_Oportunidade || deal.tipo_oportunidade || '';
    const acaoSugeridaRaw = deal.Proxima_Acao_Pipeline || deal.Acao_Sugerida || deal.acao_sugerida || deal.Acao_Recomendada || deal.acao_recomendada || '';
    const bdmOwnerRaw = deal.BDM_Owner || deal.bdm_owner || deal.Vendedor || deal.vendedor || '';
    const bdmOwnerLabel = formatPersonDisplayName(bdmOwnerRaw);
    const dataCriacao = formatDateDMY(dataCriacaoRaw);
    const dataPrevista = formatDateDMY(dataPrevistaRaw) || 'N/A';
    const faseAtualLabel = humanizeLabelToken(String(faseAtual || '').trim()) || 'N/A';
    const produtosLabel = String(produtosRaw || '').trim() || 'Não informado';
    const portfolioLabel = humanizeLabelToken(String(portfolioRaw || '').trim()) || 'Não informado na fonte';
    const tipoOportunidadeLabel = String(tipoOportunidadeRaw || '').trim() || 'Não informado';
    const tipoOportunidadeTag = renderOpportunityTypeTag(tipoOportunidadeSchemaRaw, tipoOportunidadeLabel);
    const acaoSugeridaLabel = String(acaoSugeridaRaw || '').trim() || 'Não informado na fonte';
    const dataCriacaoLabel = dataCriacao || 'Não informado na fonte';
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
      if (!val) return '$0';
      const k = Math.round(val / 1000);
      return k >= 1000 ? `$${(k/1000).toFixed(1)}M` : `$${k}K`;
    };
    
    // Calculate margin percentage
    const marginPct = gross > 0 ? Math.round(100 * (net / gross)) : 0;
    const marginColor = marginPct < 0 ? 'var(--danger)' : 
                        marginPct < 50 ? 'var(--warning)' : 
                        marginPct < 80 ? 'var(--accent-green)' : 'var(--success)';
    
    return `
      <div class="agenda-deal-row" data-risk-tags="${escapeHtml(riskTagKeys.join('|'))}" style="padding: 16px; background: linear-gradient(160deg, rgba(9,16,26,0.82) 0%, rgba(16,24,35,0.78) 100%); border-left: 4px solid ${borderColor}; border-radius: 10px; border: 1px solid rgba(255,255,255,0.10); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.22); transition: all 0.25s ease;" onmouseover="this.style.background='linear-gradient(160deg, rgba(12,20,32,0.9) 0%, rgba(20,30,43,0.85) 100%)'; this.style.borderColor='rgba(255,255,255,0.16)'" onmouseout="this.style.background='linear-gradient(160deg, rgba(9,16,26,0.82) 0%, rgba(16,24,35,0.78) 100%)'; this.style.borderColor='rgba(255,255,255,0.10)'">
        <!-- Deal Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 6px;">
              ${deal.Oportunidade || 'Sem nome'}
            </div>
            <div style="font-size: 12px; color: var(--text-gray); margin-bottom: 4px;">
              ${deal.Conta || 'Conta não informada'}
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px;">
              ${renderBusinessContextTags(deal)}
              ${tipoOportunidadeTag}
              ${bdmOwnerLabel ? `<span style="font-size: 11px; color: #93c5fd; background: rgba(147,197,253,0.10); border: 1px solid rgba(147,197,253,0.30); border-radius: 999px; padding: 3px 8px;">BDM Owner: ${escapeHtml(bdmOwnerLabel)}</span>` : ''}
              <span class="badge" style="background: ${borderColor}20; color: ${borderColor}; border: 1px solid ${borderColor};">
                ${categoriaLabel}
              </span>
              <span style="font-size: 11px; color: var(--text-gray); background: rgba(0,190,255,0.08); border: 1px solid rgba(0,190,255,0.2); border-radius: 999px; padding: 3px 8px;">
                ${deal.Fiscal_Q || 'Q?'}${fechamentoQuarter ? ` | Fechamento: <span style="color:${fechamentoMismatch ? 'var(--warning)' : 'var(--text-gray)'}; font-weight:${fechamentoMismatch ? '900' : '700'};">${fechamentoQuarter}</span>` : ''} | ${deal.Dias_Funil || 0} dias funil${faseAtualLabel && faseAtualLabel !== 'N/A' ? ` | Fase: ${faseAtualLabel}` : ''}
              </span>
              <span style="font-size: 11px; color: var(--text-gray); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 3px 8px;">
                ${deal.Atividades || 0} atividades
              </span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-main); line-height: 1.45; background: rgba(255,255,255,0.04); border-left: 3px solid rgba(0,190,255,0.55); border-radius: 6px; padding: 6px 8px;">
              <strong style="color: var(--primary-cyan);">Produtos:</strong> ${escapeHtml(produtosLabel)}
            </div>
          </div>
          <div style="text-align: right; min-width: 220px;">
            <!-- Valores Gross e Net (lado a lado) -->
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px;">
              <div style="padding: 8px 10px; background: rgba(0,190,255,0.08); border-radius: 8px; border: 1px solid rgba(0,190,255,0.2); min-width: 98px;">
                <div style="font-size: 10px; color: var(--text-gray); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Gross</div>
                <div style="font-weight: 700; font-size: 14px; color: var(--primary-cyan);">${formatMoney(gross)}</div>
              </div>
              <div style="padding: 8px 10px; background: rgba(192,255,125,0.08); border-radius: 8px; border: 1px solid rgba(192,255,125,0.22); min-width: 98px;">
                <div style="font-size: 10px; color: var(--text-gray); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Net</div>
                <div style="font-weight: 700; font-size: 14px; color: ${net < 0 ? 'var(--danger)' : 'var(--accent-green)'};">${formatMoney(net)}</div>
                <div style="font-size: 9px; color: ${marginColor}; margin-top: 3px; font-weight: 600;">${marginPct}% margem</div>
              </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <div style="font-size: 11px; color: var(--text-gray);">${confidence}% confiança</div>
              <div style="font-size: 11px; color: ${risco >= 4 ? 'var(--danger)' : risco >= 3 ? 'var(--warning)' : 'var(--text-gray)'}; font-weight: 600;">
                Risco: ${risco}/5
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);">
          <div style="font-weight: 800; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-gray); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            ${agendaIcon('icon-calendar')} Resumo da Oportunidade
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Data de criação</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHtml(dataCriacaoLabel)}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Data prevista</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHtml(dataPrevista)}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Fase atual</div>
              <div style="font-size: 12px; color: var(--primary-cyan); font-weight: 700;">${escapeHtml(faseAtualLabel)}</div>
            </div>
            <div style="padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);">
              <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Portfólio</div>
              <div style="font-size: 12px; color: var(--text-main); font-weight: 700; line-height: 1.4;">${escapeHtml(portfolioLabel)}</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding: 10px; border-radius: 8px; background: rgba(0,190,255,0.08); border-left: 3px solid var(--primary-cyan);">
            <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;">Ação sugerida</div>
            <div style="font-size: 12px; color: var(--text-main); font-weight: 700; line-height: 1.5;">${escapeHtml(acaoSugeridaLabel)}</div>
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
                ${riskTags.slice(0, 8).map(t => `<span class="badge" style="background: rgba(255,165,0,0.14); color: var(--warning); border: 1px solid rgba(255,165,0,0.25);">${escapeHtml(t)}</span>`).join('')}
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
  }).join('')}
    </div>
  `;
}

// Expõe funções para uso global
window.loadWeeklyAgenda = loadWeeklyAgenda;
window.renderSeller1on1Deals = renderSeller1on1Deals;

console.log('[WEEKLY-AGENDA-NEW] Script carregado - funções disponíveis: loadWeeklyAgenda, renderSeller1on1Deals');
