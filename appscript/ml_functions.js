// ============================================================================
// FUNÇÕES ML INTELLIGENCE para Dashboard.html
// ============================================================================

// Função de log (wrapper para console.log)
const log = (...args) => console.log(...args);

// Variável global para armazenar dados ML
let ML_DATA = null;

// Função para carregar predições ML do servidor
function loadMLPredictions() {
  log('[ML] Carregando predições de Machine Learning...');
  
  document.getElementById('ml-content-area').innerHTML = '<div class="loading">🤖 Carregando predições de Machine Learning...</div>';
  
  google.script.run
    .withSuccessHandler(function(response) {
      try {
        log('[ML] Resposta recebida:', typeof response);
        ML_DATA = typeof response === 'string' ? JSON.parse(response) : response;
        log('[ML] ✅ Dados ML carregados:', {
          previsaoCiclo: ML_DATA.previsao_ciclo?.enabled,
          classificadorPerda: ML_DATA.classificador_perda?.enabled,
          riscoAbandono: ML_DATA.risco_abandono?.enabled,
          performanceVendedor: ML_DATA.performance_vendedor?.enabled,
          prioridadeDeals: ML_DATA.prioridade_deals?.enabled,
          proximaAcao: ML_DATA.proxima_acao?.enabled
        });
        
        // Renderiza tab ativa (Previsão de Ciclo por padrão)
        switchMLTab('previsao-ciclo');
      } catch (error) {
        console.error('[ML] ❌ Erro ao processar dados:', error);
        document.getElementById('ml-content-area').innerHTML = `
          <div class="ai-card" style="background: linear-gradient(135deg, rgba(225,72,73,0.1) 0%, rgba(28,43,62,1) 100%); border-color: var(--danger);">
            <h2 style="color: var(--danger);">❌ Erro ao Carregar Modelos ML</h2>
            <p>Não foi possível carregar as predições de Machine Learning.</p>
            <p style="font-size: 12px; opacity: 0.7;">Erro: ${error.message}</p>
          </div>
        `;
      }
    })
    .withFailureHandler(function(error) {
      console.error('[ML] ❌ Falha na chamada:', error);
      document.getElementById('ml-content-area').innerHTML = `
        <div class="ai-card" style="background: linear-gradient(135deg, rgba(225,72,73,0.1) 0%, rgba(28,43,62,1) 100%); border-color: var(--danger);">
          <h2 style="color: var(--danger);">❌ Erro ao Carregar Modelos ML</h2>
          <p>Falha na comunicação com o servidor.</p>
          <p style="font-size: 12px; opacity: 0.7;">${error.message}</p>
        </div>
      `;
    })
    .getMLPredictions();
}

// Função para trocar tabs ML
function switchMLTab(tabName) {
  log('[ML] Trocando para tab:', tabName);
  
  // Remove active de todos os botões
  document.querySelectorAll('.ml-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.style.color = 'var(--text-gray)';
    tab.style.borderBottom = '3px solid transparent';
  });
  
  // Adiciona active ao botão clicado
  const activeTab = document.querySelector(`.ml-tab[data-tab="${tabName}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.color = 'var(--primary-cyan)';
    activeTab.style.borderBottom = '3px solid var(--primary-cyan)';
  }
  
  // Renderiza conteúdo da tab
  if (!ML_DATA) {
    document.getElementById('ml-content-area').innerHTML = '<div class="loading">Carregando dados...</div>';
    return;
  }
  
  switch(tabName) {
    case 'previsao-ciclo':
      renderPrevisaoCiclo();
      break;
    case 'classificador-perda':
      renderClassificadorPerda();
      break;
    case 'risco-abandono':
      renderRiscoAbandono();
      break;
    case 'performance-vendedor':
      renderPerformanceVendedor();
      break;
    case 'prioridade-deals':
      renderPrioridadeDeals();
      break;
    case 'proxima-acao':
      renderProximaAcao();
      break;
  }
}

// Renderizar Previsão de Ciclo
function renderPrevisaoCiclo() {
  const data = ML_DATA.previsao_ciclo;
  
  if (!data || !data.enabled) {
    document.getElementById('ml-content-area').innerHTML = `
      <div class="ai-card" style="background: linear-gradient(135deg, rgba(255,165,0,0.1) 0%, rgba(28,43,62,1) 100%); border-color: var(--warning);">
        <h2 style="color: var(--warning);">⚠️ Modelo Não Disponível</h2>
        <p>O modelo de Previsão de Ciclo ainda não foi treinado no BigQuery.</p>
      </div>
    `;
    return;
  }
  
  const summary = data.summary || {};
  const deals = data.deals || [];
  
  let html = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">Deals Analisados</div>
        <div class="kpi-value val-cyan">${data.total_deals || 0}</div>
        <div class="kpi-subtitle">Predições ativas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Ciclo Médio Previsto</div>
        <div class="kpi-value val-cyan">${Math.round(summary.avg_dias_previstos || 0)}d</div>
        <div class="kpi-subtitle">Dias até fechamento</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">⚡ Rápidos (≤30d)</div>
        <div class="kpi-value val-green">${summary.rapidos || 0}</div>
        <div class="kpi-subtitle">Alta velocidade</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">🐢 Lentos (>60d)</div>
        <div class="kpi-value val-warning">${(summary.lentos || 0) + (summary.muito_lentos || 0)}</div>
        <div class="kpi-subtitle">Precisam aceleração</div>
      </div>
    </div>
    
    <h4>⏱️ Top 15 Deals com Ciclo mais Lento Previsto</h4>
    <table>
      <thead>
        <tr>
          <th>Deal</th>
          <th>Vendedor</th>
          <th>Valor (Gross)</th>
          <th>Dias Previstos</th>
          <th>Velocidade</th>
          <th>Fase Atual</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Ordenar por dias previstos (maior primeiro)
  const sortedDeals = [...deals].sort((a, b) => (b.dias_previstos || 0) - (a.dias_previstos || 0)).slice(0, 15);
  
  sortedDeals.forEach(deal => {
    const veloClass = deal.velocidade_prevista === 'MUITO_LENTO' ? 'val-red' : 
                     deal.velocidade_prevista === 'LENTO' ? 'val-warning' : 
                     deal.velocidade_prevista === 'RÁPIDO' ? 'val-green' : 'val-cyan';
    
    html += `
      <tr>
        <td style="font-weight: 600;">${deal.opportunity || 'N/A'}</td>
        <td>${deal.Vendedor || 'N/A'}</td>
        <td style="font-weight: 600;">${formatMoney(deal.Gross_Value || 0)}</td>
        <td class="${veloClass}" style="font-weight: 700;">${Math.round(deal.dias_previstos || 0)}d</td>
        <td><span class="badge badge-${deal.velocidade_prevista === 'RÁPIDO' ? 'success' : deal.velocidade_prevista === 'NORMAL' ? 'warning' : 'danger'}">${deal.velocidade_prevista || 'N/A'}</span></td>
        <td style="font-size: 12px;">${deal.Fase_Atual || 'N/A'}</td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  document.getElementById('ml-content-area').innerHTML = html;
}

// NOTE: As outras 5 funções render (renderClassificadorPerda, renderRiscoAbandono, 
// renderPerformanceVendedor, renderPrioridadeDeals, renderProximaAcao) seguem padrão similar.
// Por brevidade, foram omitidas deste arquivo exemplo.
// O código completo está no Dashboard.html
