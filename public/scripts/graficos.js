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
      x: { ticks: { color: t.txt, font: { family: t.font, size: 11 }, callback: fmt }, grid: { color: t.grid } },
      y: { ticks: { color: t.txt, font: { family: t.font, size: 11 }, maxTicksLimit: 14 }, grid: { color: 'transparent' } }
    };
  }
  function scalesV() { // vertical bar
    var t = th();
    return {
      y: { ticks: { color: t.txt, font: { family: t.font, size: 11 }, callback: fmt }, grid: { color: t.grid } },
      x: { ticks: { color: t.txt, font: { family: t.font, size: 11 } }, grid: { color: 'transparent' } }
    };
  }
  function leg(pos) {
    var t = th();
    return { position: pos || 'top', labels: { color: t.txt, font: { family: t.font, size: 11 }, boxWidth: 10, padding: 8 } };
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

  // ── 1. Pipeline por Fase ──────────────────────────────────────────────
  function buildPorFase() {
    var canvas = document.getElementById('chart-por-fase'); if (!canvas) return;
    kill('por-fase');
    var raw = window.pipelineDataRaw || [];
    var getF = function (d) { return d.Fase_Atual || d.stage; };
    var mG = groupBy(raw, getF);
    var labels = topKeys(mG, 14); if (!labels.length) { showEmpty(canvas, 'Dados de fase não disponíveis'); return; }
    var totG = labels.reduce(function(s,l){return s+mG[l].gross;},0);
    var totN = labels.reduce(function(s,l){return s+mG[l].net;},0);
    instances['por-fase'] = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label: 'Gross', data: labels.map(function(l){return mG[l].gross;}), backgroundColor: C.cyan.bg, borderColor: C.cyan.b, borderWidth: 2, borderRadius: 4 },
        { label: 'Net',   data: labels.map(function(l){return mG[l].net;}),   backgroundColor: C.green.bg, borderColor: C.green.b, borderWidth: 2, borderRadius: 4 }
      ]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins: { legend: leg(), tooltip: richTip([mG,mG],[totG,totN]) },
        scales: scalesH(),
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var label = chart.data.labels[elements[0].index]; if (!label) return;
          var norm = label.trim();
          var items = (window.pipelineDataRaw||[]).filter(function(d){ return (d.Fase_Atual||d.stage||'').trim()===norm; })
            .map(function(d){ return Object.assign({_src:'pipe'}, d); });
          openDrilldown('Fase: ' + norm, items);
        }
      }
    });
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
        { label: 'Gross', data: [wG,lG], backgroundColor:[C.green.bg,C.red.bg], borderColor:[C.green.b,C.red.b], borderWidth:2, borderRadius:6 },
        { label: 'Net',   data: [wN,lN], backgroundColor:[C.cyan.bg,C.orange.bg], borderColor:[C.cyan.b,C.orange.b], borderWidth:2, borderRadius:6 }
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: leg(), tooltip: { callbacks: { label: function(ctx) {
          var src = ctx.dataIndex===0 ? won : lost;
          var tot = wG+lG;
          return [' '+ctx.dataset.label+': '+fmt(ctx.raw), ' '+fmtPct(ctx.raw,tot)+' do total', ' '+src.length+' deals'];
        }}}},
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
        { label:'Pipeline ('+pipe.length+')', data:labels.map(function(l){return (mP[l]||{gross:0}).gross;}), backgroundColor:cs[0].bg, borderColor:cs[0].b, borderWidth:2, borderRadius:3 },
        { label:'Won ('    +won.length  +')', data:labels.map(function(l){return (mW[l]||{gross:0}).gross;}), backgroundColor:cs[1].bg, borderColor:cs[1].b, borderWidth:2, borderRadius:3 },
        { label:'Lost ('   +lost.length +')', data:labels.map(function(l){return (mL[l]||{gross:0}).gross;}), backgroundColor:cs[2].bg, borderColor:cs[2].b, borderWidth:2, borderRadius:3 }
      ]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins: { legend: leg(), tooltip: richTip([mP,mW,mL],[totP,totW,totL]) },
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
    var all = (window.pipelineDataRaw||[]).map(function(d){return Object.assign({_src:'pipe'},d);})
      .concat((window.wonAgg||[]).map(function(d){return Object.assign({_src:'won'},d);}))
      .concat((window.lostAgg||[]).map(function(d){return Object.assign({_src:'lost'},d);}));
    var getP = function(d){return d.Portfolio_FDM||d.portfolio||'';};
    var m = groupBy(all, getP);
    var labels = topKeys(m, 10); if (!labels.length) { showEmpty(canvas, 'Portfolio FDM não disponível'); return; }
    var t = th(); var tot = labels.reduce(function(s,l){return s+m[l].gross;},0);
    instances['portfolio-fdm'] = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: labels.map(function(l){return m[l].gross;}),
        backgroundColor: PALETTE.map(function(c){return c.bg;}), borderColor: PALETTE.map(function(c){return c.s;}), borderWidth:2, hoverOffset:10 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'58%',
        plugins: {
          legend: { position:'bottom', labels:{ color:t.txt, font:{family:t.font,size:10}, boxWidth:10, padding:5 } },
          tooltip: { callbacks: { label: function(ctx) {
            var pct = fmtPct(ctx.raw, tot); var cnt = m[ctx.label]?m[ctx.label].count:0;
            return [' '+ctx.label+': '+fmt(ctx.raw),' '+pct+' do total',' '+cnt+' deals'];
          }}}
        },
        onClick: function(evt, elements, chart) {
          if (!elements||!elements.length) return;
          var label = chart.data.labels[elements[0].index]; if (!label) return;
          var norm = label.trim();
          var items = all.filter(function(d){ return (d.Portfolio_FDM||d.portfolio||'').trim()===norm; });
          openDrilldown('Portfolio FDM: ' + norm, items);
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

  // ── 8. Receita Mensal + trend line ───────────────────────────────────
  function buildMonthly() {
    var canvas = document.getElementById('chart-receita-mensal'); if (!canvas) return;
    kill('monthly');
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
        { type:'bar',  label:'Won Gross',  data:wG, backgroundColor:C.cyan.bg,  borderColor:C.cyan.b,  borderWidth:2, borderRadius:4, order:2 },
        { type:'bar',  label:'Won Net',    data:wN, backgroundColor:C.green.bg, borderColor:C.green.b, borderWidth:2, borderRadius:4, order:2 },
        { type:'bar',  label:'Lost Gross', data:lG, backgroundColor:C.red.bg,   borderColor:C.red.b,   borderWidth:2, borderRadius:4, order:2 },
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

  // ── Summary stats ────────────────────────────────────────────────────
  function buildSummary() {
    var pipe = window.allDealsWithConfidence||window.pipelineDataRaw||[];
    var won  = window.wonAgg  ||[];
    var lost = window.lostAgg ||[];
    var total = won.length+lost.length;
    var winRate = total>0 ? Math.round((won.length/total)*100) : 0;
    var avgConf = 0;
    if (pipe.length) {
      var s=pipe.reduce(function(s,d){var c=(d.confidence||0)>1?d.confidence/100:(d.confidence||0);return s+c;},0);
      avgConf=Math.round((s/pipe.length)*100);
    }
    var pipeGross=pipe.reduce(function(s,d){return s+(+(d.gross||d.val||0));},0);
    var wonGross =won.reduce(function(s,d){ return s+(+(d.Gross||d.gross||0));},0);
    var lostGross=lost.reduce(function(s,d){return s+(+(d.Gross||d.gross||0));},0);
    function set(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
    set('cs-pipeline',       pipe.length+' deals');
    set('cs-won',            won.length +' deals');
    set('cs-lost',           lost.length+' deals');
    set('cs-winrate',        winRate+'%');
    set('cs-confidence',     avgConf+'%');
    set('cs-pipeline-gross', fmt(pipeGross));
    set('cs-won-gross',      fmt(wonGross));
    set('cs-lost-gross',     fmt(lostGross));
  }

  // ── Public API ───────────────────────────────────────────────────────
  window.initDashboardCharts = function () {
    if (window.Chart && window.Chart.defaults) {
      Chart.defaults.font.family = "'Roboto', sans-serif";
      Chart.defaults.font.size   = 12;
    }
    buildPorFase();
    buildWinLoss();
    buildVertical();
    buildSubVertical();
    buildPortfolioFDM();
    buildEstado();
    buildSegmento();
    buildMonthly();
    buildSummary();
  };
  window.refreshDashboardCharts = window.initDashboardCharts;

})();
