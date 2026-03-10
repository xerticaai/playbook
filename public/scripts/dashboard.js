// Renderização principal do dashboard: renderDashboard e funções auxiliares
function renderDashboard() {
  try {
    log('[RENDER] ========== INÍCIO DA RENDERIZAÇÃO ==========');
    log('[RENDER] Timestamp:', new Date().toISOString());
    
    // Declare hasActiveFilters logo no início para uso em toda a função
    const hasActiveFilters = window.currentFilters && (
      window.currentFilters.year ||
      window.currentFilters.quarter ||
      window.currentFilters.month ||
      window.currentFilters.phase ||
      window.currentFilters.seller ||
      window.currentFilters.owner_preventa ||
      window.currentFilters.billing_city ||
      window.currentFilters.billing_state ||
      window.currentFilters.vertical_ia ||
      window.currentFilters.sub_vertical_ia ||
      window.currentFilters.sub_sub_vertical_ia ||
      window.currentFilters.subsegmento_mercado ||
      window.currentFilters.segmento_consolidado ||
      window.currentFilters.portfolio ||
      window.currentFilters.portfolio_fdm
    );
    
    // CORREÇÃO: Usa metrics da API (window.currentApiMetrics) se disponível, senão fallback para DATA.cloudAnalysis
    const apiFilteredData = (window.currentApiMetrics && window.currentApiMetrics.pipeline_filtered) 
      ? window.currentApiMetrics.pipeline_filtered
      : safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_filtered', {});
    
    // Adicionar high_confidence ao apiFilteredData para uso posterior
    if (window.currentApiMetrics && window.currentApiMetrics.high_confidence) {
      apiFilteredData.high_confidence = window.currentApiMetrics.high_confidence;
    } else {
      apiFilteredData.high_confidence = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.high_confidence', {});
    }
    
    // ============================================================================
    // MÉTRICAS ESTÁTICAS DESATIVADAS (sem fallback)
    // ============================================================================
    log('[RENDER] === MÉTRICAS ESTÁTICAS DESATIVADAS ===');
    window.STATIC_METRICS_LOADED = false;
    window.STATIC_METRICS = null;

    // Header
    log('[RENDER] === HEADER ===');
    log('[DATA] updatedAt:', safe(DATA, 'updatedAt', '-'));
    log('[DATA] quarterLabel:', safe(DATA, 'quarterLabel', 'FY26'));
    setTextSafe('last-update', formatDateTime(safe(DATA, 'updatedAt', '-')));
    setTextSafe('quarter-label', safe(DATA, 'quarterLabel', 'FY26'));
    // Removido: quarter-label-exec (elemento foi removido do HTML)
    
    // Atualiza indicador de tempo desde última atualização
    updateTimeSinceUpdate();

    // 0. VISÃO EXECUTIVA - NOVA ESTRUTURA
    log('[RENDER] ========== VISÃO EXECUTIVA ==========');
    
    // SEÇÃO 1: MÉTRICAS PRINCIPAIS
    log('[RENDER] === SEÇÃO 1: MÉTRICAS PRINCIPAIS ===');
    // Calcula métricas do quarter a partir dos dados já carregados
    const scorecard = DATA.fsrScorecard || [];
    log('[DATA] fsrScorecard:', scorecard.length, 'vendedores');
    const activeReps = scorecard.filter(r => r.isActive);
    log('[CALC] Vendedores ativos:', activeReps.length, '/', scorecard.length);
    
    // Pipeline do quarter - USA DADOS DA VISÃO EXECUTIVA (L10)
    const l10 = DATA.executive || DATA.l10 || {};
    const quarters = DATA.weeklyAgenda || {};
    log('[DATA] weeklyAgenda quarters:', Object.keys(quarters));
    log('[DATA] l10 disponível:', !!DATA.l10);
    
    // IMPORTANTE: pipelineTotal usa TODOS os anos (allPipelineGross), não apenas FY26
    // VISÃO EXECUTIVA: Lê de cloudAnalysis (Python/BigQuery) ou metrics diretamente
    let pipelineTotal = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_all.gross', null);
    let pipelineTotalNet = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_all.net', null);
    let pipelineDeals = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_all.deals_count', null);
    
    // Se cloudAnalysis não tiver os dados, usar metrics diretamente da API
    if (pipelineTotal === null || pipelineTotal === 0) {
      log('[FALLBACK] Usando metrics da API para KPIs principais');
      pipelineTotal = safe(DATA, 'cloudAnalysis.pipeline_analysis.metrics.pipeline_total.gross', 0);
      pipelineTotalNet = safe(DATA, 'cloudAnalysis.pipeline_analysis.metrics.pipeline_total.net', 0);
      pipelineDeals = safe(DATA, 'cloudAnalysis.pipeline_analysis.metrics.pipeline_total.deals_count', 0);
    }
    
    log('[KPI] Pipeline Total:', formatMoney(pipelineTotal), 'deals:', pipelineDeals);
    
    let commitValue = 0;
    let upsideValue = 0;
    let pipelineValue = 0;
    let totalConfidence = 0; // Para calcular média ponderada
    let totalDealsProcessed = 0; // Contador correto de deals para média
    let totalNetSum = 0; // Soma de Net de TODOS os deals
    // Esses valores vêm DA API, não calculamos mais localmente
    let above50Value = 0; // Soma de Gross >= 50% (DA API)
    let above50Net = 0; // Soma de Net >= 50% (DA API)
    let above50Count = 0; // Contagem de deals >= 50% (DA API)
    const allDeals = []; // Para principais oportunidades
    
    // Armazena todos os deals com seus dados para recalcular por período
    window.allDealsWithConfidence = [];
    
    // Recalcula forecast categories usando GROSS (não weighted) e allDeals
    Object.values(quarters).forEach(deals => {
      if (deals && Array.isArray(deals)) {
        deals.forEach(d => {
          let conf = d.confidence || 0;
          // Se confiança vem como número inteiro (ex: 50 ao invés de 0.5), divide por 100
          if (conf > 1) conf = conf / 100;
          const grossValue = d.val || 0; // Usa GROSS direto
          const netValue = d.net || 0; // NET do deal
          totalConfidence += conf;
          totalDealsProcessed++; // Incrementa contador de deals processados
          totalNetSum += netValue; // Acumula Net de TODOS os deals
          
          // NÃO calcula deals >= 50% aqui - será pego da API
          
          // Armazena deal completo para recalcular por filtro
          window.allDealsWithConfidence.push({
            gross: grossValue,
            net: netValue,
            confidence: conf,
            closeDate: d.closeDate || d.closed,
            stage: d.stage,
            fiscalQ: d.fiscalQ || d.fiscal_q || '',  // Armazena Fiscal Q para filtro
            forecastCategory: d.forecastCategory || 'PIPELINE'  // ← Categoria de forecast para barras
          });
          
          // Classifica por categoria de forecast (Análise IA)
          // COMMIT: ≥90%, UPSIDE: 50-89%, PIPELINE: <50%
          // Confiança já está em decimal (0.0 a 1.0)
          if (conf >= 0.90) commitValue += grossValue;
          else if (conf >= 0.50) upsideValue += grossValue;
          else pipelineValue += grossValue;
          
          // Guarda deal para lista de principais
          allDeals.push(d);
        });
      }
    });
    
    // Fallback para métricas agregadas quando não há deals detalhados
    const cloudMetrics = DATA.cloudMetrics || {};
    if (totalDealsProcessed === 0) {
      if (cloudMetrics.commitGross || cloudMetrics.upsideGross || cloudMetrics.pipelineGross) {
        commitValue = cloudMetrics.commitGross || 0;
        upsideValue = cloudMetrics.upsideGross || 0;
        pipelineValue = cloudMetrics.pipelineGross || 0;
      }
    }
    
    // ✓ SEMPRE pega high_confidence da API (com ou sem filtros)
    const highConfFromAPI = hasActiveFilters 
      ? apiFilteredData.high_confidence 
      : safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.high_confidence', {});
    
    if (highConfFromAPI && (highConfFromAPI.gross || highConfFromAPI.deals_count)) {
      above50Value = highConfFromAPI.gross || 0;
      above50Net = highConfFromAPI.net || 0;
      above50Count = highConfFromAPI.deals_count || 0;
      log('[HIGH-CONF] ✓ Usando valores DA API:', {
        filtered: hasActiveFilters,
        gross: formatMoney(above50Value),
        net: formatMoney(above50Net),
        count: above50Count
      });
    } else {
      log('[HIGH-CONF] ⚠ Dados não disponíveis na API');
    }

    const animateForecastBars = (barIds) => {
      if (!Array.isArray(barIds) || barIds.length === 0) return;
      barIds.forEach((barId, idx) => {
        const el = document.getElementById(barId);
        if (!el) return;
        el.style.transition = 'width 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 260ms ease, filter 220ms ease';
        el.style.opacity = '0.84';
        el.style.transform = 'translateY(3px)';
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, idx * 55);

        if (el.dataset.forecastHoverBound !== '1') {
          el.dataset.forecastHoverBound = '1';
          el.addEventListener('mouseenter', () => {
            el.style.filter = 'brightness(1.06)';
            el.style.transform = 'translateY(-1px)';
          });
          el.addEventListener('mouseleave', () => {
            el.style.filter = 'none';
            el.style.transform = 'translateY(0)';
          });
        }
      });
    };

    // Função global para recalcular saúde do forecast por período (usando forecast_ia do BigQuery)
    window.updateForecastHealth = function(period) {
      log('[FORECAST HEALTH] Iniciando atualização para período:', period);
      log('[FORECAST HEALTH] Total de deals armazenados:', window.allDealsWithConfidence ? window.allDealsWithConfidence.length : 0);
      window.currentForecastHealthPeriod = period;
      
      let filteredCommit = 0, filteredCommitNet = 0;
      let filteredUpside = 0, filteredUpsideNet = 0;
      let filteredPipeline = 0, filteredPipelineNet = 0;
      let filteredPotencial = 0, filteredPotencialNet = 0;
      let filteredOmitido = 0, filteredOmitidoNet = 0;
      
      if (period === 'all' || period === 'total') {
        // Usa todos os deals
        window.allDealsWithConfidence.forEach(d => {
          const category = (d.forecastCategory || '').toUpperCase();
          const gross = d.gross || 0;
          const net = d.net || 0;
          
          if (category.includes('COMMIT')) { filteredCommit += gross; filteredCommitNet += net; }
          else if (category === 'UPSIDE') { filteredUpside += gross; filteredUpsideNet += net; }
          else if (category === 'POTENCIAL') { filteredPotencial += gross; filteredPotencialNet += net; }
          else if (category.includes('OMIT')) { filteredOmitido += gross; filteredOmitidoNet += net; }
          else { filteredPipeline += gross; filteredPipelineNet += net; }
        });
      } else {
        // Filtra por quarter usando Fiscal Q (ex: "FY26-Q1")
        const targetQuarter = 'FY26-' + period.toUpperCase(); // Ex: "q1" -> "FY26-Q1"
        
        log('[FORECAST HEALTH] Filtrando para:', targetQuarter);
        
        window.allDealsWithConfidence.forEach(d => {
          // Usa fiscalQ se disponível, senão tenta pela data
          if (d.fiscalQ === targetQuarter) {
            const category = (d.forecastCategory || '').toUpperCase();
            const gross = d.gross || 0;
            const net = d.net || 0;
            
            if (category.includes('COMMIT')) { filteredCommit += gross; filteredCommitNet += net; }
            else if (category === 'UPSIDE') { filteredUpside += gross; filteredUpsideNet += net; }
            else if (category === 'POTENCIAL') { filteredPotencial += gross; filteredPotencialNet += net; }
            else if (category.includes('OMIT')) { filteredOmitido += gross; filteredOmitidoNet += net; }
            else { filteredPipeline += gross; filteredPipelineNet += net; }
          }
        });
      }
      
      const totalForecast = filteredCommit + filteredUpside + filteredPipeline + filteredPotencial + filteredOmitido;
      const commitPercent = totalForecast > 0 ? (filteredCommit / totalForecast) * 100 : 0;
      const upsidePercent = totalForecast > 0 ? (filteredUpside / totalForecast) * 100 : 0;
      const pipelinePercent = totalForecast > 0 ? (filteredPipeline / totalForecast) * 100 : 0;
      const potencialPercent = totalForecast > 0 ? (filteredPotencial / totalForecast) * 100 : 0;
      const omitidoPercent = totalForecast > 0 ? (filteredOmitido / totalForecast) * 100 : 0;
      
      log('[FORECAST HEALTH] Valores calculados:', {
        'totalForecast': formatMoney(totalForecast),
        'commit': formatMoney(filteredCommit) + ' (' + Math.round(commitPercent) + '%)',
        'upside': formatMoney(filteredUpside) + ' (' + Math.round(upsidePercent) + '%)',
        'pipeline': formatMoney(filteredPipeline) + ' (' + Math.round(pipelinePercent) + '%)',
        'potencial': formatMoney(filteredPotencial) + ' (' + Math.round(potencialPercent) + '%)',
        'omitido': formatMoney(filteredOmitido) + ' (' + Math.round(omitidoPercent) + '%)'
      });
      
      setBarSafe('forecast-commit-bar', commitPercent, commitPercent >= 10 ? 'COMMIT' : '');
      setBarSafe('forecast-upside-bar', upsidePercent, upsidePercent >= 10 ? 'UPSIDE' : '');
      setBarSafe('forecast-pipeline-bar', pipelinePercent, pipelinePercent >= 10 ? 'PIPELINE' : '');
      setBarSafe('forecast-potencial-bar', potencialPercent, potencialPercent >= 10 ? 'POTENCIAL' : '');
      setBarSafe('forecast-omitido-bar', omitidoPercent, omitidoPercent >= 10 ? 'OMITIDO' : '');
      
      setTextSafe('forecast-commit-value', formatMoney(filteredCommit) + ' (' + Math.round(commitPercent) + '%)');
      setTextSafe('forecast-upside-value', formatMoney(filteredUpside) + ' (' + Math.round(upsidePercent) + '%)');
      setTextSafe('forecast-pipeline-value', formatMoney(filteredPipeline) + ' (' + Math.round(pipelinePercent) + '%)');
      setTextSafe('forecast-potencial-value', formatMoney(filteredPotencial) + ' (' + Math.round(potencialPercent) + '%)');
      setTextSafe('forecast-omitido-value', formatMoney(filteredOmitido) + ' (' + Math.round(omitidoPercent) + '%)');
      
      // Atualizar spans de Net
      setTextSafe('forecast-commit-net', 'Net: ' + formatMoney(filteredCommitNet));
      setTextSafe('forecast-upside-net', 'Net: ' + formatMoney(filteredUpsideNet));
      setTextSafe('forecast-pipeline-net', 'Net: ' + formatMoney(filteredPipelineNet));
      setTextSafe('forecast-potencial-net', 'Net: ' + formatMoney(filteredPotencialNet));
      setTextSafe('forecast-omitido-net', 'Net: ' + formatMoney(filteredOmitidoNet));

      animateForecastBars([
        'forecast-commit-bar',
        'forecast-upside-bar',
        'forecast-pipeline-bar',
        'forecast-potencial-bar',
        'forecast-omitido-bar'
      ]);
    };
    
    // Inicializar barras com todos os deals (load inicial)
    if (window.allDealsWithConfidence.length > 0) {
      window.updateForecastHealth('all');
    }
    
    log('[CALC] Pipeline calculado:', {
      'total': formatMoney(pipelineTotal),
      'deals': pipelineDeals,
      'above50Value': formatMoney(above50Value),
      'above50Count': above50Count,
      'commitValue': formatMoney(commitValue),
      'upsideValue': formatMoney(upsideValue),
      'pipelineValue': formatMoney(pipelineValue),
      'allDeals': allDeals.length
    });
    
    // Previsão ponderada MÉDIA (busca da análise de IA ou calcula como fallback)
    let confidenceFromAI = 0;
    if (DATA.aiAnalysis && DATA.aiAnalysis.forecastAnalysis) {
      // Tenta extrair a confiança da análise de IA
      const forecastMatch = DATA.aiAnalysis.forecastAnalysis.match(/Confiança[^\d]*(\d+)%/i);
      if (forecastMatch) {
        confidenceFromAI = parseInt(forecastMatch[1]);
        log('[DATA] Confiança extraída da análise de IA:', confidenceFromAI + '%');
      }
    }
    
    // CRÍTICO: Se há filtros ativos, usar avg_confidence da API filtrada
    let avgConfidence = 0;
    if (hasActiveFilters && apiFilteredData.avg_confidence !== undefined) {
      avgConfidence = apiFilteredData.avg_confidence;
      log('[CALC] Confiança FILTRADA da API:', avgConfidence + '%', '(' + apiFilteredData.deals_count + ' deals)');
    } else {
      // avgConfidence: calcula média REAL dos deals processados (não usar estáticos)
      const avgConfidenceCalc = totalDealsProcessed > 0 ? (totalConfidence / totalDealsProcessed) * 100 : 0;
      avgConfidence = avgConfidenceCalc;
      
      // Fallback apenas se não conseguiu calcular dos deals
      if (avgConfidence === 0 && cloudMetrics.avgConfidence) {
        avgConfidence = cloudMetrics.avgConfidence;
        log('[FALLBACK] Usando confiança do cloudMetrics:', avgConfidence + '%');
      } else if (avgConfidence === 0) {
        avgConfidence = confidenceFromAI;
        log('[FALLBACK] Usando confiança extraída da IA:', avgConfidence + '%');
      }
      
      log('[CALC] Confiança média TOTAL calculada:', Math.round(avgConfidence) + '%', '(' + totalDealsProcessed + ' deals processados)');
    }
    
    // CORREÇÃO: Previsão Ponderada deve usar pipeline FILTRADO quando há filtros ativos
    const pipelineForForecast = (hasActiveFilters && apiFilteredData.gross) 
      ? apiFilteredData.gross 
      : pipelineTotal;
    const forecastAvgWeighted = pipelineForForecast * (avgConfidence / 100);
    log('[CALC] Forecast ponderado:', formatMoney(forecastAvgWeighted), 'usando pipeline', formatMoney(pipelineForForecast), 'x', Math.round(avgConfidence) + '%');
    
    // Armazena globalmente para evitar reset ao filtrar
    window.avgConfidence = avgConfidence;
    
    // Quarter atual para cálculos dependentes
    const currentQuarterLabel = DATA.quarterLabel || safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.quarter', 'FY26-Q1');

    // Total fechado no quarter (soma dos ganhos dos vendedores ativos - APENAS QUARTER ATUAL)
    let closedGross = activeReps.reduce((sum, r) => sum + (r.revenueGross || 0), 0);
    let closedNet = activeReps.reduce((sum, r) => sum + (r.revenue || 0), 0);
    let closedDeals = activeReps.reduce((sum, r) => sum + (r.totalWonQuarter || 0), 0);
    const closedQuarter = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.closed', null);
    if (closedDeals === 0 && closedQuarter) {
      closedGross = closedQuarter.gross || 0;
      closedNet = closedQuarter.net || 0;
      closedDeals = closedQuarter.deals_count || 0;
    }
    log('[CALC] Fechados no Quarter:', formatMoney(closedGross), '(Gross) |', formatMoney(closedNet), '(Net) | (', closedDeals, 'deals )');
    
    // CORREÇÃO: Declara wonAgg e lostAgg ANTES de usar
    const wonAgg = DATA.wonAgg || [];
    const lostAgg = DATA.lostAgg || [];
    log('[DATA] wonAgg disponível:', wonAgg.length, 'deals');
    log('[DATA] lostAgg disponível:', lostAgg.length, 'deals');
    
    // Armazena globalmente para outras funções (ex: updateConversionMetricsForPeriod)
    window.wonAgg = wonAgg;
    window.lostAgg = lostAgg;
    
    // Taxa de conversão do quarter (APENAS QUARTER ATUAL)
    // CORREÇÃO: Usar wonAgg.length diretamente em vez de soma dos vendedores (pode estar zerada)
    let totalWins = wonAgg.length;
    let totalLosses = lostAgg.length;
    let totalDeals = totalWins + totalLosses;
    let conversionRate = totalDeals > 0 ? Math.round((totalWins / totalDeals) * 100) : 0;
    
    // Se ainda zerado, tentar do cloudAnalysis como fallback final
    if (totalDeals === 0) {
      const closedStats = safe(DATA, 'cloudAnalysis.closed_analysis', {});
      const convStats = safe(DATA, 'cloudAnalysis.conversion_rate', {});
      const winRate = convStats.win_rate || closedStats.win_rate || 0;
      conversionRate = Math.round(winRate);
      totalWins = closedStats.won || wonAgg.length || 0;
      totalLosses = closedStats.lost || lostAgg.length || 0;
      totalDeals = totalWins + totalLosses;
    }
    
    // GROSS e NET de Ganhas e Perdidas (quarter atual)
    let winsGross = 0;
    let winsNet = 0;
    let lossesGross = 0;
    let lossesNet = 0;
    
    // Soma GROSS/NET das ganhas do quarter atual
    wonAgg.forEach(item => {
      if (item.fiscalQ === currentQuarterLabel) {
        winsGross += item.gross || 0;
        winsNet += item.net || 0;
      }
    });
    
    // Soma GROSS/NET das perdidas do quarter atual
    lostAgg.forEach(item => {
      if (item.fiscalQ === currentQuarterLabel) {
        lossesGross += item.gross || 0;
        lossesNet += item.net || 0;
      }
    });
    
    log('[CALC] Conversão do Quarter:', conversionRate + '%', '(', totalWins, '/', totalDeals, 'deals )');
    log('[CALC] Ganhas - Gross:', formatMoney(winsGross), '| Net:', formatMoney(winsNet), '(', totalWins, 'deals)');
    log('[CALC] Perdidas - Gross:', formatMoney(lossesGross), '| Net:', formatMoney(lossesNet), '(', totalLosses, 'deals)');
    
    // Popula KPIs do Placar
    log('[RENDER] Populando KPIs do Placar...');
    
    // ============================================================================
    // ARQUITETURA HÍBRIDA: Usa métricas estáticas SE disponíveis, senão fallback
    // ============================================================================
    
    let pipelineTotalAnoGross, pipelineTotalAnoNet, pipelineTotalAnoDeals;
    let pipelineSalesSpecGross, pipelineSalesSpecNet, pipelineSalesSpecDeals;
    let allPipelineGross, allPipelineNet, allPipelineDeals;
    
    // ✓ SEMPRE usar métricas da API (nunca STATIC_METRICS)
    log('[METRICS] ✓ Usando métricas da API CloudAnalysis');
      
    // VISÃO EXECUTIVA: CloudAnalysis
    pipelineTotalAnoGross = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_fy26.gross', 0);
    pipelineTotalAnoNet = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_fy26.net', 0);
    pipelineTotalAnoDeals = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_fy26.deals_count', 0);
    
    pipelineSalesSpecGross = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.gross', 0);
    pipelineSalesSpecNet = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.net', 0);
    pipelineSalesSpecDeals = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.deals_count', 0);
    
    // CORREÇÃO: Inicializa allPipeline com pipelineTotalAno (total sem filtro)
    // Nunca deve ser zerado por filtros, apenas atualizado se houver valor maior
    allPipelineGross = pipelineTotalAnoGross || pipelineTotal;
    allPipelineNet = pipelineTotalAnoNet || (pipelineTotal * window.pipelineNetRatio);
    allPipelineDeals = pipelineTotalAnoDeals || totalDealsProcessed;
    
    // Se houver pipeline_all do cloudAnalysis e for MAIOR, usar esse
    const cloudPipelineAll = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_all', {});
    if (cloudPipelineAll.gross > allPipelineGross) {
      allPipelineGross = cloudPipelineAll.gross;
      allPipelineNet = cloudPipelineAll.net || allPipelineNet;
      allPipelineDeals = cloudPipelineAll.deals_count || allPipelineDeals;
    }
    
    // Detecta FY atual baseado na data (extrai FY26 de "FY26-Q1")
    const currentFY = safe(DATA, 'quarterLabel', 'FY26-Q1').split('-')[0]; // Extrai "FY26" de "FY26-Q1"
    window.currentFY = currentFY;

    // Detalhamento por quarter (sempre do payload JSON - usado para filtros)
    // VISÃO EXECUTIVA: Quarters de cloudAnalysis
    const qDetailsRaw = safe(DATA, 'cloudAnalysis.pipeline_analysis.executive.pipeline_by_quarter', {});
    
    // NOVOS KPIS: Pipeline Total Ano e Sales Specialist (usa valores híbridos)
    
    log('[CALC] Pipeline FY26:', formatMoney(pipelineTotalAnoGross), '(', pipelineTotalAnoDeals, 'deals )');
    log('[CALC] Previsão Sales Specialist:', formatMoney(pipelineSalesSpecGross), '(', pipelineSalesSpecDeals, 'deals )');
    log('[CALC] Pipeline Total (Todos Anos):', formatMoney(allPipelineGross), '(', allPipelineDeals, 'deals )');
    
    // Atualiza labels dos filtros com formato completo FY26-Q1
    setTextSafe('filter-total-label', 'Todo Pipeline (' + currentFY + ')');
    setTextSafe('filter-q1-label', currentFY + '-Q1');
    setTextSafe('filter-q2-label', currentFY + '-Q2');
    setTextSafe('filter-q3-label', currentFY + '-Q3');
    setTextSafe('filter-q4-label', currentFY + '-Q4');
    
    // Normaliza quarters (suporta FY26-Q1 e Q1)
    const qDetails = {
      Q1: qDetailsRaw[currentFY + '-Q1'] || qDetailsRaw.Q1 || { gross: 0, net: 0, count: 0 },
      Q2: qDetailsRaw[currentFY + '-Q2'] || qDetailsRaw.Q2 || { gross: 0, net: 0, count: 0 },
      Q3: qDetailsRaw[currentFY + '-Q3'] || qDetailsRaw.Q3 || { gross: 0, net: 0, count: 0 },
      Q4: qDetailsRaw[currentFY + '-Q4'] || qDetailsRaw.Q4 || { gross: 0, net: 0, count: 0 }
    };

    // Inicializa com view total
    // IMPORTANTE: Se há filtros ativos, usar dados REAIS da API (metrics.pipeline_filtered)
    // Caso contrário, usar dados estáticos do JSON
    // (hasActiveFilters e apiFilteredData já declarados no início da função)
    
    if (hasActiveFilters && apiFilteredData.deals_count > 0) {
      // Usar dados filtrados da API - TODOS OS CAMPOS
      log('[PIPELINE DATA] ✓ Usando dados FILTRADOS da API para TODOS os quarters');
      log('[PIPELINE DATA] Filtered:', apiFilteredData.deals_count, 'deals', formatMoney(apiFilteredData.gross));
      
      // Quando há filtro, todos os campos usam dados filtrados (não há breakdown por quarter)
      const filteredData = { gross: apiFilteredData.gross || 0, net: apiFilteredData.net || 0, count: apiFilteredData.deals_count || 0 };
      window.pipelineData = {
        all: filteredData,
        total: filteredData,
        q1: filteredData,  // Usar dados filtrados, não qDetails
        q2: filteredData,
        q3: filteredData,
        q4: filteredData
      };
    } else {
      // Usar dados estáticos do JSON (sem filtro) - COM BREAKDOWN
      log('[PIPELINE DATA] Usando dados ESTÁTICOS do JSON com breakdown por quarter');
      window.pipelineData = {
        all: { gross: allPipelineGross, net: allPipelineNet, count: allPipelineDeals },
        total: { gross: pipelineTotalAnoGross, net: pipelineTotalAnoNet, count: pipelineTotalAnoDeals },
        q1: qDetails.Q1 || { gross: 0, net: 0, count: 0 },
        q2: qDetails.Q2 || { gross: 0, net: 0, count: 0 },
        q3: qDetails.Q3 || { gross: 0, net: 0, count: 0 },
        q4: qDetails.Q4 || { gross: 0, net: 0, count: 0 }
      };
    }

    window.pipelineAggByQuarter = safe(DATA, 'cloudAnalysis.aggregations.by_quarter', []);
    window.pipelineAggBySellerQuarter = safe(DATA, 'cloudAnalysis.aggregations.by_seller_quarter', []);
    window.pipelineNetRatio = allPipelineGross > 0 ? (allPipelineNet / allPipelineGross) : 0;

    // Dados Sales Specialist por Fiscal Q (baseado em Closed Date)
    // VISÃO EXECUTIVA: Sales Specialist breakdown  
    const salesSpecCommitGross = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.commit_gross', 0);
    const salesSpecCommitNet = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.commit_net', 0);
    const salesSpecCommitDeals = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.commit_deals', 0);
    const salesSpecUpsideGross = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.upside_gross', 0);
    const salesSpecUpsideNet = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.upside_net', 0);
    const salesSpecUpsideDeals = safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.upside_deals', 0);
    
    window.salesSpecData = {
      all: { gross: pipelineSalesSpecGross, net: pipelineSalesSpecNet, count: pipelineSalesSpecDeals },
      byFiscalQ: safe(DATA, 'cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.by_fiscal_q', {}),
      commitGross: salesSpecCommitGross,
      commitNet: salesSpecCommitNet,
      upsideGross: salesSpecUpsideGross,
      upsideNet: salesSpecUpsideNet
    };
    
    // ============================================================================
    // POPULA KPIs (usa métricas estáticas se disponíveis, senão usa valores locais)
    // ============================================================================
    
    // SE métricas estáticas NÃO foram carregadas ainda, popula com valores locais
    if (!window.STATIC_METRICS_LOADED) {
      log('[HYBRID] Populando KPIs com valores locais (métricas estáticas ainda carregando...)');
      log('[DEBUG] hasActiveFilters:', hasActiveFilters);
      log('[DEBUG] window.currentFilters:', window.currentFilters);
      
      // Pipeline Total (TODOS OS ANOS) - ESTÁTICO
      setTextSafe('exec-pipeline-year-total', formatMoney(allPipelineGross));
      setTextSafe('exec-pipeline-year-deals', allPipelineDeals + ' deals abertos');
      setTextSafe('exec-pipeline-year-net', 'Net: ' + formatMoney(allPipelineNet));

      // Pipeline (Período Filtrado) - DINÂMICO
      // CORREÇÃO CRÍTICA: NUNCA sobrescrever valores da API
      // updateExecutiveMetricsFromAPI() já atualizou com dados frescos do BigQuery
      // Se sobrescrevermos aqui, estaremos usando dados estáticos ANTIGOS do JSON
      log('[PIPELINE FILTERED] ⏭️ MANTENDO valores da API (já atualizados por updateExecutiveMetricsFromAPI)');
      
      // Sales Specialist
      setTextSafe('exec-pipeline-specialist-total', formatMoney(pipelineSalesSpecGross));
      setTextSafe('exec-pipeline-specialist-deals', pipelineSalesSpecDeals + ' deals curados');
      setTextSafe('exec-pipeline-specialist-net', 'Net: ' + formatMoney(pipelineSalesSpecNet));
    } else {
      log('[HYBRID] ⚠ STATIC_METRICS_LOADED = true, pulando população de KPIs');
    }
    
    // Vendedores Ativos e Win Rate
    // CRÍTICO: Se há filtros ativos, usar dados filtrados da API
    let totalVendedores = scorecard.length;
    let displayConversionRate = conversionRate;
    
    if (hasActiveFilters && apiFilteredData.deals_count > 0) {
      // Contar vendedores únicos com deals no período filtrado
      const uniqueSellers = new Set();
      const pipelineDealsFiltered = window.pipelineDataRaw || [];
      pipelineDealsFiltered.forEach(d => {
        if (d.Vendedor) uniqueSellers.add(d.Vendedor);
      });
      totalVendedores = uniqueSellers.size;
      
      // Usar win_rate da API filtrada (já vem do metrics)
      const apiWinRate = safe(DATA, 'cloudAnalysis.pipeline_analysis.metrics.win_rate', null);
      if (apiWinRate !== null) {
        displayConversionRate = Math.round(apiWinRate);
      }
      log('[VENDEDORES] ✓ Usando dados FILTRADOS:', totalVendedores, 'vendedores, Win Rate:', displayConversionRate + '%');
    }
    
    window.totalVendedores = totalVendedores;
    setTextSafe('exec-active-reps', totalVendedores);
    setTextSafe('exec-winrate', 'Win Rate: ' + displayConversionRate + '%');
    
    // Popula Net em outros cards
    // CORREÇÃO: Net Forecast deve usar pipeline FILTRADO quando há filtros ativos
    const pipelineNetForForecast = (hasActiveFilters && apiFilteredData.net) 
      ? apiFilteredData.net 
      : (totalNetSum > 0 ? totalNetSum : (allPipelineNet || pipelineTotalNet || 0));
    const forecastNetWeighted = pipelineNetForForecast * (avgConfidence / 100);
    log('[CALC] Net Forecast:', { totalNetSum, pipelineNetForForecast, avgConfidence, forecastNetWeighted, hasActiveFilters });
    setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNetWeighted));
    setTextSafe('exec-above50-net', 'Net: ' + formatMoney(above50Net));
    
    // CORREÇÃO: Só chamar filterPipeline('all') se NÃO há filtros ativos
    // Caso contrário, mantém valores filtrados da API
    if (!hasActiveFilters) {
      log('[RENDER] 📊 Inicializando com filtro ALL (sem filtros ativos)');
      filterPipeline('all'); // Renderiza view inicial - já popula Deals Fechados e Taxa Conversão
    } else {
      log('[RENDER] ✓ Filtros ativos detectados - MANTENDO valores da API filtrada');
      // Atualiza apenas conversão e forecast health sem tocar no card Pipeline Filtrado
      updateConversionMetricsForPeriod('all');
      if (window.updateForecastHealth) window.updateForecastHealth('all');
    }
    
    // CRÍTICO: Usar avgConfidence filtrado da API quando hasActiveFilters
    const displayAvgConfidence = (hasActiveFilters && apiFilteredData.avg_confidence !== undefined) 
      ? apiFilteredData.avg_confidence 
      : avgConfidence;
    
    if (typeof setExecutiveForecastAndConfidenceCards === 'function') {
      setExecutiveForecastAndConfidenceCards({
        forecastGross: forecastAvgWeighted,
        forecastNet: forecastNetWeighted,
        avgConfidence: displayAvgConfidence,
        highConfGross: above50Value,
        highConfNet: above50Net,
        highConfCount: above50Count,
      });
    }
    
    // Métricas de Idle Days agora vêm do endpoint /api/metrics via updateExecutiveMetricsFromAPI
    // (chamada já feita em loadData após receber metrics do backend)
    
    // Armazena métricas de ganhas/perdidas para uso global
    window.conversionMetrics = {
      winsGross,
      winsNet,
      lossesGross,
      lossesNet,
      totalWins,
      totalLosses,
      totalDeals,
      conversionRate
    };
    
    // Saúde do Forecast (barra visual)
    // Análise IA: COMMIT ≥90%, UPSIDE 50-89%, PIPELINE <50%
    const totalForecast = commitValue + upsideValue + pipelineValue;
    const commitPercent = totalForecast > 0 ? (commitValue / totalForecast) * 100 : 0;
    const upsidePercent = totalForecast > 0 ? (upsideValue / totalForecast) * 100 : 0;
    const pipelinePercent = totalForecast > 0 ? (pipelineValue / totalForecast) * 100 : 0;
    log('[CALC] Forecast saúde:', {
      'commit': Math.round(commitPercent) + '% (' + formatMoney(commitValue) + ')',
      'upside': Math.round(upsidePercent) + '% (' + formatMoney(upsideValue) + ')',
      'pipeline': Math.round(pipelinePercent) + '% (' + formatMoney(pipelineValue) + ')'
    });
    
    setBarSafe('forecast-commit-bar', commitPercent, commitPercent >= 15 ? 'COMMIT' : '');
    setBarSafe('forecast-upside-bar', upsidePercent, upsidePercent >= 15 ? 'UPSIDE' : '');
    setBarSafe('forecast-pipeline-bar', pipelinePercent, pipelinePercent >= 15 ? 'PIPELINE' : '');
    
    setTextSafe('forecast-commit-value', formatMoney(commitValue) + ' (' + Math.round(commitPercent) + '%)');
    setTextSafe('forecast-upside-value', formatMoney(upsideValue) + ' (' + Math.round(upsidePercent) + '%)');
    setTextSafe('forecast-pipeline-value', formatMoney(pipelineValue) + ' (' + Math.round(pipelinePercent) + '%)');
    
    // Saúde do Forecast - Sales Specialist (usando dados do backend)
    const totalSalesSpec = salesSpecCommitGross + salesSpecUpsideGross;
    const ssCommitPercent = totalSalesSpec > 0 ? (salesSpecCommitGross / totalSalesSpec) * 100 : 0;
    const ssUpsidePercent = totalSalesSpec > 0 ? (salesSpecUpsideGross / totalSalesSpec) * 100 : 0;
    
    log('[CALC] Sales Specialist saúde:', {
      'commit': Math.round(ssCommitPercent) + '% (' + formatMoney(salesSpecCommitGross) + ')',
      'upside': Math.round(ssUpsidePercent) + '% (' + formatMoney(salesSpecUpsideGross) + ')'
    });
    
    setBarSafe('forecast-ss-commit-bar', ssCommitPercent, ssCommitPercent >= 15 ? 'COMMIT' : '');
    setBarSafe('forecast-ss-upside-bar', ssUpsidePercent, ssUpsidePercent >= 15 ? 'UPSIDE' : '');
    
    setTextSafe('forecast-ss-commit-value', formatMoney(salesSpecCommitGross) + ' (' + Math.round(ssCommitPercent) + '%)');
    setTextSafe('forecast-ss-upside-value', formatMoney(salesSpecUpsideGross) + ' (' + Math.round(ssUpsidePercent) + '%)');

    animateForecastBars(['forecast-ss-commit-bar', 'forecast-ss-upside-bar']);
    
    // SEÇÃO 2: Análise Estratégica da IA — renderiza na aba inline #exec-ia-content
    const execContentEl   = document.getElementById('exec-ia-content');
    const execActionsEl   = document.getElementById('exec-ia-actions');
    const execFilterBadges = document.getElementById('ia-filter-badges');
    const execToggleLabel = document.getElementById('executive-toggle-label');
    const execToggleCaret = document.getElementById('executive-toggle-caret');

    // Modo: booking (booking_gross / booking_net) vs revenue ERP (gross / net)
    const isRevenueMode = ['gross', 'net'].includes(window.execDisplayMode || '');

    // Popula badges de filtros ativos
    if (execFilterBadges) {
      const filterIconSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
      if (isRevenueMode) {
        // Filtros ERP
        const badges = [];
        const selectedValues = (id) => Array.from(document.getElementById(id)?.selectedOptions || []).map(o => o.value).filter(Boolean);
        const fy  = document.getElementById('year-filter')?.value;
        const fq  = document.getElementById('quarter-filter')?.value;
        const fm  = document.getElementById('month-filter')?.value;
        const fpo = selectedValues('erp-portfolio-filter');
        const fsp = selectedValues('erp-payment-status-filter');
        const fpr = selectedValues('erp-product-filter');
        const fto = selectedValues('erp-opportunity-type-line-filter');
        const fsg = selectedValues('erp-segment-filter');
        if (fy)  badges.push(`Ano: ${fy}`);
        if (fq)  badges.push(`Q${fq}`);
        if (fm)  badges.push(`Mês: ${fm}`);
        if (fpo.length) badges.push(`Portfólio: ${fpo.length > 2 ? fpo.length + ' selecionados' : fpo.join(', ')}`);
        if (fsp.length) badges.push(`Status: ${fsp.length > 2 ? fsp.length + ' selecionados' : fsp.join(', ')}`);
        if (fpr.length) badges.push(`Produto: ${fpr.length > 2 ? fpr.length + ' selecionados' : fpr.join(', ')}`);
        if (fto.length) badges.push(`Tipo Oportunidade: ${fto.length > 2 ? fto.length + ' selecionados' : fto.join(', ')}`);
        if (fsg.length) badges.push(`Segmento: ${fsg.length > 2 ? fsg.length + ' selecionados' : fsg.join(', ')}`);
        badges.push((window.execDisplayMode === 'net') ? 'Net Revenue (ERP)' : 'Gross Revenue (ERP)');
        execFilterBadges.innerHTML = badges
          .map(b => `<span class="ia-filter-badge active">${filterIconSVG} ${b}</span>`)
          .join('');
      } else {
        // Filtros Booking CRM
        const badges = [];
        if (window.currentFilters) {
          const f = window.currentFilters;
          if (f.year)           badges.push(`Ano: ${f.year}`);
          if (f.quarter)        badges.push(`Q${f.quarter}`);
          if (f.month)          badges.push(`Mês: ${f.month}`);
          if (f.seller)         badges.push(`Vendedor: ${f.seller}`);
          if (f.vertical_ia)    badges.push(`Vertical: ${f.vertical_ia}`);
          if (f.billing_state)  badges.push(`Estado: ${f.billing_state}`);
          if (f.billing_city)   badges.push(`Cidade: ${f.billing_city}`);
          if (f.phase)          badges.push(`Fase: ${f.phase}`);
          if (f.owner_preventa) badges.push(`Pré-venda: ${f.owner_preventa}`);
          if (f.portfolio)      badges.push(`Portfólio: ${f.portfolio}`);
          if (f.portfolio_fdm)  badges.push(`Portfólio FDM: ${f.portfolio_fdm}`);
        }
        if (badges.length === 0) {
          execFilterBadges.innerHTML = '<span class="ia-filter-badge">Todos os dados do quarter</span>';
        } else {
          execFilterBadges.innerHTML = badges
            .map(b => `<span class="ia-filter-badge active">${filterIconSVG} ${b}</span>`)
            .join('');
        }
      }
    }

    // SVG helper: retorna inline SVG por iconKey
    function iaIconSVG(key) {
      const icons = {
        winrate:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
        target:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        score:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M7 12h10M12 7v10"/></svg>',
        calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        clock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        zap:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        layers:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
        star:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        bar:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"/></svg>',
        alert:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      };
      return icons[key] || icons['bar'];
    }

    if (execContentEl) {
      if (isRevenueMode) {
        // Revenue Analysis IA — dados do ERP (faturamento)
        if (window._erpLastData && typeof renderIARevenue === 'function') {
          renderIARevenue(window._erpLastData);
        } else {
          execContentEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ui-text-3,#64748b);font-size:13px;">Aguardando dados de receita — selecione um período e o modo GROSS/NET REVENUE.</div>';
          if (execActionsEl) execActionsEl.innerHTML = '';
        }
      } else if (DATA.aiAnalysis && DATA.aiAnalysis.executive) {
        execContentEl.innerHTML = cleanAIResponse(DATA.aiAnalysis.executive);
      } else {
        // CORREÇÃO: Usa valores FILTRADOS quando há filtros ativos
        const displayPipelineGross = (hasActiveFilters && apiFilteredData.gross) ? apiFilteredData.gross : allPipelineGross;
        const displayPipelineDeals = (hasActiveFilters && apiFilteredData.deals_count) ? apiFilteredData.deals_count : allPipelineDeals;
        const displayAvgConfidence = (hasActiveFilters && apiFilteredData.avg_confidence) ? apiFilteredData.avg_confidence : avgConfidence;
        const displayForecastWeighted = displayPipelineGross * (displayAvgConfidence / 100);
        const displaySalesSpecDeals = pipelineSalesSpecDeals;
        const displaySalesSpecGross = pipelineSalesSpecGross;

        // Define variáveis de forecast categories para uso posterior
        const hasCommit = totalForecast > 0 && commitPercent >= 10;
        const hasUpside = totalForecast > 0 && upsidePercent >= 20;
        const hasPipeline = totalForecast > 0 && pipelinePercent >= 30;

        // Calcula ciclos médios de won/lost para análise
        let avgWinCycle = 0;
        let avgLossCycle = 0;
        if (wonAgg && wonAgg.length > 0) {
          const totalCicloWin = wonAgg.reduce((sum, d) => sum + (d.ciclo_dias || d.Ciclo_dias || 0), 0);
          avgWinCycle = totalCicloWin / wonAgg.length;
        }
        if (lostAgg && lostAgg.length > 0) {
          const totalCicloLoss = lostAgg.reduce((sum, d) => sum + (d.ciclo_dias || d.Ciclo_dias || 0), 0);
          avgLossCycle = totalCicloLoss / lostAgg.length;
        }

        // MÉTRICAS CALCULADAS PARA ANÁLISE INTELIGENTE
        const ticketMedio = displayPipelineDeals > 0 ? displayPipelineGross / displayPipelineDeals : 0;
        const ticketGanho = totalWins > 0 ? winsGross / totalWins : 0;
        const ticketPerda = totalLosses > 0 ? lossesGross / totalLosses : 0;
        const ratioPerdasVsGanhos = winsGross > 0 ? lossesGross / winsGross : 0;
        const coverage = winsGross > 0 ? (displayForecastWeighted / winsGross) : 0;
        const eficienciaCiclo = totalWins > 0 && totalLosses > 0 ? ((avgWinCycle || 0) / (avgLossCycle || 1)) : 0;

        // ====== ANÁLISE ESTRATÉGICA — nova estrutura ia-diag-card ======
        const diagCards = [];   // { type, iconKey, title, impact, desc, action }
        const actionSteps = []; // { label, desc, urgent }

        // ——— DIAGNÓSTICO 1: Win Rate ———
        if (displayConversionRate < 20 && totalDeals >= 10) {
          let desc = `Win Rate de ${displayConversionRate}% está muito abaixo do benchmark de 30%. Para cada ${Math.max(1, totalDeals - totalWins)} deals perdidos só ${totalWins} converteram — desperdício direto de recursos do time de vendas.`;
          let action = 'Revisar urgentemente processo de qualificação e ICP.';
          if (ticketPerda > ticketGanho * 1.5) {
            desc += ` O padrão mais preocupante: estamos investindo tempo em deals grandes sem fit — ticket médio perdido (${formatMoney(ticketPerda)}) é ${Math.round(ticketPerda/ticketGanho)}× maior que o ticket ganho (${formatMoney(ticketGanho)}).`;
            action = `Implementar filtro MEDDIC obrigatório antes de investir em deals acima de ${formatMoney(ticketPerda * 0.8)}.`;
          } else if (ratioPerdasVsGanhos > 10) {
            desc += ` ${Math.round(ratioPerdasVsGanhos)}× mais valor perdido que ganho — sinal claro de ausência de qualificação.`;
            action = 'Pausar abertura de novos deals até revisar ICP e processo de qualificação.';
          }
          diagCards.push({
            type: 'critical', iconKey: 'winrate',
            title: 'Win Rate Crítico',
            metric: { value: displayConversionRate + '%', label: 'Win Rate atual · benchmark: 30%+' },
            stats: [
              { key: 'Total Deals', val: totalDeals },
              { key: 'Ganhos', val: totalWins },
              { key: 'Perdas', val: totalLosses },
              { key: 'Ticket Ganho', val: formatMoney(ticketGanho) },
              { key: 'Ticket Perdido', val: formatMoney(ticketPerda) },
              { key: 'Valor Perdido', val: formatMoney(lossesGross) },
            ],
            desc, action,
            drillLabel: 'Ver análise de oportunidades',
            drillFn: "switchExecTab('oportunidades')",
          });
          actionSteps.push({ label: 'Qualificação de Entrada', desc: action, urgent: true });
        } else if (displayConversionRate >= 20 && displayConversionRate < 30 && totalDeals >= 10) {
          diagCards.push({
            type: 'warning', iconKey: 'winrate',
            title: 'Win Rate Abaixo do Benchmark',
            metric: { value: displayConversionRate + '%', label: `Win Rate · benchmark: 30%+ · gap: ${30 - displayConversionRate}pp` },
            stats: [
              { key: 'Total Deals', val: totalDeals },
              { key: 'Ganhos', val: totalWins },
              { key: 'Perdas', val: totalLosses },
              { key: 'Valor Perdido', val: formatMoney(lossesGross) },
            ],
            desc: `Com ${formatMoney(lossesGross)} perdidos, há margem relevante para melhora via qualificação na entrada do processo. ${totalLosses} deals foram descartados — revisar os motivos principais pode revelar padrões evitáveis.`,
            action: 'Implementar checklist BANT obrigatório antes de avançar para Proposta.',
            drillLabel: 'Analisar perfil de perdas',
            drillFn: "switchExecTab('oportunidades')",
          });
          actionSteps.push({ label: 'Qualificação BANT', desc: 'Implementar checklist obrigatório antes de avançar para Proposta.', urgent: false });
        }

        // ——— DIAGNÓSTICO 2: Cobertura de Pipeline ———
        if (coverage < 2 && winsGross > 0) {
          const gap = formatMoney(winsGross * 3 - displayForecastWeighted);
          diagCards.push({
            type: 'critical', iconKey: 'target',
            title: 'Cobertura Crítica de Pipeline',
            metric: { value: coverage.toFixed(1) + '×', label: `Cobertura atual · mín. recomendado: 3× · gap: ${gap}` },
            stats: [
              { key: 'Pipeline Total', val: formatMoney(displayPipelineGross) },
              { key: 'Deals Abertos', val: displayPipelineDeals },
              { key: 'Forecast Ponderado', val: formatMoney(displayForecastWeighted) },
              { key: 'Conf. Média IA', val: Math.round(displayAvgConfidence) + '%' },
            ],
            desc: `Cobertura de ${coverage.toFixed(1)}× é insuficiente para garantir o trimestre. Pipeline de ${formatMoney(displayPipelineGross)} com confiança média de ${Math.round(displayAvgConfidence)}% resulta em forecast ponderado de apenas ${formatMoney(displayForecastWeighted)}. É necessário adicionar ${gap} em pipeline qualificado.`,
            action: 'Intensificar prospecção e qualificação de novos deals imediatamente.',
            drillLabel: 'Ver distribuição do pipeline',
            drillFn: "switchMetricView('view-graficos', document.getElementById('view-btn-graficos'))",
          });
          actionSteps.push({ label: 'Reconstrução de Pipeline', desc: `Adicionar ${gap} em pipeline qualificado nos próximos 30 dias.`, urgent: true });
        } else if (coverage > 5) {
          diagCards.push({
            type: 'healthy', iconKey: 'bar',
            title: 'Pipeline Saudável',
            metric: { value: coverage.toFixed(1) + '×', label: 'Cobertura de pipeline · benchmark: 3×' },
            stats: [
              { key: 'Pipeline', val: formatMoney(displayPipelineGross) },
              { key: 'Deals', val: displayPipelineDeals },
              { key: 'Forecast Pond.', val: formatMoney(displayForecastWeighted) },
            ],
            desc: `Cobertura forte de ${coverage.toFixed(1)}× indica pipeline saudável acima do mínimo recomendado. O foco executivo deve estar em aceleração e conversão, não em geração de novos deals.`,
            action: 'Priorizar deals ≥50% confiança para fechamento rápido.',
            drillLabel: 'Ver oportunidades prioritárias',
            drillFn: "switchExecTab('oportunidades')",
          });
        }

        // ——— DIAGNÓSTICO 3: Scoring / Confiança ———
        if (displayAvgConfidence < 35 && displayPipelineDeals > 10) {
          const auditCount = Math.round(displayPipelineDeals * 0.3);
          diagCards.push({
            type: 'critical', iconKey: 'score',
            title: 'Scoring de IA Comprometido',
            metric: { value: Math.round(displayAvgConfidence) + '%', label: 'Confiança média · benchmark: 50%+' },
            stats: [
              { key: 'Deals no Pipeline', val: displayPipelineDeals },
              { key: 'Conf. Média', val: Math.round(displayAvgConfidence) + '%' },
              { key: 'Deals ≥50%', val: above50Count },
              { key: 'Valor ≥50%', val: formatMoney(above50Value) },
            ],
            desc: `IA está sinalizando baixa confiança geral no pipeline. Possíveis causas: deals mal qualificados, inatividade prolongada nos negócios ou preenchimento incompleto do MEDDIC. Com ${above50Count} de ${displayPipelineDeals} deals acima de 50%, apenas ${formatMoney(above50Value)} têm maturidade para fechamento.`,
            action: `Auditar os ${auditCount} maiores deals e atualizar MEDDIC, próximas ações e estimativas de fechamento.`,
            drillLabel: 'Revisar deals no pipeline',
            drillFn: "switchExecTab('oportunidades')",
          });
          actionSteps.push({ label: 'Auditoria de Scoring', desc: `Revisar MEDDIC dos ${auditCount} maiores deals e atualizar próximas ações.`, urgent: false });
        }

        // ——— DIAGNÓSTICO 4: Falta de COMMIT ———
        if (!hasCommit && displayPipelineDeals > 5) {
          diagCards.push({
            type: 'critical', iconKey: 'calendar',
            title: 'Risco de Quarter — Sem COMMIT',
            metric: { value: '0', label: 'Deals em COMMIT · fechamentos garantidos no quarter' },
            stats: [
              { key: 'Deals Pipeline', val: displayPipelineDeals },
              { key: 'Quick Wins (≥50%)', val: above50Count },
              { key: 'Valor Quick Wins', val: formatMoney(above50Value) },
              { key: 'Cobertura', val: coverage.toFixed(1) + '×' },
            ],
            desc: `Nenhum deal classificado como COMMIT — sem fechamentos garantidos no curto prazo. A receita do quarter depende inteiramente de avanços de deals que ainda não estão maduros. ${above50Count > 0 ? `Existem ${above50Count} deals com ≥50% de confiança (${formatMoney(above50Value)}) que podem ser acelerados para COMMIT.` : 'É necessário identificar e qualificar ativamente novos deals para fechamento.'}`,
            action: above50Count > 0
              ? `Daily standup nos ${above50Count} deals ≥50% confiança. Meta: mover ${Math.min(3, above50Count)} para COMMIT até fim do mês.`
              : 'Identificar 5 deals com potencial de fechamento em 30–45 dias e iniciar aceleração.',
            drillLabel: 'Ver COMMIT e Forecast no Resumo',
            drillFn: "switchExecTab('resumo')",
          });
          if (above50Count > 0) {
            actionSteps.push({ label: 'Aceleração Imediata', desc: `Daily standups nos ${above50Count} deals ≥50% confiança. Meta: mover ${Math.min(3, above50Count)} para COMMIT.`, urgent: true });
          } else {
            actionSteps.push({ label: 'Reconstrução de Pipeline', desc: 'Identificar 5 deals potenciais com fechamento em 30–45 dias.', urgent: true });
          }
        }

        // ——— DIAGNÓSTICO 5: Ciclo de Perda ———
        if (avgLossCycle > avgWinCycle * 2 && totalLosses >= 5) {
          const extra = Math.round(avgLossCycle - avgWinCycle);
          diagCards.push({
            type: 'warning', iconKey: 'clock',
            title: 'Ineficiência de Ciclo',
            metric: { value: '+' + extra + 'd', label: `Dias desperdiçados por deal perdido · ${totalLosses} perdas no período` },
            stats: [
              { key: 'Ciclo Médio Ganhos', val: Math.round(avgWinCycle) + ' dias' },
              { key: 'Ciclo Médio Perdas', val: Math.round(avgLossCycle) + ' dias' },
              { key: 'Dias Extras/Deal', val: extra + 'd' },
              { key: 'Total Perdas', val: totalLosses },
              { key: 'Custo Oculto', val: extra + 'd × ' + totalLosses + ' deals' },
            ],
            desc: `Deals perdidos levam ${Math.round(avgLossCycle)}d para fechar vs ${Math.round(avgWinCycle)}d nas vitórias — ${Math.round(avgLossCycle / avgWinCycle)}× mais lento. Isso significa ${extra} dias por deal desperdiçados com deals sem fit. Com ${totalLosses} perdas no período, o time investiu aproximadamente ${extra * totalLosses} dias em oportunidades sem resultado.`,
            action: `Implementar critério de saída: deals sem progressão em 60 dias são encerrados. Revisão dos ${totalLosses} motivos de perda para encontrar padrões.`,
            drillLabel: 'Ver análise de perdas',
            drillFn: "switchExecTab('aprendizados')",
          });
          actionSteps.push({ label: 'Critério de Saída', desc: `Definir: 60 dias sem progressão = encerrar deal. Revisar ${totalLosses} análises de perda.`, urgent: false });
        }

        // ——— OPORTUNIDADES: healthy cards ———
        if (above50Count > 0 && displayForecastWeighted > 0) {
          diagCards.push({
            type: 'healthy', iconKey: 'zap',
            title: 'Quick Wins Identificados',
            metric: { value: above50Count.toString(), label: `Deals com confiança ≥50% · ${formatMoney(above50Value)} em valor` },
            stats: [
              { key: 'Deals ≥50%', val: above50Count },
              { key: 'Valor Total', val: formatMoney(above50Value) },
              { key: 'Ticket Médio', val: above50Count > 0 ? formatMoney(above50Value / above50Count) : '—' },
              { key: 'Do Pipeline Total', val: displayPipelineDeals > 0 ? Math.round((above50Count / displayPipelineDeals) * 100) + '%' : '—' },
            ],
            desc: `${above50Count} deals com alta probabilidade de fechamento representam ${formatMoney(above50Value)} em valor realizável. São as oportunidades de maior retorno de esforço — cada hora investida aqui tem ${Math.round(above50Value / (above50Count || 1) / 1000)}k de retorno potencial.`,
            action: `Esses ${above50Count} deals são a prioridade absoluta. Agenda semanal de revisão para cada um.`,
            drillLabel: 'Ver Quick Wins no pipeline',
            drillFn: "switchExecTab('oportunidades')",
          });
        }
        if (displaySalesSpecDeals > 0) {
          const specTicket = displaySalesSpecGross / displaySalesSpecDeals;
          if (specTicket > ticketMedio * 1.3) {
            diagCards.push({
              type: 'healthy', iconKey: 'star',
              title: 'Curadoria de Valor Ativa',
              metric: { value: Math.round((specTicket / ticketMedio) * 100 - 100) + '%', label: 'Ticket acima da média geral · Sales Specialist' },
              stats: [
                { key: 'Deals Curados', val: displaySalesSpecDeals },
                { key: 'Valor Curado', val: formatMoney(displaySalesSpecGross) },
                { key: 'Ticket Curado', val: formatMoney(specTicket) },
                { key: 'Ticket Médio Geral', val: formatMoney(ticketMedio) },
              ],
              desc: `Sales Specialist está focando em deals de maior valor — ticket médio curado de ${formatMoney(specTicket)} é ${Math.round((specTicket / ticketMedio) * 100 - 100)}% acima da média geral (${formatMoney(ticketMedio)}). Estratégia correta: concentrar atenção executiva onde o retorno é maior.`,
              action: 'Expandir programa de curadoria para cobrir mais deals estratégicos acima de 1.3× ticket médio.',
              drillLabel: 'Ver deals curados',
              drillFn: "switchExecTab('oportunidades')",
            });
          }
        } else if (displayPipelineDeals > 15) {
          const auditN = Math.min(5, Math.round(displayPipelineDeals * 0.2));
          diagCards.push({
            type: 'warning', iconKey: 'layers',
            title: 'Curadoria Estratégica Ausente',
            metric: { value: displayPipelineDeals.toString(), label: 'Deals sem triagem executiva' },
            stats: [
              { key: 'Deals Abertos', val: displayPipelineDeals },
              { key: 'Valor Total', val: formatMoney(displayPipelineGross) },
              { key: 'Meta Curadoria', val: auditN + ' deals' },
              { key: 'Cobertura Meta', val: Math.round((auditN / displayPipelineDeals) * 100) + '%' },
            ],
            desc: `${displayPipelineDeals} deals abertos sem triagem manual de um Sales Specialist. Sem curadoria, há alta probabilidade de deals com baixo fit consumindo tempo desproporcionalmente — é impossível garantir atenção executiva nos deals certos.`,
            action: `Sales Specialist deve curar top ${auditN} deals por valor + fit estratégico para atenção executiva imediata.`,
            drillLabel: 'Ver pipeline completo',
            drillFn: "switchExecTab('oportunidades')",
          });
          actionSteps.push({ label: 'Curadoria Estratégica', desc: `Sales Specialist: curar top ${auditN} deals por valor + fit.`, urgent: false });
        }
        if (totalWins > 0 && avgWinCycle < 60) {
          diagCards.push({
            type: 'healthy', iconKey: 'zap',
            title: 'Velocidade de Fechamento',
            metric: { value: Math.round(avgWinCycle) + 'd', label: 'Ciclo médio de ganhos · abaixo de 60d é vantagem competitiva' },
            stats: [
              { key: 'Ciclo Médio Ganhos', val: Math.round(avgWinCycle) + ' dias' },
              { key: 'Total Ganhos', val: totalWins },
              { key: 'Receita Fechada', val: formatMoney(winsGross) },
              { key: 'Ticket Médio Ganho', val: formatMoney(ticketGanho) },
            ],
            desc: `Ciclo médio de fechamento de ${Math.round(avgWinCycle)} dias é uma vantagem competitiva real — abaixo de 60 dias demonstra agilidade de processo e qualidade de qualificação. Mapear e replicar o perfil desses deals pode escalar esse resultado.`,
            action: 'Mapear perfil dos deals fechados: estágio de entrada, vendedor, região, vertical. Replicar no playbook.',
            drillLabel: 'Ver perfil de ganhos',
            drillFn: "switchExecTab('aprendizados')",
          });
        }

        // ——— FALLBACK ———
        if (diagCards.length === 0) {
          diagCards.push({
            type: 'healthy', iconKey: 'check',
            title: 'Performance Dentro do Esperado',
            metric: { value: displayConversionRate + '%', label: 'Win Rate · pipeline saudável' },
            stats: [
              { key: 'Deals', val: totalDeals },
              { key: 'Ganhos', val: totalWins },
              { key: 'Pipeline', val: formatMoney(displayPipelineGross) },
            ],
            desc: 'Métricas principais estão dentro do esperado. Continue monitorando cadência de pipeline e qualidade de qualificação.',
            action: 'Manter revisão semanal de pipeline e atualização de MEDDIC.',
            drillLabel: 'Ver pipeline',
            drillFn: "switchExecTab('oportunidades')",
          });
        }
        if (actionSteps.length === 0) {
          actionSteps.push({ label: 'Revisão Semanal', desc: 'Manter cadência de revisão de pipeline e atualização de MEDDIC.', urgent: false });
        }

        // ——— RENDER HELPERS ———
        const arrowSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;margin-top:2px;opacity:0.6;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        const chevronRightSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>';
        const severityLabel = { critical: 'Crítico', warning: 'Alerta', healthy: 'Saudável' };

        // ——— RENDER: ia-diag-card grid ———
        const diagCardHTML = diagCards.map(c => {
          const statsHTML = c.stats && c.stats.length > 0
            ? `<div class="ia-diag-stats">${c.stats.map(s => `<div class="ia-diag-stat"><span class="ia-diag-stat-key">${s.key}</span><span class="ia-diag-stat-val">${s.val}</span></div>`).join('')}</div>`
            : '';
          const drillBtn = c.drillLabel
            ? `<button class="ia-drill-btn" onclick="${c.drillFn}">${c.drillLabel} ${chevronRightSVG}</button>`
            : '';
          return `
          <div class="ia-diag-card ${c.type}">
            <div class="ia-diag-top">
              <span class="ia-diag-severity">${severityLabel[c.type] || c.type}</span>
              <span class="ia-diag-icon-wrap">${iaIconSVG(c.iconKey)}</span>
              <div class="ia-diag-title">${c.title}</div>
            </div>
            ${c.metric ? `<div class="ia-diag-metric-row"><span class="ia-diag-metric-value">${c.metric.value}</span><span class="ia-diag-metric-label">${c.metric.label}</span></div>` : ''}
            <p class="ia-diag-desc">${c.desc}</p>
            ${statsHTML}
            <div class="ia-diag-footer">
              <p class="ia-diag-action">${arrowSVG} ${c.action}</p>
              ${drillBtn}
            </div>
          </div>`;
        }).join('');

        // ——— RENDER: ia-action-item list ———
        const urgentDot = '<span class="ia-urgent-dot"></span>';
        const actionHTML = actionSteps.map((s, i) => `
          <div class="ia-action-item${s.urgent ? ' urgent' : ''}">
            <div class="ia-action-num">${i + 1}</div>
            <div class="ia-action-body">
              <strong>${s.urgent ? urgentDot : ''}${s.label}</strong>
              <p>${s.desc}</p>
            </div>
          </div>`).join('');

        // ——— INJECT ———
        execContentEl.innerHTML = diagCardHTML;
        if (execActionsEl) execActionsEl.innerHTML = actionHTML;
      }
    }

    // Exposição para o botão "Atualizar" da aba
    window.refreshIAAnalysis = function() {
      if (typeof renderDashboard === 'function') renderDashboard();
    };
    
    // SEÇÃO 3: DESTAQUES OPERACIONAIS DO QUARTER
    
    // Oportunidade-Chave #1 (maior valor aberto no quarter)
    let keyOpp = null;
    let maxValue = 0;
    Object.values(quarters).forEach(deals => {
      if (deals && Array.isArray(deals)) {
        deals.forEach(d => {
          if ((d.val || 0) > maxValue) {
            maxValue = d.val || 0;
            keyOpp = d;
          }
        });
      }
    });
    
    if (keyOpp) {
      setTextSafe('exec-key-opp-name', keyOpp.name || 'N/A');
      setTextSafe('exec-key-opp-value', formatMoney(keyOpp.val || 0));
      setTextSafe('exec-key-opp-account', keyOpp.account || 'Conta não especificada');
      setTextSafe('exec-key-opp-owner', keyOpp.seller || keyOpp.owner || 'N/A');
      setTextSafe('exec-key-opp-why', 'Maior valor em aberto (' + formatMoney(keyOpp.val || 0) + ')');
      
      log('[KEY OPP] Deal selecionado:', { 
        name: keyOpp.name, 
        account: keyOpp.account, 
        seller: keyOpp.seller, 
        value: maxValue,
        allFields: Object.keys(keyOpp)
      });
      
      const riskFactors = [];
      const confidencePercent = Math.round(keyOpp.confidence || 0);
      if (confidencePercent < 50) riskFactors.push('Baixa confiança (' + confidencePercent + '%)');
      if ((keyOpp.daysToClose || 0) < 0) riskFactors.push('Atrasado');
      if (keyOpp.daysIdle > 30) riskFactors.push('Idle ' + keyOpp.daysIdle + ' dias');
      else if (keyOpp.daysIdle > 14) riskFactors.push('Idle ' + keyOpp.daysIdle + ' dias');
      
      setTextSafe('exec-key-opp-risk', riskFactors.length > 0 ? riskFactors.join(', ') : 'Nenhum risco crítico identificado');
      
      // NOVO: Análise IA completa do deal
      const aiAnalysis = [];
      aiAnalysis.push(`Deal no estágio "${keyOpp.stage || 'N/A'}"`);
      if (keyOpp.confidence !== undefined && keyOpp.confidence !== null) {
        const confPercent = Math.round(keyOpp.confidence);
        if (confPercent >= 70) aiAnalysis.push(`Alta probabilidade de conversão (${confPercent}%)`);
        else if (confPercent >= 40) aiAnalysis.push(`Probabilidade moderada (${confPercent}%)`);
        else aiAnalysis.push(`Requer atenção urgente (confiança ${confPercent}%)`);
      }
      if (keyOpp.activities) {
        if (keyOpp.activities >= 5) aiAnalysis.push(`Bem engajado (${keyOpp.activities} atividades)`);
        else aiAnalysis.push(`Engajamento baixo (${keyOpp.activities} atividades)`);
      }
      if ((keyOpp.daysIdle || 0) > 0) aiAnalysis.push(`Idle ${keyOpp.daysIdle} dias`);
      if (keyOpp.forecastCategory) {
        aiAnalysis.push(`Categoria: ${keyOpp.forecastCategory}`);
      }
      if (keyOpp.profile) aiAnalysis.push(`Perfil: ${keyOpp.profile}`);
      
      setTextSafe('exec-key-opp-ai', aiAnalysis.join('. ') + '.');
      log('[KEY OPP] Deal exibido:', { name: keyOpp.name, account: keyOpp.account, seller: keyOpp.seller, value: maxValue });
    } else {
      setTextSafe('exec-key-opp-name', 'Nenhuma oportunidade aberta');
      setTextSafe('exec-key-opp-value', '$0');
      setTextSafe('exec-key-opp-account', '-');
      setTextSafe('exec-key-opp-owner', '-');
      setTextSafe('exec-key-opp-why', '-');
      setTextSafe('exec-key-opp-risk', '-');
      setTextSafe('exec-key-opp-ai', '-');
    }
    
    // Vitória Destaque (maior deal individual ganho no período - busca no wonAgg)
    let topWinDeal = null;
    let maxWinValue = 0;
    
    if (wonAgg && Array.isArray(wonAgg)) {
      wonAgg.forEach(deal => {
        const dealValue = deal.Gross || deal.gross || 0;
        if (dealValue > maxWinValue) {
          maxWinValue = dealValue;
          topWinDeal = deal;
        }
      });
    }
    
    if (topWinDeal && maxWinValue > 0) {
      const dealName = topWinDeal.Opportunity_Name || topWinDeal.opportunityName || 'Deal Ganho';
      const dealOwner = topWinDeal.Vendedor || topWinDeal.seller || topWinDeal.owner || 'Vendedor não especificado';
      const dealAccount = topWinDeal.Conta || topWinDeal.account || 'Conta não especificada';
      
      setTextSafe('exec-top-win-name', dealName);
      setTextSafe('exec-top-win-value', formatMoney(maxWinValue));
      setTextSafe('exec-top-win-account', dealAccount);
      setTextSafe('exec-top-win-owner', dealOwner);
      
      // Motivo de vitória - prioriza Win_Reason do BigQuery
      const winReason = topWinDeal.Win_Reason || topWinDeal.winReason;
      const winReasons = [];
      
      if (winReason && winReason !== 'Motivo não especificado') {
        winReasons.push(winReason);
      } else {
        // Fallback: análise baseada em dados
        if (maxWinValue > 500000) winReasons.push('Deal de alto valor');
        const ciclo = topWinDeal.ciclo_dias || topWinDeal.Ciclo_dias || 0;
        if (ciclo > 0 && ciclo < 90) winReasons.push('Ciclo rápido (' + Math.round(ciclo) + ' dias)');
        if (!winReasons.length) winReasons.push('Maior deal ganho no período');
      }
      
      setTextSafe('exec-top-win-why', winReasons.join('. '));
      
      // NOVO: Análise IA da vitória
      const winAiAnalysis = [];
      const ciclo = topWinDeal.ciclo_dias || topWinDeal.Ciclo_dias || 0;
      if (ciclo > 0) {
        if (ciclo < 60) winAiAnalysis.push(`Fechado rapidamente em ${Math.round(ciclo)} dias`);
        else if (ciclo < 120) winAiAnalysis.push(`Ciclo padrão de ${Math.round(ciclo)} dias`);
        else winAiAnalysis.push(`Ciclo longo de ${Math.round(ciclo)} dias`);
      }
      if (maxWinValue > 1000000) winAiAnalysis.push('Enterprise deal estratégico');
      else if (maxWinValue > 500000) winAiAnalysis.push('Deal de médio-alto valor');
      if (topWinDeal.Net) {
        const margin = ((topWinDeal.Net / maxWinValue) * 100).toFixed(1);
        winAiAnalysis.push(`Margem: ${margin}%`);
      }
      
      setTextSafe('exec-top-win-ai', winAiAnalysis.length > 0 ? winAiAnalysis.join('. ') + '.' : 'Vitória importante para o quarter.');
      log('[WIN] Deal exibido:', { dealName, dealOwner, dealAccount, maxWinValue, winReasons });
    } else {
      setTextSafe('exec-top-win-name', 'Nenhuma vitória registrada');
      setTextSafe('exec-top-win-value', '$0');
      setTextSafe('exec-top-win-account', '-');
      setTextSafe('exec-top-win-owner', '-');
      setTextSafe('exec-top-win-why', '-');
      setTextSafe('exec-top-win-ai', '-');
    }
    
    // Perda Destaque (maior deal individual perdido no período - busca no lostAgg)
    let topLossDeal = null;
    let maxLossValue = 0;
    
    if (lostAgg && Array.isArray(lostAgg)) {
      lostAgg.forEach(deal => {
        const dealValue = deal.Gross || deal.gross || 0;
        if (dealValue > maxLossValue) {
          maxLossValue = dealValue;
          topLossDeal = deal;
        }
      });
    }
    
    if (topLossDeal && maxLossValue > 0) {
      const dealName = topLossDeal.Opportunity_Name || topLossDeal.opportunityName || 'Deal Perdido';
      const dealOwner = topLossDeal.Vendedor || topLossDeal.seller || topLossDeal.owner || 'Vendedor não especificado';
      const dealAccount = topLossDeal.Conta || topLossDeal.account || 'Conta não especificada';
      
      setTextSafe('exec-top-loss-name', dealName);
      setTextSafe('exec-top-loss-value', formatMoney(maxLossValue));
      setTextSafe('exec-top-loss-account', dealAccount);
      setTextSafe('exec-top-loss-owner', dealOwner);
      
      // Motivo de perda - prioriza Loss_Reason do BigQuery
      const lossReason = topLossDeal.Loss_Reason || topLossDeal.lossReason || topLossDeal.cause || 'Motivo não especificado';
      setTextSafe('exec-top-loss-why', lossReason);
      
      // NOVO: Análise IA da perda
      const lossAiAnalysis = [];
      const ciclo = topLossDeal.ciclo_dias || topLossDeal.Ciclo_dias || 0;
      if (ciclo > 0) {
        if (ciclo > 180) lossAiAnalysis.push(`Deal travado por ${Math.round(ciclo)} dias antes da perda`);
        else lossAiAnalysis.push(`Ciclo de ${Math.round(ciclo)} dias até perda`);
      }
      if (maxLossValue > 1000000) lossAiAnalysis.push('Perda de alto impacto (>$1M)');
      else if (maxLossValue > 500000) lossAiAnalysis.push('Perda significativa');
      
      // Análise da causa
      if (lossReason.toLowerCase().includes('preço') || lossReason.toLowerCase().includes('custo')) {
        lossAiAnalysis.push('Oportunidade de revisar estratégia de pricing');
      } else if (lossReason.toLowerCase().includes('concor') || lossReason.toLowerCase().includes('compet')) {
        lossAiAnalysis.push('Análise competitiva recomendada');
      } else if (lossReason.toLowerCase().includes('timing') || lossReason.toLowerCase().includes('budget')) {
        lossAiAnalysis.push('Oportunidade futura potencial');
      }
      
      setTextSafe('exec-top-loss-ai', lossAiAnalysis.length > 0 ? lossAiAnalysis.join('. ') + '.' : 'Requer análise post-mortem detalhada.');
      log('[LOSS] Deal exibido:', { dealName, dealOwner, dealAccount, maxLossValue, lossReason });
    } else {
      setTextSafe('exec-top-loss-name', 'Nenhuma perda significativa');
      setTextSafe('exec-top-loss-value', '$0');
      setTextSafe('exec-top-loss-account', '-');
      setTextSafe('exec-top-loss-owner', '-');
      setTextSafe('exec-top-loss-why', '-');
      setTextSafe('exec-top-loss-ai', '-');
    }
    
    // SEÇÃO 4: DESTAQUES DA EQUIPE NO QUARTER
    
    // Calcular performance real por vendedor usando wonAgg/lostAgg
    const sellerPerformance = {};
    
    if (wonAgg && Array.isArray(wonAgg)) {
      wonAgg.forEach(deal => {
        const seller = deal.Vendedor || deal.seller || 'Unknown';
        if (!sellerPerformance[seller]) {
          sellerPerformance[seller] = { 
            name: seller, 
            wins: 0, 
            losses: 0, 
            winRevenue: 0, 
            lossRevenue: 0,
            avgWinCycle: 0,
            totalWinCycle: 0
          };
        }
        sellerPerformance[seller].wins++;
        sellerPerformance[seller].winRevenue += (deal.Gross || deal.gross || 0);
        sellerPerformance[seller].totalWinCycle += (deal.ciclo_dias || deal.Ciclo_dias || 0);
      });
    }
    
    if (lostAgg && Array.isArray(lostAgg)) {
      lostAgg.forEach(deal => {
        const seller = deal.Vendedor || deal.seller || 'Unknown';
        if (!sellerPerformance[seller]) {
          sellerPerformance[seller] = { 
            name: seller, 
            wins: 0, 
            losses: 0, 
            winRevenue: 0, 
            lossRevenue: 0,
            avgWinCycle: 0,
            totalWinCycle: 0
          };
        }
        sellerPerformance[seller].losses++;
        sellerPerformance[seller].lossRevenue += (deal.Gross || deal.gross || 0);
      });
    }
    
    // Calcular métricas derivadas
    Object.values(sellerPerformance).forEach(seller => {
      const totalDeals = seller.wins + seller.losses;
      seller.winRate = totalDeals > 0 ? Math.round((seller.wins / totalDeals) * 100) : 0;
      seller.avgWinCycle = seller.wins > 0 ? Math.round(seller.totalWinCycle / seller.wins) : 0;
      seller.totalRevenue = seller.winRevenue + seller.lossRevenue;
    });
    
    log('[TEAM] Vendedores no período:', Object.keys(sellerPerformance).length);
    
    // MVP do Quarter (melhor performance combinada: revenue + win rate + eficiência)
    let mvp = null;
    let mvpScore = 0;
    Object.values(sellerPerformance).forEach(seller => {
      // LÓGICA MELHORADA: Aceita vendedores com ≥1 ganho OU deals significativos
      const totalDeals = seller.wins + seller.losses;
      if (seller.wins >= 1 || totalDeals >= 3) {
        // Score composto: (revenue * 0.6) + (winRate * 0.3) + (eficiência ciclo * 0.1)
        const revenueScore = seller.winRevenue / 1000000; // Normaliza para milhões
        const winRateScore = (seller.winRate / 100) * 2; // 0-2
        const cycleScore = seller.avgWinCycle > 0 ? Math.max(0, 2 - (seller.avgWinCycle / 60)) : 0; // Melhor se ciclo <60d
        const score = (revenueScore * 0.6) + (winRateScore * 0.3) + (cycleScore * 0.1);
        
        if (score > mvpScore) {
          mvpScore = score;
          mvp = seller;
        }
      }
    });
    
    if (mvp) {
      const initial = mvp.name ? mvp.name.charAt(0).toUpperCase() : '?';
      setTextSafe('exec-mvp-initial', initial);
      setTextSafe('exec-mvp-name', mvp.name);
      
      const highlights = [];
      highlights.push(`${mvp.winRate}% de Win Rate`);
      highlights.push(`${formatMoney(mvp.winRevenue)} conquistado`);
      if (mvp.avgWinCycle > 0) highlights.push(`Ciclo médio de ${mvp.avgWinCycle} dias`);
      highlights.push(`${mvp.wins} ${mvp.wins === 1 ? 'vitória' : 'vitórias'}`);
      if (mvp.losses > 0) highlights.push(`${mvp.losses} ${mvp.losses === 1 ? 'perda' : 'perdas'}`);
      
      const mvpReason = `🏆 Liderando o período: ${highlights.join(' • ')}${mvp.avgWinCycle > 0 && mvp.avgWinCycle < 60 ? ` • ⚡ Destaque em velocidade de fechamento` : ''}`;
      setTextSafe('exec-mvp-reason', mvpReason);
      log('[MVP] Vendedor destaque:', mvp);
    } else {
      setTextSafe('exec-mvp-initial', '-');
      setTextSafe('exec-mvp-name', 'Período sem deals');
      setTextSafe('exec-mvp-reason', 'Nenhuma atividade de vendas registrada no período filtrado');
    }
    
    // Ponto de Atenção (análise inteligente de performance)
    let attention = null;
    let attentionScore = 100;
    let attentionReasons = [];
    
    Object.values(sellerPerformance).forEach(seller => {
      const totalDeals = seller.wins + seller.losses;
      // LÓGICA MELHORADA: Considera vendedores com atividade (≥2 deals OU perdas significativas)
      if (totalDeals >= 2 || seller.lossRevenue > 500000) {
        const issues = [];
        let score = 100; // Começa perfeito, deduz pontos por problemas
        
        // Critério 1: Win Rate baixo (mais crítico)
        if (seller.winRate < 30 && totalDeals >= 3) {
          issues.push(`Win rate crítico (${seller.winRate}%)`);
          score -= 40;
        } else if (seller.winRate < 50 && totalDeals >= 5) {
          issues.push(`Win rate abaixo da média (${seller.winRate}%)`);
          score -= 25;
        }
        
        // Critério 2: Muitas perdas recentes
        if (seller.losses > seller.wins * 3 && seller.losses >= 3) {
          issues.push(`${seller.losses} perdas vs ${seller.wins} vitória${seller.wins !== 1 ? 's' : ''}`);
          score -= 30;
        } else if (seller.losses > seller.wins * 2 && seller.losses >= 2) {
          issues.push(`Mais perdas (${seller.losses}) que vitórias (${seller.wins})`);
          score -= 20;
        }
        
        // Critério 3: Valor perdido >> Valor ganho
        if (seller.lossRevenue > seller.winRevenue * 5 && seller.lossRevenue > 1000000) {
          issues.push(`Alto valor em perdas (${formatMoney(seller.lossRevenue)})`);
          score -= 25;
        } else if (seller.lossRevenue > seller.winRevenue * 2) {
          issues.push(`Valor perdido > valor ganho`);
          score -= 15;
        }
        
        // Critério 4: Ciclo muito longo (ineficiência)
        if (seller.avgWinCycle > 180) {
          issues.push(`Ciclo longo (${seller.avgWinCycle} dias)`);
          score -= 10;
        }
        
        // Se tem problemas E score é o pior até agora
        if (issues.length > 0 && score < attentionScore) {
          attentionScore = score;
          attention = seller;
          attentionReasons = issues;
        }
      }
    });
    
    if (attention && attentionScore < 70) {
      const initial = attention.name ? attention.name.charAt(0).toUpperCase() : '!';
      setTextSafe('exec-attention-initial', initial);
      setTextSafe('exec-attention-name', attention.name);
      
      const actionable = [];
      actionable.push(...attentionReasons);
      
      // Adiciona recomendações
      if (attention.winRate < 30) actionable.push('📊 Revisar qualificação de leads');
      if (attention.losses > attention.wins * 2) actionable.push('🎯 Focar em deals de maior probabilidade');
      if (attention.avgWinCycle > 150) actionable.push('⏱️ Acelerar follow-ups');
      
      const attentionReason = actionable.join(' • ');
      setTextSafe('exec-attention-reason', attentionReason);
      log('[ATTENTION] Vendedor requer atenção:', attention);
    } else {
      setTextSafe('exec-attention-initial', '✓');
      setTextSafe('exec-attention-name', 'Equipe performando bem');
      setTextSafe('exec-attention-reason', 'Nenhum ponto crítico identificado no período filtrado');
    }

    // SEÇÃO 5: TOP 5 OPORTUNIDADES (ABERTAS / GANHAS / PERDIDAS)
    log('[RENDER] === SEÇÃO 5: TOP 5 OPORTUNIDADES ===');
    const topOppsContainer = document.getElementById('exec-top-opps-container');
    const topOppsNote = document.getElementById('exec-top5-note');
    const topOppsConfidenceCard = document.getElementById('exec-top5-confidence-card');
    const topOppsWeightedCard = document.getElementById('exec-top5-weighted-card');
    const topOppsTabs = Array.from(document.querySelectorAll('.top-opps-tab'));

    const normalizeConfidencePercent = (value) => {
      if (value == null || value === '') return 0;
      const numeric = Number(value);
      if (Number.isNaN(numeric)) return 0;
      return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
    };

    const deriveQuarterLabel = (dateStr) => {
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

    const truncateText = (text, maxLen) => {
      if (!text) return '';
      const trimmed = String(text).trim();
      if (trimmed.length <= maxLen) return trimmed;
      return trimmed.slice(0, maxLen - 1) + '…';
    };

    const getTopOppsMetricMode = () => ((window.execDisplayMode || 'gross') === 'net' ? 'net' : 'gross');

    const getTopOppsMetricLabel = (mode) => mode === 'net' ? 'Net' : 'Gross';

    const getTopOppsMetricValue = (deal, mode) => {
      const grossValue = Number(deal.grossValue || deal.value || 0);
      const netValue = Number(deal.netValue || 0);
      if (mode === 'net') {
        if (netValue > 0) return netValue;
        return grossValue;
      }
      return grossValue;
    };

    const getTopOppsFiltersLabel = () => {
      const f = window.currentFilters || {};
      const parts = [];
      if (f.year) parts.push(`Ano ${f.year}`);
      if (f.quarter) parts.push(`Quarter ${f.quarter}`);
      if (f.month) parts.push(`Mês ${f.month}`);
      if (f.seller) parts.push(`Vendedor ${f.seller}`);
      if (f.segmento_consolidado) parts.push(`Segmento ${f.segmento_consolidado}`);
      if (f.portfolio) parts.push(`Portfólio ${f.portfolio}`);
      if (f.portfolio_fdm) parts.push(`Portfólio FDM ${f.portfolio_fdm}`);
      if (f.billing_state) parts.push(`UF ${f.billing_state}`);
      if (f.billing_city) parts.push(`Cidade ${f.billing_city}`);
      return parts.length ? parts.join(' · ') : 'Sem filtros adicionais';
    };

    const normalizeOpenDeal = (deal) => {
      const quarter = deal.fiscalQ || deal.quarter || deal.Fiscal_Q || deriveQuarterLabel(deal.closeDate || deal.Data_Prevista);
      const rawIdle = deal.daysIdle ?? deal.Idle_Dias;
      const rawActivities = deal.activities ?? deal.Atividades;
      const idleDays = (rawIdle === '' || rawIdle == null) ? null : Number(rawIdle);
      const activities = (rawActivities === '' || rawActivities == null) ? null : Number(rawActivities);
      const grossValue = Number(deal.val || deal.Gross || deal.gross || 0);
      const netValue = Number(deal.net || deal.Net || 0);
      return {
        name: deal.name || deal.Oportunidade || 'Deal sem nome',
        account: deal.account || deal.accountName || deal.Conta || 'Conta nao informada',
        owner: deal.seller || deal.owner || deal.Vendedor || 'N/A',
        value: grossValue,
        grossValue,
        netValue,
        confidence: normalizeConfidencePercent(deal.confidence ?? deal.Confianca),
        stage: deal.stage || deal.Fase_Atual || '',
        idleDays: Number.isNaN(idleDays) ? null : idleDays,
        activities: Number.isNaN(activities) ? null : activities,
        insight: deal.pipelineAnalysis || deal.insight || '',
        auditQuestions: deal.auditQuestions || '',
        suggestedAction: deal.acao_recomendada || deal.Acao_Sugerida || deal.Acao_Recomendada || deal.recomendacao_acao || deal.proxima_acao || '',
        segment: deal.Segmento_consolidado || deal.segment || '',
        state: deal.Estado_Provincia_de_cobranca || deal.state || '',
        city: deal.Cidade_de_cobranca || deal.city || '',
        portfolio: deal.Portfolio_FDM || deal.portfolio || '',
        quarter: quarter || 'Quarter N/A',
        // Campos para detail panel do drilldown
        closeDate: deal.closeDate || deal.closed || deal.Data_Prevista || '',
        cycle: (function() {
          var n = parseFloat(deal.Ciclo_dias || deal.ciclo_dias || deal.cycle || '');
          return isNaN(n) || n < 0 ? null : n;
        })(),
        meddic: (function() {
          var raw = deal.MEDDIC_Score || deal.meddic_score || deal.meddic;
          if (raw == null || raw === '') return null;
          var n = parseFloat(String(raw));
          if (isNaN(n) || n < 0) return null;
          // BQ retorna 0-100 (percentual); converter para escala 0-6 de blocos
          return n <= 6 ? n : Math.round(n / 100 * 6);
        })(),
        reason: deal.Justificativa_IA || deal.justificativa_ia || deal.Motivo_Confianca || deal.insight || ''
      };
    };

    const normalizeClosedDeal = (deal, kind) => {
      const quarter = deal.fiscalQ || deal.Fiscal_Q || deriveQuarterLabel(deal.Data_Fechamento || deal.closeDate);
      const rawCycle = deal.Ciclo_dias || deal.ciclo_dias || deal.Ciclo || deal.cycle;
      const rawActivities = deal.Atividades ?? deal.activities ?? deal.atividades;
      const rawMeddic = deal.MEDDIC ?? deal.meddic ?? deal.Meddic ?? deal.Score_Meddic;
      const rawAvoidable = deal.Evitavel ?? deal.evitavel ?? '';
      const cycle = (rawCycle === '' || rawCycle == null) ? null : Number(rawCycle);
      const activities = (rawActivities === '' || rawActivities == null) ? null : Number(rawActivities);
      const meddic = (rawMeddic === '' || rawMeddic == null) ? null : Number(rawMeddic);
      const avoidable = /^(sim|yes|true|1)$/i.test(String(rawAvoidable).trim());
      const grossValue = Number(deal.Gross || deal.val || deal.gross || 0);
      const netValue = Number(deal.Net || deal.net || 0);
      return {
        name: deal.Oportunidade || deal.Opportunity_Name || deal.opportunityName || deal.name || 'Deal sem nome',
        account: deal.Conta || deal.account || 'Conta nao informada',
        owner: deal.Vendedor || deal.owner || 'N/A',
        value: grossValue,
        grossValue,
        netValue,
        closeDate: deal.Data_Fechamento || deal.closeDate || '',
        cycle: Number.isNaN(cycle) ? null : cycle,
        activities: Number.isNaN(activities) ? null : activities,
        meddic: Number.isNaN(meddic) ? null : meddic,
        avoidable,
        resultType: deal.Tipo_Resultado || '',
        stage: deal.Fase_Atual || deal.stage || '',
        confidence: normalizeConfidencePercent(deal.Confianca ?? deal.confidence),
        suggestedAction: deal.acao_recomendada || deal.Acao_Sugerida || deal.Acao_Recomendada || deal.recomendacao_acao || deal.proxima_acao || '',
        segment: deal.Segmento_consolidado || deal.segment || '',
        state: deal.Estado_Provincia_de_cobranca || deal.state || '',
        city: deal.Cidade_de_cobranca || deal.city || '',
        portfolio: deal.Portfolio_FDM || deal.portfolio || '',
        reason: kind === 'won'
          ? (deal.Fatores_Sucesso || deal.Win_Reason || deal.winReason || '')
          : (deal.Causa_Raiz || deal.Loss_Reason || deal.lossReason || ''),
        quarter: quarter || 'Quarter N/A'
      };
    };

    const normalizeSalesSpecialistDeal = (deal) => {
      // Backend SELECT retorna snake_case: opportunity_name, account_name, vendedor,
      // fiscal_quarter, opportunity_status, forecast_status, booking_total_gross,
      // booking_total_net, gtm_2026, closed_date
      const gross = Number(deal.booking_total_gross || deal.Gross || deal.gross || 0);
      const net = Number(deal.booking_total_net || deal.Net || deal.net || 0);
      // opportunity_status = 'Aberta'/'Fechada' etc; forecast_status = COMMIT/UPSIDE/etc
      const status = String(deal.opportunity_status || deal.forecast_status || deal.Status || '').toUpperCase();
      const forecastStatus = String(deal.forecast_status || deal.opportunity_status || deal.Status || '').toUpperCase();
      const closeDate = deal.closed_date || deal.close_date || deal.closeDate || deal.Data_Fechamento || '';
      return {
        name: deal.opportunity_name || deal.Oportunidade || deal.oportunidade || deal.name || 'Deal sem nome',
        account: deal.account_name || deal.Conta || deal.conta || deal.account || 'Conta nao informada',
        owner: deal.vendedor || deal.Vendedor || deal.owner || 'N/A',
        value: Number.isNaN(gross) ? 0 : gross,
        grossValue: Number.isNaN(gross) ? 0 : gross,
        netValue: Number.isNaN(net) ? 0 : net,
        stage: forecastStatus || status || 'FORECAST_SPECIALIST',
        quarter: deal.fiscal_quarter || deal.Fiscal_Q || deal.fiscalQ || deriveQuarterLabel(closeDate) || 'Quarter N/A',
        closeDate,
        source: 'ss',
        forecastStatus,
        gtm2026: deal.gtm_2026 || '',
        suggestedAction: deal.acao_recomendada || deal.Acao_Sugerida || deal.Acao_Recomendada || deal.recomendacao_acao || deal.proxima_acao || ''
      };
    };

    const normalizeForecastCategory = (rawCategory) => {
      const text = String(rawCategory || '').toUpperCase();
      if (text.includes('COMMIT')) return 'COMMIT';
      if (text.includes('UPSIDE')) return 'UPSIDE';
      if (text.includes('POTENC')) return 'POTENCIAL';
      if (text.includes('OMIT')) return 'OMITIDO';
      if (text.includes('PIPE')) return 'PIPELINE';
      return 'PIPELINE';
    };

    const filterRowsByForecastPeriod = (rows) => {
      const sourceRows = Array.isArray(rows) ? rows : [];
      const selectedPeriod = String(window.currentForecastHealthPeriod || 'all').toLowerCase();
      if (!selectedPeriod || selectedPeriod === 'all' || selectedPeriod === 'total') return sourceRows;
      const fy = String(window.currentFY || 'FY26').toUpperCase();
      const targetQuarter = `${fy}-${selectedPeriod.toUpperCase()}`;
      return sourceRows.filter((row) => String(row.quarter || '').toUpperCase() === targetQuarter);
    };

    const bindForecastHealthBarDrilldown = () => {
      const openRowsBase = (Array.isArray(allDeals) ? allDeals : []).map((deal) => ({
        ...normalizeOpenDeal(deal),
        source: 'pipeline',
        forecastStatus: normalizeForecastCategory(deal.forecastCategory || deal.Forecast_IA || deal.Forecast_SF || '')
      }));
      const ssRowsBase = (Array.isArray(DATA?.salesSpecialist?.deals) ? DATA.salesSpecialist.deals : [])
        .map(normalizeSalesSpecialistDeal)
        .map((deal) => ({
          ...deal,
          source: 'ss',
          forecastStatus: normalizeForecastCategory(deal.forecastStatus || deal.stage || '')
        }));

      const openRows = filterRowsByForecastPeriod(openRowsBase);
      const ssRows = filterRowsByForecastPeriod(ssRowsBase);
      const selectedPeriod = String(window.currentForecastHealthPeriod || 'all').toLowerCase();
      const periodLabel = (selectedPeriod === 'all' || selectedPeriod === 'total')
        ? 'Todos os períodos'
        : `${window.currentFY || 'FY26'}-${selectedPeriod.toUpperCase()}`;
      const filtersLabel = getTopOppsFiltersLabel();

      const openCategoryBars = [
        { id: 'forecast-commit-bar', category: 'COMMIT' },
        { id: 'forecast-upside-bar', category: 'UPSIDE' },
        { id: 'forecast-pipeline-bar', category: 'PIPELINE' },
        { id: 'forecast-potencial-bar', category: 'POTENCIAL' },
        { id: 'forecast-omitido-bar', category: 'OMITIDO' }
      ];

      openCategoryBars.forEach((cfg) => {
        const barEl = document.getElementById(cfg.id);
        if (!barEl) return;
        barEl.style.cursor = 'pointer';
        barEl.title = `Clique para drill-down (${cfg.category})`;
        barEl.onclick = () => {
          if (typeof window.openExecutiveDrilldown !== 'function') return;
          const rows = openRows.filter((row) => normalizeForecastCategory(row.forecastStatus) === cfg.category);
          window.openExecutiveDrilldown({
            title: `Drill-down · Saúde Forecast IA · ${cfg.category}`,
            subtitle: `${periodLabel} · Categoria ${cfg.category}`,
            rows,
            selected: rows[0] || null,
            rule: `Pipeline aberto classificado na categoria ${cfg.category} (Forecast IA/SF)` ,
            baseLabel: `${rows.length} deals · ${formatMoney(rows.reduce((sum, row) => sum + (row.value || 0), 0))}`,
            filtersLabel,
            sql: 'SELECT * FROM pipeline WHERE forecast_categoria = <categoria> AND <filtros_herdados>'
          });
        };
      });

      const ssCategoryBars = [
        { id: 'forecast-ss-commit-bar', category: 'COMMIT' },
        { id: 'forecast-ss-upside-bar', category: 'UPSIDE' }
      ];

      ssCategoryBars.forEach((cfg) => {
        const barEl = document.getElementById(cfg.id);
        if (!barEl) return;
        barEl.style.cursor = 'pointer';
        barEl.title = `Clique para drill-down Sales Specialist (${cfg.category})`;
        barEl.onclick = () => {
          if (typeof window.openExecutiveDrilldown !== 'function') return;
          const rows = ssRows.filter((row) => normalizeForecastCategory(row.forecastStatus) === cfg.category);
          window.openExecutiveDrilldown({
            title: `Drill-down · Saúde Forecast Sales Specialist · ${cfg.category}`,
            subtitle: `${periodLabel} · Categoria ${cfg.category}`,
            rows,
            selected: rows[0] || null,
            rule: `Deals de Sales Specialist com forecast ${cfg.category}`,
            baseLabel: `${rows.length} deals · ${formatMoney(rows.reduce((sum, row) => sum + (row.value || 0), 0))}`,
            filtersLabel,
            sql: 'SELECT * FROM sales_specialist_deals WHERE forecast_status = <categoria> AND <filtros_herdados>'
          });
        };
      });
    };

    const buildInsight = (kind, deal) => {
      const suggestedFromBQ = truncateText(deal.suggestedAction || '', 220);
      if (kind === 'open') {
        const conf = deal.confidence || 0;
        const idle = deal.idleDays != null ? Number(deal.idleDays) : null;
        const activityCount = deal.activities != null ? Number(deal.activities) : null;
        const summaryParts = [];
        if (deal.stage) summaryParts.push(`Stage ${deal.stage}`);
        summaryParts.push(`Confianca ${conf}%`);
        if (idle != null && !Number.isNaN(idle) && idle > 0) summaryParts.push(`Idle ${idle}d`);
        if (activityCount != null && !Number.isNaN(activityCount) && activityCount > 0) summaryParts.push(`${activityCount} atividades`);
        const summary = summaryParts.join(' · ');

        let action = 'Revisar proximo passo e reforcar champion';
        if (conf >= 80) action = 'Acelerar fechamento e remover bloqueios finais';
        else if (conf >= 50) action = 'Garantir proposta clara e timeline de decisao';
        else if (conf < 30) action = 'Requalificar oportunidade e validar fit';
        if (idle != null && idle >= 30) action = 'Reativar contato e redefinir proximo passo';
        return { summary, action: suggestedFromBQ || action };
      }

      if (kind === 'won') {
        const summary = [deal.resultType, deal.reason].filter(Boolean).join(' · ') || 'Fechamento bem-sucedido';
        let action = 'Replicar padroes em deals similares e documentar aprendizados';
        if (deal.cycle && Number(deal.cycle) > 120) action = 'Reduzir ciclo em deals similares e acelerar etapas criticas';
        else if (deal.reason && /arp|ata/i.test(deal.reason)) action = 'Padronizar play de ARP e acelerar aprovacoes';
        else if (deal.reason && /base instalada|incumb/i.test(deal.reason)) action = 'Escalar upsell na base instalada com playbook claro';
        else if (deal.reason && /agilidade|timing|rapido|veloc/i.test(deal.reason)) action = 'Codificar playbook de velocidade e reduzir atrito';
        else if (deal.reason && /champion|sponsor|decisor/i.test(deal.reason)) action = 'Mapear champions cedo e formalizar patrocinios';
        else if (deal.reason && /preco|valor|orcamento|roi/i.test(deal.reason)) action = 'Reforcar ROI e business case nas propostas';
        return { summary, action: suggestedFromBQ || action };
      }

      const summary = [deal.resultType, deal.reason].filter(Boolean).join(' · ') || 'Perda com causa a investigar';
      let action = 'Aplicar gate de qualificacao e ajustar abordagem cedo';
      if (deal.reason && /abandono|engajamento/i.test(deal.reason)) action = 'Criar SLA de follow-up e playbook de reengajamento';
      else if (deal.reason && /qualificacao|bant|meddic/i.test(deal.reason)) action = 'Fortalecer criterios de qualificacao e corte rapido';
      else if (deal.reason && /concorr|compet/i.test(deal.reason)) action = 'Diferenciar proposta e usar battlecards cedo';
      else if (deal.reason && /preco|valor|orcamento|roi/i.test(deal.reason)) action = 'Trabalhar ROI cedo e alinhar expectativas financeiras';
      else if (deal.reason && /prazo|tempo|ciclo/i.test(deal.reason)) action = 'Definir timeline com decisores e reduzir ciclo';
      return { summary, action: suggestedFromBQ || action };
    };

    const detectTheme = (text, themes) => {
      const content = (text || '').toLowerCase();
      for (const theme of themes) {
        if (theme.match.some(pattern => content.includes(pattern))) return theme.label;
      }
      return 'Outros';
    };

    const summarizeThemes = (deals, selector, themes) => {
      const counts = {};
      deals.forEach(deal => {
        const value = selector(deal);
        if (!value) return;
        const label = detectTheme(value, themes);
        counts[label] = (counts[label] || 0) + 1;
      });
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return ranked.slice(0, 2).map(([label, count]) => `${label} (${count})`).join(' · ');
    };

    const setActiveTopOppsTab = (tab) => {
      topOppsTabs.forEach(button => {
        const isActive = button.dataset.topOppsTab === tab;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const getFilteredDealsByPeriod = (deals) => {
      const period = window.currentTopOppsPeriod || 'all';
      const fy = window.currentFY || 'FY26';
      const repF = window.currentRepFilter && window.currentRepFilter !== 'all'
        ? window.currentRepFilter.trim() : null;
      let filtered = deals;
      if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
        const targetQuarter = `${fy}-${period.toUpperCase()}`;
        filtered = filtered.filter(d => (d.fiscalQ || d.quarter) === targetQuarter);
      }
      // Cross-cut with client-side rep filter
      if (repF) {
        filtered = filtered.filter(d =>
          (d.Vendedor || d.seller || d.owner || '').trim() === repF);
      }
      return filtered;
    };

    const renderTopOppsTab = (tab) => {
      if (!topOppsContainer) return;
      topOppsContainer.innerHTML = '';
      const metricMode = getTopOppsMetricMode();
      const metricLabel = getTopOppsMetricLabel(metricMode);

      const period = window.currentTopOppsPeriod || 'all';
      const fy = window.currentFY || 'FY26';
      const isQuarterPeriod = period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4';
      const targetQuarter = isQuarterPeriod ? `${fy}-${period.toUpperCase()}` : '';
      const filterClosedByQuarter = (deals) => {
        if (!isQuarterPeriod) return deals;
        return deals.filter(deal => {
          const quarter = deal.Fiscal_Q || deriveQuarterLabel(deal.Data_Fechamento);
          return quarter === targetQuarter;
        });
      };

      let baseDeals = [];
      let normalized = [];
      let baseLabel = 'pipeline';

      const _topRepF = window.currentRepFilter && window.currentRepFilter !== 'all'
        ? window.currentRepFilter.trim() : null;
      const _topByRep = (arr) =>
        _topRepF ? arr.filter(d => (d.Vendedor || d.owner || d.seller || '').trim() === _topRepF) : arr;

      if (tab === 'open') {
        baseLabel = 'pipeline';
        baseDeals = getFilteredDealsByPeriod(allDeals || []); // rep filter inside
        normalized = baseDeals.map(normalizeOpenDeal);
      } else if (tab === 'won') {
        baseLabel = 'ganhos';
        baseDeals = _topByRep(filterClosedByQuarter(Array.isArray(DATA.wonAgg) ? DATA.wonAgg : []));
        normalized = baseDeals.map(deal => normalizeClosedDeal(deal, 'won'));
      } else {
        baseLabel = 'perdas';
        baseDeals = _topByRep(filterClosedByQuarter(Array.isArray(DATA.lostAgg) ? DATA.lostAgg : []));
        normalized = baseDeals.map(deal => normalizeClosedDeal(deal, 'lost'));
      }

      const top5Deals = normalized
        .sort((a, b) => getTopOppsMetricValue(b, metricMode) - getTopOppsMetricValue(a, metricMode))
        .slice(0, 5);

      const totalBase = normalized.reduce((sum, d) => sum + getTopOppsMetricValue(d, metricMode), 0);
      const top5Total = top5Deals.reduce((sum, d) => sum + getTopOppsMetricValue(d, metricMode), 0);
      const top5Percent = totalBase > 0 ? ((top5Total / totalBase) * 100).toFixed(1) : 0;
      const top5AvgConf = tab === 'open' && top5Deals.length > 0
        ? Math.round(top5Deals.reduce((sum, d) => sum + (d.confidence || 0), 0) / top5Deals.length)
        : null;
      const weightedTop5 = tab === 'open'
        ? top5Deals.reduce((sum, d) => sum + (getTopOppsMetricValue(d, metricMode) * ((d.confidence || 0) / 100)), 0)
        : 0;
      const weightedTop5Pct = totalBase > 0 ? ((weightedTop5 / totalBase) * 100).toFixed(1) : 0;
      const periodLabel = isQuarterPeriod ? `período ${targetQuarter}` : 'período selecionado';
      const baseContext = `base do ${periodLabel}`;

      if (topOppsConfidenceCard) {
        topOppsConfidenceCard.style.display = tab === 'open' ? 'block' : 'none';
      }
      if (topOppsWeightedCard) {
        topOppsWeightedCard.style.display = tab === 'open' ? 'block' : 'none';
      }

      setTextSafe('exec-top5-total', formatMoney(top5Total));
      setTextSafe('exec-top5-percent', `${top5Percent}% da ${baseLabel} · ${metricLabel} · ${baseContext}`);
      setTextSafe('exec-top5-confidence', top5AvgConf == null ? '-' : `${top5AvgConf}%`);
      setTextSafe('exec-top5-deals', `${top5Deals.length} deals`);
      if (tab === 'open') {
        setTextSafe('exec-top5-weighted', formatMoney(weightedTop5));
        setTextSafe('exec-top5-weighted-sub', `${weightedTop5Pct}% da base (${metricLabel})`);
      }

      window.execTopOppsContext = {
        tab,
        metricMode,
        metricLabel,
        baseLabel,
        periodLabel,
        baseContext,
        targetQuarter,
        normalized,
        top5Deals,
        totalBase,
        top5Total,
        weightedTop5,
        filtersLabel: getTopOppsFiltersLabel(),
        sql: tab === 'open'
          ? `SELECT Oportunidade, Conta, Vendedor, Gross, Net, Confianca, Fiscal_Q FROM pipeline WHERE <filtros_herdados> ORDER BY ${metricLabel} DESC LIMIT 5`
          : tab === 'won'
            ? `SELECT Oportunidade, Conta, Vendedor, Gross, Net, Fiscal_Q FROM closed_deals_won WHERE <filtros_herdados> ORDER BY ${metricLabel} DESC LIMIT 5`
            : `SELECT Oportunidade, Conta, Vendedor, Gross, Net, Fiscal_Q FROM closed_deals_lost WHERE <filtros_herdados> ORDER BY ${metricLabel} DESC LIMIT 5`
      };

      if (topOppsNote) {
        topOppsNote.style.display = 'block';
        topOppsNote.textContent = `Ordenação Top 5: ${metricLabel}. Filtros aplicados: ${getTopOppsFiltersLabel()}.`;
      }

      if (top5Deals.length === 0) {
        topOppsContainer.innerHTML = '<div style="color: var(--text-gray); padding: 20px; text-align: center;">Nenhuma oportunidade encontrada</div>';
        return;
      }

      top5Deals.forEach((deal, idx) => {
        const conf = deal.confidence || 0;
        const grossValue = Number(deal.grossValue || deal.value || 0);
        const netValue = Number(deal.netValue || 0);
        const rankingValue = getTopOppsMetricValue(deal, metricMode);
        let confBadge = 'badge-warning';
        if (conf >= 90) confBadge = 'badge-success';
        else if (conf > 0 && conf < 50) confBadge = 'badge-danger';

        const insight = buildInsight(tab, deal);
        const auditQuestions = deal.auditQuestions || '';
        const questionsArray = auditQuestions.split('|').map(q => q.trim()).filter(q => q.length > 0);

        const card = document.createElement('div');
        card.className = 'deal-card';
        card.style.marginBottom = '10px';
        card.style.cursor = 'pointer';

        card.innerHTML = `
          <div style="font-size: 10px; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">#${idx + 1} · ${deal.quarter || 'Quarter N/A'}</div>
          <div class="deal-header">
            <div>
              <div class="deal-name">${deal.name}</div>
              <div style="font-size: 12px; color: var(--text-gray); margin-top: 4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                Conta: <strong style="color: var(--text-white);">${deal.account}</strong>
              </div>
            </div>
            <div class="deal-value">${formatMoney(rankingValue)}</div>
          </div>
          <div class="deal-meta" style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span><strong>Responsavel:</strong> ${deal.owner}</span>
              ${tab === 'open'
                ? `<span class="badge ${confBadge}">${conf}% confianca</span>`
                : tab === 'won'
                  ? '<span class="badge badge-success">Ganho</span>'
                  : '<span class="badge badge-danger">Perdido</span>'}
            </div>
            <div class="exec-top5-detail-grid">
              <div><strong>Gross:</strong> ${formatMoney(grossValue)}</div>
              <div><strong>Net:</strong> ${netValue > 0 ? formatMoney(netValue) : '-'}</div>
              ${deal.stage ? `<div><strong>Fase:</strong> ${deal.stage}</div>` : ''}
              ${deal.closeDate ? `<div><strong>Fechamento:</strong> ${deal.closeDate}</div>` : ''}
              ${deal.cycle ? `<div><strong>Ciclo:</strong> ${deal.cycle} dias</div>` : ''}
              ${deal.activities ? `<div><strong>Atividades:</strong> ${deal.activities}</div>` : ''}
              ${deal.segment ? `<div><strong>Segmento:</strong> ${deal.segment}</div>` : ''}
              ${deal.state ? `<div><strong>UF:</strong> ${deal.state}</div>` : ''}
              ${deal.portfolio ? `<div><strong>Portfólio:</strong> ${deal.portfolio}</div>` : ''}
              ${deal.meddic != null ? `<div><strong>MEDDIC:</strong> ${deal.meddic}</div>` : ''}
            </div>
            ${deal.resultType ? `<div style="margin-top: 8px; font-size: 12px; color: var(--text-gray);"><strong>Resultado:</strong> ${deal.resultType}</div>` : ''}
            ${deal.reason ? `<div style="margin-top: 6px; font-size: 12px; color: var(--text-gray);"><strong>Motivo:</strong> ${deal.reason}</div>` : ''}
            ${questionsArray.length > 0 ? `
              <details style="margin-top: 12px; padding: 12px; background: rgba(225,72,73,0.1); border-left: 3px solid var(--danger); border-radius: 4px;">
                <summary style="cursor: pointer; font-weight: 600; color: var(--danger); font-size: 13px; user-select: none;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Perguntas de Auditoria IA
                </summary>
                <ul style="margin: 12px 0 0 0; padding-left: 20px; font-size: 12px; line-height: 1.7; color: var(--text-gray);">
                  ${questionsArray.map(q => `<li style="margin-bottom: 8px;">${q}</li>`).join('')}
                </ul>
              </details>
            ` : ''}
            ${deal.insight ? `
              <details style="margin-top: 12px; padding: 10px; background: rgba(0,190,255,0.05); border-left: 3px solid var(--primary-cyan); border-radius: 4px;">
                <summary style="cursor: pointer; font-weight: 600; color: var(--primary-cyan); font-size: 12px; user-select: none;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  Insights da Analise de Pipeline
                </summary>
                <div style="margin-top: 10px; font-size: 12px; line-height: 1.6; color: var(--text-gray);">
                  ${deal.insight}
                </div>
              </details>
            ` : ''}
            <div class="exec-top5-summary-box"><strong>Resumo:</strong> ${insight.summary}</div>
            <div class="exec-top5-action-box"><strong>Recomendação:</strong> ${insight.action}</div>
          </div>
        `;
        card.onclick = () => window.openExecutiveDrilldown({
          title: `Drill-down · Top 5 ${tab === 'open' ? 'Abertas' : tab === 'won' ? 'Ganhas' : 'Perdidas'}`,
          subtitle: `${periodLabel} · ${baseContext} · ${metricLabel}`,
          rows: top5Deals,
          selected: deal,
          rule: `Top 5 por ${metricLabel}`,
          baseLabel: `${top5Deals.length} deals · ${formatMoney(top5Total)}`,
          filtersLabel: getTopOppsFiltersLabel(),
          sql: window.execTopOppsContext?.sql || 'Regra SQL indisponível'
        });
        topOppsContainer.appendChild(card);
      });

      const bindTopOppKpiClick = (el) => {
        if (!el || el.dataset.execDdBound === '1') return;
        el.dataset.execDdBound = '1';
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const ctx = window.execTopOppsContext || {};
          window.openExecutiveDrilldown({
            title: `Drill-down · Top 5 ${ctx.tab === 'open' ? 'Abertas' : ctx.tab === 'won' ? 'Ganhas' : 'Perdidas'}`,
            subtitle: `${ctx.periodLabel || 'período selecionado'} · ${ctx.baseContext || 'base aplicada'} · ${ctx.metricLabel || 'Gross'}`,
            rows: ctx.top5Deals || [],
            selected: (ctx.top5Deals && ctx.top5Deals[0]) || null,
            rule: `Top 5 por ${ctx.metricLabel || 'Gross'}`,
            baseLabel: `${(ctx.top5Deals || []).length} deals · ${formatMoney(ctx.top5Total || 0)}`,
            filtersLabel: ctx.filtersLabel || getTopOppsFiltersLabel(),
            sql: ctx.sql || 'Regra SQL indisponível'
          });
        });
      };
      bindTopOppKpiClick(document.getElementById('exec-top5-total-card'));
      bindTopOppKpiClick(document.getElementById('exec-top5-confidence-card'));
      bindTopOppKpiClick(document.getElementById('exec-top5-weighted-card'));
    };

    const buildDrilldownRowsFromMetric = (metricId) => {
      // ── Global filter cross-reference ──────────────────────────────────────
      // Respect window.currentRepFilter (client-side single-rep dropdown) AND
      // the multi-select selectedSellers filter (already baked into API data).
      const repF = window.currentRepFilter && window.currentRepFilter !== 'all'
        ? window.currentRepFilter.trim()
        : null;
      const byRepF = (rows) => {
        if (!repF) return rows;
        return rows.filter(r => {
          const o = (r.owner || r.seller || r.Vendedor || '').trim();
          return o === repF;
        });
      };
      // ── Active filter label (for subtitle) ─────────────────────────────────
      const filterHint = repF
        ? ` · Vendedor: ${repF}`
        : (Array.isArray(selectedSellers) && selectedSellers.length > 0
            ? ` · ${selectedSellers.length} vendedor${selectedSellers.length > 1 ? 'es' : ''}`
            : '');

      const openRows = byRepF((allDeals || []).map(normalizeOpenDeal).map(d => ({ ...d, source: 'pipeline' })));
      const wonRows  = byRepF((Array.isArray(DATA.wonAgg)  ? DATA.wonAgg  : []).map(d => ({ ...normalizeClosedDeal(d, 'won'),  source: 'won'  })));
      const lostRows = byRepF((Array.isArray(DATA.lostAgg) ? DATA.lostAgg : []).map(d => ({ ...normalizeClosedDeal(d, 'lost'), source: 'lost' })));
      const ssRows   = byRepF((Array.isArray(DATA?.salesSpecialist?.deals) ? DATA.salesSpecialist.deals : []).map(normalizeSalesSpecialistDeal));

      const exactMetricRules = {
        'exec-above50-value':     { rows: openRows.filter(r => (r.confidence || 0) >= 50),       title: 'Deals ≥50% Confiança IA',       rule: 'Pipeline com confiança IA >= 50%' },
        'exec-idle-days-avg':     { rows: openRows.filter(r => r.idleDays != null && Number(r.idleDays) > 0), title: 'Dias Idle Médio', rule: 'Pipeline com idle > 0 dias' },
        'exec-won-cycle-days':    { rows: wonRows.filter(r => r.cycle != null),                   title: 'Ciclo Médio (Ganhos)',           rule: 'Deals ganhos com ciclo preenchido' },
        'exec-won-activities':    { rows: wonRows.filter(r => r.activities != null),              title: 'Atividades Médias (Ganhos)',     rule: 'Deals ganhos com atividades preenchidas' },
        'exec-won-meddic':        { rows: wonRows.filter(r => r.meddic != null),                  title: 'MEDDIC Médio',                  rule: 'Deals ganhos com score MEDDIC preenchido' },
        'exec-lost-cycle-days':   { rows: lostRows.filter(r => r.cycle != null),                  title: 'Ciclo Médio (Perdas)',           rule: 'Deals perdidos com ciclo preenchido' },
        'exec-lost-evitavel-pct': { rows: lostRows.filter(r => r.avoidable),                      title: 'Perdas Evitáveis',              rule: 'Somente perdas marcadas como evitáveis' },
        'exec-cycle-efficiency':  { rows: [...wonRows.filter(r => r.cycle != null), ...lostRows.filter(r => r.cycle != null)], title: 'Eficiência de Ciclo', rule: 'Ganhos e perdas com ciclo preenchido' },
        'exec-conversion-rate':   { rows: [...wonRows, ...lostRows],                              title: 'Taxa de Win',                   rule: 'Base de ganhos + perdas (conversão)' },
        'exec-loss-rate':         { rows: [...wonRows, ...lostRows],                              title: 'Taxa de Perda',                 rule: 'Base de ganhos + perdas (perda)' },
        'exec-ss-total':          { rows: ssRows, title: 'Sales Specialist · Total Curado',      rule: 'Deals de curadoria manual (Sales Specialist)' },
        'exec-ss-coverage':       { rows: ssRows, title: 'Sales Specialist · Taxa de Curadoria', rule: 'Deals de curadoria manual (Sales Specialist)' },
        'exec-ss-ticket':         { rows: ssRows, title: 'Sales Specialist · Ticket Médio',      rule: 'Deals de curadoria manual (Sales Specialist)' },
        'exec-ss-top-seller':     { rows: ssRows, title: 'Sales Specialist · Top Vendedor',      rule: 'Deals de curadoria manual (Sales Specialist)' }
      };

      if (metricId && exactMetricRules[metricId]) {
        const r = exactMetricRules[metricId];
        return { ...r, filterHint };
      }

      if (!metricId) return { rows: [...openRows, ...wonRows, ...lostRows], title: 'Drill-down Executivo', rule: 'Base consolidada de oportunidades', filterHint };
      if (metricId.startsWith('exec-pipeline') || metricId.startsWith('exec-forecast') || metricId.startsWith('exec-above50') || metricId.startsWith('exec-idle')) {
        return { rows: openRows, title: 'Pipeline Aberto', rule: 'Base de pipeline aberto com filtros herdados', filterHint };
      }
      if (metricId.startsWith('exec-ss')) {
        return { rows: ssRows, title: 'Sales Specialist', rule: 'Base de curadoria manual (Sales Specialist)', filterHint };
      }
      if (metricId.startsWith('exec-closed') || metricId.startsWith('exec-conversion') || metricId.startsWith('exec-won')) {
        return { rows: wonRows, title: 'Deals Ganhos', rule: 'Base de ganhos com filtros herdados', filterHint };
      }
      if (metricId.startsWith('exec-lost') || metricId.startsWith('exec-loss') || metricId.startsWith('exec-cycle-efficiency')) {
        return { rows: lostRows, title: 'Deals Perdidos', rule: 'Base de perdas com filtros herdados', filterHint };
      }
      if (metricId.startsWith('exec-sellers') || metricId.startsWith('exec-ticket') || metricId.startsWith('exec-cycle-')) {
        return { rows: [...wonRows, ...lostRows], title: 'Performance de Vendedores', rule: 'Base de ganhos + perdas para performance', filterHint };
      }
      return { rows: [...openRows, ...wonRows, ...lostRows], title: 'Drill-down Executivo', rule: 'Base consolidada de oportunidades', filterHint };
    };

    const bindExecutiveKpiDrilldown = () => {
      const summaryRoot = document.querySelector('.exec-tab-content[data-content="resumo"]');
      if (!summaryRoot) return;
      summaryRoot.querySelectorAll('.kpi-card').forEach(card => {
        if (card.dataset.execDdBound === '1') return;
        const metricNode = card.querySelector('[id^="exec-"]');
        if (!metricNode) return;
        card.dataset.execDdBound = '1';
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          const metricId = metricNode.id;
          const cfg = buildDrilldownRowsFromMetric(metricId);
          const subtitle = `Resumo → Lista → Detalhe${cfg.filterHint || ''}`;
          window.openExecutiveDrilldown({
            title: `Drill-down · ${cfg.title}`,
            subtitle,
            rows: cfg.rows,
            selected: cfg.rows[0] || null,
            rule: cfg.rule,
            baseLabel: `${cfg.rows.length} deals · ${formatMoney(cfg.rows.reduce((sum, r) => sum + (r.value || 0), 0))}`,
            sql: metricId.includes('lost')
              ? 'SELECT * FROM closed_deals_lost WHERE <filtros_herdados>'
              : metricId.includes('closed') || metricId.includes('won')
                ? 'SELECT * FROM closed_deals_won WHERE <filtros_herdados>'
                : 'SELECT * FROM pipeline WHERE <filtros_herdados>'
          });
        });
      });
    };

    window.switchTopOppsTab = function(tab) {
      window.topOppsState = window.topOppsState || { tab: 'open' };
      window.topOppsState.tab = tab;
      setActiveTopOppsTab(tab);
      renderTopOppsTab(tab);
    };

    window.updateTop5Opps = function(period) {
      log('[TOP 5] ========== ATUALIZANDO TOP 5 PARA PERIODO:', period, '==========');
      window.currentTopOppsPeriod = period;
      const activeTab = (window.topOppsState && window.topOppsState.tab) ? window.topOppsState.tab : 'open';
      setActiveTopOppsTab(activeTab);
      renderTopOppsTab(activeTab);
      log('[TOP 5] ========== TOP 5 ATUALIZADO COM SUCESSO ==========');
    };

    window.allDealsWithQuarter = allDeals;
    window.currentTopOppsPeriod = window.currentTopOppsPeriod || 'all';

    const initialTab = (window.topOppsState && window.topOppsState.tab) ? window.topOppsState.tab : 'open';
    setActiveTopOppsTab(initialTab);
    renderTopOppsTab(initialTab);
    bindExecutiveKpiDrilldown();
    bindForecastHealthBarDrilldown();
    
    // Armazena todos os deals com quarter para uso global
    window.allDealsWithQuarter = allDeals;

    // Helper function global para criar word cloud
    window.createWordCloud = function(dataArray, containerId, colorScheme = 'default', clickContext = null) {
      const container = document.getElementById(containerId);
      if (!container || dataArray.length === 0) {
        if (container) {
          container.innerHTML = '<p style="color: var(--text-gray); text-align: center;">Nenhum dado disponível</p>';
        }
        return;
      }

      // Store drill context on container for _wcloudClick
      if (clickContext) {
        container._drillContext = clickContext;
      }
      
      const maxCount = dataArray[0][1];
      const getColor = (count, scheme) => {
        if (scheme === 'success') {
          return count >= maxCount * 0.7 ? 'var(--success)' : 
                 count >= maxCount * 0.4 ? '#10b981' : 
                 'rgba(16,185,129,0.6)';
        } else if (scheme === 'danger') {
          return count >= maxCount * 0.7 ? 'var(--danger)' : 
                 count >= maxCount * 0.4 ? '#f87171' : 
                 'rgba(239,68,68,0.6)';
        } else if (scheme === 'info') {
          return count >= maxCount * 0.7 ? 'var(--primary-cyan)' : 
                 count >= maxCount * 0.4 ? '#00BEFF' : 
                 'rgba(0,190,255,0.6)';
        } else {
          return count >= maxCount * 0.7 ? 'var(--danger)' : 
                 count >= maxCount * 0.4 ? 'var(--warning)' : 
                 'var(--text-gray)';
        }
      };
      
      container.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;">
          ${dataArray.map(([label, count]) => {
            const size = 10 + (count / maxCount) * 10;
            const opacity = 0.5 + (count / maxCount) * 0.5;
            const color = getColor(count, colorScheme);
            const clickable = clickContext ? 'wcloud-item-clickable' : '';
            const clickAttr = clickContext ? `data-wlabel="${label.replace(/"/g, '&quot;')}" onclick="window._wcloudClick(this)"` : '';
            const cursor = clickContext ? 'pointer' : 'help';
            return `
              <span class="${clickable}" ${clickAttr} style="
                font-size: ${size}px;
                color: ${color};
                opacity: ${opacity};
                font-weight: 600;
                padding: 4px 8px;
                background: rgba(255,255,255,0.05);
                border-radius: 4px;
                white-space: nowrap;
                transition: all 0.3s;
                cursor: ${cursor};
              " title="${clickContext ? 'Clique para ver deals' : count + ' ocorrência' + (count > 1 ? 's' : '')}">
                ${label} <span style="font-size: 9px; opacity: 0.7;">(${count})</span>
              </span>
            `;
          }).join('')}
        </div>
      `;
    };

    // SEÇÃO 6: MAPA DE FLAGS DE RISCO
    log('[RENDER] === SEÇÃO 6: MAPA DE FLAGS DE RISCO ===');
    const riskFlagsContainer = document.getElementById('exec-risk-flags-container');
    if (riskFlagsContainer && DATA.wordClouds && DATA.wordClouds.riskFlags) {
      const flagsArray = DATA.wordClouds.riskFlags.slice(0, 20); // Top 20 flags
      
      log('[DATA] Flags de risco:', flagsArray.length, 'tipos');
      
      if (flagsArray.length > 0) {
        riskFlagsContainer._drillContext = {
          src: 'pipe',
          field: 'Forecast_IA',
          data: window.pipelineDataRaw || [],
          title: 'Pipeline — Risco'
        };
        const maxCount = flagsArray[0].value;
        riskFlagsContainer.innerHTML = `
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;">
            ${flagsArray.map(item => {
              const size = 10 + (item.value / maxCount) * 10;
              const opacity = 0.5 + (item.value / maxCount) * 0.5;
              const color = item.value >= maxCount * 0.7 ? 'var(--danger)' : 
                           item.value >= maxCount * 0.4 ? 'var(--warning)' : 
                           'var(--text-gray)';
              return `
                <span class="wcloud-item-clickable" data-wlabel="${item.text.replace(/"/g, '&quot;')}" onclick="window._wcloudClick(this)" style="
                  font-size: ${size}px;
                  color: ${color};
                  opacity: ${opacity};
                  font-weight: 600;
                  padding: 4px 8px;
                  background: rgba(255,255,255,0.05);
                  border-radius: 4px;
                  white-space: nowrap;
                  transition: all 0.3s;
                  cursor: pointer;
                " title="Clique para ver deals">
                  ${item.text} <span style="font-size: 10px; color: var(--text-gray);">(${item.value})</span>
                </span>
              `;
            }).join('')}
          </div>
        `;
      } else {
        riskFlagsContainer.innerHTML = '<p style="color: var(--text-gray); text-align: center;">Nenhuma flag de risco identificada no pipeline</p>';
      }
    } else if (riskFlagsContainer) {
      riskFlagsContainer.innerHTML = '<p style="color: var(--text-gray); text-align: center;">Nenhuma flag de risco identificada no pipeline</p>';
    }
    
    // SEÇÃO 7: LABELS DE AÇÃO DO PIPELINE
    log('[RENDER] === SEÇÃO 7: LABELS DE AÇÃO DO PIPELINE ===');
    const actionLabelsContainer = document.getElementById('exec-action-labels-container');
    if (actionLabelsContainer && DATA.wordClouds && DATA.wordClouds.actionLabels) {
      const actionLabelsArray = DATA.wordClouds.actionLabels.slice(0, 20);
      log('[DATA] Labels de ação:', actionLabelsArray.length, 'tipos');
      
      if (actionLabelsArray.length > 0) {
        window.createWordCloud(actionLabelsArray.map(item => [item.text, item.value]), 'exec-action-labels-container', 'info', { src: 'pipe', field: 'Forecast_IA', data: window.pipelineDataRaw || [], title: 'Pipeline' });
      } else {
        actionLabelsContainer.innerHTML = '<p style="color: var(--text-gray); text-align: center;">Nenhum dado disponível</p>';
      }
    } else if (actionLabelsContainer) {
      actionLabelsContainer.innerHTML = '<p style="color: var(--text-gray); text-align: center;">Nenhum dado disponível</p>';
    }
    
    // SEÇÃO 8 & 9: PERFIL DE VITÓRIAS E PERDAS (Tipo Resultado)
    log('[RENDER] === SEÇÃO 8 & 9: PERFIL DE VITÓRIAS E PERDAS ===');
    if (DATA.wordClouds) {
      const allWinTypes = {};
      const allLossTypes = {};
      
      // Conta frequências de Tipo Resultado
      (DATA.wordClouds.winTypes || []).forEach(item => {
        if (item && item.text && item.text.trim()) {
          const type = item.text.trim();
          allWinTypes[type] = (allWinTypes[type] || 0) + (item.value || 1);
        }
      });
      
      (DATA.wordClouds.lossTypes || []).forEach(item => {
        if (item && item.text && item.text.trim()) {
          const type = item.text.trim();
          allLossTypes[type] = (allLossTypes[type] || 0) + (item.value || 1);
        }
      });
      
      const winTypesArray = Object.entries(allWinTypes).sort((a, b) => b[1] - a[1]).slice(0, 15);
      const lossTypesArray = Object.entries(allLossTypes).sort((a, b) => b[1] - a[1]).slice(0, 15);
      
      log('[DATA] Perfil vitórias:', winTypesArray.length, 'tipos');
      log('[DATA] Perfil perdas:', lossTypesArray.length, 'tipos');
      
      window.createWordCloud(winTypesArray, 'exec-win-types-container', 'success', { src: 'won', field: 'Tipo_Resultado', data: window.wonAgg || [], title: 'Vitórias' });
      window.createWordCloud(lossTypesArray, 'exec-loss-types-container', 'danger', { src: 'lost', field: 'Tipo_Resultado', data: window.lostAgg || [], title: 'Perdas' });
    }
    
    // SEÇÃO 10 & 11: PADRÕES DE SUCESSO E PERDA (Labels)
    log('[RENDER] === SEÇÃO 10 & 11: PADRÕES DE SUCESSO E PERDA ===');
    if (DATA.wordClouds) {
      const allWinLabels = {};
      const allLossLabels = {};
      
      // Conta frequências
      (DATA.wordClouds.winLabels || []).forEach(item => {
        if (item && item.text && item.text.trim()) {
          const label = item.text.trim();
          allWinLabels[label] = (allWinLabels[label] || 0) + (item.value || 1);
        }
      });
      
      (DATA.wordClouds.lossLabels || []).forEach(item => {
        if (item && item.text && item.text.trim()) {
          const label = item.text.trim();
          allLossLabels[label] = (allLossLabels[label] || 0) + (item.value || 1);
        }
      });
      
      const winLabelsArray = Object.entries(allWinLabels).sort((a, b) => b[1] - a[1]).slice(0, 20);
      const lossLabelsArray = Object.entries(allLossLabels).sort((a, b) => b[1] - a[1]).slice(0, 20);
      
      log('[DATA] Padrões sucesso:', winLabelsArray.length, 'labels');
      log('[DATA] Padrões perda:', lossLabelsArray.length, 'labels');
      
      window.createWordCloud(winLabelsArray, 'exec-win-labels-container', 'success', { src: 'won', field: 'Fatores_Sucesso', data: window.wonAgg || [], title: 'Padrões de Sucesso' });
      window.createWordCloud(lossLabelsArray, 'exec-loss-labels-container', 'danger', { src: 'lost', field: 'Causa_Raiz', data: window.lostAgg || [], title: 'Padrões de Perda' });
    }

    // AI Insights
    log('[RENDER] === AI INSIGHTS ===');
    const aiInsightsContainer = document.getElementById('ai-insights-container');
    if (aiInsightsContainer && DATA.aiInsights) {
      const ai = DATA.aiInsights;
      
      // Função para quebrar insights em bullets
      const parseToBullets = (text) => {
        if (!text) return [];
        // Quebrar por frases usando pontos, limitando tamanho
        const sentences = text
          .split(/\.\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 20);
        return sentences.map(s => s.endsWith('.') ? s : s + '.');
      };
      
      const winBullets = parseToBullets(ai.win_insights);
      const lossBullets = parseToBullets(ai.loss_insights);
      
      aiInsightsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--success); padding: 20px; border-radius: 8px;">
            <h4 style="margin: 0 0 15px 0; color: var(--success); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <svg class="icon"><use href="#icon-trophy"/></svg> Padrões de Vitória
            </h4>
            ${winBullets.length > 0 ? `
              <ul style="margin: 0; padding-left: 20px; color: var(--text-gray); font-size: 13px; line-height: 1.9; list-style: disc;">
                ${winBullets.map(bullet => `<li style="margin-bottom: 8px;">${bullet}</li>`).join('')}
              </ul>
            ` : `<p style="margin: 0; color: var(--text-gray); font-size: 13px;">Nenhum insight disponível</p>`}
          </div>
          
          <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 20px; border-radius: 8px;">
            <h4 style="margin: 0 0 15px 0; color: var(--danger); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              ⚠ Padrões de Perda
            </h4>
            ${lossBullets.length > 0 ? `
              <ul style="margin: 0; padding-left: 20px; color: var(--text-gray); font-size: 13px; line-height: 1.9; list-style: disc;">
                ${lossBullets.map(bullet => `<li style="margin-bottom: 8px;">${bullet}</li>`).join('')}
              </ul>
            ` : `<p style="margin: 0; color: var(--text-gray); font-size: 13px;">Nenhum insight disponível</p>`}
          </div>
          
          ${ai.recommendations && ai.recommendations.length > 0 ? `
            <div style="background: rgba(0, 190, 255, 0.1); border-left: 4px solid var(--primary-cyan); padding: 20px; border-radius: 8px;">
              <h4 style="margin: 0 0 15px 0; color: var(--primary-cyan); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <svg class="icon"><use href="#icon-idea"/></svg> Recomendações
              </h4>
              <ul style="margin: 0; padding-left: 20px; color: var(--text-gray); font-size: 13px; line-height: 1.9; list-style: decimal;">
                ${ai.recommendations.map(rec => `<li style="margin-bottom: 10px;"><strong>${rec}</strong></li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${ai.status === 'gemini' ? `
            <div style="text-align: center; padding: 12px; background: rgba(0, 190, 255, 0.05); border-radius: 6px; border: 1px solid rgba(0, 190, 255, 0.2);">
              <p style="margin: 0; color: var(--primary-cyan); font-size: 11px; font-weight: 500;">
                <svg class="icon"><use href="#icon-sparkles"/></svg> Análise gerada por Gemini 2.5 Flash
                ${ai.deals_analyzed ? ` • ${ai.deals_analyzed.won} vitórias + ${ai.deals_analyzed.lost} perdas analisadas` : ''}
              </p>
            </div>
          ` : ai.status === 'placeholder' ? `
            <p style="text-align: center; color: var(--text-gray); font-size: 11px; margin: 10px 0 0 0; opacity: 0.7;">
              ⚙️ Análise básica ativa. Integração com Gemini em desenvolvimento.
            </p>
          ` : ''}
        </div>
      `;
    }

    // 1. L10 (mantém o código existente com validações)
    log('[RENDER] === SEÇÃO L10 ===');
    // Reutiliza l10 já declarado anteriormente
    log('[DATA] L10 dados:', {
      'netRevenue': formatMoney(safe(l10, 'netRevenue')),
      'bookingsGross': formatMoney(safe(l10, 'bookingsGross')),
      'bookingsCount': safe(l10, 'bookingsCount', 0),
      'pipelineNextWeek': formatMoney(safe(l10, 'pipelineNextWeek')),
      'pipelineQuarter': formatMoney(safe(l10, 'pipelineQuarter')),
      'agingPipeline': safe(l10, 'agingPipeline', 0),
      'predictableRevenue': formatMoney(safe(l10, 'predictableRevenue'))
    });
    setTextSafe('kpi-net', formatMoney(safe(l10, 'netRevenue')));
    setTextSafe('kpi-bookings-gross', formatMoney(safe(l10, 'bookingsGross')));
    setTextSafe('kpi-bookings-count', safe(l10, 'bookingsCount', 0) + ' deals');
    setTextSafe('kpi-next-week', formatMoney(safe(l10, 'pipelineNextWeek')));
    setTextSafe('kpi-quarter', formatMoney(safe(l10, 'pipelineQuarter')));
    setTextSafe('kpi-aging', safe(l10, 'agingPipeline', 0));
    setTextSafe('kpi-predictable', formatMoney(safe(l10, 'predictableRevenue')));


    // Margem por categoria
    log('[RENDER] Processando margens por categoria...');
    const marginContainer = document.getElementById('margin-container');
    if (marginContainer) {
      marginContainer.innerHTML = '';
    const margins = safe(l10, 'marginByCategory', []);
    log('[DATA] Margens:', margins.length, 'categorias');
    if (margins.length > 0) {
      margins.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'margin-card';
        card.innerHTML = `
          <div class="margin-card-title">${cat.category || 'N/A'}</div>
          <div class="margin-card-value">${cat.margin || 0}%</div>
          <div class="margin-card-sub">${cat.count || 0} deals • ${formatMoney(cat.revenue || 0)}</div>
        `;
        marginContainer.appendChild(card);
      });
    } else {
      marginContainer.innerHTML = '<div style="color: var(--text-gray); padding: 20px; text-align: center;">Sem dados de margem disponíveis</div>';
    }
    } // fim do if marginContainer

    // 2. FSR Performance Table - Separa ativos e inativos
    log('[RENDER] === SEÇÃO FSR PERFORMANCE ===');
    const scorecardTable = DATA.fsrScorecard || [];
    const activeRepsTable = scorecardTable.filter(r => r.isActive);
    const inactiveReps = scorecardTable.filter(r => !r.isActive);
    log('[DATA] FSR Scorecard:', activeRepsTable.length, 'ativos,', inactiveReps.length, 'inativos');

    // Resumo da aba Score (visão executiva)
    const onTrack = activeRepsTable.filter(r => (r.ipv || 0) >= 80).length;
    const atRisk = activeRepsTable.filter(r => (r.ipv || 0) >= 50 && (r.ipv || 0) < 80).length;
    const offTrack = activeRepsTable.filter(r => (r.ipv || 0) < 50).length;
    const avgScore = activeRepsTable.length > 0
      ? Math.round(activeRepsTable.reduce((sum, r) => sum + (r.ipv || 0), 0) / activeRepsTable.length)
      : 0;

    setTextSafe('exec-score-ontrack', onTrack);
    setTextSafe('exec-score-atrisk', atRisk);
    setTextSafe('exec-score-offtrack', offTrack);
    setTextSafe('exec-score-avg', avgScore + '%');

    const execScoreTableBody = document.getElementById('exec-score-table-body');
    if (execScoreTableBody) {
      execScoreTableBody.innerHTML = '';
      if (activeRepsTable.length > 0) {
        activeRepsTable.forEach((fsr) => {
          const ipv = Number(fsr.ipv || 0);
          const status = ipv >= 80 ? 'On Track' : ipv >= 50 ? 'At Risk' : 'Off Track';
          const statusColor = ipv >= 80 ? 'var(--success)' : ipv >= 50 ? 'var(--warning)' : 'var(--danger)';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:600;color:#fff;">${fsr.name || 'N/A'}</td>
            <td>${ipv}%</td>
            <td>${fsr.winRate || 0}%</td>
            <td>${formatMoney(fsr.totalGrossGenerated || 0)}</td>
            <td><span style="color:${statusColor};font-weight:700;">${status}</span></td>
          `;
          execScoreTableBody.appendChild(tr);
        });
      } else {
        execScoreTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">Sem dados de score disponíveis</td></tr>';
      }
    }
    
    // Popula tabela de IPV (Ranking Geral)
    const ipvTableBody = document.getElementById('fsr-ipv-table');
    if (ipvTableBody) {
      ipvTableBody.innerHTML = '';
      if (activeRepsTable.length > 0) {
        activeRepsTable.forEach((fsr, idx) => {
          const tr = document.createElement('tr');
          
          // Determina cor do IPV
          let ipvClass = 'badge-warning';
          const ipv = fsr.ipv || 0;
          if (ipv >= 80) ipvClass = 'badge-success';
          else if (ipv < 50) ipvClass = 'badge-danger';
          
          // Badges coloridos para os pilares (com proteção contra undefined)
          const breakdown = fsr.ipvBreakdown || { result: 0, efficiency: 0, behavior: 0 };
          const resultClass = (breakdown.result || 0) >= 70 ? 'badge-success' : 
                              (breakdown.result || 0) >= 50 ? 'badge-warning' : 'badge-danger';
          const effClass = (breakdown.efficiency || 0) >= 70 ? 'badge-success' : 
                           (breakdown.efficiency || 0) >= 50 ? 'badge-warning' : 'badge-danger';
          const behavClass = (breakdown.behavior || 0) >= 70 ? 'badge-success' : 
                             (breakdown.behavior || 0) >= 50 ? 'badge-warning' : 'badge-danger';
          
          tr.innerHTML = `
            <td style="font-weight: 700; color: var(--primary-cyan); font-size: 1.2em;">#${idx + 1}</td>
            <td style="font-weight: 600; color: #fff;">${fsr.name || 'N/A'}</td>
            <td><span class="badge ${ipvClass}" style="font-size: 1.1em; padding: 8px 12px;">${ipv}</span></td>
            <td><span class="badge ${resultClass}">${breakdown.result || 0}</span></td>
            <td><span class="badge ${effClass}">${breakdown.efficiency || 0}</span></td>
            <td><span class="badge ${behavClass}">${breakdown.behavior || 0}</span></td>
            <td>${fsr.winRate || 0}%</td>
            <td style="font-weight: 600;">${formatMoney(fsr.totalGrossGenerated || 0)}</td>
          `;
          ipvTableBody.appendChild(tr);
        });
      } else {
        ipvTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
      }
    }
    
    // Popula tabela de vendedores ATIVOS
    const perfActiveBody = document.getElementById('fsr-performance-active-body');
    if (perfActiveBody) {
      perfActiveBody.innerHTML = '';
    if (activeRepsTable.length > 0) {
      activeRepsTable.forEach(fsr => {
        const tr = document.createElement('tr');
        
        // Determina cor do Win Rate
        let winRateClass = 'badge-warning';
        const wr = fsr.winRate || 0;
        if (wr >= 80) winRateClass = 'badge-success';
        else if (wr < 40) winRateClass = 'badge-danger';
        
        tr.innerHTML = `
          <td style="font-weight: 600; color: #fff;">${fsr.name || 'N/A'}</td>
          <td><span class="badge ${winRateClass}">${wr}%</span></td>
          <td>${fsr.totalWon || 0}</td>
          <td>${fsr.totalLost || 0}</td>
          <td style="color: var(--success);">${fsr.avgWinCycle || 0}d</td>
          <td style="color: var(--danger);">${fsr.avgLossCycle || 0}d</td>
          <td>${formatMoney(fsr.avgGross || 0)}</td>
          <td style="font-weight: 600; color: var(--success);">${formatMoney(fsr.totalGrossGenerated || 0)}</td>
          <td style="font-weight: 600; color: var(--primary-cyan);">${formatMoney(fsr.totalNetGenerated || 0)}</td>
        `;
        perfActiveBody.appendChild(tr);
      });
    } else {
      perfActiveBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
    }
    } // fim do if perfActiveBody
    
    // Popula tabela de vendedores INATIVOS
    const perfInactiveBody = document.getElementById('fsr-performance-inactive-body');
    if (perfInactiveBody) {
      perfInactiveBody.innerHTML = '';
    setTextSafe('inactive-count', inactiveReps.length);
    if (inactiveReps.length > 0) {
      inactiveReps.forEach(fsr => {
        const tr = document.createElement('tr');
        
        let winRateClass = 'badge-warning';
        const wr = fsr.winRate || 0;
        if (wr >= 80) winRateClass = 'badge-success';
        else if (wr < 40) winRateClass = 'badge-danger';
        
        tr.innerHTML = `
          <td style="font-weight: 600; color: var(--text-gray);">${fsr.name || 'N/A'}</td>
          <td><span class="badge ${winRateClass}">${wr}%</span></td>
          <td>${fsr.totalWon || 0}</td>
          <td>${fsr.totalLost || 0}</td>
          <td style="color: var(--text-gray);">${formatMoney(fsr.revenue || 0)}</td>
        `;
        perfInactiveBody.appendChild(tr);
      });
    } else {
      perfInactiveBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">Nenhum vendedor inativo</td></tr>';
    }
    } // fim do if perfInactiveBody

    // FSR Behavior Table - APENAS ATIVOS
    const behavActiveBody = document.getElementById('fsr-behavior-active-body');
    if (behavActiveBody) {
      behavActiveBody.innerHTML = '';
    if (activeRepsTable.length > 0) {
      activeRepsTable.forEach(fsr => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 600; color: #fff;">${fsr.name || 'N/A'}</td>
          <td style="color: var(--success);">${fsr.avgActivitiesWin || 0}</td>
          <td style="color: var(--danger);">${fsr.avgActivitiesLoss || 0}</td>
          <td style="font-size: 12px; color: var(--text-gray);">${fsr.topLossCause || 'N/A'}</td>
          <td style="font-size: 12px; color: var(--text-gray);">${fsr.topWinFactor || 'N/A'}</td>
        `;
        behavActiveBody.appendChild(tr);
      });
    } else {
      behavActiveBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">Sem dados de vendedores ativos</td></tr>';
    }
    } // fim do if behavActiveBody

    // 4. POR VENDEDOR - Popula selector APENAS COM ATIVOS
    const repSelector = document.getElementById('rep-selector');
    if (repSelector) {
      repSelector.innerHTML = '<option value="">-- Selecione um vendedor --</option>';
      if (activeRepsTable.length > 0) {
        activeRepsTable.forEach((rep, idx) => {
          const option = document.createElement('option');
          option.value = idx;
          option.textContent = rep.name || `Vendedor ${idx + 1}`;
          option.dataset.isActive = 'true'; // Marca como ativo
          repSelector.appendChild(option);
        });
      }
    }

    // 5. Agenda (LEGADO DESATIVADO)
    // A renderização da Pauta Semanal é feita exclusivamente por public/weekly-agenda-new.js
    
    // ============================================================================
    // POPULA FILTRO DE VENDEDORES
    // ============================================================================
    populateRepFilter();
    
    // Atualizar métricas de Sales Specialist
    updateSalesSpecialistMetrics();
    enhanceAllKpiCards(document);

    // Card Oportunidades Estagnadas (depende de pipelineDataRaw já populado)
    if (typeof window.buildStagnantCard === 'function') window.buildStagnantCard();
    
    log('[RENDER] ========== RENDERIZAÇÃO CONCLUÍDA ==========');
    log('[RENDER] Timestamp fim:', new Date().toISOString());
  } catch (error) {
    console.error('✖ Erro ao renderizar dashboard:', error);
    document.body.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #fff; background: #1c2b3e; min-height: 100vh;">
        <h2 style="color: #E14849;">⚠ Erro ao carregar dashboard</h2>
        <p style="color: #b0b8c4; margin: 20px 0;">${error.message}</p>
        <details style="margin-top: 30px; text-align: left; max-width: 800px; margin-left: auto; margin-right: auto; background: #24344d; padding: 20px; border-radius: 8px;">
          <summary style="cursor: pointer; color: #00BEFF; font-weight: 600;"><svg class="icon"><use href="#icon-search"/></svg> Detalhes Técnicos</summary>
          <pre style="margin-top: 15px; color: #e0e6ed; font-size: 12px; overflow-x: auto;">${error.stack || 'Stack trace não disponível'}</pre>
        </details>
        <div style="margin-top: 30px;">
          <button onclick="location.reload()" style="
            background: #00BEFF; 
            color: #1c2b3e; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 8px; 
            font-weight: 600; 
            cursor: pointer;
            font-size: 14px;
          ">↻ Recarregar Dashboard</button>
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Se o erro persistir, limpe o cache via menu: <b>Xertica AI > Limpar Cache Web App</b>
        </p>
      </div>
    `;
  }
}

// ── Revenue IA — análise estratégica para modo ERP (Gross/Net Revenue) ──────
function renderIARevenue({ rev, att, top }) {
  const execContentEl    = document.getElementById('exec-ia-content');
  const execActionsEl    = document.getElementById('exec-ia-actions');
  if (!execContentEl) return;

  const mode  = window.execDisplayMode || 'gross';
  const isNet = (mode === 'net');
  const fmt   = (v) => typeof formatMoney === 'function' ? formatMoney(v) : String(v);

  // ── Data extraction ─────────────────────────────────────────────────────
  const totais  = rev?.totais  || {};
  const semanas = rev?.por_semana || [];
  const attRes  = att?.resumo  || {};
  const items   = top?.items   || [];

  const totalRev = isNet ? (totais.net_revenue  || 0) : (totais.gross_revenue  || 0);
  const pago     = totais.net_pago      || 0;
  const pendente = totais.net_pendente  || 0;
  const pagoPend = pago + pendente;
  const pendPct  = pagoPend > 0 ? Math.round((pendente / pagoPend) * 100) : 0;
  const pagoPct  = pagoPend > 0 ? Math.round((pago    / pagoPend) * 100) : 0;

  const attKey = isNet ? 'attainment_net_pct' : 'attainment_gross_pct';
  const attPct = attRes[attKey] != null ? Math.round(Number(attRes[attKey])) : null;
  const metaKey = isNet ? 'meta_net' : 'meta_gross';
  const metaVal = attRes[metaKey] || 0;

  // Tendência: últimas 4 semanas vs 4 semanas anteriores (rolling, ignora semanas parciais)
  let trendPct = null;
  let trendLabel = null;
  let lastWeekRev = 0;
  let recentAvg = 0;
  let priorAvg = 0;
  if (semanas.length >= 5) {
    const revKey = isNet ? 'net_revenue' : 'gross_revenue';
    const allVals = semanas.map(s => s[revKey] || 0);
    const fullAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

    // Detecta se a última semana é parcial (< 40% da média geral) — exclui da janela
    const lastVal  = allVals[allVals.length - 1];
    const isLastPartial = fullAvg > 0 && lastVal < fullAvg * 0.4;
    const anchor   = isLastPartial ? allVals.length - 1 : allVals.length;

    // Janela recente: [anchor-4 .. anchor-1] e anterior: [anchor-8 .. anchor-5]
    const recentWindow = allVals.slice(Math.max(0, anchor - 4), anchor);
    const priorWindow  = allVals.slice(Math.max(0, anchor - 8), Math.max(0, anchor - 4));

    if (recentWindow.length > 0 && priorWindow.length > 0) {
      recentAvg = recentWindow.reduce((a, b) => a + b, 0) / recentWindow.length;
      priorAvg  = priorWindow.reduce((a, b) => a + b, 0)  / priorWindow.length;
      if (priorAvg > 0) {
        trendPct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
      }
    }
    lastWeekRev = isLastPartial
      ? (allVals.slice(-2)[0] || 0)   // penúltima (última completa)
      : lastVal;
    trendLabel = `vs 4 sem. anteriores · últimas ${recentWindow.length} sem. ${typeof formatMoney === 'function' ? 'avg ' + formatMoney(recentAvg) : ''}`;
  }

  // Top client concentration
  const top1    = items[0] || null;
  const top3Sum = items.slice(0,3).reduce((s, r) => s + (isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0)), 0);
  const top1Rev = top1 ? (isNet ? (top1.net_revenue || 0) : (top1.gross_revenue || 0)) : 0;
  const top1Pct = totalRev > 0 ? Math.round((top1Rev  / totalRev) * 100) : 0;
  const top3Pct = totalRev > 0 ? Math.round((top3Sum  / totalRev) * 100) : 0;

  // Top product
  const prodMap = {};
  items.forEach(r => {
    const p = r.produto_principal || 'Outros';
    const v = isNet ? (r.net_revenue || 0) : (r.gross_revenue || 0);
    prodMap[p] = (prodMap[p] || 0) + v;
  });
  const prodEntries  = Object.entries(prodMap).sort((a,b) => b[1]-a[1]);
  const topProdName  = prodEntries[0]?.[0] || '—';
  const topProdVal   = prodEntries[0]?.[1] || 0;
  const topProdPct   = totalRev > 0 ? Math.round((topProdVal / totalRev) * 100) : 0;

  // ── Drill map (avoids dynamic string escaping issues) ───────────────────
  window._iaRevDrills = {
    att:      function() { const el = document.getElementById('erp-kpi-section'); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); },
    pendente: function() { if (typeof openRevenueExpandedDrilldown==='function') openRevenueExpandedDrilldown({title:'Revenue Pendente',dimension:'all',value:'all',statusPagamento:'Pendiente,NAO_INFORMADO'}); },
    pago:     function() { if (typeof openRevenueExpandedDrilldown==='function') openRevenueExpandedDrilldown({title:'Revenue Pago',dimension:'all',value:'all',statusPagamento:'Pagada,Intercompañia'}); },
    top1:     function() { if (top1 && typeof openRevenueExpandedDrilldown==='function') openRevenueExpandedDrilldown({title:'Top Cliente · '+top1.cliente,dimension:'cliente',value:top1.cliente}); },
    topProd:  function() { if (topProdName!=='—' && typeof openRevenueExpandedDrilldown==='function') openRevenueExpandedDrilldown({title:'Produto · '+topProdName,dimension:'produto_principal',value:topProdName}); },
    graficos: function() { if (typeof switchMetricView==='function') switchMetricView('view-graficos', document.getElementById('view-btn-graficos')); },
    all:      function() { if (typeof openRevenueExpandedDrilldown==='function') openRevenueExpandedDrilldown({title:'Revenue Completo',dimension:'all',value:'all'}); },
  };

  // ── SVGs ─────────────────────────────────────────────────────────────────
  const _svgMap = {
    target:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><polyline points="20 6 9 17 4 12"/></svg>',
    alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    zap:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    bar:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    layers:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    clock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  };

  const diagCards  = [];
  const actionSteps = [];

  // ── CARD 1: Attainment vs Meta ──────────────────────────────────────────
  if (attPct !== null) {
    const type    = attPct >= 90 ? 'healthy' : attPct >= 70 ? 'warning' : 'critical';
    const metaFmt = metaVal > 0 ? fmt(metaVal) : 'não disponível';
    const gapVal  = metaVal > 0 && attPct < 100 ? metaVal - totalRev : 0;
    diagCards.push({
      type, iconKey: 'target',
      title: 'Attainment vs Meta',
      metric: { value: attPct + '%', label: `da meta ${metaFmt} · ${isNet ? 'Net' : 'Gross'} Revenue` },
      stats: [
        { key: 'Revenue Realizado', val: fmt(totalRev) },
        { key: 'Meta do Período',   val: metaFmt },
        { key: 'Attainment',        val: attPct + '%' },
        ...(gapVal > 0 ? [{ key: 'Gap para Meta', val: fmt(gapVal) }] : []),
      ],
      desc: attPct >= 100
        ? `Meta atingida com ${attPct}% de attainment. ${fmt(totalRev)} realizados no período. Investigar potencial de over-attainment e proteger receita recorrente.`
        : `Attainment de ${attPct}% — ${gapVal > 0 ? `faltam ${fmt(gapVal)} para fechar a meta.` : 'abaixo da meta.'} ${attPct < 70 ? 'Recuperação urgente necessária para o período.' : 'Aceleração nas próximas semanas pode recuperar o gap.'}`,
      action: attPct >= 90
        ? 'Manter ritmo e monitorar receita recorrente com pendência de reconhecimento.'
        : `Identificar ${attPct < 70 ? 'todas' : 'as principais'} contas com faturamento pendente e acelerar reconhecimento.`,
      drillLabel: 'Ver KPIs de Attainment',
      drillFn: 'window._iaRevDrills.att()',
    });
    if (attPct < 70) actionSteps.push({ label: 'Recuperação de Meta', desc: `Attainment em ${attPct}%. Priorizar reconhecimento de receita pendente e cobranças em atraso.`, urgent: true });
  }

  // ── CARD 2: Saúde de Cobrança ─────────────────────────────────────────
  if (pagoPend > 0) {
    const cobrType = pendPct > 40 ? 'critical' : pendPct > 20 ? 'warning' : 'healthy';
    diagCards.push({
      type: cobrType, iconKey: cobrType === 'healthy' ? 'check' : 'alert',
      title: 'Saúde de Cobrança',
      metric: { value: pendPct + '%', label: `do faturado pendente · ${fmt(pendente)} a receber` },
      stats: [
        { key: 'Faturado Total', val: fmt(pagoPend) },
        { key: 'Pago',           val: fmt(pago) },
        { key: '% Pago',         val: pagoPct + '%' },
        { key: 'Pendente',       val: fmt(pendente) },
        { key: '% Pendente',     val: pendPct + '%' },
      ],
      desc: pendPct > 40
        ? `${pendPct}% do faturamento (${fmt(pendente)}) ainda não foi recebido — risco de caixa elevado. De ${fmt(pagoPend)} faturados, apenas ${fmt(pago)} (${pagoPct}%) foram confirmados pagos.`
        : pendPct > 20
        ? `${fmt(pendente)} pendentes representam ${pendPct}% do faturamento. Monitoramento ativo recomendado para evitar inadimplência crescente.`
        : `Cobrança saudável: ${pagoPct}% do faturamento (${fmt(pago)}) já foi recebido. Apenas ${fmt(pendente)} (${pendPct}%) ainda pendentes.`,
      action: pendPct > 20
        ? `Acionar time de cobrança nos clientes com pendências — ver lista completa no drill abaixo.`
        : 'Manter monitoramento semanal da carteira de recebíveis.',
      drillLabel: `Ver ${fmt(pendente)} pendente por cliente`,
      drillFn: 'window._iaRevDrills.pendente()',
    });
    if (pendPct > 30) actionSteps.push({ label: 'Cobrança Prioritária', desc: `${fmt(pendente)} pendentes (${pendPct}% do faturado). Elaborar lista de cobrança imediata.`, urgent: true });
  }

  // ── CARD 3: Concentração de Clientes ────────────────────────────────────
  if (top1 && top1Rev > 0) {
    const concType = top1Pct > 40 ? 'critical' : top1Pct > 25 ? 'warning' : 'healthy';
    diagCards.push({
      type: concType, iconKey: concType === 'healthy' ? 'check' : 'layers',
      title: 'Concentração de Clientes',
      metric: { value: top1Pct + '%', label: `do revenue no top cliente · ${top1.cliente}` },
      stats: [
        { key: 'Top 1 Cliente',  val: top1.cliente },
        { key: 'Revenue Top 1',  val: fmt(top1Rev) },
        { key: '% do Total',     val: top1Pct + '%' },
        { key: 'Top 3 Clientes', val: fmt(top3Sum) },
        { key: '% Top 3',        val: top3Pct + '%' },
        { key: 'Total Clientes', val: String(items.length) },
      ],
      desc: top1Pct > 40
        ? `Concentração crítica: ${top1.cliente} representa ${top1Pct}% do revenue. Qualquer churn ou inadimplência neste cliente impacta diretamente o attainment do período.`
        : top1Pct > 25
        ? `Top 3 clientes concentram ${top3Pct}% do revenue. ${top1.cliente} lidera com ${top1Pct}%. Acompanhar saúde desses contratos de forma prioritária.`
        : `Base diversificada: maior cliente (${top1.cliente}) representa apenas ${top1Pct}% do período — estrutura saudável de distribuição de receita.`,
      action: top1Pct > 30
        ? `Mapear riscos de contrato dos top 3 clientes (${top3Pct}% do revenue). Plano de retenção ativo.`
        : `Avaliar oportunidades de upsell/cross-sell nos ${items.length} clientes ativos do período.`,
      drillLabel: `Ver detalhes de ${top1.cliente}`,
      drillFn: 'window._iaRevDrills.top1()',
    });
    if (top1Pct > 35) actionSteps.push({ label: 'Risco de Concentração', desc: `${top1.cliente} representa ${top1Pct}% do revenue. Plano de diversificação e retenção necessário.`, urgent: top1Pct > 45 });
  }

  // ── CARD 4: Tendência Rolling 4 semanas ─────────────────────────────────
  if (trendPct !== null) {
    const type4    = trendPct >= 5 ? 'healthy' : trendPct >= -5 ? 'warning' : 'critical';
    const sign4    = trendPct > 0 ? '+' : '';
    diagCards.push({
      type: type4, iconKey: trendPct >= 0 ? 'zap' : 'clock',
      title: 'Tendência de Receita',
      metric: { value: sign4 + trendPct + '%', label: `últimas 4 sem. vs 4 sem. anteriores · avg recente ${fmt(recentAvg)}/sem.` },
      stats: [
        { key: 'Variação (4s vs 4s)', val: sign4 + trendPct + '%' },
        { key: 'Avg Recente (4 sem)', val: fmt(recentAvg) + '/sem.' },
        { key: 'Avg Anterior (4 sem)', val: fmt(priorAvg)  + '/sem.' },
        { key: 'Revenue Total',       val: fmt(totalRev) },
        { key: 'Semanas Analisadas',  val: String(semanas.length) },
        { key: 'Última Semana Completa', val: fmt(lastWeekRev) },
      ],
      desc: trendPct >= 10
        ? `Receita em aceleração: as últimas 4 semanas (média ${fmt(recentAvg)}/sem.) estão ${sign4}${trendPct}% acima das 4 anteriores (${fmt(priorAvg)}/sem.). Ritmo favorável para o período.`
        : trendPct >= -5
        ? `Receita estável: variação de ${sign4}${trendPct}% entre as últimas 4 e as 4 semanas anteriores. Médias comparadas: ${fmt(recentAvg)}/sem. recente vs ${fmt(priorAvg)}/sem. anterior.`
        : `Desaceleração de ${Math.abs(trendPct)}%: as últimas 4 semanas (${fmt(recentAvg)}/sem.) estão abaixo das 4 anteriores (${fmt(priorAvg)}/sem.). Investigar causas e contas em risco.`,
      action: trendPct < -5
        ? 'Investigar causas da desaceleração — ver gráfico semanal para identificar o ponto de queda.'
        : 'Acompanhar ritmo semanal para garantir fechamento do período. Ver gráfico completo.',
      drillLabel: 'Ver gráfico de evolução semanal',
      drillFn: 'window._iaRevDrills.graficos()',
    });
    if (trendPct < -15) actionSteps.push({ label: 'Desaceleração de Receita', desc: `Revenue das últimas 4 semanas caiu ${Math.abs(trendPct)}% vs as 4 anteriores. Verificar inadimplência e churn.`, urgent: true });
  }

  // ── CARD 5: Mix de Produtos ──────────────────────────────────────────────
  if (topProdName !== '—' && topProdPct > 0) {
    const mixType = topProdPct > 70 ? 'warning' : 'healthy';
    diagCards.push({
      type: mixType, iconKey: 'bar',
      title: 'Mix de Produtos',
      metric: { value: topProdPct + '%', label: `do revenue em ${topProdName} · ${prodEntries.length} produto${prodEntries.length > 1 ? 's' : ''} ativo${prodEntries.length > 1 ? 's' : ''}` },
      stats: [
        { key: 'Top Produto',     val: topProdName },
        { key: 'Revenue Produto', val: fmt(topProdVal) },
        { key: '% do Total',      val: topProdPct + '%' },
        { key: 'Produtos Ativos', val: String(prodEntries.length) },
        ...(prodEntries[1] ? [{ key: '2º Produto', val: prodEntries[1][0] + ' (' + Math.round((prodEntries[1][1]/totalRev)*100) + '%)' }] : []),
      ],
      desc: topProdPct > 70
        ? `${topProdName} concentra ${topProdPct}% do revenue — alta dependência de um único produto. Diversificação de mix pode reduzir risco de erosão de receita.`
        : `Mix de ${prodEntries.length} produtos ativos. ${topProdName} lidera com ${topProdPct}% (${fmt(topProdVal)}) — distribuição equilibrada.`,
      action: topProdPct > 70
        ? `Analisar oportunidades de cross-sell além de ${topProdName} para diversificar a base de receita.`
        : `Monitorar evolução de cada produto no período — ver histórico completo no drill.`,
      drillLabel: `Ver revenue de ${topProdName}`,
      drillFn: 'window._iaRevDrills.topProd()',
    });
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  if (diagCards.length === 0) {
    diagCards.push({
      type: 'healthy', iconKey: 'check',
      title: 'Revenue Carregado',
      metric: { value: fmt(totalRev), label: `Total ${isNet ? 'Net' : 'Gross'} Revenue no período` },
      stats: [],
      desc: 'Dados carregados. Aplique filtros de período, portfólio, status, produto, tipo de oportunidade ou segmento para análise detalhada.',
      action: 'Selecionar período e filtros para análise aprofundada.',
      drillLabel: 'Ver todos os dados de revenue',
      drillFn: 'window._iaRevDrills.all()',
    });
  }
  if (actionSteps.length === 0) {
    actionSteps.push({ label: 'Monitoramento Contínuo', desc: 'Manter revisão semanal de attainment, cobrança e tendência de receita.', urgent: false });
  }

  // ── Render (mesma estrutura CSS que booking IA) ──────────────────────────
  const arrowSVG   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;margin-top:2px;opacity:0.6;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  const chevronSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>';
  const sevLabel   = { critical: 'Crítico', warning: 'Alerta', healthy: 'Saudável' };

  execContentEl.innerHTML = diagCards.map(function(c) {
    const statsHTML = c.stats && c.stats.length > 0
      ? '<div class="ia-diag-stats">' + c.stats.map(function(s) { return '<div class="ia-diag-stat"><span class="ia-diag-stat-key">' + s.key + '</span><span class="ia-diag-stat-val">' + s.val + '</span></div>'; }).join('') + '</div>'
      : '';
    const drillBtn = c.drillLabel
      ? '<button class="ia-drill-btn" onclick="' + c.drillFn + '">' + c.drillLabel + ' ' + chevronSVG + '</button>'
      : '';
    return '<div class="ia-diag-card ' + c.type + '">'
      + '<div class="ia-diag-top">'
      + '<span class="ia-diag-severity">' + (sevLabel[c.type] || c.type) + '</span>'
      + '<span class="ia-diag-icon-wrap">' + (_svgMap[c.iconKey] || _svgMap.bar) + '</span>'
      + '<div class="ia-diag-title">' + c.title + '</div>'
      + '</div>'
      + (c.metric ? '<div class="ia-diag-metric-row"><span class="ia-diag-metric-value">' + c.metric.value + '</span><span class="ia-diag-metric-label">' + c.metric.label + '</span></div>' : '')
      + '<p class="ia-diag-desc">' + c.desc + '</p>'
      + statsHTML
      + '<div class="ia-diag-footer"><p class="ia-diag-action">' + arrowSVG + ' ' + c.action + '</p>' + drillBtn + '</div>'
      + '</div>';
  }).join('');

  if (execActionsEl) {
    const urgentDot = '<span class="ia-urgent-dot"></span>';
    execActionsEl.innerHTML = actionSteps.map(function(s, i) {
      return '<div class="ia-action-item' + (s.urgent ? ' urgent' : '') + '">'
        + '<div class="ia-action-num">' + (i + 1) + '</div>'
        + '<div class="ia-action-body">'
        + '<strong>' + (s.urgent ? urgentDot : '') + s.label + '</strong>'
        + '<p>' + s.desc + '</p>'
        + '</div></div>';
    }).join('');
  }
}

// Função para mostrar detalhes de um vendedor específico (REESCRITA - CONSOME API)
