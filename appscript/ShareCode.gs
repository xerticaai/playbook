/**
 * @fileoverview ANALISADOR DE VENDAS & MOTOR DE GOVERNANÇA GTM (VERSÃO 52.0 - DISTRIBUIÇÃO PROPORCIONAL MENSAL)
 * @author Arquiteto de Software Sênior - Especialista em Operações de Vendas
 * 
 * ================================================================================
 * MANIFESTO ARQUITETURAL
 * ================================================================================
 * 1. GOVERNANÇA ANTES DA IA: Portões rígidos determinísticos (Net > 0, Inatividade < 45d).
 * 2. MOTOR DE INATIVIDADE (DIAS): Identificação real de ociosidade vs. atividades agendadas.
 * 3. INTEGRIDADE DE PRODUTOS: Agregação por Deal Name com busca multidimensional de colunas.
 * 4. MEDDIC TRILÍNGUE + GOV: Suporte a termos em PT, EN, ES e marcos de Setor Público (TR/ARP/ETP).
 * 5. TAXONOMIA FISCAL: Rótulos fiscal quarter automáticos calculados dinamicamente pela data de fechamento.
 * 6. MAPEAMENTO DINÂMICO: Todas as abas são lidas via cabeçalho (sem índices fixos).
 * 7. PROTOCOLO DE ANÁLISE FORÇADA: Análise obrigatória de todos os deals para expor riscos de "CRM Vazio".
 * 
 * ================================================================================
 * ESTRUTURA DO CÓDIGO POR MODO DE ANÁLISE
 * ================================================================================
 * 
 * 📊 PIPELINE (OPEN) - Oportunidades Abertas:
 *    - Foco: Forecast, Governança, Próximas Ações
 *    - Hard Gates: Estagnação, Deal Desk, Governo, Net Zero
 *    - Análise IA: Categorização (COMMIT/UPSIDE/PIPELINE/OMITIDO)
 *    - Output: 44 colunas incluindo MEDDIC, BANT, Ciclo, Change Tracking, Anomalies, Velocity
 *    - Métrica Chave: "Dias Funil" = HOJE - CREATED DATE
 *    - Métrica Secundária: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 *    - Change Tracking: Total mudanças, críticas, close date, stage, valor
 *    - Anomalias: Detecta padrões suspeitos (múltiplos editores, mudanças excessivas, volatilidade)
 * 
 * ✅ GANHOS (WON) - Oportunidades Ganhas:
 *    - Foco: Fatores de Sucesso, Replicabilidade
 *    - Análise IA: Causa Raiz, Qualidade Engajamento, Gestão
 *    - Output: 39 colunas incluindo Lições Aprendidas
 *    - Métrica Chave: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 * 
 * ❌ PERDAS (LOST) - Oportunidades Perdidas:
 *    - Foco: Causas, Evitabilidade, Aprendizados
 *    - Análise IA: Causa Raiz, Sinais Alerta, Momento Crítico
 *    - Output: 39 colunas incluindo Evitável?, Causas Secundárias
 *    - Métrica Chave: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 * 
 * ================================================================================
 * CAMADAS DA ARQUITETURA
 * ================================================================================
 * 1. UI Layer: Menu do usuário, triggers, health checks
 * 2. Governança e Controle: Tick system, queue management
 * 3. Engine Layer: Processamento batch, hard gates, análise IA
 * 4. Prompt Generators: Construção de prompts específicos por modo
 * 5. Output Builders: Montagem de linhas de output por modo
 * 6. Utilities: Parsers, normalizadores, calculadores
 * 
 * @version 51.1
 */

// ================================================================================================
// --- CONFIGURAÇÕES GLOBAIS E IDENTIDADE DO PROJETO ---
// ================================================================================================


// ================================================================================================
// --- CONFIGURAÇÕES GLOBAIS, CONSTANTES E SCHEMAS COMPARTILHADOS ---
// ================================================================================================

const API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";

/** @constant {string} Identificador do modelo generativo (Gemini 2.5 Pro - GA, estável até junho 2026) */
const MODEL_ID = "gemini-2.5-pro"; 

/** @constant {array} Modelos de fallback caso o principal falhe (em ordem de prioridade) */
const FALLBACK_MODELS = [
  "gemini-2.5-flash",       // fallback primário: suporta thinkingBudget:0, rápido e barato
  "gemini-2.5-flash-lite"   // fallback leve para casos de quota esgotada
  // REMOVIDOS: gemini-1.5-* (desativados pela Google, retornam 404)
];

/** @constant {string} Nome do projeto GCP */
const PROJECT_NAME = "br-ventasbrasil-cld-01";

/** @constant {number} Registros por ciclo de processamento (aumentado para modo rápido) */
const BATCH_SIZE = 8; 

/** @constant {number} Tempo limite de segurança (4.5 min) para evitar timeout do GAS */
const TIME_BUDGET_MS = 4.5 * 60 * 1000; 

/** @constant {number} Intervalo em milissegundos para o próximo ciclo de execução */
const NEXT_TICK_MS = 1000 * 15; // 15 segundos para agilidade

/** @constant {string} Chave de lock para evitar execuções concorrentes do autosync */
const AUTO_SYNC_LOCK_KEY = "AUTO_SYNC_RUNNING";

/** @constant {number} Timeout do lock em ms (6 minutos - margem de segurança) */
const AUTO_SYNC_LOCK_TIMEOUT = 6 * 60 * 1000;

/** @constant {number} Milissegundos por dia (otimização) */
const MS_PER_DAY = 86400000;

/** @constant {number} Limite de logs de debug por função */
const MAX_DEBUG_LOGS = 3;

/** @constant {number} Limite máximo de batch size para segurança */
const BATCH_SIZE_LIMIT = 100;

/** @constant {string} Chave de armazenamento para Base de Clientes (Versionada) */
const BASE_CLIENTS_CACHE_KEY = "BASE_CLIENTS_GTM_V52";

/** @constant {RegExp} Regex pré-compilado para detecção de processos governamentais */
const GOV_REGEX = /\b(LICITACAO|PREGAO|EDITAL|UASG|PNCP|PORTAL DE COMPRAS|SISTEMA S)\b/;

/** Cache em memória por execução */
const SHEET_CACHE_ = {};

/** Cache de normalização de texto */
const NORM_TEXT_CACHE_ = {};

/** @constant {number} Tamanho máximo do cache de normalização */
const NORM_CACHE_MAX_SIZE = 1000;

const ACTIVE_SELLERS = [
  'GABRIEL LEICK', 
  'DENILSON GOES', 
  'CARLOS MOLL', 
  'LUCIANA FONSECA',
  'EMILIO GONCALVES', 
  'ALEXSANDRA JUNQUEIRA', 
  'ALEX ARAUJO',
  'GABRIELE OLIVEIRA', 
  'FABIO FERREIRA'
];

/**
 * Buffer de logs para escrita em lote
 */
let LOG_BUFFER_ = [];
const LOG_BUFFER_LIMIT = 100; // ✅ Aumentado de 10 → 100 para reduzir flushes frequentes

const STAGE_PROBABILITY = {
  "Qualificar": 10,
  "Avaliação": 20,
  "Proposta": 60,
  "Deal Desk": 65,
  "Negociação": 80,
  "Verificação": 95,
  "Fechamento": 100
};


const SHEETS = {
  PERDIDAS: "Historico_Perdidas",
  ALTERACOES_PERDIDAS: "Alteracoes_Oportunidade", 
  RESULTADO_PERDIDAS: "📉 Análise Perdidas",

  GANHAS: "Historico_Ganhos", 
  ALTERACOES_GANHAS: "Historico_Alteracoes_Ganhos",
  RESULTADO_GANHAS: "📈 Análise Ganhas",

  ABERTO: "Pipeline_Aberto",
  ALTERACOES_ABERTO: "Alteracoes_Oportunidade", 
  RESULTADO_PIPELINE: "🎯 Análise Forecast IA",

  ATIVIDADES: "Atividades",
  DICIONARIO: "📘 Dicionário de Dados",
  LOGS: "Logs_Execucao",
  INTEGRITY_OPEN: "🔐 Snapshot Integridade OPEN",
  EVENT_LOG: "📝 Event Log",
  INSPECTOR: "🔍 Inspector",
  
  // Aliases para compatibilidade (usado em diagnostic/validation)
  ANALISE_PIPELINE: "🎯 Análise Forecast IA",
  ANALISE_GANHAS: "📈 Análise Ganhas",
  ANALISE_PERDIDAS: "📉 Análise Perdidas",
  ANALYZE: "🎯 Análise Forecast IA"
};


const DATA_SCHEMA = {
  PIPELINE_ABERTO: [
    "Account Name", "Opportunity Name", "Opportunity Owner", "Created Date", "Close Date", 
    "Last Stage Change Date", "Last Activity Date", "Last Event Date", "Account: Last Activity", 
    "Inactive Days", "Proceso", "Product Name", "Total Price (converted)", "Margen Total $", "Net Revenue",
    "Margen de Lista %", "Portafolio", "Stage", "Stage Duration", "Probability (%)", "Lead Source", 
    "Primary Campaign Source", "DR", "Product Family", "Forecast", "Subsegmento de mercado", 
    "Subsidiaria", "Tipo De Oportunidad", "Description", "Descripción", "Tipo incentivo en google", 
    "Fiscal Period", "Portafolio Xertica.Ai", "Segmento Consolidado", "Last 7 Days Activities", 
    "Last 30 Days Activities", "Billing Address Line 1", "Billing City", "Billing State/Province", 
    "Billing Country", "Top deal", "Owner Preventa", "Preventa", "Preventa principal", 
    "#PreventasAbiertos", "Categoria SDR", "Next Step", "Next Activity Date", 
    "Fecha ultimo cambio Next Step", "Calculadora Horas", "Calculadora ROI", "Calendario facturación", 
    "Fecha de facturación", "¿Aplica Marketplace?", "Quantity"
  ],
  ATIVIDADES: [
    "Assigned", "Date", "Company / Account", "Tipo de Actividad", "Full Comments", "Comments", 
    "Subject", "Location", "Opportunity", "Contact", "Status", "Activity Type", "Created Date"
  ],
  ALTERACOES: [
    "Opportunity Owner", "Edited By", "Field / Event", "Old Value", "New Value", "Edit Date", 
    "Opportunity Name", "Stage", "Stage Duration", "Last Activity", "Last Stage Change Date", 
    "Primary Campaign Source", "Calculadora Horas", "Calculadora ROI"
  ],
  // ALTERACOES (Variante PT-BR aceita pelo código):
  // "Proprietário da oportunidade", "Editado por", "Campo/Compromisso", "Valor antigo", 
  // "Novo valor", "Data de edição", "Nome da oportunidade", "Fase", "Duração da fase", 
  // "Última atividade", "Data da última mudança de fase", "Origem da campanha principal", 
  // "Calculadora Horas", "Calculadora ROI"
  GANHAS: [
    "Account Name", "Opportunity Name", "Opportunity Owner", "Close Date", "Created Date", 
    "Last Stage Change Date", "Proceso", "Product Family", "Total Price (converted)", "Quantity", 
    "Plazo Producto (Meses)", "Fecha de activación", "Margen de Lista %", "Margen %", "Margen Total %", 
    "Descuento Fabricante %", "Descuento Xertica %", "Active Product", "Lead Source", 
    "Primary Campaign Source", "DR", "Segmento Consolidado", "Fiscal Period", "Nombre Dominio", 
    "Consola", "Productos con vigencia activa", "Estado de activación de productos", "Monto no anulado", 
    "Tipo De Oportunidad", "Portafolio", "Portafolio Xertica.Ai", "Fecha de facturación", "Billing City", 
    "Billing State/Province", "Fecha Inicio Contrato", "Fecha Fin Contrato", "Margen Total $ (converted)", "Net Revenue",
    "Product Name", "Categoria SDR", "Razón Social", "Description", "Descripción", "Fiscal Year", 
    "Calculadora Horas", "Calculadora ROI", "Next Step", "Fecha ultimo cambio Next Step", 
    "Next Activity Date", "Top deal", "Owner Preventa", "GCP Billing ID", "Calendario facturación"
  ],
  PERDIDAS: [
    "Razón de pérdida", "Account Name", "Opportunity Name", "Opportunity Owner", "Created Date", 
    "Close Date", "Fiscal Period", "Last Stage Change Date", "Last Event Date", "Stage", 
    "Stage Duration", "Total Price (converted)", "Margen Total $ (converted)", "Description", 
    "Descripción", "Tipo De Oportunidad", "Product Name", "Product Family", "Probability (%)", 
    "Oportunidad Generada", "Primary Campaign Source", "Tipo incentivo en google", "DR", "Forecast", 
    "Subsegmento de mercado", "Industry", "Contacto Negociación", "Primary Contact", "Contact: Title", 
    "Contact: Email", "Contact: Phone", "Phone", "Subsidiaria", "Portafolio Xertica.Ai", 
    "Descripción de la pérdida", "Motivo descalificación", "Fecha de aplazamiento", 
    "Perdida por Competencia", "Top deal", "Categoria SDR"
  ]
};


const ENUMS = {
  FORECAST_IA: {
    COMMIT: "COMPROMETIDO",
    UPSIDE: "POTENCIAL",
    PIPELINE: "PIPELINE",
    OMITTED: "OMITIDO (PERDA PROVAVEL)"
  },
  LABELS: {
    NEW_CLIENT: "NOVO CLIENTE",
    BASE_CLIENT: "BASE INSTALADA",
    STAGNANT: "ALERTA DE ESTAGNAÇÃO", 
    ALERTA_REVISAO_URGENTE: "REVISÃO URGENTE NECESSÁRIA",
    INCOMPLETE: "CRM INCOMPLETO",
    LONG_DATE: "DATA DE FECHAMENTO DISTANTE",
    NET_ZERO: "VALOR LÍQUIDO ZERADO",
    LOW_MARGIN: "MARGEM ABAIXO DO MÍNIMO",
    DEAL_DESK: "DEAL DESK OBRIGATÓRIO",
    GOV_PROCESS: "PROCESSO PÚBLICO DETECTADO",
    INCONSISTENT: "INCONSISTÊNCIA ENTRE FASE E DADOS",
    BANT_FAIL: "QUALIFICAÇÃO BANT AUSENTE",
    DEAL_STRETCH: "MÚLTIPLAS ALTERAÇÕES DE PRAZO",
    PIPELINE_INFLATION: "INFLAÇÃO DE PIPELINE",
    LOW_WIN_RATE: "VENDEDOR COM BAIXA TAXA DE CONVERSÃO",
    TOKEN_TRANSFER: "TRANSFERÊNCIA DE TOKEN DETECTADA",
    GTM_VIP: "OPORTUNIDADE ESTRATÉGICA GTM",
    STAGE_DRIFT: "DERIVA DE FASE DETECTADA",
    INTEGRITY_ALERT: "EDIÇÃO MANUAL DETECTADA",
    COLD_GATE: "GATE CRÍTICO ATIVO",
    OCULTACAO_MATURIDADE: "OCULTACAO-MATURIDADE",
    FALSO_ENGAJAMENTO: "FALSO-ENGAJAMENTO",
    ESTAGNACAO_FUNIL: "ESTAGNACAO-FUNIL",
    EFEITO_HALO: "EFEITO-HALO"
  },
  ACTION_CODE: {
    CRM_AUDIT: "AUDITORIA-CRM",       
    VALIDATE_DATE: "VALIDAR-DATA",     
    ENGAGEMENT: "AUMENTAR-CADENCIA",   
    DEAL_DESK: "CHECAR-DEAL-DESK",     
    REQUALIFY: "REQUALIFICAR",         
    ARCHIVE: "ENCERRAR-INATIVO",       
    CLOSE: "FECHAMENTO-IMEDIATO"       
  }
};

/**
 * MAPA 1: Converte o nome do estado/cidade (normalizado) do CRM para a sigla (UF) oficial.
 * Essencial para padronizar a entrada inconsistente do CRM.
 */
const STATE_NAME_TO_UF_MAP = {
  'ACRE': 'AC', 'RIO BRANCO': 'AC', 
  'ALAGOAS': 'AL', 'MACEIO': 'AL',
  'AMAPA': 'AP', 'MACAPA': 'AP',
  'AMAZONAS': 'AM', 'MANAUS': 'AM',
  'BAHIA': 'BA', 'SALVADOR': 'BA', 
  'CEARA': 'CE', 'FORTALEZA': 'CE', 'CAUCAIA': 'CE',
  'DISTRITO FEDERAL': 'DF', 'BRASILIA': 'DF', 
  'ESPIRITO SANTO': 'ES', 'VITORIA': 'ES', 'SERRA': 'ES',
  'GOIAS': 'GO', 'GOIANIA': 'GO', 'GOIAS': 'GO',
  'MARANHAO': 'MA', 'SAO LUIS': 'MA',
  'MATO GROSSO': 'MT', 'CUIABA': 'MT', 'VARZEA GRANDE': 'MT', 'CAMPO NOVO DO PARECIS': 'MT',
  'MATO GROSSO DO SUL': 'MS', 'CAMPO GRANDE': 'MS', 
  'MINAS GERAIS': 'MG', 'BELO HORIZONTE': 'MG', 'UBERLANDIA': 'MG', 'NOVA LIMA': 'MG', 'AIURUOCA': 'MG', 'ARCOS': 'MG',
  'PARA': 'PA', 'BELEM': 'PA', 
  'PARAIBA': 'PB', 
  'PARANA': 'PR', 'CURITIBA': 'PR', 'LONDRINA': 'PR', 'JACAREZINHO': 'PR',
  'PERNAMBUCO': 'PE', 'RECIFE': 'PE', 
  'PIAUI': 'PI', 'TERESINA': 'PI', 'PARNAIBA': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO DAS OSTRAS': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS', 'PORTO ALEGRE': 'RS', 'GRAMADO': 'RS', 'IVOTI': 'RS', 'GRAVATAI': 'RS', 'ITAARA': 'RS',
  'RONDONIA': 'RO', 'PORTO VELHO': 'RO', 
  'RORAIMA': 'RR', 
  'SANTA CATARINA': 'SC', 'FLORIANOPOLIS': 'SC', 'LAGES': 'SC', 'TIJUCAS': 'SC',
  'SAO PAULO': 'SP', 'CAMPINAS': 'SP', 'BARUERI': 'SP', 'SAO JOSE DOS CAMPOS': 'SP', 'INDAIATUBA': 'SP', 'MOCOCA': 'SP', 'SALESOPOLIS': 'SP', 'CACHOEIRA PAULISTA': 'SP', 'PORTO FERREIRA': 'SP',
  'SERGIPE': 'SE', 'SAO CRISTOVAO': 'SE', 
  'TOCANTINS': 'TO', 'PALMAS': 'TO'
};

/**
 * MAPA 2: A fonte da verdade. Mapeia a sigla (UF) para o nome exato do vendedor.
 * Diretamente baseado na definição de território fornecida.
 */
const UF_TO_SELLER_MAP = {
  // Sul -> Gabriel Leick
  'PR': 'GABRIEL LEICK', 'SC': 'GABRIEL LEICK', 'RS': 'GABRIEL LEICK',
  // Norte/Nordeste -> Denilson Goes
  'AC': 'DENILSON GOES', 'AP': 'DENILSON GOES', 'AM': 'DENILSON GOES', 'PA': 'DENILSON GOES', 'RO': 'DENILSON GOES', 'RR': 'DENILSON GOES', 'TO': 'DENILSON GOES',
  'AL': 'DENILSON GOES', 'BA': 'DENILSON GOES', 'CE': 'DENILSON GOES', 'MA': 'DENILSON GOES', 'PB': 'DENILSON GOES', 'PE': 'DENILSON GOES', 'PI': 'DENILSON GOES', 'RN': 'DENILSON GOES', 'SE': 'DENILSON GOES',
  // Centro-Oeste -> Carlos Moll
  'GO': 'CARLOS MOLL', 'MT': 'CARLOS MOLL', 'MS': 'CARLOS MOLL', 'DF': 'CARLOS MOLL',
  // Sudeste (SP) -> Luciana Fonseca
  'SP': 'LUCIANA FONSECA',
  // Sudeste (RJ/ES) -> Emilio Gonçalves
  'RJ': 'EMILIO GONCALVES', 'ES': 'EMILIO GONCALVES',
  // Sudeste (MG) -> Alexsandra Junqueira
  'MG': 'ALEXSANDRA JUNQUEIRA'
};

// ================================================================================================
// --- 1. CAMADA DE INTERFACE DE USUÁRIO (UI LAYER) ---
// ================================================================================================


// ================================================================================================
// --- FUNÇÕES COMPARTILHADAS (UTILITIES) ---
// ================================================================================================

/**
 * Limpa cache de normalização se ultrapassar limite
 * SILENCIOSO - não loga para evitar poluição de logs
 */
function cleanNormCacheIfNeeded_() {
  const keys = Object.keys(NORM_TEXT_CACHE_);
  if (keys.length > NORM_CACHE_MAX_SIZE) {
    // Remove 20% dos itens mais antigos
    const toRemove = Math.floor(keys.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      delete NORM_TEXT_CACHE_[keys[i]];
    }
    // LOG REMOVIDO: Poluía demais os registros (centenas de linhas)
    // Se necessário debug, descomentar: logToSheet("DEBUG", "Cache", `Cache limpo: ${toRemove} itens`);
  }
}

/**
 * Invalida cache de sheets para forçar releitura
 * Deve ser chamado entre lotes para garantir dados frescos
 */
function invalidateSheetCache_() {
  Object.keys(SHEET_CACHE_).forEach(k => delete SHEET_CACHE_[k]);
  logToSheet("DEBUG", "Cache", "Cache de sheets invalidado - dados serão relidos");
}

function getTodayContext_() {
  const d = new Date();
  const br = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
  return { br: br, tz: Session.getScriptTimeZone() };
}

function detectGovProcurementStage_(text) {
  const t = normText_(text);
  const info = { isGov: false, stages: [], signals: 0 };
  
  // Usa regex pré-compilado globalmente para performance
  if (GOV_REGEX.test(t)) info.signals++;

  const stagesMap = {
    "ETP": [/\bESTUDO TECNICO\b/, /\bETP\b/, /\bESTUDO PRELIMINAR\b/],
    "TR": [/\bTERMO DE REFERENCIA\b/, /\bTR\b/, /\bPROJETO BASICO\b/],
    "PESQUISA": [/\bCOTACAO\b/, /\bPESQUISA DE PRECO\b/, /\bCOMPOSICAO DE PRECO\b/],
    "EDITAL": [/\bEDITAL PUBLICADO\b/, /\bEDITAL\b/, /\bPUBLICACAO\b/],
    "DISPUTA": [/\bLANCE\b/, /\bDISPUTA\b/, /\bSESSAO PUBLICA\b/],
    "HABILITACAO": [/\bHABILITACAO\b/, /\bDOCUMENTACAO\b/],
    "HOMOLOGACAO": [/\bHOMOLOGACAO\b/, /\bADJUDICACAO\b/, /\bVENCEDOR\b/],
    "EMPENHO": [/\bNOTA DE EMPENHO\b/, /\bEMPENHO\b/, /\bNE\b/]
  };

  for (let stage in stagesMap) {
    if (stagesMap[stage].some(r => r.test(t))) {
      info.stages.push(stage);
      info.signals++;
    }
  }
  
  info.isGov = info.signals >= 2;
  return info;
}

/**
 * Extrai trecho de contexto (snippet) de um texto baseado em keywords
 * Remove prefixos cronológicos e metadados do sistema
 */
function calculateMEDDICScore(item, text) {
  // Limpa HTML e metadados da descrição antes de processar
  const cleanDesc = cleanActivityText_(item.desc || "");
  const fullContent = item.oppName + " " + cleanDesc + " " + text;
  const content = normText_(fullContent);
  
  const criteria = {
    // Metrics: qualquer menção a valor, resultado, impacto ou métrica
    Metrics: [
      "ROI","RETORNO","ECONOMIA","REDUCAO","AUMENTO","PAYBACK","KPI","AHORRO",
      "IMPACTO","BENEFICIO","GANHO","EFICIENCIA","PRODUTIVIDADE","RESULTADO",
      "CUSTO","SAVING","VALOR","PERCENTUAL","META","OBJETIVO","PERFORMANCE",
      "CRESCIMENTO","MELHORIA","LICENCA","SEATS","USUARIOS","ESCALA"
    ],
    // Buyer: qualquer pessoa com poder de decisão ou envolvimento executivo
    Buyer: [
      "DECISOR","APROVADOR","CFO","CEO","DIRETOR","SECRETARIO","ORDENADOR","GESTOR","VP",
      "CTO","CIO","COO","SUPERINTENDENTE","PRESIDENTE","VICE","COORDENADOR","GERENTE",
      "RESPONSAVEL","STAKEHOLDER","LIDERANCA","EXECUTIVO","TOMADOR","AUTORIDADE",
      "CHEFE","HEAD","TITULAR","PREFEITO","GOVERNADOR","MINISTRO","PROCURADOR"
    ],
    // Criteria: qualquer evidência de critério técnico, processo de compra ou avaliação formal
    Criteria: [
      "CRITERIO","REQUISITOS","MATRIZ","TERMINOS","PLIEGO","EDITAL","TR","ETP","POC",
      "AVALIACAO","PROVA DE CONCEITO","TESTE","PILOTO","RFP","RFI","RFQ",
      "ESPECIFICACAO","BENCHMARK","HOMOLOGAR","VALIDAR","APROVADO","SELECIONADO",
      "ANALISE TECNICA","DEMONSTRACAO","WORKSHOP","PRESENTA","APRESENTACAO"
    ],
    // Process: qualquer sinal de andamento burocrático, assinatura, jurídico ou próximos passos claros
    Process: [
      "HOMOLOGACAO","ASSINATURA","PARECER","JURIDICO","ARP","LICIT","COMISSAO","ADJUDICACAO",
      "CONTRATO","PROPOSTA","NEGOCIACAO","PRAZO","CRONOGRAMA","ETAPA","PROXIMO PASSO",
      "NEXT STEP","FOLLOWUP","FOLLOW-UP","FOLLOW UP","REUNIAO","AGENDADO","AGENDAMENTO",
      "APROVACAO","REVISAO","PIPELINE","ORDEM DE COMPRA","OC ","EMPENHO","NOTA FISCAL"
    ],
    // Pain: qualquer menção a problema, necessidade, contexto desafiador ou motivação
    Pain: [
      "DESAFIO","PROBLEMA","GARGALO","INEFICIENCIA","DOR","URGENCIA","RISCO","MULTA",
      "NECESSIDADE","DEMANDA","OPORTUNIDADE","MOTIVACAO","CONTEXTO","CENARIO",
      "DIFICULDADE","OBSTÁCULO","OBSTACULO","CRITICO","PRIORITARIO","ESTRATEGICO",
      "COMPLIANCE","SEGURANCA","TRANSFORMACAO","MODERNIZACAO","DIGITALIZACAO",
      "MIGRACAO","PROJETO","INICIATIVA","OBJETIVO"
    ],
    // Champion: qualquer pessoa interna ao cliente que apoia, apresenta ou facilita
    Champion: [
      "CAMPEAO","DEFENSOR","PONTO FOCAL","ALIADO","SPONSOR","PATROCINADOR",
      "CONTATO","INTERLOCUTOR","FACILITADOR","EMBAIXADOR","APOIADOR",
      "REFERENCIA","INDICOU","RECOMENDOU","APRESENTOU","CONECTOU",
      "PARCEIRO INTERNO","FOCAL POINT","KEY USER","USUARIO CHAVE"
    ]
  };

  let score = 0;
  let gaps = [];
  let hits = [];
  let evidenceWithCitations = [];
  
  for (let key in criteria) {
    const found = criteria[key].some(word => content.includes(normText_(word)));
    if (found) {
      score += 16;
      hits.push(key);
      // Retorna apenas o nome do critério, sem detalhamento
      evidenceWithCitations.push(key);
    } else {
      gaps.push(key);
    }
  }
  
  return { 
    score: Math.min(100, score), 
    gaps: gaps, 
    hits: hits,
    evidenceWithCitations: evidenceWithCitations
  };
}

function calculateBANTScore_(item, activity) {
  // Limpa HTML e metadados da descrição antes de processar
  const cleanDesc = cleanActivityText_(item.desc || "");
  const fullContent = cleanDesc + " " + (activity.fullText || "");
  const content = normText_(fullContent);
  
  const criteria = {
    // Budget: qualquer sinal de valor, verba, preço ou discussão financeira
    Budget: [
      "BUDGET", "ORCAMENTO", "VERBA", "CAPEX", "OPEX", "PRICING", "PRECO", "COTACAO",
      "VALOR", "CUSTO", "INVESTIMENTO", "RECURSOS", "FINANCEIRO", "LICENCA",
      "CONTRATO", "PROPOSTA", "DESCONTO", "APROVADO", "DOTACAO", "EMPENHO",
      "SEATS", "USUARIOS", "ESCALA", "TOTAL"
    ],
    // Authority: qualquer pessoa com poder ou envolvimento em decisão
    Authority: [
      "DECISOR", "APROVADOR", "CFO", "CEO", "DIRETOR", "COMPRADOR", "OWNER", "SPONSOR", "PATROCINADOR",
      "CTO", "CIO", "VP", "SUPERINTENDENTE", "GERENTE", "COORDENADOR", "SECRETARIO",
      "RESPONSAVEL", "TOMADOR", "LIDERANCA", "PREFEITO", "MINISTRO", "PROCURADOR",
      "AUTORIDADE", "TITULAR", "HEAD", "CHEFE"
    ],
    // Need: qualquer sinal de motivação, contexto ou objetivo de negócio
    Need: [
      "DOR", "PROBLEMA", "DESAFIO", "NECESSIDADE", "GAP", "INEFICIENCIA", "IMPACTO",
      "OBJETIVO", "META", "MOTIVACAO", "CONTEXTO", "PROJETO", "INICIATIVA",
      "MIGRACAO", "MODERNIZACAO", "DIGITALIZACAO", "TRANSFORMACAO", "MELHORIA",
      "CONFORMIDADE", "COMPLIANCE", "SEGURANCA", "DEMANDA", "URGENCIA", "ESTRATEGIA"
    ],
    // Timing: qualquer sinal de prazo, data, andamento ou próximos passos
    Timing: [
      "PRAZO", "TIMING", "ATE", "DATA", "CRONOGRAMA", "JANELA", "URGENCIA",
      "FECHAMENTO", "CLOSE DATE", "PROXIMO PASSO", "NEXT STEP", "AGENDADO",
      "REUNIAO", "PREVISAO", "TRIMESTRE", "QUARTER", "SEMANA", "MES",
      "ENTREGA", "GO LIVE", "LANCAMENTO", "DEPLOY", "IMPLANTACAO"
    ]
  };

  let score = 0;
  let gaps = [];
  let hits = [];
  let evidenceWithCitations = [];

  Object.keys(criteria).forEach(key => {
    const found = criteria[key].some(word => content.includes(normText_(word)));
    if (found) {
      score += 25;
      hits.push(key);
      // Retorna apenas o nome do critério, sem detalhamento
      evidenceWithCitations.push(key);
    } else {
      gaps.push(key);
    }
  });

  return { 
    score: Math.min(100, score), 
    gaps: gaps, 
    hits: hits,
    evidenceWithCitations: evidenceWithCitations
  };
}

/**
 * computeDealAdjustments_ — Tier matrix de confiança: tipo de deal × inatividade.
 *
 * TIER MATRIX (penalidade em pontos sobre a base):
 *   Tipo        | Base | 🟢<15d | 🟡15-29d | 🟠30-59d | 🔴60-89d | 💀≥90d
 *   RETENCAO    |  75  |    0   |    -5    |   -10    |   -20    |   -30
 *   UPSELL      |  70  |    0   |    -5    |   -10    |   -20    |   -30
 *   NOVA        |  55  |    0   |   -10    |   -20    |   -30    |   -40
 *
 * @param {object}        item      — deal (oppName, products, tipoOportunidade)
 * @param {number|string} idleDays  — dias sem atividade
 * @returns {object}
 */
function computeDealAdjustments_(item, idleDays) {
  const haystack = (
    (item.oppName        || '') + ' ' +
    (item.products       || '') + ' ' +
    (item.tipoOportunidade || '')
  ).toUpperCase();

  const isRetencao = /RENOV|RENEW|RETEN|TRANSFER[\s_]?TOKEN|TRANSFERENCIA/.test(haystack);
  const isUpsell   = /ADD[\-\s]?ON|ADICIONAL|UPSELL|AUMENTO|EXPANS/.test(haystack);
  const isEasyDeal = isRetencao || isUpsell;
  const dealTier   = isRetencao ? 'RETENCAO' : (isUpsell ? 'UPSELL' : 'NOVA');

  const idle = (typeof idleDays === 'number') ? idleDays : (parseInt(String(idleDays)) || 0);

  var idleTier, idleLabel, idleEmoji;
  if      (idle <  15) { idleTier = 'VERDE';    idleLabel = 'Ativo (<15 dias)';          idleEmoji = '🟢'; }
  else if (idle <  30) { idleTier = 'AMARELO';  idleLabel = 'Moderado (15–29 dias)';     idleEmoji = '🟡'; }
  else if (idle <  60) { idleTier = 'LARANJA';  idleLabel = 'Em risco (30–59 dias)';     idleEmoji = '🟠'; }
  else if (idle <  90) { idleTier = 'VERMELHO'; idleLabel = 'Crítico (60–89 dias)';      idleEmoji = '🔴'; }
  else                 { idleTier = 'CRITICO';  idleLabel = 'Quase morto (≥90 dias)';   idleEmoji = '💀'; }

  const PENALTIES = {
    RETENCAO: { VERDE: 0, AMARELO: -5,  LARANJA: -10, VERMELHO: -20, CRITICO: -30 },
    UPSELL:   { VERDE: 0, AMARELO: -5,  LARANJA: -10, VERMELHO: -20, CRITICO: -30 },
    NOVA:     { VERDE: 0, AMARELO: -10, LARANJA: -20, VERMELHO: -30, CRITICO: -40 }
  };
  const BASE_CONF = { RETENCAO: 75, UPSELL: 70, NOVA: 55 };

  const penalty   = PENALTIES[dealTier][idleTier];
  const baseConf  = BASE_CONF[dealTier];
  const floorConf = Math.max(baseConf + penalty, isEasyDeal ? 30 : 10);

  const dealContextText = isEasyDeal
    ? 'RENOVAÇÃO / UPSELL / TRANSFER TOKEN (Atrito Baixo: Cliente já da base, ciclo natural/automático. Piso de confiança: ' + floorConf + '%. Seja brando com gaps de BANT/MEDDIC a menos que haja risco explícito de CHURN.)'
    : 'NOVO NEGÓCIO / VENDA TRADICIONAL (Atrito Normal: Exige qualificação completa de BANT/MEDDIC. Piso pelo motor: ' + floorConf + '% dado inatividade ' + idleLabel + '.)';

  const idleTierContext = '\n' + idleEmoji + ' NÍVEL INATIVIDADE: ' + idleLabel +
    ' | Penalidade no score: ' + Math.abs(penalty) + ' pts' +
    (isEasyDeal && penalty !== 0 ? ' (atenuada: cliente existente)' : '') +
    ' | Piso calculado pelo motor: ' + floorConf + '%';

  return { isEasyDeal: isEasyDeal, dealTier: dealTier, idleTier: idleTier, idleLabel: idleLabel,
           idleEmoji: idleEmoji, penalty: penalty, baseConf: baseConf, floorConf: floorConf,
           dealContextText: dealContextText, idleTierContext: idleTierContext };
}

function getOpenPrompt(item, profile, fiscal, activity, meddic, bant, personas, nextStepCheck, inactivityGate, audit, idleDays, govFlags, inconsistency, govInfo) {
  const today = getTodayContext_();
  const joinedFlags = (govFlags && govFlags.length) ? govFlags.join(", ") : "-";
  
  // Formata evidências com citações
  const meddicEvidence = (meddic && meddic.evidenceWithCitations && meddic.evidenceWithCitations.length) 
    ? meddic.evidenceWithCitations.join(", ") 
    : "-";
  const bantEvidence = (bant && bant.evidenceWithCitations && bant.evidenceWithCitations.length) 
    ? bant.evidenceWithCitations.join(", ") 
    : "-";

  const adj = computeDealAdjustments_(item, idleDays);
  const isEasyDeal     = adj.isEasyDeal;
  const dealContextText = adj.dealContextText;

  // ── DETECTOR DE SANDBAGGING ───────────────────────────────────────────────────
  // Cruza fase, MEDDIC, atividade ponderada e dias para o fechamento.
  // Se o deal está em fase precoce mas com maturidade de fase final → SANDBAGGING.
  const _daysToClose    = (item.closed instanceof Date) ? Math.ceil((item.closed - new Date()) / 86400000) : 999;
  const _isEarlyStage   = /qualific|prospec|descobert|discover|lead/i.test(item.stage || '');
  const _meddicScore    = (meddic && typeof meddic.score === 'number') ? meddic.score : 0;
  const _weightedAct    = (activity && typeof activity.weightedCount === 'number') ? activity.weightedCount : 0;
  const _isSandbag      = _isEarlyStage && _meddicScore >= 55 && _weightedAct >= 4 && _daysToClose >= 0 && _daysToClose <= 30;
  const sandbagAlert    = _isSandbag
    ? '⚠️ SANDBAGGING DETECTADO: deal em fase precoce ("' + (item.stage || '?') + '", ' + item.probabilidad + '%) mas com MEDDIC score ' + _meddicScore + ', ' + _weightedAct + ' atividades ponderadas e fechamento em ' + _daysToClose + ' dias. Forte indício de retenção artificial de fase.'
    : 'OK';

  // ── DETECTOR DE GHOSTING DO DECISOR ──────────────────────────────────────────
  // Verifica se Champion / Economic Buyer aparecem nas atividades RECENTES (primeiros 600 chars = ~3 atividades).
  // Alto engajamento sem decisor = "Happy Ears".
  const _recentText     = (activity.fullText || '').substring(0, 700).toLowerCase();
  const _champRaw       = (personas && personas.champion) ? String(personas.champion) : '';
  const _buyerRaw       = (personas && personas.economicBuyer) ? String(personas.economicBuyer) : '';
  const _isUnknown      = (s) => !s || /n.o identificado|not identified|n\/a/i.test(s);
  const _firstName      = (s) => s.trim().split(/\s+/)[0].toLowerCase();
  const _champMissing   = !_isUnknown(_champRaw) && activity.count > 3 && !_recentText.includes(_firstName(_champRaw));
  const _buyerMissing   = !_isUnknown(_buyerRaw) && activity.count > 3 && !_recentText.includes(_firstName(_buyerRaw));
  const _ghostNames     = [
    _champMissing ? 'Champion "' + _champRaw + '"' : '',
    _buyerMissing ? 'Economic Buyer "' + _buyerRaw + '"' : ''
  ].filter(Boolean).join(' e ');
  const ghostingAlert   = (_champMissing || _buyerMissing)
    ? '⚠️ GHOSTING DETECTADO: ' + _ghostNames + ' não aparecem nas atividades recentes apesar de ' + activity.count + ' interações totais. Risco de "Happy Ears": equipe técnica engajada, decisor(es) ausentes.'
    : 'OK';

  // ── EFEITO HALO + ESTAGNAÇÃO DE FUNIL ─────────────────────────────────────
  const _todayMs          = new Date().getTime();
  const _stageChangeDate  = item.lastStageChangeDate instanceof Date ? item.lastStageChangeDate : (item.lastStageChangeDate ? new Date(item.lastStageChangeDate) : null);
  const _accountLastAct   = item.accountLastActivity instanceof Date ? item.accountLastActivity : (item.accountLastActivity ? new Date(item.accountLastActivity) : null);
  const diasNaFase        = _stageChangeDate ? Math.ceil((_todayMs - _stageChangeDate.getTime()) / 86400000) : -1;
  const diasInativoConta  = _accountLastAct  ? Math.ceil((_todayMs - _accountLastAct.getTime())  / 86400000) : -1;
  const diasNaFaseText    = diasNaFase        >= 0 ? diasNaFase        + ' dias' : 'N/D';
  const diasContaText     = diasInativoConta  >= 0 ? diasInativoConta  + ' dias' : 'N/D';
  // Efeito Halo: opp idle mas conta recentemente ativa
  const _haloAtivo  = (typeof idleDays === 'number' && idleDays > 30) && (diasInativoConta >= 0 && diasInativoConta < 15);
  const haloAlert   = _haloAtivo
    ? '✅ EFEITO HALO ATIVO: Opp inativa há ' + idleDays + 'd mas Conta teve atividade há apenas ' + diasInativoConta + 'd — atividades podem estar registradas em negócios paralelos no CRM. NÃO penalize confiança pela inatividade desta opp.'
    : 'OK';
  // Estagnação de funil: alto engajamento mas presa na mesma fase >45d
  const _stageDays  = diasNaFase >= 0 ? diasNaFase : 0;
  const _actHigh    = (activity && typeof activity.count === 'number') ? activity.count >= 5 : false;
  const _isStuck    = _actHigh && _stageDays > 45;
  const stuckAlert  = _isStuck
    ? '⚠️ ESTAGNAÇÃO DE FUNIL: ' + activity.count + ' atividades mas opp presa em "' + (item.stage || '?') + '" há ' + _stageDays + ' dias sem avançar de fase.'
    : 'OK';

  const baseData = `
DATA_ATUAL: ${today.br} (timezone: ${today.tz})
REGRA ANTI-ALUCINACAO: Não invente datas, números, fatos ou marcos. Use apenas o que estiver explicitamente nos dados abaixo. Se faltar evidência, responda "N/A".

DEAL: ${item.oppName} | CLIENTE: ${item.accName} (${profile})
NATUREZA DO NEGÓCIO: ${dealContextText}
VALOR: ${item.gross} | NET REVENUE: ${item.net} | PRODUTOS: ${item.products}
FASE CRM: ${item.stage} (${item.probabilidad}%) | FORECAST SF: ${item.forecast_sf}
CRIADO: ${formatDateRobust(item.created)} | FECHAMENTO: ${formatDateRobust(item.closed)}
ATIVIDADE: ${activity.count} ações | INATIVO: ${idleDays} dias
ATIVIDADE PONDERADA: ${activity.weightedCount} | MIX: ${activity.channelSummary}
TEXTO ATIVIDADES (últimas 15): "${(activity.fullText || "").substring(0, 2000)}"
DESCRIÇÃO CRM: "${(item.desc || "").substring(0, 900)}"
HISTÓRICO (top5): ${audit}
FLAGS SISTEMA: ${joinedFlags}
ALERTA INCOERÊNCIA: ${inconsistency}
ALERTA OCULTACAO MATURIDADE: ${sandbagAlert}
ALERTA FALSO ENGAJAMENTO (DECISOR AUSENTE): ${ghostingAlert}
DIAS NA FASE ATUAL: ${diasNaFaseText} sem avançar no funil.
INATIVIDADE DA CONTA (Efeito Halo): ${diasContaText}
ALERTA ESTAGNAÇÃO FUNIL: ${stuckAlert}
ALERTA EFEITO HALO: ${haloAlert}
GOVERNO: ${govInfo.isGov ? 'SIM' : 'NAO'} | MARCOS: ${govInfo.stages.join(' > ') || 'N/A'}
TIPO OPORTUNIDADE: ${item.tipoOportunidade || 'Nova'} | PROCESSO: ${item.processoTipo || '-'}${adj.idleTierContext}
INSTRUÇÃO TIPO OPP: Motor calculou piso de confiança = ${adj.floorConf}%. Se cliente existente (Adicional/Renovação/TransferToken/Upsell), mantenha confiança ≥ ${adj.floorConf}% e NÃO penalize por gaps de BANT/MEDDIC salvo evidência de CHURN. Se Nova aquisição, applique penalidade progressiva por inatividade conforme tier acima.

DEAL VELOCITY (momentum do negócio):
Predição: ${item._velocityMetrics ? item._velocityMetrics.prediction : 'N/D'} | Risk Score: ${item._velocityMetrics ? item._velocityMetrics.riskScore + '%' : 'N/D'}
Stage Velocity: ${item._velocityMetrics ? item._velocityMetrics.stageVelocity + 'd/fase' : '-'} | Value Velocity: ${item._velocityMetrics ? item._velocityMetrics.valueVelocity + '% /d' : '-'} | Activity Momentum: ${item._velocityMetrics ? item._velocityMetrics.activityMomentum + '%' : '-'}
INSTRUÇÃO VELOCITY (ESTRITA): Se predição for DESACELERANDO ou ESTAGNADO, a PRIMEIRA frase do campo risco_principal DEVE começar com "🔴 VELOCITY [predição]: [motivo direto baseado nos dados]". Penalize a confiança proporcionalmente ao Risk Score.

EVIDÊNCIAS DE QUALIFICAÇÃO:
MEDDIC - Critérios Encontrados: ${meddicEvidence}
MEDDIC - Gaps: ${(meddic && meddic.gaps && meddic.gaps.length) ? meddic.gaps.join(", ") : "Nenhum gap identificado"}
BANT - Critérios Encontrados: ${bantEvidence}
BANT - Gaps: ${(bant && bant.gaps && bant.gaps.length) ? bant.gaps.join(", ") : "Nenhum gap identificado"}

PERSONAS IDENTIFICADAS:
Champion: ${personas && personas.champion ? personas.champion : "Não identificado"}
Economic Buyer: ${personas && personas.economicBuyer ? personas.economicBuyer : "Não identificado"}
Influenciadores-chave: ${personas && personas.keyPersonas && personas.keyPersonas.length ? personas.keyPersonas.join(", ") : "Nenhum identificado"}
Personas Ocultas (nomes recorrentes nas atividades): ${personas && personas.hiddenPersonas && personas.hiddenPersonas.length ? personas.hiddenPersonas.join(", ") : "Nenhuma detectada"}
INSTRUÇÃO PERSONAS: Se encontrar nomes próprios recorrentes nas atividades que não estão explicitamente mapeados como Champion/Buyer, considere-os como potenciais Champions e recomende validação no campo 'personas_assessment'.

VALIDAÇÃO DE PRÓXIMO PASSO:
Next Step vs Última Atividade: ${nextStepCheck && nextStepCheck.alert ? nextStepCheck.alert : "N/A"}
Risk Level: ${nextStepCheck && nextStepCheck.riskLevel ? nextStepCheck.riskLevel : "N/A"}

GATE DE INATIVIDADE:
${inactivityGate && inactivityGate.alert ? inactivityGate.alert : "OK"}
Ação Recomendada: ${inactivityGate && inactivityGate.recommendedAction ? inactivityGate.recommendedAction : "NENHUMA"}
`;

  return `
Atue como VP de Sales Operations. Audite este deal para Forecast.
DADOS:
${baseData}

REGRAS DE OURO (estritas):
1) Se houver "GATE CRÍTICO ACIONADO" no Gate de Inatividade, CONFIANÇA = máximo 40 e AÇÃO = AUDITORIA-CRM.
2) Se houver "INCONERENCIA" na validação de Próximo Passo com Risk Level "CRITICAL", CONFIANÇA máximo 35.
3) Se Champion OU Economic Buyer forem "Não identificado" E Inatividade > 14 dias, adicione label "PERSONAS-AUSENTES".
4) Se MEDDIC tiver mais de 3 gaps OU BANT tiver mais de 2 gaps, classifique como "BAIXA qualificação".
5) Se houver "DEAL DESK OBRIGATORIO" e NÃO houver evidência de aprovação (pricing/financeiro/deal desk), AÇÃO = CHECAR-DEAL-DESK.
6) Se houver "INCOERENCIA FASE x DADOS" ou ALERTA INCOERÊNCIA != OK, reduza CONFIANÇA e AÇÃO = AUDITORIA-CRM.
7) Se a descrição for vaga/curta (ex.: "follow up"), marque label "BANT AUSENTE".
8) Se for GOVERNO e houver marcos (ETP/TR/EDITAL/PNCP/ARP etc.), NÃO penalize apenas por idle; exija evidência do próximo marco.
9) AÇÃO: NUNCA use "GENERICO". Escolha exatamente uma:
[AUDITORIA-CRM, VALIDAR-DATA, AUMENTAR-CADENCIA, CHECAR-DEAL-DESK, REQUALIFICAR, FECHAMENTO-IMEDIATO, ENCERRAR-INATIVO]
10) TIER MATRIX — PISO DE CONFIANÇA CALCULADO PELO MOTOR = ${adj.floorConf}%:
    Tipo         | Base | 🟢<15d | 🟡15-29d | 🟠30-59d | 🔴60-89d | 💀≥90d
    Renovação/TT |  75  |   75   |    70    |    65    |    55    |    45
    Adicional/UP |  70  |   70   |    65    |    60    |    50    |    40
    Nova acq.    |  55  |   55   |    45    |    35    |    25    |    15
    → Este deal: tipo "${adj.dealTier}" × inatividade "${adj.idleLabel}" → PISO = ${adj.floorConf}%.
    → Se cliente existente: confiança NÃO deve cair abaixo de ${adj.floorConf}% sem evidência concreta de CHURN. A justificativa DEVE mencionar a facilidade inerente.
    → Se Nova aquisição: aplique penalidade progressiva por inatividade; descubra por que o deal está parado.
11) QUALIDADE ENGAJAMENTO (REGRA ESTRITA): Se o campo INATIVO (Idle Days) for maior que 30 dias, o campo engagement_quality DEVE ser obrigatoriamente "BAIXA", independentemente do volume passado de atividades. Engajamento antigo não conta como engajamento ativo.
12) OCULTAÇÃO DE MATURIDADE: Se ALERTA OCULTACAO MATURIDADE != 'OK', o campo check_incoerencia DEVE conter exatamente "Sinal forte de Ocultação de Maturidade. Oportunidade retida em fase inicial, mas com maturidade e engajamento de fase de fecho." e a label "OCULTACAO-MATURIDADE" DEVE ser adicionada. Além disso, eleve o Forecast IA para COMMIT ou UPSIDE conforme o score de confiança calculado — não respeite a fase declarada pelo vendedor.
13) FALSO ENGAJAMENTO (DECISOR AUSENTE): Se ALERTA FALSO ENGAJAMENTO (DECISOR AUSENTE) != 'OK', a primeira frase do risco_principal (antes mesmo da regra de Velocity) DEVE ser: "👻 FALSO ENGAJAMENTO: [nome(s)] ausente(s) nas últimas interações — risco de Happy Ears. A equipe técnica está engajada mas o(s) decisor(es) estão ausentes." e a label "FALSO-ENGAJAMENTO" DEVE ser adicionada.
14) EFEITO HALO: Se ALERTA EFEITO HALO != 'OK', NÃO aplique penalidade de inatividade a esta oportunidade. A conta está ativa (atividade recente em negócios paralelos no CRM). Mantenha a confiança no piso mínimo do tier (${adj.floorConf}%) e mencione o efeito halo na justificativa.
15) ESTAGNAÇÃO DE FUNIL: Se ALERTA ESTAGNAÇÃO FUNIL != 'OK', penalize a confiança em pelo menos 10 pontos adicionais, adicione a label "ESTAGNACAO-FUNIL" e mencione explicitamente no risco_principal que o deal está preso na mesma fase há muitos dias apesar do volume de atividades — questiona se o engajamento está convertendo em avanço real de fase.

ESCALA DE CONFIANÇA (0-100):
- 0-20: Muito baixa (múltiplos bloqueadores críticos, alta chance de perda)
- 21-40: Baixa (bloqueadores significativos, qualificação fraca, anomalias de inatividade)
- 41-60: Moderada (alguns riscos, mas viável com ação)
- 61-80: Alta (bem qualificado, poucos riscos)
- 81-100: Muito alta (evidências fortes, caminho claro para fechamento)

AVALIE A QUALIDADE DO ENGAJAMENTO:
Com base no conteúdo das atividades, classifique a qualidade como:
- 'ALTA': conversas sobre próximos passos, valor, objeções, reuniões executivas, apresentações
- 'MÉDIA': follow-ups genéricos, registros de contato, e-mails de acompanhamento
- 'BAIXA': sem conteúdo relevante, comentários vazios, apenas registros automáticos

RETORNE APENAS JSON (sem markdown):
{
  "forecast_cat": "COMMIT|UPSIDE|PIPELINE",
  "confianca": 50,
  "motivo_confianca": "TL;DR EXECUTIVO: máximo 15 palavras apontando o FATOR LETAL. Exemplos: 'Inatividade 60d e decisor não mapeado.' | 'Renovação orgânica, atrito baixo, cliente ativo.' | '5 slippages e fase estagnada há 90 dias.' NÃO repita a justificativa detalhada aqui.",
  "justificativa": "DOSSIÊ: Análise técnica densa (3-5 frases) cobrindo: (1) score de confiança e category, (2) fase + tempo no funil vs prazo, (3) maturidade MEDDIC/BANT com evidências concretas, (4) qualidade e recorrência do engajamento, (5) principal fator de risco ou avanço. NÃO seja uma repetição do motivo_confianca.",
  "engagement_quality": "BAIXA|MÉDIA|ALTA",
  "acao_code": "",
  "acao_desc": "Instrução tática baseada em evidências.",
  "check_incoerencia": "OK ou explicação detalhada",
  "perguntas_auditoria": "Gere 3 perguntas INCISIVAS e AGRESSIVAS para o gestor usar no 1:1 com o vendedor. REGRA 1: Se 'Mudanças Close Date' > 2, PELO MENOS UMA das perguntas deve confrontar o slippage diretamente (ex: 'Você alterou a data de fechamento X vezes — o que exatamente está travando a assinatura?'). REGRA 2: Se houver 'Anomalias Detectadas' diferentes de OK/-, ao menos uma pergunta deve referenciar a anomalia específica. REGRA 3: Se o deal estiver em fase 'Negociação' ou 'Deal Desk', NÃO faça perguntas genéricas de BANT; foque no que está travando o fechamento.",
  "gaps_identificados": ["Gap 1", "Gap 2"],
  "risco_principal": "Se Velocity for DESACELERANDO ou ESTAGNADO, começa obrigatoriamente com '🔴 VELOCITY [predição]: [causa]'. Senão, descreva o maior risco com base em evidências.",
  "evidencia_citada": "Trecho específico que suportou a decisão",
  "personas_assessment": "Avaliação da qualidade de personas identificadas",
  "labels": ["TAG1", "TAG2"]
}`;
}

function getClosedPrompt(mode, item, profile, fiscal, activity, meddic, audit, idleDays, lossReasonNormalized, detailedChanges, activityBreakdown) {
  const today = getTodayContext_();

  const adj = computeDealAdjustments_(item, idleDays);
  const isEasyDeal      = adj.isEasyDeal;
  const dealContextText = adj.dealContextText;

  const baseData = `
DATA_ATUAL: ${today.br} (timezone: ${today.tz})
DEAL: ${item.oppName} | CLIENTE: ${item.accName} (${profile})
NATUREZA DO NEGÓCIO: ${dealContextText}
VALOR: ${item.gross} | NET REVENUE: ${item.net} | PRODUTOS: ${item.products}
FASE CRM: ${item.stage} (${item.probabilidad}%) | FECHAMENTO: ${formatDateRobust(item.closed)}
MOTIVO (SE HOUVER): ${item.reason || "N/A"}
MOTIVO NORMALIZADO: ${lossReasonNormalized || "OUTRO"}
ATIVIDADE: ${activity.count} ações | INATIVO: ${idleDays} dias${adj.idleTierContext}
TEXTO ATIVIDADES: "${(activity.fullText || "").substring(0, 1500)}"
DISTRIBUIÇÃO ATIVIDADES: ${activityBreakdown ? activityBreakdown.typeDistribution : 'N/D'} | PICO: ${activityBreakdown ? activityBreakdown.peakPeriod : 'N/D'} | CADÊNCIA: ${activityBreakdown ? activityBreakdown.avgCadence + 'd' : 'N/D'}
MUDANÇAS CRM: ${detailedChanges ? detailedChanges.totalChanges + ' total' : '0'} | Críticas: ${detailedChanges ? detailedChanges.criticalChanges : 0} | Close Date: ${detailedChanges ? detailedChanges.closeDateChanges : 0} | Padrão: ${detailedChanges ? detailedChanges.changePattern : 'N/D'}
DESCRIÇÃO CRM: "${(item.desc || "").substring(0, 900)}"
HISTÓRICO (top5): ${audit}
`;

  if (mode === 'WON') {
    return `
Você é especialista em Win Analysis. Analise a oportunidade GANHA e identifique os fatores-chave de sucesso.

DADOS:
${baseData}

ANALISE REQUERIDA:
1. ENGAJAMENTO: Como a cadência e volume de atividades impactou o resultado?
2. EVOLUÇÃO: O padrão de alterações indica gestão proativa ou reativa?
3. CICLO: O tempo de venda foi adequado para o valor/complexidade?
4. MOMENTUM: Houve aceleração consistente ou foi errático?
5. CHAMPION: Evidências de sponsor/champion forte na jornada?
6. MEDDIC: Quais pilares MEDDIC foram mais fortes?
7. DIFERENCIAÇÃO: O que nos diferenciou da concorrência?
8. TIMING: Janela de oportunidade foi bem aproveitada?
CONTEXTO: Se for Renovação/Transfer Token, destaque que o sucesso primário é a retenção/manutenção contínua do cliente — o valor está em não ter perdido o cliente, não necessariamente em uma nova venda.

RETORNE APENAS JSON (sem markdown):
{
  "resumo": "Resumo executivo de 2-3 frases do porquê ganhamos",
  "causa_raiz": "Fator principal da vitória (ex.: champion forte, timing perfeito, valor percebido claro, relacionamento)",
  "fatores_sucesso": ["fator1", "fator2", "fator3"],
  "tipo_resultado": "NOVO LOGO|EXPANSAO|RENOVACAO|TRANSFERENCIA|OUTRO",
  "qualidade_engajamento": "EXCELENTE|BOM|MODERADO|FRACO",
  "gestao_oportunidade": "PROATIVA|REATIVA|MISTA",
  "licoes_aprendidas": "O que replicar em outros deals",
  "labels": ["TAG1", "TAG2", "TAG3"]
}`;
  }

  return `
Você é especialista em Loss Analysis. Analise a oportunidade PERDIDA e identifique causas raiz e sinais de alerta.

DADOS:
${baseData}

ANALISE REQUERIDA:
1. ENGAJAMENTO: O volume/cadência de atividades foi insuficiente?
2. SINAIS PRECOCES: Alterações/mudanças indicaram problemas antes da perda?
3. TIMING: Entramos muito tarde ou saímos muito cedo?
4. QUALIFICAÇÃO: Deal deveria ter sido qualificado desde o início?
5. CHAMPION: Falta de sponsor/champion impactou?
6. CONCORRÊNCIA: Perdemos para quem e por quê?
7. PREÇO: Foi realmente preço ou percepção de valor?
8. GESTÃO: Houve follow-up adequado ou deal ficou abandonado?
9. MEDDIC: Quais gaps críticos não foram endereçados?
10. APRENDIZADO: O que poderíamos ter feito diferente?
CONTEXTO: Se for Renovação/Transfer Token perdido, classifique como CHURN. Foque criticamente nos motivos que levaram o cliente a nos abandonar — concorrente, insatisfação com produto, preço, falta de engajamento de CS/AM. Este é o sinal de alerta mais crítico para retenção.

RETORNE APENAS JSON (sem markdown):
{
  "resumo": "Resumo executivo de 2-3 frases do porquê perdemos",
  "causa_raiz": "Causa principal documentada (ex.: preço, concorrência, timing, falta de champion, má qualificação)",
  "causas_secundarias": ["causa2", "causa3"],
  "tipo_resultado": "PRECO|CONCORRENCIA|TIMING|SEM_CHAMPION|MA_QUALIFICACAO|ABANDONO|OUTRO",
  "evitavel": "SIM|NAO|PARCIALMENTE",
  "sinais_alerta": ["sinal1", "sinal2"],
  "momento_critico": "Quando/onde perdemos o deal (ex.: fase de proposta, negociação final)",
  "licoes_aprendidas": "O que evitar em deals futuros",
  "labels": ["TAG1", "TAG2", "TAG3"]
}`;
}

/**
 * Extrai nomes de personas (Champion e Economic Buyer) a partir do texto de atividades
 * Inclui detecção de cargos B2G (Governo) e busca de "Personas Ocultas" (nomes recorrentes)
 */
function extractPersonasFromActivities(fullText, descriptionBANT) {
  if (!fullText || !fullText.length) return { champion: null, economicBuyer: null, keyPersonas: [], hiddenPersonas: [] };
  
  const personas = { champion: null, economicBuyer: null, keyPersonas: [], hiddenPersonas: [] };
  const textCombined = (fullText + " " + (descriptionBANT || "")).toLowerCase();
  
  // DICIONÁRIO B2G: Cargos que são automaticamente Economic Buyers
  const b2gTitles = [
    'secretario', 'secretária', 'prefeito', 'prefeita', 'governador', 'governadora',
    'ministro', 'ministra', 'diretor', 'diretora', 'ordenador', 'ordenadora',
    'subsecretario', 'subsecretária', 'coordenador', 'coordenadora'
  ];
  
  // Padrão: "conversa com o Secretário" ou "Secretário João"
  const b2gPattern = new RegExp(`(${b2gTitles.join('|')})\\s*([A-Za-zÀ-ÿ]+)?`, 'gi');
  const b2gMatches = textCombined.match(b2gPattern);
  
  if (b2gMatches && b2gMatches.length > 0) {
    // Se encontrou cargo B2G, marca como Economic Buyer
    const firstMatch = b2gMatches[0];
    const titleMatch = firstMatch.match(new RegExp(`(${b2gTitles.join('|')})`, 'i'));
    
    if (titleMatch) {
      const title = titleMatch[1].charAt(0).toUpperCase() + titleMatch[1].slice(1);
      personas.economicBuyer = title;
      personas.keyPersonas.push(title);
    }
  }
  
  // Busca por nomes próprios explícitos no BANT (campo "A:")
  // Padrão: "A: Nome Sobrenome" ou "Authority: Nome"
  const bantAuthorityPattern = /A:\s*([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/;
  const bantMatch = (descriptionBANT || fullText).match(bantAuthorityPattern);
  
  if (bantMatch && bantMatch[1]) {
    const name = bantMatch[1].trim();
    if (name.length > 3 && !personas.economicBuyer) {
      personas.economicBuyer = name;
      personas.keyPersonas.push(name);
    } else if (name.length > 3 && personas.economicBuyer) {
      // Se já tem cargo, adiciona nome como refinamento
      personas.economicBuyer = `${personas.economicBuyer} (${name})`;
      personas.keyPersonas.push(name);
    }
  }
  
  // Padrões de Champion
  const championPatterns = [
    /(?:champion|aliado|defensor|ponto focal|sponsor|patrocinador)[:\s]+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i,
    /(?:coordenador|gerente|analista)[:\s]+([A-ZÀ-Ÿ][a-zà-ÿ]+)/i
  ];
  
  for (let pattern of championPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name !== personas.economicBuyer) {
        personas.champion = name;
        personas.keyPersonas.push(name);
        break;
      }
    }
  }
  
  // BUSCA DE PERSONAS OCULTAS: Detecta nomes próprios recorrentes no texto
  // Busca padrões como "Glaucius", "Maria", "João" mencionados múltiplas vezes
  const namePattern = /(?:^|\s)([A-ZÀ-Ÿ][a-zà-ÿ]{3,})(?:\s|,|\.|\n|$)/g;
  const nameMatches = fullText.match(namePattern);
  
  if (nameMatches && nameMatches.length > 0) {
    const nameFrequency = {};
    
    // Conta frequência de cada nome
    nameMatches.forEach(match => {
      const cleanName = match.trim();
      // Filtra palavras comuns que começam com maiúscula mas não são nomes
      const ignoreWords = ['Data', 'Tipo', 'Cliente', 'Projeto', 'Reunião', 'Email', 'Telefone'];
      if (!ignoreWords.includes(cleanName) && cleanName.length > 3) {
        nameFrequency[cleanName] = (nameFrequency[cleanName] || 0) + 1;
      }
    });
    
    // Se algum nome aparece 2+ vezes, considera persona oculta
    Object.entries(nameFrequency).forEach(([name, count]) => {
      if (count >= 2) {
        personas.hiddenPersonas.push(`${name} (${count}x mencionado)`);
        
        // Se não tem Champion ainda, sugere o mais recorrente
        if (!personas.champion && count >= 2) {
          personas.champion = `${name} (sugerido)`;
          personas.keyPersonas.push(name);
        }
      }
    });
  }
  
  return personas;
}

/**
 * Valida consistência entre "Next Step" do CRM e última atividade
 * Retorna: { isConsistent: bool, alert: string, nextStepReality: string }
 */
function validateNextStepConsistency(nextStep, lastActivityText, lastActivityDate) {
  if (!nextStep || !lastActivityText) {
    return { 
      isConsistent: true, 
      alert: "Sem dados para validação", 
      nextStepReality: "N/A",
      riskLevel: "INFO"
    };
  }
  
  const nextStepNorm = normText_(nextStep);
  const activityNorm = normText_(lastActivityText);
  
  // Padrões conflitantes
  const signingKeywords = ["assinatura", "assinar", "contrato", "agreement"];
  const negotiationKeywords = ["negociacao", "desconto", "preco", "condicoes"];
  const paymentKeywords = ["pagamento", "forma", "condicoes financeiras"];
  const discoveryKeywords = ["discovery", "reuniao", "entendimento", "necessidades"];
  
  const nextStepCategory = nextStepNorm.includes("assinatura") ? "signing" :
                           nextStepNorm.includes("negociacao") || nextStepNorm.includes("proposta") ? "negotiation" :
                           nextStepNorm.includes("decision") || nextStepNorm.includes("aprovacao") ? "approval" :
                           "other";
  
  const activityCategory = activityNorm.includes("pagamento") || activityNorm.includes("forma de pagamento") ? "payment_discussion" :
                           activityNorm.includes("negociacao") || activityNorm.includes("desconto") ? "negotiation" :
                           activityNorm.includes("bloqueio") || activityNorm.includes("objecao") ? "blocker" :
                           activityNorm.includes("reuniao") || activityNorm.includes("discovery") ? "discovery" :
                           "other";
  
  // Validações
  const conflicts = {
    "signing - payment_discussion": "INCONERENCIA: Next Step é 'assinar', mas última atividade fala de 'forma de pagamento'",
    "signing - negotiation": "INCONERENCIA: Next Step é 'assinar', mas última atividade fala de negociação/desconto",
    "signing - blocker": "INCONERENCIA CRÍTICA: Next Step é 'assinar', mas última atividade menciona bloqueio",
    "negotiation - discovery": "INCONERENCIA: Next Step é 'negociação', mas atividade ainda em fase discovery",
    "approval - payment_discussion": "INCONERENCIA: Next Step é 'aprovação', mas ainda discutindo 'forma de pagamento'"
  };
  
  const conflictKey = `${nextStepCategory} - ${activityCategory}`;
  const alert = conflicts[conflictKey] || null;
  
  return {
    isConsistent: !alert,
    alert: alert || "OK",
    nextStepCategory: nextStepCategory,
    activityCategory: activityCategory,
    riskLevel: alert ? (alert.includes("CRÍTICA") ? "CRITICAL" : "MEDIUM") : "LOW"
  };
}

/**
 * Hard Gate: Inatividade crítica baseada em forecast, fase e tempo de funil
 * Deals em fase inicial são muito mais penalizados por inatividade
 */
function checkInactivityGate(idleDaysValue, forecastCategory, lastActivityDate, currentStage, daysInFunnel) {
  const idleDays = typeof idleDaysValue === 'string' ? parseInt(idleDaysValue) : idleDaysValue;
  
  // Identifica se está em fase inicial (qualificação)
  const stageNorm = currentStage ? normText_(currentStage) : '';
  const isEarlyStage = /CALIFIC|QUALIFY|DISCOVERY|PROSPECT|INICIAL/i.test(stageNorm);
  
  // GATE CRÍTICO 1: Deal em fase inicial com >90 dias de inatividade = ZUMBI
  if (isEarlyStage && idleDays > 90) {
    return {
      isBlocked: true,
      severity: "CRITICAL",
      alert: `🚨 GATE CRÍTICO: Deal em fase inicial (${currentStage}) com ${idleDays} dias de inatividade. Deal classificado como ZUMBI.`,
      recommendedAction: "ENCERRAR-INATIVO",
      suggestedConfidence: 0
    };
  }
  
  // GATE CRÍTICO 2: Deal em fase inicial >150 dias no funil + >60 dias inativo
  if (isEarlyStage && daysInFunnel > 150 && idleDays > 60) {
    return {
      isBlocked: true,
      severity: "CRITICAL",
      alert: `🚨 GATE CRÍTICO: Deal há ${daysInFunnel} dias em fase inicial com ${idleDays} dias sem atividade. Indicativo de "parking lot".`,
      recommendedAction: "ENCERRAR-INATIVO",
      suggestedConfidence: 0
    };
  }
  
  // GATE CRÍTICO 3: UPSIDE/COMMIT com >30 dias inativo
  if (idleDays > 30 && (forecastCategory === 'UPSIDE' || forecastCategory === 'COMMIT')) {
    return {
      isBlocked: true,
      severity: "CRITICAL",
      alert: `⚠️ GATE CRÍTICO: Inatividade de ${idleDays} dias com forecast '${forecastCategory}'. Obrigatória auditoria antes de incluir no pipeline.`,
      recommendedAction: "AUDITORIA-CRM",
      suggestedConfidence: 15
    };
  }
  
  // GATE AVISO: Fase inicial com >45 dias inativo
  if (isEarlyStage && idleDays > 45) {
    return {
      isBlocked: false,
      severity: "WARNING",
      alert: `⚠️ GATE AVISO: Deal em qualificação com ${idleDays} dias de inatividade. Risco alto de perda.`,
      recommendedAction: "REQUALIFICAR",
      suggestedConfidence: 10
    };
  }
  
  // GATE AVISO: UPSIDE com >20 dias inativo
  if (idleDays > 20 && forecastCategory === 'UPSIDE') {
    return {
      isBlocked: false,
      severity: "WARNING",
      alert: `⚠️ GATE AVISO: Inatividade de ${idleDays} dias com forecast 'UPSIDE'. Validar com vendedor.`,
      recommendedAction: "VALIDAR-COM-VENDEDOR",
      suggestedConfidence: 25
    };
  }
  
  return {
    isBlocked: false,
    severity: "CLEAR",
    alert: "OK",
    recommendedAction: null,
    suggestedConfidence: null
  };
}

function callGeminiAPI(prompt, optionalConfig) {
  if (!API_KEY) throw new Error("API KEY não configurada.");
  
  const props = PropertiesService.getScriptProperties();
  const throttleKey = "GEMINI_LAST_CALL";
  const lastCall = parseInt(props.getProperty(throttleKey) || "0");
  const now = Date.now();
  const MIN_INTERVAL = 500;
  
  if (now - lastCall < MIN_INTERVAL) {
    Utilities.sleep(MIN_INTERVAL - (now - lastCall));
  }

  // MELHORIA: Permite override de configuração para retry com parâmetros ajustados
  // NOTA: Removido responseMimeType pois Gemini 2.5 Pro retorna {} vazio com esse parâmetro
  const defaultConfig = { temperature: 0.1, maxOutputTokens: 4096 };
  const generationConfig = optionalConfig ? { ...defaultConfig, ...optionalConfig } : defaultConfig;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: generationConfig
  };
  const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };

  // Lista de modelos para tentar (principal + fallbacks)
  const modelsToTry = [MODEL_ID, ...(typeof FALLBACK_MODELS !== 'undefined' ? FALLBACK_MODELS : ["gemini-1.5-flash"])];
  
  let lastErr = "";
  
  // Tentar cada modelo
  for (const modelId of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();
      const body = res.getContentText() || "";

      if (code === 200) {
        const content = JSON.parse(body);
        props.setProperty(throttleKey, Date.now().toString());
        
        // DEBUG: Logar estrutura completa da resposta
        console.log(`🔍 DEBUG API Response from ${modelId}:`);
        console.log(`   Full body length: ${body.length} chars`);
        console.log(`   Content structure: ${JSON.stringify(content).substring(0, 500)}`);
        console.log(`   Candidates count: ${content?.candidates?.length || 0}`);
        
        const finishReason = content?.candidates?.[0]?.finishReason;
        console.log(`   Finish reason: ${finishReason}`);
        
        // Se atingiu MAX_TOKENS em QUALQUER modelo com thinking (gemini-2.5-*), tentar próximo modelo
        // gemini-2.5-pro e gemini-2.5-flash ambos usam ~200-217 tokens de thinking overhead
        const isThinkingModel = modelId.includes('gemini-2.5');
        if (finishReason === 'MAX_TOKENS' && isThinkingModel) {
          console.warn(`⚠️ ${modelId} atingiu MAX_TOKENS (thinking overhead). Tentando modelo mais leve...`);
          logToSheet("WARN", "AI", `${modelId} MAX_TOKENS - tentando fallback`);
          break; // Vai para próximo modelo
        }
        
        if (content?.candidates?.[0]?.content?.parts?.[0]?.text) {
          const extractedText = content.candidates[0].content.parts[0].text;
          console.log(`   ✅ Extracted text (${extractedText.length} chars): ${extractedText.substring(0, 200)}`);
          
          // Se não é o modelo principal, logar que estamos usando fallback
          if (modelId !== MODEL_ID) {
            logToSheet("INFO", "AI", `Usando modelo fallback: ${modelId}`);
          }
          
          return extractedText;
        } else {
          console.warn(`⚠️ Resposta 200 mas sem texto extraível. Full response: ${JSON.stringify(content)}`);
          
          // Se não tem texto, tentar próximo modelo
          if (attempt === 2) break; // Última tentativa, próximo modelo
          return "{}";
        }
      }

      lastErr = `Gemini HTTP ${code} (${modelId}): ${body.substring(0, 300)}`;

      // Se for 404 (modelo não encontrado), tentar próximo modelo
      if (code === 404) {
        logToSheet("WARN", "AI", `Modelo ${modelId} não encontrado, tentando próximo...`);
        break; // Sai do loop de retry e tenta próximo modelo
      }

      // Se for 429 ou 503, fazer retry
      if (code === 429 || code === 503) {
        Utilities.sleep(800 * Math.pow(2, attempt));
        continue;
      }

      // Outros erros, logar e tentar próximo modelo
      logToSheet("WARN", "AI", lastErr);
      break;
    }
  }

  throw new Error(lastErr || "Falha Gemini: nenhum modelo disponível funcionou.");
}

function cleanAndParseJSON(s) {
  try {
    if (!s || typeof s !== 'string') {
      logToSheet("ERROR", "Parser", "Resposta vazia ou inválida da IA");
      return { 
        error: "FAIL_PARSER", 
        acao_code: "AUDITORIA-CRM", 
        justificativa: "Resposta vazia da IA. Verifique quota/configuração."
      };
    }
    
    let clean = s
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove caracteres de controle
      .trim();
    
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logToSheet("WARN", "Parser", "JSON não encontrado na resposta: " + s.substring(0, 200));
      return { 
        error: "NO_JSON_FOUND", 
        acao_code: "AUDITORIA-CRM", 
        justificativa: "IA retornou texto sem estrutura JSON. Tentando novamente..."
      };
    }
    
    // Valida se JSON está completo (não truncado)
    const jsonCandidate = jsonMatch[0];
    const openBraces = (jsonCandidate.match(/\{/g) || []).length;
    const closeBraces = (jsonCandidate.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      logToSheet("ERROR", "Parser", `JSON TRUNCADO detectado! {=${openBraces} }=${closeBraces}. Raw: ${s.substring(0, 300)}`);
      return { 
        error: "JSON_TRUNCATED", 
        acao_code: "AUDITORIA-CRM", 
        justificativa: "Resposta da IA foi cortada. Aumentando maxTokens e tentando novamente..."
      };
    }
    
    const jsonStr = jsonMatch[0]
      .replace(/[\u2018\u2019]/g, "'")  // Aspas simples curvas → retas
      .replace(/[\u201C\u201D]/g, '"')  // Aspas duplas curvas → retas
      .replace(/\n/g, " ")              // Quebras de linha → espaço
      .replace(/\t/g, " ")              // Tabs → espaço
      .replace(/\s+/g, " ");            // Múltiplos espaços → único
    
    const parsed = JSON.parse(jsonStr);
    
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    
    throw new Error("Parsed result is not an object");
    
  } catch (e) { 
    logToSheet("ERROR", "Parser", `Falha parse JSON: ${e.message}. Raw (100 chars): ${String(s).substring(0, 100)}`);
    return { 
      error: "FAIL_PARSER", 
      acao_code: "AUDITORIA-CRM", 
      justificativa: "Erro ao interpretar resposta da IA. Processamento manual necessário.",
      confianca: 0,
      forecast_cat: "PIPELINE",
      labels: []
    }; 
  }
}

function buildOpenOutputRow(runId, item, profile, fiscal, activity, meddic, ia, labels, overrideCat, idle, inconsistency, forcedAction, rulesApplied, detailedChanges, isCorrectTerritory, designatedSeller, quarterRecognition) {
  const finalCat = overrideCat || mapEnum(ia.forecast_cat, ENUMS.FORECAST_IA, ENUMS.FORECAST_IA.PIPELINE);
  const finalActionCode = forcedAction || ia.acao_code || "AUDITORIA-CRM";
  const perguntas = Array.isArray(ia.perguntas_auditoria) ? ia.perguntas_auditoria.join(" | ") : "Gerar perguntas na próxima revisão.";
  const gaps = (ia.gaps_identificados && ia.gaps_identificados.length > 0) ? ia.gaps_identificados.join(", ") : meddic.gaps.join(", ");
  const bant = calculateBANTScore_(item, activity);
  const bantGaps = bant.gaps.length ? bant.gaps.join(", ") : "OK";
  
  // Usa evidenceWithCitations se disponível, senão cai para hits
  const bantEvidence = (bant.evidenceWithCitations && bant.evidenceWithCitations.length) 
    ? bant.evidenceWithCitations.join(", ") 
    : (bant.hits.length ? bant.hits.join(", ") : "-");
  
  const meddicGaps = meddic.gaps.length ? meddic.gaps.join(", ") : "OK";
  const meddicEvidence = (meddic.evidenceWithCitations && meddic.evidenceWithCitations.length) 
    ? meddic.evidenceWithCitations.join(", ") 
    : ((meddic.hits && meddic.hits.length) ? meddic.hits.join(", ") : "-");

  // Velocity metrics (se disponível)
  const velSummary = item._velocityMetrics ? 
    `${item._velocityMetrics.prediction} (Risco:${item._velocityMetrics.riskScore}%)` : "-";
  const velDetails = item._velocityMetrics ? 
    `Fase:${item._velocityMetrics.stageVelocity}d | Valor:${item._velocityMetrics.valueVelocity}%/d | Ativ:${item._velocityMetrics.activityMomentum}%` : "-";

  // DIAS FUNIL = DATA ATUAL - CREATED DATE (tempo que está aberto)
  const diasFunil = item.created ? Math.ceil((new Date() - item.created) / MS_PER_DAY) : 0;
  
  // CICLO (dias) = CLOSE DATE - CREATED DATE (duração esperada do ciclo)
  let cicloDias = (item.closed && item.created) ? Math.ceil((item.closed - item.created) / MS_PER_DAY) : 0;
  
  // VALIDAÇÃO DE CICLO (sincronizado com SheetCode)
  const cicloValidation = validateCiclo_(cicloDias, item.created, item.closed, item.oppName);
  if (!cicloValidation.isValid) {
    labels.push(cicloValidation.issue);
  }
  cicloDias = cicloValidation.correctedCiclo;

  // QUALIDADE DO ENGAJAMENTO — com override determinístico por inatividade.
  // Independente do que a IA retornou: idle > 30d = BAIXA (engajamento antigo não conta).
  const _idleNum = (typeof idle === 'number') ? idle : (parseInt(String(idle)) || 0);
  const engagementQuality = _idleNum > 30
    ? 'BAIXA'
    : (ia.engagement_quality || 'N/D');
  
  // Pré-formatar datas uma única vez
  const closedDateFormatted = item.closed ? formatDateRobust(item.closed) : "-";
  const createdDateFormatted = item.created ? formatDateRobust(item.created) : "-";
  const categoriaFDM = deriveCategoriaFDM_(item.productFamily, item.products);
  const verticalIA = item.verticalIA || "-";
  const subVerticalIA = item.subVerticalIA || "-";
  const subSubVerticalIA = item.subSubVerticalIA || "-";
  const lastUpdateFormatted = formatDateRobust(new Date());

  return [
    runId,
    item.oppName,             
    item.accName,             
    profile,                  
    item.products || "N/A",   
    item.owner,               
    item.gross,
    item.net, 
    item.stage,
    item.forecast_sf || "-",              
    fiscal.label,
    closedDateFormatted,
    createdDateFormatted,
    cicloDias,
    diasFunil,
    activity.count,           
    activity.weightedCount,
    activity.channelSummary,
    idle,
    engagementQuality,
    finalCat,                 
    ia.confianca || 0,        
    ia.motivo_confianca || "-", 
    meddic.score,
    meddicGaps,
    meddicEvidence,
    bant.score,
    bantGaps,
    bantEvidence,
    ia.justificativa || "-",
    rulesApplied,
    inconsistency,            
    perguntas,
    labels.join(", "),
    gaps,
    finalActionCode,          
    ia.acao_desc || "-",
    ia.risco_principal || "-",
    detailedChanges.totalChanges || 0,
    detailedChanges.criticalChanges || 0,
    detailedChanges.closeDateChanges || 0,
    detailedChanges.stageChanges || 0,
    detailedChanges.valueChanges || 0,
    detailedChanges.anomalies || "OK",
    velSummary,
    velDetails,
    isCorrectTerritory ? "Sim" : "NÃO",
    designatedSeller,
    item._detectedLocation || item.billingState || item.billingCity || "-",
    item._detectionSource || "CRM",
    quarterRecognition.calendarType || "-",
    quarterRecognition.q1 || 0,
    quarterRecognition.q2 || 0,
    quarterRecognition.q3 || 0,
    quarterRecognition.q4 || 0,
    item.subsegmentoMercado || "-",
    item.segmentoConsolidado || "-",
    item.portfolio || "-",
    categoriaFDM,
    item.ownerPreventa || "-",
    item.billingCity || "-",
    item.billingState || "-",
    verticalIA,
    subVerticalIA,
    subSubVerticalIA,
    ia.evidencia_citada || "-",
    ia.personas_assessment || "-",
    item.tipoOportunidade || "-",
    item.processoTipo || "-",
    lastUpdateFormatted
  ];
}

function deriveCategoriaFDM_(productFamily, products) {
  const normalize = (input) => normText_(String(input || ''));

  const familyRaw = String(productFamily || '').trim();
  const family = normalize(productFamily);
  const productText = normalize(products);

  const plataformaFamilies = ['GWS LICENSING', 'GCP CONSUMPTION'];
  if (plataformaFamilies.includes(family)) return 'Plataforma';

  const servicesFamilies = [
    'GCP SERVICES',
    'GWS SERVICES',
    'INCENTIVES',
    'MSP SERVICES',
    'SMART PRODUCTS'
  ];
  if (servicesFamilies.includes(family)) return 'Services';

  if (family === 'ACELERADORES' || productText.includes('ACELERADOR')) {
    const specificMap = {
      'ACELERADOR AVANCADO PARA MAPEAMENTO E ANALISE DE RISCOS AMBIENTAIS': 'FDM + GIS',
      'ACELERADOR INTEGRADO PARA DETECCAO E ANALISE DE RISCOS': 'FDM + GIS',
      'ACELERADOR SEMANTICO DE DADOS': 'FDM',
      'ACELERADOR SEMANTICO DE DADOS C IA': 'FDM',
      'ACELERADOR DE LAYERS CARTOGRAFICOS': 'FDM + GIS',
      'ACELERADOR PARA COLETA DE DADOS': 'FDM',
      'ACELERADOR PARA DESENVOLVIMENTO SOCIOECONOMICO': 'FDM + GIS',
      'ACELERADOR PARA GEOLOCALIZACAO DE ATIVOS': 'FDM + GIS',
      'ACELERADOR PARA INTEGRACAO E CONSOLIDACAO DE DADOS': 'FDM',
      'ACELERADOR PARA MAPAS TERMICOS': 'FDM + GIS',
      'ACELERADOR PARA O APOIO A TOMADA DE DECISOES ESTRATEGICAS': 'FDM',
      'ANALISE DE PRECEDENTES': 'FDM',
      'APLICATIVO DE BOT E ACELERADOR CCAI': 'FDM',
      'CENTRO DE EXCELENCIA COE': 'CoE',
      'CLASSIFICACAO DE EMAIL E CHAT': 'FDM',
      'DOC INTELLIGENCE': 'FDM',
      'GENAI SEARCH': 'FDM',
      'INSPECAO VISUAL': 'FDM',
      'PESQUISA CONTEXTUAL': 'FDM',
      'RESUMO DE DOCUMENTOS': 'FDM',
      'SOLUCAO VERTICAL JUSTICE': 'FDM',
      'SOLUCAO VERTICAL LEGAL': 'FDM',
      'SOLUCAO VERTICAL PQRS': 'FDM',
      'TRANSCRICAO DE VIDEO': 'FDM',
      'VIRTUAL CAREER CENTER': 'Carreira',
      'VIRTUAL CAREER CENTER GERACAO CV': 'Carreira',
      'VIRTUAL CAREER CENTER MATCH CANDIDATOS': 'Carreira',
      'VIRTUAL CAREER CENTER MATCH VAGAS': 'Carreira'
    };

    const searchable = [normalize(familyRaw), productText].filter(Boolean).join(' | ');
    const matchedKey = Object.keys(specificMap).find((key) => searchable.includes(key));
    if (matchedKey) {
      return specificMap[matchedKey];
    }
    return 'Outros Aceleradores';
  }

  return 'Outros Portfólios';
}

function buildClosedOutputRow(runId, mode, item, profile, fiscal, ia, labels, activityData, detailedChanges, activityBreakdown) {
  const status = (mode === 'WON') ? "GANHO" : "PERDA";
  const resumo = ia.resumo || ia.justificativa || "-";
  const causa = ia.causa_raiz || "-";
  const tipo = ia.tipo_resultado || "-";
  const fatores = (ia.fatores_sucesso || []).join(", ") || "-";
  const causasSecundarias = (ia.causas_secundarias || []).join(", ") || "-";
  const qualidadeEngajamento = ia.qualidade_engajamento || "-";
  const gestaoOpp = ia.gestao_oportunidade || "-";
  const evitavel = ia.evitavel || "-";
  const sinaisAlerta = (ia.sinais_alerta || []).join(", ") || "-";
  const momentoCritico = ia.momento_critico || "-";
  const licoesAprendidas = ia.licoes_aprendidas || "-";
  
  // VALIDAÇÃO DE CICLO (se existir)
  if (item.ciclo && item.created && item.closed) {
    const cicloValidation = validateCiclo_(item.ciclo, item.created, item.closed, item.oppName);
    if (!cicloValidation.isValid) {
      labels.push(cicloValidation.issue);
    }
  }
  
  // Pré-formatar datas uma única vez
  const closedDateFormatted = item.closed ? formatDateRobust(item.closed) : "-";
  const verticalIA = item.verticalIA || "-";
  const subVerticalIA = item.subVerticalIA || "-";
  const subSubVerticalIA = item.subSubVerticalIA || "-";
  const justificativaSegmentacaoIA = item.justificativaIA || "-";
  const lastUpdateFormatted = formatDateRobust(new Date());

  return [
    runId,
    item.oppName,
    item.accName,
    profile,
    item.owner,
    item.gross,
    item.net,
    item.portfolio || "-",
    item.segment || "-",
    item.productFamily || "-",
    status,
    fiscal.label,
    closedDateFormatted,
    item.ciclo || "-",
    item.products || "-",
    resumo,
    causa,
    mode === 'WON' ? fatores : causasSecundarias,
    tipo,
    mode === 'WON' ? qualidadeEngajamento : evitavel,
    mode === 'WON' ? gestaoOpp : sinaisAlerta,
    mode === 'WON' ? "-" : momentoCritico,
    licoesAprendidas,
    activityData.count || 0,
    activityBreakdown.last7Days || 0,
    activityBreakdown.last30Days || 0,
    activityBreakdown.typeDistribution || "-",
    activityBreakdown.peakPeriod || "-",
    activityBreakdown.avgCadence || "-",
    detailedChanges.totalChanges || 0,
    detailedChanges.criticalChanges || 0,
    detailedChanges.closeDateChanges || 0,
    detailedChanges.stageChanges || 0,
    detailedChanges.valueChanges || 0,
    detailedChanges.topFields || "-",
    detailedChanges.changePattern || "-",
    detailedChanges.changeFrequency || "-",
    detailedChanges.uniqueEditors || 0,
    labels.join(", "),
    item.ownerPreventa || "-",
    item.billingCity || "-",
    item.billingState || "-",
    verticalIA,
    subVerticalIA,
    subSubVerticalIA,
    lastUpdateFormatted  // Col 40: Timestamp da última análise
  ];
}

function calculateFiscalQuarter(date) {
  let parsedDate = date;
  if (!(parsedDate instanceof Date)) {
    parsedDate = parseDate(parsedDate);
  }
  if (!parsedDate || !(parsedDate instanceof Date)) {
    logToSheet("ERROR", "QuarterCalc", `❌ calculateFiscalQuarter: date inválido! type=${typeof date}, value=${date}`);
    return { label: "N/A", year: 0, q: 0 };
  }
  
  // Validar se é data válida (não NaN)
  if (isNaN(parsedDate.getTime())) {
    logToSheet("ERROR", "QuarterCalc", `❌ calculateFiscalQuarter: date é NaN! value=${parsedDate}`);
    return { label: "N/A", year: 0, q: 0 };
  }
  
  // ============================================================================
  // CALENDÁRIO FISCAL (JANEIRO A DEZEMBRO)
  // Calcula dinamicamente o fiscal year baseado na data de fechamento
  // ============================================================================
  // Q1: Janeiro, Fevereiro, Março (meses 0, 1, 2)
  // Q2: Abril, Maio, Junho (meses 3, 4, 5)
  // Q3: Julho, Agosto, Setembro (meses 6, 7, 8)
  // Q4: Outubro, Novembro, Dezembro (meses 9, 10, 11)
  // ============================================================================
  
  const month = parsedDate.getMonth(); // 0-11 (0=Janeiro, 11=Dezembro)
  const year = parsedDate.getFullYear();
  
  // Calcula quarter: Jan-Mar=Q1, Abr-Jun=Q2, Jul-Set=Q3, Out-Dez=Q4
  let q;
  if (month >= 0 && month <= 2) q = 1;      // Jan-Mar
  else if (month >= 3 && month <= 5) q = 2; // Abr-Jun
  else if (month >= 6 && month <= 8) q = 3; // Jul-Set
  else q = 4;                                // Out-Dez
  
  // Calcula start e end do quarter
  const startMonth = (q - 1) * 3;
  const endMonth = q * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, endMonth, 0); // Último dia do último mês do quarter
  
  return { 
    label: `FY${String(year).slice(-2)}-Q${q}`, 
    year: year, 
    q: q,
    start: start,
    end: end
  };
}

/**
 * Converte o texto do Pipeline_Aberto "Período fiscal" para o padrão FYyy-Qn.
 * Exemplos aceitos: "T1-2026", "T2/2026", "T3 2026", "Q4-2027", "FY26-Q1".
 * Retorna objeto compatível com calculateFiscalQuarter() ou null se não reconhecido.
 */
function parsePipelineFiscalQuarter_(rawFiscal) {
  if (rawFiscal === null || rawFiscal === undefined) return null;
  const s0 = String(rawFiscal).trim();
  if (!s0) return null;

  // Normaliza: remove espaços, troca travessões por '-', uppercase
  const s = s0
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");

  // Já está no formato final
  const fy = s.match(/^FY(\d{2})-Q([1-4])$/);
  if (fy) {
    const year = 2000 + parseInt(fy[1], 10);
    const q = parseInt(fy[2], 10);
    const startMonth = (q - 1) * 3;
    const endMonth = q * 3;
    return {
      label: `FY${String(year).slice(-2)}-Q${q}`,
      year: year,
      q: q,
      start: new Date(year, startMonth, 1),
      end: new Date(year, endMonth, 0)
    };
  }

  // Aceita Tn-YYYY, Tn/YYYY, TnYYYY, Qn-YYYY...
  const m = s.match(/^(?:T|Q)([1-4])[-/]?(\d{2}|\d{4})$/);
  if (!m) return null;

  const q = parseInt(m[1], 10);
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (!year || year < 2000 || year > 2100) return null;

  const startMonth = (q - 1) * 3;
  const endMonth = q * 3;
  return {
    label: `FY${String(year).slice(-2)}-Q${q}`,
    year: year,
    q: q,
    start: new Date(year, startMonth, 1),
    end: new Date(year, endMonth, 0)
  };
}

/**
 * Fiscal Q para OPEN: usa EXCLUSIVAMENTE item.fiscalQ (Período fiscal).
 * Para WON/LOST, mantém cálculo por data de fechamento quando necessário.
 */
function calculateFiscalQuarterForItem_(item, mode) {
  const parsed = parsePipelineFiscalQuarter_(item && item.fiscalQ);
  if (parsed) return parsed;
  if (mode === 'OPEN') {
    return { label: "N/A", year: 0, q: 0 };
  }
  return calculateFiscalQuarter(item ? item.closed : null);
}

/**
 * Calcula o valor que será reconhecido no quarter baseado no calendário de faturação
 * @param {string} billingCalendar - Ex: "Mensual x 1 año", "Anual x 3 años"
 * @param {number} totalValue - Valor total do deal
 * @param {Date} closeDate - Data de fechamento
 * @return {Object} { recognizedValue: number, calendarType: string, details: string }
 */
function calculateQuarterRecognizedValue(billingCalendar, totalValue, closeDate) {
  // Debug: Log apenas primeiras 3 chamadas
  if (!calculateQuarterRecognizedValue.debugCount) calculateQuarterRecognizedValue.debugCount = 0;
  
  if (!billingCalendar || !totalValue || !closeDate) {
    if (calculateQuarterRecognizedValue.debugCount < MAX_DEBUG_LOGS) {
      const closeDateStr = closeDate ? new Date(closeDate).toLocaleDateString('pt-BR') : 'NULL';
      logToSheet("DEBUG", "QuarterCalc", `⚠️ Retorno early: calendar="${billingCalendar || 'VAZIO'}", value=${totalValue || 0}, closeDate=${closeDateStr}`);
      calculateQuarterRecognizedValue.debugCount++;
    }
    return { 
      q1: 0, 
      q2: 0, 
      q3: 0, 
      q4: 0,
      calendarType: "-", 
      details: "0" 
    };
  }

  // CRÍTICO: Adiciona 1 mês ao closeDate para refletir o delay de faturamento
  // Ex: Fechou em Janeiro → Primeiro pagamento em Fevereiro
  const parsedCloseDate = parseDate(closeDate);
  if (!parsedCloseDate || isNaN(parsedCloseDate.getTime())) {
    if (calculateQuarterRecognizedValue.debugCount < MAX_DEBUG_LOGS) {
      logToSheet("ERROR", "QuarterCalc", `❌ closeDate inválido! value=${closeDate}`);
      calculateQuarterRecognizedValue.debugCount++;
    }
    return { 
      q1: 0, 
      q2: 0, 
      q3: 0, 
      q4: 0,
      calendarType: "-", 
      details: "0" 
    };
  }
  const actualCloseDate = new Date(parsedCloseDate);
  const firstPaymentDate = new Date(actualCloseDate);
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
  
  const calendar = normText_(billingCalendar);
  
  // DEBUG: Log detalhado da data ANTES de calcular quarter
  if (calculateQuarterRecognizedValue.debugCount < MAX_DEBUG_LOGS) {
    logToSheet("DEBUG", "QuarterCalc", `📅 PRE-QUARTER: closeDate type=${typeof closeDate}, instanceof=${closeDate instanceof Date}, isNaN=${isNaN(closeDate?.getTime())}, value=${closeDate}`);
    logToSheet("DEBUG", "QuarterCalc", `📅 firstPayment type=${typeof firstPaymentDate}, instanceof=${firstPaymentDate instanceof Date}, isNaN=${isNaN(firstPaymentDate?.getTime())}, value=${firstPaymentDate}`);
  }
  
  const quarter = calculateFiscalQuarter(firstPaymentDate); // Usa data do primeiro pagamento
  const firstPaymentMonth = firstPaymentDate.getMonth() + 1; // 1-12
  
  if (calculateQuarterRecognizedValue.debugCount < MAX_DEBUG_LOGS) {
    logToSheet("DEBUG", "QuarterCalc", `✅ Calculando: calendar="${billingCalendar}" → norm="${calendar}", value=${totalValue}, closeDate=${actualCloseDate.toLocaleDateString('pt-BR')}, firstPayment=${firstPaymentDate.toLocaleDateString('pt-BR')} (Q${quarter.q}), quarter=${JSON.stringify(quarter)}`);
    calculateQuarterRecognizedValue.debugCount++;
  }
  
  // Parseia o calendário: "MENSAL X 1 ANO", "ANUAL X 3 ANOS"
  let frequency = "ANUAL"; // default
  let years = 1;
  
  // FORÇA CACHE REFRESH - v52.0 - DISTRIBUIÇÃO PROPORCIONAL
  const CACHE_VERSION = "52.0";
  
  if (/MENSAL/.test(calendar) && !/ANUAL/.test(calendar.replace(/MENSAL/, ''))) {
    frequency = "MENSUAL";
  } else if (/ANUAL/.test(calendar)) {
    frequency = "ANUAL";
  }
  
  // Extrai número de anos
  const yearMatch = calendar.match(/(\d+)\s*(ANO|YEAR)/);
  if (yearMatch) {
    years = parseInt(yearMatch[1]);
  }
  
  let q1 = 0, q2 = 0, q3 = 0, q4 = 0;
  let details = "";
  
  // Define qual quarter começa (baseado no primeiro pagamento)
  const startQuarter = quarter.q; // 1, 2, 3 ou 4
  
  // VALIDAÇÃO CRÍTICA: Se quarter.q está undefined, algo deu errado
  if (!startQuarter || startQuarter < 1 || startQuarter > 4) {
    if (calculateQuarterRecognizedValue.debugCount < MAX_DEBUG_LOGS) {
      logToSheet("ERROR", "QuarterCalc", `❌ startQuarter inválido! quarter=${JSON.stringify(quarter)}, firstPaymentDate=${firstPaymentDate.toLocaleDateString('pt-BR')}`);
      calculateQuarterRecognizedValue.debugCount++;
    }
    return {
      q1: 0, 
      q2: 0, 
      q3: 0, 
      q4: 0,
      calendarType: "-", 
      details: "Erro: Quarter inválido"
    };
  }
  
  // DEBUG CRÍTICO: Mostra o valor de frequency ANTES do if
  logToSheet("DEBUG", "QuarterCalc", `🔍 ANTES DO IF: frequency="${frequency}", calendar="${calendar}"`);
  
  if (frequency === "MENSUAL") {
    // Mensal: distribui proporcionalmente pelos quarters baseado no mês de início
    const totalMonths = years * 12;
    const monthlyValue = totalValue / totalMonths;
    
    // DEBUG - SEMPRE LOGA (sem limite)
    logToSheet("DEBUG", "QuarterCalc", `🔢 MENSAL: totalMonths=${totalMonths}, monthlyValue=${monthlyValue.toFixed(2)}, firstPaymentMonth=${firstPaymentMonth}, startQuarter=${startQuarter}`);
    
    // Distribui valor começando do MÊS do primeiro pagamento
    // NOTA: Para contratos multi-ano, retorna apenas o valor do ano fiscal atual (12 meses)
    const quarterValues = [0, 0, 0, 0];
    let currentMonth = firstPaymentMonth; // 1-12
    let remainingMonths = Math.min(totalMonths, 12); // APENAS OS PRIMEIROS 12 MESES DO CONTRATO
    
    while (remainingMonths > 0) {
      // Calcular qual quarter este mês pertence (0-3)
      const currentQuarter = Math.floor((currentMonth - 1) / 3);
      
      // Quantos meses faltam até o fim deste quarter?
      const monthsUntilQuarterEnd = 3 - ((currentMonth - 1) % 3);
      
      // Quantos meses vamos alocar neste quarter?
      const monthsInThisQuarter = Math.min(monthsUntilQuarterEnd, remainingMonths);
      
      quarterValues[currentQuarter] += monthlyValue * monthsInThisQuarter;
      
      // DEBUG detalhado: mostra a distribuição mês a mês
      if (remainingMonths === Math.min(totalMonths, 12)) { // Apenas primeira iteração
        logToSheet("DEBUG", "QuarterCalc", `📊 Iniciando distribuição: Mês ${currentMonth} → Q${currentQuarter + 1}, alocando ${monthsInThisQuarter} meses`);
      }
      
      // Avançar para o próximo período
      currentMonth += monthsInThisQuarter;
      if (currentMonth > 12) break; // Para quando passar de Dezembro (não volta para Janeiro)
      remainingMonths -= monthsInThisQuarter;
    }
    
    q1 = quarterValues[0];
    q2 = quarterValues[1];
    q3 = quarterValues[2];
    q4 = quarterValues[3];
    
    details = `${totalMonths} meses | Inicia em Q${startQuarter} | ${formatMoney(monthlyValue)}/mês`;
  } else if (frequency === "ANUAL") {
    // Anual: valor concentrado no quarter do primeiro pagamento
    const yearlyValue = totalValue / years;
    
    // CORREÇÃO CRÍTICA: Para contratos multi-ano, coloca apenas yearlyValue do primeiro ano
    // O valor total será distribuído ao longo dos anos, não tudo no primeiro quarter
    const valueToRecognize = yearlyValue; // Apenas o valor de 1 ano
    
    // Coloca o valor anual no quarter do primeiro pagamento
    if (startQuarter === 1) q1 = valueToRecognize;
    else if (startQuarter === 2) q2 = valueToRecognize;
    else if (startQuarter === 3) q3 = valueToRecognize;
    else if (startQuarter === 4) q4 = valueToRecognize;
    
    if (years === 1) {
      details = `Pagamento anual completo em Q${startQuarter}`;
    } else {
      details = `${years} anos | ${formatMoney(yearlyValue)}/ano | Ano 1 reconhecido em Q${startQuarter}`;
    }
  }
  
  // Traduzir frequência para português
  const freqPT = frequency === "MENSUAL" ? "MENSAL" : "ANUAL";
  
  return {
    q1: Math.round(q1 * 100) / 100,
    q2: Math.round(q2 * 100) / 100,
    q3: Math.round(q3 * 100) / 100,
    q4: Math.round(q4 * 100) / 100,
    calendarType: `${freqPT} x ${years} ano${years > 1 ? 's' : ''}`,
    details: details
  };
}

function normText_(s) {
  cleanNormCacheIfNeeded_();
  const key = String(s || "");
  if (NORM_TEXT_CACHE_[key]) return NORM_TEXT_CACHE_[key];
  
  const result = key
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  
  NORM_TEXT_CACHE_[key] = result;
  return result;
}

/**
 * Detecta se a oportunidade é do tipo que deve ser tratada por Alex Araújo
 * (Transfer Token, Renovação, Pós-Venda, Adição de Licenças)
 * @param {Object} item - Objeto da oportunidade com todos os campos
 * @return {boolean} true se for oportunidade de Alex Araújo
 */
function isAlexAraujoOpportunity_(item) {
  const products = normText_(item.products || "");
  const desc = normText_(item.desc || "");
  const productFamily = normText_(item.productFamily || "");
  const oppName = normText_(item.oppName || "");
  
  // Palavras-chave que indicam oportunidades de Alex Araújo
  const keywords = [
    'TRANSFER TOKEN', 'TRANSFERENCIA TOKEN', 'TOKEN TRANSFER',
    'RENOVACAO', 'RENEWAL', 'RENEW',
    'POS VENDA', 'POS-VENDA', 'POSVENDA', 'POST SALES', 'POST-SALES',
    'ADICAO', 'ADD-ON', 'ADDON', 'UPSELL',
    'AUMENTO DE LICENCA', 'AUMENTO LICENCA', 'LICENSE INCREASE',
    'EXPANSION', 'EXPANSAO', 'AMPLIACAO'
  ];
  
  // Verifica em todos os campos relevantes
  const allText = `${products} ${desc} ${productFamily} ${oppName}`;
  
  return keywords.some(keyword => allText.includes(keyword));
}

/**
 * Encontra o vendedor designado para uma oportunidade.
 * Considera tanto território geográfico quanto tipo de deal (Alex Araújo).
 * @param {string} locationNameFromCrm - O valor da coluna "Estado/Província de cobrança" ou "Cidade de cobrança".
 * @param {Object} item - Objeto completo da oportunidade
 * @return {string} O nome do vendedor designado (normalizado) ou "INDEFINIDO".
 */
function getDesignatedSellerForLocation(locationNameFromCrm, item) {
  // PRIORIDADE 1: Verifica se é oportunidade de Alex Araújo (não depende de geografia)
  if (item && isAlexAraujoOpportunity_(item)) {
    return normText_("ALEX ARAUJO");
  }
  
  // PRIORIDADE 2: Validação por território geográfico
  let location = locationNameFromCrm;
  let detectedFrom = "CRM"; // Rastreamento para output
  
  // FALLBACK: Se location está vazia, tenta inferir do nome da conta
  if (!location && item && item.accName) {
    const accName = normText_(item.accName);
    detectedFrom = "FALLBACK";
    
    // PRIORIDADE: Órgãos federais (União, AGU, AGE, Advocacia-Geral) = DF
    if (/\bAGU\b|ADVOCACIA.{0,10}GERAL.{0,10}UNIAO|UNIAO|FEDERAL\b|GOVERNO FEDERAL/.test(accName)) {
      location = "DISTRITO FEDERAL";
      logToSheet("DEBUG", "Territory", `✅ FALLBACK Federal → DF | Conta: ${item.accName}`);
    }
    // Mapeia siglas conhecidas de órgãos governamentais estaduais e regionais
    else if (/\bDF\b|DISTRITO FEDERAL|BRASILIA/.test(accName)) {
      location = "DISTRITO FEDERAL";
      logToSheet("DEBUG", "Territory", `✅ FALLBACK DF | Conta: ${item.accName}`);
    }
    else if (/\bAGE\s+MG\b|AGE-MG|\bMG\b|MINAS GERAIS|BELO HORIZONTE/.test(accName)) {
      location = "MINAS GERAIS";
      logToSheet("DEBUG", "Territory", `✅ FALLBACK MG | Conta: ${item.accName}`);
    }
    else if (/\bATDI\b|AGENCIA.{0,20}TOCANTINS|\bTO\b|TOCANTINS|PALMAS/.test(accName)) {
      location = "TOCANTINS";
      logToSheet("DEBUG", "Territory", `✅ FALLBACK TO | Conta: ${item.accName}`);
    }
    else if (/\bSP\b|SAO PAULO/.test(accName)) location = "SAO PAULO";
    else if (/\bRJ\b|RIO DE JANEIRO/.test(accName)) location = "RIO DE JANEIRO";
    else if (/\bGO\b|GOIAS|GOIANIA/.test(accName)) location = "GOIAS";
    else if (/\bMT\b|MATO GROSSO|CUIABA/.test(accName)) location = "MATO GROSSO";
    else if (/\bMS\b|MATO GROSSO DO SUL|CAMPO GRANDE/.test(accName)) location = "MATO GROSSO DO SUL";
    else if (/\bPR\b|PARANA|CURITIBA/.test(accName)) location = "PARANA";
    else if (/\bSC\b|SANTA CATARINA|FLORIANOPOLIS/.test(accName)) location = "SANTA CATARINA";
    else if (/\bRS\b|RIO GRANDE DO SUL|PORTO ALEGRE/.test(accName)) location = "RIO GRANDE DO SUL";
    else if (/\bES\b|ESPIRITO SANTO|VITORIA/.test(accName)) location = "ESPIRITO SANTO";
    else if (/\bBA\b|BAHIA|SALVADOR/.test(accName)) location = "BAHIA";
    else if (/\bCE\b|CEARA|FORTALEZA/.test(accName)) location = "CEARA";
    else if (/\bPE\b|PERNAMBUCO|RECIFE/.test(accName)) location = "PERNAMBUCO";
    else if (/\bAM\b|AMAZONAS|MANAUS/.test(accName)) location = "AMAZONAS";
    else if (/\bPA\b|PARA|BELEM/.test(accName)) location = "PARA";
    else if (/\bPI\b|PIAUI|TERESINA/.test(accName)) location = "PIAUI";
    else if (/\bMA\b|MARANHAO|SAO LUIS/.test(accName)) location = "MARANHAO";
    else if (/\bAL\b|ALAGOAS|MACEIO/.test(accName)) location = "ALAGOAS";
    else if (/\bSE\b|SERGIPE/.test(accName)) location = "SERGIPE";
    else if (/\bRN\b|RIO GRANDE DO NORTE/.test(accName)) location = "RIO GRANDE DO NORTE";
    else if (/\bPB\b|PARAIBA/.test(accName)) location = "PARAIBA";
    else if (/\bAC\b|ACRE|RIO BRANCO/.test(accName)) location = "ACRE";
    else if (/\bAP\b|AMAPA|MACAPA/.test(accName)) location = "AMAPA";
    else if (/\bRO\b|RONDONIA|PORTO VELHO/.test(accName)) location = "RONDONIA";
    else if (/\bRR\b|RORAIMA/.test(accName)) location = "RORAIMA";
  }
  
  if (!location) {
    // Log apenas primeiras 3 ocorrências
    if (!getDesignatedSellerForLocation.emptyCount) getDesignatedSellerForLocation.emptyCount = 0;
    if (getDesignatedSellerForLocation.emptyCount < 3) {
      logToSheet("DEBUG", "Territory", `❌ Location vazia para: ${item?.oppName} | Conta: ${item?.accName}`);
      getDesignatedSellerForLocation.emptyCount++;
    }
    return "INDEFINIDO";
  }

  // Usa a função de normalização existente para limpar o nome
  const normalizedLocation = normText_(location);

  // Tenta encontrar a sigla (UF) a partir do nome do local
  const uf = STATE_NAME_TO_UF_MAP[normalizedLocation];

  // Log apenas primeiras 5 resoluções para debug
  if (!getDesignatedSellerForLocation.debugCount) getDesignatedSellerForLocation.debugCount = 0;
  if (getDesignatedSellerForLocation.debugCount < 5) {
    logToSheet("DEBUG", "Territory", `📍 "${location}" → Norm:"${normalizedLocation}" → UF:"${uf || 'NAO ENCONTRADO'}" | Conta: ${item?.accName}`);
    getDesignatedSellerForLocation.debugCount++;
  }

  // Se não encontrou uma UF, o local é desconhecido para o mapa
  if (!uf) {
    // Log locais não mapeados (primeiros 5)
    if (!getDesignatedSellerForLocation.unmappedCount) getDesignatedSellerForLocation.unmappedCount = 0;
    if (getDesignatedSellerForLocation.unmappedCount < 5) {
      logToSheet("WARN", "Territory", `⚠️ Location não mapeada: "${location}" (normalizado: "${normalizedLocation}") | Conta: ${item?.accName}`);
      getDesignatedSellerForLocation.unmappedCount++;
    }
    return "INDEFINIDO";
  }

  // Retorna o vendedor correspondente à UF encontrada, também normalizado
  const seller = normText_(UF_TO_SELLER_MAP[uf] || "INDEFINIDO");
  
  // Armazena dados de detecção no item para output
  if (item) {
    item._detectedLocation = location;
    item._detectionSource = detectedFrom;
    item._detectedUF = uf;
  }
  
  return seller;
}

function normalizeStage_(stage) {
  const s = normText_(stage);
  if (!s) return "";
  if (/QUALIF/.test(s)) return "Qualificar";
  if (/AVALIAC|EVALUAT/.test(s)) return "Avaliação";
  if (/PROPOST|PROPOSAL/.test(s)) return "Proposta";
  if (/DEAL DESK/.test(s)) return "Deal Desk";
  if (/NEGOCIAC|NEGOTIAT/.test(s)) return "Negociação";
  if (/VERIFICAC|VERIFICAT/.test(s)) return "Verificação";
  if (/FECH|CLOSE|CLOSING/.test(s)) return "Fechamento";
  return stage || "";
}

function buildOppKey_(accName, oppName, createdDate) {
  const acc = normText_(accName);
  const opp = normText_(oppName);
  const createdObj = parseDate(createdDate);
  const created = createdObj ? Utilities.formatDate(createdObj, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
  return `${acc}|${opp}|${created}`;
}

function getRunId_(mode) {
  const props = PropertiesService.getScriptProperties();
  const key = `RUN_ID_${mode}`;
  let runId = props.getProperty(key);
  if (!runId) {
    runId = new Date().toISOString();
    props.setProperty(key, runId);
  }
  return runId;
}

function countFieldChanges_(changes, headers, fieldNames) {
  if (!changes || !changes.length) return 0;
  const h = headers.map(x => normText_(x));
  
  // Busca coluna "Field / Event" com variações PT-BR
  const findIdx = (cands) => { for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; } return -1; };
  const colField = findIdx(["Field / Event", "Campo/Compromisso", "Campo / Compromisso", "Campo"]);
  
  if (colField === -1) return 0;
  const targets = fieldNames.map(f => normText_(f));
  return changes.filter(c => {
    const f = normText_(c[colField]);
    return targets.some(t => f.includes(t));
  }).length;
}

function normalizeLossReason_(text) {
  const t = normText_(text);
  if (!t) return "OUTRO";
  if (/(PRECO|PRICE)/.test(t)) return "PRECO";
  if (/(CONCORR|COMPET)/.test(t)) return "CONCORRENCIA";
  if (/(PRAZO|TIMING|TEMPO)/.test(t)) return "TIMING";
  if (/(SEM CHAMPION|SEM PATROCINADOR|SEM SPONSOR)/.test(t)) return "SEM_CHAMPION";
  if (/(DESQUALIF|DISQUAL)/.test(t)) return "DESQUALIFICACAO";
  return "OUTRO";
}

function getWinRateByOwner_() {
  const cacheKey = "WIN_RATE_BY_OWNER";
  if (SHEET_CACHE_[cacheKey]) return SHEET_CACHE_[cacheKey];

  const wins = getSheetData(SHEETS.GANHAS);
  const losses = getSheetData(SHEETS.PERDIDAS);
  const map = new Map();

  const ownerIdxWins = wins ? getColumnMapping(wins.headers).p_owner : -1;
  const ownerIdxLoss = losses ? getColumnMapping(losses.headers).p_owner : -1;

  if (wins && ownerIdxWins > -1) {
    wins.values.forEach(r => {
      const owner = String(r[ownerIdxWins] || "").trim();
      if (!owner) return;
      if (!map.has(owner)) map.set(owner, { wins: 0, losses: 0 });
      map.get(owner).wins += 1;
    });
  }

  if (losses && ownerIdxLoss > -1) {
    losses.values.forEach(r => {
      const owner = String(r[ownerIdxLoss] || "").trim();
      if (!owner) return;
      if (!map.has(owner)) map.set(owner, { wins: 0, losses: 0 });
      map.get(owner).losses += 1;
    });
  }

  const rateMap = new Map();
  map.forEach((v, k) => {
    const total = v.wins + v.losses;
    rateMap.set(k, {
      rate: total > 0 ? v.wins / total : null,
      total: total,
      wins: v.wins,
      losses: v.losses
    });
  });

  SHEET_CACHE_[cacheKey] = rateMap;
  return rateMap;
}

function calculateIdleDays(lastActivityData, today) {
  if (!lastActivityData || !(lastActivityData instanceof Date)) return "SEM REGISTRO";
  const diffTime = today.getTime() - lastActivityData.getTime();
  const diffDays = Math.floor(diffTime / MS_PER_DAY);
  if (diffDays < 0) return 0; 
  return diffDays > 365 ? 365 : diffDays;
}

function getModeConfig(mode) {
  if (mode === 'WON') return { input: SHEETS.GANHAS, output: SHEETS.RESULTADO_GANHAS, changes: SHEETS.ALTERACOES_GANHAS };
  if (mode === 'LOST') return { input: SHEETS.PERDIDAS, output: SHEETS.RESULTADO_PERDIDAS, changes: SHEETS.ALTERACOES_PERDIDAS };
  return { input: SHEETS.ABERTO, output: SHEETS.RESULTADO_PIPELINE, changes: SHEETS.ALTERACOES_ABERTO };
}

/**
 * Mapeamento Exato de Colunas (Schema Enforcement)
 */
/**
 * Mapeia colunas de diferentes planilhas para campos padronizados
 * 
 * ============================================================================
 * DOCUMENTAÇÃO DE CABEÇALHOS POR ABA (ATUALIZADO 2026-02-02)
 * ============================================================================
 * 
 * 📊 HISTORICO_GANHOS (46 colunas):
 * Nome da conta | Nome da oportunidade | Proprietário da oportunidade | 
 * Data de fechamento | Data de criação | Data da última mudança de fase | 
 * Proceso | Família de produtos | Preço total (convertido) | Quantidade | 
 * Plazo Producto (Meses) | Fecha de activación | Margen de Lista % | 
 * Margen % | Margen Total % | Descuento Fabricante % | Descuento Xertica % | 
 * Produto ativo | Origem do lead | Origem da campanha principal | DR | 
 * Segmento Consolidado | Período fiscal | Nombre Dominio | Consola | 
 * Productos con vigencia activa | Estado de activação de produtos | 
 * Monto no anulado | Tipo De Oportunidade | Portafolio | Portafolio Xertica.Ai | 
 * Fecha de facturación | Cidade de cobrança | Estado/Província de cobrança | 
 * Fecha Inicio Contrato | Fecha Fin Contrato | Margen Total $ (convertido) | 
 * Nome do produto | Categoria SDR | Razão Social | Descrição | Descripción | 
 * Ano fiscal | Calculadora Horas | Calculadora ROI | Próxima etapa | 
 * Fecha ultimo cambio Next Step | Data da próxima atividade | Top deal | 
 * Owner Preventa | GCP Billing ID | Calendario facturación
 * 
 * ❌ HISTORICO_PERDIDAS (38 colunas):
 * Razón de pérdida | Nome da conta | Nome da oportunidade | 
 * Proprietário da oportunidade | Data de criação | Data de fechamento | 
 * Período fiscal | Data da última mudança de fase | Data do último compromisso | 
 * Fase | Duração da fase | Preço total (convertido) | Margen Total $ (convertido) | 
 * Descrição | Descripción | Tipo De Oportunidade | Nome do produto | 
 * Família de produtos | Probabilidade (%) | Oportunidad Generada | 
 * Origem da campanha principal | Tipo incentivo en google | DR | Forecast | 
 * Subsegmento de mercado | Setor | Contacto Negociación | Contato principal | 
 * Contato: Cargo | Contato: Email | Contato: Telefone | Telefone | 
 * Subsidiaria | Portafolio Xertica.Ai | Descripción de la pérdida | 
 * Motivo descalificación | Fecha de aplazamiento | Perdida por Competencia | 
 * Top deal | Categoria SDR
 * 
 * 📈 PIPELINE ABERTO (55 colunas):
 * Nome da conta | Nome da oportunidade | Proprietário da oportunidade | 
 * Data de criação | Data de fechamento | Data da última mudança de fase | 
 * Data da última atividade | Data do último compromisso | 
 * Conta: Última atividade | Dias inativos | Proceso | Nome do produto | 
 * Preço total (convertido) | Margen Total $ | Margen de Lista % | 
 * Portafolio | Fase | Duração da fase | Probabilidade (%) | Origem do lead | 
 * Origem da campanha principal | DR | Família de produtos | Forecast | 
 * Subsegmento de mercado | Subsidiaria | Tipo De Oportunidad | Descrição | 
 * Descripción | Tipo incentivo en google | Período fiscal | 
 * Portafolio Xertica.Ai | Segmento Consolidado | 
 * Atividades dos últimos 7 dias | Atividades dos últimos 30 dias | 
 * Endereço de cobrança Linha 1 | Cidade de cobrança | 
 * Estado/Província de cobrança | País de cobrança | Top deal | 
 * Owner Preventa | Preventa | Preventa principal | #PreventasAbiertos | 
 * Categoria SDR | Próxima etapa | Data da próxima atividade | 
 * Fecha ultimo cambio Next Step | Calculadora Horas | Calculadora ROI | 
 * Calendario facturación | Fecha de facturación | ¿Aplica Marketplace? | 
 * Quantidade
 * 
 * 🎯 ANÁLISE FORECAST IA (55 colunas) - SEM "Created Date"!:
 * Run ID | Oportunidade | Conta | Perfil | Produtos | Vendedor | Gross | Net | 
 * Fase Atual | Forecast SF | Fiscal Q | Data Prevista | Ciclo (dias) | 
 * Dias Funil | Atividades | Atividades (Peso) | Mix Atividades | 
 * Idle (Dias) | Qualidade Engajamento | Forecast IA | Confiança (%) | 
 * Motivo Confiança | MEDDIC Score | MEDDIC Gaps | MEDDIC Evidências | 
 * BANT Score | BANT Gaps | BANT Evidências | Justificativa IA | 
 * Regras Aplicadas | Incoerência Detectada | Perguntas de Auditoria IA | 
 * Flags de Risco | Gaps Identificados | Cód Ação | Ação Sugerida | 
 * Risco Principal | # Total Mudanças | # Mudanças Críticas | 
 * Mudanças Close Date | Mudanças Stage | Mudanças Valor | 
 * 🚨 Anomalias Detectadas | Velocity Predição | Velocity Detalhes | 
 * Território Correto? | Vendedor Designado | Estado/Cidade Detectado | 
 * Fonte Detecção | Calendário Faturação | Valor Reconhecido Q1 | 
 * Valor Reconhecido Q2 | Valor Reconhecido Q3 | Valor Reconhecido Q4 | 
 * 🕐 Última Atualização
 * 
 * ✅ ANÁLISE GANHAS (40 colunas) - SEM "Created Date"!:
 * Run ID | Oportunidade | Conta | Perfil Cliente | Vendedor | Gross | Net | 
 * Portfólio | Segmento | Família Produto | Status | Fiscal Q | 
 * Data Fechamento | Ciclo (dias) | Produtos | 📝 Resumo Análise | 
 * 🎯 Causa Raiz | ✨ Fatores Sucesso | Tipo Resultado | 
 * Qualidade Engajamento | Gestão Oportunidade | - | 💡 Lições Aprendidas | 
 * # Atividades | Ativ. 7d | Ativ. 30d | Distribuição Tipos | 
 * Período Pico | Cadência Média (dias) | # Total Mudanças | 
 * # Mudanças Críticas | Mudanças Close Date | Mudanças Stage | 
 * Mudanças Valor | Campos + Alterados | Padrão Mudanças | Freq. Mudanças | 
 * # Editores | 🏷️ Labels | 🕐 Última Atualização
 * 
 * ❌ ANÁLISE PERDIDAS (40 colunas) - SEM "Created Date"!:
 * Run ID | Oportunidade | Conta | Perfil Cliente | Vendedor | Gross | Net | 
 * Portfólio | Segmento | Família Produto | Status | Fiscal Q | 
 * Data Fechamento | Ciclo (dias) | Produtos | 📝 Resumo Análise | 
 * 🎯 Causa Raiz | ⚠️ Causas Secundárias | Tipo Resultado | Evitável? | 
 * 🚨 Sinais Alerta | Momento Crítico | 💡 Lições Aprendidas | 
 * # Atividades | Ativ. 7d | Ativ. 30d | Distribuição Tipos | 
 * Período Pico | Cadência Média (dias) | # Total Mudanças | 
 * # Mudanças Críticas | Mudanças Close Date | Mudanças Stage | 
 * Mudanças Valor | Campos + Alterados | Padrão Mudanças | Freq. Mudanças | 
 * # Editores | 🏷️ Labels | 🕐 Última Atualização
 * 
 * IMPORTANTE:
 * - Históricos TÊM "Data de criação" / "Created Date"
 * - Análises NÃO TÊM "Created Date" (ciclo já calculado na coluna "Ciclo (dias)")
 * - Análise Forecast usa "Data Prevista" em vez de "Close Date"
 * - Análises já têm "Fiscal Q" calculado dinamicamente (ex: FY24-Q3, FY25-Q1, FY26-Q2, FY27-Q4)
 * - NET = 0 é NORMAL em perdidas e renovações orgânicas
 * ============================================================================
 */

// Cache global de headers normalizados
const HEADER_CACHE_ = {};

/**
 * Obtém headers normalizados do cache ou normaliza se necessário
 * @param {Array} headers - Array de headers brutos
 * @return {Array} Headers normalizados
 */
function getNormalizedHeaders_(headers) {
  const cacheKey = headers.join("||");
  
  if (!HEADER_CACHE_[cacheKey]) {
    HEADER_CACHE_[cacheKey] = headers.map(x => normText_(x));
  }
  
  return HEADER_CACHE_[cacheKey];
}

/**
 * Limpa o cache de headers (útil após atualizações de schema)
 */
function clearHeaderCache_() {
  Object.keys(HEADER_CACHE_).forEach(key => delete HEADER_CACHE_[key]);
  logToSheet("INFO", "Cache", "Cache de headers limpo");
}

function normalizeHeaderAliasForTable_(value) {
  return String(value || '')
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/-+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getColumnAliasCatalog_() {
  return {
    opp: ["Opportunity Name", "Nome da oportunidade", "Nome da Oportunidade", "Oportunidade", "Opportunity", "Oportunidad"],
    acc: ["Account Name", "Nome da conta", "Nome da Conta", "Company / Account", "Empresa/Conta", "Account", "Conta", "Cliente", "Empresa"],
    prod: ["Product Name", "Nome do produto", "Produtos", "Products", "Produto", "Producto"],
    prod_family: ["Product Family", "Família de produtos", "Familia de Producto", "Família de Produto"],
    owner_preventa: ["Owner Preventa", "Preventa", "Preventa principal", "Owner Pre Sales", "Pre Sales Owner"],
    billing_city: ["Cidade de cobrança", "Billing City", "Cidade de cobranca", "Cidade de Faturamento", "Cidade Cobrança"],
    billing_state: ["Estado/Província de cobrança", "Billing State/Province", "Estado de cobrança", "Estado/Provincia de cobranca", "Estado de cobranca", "Billing State", "Estado de Faturamento", "Estado Cobrança"],
    portfolio: ["Portafolio", "Portfólio", "Portfolio", "Portafolio Xertica.Ai", "Portafolio Xertica Ai", "Portfólio Xertica.Ai", "Portfolio Xertica.Ai", "Portafolio_XerticaAi"],
    categoria_sdr: ["Categoria SDR", "Categoria_SDR", "Categoria Sdr", "CategoriaSDR"],
    subsegmento_mercado: ["Subsegmento de mercado", "Subsegmento", "Subsegmento Mercado", "Subsegmento_de_mercado", "Subsegmento_mercado"],
    segmento_consolidado: ["Segmento Consolidado", "Segmento_Consolidado", "Segmento_consolidado"],
    portfolio_fdm: ["Portfolio FDM", "Portfolio_FDM", "Portfolio_Fdm", "Categoria_FDM", "CategoriaFDM"],
    vertical_ia: ["Vertical IA", "Vertical_IA"],
    sub_vertical_ia: ["Sub-vertical IA", "Sub_vertical_IA"],
    sub_sub_vertical_ia: ["Sub-sub-vertical IA", "Sub_sub_vertical_IA"],
    justificativa_ia: ["Justificativa IA", "Justificativa_IA"],
    data_criacao: ["Data de criação", "Data de criacao", "Created Date", "Date Created", "Data_de_criacao", "Data_de_criacao_DE_ONDE_PEGAR", "Created_Date"]
  };
}

function getAliasCandidates_(aliasKey, extraAliases) {
  const catalog = getColumnAliasCatalog_();
  const base = catalog[aliasKey] || [];
  const list = [...base, ...(Array.isArray(extraAliases) ? extraAliases : [])]
    .map(v => String(v || '').trim())
    .filter(Boolean);

  const withNormalized = [];
  list.forEach((item) => {
    withNormalized.push(item);
    withNormalized.push(normalizeHeaderAliasForTable_(item));
  });

  const unique = [];
  const seen = {};
  withNormalized.forEach((item) => {
    const k = normText_(item);
    if (!seen[k]) {
      seen[k] = true;
      unique.push(item);
    }
  });
  return unique;
}

function findColumnByAlias_(headers, aliasKey, extraAliases) {
  const h = getNormalizedHeaders_(headers || []);
  const candidates = getAliasCandidates_(aliasKey, extraAliases);
  for (let i = 0; i < candidates.length; i++) {
    const idx = h.indexOf(normText_(candidates[i]));
    if (idx > -1) return idx;
  }
  return -1;
}

function getFieldByAlias_(row, aliasKey, extraAliases) {
  if (!row || typeof row !== 'object') return null;
  const candidates = getAliasCandidates_(aliasKey, extraAliases);
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const val = row[key];
      if (val !== null && val !== undefined && String(val) !== '') return val;
    }
  }
  return null;
}

function getColumnMapping(headers) {
  const h = getNormalizedHeaders_(headers);
  
  const find = (possibleNames) => {
    for (let name of possibleNames) {
      const idx = h.indexOf(normText_(name));
      if (idx > -1) return idx;
    }
    return -1;
  };

  const mapping = {
    p_opp: find(["Opportunity Name", "Nome da oportunidade", "Nome da Oportunidade", "Oportunidade", "Opportunity", "Oportunidad"]),
    p_acc: find(["Account Name", "Nome da conta", "Nome da Conta", "Company / Account", "Empresa/Conta", "Account", "Conta", "Cliente", "Empresa"]),
    p_owner: find(["Opportunity Owner", "Proprietário da oportunidade", "Proprietario da oportunidade", "Owner", "Vendedor", "Responsável", "Responsavel"]),
    p_gross: find(["Total Price (converted)", "Preço total (convertido)", "Preco total (convertido)", "Total Price", "Amount", "Amount (converted)", "Valor", "Valor Total", "Gross", "Booking Total ($)Gross"]),
    p_net: find(["Margen Total $ (convertido)", "Margen Total $", "Margen Total %", "Margen Total % (convertido)", "Net Revenue", "Margin", "Net Amount", "Receita Liquida", "Valor Líquido", "Net"]), 
    p_date: find([
      // English
      "Close Date", "Date Closed", "Closed Date", "Closed", "CloseDate", "ClosedDate",
      "Closing Date", "Date Closing", "Closedate", "Data Fechamento",
      // Português
      "Data de fechamento", "Data Fechamento", "Data de Fechamento", "Data Fechada", 
      "Data de fechada", "Data de Encerramento", "Data Encerramento", "Data Fechamento",
      "Data Fechamento", "Data Closure", "Data de Encerrada", "Data Encerrada",
      // Español
      "Fecha de cierre", "Fecha cierre", "Fecha Cierre", "Fecha de Cierre", "Fecha Cerrada", "Fecha Cerrado",
      "Fecha de Cerrada", "Fecha Cerrado", "Fecha Cierre", "Fecha Clausura"
    ]),
    p_predicted_date: find(["Data Prevista", "Predicted Date", "Expected Close Date", "Data Esperada", "Fecha Prevista"]),
    p_fiscal_q: find(["Fiscal Q", "Fiscal Quarter", "Quarter Fiscal", "Q Fiscal", "Período fiscal", "Ano fiscal"]),
    p_stage: find(["Stage", "Fase", "Fase Atual", "Proceso", "Estado"]),
    p_desc: find(["Description", "Descrição", "Descripción", "Descripción de la pérdida"]),
    p_prod: find(["Product Name", "Nome do produto", "Produtos", "Products", "Produto", "Producto"]),
    p_prob: find(["Probability (%)", "Probabilidade (%)", "Probabilidad (%)"]),
    p_reason: find(["Razón de pérdida", "Razao de perda", "Razón de pérdida"]),
    p_created: find([
      // English
      "Created Date", "Date Created", "Created", "Create Date", "Creation Date", "Date of Creation",
      // Português
      "Data de criação", "Data de criacao", "Data Criação", "Data Criacao", "Criada", "Criado", 
      "Data de Criação", "Data de Criacao", "Data Criada", "Data Criado",
      "Data de criação (DE ONDE PEGAR)", "Data de criacao (DE ONDE PEGAR)",
      "Data de criação (de onde pegar)", "Data de criacao (de onde pegar)",
      "Data de criação de onde pegar", "Data de criacao de onde pegar",
      // Español
      "Fecha de creación", "Fecha creación", "Fecha de creacion", "Fecha Creacion", "Creado", "Creada",
      "Fecha de Creación", "Fecha de Creacion", "Fecha Creada"
    ]),
    p_phase_change: find(["Data da última mudança de fase", "Data de última mudança de fase", "Data de la última mudança de fase"]),
    p_inactive: find(["Inactive Days", "Dias inativos"]),
    p_next_activity: find(["Next Activity Date", "Data da próxima atividade", "Data da proxima atividade", "Próxima Atividade", "Proxima Atividade"]),
    p_forecast: find(["Forecast", "Forecast SF", "Forecast IA"]),
    p_portfolio: findColumnByAlias_(headers, "portfolio"),
    p_categoria_sdr: findColumnByAlias_(headers, "categoria_sdr"),
    p_vertical_ia: findColumnByAlias_(headers, "vertical_ia"),
    p_sub_vertical_ia: findColumnByAlias_(headers, "sub_vertical_ia"),
    p_sub_sub_vertical_ia: findColumnByAlias_(headers, "sub_sub_vertical_ia"),
    p_owner_preventa: findColumnByAlias_(headers, "owner_preventa"),
    p_segment: find(["Segmento", "Segment", "Segmento Consolidado", "Subsegmento de mercado"]),
    p_subsegmento_mercado: findColumnByAlias_(headers, "subsegmento_mercado"),
    p_segmento_consolidado: findColumnByAlias_(headers, "segmento_consolidado"),
    p_id: find(["Opportunity ID", "Opportunity: ID", "Record ID", "Id"]),
    p_prod_family: findColumnByAlias_(headers, "prod_family"),
    p_ciclo: find([
      "Ciclo (dias)", "Ciclo", "Cycle (days)", "Cycle", 
      "Ciclo dias", "ciclo (dias)", "CICLO (DIAS)",
      "Duração", "Duracao", "Duration"
    ]),
    p_activities: find(["# Atividades", "Atividades", "Activities", "Activity Count"]),
    p_activities_7d: find(["Ativ. 7d", "Activities 7d", "Atividades 7 dias"]),
    p_activities_30d: find(["Ativ. 30d", "Activities 30d", "Atividades 30 dias"]),
    p_activity_mix: find(["Mix Atividades", "Distribuição Tipos", "Activity Mix"]),
    p_activity_weight: find(["Atividades (Peso)", "Activity Weight"]),
    p_idle_days: find(["Idle (Dias)", "Dias Idle", "Idle Days"]),
    p_ai_insight: find(["📝 Resumo Análise", "🎯 Causa Raiz", "Justificativa IA", "AI Insight", "Análise IA"]),
    p_confidence: find(["Confiança (%)", "Confiança", "Confidence (%)", "Confidence"]),
    p_forecast_ia: find(["Forecast IA", "AI Forecast", "Forecast AI"]),
    p_meddic_score: find(["MEDDIC Score", "Score MEDDIC"]),
    p_bant_score: find(["BANT Score", "Score BANT"]),
    p_risk_flags: find(["Flags de Risco", "Risk Flags", "Flags"]),
    p_audit_questions: find(["Perguntas de Auditoria IA", "Perguntas Auditoria", "Audit Questions"]),
    p_win_factors: find(["✨ Fatores Sucesso", "Fatores de Sucesso", "Success Factors"]),
    p_secondary_causes: find(["⚠️ Causas Secundárias", "Causas Secundárias", "Secondary Causes"]),
    p_engagement_quality: find(["Qualidade Engajamento", "Engagement Quality"]),
    p_opportunity_mgmt: find(["Gestão Oportunidade", "Opportunity Management", "Gestao Oportunidade"]),
    p_avoidable: find(["Evitável?", "Evitavel?", "Avoidable?"]),
    p_cod_acao: find(["Cód Ação", "Cod Acao", "Action Code", "Código Ação", "Codigo Acao"]),
    p_tipo_resultado: find(["Tipo Resultado", "Tipo de Resultado", "Result Type", "Tipo"]),
    p_labels: find(["🏷️ Labels", "Labels", "Tags", "Etiquetas"]),
    p_billing_state: findColumnByAlias_(headers, "billing_state"),
    p_billing_city: findColumnByAlias_(headers, "billing_city"),
    p_billing_calendar: find([
      // Espanhol
      "Calendario facturación", "Calendario facturacion", "Calendario de facturación", "Calendario de facturacion",
      // Português
      "Calendário de faturação", "Calendario de faturacao", "Calendário faturação", "Calendario faturacao",
      "Calendário de Faturação", "Calendario de Faturacao", "Calendário Faturação", "Calendario Faturacao",
      "Calendário cobrança", "Calendario cobranca", "Calendario de cobrança", "Calendario de cobranca",
      // Inglês
      "Billing Calendar", "Billing Schedule", "Payment Calendar", "Payment Schedule",
      "Invoicing Calendar", "Revenue Recognition Calendar"
    ]),
    p_tipo_oportunidad: find(["Tipo De Oportunidad", "Tipo Oportunidad", "Tipo de Oportunidade", "Tipo Oportunidade"]),
    p_proceso_tipo: find(["Proceso"]),
    p_account_last_activity: find(["Account: Last Activity", "Última Atividade da Conta", "Last Account Activity", "Ult. Atividade Conta"]),
    p_last_stage_change_date: find(["Last Stage Change Date", "Data Última Mudança Fase", "Data Mudança Fase", "Stage Change Date"])
  };
  
  // Detecta se é aba de ANÁLISE (tem Ciclo, AI Insight, etc) ou BASE (Históricos/Pipeline)
  const isAnalysisSheet = mapping.p_ciclo > -1 || mapping.p_ai_insight > -1 || mapping.p_forecast_ia > -1;
  
  // Log APENAS campos críticos faltando
  const critical = [];
  if (mapping.p_opp === -1) critical.push("Opportunity Name");
  if (mapping.p_acc === -1) critical.push("Account Name");
  if (mapping.p_gross === -1) critical.push("Total Price");
  if (mapping.p_owner === -1) critical.push("Owner");
  
  // Close Date: Aceita "Data Prevista" como alternativa em análises
  if (mapping.p_date === -1 && mapping.p_predicted_date === -1) {
    critical.push("Close Date / Data Prevista");
  }
  
  // Created Date é CRÍTICO apenas em Históricos (BASE sheets)
  // Em Análises (Forecast IA, Ganhas, Perdidas), o ciclo já vem calculado
  if (mapping.p_created === -1 && !isAnalysisSheet) {
    critical.push("Created Date");
  }
  
  if (mapping.p_prod === -1) critical.push("Product Name");
  
  // Billing Calendar: Apenas WARN em BASE sheets (não crítico)
  if (mapping.p_billing_calendar === -1 && !isAnalysisSheet) {
    logToSheet("WARN", "Mapping", `⚠️ Coluna "Calendario facturación" NÃO ENCONTRADA (pode impactar reconhecimento de receita)`);
  }
  
  if (critical.length > 0) {
    logToSheet("ERROR", "Mapping", `⚠️ Campos críticos não encontrados: ${critical.join(", ")}`);
  }
  
  return mapping;
}

function aggregateOpportunities(values, cols, mode = 'UNKNOWN') {
  
  const map = new Map();
  const probMap = {
      "Qualificar": 10, "Avaliação": 20, "Proposta": 60, 
      "Deal Desk": 65, "Negociação": 80, "Verificação": 95, "Fechamento": 100
  };
  // Mapeamento de tradução: valores originais em espanhol → português
  const TIPO_OPOR_MAP_ = { 'Nueva': 'Nova', 'Adicional': 'Adicional', 'Renovación': 'Renovação', 'Renovacion': 'Renovação', 'TransferToken': 'TransferToken' };
  const PROCESO_TIPO_MAP_ = { 'Nueva': 'Nova', 'Posventa': 'Pós-venda' };
  
  let skipped = 0;
  let processed = 0;
  let dateWarnCount = 0;

  values.forEach((row, idx) => {
    const name = String(row[cols.p_opp] || "").trim();
    if (!name) {
      skipped++;
      if (skipped <= 3) {
        logToSheet("DEBUG", "Aggregate", `Linha ${idx + 2} ignorada: Opportunity Name vazio (cols.p_opp=${cols.p_opp})`);
      }
      return;
    }
    
    processed++;
    
    const oppId = cols.p_id > -1 ? String(row[cols.p_id] || "").trim() : "";
    const createdDate = cols.p_created > -1 ? parseDate(row[cols.p_created]) : null;
    const fiscalQRaw = cols.p_fiscal_q > -1 ? String(row[cols.p_fiscal_q] || "").trim() : "";
    const fiscalQParsed = (typeof parsePipelineFiscalQuarter_ === 'function') ? parsePipelineFiscalQuarter_(fiscalQRaw) : null;
    const fiscalQ = fiscalQParsed && fiscalQParsed.label ? fiscalQParsed.label : fiscalQRaw;
    
    // Para forecast (pipeline), usa "Data Prevista" se disponível, senão "Close Date"
    // Ordem de prioridade: Data Prevista > Close Date
    let closeDate = null;
    const predictedDate = cols.p_predicted_date > -1 ? parseDate(row[cols.p_predicted_date]) : null;
    if (predictedDate) {
      closeDate = predictedDate; // Prioriza Data Prevista
    } else if (cols.p_date > -1) {
      closeDate = parseDate(row[cols.p_date]); // Fallback para Close Date
    }

    if (dateWarnCount < 10) {
      const warnDateField_ = (raw, fieldName) => {
        if (typeof raw !== 'string') return;
        const txt = String(raw).trim();
        if (!txt) return;
        if (parseDate(txt)) return;
        // Ignora ISO, que parseDate já aceita
        if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(txt)) return;
        logToSheet("WARN", "DateNormalization", `Data não normalizada em ${fieldName} (${mode}): "${txt}" | Opp: ${name}`);
        dateWarnCount++;
      };

      if (cols.p_created > -1) warnDateField_(row[cols.p_created], "Created Date");
      if (cols.p_predicted_date > -1) warnDateField_(row[cols.p_predicted_date], "Data Prevista");
      if (cols.p_date > -1) warnDateField_(row[cols.p_date], "Close Date");
      if (cols.p_next_activity > -1) warnDateField_(row[cols.p_next_activity], "Next Activity Date");
    }
    
    const baseKey = oppId || buildOppKey_(row[cols.p_acc], name, createdDate);
    const fiscalBucket = normText_(fiscalQ || "SEM_FISCAL");
    const key = (mode === 'OPEN') ? `${baseKey}|FQ:${fiscalBucket}` : baseKey;
    
    const curProd = cols.p_prod > -1 ? String(row[cols.p_prod] || "").trim() : "";
    const curGross = parseMoney(row[cols.p_gross]);
    const curNet = parseMoney(row[cols.p_net]);
    const stage = String(row[cols.p_stage] || "");
    const inactiveDays = cols.p_inactive > -1 ? parseInt(row[cols.p_inactive]) || 0 : 0;
    const nextActivityDate = cols.p_next_activity > -1 ? parseDate(row[cols.p_next_activity]) : null;
    
    // VALIDAÇÃO: Verificar GROSS/NET = 0 (sinais de erro de importação)
    if (curGross === 0 && processed === 1) {
      console.warn(`⚠️ ${name}: GROSS = 0 - possível erro de importação`);
      logToSheet("WARN", "Aggregate", `⚠️ GROSS zerado em ${name}`);
    }
    if (curNet === 0 && processed === 1 && mode !== 'LOST') {
      // NET zero é normal em perdidas, mas suspeito em abertas/ganhas
      console.warn(`⚠️ ${name}: NET = 0 - verificar ${mode}`);
    }
    
    // LOGS DE DEBUG COMENTADOS PARA PERFORMANCE
    // if (processed === 1) {
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 RAW: Opp="${row[cols.p_opp]}" Acc="${row[cols.p_acc]}" Owner="${row[cols.p_owner]}"`);
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 RAW: cols.p_acc=${cols.p_acc} → row[cols.p_acc]="${row[cols.p_acc]}"`);
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 RAW: Gross="${row[cols.p_gross]}" Net="${row[cols.p_net]}" Product="${row[cols.p_prod]}" Stage="${row[cols.p_stage]}"`);
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 RAW: BillingState="${row[cols.p_billing_state]}" BillingCity="${row[cols.p_billing_city]}"`);
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 PARSED: curGross=${curGross} curNet=${curNet} curProd="${curProd}" stage="${stage}"`);
    // }
    
    const probInput = row[cols.p_prob];
    let prob = parsePercentage(probInput);
    if (prob === null) prob = probMap[normalizeStage_(stage)] || 0;

    // Captura Forecast e Created Date
    const forecastSF = cols.p_forecast > -1 ? String(row[cols.p_forecast] || "") : "-";
    const activities = cols.p_activities > -1 ? parseInt(row[cols.p_activities]) || 0 : 0;
    const activities7d = cols.p_activities_7d > -1 ? parseInt(row[cols.p_activities_7d]) || 0 : 0;
    const activities30d = cols.p_activities_30d > -1 ? parseInt(row[cols.p_activities_30d]) || 0 : 0;
    const activityMix = cols.p_activity_mix > -1 ? String(row[cols.p_activity_mix] || "").trim() : "";
    const activityWeight = cols.p_activity_weight > -1 ? String(row[cols.p_activity_weight] || "").trim() : "";
    const idleDays = cols.p_idle_days > -1 ? parseInt(row[cols.p_idle_days]) || 0 : 0;
    const aiInsight = cols.p_ai_insight > -1 ? String(row[cols.p_ai_insight] || "").trim() : "";
    const confidence = cols.p_confidence > -1 ? parseInt(row[cols.p_confidence]) || 0 : 0;
    const forecastIA = cols.p_forecast_ia > -1 ? String(row[cols.p_forecast_ia] || "").trim() : "";
    const meddicScore = cols.p_meddic_score > -1 ? parseInt(row[cols.p_meddic_score]) || 0 : 0;
    const bantScore = cols.p_bant_score > -1 ? parseInt(row[cols.p_bant_score]) || 0 : 0;
    const riskFlags = cols.p_risk_flags > -1 ? String(row[cols.p_risk_flags] || "").trim() : "";
    const auditQuestions = cols.p_audit_questions > -1 ? String(row[cols.p_audit_questions] || "").trim() : "";
    const winFactors = cols.p_win_factors > -1 ? String(row[cols.p_win_factors] || "").trim() : "";
    const secondaryCauses = cols.p_secondary_causes > -1 ? String(row[cols.p_secondary_causes] || "").trim() : "";
    const engagementQuality = cols.p_engagement_quality > -1 ? String(row[cols.p_engagement_quality] || "").trim() : "";
    const opportunityMgmt = cols.p_opportunity_mgmt > -1 ? String(row[cols.p_opportunity_mgmt] || "").trim() : "";
    const avoidable = cols.p_avoidable > -1 ? String(row[cols.p_avoidable] || "").trim() : "";
    const codAcao = cols.p_cod_acao > -1 ? String(row[cols.p_cod_acao] || "").trim() : "";
    const tipoResultado = cols.p_tipo_resultado > -1 ? String(row[cols.p_tipo_resultado] || "").trim() : "";
    const labels = cols.p_labels > -1 ? String(row[cols.p_labels] || "").trim() : "";
    const portfolioFromCategoriaSDR = cols.p_categoria_sdr > -1 ? String(row[cols.p_categoria_sdr] || "").trim() : "";
    const portfolioFromBase = cols.p_portfolio > -1 ? String(row[cols.p_portfolio] || "").trim() : "";
    const portfolio = mode === 'OPEN' ? (portfolioFromCategoriaSDR || portfolioFromBase) : portfolioFromBase;
    const verticalIA = cols.p_vertical_ia > -1 ? String(row[cols.p_vertical_ia] || "").trim() : "";
    const subVerticalIA = cols.p_sub_vertical_ia > -1 ? String(row[cols.p_sub_vertical_ia] || "").trim() : "";
    const subSubVerticalIA = cols.p_sub_sub_vertical_ia > -1 ? String(row[cols.p_sub_sub_vertical_ia] || "").trim() : "";
    const ownerPreventa = cols.p_owner_preventa > -1 ? String(row[cols.p_owner_preventa] || "").trim() : "";
    const segment = cols.p_segment > -1 ? String(row[cols.p_segment] || "") : "";
    const subsegmentoMercado = cols.p_subsegmento_mercado > -1 ? String(row[cols.p_subsegmento_mercado] || "") : "";
    const segmentoConsolidado = cols.p_segmento_consolidado > -1 ? String(row[cols.p_segmento_consolidado] || "") : "";
    const productFamily = cols.p_prod_family > -1 ? String(row[cols.p_prod_family] || "") : "";
    const billingState = cols.p_billing_state > -1 ? String(row[cols.p_billing_state] || "").trim() : "";
    const billingCity = cols.p_billing_city > -1 ? String(row[cols.p_billing_city] || "").trim() : "";
    const billingCalendar      = cols.p_billing_calendar   > -1 ? String(row[cols.p_billing_calendar]   || "").trim() : "";
    const tipoOportunidadRaw    = cols.p_tipo_oportunidad   > -1 ? String(row[cols.p_tipo_oportunidad]   || "").trim() : "";
    const processoTipoRaw       = cols.p_proceso_tipo       > -1 ? String(row[cols.p_proceso_tipo]       || "").trim() : "";
    const tipoOportunidade         = TIPO_OPOR_MAP_[tipoOportunidadRaw]  || tipoOportunidadRaw;
    const processoTipo             = PROCESO_TIPO_MAP_[processoTipoRaw]  || processoTipoRaw;
    const accountLastActivity      = cols.p_account_last_activity  > -1 ? parseDate(row[cols.p_account_last_activity])  : null;
    const lastStageChangeDate      = cols.p_last_stage_change_date > -1 ? parseDate(row[cols.p_last_stage_change_date]) : null;
    
    // LOGS DE DEBUG COMENTADOS PARA PERFORMANCE
    // if (processed === 1) {
    //   logToSheet("DEBUG", "Aggregate", `🔍 LINHA 1 NOVOS CAMPOS: FiscalQ="${fiscalQ}" Activities=${activities} AIInsight="${aiInsight.substring(0, 50)}..."`);
    // }
    
    // Debug: Log primeiras 3 capturas de calendário (COMENTADO)
    // if (!aggregateOpportunities.calendarDebugCount) aggregateOpportunities.calendarDebugCount = 0;
    // if (aggregateOpportunities.calendarDebugCount < MAX_DEBUG_LOGS && billingCalendar) {
    //   logToSheet("DEBUG", "CalendarCapture", `Col Index: ${cols.p_billing_calendar} | Value: "${billingCalendar}" | Opp: ${name}`);
    //   aggregateOpportunities.calendarDebugCount++;
    // }
    // if (aggregateOpportunities.calendarDebugCount < MAX_DEBUG_LOGS && !billingCalendar) {
    //   logToSheet("DEBUG", "CalendarCapture", `Col Index: ${cols.p_billing_calendar} | VAZIO para Opp: ${name}`);
    //   aggregateOpportunities.calendarDebugCount++;
    // }

    // Cálculo Ciclo
    let ciclo = 0;
    
    // Prioriza coluna "Ciclo (dias)" se existir
    if (cols.p_ciclo > -1) {
      const cicloValue = row[cols.p_ciclo];
      if (cicloValue !== null && cicloValue !== undefined && cicloValue !== "") {
        ciclo = parseInt(cicloValue) || 0;
      }
    }
    
    // Fallback: calcula se tiver datas e não tiver ciclo da coluna
    if (ciclo === 0 && createdDate && closeDate) {
      ciclo = Math.ceil((closeDate - createdDate) / MS_PER_DAY);
    }

    if (!map.has(key)) {
      const accountName = cols.p_acc > -1 && row[cols.p_acc] ? String(row[cols.p_acc]).trim() : 'N/A';
      
      // Log primeiras 3 oportunidades com account name
      if (processed <= 3) {
        logToSheet("DEBUG", "Aggregate", `📍 Opp ${processed}: "${name}" → Account="${accountName}" (cols.p_acc=${cols.p_acc}, raw="${row[cols.p_acc]}")`);
      }
      
      map.set(key, {
        oppName: name, 
        oppId: oppId,
        oppKey: key,
        accName: accountName, 
        owner: String(row[cols.p_owner] || ""),
        gross: curGross, 
        net: curNet, 
        products: curProd,
        stage: stage, 
        probabilidad: prob,
        closed: closeDate,
        desc: String(row[cols.p_desc] || ""),
        created: createdDate,
        inactiveDays: inactiveDays,
        nextActivityDate: nextActivityDate,
        forecast_sf: forecastSF,
        fiscalQ: fiscalQ,
        aiActivities: activities,
        aiActivities7d: activities7d,
        aiActivities30d: activities30d,
        activityMix: activityMix,
        activityWeight: activityWeight,
        idleDays: idleDays,
        aiInsight: aiInsight,
        confidence: confidence,
        forecastIA: forecastIA,
        meddicScore: meddicScore,
        bantScore: bantScore,
        riskFlags: riskFlags,
        auditQuestions: auditQuestions,
        winFactors: winFactors,
        secondaryCauses: secondaryCauses,
        engagementQuality: engagementQuality,
        opportunityMgmt: opportunityMgmt,
        avoidable: avoidable,
        codAcao: codAcao,
        tipoResultado: tipoResultado,
        labels: labels,
        ciclo: ciclo,
        reason: cols.p_reason > -1 ? String(row[cols.p_reason] || "") : "",
        portfolio: portfolio,
        ownerPreventa: ownerPreventa,
        segment: segment,
        subsegmentoMercado: subsegmentoMercado,
        segmentoConsolidado: segmentoConsolidado,
        verticalIA: verticalIA,
        subVerticalIA: subVerticalIA,
        subSubVerticalIA: subSubVerticalIA,
        productFamily: productFamily,
        billingState: billingState,
        billingCity: billingCity,
        billingCalendar: billingCalendar,
        tipoOportunidade: tipoOportunidade,
        processoTipo: processoTipo,
        accountLastActivity: accountLastActivity,
        lastStageChangeDate: lastStageChangeDate
      });
    } else {
      const item = map.get(key);
      item.gross += curGross;
      item.net += curNet;
      // Atualiza atividades se maior
      if (activities > item.aiActivities) {
        item.aiActivities = activities;
      }
      // Atualiza aiInsight se mais recente
      if (aiInsight && !item.aiInsight) {
        item.aiInsight = aiInsight;
      }
      if (curProd && !item.products.includes(curProd)) {
        item.products += " | " + curProd;
      }
      if (productFamily && !item.productFamily.includes(productFamily)) {
        item.productFamily += item.productFamily ? (" | " + productFamily) : productFamily;
      }
      if (!item.subsegmentoMercado && subsegmentoMercado) {
        item.subsegmentoMercado = subsegmentoMercado;
      }
      if (!item.segmentoConsolidado && segmentoConsolidado) {
        item.segmentoConsolidado = segmentoConsolidado;
      }
      if (!item.ownerPreventa && ownerPreventa) {
        item.ownerPreventa = ownerPreventa;
      }
      if (!item.verticalIA && verticalIA) {
        item.verticalIA = verticalIA;
      }
      if (!item.subVerticalIA && subVerticalIA) {
        item.subVerticalIA = subVerticalIA;
      }
      if (!item.subSubVerticalIA && subSubVerticalIA) {
        item.subSubVerticalIA = subSubVerticalIA;
      }
    }
  });
  
  logToSheet("DEBUG", "Aggregate", `Agregação concluída: ${processed} processadas, ${skipped} ignoradas, ${map.size} oportunidades únicas`);
  
  // Log AMOSTRA das 2 primeiras oportunidades
  const sample = Array.from(map.values()).slice(0, 2);
  sample.forEach((opp, idx) => {
    logToSheet("DEBUG", "Aggregate", `🔍 AMOSTRA #${idx + 1}: ${opp.oppName} | Acc:${opp.accName} | Owner:${opp.owner} | Gross:${opp.gross} | Net:${opp.net} | Products:${opp.products}`);
    logToSheet("DEBUG", "Aggregate", `🔍 AMOSTRA #${idx + 1} (cont): Created:${opp.created} | Closed:${opp.closed} | Stage:${opp.stage} | Forecast:${opp.forecast_sf} | FiscalQ:${opp.fiscalQ}`);
    logToSheet("DEBUG", "Aggregate", `🔍 AMOSTRA #${idx + 1} (novos): Activities:${opp.aiActivities} | AIInsight:"${(opp.aiInsight || '').substring(0, 50)}..."`);
  });
  
  return Array.from(map.values());
}

function indexDataByColumnSmart(sheetObj, possibleHeaders) {
  const map = new Map();
  if (!sheetObj) return map;
  
  const h = sheetObj.headers.map(x => normText_(x));
  let colIdx = -1;
  for (let target of possibleHeaders) {
    const found = h.indexOf(normText_(target));
    if (found > -1) { colIdx = found; break; }
  }

  if (colIdx === -1) return map;

  sheetObj.values.forEach(row => {
    const key = normText_(row[colIdx]);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function indexDataByMultiKey_(sheetObj) {
  const map = new Map();
  if (!sheetObj) return map;

  const h = sheetObj.headers.map(x => normText_(x));
  const find = (cands) => {
    for (const c of cands) {
      const idx = h.indexOf(normText_(c));
      if (idx > -1) return idx;
    }
    return -1;
  };

  // Ampliado: buscar mais variações de colunas de ID e Nome
  const idIdx = find(["Opportunity ID", "Opportunity: ID", "Record ID", "Id", "ID"]);
  const nmIdx = find([
    "Nome da oportunidade",           // EXATO - coluna 7 de Alteracoes_Oportunidade
    "Opportunity Name",                // Inglês
    "Oportunidade",                    // Genérico (última prioridade)
    "Opportunity",                     // Genérico inglês
    "Related To",                      // Salesforce
    "Parent Record",
    "Opportunity: Opportunity Name"
  ]);
  
  if (idIdx === -1 && nmIdx === -1) {
    // Nenhuma coluna identificadora encontrada, registrar warning
    logToSheet("WARN", "IndexData", `Nenhuma coluna identificadora encontrada. Headers: ${sheetObj.headers.slice(0, 5).join(', ')}`);
    return map;
  }

  sheetObj.values.forEach((row, rowIdx) => {
    const keys = [];
    if (idIdx > -1 && row[idIdx]) {
      const idVal = String(row[idIdx]).trim();
      if (idVal) keys.push(normText_(idVal));
    }
    if (nmIdx > -1 && row[nmIdx]) {
      const nmVal = String(row[nmIdx]).trim();
      if (nmVal) keys.push(normText_(nmVal));
    }

    // Adicionar cada chave única ao mapa
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    uniqueKeys.forEach(k => {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    });
  });
  
  // Log de diagnóstico (apenas em DEBUG)
  if (map.size === 0) {
    logToSheet("WARN", "IndexData", `Mapa vazio após indexação. Total rows: ${sheetObj.values.length}, idIdx: ${idIdx}, nmIdx: ${nmIdx}`);
  }

  return map;
}

/**
 * Sanitiza texto de atividades removendo HTML, metadados de sistema e ruído
 * Remove: tags HTML, #StatusUpdate, "La Oportunidad", espaços excessivos
 */
function cleanActivityText_(text) {
  if (!text || typeof text !== 'string') return "";
  
  let cleaned = text
    // Remove todas as tags HTML (<p>, <strong>, <br>, etc)
    .replace(/<\/?[^>]+(>|$)/gi, '')
    
    // Remove entidades HTML (&nbsp;, &quot;, etc)
    .replace(/&[a-z]+;/gi, ' ')
    
    // Remove metadados de sistema conhecidos
    .replace(/#StatusUpdate/gi, '')
    .replace(/La Oportunidad/gi, '')
    .replace(/Opportunity Name:/gi, '')
    .replace(/Status:/gi, '')
    
    // Remove IDs de tickets (SECE-123456, PROJ-456789)
    .replace(/[A-Z]{3,5}-\d{5,7}/gi, '')
    
    // Remove hashtags de sistema (#Sprint2, #Vertex, #AI, etc)
    .replace(/#[A-Za-z0-9_]+/gi, '')
    
    // Remove padrões de email (mais agressivo)
    .replace(/From:\s*[^\s|]+/gi, '')
    .replace(/To:\s*[^\s|]+/gi, '')
    .replace(/CC:\s*[^\s|]+/gi, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[email]')
    .replace(/correo electrónico/gi, '')
    .replace(/correo electronico/gi, '')
    .replace(/unsubscribe/gi, '')
    .replace(/Para ver este debate/gi, '')
    .replace(/visita \[LINK\]/gi, '')
    
    // Remove URLs longas (só poluem)
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/\[LINK\]/gi, '')
    
    // Remove padrões de data isolados do tipo "Data: DD/MM/YYYY" (com ou sem pipe)
    .replace(/Data:\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*\|?/gi, '')
    
    // Remove padrões de campo técnico "Field: value |"
    .replace(/\b[A-Z][a-z]+:\s+[A-Z][a-z]+\.\s*/g, '')
    
    // Normaliza quebras de linha e espaços
    .replace(/\n{3,}/g, '\n\n')  // Max 2 quebras consecutivas
    .replace(/\s{2,}/g, ' ')      // Max 1 espaço
    .replace(/\|{2,}/g, '|')      // Max 1 pipe
    .replace(/\|\s*\|/g, '|')     // Remove pipes vazios
    .replace(/^\|+/, '')          // Remove pipes no início
    .replace(/\|+$/, '')          // Remove pipes no fim
    .trim();
  
  return cleaned;
}

function processActivityStatsSmart(acts, headers, hoje) {
  if (!acts || !acts.length) return { count: 0, lastDate: null, fullText: "", weightedCount: 0, channelSummary: "-" };
  
  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => {
    for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; }
    return -1;
  };

  const colDate = findIdx(["activity date", "data", "date", "created date", "data de criação", "data de criacao"]);
  const colText = findIdx(["full comments", "comentários completos", "comentarios completos", "comments", "comentários", "comentarios", "notes", "nota", "descrição", "description", "assunto"]);
  const colType = findIdx(["tipo de actividad", "tipo de atividade", "activity type", "tipo de atividade", "tipo", "type"]);

  const typeWeights = {
    "reuniao": 1,
    "reunion": 1,
    "meeting": 1,
    "videoconferencia": 1,
    "videoconference": 1,
    "call": 0.8,
    "ligacao": 0.8,
    "llamada": 0.8,
    "email": 0.4,
    "e-mail": 0.4,
    "correo": 0.4
  };

  const channelCount = {};
  let weighted = 0;

  const sortedActs = acts.map(a => {
    const d = colDate > -1 ? parseDate(a[colDate]) : null;
    const t = colType > -1 ? String(a[colType] || "") : "";
    const tNorm = normText_(t).toLowerCase();
    const weightKey = Object.keys(typeWeights).find(k => tNorm.includes(k));
    const weight = weightKey ? typeWeights[weightKey] : 0.6;
    weighted += weight;
    if (t) channelCount[t] = (channelCount[t] || 0) + 1;
    
    // LIMPEZA CRÍTICA: Remove HTML e metadados antes de processar
    const rawText = colText > -1 ? String(a[colText] || "") : "";
    const cleanText = cleanActivityText_(rawText);
    
    return { date: d, text: cleanText, type: t };
  }).filter(a => a.date).sort((a, b) => b.date - a.date);

  const lastDate = sortedActs.length > 0 ? sortedActs[0].date : null;
  
  // Construir fullText com prefixos cronológicos para priorizar contexto recente
  const fullTextParts = sortedActs.slice(0, 15).map((a, index) => {
    const dataFmt = Utilities.formatDate(a.date, "GMT-3", "dd/MM/yyyy");
    let prefixo = "";
    
    if (index === 0) {
      prefixo = "--- ÚLTIMA ATIVIDADE REGISTRADA ---\n";
    } else if (index === 1) {
      prefixo = "[ANTERIOR] ";
    } else if (index > 1 && index <= 3) {
      prefixo = "[RECENTE] ";
    } else {
      prefixo = "[HISTÓRICO] ";
    }
    
    const tipoDisplay = a.type ? `Tipo: ${a.type} | ` : "";
    return `${prefixo}Data: ${dataFmt} | ${tipoDisplay}${a.text}`;
  });
  
  const fullText = fullTextParts.join("\n\n");
  const channelSummary = Object.keys(channelCount).length
    ? Object.keys(channelCount).map(k => `${k}:${channelCount[k]}`).join(" | ")
    : "-";

  return { count: acts.length, lastDate: lastDate, fullText: fullText, weightedCount: Math.round(weighted * 10) / 10, channelSummary: channelSummary };
}

function summarizeChangesSmart(changes, headers) {
  if (!changes || !changes.length) return "Sem histórico.";
  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => { for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; } return -1; };
  
  const colField = findIdx(["field / event", "campo/compromisso", "campo / compromisso", "campo", "field"]);
  const colNew = findIdx(["new value", "novo valor", "valor novo", "new"]);
  const colDate = findIdx(["edit date", "data de edição", "data de edicao", "data edição", "data edicao", "data", "date"]);

  return changes.slice(0, 5).map(c => {
    const f = colField > -1 ? c[colField] : "Alt.";
    const v = colNew > -1 ? c[colNew] : "?";
    const d = colDate > -1 ? formatDateRobust(c[colDate]) : "";
    return `[${d}] ${f}->${v}`;
  }).join(" | ");
}

/**
 * Extrai a data da última mudança de fase (Stage) do histórico de changes.
 * Usado para determinar a data real de fechamento de deals Won/Lost.
 * 
 * @param {Array} changes - Array de mudanças
 * @param {Array} headers - Headers da planilha de changes
 * @returns {Date|null} - Data da última mudança de fase ou null se não encontrada
 */
function getLastStageChangeDate(changes, headers) {
  if (!changes || !changes.length) return null;
  
  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => { for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; } return -1; };
  
  const colField = findIdx(["field / event", "campo/compromisso", "campo / compromisso", "campo", "field"]);
  const colDate = findIdx(["edit date", "data de edição", "data de edicao", "data edição", "data edicao", "data", "date"]);
  
  if (colField === -1 || colDate === -1) return null;
  
  // Busca pela última mudança de Stage (mais recente)
  let lastStageDate = null;
  
  for (let i = 0; i < changes.length; i++) {
    const field = normText_(String(changes[i][colField] || ""));
    
    // Identifica mudanças de fase (Stage/Estagio/Etapa/Fase)
    if (/STAGE|ESTAGIO|ETAPA|FASE/.test(field)) {
      const date = parseDate(changes[i][colDate]);
      if (date && (!lastStageDate || date > lastStageDate)) {
        lastStageDate = date;
      }
    }
  }
  
  return lastStageDate;
}

/**
 * Aplica correção de data de fechamento para deals Won/Lost.
 * Usa a data da última mudança de fase como data real de fechamento.
 * Recalcula automaticamente o ciclo baseado na data corrigida.
 * 
 * @param {Object} item - Item de deal (objeto com propriedades)
 * @param {string} mode - Modo de processamento ('WON', 'LOST', 'OPEN')
 * @param {Array} relatedChanges - Histórico de mudanças do deal
 * @param {Array} changesHeaders - Headers da planilha de mudanças
 * @returns {Object} - Item modificado com closed e ciclo atualizados
 */
function applyClosedDateCorrection_(item, mode, relatedChanges, changesHeaders) {
  // Só aplica para deals fechados (WON/LOST)
  if (mode !== 'WON' && mode !== 'LOST') {
    return item;
  }
  
  const lastStageDate = getLastStageChangeDate(relatedChanges, changesHeaders);
  
  if (lastStageDate) {
    item.closed = lastStageDate;

    // Recalcular ciclo com a data corrigida (e tentar corrigir inversão se ficar negativo)
    if (item.created) {
      const createdDate = item.created instanceof Date ? item.created : parseDate(item.created);
      const closedDate = item.closed instanceof Date ? item.closed : parseDate(item.closed);

      if (createdDate && closedDate) {
        let ciclo = Math.ceil((closedDate - createdDate) / MS_PER_DAY);

        if (ciclo < 0) {
          const fix = tryFixInvertedDates_(createdDate, closedDate);
          if (fix.fixed) {
            logToSheet(
              'WARN',
              'DateFix',
              `Inversão DD/MM↔MM/DD corrigida via ciclo negativo (ciclo=${ciclo} → ${fix.ciclo})`,
              { oportunidade: item.oppName || item.opp || '', aba: mode }
            );
            item.created = fix.created;
            item.closed = fix.closed;
            item.ciclo = fix.ciclo;
            return item;
          }
        }

        item.created = createdDate;
        item.closed = closedDate;
        item.ciclo = ciclo;
      }
    }
  }
  
  return item;
}

/**
 * Valida consistência temporal de um deal.
 * Detecta datas invertidas, ausentes ou ilógicas.
 * 
 * @param {Object} item - Item de deal
 * @param {string} mode - Modo ('WON', 'LOST', 'OPEN')
 * @param {Date} hoje - Data atual de referência
 * @returns {Array<string>} - Array de problemas detectados (vazio se OK)
 */
function validateDealDates_(item, mode, hoje) {
  const issues = [];
  
  // Validação 1: Data de criação ausente
  if (!item.created || !(item.created instanceof Date) || isNaN(item.created.getTime())) {
    issues.push("DATA CRIAÇÃO INVÁLIDA");
    return issues; // Não pode validar outras sem created
  }
  
  // Validação 2: Data de fechamento obrigatória para WON/LOST
  if ((mode === 'WON' || mode === 'LOST') && 
      (!item.closed || !(item.closed instanceof Date) || isNaN(item.closed.getTime()))) {
    issues.push("DATA FECHAMENTO AUSENTE");
  }
  
  // Validação 3: Datas invertidas (created > closed)
  if (item.closed && item.created > item.closed) {
    issues.push("DATA INVERTIDA (created > closed)");
  }
  
  // Validação 4: Data de criação no futuro
  if (item.created > hoje) {
    const diasFuturo = Math.ceil((item.created - hoje) / MS_PER_DAY);
    issues.push(`CREATED NO FUTURO (+${diasFuturo} dias)`);
  }
  
  // Validação 5: Data de fechamento muito futura (>2 anos)
  if (item.closed) {
    const maxFutureDate = new Date(hoje.getTime() + (730 * MS_PER_DAY)); // 2 anos
    if (item.closed > maxFutureDate) {
      issues.push("CLOSE DATE ABSURDO (>2 anos futuro)");
    }
  }
  
  // Validação 6: Deal OPEN com data de fechamento no passado
  if (mode === 'OPEN' && item.closed && item.closed < hoje) {
    const diasAtrasado = Math.ceil((hoje - item.closed) / MS_PER_DAY);
    if (diasAtrasado > 7) { // tolerância de 7 dias
      issues.push(`SLIPPAGE DETECTADO (-${diasAtrasado} dias)`);
    }
  }
  
  return issues;
}

/**
 * Valida se o ciclo calculado é lógico e consistente.
 * 
 * @param {number} ciclo - Ciclo em dias
 * @param {Date} created - Data de criação
 * @param {Date} closed - Data de fechamento
 * @param {string} oppName - Nome da oportunidade (para log)
 * @returns {Object} - { isValid: boolean, issue: string|null, correctedCiclo: number }
 */
function validateCiclo_(ciclo, created, closed, oppName) {
  const result = {
    isValid: true,
    issue: null,
    correctedCiclo: ciclo
  };
  
  // Validação 1: Ciclo negativo
  if (ciclo < 0) {
    result.isValid = false;
    result.issue = "CICLO NEGATIVO";

    // Tentar corrigir usando inversão DD/MM↔MM/DD (mesma linha do CorrigirFiscalQ)
    const createdDate = created instanceof Date ? created : parseDate(created);
    const closedDate = closed instanceof Date ? closed : parseDate(closed);
    if (createdDate && closedDate) {
      const fix = tryFixInvertedDates_(createdDate, closedDate);
      if (fix.fixed && typeof fix.ciclo === 'number' && isFinite(fix.ciclo)) {
        result.issue = "CICLO NEGATIVO (CORRIGIDO)";
        result.correctedCiclo = fix.ciclo;
        logToSheet(
          "WARN",
          "CicloValidation",
          `Ciclo negativo corrigido via inversão (ciclo=${ciclo} → ${fix.ciclo})`,
          { oportunidade: oppName }
        );
        return result;
      }
    }

    // Fallback: mantém o comportamento anterior (não quebra pipeline)
    result.correctedCiclo = Math.abs(ciclo);
    logToSheet(
      "ERROR",
      "CicloValidation",
      `Ciclo negativo detectado (${ciclo} dias) - datas invertidas?`,
      { oportunidade: oppName }
    );
  }
  
  // Validação 2: Ciclo zero (fechou no mesmo dia)
  else if (ciclo === 0 && created && closed) {
    const hoursDiff = Math.abs(closed - created) / (1000 * 3600);
    if (hoursDiff < 1) {
      result.isValid = false;
      result.issue = "CICLO ZERO - FECHAMENTO INSTANTÂNEO";
      result.correctedCiclo = 1; // Força mínimo de 1 dia
    }
  }
  
  // Validação 3: Ciclo absurdamente longo (>3 anos)
  else if (ciclo > 1095) { // 3 anos = 1095 dias
    result.isValid = false;
    result.issue = `CICLO ABSURDO (${ciclo} dias = ${Math.round(ciclo/365)} anos)`;
    // Mantém valor mas flageia
  }
  
  return result;
}

/**
 * Análise detalhada de alterações para WON/LOST
 */
function getDetailedChangesAnalysis(changes, headers) {
  if (!changes || !changes.length) {
    return {
      totalChanges: 0,
      criticalChanges: 0,
      topFields: "N/A",
      changeFrequency: "N/A",
      closeDateChanges: 0,
      stageChanges: 0,
      valueChanges: 0,
      changePattern: "SEM DADOS",
      uniqueEditors: 0,
      lastChange: "N/A"
    };
  }

  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => { for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; } return -1; };
  
  const colField = findIdx(["field / event", "campo/compromisso", "campo / compromisso", "campo", "field"]);
  const colEditor = findIdx(["edited by", "editado por", "editor"]);
  const colDate = findIdx(["edit date", "data de edição", "data de edicao", "data edição", "data edicao", "data", "date"]);
  const colOld = findIdx(["old value", "valor antigo", "old"]);
  const colNew = findIdx(["new value", "novo valor", "valor novo", "new"]);

  const fieldCount = {};
  const editors = new Set();
  let closeDateChanges = 0;
  let stageChanges = 0;
  let valueChanges = 0;
  const criticalFields = ["stage", "close date", "amount", "probability", "owner"];
  let criticalChanges = 0;
  let lastChangeDate = null;

  changes.forEach(c => {
    const field = colField > -1 ? normText_(String(c[colField] || "")) : "";
    const editor = colEditor > -1 ? String(c[colEditor] || "").trim() : "";
    const date = colDate > -1 ? parseDate(c[colDate]) : null;

    if (field) {
      fieldCount[field] = (fieldCount[field] || 0) + 1;
      
      if (/CLOSE DATE|FECHA DE CIERRE|DATA FECHAMENTO/.test(field)) closeDateChanges++;
      if (/STAGE|ESTAGIO|ETAPA|FASE/.test(field)) stageChanges++;
      if (/AMOUNT|VALOR|TOTAL PRICE|NET REVENUE/.test(field)) valueChanges++;
      
      if (criticalFields.some(cf => field.includes(normText_(cf)))) {
        criticalChanges++;
      }
    }

    if (editor) editors.add(editor);
    if (date && (!lastChangeDate || date > lastChangeDate)) {
      lastChangeDate = date;
    }
  });

  // Top 3 campos mais alterados
  const sortedFields = Object.entries(fieldCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([field, count]) => `${field}(${count}x)`)
    .join(", ");

  // Padrão de mudanças
  let changePattern = "ESTAVEL";
  if (changes.length > 20) changePattern = "MUITO VOLATIL";
  else if (changes.length > 10) changePattern = "VOLATIL";
  else if (changes.length > 5) changePattern = "MODERADO";

  if (criticalChanges > changes.length * 0.5) {
    changePattern += " - CRITICO";
  }

  // Frequência
  let changeFrequency = "N/A";
  if (lastChangeDate && changes.length > 1) {
    const firstChange = changes.reduce((earliest, c) => {
      const d = colDate > -1 ? parseDate(c[colDate]) : null;
      return (d && (!earliest || d < earliest)) ? d : earliest;
    }, null);
    
    if (firstChange && lastChangeDate) {
      const daysDiff = Math.ceil((lastChangeDate - firstChange) / MS_PER_DAY);
      const avgDays = daysDiff > 0 ? Math.round(daysDiff / changes.length) : 0;
      changeFrequency = `${avgDays} dias entre mudanças`;
    }
  }

  // --- DETECÇÃO DE ANOMALIAS ---
  const anomalies = [];
  
  // Anomalia 1: Múltiplos editores (possível transferência ou disputa)
  if (editors.size >= 5) {
    anomalies.push(`${editors.size} editores diferentes`);
  }
  
  // Anomalia 2: Close Date alterado mais de 5 vezes
  if (closeDateChanges >= 5) {
    anomalies.push(`Close Date alterado ${closeDateChanges}x`);
  }
  
  // Anomalia 3: Mudança de valor muito frequente (possível negociação agressiva)
  if (valueChanges >= 4) {
    anomalies.push(`Valor alterado ${valueChanges}x`);
  }
  
  // Anomalia 4: Stage alterado mais de 3x (possível vai-e-vem)
  if (stageChanges >= 4) {
    anomalies.push(`Stage alterado ${stageChanges}x - vai-e-vem`);
  }
  
  // Anomalia 5: Edição muito recente (última mudança nas últimas 2h)
  if (lastChangeDate && lastChangeDate instanceof Date && !isNaN(lastChangeDate)) {
    const now = new Date();
    // Só calcula se a data for válida e não for futura
    if (lastChangeDate <= now) {
      const hoursAgo = Math.ceil((now - lastChangeDate) / (1000 * 3600));
      if (hoursAgo > 0 && hoursAgo <= 2) {
        anomalies.push(`Editado há ${hoursAgo}h`);
      }
    }
  }

  return {
    totalChanges: changes.length,
    criticalChanges: criticalChanges,
    topFields: sortedFields || "N/A",
    changeFrequency: changeFrequency,
    closeDateChanges: closeDateChanges,
    stageChanges: stageChanges,
    valueChanges: valueChanges,
    changePattern: changePattern,
    uniqueEditors: editors.size,
    lastChange: lastChangeDate ? formatDateRobust(lastChangeDate) : "N/A",
    anomalies: anomalies.length > 0 ? anomalies.join(" | ") : "OK"
  };
}

/**
 * Análise detalhada de atividades para WON/LOST
 */
function getDetailedActivityBreakdown(acts, headers, hoje) {
  if (!acts || !acts.length) {
    return {
      typeDistribution: "N/A",
      peakPeriod: "N/A",
      avgCadence: "N/A",
      last7Days: 0,
      last30Days: 0
    };
  }

  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => {
    for (let c of cands) { const i = h.indexOf(normText_(c)); if (i > -1) return i; }
    return -1;
  };

  const colDate = findIdx(["activity date", "data", "date", "created date", "data de criação", "data de criacao"]);
  const colType = findIdx(["tipo de actividad", "tipo de atividade", "activity type", "tipo", "type"]);

  const typeCount = {};
  const validActs = [];
  let last7Days = 0;
  let last30Days = 0;

  const cutoff7 = new Date(hoje.getTime() - 7 * MS_PER_DAY);
  const cutoff30 = new Date(hoje.getTime() - 30 * MS_PER_DAY);

  acts.forEach(a => {
    const date = colDate > -1 ? parseDate(a[colDate]) : null;
    const type = colType > -1 ? String(a[colType] || "Outro") : "Outro";

    if (date) {
      validActs.push({ date, type });
      typeCount[type] = (typeCount[type] || 0) + 1;

      if (date >= cutoff7) last7Days++;
      if (date >= cutoff30) last30Days++;
    }
  });

  // Distribuição de tipos (top 3)
  const typeDistribution = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}(${count})`)
    .join(", ");

  // Período de pico (último mês com mais atividades)
  let peakPeriod = "N/A";
  if (validActs.length > 0) {
    const sorted = validActs.sort((a, b) => b.date - a.date);
    const recentMonths = {};
    
    sorted.forEach(a => {
      const monthKey = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
      recentMonths[monthKey] = (recentMonths[monthKey] || 0) + 1;
    });

    const peak = Object.entries(recentMonths)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (peak) {
      peakPeriod = `${peak[0]} (${peak[1]} atividades)`;
    }
  }

  // Cadência média
  let avgCadence = "N/A";
  if (validActs.length > 1) {
    const sorted = validActs.sort((a, b) => a.date - b.date);
    const totalDays = (sorted[sorted.length - 1].date - sorted[0].date) / MS_PER_DAY;
    avgCadence = Math.round(totalDays / (validActs.length - 1));
  }

  return {
    typeDistribution: typeDistribution || "N/A",
    peakPeriod: peakPeriod,
    avgCadence: avgCadence,
    last7Days: last7Days,
    last30Days: last30Days
  };
}

/**
 * Normaliza valores de probabilidade (ex: 0.65 -> 65, 10 -> 10).
 */
function parsePercentage(v) {
  if (v === null || v === undefined || v === "") return null;
  // Remove % e troca vírgula por ponto
  let s = String(v).replace(',', '.').replace('%', '').trim();
  let n = parseFloat(s);
  
  if (isNaN(n)) return null;
  
  // Regra de Ouro: Se for menor ou igual a 1 (ex: 0.65) e maior que 0, multiplica por 100.
  // Assume que valores <= 1.0 são decimais (exceto 0).
  // Se for > 1 (ex: 10, 65), mantém como está.
  if (n > 0 && n <= 1) {
    return Math.round(n * 100);
  }
  
  return Math.round(n);
}

function parseMoney(v) { 
  if (typeof v === 'number') return v;
  if (!v) return 0;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) { 
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); 
    else s = s.replace(/,/g, ''); 
  }
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

function formatMoney(v) {
  if (!v || v === 0) return "$0";
  return "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseDate(d) {
  if (d === null || d === undefined || d === '') return null;

  const dateFromYMD_ = (year, month1to12, day1to31) => {
    if (!year || !month1to12 || !day1to31) return null;
    const dt = new Date(year, month1to12 - 1, day1to31);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || (dt.getMonth() + 1) !== month1to12 || dt.getDate() !== day1to31) return null;
    dt.setHours(0, 0, 0, 0);
    return dt;
  };

  // Date object do Sheets: nunca "corrigir" aqui (não-destrutivo)
  if (d instanceof Date) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Serial date (Excel/Sheets)
  if (typeof d === 'number' && isFinite(d)) {
    // Heurística: datas seriais normalmente > 1000
    if (d > 1000) {
      const dt = new Date(Math.round((d - 25569) * 86400 * 1000));
      dt.setHours(0, 0, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }

  // Objetos com getTime
  if (typeof d === 'object' && d && typeof d.getTime === 'function') {
    const ts = d.getTime();
    if (!isFinite(ts)) return null;
    const dt = new Date(ts);
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const str = String(d).trim();
  if (!str) return null;

  // yyyy-mm-dd (ISO date)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    return dateFromYMD_(year, month, day);
  }

  // ISO datetime (ex: 2026-02-10T12:34:56Z)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return null;
    const normalized = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  // Strings locais (dd/mm, dd-mm, mm/dd etc.) devem ser padronizadas previamente
  // por normalizarDatasTodasAbas() com locale pt_BR.
  return null;
}

function tryFixInvertedDates_(created, closed) {
  const result = { fixed: false, created: created, closed: closed, ciclo: null };
  if (!(created instanceof Date) || !(closed instanceof Date)) return result;

  const ciclo = Math.ceil((closed - created) / MS_PER_DAY);
  result.ciclo = ciclo;
  if (ciclo >= 0) return result;

  const invertDayMonth_ = (dt) => {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return null;
    const year = dt.getFullYear();
    const monthIndex = dt.getMonth(); // 0-11
    const day = dt.getDate(); // 1-31

    // Só faz sentido inverter quando o dia pode ser um mês (1-12)
    if (day < 1 || day > 12) return null;

    // Inversão DD/MM ↔ MM/DD: new Date(ano, mesIndex, dia)
    const inv = new Date(year, day - 1, monthIndex + 1);
    inv.setHours(0, 0, 0, 0);

    // Validar que não houve overflow (ou seja, a troca foi exata)
    if (inv.getFullYear() !== year) return null;
    if (inv.getMonth() !== (day - 1)) return null;
    if (inv.getDate() !== (monthIndex + 1)) return null;
    return inv;
  };

  // Tenta a mesma heurística do CorrigirFiscalQ, mas com guardrails
  const createdInv = invertDayMonth_(created);
  const closedInv = invertDayMonth_(closed);
  if (!createdInv || !closedInv) return result;

  const cicloInv = Math.ceil((closedInv - createdInv) / MS_PER_DAY);
  if (cicloInv >= 0 && cicloInv < 1000) {
    result.fixed = true;
    result.created = createdInv;
    result.closed = closedInv;
    result.ciclo = cicloInv;
  }

  return result;
}

function formatDateRobust(d) {
  if (!(d instanceof Date)) d = parseDate(d);
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : "-";
}

function mapEnum(value, enumObj, fallback) {
  if (!value) return fallback;
  const s = String(value).trim().toUpperCase();
  const keys = Object.keys(enumObj);
  const match = keys.find(k => k === s || enumObj[k].toUpperCase() === s);
  return match ? enumObj[match] : fallback;
}

function normalizeList(arr, enumObj) {
  if (!arr || !Array.isArray(arr)) return [];
  const validValues = Object.values(enumObj);
  const normalized = arr.map(x => {
    const s = String(x).trim().toUpperCase().replace(/_/g, " ");
    return validValues.find(v => v.toUpperCase() === s) || s;
  });
  return [...new Set(normalized.filter(x => x && x !== "UNDEFINED"))];
}

function getBaseClientsCache() {
  const c = CacheService.getScriptCache();
  const cached = c.get(BASE_CLIENTS_CACHE_KEY);
  if (cached) return new Set(JSON.parse(cached));
  
  const base = new Set();
  const data = getSheetData(SHEETS.GANHAS);
  if (data) {
    const idx = getColumnMapping(data.headers).p_acc;
    if (idx > -1) data.values.forEach(r => base.add(String(r[idx] || "").trim().toLowerCase()));
  }
  
  c.put(BASE_CLIENTS_CACHE_KEY, JSON.stringify(Array.from(base)), 21600);
  return base;
}

function getSheetData(name) {
  if (!SHEET_CACHE_[name]) {
    const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!s) return null;
    const v = s.getDataRange().getValues();
    SHEET_CACHE_[name] = v.length > 1 ? { headers: v[0], values: v.slice(1) } : null;
  }
  return SHEET_CACHE_[name];
}

/**
 * Sistema de log unificado: grava em Logs_Execucao E exibe no console do Apps Script
 * @param {string} t - Tipo (INFO, ERROR, WARN, DEBUG)
 * @param {string} m - Módulo
 * @param {string} msg - Mensagem/Descrição
 * @param {object} details - Detalhes opcionais {aba, linha, oportunidade, acao}
 */
function logToSheet(t, m, msg, details = {}) {
  console.log(`🔍 logToSheet chamado: [${t}] [${m}] ${msg}`);
  console.log(`🔍 LOG_BUFFER_ tem ${LOG_BUFFER_.length} item(s), limite = ${LOG_BUFFER_LIMIT}`);
  
  // Log no console do Apps Script
  const consoleMsg = `[${t}] [${m}] ${msg}`;
  switch(t) {
    case 'ERROR':
      console.error(consoleMsg);
      break;
    case 'WARN':
      console.warn(consoleMsg);
      break;
    case 'DEBUG':
      console.log('🐛 ' + consoleMsg);
      break;
    default:
      console.log(consoleMsg);
  }
  
  // Log na planilha (buffered) com detalhes
  LOG_BUFFER_.push([
    new Date(),
    t,
    m,
    msg,
    details.aba || '',
    details.linha || '',
    details.oportunidade || '',
    details.acao || ''
  ]);
  
  console.log(`🔍 LOG_BUFFER_ agora tem ${LOG_BUFFER_.length} item(s)`);
  
  if (LOG_BUFFER_.length >= LOG_BUFFER_LIMIT) {
    console.log(`🔍 LIMITE ATINGIDO (${LOG_BUFFER_LIMIT}), chamando flushLogs_()`);
    flushLogs_();
  }
}

/**
 * Alias interno para não quebrar código que usa logToSheet_
 */
function logToSheet_(t, m, msg) {
  logToSheet(t, m, msg);
}

function flushLogs_() {
  if (!LOG_BUFFER_.length) {
    console.log('🔍 flushLogs_: Buffer vazio, nada para escrever');
    return;
  }
  
  console.log(`🔍 flushLogs_: Iniciando flush de ${LOG_BUFFER_.length} log(s)`);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let s = ss.getSheetByName(SHEETS.LOGS);
    
    console.log(`🔍 flushLogs_: Aba "${SHEETS.LOGS}" ${s ? 'encontrada' : 'NÃO encontrada'}`);
    
    // Criar aba se não existir
    if (!s) {
      console.log('🔍 flushLogs_: Criando nova aba de logs...');
      s = ss.insertSheet(SHEETS.LOGS);
    }
    
    // SEMPRE garantir headers (mesmo se aba já existe)
    const currentLastRow = s.getLastRow();
    const needsHeaders = currentLastRow === 0 || !s.getRange(1, 1).getValue();
    
    console.log(`🔍 flushLogs_: lastRow=${currentLastRow}, needsHeaders=${needsHeaders}`);
    
    if (needsHeaders) {
      console.log('🔍 flushLogs_: Criando/Restaurando cabeçalho...');
      
      // Limpar aba primeiro se houver dados
      if (currentLastRow > 0) {
        s.clear();
      }
      
      // Formatar cabeçalho com 8 colunas
      const headers = [[
        '📅 Data/Hora',
        '🏷️ Tipo',
        '📦 Módulo',
        '📝 Descrição',
        '📂 Aba',
        '📍 Linha',
        '🎯 Oportunidade',
        '⚡ Ação'
      ]];
      s.getRange(1, 1, 1, 8).setValues(headers);
      s.getRange(1, 1, 1, 8)
        .setBackground('#0066CC')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setFontSize(11)
        .setHorizontalAlignment('center');
      
      // Ajustar largura das colunas
      s.setColumnWidth(1, 180); // Data/Hora
      s.setColumnWidth(2, 70);  // Tipo
      s.setColumnWidth(3, 120); // Módulo
      s.setColumnWidth(4, 350); // Descrição
      s.setColumnWidth(5, 150); // Aba
      s.setColumnWidth(6, 60);  // Linha
      s.setColumnWidth(7, 250); // Oportunidade
      s.setColumnWidth(8, 150); // Ação
      
      // Congelar cabeçalho
      s.setFrozenRows(1);
      
      console.log('✅ flushLogs_: Cabeçalho configurado');
    }
    
    // Adicionar logs
    const lastRow = s.getLastRow();
    console.log(`🔍 flushLogs_: Última linha = ${lastRow}, escrevendo ${LOG_BUFFER_.length} linhas`);
    console.log(`🔍 flushLogs_: Escrevendo na aba "${s.getName()}" nas linhas ${lastRow + 1} até ${lastRow + LOG_BUFFER_.length}`);
    
    s.getRange(lastRow + 1, 1, LOG_BUFFER_.length, 8).setValues(LOG_BUFFER_);
    
    // Formatar novas linhas por tipo
    for (let i = 0; i < LOG_BUFFER_.length; i++) {
      const tipo = LOG_BUFFER_[i][1];
      const row = lastRow + 1 + i;
      const range = s.getRange(row, 1, 1, 8);
      
      switch(tipo) {
        case 'ERROR':
          range.setBackground('#FFE6E6').setFontColor('#CC0000');
          break;
        case 'WARN':
          range.setBackground('#FFF4E6').setFontColor('#FF8800');
          break;
        case 'DEBUG':
          range.setBackground('#F0F0F0').setFontColor('#666666');
          break;
        case 'INFO':
          range.setBackground('#E6F4FF').setFontColor('#0066CC');
          break;
      }
    }
    
    console.log(`✅ flushLogs_: ${LOG_BUFFER_.length} log(s) escritos com sucesso`);
    LOG_BUFFER_ = [];
  } catch (e) {
    // Falha silenciosa aceitável - evita loop infinito se logToSheet falhar
    try {
      console.error("❌ Erro ao fazer flush de logs:", e.message);
      console.error("Stack:", e.stack);
    } catch (ignored) {}
  }
}

/**
 * Limpa o log de execução (RESET)
 * Usado quando execução manual pelo MENU (não trigger)
 * @private
 */
function limparLogExecucao_() {
  try {
    console.log('🧹 Limpando log de execução (RESET MANUAL)...');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName(SHEETS.LOGS);
    
    if (!logSheet) {
      console.log('⚠️ Aba de logs não existe ainda - será criada ao primeiro log');
      return;
    }
    
    // Limpar todos os dados exceto o cabeçalho
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1) {
      logSheet.deleteRows(2, lastRow - 1);
      console.log(`✅ ${lastRow - 1} linha(s) de log removidas`);
    } else {
      console.log('ℹ️ Log já estava vazio');
    }
    
    // Limpar buffer também
    LOG_BUFFER_ = [];
    
    // Adicionar separador visual
    logSheet.appendRow([
      new Date(),
      'INFO',
      'Sistema',
      '━━━━━━━━━━━━━━━ NOVA EXECUÇÃO MANUAL ━━━━━━━━━━━━━━━',
      '',
      '',
      '',
      ''
    ]);
    
    // Formatar linha separadora
    const newRow = logSheet.getLastRow();
    logSheet.getRange(newRow, 1, 1, 8)
      .setBackground('#0066CC')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    
    console.log('✅ Log de execução reiniciado');
    
  } catch (e) {
    console.error('❌ Erro ao limpar log:', e.message);
    // Não lançar erro - falha no log não deve interromper execução
  }
}

function clearRuntimeState_() {
  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys();
  const runtimePrefixes = ["CURRENT_INDEX_", "IS_RUNNING_", "RUN_ID_", "QUEUE_SHEET_"];
  keys.forEach(k => {
    if (runtimePrefixes.some(p => k.startsWith(p))) props.deleteProperty(k);
  });
}

function safeAlert_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    logToSheet("INFO", "UI", "ALERT: " + msg);
  }
}

function safeToast_(msg, title) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, title);
  } catch (e) {
    logToSheet("INFO", "UI", `TOAST: ${title} - ${msg}`);
  }
}

function findCol_(headers, possibleNames) {
  if (!headers) return -1;
  const lower = headers.map(h => normText_(h));
  for (let name of possibleNames) {
    const idx = lower.indexOf(normText_(name));
    if (idx > -1) return idx;
  }
  return -1;
}

function cleanupOldQueueSheets_(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queuePrefix = `_QUEUE_${mode}_`;
  const aggPrefix = `_AGG_${mode}_`;
  const currentQueue = getQueueSheetName_(mode);
  const currentAgg = PropertiesService.getScriptProperties().getProperty(`AGG_SNAPSHOT_${mode}`) || "";
  
  let cleanedCount = 0;
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if ((name.startsWith(queuePrefix) && name !== currentQueue) || 
        (name.startsWith(aggPrefix) && name !== currentAgg)) {
      ss.deleteSheet(s);
      cleanedCount++;
      logToSheet("INFO", "Cleanup", `Sheet removida: ${name}`);
    }
  });
  
  if (cleanedCount > 0) {
    logToSheet("INFO", "Cleanup", `Total de ${cleanedCount} sheets antigas removidas para modo ${mode}.`);
  }
}

/**
 * Calcula SHA-256 de um texto
 */
function computeSHA256_(text) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return rawHash.map(byte => {
    const v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length == 1 ? '0' + v : v;
  }).join('');
}

/**
 * Retorna email do ator ou SYSTEM
 */
function getActorEmail_() {
  try {
    return Session.getActiveUser().getEmail() || "SYSTEM";
  } catch (e) {
    return "SYSTEM";
  }
}

/**
 * Calcula hash de integridade de uma oportunidade
 */
function computeOppIntegrityHash_(item) {
  const closedDate = item.closed instanceof Date ? item.closed : parseDate(item.closed);
  const criticalFields = [
    item.oppKey || "",
    item.oppName || "",
    item.accName || "",
    item.owner || "",
    normalizeStage_(item.stage) || "",
    item.probabilidad || 0,
    closedDate instanceof Date ? Utilities.formatDate(closedDate, "GMT", "yyyy-MM-dd") : "",
    item.gross || 0,
    item.net || 0,
    item.products || "",
    item.portfolio || "",
    item.segment || "",
    item.forecast_sf || ""
  ];
  
  const payload = criticalFields.map((f, i) => `f${i}=${f}`).join("|");
  return computeSHA256_(payload);
}

/**
 * Detecta Stage Drift (fase declarada vs evidências)
 */
function detectStageDrift_(item, activityData, auditSummary, relatedChanges, headersChanges) {
  const stageDeclared = normalizeStage_(item.stage);
  const hoje = new Date();
  
  const signals = {
    hasRecentActivity: false,
    hasNextStep: false,
    nextActivitySoon: false,
    stageRecentlyChanged: false,
    nextStepRecentlyChanged: false
  };
  
  if (activityData.lastDate) {
    const daysSinceActivity = Math.ceil((hoje - activityData.lastDate) / MS_PER_DAY);
    signals.hasRecentActivity = daysSinceActivity <= 14;
  }
  
  const nextStep = String(item.nextStep || "").trim();
  signals.hasNextStep = nextStep.length > 5 && !/follow.?up|acompanhar|pendente/i.test(nextStep);
  
  if (item.nextActivityDate instanceof Date) {
    const daysToActivity = Math.ceil((item.nextActivityDate - hoje) / MS_PER_DAY);
    signals.nextActivitySoon = daysToActivity >= 0 && daysToActivity <= 14;
  }
  
  if (item.lastStageChange instanceof Date) {
    const daysSinceStageChange = Math.ceil((hoje - item.lastStageChange) / MS_PER_DAY);
    signals.stageRecentlyChanged = daysSinceStageChange <= 21;
  }
  
  const evidenceScore = (
    (signals.hasRecentActivity ? 30 : 0) +
    (signals.hasNextStep ? 25 : 0) +
    (signals.nextActivitySoon ? 25 : 0) +
    (signals.stageRecentlyChanged ? 20 : 0)
  );
  
  let driftLevel = "OK";
  let driftReason = "Evidências coerentes com a fase";
  
  if (["Proposta", "Negociação", "Deal Desk"].includes(stageDeclared)) {
    if (!signals.hasRecentActivity && !signals.hasNextStep) {
      driftLevel = "CRITICAL";
      driftReason = "Fase avançada sem atividade recente e sem próximo passo definido";
    } else if (!signals.nextActivitySoon && evidenceScore < 50) {
      driftLevel = "WARNING";
      driftReason = "Fase avançada com evidências fracas de progresso";
    }
  } else if (["Avaliação", "Qualificar"].includes(stageDeclared)) {
    if (!signals.hasRecentActivity && !signals.stageRecentlyChanged && evidenceScore < 30) {
      driftLevel = "WARNING";
      driftReason = "Fase inicial estagnada sem movimentação recente";
    }
  }
  
  return {
    stageDeclared: stageDeclared,
    evidenceSignals: signals,
    stageEvidenceScore: evidenceScore,
    driftLevel: driftLevel,
    driftReason: driftReason
  };
}

/**
 * Determina se deve bypasear IA (gates frios)
 */
function shouldBypassAI_(mode, governanceIssues, item, driftInfo) {
  const issues = new Set(governanceIssues);
  
  if (issues.has(ENUMS.LABELS.DEAL_DESK)) {
    return {
      bypass: true,
      reason: "Deal Desk obrigatório para valores acima de threshold sem aprovação detectada",
      forcedActionCode: ENUMS.ACTION_CODE.DEAL_DESK
    };
  }
  
  if (issues.has(ENUMS.LABELS.NET_ZERO)) {
    return {
      bypass: true,
      reason: "Receita líquida zerada - impossível avaliar rentabilidade",
      forcedActionCode: ENUMS.ACTION_CODE.CRM_AUDIT
    };
  }
  
  if (driftInfo && driftInfo.driftLevel === "CRITICAL") {
    return {
      bypass: true,
      reason: driftInfo.driftReason,
      forcedActionCode: ENUMS.ACTION_CODE.REQUALIFY
    };
  }
  
  if (!item.closed || !(item.closed instanceof Date)) {
    const stageNorm = normalizeStage_(item.stage);
    if (["Negociação", "Deal Desk", "Verificação", "Fechamento"].includes(stageNorm)) {
      return {
        bypass: true,
        reason: "Fase avançada sem data de fechamento definida",
        forcedActionCode: ENUMS.ACTION_CODE.VALIDATE_DATE
      };
    }
  }
  
  return { bypass: false };
}

/**
 * Calcula velocity e momentum de um deal baseado em histórico de mudanças
 * @param {Object} item - Dados da oportunidade
 * @param {Array} changeHistory - Array de rows de mudanças
 * @param {Object} activityData - Dados de atividade
 * @param {Array} headers - Headers da aba de mudanças
 * @return {Object} Métricas de velocity/momentum
 */
function calculateDealVelocity_(item, changeHistory, activityData, headers) {
  const metrics = {
    stageVelocity: 0,        // Dias por estágio
    valueVelocity: 0,        // % mudança de valor por dia
    probabilityTrend: 0,     // Direção da probabilidade (-1, 0, +1)
    activityMomentum: 0,     // Aceleração de atividades
    riskScore: 0,            // Score de risco (0-100)
    prediction: "ESTÁVEL"     // ACELERANDO, DESACELERANDO, ESTÁVEL, ESTAGNADO
  };

  if (!changeHistory || changeHistory.length === 0 || !headers || headers.length === 0) {
    logToSheet("DEBUG", "VelocityCalc", `⚠️ Early return: changeHistory=${changeHistory?.length || 0}, headers=${headers?.length || 0}, oppName=${item?.oppName || 'N/A'}`);
    return metrics;
  }
  
  // Transforma rows brutas em objetos estruturados
  const h = headers.map(x => normText_(x));
  const findIdx = (cands) => { 
    for (let c of cands) { 
      const i = h.indexOf(normText_(c)); 
      if (i > -1) return i; 
    } 
    return -1; 
  };
  
  const colField = findIdx(["field / event", "campo/compromisso", "campo", "field"]);
  const colOld = findIdx(["old value", "valor antigo", "old"]);
  const colNew = findIdx(["new value", "novo valor", "valor novo", "new"]);
  const colDate = findIdx(["edit date", "data de edição", "data de edicao", "data", "date"]);
  
  // Converte rows em objetos com campos padronizados
  const changes = changeHistory.map(row => {
    const ts = colDate > -1 ? parseDate(row[colDate]) : null;
    return {
      field: colField > -1 ? String(row[colField] || "") : "",
      oldValue: colOld > -1 ? String(row[colOld] || "") : "",
      newValue: colNew > -1 ? String(row[colNew] || "") : "",
      timestamp: (ts && !isNaN(ts.getTime())) ? ts : null
    };
  }).filter(c => c.timestamp !== null && !isNaN(c.timestamp.getTime())); // Remove mudanças sem data válida

  // 1. STAGE VELOCITY (tempo médio entre mudanças de fase)
  const stageChanges = changes.filter(c => {
    const fieldNorm = normText_(c.field);
    return fieldNorm.includes("FASE") || 
           fieldNorm.includes("STAGE") ||
           fieldNorm.includes("ETAPA") ||
           fieldNorm.includes("ESTAGIO");
  }).sort((a, b) => a.timestamp - b.timestamp);

  if (stageChanges.length >= 2) {
    const firstChange = stageChanges[0].timestamp;
    const lastChange = stageChanges[stageChanges.length - 1].timestamp;
    const daysDiff = (lastChange - firstChange) / MS_PER_DAY;
    if (!isNaN(daysDiff) && daysDiff >= 0 && stageChanges.length > 0) {
      metrics.stageVelocity = Math.round(daysDiff / stageChanges.length);
    }
  }

  // 2. VALUE VELOCITY (taxa de mudança de valor)
  const valueChanges = changes.filter(c => {
    const fieldNorm = normText_(c.field);
    return fieldNorm.includes("VALOR") || 
           fieldNorm.includes("AMOUNT") ||
           fieldNorm.includes("GROSS") ||
           fieldNorm.includes("TOTAL PRICE") ||
           fieldNorm.includes("NET REVENUE");
  }).sort((a, b) => a.timestamp - b.timestamp);

  if (valueChanges.length >= 2) {
    const firstVal = parseMoney(valueChanges[0].oldValue || "0");
    const lastVal = parseMoney(valueChanges[valueChanges.length - 1].newValue || "0");
    const firstDate = valueChanges[0].timestamp;
    const lastDate = valueChanges[valueChanges.length - 1].timestamp;
    const daysDiff = Math.max(1, (lastDate - firstDate) / MS_PER_DAY);
    
    if (firstVal > 0 && !isNaN(firstVal) && !isNaN(lastVal) && !isNaN(daysDiff)) {
      const pctChange = ((lastVal - firstVal) / firstVal) * 100;
      metrics.valueVelocity = Math.round((pctChange / daysDiff) * 100) / 100;
    }
  }

  // 3. PROBABILITY TREND (tendência de probabilidade)
  const probChanges = changes.filter(c => {
    const fieldNorm = normText_(c.field);
    return fieldNorm.includes("PROBABILIDAD") || 
           fieldNorm.includes("PROBABILITY") ||
           fieldNorm.includes("CHANCE") ||
           fieldNorm.includes("%");
  }).sort((a, b) => a.timestamp - b.timestamp);

  if (probChanges.length >= 2) {
    const recentChanges = probChanges.slice(-3);
    let upCount = 0, downCount = 0;
    recentChanges.forEach(c => {
      const oldP = parsePercentage(c.oldValue || "0");
      const newP = parsePercentage(c.newValue || "0");
      if (newP > oldP) upCount++;
      else if (newP < oldP) downCount++;
    });
    metrics.probabilityTrend = upCount > downCount ? 1 : (downCount > upCount ? -1 : 0);
  }

  // 4. ACTIVITY MOMENTUM (mudanças nos últimos 7 dias vs. 7 dias anteriores)
  if (changes.length > 0) {
    const now = new Date();
    const last7Days = changes.filter(c => {
      const daysDiff = (now - c.timestamp) / MS_PER_DAY;
      return daysDiff >= 0 && daysDiff <= 7;
    }).length;
    
    const prev7Days = changes.filter(c => {
      const daysDiff = (now - c.timestamp) / MS_PER_DAY;
      return daysDiff > 7 && daysDiff <= 14;
    }).length;

    if (prev7Days > 0) {
      metrics.activityMomentum = Math.round(((last7Days - prev7Days) / prev7Days) * 100);
    } else {
      metrics.activityMomentum = last7Days > 0 ? 100 : 0;
    }
  }

  // 5. PREDICTION (baseado em múltiplos sinais com ponderação de magnitude)
  let signals = 0;
  
  // Ponderar velocidade de valor pela magnitude da mudança
  if (valueChanges.length >= 2) {
    const firstVal = parseMoney(valueChanges[0].oldValue || "0");
    const lastVal = parseMoney(valueChanges[valueChanges.length - 1].newValue || "0");
    const absoluteChange = Math.abs(lastVal - firstVal);
    
    // Peso baseado na magnitude: mudanças > $50k têm peso total, < $5k têm peso reduzido
    let magnitudeWeight = 1.0;
    if (absoluteChange < 5000) magnitudeWeight = 0.3;
    else if (absoluteChange < 20000) magnitudeWeight = 0.6;
    else if (absoluteChange < 50000) magnitudeWeight = 0.8;
    
    if (metrics.valueVelocity > 5) signals += magnitudeWeight;
    if (metrics.valueVelocity < -5) signals -= magnitudeWeight;
  }
  
  // Probabilidade tem peso total (mudanças de % são significativas)
  if (metrics.probabilityTrend > 0) signals += 1;
  if (metrics.probabilityTrend < 0) signals -= 1;
  
  // Ponderar activity momentum pela quantidade de mudanças
  if (changes.length > 0) {
    const changeCount = changes.length;
    let activityWeight = 1.0;
    if (changeCount < 5) activityWeight = 0.4;
    else if (changeCount < 10) activityWeight = 0.7;
    
    if (metrics.activityMomentum > 50) signals += activityWeight;
    if (metrics.activityMomentum < -30) signals -= activityWeight;
  }
  
  // Stage velocity mantém peso total
  if (metrics.stageVelocity > 0 && metrics.stageVelocity < 14) signals += 1;
  if (metrics.stageVelocity > 45) signals -= 1;

  // Limiares ajustados para signals ponderados (decimais)
  if (signals >= 1.5) metrics.prediction = "ACELERANDO";
  else if (signals <= -1.5) metrics.prediction = "DESACELERANDO";
  else if (metrics.stageVelocity === 0 && activityData.count < 2) metrics.prediction = "ESTAGNADO";
  else metrics.prediction = "ESTÁVEL";

  // 6. RISK SCORE (0-100)
  let risk = 50; // baseline
  if (metrics.prediction === "DESACELERANDO") risk += 20;
  if (metrics.prediction === "ESTAGNADO") risk += 30;
  if (metrics.valueVelocity < -10) risk += 15;
  if (metrics.probabilityTrend < 0) risk += 10;
  if (activityData && activityData.count < 3) risk += 10;
  if (metrics.prediction === "ACELERANDO") risk -= 20;
  if (metrics.probabilityTrend > 0) risk -= 10;
  metrics.riskScore = Math.max(0, Math.min(100, risk));
  
  logToSheet("DEBUG", "VelocityCalc", `${item.oppName}: prediction=${metrics.prediction}, activityCount=${activityData?.count || 0}, risk=${risk} → riskScore=${metrics.riskScore}`);

  return metrics;
}

/**
 * Análise estatística avançada com Z-score e outlier detection
 * @param {Array} dataset - Array de valores numéricos
 * @return {Object} Estatísticas descritivas
 */
function calculateStatistics_(dataset) {
  if (!dataset || dataset.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0, iqr: 0 };
  }

  const sorted = dataset.slice().sort((a, b) => a - b);
  const n = sorted.length;
  
  // Mean
  const mean = sorted.reduce((sum, val) => sum + val, 0) / n;
  
  // Median
  const median = n % 2 === 0 
    ? (sorted[n/2 - 1] + sorted[n/2]) / 2 
    : sorted[Math.floor(n/2)];
  
  // Standard Deviation
  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  // Quartiles (for IQR)
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  
  return { mean, median, stdDev, q1, q3, iqr };
}

/**
 * Detecta anomalias usando Z-score e IQR
 * @param {number} value - Valor a testar
 * @param {Object} stats - Estatísticas do dataset
 * @return {Object} Resultado da detecção
 */
function detectAnomaly_(value, stats) {
  const zScore = stats.stdDev > 0 ? Math.abs((value - stats.mean) / stats.stdDev) : 0;
  const lowerBound = stats.q1 - (1.5 * stats.iqr);
  const upperBound = stats.q3 + (1.5 * stats.iqr);
  const isOutlierIQR = value < lowerBound || value > upperBound;
  const isOutlierZ = zScore > 3; // 3 sigma
  
  return {
    isAnomaly: isOutlierIQR || isOutlierZ,
    zScore: Math.round(zScore * 100) / 100,
    severity: zScore > 3 ? "CRITICAL" : (zScore > 2 ? "HIGH" : "NORMAL"),
    method: isOutlierZ ? "Z-SCORE" : (isOutlierIQR ? "IQR" : "NONE")
  };
}

/**
 * Time-Series Forecast usando Simple Moving Average e Exponential Smoothing
 * @param {Array} timeSeries - Array de {timestamp, value}
 * @param {number} horizon - Dias para prever
 * @return {Object} Previsão e confiança
 */
function forecastTimeSeries_(timeSeries, horizon = 7) {
  if (!timeSeries || timeSeries.length < 3) {
    return { forecast: 0, confidence: 0, trend: "INSUFFICIENT_DATA" };
  }

  const sorted = timeSeries.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const values = sorted.map(s => s.value);
  
  // Simple Moving Average (SMA) - últimos 3 pontos
  const window = Math.min(3, values.length);
  const recent = values.slice(-window);
  const sma = recent.reduce((sum, v) => sum + v, 0) / window;
  
  // Exponential Smoothing (alpha = 0.3)
  const alpha = 0.3;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  
  // Trend detection
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const avgFirst = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
  
  let trend = "STABLE";
  const trendPct = ((avgSecond - avgFirst) / avgFirst) * 100;
  if (trendPct > 10) trend = "GROWING";
  else if (trendPct < -10) trend = "DECLINING";
  
  // Forecast = média ponderada de SMA e EMA
  const forecast = Math.round((0.6 * ema + 0.4 * sma) * 100) / 100;
  
  // Confidence baseado em variação
  const stats = calculateStatistics_(values);
  const cv = stats.mean > 0 ? (stats.stdDev / stats.mean) : 1; // Coefficient of variation
  const confidence = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
  
  return { forecast, confidence, trend, sma, ema };
}

/**
 * Categoriza severidade da mudança
 */
function categorizeChangeSeverity_(sheetName, fieldName, oldValue, newValue) {
  const criticalFields = ["Stage", "Close Date", "Total Price", "Probability", "Forecast"];
  const warningFields = ["Next Step", "Next Activity Date", "Owner"];
  
  if (criticalFields.some(f => fieldName.includes(f))) {
    const oldNum = parseFloat(String(oldValue).replace(/[^\d.-]/g, ''));
    const newNum = parseFloat(String(newValue).replace(/[^\d.-]/g, ''));
    
    if (!isNaN(oldNum) && !isNaN(newNum)) {
      const change = Math.abs((newNum - oldNum) / oldNum);
      if (change > 0.2) return "CRITICAL";
    }
    
    return "WARN";
  }
  
  if (warningFields.some(f => fieldName.includes(f))) return "WARN";
  
  return "INFO";
}

/**
 * Detecta padrão na mudança
 */
function detectPattern_(fieldName, oldValue, newValue, previousCount) {
  if (fieldName.includes("Stage")) {
    const stages = ["Qualificar", "Avaliação", "Proposta", "Negociação", "Fechamento"];
    const oldIdx = stages.findIndex(s => normText_(oldValue).includes(normText_(s)));
    const newIdx = stages.findIndex(s => normText_(newValue).includes(normText_(s)));
    
    if (oldIdx > newIdx) return "🔴 REGRESSÃO DE FASE";
    if (newIdx > oldIdx) return "🟢 PROGRESSÃO";
  }
  
  if (fieldName.includes("Close Date") || fieldName.includes("Data")) {
    const oldDate = parseDate(oldValue);
    const newDate = parseDate(newValue);
    
    if (oldDate && newDate && newDate > oldDate) {
      const daysDiff = Math.ceil((newDate - oldDate) / MS_PER_DAY);
      if (daysDiff > 30) return "⚠️ ATRASO SIGNIFICATIVO";
      return "📅 DATA POSTERGADA";
    }
  }
  
  if (fieldName.includes("Price") || fieldName.includes("Amount") || fieldName.includes("Valor")) {
    const oldNum = parseMoney(oldValue);
    const newNum = parseMoney(newValue);
    
    if (oldNum > 0 && newNum > 0) {
      const change = (newNum - oldNum) / oldNum;
      if (change < -0.2) return "💰 REDUÇÃO VALOR >20%";
      if (change > 0.2) return "📈 AUMENTO VALOR >20%";
    }
  }
  
  if (previousCount >= 3) return "🔄 MUDANÇA RECORRENTE";
  
  return "✏️ ATUALIZAÇÃO NORMAL";
}

/**
 * Calcula score de risco baseado em padrões
 */
function calculateRiskScore_(fieldName, pattern, changeCount) {
  let score = 0;
  
  if (pattern.includes("REGRESSÃO")) score += 40;
  if (pattern.includes("REDUÇÃO VALOR")) score += 30;
  if (pattern.includes("ATRASO SIGNIFICATIVO")) score += 25;
  if (pattern.includes("RECORRENTE")) score += 20;
  
  if (["Stage", "Close Date", "Forecast"].some(f => fieldName.includes(f))) {
    score += 10;
  }
  
  if (changeCount > 5) score += 15;
  if (changeCount > 10) score += 25;
  
  return Math.min(100, score);
}

function formatDateShort_(val) {
  if (!val) return "-";
  return String(val).substring(0, 10);
}

