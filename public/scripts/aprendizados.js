// Seção Aprendizados: loadAprendizados, renderAprendizadosFromRag
const INSIGHTS_CLIENT_CACHE_TTL_MS = 120000;
window.__aprendizadosClientCache = window.__aprendizadosClientCache || {};
window.__aprendizadosRuntime = window.__aprendizadosRuntime || {
  lastLoadedAt: 0,
  freshnessTimer: null
};

function formatCurrencyBRL(value) {
  const numeric = Number(value || 0);
  if (numeric === 0) return 'R$ 0';
  if (numeric >= 1_000_000) {
    return 'R$ ' + (numeric / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  }
  if (numeric >= 1_000) {
    return 'R$ ' + (numeric / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(numeric);
}

function _escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _mdInline(text) {
  return _escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function _accent(tone) {
  if (tone === 'success') return 'var(--ui-green)';
  if (tone === 'danger') return 'var(--ui-red)';
  if (tone === 'warning') return 'var(--ui-warning)';
  return 'var(--ui-cyan)';
}

function getCachedAprendizados(cacheKey) {
  const cached = window.__aprendizadosClientCache[cacheKey];
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    delete window.__aprendizadosClientCache[cacheKey];
    return null;
  }
  return cached;
}

function setCachedAprendizados(cacheKey, data) {
  window.__aprendizadosClientCache[cacheKey] = {
    data,
    createdAt: Date.now(),
    expiresAt: Date.now() + INSIGHTS_CLIENT_CACHE_TTL_MS
  };
}

function _skeletonBlock(lines) {
  const rows = (lines || ['w90', 'w80', 'w70']).map(function(cls) {
    return '<div class="apr-s-line ' + cls + '"></div>';
  }).join('');
  return '<div class="apr-loading-skeleton">' + rows + '</div>';
}

function setAprendizadosLoadingState() {
  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  const dnaEl = document.getElementById('insights-win-dna');
  const recsEl = document.getElementById('insights-recommendations');
  const topWinsEl = document.getElementById('insights-top-wins');
  const topLossEl = document.getElementById('insights-top-losses');
  const causeWinEl = document.getElementById('insights-top-causes-win');
  const causeLossEl = document.getElementById('insights-top-causes-loss');

  if (winsEl) winsEl.innerHTML = _skeletonBlock(['w40', 'w90', 'w80', 'w70', 'w55']);
  if (lossesEl) lossesEl.innerHTML = _skeletonBlock(['w40', 'w90', 'w80', 'w70', 'w55']);
  if (dnaEl) dnaEl.innerHTML = _skeletonBlock(['w55', 'w90', 'w80', 'w70']);
  if (recsEl) recsEl.innerHTML = _skeletonBlock(['w40', 'w90', 'w80', 'w70', 'w90']);
  if (topWinsEl) topWinsEl.innerHTML = _skeletonBlock(['w55', 'w90', 'w80', 'w70']);
  if (topLossEl) topLossEl.innerHTML = _skeletonBlock(['w55', 'w90', 'w80', 'w70']);
  if (causeWinEl) causeWinEl.innerHTML = _skeletonBlock(['w55', 'w90', 'w80', 'w70']);
  if (causeLossEl) causeLossEl.innerHTML = _skeletonBlock(['w55', 'w90', 'w80', 'w70']);

  const meta = document.getElementById('insights-meta-badges');
  if (meta) {
    meta.innerHTML = '<span class="apr-meta-badge">Carregando inteligência...</span>';
  }
}

function _formatAgo(ms) {
  if (ms < 1000) return 'agora';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'há ' + seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return 'há ' + minutes + 'min';
  const hours = Math.floor(minutes / 60);
  return 'há ' + hours + 'h';
}

function _renderFreshnessBadges(meta) {
  const badges = [];
  const isCache = !!meta.fromCache;
  const ageMs = Math.max(0, Number(meta.ageMs || 0));
  const totalLatency = Number(meta.totalLatencyMs || 0);
  const embeddingsStale = !!meta.embeddingsStale;

  if (isCache) {
    badges.push('<span class="apr-meta-badge" style="border-color:rgba(138,116,247,0.45);color:var(--ui-violet);background:var(--ui-violet-soft);">Cache ativo</span>');
    badges.push('<span class="apr-meta-badge">Atualizado ' + _formatAgo(ageMs) + '</span>');
  } else {
    badges.push('<span class="apr-meta-badge" style="border-color:rgba(183,234,120,0.42);color:var(--ui-green);background:var(--ui-green-soft);">Dados frescos</span>');
  }

  if (totalLatency > 0) {
    const highLatency = totalLatency >= 30000;
    badges.push('<span class="apr-meta-badge"' + (highLatency ? ' style="border-color:rgba(240,172,84,0.45);color:var(--ui-warning);background:var(--ui-warning-soft);"' : '') + '>Latência ' + Math.round(totalLatency / 1000) + 's</span>');
  }

  if (embeddingsStale) {
    badges.push('<span class="apr-meta-badge" style="border-color:rgba(240,172,84,0.45);color:var(--ui-warning);background:var(--ui-warning-soft);">Base em reindexação</span>');
  }

  const now = new Date();
  badges.push('<span class="apr-meta-badge" id="insights-updated-at">Atualizado às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>');
  return badges.join('');
}

function _updateFreshnessTicker() {
  const container = document.getElementById('insights-meta-badges');
  if (!container) return;

  const runtime = window.__aprendizadosRuntime;
  const fromCache = !!runtime.fromCache;
  if (!runtime.lastLoadedAt) return;

  const age = Date.now() - runtime.lastLoadedAt;
  const ticker = container.querySelector('#insights-updated-at');
  if (!ticker) return;

  if (fromCache) {
    ticker.textContent = 'Cache ' + _formatAgo(age);
  } else {
    ticker.textContent = 'Atualizado ' + _formatAgo(age);
  }
}

function _startFreshnessTicker() {
  const runtime = window.__aprendizadosRuntime;
  if (runtime.freshnessTimer) clearInterval(runtime.freshnessTimer);
  runtime.freshnessTimer = setInterval(_updateFreshnessTicker, 1000);
}

async function loadAprendizados() {
  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  if (!winsEl || !lossesEl) return;

  setAprendizadosLoadingState();

  try {
    const year = document.getElementById('year-filter')?.value || '';
    const quarterRaw = document.getElementById('quarter-filter')?.value || '';
    const quarter = quarterRaw ? quarterRaw.replace('Q', '') : '';
    const month = document.getElementById('month-filter')?.value || '';
    const dateStart = document.getElementById('date-start-filter')?.value || '';
    const dateEnd = document.getElementById('date-end-filter')?.value || '';
    const seller = Array.isArray(window.selectedSellers) && window.selectedSellers.length > 0 ? window.selectedSellers.join(',') : '';
    const advancedFilters = (typeof getAdvancedFiltersFromUI === 'function')
      ? getAdvancedFiltersFromUI()
      : {};

    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    if (!quarter && month) params.set('month', month);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    if (seller) params.set('seller', seller);
    params.set('top_k', '40');
    params.set('min_similarity', '0.15');

    const queryParts = ['insights de vendas'];
    if (year && quarter) queryParts.push('FY' + year.slice(-2) + '-Q' + quarter);
    if (!quarter && month) queryParts.push('mes ' + month);
    if (dateStart || dateEnd) queryParts.push('periodo ' + (dateStart || 'inicio') + '-' + (dateEnd || 'fim'));
    if (seller) queryParts.push('seller ' + seller);
    params.set('query', queryParts.join(' | '));

    Object.entries(advancedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const cacheKey = params.toString();
    const cached = getCachedAprendizados(cacheKey);
    if (cached) {
      renderAprendizadosFromRag(cached.data, {
        fromCache: true,
        ageMs: Date.now() - cached.createdAt,
        totalLatencyMs: cached.data?.latency_ms?.total || 0,
        embeddingsStale: !!cached.data?.rag?.freshness?.embeddings_stale
      });
      return;
    }

    const requestStartedAt = Date.now();
    const ragRes = await fetch(API_BASE_URL + '/api/insights-rag?' + params.toString());
    if (!ragRes.ok) throw new Error('Erro ao carregar insights RAG');

    const ragData = await ragRes.json();
    setCachedAprendizados(cacheKey, ragData);

    renderAprendizadosFromRag(ragData, {
      fromCache: false,
      ageMs: Date.now() - requestStartedAt,
      totalLatencyMs: ragData?.latency_ms?.total || 0,
      embeddingsStale: !!ragData?.rag?.freshness?.embeddings_stale
    });
  } catch (error) {
    console.error('Erro ao carregar insights:', error);
    const errEl = '<div style="text-align:center;color:var(--ui-red);padding:20px;font-size:13px;">Erro ao carregar dados. Tente novamente.</div>';
    winsEl.innerHTML = errEl;
    lossesEl.innerHTML = errEl;
  }
}

function _toInsightBullets(text, tone) {
  const accent = _accent(tone);
  const lines = String(text || '')
    .split(/\n+/)
    .map(function(line) { return line.trim(); })
    .filter(Boolean)
    .map(function(line) { return line.replace(/^[-•]\s*/, '').trim(); });

  const items = lines.length ? lines : ['Sem conteúdo disponível para este recorte.'];

  return '<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;">'
    + items.map(function(line) {
      return '<li style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--ui-border-soft);border-radius:10px;background:var(--ui-bg-surface-2);">'
        + '<span style="color:' + accent + ';font-size:13px;font-weight:900;line-height:1.25;margin-top:1px;">✓</span>'
        + '<span style="font-size:13px;line-height:1.6;color:var(--ui-text-1);">' + _mdInline(line) + '</span>'
        + '</li>';
    }).join('')
    + '</ul>';
}

function buildInsightCard(title, subtitle, bodyText, tone) {
  const ac = _accent(tone);
  const subtitleBg = tone === 'danger' ? 'var(--ui-red-soft)' : 'var(--ui-green-soft)';

  return '<div style="padding:2px 0;">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--ui-border-soft);">'
    + '<strong style="font-size:14px;letter-spacing:0.2px;color:var(--ui-text-1);">' + _escapeHtml(title) + '</strong>'
    + '<span style="margin-left:auto;background:' + subtitleBg + ';color:' + ac + ';font-size:10px;font-weight:700;padding:4px 9px;border-radius:999px;letter-spacing:.05em;">' + _escapeHtml(subtitle) + '</span>'
    + '</div>'
    + _toInsightBullets(bodyText, tone)
    + '</div>';
}

function renderWinDna(highlights) {
  const tags = (highlights && highlights.win_tags) || [];
  const segments = (highlights && highlights.win_by_segment) || [];
  const families = (highlights && highlights.win_by_family) || [];

  if (tags.length === 0 && segments.length === 0 && families.length === 0) {
    return '<div style="color:var(--ui-text-2);font-size:12px;padding:10px 0;">Sem dados de DNA das vitórias para o recorte atual.</div>';
  }

  let tagHtml = '';
  if (tags.length > 0) {
    const maxCnt = Math.max.apply(null, tags.map(function(tag) { return Number(tag.cnt || 0); })) || 1;
    const pills = tags.slice(0, 16).map(function(tag) {
      const cnt = Number(tag.cnt || 0);
      const power = cnt / maxCnt;
      const opacity = (0.4 + power * 0.6).toFixed(2);
      const tooltip = 'Tag recorrente em vitórias: ' + _escapeHtml(tag.tag || '-') + ' (' + cnt + ' deals)';

      return '<span class="apr-tag-pill" title="' + tooltip + '" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid rgba(0,190,255,0.32);background:linear-gradient(135deg, var(--ui-cyan-soft), rgba(138,116,247,0.12));font-size:11px;font-weight:700;color:var(--ui-text-1);opacity:' + opacity + ';cursor:help;transition:transform .15s ease;">'
        + '<span style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escapeHtml(tag.tag) + '</span>'
        + '<span style="font-size:10px;color:var(--ui-cyan);background:rgba(0,190,255,0.18);padding:2px 7px;border-radius:999px;">' + cnt + '</span>'
        + '</span>';
    }).join('');

    tagHtml = '<div style="margin-bottom:14px;">'
      + '<div style="font-size:11px;font-weight:700;color:var(--ui-text-2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;">Tags de vitória</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + pills + '</div>'
      + '</div>';
  }

  function renderBars(title, rows, nameKey) {
    const maxCount = Math.max.apply(null, rows.map(function(row) { return Number(row.cnt || 0); })) || 1;
    return '<div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--ui-text-2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;">' + title + '</div>'
      + rows.slice(0, 7).map(function(row) {
        const name = _escapeHtml(row[nameKey] || '-');
        const cnt = Number(row.cnt || 0);
        const pct = Math.max(3, Math.round((cnt / maxCount) * 100));
        const gross = formatCurrencyBRL(row.total_gross || 0);

        return '<div style="display:grid;grid-template-columns:minmax(95px,150px) 1fr auto auto;gap:8px;align-items:center;margin-bottom:9px;">'
          + '<span style="font-size:11px;color:var(--ui-text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + name + '">' + name + '</span>'
          + '<div style="height:8px;border-radius:999px;background:rgba(128,156,182,0.2);overflow:hidden;">'
          + '<div style="width:' + pct + '%;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--ui-cyan),var(--ui-violet));"></div>'
          + '</div>'
          + '<span style="font-size:11px;font-weight:700;color:var(--ui-cyan);">' + cnt + '</span>'
          + '<span style="font-size:10px;color:var(--ui-text-2);">' + gross + '</span>'
          + '</div>';
      }).join('')
      + '</div>';
  }

  const segmentHtml = segments.length ? renderBars('Segmentos', segments, 'segmento') : '';
  const familyHtml = families.length ? renderBars('Famílias', families, 'familia') : '';

  const split = (segmentHtml && familyHtml)
    ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">' + segmentHtml + familyHtml + '</div>'
    : '<div>' + (segmentHtml || familyHtml) + '</div>';

  return '<div class="ai-card" style="padding:16px;">'
    + tagHtml
    + (split ? '<div style="padding-top:10px;border-top:1px solid var(--ui-border-soft);">' + split + '</div>' : '')
    + '</div>';
}

function _medalStyle(rank) {
  if (rank === 1) {
    return {
      badge: 'background:linear-gradient(135deg,var(--ui-warning),var(--ui-cyan));color:var(--ui-bg-app);',
      card: 'border-color:rgba(240,172,84,0.65);box-shadow:0 0 0 1px rgba(240,172,84,0.25) inset;'
    };
  }
  if (rank === 2) {
    return {
      badge: 'background:linear-gradient(135deg,var(--ui-text-3),var(--ui-text-2));color:var(--ui-bg-app);',
      card: 'border-color:rgba(128,156,182,0.45);'
    };
  }
  if (rank === 3) {
    return {
      badge: 'background:linear-gradient(135deg,var(--ui-warning),var(--ui-red));color:var(--ui-bg-app);',
      card: 'border-color:rgba(227,94,102,0.45);'
    };
  }
  return {
    badge: 'background:var(--ui-bg-surface-2);color:var(--ui-text-2);',
    card: 'border-color:var(--ui-border-soft);'
  };
}

function renderTopDeals(items, label, tone, extraKey, extraLabel) {
  const accent = _accent(tone);

  const header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--ui-border-soft);">'
    + '<strong style="font-size:13px;color:var(--ui-text-1);">' + _escapeHtml(label) + '</strong>'
    + '<span style="font-size:10px;color:var(--ui-text-2);text-transform:uppercase;letter-spacing:.08em;">Ranking por valor</span>'
    + '</div>';

  if (!Array.isArray(items) || items.length === 0) {
    return header + '<div style="color:var(--ui-text-2);font-size:12px;padding:8px 0;">Sem dados no recorte atual.</div>';
  }

  const rows = items.map(function(item, idx) {
    const rank = idx + 1;
    const medal = _medalStyle(rank);
    const rawOpp = String(item.Oportunidade || item.oportunidade || 'Sem nome');
    const opp = rawOpp.replace(/^[A-Z]{4}-\d{6}-/, '').replace(/^-+|-+$/g, '').trim() || rawOpp;
    const conta = String(item.Conta || item.conta || 'Conta não informada');
    const gross = formatCurrencyBRL(item.gross || 0);
    const extraVal = item[extraKey] != null ? Math.round(item[extraKey]) : null;

    return '<article class="apr-topdeal" style="padding:12px;border:1px solid var(--ui-border-soft);border-radius:12px;background:var(--ui-bg-surface-2);margin-bottom:10px;' + medal.card + '">'
      + '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">'
      + '<div style="display:flex;align-items:flex-start;gap:10px;min-width:0;">'
      + '<span style="min-width:34px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;' + medal.badge + '">#' + rank + '</span>'
      + '<div style="min-width:0;">'
      + '<div style="font-size:12px;font-weight:700;color:var(--ui-text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _escapeHtml(rawOpp) + '">' + _escapeHtml(opp) + '</div>'
      + '<div style="font-size:10px;color:var(--ui-text-2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _escapeHtml(conta) + '">' + _escapeHtml(conta) + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0;">'
      + '<div style="font-size:13px;font-weight:800;color:' + accent + ';">' + gross + '</div>'
      + (extraVal != null ? '<div style="font-size:10px;color:var(--ui-text-2);margin-top:3px;">' + extraVal + 'd ' + _escapeHtml(extraLabel) + '</div>' : '')
      + '</div>'
      + '</div>'
      + '</article>';
  }).join('');

  return header + rows;
}

window.toggleCauseText = function toggleCauseText(id) {
  const textEl = document.getElementById(id + '-text');
  const btnEl = document.getElementById(id + '-btn');
  if (!textEl || !btnEl) return;

  const expanded = textEl.dataset.expanded === '1';
  textEl.dataset.expanded = expanded ? '0' : '1';
  textEl.innerHTML = expanded ? textEl.dataset.short : textEl.dataset.full;
  btnEl.textContent = expanded ? 'ver mais' : 'ver menos';
};

function renderCauses(items, label, tone) {
  const accent = _accent(tone);
  const rows = (items || []).filter(function(i) {
    return String(i?.causa || '').trim().length > 2;
  });

  const header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--ui-border-soft);">'
    + '<strong style="font-size:13px;color:var(--ui-text-1);">' + _escapeHtml(label) + '</strong>'
    + '<span style="font-size:10px;color:var(--ui-text-2);text-transform:uppercase;letter-spacing:.08em;">Impacto relativo</span>'
    + '</div>';

  if (!rows.length) {
    return header + '<div style="color:var(--ui-text-2);font-size:12px;padding:8px 0;">Sem causas mapeadas neste recorte.</div>';
  }

  const maxTotal = Math.max.apply(null, rows.map(function(item) { return Number(item.total || 0); })) || 1;

  return header + rows.slice(0, 8).map(function(item, idx) {
    const total = Number(item.total || 0);
    const pct = Math.max(2, Math.round((total / maxTotal) * 100));
    const full = _mdInline(String(item.causa || '').trim());
    const short = full.length > 170 ? full.slice(0, 170) + '…' : full;
    const canExpand = full.length > 170;
    const rowId = 'cause-' + tone + '-' + idx;

    return '<article style="padding:10px 0;' + (idx < Math.min(7, rows.length - 1) ? 'border-bottom:1px solid var(--ui-border-soft);' : '') + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div id="' + rowId + '-text" data-expanded="0" data-short="' + _escapeHtml(short) + '" data-full="' + _escapeHtml(full) + '" style="font-size:12px;line-height:1.55;color:var(--ui-text-1);" title="' + _escapeHtml(String(item.causa || '')) + '">' + short + '</div>'
      + (canExpand ? '<button id="' + rowId + '-btn" onclick="toggleCauseText(\'' + rowId + '\')" style="margin-top:4px;border:none;background:none;color:var(--ui-cyan);font-size:11px;font-weight:700;cursor:pointer;padding:0;">ver mais</button>' : '')
      + '</div>'
      + '<span style="font-size:11px;font-weight:800;color:' + accent + ';">' + total + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">'
      + '<div style="height:8px;flex:1;border-radius:999px;background:rgba(128,156,182,0.2);overflow:hidden;">'
      + '<div style="height:100%;width:' + pct + '%;border-radius:999px;background:' + accent + ';"></div>'
      + '</div>'
      + '<span style="font-size:11px;color:var(--ui-text-2);min-width:36px;text-align:right;">' + pct + '%</span>'
      + '</div>'
      + '</article>';
  }).join('');
}

function renderRecommendations(recs) {
  if (!Array.isArray(recs) || recs.length === 0) {
    return '<div style="color:var(--ui-text-2);font-size:12px;padding:12px 0;">Sem recomendações no recorte atual.</div>';
  }

  return recs.map(function(rec, idx) {
    const number = String(idx + 1).padStart(2, '0');
    const clean = String(rec || '').replace(/^\s*[-•#\d.]+\s*/, '').trim();

    return '<article style="display:grid;grid-template-columns:56px 1fr;gap:12px;align-items:start;padding:13px 0;' + (idx < recs.length - 1 ? 'border-bottom:1px solid var(--ui-border-soft);' : '') + '">'
      + '<div style="font-size:28px;font-weight:900;line-height:1;color:var(--ui-violet);opacity:.95;">' + number + '</div>'
      + '<div style="font-size:13px;line-height:1.7;color:var(--ui-text-1);padding-top:2px;">' + _mdInline(clean) + '</div>'
      + '</article>';
  }).join('');
}

function renderAprendizadosFromRag(ragData, meta) {
  const aiStatus = ragData?.aiInsights?.status || 'unknown';
  const aiError = ragData?.aiInsights?.error || '';
  const wins = ragData?.aiInsights?.wins || 'Sem insights de vitórias.';
  const losses = ragData?.aiInsights?.losses || 'Sem insights de perdas.';
  const recs = ragData?.aiInsights?.recommendations || [];

  const stats = ragData?.stats || {};
  const winsStats = ragData?.wins_stats || stats.wins_stats || {};
  const lossesStats = ragData?.losses_stats || stats.losses_stats || {};
  const pipelineStats = stats.pipeline || {};
  const highlights = ragData?.business_highlights || {};

  const winsTotal = parseInt(winsStats.total || 0, 10);
  const lossesTotal = parseInt(lossesStats.total || 0, 10);
  const totalClosed = winsTotal + lossesTotal;
  const winRate = totalClosed > 0 ? Math.round((winsTotal / totalClosed) * 100) : 0;

  setTextSafe('insights-win-rate', winRate + '%');
  setTextSafe('insights-win-rate-sub', winsTotal.toLocaleString('pt-BR') + ' de ' + totalClosed.toLocaleString('pt-BR') + ' fechados');
  setTextSafe('insights-wins-count', winsTotal.toLocaleString('pt-BR'));
  setTextSafe('insights-wins-avg', 'Ciclo médio ' + Math.round(winsStats.avg_cycle_days || 0) + 'd');
  setTextSafe('insights-losses-count', lossesTotal.toLocaleString('pt-BR'));
  setTextSafe('insights-losses-avg', 'Ciclo médio ' + Math.round(lossesStats.avg_cycle_days || 0) + 'd');
  setTextSafe('insights-pipeline-count', parseInt(pipelineStats.total || 0, 10).toLocaleString('pt-BR'));
  setTextSafe('insights-total-count', 'Idle médio ' + Math.round(pipelineStats.avg_idle_days || 0) + 'd');

  const dnaSectionEl = document.getElementById('insights-win-dna');
  if (dnaSectionEl) dnaSectionEl.innerHTML = renderWinDna(highlights);

  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  if (winsEl) winsEl.innerHTML = buildInsightCard('Padrões de Vitória', 'Dados + IA', wins, 'success');
  if (lossesEl) lossesEl.innerHTML = buildInsightCard('Riscos de Perda', 'Dados + IA', losses, 'danger');

  if (aiStatus !== 'rag' && aiStatus !== 'empty') {
    const warning = '<div style="margin-bottom:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(227,94,102,0.45);color:var(--ui-red);background:var(--ui-red-soft);font-size:12px;">Falha da IA (' + _escapeHtml(aiStatus) + ')' + (aiError ? ': ' + _escapeHtml(aiError) : '.') + '</div>';
    if (winsEl) winsEl.innerHTML = warning + winsEl.innerHTML;
    if (lossesEl) lossesEl.innerHTML = warning + lossesEl.innerHTML;
  }

  const recsDiv = document.getElementById('insights-recommendations');
  if (recsDiv) recsDiv.innerHTML = renderRecommendations(recs);

  const topWinsEl = document.getElementById('insights-top-wins');
  const topLossesEl = document.getElementById('insights-top-losses');
  if (topWinsEl) topWinsEl.innerHTML = renderTopDeals(highlights.top_wins, 'Top Deals Ganhos', 'success', 'ciclo_dias', 'ciclo');
  if (topLossesEl) topLossesEl.innerHTML = renderTopDeals(highlights.top_losses, 'Top Deals Perdidos', 'danger', 'ciclo_dias', 'ciclo');

  const topCausesWinEl = document.getElementById('insights-top-causes-win');
  const topCausesLossEl = document.getElementById('insights-top-causes-loss');
  if (topCausesWinEl) topCausesWinEl.innerHTML = renderCauses(highlights.top_gain_causes, 'Principais causas de ganho', 'success');
  if (topCausesLossEl) topCausesLossEl.innerHTML = renderCauses(highlights.top_loss_causes, 'Principais causas de perda', 'danger');

  const transparencyEl = document.getElementById('aprendizados-transparency');
  if (transparencyEl) {
    transparencyEl.innerHTML = '';
    transparencyEl.style.display = 'none';
  }

  const metaContainer = document.getElementById('insights-meta-badges');
  if (metaContainer) {
    metaContainer.innerHTML = _renderFreshnessBadges(meta || {});
  }

  window.__aprendizadosRuntime.lastLoadedAt = Date.now();
  window.__aprendizadosRuntime.fromCache = !!meta?.fromCache;
  _startFreshnessTicker();
}
