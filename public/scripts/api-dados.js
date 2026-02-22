// Comunicação com a API: fetch, cache, loadDashboardData, normalizeCloudResponse, processWordClouds
async function fetchJsonNoCache(url) {
  const cacheBust = url + (url.includes('?') ? '&' : '?') + `_ts=${Date.now()}`;
  const response = await fetch(cacheBust, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`Resposta nao-JSON de ${url}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} de ${url}: ${text.slice(0, 160)}`);
  }
  return data;
}

async function fetchWithCache(url, cacheKey, cacheMinutes = 5) {
  // Tenta buscar do cache
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;
      if (age < cacheMinutes * 60 * 1000) {
        log(`[CACHE] ✓ ${cacheKey} (idade: ${Math.round(age/1000)}s)`);
        return parsed.data;
      }
    } catch (e) {
      log(`[CACHE] ⚠ Erro ao ler: ${e.message}`);
    }
  }
  
  // Busca da API com timestamp para evitar cache do navegador
  const separator = url.includes('?') ? '&' : '?';
  const urlWithTs = `${url}${separator}_ts=${Date.now()}`;
  log(`[CACHE] 🌐 Fetch: ${urlWithTs.substring(0, 80)}...`);
  const data = await fetchJsonNoCache(urlWithTs);
  
  // Salva no cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  } catch (e) {
    log(`[CACHE] ⚠ Erro ao salvar: ${e.message}`);
  }
  
  return data;
}

// Limpar cache ao mudar filtros
function clearDataCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('cache_'));
  keys.forEach(k => localStorage.removeItem(k));
  log('[CACHE] 🗑️ Cache limpo (' + keys.length + ' itens)');
}

async function loadDashboardData() {
  try {
    log('[DASHBOARD] ========== INÍCIO DO CARREGAMENTO ==========');
    showLoading('Carregando dashboard');
    
    // Pega filtros atuais
    const yearFilter = document.getElementById('year-filter')?.value || '';
    const monthFilter = document.getElementById('month-filter')?.value || '';
    const quarterFilter = document.getElementById('quarter-filter')?.value || '';
    const dateStart = document.getElementById('date-start-filter')?.value || '';
    const dateEnd = document.getElementById('date-end-filter')?.value || '';
    const advancedFilters = (typeof getAdvancedFiltersFromUI === 'function')
      ? getAdvancedFiltersFromUI()
      : {
          owner_preventa: '',
          billing_city: '',
          billing_state: '',
          vertical_ia: '',
          sub_vertical_ia: '',
          sub_sub_vertical_ia: '',
          subsegmento_mercado: '',
          segmento_consolidado: '',
          portfolio_fdm: ''
        };
    
    // Multi-select seller filter
    const sellerFilter = selectedSellers.length > 0 ? selectedSellers.join(',') : '';
    
    // Monta query string com suporte a quarter
    const params = new URLSearchParams();
    if (yearFilter) params.append('year', yearFilter);
    
    // Quarter tem prioridade sobre month
    if (quarterFilter) {
      // Converter Q1, Q2, Q3, Q4 para 1, 2, 3, 4
      const quarterNum = quarterFilter.replace('Q', '');
      params.append('quarter', quarterNum);
    } else if (monthFilter) {
      params.append('month', monthFilter);
    }
    
    if (sellerFilter) params.append('seller', sellerFilter);
    Object.entries(advancedFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    const queryString = params.toString() ? '?' + params.toString() : '';
    
    // Armazenar filtros ativos globalmente para uso em renderDashboard
    window.currentFilters = {
      year: yearFilter,
      quarter: quarterFilter,
      month: monthFilter,
      seller: sellerFilter,
      date_start: dateStart,
      date_end: dateEnd,
      ...advancedFilters
    };
    
    log('[FILTERS]', {
      year: yearFilter,
      quarter: quarterFilter,
      month: monthFilter,
      sellers: selectedSellers,
      ...advancedFilters
    });
    log('[API QUERY]', queryString);
    
    // Chamada única para a API (backend agora suporta quarter nativo)
    const wonUrl = `${API_BASE_URL}/api/closed/won?limit=5000${queryString ? '&' + params.toString() : ''}`;
    const lostUrl = `${API_BASE_URL}/api/closed/lost?limit=5000${queryString ? '&' + params.toString() : ''}`;
    const cacheKey = params.toString() || 'all';
    
    const needsTopOppsFallback = !!queryString;
    const insightsRagPromise = Promise.resolve({ aiInsights: { status: 'disabled', wins: '', losses: '', recommendations: [] }, deals: [] });

    const ts = Date.now();
    const sep = queryString ? '&' : '?';
    const [metrics, pipelineData, prioritiesData, actionsData, wonDataCached, lostDataCached, patternsData, salesSpecialistData, insightsRagData, fallbackPipelineData, fallbackWonData, fallbackLostData] = await Promise.all([
      fetchJsonNoCache(`${API_BASE_URL}/api/metrics${queryString}${sep}_ts=${ts}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/pipeline?limit=500${queryString ? '&' + params.toString() : ''}&_ts=${ts}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/priorities?limit=100${queryString ? '&' + params.toString() : ''}&_ts=${ts}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/actions?urgencia=ALTA&limit=50${queryString ? '&' + params.toString() : ''}&_ts=${ts}`),
      fetchWithCache(wonUrl, `cache_won_${cacheKey}`, queryString ? 1 : 2),
      fetchWithCache(lostUrl, `cache_lost_${cacheKey}`, queryString ? 1 : 2),
      fetchJsonNoCache(`${API_BASE_URL}/api/analyze-patterns${queryString}${sep}_ts=${ts}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/sales-specialist${queryString}${sep}_ts=${ts}`),
      insightsRagPromise,
      needsTopOppsFallback ? fetchJsonNoCache(`${API_BASE_URL}/api/pipeline?limit=500&_ts=${ts}`) : Promise.resolve([]),
      needsTopOppsFallback ? fetchWithCache(`${API_BASE_URL}/api/closed/won?limit=5000`, 'cache_won_all', 2) : Promise.resolve([]),
      needsTopOppsFallback ? fetchWithCache(`${API_BASE_URL}/api/closed/lost?limit=5000`, 'cache_lost_all', 2) : Promise.resolve([])
    ]);

    const wonData = wonDataCached;
    const lostData = lostDataCached;
    
    log('[API DATA] Metrics:', metrics);
    log('[DEBUG] ===== ANTES updateExecutiveMetricsFromAPI =====');
    log('[DEBUG] pipeline_filtered da API:', metrics.pipeline_filtered);
    
    // CORREÇÃO: Armazena metrics globalmente para uso em renderDashboard()
    window.currentApiMetrics = metrics;
    
    // Atualizar KPIs do Dashboard Executivo com dados da API
    updateExecutiveMetricsFromAPI(metrics);
    log('[DEBUG] ===== DEPOIS updateExecutiveMetricsFromAPI =====');
    
    log('[API DATA] Pipeline deals:', Array.isArray(pipelineData) ? pipelineData.length : 0);
    log('[API DATA] Priorities:', Array.isArray(prioritiesData) ? prioritiesData.length : 0);
    log('[API DATA] Actions:', Array.isArray(actionsData) ? actionsData.length : 0);
    log('[API DATA] Won deals:', Array.isArray(wonData) ? wonData.length : 0);
    log('[API DATA] Lost deals:', Array.isArray(lostData) ? lostData.length : 0);
    log('[API DATA] Sales Specialist:', Array.isArray(salesSpecialistData) ? salesSpecialistData.length : 0);
    log('[API DATA] AI Patterns:', patternsData);
    log('[API DATA] Insights RAG:', insightsRagData);
    if (needsTopOppsFallback) {
      log('[API DATA] Top opps fallback:', {
        pipeline: Array.isArray(fallbackPipelineData) ? fallbackPipelineData.length : 0,
        won: Array.isArray(fallbackWonData) ? fallbackWonData.length : 0,
        lost: Array.isArray(fallbackLostData) ? fallbackLostData.length : 0
      });
    }
    
    // IMPORTANTE: Separar dados para métricas (reais/filtrados) vs. word clouds (fallback se necessário)
    // Métricas SEMPRE usam dados filtrados (mesmo que vazios)
    // Word clouds podem usar fallback quando filtro resulta em zero
    let wonDataForWordClouds = wonData;
    let lostDataForWordClouds = lostData;
    
    // Fallback APENAS para word clouds (não afeta métricas)
    if ((!wonData || wonData.length === 0) && (!lostData || lostData.length === 0)) {
      log('[FALLBACK] Buscando dados sem filtro APENAS para word clouds (não afeta métricas)...');
      try {
        const [fallbackWonRes, fallbackLostRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/closed/won?limit=5000`),
          fetch(`${API_BASE_URL}/api/closed/lost?limit=5000`)
        ]);
        wonDataForWordClouds = await fallbackWonRes.json();
        lostDataForWordClouds = await fallbackLostRes.json();
        log('[FALLBACK] Won fallback:', wonDataForWordClouds.length);
        log('[FALLBACK] Lost fallback:', lostDataForWordClouds.length);
      } catch (e) {
        log('[FALLBACK] Erro ao buscar dados fallback:', e);
      }
    }
    
    // Converter para formato esperado pelo dashboard
    // CRÍTICO: Métricas usam dados REAIS filtrados, word clouds podem ter fallback
    const raw = {
      status: 'success',
      metrics: metrics,
      pipeline: Array.isArray(pipelineData) ? pipelineData : [],
      priorities: Array.isArray(prioritiesData) ? prioritiesData : [],
      actions: Array.isArray(actionsData) ? actionsData : [],
      // MÉTRICAS: Usar dados REAIS filtrados (mesmo que vazios)
      won: Array.isArray(wonData) ? wonData : [],
      lost: Array.isArray(lostData) ? lostData : [],
      // WORD CLOUDS: Dados separados para não afetar métricas
      wonWordCloud: Array.isArray(wonDataForWordClouds) ? wonDataForWordClouds : [],
      lostWordCloud: Array.isArray(lostDataForWordClouds) ? lostDataForWordClouds : [],
      patterns: patternsData || {},
      salesSpecialist: Array.isArray(salesSpecialistData) ? salesSpecialistData : [],
      insightsRag: insightsRagData || {}
    };
    
    DATA = normalizeCloudResponse(raw);
    
    // Armazenar pipeline raw para uso em filtros
    window.DATA = DATA;
    window.pipelineDataRaw = raw.pipeline || [];
    window.topOppsFallback = {
      pipeline: Array.isArray(fallbackPipelineData) ? fallbackPipelineData : [],
      won: Array.isArray(fallbackWonData) ? fallbackWonData : [],
      lost: Array.isArray(fallbackLostData) ? fallbackLostData : []
    };

    log('[DATA] Estrutura de dados carregada:', {
      'weeklyAgenda quarters': Object.keys(DATA.weeklyAgenda || {}).length,
      'fsrScorecard vendedores': (DATA.fsrScorecard || []).length,
      'l10 keys': Object.keys(DATA.l10 || {}).length,
      'aiAnalysis keys': Object.keys(DATA.aiAnalysis || {}).length,
      'wordClouds': DATA.wordClouds ? Object.keys(DATA.wordClouds).map(k => `${k}:${DATA.wordClouds[k].length}`).join(', ') : 'N/A',
      'quarterLabel': DATA.quarterLabel,
      'updatedAt': DATA.updatedAt
    });

    log('[DATA] Dados completos:', DATA);
    renderDashboard();

    // Restaura o estado do toggle Gross/Net após re-render
    if (typeof updateExecutiveHighlightToggleUI === 'function') {
      updateExecutiveHighlightToggleUI(window.execDisplayMode || 'gross');
    }

    // Se a aba de gráficos está ativa, atualiza os gráficos com os novos dados filtrados
    if (typeof window.initDashboardCharts === 'function' &&
        document.getElementById('view-graficos')?.classList.contains('active')) {
      setTimeout(window.initDashboardCharts, 150);
    }
    
    // Atualiza Performance FSR se estiver ativa
    applyFiltersToPerformance();
    
    // Esconde loader inicial
    hideInitialLoader();
    hideFilterLoader();
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error('[ERROR] Erro ao carregar dados:', e);
    showError('Erro ao carregar dados: ' + e.message);
    hideInitialLoader();
    hideFilterLoader();
  }
}

function normalizeCloudResponse(raw) {
  const nowIso = new Date().toISOString();
  const cloud = raw && raw.status === 'success' ? raw : null;
  
  // Dados da API
  const metrics = cloud?.metrics || {};
  const pipelineDeals = cloud?.pipeline || [];
  // CRÍTICO: Separar dados para métricas (filtrados) vs. word clouds (com fallback)
  const wonDeals = cloud?.won || [];
  const lostDeals = cloud?.lost || [];
  const wonDealsWordCloud = cloud?.wonWordCloud || cloud?.won || [];
  const lostDealsWordCloud = cloud?.lostWordCloud || cloud?.lost || [];
  
  log('[NORMALIZE] Pipeline deals:', pipelineDeals.length);
  log('[NORMALIZE] Won deals (métricas):', wonDeals.length);
  log('[NORMALIZE] Lost deals (métricas):', lostDeals.length);
  log('[NORMALIZE] Won deals (word cloud):', wonDealsWordCloud.length);
  log('[NORMALIZE] Lost deals (word cloud):', lostDealsWordCloud.length);
  
  // Agrupar pipeline por Fiscal Quarter
  const weeklyAgenda = {};
  const sellerStats = {};
  const quarterBreakdown = {};
  
  const deriveFiscalQuarter = (dateStr) => {
    if (!dateStr) return '';
    let parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) {
      const match = String(dateStr).match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        parsed = new Date(`${yyyy}-${mm}-${dd}`);
      }
    }
    if (Number.isNaN(parsed.getTime())) return '';
    const month = parsed.getMonth() + 1;
    const quarterNum = Math.floor((month - 1) / 3) + 1;
    const year = parsed.getFullYear();
    const fy = String(year).slice(-2);
    return `FY${fy}-Q${quarterNum}`;
  };

  // Processar pipeline deals
  pipelineDeals.forEach(deal => {
    const derivedQuarter = deriveFiscalQuarter(deal.Data_Prevista);
    const quarter = deal.Fiscal_Q || derivedQuarter || 'FY26-Q1';
    const seller = deal.Vendedor || 'Unknown';
    
    // Usar Forecast_IA (se disponível) ou Forecast_SF como fallback
    const forecastCategory = deal.Forecast_IA || deal.Forecast_SF || 'PIPELINE';
    
    // USAR CONFIANÇA REAL DO BIGQUERY (campo Confianca)
    let confidence = parseFloat(deal.Confianca) || 0;
    // Se vier como decimal (ex: 0.30), converter para percentual (30)
    if (confidence > 0 && confidence <= 1) confidence = confidence * 100;
    // Log para debug (remover após validação)
    if (deal.Oportunidade && Math.random() < 0.05) {
      log('[CONF DEBUG]', deal.Oportunidade, '- Real:', confidence + '%', 'Forecast:', forecastCategory);
    }
    
    const dealObj = {
      id: deal.Oportunidade,
      name: deal.Oportunidade,
      opportunity: deal.Oportunidade,
      account: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa,
      seller: seller,
      stage: deal.Fase_Atual,
      val: deal.Gross || 0,
      gross: deal.Gross || 0,
      net: deal.Net || 0,
      confidence: confidence,
      forecastCategory: forecastCategory, // ← NOVO: Guarda categoria original
      closeDate: deal.Data_Prevista,
      closed: deal.Data_Prevista,
      fiscalQ: quarter,
      fiscal_q: quarter,
      quarter: quarter,
      activities: deal.Atividades || 0,
      daysIdle: parseInt(deal.Idle_Dias || deal.Dias_Idle) || 0,
      profile: deal.Perfil,
      products: deal.Produtos
    };
    
    // Debug opcional: manter silencioso em producao
    
    // Adicionar ao weeklyAgenda
    if (!weeklyAgenda[quarter]) {
      weeklyAgenda[quarter] = [];
    }
    weeklyAgenda[quarter].push(dealObj);
    
    // Quarter breakdown
    if (!quarterBreakdown[quarter]) {
      quarterBreakdown[quarter] = { gross: 0, net: 0, count: 0 };
    }
    quarterBreakdown[quarter].gross += deal.Gross || 0;
    quarterBreakdown[quarter].net += deal.Net || 0;
    quarterBreakdown[quarter].count++;
    
    // Seller stats
    if (!sellerStats[seller]) {
      sellerStats[seller] = {
        name: seller,
        total_deals: 0,
        total_gross: 0,
        total_net: 0,
        avg_deal_size: 0
      };
    }
    sellerStats[seller].total_deals++;
    sellerStats[seller].total_gross += deal.Gross || 0;
    sellerStats[seller].total_net += deal.Net || 0;
  });
  
  // Calcular avg_deal_size
  Object.values(sellerStats).forEach(s => {
    s.avg_deal_size = s.total_deals > 0 ? s.total_gross / s.total_deals : 0;
  });
  
  log('[NORMALIZE] Quarters:', Object.keys(weeklyAgenda));
  log('[NORMALIZE] Sellers:', Object.keys(sellerStats).length);
  
  // fsrScorecard
  const fsrScorecard = Object.values(sellerStats).map(seller => ({
    name: seller.name,
    isActive: true,
    ipv: 0,
    ipvBreakdown: { result: 0, efficiency: 0, behavior: 0 },
    totalDeals: seller.total_deals,
    totalWon: 0,
    totalLost: 0,
    winRate: 0,
    revenueGross: seller.total_gross,
    revenue: seller.total_net,
    avgGross: seller.avg_deal_size,
    avgWinCycle: 0,
    avgLossCycle: 0,
    avgActivitiesWin: 0,
    topWinFactor: 'N/A',
    topLossCause: 'N/A',
    totalWonQuarter: 0,
    totalLostQuarter: 0
  }));
  
  // Won/Lost aggregations por quarter
  const wonAgg = [];
  const lostAgg = [];
  
  wonDeals.forEach(deal => {
    const quarter = deal.Fiscal_Q || deriveFiscalQuarter(deal.Data_Fechamento) || 'FY26-Q1';
    wonAgg.push({
      fiscalQ: quarter,
      Gross: deal.Gross || 0,
      gross: deal.Gross || 0,
      Net: deal.Net || 0,
      net: deal.Net || 0,
      Vendedor: deal.Vendedor || 'N/A',
      seller: deal.Vendedor || 'N/A',
      owner: deal.Vendedor || 'N/A',
      Opportunity_Name: deal.Oportunidade || 'Deal Ganho',
      opportunityName: deal.Oportunidade || 'Deal Ganho',
      Conta: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa || 'Conta não especificada',
      account: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa || 'Conta não especificada',
      Data_Fechamento: deal.Data_Fechamento,
      closeDate: deal.Data_Fechamento,
      Atividades: deal.Atividades ?? deal.activities ?? null,
      activities: deal.Atividades ?? deal.activities ?? null,
      Ciclo_dias: parseFloat(deal.Ciclo_dias) || 0,
      ciclo_dias: parseFloat(deal.Ciclo_dias) || 0,
      Tipo_Resultado: deal.Tipo_Resultado || '',
      Fatores_Sucesso: deal.Fatores_Sucesso || '',
      Win_Reason: deal.Win_Reason || deal.Fatores_Sucesso || deal.Causa_Raiz || 'Motivo não especificado',
      winReason: deal.Win_Reason || deal.Fatores_Sucesso || deal.Causa_Raiz || 'Motivo não especificado'
    });
  });
  
  lostDeals.forEach(deal => {
    const quarter = deal.Fiscal_Q || deriveFiscalQuarter(deal.Data_Fechamento) || 'FY26-Q1';
    lostAgg.push({
      fiscalQ: quarter,
      Gross: deal.Gross || 0,
      gross: deal.Gross || 0,
      Net: deal.Net || 0,
      net: deal.Net || 0,
      Vendedor: deal.Vendedor || 'N/A',
      seller: deal.Vendedor || 'N/A',
      owner: deal.Vendedor || 'N/A',
      Opportunity_Name: deal.Oportunidade || 'Deal Perdido',
      opportunityName: deal.Oportunidade || 'Deal Perdido',
      Conta: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa || 'Conta não especificada',
      account: deal.Conta || deal.Conta_Nome || deal.Account || deal.Cliente || deal.Empresa || 'Conta não especificada',
      Data_Fechamento: deal.Data_Fechamento,
      closeDate: deal.Data_Fechamento,
      Atividades: deal.Atividades ?? deal.activities ?? null,
      activities: deal.Atividades ?? deal.activities ?? null,
      Tipo_Resultado: deal.Tipo_Resultado || '',
      Causa_Raiz: deal.Causa_Raiz || '',
      Loss_Reason: deal.Causa_Raiz || deal.Loss_Reason || 'Motivo não especificado',
      lossReason: deal.Causa_Raiz || deal.Loss_Reason || 'Motivo não especificado',
      cause: deal.Causa_Raiz || 'OUTRO',
      Ciclo_dias: parseFloat(deal.Ciclo_dias) || 0,
      ciclo_dias: parseFloat(deal.Ciclo_dias) || 0
    });
  });
  
  // Forecast categories
  let commitGross = 0, upsideGross = 0, pipelineGross2 = 0;
  let commitCount = 0, upsideCount = 0, pipelineCount = 0;
  
  pipelineDeals.forEach(d => {
    if (d.Forecast_SF === 'Commit') {
      commitGross += d.Gross || 0;
      commitCount++;
    } else if (d.Forecast_SF === 'Upside') {
      upsideGross += d.Gross || 0;
      upsideCount++;
    } else {
      pipelineGross2 += d.Gross || 0;
      pipelineCount++;
    }
  });
  
  const totalGross = metrics.pipeline_total?.gross || 0;
  const totalNet = metrics.pipeline_total?.net || 0;
  const totalOpps = metrics.pipeline_total?.deals_count || 0;
  const netRatio = totalGross > 0 ? (totalNet / totalGross) : 0;
  const above50Gross = commitGross + upsideGross;
  const above50Count = commitCount + upsideCount;
  const above50Net = above50Gross * netRatio;
  
  // Extrair FY26 breakdown
  const fy26Breakdown = {};
  ['FY26-Q1', 'FY26-Q2', 'FY26-Q3', 'FY26-Q4'].forEach(q => {
    fy26Breakdown[q] = quarterBreakdown[q] || { gross: 0, net: 0, count: 0 };
  });
  
  const fy26Total = Object.values(fy26Breakdown).reduce((acc, q) => ({
    gross: acc.gross + q.gross,
    net: acc.net + q.net,
    count: acc.count + q.count
  }), { gross: 0, net: 0, count: 0 });
  
  // CloudAnalysis structure completa
  const cloudAnalysis = {
    status: 'success',
    timestamp: nowIso,
    pipeline_analysis: {
      executive: {
        pipeline_all: {
          deals_count: totalOpps,
          gross: totalGross,
          net: totalNet
        },
        pipeline_filtered: {
          deals_count: metrics.pipeline_filtered?.deals_count || 0,
          gross: metrics.pipeline_filtered?.gross || 0,
          net: metrics.pipeline_filtered?.net || 0,
          avg_confidence: metrics.pipeline_filtered?.avg_confidence || 0,
          avg_idle_days: metrics.pipeline_filtered?.avg_idle_days || 0,
          high_risk_idle: metrics.pipeline_filtered?.high_risk_idle || 0,
          avg_meddic: metrics.pipeline_filtered?.avg_meddic || 0,
          avg_bant: metrics.pipeline_filtered?.avg_bant || 0
        },
        pipeline_fy26: {
          deals_count: fy26Total.count,
          gross: fy26Total.gross,
          net: fy26Total.net
        },
        high_confidence: {
          deals_count: metrics.high_confidence?.deals_count || 0,
          gross: metrics.high_confidence?.gross || 0,
          net: metrics.high_confidence?.net || 0,
          avg_confidence: metrics.high_confidence?.avg_confidence || 0
        },
        pipeline_by_quarter: fy26Breakdown
      },
      sellers: Object.values(sellerStats)
    },
    closed_analysis: {
      win_rate_by_seller: {},
      loss_reasons: {},
      avg_cycle_won_days: metrics.closed_won?.avg_cycle_days || 0,
      avg_cycle_lost_days: metrics.closed_lost?.avg_cycle_days || 0,
      closed_quarter: {
        quarter: 'FY26-Q1',
        won: {
          deals_count: metrics.closed_won?.deals_count || 0,
          gross: metrics.closed_won?.gross || 0,
          net: metrics.closed_won?.net || 0,
          avg_cycle_days: metrics.closed_won?.avg_cycle_days || 0
        },
        lost: {
          deals_count: metrics.closed_lost?.deals_count || 0,
          gross: metrics.closed_lost?.gross || 0,
          net: metrics.closed_lost?.net || 0,
          avg_cycle_days: metrics.closed_lost?.avg_cycle_days || 0
        },
        win_rate: metrics.win_rate || 0,
        total_closed: (metrics.closed_won?.deals_count || 0) + (metrics.closed_lost?.deals_count || 0),
        forecast_specialist: {
          gross: 0,
          net: 0,
          deals_count: 0,
          commit_gross: 0,
          commit_net: 0,
          commit_deals: 0,
          upside_gross: 0,
          upside_net: 0,
          upside_deals: 0,
          by_fiscal_q: {}
        }
      }
    },
    aggregations: {
      by_forecast_category: [
        { category: 'COMMIT', count: commitCount, total_gross: commitGross, avg_confidence: 0.95 },
        { category: 'UPSIDE', count: upsideCount, total_gross: upsideGross, avg_confidence: 0.70 },
        { category: 'PIPELINE', count: pipelineCount, total_gross: pipelineGross2, avg_confidence: 0.30 }
      ],
      by_quarter: Object.entries(fy26Breakdown).map(([q, data]) => ({
        quarter: q,
        total_gross: data.gross || 0,
        total_net: data.net || 0,
        count: data.count || 0
      })),
      by_seller_quarter: []
    }
  };

  const result = {
    l10: {},
    executive: {
      pipeline_total: totalOpps,
      pipeline_gross: totalGross,
      won_total: metrics.closed_won?.deals_count || 0,
      won_gross: metrics.closed_won?.gross || 0,
      lost_total: metrics.closed_lost?.deals_count || 0,
      lost_gross: metrics.closed_lost?.gross || 0
    },
    fsrScorecard: fsrScorecard,
    fsrMetrics: {},
    insights: { 
      topWinFactors: [], 
      topLossCauses: [] 
    },
    aiAnalysis: {},
    weeklyAgenda: weeklyAgenda,
    wordClouds: { 
      winTypes: [], winLabels: [], 
      lossTypes: [], lossLabels: [], 
      riskFlags: [], actionLabels: [] 
    },
    wonWordCloudDeals: wonDealsWordCloud,
    lostWordCloudDeals: lostDealsWordCloud,
    wonAgg: wonAgg,
    lostAgg: lostAgg,
    cloudMetrics: {
      avgConfidence: 0.5,
      above50Gross: above50Gross,
      above50Net: above50Net,
      above50Count: above50Count,
      commitGross: commitGross,
      upsideGross: upsideGross,
      pipelineGross: pipelineGross2
    },
    cloudAnalysis: cloudAnalysis,
    updatedAt: nowIso,
    quarterLabel: 'FY26-Q1'
  };

  // Insights do backend (nao misturar com wordcloud)
  result.insights = cloud?.insights || { topWinFactors: [], topLossCauses: [] };
  
  // Processar word clouds dos deals
  // Process Sales Specialist data
  const salesSpecialistDeals = cloud?.salesSpecialist || [];
  const salesSpecialistByStatus = { COMMIT: [], UPSIDE: [] };
  const salesSpecialistByVendor = {};
  let ssCommitGross = 0, ssCommitNet = 0, ssCommitCount = 0;
  let ssUpsideGross = 0, ssUpsideNet = 0, ssUpsideCount = 0;
  
  salesSpecialistDeals.forEach(deal => {
    // Usa forecast_status (segunda coluna Status da planilha: UPSIDE/COMMIT)
    const status = (deal.forecast_status || deal.Status || 'UPSIDE').toUpperCase();
    const gross = parseFloat(deal.booking_total_gross) || 0;
    const net = parseFloat(deal.booking_total_net) || 0;
    const vendedor = deal.vendedor || 'Unknown';
    
    if (status.includes('COMMIT')) {
      ssCommitGross += gross;
      ssCommitNet += net;
      ssCommitCount++;
      salesSpecialistByStatus.COMMIT.push(deal);
    } else if (status.includes('UPSIDE')) {
      ssUpsideGross += gross;
      ssUpsideNet += net;
      ssUpsideCount++;
      salesSpecialistByStatus.UPSIDE.push(deal);
    }
    
    // Aggregate by vendor
    if (!salesSpecialistByVendor[vendedor]) {
      salesSpecialistByVendor[vendedor] = { deals: 0, gross: 0, net: 0 };
    }
    salesSpecialistByVendor[vendedor].deals++;
    salesSpecialistByVendor[vendedor].gross += gross;
    salesSpecialistByVendor[vendedor].net += net;
  });
  
  // Add to result
  result.salesSpecialist = {
    total: {
      deals: salesSpecialistDeals.length,
      gross: ssCommitGross + ssUpsideGross,
      net: ssCommitNet + ssUpsideNet
    },
    byStatus: {
      COMMIT: { deals: ssCommitCount, gross: ssCommitGross, net: ssCommitNet },
      UPSIDE: { deals: ssUpsideCount, gross: ssUpsideGross, net: ssUpsideNet }
    },
    byVendor: salesSpecialistByVendor,
    deals: salesSpecialistDeals
  };
  
  log('[WORDCLOUD] Processing word clouds from deals...');
  log('[WORDCLOUD] Won deals (word cloud):', wonDealsWordCloud.length);
  log('[WORDCLOUD] Lost deals (word cloud):', lostDealsWordCloud.length);
  log('[WORDCLOUD] Pipeline deals:', pipelineDeals.length);
  log('[DEBUG] CloudAnalysis metrics:', {
    pipeline_total: cloudAnalysis?.pipeline_analysis?.metrics?.pipeline_total,
    pipeline_filtered: cloudAnalysis?.pipeline_analysis?.metrics?.pipeline_filtered,
    closed_won: cloudAnalysis?.pipeline_analysis?.metrics?.closed_won,
    closed_lost: cloudAnalysis?.pipeline_analysis?.metrics?.closed_lost
  });
  const wordClouds = processWordClouds(wonDealsWordCloud, lostDealsWordCloud, pipelineDeals);
  log('[WORDCLOUD] Generated word clouds:', {
    winTypes: wordClouds.winTypes.length,
    winLabels: wordClouds.winLabels.length,
    lossTypes: wordClouds.lossTypes.length,
    lossLabels: wordClouds.lossLabels.length,
    riskFlags: wordClouds.riskFlags.length,
    actionLabels: wordClouds.actionLabels.length
  });
  result.wordClouds = wordClouds;
  
  // AI Insights from patterns endpoint
  result.aiInsights = cloud?.patterns || {
    win_insights: '',
    loss_insights: '',
    recommendations: [],
    status: 'unavailable'
  };
  
  // TODO: Integração futura com Gemini para análise avançada
  // Enviar para API: POST /api/analyze-patterns com {wonDeals, lostDeals}
  // Retorno esperado: { winInsights: "...", lossInsights: "...", recommendations: [...] }
  
  return result;
}

function processWordClouds(wonDeals, lostDeals, pipelineDeals) {
  // Contadores de frequência
  const winTypeCount = {};
  const winLabelCount = {};
  const lossTypeCount = {};
  const lossLabelCount = {};
  const riskFlagCount = {};
  const actionLabelCount = {};
  
  // Palavras-chave para extrair insights (stopwords invertidas - o que queremos)
  const keyPhrases = [
    'base instalada', 'relacionamento', 'confiança', 'champion', 'sponsor',
    'orçamento', 'budget', 'timing', 'mandato', 'urgência', 'necessidade',
    'competidor', 'concorrência', 'preço', 'valor', 'roi',
    'qualificação', 'discovery', 'meddic', 'bant', 'engajamento',
    'decisor', 'economic buyer', 'stakeholder', 'processo',
    'ata', 'pregão', 'licitação', 'edital', 'setor público'
  ];
  
  // Função para extrair keywords de texto longo
  const extractKeywords = (text, maxKeywords = 3) => {
    if (!text) return [];
    const textLower = text.toLowerCase();
    const found = [];
    
    keyPhrases.forEach(phrase => {
      if (textLower.includes(phrase)) {
        found.push(phrase);
      }
    });
    
    return found.slice(0, maxKeywords);
  };
  
  // Processar deals ganhos
  wonDeals.forEach(deal => {
    // Tipo_Resultado
    if (deal.Tipo_Resultado) {
      winTypeCount[deal.Tipo_Resultado] = (winTypeCount[deal.Tipo_Resultado] || 0) + 1;
    }
    // Extrair keywords dos Fatores_Sucesso
    if (deal.Fatores_Sucesso) {
      const keywords = extractKeywords(deal.Fatores_Sucesso, 5);
      keywords.forEach(keyword => {
        winLabelCount[keyword] = (winLabelCount[keyword] || 0) + 1;
      });
    }
  });
  
  // Processar deals perdidos
  lostDeals.forEach(deal => {
    // Tipo_Resultado
    if (deal.Tipo_Resultado) {
      lossTypeCount[deal.Tipo_Resultado] = (lossTypeCount[deal.Tipo_Resultado] || 0) + 1;
    }
    // Extrair keywords da Causa_Raiz
    if (deal.Causa_Raiz) {
      const keywords = extractKeywords(deal.Causa_Raiz, 5);
      keywords.forEach(keyword => {
        lossLabelCount[keyword] = (lossLabelCount[keyword] || 0) + 1;
      });
    }
  });
  
  const normalizeConfidence = (value) => {
    let conf = parseFloat(value);
    if (!Number.isFinite(conf)) return 0;
    if (conf > 0 && conf <= 1) conf = conf * 100;
    return conf;
  };

  // Processar pipeline para flags de risco
  pipelineDeals.forEach(deal => {
    // Analisar confiança baixa
    const confidence = normalizeConfidence(deal.Confianca ?? deal.confidence ?? deal.Confidence);
    if (confidence < 30 && confidence > 0) {
      riskFlagCount['Confiança Baixa (<30%)'] = (riskFlagCount['Confiança Baixa (<30%)'] || 0) + 1;
    }
    
    // Data prevista atrasada
    if (deal.Data_Prevista) {
      const closeDate = new Date(deal.Data_Prevista);
      const today = new Date();
      if (closeDate < today) {
        riskFlagCount['Data Prevista Vencida'] = (riskFlagCount['Data Prevista Vencida'] || 0) + 1;
      }
    }
    
    // Deal high value sem movimento
    if (deal.Gross > 100000 && confidence > 0 && confidence < 50) {
      riskFlagCount['High Value + Baixa Confiança'] = (riskFlagCount['High Value + Baixa Confiança'] || 0) + 1;
    }
  });
  
  // Gerar ações recomendadas baseadas no pipeline
  pipelineDeals.forEach(deal => {
    const confidence = normalizeConfidence(deal.Confianca ?? deal.confidence ?? deal.Confidence);
    
    if (confidence > 0 && confidence < 30) {
      actionLabelCount['Qualificar Melhor (MEDDIC)'] = (actionLabelCount['Qualificar Melhor (MEDDIC)'] || 0) + 1;
    }
    if (confidence >= 30 && confidence < 50) {
      actionLabelCount['Engajar Champion'] = (actionLabelCount['Engajar Champion'] || 0) + 1;
    }
    if (confidence >= 50 && confidence < 80) {
      actionLabelCount['Avançar para Fechamento'] = (actionLabelCount['Avançar para Fechamento'] || 0) + 1;
    }
    if (deal.Fase_Atual === 'Propuesta' || deal.Fase_Atual === 'Proposta') {
      actionLabelCount['Enviar Proposta/Follow-up'] = (actionLabelCount['Enviar Proposta/Follow-up'] || 0) + 1;
    }
  });
  
  // Converter para arrays ordenados por frequência
  const toArray = (obj) => Object.entries(obj)
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value);
  
  return {
    winTypes: toArray(winTypeCount),
    winLabels: toArray(winLabelCount),
    lossTypes: toArray(lossTypeCount),
    lossLabels: toArray(lossLabelCount),
    riskFlags: toArray(riskFlagCount),
    actionLabels: toArray(actionLabelCount)
  };
}

