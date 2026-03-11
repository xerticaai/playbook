// Comunicação com a API: fetch, cache, loadDashboardData, normalizeCloudResponse, processWordClouds
async function fetchJsonNoCache(url) {
  const stripTsParam = (rawUrl) => {
    const cleaned = String(rawUrl || '')
      .replace(/([?&])_ts=\d+/g, '$1')
      .replace(/[?&]$/, '')
      .replace('?&', '?')
      .replace('&&', '&');
    return cleaned;
  };

  const cleanUrl = stripTsParam(url);
  const buildUrlWithTs = () => `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}_ts=${Date.now()}`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const cacheBust = buildUrlWithTs();
    const response = await fetch(cacheBust, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    const text = await response.text();
    const throttled = [403, 429, 502, 503, 504].includes(response.status)
      || /rate\s+exceeded/i.test(text || '');

    if (!response.ok) {
      if (throttled && attempt < maxAttempts) {
        const waitMs = attempt * 1000;
        log(`[API RETRY] Instabilidade em ${cleanUrl}. Tentativa ${attempt + 1}/${maxAttempts} em ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error(`HTTP ${response.status} de ${url}: ${(text || '').slice(0, 160)}`);
    }

    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      if (throttled && attempt < maxAttempts) {
        const waitMs = attempt * 1000;
        log(`[API RETRY] Resposta de instabilidade nao-JSON em ${cleanUrl}. Tentativa ${attempt + 1}/${maxAttempts} em ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error(`Resposta nao-JSON de ${url}: ${(text || '').slice(0, 160)}`);
    }

    return data;
  }

  throw new Error(`Falha ao carregar ${url} apos retries`);
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
  
  // Busca da API (fetchJsonNoCache já aplica cache-bust com _ts sem duplicar)
  log(`[CACHE] 🌐 Fetch: ${url.substring(0, 80)}...`);
  const data = await fetchJsonNoCache(url);
  
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

async function loadDashboardData(forceRefresh = false) {
  try {
    log('[DASHBOARD] ========== INÍCIO DO CARREGAMENTO ==========');
    if (forceRefresh) {
      clearDataCache();
      log('[DASHBOARD] 🗑️ Force refresh: cache limpo');
    }
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
          portfolio: '',
          portfolio_fdm: '',
          status_gtm: '',
          motivo_status_gtm: '',
          status_cliente: '',
          flag_aprovacao_previa: '',
          sales_specialist_envolvido: '',
          elegibilidade_ss: '',
          status_governanca_ss: ''
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
    // Se for forçar refresh, adicionar nocache=true para bypassar o cache do servidor (TTL 120s)
    const withNoCache = (requestUrl) => {
      if (!forceRefresh) return requestUrl;
      return `${requestUrl}${requestUrl.includes('?') ? '&' : '?'}nocache=true`;
    };

    const [metrics, pipelineData, prioritiesData, actionsData, wonDataCached, lostDataCached, patternsData, salesSpecialistData, insightsRagData, fallbackPipelineData, fallbackWonData, fallbackLostData] = await Promise.all([
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/metrics${queryString}`)),
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/pipeline?limit=500${queryString ? '&' + params.toString() : ''}`)),
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/priorities?limit=100${queryString ? '&' + params.toString() : ''}`)),
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/actions?urgencia=ALTA&limit=50${queryString ? '&' + params.toString() : ''}`)),
      fetchWithCache(wonUrl + (forceRefresh ? (wonUrl.includes('?') ? '&' : '?') + 'nocache=true' : ''), `cache_won_${cacheKey}`, queryString ? 1 : 2),
      fetchWithCache(lostUrl + (forceRefresh ? (lostUrl.includes('?') ? '&' : '?') + 'nocache=true' : ''), `cache_lost_${cacheKey}`, queryString ? 1 : 2),
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/analyze-patterns${queryString}`)),
      fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/sales-specialist${queryString}`)),
      insightsRagPromise,
      needsTopOppsFallback ? fetchJsonNoCache(withNoCache(`${API_BASE_URL}/api/pipeline?limit=500`)) : Promise.resolve([]),
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
    if (typeof buildStagnantCard === 'function') setTimeout(buildStagnantCard, 200);

    // Restaura o estado do toggle Gross/Net após re-render
    // Render always writes Gross-first; re-apply Net mode if active
    if (window.execDisplayMode === 'booking_net' && typeof applyExecDisplayMode === 'function') {
      setTimeout(function() { applyExecDisplayMode('net'); }, 80);
    }
    if (typeof updateExecutiveHighlightToggleUI === 'function') {
      updateExecutiveHighlightToggleUI(window.execDisplayMode || 'booking_gross');
    }
    // Carregar dados ERP se modo ativo for gross ou net
    if (window.execDisplayMode === 'gross' || window.execDisplayMode === 'net') {
      loadErpData();
    }

    if (document.querySelector('.exec-tab-content[data-content="resumo-quarter"]')?.classList.contains('active') && typeof window.loadQuarterSummary === 'function') {
      window.loadQuarterSummary();
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
      ,
      Acao_Sugerida: deal.Acao_Sugerida || deal.Acao_Recomendada || deal.acao_recomendada || deal.recomendacao_acao || deal.proxima_acao || '',
      acao_recomendada: deal.acao_recomendada || deal.recomendacao_acao || deal.Acao_Recomendada || deal.Acao_Sugerida || deal.proxima_acao || '',
      // Campos para drilldown — detail panel
      Ciclo_dias: deal.Ciclo_dias || deal.ciclo_dias || '',
      MEDDIC_Score: deal.MEDDIC_Score || deal.meddic_score || '',
      BANT_Score: deal.BANT_Score || deal.bant_score || '',
      Justificativa_IA: deal.Justificativa_IA || deal.justificativa_ia || '',
      Motivo_Confianca: deal.Motivo_Confianca || deal.motivo_confianca || '',
      Risco_Principal: deal.Risco_Principal || deal.risco_principal || '',
      Gaps_Identificados: deal.Gaps_Identificados || deal.gaps_identificados || ''
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
      winReason: deal.Win_Reason || deal.Fatores_Sucesso || deal.Causa_Raiz || 'Motivo não especificado',
      Vertical_IA: deal.Vertical_IA || '',
      Sub_vertical_IA: deal.Sub_vertical_IA || '',
      Sub_sub_vertical_IA: deal.Sub_sub_vertical_IA || '',
      Segmento_consolidado: deal.Segmento_consolidado || '',
      Portfolio_FDM: deal.Portfolio_FDM || '',
      Tipo_Oportunidade: deal.Tipo_Oportunidade || deal.tipo_oportunidade || '',
      Processo: deal.Processo || deal.processo || '',
      Estado_Provincia_de_cobranca: deal.Estado_Provincia_de_cobranca || '',
      Cidade_de_cobranca: deal.Cidade_de_cobranca || '',
      Estado_Cidade_Detectado: deal.Estado_Cidade_Detectado || '',
      Fase_Atual: deal.Fase_Atual || deal.stage || '',
      Confianca: parseFloat(deal.Confianca) || 0,
      BANT_Score: parseFloat(deal.BANT_Score) || 0,
      MEDDIC_Score: parseFloat(deal.MEDDIC_Score) || 0,
      Risco_Score: parseFloat(deal.Risco_Score) || 0,
      Idle_Dias: parseFloat(deal.Idle_Dias) || 0,
      Forecast_SF: deal.Forecast_SF || '',
      Forecast_IA: deal.Forecast_IA || '',
      Produtos: deal.Produtos || '',
      Perfil: deal.Perfil || '',
      Oportunidade: deal.Oportunidade || deal.Opportunity_Name || '',
      Acao_Sugerida: deal.Acao_Sugerida || deal.Acao_Recomendada || deal.acao_recomendada || deal.recomendacao_acao || deal.proxima_acao || '',
      acao_recomendada: deal.acao_recomendada || deal.recomendacao_acao || deal.Acao_Recomendada || deal.Acao_Sugerida || deal.proxima_acao || ''
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
      ciclo_dias: parseFloat(deal.Ciclo_dias) || 0,
      Vertical_IA: deal.Vertical_IA || '',
      Sub_vertical_IA: deal.Sub_vertical_IA || '',
      Sub_sub_vertical_IA: deal.Sub_sub_vertical_IA || '',
      Segmento_consolidado: deal.Segmento_consolidado || '',
      Portfolio_FDM: deal.Portfolio_FDM || '',
      Tipo_Oportunidade: deal.Tipo_Oportunidade || deal.tipo_oportunidade || '',
      Processo: deal.Processo || deal.processo || '',
      Estado_Provincia_de_cobranca: deal.Estado_Provincia_de_cobranca || '',
      Cidade_de_cobranca: deal.Cidade_de_cobranca || '',
      Estado_Cidade_Detectado: deal.Estado_Cidade_Detectado || '',
      Fase_Atual: deal.Fase_Atual || deal.stage || '',
      Confianca: parseFloat(deal.Confianca) || 0,
      BANT_Score: parseFloat(deal.BANT_Score) || 0,
      MEDDIC_Score: parseFloat(deal.MEDDIC_Score) || 0,
      Risco_Score: parseFloat(deal.Risco_Score) || 0,
      Idle_Dias: parseFloat(deal.Idle_Dias) || 0,
      Forecast_SF: deal.Forecast_SF || '',
      Forecast_IA: deal.Forecast_IA || '',
      Produtos: deal.Produtos || '',
      Perfil: deal.Perfil || '',
      Oportunidade: deal.Oportunidade || deal.Opportunity_Name || '',
      Acao_Sugerida: deal.Acao_Sugerida || deal.Acao_Recomendada || deal.acao_recomendada || deal.recomendacao_acao || deal.proxima_acao || '',
      acao_recomendada: deal.acao_recomendada || deal.recomendacao_acao || deal.Acao_Recomendada || deal.Acao_Sugerida || deal.proxima_acao || '',
      Evitavel: deal.Evitavel || ''
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

  // Dados de prioridades e ações (do backend, preservados no result)
  result.priorities = cloud?.priorities || [];
  result.actions = cloud?.actions || [];

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
    // Fallback: opportunity_status (campo correto do backend) — deal.Status não existe na resposta
    const status = (deal.forecast_status || deal.opportunity_status || 'UPSIDE').toUpperCase();
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

// ── Sprint E: ERP Revenue (Gross / Net mode) ─────────────────────────────────

let _erpChartSemanal = null;
let _erpChartMensal  = null;
let _erpAnalyticsWeekly = null;
let _erpAnalyticsPayStatus = null;
let _erpAnalyticsProducts = null;
let _erpAnalyticsAttainment = null;
let _erpAnalyticsCommercial = null;
let _erpAnalyticsFamily = null;
let _erpAnalyticsQuarter = null;
let _erpAnalyticsSegment = null;
let _erpAnalyticsOpportunityTypeLine = null;

const ERP_MULTI_FILTER_CONFIG = [
  { id: 'erp-portfolio-filter', label: 'Portfólio' },
  { id: 'erp-payment-status-filter', label: 'Status Pagamento' },
  { id: 'erp-product-filter', label: 'Produto' },
  { id: 'erp-opportunity-type-line-filter', label: 'Tipo Oportunidade' },
  { id: 'erp-segment-filter', label: 'Segmento' }
];

function ensureErpSelectionsState() {
  if (!window.erpFilterSelections) window.erpFilterSelections = {};
  ERP_MULTI_FILTER_CONFIG.forEach(({ id }) => {
    if (!Array.isArray(window.erpFilterSelections[id])) {
      window.erpFilterSelections[id] = [];
    }
  });
}

function updateErpFilterTriggerText(selectId) {
  ensureErpSelectionsState();
  const target = document.getElementById(`${selectId}-selected-text`);
  if (!target) return;
  const cfg = ERP_MULTI_FILTER_CONFIG.find((item) => item.id === selectId);
  const label = cfg?.label || 'Filtro';
  const selections = window.erpFilterSelections[selectId] || [];
  if (!selections.length) {
    target.textContent = `Todos (${label})`;
    target.style.color = '#ffffff';
    return;
  }
  if (selections.length === 1) {
    target.textContent = selections[0];
    target.style.color = 'var(--primary-cyan)';
    return;
  }
  target.textContent = `${selections.length} selecionados`;
  target.style.color = 'var(--primary-cyan)';
}

function syncErpHiddenSelect(selectId, options) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const selectedValues = window.erpFilterSelections?.[selectId] || [];
  const values = Array.from(new Set((options || []).map((item) => String(item || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = values.map((value) => {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const selected = selectedValues.includes(value) ? ' selected' : '';
    return `<option value="${escaped}"${selected}>${escaped}</option>`;
  }).join('');
}

function renderErpFilterOptions(selectId, options) {
  ensureErpSelectionsState();
  const group = document.getElementById(`${selectId}-options-group`);
  if (!group) return;
  const cfg = ERP_MULTI_FILTER_CONFIG.find((item) => item.id === selectId);
  const titleLabel = cfg?.label || 'Filtro';

  const normalized = Array.from(new Set((options || []).map((item) => String(item || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const prev = window.erpFilterSelections[selectId] || [];
  const validSet = new Set(normalized);
  window.erpFilterSelections[selectId] = prev.filter((value) => validSet.has(value));
  const selectedSet = new Set(window.erpFilterSelections[selectId]);

  if (!normalized.length) {
    group.innerHTML = `
      <div class="multi-select-group-title">${titleLabel}</div>
      <div class="multi-select-option" style="cursor: default; opacity: 0.75;">
        <span>Sem dados disponíveis</span>
      </div>
    `;
    syncErpHiddenSelect(selectId, []);
    updateErpFilterTriggerText(selectId);
    return;
  }

  const rows = normalized.map((value) => {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const checked = selectedSet.has(value) ? 'checked' : '';
    return `
      <div class="multi-select-option">
        <input type="checkbox" id="${selectId}-${escaped}" value="${escaped}" ${checked} onchange="window.onErpFilterOptionChange('${selectId}')" />
        <label for="${selectId}-${escaped}">
          <span>${escaped}</span>
        </label>
      </div>
    `;
  }).join('');

  group.innerHTML = `<div class="multi-select-group-title">${titleLabel}</div>${rows}`;
  syncErpHiddenSelect(selectId, normalized);
  updateErpFilterTriggerText(selectId);
}

function initErpMultiSelects() {
  ensureErpSelectionsState();
  ERP_MULTI_FILTER_CONFIG.forEach(({ id, label }) => {
    const select = document.getElementById(id);
    if (!select || select.dataset.multiInit === '1') return;
    select.style.display = 'none';

    const container = document.createElement('div');
    container.className = 'multi-select-container generic-filter-multi-select';
    container.id = `${id}-multi`;
    container.style.minWidth = '220px';

    container.innerHTML = `
      <div class="multi-select-trigger" onclick="window.toggleErpFilterDropdown('${id}')">
        <span id="${id}-selected-text">Todos (${label})</span>
      </div>
      <div class="multi-select-dropdown" id="${id}-dropdown">
        <div class="multi-select-search-wrap">
          <input
            type="text"
            class="multi-select-search"
            id="${id}-search"
            placeholder="Buscar..."
            autocomplete="off"
            oninput="window.filterErpFilterOptions('${id}', this.value)"
            onclick="event.stopPropagation()"
          />
        </div>
        <div class="multi-select-group" id="${id}-options-group">
          <div class="multi-select-group-title">${label}</div>
        </div>
        <div class="multi-select-actions">
          <button class="multi-select-btn" onclick="window.selectAllErpFilterOptions('${id}')">Todos</button>
          <button class="multi-select-btn" onclick="window.clearErpFilterOptions('${id}')">Limpar</button>
        </div>
      </div>
    `;

    select.insertAdjacentElement('afterend', container);
    select.dataset.multiInit = '1';

    // Se o <select> já tem opções fixas no HTML, popula o componente imediatamente
    const existingOptions = Array.from(select.options).map((o) => o.value).filter(Boolean);
    if (existingOptions.length) {
      renderErpFilterOptions(id, existingOptions);
    } else {
      updateErpFilterTriggerText(id);
    }
  });
}

window.toggleErpFilterDropdown = function (selectId) {
  const container = document.getElementById(`${selectId}-multi`);
  const trigger = container?.querySelector('.multi-select-trigger');
  const dropdown = document.getElementById(`${selectId}-dropdown`);
  if (!container || !trigger || !dropdown) return;

  const isOpening = !trigger.classList.contains('open');
  trigger.classList.toggle('open');
  dropdown.classList.toggle('open');

  if (isOpening) {
    setTimeout(() => {
      const searchInput = document.getElementById(`${selectId}-search`);
      if (searchInput) searchInput.focus();
    }, 50);
  } else {
    const searchInput = document.getElementById(`${selectId}-search`);
    if (searchInput) {
      searchInput.value = '';
      window.filterErpFilterOptions(selectId, '');
    }
  }
};

window.filterErpFilterOptions = function (selectId, query) {
  const group = document.getElementById(`${selectId}-options-group`);
  if (!group) return;
  const q = String(query || '').trim().toLowerCase();
  const options = group.querySelectorAll('.multi-select-option');
  let visibleCount = 0;
  options.forEach((opt) => {
    const label = opt.querySelector('label span')?.textContent?.toLowerCase() || '';
    const matches = !q || label.includes(q);
    opt.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  let noResults = group.querySelector('.erp-no-results');
  if (!visibleCount) {
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.className = 'multi-select-no-results erp-no-results';
      noResults.textContent = 'Nenhum resultado';
      group.appendChild(noResults);
    }
    noResults.style.display = '';
  } else if (noResults) {
    noResults.style.display = 'none';
  }
};

window.onErpFilterOptionChange = function (selectId) {
  ensureErpSelectionsState();
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  window.erpFilterSelections[selectId] = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  const currentOptions = Array.from(checkboxes).map((cb) => cb.value);
  syncErpHiddenSelect(selectId, currentOptions);
  updateErpFilterTriggerText(selectId);
  if (typeof updateGlobalFiltersPanelUI === 'function') updateGlobalFiltersPanelUI();
  loadErpData();
};

window.selectAllErpFilterOptions = function (selectId) {
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  checkboxes.forEach((cb) => { cb.checked = true; });
  window.onErpFilterOptionChange(selectId);
};

window.clearErpFilterOptions = function (selectId) {
  const checkboxes = document.querySelectorAll(`#${selectId}-options-group input[type="checkbox"]`);
  checkboxes.forEach((cb) => { cb.checked = false; });
  window.onErpFilterOptionChange(selectId);
};

window.resetErpFilterSelections = function () {
  ensureErpSelectionsState();
  ERP_MULTI_FILTER_CONFIG.forEach(({ id }) => {
    window.erpFilterSelections[id] = [];
    syncErpHiddenSelect(id, []);
    updateErpFilterTriggerText(id);
  });
};

function getMultiSelectCsv(selectId) {
  if (Array.isArray(window.erpFilterSelections?.[selectId])) {
    return window.erpFilterSelections[selectId].join(',');
  }
  const select = document.getElementById(selectId);
  if (!select) return '';
  return Array.from(select.selectedOptions || [])
    .map((opt) => String(opt.value || '').trim())
    .filter(Boolean)
    .join(',');
}

function populateErpMultiSelectOptions(selectId, values) {
  initErpMultiSelects();
  renderErpFilterOptions(selectId, values);
}

function ensureRevenueChartExpandButtons() {
  const cards = document.querySelectorAll('#revenue-graficos-grid .card');
  cards.forEach((card) => {
    if (!card || card.dataset.expandBtnReady === '1') return;
    const canvas = card.querySelector('.chart-wrapper canvas');
    if (!canvas) return;
    card.dataset.expandBtnReady = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-expand-btn';
    btn.textContent = 'Expandir';
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (!card.requestFullscreen) return;
      if (document.fullscreenElement === card) {
        document.exitFullscreen && document.exitFullscreen();
        return;
      }
      card.requestFullscreen();
    });
    card.appendChild(btn);
  });
}

async function loadErpData() {
  const year      = document.getElementById('year-filter')?.value || '';
  const quarter   = document.getElementById('quarter-filter')?.value || '';
  const month     = document.getElementById('month-filter')?.value || '';
  const dateStart = document.getElementById('date-start-filter')?.value || '';
  const dateEnd   = document.getElementById('date-end-filter')?.value || '';
  const portfolio = getMultiSelectCsv('erp-portfolio-filter');
  const statusPg  = getMultiSelectCsv('erp-payment-status-filter');
  const produto   = getMultiSelectCsv('erp-product-filter');
  const tipoOppLine = getMultiSelectCsv('erp-opportunity-type-line-filter');
  const segmento  = getMultiSelectCsv('erp-segment-filter');

  if (typeof updateGlobalFiltersPanelUI === 'function') {
    updateGlobalFiltersPanelUI();
  }

  const params = new URLSearchParams();
  if (year)      params.set('year', year);
  if (quarter)   params.set('quarter', quarter);
  if (month)     params.set('month', month);
  if (dateStart) params.set('date_start', dateStart);
  if (dateEnd)   params.set('date_end', dateEnd);
  if (portfolio) params.set('portfolio', portfolio);
  if (statusPg)  params.set('status_pagamento', statusPg);
  if (produto) params.set('produto', produto);
  if (tipoOppLine) params.set('tipo_oportunidade_line', tipoOppLine);
  if (segmento) params.set('segmento', segmento);

  try {
    initErpMultiSelects();
    const qs = params.toString() ? '?' + params.toString() : '';
    const mode = (window.execDisplayMode === 'net') ? 'net' : 'gross';
    const topQs = params.toString() ? `?${params.toString()}&mode=${mode}` : `?mode=${mode}`;
    const [rev, att, top] = await Promise.all([
      fetchJsonNoCache(`${API_BASE_URL}/api/revenue/weekly${qs}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/attainment${qs}`),
      fetchJsonNoCache(`${API_BASE_URL}/api/revenue/top${topQs}`)
    ]);

    const totalLinhas = Number(rev?.totais?.linhas || 0);
    if (totalLinhas === 0) {
      const noDataKey = `${window.execDisplayMode || 'gross'}|${qs}`;
      if (window.__erpNoDataToastKey !== noDataKey) {
        window.__erpNoDataToastKey = noDataKey;
        if (typeof showToast === 'function') {
          showToast('Revenue sem dados para o período/filtros selecionados. Ajuste período, status ou use Limpar.', 'info');
        }
      }
    }

    renderErpKpiCards(rev, att);
    bindErpKpiDrilldownCards();
    populateErpMultiSelectOptions('erp-product-filter', (rev?.por_produto || []).map((item) => item.produto || ''));
    populateErpMultiSelectOptions('erp-opportunity-type-line-filter', (rev?.por_tipo_oportunidade_line || []).map((item) => item.tipo_oportunidade_line || ''));
    populateErpMultiSelectOptions('erp-segment-filter', (rev?.por_segmento || []).map((item) => item.segmento || ''));
    // Legacy mini-charts (erp-chart-semanal/mensal) desativados para evitar duplicidade visual.
    renderRevenueAnalysisCharts(rev, att);
    ensureRevenueChartExpandButtons();
    renderErpTopTable(top, mode);

    // Revenue IA — armazena dados para uso pela Análise IA e renderiza
    window._erpLastData = { rev, att, top };
    if (typeof renderIARevenue === 'function') renderIARevenue({ rev, att, top });

    if (document.querySelector('.exec-tab-content[data-content="resumo-quarter"]')?.classList.contains('active') && typeof window.loadQuarterSummary === 'function') {
      window.loadQuarterSummary();
    }
  } catch (e) {
    log('[ERP] Erro ao carregar dados ERP:', e);
  }
}

function bindErpKpiDrilldownCards() {
  const root = document.getElementById('erp-kpi-section');
  if (!root) return;

  const resolveCardMetric = (card) => {
    if (!card) return '';
    const prioritySelectors = ['#erp-attainment-pct', '#erp-total', '#erp-pago', '#erp-pendente'];
    for (const selector of prioritySelectors) {
      if (card.querySelector(selector)) return selector.slice(1);
    }
    return '';
  };

  root.querySelectorAll('.kpi-card').forEach((card) => {
    const metricId = resolveCardMetric(card);
    if (!metricId) return;
    if (card.dataset.erpDdBound === '1') return;

    card.dataset.erpDdBound = '1';
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const isNetMode = window.execDisplayMode === 'net';
      const mode = isNetMode ? 'Net Revenue' : 'Gross Revenue';

      if (metricId === 'erp-pago') {
        openRevenueExpandedDrilldown({
          title: `Revenue Pago · ${mode}`,
          dimension: 'all',
          value: 'all',
          statusPagamento: 'Pagada,Intercompañia'
        });
        return;
      }

      if (metricId === 'erp-pendente') {
        openRevenueExpandedDrilldown({
          title: `Revenue Pendente · ${mode}`,
          dimension: 'all',
          value: 'all',
          statusPagamento: 'Pendiente,NAO_INFORMADO'
        });
        return;
      }

      const title = metricId === 'erp-attainment-pct'
        ? `Attainment · ${mode}`
        : `Revenue Total · ${mode}`;

      const attainmentStatus = (metricId === 'erp-attainment-pct' && isNetMode)
        ? 'Pagada,Intercompañia'
        : '';

      openRevenueExpandedDrilldown({
        title,
        dimension: 'all',
        value: 'all',
        statusPagamento: attainmentStatus
      });
    });
  });
}

async function openRevenueExpandedDrilldown({ title, dimension, value, statusPagamento = '' }) {
  const dimensionValue = String(value || '').trim();
  if (!dimension || !dimensionValue) {
    if (typeof showToast === 'function') {
      showToast('Drilldown inválido: dimensão ou valor ausente.', 'warning');
    }
    return;
  }

  const params = new URLSearchParams();
  const year = document.getElementById('year-filter')?.value || '';
  const quarter = document.getElementById('quarter-filter')?.value || '';
  const month = document.getElementById('month-filter')?.value || '';
  const dateStart = document.getElementById('date-start-filter')?.value || '';
  const dateEnd = document.getElementById('date-end-filter')?.value || '';
  const portfolio = getMultiSelectCsv('erp-portfolio-filter');
  const statusUI = getMultiSelectCsv('erp-payment-status-filter');
  const produto = getMultiSelectCsv('erp-product-filter');
  const tipoOppLine = getMultiSelectCsv('erp-opportunity-type-line-filter');
  const segmento = getMultiSelectCsv('erp-segment-filter');

  if (year) params.set('year', year);
  if (quarter) params.set('quarter', quarter);
  if (month) params.set('month', month);
  if (dateStart) params.set('date_start', dateStart);
  if (dateEnd) params.set('date_end', dateEnd);
  if (portfolio) params.set('portfolio', portfolio);
  if (produto) params.set('produto', produto);
  if (tipoOppLine) params.set('tipo_oportunidade_line', tipoOppLine);
  if (segmento) params.set('segmento', segmento);
  if (statusUI) params.set('status_pagamento', statusUI);

  params.set('dimension', dimension);
  params.set('value', dimensionValue);
  if (statusPagamento) params.set('status_pagamento', statusPagamento);
  params.set('limit', '300');

  try {
    const data = await fetchJsonNoCache(`${API_BASE_URL}/api/revenue/drilldown?${params.toString()}`);
    const rows = (data?.items || []).map((r) => ({
      source: 'revenue',
      name: r.oportunidade || 'Oportunidade não informada',
      account: r.cliente || 'Cliente não informado',
      owner: r.vendedor_canonico || 'N/A',
      value: Number(r.gross_revenue_saneado || 0),
      netValue: Number(r.net_revenue_saneado || 0),
      quarter: r.fiscal_q_derivado || '-',
      stage: `${r.estado_pagamento_saneado || 'NAO_INFORMADO'} · ${r.produto || 'Produto não informado'}`,
      closeDate: r.fecha_factura_date || '',
      reason: `Comercial: ${r.comercial || '-'} · Família: ${r.familia || '-'} · Margem: ${Number(r.margem_percentual_final || 0).toFixed(2)}% · Câmbio: ${Number(r.tipo_cambio_diario || 0).toFixed(4)}`,
      resultType: 'Revenue',
      produto: r.produto || 'Produto não informado',
      comercial: r.comercial || '-',
      familia: r.familia || '-',
      statusPagamento: r.estado_pagamento_saneado || 'NAO_INFORMADO',
      tipoDocumento: r.tipo_documento || '-',
      tipoProduto: r.tipo_produto || '-',
      cuentaContable: r.cuenta_contable || '-',
      cuentaFinanceira: r.cuenta_financeira || '-',
      segmento: r.segmento || '-',
      etapaOportunidade: r.etapa_oportunidade || '-',
      invoiceLocalNoIva: Number(r.valor_fatura_moeda_local_sem_iva || 0),
      invoiceUsdComercial: Number(r.valor_fatura_usd_comercial || 0),
      netAjustadoUsd: Number(r.net_ajustado_usd || 0),
      custoMoedaLocal: Number(r.custo_moeda_local || 0),
      custoPercentual: Number(r.custo_percentual || 0),
      tipoCambioDiario: Number(r.tipo_cambio_diario || 0),
      tipoCambioPactado: Number(r.tipo_cambio_pactado || 0),
      margemPercentualFinal: Number(r.margem_percentual_final || 0),
      percentualMargem: Number(r.percentual_margem || 0),
      descontoXertica: Number(r.desconto_xertica || 0),
      percentualDescontoXerticaNs: Number(r.percentual_desconto_xertica_ns || 0)
    }));

    if (!rows.length) {
      if (typeof showToast === 'function') {
        showToast('Sem registros de faturamento para este recorte.', 'info');
      }
      return;
    }

    if (typeof window.openRevenueDrilldown === 'function') {
      window.openRevenueDrilldown({
        title,
        rows,
        selected: rows[0] || null,
        baseLabel: `${rows.length} registros de faturamento`,
        rule: `Drilldown dedicado de Revenue (faturamento) por ${dimension}: ${dimensionValue}`,
        filtersLabel: (typeof window.getPeriodSummaryLabel === 'function') ? window.getPeriodSummaryLabel() : 'Filtros atuais',
        sql: 'Fonte: mart_l10.v_faturamento_historico (detalhe bruto de faturamento)'
      });
    } else if (typeof window.openExecutiveDrilldown === 'function') {
      window.openExecutiveDrilldown({
        title,
        rows,
        selected: rows[0] || null,
        activeSource: 'revenue',
        baseLabel: `${rows.length} registros de faturamento`,
        rule: `Drilldown dedicado de Revenue (faturamento) por ${dimension}: ${dimensionValue}`,
        filtersLabel: (typeof window.getPeriodSummaryLabel === 'function') ? window.getPeriodSummaryLabel() : 'Filtros atuais',
        sql: 'Fonte: mart_l10.v_faturamento_historico'
      });
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Falha ao abrir drilldown de Revenue.', 'warning');
    }
  }
}

function renderErpTopTable(data, mode) {
  const tbody = document.getElementById('erp-top-table-body');
  if (!tbody) return;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const items = data?.items || [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Sem dados no período selecionado</td></tr>';
    return;
  }

  const isNet = (mode === 'net');
  const revCell = document.getElementById('erp-top-col-rev');
  if (revCell) revCell.textContent = isNet ? 'Net Revenue' : 'Gross Revenue';

  tbody.innerHTML = items.map((r, i) => {
    const primary  = isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0);
    const pago     = r.pago     || 0;
    const pendente = r.pendente || 0;
    const total    = pago + pendente || 1;
    const pagoPct  = Math.min(100, Math.round((pago / total) * 100));
    const opps     = r.oportunidades || '—';
    const prodMain = r.produto_principal || '—';
    const prods    = r.produtos || '';
    return `<tr class="erp-top-clickable" data-revenue-cliente="${esc(r.cliente)}" title="Abrir drilldown de faturamento para ${esc(r.cliente)}" style="cursor:pointer;">
      <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.cliente)}">${i + 1}. ${esc(r.cliente)}</td>
      <td title="${esc(prods || prodMain)}"><span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.72rem;font-weight:600;background:rgba(0,190,255,.12);color:var(--primary-cyan,#00BEFF)">${esc(prodMain)}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;color:var(--text-muted)" title="${esc(opps)}">${esc(opps)}</td>
      <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${formatMoney(primary)}</td>
      <td style="text-align:right;color:var(--success-green,#00e676);font-variant-numeric:tabular-nums;">${formatMoney(pago)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
          <span style="color:var(--warning-amber,#ffab40);font-variant-numeric:tabular-nums;">${formatMoney(pendente)}</span>
          <div style="width:44px;height:4px;background:var(--bg-elevated,#1a2030);border-radius:2px;flex-shrink:0;">
            <div style="width:${pagoPct}%;height:100%;background:var(--success-green,#00e676);border-radius:2px;"></div>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-revenue-cliente]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const cliente = tr.getAttribute('data-revenue-cliente') || '';
      if (!cliente) return;
      openRevenueExpandedDrilldown({
        title: `Top Contas · ${cliente}`,
        dimension: 'cliente',
        value: cliente
      });
    });
  });
}

function renderErpKpiCards(rev, att) {
  const mode = window.execDisplayMode || 'gross';
  const isNet = (mode === 'net');

  // API só tem net_pago / net_pendente — pago/pendente sempre em net
  const totais = rev?.totais || {};
  const linhas = Number(totais.linhas || 0);
  const total  = isNet ? (totais.net_revenue  || 0) : (totais.gross_revenue  || 0);
  const pago   = totais.net_pago     || 0;   // sem breakdown gross de pago na API
  const pend   = totais.net_pendente || 0;

  // attainment: API retorna percentual (ex: 87.4), modo-aware
  const attKey = isNet ? 'attainment_net_pct' : 'attainment_gross_pct';
  const attPct = att?.resumo?.[attKey] ?? rev?.attainment?.[attKey] ?? null;
  const attMeta = isNet
    ? (att?.resumo?.meta_net ?? rev?.attainment?.meta_net ?? 0)
    : (att?.resumo?.meta_gross ?? rev?.attainment?.meta_gross ?? 0);
  const attRealizado = isNet
    ? (att?.resumo?.net_realizado ?? rev?.attainment?.net_realizado ?? 0)
    : (att?.resumo?.gross_realizado ?? rev?.attainment?.gross_realizado ?? 0);

  const fmt = (v) => typeof formatMoney === 'function' ? formatMoney(v) : ('$' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:0}));
  const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  if (linhas === 0) {
    setEl('erp-total', '-');
    setEl('erp-pago', '-');
    setEl('erp-pendente', '-');
    setEl('erp-attainment-pct', '-');
    setEl('erp-attainment-label', 'sem dados no período/filtros');
    setEl('erp-attainment-detail', '-');
    const bar = document.getElementById('erp-attainment-bar');
    if (bar) bar.style.width = '0%';
    return;
  }

  setEl('erp-total',    fmt(total));
  setEl('erp-pago',     fmt(pago));
  setEl('erp-pendente', fmt(pend));

  if (attPct !== null) {
    const pct = Math.round(Number(attPct)); // já é percentual (87.4 etc)
    setEl('erp-attainment-pct', pct + '%');
    const periodLabel = (typeof getPeriodSummaryLabel === 'function') ? getPeriodSummaryLabel() : 'período selecionado';
    const metricLabel = isNet ? 'Net' : 'Gross';
    setEl('erp-attainment-label', `Meta ${metricLabel}: ${fmt(attMeta)} · Realizado ${metricLabel}: ${fmt(attRealizado)} · ${periodLabel}`);
    setEl('erp-attainment-detail', `Base do attainment: Meta ${metricLabel} vs Realizado ${metricLabel} (faturado). Net Pago considera Pagada + Intercompañia.`);
    const bar = document.getElementById('erp-attainment-bar');
    if (bar) {
      bar.style.width = Math.min(pct, 100) + '%';
      bar.style.background = pct >= 100 ? '#22c55e' : pct >= 70 ? 'var(--primary-cyan,#00BEFF)' : '#ef4444';
    }
  } else {
    setEl('erp-attainment-pct', '-');
    setEl('erp-attainment-detail', 'Sem base de meta/realizado para o período selecionado.');
  }
}

function renderErpCharts(rev) {
  if (typeof Chart === 'undefined') return;

  // helper: formata 'YYYY-MM-DD' → '01/jan'
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    const mo = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][dt.getUTCMonth()];
    return ('0' + dt.getUTCDate()).slice(-2) + '/' + mo;
  };

  // ── Semanal (line) ──
  const semanas = (rev?.por_semana || []);
  const labSem  = semanas.map(s => fmtDate(s.semana_inicio));
  const datGross = semanas.map(s => s.gross_revenue || 0);
  const datNet   = semanas.map(s => s.net_revenue || 0);
  const semMaxTicks = Math.min(10, Math.max(4, Math.ceil((labSem.length || 1) / 2)));

  // y-axis cap: p90 dos valores absolutos × 1.3 para evitar spike de outlier
  const absSem = datGross.concat(datNet).map(v => Math.abs(v)).filter(v => v > 0).sort((a, b) => a - b);
  const p90Sem = absSem.length ? absSem[Math.floor(absSem.length * 0.9)] : 0;
  const yMaxSem = p90Sem > 0 ? p90Sem * 1.3 : undefined;
  const yMinSem = datGross.concat(datNet).some(v => v < 0) ? undefined : 0;

  const ctxSem = document.getElementById('erp-chart-semanal');
  if (ctxSem) {
    if (_erpChartSemanal) _erpChartSemanal.destroy();
    _erpChartSemanal = new Chart(ctxSem, {
      type: 'line',
      data: {
        labels: labSem,
        datasets: [
          {
            label: 'Gross',
            data: datGross,
            borderColor: '#00BEFF',
            backgroundColor: 'rgba(0,190,255,0.12)',
            tension: 0.35,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            clip: 0
          },
          {
            label: 'Net',
            data: datNet,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.10)',
            tension: 0.35,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            clip: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          decimation: { enabled: labSem.length > 24, algorithm: 'lttb', samples: 24 },
          legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: ctx => '$ ' + (ctx.parsed.y / 1e6).toFixed(2) + 'M' } }
        },
        scales: {
          x: {
            ticks: { font: { size: 10 }, color: '#8899aa', maxRotation: 0, autoSkip: true, maxTicksLimit: semMaxTicks },
            grid: { color: 'rgba(255,255,255,.05)' }
          },
          y: {
            min: yMinSem,
            max: yMaxSem,
            ticks: { font: { size: 10 }, color: '#8899aa', callback: v => '$' + (v/1e6).toFixed(1) + 'M' },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        }
      }
    });
  }

  // ── Mensal pago × pendente (stacked bar) ──
  // API retorna apenas net_pago/net_pendente (classificação de pagamento é sempre em net)
  const meses  = (rev?.por_mes || []);
  const labMes = meses.map(m => fmtDate(m.mes_inicio));
  const datPago= meses.map(m => m.net_pago     || 0);
  const datPend= meses.map(m => m.net_pendente || 0);

  const ctxMes = document.getElementById('erp-chart-mensal');
  if (ctxMes) {
    if (_erpChartMensal) _erpChartMensal.destroy();
    _erpChartMensal = new Chart(ctxMes, {
      type: 'bar',
      data: {
        labels: labMes,
        datasets: [
          { label: 'Pago',     data: datPago, backgroundColor: 'rgba(0,190,255,0.7)',  borderRadius: 3 },
          { label: 'Pendente', data: datPend, backgroundColor: 'rgba(245,158,11,0.55)', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } } },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 }, color: '#8899aa', autoSkip: true, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { stacked: true, ticks: { font: { size: 10 }, color: '#8899aa', callback: v => '$' + (v/1e6).toFixed(1) + 'M' }, grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }
}

function renderRevenueAnalysisCharts(rev, att) {
  if (typeof Chart === 'undefined') return;

  const mode = window.execDisplayMode || 'gross';
  const isNet = mode === 'net';

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    const mo = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][dt.getUTCMonth()];
    return ('0' + dt.getUTCDate()).slice(-2) + '/' + mo;
  };

  const moneyTick = (v) => '$' + (v / 1e6).toFixed(1) + 'M';
  const moneyTip = (v) => '$ ' + (v / 1e6).toFixed(2) + 'M';
  const semMaxTicks = Math.min(10, Math.max(4, Math.ceil(((rev?.por_semana || []).length || 1) / 2)));

  const semanas = rev?.por_semana || [];
  const weekLabels = semanas.map(s => fmtDate(s.semana_inicio));
  const weekGross = semanas.map(s => s.gross_revenue || 0);
  const weekNet = semanas.map(s => s.net_revenue || 0);

  const weekCtx = document.getElementById('erp-analytics-weekly');
  if (weekCtx) {
    if (_erpAnalyticsWeekly) _erpAnalyticsWeekly.destroy();
    _erpAnalyticsWeekly = new Chart(weekCtx, {
      type: 'line',
      data: {
        labels: weekLabels,
        datasets: [
          { label: 'Gross', data: weekGross, borderColor: '#00BEFF', backgroundColor: 'rgba(0,190,255,0.12)', fill: false, tension: 0.35, pointRadius: 2, pointHoverRadius: 4 },
          { label: 'Net',   data: weekNet,   borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.10)', fill: false, tension: 0.35, pointRadius: 2, pointHoverRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = semanas[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Revenue por Semana',
            dimension: 'semana',
            value: row.semana_inicio
          });
        },
        plugins: {
          decimation: { enabled: weekLabels.length > 24, algorithm: 'lttb', samples: 24 },
          legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa', maxRotation: 0, autoSkip: true, maxTicksLimit: semMaxTicks }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }

  const meses = rev?.por_mes || [];
  const monthLabels = meses.map(m => fmtDate(m.mes_inicio));
  const monthPago = meses.map(m => m.net_pago || 0);
  const monthPend = meses.map(m => m.net_pendente || 0);
  const monthAnul = meses.map(m => m.net_anulado || 0);

  const payCtx = document.getElementById('erp-analytics-pay-status');
  if (payCtx) {
    if (_erpAnalyticsPayStatus) _erpAnalyticsPayStatus.destroy();
    _erpAnalyticsPayStatus = new Chart(payCtx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          { label: 'Pago', data: monthPago, backgroundColor: 'rgba(0,190,255,0.70)', borderRadius: 3 },
          { label: 'Pendente', data: monthPend, backgroundColor: 'rgba(245,158,11,0.55)', borderRadius: 3 },
          { label: 'Anulado', data: monthAnul, backgroundColor: 'rgba(239,68,68,0.55)', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_evt, elements, chart) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const dsIdx = elements[0].datasetIndex;
          const row = meses[idx];
          if (!row) return;
          const dsLabel = chart?.data?.datasets?.[dsIdx]?.label || '';
          const statusMap = {
            'Pago': 'Pagada,Intercompañia',
            'Pendente': 'Pendiente,NAO_INFORMADO,Intercompañia',
            'Anulado': 'Anulada'
          };
          const statusPagamento = statusMap[dsLabel] || '';
          openRevenueExpandedDrilldown({
            title: `Pagamento por Mês${dsLabel ? ` - ${dsLabel}` : ''}`,
            dimension: 'mes',
            value: row.mes_inicio,
            statusPagamento
          });
        },
        plugins: {
          legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 }, color: '#8899aa', autoSkip: true, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { stacked: true, ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }

  const produtos = (rev?.por_produto || []).slice(0, 10);
  const prodLabels = produtos.map(p => (p.produto || '').length > 32 ? (p.produto || '').slice(0, 32) + '…' : (p.produto || '—'));
  const prodValues = produtos.map(p => isNet ? (p.net_revenue || 0) : (p.gross_revenue || 0));

  const prodCtx = document.getElementById('erp-analytics-products');
  if (prodCtx) {
    if (_erpAnalyticsProducts) _erpAnalyticsProducts.destroy();
    _erpAnalyticsProducts = new Chart(prodCtx, {
      type: 'bar',
      data: {
        labels: prodLabels,
        datasets: [{
          label: isNet ? 'Net Revenue' : 'Gross Revenue',
          data: prodValues,
          backgroundColor: 'rgba(0,190,255,0.68)',
          borderRadius: 4,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = produtos[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Top Produtos por Revenue',
            dimension: 'produto',
            value: row.produto || 'Produto não informado'
          });
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } }
        }
      }
    });
  }

  const attMonths = att?.por_mes || [];
  const attLabels = attMonths.map(m => fmtDate(m.mes_inicio));
  const attMeta = attMonths.map(m => isNet ? (m.meta_net || 0) : (m.meta_gross || 0));
  const attReal = attMonths.map(m => isNet ? (m.net_realizado || 0) : (m.gross_realizado || 0));

  const attTitle = document.getElementById('erp-analytics-att-title');
  if (attTitle) attTitle.textContent = `Meta vs Realizado (${isNet ? 'Net' : 'Gross'})`;

  const attCtx = document.getElementById('erp-analytics-attainment');
  if (attCtx) {
    if (_erpAnalyticsAttainment) _erpAnalyticsAttainment.destroy();
    _erpAnalyticsAttainment = new Chart(attCtx, {
      type: 'bar',
      data: {
        labels: attLabels,
        datasets: [
          { label: 'Meta', data: attMeta, backgroundColor: 'rgba(148,163,184,0.45)', borderRadius: 3 },
          { label: 'Realizado', data: attReal, backgroundColor: 'rgba(34,197,94,0.65)', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = attMonths[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Meta vs Realizado',
            dimension: 'mes',
            value: row.mes_inicio
          });
        },
        plugins: {
          legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }

  const comercialRows = (rev?.por_comercial || []).slice(0, 10);
  const comercialLabels = comercialRows.map(r => {
    const raw = r.comercial || 'Não informado';
    return raw.length > 28 ? raw.slice(0, 28) + '…' : raw;
  });
  const comercialValues = comercialRows.map(r => isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0));

  const comercialCtx = document.getElementById('erp-analytics-commercial');
  if (comercialCtx) {
    if (_erpAnalyticsCommercial) _erpAnalyticsCommercial.destroy();
    _erpAnalyticsCommercial = new Chart(comercialCtx, {
      type: 'bar',
      data: {
        labels: comercialLabels,
        datasets: [{
          label: isNet ? 'Net Revenue' : 'Gross Revenue',
          data: comercialValues,
          backgroundColor: 'rgba(14, 165, 233, 0.72)',
          borderRadius: 4,
          maxBarThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = comercialRows[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Revenue por Comercial',
            dimension: 'comercial',
            value: row.comercial || 'Não informado'
          });
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } }
        }
      }
    });
  }

  const segmentoRows = (rev?.por_segmento || []).slice(0, 10);
  const segmentoLabels = segmentoRows.map((r) => {
    const raw = r.segmento || 'Não informado';
    return raw.length > 28 ? raw.slice(0, 28) + '…' : raw;
  });
  const segmentoValues = segmentoRows.map((r) => isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0));

  const segmentoCtx = document.getElementById('erp-analytics-segment');
  if (segmentoCtx) {
    if (_erpAnalyticsSegment) _erpAnalyticsSegment.destroy();
    _erpAnalyticsSegment = new Chart(segmentoCtx, {
      type: 'bar',
      data: {
        labels: segmentoLabels,
        datasets: [{
          label: isNet ? 'Net Revenue' : 'Gross Revenue',
          data: segmentoValues,
          backgroundColor: 'rgba(16,185,129,0.72)',
          borderRadius: 4,
          maxBarThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = segmentoRows[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Revenue por Segmento',
            dimension: 'segmento',
            value: row.segmento || 'Não informado'
          });
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } }
        }
      }
    });
  }

  const familiaRows = (rev?.por_familia || []).slice(0, 6);
  const familiaTotal = familiaRows.reduce((acc, r) => acc + (isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0)), 0);
  const familiaBaseLabels = familiaRows.map(r => r.familia || 'Não informado');
  const familiaBaseValues = familiaRows.map(r => isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0));
  const familiaAll = rev?.por_familia || [];
  const familiaAllTotal = familiaAll.reduce((acc, r) => acc + (isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0)), 0);
  const familiaOthers = Math.max(0, familiaAllTotal - familiaTotal);

  const familiaLabels = familiaOthers > 0 ? familiaBaseLabels.concat(['Outros']) : familiaBaseLabels;
  const familiaValues = familiaOthers > 0 ? familiaBaseValues.concat([familiaOthers]) : familiaBaseValues;

  const familiaCtx = document.getElementById('erp-analytics-family');
  if (familiaCtx) {
    if (_erpAnalyticsFamily) _erpAnalyticsFamily.destroy();
    _erpAnalyticsFamily = new Chart(familiaCtx, {
      type: 'doughnut',
      data: {
        labels: familiaLabels,
        datasets: [{
          data: familiaValues,
          backgroundColor: [
            'rgba(0,190,255,0.78)',
            'rgba(34,197,94,0.72)',
            'rgba(244,114,182,0.72)',
            'rgba(245,158,11,0.72)',
            'rgba(167,139,250,0.72)',
            'rgba(148,163,184,0.72)',
            'rgba(100,116,139,0.55)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = familiaRows[idx];
          if (!row) {
            if (typeof showToast === 'function') {
              showToast('Categoria "Outros" não possui drilldown direto.', 'info');
            }
            return;
          }
          openRevenueExpandedDrilldown({
            title: 'Revenue por Família',
            dimension: 'familia',
            value: row.familia || 'Não informado'
          });
        },
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, color: '#8899aa', boxWidth: 10, padding: 10 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${moneyTip(ctx.parsed)}` } }
        }
      }
    });
  }

  const quarterRows = rev?.por_quarter || [];
  const quarterLabels = quarterRows.map(r => r.fiscal_q || 'Não informado');
  const quarterGross = quarterRows.map(r => r.gross_revenue || 0);
  const quarterNet = quarterRows.map(r => r.net_revenue || 0);

  const quarterCtx = document.getElementById('erp-analytics-quarter');
  if (quarterCtx) {
    if (_erpAnalyticsQuarter) _erpAnalyticsQuarter.destroy();
    _erpAnalyticsQuarter = new Chart(quarterCtx, {
      type: 'bar',
      data: {
        labels: quarterLabels,
        datasets: [
          { label: 'Gross', data: quarterGross, backgroundColor: 'rgba(0,190,255,0.55)', borderRadius: 4 },
          { label: 'Net', data: quarterNet, backgroundColor: 'rgba(34,197,94,0.65)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = quarterRows[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Revenue por Quarter',
            dimension: 'quarter',
            value: row.fiscal_q || 'Não informado'
          });
        },
        plugins: {
          legend: { labels: { font: { size: 10 }, color: '#ccc', boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } }
        }
      }
    });
  }

  const oppTypeLineRows = (rev?.por_tipo_oportunidade_line || []).slice(0, 10);
  const oppTypeLineLabels = oppTypeLineRows.map((r) => {
    const raw = r.tipo_oportunidade_line || 'Não informado';
    return raw.length > 28 ? raw.slice(0, 28) + '…' : raw;
  });
  const oppTypeLineValues = oppTypeLineRows.map((r) => isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0));

  const oppTypeLineCtx = document.getElementById('erp-analytics-opportunity-type-line');
  if (oppTypeLineCtx) {
    if (_erpAnalyticsOpportunityTypeLine) _erpAnalyticsOpportunityTypeLine.destroy();
    _erpAnalyticsOpportunityTypeLine = new Chart(oppTypeLineCtx, {
      type: 'bar',
      data: {
        labels: oppTypeLineLabels,
        datasets: [{
          label: isNet ? 'Net Revenue' : 'Gross Revenue',
          data: oppTypeLineValues,
          backgroundColor: 'rgba(6,182,212,0.72)',
          borderRadius: 4,
          maxBarThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements || !elements.length) return;
          const idx = elements[0].index;
          const row = oppTypeLineRows[idx];
          if (!row) return;
          openRevenueExpandedDrilldown({
            title: 'Revenue por Tipo de Oportunidade',
            dimension: 'tipo_oportunidade_line',
            value: row.tipo_oportunidade_line || 'Não informado'
          });
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyTip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, color: '#8899aa', callback: moneyTick }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { font: { size: 10 }, color: '#8899aa' }, grid: { color: 'rgba(255,255,255,.05)' } }
        }
      }
    });
  }
}
