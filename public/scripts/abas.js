// Controle de abas: switchExecTab, toggleAIAnalysis
function switchExecTab(tabName) {
  console.log('[TAB] Trocando para tab:', tabName);

  const mode = window.execDisplayMode || 'booking_gross';
  const isNetRevenueMode = (mode === 'net');
  if (tabName === 'resumo-quarter' && !isNetRevenueMode) {
    tabName = 'resumo';
  }
  
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

  if (tabName === 'resumo-quarter' && typeof window.loadQuarterSummary === 'function') {
    window.loadQuarterSummary();
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

// AI Strategy Slide Panel — removido; análise agora vive na aba "Análise IA"
// Stubs mantidos para compatibilidade com quaisquer referências legadas
function openAIPanel() {
  // redireciona para a aba de análise IA
  switchExecTab('analise-ia');
}

function closeAIPanel() {
  // no-op — painel slide removido
}

// Backward-compat alias
function toggleExecutiveAnalysis() { switchExecTab('analise-ia'); }

// Função para atualizar métricas do Dashboard Executivo usando dados da API /api/metrics
