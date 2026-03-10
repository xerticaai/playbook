/**
 * FaturamentoSync.gs
 * Sincroniza as abas FATURAMENTO_2025 e FATURAMENTO_2026 da planilha de origem
 * para a planilha vinculada ao AppSheet (mesmos nomes de abas no destino).
 *
 * Mantém compatibilidade com funções antigas usadas no menu:
 * - migrarFaturamento()      => migra FATURAMENTO_2025 + FATURAMENTO_2026
 * - migrarTodoFaturamento()  => migra FATURAMENTO_2025 + FATURAMENTO_2026
 */

// ==================== CONFIGURAÇÕES ====================

const FAT_SOURCE_SPREADSHEET_ID = '18uYGqmkmsclVuZcONqi4fqqk2a7_D-NkwtG2r6JcY3k';
const FAT_WEEKLY_SOURCE_SPREADSHEET_ID = '18PDjdprqBZCQsJxA8Jc7xQNX7iLsfpPWQ-AuBDF4OgQ';

const FAT_2025_SOURCE_SHEET_NAME = 'FATURAMENTO_2025';
const FAT_2026_SOURCE_SHEET_NAME = 'FATURAMENTO_2026';
const FAT_WEEKLY_Q1_2026_SOURCE_SHEET_NAME = 'Q1 2026';
const FAT_ENABLE_WEEKLY_Q1_2026 = false;

const FAT_2025_DEST_SHEET_NAME = 'FATURAMENTO_2025';
const FAT_2026_DEST_SHEET_NAME = 'FATURAMENTO_2026';
const FAT_WEEKLY_DEST_SHEET_NAME = 'Faturamento_Week';

const FAT_TRIGGER_HANDLER_GERAL = 'migrarTodoFaturamento';

const FAT_EXPECTED_HEADERS_BY_SHEET = {
  FATURAMENTO_2026: [
    'Mes', 'País', 'Cuenta Financiera', 'Tipo de Documento', 'Fecha de factura', 'Póliza (País)',
    'Cueta contable', '(Moneda Local) Valor de Factura (Sin IVA)', 'Producto', 'Oportunidad',
    'Cliente', 'ID oportunidad', 'Billing ID', '% Desc. Xertica (NS)', 'Tipo de Producto',
    'Portafolio', 'Timbradas', 'Estado de Pago', 'Fecha Doc. Timbrado', 'Familia',
    'Tipo cambio pactado', 'Tipo de cambio diario', 'Valor de Factura en USD (Comercial)',
    'Net Revenue', 'Incentivos Google', 'Backlog nombrado', 'País del comercial', 'Comercial',
    'Año oportunidad', 'Tipo de Oportunidad (Line)', 'Dominio', 'Segmento', 'Concatenar',
    'Margen % Final', 'Revisión margen', 'Etapa de la oportunidad', 'Descuento Xertica',
    'Escenario NR', 'Q', 'validación costo + margen', 'Proceso', '',
    'Costo %', 'Costo $ (moneda local)', 'Generales Budget', 'Receita USD', 'PNL Receita',
    'Custo USD', 'PNL Custo', 'REVENUE REVISION', 'NET real'
  ]
};

// ==================== ALIAS MAP (NORMALIZAÇÃO DE CABEÇALHO) ====================

/**
 * Mapeamento explícito (header normalizado -> header destino padronizado).
 * Colunas não mapeadas entram por auto-normalização em snake_case.
 */
const FAT_ALIAS_MAP = {
  'mes':                                          'mes',
  'pais':                                         'pais',
  'cuenta financiera':                            'cuenta_financeira',
  'tipo de documento':                            'tipo_documento',
  'fecha de factura':                             'fecha_factura',
  'poliza (pais)':                                'poliza_pais',
  'cueta contable':                               'cuenta_contable',
  'cuenta contable':                              'cuenta_contable',
  '(moneda local) valor de factura (sin iva)':    'valor_fatura_moeda_local_sem_iva',
  '% margen':                                     'percentual_margem',
  'producto':                                     'produto',
  'oportunidad':                                  'oportunidade',
  'cliente':                                      'cliente',
  'tipo de oportunidad (ns)':                     'tipo_oportunidade_ns',
  'folio salesforce (ns)':                        'folio_salesforce_ns',
  '% desc. xertica (ns)':                         'percentual_desconto_xertica_ns',
  'tipo de producto':                             'tipo_produto',
  'portafolio':                                   'portafolio',
  'timbradas':                                    'timbradas',
  'estado de pago':                               'estado_pagamento',
  'fecha doc. timbrado':                          'fecha_doc_timbrado',
  'familia':                                      'familia',
  'tipo cambio pactado':                          'tipo_cambio_pactado',
  'tipo de cambio pactado':                       'tipo_cambio_pactado',
  'tipo de cambio diario':                        'tipo_cambio_diario',
  'tipo de cambio ajustado':                      'tipo_cambio_ajustado',
  'valor de factura en usd (comercial)':          'valor_fatura_usd_comercial',
  'net revenue':                                  'net_revenue',
  'net ajustado usd':                             'net_ajustado_usd',
  'incentivos google':                            'incentivos_google',
  'backlog nombrado':                             'backlog_nomeado',
  'pais del comercial':                           'pais_comercial',
  'comercial':                                    'comercial',
  'ano oportunidad':                              'ano_oportunidade',
  'año oportunidad':                              'ano_oportunidade',
  'tipo de oportunidad (line)':                   'tipo_oportunidade_line',
  'dominio':                                      'dominio',
  'segmento':                                     'segmento',
  'concatenar':                                   'concatenar',
  'margen % final':                               'margem_percentual_final',
  'revision margen':                              'revisao_margem',
  'revisión margen':                              'revisao_margem',
  'etapa de la oportunidad':                      'etapa_oportunidade',
  'descuento xertica':                            'desconto_xertica',
  'escenario nr':                                 'cenario_nr',
  'q':                                            'q',
  'validacion costo + margen':                    'validacao_custo_margem',
  'validación costo + margen':                    'validacao_custo_margem',
  'proceso':                                      'processo',
  'costo %':                                      'custo_percentual',
  'costo $ (moneda local)':                       'custo_moeda_local',
  'id oportunidad':                               'id_oportunidade',
  'billing id':                                   'billing_id',
  'generales budget':                             'generales_budget',
  'receita usd':                                  'receita_usd',
  'pnl receita':                                  'pnl_receita',
  'custo usd':                                    'custo_usd',
  'pnl custo':                                    'pnl_custo',
  'revenue revision':                             'revenue_revision',
  'net real':                                     'net_real',
};

// ==================== FUNÇÕES PRINCIPAIS ====================

/**
 * Migração geral: FATURAMENTO_2025 + FATURAMENTO_2026 + Faturamento_Week (Q1 2026).
 */
function migrarFaturamento() {
  migrarTodoFaturamento();
}

/**
 * Compatibilidade legada: migra apenas FATURAMENTO_2026.
 */
function migrarFaturamento2026() {
  migrarAbaFaturamento_(FAT_2026_SOURCE_SHEET_NAME, FAT_2026_DEST_SHEET_NAME, 'Faturamento2026');
}

/**
 * Migra a aba semanal Q1 2026 para Faturamento_Week.
 */
function migrarFaturamentoSemanal() {
  migrarAbaFaturamentoComOrigem_(
    FAT_WEEKLY_SOURCE_SPREADSHEET_ID,
    FAT_WEEKLY_Q1_2026_SOURCE_SHEET_NAME,
    FAT_WEEKLY_DEST_SHEET_NAME,
    'FaturamentoSemanalQ1_2026'
  );
}

/**
 * Migra as três abas (2025 + 2026 + semanal Q1 2026).
 */
function migrarTodoFaturamento() {
  const inicio = new Date();
  console.log(`🚀 [FaturamentoSync] Iniciando migração completa em ${inicio.toLocaleString('pt-BR')}`);

  migrarAbaFaturamentoComOrigem_(
    FAT_SOURCE_SPREADSHEET_ID,
    FAT_2025_SOURCE_SHEET_NAME,
    FAT_2025_DEST_SHEET_NAME,
    'Faturamento2025'
  );
  migrarFaturamento2026();
  if (FAT_ENABLE_WEEKLY_Q1_2026) {
    migrarFaturamentoSemanal();
  } else {
    console.log('ℹ️ [FaturamentoSync] Migração semanal Q1_2026 desativada neste cenário.');
  }

  const duracao = ((new Date() - inicio) / 1000).toFixed(1);
  console.log(`✅ [FaturamentoSync] Migração completa concluída em ${duracao}s`);
}

// ==================== TRIGGERS ====================

function instalarTriggerFaturamento12h() {
  removerTriggerFaturamento();

  ScriptApp.newTrigger(FAT_TRIGGER_HANDLER_GERAL)
    .timeBased()
    .everyHours(12)
    .create();

  console.log(`✅ [FaturamentoSync] Trigger geral de 12h instalado para "${FAT_TRIGGER_HANDLER_GERAL}"`);

  try {
    SpreadsheetApp.getUi().alert(
      '⏰ Trigger geral instalado!\n\n' +
      'A migração das abas FATURAMENTO_2025, FATURAMENTO_2026 e Faturamento_Week será executada a cada 12 horas.\n\n' +
      'Para remover, use: removerTriggerFaturamento()'
    );
  } catch (_) {}
}

function removerTriggerFaturamento() {
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;
  triggers.forEach(t => {
    const handler = t.getHandlerFunction();
    if (
      handler === FAT_TRIGGER_HANDLER_GERAL ||
      handler === 'migrarFaturamento' ||
      handler === 'migrarFaturamento2026'
    ) {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });
  console.log(
    removidos > 0
      ? `🗑️ [FaturamentoSync] ${removidos} trigger(s) removido(s).`
      : `ℹ️ [FaturamentoSync] Nenhum trigger ativo encontrado.`
  );
}

function instalarTriggerFaturamento2026_12h() {
  instalarTriggerFaturamento12h();
}

function removerTriggerFaturamento2026() {
  removerTriggerFaturamento();
}

function statusTriggerFaturamento() {
  const triggers = ScriptApp.getProjectTriggers();

  const ativos = triggers.filter(t => t.getHandlerFunction() === FAT_TRIGGER_HANDLER_GERAL);

  if (ativos.length === 0) {
    console.log('ℹ️ [FaturamentoSync] Trigger geral NÃO instalado.');
  } else {
    ativos.forEach(t =>
      console.log(`✅ [FaturamentoSync] Trigger geral ativo | ID: ${t.getUniqueId()} | Tipo: ${t.getEventType()}`)
    );
  }
}

function statusTriggerFaturamento2026() {
  statusTriggerFaturamento();
}

// ==================== CORE ====================

/**
 * Migra uma aba de faturamento de origem para destino, normalizando cabeçalhos.
 */
function migrarAbaFaturamento_(sourceSheetName, destSheetName, logTag) {
  migrarAbaFaturamentoComOrigem_(FAT_SOURCE_SPREADSHEET_ID, sourceSheetName, destSheetName, logTag);
}

/**
 * Migra uma aba de faturamento de uma planilha de origem para destino, normalizando cabeçalhos.
 */
function migrarAbaFaturamentoComOrigem_(sourceSpreadsheetId, sourceSheetName, destSheetName, logTag) {
  const inicio = new Date();
  console.log(`🚀 [${logTag}] Iniciando migração em ${inicio.toLocaleString('pt-BR')}`);

  try {
    const ssOrigem = SpreadsheetApp.openById(sourceSpreadsheetId);
    const abaOrigem = ssOrigem.getSheetByName(sourceSheetName);

    if (!abaOrigem) {
      throw new Error(
        `Aba "${sourceSheetName}" não encontrada na planilha de origem ` +
        `(ID: ${sourceSpreadsheetId})`
      );
    }

    const ultimaLinha = abaOrigem.getLastRow();
    const ultimaColunaBruta = abaOrigem.getLastColumn();

    if (ultimaLinha <= 1) {
      console.log(`⚠️ [${logTag}] Aba de origem vazia ou só cabeçalho. Migração cancelada.`);
      return;
    }

    const dadosBrutos = abaOrigem.getRange(1, 1, ultimaLinha, ultimaColunaBruta).getValues();
    const headerRaw = dadosBrutos[0];
    const linhasBrutas = dadosBrutos.slice(1);

    let ultimaColuna = ultimaColunaBruta;
    while (ultimaColuna > 0) {
      const idx = ultimaColuna - 1;
      const temHeader = String(headerRaw[idx] || '').trim() !== '';
      const temDado = linhasBrutas.some(r => r[idx] !== '' && r[idx] !== null && r[idx] !== undefined);
      if (temHeader || temDado) break;
      ultimaColuna--;
    }

      const headerOrigem = headerRaw.slice(0, ultimaColuna);
      const linhasDados = linhasBrutas.map(r => r.slice(0, ultimaColuna));
      const expectedHeaders = FAT_EXPECTED_HEADERS_BY_SHEET[sourceSheetName] || [];

      // Se vier cabeçalho vazio (ex.: célula mesclada), usa fallback posicional conhecido da aba.
      const headerEfetivo = headerOrigem.map((h, idx) => {
        const raw = String(h || '').trim();
        if (raw) return raw;
        const fallback = String(expectedHeaders[idx] || '').trim();
        return fallback;
      });

      // Mantém apenas colunas que tenham cabeçalho efetivo.
      const colunasComCabecalho = [];
      headerEfetivo.forEach((h, idx) => {
        if (String(h || '').trim() !== '') colunasComCabecalho.push(idx);
      });

      const headerFiltrado = colunasComCabecalho.map((idx) => headerEfetivo[idx]);
      const linhasFiltradas = linhasDados.map((row) => colunasComCabecalho.map((idx) => row[idx]));

    console.log(
      `📋 [${logTag}] Origem: ${linhasDados.length} linhas | ` +
        `${ultimaColunaBruta} colunas brutas → ${ultimaColuna} colunas úteis → ${headerFiltrado.length} com cabeçalho`
    );

      const headerNormalizado = construirHeaderNormalizado_(headerFiltrado);

    const aliasados = headerNormalizado.filter((_, i) => {
        const chave = normalizar_(String(headerFiltrado[i]));
      return FAT_ALIAS_MAP[chave] !== undefined;
    }).length;

    console.log(
      `🔍 [${logTag}] ${headerFiltrado.length} colunas | ` +
      `${aliasados} com alias explícito | ` +
      `${headerFiltrado.length - aliasados} auto-normalizadas`
    );

      const linhasMapeadas = linhasFiltradas
      .filter(linha => linha.some(v => v !== '' && v !== null && v !== undefined))
      .map(linha => linha.map(val => formatarValor_(val)));

    if (linhasMapeadas.length === 0) {
      console.log(`⚠️ [${logTag}] Nenhuma linha com dados encontrada após filtro.`);
      return;
    }

    const ssDestino = SpreadsheetApp.getActiveSpreadsheet();
    let abaDestino = ssDestino.getSheetByName(destSheetName);

    if (!abaDestino) {
      abaDestino = ssDestino.insertSheet(destSheetName);
      console.log(`📝 [${logTag}] Aba "${destSheetName}" criada no destino.`);
    }

    abaDestino.clearContents();

    const totalColunas = headerNormalizado.length;
    const todosOsDados = [headerNormalizado, ...linhasMapeadas];
    abaDestino.getRange(1, 1, todosOsDados.length, totalColunas).setValues(todosOsDados);

    const rangeHeader = abaDestino.getRange(1, 1, 1, totalColunas);
    rangeHeader.setFontWeight('bold');
    rangeHeader.setBackground('#1a73e8');
    rangeHeader.setFontColor('#ffffff');
    abaDestino.setFrozenRows(1);

    const celTimestamp = abaDestino.getRange(1, totalColunas + 2);
    celTimestamp.setValue(`Atualizado: ${new Date().toLocaleString('pt-BR')}`);
    celTimestamp.setFontColor('#888888');
    celTimestamp.setFontStyle('italic');

    const duracao = ((new Date() - inicio) / 1000).toFixed(1);
    console.log(
      `✅ [${logTag}] Concluído: ${linhasMapeadas.length} linhas × ${totalColunas} colunas ` +
      `gravadas em "${destSheetName}" (${duracao}s)`
    );

  } catch (e) {
    console.error(`❌ [${logTag}] Erro: ${e.message}\n${e.stack}`);
    throw e;
  }
}

// ==================== UTILITÁRIOS ====================

function construirHeaderNormalizado_(headers) {
  let extraCount = 0;

  const nomes = headers.map((h) => {
    const raw = String(h).trim();
    if (!raw) {
      extraCount++;
      return extraCount === 1 ? 'coluna_extra' : `coluna_extra_${extraCount}`;
    }

    const chave = normalizar_(raw);
    if (FAT_ALIAS_MAP[chave]) return FAT_ALIAS_MAP[chave];
    return autoBqName_(raw);
  });

  const contagem = {};
  return nomes.map(nome => {
    if (!contagem[nome]) {
      contagem[nome] = 1;
      return nome;
    }
    contagem[nome]++;
    return `${nome}_${contagem[nome]}`;
  });
}

function autoBqName_(raw) {
  const nome = raw
    .replace(/[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '')
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/-+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return nome || 'coluna_sem_nome';
}

function normalizar_(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function formatarValor_(val) {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }

  if (typeof val === 'number') return val;
  return String(val).trim();
}
