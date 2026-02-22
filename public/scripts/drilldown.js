/**
 * drilldown.js — Canonical drilldown module v1.0
 * Overrides window.openDrilldown with an accordion-expandable deal table.
 * Provides window._wcloudClick for word cloud item drilldowns.
 */
(function () {
  'use strict';

  /* ── Formatting helpers ─────────────────────────────────────────────── */
  function getFmt() {
    return window.fmtCurrency || function (v) {
      v = +v || 0;
      if (v >= 1e6) return 'R$\u00a0' + (v / 1e6).toFixed(1) + 'M';
      if (v >= 1e3) return 'R$\u00a0' + (v / 1e3).toFixed(1) + 'K';
      return 'R$\u00a0' + v.toFixed(0);
    };
  }

  function pct(v) { return (parseFloat(v) || 0).toFixed(0) + '%'; }

  /* ── Risk badge calculation ──────────────────────────────────────────── */
  function getRiskBadges(deal) {
    var badges = [];
    var idle  = parseFloat(deal.Idle_Dias)     || 0;
    var conf  = parseFloat(deal.Confianca)     || 0;
    var bant  = parseFloat(deal.BANT_Score)    || 0;
    var medd  = parseFloat(deal.MEDDIC_Score)  || 0;
    var ciclo = parseFloat(deal.Ciclo_dias || deal.ciclo_dias) || 0;
    if (idle  > 20)           badges.push({ label: 'Sem Atividade',   cls: 'flag-red'    });
    if (ciclo > 90)           badges.push({ label: 'Funil Longo',     cls: 'flag-orange' });
    if (conf  > 0 && conf < 40) badges.push({ label: 'Confiança Baixa', cls: 'flag-orange' });
    if (bant  > 0 && bant < 3)  badges.push({ label: 'BANT Baixo',    cls: 'flag-yellow' });
    if (medd  > 0 && medd < 3)  badges.push({ label: 'MEDDIC Baixo',  cls: 'flag-yellow' });
    return badges;
  }

  /* ── Expanded deal card renderer ────────────────────────────────────── */
  function renderDealExpanded(deal) {
    var fmtFn = getFmt();
    var src = deal._src || '';
    var srcLabel = src === 'won' ? 'Ganho' : src === 'lost' ? 'Perdido' : 'Pipeline';
    var srcCls   = src === 'won' ? 'dd-badge-won' : src === 'lost' ? 'dd-badge-lost' : 'dd-badge-pipe';

    var gross  = +(deal.Gross || deal.gross || 0);
    var net    = +(deal.Net   || deal.net   || 0);
    var margem = gross > 0 ? Math.round((net / gross) * 100) : 0;
    var conf   = parseFloat(deal.Confianca)     || 0;
    var risco  = parseFloat(deal.Risco_Score)   || 0;
    var bant   = parseFloat(deal.BANT_Score)    || 0;
    var medd   = parseFloat(deal.MEDDIC_Score)  || 0;
    var ciclo  = parseFloat(deal.Ciclo_dias || deal.ciclo_dias) || 0;
    var ativs  = parseFloat(deal.Atividades || deal.activities) || 0;
    var idle   = parseFloat(deal.Idle_Dias)     || 0;

    var opp      = deal.Oportunidade || deal.opportunityName || deal.Opportunity_Name || '—';
    var conta    = deal.Conta || deal.account || '—';
    var vendedor = deal.Vendedor || deal.seller || '—';
    var fiscalQ  = deal.fiscalQ  || deal.Fiscal_Q || '—';
    var data     = deal.Data_Fechamento || deal.closeDate || deal.Data_Prevista || '—';
    var fase     = deal.Fase_Atual || deal.stage || srcLabel;

    var vertical    = deal.Vertical_IA || '';
    var subVertical = deal.Sub_vertical_IA || '';
    var segmento    = deal.Segmento_consolidado || '';
    var estado      = deal.Estado_Provincia_de_cobranca || '';
    var portfolio   = deal.Portfolio_FDM || '';
    var tipoRes     = deal.Tipo_Resultado || '';
    var forecast    = deal.Forecast_SF || deal.Forecast_IA || '';
    var perfil      = deal.Perfil || '';

    var motivo = deal.Fatores_Sucesso || deal.Win_Reason ||
                 deal.Causa_Raiz || deal.Loss_Reason || '';

    /* badges */
    var badges = getRiskBadges(deal);
    var badgesHtml = badges.map(function (b) {
      return '<span class="risk-flag-badge ' + b.cls + '">' + b.label + '</span>';
    }).join('');

    /* scores */
    var scoreRow = '';
    if (conf || bant || medd || risco) {
      scoreRow = '<div class="deal-score-grid">' +
        (conf  ? '<div class="deal-score-item"><div class="deal-score-val">' + pct(conf) + '</div><div class="deal-score-lbl">Confiança</div></div>' : '') +
        (risco ? '<div class="deal-score-item"><div class="deal-score-val">' + risco.toFixed(1) + '/5</div><div class="deal-score-lbl">Risco</div></div>' : '') +
        (bant  ? '<div class="deal-score-item"><div class="deal-score-val">' + bant.toFixed(1)  + '/5</div><div class="deal-score-lbl">BANT</div></div>' : '') +
        (medd  ? '<div class="deal-score-item"><div class="deal-score-val">' + medd.toFixed(1)  + '/5</div><div class="deal-score-lbl">MEDDIC</div></div>' : '') +
        '</div>';
    }

    /* dimension chips */
    var dims = [
      vertical    && ('Vertical: '   + vertical),
      subVertical && ('Sub-vert: '   + subVertical),
      segmento    && ('Segmento: '   + segmento),
      estado      && ('Estado: '     + estado),
      portfolio   && ('Portfolio: '  + portfolio),
      tipoRes     && ('Tipo: '       + tipoRes),
      perfil      && ('Perfil: '     + perfil),
      forecast    && ('Forecast: '   + forecast),
    ].filter(Boolean);
    var dimsHtml = dims.length
      ? '<div class="deal-dims">' + dims.map(function (d) {
          return '<span class="deal-dim-chip">' + d + '</span>';
        }).join('') + '</div>'
      : '';

    /* meta line */
    var metaParts = [fiscalQ];
    if (data && data !== '—') metaParts.push('Fechamento: ' + data);
    if (ciclo) metaParts.push(ciclo + ' dias funil');
    if (fase !== srcLabel) metaParts.push('Fase: ' + fase);
    if (ativs) metaParts.push(ativs + ' atividades');
    if (idle)  metaParts.push(idle  + ' dias parado');

    var motivoHtml = motivo
      ? '<div class="deal-ai-note"><strong>' +
          (src === 'lost' ? 'Causa Raiz' : 'Fatores de Sucesso') +
          ':</strong> ' + motivo + '</div>'
      : '';

    var evitavel = deal.Evitavel
      ? '<span class="deal-dim-chip" style="background:rgba(239,68,68,0.15);color:#f87171;">Evitável: ' + deal.Evitavel + '</span>'
      : '';

    return '<div class="deal-expanded">' +
      '<div class="deal-exp-header">' +
        '<div class="deal-exp-title">' + opp + '</div>' +
        '<div class="deal-exp-meta">' + conta +
          ' &mdash; <span class="dd-badge ' + srcCls + '">' + srcLabel + '</span>' +
          (evitavel ? ' ' + evitavel : '') +
        '</div>' +
        '<div class="deal-exp-meta dim">' + vendedor + '</div>' +
        '<div class="deal-exp-meta dim">' + metaParts.join(' &bull; ') + '</div>' +
      '</div>' +
      '<div class="deal-exp-financials">' +
        '<div class="deal-fin-item"><div class="deal-fin-val">' + fmtFn(gross) + '</div><div class="deal-fin-lbl">Gross</div></div>' +
        '<div class="deal-fin-item"><div class="deal-fin-val">' + fmtFn(net) + '</div><div class="deal-fin-lbl">Net</div></div>' +
        (margem ? '<div class="deal-fin-item"><div class="deal-fin-val">' + margem + '%</div><div class="deal-fin-lbl">Margem</div></div>' : '') +
      '</div>' +
      scoreRow +
      dimsHtml +
      (badges.length ? '<div class="deal-risk-badges">' + badgesHtml + '</div>' : '') +
      motivoHtml +
    '</div>';
  }

  /* ── Canonical openDrilldown ────────────────────────────────────────── */
  function openDealDrilldown(title, items, extraCols) {
    var m = document.getElementById('chart-drilldown-modal');
    var o = document.getElementById('chart-drilldown-overlay');
    if (!m) return;

    var sorted = (items || []).slice().sort(function (a, b) {
      return (+(b.Gross || b.gross || 0)) - (+(a.Gross || a.gross || 0));
    });

    var fmtFn  = getFmt();
    var totGross = sorted.reduce(function (s, d) { return s + (+(d.Gross || d.gross || 0)); }, 0);
    var totNet   = sorted.reduce(function (s, d) { return s + (+(d.Net   || d.net   || 0)); }, 0);
    var totWon   = sorted.filter(function (d) { return d._src === 'won';  }).length;
    var totLost  = sorted.filter(function (d) { return d._src === 'lost'; }).length;
    var totPipe  = sorted.filter(function (d) { return d._src === 'pipe'; }).length;

    var filterLabel = (function () {
      var f = window.currentFilters || {};
      var parts = [];
      if (f.year)   parts.push(f.year);
      if (f.quarter) parts.push(f.quarter);
      if (f.seller)  parts.push(f.seller.split(',').length > 1 ? f.seller.split(',').length + ' vendedores' : f.seller);
      return parts.length ? ' | ' + parts.join(' ') : '';
    })();

    var titleEl = document.getElementById('chart-dd-title');
    var subEl   = document.getElementById('chart-dd-subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = sorted.length + ' deals' + filterLabel;

    var stats = '<div class="dd-totals">' +
      '<div class="dd-stat"><div class="dd-stat-v">' + fmtFn(totGross) + '</div><div class="dd-stat-l">Gross Total</div></div>' +
      (totNet  ? '<div class="dd-stat"><div class="dd-stat-v">'                          + fmtFn(totNet)  + '</div><div class="dd-stat-l">Net Total</div></div>'   : '') +
      (totPipe ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-pipe">'  + totPipe        + '</div><div class="dd-stat-l">Pipeline</div></div>'     : '') +
      (totWon  ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-won">'   + totWon         + '</div><div class="dd-stat-l">Ganhos</div></div>'       : '') +
      (totLost ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-lost">'  + totLost        + '</div><div class="dd-stat-l">Perdidos</div></div>'     : '') +
      '</div>';

    var rows = sorted.map(function (d, i) {
      var src      = d._src || '';
      var srcCls   = src === 'won' ? 'dd-badge-won' : src === 'lost' ? 'dd-badge-lost' : 'dd-badge-pipe';
      var srcLabel = src === 'won' ? 'Ganho' : src === 'lost' ? 'Perdido' : 'Pipeline';
      var opp    = d.Oportunidade || d.opportunityName || d.Opportunity_Name || '—';
      var seller = d.Vendedor || d.seller || '—';
      var gross  = +(d.Gross || d.gross || 0);
      var net    = +(d.Net   || d.net   || 0);
      var fase   = d.Fase_Atual || d.stage || srcLabel;
      var data   = d.Data_Fechamento || d.closeDate || d.Data_Prevista || '—';

      return '<tr class="deal-row" data-idx="' + i + '" onclick="window._ddExpandRow(this,' + i + ')">' +
        '<td class="dd-opp-col">' + opp + '</td>' +
        '<td>' + seller + '</td>' +
        '<td>' + fmtFn(gross) + '</td>' +
        '<td>' + fmtFn(net) + '</td>' +
        '<td><span class="dd-badge ' + srcCls + '">' + fase + '</span></td>' +
        '<td>' + data + '</td>' +
        '</tr>' +
        '<tr class="deal-exp-row" id="deal-exp-' + i + '" style="display:none">' +
          '<td colspan="6" class="deal-exp-cell"></td>' +
        '</tr>';
    }).join('');

    var thead = '<tr><th>Oportunidade</th><th>Vendedor</th><th>Gross</th><th>Net</th><th>Fase</th><th>Data</th></tr>';

    var bodyEl = document.getElementById('chart-dd-body');
    if (bodyEl) {
      bodyEl.innerHTML = stats +
        '<table class="dd-table"><thead>' + thead + '</thead><tbody>' + rows + '</tbody></table>';
    }

    m._ddItems = sorted;
    m.classList.add('open');
    o.classList.add('open');
  }

  window.openDealDrilldown = openDealDrilldown;
  window.openDrilldown = openDealDrilldown;

  /* ── Row accordion expansion ────────────────────────────────────────── */
  window._ddExpandRow = function (tr, idx) {
    var m      = document.getElementById('chart-drilldown-modal');
    var expRow = document.getElementById('deal-exp-' + idx);
    if (!expRow) return;

    var isOpen = expRow.style.display !== 'none';

    // Close all
    m.querySelectorAll('.deal-exp-row').forEach(function (r) { r.style.display = 'none'; });
    m.querySelectorAll('.deal-row').forEach(function (r) { r.classList.remove('expanded'); });

    if (!isOpen) {
      var deal = m._ddItems && m._ddItems[idx];
      if (!deal) return;
      var cell = expRow.querySelector('.deal-exp-cell');
      if (cell) cell.innerHTML = renderDealExpanded(deal);
      expRow.style.display = '';
      tr.classList.add('expanded');
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  /* ── closeChartDrilldown (alias) ────────────────────────────────────── */
  window.closeChartDrilldown = function () {
    var m = document.getElementById('chart-drilldown-modal');
    var o = document.getElementById('chart-drilldown-overlay');
    if (m) m.classList.remove('open');
    if (o) o.classList.remove('open');
    if (m) m._ddItems = null;
  };

  /* ── Word cloud click handler ────────────────────────────────────────── */
  window._wcloudClick = function (span) {
    var label = span.getAttribute('data-wlabel');
    if (!label) return;

    // Walk up DOM to find container with _drillContext
    var node = span.parentElement;
    while (node && !node._drillContext) node = node.parentElement;
    if (!node || !node._drillContext) return;

    var ctx   = node._drillContext;
    var field = ctx.field;
    var data  = (ctx.data || []).slice();
    var lc    = label.toLowerCase();

    var filtered = data.filter(function (d) {
      var primary = String(d[field] || '').toLowerCase();
      if (primary && (primary === lc || primary.indexOf(lc) !== -1)) return true;

      // Fallback broad text-search for resilience across heterogeneous datasets
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
      filtered = data.slice(0, 100).map(function (d) { return Object.assign({ _src: ctx.src || 'won' }, d); });
    }

    if (typeof window.openDealDrilldown === 'function') {
      window.openDealDrilldown(label + (ctx.title ? ' \u2014 ' + ctx.title : ''), filtered);
    }
  };

})();
