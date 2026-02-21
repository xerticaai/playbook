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

// Função para expandir/colapsar Analise Estrategica (IA)
function toggleExecutiveAnalysis() {
  const content = document.getElementById('executive-content');
  const label = document.getElementById('executive-toggle-label');
  const caret = document.getElementById('executive-toggle-caret');

  if (!content || !label || !caret) return;

  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  label.textContent = isHidden ? 'Ocultar' : 'Expandir';
  caret.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

// Função para atualizar métricas do Dashboard Executivo usando dados da API /api/metrics
