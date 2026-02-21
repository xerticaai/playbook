// Seção Aprendizados: loadAprendizados, renderAprendizadosFromPatterns
async function loadAprendizados() {
  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  if (!winsEl || !lossesEl) return;

  winsEl.innerHTML = '<div class="loading"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><use href="#icon-refresh"/></svg>Carregando insights...</div>';
  lossesEl.innerHTML = '<div class="loading"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><use href="#icon-refresh"/></svg>Carregando insights...</div>';

  try {
    const year = document.getElementById('year-filter')?.value || '';
    const quarterRaw = document.getElementById('quarter-filter')?.value || '';
    const quarter = quarterRaw ? quarterRaw.replace('Q', '') : '';
    const month = document.getElementById('month-filter')?.value || '';
    const seller = selectedSellers.length > 0 ? selectedSellers.join(',') : '';
    const advancedFilters = (typeof getAdvancedFiltersFromUI === 'function')
      ? getAdvancedFiltersFromUI()
      : {};

    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    if (!quarter && month) params.set('month', month);
    if (seller) params.set('seller', seller);
    Object.entries(advancedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const [metricsRes, patternsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/metrics?${params.toString()}`),
      fetch(`${API_BASE_URL}/api/analyze-patterns?${params.toString()}`)
    ]);

    if (!metricsRes.ok) throw new Error('Erro ao carregar métricas');
    if (!patternsRes.ok) throw new Error('Erro ao carregar padrões');

    const metrics = await metricsRes.json();
    const patterns = await patternsRes.json();
    renderAprendizadosFromPatterns(metrics, patterns);
  } catch (error) {
    console.error('Erro ao carregar insights:', error);
    winsEl.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 20px;">Erro ao carregar dados. Por favor, tente novamente.</div>';
    lossesEl.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 20px;">Erro ao carregar dados. Por favor, tente novamente.</div>';
  }
}

function renderAprendizadosFromPatterns(metrics, patterns) {
  const wins = patterns?.win_insights || 'Sem insights de vitórias.';
  const losses = patterns?.loss_insights || 'Sem insights de perdas.';

  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  const recsDiv = document.getElementById('insights-recommendations');

  if (winsEl) {
    winsEl.innerHTML = `<div style="padding: 16px; line-height: 1.8;">${wins.replace(/\n/g, '<br>')}</div>`;
  }
  if (lossesEl) {
    lossesEl.innerHTML = `<div style="padding: 16px; line-height: 1.8;">${losses.replace(/\n/g, '<br>')}</div>`;
  }

  const pipelineStats = metrics?.pipeline_filtered || {};
  const winsStats = metrics?.closed_won || {};
  const lossesStats = metrics?.closed_lost || {};

  setTextSafe('insights-wins-count', `${winsStats.deals_count || 0} deals`);
  setTextSafe('insights-wins-avg', `Ciclo medio ${Math.round(winsStats.avg_cycle_days || 0)}d`);
  setTextSafe('insights-losses-count', `${lossesStats.deals_count || 0} deals`);
  setTextSafe('insights-losses-avg', `Ciclo medio ${Math.round(lossesStats.avg_cycle_days || 0)}d`);
  setTextSafe('insights-pipeline-count', `${pipelineStats.deals_count || 0} deals`);
  setTextSafe('insights-total-count', `Idle medio ${Math.round(pipelineStats.avg_idle_days || 0)}d`);


  if (recsDiv) {
    const recs = patterns?.recommendations || [];
    if (Array.isArray(recs) && recs.length > 0) {
      recsDiv.innerHTML = '';
      recs.forEach((rec, idx) => {
        const item = document.createElement('div');
        item.className = 'deal-card';
        item.innerHTML = `
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span class="badge badge-warning" style="font-size: 12px; font-weight: 700;">#${idx + 1}</span>
            <div style="line-height: 1.6;">${rec}</div>
          </div>
        `;
        recsDiv.appendChild(item);
      });
    } else {
      recsDiv.innerHTML = '<div style="color: var(--text-gray); padding: 20px; text-align: center;">Sem recomendações no filtro atual</div>';
    }
  }
}

// Função para trocar tabs dentro da Visão Executiva
