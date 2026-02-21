// Detalhes individuais de vendedor: showRepDetails, timeline, top deals, comparação
async function showRepDetails() {
  const selector = document.getElementById('rep-selector');
  const idx = selector.value;
  const detailsDiv = document.getElementById('rep-details');
  const comparisonDiv = document.getElementById('sellers-comparison');
  
  // Esconde comparação
  comparisonDiv.style.display = 'none';
  
  if (!idx || idx === '') {
    detailsDiv.style.display = 'none';
    return;
  }
  
  const sellerName = selector.options[selector.selectedIndex].text;
  
  // Mostra seção e loading
  detailsDiv.style.display = 'block';
  setHtmlSafe('rep-name-title', `<svg class="icon"><use href="#icon-user"/></svg> ${escapeHtml(sellerName)}`);
  showLoading('Carregando performance do vendedor...');
  
  try {
    // ✅ Usa filtros globais OU fallback para Q1 2026 (período padrão)
    const filters = window.currentFilters || {};
    const usingDefault = !filters.year && !filters.quarter;
    const year = filters.year || '2026';
    const quarter = filters.quarter || '1';
    
    // Monta query string
    let queryParams = [];
    if (year) queryParams.push(`year=${year}`);
    if (quarter) queryParams.push(`quarter=${quarter}`);
    const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
    
    // Define label do período (com indicador de padrão)
    let periodLabel = `📅 FY${year.slice(-2)}-Q${quarter}`;
    if (usingDefault) {
      periodLabel += ' <small style="opacity: 0.7; font-weight: 400;">(padrão)</small>';
    }
    setHtmlSafe('rep-period-badge', periodLabel);
    
    const normalizeSellerKey = (value) => String(value || '').trim().toLowerCase();

    // 1) Tenta endpoint dedicado /api/performance/seller/{name}
    let perf = null;
    let scorecard = {};
    let comportamento = {};
    let lastStatus = null;

    const sellerUrl = `${window.API_BASE_URL}/api/performance/seller/${encodeURIComponent(sellerName)}${queryString}`;
    let response = await fetch(sellerUrl);

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.performance) {
        perf = data.performance;
        scorecard = data.scorecard || {};
        comportamento = data.comportamento || {};
      }
    } else {
      lastStatus = response.status;
      console.warn(`[SELLER] Endpoint dedicado falhou (${response.status}). Tentando fallback no endpoint /api/performance...`);
    }

    // 2) Fallback: usa /api/performance?seller={name} quando dedicado falha (ex.: 403 legado)
    if (!perf) {
      const params = new URLSearchParams();
      if (year) params.append('year', year);
      if (quarter) params.append('quarter', quarter);
      params.append('seller', sellerName);

      const fallbackUrl = `${window.API_BASE_URL}/api/performance?${params.toString()}`;
      const fallbackResponse = await fetch(fallbackUrl);

      if (!fallbackResponse.ok) {
        throw new Error(`API error: ${fallbackResponse.status}`);
      }

      const fallbackData = await fallbackResponse.json();
      if (!fallbackData.success) {
        throw new Error('Dados do vendedor não encontrados');
      }

      const sellerKey = normalizeSellerKey(sellerName);
      perf = (fallbackData.ranking || []).find(item => normalizeSellerKey(item.vendedor) === sellerKey) || (fallbackData.ranking || [])[0] || null;
      scorecard = (fallbackData.scorecard || []).find(item => normalizeSellerKey(item.vendedor) === sellerKey) || (fallbackData.scorecard || [])[0] || {};
      comportamento = (fallbackData.comportamento || []).find(item => normalizeSellerKey(item.vendedor) === sellerKey) || (fallbackData.comportamento || [])[0] || {};

      if (!perf) {
        const statusHint = lastStatus ? ` (falha inicial: ${lastStatus})` : '';
        throw new Error(`Dados do vendedor não encontrados${statusHint}`);
      }
    }
    
    // ============================================================================
    // POPULA CARD IPV DESTACADO
    // ============================================================================
    setTextSafe('rep-ipv-score', perf.ipv || 0);
    setTextSafe('rep-ipv-resultado', perf.resultado || 0);
    setTextSafe('rep-ipv-eficiencia', perf.eficiencia || 0);
    setTextSafe('rep-ipv-comportamento', perf.comportamento || 0);
    setTextSafe('rep-rank-badge', `#${perf.rank || '?'} no ranking`);

    // Sub-detalhe do pilar Comportamento
    const compDetail = document.getElementById('rep-ipv-comportamento-detail');
    if (compDetail && comportamento) {
      const aa = Math.round(comportamento.atingimentoAtividades ?? 0);
      const ao = Math.round(comportamento.atingimentoNovasOpps ?? 0);
      const totalAtiv = comportamento.totalAtividades ?? 0;
      const metaAtiv = comportamento.metaAtividades ?? 0;
      const totalOpps = comportamento.totalNovasOpps ?? 0;
      const metaOpps = comportamento.metaNovasOpps ?? 0;
      compDetail.textContent = `Ativ ${aa}% (${totalAtiv}/${metaAtiv}) | Opps ${ao}% (${totalOpps}/${metaOpps})`;
    }
    
    // Mostra NET gate warning se aplicável
    const netGateWarning = document.getElementById('rep-net-gate-warning');
    if (scorecard.netGerado <= 0 && perf.ipv <= 20) {
      netGateWarning.style.display = 'block';
    } else {
      netGateWarning.style.display = 'none';
    }
    
    // ============================================================================
    // POPULA KPIs
    // ============================================================================
    setTextSafe('rep-winrate', (perf.winRate || 0) + '%');
    setTextSafe('rep-winrate-detail', `${scorecard.totalGanhos || 0}/${(scorecard.totalGanhos || 0) + (scorecard.totalPerdas || 0)} deals ganhos`);
    setTextSafe('rep-wins', scorecard.totalGanhos || 0);
    setTextSafe('rep-wins-detail', formatMoney(scorecard.netGerado || 0)); // ✅ USA NET
    setTextSafe('rep-losses', scorecard.totalPerdas || 0);
    setTextSafe('rep-losses-detail', `${(scorecard.totalGanhos || 0) + (scorecard.totalPerdas || 0)} deals total`);
    setTextSafe('rep-revenue', formatMoney(scorecard.netGerado || 0)); // ✅ USA NET
    setTextSafe('rep-revenue-detail', `${scorecard.totalGanhos || 0} deals fechados`);
    setTextSafe('rep-cycle-win', (scorecard.cicloMedioWin || 0) + 'd');
    setTextSafe('rep-cycle-loss', (scorecard.cicloMedioLoss || 0) + 'd');
    setTextSafe('rep-avg-ticket', formatMoney(scorecard.ticketMedio || 0));
    setTextSafe('rep-ticket-detail', 'média por deal');
    
    // Pipeline - busca do window.DATA (não tem no scorecard)
    const pipeline = window.DATA?.pipeline || [];
    const pipelineDeals = pipeline.filter(d => d.Vendedor === sellerName);
    const pipelineValue = pipelineDeals.reduce((sum, d) => sum + (parseFloat(d.Net) || 0), 0); // ✅ USA NET
    setTextSafe('rep-pipeline', formatMoney(pipelineValue));
    setTextSafe('rep-pipeline-detail', `${pipelineDeals.length} deals ativos`);
    
    // Aplica cores ao Win Rate
    const wrElement = document.getElementById('rep-winrate');
    const winRate = perf.winRate || 0;
    if (winRate >= 30) wrElement.className = 'kpi-value val-green';
    else if (winRate >= 15) wrElement.className = 'kpi-value val-warning';
    else wrElement.className = 'kpi-value val-red';
    
    // ============================================================================
    // DIAGNÓSTICO COMPORTAMENTAL
    // ============================================================================
    setTextSafe('rep-win-factor', comportamento.principalFatorSucesso || 'Dados insuficientes');
    setTextSafe('rep-loss-cause', comportamento.principalCausaPerda || 'Dados insuficientes');
    
    // Recomendações baseadas em IA
    const recommendations = generateSellerRecommendations(
      winRate, 
      scorecard.cicloMedioWin || 0, 
      scorecard.cicloMedioLoss || 0, 
      pipelineDeals.length,
      scorecard.netGerado || 0 // ✅ USA NET
    );
    document.getElementById('rep-recommendations').innerHTML = recommendations.map((r, i) => 
      `<div style="margin-bottom: 8px; padding-left: 16px; border-left: 3px solid ${i === 0 ? 'var(--primary-cyan)' : 'rgba(255,255,255,0.2)'};">
        ${r}
      </div>`
    ).join('');
    
    // ============================================================================
    // CARREGA EVOLUÇÃO TEMPORAL
    // ============================================================================
    loadSellerTimeline(sellerName);
    
    // ============================================================================
    // CARREGA TOP DEALS
    // ============================================================================
    loadSellerTopDeals(sellerName, year, quarter);
    
    hideLoading();
    
  } catch (error) {
    console.error('[SELLER] Erro ao carregar dados:', error);
    hideLoading();
    detailsDiv.innerHTML = `
      <div class="ai-card" style="text-align: center; padding: 40px;">
        <svg class="icon" style="color: var(--danger); font-size: 48px;"><use href="#icon-alert"/></svg>
        <h4 style="color: var(--danger); margin-top: 16px;">Erro ao carregar dados do vendedor</h4>
        <p style="color: var(--text-gray); margin-top: 8px;">${error.message}</p>
        <button onclick="showRepDetails()" style="
          margin-top: 20px;
          padding: 10px 20px;
          background: var(--primary-cyan);
          color: var(--bg-primary);
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">Tentar Novamente</button>
      </div>
    `;
  }
}

// ============================================================================
// EVOLUÇÃO TEMPORAL DO VENDEDOR
// ============================================================================
async function loadSellerTimeline(sellerName) {
  const container = document.getElementById('rep-timeline');
  container.innerHTML = '<div class="loading" style="text-align: center; padding: 20px;">📊 Carregando evolução temporal...</div>';
  
  try {
    const response = await fetch(
      `${window.API_BASE_URL}/api/seller-timeline/${encodeURIComponent(sellerName)}?quarters=4`
    );
    
    if (!response.ok) {
      throw new Error('Erro ao buscar timeline');
    }
    
    const data = await response.json();
    
    if (!data.success || !data.timeline || data.timeline.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-gray); padding: 20px;">Histórico insuficiente para análise temporal</p>';
      return;
    }
    
    const timeline = data.timeline;
    const mediaTime = data.media_time || {};
    
    // Encontra melhor e pior quarter
    const ipvs = timeline.map(t => t.ipv);
    const maxIPV = Math.max(...ipvs);
    const minIPV = Math.min(...ipvs);
    const bestQuarter = timeline.find(t => t.ipv === maxIPV);
    const worstQuarter = timeline.find(t => t.ipv === minIPV);
    
    // Renderiza timeline
    let html = '<div style="display: grid; gap: 16px;">';
    
    // Header com resumo
    html += `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px;">
        <div>
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Média do Período</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--primary-cyan);">${mediaTime.ipv || 0}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Melhor Quarter</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--success);">${bestQuarter.quarter}: ${bestQuarter.ipv}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: var(--text-gray); margin-bottom: 4px;">Pior Quarter</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--danger);">${worstQuarter.quarter}: ${worstQuarter.ipv}</div>
        </div>
      </div>
    `;
    
    // Timeline visual
    html += '<div style="display: grid; gap: 12px;">';
    timeline.reverse().forEach(t => {
      const ipvColor = t.ipv >= 50 ? 'var(--success)' : t.ipv >= 30 ? 'var(--warning)' : 'var(--danger)';
      const isBest = t.ipv === maxIPV;
      const isWorst = t.ipv === minIPV;
      
      html += `
        <div style="padding: 12px 16px; background: rgba(255,255,255,0.05); border-radius: 8px; border-left: 4px solid ${ipvColor}; ${isBest ? 'box-shadow: 0 0 12px rgba(0,255,150,0.3);' : isWorst ? 'box-shadow: 0 0 12px rgba(255,80,80,0.3);' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: ${ipvColor};">
                ${t.quarter} ${isBest ? '🏆' : isWorst ? '⚠️' : ''}
              </div>
              <div style="font-size: 11px; color: var(--text-gray); margin-top: 4px;">
                Resultado: ${t.resultado || 0} | Eficiência: ${t.eficiencia || 0} | Comportamento: ${t.comportamento || 0}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 24px; font-weight: 900; color: ${ipvColor};">${t.ipv}</div>
              <div style="font-size: 11px; color: var(--text-gray);">${formatMoney(t.netGerado || 0)}</div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div></div>';
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('[TIMELINE] Erro:', error);
    container.innerHTML = `<p style="text-align: center; color: var(--danger); padding: 20px;">⚠ Erro ao carregar evolução temporal</p>`;
  }
}

// ============================================================================
// TOP DEALS DO VENDEDOR
// ============================================================================
async function loadSellerTopDeals(sellerName, year, quarter) {
  const container = document.getElementById('rep-top-deals');
  container.innerHTML = '<div class="loading" style="text-align: center; padding: 20px;"><svg class="icon"><use href="#icon-briefcase"/></svg> Carregando top deals...</div>';
  
  try {
    // Monta query string (year e quarter podem ser null)
    let queryParams = ['top_n=5'];
    if (year) queryParams.push(`year=${year}`);
    if (quarter) queryParams.push(`quarter=${quarter}`);
    const queryString = '?' + queryParams.join('&');
    
    const response = await fetch(
      `${window.API_BASE_URL}/api/seller-deals/${encodeURIComponent(sellerName)}${queryString}`
    );
    
    if (!response.ok) {
      throw new Error('Erro ao buscar deals');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Resposta inválida da API');
    }
    
    const topWins = data.top_wins || [];
    const topLosses = data.top_losses || [];
    const pipelineHot = data.pipeline_hot || [];
    
    let html = '<div style="display: grid; gap: 20px;">';
    
    // TOP WINS
    html += `
      <div>
        <h5 style="margin: 0 0 12px 0; color: var(--success); font-size: 14px;">
          ✓ Top 5 Deals Ganhos (por NET)
        </h5>
        <div style="display: grid; gap: 8px;">
    `;
    
    if (topWins.length === 0) {
      html += '<p style="color: var(--text-gray); font-size: 13px;">Nenhum deal ganho no período</p>';
    } else {
      topWins.forEach((deal, i) => {
        html += `
          <div style="display: flex; justify-content: space-between; padding: 10px 16px; background: rgba(0,255,150,0.05); border-radius: 8px; border-left: 3px solid var(--success);">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${i + 1}. ${deal.nome || 'Deal sem nome'}</div>
              <div style="font-size: 11px; color: var(--text-gray); margin-top: 2px;">
                ${deal.ciclo_dias || 0} dias | ${deal.motivo || 'Sem motivo'}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: var(--success);">${formatMoney(deal.net || 0)}</div>
              <div style="font-size: 10px; color: var(--text-gray);">NET</div>
            </div>
          </div>
        `;
      });
    }
    
    html += '</div></div>';
    
    // TOP LOSSES
    html += `
      <div>
        <h5 style="margin: 0 0 12px 0; color: var(--danger); font-size: 14px;">
          ✖ Top 5 Deals Perdidos (por valor potencial)
        </h5>
        <div style="display: grid; gap: 8px;">
    `;
    
    if (topLosses.length === 0) {
      html += '<p style="color: var(--text-gray); font-size: 13px;">Nenhum deal perdido no período</p>';
    } else {
      topLosses.forEach((deal, i) => {
        html += `
          <div style="display: flex; justify-content: space-between; padding: 10px 16px; background: rgba(255,80,80,0.05); border-radius: 8px; border-left: 3px solid var(--danger);">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">
                ${i + 1}. ${deal.nome || 'Deal sem nome'}
                ${deal.evitavel === 'Sim' ? '<span style="margin-left: 6px; padding: 2px 6px; background: rgba(255,180,0,0.2); border-radius: 4px; font-size: 10px; color: var(--warning);">EVITÁVEL</span>' : ''}
              </div>
              <div style="font-size: 11px; color: var(--text-gray); margin-top: 2px;">
                ${deal.ciclo_dias || 0} dias | ${deal.motivo || 'Sem motivo'}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: var(--danger);">${formatMoney(deal.gross_potencial || 0)}</div>
              <div style="font-size: 10px; color: var(--text-gray);">POTENCIAL</div>
            </div>
          </div>
        `;
      });
    }
    
    html += '</div></div>';
    
    // PIPELINE HOT
    html += `
      <div>
        <h5 style="margin: 0 0 12px 0; color: var(--primary-cyan); font-size: 14px;">
          <svg class="icon"><use href="#icon-fire"/></svg> Pipeline Hot (NET × Confiança)
        </h5>
        <div style="display: grid; gap: 8px;">
    `;
    
    if (pipelineHot.length === 0) {
      html += '<p style="color: var(--text-gray); font-size: 13px;">Nenhum deal quente no pipeline</p>';
    } else {
      pipelineHot.forEach((deal, i) => {
        html += `
          <div style="display: flex; justify-content: space-between; padding: 10px 16px; background: rgba(0,190,255,0.05); border-radius: 8px; border-left: 3px solid var(--primary-cyan);">
            <div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${i + 1}. ${deal.nome || 'Deal sem nome'}</div>
              <div style="font-size: 11px; color: var(--text-gray); margin-top: 2px;">
                ${deal.stage || 'Stage?'} | ${deal.confianca || 0}% confiança
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: var(--primary-cyan);">${formatMoney(deal.expected_value || 0)}</div>
              <div style="font-size: 10px; color: var(--text-gray);">EXPECTED</div>
            </div>
          </div>
        `;
      });
    }
    
    html += '</div></div></div>';
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('[TOP DEALS] Erro:', error);
    container.innerHTML = `<p style="text-align: center; color: var(--danger); padding: 20px;">⚠ Erro ao carregar top deals</p>`;
  }
}

// Atualiza function generateSellerRecommendations para aceitar NET
function generateSellerRecommendations(winRate, cycleWin, cycleLoss, pipelineCount, netGerado = 0) {
  const recommendations = [];
  
  // Alerta de NET negativo (NET gate)
  if (netGerado <= 0) {
    recommendations.push('<svg class="icon" style="color:var(--danger)"><use href="#icon-alert"/></svg> <strong>NET Negativo Detectado:</strong> Priorize deals com rentabilidade positiva. IPV limitado a 20 até reverter situação.');
  }
  
  if (winRate < 15) {
    recommendations.push('<svg class="icon"><use href="#icon-target"/></svg> <strong>Win Rate Crítico:</strong> Revisar qualificação de leads (MEDDIC) e focar em deals com maior fit');
  } else if (winRate < 30) {
    recommendations.push('⚠ <strong>Win Rate Abaixo da Meta:</strong> Implementar follow-ups estruturados e revisão de proposta com gestão');
  } else {
    recommendations.push('✓ <strong>Win Rate Saudável:</strong> Manter cadência atual e focar em aumentar ticket médio');
  }
  
  if (cycleWin > 60) {
    recommendations.push('⏱️ <strong>Ciclo de Venda Longo:</strong> Acelerar negociação com POC rápido e envolvimento de champions');
  } else if (cycleWin > 30) {
    recommendations.push('<svg class="icon"><use href="#icon-trending-up"/></svg> <strong>Ciclo Moderado:</strong> Otimizar reuniões de discovery e reduzir tempo de resposta');
  }
  
  if (pipelineCount < 5) {
    recommendations.push('📊 <strong>Pipeline Baixo:</strong> Intensificar prospecção e qualificação de novos leads');
  } else if (pipelineCount > 15) {
    recommendations.push('<svg class="icon"><use href="#icon-target"/></svg> <strong>Pipeline Saturado:</strong> Priorizar top deals e desqualificar oportunidades de baixa probabilidade');
  }
  
  if (cycleLoss > cycleWin * 3) {
    recommendations.push('<svg class="icon" style="color:var(--error)"><use href="#icon-alert"/></svg> <strong>Desqualificação Tardia:</strong> Aplicar MEDDIC nas primeiras reuniões para evitar desgaste em deals sem fit');
  }
  
  return recommendations;
}

// Função auxiliar para encontrar o item mais frequente
function getMostFrequent(arr) {
  if (!arr || arr.length === 0) return null;
  const frequency = {};
  arr.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1;
  });
  return Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
}

// Carrega comparação entre todos os vendedores
function loadSellersComparison() {
  log('[SELLERS] Carregando comparação...');
  
  const detailsDiv = document.getElementById('rep-details');
  const comparisonDiv = document.getElementById('sellers-comparison');
  
  // Esconde detalhes individuais
  detailsDiv.style.display = 'none';
  comparisonDiv.style.display = 'block';
  
  // Reseta seletor
  document.getElementById('rep-selector').value = '';
  
  const closedWon = window.DATA?.closed_won || [];
  const closedLost = window.DATA?.closed_lost || [];
  
  // Agrupa por vendedor
  const sellersMap = {};
  
  [...closedWon, ...closedLost].forEach(deal => {
    const seller = deal.Vendedor;
    if (!seller) return;
    
    if (!sellersMap[seller]) {
      sellersMap[seller] = { wins: 0, losses: 0, revenue: 0, cycleWinSum: 0, cycleLossSum: 0 };
    }
    
    if (closedWon.includes(deal)) {
      sellersMap[seller].wins++;
      sellersMap[seller].revenue += parseFloat(deal.Net) || 0; // ✅ USA NET
      sellersMap[seller].cycleWinSum += parseInt(deal.Ciclo_dias) || 0;
    } else {
      sellersMap[seller].losses++;
      sellersMap[seller].cycleLossSum += parseInt(deal.Ciclo_dias) || 0;
    }
  });
  
  // Calcula métricas finais
  const sellersArray = Object.keys(sellersMap).map(name => {
    const data = sellersMap[name];
    const total = data.wins + data.losses;
    const winRate = total > 0 ? Math.round((data.wins / total) * 100) : 0;
    const avgCycleWin = data.wins > 0 ? Math.round(data.cycleWinSum / data.wins) : 0;
    const avgTicket = data.wins > 0 ? data.revenue / data.wins : 0;
    
    return { name, ...data, total, winRate, avgCycleWin, avgTicket };
  });
  
  // Grid de cards
  const gridHtml = sellersArray.map(seller => {
    const wrClass = seller.winRate >= 30 ? 'val-green' : seller.winRate >= 15 ? 'val-warning' : 'val-red';
    
    return `<div class="kpi-card">
      <div style="font-size: 14px; font-weight: 700; color: var(--primary-cyan); margin-bottom: 12px;">${seller.name}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
        <div><span style="color: var(--text-gray);">Win Rate:</span> <strong class="${wrClass}">${seller.winRate}%</strong></div>
        <div><span style="color: var(--text-gray);">Revenue:</span> <strong class="val-cyan">${formatMoney(seller.revenue)}</strong></div>
        <div><span style="color: var(--text-gray);">Ganhos:</span> <strong class="val-green">${seller.wins}</strong></div>
        <div><span style="color: var(--text-gray);">Ciclo:</span> <strong>${seller.avgCycleWin}d</strong></div>
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('sellers-grid').innerHTML = gridHtml;
  
  // Rankings
  const byWinRate = [...sellersArray].sort((a, b) => b.winRate - a.winRate);
  const byRevenue = [...sellersArray].sort((a, b) => b.revenue - a.revenue);
  
  const rankingWRHtml = byWinRate.map((s, i) => {
    const wrClass = s.winRate >= 30 ? 'val-green' : s.winRate >= 15 ? 'val-warning' : 'val-red';
    return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <span><strong style="color: var(--primary-cyan);">#${i + 1}</strong> ${s.name}</span>
      <span class="${wrClass}" style="font-weight: 700;">${s.winRate}%</span>
    </div>`;
  }).join('');
  
  const rankingRevHtml = byRevenue.map((s, i) => {
    return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <span><strong style="color: var(--success);">#${i + 1}</strong> ${s.name}</span>
      <span class="val-cyan" style="font-weight: 700;">${formatMoney(s.revenue)}</span>
    </div>`;
  }).join('');
  
  document.getElementById('ranking-winrate').innerHTML = rankingWRHtml;
  document.getElementById('ranking-revenue').innerHTML = rankingRevHtml;
  
  log('[SELLERS] ✓ Comparação carregada:', sellersArray.length, 'vendedores');
}

// ============================================================================
// PAUTA SEMANAL - FUNÇÕES (ATUALIZADO PARA USAR API COM RAG)
// ============================================================================

// Carrega agenda semanal usando nova API /api/weekly-agenda
