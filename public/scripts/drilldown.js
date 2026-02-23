/**
 * drilldown.js — Unified drilldown router v2.0
 * Unifica drilldown de gráficos/mapa de palavras usando o mesmo painel executivo.
 */
(function () {
  'use strict';

  function fmt(v) {
    if (typeof window.formatMoney === 'function') return window.formatMoney(v || 0);
    var n = +v || 0;
    if (n >= 1e6) return 'R$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return 'R$' + (n / 1e3).toFixed(0) + 'k';
    return 'R$' + Math.round(n);
  }

  function normalizeSource(item) {
    if (item && item._src) {
      if (item._src === 'pipe') return 'pipeline';
      return item._src;
    }
    var resultType = String(item?.Tipo_Resultado || item?.resultType || '').toLowerCase();
    if (resultType.includes('lost') || resultType.includes('perd')) return 'lost';
    if (resultType.includes('won') || resultType.includes('ganh')) return 'won';
    return 'pipeline';
  }

  function normalizeDealRow(item) {
    var gross = +(item?.Gross || item?.gross || item?.value || item?.val || 0);
    var net = +(item?.Net || item?.net || 0);
    return {
      source: normalizeSource(item),
      name: item?.Oportunidade || item?.Opportunity_Name || item?.opportunityName || item?.name || 'Deal sem nome',
      account: item?.Conta || item?.account || 'Conta não informada',
      owner: item?.Vendedor || item?.seller || item?.Owner || item?.owner || 'N/A',
      value: gross,
      netValue: net,
      quarter: item?.fiscalQ || item?.Fiscal_Q || item?.quarter || 'Quarter N/A',
      stage: item?.Fase_Atual || item?.stage || item?.Status || '-',
      confidence: item?.Confianca != null ? Number(item.Confianca) : item?.confidence != null ? Number(item.confidence) : null,
      idleDays: item?.Idle_Dias != null ? Number(item.Idle_Dias) : item?.idleDays != null ? Number(item.idleDays) : null,
      activities: item?.Atividades != null ? Number(item.Atividades) : item?.activities != null ? Number(item.activities) : null,
      cycle: (function() {
        var raw = (item?.Ciclo_dias != null && item?.Ciclo_dias !== '') ? item.Ciclo_dias : item?.cycle;
        if (raw == null || raw === '') return null;
        var n = Number(raw);
        return isNaN(n) ? null : n;
      })(),
      bant: item?.BANT_Score != null ? Number(item.BANT_Score) : item?.bant != null ? Number(item.bant) : null,
      riskScore: item?.Risco_Score != null ? Number(item.Risco_Score) : item?.riskScore != null ? Number(item.riskScore) : null,
      meddic: (function() {
        var raw = item?.MEDDIC_Score != null ? item.MEDDIC_Score : item?.meddic;
        if (raw == null || raw === '') return null;
        var n = parseFloat(String(raw));
        if (isNaN(n) || n < 0) return null;
        // BQ retorna MEDDIC_Score como percentual 0-100; converter para escala de blocos 0-6
        return n <= 6 ? Math.round(n) : Math.round(n / 100 * 6);
      })(),
      forecastStatus: item?.Forecast_IA || item?.Forecast_SF || item?.forecastStatus || '',
      vertical: item?.Vertical_IA || item?.vertical || '',
      subVertical: item?.Sub_vertical_IA || item?.subVertical || '',
      segment: item?.Segmento_consolidado || item?.segment || '',
      state: item?.Estado_Provincia_de_cobranca || item?.state || '',
      portfolio: item?.Portfolio_FDM || item?.portfolio || '',
      resultType: item?.Tipo_Resultado || item?.resultType || '',
      reason: item?.Justificativa_IA || item?.Fatores_Sucesso || item?.Win_Reason || item?.Causa_Raiz || item?.Loss_Reason || item?.reason || '',
      closeDate: item?.Data_Fechamento || item?.Data_Prevista || item?.closeDate || '',
      avoidable: !!(item?.Evitavel || item?.avoidable)
    };
  }

  function currentFiltersLabel() {
    var f = window.currentFilters || {};
    var parts = [];
    if (f.year) parts.push('Ano: ' + f.year);
    if (f.quarter) parts.push('Quarter: ' + f.quarter);
    if (f.month) parts.push('Mês: ' + f.month);
    if (f.phase) parts.push('Fase: ' + f.phase);
    if (f.seller) parts.push('Vendedor: ' + f.seller);
    if (f.owner_preventa) parts.push('Pré-venda: ' + f.owner_preventa);
    if (f.billing_city) parts.push('Cidade (Cobrança): ' + f.billing_city);
    if (f.billing_state) parts.push('Estado (Cobrança): ' + f.billing_state);
    if (f.vertical_ia) parts.push('Vertical IA: ' + f.vertical_ia);
    if (f.sub_vertical_ia) parts.push('Subvertical IA: ' + f.sub_vertical_ia);
    if (f.sub_sub_vertical_ia) parts.push('Sub-subvertical IA: ' + f.sub_sub_vertical_ia);
    if (f.subsegmento_mercado) parts.push('Subsegmento: ' + f.subsegmento_mercado);
    if (f.segmento_consolidado) parts.push('Segmento de Mercado: ' + f.segmento_consolidado);
    if (f.portfolio_fdm) parts.push('Portfólio FDM: ' + f.portfolio_fdm);
    return parts.length ? parts.join(' | ') : 'Sem filtros adicionais';
  }

  function formatMoneySafe(value) {
    if (typeof window.formatMoney === 'function') return window.formatMoney(value || 0);
    return fmt(value || 0);
  }

  function escapeHtmlSafe(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getExecDrilldownRowKey(row) {
    if (row && row.__execDrilldownKey) return row.__execDrilldownKey;
    return (row?.name || '') + '|' + (row?.owner || '') + '|' + (row?.source || '') + '|' + (row?.quarter || '') + '|' + (row?.account || '');
  }

  function ensureExecDrilldownRowKeys(rows) {
    var sourceRows = Array.isArray(rows) ? rows : [];
    window.__execDrilldownKeySeed = Number(window.__execDrilldownKeySeed || 0);
    sourceRows.forEach(function (row) {
      if (!row || row.__execDrilldownKey) return;
      window.__execDrilldownKeySeed += 1;
      row.__execDrilldownKey = 'exec-dd-' + window.__execDrilldownKeySeed;
    });
    return sourceRows;
  }

  function renderExecutiveDrilldown() {
    var state = window.execDrilldownState || {};
    var rows = Array.isArray(state.filteredRows) ? state.filteredRows : [];
    var titleEl = document.getElementById('exec-dd-title');
    var subtitleEl = document.getElementById('exec-dd-subtitle');
    var metaEl = document.getElementById('exec-dd-meta');
    var listEl = document.getElementById('exec-dd-list');
    var detailEl = document.getElementById('exec-dd-detail');
    var chipsEl = document.getElementById('exec-dd-source-chips');
    var sqlEl = document.getElementById('exec-dd-sql');
    if (!titleEl || !subtitleEl || !metaEl || !listEl || !detailEl || !chipsEl || !sqlEl) return;

    titleEl.textContent = state.title || 'Drill-down Executivo';
    var totalNet = rows.reduce(function (sum, row) { return sum + Number(row.netValue || row.value || 0); }, 0);
    subtitleEl.innerHTML = '<span class="text-cyan">' + rows.length + ' deals</span> · <span>Valor Net: ' + formatMoneySafe(totalNet) + '</span>';

    var updatedAt = '';
    if (typeof window.formatDateTime === 'function') {
      var baseDate = window.DATA && window.DATA.updatedAt ? window.DATA.updatedAt : '';
      updatedAt = window.formatDateTime(baseDate) || '-';
    } else {
      updatedAt = '-';
    }

    metaEl.innerHTML =
      '<div><strong>Regra de cálculo:</strong> ' + (state.rule || '-') + '</div>' +
      '<div><strong>Base usada:</strong> ' + (state.baseLabel || (((state.rows || []).length) + ' deals')) + '</div>' +
      '<div><strong>Filtros herdados:</strong> ' + (state.filtersLabel || currentFiltersLabel()) + '</div>' +
      '<div><strong>Última atualização:</strong> ' + updatedAt + '</div>';

    var distinctSources = Array.from(new Set((state.rows || []).map(function (r) { return r.source || 'other'; })));
    chipsEl.innerHTML = ['all'].concat(distinctSources).map(function (src) {
      var active = (state.activeSource || 'all') === src;
      var label = src === 'all' ? 'Tudo' : src.toUpperCase();
      return '<button class="exec-dd-chip ' + (active ? 'active' : '') + '" onclick="setExecutiveDrilldownSource(\'' + src + '\')">' + label + '</button>';
    }).join('');

    sqlEl.textContent = state.sql || 'Regra SQL indisponível';
    document.getElementById('exec-drilldown-panel')?.classList.add('accordion-mode');

    if (!rows.length) {
      listEl.innerHTML = '<div class="exec-dd-empty">Nenhum resultado. Ajuste busca/fonte para visualizar dados.</div>';
      detailEl.textContent = 'Sem item selecionado.';
      return;
    }

    var selected = state.selected || rows[0];
    var expandedKey = state.expandedKey || null;

    var accountGroupsMap = new Map();
    rows.forEach(function (row, idx) {
      var accountKey = (row.account || 'Conta não informada').trim() || 'Conta não informada';
      if (!accountGroupsMap.has(accountKey)) {
        accountGroupsMap.set(accountKey, { account: accountKey, items: [] });
      }
      accountGroupsMap.get(accountKey).items.push({ row: row, idx: idx });
    });

    var tableRows = Array.from(accountGroupsMap.values()).map(function (group) {
      var accountNet = group.items.reduce(function (sum, item) {
        return sum + Number(item.row.netValue || item.row.value || 0);
      }, 0);

      var groupHeader = '' +
        '<tr class="exec-dd-group-row">' +
          '<td colspan="4" class="exec-dd-group-cell">' +
            '<div class="exec-dd-group-content">' +
              '<strong class="exec-dd-group-account">' + escapeHtmlSafe(group.account) + '</strong>' +
              '<span class="exec-dd-group-meta">' + group.items.length + ' oportunidade(s) · Net: ' + formatMoneySafe(accountNet) + '</span>' +
            '</div>' +
          '</td>' +
        '</tr>';

      var groupRows = group.items.map(function (item) {
        var row = item.row;
        var idx = item.idx;
      var rowKey = getExecDrilldownRowKey(row);
      var isOpen = rowKey === expandedKey;
      var source = row.source || 'other';
      var statusText = source === 'won' ? 'Ganho' : source === 'lost' ? 'Perdido' : 'Aberto';
      var badgeClass = source === 'won' ? 'dd-badge-won' : source === 'lost' ? 'dd-badge-lost' : 'dd-badge-pipe';
      var ownerInitials = String(row.owner || 'N/A').split(' ').filter(Boolean).map(function (part) { return part[0]; }).join('').slice(0, 2).toUpperCase();

      var grossValue = Number(row.value || row.gross || 0);
      var netValue = Number(row.netValue || row.value || 0);
      var idleDays = row.idleDays != null ? Number(row.idleDays) : null;
      var cycle = row.cycle != null ? Number(row.cycle) : null;
      var confidence = row.confidence != null ? Number(row.confidence) : null;
      var meddicScore = row.meddic != null ? Math.max(0, Math.min(6, Number(row.meddic))) : null;
      var idleClass = idleDays == null ? '' : idleDays > 30 ? 'danger' : idleDays > 14 ? 'warn' : 'ok';
      var aiNote = row.reason || (source === 'lost'
        ? 'Perda com baixa tração em decisores e ausência de plano de recuperação ativo.'
        : 'Engajamento comercial detectado. Priorizar próximo passo com decisor econômico.');

      var meddicBlocks = Array.from({ length: 6 }).map(function (_, blockIdx) {
        var level = blockIdx + 1;
        var cls = '';
        if (meddicScore != null && level <= meddicScore) {
          cls = meddicScore >= 4 ? 'good' : meddicScore <= 2 ? 'bad' : 'warn';
        }
        return '<span class="exec-dd-meddic-block ' + cls + '"></span>';
      }).join('');

      return '' +
        '<tr class="exec-dd-row ' + (isOpen ? 'open' : '') + '" id="exec-dd-row-' + idx + '" onclick="toggleExecutiveDrilldownRow(' + idx + ')">' +
          '<td class="exec-dd-cell-opp">' +
            '<div class="exec-dd-opp-wrap">' +
              '<svg class="exec-dd-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
              '<div class="exec-dd-opp-content">' +
                '<span class="exec-dd-opp-name">' + escapeHtmlSafe(row.name || 'Deal sem nome') + '</span>' +
                '<span class="exec-dd-opp-account">' +
                  '<span class="exec-dd-opp-account-name">' + escapeHtmlSafe(row.account || 'Conta não informada') + '</span>' +
                  '<span class="exec-dd-opp-meta">' + escapeHtmlSafe(row.quarter || 'Quarter N/A') + ' · ' + escapeHtmlSafe(row.stage || '-') + '</span>' +
                '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div class="exec-dd-owner">' +
              '<span class="exec-dd-owner-avatar">' + escapeHtmlSafe(ownerInitials || 'NA') + '</span>' +
              '<span>' + escapeHtmlSafe(row.owner || 'N/A') + '</span>' +
            '</div>' +
          '</td>' +
          '<td><strong class="text-cyan">' + formatMoneySafe(netValue) + '</strong></td>' +
          '<td><span class="dd-badge ' + badgeClass + '">' + statusText + '</span></td>' +
        '</tr>' +
        '<tr class="exec-dd-exp-row" style="display:' + (isOpen ? 'table-row' : 'none') + '" id="exec-dd-exp-' + idx + '" onclick="toggleExecutiveDrilldownRow(' + idx + ')">' +
          '<td colspan="4" class="exec-dd-exp-cell">' +
            '<div class="exec-dd-hud-wrap">' +
              '<div class="exec-dd-hud-commercial">' +
                '<div class="exec-dd-hud-row exec-dd-hud-row-fin">' +
                  '<div><div class="exec-dd-hud-label">Net Revenue</div><div class="exec-dd-hud-value text-cyan">' + formatMoneySafe(netValue) + '</div></div>' +
                  '<div><div class="exec-dd-hud-label">Gross Value</div><div class="exec-dd-hud-value-sm">' + formatMoneySafe(grossValue) + '</div></div>' +
                  '<div><div class="exec-dd-hud-label">Fase Atual</div><div class="exec-dd-hud-value-sm">' + escapeHtmlSafe(row.stage || '-') + '</div></div>' +
                '</div>' +
                '<div class="exec-dd-hud-divider"></div>' +
                '<div class="exec-dd-hud-row exec-dd-hud-row-health">' +
                  '<div><div class="exec-dd-hud-label">Ciclo de Venda</div><div class="exec-dd-hud-value-sm">' + (cycle != null ? (cycle + ' dias') : '-') + '</div></div>' +
                  '<div><div class="exec-dd-hud-label">Dias Inativos</div><div class="exec-dd-hud-value-sm exec-dd-idle ' + idleClass + '">' + (idleDays != null ? (idleDays + ' dias') : '-') + '</div></div>' +
                  '<div><div class="exec-dd-hud-label">MEDDIC Health</div><div class="exec-dd-meddic-row">' + meddicBlocks + '</div></div>' +
                '</div>' +
              '</div>' +
              '<div class="exec-dd-hud-ai">' +
                '<div class="exec-dd-ai-score-wrap">' +
                  '<div class="exec-dd-ai-score-circle">' + (confidence != null ? (confidence + '%') : '--') + '</div>' +
                  '<div><div class="exec-dd-ai-score-title">Inteligência Estratégica</div><div class="exec-dd-ai-score-sub">Probabilidade de Sucesso</div></div>' +
                '</div>' +
                '<div class="exec-dd-ai-note">' + escapeHtmlSafe(aiNote) + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');

      return groupHeader + groupRows;
    }).join('');

    listEl.innerHTML =
      '<div class="exec-dd-table-wrap">' +
        '<table class="exec-dd-table">' +
          '<thead><tr><th>Oportunidade & Conta</th><th>Proprietário</th><th>Net Revenue</th><th>Status</th></tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
      '</div>';

    detailEl.innerHTML = '<div class="exec-dd-detail-title">' + escapeHtmlSafe(selected?.name || 'Deal') + '</div><div class="exec-dd-detail-sub">Modo expandido ativo (accordion)</div>';
  }

  window.setExecutiveDrilldownSource = function (source) {
    window.execDrilldownState = window.execDrilldownState || {};
    window.execDrilldownState.activeSource = source;
    window.applyExecutiveDrilldownFilters();
  };

  window.toggleExecutiveDrilldownRow = function (idx) {
    var state = window.execDrilldownState || {};
    var row = (state.filteredRows || [])[idx] || null;
    if (!row) return;
    var rowKey = getExecDrilldownRowKey(row);
    state.expandedKey = state.expandedKey === rowKey ? null : rowKey;
    state.selected = row;
    window.execDrilldownState = state;
    renderExecutiveDrilldown();
  };

  window.applyExecutiveDrilldownFilters = function () {
    var state = window.execDrilldownState || {};
    var searchEl = document.getElementById('exec-dd-search');
    var sortEl = document.getElementById('exec-dd-sort');
    var text = (searchEl?.value || '').toLowerCase().trim();
    var source = state.activeSource || 'all';
    var sort = sortEl?.value || 'value_desc';

    var rows = Array.isArray(state.rows) ? state.rows.slice() : [];
    if (source !== 'all') rows = rows.filter(function (r) { return (r.source || 'other') === source; });
    if (text) {
      rows = rows.filter(function (r) {
        return [r.name, r.account, r.owner, r.quarter, r.stage, r.resultType, r.reason]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(text);
      });
    }

    if (sort === 'value_asc') rows.sort(function (a, b) { return Number(a.netValue || a.value || 0) - Number(b.netValue || b.value || 0); });
    else if (sort === 'name_asc') rows.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    else rows.sort(function (a, b) { return Number(b.netValue || b.value || 0) - Number(a.netValue || a.value || 0); });

    state.filteredRows = rows;
    state.selected = rows.find(function (r) {
      return state.selected && getExecDrilldownRowKey(r) === getExecDrilldownRowKey(state.selected);
    }) || rows[0] || null;

    if (state.expandedKey != null) {
      var hasExpanded = rows.some(function (row) { return getExecDrilldownRowKey(row) === state.expandedKey; });
      state.expandedKey = hasExpanded ? state.expandedKey : (state.selected ? getExecDrilldownRowKey(state.selected) : null);
    }
    window.execDrilldownState = state;
    renderExecutiveDrilldown();
  };

  window.toggleExecutiveDrilldownSql = function () {
    var sqlEl = document.getElementById('exec-dd-sql');
    if (sqlEl) sqlEl.classList.toggle('active');
  };

  window.exportExecutiveDrilldownCsv = function () {
    var state = window.execDrilldownState || {};
    var rows = Array.isArray(state.filteredRows) ? state.filteredRows : [];
    if (!rows.length) return;

    var headers = ['source', 'name', 'account', 'owner', 'value', 'quarter', 'stage', 'confidence', 'idleDays', 'activities', 'cycle', 'resultType', 'reason', 'closeDate'];
    var csv = [headers.join(',')].concat(rows.map(function (row) {
      return headers.map(function (h) {
        var value = row[h] == null ? '' : String(row[h]).replace(/"/g, '""');
        return '"' + value + '"';
      }).join(',');
    })).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'drilldown_executivo_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  window.closeExecutiveDrilldown = function () {
    document.getElementById('exec-drilldown-backdrop')?.classList.remove('active');
    document.getElementById('exec-drilldown-panel')?.classList.remove('active');
    document.getElementById('exec-drilldown-panel')?.setAttribute('aria-hidden', 'true');
  };

  window.openExecutiveDrilldown = function (config) {
    var rows = ensureExecDrilldownRowKeys(Array.isArray(config?.rows) ? config.rows : []);
    window.execDrilldownState = {
      ...(config || {}),
      rows: rows,
      filteredRows: rows.slice(),
      activeSource: 'all',
      selected: (config && config.selected) || rows[0] || null,
      expandedKey: (config && config.selected) ? getExecDrilldownRowKey(config.selected) : (rows[0] ? getExecDrilldownRowKey(rows[0]) : null),
      filtersLabel: (config && config.filtersLabel) || currentFiltersLabel()
    };

    renderExecutiveDrilldown();

    var searchEl = document.getElementById('exec-dd-search');
    var sortEl = document.getElementById('exec-dd-sort');
    var sqlEl = document.getElementById('exec-dd-sql');
    if (searchEl) searchEl.value = '';
    if (sortEl) sortEl.value = 'value_desc';
    if (sqlEl) sqlEl.classList.remove('active');

    document.getElementById('exec-drilldown-backdrop')?.classList.add('active');
    document.getElementById('exec-drilldown-panel')?.classList.add('active');
    document.getElementById('exec-drilldown-panel')?.setAttribute('aria-hidden', 'false');
    setTimeout(function () { searchEl?.focus(); }, 20);
  };

  if (!window.__execDrilldownEscBound) {
    window.__execDrilldownEscBound = true;
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && document.getElementById('exec-drilldown-panel')?.classList.contains('active')) {
        window.closeExecutiveDrilldown?.();
      }
    });
  }

  function openUnifiedExecutiveShell(config) {
    var rows = Array.isArray(config.rows) ? config.rows : [];
    rows.sort(function (a, b) { return (b.value || 0) - (a.value || 0); });

    window.openExecutiveDrilldown({
      title: config.title || 'Drill-down Unificado',
      subtitle: config.subtitle || 'Lista → Detalhe (modelo único)',
      rows: rows,
      selected: config.selected || rows[0] || null,
      rule: config.rule || 'Modelo unificado de drilldown com filtros herdados',
      baseLabel: config.baseLabel || (rows.length + ' deals · ' + fmt(rows.reduce(function (sum, r) { return sum + (r.value || 0); }, 0))),
      sql: config.sql || 'SELECT * FROM unified_deals WHERE <filtros_herdados>',
      sourceType: config.sourceType || 'mixed',
      filtersLabel: config.filtersLabel || currentFiltersLabel()
    });
  }

  function openDealDrilldown(title, items) {
    var normalizedRows = (items || []).map(normalizeDealRow);
    openUnifiedExecutiveShell({
      title: 'Drill-down · ' + (title || 'Exploração de Deals'),
      subtitle: 'Mapa/Gráficos → Lista → Detalhe',
      rows: normalizedRows,
      selected: normalizedRows[0] || null,
      rule: 'Agrupamento visual + seleção contextual do gráfico/mapa',
      sourceType: 'chart'
    });
  }

  window.openDealDrilldown = openDealDrilldown;
  window.openDrilldown = openDealDrilldown;

  window.closeChartDrilldown = function () {
    if (typeof window.closeExecutiveDrilldown === 'function') {
      window.closeExecutiveDrilldown();
      return;
    }
    document.getElementById('chart-drilldown-modal')?.classList.remove('open');
    document.getElementById('chart-drilldown-overlay')?.classList.remove('open');
  };

  window._ddExpandRow = function () {};

  window._wcloudClick = function (span) {
    var label = span?.getAttribute('data-wlabel');
    if (!label) return;

    var node = span.parentElement;
    while (node && !node._drillContext) node = node.parentElement;
    if (!node || !node._drillContext) return;

    var ctx = node._drillContext;
    var field = ctx.field;
    var data = (ctx.data || []).slice();
    var lc = label.toLowerCase();

    var filtered = data.filter(function (d) {
      var primary = String(d[field] || '').toLowerCase();
      if (primary && (primary === lc || primary.indexOf(lc) !== -1)) return true;
      var haystack = [
        d.Forecast_IA, d.Forecast_SF, d.Tipo_Resultado, d.Fatores_Sucesso,
        d.Causa_Raiz, d.Win_Reason, d.Loss_Reason, d.Fase_Atual,
        d.Vertical_IA, d.Sub_vertical_IA, d.Segmento_consolidado,
        d.Estado_Provincia_de_cobranca, d.Conta, d.account,
        d.Oportunidade, d.Opportunity_Name, d.opportunityName
      ].map(function (v) { return String(v || '').toLowerCase(); }).join(' | ');
      return haystack.indexOf(lc) !== -1;
    }).map(function (d) {
      return Object.assign({ _src: ctx.src || 'won' }, d);
    });

    if (!filtered.length) {
      filtered = data.slice(0, 120).map(function (d) { return Object.assign({ _src: ctx.src || 'won' }, d); });
    }

    openDealDrilldown(label + (ctx.title ? ' — ' + ctx.title : ''), filtered);
  };
})();
