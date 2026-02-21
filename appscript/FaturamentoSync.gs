/**
 * FaturamentoSync.gs
 * Migra a aba "Faturamento Consolidado (Vizualização Brasil)" da planilha de origem
 * para a aba "Faturamento_2026" da planilha vinculada ao AppScript.
 *
 * Cabeçalho padronizado para BigQuery: português, snake_case, sem acentos/especiais.
 *
 * ─── FUNÇÕES DISPONÍVEIS ────────────────────────────────────────────
 *   migrarFaturamento()                  → execução manual no editor
 *   instalarTriggerFaturamento12h()      → cria trigger de 12 em 12 horas
 *   removerTriggerFaturamento()          → remove o trigger
 * ──────────────────────────────────────────────────────────────────────
 */

// ==================== CONFIGURAÇÕES ====================

const FAT_SOURCE_SPREADSHEET_ID = '18PDjdprqBZCQsJxA8Jc7xQNX7iLsfpPWQ-AuBDF4OgQ';
const FAT_SOURCE_SHEET_NAME     = 'Faturamento Consolidado (Vizualização Brasil)';
const FAT_DEST_SHEET_NAME       = 'Faturamento_2026';
const FAT_TRIGGER_HANDLER       = 'migrarFaturamento';

// ==================== ALIAS MAP ====================
// Mapeamento explícito: header original normalizado (sem acento, minúsculas, espaços simples)
// → nome padronizado para BigQuery.
// Colunas da origem NÃO listadas aqui são auto-normalizadas e também incluídas.
const FAT_ALIAS_MAP = {
  'mes':                                         'mes',
  'pais':                                        'pais',
  'cuenta financiera':                           'cuenta_financeira',
  'tipo de documento':                           'tipo_documento',
  'fecha de factura':                            'fecha_factura',
  'poliza (pais)':                               'poliza_pais',
  'cueta contable':                              'cuenta_contable',
  '(moneda local) valor de factura (sin iva)':   'valor_fatura_moeda_local_sem_iva',
  '% margen':                                    'percentual_margem',
  'producto':                                    'produto',
  'oportunidad':                                 'oportunidade',
  'cliente':                                     'cliente',
  'tipo de oportunidad (ns)':                    'tipo_oportunidade_ns',
  'folio salesforce (ns)':                       'folio_salesforce_ns',
  '% desc. xertica (ns)':                        'percentual_desconto_xertica_ns',
  'tipo de producto':                            'tipo_produto',
  'portafolio':                                  'portafolio',
  'timbradas':                                   'timbradas',
  'estado de pago':                              'estado_pagamento',
  'fecha doc. timbrado':                         'fecha_doc_timbrado',
  'familia':                                     'familia',
  'tipo de cambio ajustado':                     'tipo_cambio_ajustado',
  'tipo de cambio diario':                       'tipo_cambio_diario',
  'valor de factura en usd (comercial)':         'valor_fatura_usd_comercial',
  'net revenue':                                 'net_revenue',
  'net ajustado usd':                            'net_ajustado_usd',
  'backlog nombrado':                            'backlog_nomeado',
  'pais del comercial':                          'pais_comercial',
  'comercial':                                   'comercial',
  'ano oportunidad':                             'ano_oportunidade',
  'tipo de oportunidad (line)':                  'tipo_oportunidade_line',
  'dominio':                                     'dominio',
  'segmento':                                    'segmento',
  'concatenar':                                  'concatenar',
  'margen % final':                              'margem_percentual_final',
  'revision margen':                             'revisao_margem',
  'etapa de la oportunidad':                     'etapa_oportunidade',
  'descuento xertica':                           'desconto_xertica',
  'escenario nr':                                'cenario_nr',
  'q':                                           'q',
  'validacion costo + margen':                   'validacao_custo_margem',
  'proceso':                                     'processo',
  'costo %':                                     'custo_percentual',
  'costo $ (moneda local)':                      'custo_moeda_local',
  'generales budget':                            'generales_budget',
  'backlog comision':                            'backlog_comissao',
  'net comisiones':                              'net_comissoes',
  '% margen de net comisiones':                  'percentual_margem_net_comissoes',
};

// ==================== FUNÇÃO PRINCIPAL ====================

/**
 * Migra TODAS as colunas de "Faturamento Consolidado (Vizualização Brasil)"
 * → "Faturamento_2026", com cabeçalho padronizado para BigQuery.
 *
 * Pode ser executado manualmente no AppScript Editor ou via trigger de 12h.
 */
function migrarFaturamento() {
  const inicio = new Date();
  console.log(`🚀 [FaturamentoSync] Iniciando migração em ${inicio.toLocaleString('pt-BR')}`);

  try {
    // ── 1. Abrir planilha de origem ──────────────────────────────────
    const ssOrigem  = SpreadsheetApp.openById(FAT_SOURCE_SPREADSHEET_ID);
    const abaOrigem = ssOrigem.getSheetByName(FAT_SOURCE_SHEET_NAME);

    if (!abaOrigem) {
      throw new Error(
        `Aba "${FAT_SOURCE_SHEET_NAME}" não encontrada na planilha de origem ` +
        `(ID: ${FAT_SOURCE_SPREADSHEET_ID})`
      );
    }

    const ultimaLinha  = abaOrigem.getLastRow();
    const ultimaColunaBruta = abaOrigem.getLastColumn();

    if (ultimaLinha <= 1) {
      console.log('⚠️ [FaturamentoSync] Aba de origem vazia ou só cabeçalho. Migração cancelada.');
      return;
    }

    // ── 2. Ler todos os dados brutos ─────────────────────────────────
    const dadosBrutos = abaOrigem.getRange(1, 1, ultimaLinha, ultimaColunaBruta).getValues();
    const headerRaw   = dadosBrutos[0];
    const linhasBrutas = dadosBrutos.slice(1);

    // ── 3. Determinar a última coluna com conteúdo real ──────────────
    // Colunas “vazias” no final (sem header e sem dado em nenhuma linha)
    // aparecem porque getLastColumn() conta células formatadas.
    // Varremos da direita para a esquerda até encontrar coluna com conteúdo.
    let ultimaColuna = ultimaColunaBruta;
    while (ultimaColuna > 0) {
      const idx = ultimaColuna - 1;
      const temHeader = String(headerRaw[idx] || '').trim() !== '';
      const temDado   = linhasBrutas.some(r => r[idx] !== '' && r[idx] !== null && r[idx] !== undefined);
      if (temHeader || temDado) break;
      ultimaColuna--;
    }

    const headerOrigem = headerRaw.slice(0, ultimaColuna);
    const linhasDados  = linhasBrutas.map(r => r.slice(0, ultimaColuna));

    console.log(
      `📋 [FaturamentoSync] Origem: ${linhasDados.length} linhas | ` +
      `${ultimaColunaBruta} colunas brutas → ${ultimaColuna} colunas úteis após trim`
    );

    // ── 4. Construir cabeçalho BQ-safe ───────────────────────────────
    // Alias explícito para colunas conhecidas + auto-normalização para as demais.
    const headerBQ = construirHeaderBQ_(headerOrigem);

    const aliasados = headerBQ.filter((_, i) => {
      const chave = normalizar_(String(headerOrigem[i]));
      return FAT_ALIAS_MAP[chave] !== undefined;
    }).length;
    console.log(
      `🔍 [FaturamentoSync] ${ultimaColuna} colunas | ` +
      `${aliasados} com alias explícito | ` +
      `${ultimaColuna - aliasados} auto-normalizadas`
    );
    console.log(`📝 Headers destino: ${headerBQ.join(', ')}`);

    // ── 5. Montar linhas (formatar valores) ───────────────────────────
    const linhasMapeadas = linhasDados
      .filter(linha => linha.some(v => v !== '' && v !== null && v !== undefined))
      .map(linha => linha.map(val => formatarValor_(val)));

    if (linhasMapeadas.length === 0) {
      console.log('⚠️ [FaturamentoSync] Nenhuma linha com dados encontrada após filtro.');
      return;
    }

    // ── 6. Gravar no destino ──────────────────────────────────────────
    const ssDestino = SpreadsheetApp.getActiveSpreadsheet();
    let abaDestino  = ssDestino.getSheetByName(FAT_DEST_SHEET_NAME);

    if (!abaDestino) {
      abaDestino = ssDestino.insertSheet(FAT_DEST_SHEET_NAME);
      console.log(`📝 [FaturamentoSync] Aba "${FAT_DEST_SHEET_NAME}" criada no destino.`);
    }

    abaDestino.clearContents();

    const totalColunas = headerBQ.length;
    const todosOsDados = [headerBQ, ...linhasMapeadas];
    abaDestino.getRange(1, 1, todosOsDados.length, totalColunas).setValues(todosOsDados);

    // ── 7. Formatar cabeçalho ─────────────────────────────────────────
    const rangeHeader = abaDestino.getRange(1, 1, 1, totalColunas);
    rangeHeader.setFontWeight('bold');
    rangeHeader.setBackground('#1a73e8');
    rangeHeader.setFontColor('#ffffff');
    abaDestino.setFrozenRows(1);

    // ── 8. Timestamp na célula imediatamente após os dados ────────────
    const celTimestamp = abaDestino.getRange(1, totalColunas + 2);
    celTimestamp.setValue(`Atualizado: ${new Date().toLocaleString('pt-BR')}`);
    celTimestamp.setFontColor('#888888');
    celTimestamp.setFontStyle('italic');

    const duracao = ((new Date() - inicio) / 1000).toFixed(1);
    console.log(
      `✅ [FaturamentoSync] Concluído: ${linhasMapeadas.length} linhas × ${totalColunas} colunas ` +
      `gravadas em "${FAT_DEST_SHEET_NAME}" (${duracao}s)`
    );

  } catch (e) {
    console.error(`❌ [FaturamentoSync] Erro: ${e.message}\n${e.stack}`);
    throw e;
  }
}

// ==================== GATILHO DE 12 HORAS ====================

/**
 * Instala um trigger time-based para executar migrarFaturamento() a cada 12 horas.
 * Remove qualquer trigger anterior da mesma função antes de criar um novo.
 */
function instalarTriggerFaturamento12h() {
  removerTriggerFaturamento(); // idempotente: remove se já existe

  ScriptApp.newTrigger(FAT_TRIGGER_HANDLER)
    .timeBased()
    .everyHours(12)
    .create();

  console.log(`✅ [FaturamentoSync] Trigger de 12h instalado para "${FAT_TRIGGER_HANDLER}"`);

  try {
    SpreadsheetApp.getUi().alert(
      '⏰ Trigger instalado!\n\n' +
      'A migração do Faturamento será executada automaticamente a cada 12 horas.\n\n' +
      'Para remover, use: removerTriggerFaturamento()'
    );
  } catch (_) {
    // Sem UI (execução via trigger ou API) — ignora silenciosamente
  }
}

/**
 * Remove todos os triggers associados à função migrarFaturamento().
 */
function removerTriggerFaturamento() {
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === FAT_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });
  if (removidos > 0) {
    console.log(`🗑️ [FaturamentoSync] ${removidos} trigger(s) removido(s) para "${FAT_TRIGGER_HANDLER}"`);
  } else {
    console.log(`ℹ️ [FaturamentoSync] Nenhum trigger ativo encontrado para "${FAT_TRIGGER_HANDLER}"`);
  }
}

/**
 * Exibe no log o status atual do trigger de faturamento.
 */
function statusTriggerFaturamento() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === FAT_TRIGGER_HANDLER);
  if (triggers.length === 0) {
    console.log(`ℹ️ [FaturamentoSync] Trigger NÃO instalado para "${FAT_TRIGGER_HANDLER}"`);
  } else {
    triggers.forEach(t => {
      console.log(`✅ [FaturamentoSync] Trigger ativo | ID: ${t.getUniqueId()} | Tipo: ${t.getEventType()}`);
    });
  }
}

// ==================== UTILITÁRIOS INTERNOS ====================

/**
 * Constrói o array de nomes de coluna BQ-safe a partir dos headers brutos da origem.
 *
 * Prioridade por coluna:
 *   1. Alias explícito em FAT_ALIAS_MAP (após normalizar_ o header).
 *   2. Auto-normalização: remove acentos, símbolos, espaços → snake_case.
 *   3. Header vazio → "coluna_extra" (com sufixo numérico se houver mais de uma).
 *   4. Duplicatas recebem sufixo _2, _3…
 *
 * @param {Array} headers - Linha 0 da planilha de origem (já trimada ao último dado).
 * @returns {string[]} Nomes padronizados, um por coluna.
 */
function construirHeaderBQ_(headers) {
  // Primeira passagem: gerar nome base para cada coluna
  let extraCount = 0;
  const nomes = headers.map((h) => {
    const raw = String(h).trim();
    if (!raw) {
      // Header vazio: nomear como coluna_extra (com contador para múltiplas)
      extraCount++;
      return extraCount === 1 ? 'coluna_extra' : `coluna_extra_${extraCount}`;
    }
    const chave = normalizar_(raw);
    if (FAT_ALIAS_MAP[chave]) return FAT_ALIAS_MAP[chave];
    return autoBqName_(raw);
  });

  // Segunda passagem: resolver duplicatas (a, a → a, a_2)
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

/**
 * Gera nome BQ-safe automaticamente a partir de um header bruto.
 * Remove emojis, acentos, caracteres especiais → snake_case minúsculas.
 * @param {string} raw - Header bruto.
 * @returns {string}
 */
function autoBqName_(raw) {
  let nome = raw
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

/**
 * Normaliza string para comparação de aliases:
 * sem acento, minúsculas, trim, espaços simples.
 * @param {string} str
 * @returns {string}
 */
function normalizar_(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Formata um valor do Sheets para gravação padronizada:
 * – Date  → dd/mm/yyyy
 * – número → mantém como número
 * – null/undefined → string vazia
 * – demais → String com trim
 * @param {*} val
 * @returns {string|number}
 */
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
