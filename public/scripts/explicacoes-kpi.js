// Explicações dos KPIs: dicionários e lógica de badges informativos
const KPI_CARD_EXPLANATIONS = {
  'exec-pipeline-year-total': 'Pipeline total consolidado do período (gross), com contagem de deals e visão net no subtítulo.',
  'exec-pipeline-total': 'Pipeline aberto no recorte filtrado (gross), atualizado a partir dos filtros ativos.',
  'exec-forecast-weighted': 'Previsão ponderada = Pipeline (gross) × Confiança média da IA.',
  'exec-above50-value': 'Soma do gross dos deals com confiança da IA maior ou igual a 50%.',
  'exec-active-reps': 'Quantidade de vendedores ativos no recorte atual, com Win Rate consolidado no subtítulo.',
  'exec-closed-quarter': 'Total fechado no quarter (gross), com net e número de deals no subtítulo.',
  'exec-conversion-rate': 'Taxa de conversão = Ganhas ÷ (Ganhas + Perdidas) no período analisado.',
  'exec-loss-rate': 'Taxa de perda = Perdidas ÷ (Ganhas + Perdidas) no período analisado.',
  'exec-cycle-efficiency': 'Eficiência de ciclo compara o tempo médio de ganho versus perda para indicar velocidade comercial.',
  'exec-ss-total': 'Total curado pelo Sales Specialist (gross), incluindo net e quantidade de deals curados.',
  'exec-ss-coverage': 'Taxa de curadoria = Valor curado pelo Sales Specialist ÷ Valor total do pipeline.',
  'exec-ss-ticket': 'Ticket médio da curadoria = Total curado ÷ Número de deals curados.',
  'exec-ss-top-seller': 'Vendedor com maior volume curado dentro da base de curadoria manual.',
  'exec-top5-total-card': 'Top 5 oportunidades por maior valor bruto no pipeline aberto.',
  'exec-top5-confidence-card': 'Top 5 oportunidades por confiança da IA no pipeline aberto.',
  'exec-top5-weighted-card': 'Top 5 oportunidades por valor ponderado (gross × confiança).'
};

const KPI_TITLE_EXPLANATIONS = {
  'taxa de curadoria': 'Taxa de curadoria = Valor curado pelo Sales Specialist ÷ Valor total do pipeline.',
  'ticket medio': 'Ticket médio = Valor total da base do card ÷ Quantidade de deals da mesma base.',
  'taxa de conversao': 'Taxa de conversão = Ganhas ÷ (Ganhas + Perdidas).',
  'taxa de perda': 'Taxa de perda = Perdidas ÷ (Ganhas + Perdidas).',
  'previsao ponderada': 'Previsão ponderada = Valor do pipeline × confiança/probabilidade média.',
  'deals com 50%': 'Total de deals com confiança da IA maior ou igual a 50%.',
  'total curado': 'Soma dos deals que passaram por curadoria manual (Sales Specialist).',
  'top vendedor': 'Vendedor com maior volume agregado na base exibida pelo card.',
  'acuracia': 'Acurácia = previsões corretas ÷ total de previsões avaliadas.'
};

let kpiCardInfoObserver = null;
let kpiCardInfoRefreshTimer = null;

const normalizeKpiLabel = (label) => {
  if (!label) return '';
  return String(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .trim()
    .toLowerCase();
};

const buildKpiCardJustification = (card, titleText) => {
  const explicit = card.getAttribute('data-kpi-help');
  if (explicit) return explicit;

  if (card.id && KPI_CARD_EXPLANATIONS[card.id]) {
    return KPI_CARD_EXPLANATIONS[card.id];
  }

  const normalizedTitle = normalizeKpiLabel(titleText);
  if (normalizedTitle && KPI_TITLE_EXPLANATIONS[normalizedTitle]) {
    return KPI_TITLE_EXPLANATIONS[normalizedTitle];
  }

  const subtitles = Array.from(card.querySelectorAll('.kpi-subtitle'))
    .map((node) => (node.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 2);

  if (subtitles.length > 0) {
    return `${titleText}: ${subtitles.join(' · ')}`;
  }

  return `${titleText}: cálculo consolidado automaticamente a partir dos dados da seção e filtros ativos.`;
};

function attachInfoBadgeToKpiCard(card) {
  if (!card || !(card instanceof HTMLElement)) return;

  const titleEl = card.querySelector('.kpi-title');
  if (!titleEl) return;

  const titleText = (titleEl.textContent || '').replace(/\s*i\s*$/i, '').trim() || 'Métrica';
  const tooltipText = buildKpiCardJustification(card, titleText);

  let badge = titleEl.querySelector('.card-info-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'card-info-badge';
    badge.innerText = 'i';
    badge.tabIndex = 0;
    badge.setAttribute('role', 'button');

    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      badge.classList.toggle('is-open');
    });

    badge.addEventListener('blur', () => {
      badge.classList.remove('is-open');
    });

    badge.addEventListener('mouseleave', () => {
      badge.classList.remove('is-open');
    });

    titleEl.appendChild(badge);
  }

  badge.setAttribute('data-tooltip', tooltipText);
  badge.setAttribute('aria-label', `Como calculamos ${titleText}`);
  badge.setAttribute('title', tooltipText);
}

function enhanceAllKpiCards(root = document) {
  const cards = root.querySelectorAll('.kpi-card');
  cards.forEach(attachInfoBadgeToKpiCard);
}

function initKpiCardInfoObserver() {
  if (kpiCardInfoObserver || !document.body) return;

  kpiCardInfoObserver = new MutationObserver((mutations) => {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList?.contains('kpi-card') || node.querySelector?.('.kpi-card')) {
          shouldRefresh = true;
          break;
        }
      }
      if (shouldRefresh) break;
    }

    if (!shouldRefresh) return;
    clearTimeout(kpiCardInfoRefreshTimer);
    kpiCardInfoRefreshTimer = setTimeout(() => enhanceAllKpiCards(document), 80);
  });

  kpiCardInfoObserver.observe(document.body, { childList: true, subtree: true });
}

const showToast = (message, type = 'info') => {
  const id = 'toast-container';
  let container = document.getElementById(id);
  if (!container) {
    container = document.createElement('div');
    container.id = id;
    container.style.position = 'fixed';
    container.style.right = '16px';
    container.style.bottom = '16px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const colors = {
    info: '#00BEFF',
    success: '#C0FF7D',
    warning: '#FFA500',
    error: '#E14849'
  };
  const color = colors[type] || colors.info;
  toast.style.background = 'rgba(15, 23, 42, 0.95)';
  toast.style.border = `1px solid ${color}`;
  toast.style.color = '#fff';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '10px';
  toast.style.fontSize = '12px';
  toast.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
};

const setBarSafe = (id, width, text) => {
  const el = document.getElementById(id);
  if (el) {
    el.style.width = width + '%';
    el.innerText = text;
  } else {
    console.warn(`Elemento de barra não encontrado: ${id}`);
  }
};

// Helper para valores seguros (movido para escopo global)
const safe = (obj, path, defaultVal = 0) => {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current && current[key] !== undefined) {
      current = current[key];
    } else {
      return defaultVal;
    }
  }
  return current;
};

// Helper para limpar possíveis JSONs da IA
const cleanAIResponse = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.trim();
  
  // Se começa com { e termina com }, tenta extrair JSON
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      // Tenta fazer parse do JSON
      const parsed = JSON.parse(cleaned);
      
      // Se é um objeto simples com 1 campo, pega o valor
      const keys = Object.keys(parsed);
      if (keys.length === 1) {
        cleaned = parsed[keys[0]];
        log(`✂️ Frontend: JSON extraído da chave "${keys[0]}"`);
      } else {
        // Se tem múltiplas chaves, tenta pegar campos comuns
        cleaned = parsed.resumo_executivo || 
                  parsed.paragrafo_executivo || 
                  parsed.summary_html || 
                  parsed.resumo_semanal_html ||
                  parsed.resumo_semanal_cro ||
                  parsed.html || 
                  parsed.content || 
                  parsed.texto ||
                  cleaned;
        log(`✂️ Frontend: JSON extraído de objeto com ${keys.length} campos`);
      }
    } catch (e) {
      log(`⚠ Frontend: JSON malformado, usando regex: ${e.message}`);
    }
  }
  
  // Aplica limpeza múltiplas vezes para garantir remoção completa (fallback)
  for (let i = 0; i < 3; i++) {
    // { "campo": "valor" } -> valor (padrão completo)
    cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*"([^"]*)"\s*\}\s*$/s, '$1');
    
    // { "campo": "valor... -> valor...
    cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*"/, '');
    
    // ..." } -> ...
    cleaned = cleaned.replace(/"\s*\}\s*$/, '');
    
    // { "campo": (sem aspas no valor)
    cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*/, '');
    
    // } no final
    cleaned = cleaned.replace(/\s*\}\s*$/, '');
  }
  
  // Remove escapes e converte quebras
  cleaned = cleaned.replace(/\\n/g, '\n');
  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\\'/g, "'");
  cleaned = cleaned.replace(/\n/g, '<br>');
  
  return cleaned.trim();
};

