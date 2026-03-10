// Métricas executivas: updateExecutiveMetricsFromAPI, updateConversionMetrics, SalesSpecialist, etc.
function setExecutiveForecastAndConfidenceCards(payload) {
  if (payload && (payload.forecastGross !== undefined || payload.forecastNet !== undefined || payload.avgConfidence !== undefined)) {
    const forecastGross = Number(payload?.forecastGross || 0);
    const forecastNet = Number(payload?.forecastNet || 0);
    const avgConfidence = Number(payload?.avgConfidence || 0);
    setTextSafe('exec-forecast-weighted', formatMoney(forecastGross));
    setTextSafe('exec-forecast-percent', Math.round(avgConfidence) + '% confiança média');
    setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNet));
  }

  if (payload && (payload.highConfGross !== undefined || payload.highConfNet !== undefined || payload.highConfCount !== undefined)) {
    const highConfGross = Number(payload?.highConfGross || 0);
    const highConfNet = Number(payload?.highConfNet || 0);
    const highConfCount = Number(payload?.highConfCount || 0);
    setTextSafe('exec-above50-value', formatMoney(highConfGross));
    setTextSafe('exec-above50-count', highConfCount + ' deals');
    setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConfNet));
  }
}

function updateExecutiveMetricsFromAPI(metrics) {
  if (!metrics) {
    log('[EXEC METRICS] ⚠ Nenhum dado de metrics disponível');
    return;
  }
  
  log('[EXEC METRICS] Atualizando KPIs com dados da API:', metrics);
  log('[DEBUG] ===== updateExecutiveMetricsFromAPI EXECUTANDO =====');
  
  // PIPELINE TOTAL (TODOS OS ANOS)
  if (metrics.pipeline_total) {
    const totalGross = metrics.pipeline_total.gross;
    const totalNet = metrics.pipeline_total.net;
    const totalCount = metrics.pipeline_total.deals_count;
    
    if (totalGross !== null && totalGross !== undefined) {
      setTextSafe('exec-pipeline-year-total', formatMoney(totalGross));
      setTextSafe('exec-pipeline-year-deals', totalCount + ' deals abertos');
      setTextSafe('exec-pipeline-year-net', 'Net: ' + formatMoney(totalNet));
      log('[PIPELINE TOTAL] ✓ Card ATUALIZADO da API:', formatMoney(totalGross), totalCount, 'deals');
    }
  }
  
  // PIPELINE (PERÍODO FILTRADO)
  if (metrics.pipeline_filtered) {
    const pipelineGross = metrics.pipeline_filtered.gross;
    const pipelineNet = metrics.pipeline_filtered.net;
    const pipelineCount = metrics.pipeline_filtered.deals_count;
    
    log('[DEBUG] pipeline_filtered valores:', {
      gross: formatMoney(pipelineGross),
      net: formatMoney(pipelineNet),
      deals: pipelineCount
    });
    
    if (pipelineGross !== null && pipelineGross !== undefined) {
      setTextSafe('exec-pipeline-total', formatMoney(pipelineGross));
      setTextSafe('exec-pipeline-deals', pipelineCount + ' deals no período');
      setTextSafe('exec-pipeline-net', 'Net: ' + formatMoney(pipelineNet));
      log('[PIPELINE FILTERED] ✓ Card ATUALIZADO da API:', formatMoney(pipelineGross), pipelineCount, 'deals');
    } else {
      log('[PIPELINE FILTERED] ⚠ pipeline_filtered.gross é null/undefined');
    }
  } else {
    log('[PIPELINE FILTERED] ⚠ metrics.pipeline_filtered NÃO existe');
  }
  
  // PREVISÃO PONDERADA IA
  if (metrics.pipeline_filtered) {
    const pipelineGross = metrics.pipeline_filtered.gross || 0;
    // Usa avg_confidence (0-100) que é o campo correto para confiança média do pipeline
    const avgConf = metrics.pipeline_filtered.avg_confidence || 0;
    const forecastWeighted = pipelineGross * (avgConf / 100);
    const forecastNet = (metrics.pipeline_filtered.net || 0) * (avgConf / 100);
    
    setExecutiveForecastAndConfidenceCards({
      forecastGross: forecastWeighted,
      forecastNet,
      avgConfidence: avgConf,
      highConfGross: metrics.high_confidence?.gross || 0,
      highConfNet: metrics.high_confidence?.net || 0,
      highConfCount: metrics.high_confidence?.deals_count || 0,
    });
    log('[FORECAST WEIGHTED] ✓ Atualizado da API:', formatMoney(forecastWeighted));
  }

  if (metrics.high_confidence) {
    log('[HIGH CONFIDENCE] ✓ Atualizado da API:', formatMoney(metrics.high_confidence.gross || 0), metrics.high_confidence.deals_count || 0, 'deals');
  }
  
  // IDLE DAYS (do pipeline)
  if (metrics.pipeline_filtered) {
    const avgIdleDays = metrics.pipeline_filtered.avg_idle_days;
    const highRiskCount = metrics.pipeline_filtered.high_risk_idle || 0;
    const mediumRiskCount = metrics.pipeline_filtered.medium_risk_idle || 0;
    const dealsCount = metrics.pipeline_filtered.deals_count || 0;
    
    if (avgIdleDays !== null && avgIdleDays !== undefined) {
      setTextSafe('exec-idle-days-avg', Math.round(avgIdleDays));
      setTextSafe('exec-idle-days-detail', `dias desde o último contato`);
      
      // Montar label de risco
      let riskLabel = '';
      if (highRiskCount > 0) {
        riskLabel = `🔴 ${highRiskCount} em alto risco (>30d)`;
      } else if (mediumRiskCount > 0) {
        riskLabel = `🟡 ${mediumRiskCount} em médio risco (15-30d)`;
      } else {
        riskLabel = `🟢 ${dealsCount} deals ativos`;
      }
      setTextSafe('exec-idle-days-risk', riskLabel);
      
      log('[IDLE DAYS] ✓ Atualizado da API:', avgIdleDays);
    }
  }
  
  // ATIVIDADES e MEDDIC SCORE (GANHOS do pipeline)
  if (metrics.closed_won) {
    const avgActivitiesFromApi = metrics.closed_won.avg_activities;
    let avgActivitiesWon = (avgActivitiesFromApi !== null && avgActivitiesFromApi !== undefined)
      ? Number(avgActivitiesFromApi)
      : null;
    const avgCycleWon = metrics.closed_won.avg_cycle_days;

    if (!(avgActivitiesWon > 0) && Array.isArray(window.wonAgg) && window.wonAgg.length > 0) {
      const wonActivities = window.wonAgg
        .map((deal) => Number(deal.activities ?? deal.Atividades))
        .filter((value) => Number.isFinite(value));
      if (wonActivities.length > 0) {
        avgActivitiesWon = wonActivities.reduce((sum, value) => sum + value, 0) / wonActivities.length;
        log('[ATIVIDADES WON] Usando fallback de wonAgg:', avgActivitiesWon);
      }
    }
    
    if (avgActivitiesWon !== null && avgActivitiesWon !== undefined && Number.isFinite(avgActivitiesWon)) {
      setTextSafe('exec-won-activities', Math.round(avgActivitiesWon));
      setTextSafe('exec-won-activities-detail', `${Math.round(avgActivitiesWon)} atividades por deal ganho`);
      log('[ATIVIDADES WON] ✓ Atualizado da API:', avgActivitiesWon);
    }
    
    if (avgCycleWon !== null && avgCycleWon !== undefined) {
      setTextSafe('exec-won-cycle-days', Math.round(avgCycleWon));
      setTextSafe('exec-cycle-won', Math.round(avgCycleWon) + ' dias');
      setTextSafe('exec-cycle-won-detail', metrics.closed_won.deals_count + ' deals com ciclo');
      window.avgCycleWon = Math.round(avgCycleWon);
      log('[CICLO WON] ✓ Atualizado da API:', avgCycleWon);
    }
    
    // NET VALUE
    if (metrics.closed_won.net) {
      // Atualizar onde o Net é exibido (ex: exec-forecast-net)
      const netValue = metrics.closed_won.net;
      const wonDealsCount = metrics.closed_won.deals_count || 0;
      if (wonDealsCount > 0) {
        const ticketWonNet = netValue / wonDealsCount;
        setTextSafe('exec-ticket-won-net', 'Net: ' + formatMoney(ticketWonNet));
      }
      log('[NET WON] ✓ Atualizado da API:', netValue);
    }
  }
  
  // MEDDIC SCORE
  // avg_meddic de closed_won não existe ainda na API — usar pipeline_filtered como aproximação
  if (metrics.closed_won && metrics.closed_won.deals_count > 0) {
    const avgMeddicPipeline = metrics.pipeline_filtered?.avg_meddic;
    if (avgMeddicPipeline !== null && avgMeddicPipeline !== undefined) {
      setTextSafe('exec-won-meddic', Math.round(avgMeddicPipeline));
      setTextSafe('exec-won-meddic-detail', `${Math.round(avgMeddicPipeline)}/100 score de qualificação`);
      log('[MEDDIC SCORE] ✓ Usando pipeline_filtered.avg_meddic:', avgMeddicPipeline);
    } else {
      setTextSafe('exec-won-meddic', '0');
      setTextSafe('exec-won-meddic-detail', 'Sem dados de MEDDIC');
    }
  } else {
    setTextSafe('exec-won-meddic', '0');
    setTextSafe('exec-won-meddic-detail', 'Sem dados de MEDDIC');
    log('[MEDDIC SCORE] ⚠ Nenhum deal ganho no período');
  }
  
  // ATIVIDADES PERDIDAS e EVITABILIDADE
  if (metrics.closed_lost) {
    const avgActivitiesLost = metrics.closed_lost.avg_activities;
    const avgCycleLost = metrics.closed_lost.avg_cycle_days;
    const lostGross = metrics.closed_lost.gross || 0;
    const lostNet = metrics.closed_lost.net || 0;
    const evitavelPct = metrics.closed_lost.evitavel_pct || 0;
    const evitavelCount = metrics.closed_lost.evitavel_count || 0;
    const totalLosses = metrics.closed_lost.deals_count || 0;
    const totalWins = metrics.closed_won?.deals_count || 0;
    const totalClosed = totalWins + totalLosses;
    const lossRate = totalClosed > 0 ? Math.round((totalLosses / totalClosed) * 100) : 0;

    setTextSafe('exec-lost-total', formatMoney(lostGross));
    setTextSafe('exec-lost-deals', totalLosses + ' deals perdidos');
    setTextSafe('exec-lost-net', 'Net: ' + formatMoney(lostNet));
    setTextSafe('exec-loss-rate', lossRate + '%');
    setTextSafe('exec-loss-detail', `${totalLosses}/${totalClosed} deals`);
    
    if (avgCycleLost !== null && avgCycleLost !== undefined) {
      setTextSafe('exec-lost-cycle-days', Math.round(avgCycleLost));
      setTextSafe('exec-cycle-lost', Math.round(avgCycleLost) + ' dias');
      setTextSafe('exec-cycle-lost-detail', totalLosses + ' deals com ciclo');
      window.avgCycleLost = Math.round(avgCycleLost);
      log('[CICLO LOST] ✓ Atualizado da API:', avgCycleLost);
    }
    
    setTextSafe('exec-lost-evitavel-pct', Math.round(evitavelPct) + '%');
    setTextSafe('exec-lost-evitavel-count', `${evitavelCount} de ${totalLosses} deals evitáveis`);
    log('[EVITAVEL] ✓ Atualizado da API:', evitavelPct + '%');
  }
  
  // EFICIÊNCIA DE CICLO
  // CRÍTICO: Usar cycle_efficiency_pct da API (já calculado com dados filtrados)
  const apiCycleEfficiency = metrics.cycle_efficiency_pct;
  if (apiCycleEfficiency !== null && apiCycleEfficiency !== undefined) {
    const efficiency = Math.round(apiCycleEfficiency);
    const efficiencyText = efficiency > 0 ? `+${efficiency}%` : `${efficiency}%`;
    const wonCycle = window.avgCycleWon || 0;
    const lostCycle = window.avgCycleLost || 0;
    setTextSafe('exec-cycle-efficiency', efficiencyText);
    setTextSafe('exec-cycle-efficiency-detail', `ganhos ${wonCycle}d vs perdas ${lostCycle}d`);
    log('[EFICIENCIA] ✓ Ciclo da API:', efficiency + '%');
  } else if (window.avgCycleWon && window.avgCycleLost && window.avgCycleLost > 0) {
    // Fallback: calcular localmente se API não retornar
    const efficiency = Math.round((1 - (window.avgCycleWon / window.avgCycleLost)) * 100);
    const efficiencyText = efficiency > 0 ? `+${efficiency}%` : `${efficiency}%`;
    setTextSafe('exec-cycle-efficiency', efficiencyText);
    setTextSafe('exec-cycle-efficiency-detail', `ganhos ${window.avgCycleWon}d vs perdas ${window.avgCycleLost}d`);
    log('[EFICIENCIA] ✓ Ciclo calculated (fallback):', efficiency + '%');
  }
}

// Função para calcular e atualizar métricas de Idle Days (DEPRECATED - usar updateExecutiveMetricsFromAPI)
function updateIdleDaysMetrics(pipelineData) {
  log('[IDLE DAYS] ⚠ updateIdleDaysMetrics deprecated - usando dados da API');
  // Esta função é mantida para compatibilidade mas não calcula mais nada
  // Os dados agora vêm do endpoint /api/metrics via updateExecutiveMetricsFromAPI
}

// Função auxiliar para filtrar pipeline por período
function filterPipelineByPeriod_(period) {
  const allPipeline = window.DATA?.pipeline || window.pipelineDataRaw || [];
  
  if (!Array.isArray(allPipeline) || allPipeline.length === 0) {
    log('[FILTER PIPELINE] ⚠ Nenhum dado de pipeline disponível');
    return [];
  }
  
  if (period === 'all') {
    return allPipeline;
  }
  
  const fy = window.currentFY || 'FY26';
  
  if (period === 'total') {
    return allPipeline.filter(d => 
      (d.Fiscal_Q || d.fiscal_q || '').startsWith(fy + '-')
    );
  }
  
  if (['q1', 'q2', 'q3', 'q4'].includes(period)) {
    const targetQuarter = fy + '-' + period.toUpperCase();
    return allPipeline.filter(d => 
      (d.Fiscal_Q || d.fiscal_q) === targetQuarter
    );
  }
  
  return allPipeline;
}

// Função para atualizar métricas de conversão ao filtrar por período
function updateConversionMetricsForPeriod(period) {
  if (!window.wonAgg || !window.lostAgg) {
    log('[CONVERSION] ⚠ wonAgg ou lostAgg não disponíveis');
    log('[CONVERSION] wonAgg:', window.wonAgg ? window.wonAgg.length : 'undefined');
    log('[CONVERSION] lostAgg:', window.lostAgg ? window.lostAgg.length : 'undefined');
    const apiWon = window.currentApiMetrics?.closed_won || {};
    const apiLost = window.currentApiMetrics?.closed_lost || {};
    const apiWins = apiWon.deals_count || 0;
    const apiLosses = apiLost.deals_count || 0;
    const apiTotal = apiWins + apiLosses;
    if (apiTotal > 0) {
      const conversionRateApi = Math.round((apiWins / apiTotal) * 100);
      const lossRateApi = Math.round((apiLosses / apiTotal) * 100);
      setTextSafe('exec-closed-total', formatMoney(apiWon.gross || 0));
      setTextSafe('exec-closed-deals', apiWins + ' deals ganhos');
      setTextSafe('exec-closed-net', 'Net: ' + formatMoney(apiWon.net || 0));
      setTextSafe('exec-conversion-rate', conversionRateApi + '%');
      setTextSafe('exec-conversion-detail', apiWins + '/' + apiTotal + ' deals');
      setTextSafe('exec-lost-total', formatMoney(apiLost.gross || 0));
      setTextSafe('exec-lost-deals', apiLosses + ' deals perdidos');
      setTextSafe('exec-lost-net', 'Net: ' + formatMoney(apiLost.net || 0));
      setTextSafe('exec-loss-rate', lossRateApi + '%');
      setTextSafe('exec-loss-detail', apiLosses + '/' + apiTotal + ' deals');
    }
    return;
  }
  
  let winsGross = 0, winsNet = 0, lossesGross = 0, lossesNet = 0;
  let totalWins = 0, totalLosses = 0;
  
  // Se período for um quarter específico, filtra
  const fy = window.currentFY || 'FY26';
  let targetQuarter = null;
  
  if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
    targetQuarter = `${fy}-${period.toUpperCase()}`;
  }
  
  log('[CONVERSION] Filtrando por:', targetQuarter || 'TODOS');
  log('[CONVERSION] wonAgg total:', window.wonAgg.length);
  log('[CONVERSION] lostAgg total:', window.lostAgg.length);
  
  // Filtra ganhas pelo período
  if (window.wonAgg) {
    window.wonAgg.forEach(deal => {
      // Se targetQuarter é null ("all"), inclui TODOS os deals
      // Se targetQuarter existe, filtra apenas matching fiscalQ
      if (targetQuarter === null || deal.fiscalQ === targetQuarter) {
        winsGross += deal.gross || 0;
        winsNet += deal.net || 0;
        totalWins++;
      }
    });
  }
  
  // Filtra perdidas pelo período
  if (window.lostAgg) {
    window.lostAgg.forEach(deal => {
      // Se targetQuarter é null ("all"), inclui TODOS os deals
      if (targetQuarter === null || deal.fiscalQ === targetQuarter) {
        lossesGross += deal.gross || 0;
        lossesNet += deal.net || 0;
        totalLosses++;
      }
    });
  }
  
  const apiWon = window.currentApiMetrics?.closed_won || {};
  const apiLost = window.currentApiMetrics?.closed_lost || {};
  if (targetQuarter === null) {
    const apiWins = apiWon.deals_count || 0;
    const apiLosses = apiLost.deals_count || 0;
    const shouldUseApiFallback = (totalWins === 0 && apiWins > 0) || (totalLosses === 0 && apiLosses > 0);
    if (shouldUseApiFallback) {
      log('[CONVERSION] Aplicando fallback da API para ganhos/perdas');
      totalWins = apiWins;
      totalLosses = apiLosses;
      winsGross = apiWon.gross || 0;
      winsNet = apiWon.net || 0;
      lossesGross = apiLost.gross || 0;
      lossesNet = apiLost.net || 0;
    }
  }

  const totalDeals = totalWins + totalLosses;
  const conversionRate = totalDeals > 0 ? Math.round((totalWins / totalDeals) * 100) : 0;
  
  log('[CONVERSION UPDATE] Período:', targetQuarter || 'TODOS');
  log('[CONVERSION] Ganhas: Gross', formatMoney(winsGross), '| Net', formatMoney(winsNet), '|', totalWins, 'deals');
  log('[CONVERSION] Perdidas: Gross', formatMoney(lossesGross), '| Net', formatMoney(lossesNet), '|', totalLosses, 'deals');
  log('[CONVERSION] Taxa:', conversionRate + '%', `(${totalWins}/${totalDeals})`);
  
  // Atualiza o card "Fechado no Quarter" (adaptativo ao filtro)
  setTextSafe('exec-closed-total', formatMoney(winsGross));
  setTextSafe('exec-closed-deals', totalWins + ' deals ganhos');
  setTextSafe('exec-closed-net', 'Net: ' + formatMoney(winsNet));
  
  // Atualiza o card "Taxa de Conversão" (adaptativo ao filtro)
  setTextSafe('exec-conversion-rate', conversionRate + '%');
  setTextSafe('exec-conversion-detail', totalWins + '/' + totalDeals + ' deals');
  
  // ========== NOVO: Atualiza os cards de DEALS PERDIDOS ==========
  const lossRate = totalDeals > 0 ? Math.round((totalLosses / totalDeals) * 100) : 0;
  setTextSafe('exec-lost-total', formatMoney(lossesGross));
  setTextSafe('exec-lost-deals', totalLosses + ' deals perdidos');
  setTextSafe('exec-lost-net', 'Net: ' + formatMoney(lossesNet));
  setTextSafe('exec-loss-rate', lossRate + '%');
  setTextSafe('exec-loss-detail', totalLosses + '/' + totalDeals + ' deals');
  
  // ========== NOVO: Atualiza PERFORMANCE DOS VENDEDORES ==========
  // Ticket Médio Ganhos
  const ticketWonGross = totalWins > 0 ? winsGross / totalWins : 0;
  const ticketWonNet = totalWins > 0 ? winsNet / totalWins : 0;
  setTextSafe('exec-ticket-won', formatMoney(ticketWonGross));
  setTextSafe('exec-ticket-won-detail', 'média por deal');
  setTextSafe('exec-ticket-won-net', 'Net: ' + formatMoney(ticketWonNet));
  
  // Ticket Médio Perdidos
  const ticketLostGross = totalLosses > 0 ? lossesGross / totalLosses : 0;
  const ticketLostNet = totalLosses > 0 ? lossesNet / totalLosses : 0;
  setTextSafe('exec-ticket-lost', formatMoney(ticketLostGross));
  setTextSafe('exec-ticket-lost-detail', 'média por deal');
  setTextSafe('exec-ticket-lost-net', 'Net: ' + formatMoney(ticketLostNet));
  
  // ⚠ NOTA: Métricas de Ciclo, Atividades, MEDDIC e Evitabilidade são atualizadas
  // pela função updateExecutiveMetricsFromAPI() usando dados do endpoint /api/metrics
  // O cálculo manual foi removido para evitar duplicação e inconsistência
  
  // Vendedores: Win Rate total
  const sellersWinRate = totalDeals > 0 ? conversionRate : 0;
  setTextSafe('exec-sellers-active', window.totalVendedores || 10);
  setTextSafe('exec-sellers-total', 'de ' + (window.totalVendedores || 10) + ' vendedores');
  setTextSafe('exec-sellers-winrate', 'Win Rate: ' + sellersWinRate + '%');
  
  // Atualiza a display da Taxa de Conversão
  const conversionCard = document.querySelector('[data-card="conversion"]');
  if (conversionCard) {
    const detailEl = conversionCard.querySelector('[data-detail]');
    if (detailEl) {
      const html = `
        <div style="margin-top: 12px; font-size: 11px; opacity: 0.85; line-height: 1.6;">
          <div><strong>Ganhas:</strong> ${formatMoney(winsGross)} (Gross) | ${formatMoney(winsNet)} (Net)</div>
          <div><strong>Perdidas:</strong> ${formatMoney(lossesGross)} (Gross) | ${formatMoney(lossesNet)} (Net)</div>
          <div style="margin-top: 8px; border-top: 1px solid rgba(176,184,196,0.2); padding-top: 8px;">
            <strong>Resultado Líquido (Net):</strong> ${formatMoney(winsNet - lossesNet)}
          </div>
        </div>
      `;
      detailEl.innerHTML += html;
    }
  }
}

// ============================================================================
// FUNÇÃO PARA ATUALIZAR SALES SPECIALIST METRICS
// ============================================================================
function updateSalesSpecialistMetrics() {
  if (!DATA || !DATA.salesSpecialist) {
    log('[SALES SPECIALIST] Dados não disponíveis');
    return;
  }

  const normalizeForecastCategory = (rawCategory) => {
    const text = String(rawCategory || '').toUpperCase();
    if (text.includes('COMMIT')) return 'COMMIT';
    if (text.includes('UPSIDE')) return 'UPSIDE';
    if (text.includes('POTENC')) return 'POTENCIAL';
    if (text.includes('OMIT')) return 'OMITIDO';
    if (text.includes('PIPE')) return 'PIPELINE';
    return 'PIPELINE';
  };

  const animateSalesSpecialistBars = () => {
    ['forecast-ss-commit-bar', 'forecast-ss-upside-bar'].forEach((barId, idx) => {
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
  
  const ss = DATA.salesSpecialist;
  const pipelineTotal = DATA?.cloud_analysis?.pipeline_analysis?.metrics?.pipeline_total?.gross || 74523512;
  
  // Total Curado
  setTextSafe('exec-ss-total', formatMoney(ss.total.gross));
  setTextSafe('exec-ss-deals', `${ss.total.deals} deals curados`);
  setTextSafe('exec-ss-net', `Net: ${formatMoney(ss.total.net)}`);
  
  // Taxa de Curadoria
  const coveragePercent = pipelineTotal > 0 ? ((ss.total.gross / pipelineTotal) * 100).toFixed(1) : 0;
  const coverageDealsPercent = DATA.weeklyAgenda ? ((ss.total.deals / Object.values(DATA.weeklyAgenda).flat().length) * 100).toFixed(1) : 0;
  setTextSafe('exec-ss-coverage', `${coveragePercent}%`);
  setTextSafe('exec-ss-coverage-deals', `${coverageDealsPercent}% dos deals`);
  setTextSafe('exec-ss-coverage-value', `${coveragePercent}% do valor`);
  
  // Ticket Médio
  const avgTicketGross = ss.total.deals > 0 ? ss.total.gross / ss.total.deals : 0;
  const avgTicketNet = ss.total.deals > 0 ? ss.total.net / ss.total.deals : 0;
  setTextSafe('exec-ss-ticket', formatMoney(avgTicketGross));
  setTextSafe('exec-ss-ticket-detail', 'média por deal');
  setTextSafe('exec-ss-ticket-net', `Net: ${formatMoney(avgTicketNet)}`);
  
  // Top Vendedor
  const vendedores = Object.entries(ss.byVendor).sort((a, b) => b[1].gross - a[1].gross);
  if (vendedores.length > 0) {
    const [topName, topData] = vendedores[0];
    setTextSafe('exec-ss-top-seller', topName);
    setTextSafe('exec-ss-top-value', formatMoney(topData.gross) + ' curado');
    setTextSafe('exec-ss-top-deals', `${topData.deals} deals`);
  }
  
  // Atualizar barras de Forecast Health - Sales Specialist
  const commitPercent = ss.total.gross > 0 ? (ss.byStatus.COMMIT.gross / ss.total.gross) * 100 : 0;
  const upsidePercent = ss.total.gross > 0 ? (ss.byStatus.UPSIDE.gross / ss.total.gross) * 100 : 0;
  
  const commitBar = document.getElementById('forecast-ss-commit-bar');
  const upsideBar = document.getElementById('forecast-ss-upside-bar');
  
  if (commitBar) {
    commitBar.style.width = commitPercent + '%';
    commitBar.textContent = commitPercent > 5 ? `${commitPercent.toFixed(0)}%` : '';
  }
  if (upsideBar) {
    upsideBar.style.width = upsidePercent + '%';
    upsideBar.textContent = upsidePercent > 5 ? `${upsidePercent.toFixed(0)}%` : '';
  }
  
  setTextSafe('forecast-ss-commit-value', `${formatMoney(ss.byStatus.COMMIT.gross)} (${commitPercent.toFixed(0)}%)`);
  setTextSafe('forecast-ss-commit-net', 'Net: ' + formatMoney(ss.byStatus.COMMIT.net));
  
  setTextSafe('forecast-ss-upside-value', `${formatMoney(ss.byStatus.UPSIDE.gross)} (${upsidePercent.toFixed(0)}%)`);
  setTextSafe('forecast-ss-upside-net', 'Net: ' + formatMoney(ss.byStatus.UPSIDE.net));

  animateSalesSpecialistBars();

  const ssDealsRows = (Array.isArray(DATA?.salesSpecialist?.deals) ? DATA.salesSpecialist.deals : []).map((deal) => {
    const gross = Number(deal.booking_total_gross || deal.Gross || deal.gross || 0);
    const net = Number(deal.booking_total_net || deal.Net || deal.net || 0);
    const closeDate = deal.closed_date || deal.close_date || deal.closeDate || deal.Data_Fechamento || '';
    return {
      source: 'ss',
      name: deal.opportunity_name || deal.Oportunidade || deal.oportunidade || deal.name || 'Deal sem nome',
      account: deal.account_name || deal.Conta || deal.conta || deal.account || 'Conta nao informada',
      owner: deal.vendedor || deal.Vendedor || deal.owner || 'N/A',
      value: Number.isNaN(gross) ? 0 : gross,
      netValue: Number.isNaN(net) ? 0 : net,
      stage: String(deal.forecast_status || deal.opportunity_status || deal.Status || '').toUpperCase(),
      quarter: deal.fiscal_quarter || deal.Fiscal_Q || deal.fiscalQ || 'Quarter N/A',
      closeDate,
      forecastStatus: normalizeForecastCategory(deal.forecast_status || deal.opportunity_status || deal.Status || ''),
      suggestedAction: deal.acao_recomendada || deal.Acao_Sugerida || deal.Acao_Recomendada || deal.recomendacao_acao || deal.proxima_acao || ''
    };
  });

  const bindSalesSpecialistBarDrilldown = (barId, category) => {
    const barEl = document.getElementById(barId);
    if (!barEl) return;
    barEl.style.cursor = 'pointer';
    barEl.title = `Clique para drill-down Sales Specialist (${category})`;
    barEl.onclick = () => {
      if (typeof window.openExecutiveDrilldown !== 'function') return;
      const rows = ssDealsRows.filter((row) => normalizeForecastCategory(row.forecastStatus) === category);
      window.openExecutiveDrilldown({
        title: `Drill-down · Saúde Forecast Sales Specialist · ${category}`,
        subtitle: `Categoria ${category}`,
        rows,
        selected: rows[0] || null,
        rule: `Deals de Sales Specialist com forecast ${category}`,
        baseLabel: `${rows.length} deals · ${formatMoney(rows.reduce((sum, row) => sum + (row.value || 0), 0))}`,
        sql: 'SELECT * FROM sales_specialist_deals WHERE forecast_status = <categoria> AND <filtros_herdados>'
      });
    };
  };

  bindSalesSpecialistBarDrilldown('forecast-ss-commit-bar', 'COMMIT');
  bindSalesSpecialistBarDrilldown('forecast-ss-upside-bar', 'UPSIDE');
  
  log('[SALES SPECIALIST] Métricas atualizadas:', ss);
}

// ============================================================================
// FUNÇÃO PARA ATUALIZAR PREVISÃO PONDERADA IA (ADAPTATIVA AO FILTRO)
// ============================================================================
function updateForecastPrediction(period, pipelineData) {
  log('[FORECAST] Recalculando Previsão Ponderada IA para período:', period);
  
  // SEMPRE calcula confiança média dos deals disponíveis (não USA STATIC_METRICS)
  let avgConfidence = 0;
  
  // Para todos os períodos, recalcula com deals disponíveis
  if (!window.allDealsWithConfidence || window.allDealsWithConfidence.length === 0) {
    log('[FORECAST] ⚠ allDealsWithConfidence não disponível, confiança = 0');
    avgConfidence = 0;
  } else {
    const fy = window.currentFY || 'FY26';
    let dealsToAnalyze = [];
    
    if (period === 'all' || period === 'total') {
      // Sem filtro: analisa TODOS os deals do ano fiscal atual
      dealsToAnalyze = window.allDealsWithConfidence.filter(d => 
        (d.fiscalQ || '').startsWith(fy + '-')
      );
      log('[FORECAST] Analisando TODOS os deals de', fy + ':', dealsToAnalyze.length);
    } else if (['q1', 'q2', 'q3', 'q4'].includes(period)) {
      const targetQuarter = fy + '-' + period.toUpperCase();
      dealsToAnalyze = window.allDealsWithConfidence.filter(d => 
        d.fiscalQ === targetQuarter
      );
      log('[FORECAST] Analisando deals de', targetQuarter + ':', dealsToAnalyze.length);
    }
    
    // Calcula confiança média dos deals do período
    let totalConfidence = 0;
    let dealsWithConfidence = 0;
    
    dealsToAnalyze.forEach(d => {
      let conf = parseFloat(d.confidence) || 0;
      if (conf > 1) conf = conf / 100;
      
      if (conf > 0) {
        totalConfidence += conf;
        dealsWithConfidence++;
      }
    });
    
    avgConfidence = dealsWithConfidence > 0 
      ? (totalConfidence / dealsWithConfidence) * 100 
      : 0;
    
    log('[FORECAST] Confiança média calculada do período:', avgConfidence.toFixed(1) + '%', '(' + dealsWithConfidence + ' deals)');
  }
  
  // Calcula previsão ponderada
  const forecastGross = pipelineData.gross * (avgConfidence / 100);
  const forecastNet = pipelineData.net * (avgConfidence / 100);
  
  log('[FORECAST] Previsão Ponderada IA:', {
    'pipeline': formatMoney(pipelineData.gross),
    'confiança': avgConfidence.toFixed(1) + '%',
    'previsão': formatMoney(forecastGross)
  });
  
  setExecutiveForecastAndConfidenceCards({ forecastGross, forecastNet, avgConfidence });
}

// ============================================================================
// FUNÇÃO PARA ATUALIZAR DEALS ≥50% CONFIANÇA IA (ADAPTATIVA AO FILTRO)
// ============================================================================
function updateHighConfidenceDeals(period) {
  log('[HIGH-CONF] Recalculando Deals ≥50% para período:', period);
  
  // ✓ SEMPRE pega da API filtrada (nunca recalcula localmente)
  // Os valores corretos vêm do backend que faz: WHERE Confianca >= 50
  const hasFilters = period !== 'all';
  let highConfGross = 0;
  let highConfNet = 0;
  let highConfCount = 0;
  
  if (hasFilters && window.lastApiFilteredResponse) {
    // Usa valores filtrados da última resposta da API
    const apiHighConf = window.lastApiFilteredResponse.executive?.high_confidence || {};
    highConfGross = apiHighConf.gross || 0;
    highConfNet = apiHighConf.net || 0;
    highConfCount = apiHighConf.deals_count || 0;
    log('[HIGH-CONF] ✓ Usando valores FILTRADOS da API:', highConfCount, 'deals');
  } else {
    // Sem filtros: usa valores globais da carga inicial (DATA)
    const globalHighConf = safe(window.DATA, 'cloudAnalysis.pipeline_analysis.executive.high_confidence', {});
    highConfGross = globalHighConf.gross || 0;
    highConfNet = globalHighConf.net || 0;
    highConfCount = globalHighConf.deals_count || 0;
    log('[HIGH-CONF] ✓ Usando valores GLOBAIS da API:', highConfCount, 'deals');
  }
  
  log('[HIGH-CONF] Resultado:', {
    'total': highConfCount,
    'gross': formatMoney(highConfGross),
    'net': formatMoney(highConfNet)
  });
  
  setExecutiveForecastAndConfidenceCards({ highConfGross, highConfNet, highConfCount });
}

// ─── OPORTUNIDADES ESTAGNADAS ────────────────────────────────────────────────
// Regra: Ciclo_dias >= 90 (no pipeline há 90+ dias) E Idle_Dias >= 30 (sem atividade há 30+ dias)
function mapDealToStagnantAlertPayload_(deal) {
  var safe = function(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  };
  var num = function(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    oportunidade: safe(deal.Oportunidade || deal.name || deal.opportunityName || deal.opportunity_name),
    conta: safe(deal.Conta || deal.account || deal.account_name),
    vendedor: safe(deal.Vendedor || deal.seller || deal.owner),
    fase_atual: safe(deal.Fase_Atual || deal.stage),
    fiscal_q: safe(deal.Fiscal_Q || deal.fiscal_q || deal.quarter || deal.fiscalQ),
    data_prevista: safe(deal.Data_Prevista || deal.close_date || deal.closeDate || deal.Data_Fechamento),
    dias_funil: num(deal.Ciclo_dias || deal.ciclo_dias || deal.Ciclo_Dias || deal.cycle),
    idle_dias: num(deal.Idle_Dias || deal.Dias_Idle || deal.idle_dias || deal.idleDays),
    atividades: num(deal.Atividades || deal.activities),
    gross: num(deal.Gross || deal.gross || deal.value),
    net: num(deal.Net || deal.net || deal.netValue),
    confianca: num(deal.Confianca || deal.confidence),
    risco_score: num(deal.Risco_Score || deal.riskScore || deal.risk_score),
    meddic_score: num(deal.MEDDIC_Score || deal.meddic || deal.meddic_score),
    tipo_oportunidade: safe(deal.Tipo_Oportunidade || deal.tipo_oportunidade),
    portfolio: safe(deal.Portfolio || deal.portfolio || deal.Portfolio_FDM || deal.portfolio_fdm),
    acao_sugerida: safe(deal.Acao_Sugerida || deal.acao_sugerida || deal.suggestedAction || deal.suggested_action),
    risco_principal: safe(deal.Risco_Principal || deal.mainRisk || deal.main_risk)
  };
}

async function sendStagnantAlertRequest_(deal, source) {
  var ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  var ALERT_MAX_ATTEMPTS = 3;
  var ALERT_RETRY_DELAYS_MS = [700, 1500];
  var API_PROXY_URL = String(window.API_BASE_URL || '') + '/api/stagnant-alert/send';

  var makeDealKey = function(payloadDeal) {
    var rawKey = [
      payloadDeal.oportunidade || '',
      payloadDeal.conta || '',
      payloadDeal.vendedor || ''
    ].join('|').toLowerCase().trim();
    return rawKey || 'unknown_deal';
  };

  var getCooldownStorageKey = function(dealKey) {
    return 'stagnant_alert_last_sent:' + dealKey;
  };

  var readCooldownTs = function(storageKey) {
    try {
      var value = localStorage.getItem(storageKey);
      if (!value) return 0;
      var ts = Number(value);
      return Number.isFinite(ts) ? ts : 0;
    } catch (_err) {
      return 0;
    }
  };

  var writeCooldownTs = function(storageKey, ts) {
    try {
      localStorage.setItem(storageKey, String(ts));
    } catch (_err) {
      // Ignore storage errors silently
    }
  };

  var formatRemaining = function(ms) {
    var totalMin = Math.max(1, Math.ceil(ms / 60000));
    var hh = Math.floor(totalMin / 60);
    var mm = totalMin % 60;
    if (hh > 0) return hh + 'h' + (mm > 0 ? ' ' + mm + 'min' : '');
    return mm + 'min';
  };

  var sleep = function(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  };

  var webhookUrl = String(window.STAGNANT_ALERT_WEBHOOK_URL || '').trim();
  var secret = String(window.STAGNANT_ALERT_SECRET || '').trim();

  if (!webhookUrl) {
    if (typeof showToast === 'function') {
      showToast('Configuração ausente: defina STAGNANT_ALERT_WEBHOOK_URL para enviar alertas.', 'warning');
    }
    return { success: false, reason: 'missing_webhook' };
  }

  var actor = String(window.currentUserEmail || '').trim() || 'frontend';
  var mappedDeal = mapDealToStagnantAlertPayload_(deal || {});
  var dealKey = makeDealKey(mappedDeal);
  var storageKey = getCooldownStorageKey(dealKey);
  var nowTs = Date.now();
  var lastSentTs = readCooldownTs(storageKey);
  var elapsedMs = nowTs - lastSentTs;

  if (lastSentTs > 0 && elapsedMs < ALERT_COOLDOWN_MS) {
    var remainingMs = ALERT_COOLDOWN_MS - elapsedMs;
    if (typeof showToast === 'function') {
      showToast('Alerta já enviado recentemente. Aguarde ' + formatRemaining(remainingMs) + ' para reenviar.', 'info');
    }
    return { success: false, reason: 'cooldown_active', remainingMs: remainingMs };
  }

  var payload = {
    secret: secret,
    source: source || 'stagnant_card',
    actor: actor,
    deal: mappedDeal
  };

  var pushClientLog = function(entry) {
    try {
      var key = 'stagnant_alert_client_logs';
      var list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) list = [];
      list.push(entry);
      if (list.length > 150) list = list.slice(list.length - 150);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_err) {
      // ignore
    }
  };

  for (var attempt = 1; attempt <= ALERT_MAX_ATTEMPTS; attempt++) {
    try {
      var response = await fetch(API_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      var responseData = {};
      try {
        responseData = await response.json();
      } catch (_parseErr) {
        responseData = {};
      }

      if (!response.ok || responseData.success === false) {
        var serverReason = (responseData && (responseData.message || responseData.error || responseData.detail)) || ('HTTP ' + response.status);
        throw new Error(typeof serverReason === 'string' ? serverReason : JSON.stringify(serverReason));
      }

      writeCooldownTs(storageKey, Date.now());
      pushClientLog({
        timestamp: new Date().toISOString(),
        success: true,
        source: payload.source,
        actor: payload.actor,
        opportunity: mappedDeal.oportunidade,
        seller: mappedDeal.vendedor,
        attempt: attempt,
        server: responseData.log || null
      });
      if (typeof showToast === 'function') {
        showToast('Alerta disparado para envio por email.', 'success');
      }
      return { success: true, data: responseData, attempt: attempt };
    } catch (error) {
      var isLastAttempt = attempt >= ALERT_MAX_ATTEMPTS;
      if (isLastAttempt) {
        pushClientLog({
          timestamp: new Date().toISOString(),
          success: false,
          source: payload.source,
          actor: payload.actor,
          opportunity: mappedDeal.oportunidade,
          seller: mappedDeal.vendedor,
          attempt: attempt,
          reason: String(error && error.message ? error.message : error)
        });
        if (typeof showToast === 'function') {
          showToast('Erro ao enviar alerta de estagnação.', 'warning');
        }
        return { success: false, reason: String(error && error.message ? error.message : error), attempt: attempt };
      }
      var waitMs = ALERT_RETRY_DELAYS_MS[attempt - 1] || 1200;
      await sleep(waitMs);
    }
  }

  return { success: false, reason: 'send_unexpected_failure' };
}

window.openStagnantAlertLogs = async function() {
  var container = document.getElementById('exec-stagnant-log-list');
  var panel = document.getElementById('exec-stagnant-log-panel');
  if (!container || !panel) return;

  panel.style.display = 'block';
  container.innerHTML = '<div class="exec-dd-empty" style="padding:12px;">Carregando logs de envio...</div>';

  try {
    var response = await fetch((String(window.API_BASE_URL || '') + '/api/stagnant-alert/logs?limit=50'));
    var data = await response.json();
    var items = Array.isArray(data && data.items) ? data.items : [];

    if (!items.length) {
      container.innerHTML = '<div class="exec-dd-empty" style="padding:12px;">Sem logs no servidor ainda.</div>';
      return;
    }

    container.innerHTML = items.map(function(item) {
      var ok = !!item.success;
      var statusLabel = ok ? 'Enviado' : 'Falha';
      var statusColor = ok ? 'var(--accent-green)' : 'var(--danger)';
      var ts = String(item.timestamp || '').replace('T', ' ').replace('Z', '');
      var opp = String(item.opportunity || '-');
      var seller = String(item.seller || '-');
      var source = String(item.source || '-');
      var err = String(item.error || '-');
      var code = item.webhook_status != null ? String(item.webhook_status) : '-';

      return '<div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.10);border-radius:10px;background:rgba(255,255,255,0.03);">'
        + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">'
        + '<strong style="color:' + statusColor + ';font-size:12px;">' + statusLabel + '</strong>'
        + '<span style="font-size:11px;color:var(--text-gray);">' + ts + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-main);margin-top:6px;"><strong>Oportunidade:</strong> ' + opp + '</div>'
        + '<div style="font-size:11px;color:var(--text-gray);margin-top:3px;">Vendedor: ' + seller + ' · Origem: ' + source + ' · HTTP: ' + code + '</div>'
        + (!ok ? '<div style="font-size:11px;color:var(--danger);margin-top:4px;">Erro: ' + err + '</div>' : '')
        + '</div>';
    }).join('');
  } catch (error) {
    container.innerHTML = '<div class="exec-dd-empty" style="padding:12px;">Falha ao carregar logs do servidor.</div>';
  }
};

window.hideStagnantAlertLogs = function() {
  var panel = document.getElementById('exec-stagnant-log-panel');
  if (panel) panel.style.display = 'none';
};

window.sendStagnantAlertFromDeal = async function(deal, source) {
  return sendStagnantAlertRequest_(deal, source || 'stagnant_card');
};

window.sendStagnantAlertFromIndex = async function(idx) {
  var list = window._stagnantDeals || [];
  var deal = list[idx];
  if (!deal) {
    if (typeof showToast === 'function') {
      showToast('Não foi possível localizar a oportunidade para envio do alerta.', 'warning');
    }
    return { success: false, reason: 'deal_not_found' };
  }
  return sendStagnantAlertRequest_(deal, 'stagnant_card');
};

function buildStagnantCard() {
  var pipe = window.pipelineDataRaw || [];
  var section = document.getElementById('exec-stagnant-section');
  if (!section) return;
  var listEl = document.getElementById('exec-stagnant-list');
  var badge = document.getElementById('exec-stagnant-badge');
  if (!pipe.length) {
    if (badge) badge.textContent = '0';
    if (listEl) {
      listEl.innerHTML = '<div class="exec-dd-empty" style="padding:16px;">Sem dados de pipeline para avaliar estagnação.</div>';
    }
    return;
  }

  // Try multiple field name variants for cycle days
  var hasCycleData = pipe.some(function(d) {
    return parseFloat(d.Ciclo_dias || d.ciclo_dias || d.Ciclo_Dias || 0) > 0;
  });

  var stagnant = pipe.filter(function(d) {
    var idle  = parseFloat(d.Idle_Dias || d.Dias_Idle || d.idle_dias || 0);
    var cycle = parseFloat(d.Ciclo_dias || d.ciclo_dias || d.Ciclo_Dias || 0);
    // If cycle data exists: require both conditions
    // If cycle data is missing for all deals: fall back to idle >= 30 only
    if (hasCycleData) return cycle >= 90 && idle >= 30;
    return idle >= 30;
  });

  if (!stagnant.length) {
    if (badge) badge.textContent = '0';
    if (listEl) {
      listEl.innerHTML = '<div class="exec-dd-empty" style="padding:16px;">Nenhuma oportunidade estagnada no recorte atual.</div>';
    }
    return;
  }

  if (badge) badge.textContent = stagnant.length;

  // Update rule label dynamically
  var ruleEl = section.querySelector('.exec-stagnant-rule');
  if (ruleEl) {
    ruleEl.textContent = hasCycleData
      ? '+90 dias no pipeline · sem atividade há +30 dias'
      : 'sem atividade há +30 dias · ' + stagnant.length + ' oportunidades';
  }

  // Sort by idle days DESC
  stagnant.sort(function(a, b) {
    return (parseFloat(b.Idle_Dias || b.Dias_Idle) || 0) - (parseFloat(a.Idle_Dias || a.Dias_Idle) || 0);
  });

  // Store for drilldown
  window._stagnantDeals = stagnant;

  var top = stagnant.slice(0, 5);
  if (!listEl) return;

  listEl.innerHTML = top.map(function(d, idx) {
    var idle  = Math.round(parseFloat(d.Idle_Dias || d.Dias_Idle || d.idle_dias) || 0);
    var cycle = Math.round(parseFloat(d.Ciclo_dias || d.ciclo_dias || d.Ciclo_Dias) || 0);
    var gross = parseFloat(d.Gross || d.gross) || 0;
    var name  = (d.Oportunidade || d.name || 'Deal sem nome').replace(/</g,'&lt;');
    var seller = (d.Vendedor || d.seller || '-').replace(/</g,'&lt;');
    var stage  = (d.Fase_Atual || d.stage || '-').replace(/</g,'&lt;');
    var idleClass = idle > 60 ? 'stagnant-badge--critical' : 'stagnant-badge--warn';

    return '<div class="stagnant-deal-row" onclick="window._openStagnantItem(' + idx + ')">'
      + '<div style="min-width:0;flex:1;">'
      + '<div class="stagnant-deal-name">' + name + '</div>'
      + '<div class="stagnant-deal-meta">' + stage + ' &middot; ' + seller + '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">'
      + '<span class="stagnant-idle-badge ' + idleClass + '">' + idle + 'd idle</span>'
      + (cycle > 0 ? '<span class="stagnant-cycle-badge">' + cycle + 'd pipeline</span>' : '')
      + '<button class="stagnant-inline-alert-btn" onclick="event.stopPropagation();window.sendStagnantAlertFromIndex(' + idx + ')">Avisar vendedor</button>'
      + '</div>'
      + '<div class="stagnant-deal-value">' + (typeof formatMoney === 'function' ? formatMoney(gross) : 'R$' + gross) + '</div>'
      + '</div>';
  }).join('');
}

// Expose globally
window.buildStagnantCard = buildStagnantCard;

window._openStagnantItem = function(ref) {
  if (!window._stagnantDeals) return;
  var d = window._stagnantDeals[ref];
  if (d && typeof openDrilldown === 'function') {
    openDrilldown((d.Oportunidade || 'Deal Estagnado') + ' — Detalhes', [d]);
  }
};

window.openStagnantDrilldown = function() {
  if (window._stagnantDeals && window._stagnantDeals.length && typeof openDrilldown === 'function') {
    openDrilldown('Oportunidades Estagnadas (+90d pipeline · +30d idle)', window._stagnantDeals);
  }
};

// Função para filtrar pipeline por período
