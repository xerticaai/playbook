// Resumo do Quarter: Net Total e Net Incremental por vendedor
(function () {
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const escAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function money(value) {
    if (typeof formatMoney === 'function') return formatMoney(Number(value || 0));
    return '$' + Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function formatIsoDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function renderStatusBadge(statusRaw) {
    const status = String(statusRaw || '').trim() || 'NAO_INFORMADO';
    const norm = status.toLowerCase().replace(/ñ/g, 'n');
    const badgeClass = (norm === 'pagada')
      ? 'paid'
      : (norm === 'pendiente' || norm === 'nao_informado' || norm === 'intercompania')
        ? 'pending'
        : '';
    return `<span class="qs-dd-status ${badgeClass}">${esc(status)}</span>`;
  }

  const quarterDrillState = {
    sellerName: '',
    viewMode: 'total'
  };

  const quarterUiState = {
    activeView: 'total',
    activeSellerKeySet: null,
    activeSellerLoadTried: false
  };

  const normalizeSellerKey = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  function setQuarterSummaryView(viewModeRaw) {
    const viewMode = viewModeRaw === 'incremental' ? 'incremental' : 'total';
    quarterUiState.activeView = viewMode;

    const totalWrap = document.getElementById('qs-view-total');
    const incrementalWrap = document.getElementById('qs-view-incremental');
    const totalBtn = document.getElementById('qs-view-total-btn');
    const incBtn = document.getElementById('qs-view-incremental-btn');

    if (totalWrap) totalWrap.style.display = viewMode === 'total' ? 'block' : 'none';
    if (incrementalWrap) incrementalWrap.style.display = viewMode === 'incremental' ? 'block' : 'none';

    if (totalBtn) {
      totalBtn.style.borderColor = viewMode === 'total' ? 'rgba(0,190,255,0.45)' : 'rgba(255,255,255,0.16)';
      totalBtn.style.background = viewMode === 'total' ? 'rgba(0,190,255,0.16)' : 'rgba(255,255,255,0.04)';
      totalBtn.style.color = viewMode === 'total' ? 'var(--primary-cyan)' : 'var(--text-main)';
      totalBtn.style.fontWeight = viewMode === 'total' ? '800' : '700';
    }
    if (incBtn) {
      incBtn.style.borderColor = viewMode === 'incremental' ? 'rgba(0,190,255,0.45)' : 'rgba(255,255,255,0.16)';
      incBtn.style.background = viewMode === 'incremental' ? 'rgba(0,190,255,0.16)' : 'rgba(255,255,255,0.04)';
      incBtn.style.color = viewMode === 'incremental' ? 'var(--primary-cyan)' : 'var(--text-main)';
      incBtn.style.fontWeight = viewMode === 'incremental' ? '800' : '700';
    }
  }

  async function ensureActiveSellerKeySet() {
    if (quarterUiState.activeSellerKeySet instanceof Set) return quarterUiState.activeSellerKeySet;
    if (quarterUiState.activeSellerLoadTried) return null;
    quarterUiState.activeSellerLoadTried = true;

    try {
      const data = await fetchJsonNoCache(`${window.API_BASE_URL}/api/sellers`);
      const active = Array.isArray(data?.active) ? data.active : [];
      quarterUiState.activeSellerKeySet = new Set(
        active
          .map((row) => normalizeSellerKey(row?.Vendedor || row?.vendedor || ''))
          .filter(Boolean)
      );
      return quarterUiState.activeSellerKeySet;
    } catch (_error) {
      return null;
    }
  }

  function closeQuarterSellerDrilldown() {
    const panel = document.getElementById('qs-drilldown-panel');
    const overlay = document.getElementById('qs-drilldown-overlay');
    if (panel) panel.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  function getQuarterSummaryParams() {
    const params = new URLSearchParams();

    // Revenue (ERP) must only use explicit filter widgets, never stale booking fallback values.
    const year = document.getElementById('year-filter')?.value || '';
    const quarter = document.getElementById('quarter-filter')?.value || '';
    const month = document.getElementById('month-filter')?.value || '';
    const dateStart = document.getElementById('date-start-filter')?.value || '';
    const dateEnd = document.getElementById('date-end-filter')?.value || '';

    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    if (month) params.set('month', month);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);

    const sellersFromMultiselect = Array.isArray(window.selectedSellers) && window.selectedSellers.length > 0
      ? window.selectedSellers.join(',')
      : '';
    const seller = sellersFromMultiselect;
    if (seller) {
      params.set('seller', seller);
    }

    const portfolio = typeof getMultiSelectCsv === 'function' ? getMultiSelectCsv('erp-portfolio-filter') : '';
    const statusPg = typeof getMultiSelectCsv === 'function' ? getMultiSelectCsv('erp-payment-status-filter') : '';
    const produto = typeof getMultiSelectCsv === 'function' ? getMultiSelectCsv('erp-product-filter') : '';
    const segmento = typeof getMultiSelectCsv === 'function' ? getMultiSelectCsv('erp-segment-filter') : '';

    if (portfolio) params.set('portfolio', portfolio);
    if (statusPg) params.set('status_pagamento', statusPg);
    if (produto) params.set('produto', produto);
    if (segmento) params.set('segmento', segmento);

    return params;
  }

  function renderSellerDrilldown(items, sellerName, viewMode) {
    const panel = document.getElementById('qs-drilldown-panel');
    const overlay = document.getElementById('qs-drilldown-overlay');
    const title = document.getElementById('qs-drilldown-title');
    const meta = document.getElementById('qs-drilldown-meta');
    const tbody = document.getElementById('qs-drilldown-body');
    if (!panel || !title || !meta || !tbody) return;

    panel.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
    const modeLabel = viewMode === 'incremental' ? 'Incremental' : 'Total';
    title.textContent = `Drill-down · ${sellerName} · ${modeLabel}`;

    const rows = Array.isArray(items) ? items : [];
    const total = rows.reduce((sum, row) => sum + Number(row?.net_revenue || 0), 0);
    const paidStatuses = new Set(['pagada', 'intercompania']);
    let paidTotal = 0;
    let pendingTotal = 0;
    rows.forEach((row) => {
      const statusNorm = String(row?.status_pagamento || '').trim().toLowerCase().replace(/ñ/g, 'n');
      const value = Number(row?.net_revenue || 0);
      if (paidStatuses.has(statusNorm)) paidTotal += value;
      else pendingTotal += value;
    });
    meta.textContent = `${rows.length} linhas · Net ${money(total)} · Pagada ${money(paidTotal)} · Pendente ${money(pendingTotal)}`;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-muted)">Sem linhas para este vendedor no recorte atual</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(formatIsoDate(row.fecha_factura_date || '-'))}</td>
        <td>${esc(row.oportunidade || '-')}</td>
        <td>${esc(row.cliente || '-')}</td>
        <td>${esc(row.produto || '-')}</td>
        <td>${esc(row.tipo_documento || '-')}</td>
        <td>${esc(row.cuenta_financeira || '-')}</td>
        <td>${renderStatusBadge(row.status_pagamento || '-')}</td>
        <td><span class="qs-dd-source">${esc(row.source_name || '-')}</span></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${esc(money(row.net_revenue || 0))}</td>
      </tr>
    `).join('');
  }

  function renderSellerDrilldownLoading(sellerName, viewMode) {
    const panel = document.getElementById('qs-drilldown-panel');
    const overlay = document.getElementById('qs-drilldown-overlay');
    const title = document.getElementById('qs-drilldown-title');
    const meta = document.getElementById('qs-drilldown-meta');
    const tbody = document.getElementById('qs-drilldown-body');
    if (!panel || !title || !meta || !tbody) return;

    panel.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
    const modeLabel = viewMode === 'incremental' ? 'Incremental' : 'Total';
    title.textContent = `Drill-down · ${sellerName} · ${modeLabel}`;
    meta.textContent = 'Carregando...';
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-muted)">Carregando linhas do vendedor...</td></tr>';
  }

  function renderSellerDrilldownError(sellerName, viewMode, errorMessage) {
    const panel = document.getElementById('qs-drilldown-panel');
    const overlay = document.getElementById('qs-drilldown-overlay');
    const title = document.getElementById('qs-drilldown-title');
    const meta = document.getElementById('qs-drilldown-meta');
    const tbody = document.getElementById('qs-drilldown-body');
    if (!panel || !title || !meta || !tbody) return;

    panel.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
    const modeLabel = viewMode === 'incremental' ? 'Incremental' : 'Total';
    title.textContent = `Drill-down · ${sellerName} · ${modeLabel}`;
    meta.textContent = 'Falha ao carregar';
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--danger)">${esc(errorMessage || 'Erro ao carregar drill-down')}</td></tr>`;
  }

  async function loadSellerDrilldown(sellerNameRaw, viewMode = 'total') {
    const sellerName = String(sellerNameRaw || '').trim();
    if (!sellerName) return;

    quarterDrillState.sellerName = sellerName;
    quarterDrillState.viewMode = viewMode === 'incremental' ? 'incremental' : 'total';
    renderSellerDrilldownLoading(sellerName, quarterDrillState.viewMode);

    const params = getQuarterSummaryParams();
    params.delete('seller');
    params.set('seller_name', sellerName);
    params.set('view', quarterDrillState.viewMode);
    params.set('limit', '500');

    const url = `${window.API_BASE_URL}/api/revenue/quarter-summary/drilldown?${params.toString()}`;
    const data = await fetchJsonNoCache(url);
    renderSellerDrilldown(data?.items || [], sellerName, quarterDrillState.viewMode);
  }

  function renderRows(tbodyId, rows, viewMode) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted)">Sem dados no período selecionado</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const metaValue = Number(row?.meta_bdm || 0);
      const hasMeta = metaValue > 0;
      const metaCell = hasMeta
        ? esc(money(metaValue))
        : '<span style="color:var(--text-muted);font-size:12px;">Sem meta</span>';
      const attainmentCell = hasMeta
        ? `${Number(row.attainment_pct || 0).toFixed(1)}%`
        : '-';

      return `
      <tr>
        <td>
          <button type="button" class="qs-seller-link" data-seller="${escAttr(row.vendedor || 'Sem vendedor')}" data-view="${escAttr(viewMode || 'total')}" onclick="window.handleQuarterSellerClick && window.handleQuarterSellerClick(this); return false;" style="background:none;border:none;padding:0;color:var(--primary-cyan);cursor:pointer;font:inherit;text-decoration:underline;">
            ${esc(row.vendedor || 'Sem vendedor')}
          </button>
        </td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${esc(money(row.net_revenue || 0))}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${esc(money(row.net_pagada || 0))}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${esc(money(row.net_pendente || 0))}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${metaCell}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${attainmentCell}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${Number(row.oportunidades || 0)}</td>
      </tr>
    `;
    }).join('');

  }

  function renderSummary(data) {
    const resumo = data?.resumo || {};
    const totalRowsRaw = data?.net_total_por_vendedor || [];
    const incrementalRowsRaw = data?.net_incremental_por_vendedor || [];

    const activeSet = quarterUiState.activeSellerKeySet;
    const filterActiveRows = (rows) => {
      if (!(activeSet instanceof Set) || activeSet.size === 0) return rows;
      return rows.filter((row) => activeSet.has(normalizeSellerKey(row?.vendedor || '')));
    };

    const totalRows = filterActiveRows(totalRowsRaw);
    const incrementalRows = filterActiveRows(incrementalRowsRaw);

    const netTotalEl = document.getElementById('qs-net-total');
    const netIncEl = document.getElementById('qs-net-incremental');
    const vendTotalEl = document.getElementById('qs-vendedores-total');
    const vendIncEl = document.getElementById('qs-vendedores-incremental');

    if (netTotalEl) netTotalEl.textContent = money(resumo.net_total || 0);
    if (netIncEl) netIncEl.textContent = money(resumo.net_incremental || 0);
    const metaTotalFiltered = totalRows.reduce((sum, row) => sum + Number(row?.meta_bdm || 0), 0);
    if (vendTotalEl) vendTotalEl.textContent = `${totalRows.length} vendedores · Meta ${money(metaTotalFiltered)}`;
    if (vendIncEl) vendIncEl.textContent = `${incrementalRows.length} vendedores · Meta ${money(metaTotalFiltered)}`;

    renderRows('qs-table-total-body', totalRows, 'total');
    renderRows('qs-table-incremental-body', incrementalRows, 'incremental');

    if (quarterDrillState.sellerName) {
      loadSellerDrilldown(quarterDrillState.sellerName, quarterDrillState.viewMode).catch(() => {});
    }
  }

  async function loadQuarterSummary() {
    if (window.execDisplayMode !== 'net') {
      const tbodyTotal = document.getElementById('qs-table-total-body');
      const tbodyInc = document.getElementById('qs-table-incremental-body');
      const msg = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted)">Disponivel apenas no modo Net Revenue.</td></tr>';
      if (tbodyTotal) tbodyTotal.innerHTML = msg;
      if (tbodyInc) tbodyInc.innerHTML = msg;
      return;
    }

    try {
      await ensureActiveSellerKeySet();
      const params = getQuarterSummaryParams();
      const url = `${window.API_BASE_URL}/api/revenue/quarter-summary${params.toString() ? '?' + params.toString() : ''}`;
      const data = await fetchJsonNoCache(url);
      renderSummary(data || {});
    } catch (error) {
      const tbodyTotal = document.getElementById('qs-table-total-body');
      const tbodyInc = document.getElementById('qs-table-incremental-body');
      const msg = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--danger)">Erro ao carregar resumo do quarter</td></tr>';
      if (tbodyTotal) tbodyTotal.innerHTML = msg;
      if (tbodyInc) tbodyInc.innerHTML = msg;
      if (typeof showToast === 'function') showToast('Falha ao carregar Resumo do Quarter.', 'warning');
    }
  }

  window.handleQuarterSellerClick = function handleQuarterSellerClick(buttonEl) {
    if (!buttonEl || !buttonEl.getAttribute) return;
    const sellerName = buttonEl.getAttribute('data-seller') || '';
    const rowViewMode = buttonEl.getAttribute('data-view') || 'total';
    loadSellerDrilldown(sellerName, rowViewMode).catch((error) => {
      console.error('[QS] Drilldown seller error:', error);
      renderSellerDrilldownError(sellerName, rowViewMode, 'Falha ao carregar linhas do vendedor.');
      if (typeof showToast === 'function') {
        showToast('Falha ao carregar drill-down do vendedor.', 'warning');
      }
    });
  };

  window.setQuarterSummaryView = setQuarterSummaryView;
  window.closeQuarterSellerDrilldown = closeQuarterSellerDrilldown;

  if (!window.__qsSellerClickDelegationBound) {
    document.addEventListener('click', function (event) {
      const targetButton = event.target && event.target.closest
        ? event.target.closest('.qs-seller-link')
        : null;
      if (!targetButton) return;
      event.preventDefault();
      if (typeof window.handleQuarterSellerClick === 'function') {
        window.handleQuarterSellerClick(targetButton);
      }
    });
    window.__qsSellerClickDelegationBound = true;
  }

  window.loadQuarterSummary = loadQuarterSummary;
  setQuarterSummaryView('total');
})();
