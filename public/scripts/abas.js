// Controle de abas: switchExecTab, toggleAIAnalysis, toggleExecutiveAnalysis
function switchExecTab(tabName) {
  console.log('[TAB] Trocando para tab:', tabName);
  
  // Remove active de todos os botões
  document.querySelectorAll('.exec-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.style.color = 'var(--text-gray)';
    tab.style.borderBottom = '3px solid transparent';
  });
  
  // Remove active de todos os conteúdos
  document.querySelectorAll('.exec-tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  
  // Adiciona active ao botão clicado
  const activeTab = document.querySelector(`.exec-tab[data-tab="${tabName}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.color = 'var(--primary-cyan)';
    activeTab.style.borderBottom = '3px solid var(--primary-cyan)';
  }
  
  // Adiciona active ao conteúdo correspondente
  const activeContent = document.querySelector(`.exec-tab-content[data-content="${tabName}"]`);
  if (activeContent) {
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
  }
}

// Função para expandir/colapsar análise de IA
function toggleAIAnalysis() {
  const analysisContent = document.getElementById('exec-top-opps-ai-analysis');
  const chevron = document.getElementById('ai-analysis-chevron');
  
  if (analysisContent && chevron) {
    if (analysisContent.style.display === 'none') {
      analysisContent.style.display = 'block';
      chevron.style.transform = 'rotate(0deg)';
    } else {
      analysisContent.style.display = 'none';
      chevron.style.transform = 'rotate(-90deg)';
    }
  }
}

// AI Strategy Slide Panel — open / close
function openAIPanel() {
  var panel = document.getElementById('ai-strategy-panel');
  var overlay = document.getElementById('ai-strategy-overlay');
  if (panel) panel.classList.add('open');
  if (overlay) overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeAIPanel() {
  var panel = document.getElementById('ai-strategy-panel');
  var overlay = document.getElementById('ai-strategy-overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// Backward-compat alias (called by any legacy references)
function toggleExecutiveAnalysis() { openAIPanel(); }

// Função para atualizar métricas do Dashboard Executivo usando dados da API /api/metrics
