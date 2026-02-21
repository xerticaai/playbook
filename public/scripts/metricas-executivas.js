// Métricas executivas: updateExecutiveMetricsFromAPI, updateConversionMetrics, SalesSpecialist, etc.
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
    const avgConf = metrics.pipeline_filtered.avg_meddic || 0; // Usar avg_meddic como proxy de confiança
    const forecastWeighted = pipelineGross * (avgConf / 100);
    const forecastNet = (metrics.pipeline_filtered.net || 0) * (avgConf / 100);
    
    setTextSafe('exec-forecast-total', formatMoney(forecastWeighted));
    setTextSafe('exec-forecast-avg', Math.round(avgConf) + '% confiança média');
    setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNet));
    log('[FORECAST WEIGHTED] ✓ Atualizado da API:', formatMoney(forecastWeighted));
  }
  
  // DEALS ≥50% CONFIANÇA IA
  if (metrics.high_confidence) {
    const highConfGross = metrics.high_confidence.gross;
    const highConfNet = metrics.high_confidence.net;
    const highConfCount = metrics.high_confidence.deals_count;
    const highConfAvg = metrics.high_confidence.avg_confidence || 0;
    
    if (highConfGross !== null && highConfGross !== undefined) {
      setTextSafe('exec-above50-total', formatMoney(highConfGross));
      setTextSafe('exec-above50-deals', highConfCount + ' deals');
      setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConfNet));
      log('[HIGH CONFIDENCE] ✓ Atualizado da API:', formatMoney(highConfGross), highConfCount, 'deals');
    }
  }
  
  // IDLE DAYS (do pipeline)
  if (metrics.pipeline_filtered) {
    const avgIdleDays = metrics.pipeline_filtered.avg_idle_days;
    const highRiskCount = metrics.pipeline_filtered.high_risk_idle || 0;
    const mediumRiskCount = metrics.pipeline_filtered.medium_risk_idle || 0;
    const dealsCount = metrics.pipeline_filtered.deals_count || 0;
    
    if (avgIdleDays !== null && avgIdleDays !== undefined) {
      setTextSafe('exec-idle-days-avg', Math.round(avgIdleDays));
      setTextSafe('exec-idle-days-detail', `${Math.round(avgIdleDays)} dias sem atividade`);
      
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
  
  // MEDDIC SCORE - CORREÇÃO: Deve vir de closed_won (deals ganhos), não de pipeline
  // Pipeline pode ter deals futuros que ainda não aconteceram
  if (metrics.closed_won && metrics.closed_won.deals_count > 0) {
    // Tenta pegar avg_meddic de closed_won (se API adicionar no futuro)
    const avgMeddicWon = metrics.closed_won.avg_meddic;
    
    if (avgMeddicWon !== null && avgMeddicWon !== undefined) {
      setTextSafe('exec-won-meddic', Math.round(avgMeddicWon));
      setTextSafe('exec-won-meddic-detail', `${Math.round(avgMeddicWon)}/100 score de qualificação`);
      log('[MEDDIC SCORE] ✓ Atualizado da API (closed_won):', avgMeddicWon);
    } else {
      // Fallback: usa pipeline_filtered apenas se houver deals ganhos no período
      const avgMeddicPipeline = metrics.pipeline_filtered?.avg_meddic;
      if (avgMeddicPipeline !== null && avgMeddicPipeline !== undefined) {
        setTextSafe('exec-won-meddic', Math.round(avgMeddicPipeline));
        setTextSafe('exec-won-meddic-detail', `${Math.round(avgMeddicPipeline)}/100 score de qualificação`);
        log('[MEDDIC SCORE] ⚠ Usando pipeline (fallback):', avgMeddicPipeline);
      }
    }
  } else {
    // Se não há deals ganhos, mostrar N/A ou 0
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
  
  // Atualiza cards
  setTextSafe('exec-forecast-weighted', formatMoney(forecastGross));
  setTextSafe('exec-forecast-percent', Math.round(avgConfidence) + '% confiança média');
  setTextSafe('exec-forecast-net', 'Net: ' + formatMoney(forecastNet));
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
  
  // Atualiza cards
  setTextSafe('exec-above50-value', formatMoney(highConfGross));
  setTextSafe('exec-above50-count', highConfCount + ' deals');
  setTextSafe('exec-above50-net', 'Net: ' + formatMoney(highConfNet));
}

// Função para filtrar pipeline por período
