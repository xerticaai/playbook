// graficos.js — Chart.js dimensional analytics v4
// Features: solid colors, rich tooltips (value+%+qty), drill-down modal, trend line, filter-reactive
(function () {
  'use strict';

  var C = {
    cyan:    { s: '#33B6E8', bg: 'rgba(51,182,232,0.72)',  b: '#33B6E8' },
    green:   { s: '#5B9B6F', bg: 'rgba(91,155,111,0.72)',  b: '#5B9B6F' },
    red:     { s: '#C65A64', bg: 'rgba(198,90,100,0.72)',  b: '#C65A64' },
    orange:  { s: '#C98752', bg: 'rgba(201,135,82,0.72)',  b: '#C98752' },
    warning: { s: '#B88740', bg: 'rgba(184,135,64,0.72)',  b: '#B88740' },
    purple:  { s: '#8E7ACD', bg: 'rgba(142,122,205,0.72)', b: '#8E7ACD' },
    pink:    { s: '#B66AAE', bg: 'rgba(182,106,174,0.72)', b: '#B66AAE' },
    teal:    { s: '#4B9E97', bg: 'rgba(75,158,151,0.72)',  b: '#4B9E97' },
    indigo:  { s: '#7079C8', bg: 'rgba(112,121,200,0.72)', b: '#7079C8' },
    muted:   { s: '#7B8798', bg: 'rgba(123,135,152,0.56)', b: '#7B8798' },
  };

  var PALETTE = [C.cyan, C.green, C.orange, C.purple, C.red, C.warning, C.teal, C.pink, C.indigo, C.muted];

  // Gradient fill factory — horiz = left→right (indexAxis:'y'), else top→bottom
  function gradBg(color, horiz) {
    return function (context) {
      var chart = context.chart;
      var ca    = chart.chartArea;
      if (!ca) return color.bg;
      var ctx   = chart.ctx;
      var m     = color.bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      var rgb   = m ? (m[1]+','+m[2]+','+m[3]) : '128,128,128';
      var g     = horiz
        ? ctx.createLinearGradient(ca.left, 0, ca.right, 0)
        : ctx.createLinearGradient(0, ca.top, 0, ca.bottom);
      g.addColorStop(0, 'rgba(' + rgb + ',0.92)');
      g.addColorStop(1, 'rgba(' + rgb + ',0.13)');
      return g;
    };
  }

  var instances = {};
  function kill(id) { if (instances[id]) { instances[id].destroy(); delete instances[id]; } }

  function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }
  function th() {
    var l = isLight();
    return { txt: l ? '#334155' : '#94a3b8', grid: l ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)', font: "'Poppins','Roboto',sans-serif" };
  }

  function fmt(v) {
    if (v == null || isNaN(v)) return 'R$0';
    var abs = Math.abs(v);
    if (abs >= 1e6) return 'R$' + (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return 'R$' + (v / 1e3).toFixed(0) + 'k';
    return 'R$' + Math.round(v);
  }
  function fmtPct(p, t) { return (!t ? '0' : ((p / t) * 100).toFixed(1)) + '%'; }

  function scalesH() { // horizontal bar (indexAxis:'y')
    var t = th();
    return {
      x: { ticks: { color: t.txt, font: { family: t.font, size: 11 }, callback: fmt }, grid: { color: t.grid, borderDash: [4, 4] } },
      y: { ticks: { color: t.txt, font: { family: t.font, size: 12 }, maxTicksLimit: 14 }, grid: { color: 'transparent' } }
    };
  }
  function scalesV() { // vertical bar
    var t = th();
    return {
      y: { ticks: { color: t.txt, font: { family: t.font, size: 11 }, callback: fmt }, grid: { color: t.grid, borderDash: [4, 4] } },
      x: { ticks: { color: t.txt, font: { family: t.font, size: 12 } }, grid: { color: 'transparent' } }
    };
  }
  function leg(pos) {
    var t = th();
    return {
      position: pos || 'top',
      labels: {
        color: t.txt, font: { family: t.font, size: 11 },
        boxWidth: 8, boxHeight: 8, padding: 12,
        usePointStyle: true, pointStyle: 'circle'
      }
    };
  }

  // Rich tooltip: value + % of total + deal count
  function richTip(countMaps, totals) {
    return { callbacks: { label: function (ctx) {
      var val   = ctx.raw || 0;
      var cm    = countMaps && countMaps[ctx.datasetIndex];
      var entry = cm && cm[ctx.label];
      var cnt   = entry ? entry.count : null;
      var tot   = totals ? totals[ctx.datasetIndex] : null;
      var pct   = (tot) ? fmtPct(val, tot) : null;
      var out   = [' ' + ctx.dataset.label + ': ' + fmt(val)];
      if (pct) out.push(' ' + pct + ' do total');
      if (cnt != null) out.push(' ' + cnt + ' deal' + (cnt !== 1 ? 's' : ''));
      return out;
    }}};
  }

  // ── groupBy ────────────────────────────────────────────────────────────
  function groupBy(arr, getter) {
    var map = {};
    arr.forEach(function (d) {
      var k = (getter(d) || '').trim() || '(Sem categoria)';
      if (!map[k]) map[k] = { gross: 0, net: 0, count: 0 };
      map[k].gross += +(d.Gross || d.gross || d.val || 0);
      map[k].net   += +(d.Net   || d.net   || 0);
      map[k].count++;
    });
    return map;
  }
  function topKeys(map, max) {
    return Object.keys(map)
      .filter(function (k) { return k !== '(Sem categoria)' && k.trim(); })
      .sort(function (a, b) { return map[b].gross - map[a].gross; })
      .slice(0, max || 12);
  }
  function mergeKeys(maps, max) {
    var tot = {};
    maps.forEach(function (m) { Object.keys(m).forEach(function (k) { tot[k] = (tot[k] || 0) + (m[k] ? m[k].gross : 0); }); });
    return Object.keys(tot).filter(function (k) { return k !== '(Sem categoria)' && k.trim(); })
      .sort(function (a, b) { return tot[b] - tot[a]; }).slice(0, max || 12);
  }

  function showEmpty(canvas, msg) {
    var ctx = canvas.getContext('2d'); var t = th();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = t.txt; ctx.font = '13px ' + t.font; ctx.textAlign = 'center';
    ctx.fillText(msg || 'Sem dados para o período', canvas.width / 2, (canvas.height || 200) / 2);
  }

  function allDealsWithSrc() {
    return (window.pipelineDataRaw||[]).map(function(d){return Object.assign({_src:'pipe'},d);})
      .concat((window.wonAgg||[]).map(function(d){return Object.assign({_src:'won'},d);} ))
      .concat((window.lostAgg||[]).map(function(d){return Object.assign({_src:'lost'},d);}));
  }

  function toggleChartFullscreen(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var card = canvas.closest('.card');
    if (!card || !card.requestFullscreen) return;

    if (document.fullscreenElement === card) {
      document.exitFullscreen && document.exitFullscreen();
      return;
    }
    card.requestFullscreen();
  }

  function installChartExpandButtons() {
    document.querySelectorAll('#view-graficos .chart-wrapper canvas').forEach(function(canvas) {
      var card = canvas.closest('.card');
      if (!card || card.dataset.expandBtnReady === '1') return;
      card.dataset.expandBtnReady = '1';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-expand-btn';
      btn.textContent = 'Expandir';
      btn.addEventListener('click', function(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        toggleChartFullscreen(canvas.id);
      });
      card.appendChild(btn);
    });
  }

  window.chartCategoryState = window.chartCategoryState || { fase: true, seg: true, geo: true };

  function applyCategoryState(cat) {
    var expanded = window.chartCategoryState[cat] !== false;
    document.querySelectorAll('.chart-group-' + cat).forEach(function(el) {
      el.style.display = expanded ? '' : 'none';
    });
    var btn = document.getElementById('toggle-cat-' + cat);
    if (btn) btn.textContent = expanded ? 'Suspender' : 'Expandir';
  }

  window.toggleChartCategory = function(cat) {
    if (!cat) return;
    var state = window.chartCategoryState || {};
    state[cat] = !(state[cat] !== false);
    window.chartCategoryState = state;
    applyCategoryState(cat);
  };

  function initChartCategoryToggles() {
    ['fase', 'seg', 'geo'].forEach(applyCategoryState);
  }

  // ── Active filter label ────────────────────────────────────────────────
  function filterLabel() {
    var f = window.currentFilters || {};
    var parts = [];
    if (f.year) parts.push(f.year);
    if (f.quarter) parts.push(f.quarter);
    if (f.seller) parts.push(f.seller.split(',').length > 1 ? f.seller.split(',').length + ' vendedores' : f.seller);
    return parts.length ? ' | Filtro: ' + parts.join(' ') : ' | Todos os períodos';
  }

  // ── Drill-down modal ───────────────────────────────────────────────────
  window.closeChartDrilldown = function () {
    var m = document.getElementById('chart-drilldown-modal');
    var o = document.getElementById('chart-drilldown-overlay');
    if (m) m.classList.remove('open');
    if (o) o.classList.remove('open');
  };

  function openDrilldown(title, items, extraCols) {
    // Delegate to canonical drilldown module if available
    if (typeof window.openDealDrilldown === 'function') {
      return window.openDealDrilldown(title, items, extraCols);
    }
    if (typeof window.openDrilldown === 'function') {
      return window.openDrilldown(title, items, extraCols);
    }
    var m = document.getElementById('chart-drilldown-modal');
    var o = document.getElementById('chart-drilldown-overlay');
    if (!m) return;

    // Sort by gross desc
    var sorted = items.slice().sort(function (a, b) {
      return (+(b.Gross||b.gross||0)) - (+(a.Gross||a.gross||0));
    });

    var totGross = sorted.reduce(function(s,d){ return s+(+(d.Gross||d.gross||0)); }, 0);
    var totNet   = sorted.reduce(function(s,d){ return s+(+(d.Net||d.net||0)); }, 0);
    var totWon   = sorted.filter(function(d){ return d._src === 'won'; }).length;
    var totLost  = sorted.filter(function(d){ return d._src === 'lost'; }).length;
    var totPipe  = sorted.filter(function(d){ return d._src === 'pipe'; }).length;

    document.getElementById('chart-dd-title').textContent = title;
    document.getElementById('chart-dd-subtitle').textContent =
      sorted.length + ' deals' + filterLabel();

    var stats = '<div class="dd-totals">' +
      '<div class="dd-stat"><div class="dd-stat-v">' + fmt(totGross) + '</div><div class="dd-stat-l">Gross Total</div></div>' +
      (totNet ? '<div class="dd-stat"><div class="dd-stat-v">' + fmt(totNet) + '</div><div class="dd-stat-l">Net Total</div></div>' : '') +
      (totPipe ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-pipe">' + totPipe + '</div><div class="dd-stat-l">Pipeline</div></div>' : '') +
      (totWon  ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-won">'  + totWon  + '</div><div class="dd-stat-l">Ganhos</div></div>' : '') +
      (totLost ? '<div class="dd-stat"><div class="dd-stat-v dd-badge dd-badge-lost">' + totLost + '</div><div class="dd-stat-l">Perdidos</div></div>' : '') +
      '</div>';

    var defaultCols = [
      { h: 'Oportunidade', fn: function(d){ return d.Oportunidade || d.opportunityName || d.Opportunity_Name || '—'; } },
      { h: 'Vendedor',     fn: function(d){ return d.Vendedor || d.seller || '—'; } },
      { h: 'Gross',        fn: function(d){ return fmt(+(d.Gross||d.gross||0)); } },
      { h: 'Net',          fn: function(d){ return fmt(+(d.Net||d.net||0)); } },
      { h: 'Fase/Status',  fn: function(d){
          var s = d.Fase_Atual || d.stage || d.Status || '';
          var cls = d._src === 'won' ? 'dd-badge-won' : d._src === 'lost' ? 'dd-badge-lost' : 'dd-badge-pipe';
          return '<span class="dd-badge ' + cls + '">' + (s || (d._src === 'won' ? 'Ganho' : d._src === 'lost' ? 'Perdido' : 'Pipeline')) + '</span>';
      }},
      { h: 'Data',         fn: function(d){ return d.Data_Fechamento || d.closeDate || d.Data_Prevista || '—'; } },
    ];
    var cols = extraCols ? defaultCols.concat(extraCols) : defaultCols;

    var rows = sorted.map(function(d) {
      return '<tr>' + cols.map(function(c){ return '<td>' + c.fn(d) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var thead = '<tr>' + cols.map(function(c){ return '<th>' + c.h + '</th>'; }).join('') + '</tr>';

    document.getElementById('chart-dd-body').innerHTML = stats +
      '<table class="dd-table"><thead>' + thead + '</thead><tbody>' + rows + '</tbody></table>';

    m.classList.add('open');
    o.classList.add('open');
  }

  // Make a click handler for grouped (Pipeline+Won+Lost) dimension charts
  function makeDimClick(pipeArr, wonArr, lostArr, getter) {
    return function (evt, elements, chart) {
      if (!elements || !elements.length) return;
      var label = chart.data.labels[elements[0].index];
      if (!label) return;
      var norm = label.toString().trim();
      var items = [];
      (pipeArr || []).forEach(function(d){ if ((getter(d)||'').trim() === norm) items.push(Object.assign({_src:'pipe'}, d)); });
      (wonArr  || []).forEach(function(d){ if ((getter(d)||'').trim() === norm) items.push(Object.assign({_src:'won'},  d)); });
      (lostArr || []).forEach(function(d){ if ((getter(d)||'').trim() === norm) items.push(Object.assign({_src:'lost'}, d)); });
      openDrilldown('Drill-down: ' + norm, items);
    };
  }

  // ── 1. Pipeline por Fase (Pipeline + Won + Lost) ──────────────────────────────────────────────
  function buildPorFase() {
    tripleBar('chart-por-fase', 'por-fase',
      function(d){ return d.Fase_Atual || d.stage || ''; }, 14);
  }

  // ── 2. Win vs Loss ────────────────────────────────────────────────────
  function buildWinLoss() {
    var canvas = document.getElementById('chart-winloss'); if (!canvas) return;
    kill('winloss');
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];
    var wG = won.reduce(function(s,d){return s+(+(d.Gross||d.gross||0));},0);
    var wN = won.reduce(function(s,d){return s+(+(d.Net||d.net||0));},0);
    var lG = lost.reduce(function(s,d){return s+(+(d.Gross||d.gross||0));},0);
    var lN = lost.reduce(function(s,d){return s+(+(d.Net||d.net||0));},0);
    instances['winloss'] = new Chart(canvas, {
      type: 'bar',
      data: { labels: ['Ganhos (' + won.length + ')', 'Perdidos (' + lost.length + ')'], datasets: [
        { label: 'Gross', data: [wG,lG], backgroundColor:['rgba(91,155,111,0.88)','rgba(198,90,100,0.88)'],  borderColor:[C.green.b,C.red.b],   borderWidth:1.5, borderRadius:8 },
        { label: 'Net',   data: [wN,lN], backgroundColor:['rgba(51,182,232,0.88)','rgba(201,135,82,0.88)'],  borderColor:[C.cyan.b,C.orange.b], borderWidth:1.5, borderRadius:8 }
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend: leg(),
          barDatalabels: {
            display: true,
            formatter: function(val, j, pct) {
              // Show both % of total gross and the formatted value
              var tot = wG + lG;
              return (tot ? ((val/tot)*100).toFixed(0)+'%' : '');
            }
          },
          tooltip: { callbacks: { label: function(ctx) {
            var src = ctx.dataIndex===0 ? won : lost;
            var tot = wG+lG;
            return [' '+ctx.dataset.label+': '+fmt(ctx.raw), ' '+fmtPct(ctx.raw,tot)+' do total', ' '+src.length+' deals'];
          }}}
        },
        scales: scalesV(),
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var isWon = elements[0].index === 0;
          var src = isWon ? won : lost;
          var tag = isWon ? 'won' : 'lost';
          var items = src.map(function(d){ return Object.assign({_src:tag},d); });
          openDrilldown(isWon ? 'Deals Ganhos' : 'Deals Perdidos', items);
        }
      }
    });
  }

  // ── Triple-bar builder ────────────────────────────────────────────────
  function tripleBar(canvasId, instKey, getter, maxKeys, colorSet) {
    var canvas = document.getElementById(canvasId); if (!canvas) return;
    kill(instKey);
    var pipe = window.pipelineDataRaw || [];
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];
    var mP = groupBy(pipe, getter);
    var mW = groupBy(won,  getter);
    var mL = groupBy(lost, getter);
    var labels = mergeKeys([mP,mW,mL], maxKeys||12); if (!labels.length) { showEmpty(canvas, 'Dados não disponíveis'); return; }
    var cs = colorSet || [C.cyan, C.green, C.red];
    var totP = labels.reduce(function(s,l){return s+(mP[l]?mP[l].gross:0);},0);
    var totW = labels.reduce(function(s,l){return s+(mW[l]?mW[l].gross:0);},0);
    var totL = labels.reduce(function(s,l){return s+(mL[l]?mL[l].gross:0);},0);
    instances[instKey] = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label:'Pipeline ('+pipe.length+')', data:labels.map(function(l){return (mP[l]||{gross:0}).gross;}), backgroundColor:gradBg(cs[0],true), borderColor:cs[0].b, borderWidth:1.5, borderRadius:5 },
        { label:'Won ('    +won.length  +')', data:labels.map(function(l){return (mW[l]||{gross:0}).gross;}), backgroundColor:gradBg(cs[1],true), borderColor:cs[1].b, borderWidth:1.5, borderRadius:5 },
        { label:'Lost ('   +lost.length +')', data:labels.map(function(l){return (mL[l]||{gross:0}).gross;}), backgroundColor:gradBg(cs[2],true), borderColor:cs[2].b, borderWidth:1.5, borderRadius:5 }
      ]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins: {
          legend: leg(),
          tooltip: richTip([mP,mW,mL],[totP,totW,totL]),
          barDatalabels: { display: true }
        },
        scales: scalesH(),
        onClick: makeDimClick(pipe, won, lost, getter)
      }
    });
  }

  // ── 3. Vertical IA ───────────────────────────────────────────────────
  function buildVertical() {
    tripleBar('chart-vertical','vertical',
      function(d){return d.Vertical_IA||d.vertical||'';}, 12);
  }

  // ── 4. Sub-Vertical IA ───────────────────────────────────────────────
  function buildSubVertical() {
    tripleBar('chart-sub-vertical','sub-vertical',
      function(d){return d.Sub_vertical_IA||d.sub_vertical||'';}, 12);
  }

  // ── 5. Portfolio FDM — doughnut ──────────────────────────────────────
  function buildPortfolioFDM() {
    var canvas = document.getElementById('chart-portfolio-fdm'); if (!canvas) return;
    kill('portfolio-fdm');
    var all = allDealsWithSrc();
    var getP = function(d){return d.Portfolio_FDM||d.portfolio||'';};
    var m = groupBy(all, getP);
    var labels = topKeys(m, 10); if (!labels.length) { showEmpty(canvas, 'Portfolio FDM não disponível'); return; }
    var t = th(); var tot = labels.reduce(function(s,l){return s+m[l].gross;},0);
    instances['portfolio-fdm'] = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: labels.map(function(l){return m[l].gross;}),
          backgroundColor: PALETTE.map(function(c){return c.bg;}), borderColor: PALETTE.map(function(c){return c.s;}), borderWidth:1.5, hoverOffset:18, spacing:2 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'58%',
        plugins: {
          legend: { position:'bottom', labels:{ color:t.txt, font:{family:t.font,size:10}, boxWidth:8, boxHeight:8, padding:8, usePointStyle:true, pointStyle:'circle' } },
          arcLabels: { display: true },
          tooltip: { callbacks: { label: function(ctx) {
            var pct = fmtPct(ctx.raw, tot); var cnt = m[ctx.label]?m[ctx.label].count:0;
            return [' '+ctx.label+': '+fmt(ctx.raw),' '+pct+' do total',' '+cnt+' deals'];
          }}}
        },
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var label = chart.data.labels[elements[0].index]; if (!label) return;
          var norm = label.trim();
          // Considera Portfolio_FDM e Portfolio (ambas as colunas)
          var items = all.filter(function(d){ return (d.Portfolio_FDM||d.Portfolio||d.portfolio||'').trim()===norm; });
          openDrilldown('Portfolio FDM: ' + norm, items);
        }
      }
    });
  }

  // ── 5b. Portfolio (categorias reais do schema) ──────────────────────
  function buildPortfolioVersao() {
    var canvas = document.getElementById('chart-portfolio-versao'); if (!canvas) return;
    kill('portfolio-versao');
    var pipe = window.pipelineDataRaw || [];
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];

    function portfolioLabel(d) {
      // Lê Portfolio_FDM primeiro; fallback para Portfolio (coluna original)
      var raw = d.Portfolio_FDM || d.Portfolio || d.portfolio || '';
      var txt = String(raw || '').trim();
      if (!txt) return 'Sem portfólio';
      var low = txt.toLowerCase();

      if (low.indexOf('fdm') !== -1 && low.indexOf('gis') !== -1) return 'FDM + GIS';
      if (low === 'fdm') return 'FDM';
      if (low.indexOf('plataforma') !== -1) return 'Plataforma';
      if (low.indexOf('service') !== -1) return 'Services';
      if (low.indexOf('acelerador') !== -1) return 'Outros Aceleradores';
      if (low.indexOf('carreira') !== -1) return 'Carreira';
      if (low.indexOf('outro') !== -1) return 'Outros Portfólios';
      return txt;
    }

    var mP = groupBy(pipe, portfolioLabel);
    var mW = groupBy(won,  portfolioLabel);
    var mL = groupBy(lost, portfolioLabel);
    var labels = mergeKeys([mP, mW, mL], 8);

    if (!labels.length) {
      showEmpty(canvas, 'Portfólio não disponível');
      return;
    }

    var totP = labels.reduce(function(s,l){return s + (mP[l] ? mP[l].gross : 0);},0);
    var totW = labels.reduce(function(s,l){return s + (mW[l] ? mW[l].gross : 0);},0);
    var totL = labels.reduce(function(s,l){return s + (mL[l] ? mL[l].gross : 0);},0);

    instances['portfolio-versao'] = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label:'Pipeline', data:labels.map(function(l){return (mP[l]||{gross:0}).gross;}), backgroundColor:gradBg(C.warning,true), borderColor:C.warning.b, borderWidth:1.5, borderRadius:5 },
        { label:'Won',      data:labels.map(function(l){return (mW[l]||{gross:0}).gross;}), backgroundColor:gradBg(C.green,true),   borderColor:C.green.b,   borderWidth:1.5, borderRadius:5 },
        { label:'Lost',     data:labels.map(function(l){return (mL[l]||{gross:0}).gross;}), backgroundColor:gradBg(C.red,true),     borderColor:C.red.b,     borderWidth:1.5, borderRadius:5 }
      ]},
      options: {
        // Horizontal: labels longos ficam legíveis no eixo Y
        indexAxis: 'y',
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend: leg(),
          tooltip: richTip([mP,mW,mL],[totP,totW,totL]),
          barDatalabels: { display: true }
        },
        scales: scalesH(),
        onClick: makeDimClick(pipe, won, lost, portfolioLabel)
      }
    });
  }

  // ── 5c. Forecast SF — doughnut (Pipeline + Won + Lost) ───────────────
  function buildForecastSF() {
    var canvas = document.getElementById('chart-forecast-sf'); if (!canvas) return;
    kill('forecast-sf');
    var all = allDealsWithSrc();
    if (!all.length) { showEmpty(canvas, 'Sem dados'); return; }

    var ORDER = ['Commit','Upside','Best Case','Pipeline','Não Definido'];
    var COLORS = { 'Commit': C.green, 'Upside': C.cyan, 'Best Case': C.teal, 'Pipeline': C.purple, 'Não Definido': C.muted };

    var m = groupBy(all, function(d) { return d.Forecast_SF || d.forecast_sf || 'Não Definido'; });
    var inOrder = ORDER.filter(function(k) { return m[k] && m[k].count > 0; });
    var extra   = topKeys(m,10).filter(function(k) { return ORDER.indexOf(k) === -1; });
    var labels  = inOrder.concat(extra);
    if (!labels.length) { showEmpty(canvas, 'Forecast SF não disponível'); return; }

    var t = th();
    var tot = labels.reduce(function(s,l){ return s+(m[l]?m[l].gross:0); },0);

    instances['forecast-sf'] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: labels.map(function(l){ return m[l] ? m[l].gross : 0; }),
          backgroundColor: labels.map(function(l){ return (COLORS[l]||C.orange).bg; }),
          borderColor:     labels.map(function(l){ return (COLORS[l]||C.orange).s; }),
          borderWidth: 1.5, hoverOffset: 18, spacing: 2
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'56%',
        plugins: {
          legend: { position:'bottom', labels:{ color:t.txt, font:{family:t.font,size:10}, boxWidth:8, boxHeight:8, padding:8, usePointStyle:true, pointStyle:'circle' } },
          arcLabels: { display: true },
          tooltip: { callbacks: { label: function(ctx) {
            var cnt = m[ctx.label] ? m[ctx.label].count : 0;
            var srcBreak = '';
            var pipeC = all.filter(function(d){ return (d.Forecast_SF||d.forecast_sf||'Não Definido')===ctx.label && d._src==='pipe'; }).length;
            var wonC  = all.filter(function(d){ return (d.Forecast_SF||d.forecast_sf||'Não Definido')===ctx.label && d._src==='won';  }).length;
            var lostC = all.filter(function(d){ return (d.Forecast_SF||d.forecast_sf||'Não Definido')===ctx.label && d._src==='lost'; }).length;
            return [' '+ctx.label+': '+fmt(ctx.raw), ' '+fmtPct(ctx.raw,tot)+' do total', ' Pipeline: '+pipeC+' · Won: '+wonC+' · Lost: '+lostC];
          }}}
        },
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var label = chart.data.labels[elements[0].index]; if (!label) return;
          var norm = label.trim();
          var items = all.filter(function(d) {
            return (d.Forecast_SF||d.forecast_sf||'Não Definido').trim() === norm;
          });
          openDrilldown('Forecast SF: ' + norm, items);
        }
      }
    });
  }

  // ── 5d. Win Rate por Vendedor ─────────────────────────────────────────
  function buildWinRateVendedor() {
    var canvas = document.getElementById('chart-winrate-vendedor'); if (!canvas) return;
    kill('winrate-vendedor');
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];

    // Agrega wins/losses por vendedor
    var sellers = {};
    won.forEach(function(d) {
      var s = d.Vendedor || d.seller || 'N/A';
      if (!sellers[s]) sellers[s] = { wins:0, losses:0, wG:0, lG:0 };
      sellers[s].wins++;
      sellers[s].wG += +(d.Gross||d.gross||0);
    });
    lost.forEach(function(d) {
      var s = d.Vendedor || d.seller || 'N/A';
      if (!sellers[s]) sellers[s] = { wins:0, losses:0, wG:0, lG:0 };
      sellers[s].losses++;
      sellers[s].lG += +(d.Gross||d.gross||0);
    });

    // Mínimo 2 deals totais; ordena por win rate desc
    var keys = Object.keys(sellers).filter(function(s){ return sellers[s].wins + sellers[s].losses >= 2; });
    keys.sort(function(a,b) {
      var rA = sellers[a].wins / (sellers[a].wins + sellers[a].losses);
      var rB = sellers[b].wins / (sellers[b].wins + sellers[b].losses);
      return rB - rA;
    });
    keys = keys.slice(0, 15);

    if (!keys.length) { showEmpty(canvas, 'Sem dados de conversão por vendedor'); return; }

    var rates = keys.map(function(s) {
      return +((sellers[s].wins / (sellers[s].wins + sellers[s].losses)) * 100).toFixed(1);
    });
    var t = th();

    instances['winrate-vendedor'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [{
          label: 'Win Rate (%)',
          data: rates,
          backgroundColor: rates.map(function(r){ return r>=60 ? C.green.bg : r>=40 ? C.warning.bg : C.red.bg; }),
          borderColor:     rates.map(function(r){ return r>=60 ? C.green.b  : r>=40 ? C.warning.b  : C.red.b;  }),
          borderWidth: 1.5, borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          barDatalabels: {
            display: true,
            formatter: function(v) { return v + '%'; }
          },
          tooltip: { callbacks: { label: function(ctx) {
            var s  = sellers[keys[ctx.dataIndex]];
            var tot = s.wins + s.losses;
            return [
              ' Win Rate: ' + ctx.raw + '%',
              ' Ganhos: '  + s.wins + ' / ' + tot + ' deals',
              ' Gross Won: ' + fmt(s.wG)
            ];
          }}}
        },
        scales: {
          x: { min:0, max:100, ticks:{ color:t.txt, font:{family:t.font,size:11}, callback:function(v){return v+'%';} }, grid:{color:t.grid} },
          y: { ticks:{ color:t.txt, font:{family:t.font,size:11}, maxTicksLimit:15 }, grid:{color:'transparent'} }
        },
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var seller = chart.data.labels[elements[0].index]; if (!seller) return;
          var items = [];
          won.forEach(function(d){ if ((d.Vendedor||d.seller||'N/A')===seller) items.push(Object.assign({_src:'won'},d)); });
          lost.forEach(function(d){ if ((d.Vendedor||d.seller||'N/A')===seller) items.push(Object.assign({_src:'lost'},d)); });
          openDrilldown('Conversão: ' + seller, items);
        }
      }
    });
  }

  // ── 6. Estado — Brazil Choropleth Map ───────────────────────────────
  function buildEstado() {
    var canvas = document.getElementById('chart-estado'); if (!canvas) return;
    kill('estado');
    var pipe = window.pipelineDataRaw || [];
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];
    var getE = function(d) {
      var v = d.Estado_Provincia_de_cobranca||d.estado||d.Estado_Cidade_Detectado||'';
      var mx = v.match(/[/\-\s]+([A-Z]{2})(\s*[-/].*)?$/);
      return mx ? mx[1] : (/^[A-Z]{2}$/.test(v.trim()) ? v.trim() : v.trim());
    };

    // Fallback: use bar chart if geo plugin not loaded
    if (!window.topojson || !window.ChartGeo) {
      tripleBar('chart-estado','estado', getE, 14, [C.indigo, C.green, C.red]);
      return;
    }

    var BR = {
      AC:'Acre', AL:'Alagoas', AP:'Amap\u00e1', AM:'Amazonas', BA:'Bahia',
      CE:'Cear\u00e1', DF:'Distrito Federal', ES:'Esp\u00edrito Santo', GO:'Goi\u00e1s',
      MA:'Maranh\u00e3o', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais',
      PA:'Par\u00e1', PB:'Para\u00edba', PR:'Paran\u00e1', PE:'Pernambuco', PI:'Piau\u00ed',
      RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul',
      RO:'Rond\u00f4nia', RR:'Roraima', SC:'Santa Catarina', SP:'S\u00e3o Paulo',
      SE:'Sergipe', TO:'Tocantins'
    };

    function norm(s) {
      return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    }
    var nameToAbbrev = {};
    Object.keys(BR).forEach(function(a) { nameToAbbrev[norm(BR[a])] = a; });

    var mP = groupBy(pipe, getE);
    var mW = groupBy(won,  getE);
    var mL = groupBy(lost, getE);

    fetch('https://cdn.jsdelivr.net/npm/vega-datasets@2/data/brazil-states.topojson')
      .then(function(r) { return r.json(); })
      .then(function(topology) {
        var objKey = Object.keys(topology.objects)[0];
        var features = topojson.feature(topology, topology.objects[objKey]).features;

        var vals = features.map(function(f) {
          var abbrev = nameToAbbrev[norm(f.properties.name||'')] || '';
          return (mP[abbrev]||{gross:0}).gross;
        });
        var maxVal = Math.max.apply(null, vals) || 1;
        var t = th();

        instances['estado'] = new Chart(canvas, {
          type: 'choropleth',
          data: {
            labels: features.map(function(f) {
              var n = f.properties.name || '';
              var a = nameToAbbrev[norm(n)] || '?';
              return n + ' (' + a + ')';
            }),
            datasets: [{
              label: 'Pipeline por Estado',
              data: features.map(function(f) {
                var abbrev = nameToAbbrev[norm(f.properties.name||'')] || '';
                return {
                  feature: f,
                  value:   (mP[abbrev]||{gross:0}).gross,
                  won:     (mW[abbrev]||{gross:0}).gross,
                  lost:    (mL[abbrev]||{gross:0}).gross
                };
              }),
              backgroundColor: function(ctx) {
                if (!ctx.raw) return 'rgba(0,190,255,0.05)';
                var ratio = (ctx.raw.value || 0) / maxVal;
                var alpha = ratio < 0.01 ? 0.06 : (0.15 + ratio * 0.75);
                return 'rgba(0,190,255,' + alpha.toFixed(2) + ')';
              },
              borderColor:          'rgba(0,190,255,0.30)',
              borderWidth:          0.8,
              hoverBackgroundColor: 'rgba(0,190,255,0.90)',
              hoverBorderColor:     '#00BEFF',
              hoverBorderWidth:     1.5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: function(items) { return items[0] ? items[0].label : ''; },
                  label: function(ctx) {
                    var d = ctx.raw || {};
                    return [
                      'Pipeline: ' + fmt(d.value||0),
                      'Ganhos:   ' + fmt(d.won  ||0),
                      'Perdidos: ' + fmt(d.lost ||0)
                    ];
                  }
                }
              }
            },
            scales: {
              projection: { axis: 'x', projection: 'mercator' }
            }
          }
        });
      })
      .catch(function() {
        tripleBar('chart-estado','estado', getE, 14, [C.indigo, C.green, C.red]);
      });
  }

  // ── 7. Segmento de Mercado ───────────────────────────────────────────
  function buildSegmento() {
    tripleBar('chart-segmento','segmento',
      function(d){return d.Segmento_consolidado||d.segmento||'';}, 12, [C.purple, C.green, C.red]);
  }

  // ── 7b. Cidade ───────────────────────────────────────────────────────
  function buildCidade() {
    tripleBar('chart-cidade','cidade',
      function(d) {
        var raw = d.Cidade_de_cobranca || d.billing_city || d.cidade || '';
        var txt = String(raw || '').trim();
        if (!txt) return '';

        // Ex.: "São Paulo - SP" -> "São Paulo"
        txt = txt.replace(/\s*[-\/]\s*[A-Z]{2}\s*$/i, '').trim();

        // Ex.: "SP / São Paulo" -> "São Paulo"
        var parts = txt.split('/').map(function(p) { return p.trim(); }).filter(Boolean);
        if (parts.length === 2 && /^[A-Z]{2}$/i.test(parts[0])) {
          txt = parts[1];
        }

        return txt;
      },
      15,
      [C.teal, C.green, C.red]
    );
  }

  // ── 8. Receita Mensal + trend line ───────────────────────────────────
  function buildMonthly() {
    var canvas = document.getElementById('chart-receita-mensal'); if (!canvas) return;
    kill('monthly');
    var titleEl = document.getElementById('chart-booking-mensal-label');
    if (titleEl) {
      var yearLabel = (window.currentFilters && window.currentFilters.year) ? String(window.currentFilters.year) : '';
      if (!yearLabel && window.currentFY) {
        yearLabel = /^FY\d{2}$/.test(window.currentFY) ? ('20' + String(window.currentFY).slice(2)) : String(window.currentFY);
      }
      if (!yearLabel) yearLabel = 'Todos os Anos';
      titleEl.textContent = 'Booking Mensal (' + yearLabel + ') — Ganhos & Perdidos';
    }
    var won  = window.wonAgg  || [];
    var lost = window.lostAgg || [];
    var ML = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    var wonM = {}, lostM = {};
    won.forEach(function(d) {
      var dt = new Date(d.Data_Fechamento||d.closeDate||''); if (isNaN(dt.getTime())) return;
      var k = dt.getMonth(); if (!wonM[k]) wonM[k]={g:0,n:0,c:0};
      wonM[k].g+=+(d.Gross||d.gross||0); wonM[k].n+=+(d.Net||d.net||0); wonM[k].c++;
    });
    lost.forEach(function(d) {
      var dt = new Date(d.Data_Fechamento||d.closeDate||''); if (isNaN(dt.getTime())) return;
      var k = dt.getMonth(); if (!lostM[k]) lostM[k]={g:0,c:0};
      lostM[k].g+=+(d.Gross||d.gross||0); lostM[k].c++;
    });
    var allK = {}; Object.keys(wonM).concat(Object.keys(lostM)).forEach(function(k){allK[k]=1;});
    var months = Object.keys(allK).map(Number).sort(function(a,b){return a-b;});
    var labels = months.map(function(m){return ML[m];});
    var wG = months.map(function(m){return (wonM[m]||{g:0}).g;});
    var wN = months.map(function(m){return (wonM[m]||{n:0}).n;});
    var lG = months.map(function(m){return (lostM[m]||{g:0}).g;});
    if (!labels.length) {
      var tg=won.reduce(function(s,d){return s+(+(d.Gross||d.gross||0));},0);
      var tn=won.reduce(function(s,d){return s+(+(d.Net||d.net||0));},0);
      var lg=lost.reduce(function(s,d){return s+(+(d.Gross||d.gross||0));},0);
      if(tg||tn||lg){labels=['Total'];wG=[tg];wN=[tn];lG=[lg];}
    }
    var totWG=wG.reduce(function(a,b){return a+b;},0);
    var totWN=wN.reduce(function(a,b){return a+b;},0);
    var totLG=lG.reduce(function(a,b){return a+b;},0);

    // Build per-month count maps for tooltip
    var wGmap={}, wNmap={}, lGmap={};
    months.forEach(function(m,i){
      wGmap[labels[i]]={gross:wG[i],count:wonM[m]?wonM[m].c:0};
      wNmap[labels[i]]={gross:wN[i],count:wonM[m]?wonM[m].c:0};
      lGmap[labels[i]]={gross:lG[i],count:lostM[m]?lostM[m].c:0};
    });

    // Moving average trend line (or straight line if 1-2 points)
    function movAvg(arr, w) {
      return arr.map(function(_,i) {
        var s=0,c=0;
        for(var j=Math.max(0,i-Math.floor(w/2));j<=Math.min(arr.length-1,i+Math.floor(w/2));j++){s+=arr[j];c++;}
        return c?s/c:null;
      });
    }
    var trendWG = wG.length > 2 ? movAvg(wG, 3) : wG;

    instances['monthly'] = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { type:'bar',  label:'Won Gross',  data:wG, backgroundColor:gradBg(C.cyan,false),  borderColor:C.cyan.b,  borderWidth:1.5, borderRadius:5, order:2 },
        { type:'bar',  label:'Won Net',    data:wN, backgroundColor:gradBg(C.green,false), borderColor:C.green.b, borderWidth:1.5, borderRadius:5, order:2 },
        { type:'bar',  label:'Lost Gross', data:lG, backgroundColor:gradBg(C.red,false),   borderColor:C.red.b,   borderWidth:1.5, borderRadius:5, order:2 },
        { type:'line', label:'Tendência Won', data:trendWG, borderColor:C.warning.s, backgroundColor:'transparent',
          borderWidth:2.5, pointRadius:4, pointBackgroundColor:C.warning.s, tension:0.5, order:1,
          borderDash:[], fill:false }
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: leg(), tooltip: richTip([wGmap,wNmap,lGmap,null],[totWG,totWN,totLG,null]) },
        scales: scalesV(),
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var label = chart.data.labels[elements[0].index]; if (!label) return;
          var mIdx = ML.indexOf(label);
          var items = [];
          won.forEach(function(d){
            var dt=new Date(d.Data_Fechamento||d.closeDate||'');
            if(!isNaN(dt.getTime())&&dt.getMonth()===mIdx) items.push(Object.assign({_src:'won'},d));
          });
          lost.forEach(function(d){
            var dt=new Date(d.Data_Fechamento||d.closeDate||'');
            if(!isNaN(dt.getTime())&&dt.getMonth()===mIdx) items.push(Object.assign({_src:'lost'},d));
          });
          openDrilldown(label + (filterLabel()), items);
        }
      }
    });
  }

  // ── Custom Plugins ───────────────────────────────────────────────────
  // 1. Doughnut center text — shows Gross Total inside the hole
  if (window.Chart && window.Chart.register) {
    Chart.register({
      id: 'doughnutCenter',
      afterDraw: function (chart) {
        if (chart.config.type !== 'doughnut') return;
        var ds = chart.data && chart.data.datasets && chart.data.datasets[0];
        if (!ds) return;
        var tot = (ds.data || []).reduce(function (s, v) { return s + (+v || 0); }, 0);
        if (!tot) return;
        var ca = chart.chartArea; if (!ca) return;
        var cx  = ca.left + (ca.right  - ca.left)  / 2;
        var cy  = ca.top  + (ca.bottom - ca.top)   / 2;
        var ctx = chart.ctx;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isLight() ? '#0f1b2d' : '#e8f2fb';
        ctx.font      = "700 15px 'Poppins','Roboto',sans-serif";
        ctx.fillText(fmt(tot), cx, cy - 9);
        ctx.font      = "10px 'Roboto',sans-serif";
        ctx.fillStyle = isLight() ? '#6b7f97' : '#7b8fa6';
        ctx.fillText('Gross Total', cx, cy + 9);
        ctx.restore();
      }
    });

    // 2. Bar value/% labels (end of bar for horizontal, top for vertical)
    Chart.register({
      id: 'barDatalabels',
      afterDatasetsDraw: function (chart) {
        var opts = chart.options.plugins && chart.options.plugins.barDatalabels;
        if (!opts || !opts.display) return;
        var horiz = chart.options.indexAxis === 'y';
        var t     = th();
        chart.data.datasets.forEach(function (dataset, i) {
          if (dataset.type === 'line') return;
          var meta = chart.getDatasetMeta(i);
          if (!meta || meta.hidden) return;
          // Compute dataset total for % calc
          var dsTotal = 0;
          (dataset.data || []).forEach(function(v){ dsTotal += (typeof v === 'number' ? v : 0); });
          if (!dsTotal) return;
          meta.data.forEach(function (bar, j) {
            var val = dataset.data[j];
            if (!val || val <= 0) return;
            var pct = (val / dsTotal * 100);
            if (pct < 1) return; // skip tiny segments
            var label = opts.formatter
              ? opts.formatter(val, j, pct)
              : (pct.toFixed(0) + '%');
            var ctx = chart.ctx;
            ctx.save();
            ctx.font         = "bold 10px 'Roboto',sans-serif";
            ctx.fillStyle    = t.txt;
            ctx.globalAlpha  = 0.80;
            if (horiz) {
              ctx.textAlign    = 'left';
              ctx.textBaseline = 'middle';
              // Only draw if bar wide enough
              if (bar.x - bar.base > 28) {
                ctx.fillText(label, bar.x + 4, bar.y);
              }
            } else {
              ctx.textAlign    = 'center';
              ctx.textBaseline = 'bottom';
              if (bar.base - bar.y > 14) {
                ctx.fillText(label, bar.x, bar.y - 3);
              }
            }
            ctx.restore();
          });
        });
      }
    });

    // 3. Doughnut arc % labels
    Chart.register({
      id: 'arcLabels',
      afterDraw: function (chart) {
        var opts = chart.options.plugins && chart.options.plugins.arcLabels;
        if (!opts || !opts.display) return;
        if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
        var ds  = chart.data.datasets[0]; if (!ds) return;
        var tot = (ds.data || []).reduce(function(s, v){ return s + (+v || 0); }, 0);
        if (!tot) return;
        var meta = chart.getDatasetMeta(0); if (!meta) return;
        var ctx = chart.ctx;
        meta.data.forEach(function (arc, i) {
          var val = ds.data[i]; if (!val || val <= 0) return;
          var pct = val / tot * 100;
          if (pct < 4) return; // skip tiny arcs
          var midAngle  = (arc.startAngle + arc.endAngle) / 2;
          var midRadius = (arc.innerRadius + arc.outerRadius) * 0.56;
          var tx = arc.x + Math.cos(midAngle) * midRadius;
          var ty = arc.y + Math.sin(midAngle) * midRadius;
          ctx.save();
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          // Shadow for readability
          ctx.shadowColor   = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur    = 4;
          ctx.font          = "bold 11px 'Poppins','Roboto',sans-serif";
          ctx.fillStyle     = '#ffffff';
          ctx.fillText(pct.toFixed(0) + '%', tx, ty);
          ctx.restore();
        });
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  window.initDashboardCharts = function () {
    if (window.Chart && window.Chart.defaults) {
      Chart.defaults.font.family = "'Roboto', sans-serif";
      Chart.defaults.font.size   = 12;
      // Premium tooltip
      var Td = Chart.defaults.plugins.tooltip;
      Td.backgroundColor = isLight() ? 'rgba(15,27,45,0.96)' : 'rgba(4,9,18,0.97)';
      Td.titleColor      = '#f2f6fb';
      Td.bodyColor       = '#9aafc4';
      Td.borderColor     = 'rgba(0,190,255,0.24)';
      Td.borderWidth     = 1;
      Td.padding         = 12;
      Td.cornerRadius    = 10;
      Td.titleFont       = { family: "'Poppins','Roboto',sans-serif", size: 12, weight: '600' };
      Td.bodyFont        = { family: "'Roboto',sans-serif", size: 11 };
      Td.boxPadding      = 4;
    }
    buildPorFase();
    buildWinLoss();
    buildVertical();
    buildSubVertical();
    buildPortfolioFDM();
    buildPortfolioVersao();
    buildForecastSF();
    buildWinRateVendedor();
    buildSegmento();
    buildEstado();
    buildCidade();
    buildMonthly();
    installChartExpandButtons();
    initChartCategoryToggles();
  };
  window.refreshDashboardCharts = window.initDashboardCharts;

})();
