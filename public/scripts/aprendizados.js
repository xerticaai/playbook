// Seção Aprendizados: loadAprendizados, renderAprendizadosFromRag
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
    const seller = selectedSellers.length > 0 ? selectedSellers.join(',') : '';
    const advancedFilters = (typeof getAdvancedFiltersFromUI === 'function')
      ? getAdvancedFiltersFromUI()
      : {};

    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    if (seller) params.set('seller', seller);
    params.set('top_k', '80');
    params.set('min_similarity', '0.15');

    const queryParts = ['insights de vendas'];
    if (year && quarter) queryParts.push(`FY${year.slice(-2)}-Q${quarter}`);
    if (seller) queryParts.push(`seller ${seller}`);
    params.set('query', queryParts.join(' | '));

    Object.entries(advancedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const ragRes = await fetch(`${API_BASE_URL}/api/insights-rag?${params.toString()}`);
    if (!ragRes.ok) throw new Error('Erro ao carregar insights RAG');

    const ragData = await ragRes.json();
    renderAprendizadosFromRag(ragData);
  } catch (error) {
    console.error('Erro ao carregar insights:', error);
    winsEl.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 20px;">Erro ao carregar dados. Por favor, tente novamente.</div>';
    lossesEl.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 20px;">Erro ao carregar dados. Por favor, tente novamente.</div>';
  }
}

function renderAprendizadosFromRag(ragData) {
  const aiStatus = ragData?.aiInsights?.status || 'unknown';
  const aiError = ragData?.aiInsights?.error || '';
  const wins = ragData?.aiInsights?.wins || 'Sem insights de vitórias.';
  const losses = ragData?.aiInsights?.losses || 'Sem insights de perdas.';

  const winsEl = document.getElementById('wins-insights-content');
  const lossesEl = document.getElementById('loss-insights-content');
  const recsDiv = document.getElementById('insights-recommendations');

  if (winsEl) {
    winsEl.innerHTML = `<div style="padding: 16px; line-height: 1.8;">${wins.replace(/\n/g, '<br>')}</div>`;
  }
  if (lossesEl) {
    lossesEl.innerHTML = `<div style="padding: 16px; line-height: 1.8;">${losses.replace(/\n/g, '<br>')}</div>`;
  }

  if (aiStatus !== 'rag' && aiStatus !== 'empty') {
    const warning = `
      <div style="margin: 0 16px 16px 16px; padding: 12px; border-radius: 8px; border: 1px solid var(--danger); color: var(--danger); background: rgba(220, 53, 69, 0.08); font-size: 13px;">
        Falha da LLM (${aiStatus})${aiError ? `: ${aiError}` : '.'}
      </div>
    `;
    if (winsEl) winsEl.innerHTML = warning + winsEl.innerHTML;
    if (lossesEl) lossesEl.innerHTML = warning + lossesEl.innerHTML;
  }

  const stats = ragData?.stats || {};
  const pipelineStats = stats?.pipeline || {};
  const winsStats = ragData?.wins_stats || stats?.wins_stats || {};
  const lossesStats = ragData?.losses_stats || stats?.losses_stats || {};

  setTextSafe('insights-wins-count', `${winsStats.total || 0} deals`);
  setTextSafe('insights-wins-avg', `Ciclo medio ${Math.round(winsStats.avg_cycle_days || 0)}d`);
  setTextSafe('insights-losses-count', `${lossesStats.total || 0} deals`);
  setTextSafe('insights-losses-avg', `Ciclo medio ${Math.round(lossesStats.avg_cycle_days || 0)}d`);
  setTextSafe('insights-pipeline-count', `${pipelineStats.total || 0} deals`);
  setTextSafe('insights-total-count', `Idle medio ${Math.round(pipelineStats.avg_idle_days || 0)}d`);


  if (recsDiv) {
    const recs = ragData?.aiInsights?.recommendations || [];
    if (Array.isArray(recs) && recs.length > 0) {
      recsDiv.innerHTML = '';
      recs.forEach((rec, idx) => {
        const cleanRec = String(rec || '').replace(/^\s*[-•]\s*/, '').trim();
        const item = document.createElement('div');
        item.className = 'deal-card';
        item.innerHTML = `
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span class="badge badge-warning" style="font-size: 12px; font-weight: 700;">#${idx + 1}</span>
            <div style="line-height: 1.6;">${cleanRec}</div>
          </div>
        `;
        recsDiv.appendChild(item);
      });
    } else {
      if (aiStatus !== 'rag' && aiStatus !== 'empty') {
        recsDiv.innerHTML = '<div style="color: var(--danger); padding: 20px; text-align: center;">Sem recomendações: LLM falhou neste recorte.</div>';
      } else {
        recsDiv.innerHTML = '<div style="color: var(--text-gray); padding: 20px; text-align: center;">Sem recomendações no filtro atual</div>';
      }
    }
  }
}

// Função para trocar tabs dentro da Visão Executiva
