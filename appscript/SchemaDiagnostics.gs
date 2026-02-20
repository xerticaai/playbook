function normalizeHeaderForPlanilhaBase_(header, idx) {
  let normalized = String(header || "")
    .trim()
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, "")
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) normalized = `Column_${idx}`;
  return normalized;
}

function normalizeForSemanticMatch_(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTargetSchemaSheets_() {
  return new Set([
    'Historico_Alteracoes_Ganhos',
    'Links relatorios',
    'Historico_Ganhos',
    'Historico_Perdidas',
    'Pipeline_Aberto',
    'Alteracoes_Oportunidade',
    'Atividades',
    '🎯 Análise Forecast IA',
    '📉 Análise Perdidas',
    '📈 Análise Ganhas',
    'Análise Sales Specialist'
  ]);
}

function shouldAnalyzeSchemaSheet_(sheetName) {
  return getTargetSchemaSheets_().has(String(sheetName || '').trim());
}

function isDecorativeHeader_(rawHeader) {
  const raw = String(rawHeader || '').trim();
  if (!raw) return true;
  if (raw === '-') return true;
  const stripped = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  return stripped.length === 0;
}

function translateSemanticTokens_(normalizedText) {
  const tokenMap = {
    nome: 'name',
    cuenta: 'account',
    conta: 'account',
    companhia: 'company',
    company: 'company',
    oportunidade: 'opportunity',
    oportunidad: 'opportunity',
    propietario: 'owner',
    proprietario: 'owner',
    vendedor: 'seller',
    preventa: 'presales',
    principal: 'primary',
    data: 'date',
    fecha: 'date',
    criacao: 'created',
    creacion: 'created',
    fechamento: 'close',
    cierre: 'close',
    ultima: 'last',
    ultimo: 'last',
    ultimos: 'last',
    proxima: 'next',
    proximo: 'next',
    atividade: 'activity',
    actividades: 'activities',
    actividad: 'activity',
    atividades: 'activities',
    compromisso: 'commitment',
    fase: 'stage',
    mudanca: 'change',
    mudancas: 'changes',
    cambio: 'change',
    cambios: 'changes',
    periodo: 'period',
    fiscal: 'fiscal',
    prevista: 'predicted',
    previsto: 'predicted',
    ciclo: 'cycle',
    dias: 'days',
    duracao: 'duration',
    valor: 'value',
    precio: 'price',
    preco: 'price',
    margen: 'margin',
    total: 'total',
    convertido: 'converted',
    origem: 'source',
    origen: 'source',
    campanha: 'campaign',
    lead: 'lead',
    descricao: 'description',
    descripcion: 'description',
    razao: 'reason',
    razon: 'reason',
    perda: 'loss',
    perdida: 'loss',
    mercado: 'market',
    setor: 'industry',
    segmento: 'segment',
    subsegmento: 'subsegment',
    contato: 'contact',
    contacto: 'contact',
    telefone: 'phone',
    correo: 'email',
    email: 'email',
    cidade: 'city',
    pais: 'country',
    estado: 'state',
    provincia: 'state',
    cobranca: 'billing',
    facturacion: 'billing',
    faturacao: 'billing',
    portafolio: 'portfolio',
    portfolio: 'portfolio',
    produto: 'product',
    productos: 'products',
    producto: 'product',
    familia: 'family',
    probabilidade: 'probability',
    forecast: 'forecast',
    run: 'run',
    atualizacao: 'updated',
    actualizacion: 'updated',
    confianca: 'confidence',
    acao: 'action',
    tipo: 'type',
    modulo: 'module',
    linha: 'line',
    registros: 'records',
    afetados: 'affected',
    secao: 'section',
    seccion: 'section'
  };

  return String(normalizedText || '')
    .split(' ')
    .filter(Boolean)
    .map(t => tokenMap[t] || t)
    .join(' ')
    .trim();
}

function suggestCanonicalFromSemanticTokens_(translatedText) {
  const tokens = new Set(String(translatedText || '').split(' ').filter(Boolean));
  if (!tokens.size) return '';

  const has = t => tokens.has(t);

  if (has('opportunity') && has('name')) return 'opportunity_name';
  if ((has('account') || has('company')) && has('name')) return 'account_name';
  if (has('opportunity') && has('owner')) return 'opportunity_owner';
  if (has('created') && has('date')) return 'created_date';
  if (has('close') && has('date')) return 'close_date';
  if (has('duration') && has('stage')) return 'duration_days';
  if ((has('changes') || has('change')) && has('close') && has('date')) return 'close_date_changes';
  if ((has('changes') || has('change')) && has('stage')) return 'stage_changes';
  if (has('last') && has('stage') && has('change') && has('date')) return 'last_stage_change_date';
  if (has('last') && has('activity') && has('date')) return 'last_activity_date';
  if (has('next') && has('activity') && has('date')) return 'next_activity_date';
  if (has('stage')) return 'stage';
  if (has('forecast')) return 'forecast';
  if (has('fiscal') && has('period')) return 'fiscal_period';
  if ((has('price') || has('gross')) && has('converted')) return 'gross_amount';
  if ((has('margin') || has('net')) && has('total') && has('converted')) return 'net_amount';
  if (has('status')) return 'status';
  if (has('activity') && has('type')) return 'activity_type';
  if (has('sheet') || has('tab')) return 'sheet_name';
  if (has('refresh') && has('time')) return 'refresh_time';
  if (has('source') && has('lead')) return 'lead_source';
  if (has('source') && has('campaign')) return 'campaign_source';
  if (has('description')) return 'description';
  if (has('reason') && has('loss')) return 'loss_reason';
  if (has('portfolio')) return 'portfolio';
  if (has('family') && has('product')) return 'product_family';
  if (has('product') && has('name')) return 'product_name';
  if (has('segment') || has('subsegment')) return 'segment';
  if (has('industry')) return 'industry_sector';
  if (has('city') && has('billing')) return 'billing_city';
  if (has('state') && has('billing')) return 'billing_state';
  if (has('country') && has('billing')) return 'billing_country';

  return '';
}

function getCanonicalAliasMapFromSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dict = ss.getSheetByName('Dicionario_Canonico_V1');
  const map = new Map();
  if (!dict || dict.getLastRow() <= 1) return map;

  const lastRow = dict.getLastRow();
  const lastCol = dict.getLastColumn();
  const data = dict.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(h => normalizeForSemanticMatch_(h));
  const colCanonical = headers.findIndex(h => h === 'canonical_name');
  const colAliases = headers.findIndex(h => h === 'aliases_pt_es_en');
  if (colCanonical === -1 || colAliases === -1) return map;

  for (let i = 1; i < data.length; i++) {
    const canonical = String(data[i][colCanonical] || '').trim();
    const aliasesRaw = String(data[i][colAliases] || '').trim();
    if (!canonical) continue;

    map.set(normalizeForSemanticMatch_(canonical), canonical);
    if (!aliasesRaw) continue;

    aliasesRaw.split('|').forEach(alias => {
      const key = normalizeForSemanticMatch_(alias);
      if (!key) return;
      map.set(key, canonical);
    });
  }

  return map;
}

function getCanonicalRules_() {
  return [
    { canonical: 'opportunity_name', patterns: [/^opportunity$/i, /^opportunity name$/i, /^nome da oportunidade$/i, /^oportunidade$/i] },
    { canonical: 'account_name', patterns: [/^account name$/i, /^company\s*account$/i, /^nome da conta$/i, /^conta$/i] },
    { canonical: 'opportunity_owner', patterns: [/^opportunity owner$/i, /^proprietario da oportunidade$/i, /^vendedor$/i, /^owner$/i] },
    { canonical: 'created_date', patterns: [/^created date$/i, /^data de criacao$/i, /^data de criação$/i] },
    { canonical: 'close_date', patterns: [/^close date$/i, /^closed date$/i, /^data de fechamento$/i, /^data fechamento$/i, /^fecha de cierre$/i] },
    { canonical: 'last_stage_change_date', patterns: [/^last stage change date$/i, /^data da ultima mudanca de fase$/i, /^data da ultima mudança de fase$/i] },
    { canonical: 'last_activity_date', patterns: [/^last event date$/i, /^data da ultima atividade$/i, /^ultima atividade$/i] },
    { canonical: 'next_activity_date', patterns: [/^next activity date$/i, /^data da proxima atividade$/i, /^data da próxima atividade$/i] },
    { canonical: 'stage', patterns: [/^stage$/i, /^fase$/i, /^fase atual$/i] },
    { canonical: 'forecast', patterns: [/^forecast$/i, /^forecast sf$/i, /^forecast ia$/i] },
    { canonical: 'fiscal_period', patterns: [/^fiscal period$/i, /^periodo fiscal$/i, /^período fiscal$/i, /^fiscal q$/i] },
    { canonical: 'gross_amount', patterns: [/^gross$/i, /^preco total convertido$/i, /^booking total gross$/i] },
    { canonical: 'net_amount', patterns: [/^net$/i, /^booking total net$/i, /^margen total convertido$/i] },
    { canonical: 'status', patterns: [/^status$/i] },
    { canonical: 'activity_type', patterns: [/^activity type$/i, /^tipo de actividad$/i] },
    { canonical: 'operation', patterns: [/^operation$/i] },
    { canonical: 'sheet_name', patterns: [/^sheet$/i, /^aba$/i] },
    { canonical: 'refresh_time', patterns: [/^refresh time$/i, /^data hora$/i] }
  ];
}

function suggestCanonicalColumnName_(header, sheetName) {
  const raw = String(header || '').trim();
  if (!raw) return { canonical: '', confidence: 'NONE', matchedRule: '' };
  if (isDecorativeHeader_(raw)) return { canonical: '', confidence: 'NONE', matchedRule: 'non_semantic_header' };

  const norm = normalizeForSemanticMatch_(raw);
  if (!norm) {
    return { canonical: '', confidence: 'NONE', matchedRule: 'non_semantic_header' };
  }

  const dictMap = getCanonicalAliasMapFromSheet_();
  if (dictMap.has(norm)) {
    return { canonical: dictMap.get(norm), confidence: 'HIGH', matchedRule: 'dictionary_alias' };
  }

  const baseKey = normalizeHeaderForPlanilhaBase_(raw, 0).toLowerCase();
  const translatedNorm = translateSemanticTokens_(norm);
  const translatedBaseKey = translatedNorm.replace(/\s+/g, '_').trim();

  const directAlias = {
    run_id: 'run_id',
    run_ts: 'run_timestamp',
    aba_original: 'source_sheet_name',
    col_index: 'source_column_index',
    coluna_original: 'source_column_name',
    coluna_canonica_sugerida: 'suggested_canonical_name',
    coluna_normalizada_basica: 'normalized_column_name',
    confianca: 'confidence',
    regra_match: 'match_rule',
    duplicada_na_aba: 'duplicated_in_sheet_flag',
    user: 'user_email',
    assigned: 'assigned_to',
    date: 'activity_date',
    full_comments: 'full_comments',
    comments: 'comments',
    subject: 'subject',
    location: 'location',
    contact: 'contact_name',
    perfil: 'profile',
    editado_por: 'edited_by',
    campocompromisso: 'field_name',
    novo_valor: 'new_value',
    valor_antigo: 'old_value',
    data_de_edicao: 'edit_date',
    duracao_da_fase: 'duration_days',
    duracao: 'duration_days',
    origem_da_campanha_principal: 'campaign_source',
    tipo_incentivo_en_google: 'google_incentive_type',
    dr: 'dr_code',
    valor_convertido: 'amount_converted',
    proxima_etapa: 'next_step',
    fecha_ultimo_cambio_next_step: 'next_step_last_change_date',
    descricao: 'description',
    descripcion: 'description',
    top_deal: 'top_deal_flag',
    aplica_marketplace: 'marketplace_applicable',
    origem_do_lead: 'lead_source',
    proceso: 'process_name',
    familia_de_produtos: 'product_family',
    quantidade: 'quantity',
    plazo_producto_meses: 'product_term_months',
    fecha_de_activacion: 'activation_date',
    margen_de_lista: 'margin_list_percent',
    margen: 'margin_percent',
    margen_total: 'margin_total_amount',
    descuento_fabricante: 'discount_vendor_percent',
    descuento_xertica: 'discount_partner_percent',
    produto_ativo: 'active_product_flag',
    segmento_consolidado: 'segment',
    nombre_dominio: 'company_domain',
    consola: 'console_name',
    productos_con_vigencia_activa: 'products_with_active_term',
    estado_de_activacion_de_productos: 'product_activation_status',
    monto_no_anulado: 'non_void_amount',
    tipo_de_oportunidad: 'opportunity_type',
    portafolio: 'portfolio',
    portafolio_xerticaai: 'portfolio_ai',
    owner_preventa: 'pre_sales_owner',
    fecha_de_facturacion: 'billing_date',
    cidade_de_cobranca: 'billing_city',
    estadoprovincia_de_cobranca: 'billing_state',
    fecha_inicio_contrato: 'contract_start_date',
    fecha_fin_contrato: 'contract_end_date',
    nome_do_produto: 'product_name',
    categoria_sdr: 'sdr_category',
    razon_social: 'tax_id_name',
    ano_fiscal: 'fiscal_year',
    calculadora_horas: 'hours_calculator',
    calculadora_roi: 'roi_calculator',
    gcp_billing_id: 'gcp_billing_id',
    calendario_facturacion: 'billing_calendar',
    razon_de_perdida: 'loss_reason',
    data_do_ultimo_compromisso: 'last_commitment_date',
    probabilidade: 'probability_percent',
    oportunidad_generada: 'generated_opportunity_flag',
    subsegmento_de_mercado: 'market_subsegment',
    setor: 'industry_sector',
    contacto_negociacion: 'negotiation_contact',
    contato_principal: 'contact_name',
    contato_cargo: 'contact_role',
    contato_email: 'contact_email',
    contato_telefone: 'contact_phone',
    telefone: 'phone',
    subsidiaria: 'subsidiary',
    descripcion_de_la_perdida: 'loss_description',
    motivo_descalificacion: 'disqualification_reason',
    fecha_de_aplazamiento: 'postponed_date',
    perdida_por_competencia: 'lost_to_competitor_flag',
    conta_ultima_atividade: 'account_last_activity',
    dias_inativos: 'inactive_days',
    atividades_dos_ultimos_7_dias: 'activities_last_7d',
    atividades_dos_ultimos_30_dias: 'activities_last_30d',
    endereco_de_cobranca_linha_1: 'billing_address_line1',
    pais_de_cobranca: 'billing_country',
    preventa: 'pre_sales_owner',
    preventa_principal: 'pre_sales_owner_primary',
    preventasabiertos: 'open_presales_count',
    data_prevista: 'predicted_close_date',
    ciclo_dias: 'cycle_days',
    dias_funil: 'pipeline_days',
    atividades: 'activity_count',
    atividades_peso: 'activity_weighted_count',
    mix_atividades: 'activity_mix',
    idle_dias: 'idle_days',
    qualidade_engajamento: 'engagement_quality',
    confianca: 'confidence_score',
    motivo_confianca: 'confidence_reason',
    meddic_score: 'meddic_score',
    meddic_gaps: 'meddic_gaps',
    meddic_evidencias: 'meddic_evidence',
    bant_score: 'bant_score',
    bant_gaps: 'bant_gaps',
    bant_evidencias: 'bant_evidence',
    justificativa_ia: 'ai_justification',
    regras_aplicadas: 'applied_rules',
    incoerencia_detectada: 'detected_inconsistency',
    perguntas_de_auditoria_ia: 'ai_audit_questions',
    flags_de_risco: 'risk_flags',
    gaps_identificados: 'identified_gaps',
    cod_acao: 'action_code',
    acao_sugerida: 'suggested_action',
    risco_principal: 'main_risk',
    total_mudancas: 'total_changes',
    mudancas_criticas: 'critical_changes',
    mudancas_close_date: 'close_date_changes',
    mudancas_stage: 'stage_changes',
    mudancas_valor: 'value_changes',
    anomalias_detectadas: 'detected_anomalies',
    velocity_predicao: 'velocity_prediction',
    velocity_detalhes: 'velocity_details',
    territorio_correto: 'correct_territory_flag',
    vendedor_designado: 'designated_seller',
    estadocidade_detectado: 'detected_state_city',
    fonte_deteccao: 'detection_source',
    calendario_faturacao: 'billing_calendar_type',
    valor_reconhecido_q1: 'recognized_value_q1',
    valor_reconhecido_q2: 'recognized_value_q2',
    valor_reconhecido_q3: 'recognized_value_q3',
    valor_reconhecido_q4: 'recognized_value_q4',
    ultima_atualizacao: 'last_updated_at',
    perfil_cliente: 'customer_profile',
    portfolio: 'portfolio',
    segmento: 'segment',
    familia_produto: 'product_family',
    produtos: 'products',
    resumo_analise: 'analysis_summary',
    causa_raiz: 'root_cause',
    causas_secundarias: 'secondary_causes',
    tipo_resultado: 'result_type',
    evitavel: 'avoidable_flag',
    sinais_alerta: 'warning_signs',
    momento_critico: 'critical_moment',
    licoes_aprendidas: 'lessons_learned',
    ativ_7d: 'activities_7d',
    ativ_30d: 'activities_30d',
    distribuicao_tipos: 'activity_type_distribution',
    periodo_pico: 'peak_period',
    cadencia_media_dias: 'average_cadence_days',
    campos_alterados: 'changed_fields',
    padrao_mudancas: 'change_pattern',
    freq_mudancas: 'change_frequency',
    editores: 'editors_count',
    labels: 'labels',
    fatores_sucesso: 'success_factors',
    gestao_oportunidade: 'opportunity_management',
    meses_fat: 'billing_months',
    gtm_2026: 'gtm_2026',
    billing_quarter: 'billing_quarter',
    secao: 'section',
    seccion: 'section',
    aba_campo: 'sheet_field',
    abacampo: 'sheet_field',
    detalhes: 'details',
    registros_afetados: 'affected_records',
    acao_recomendada: 'recommended_action',
    tipo: 'type',
    modulo: 'module_name',
    linha: 'row_number',
    acao: 'action_name'
  };

  if (translatedBaseKey && directAlias[translatedBaseKey]) {
    return { canonical: directAlias[translatedBaseKey], confidence: 'HIGH', matchedRule: 'translated_alias_map' };
  }

  if (directAlias[baseKey]) {
    return { canonical: directAlias[baseKey], confidence: 'HIGH', matchedRule: 'direct_alias_map' };
  }

  const tokenCanonical = suggestCanonicalFromSemanticTokens_(translatedNorm);
  if (tokenCanonical) {
    return { canonical: tokenCanonical, confidence: 'HIGH', matchedRule: 'semantic_token_translation' };
  }

  const rules = getCanonicalRules_();

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(norm)) {
        return { canonical: rule.canonical, confidence: 'HIGH', matchedRule: pattern.toString() };
      }
      if (translatedNorm && pattern.test(translatedNorm)) {
        return { canonical: rule.canonical, confidence: 'HIGH', matchedRule: 'translated:' + pattern.toString() };
      }
    }
  }

  // Heurística específica por aba: Atividades -> Opportunity = opportunity_name
  if (normalizeForSemanticMatch_(sheetName) === 'atividades' && /(^opportunity$)/i.test(norm)) {
    return { canonical: 'opportunity_name', confidence: 'MEDIUM', matchedRule: 'sheet=Atividades + Opportunity' };
  }

  return { canonical: normalizeHeaderForPlanilhaBase_(raw, 0).toLowerCase(), confidence: 'LOW', matchedRule: 'fallback_normalized' };
}

function writeSchemaDiagnosticSheet_(ss, sheetName, headers, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length > 0) {
    const chunkSize = 500;
    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize);
      sheet.getRange(2 + start, 1, chunk.length, headers.length).setValues(chunk);
    }
  }
  sheet.setFrozenRows(1);
}

/**
 * Gera schema das planilhas com sugestão canônica (sem alterar cabeçalhos).
 */
function gerarSchemaPlanilhasBruto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => shouldAnalyzeSchemaSheet_(s.getName()));
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  const rows = [];
  const resumo = [];

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    const normalizedBase = headers.map((h, idx) => normalizeHeaderForPlanilhaBase_(h, idx));
    const counts = {};
    normalizedBase.forEach(h => { counts[h] = (counts[h] || 0) + 1; });

    resumo.push([ts, sheetName, headers.length, lastRow]);

    headers.forEach((header, idx) => {
      const canonical = suggestCanonicalColumnName_(header, sheetName);
      const duplicatedInSheet = (counts[normalizedBase[idx]] || 0) > 1 ? 'YES' : 'NO';
      rows.push([
        ts,
        sheetName,
        idx + 1,
        String(header || ''),
        canonical.canonical,
        canonical.confidence,
        canonical.matchedRule,
        duplicatedInSheet
      ]);
    });
  });

  writeSchemaDiagnosticSheet_(
    ss,
    'Schema_Planilhas_Bruto',
    ['Run_TS', 'Aba_Original', 'Col_Index', 'Coluna_Original', 'Coluna_Canonica_Sugerida', 'Confianca', 'Regra_Match', 'Duplicada_Na_Aba'],
    rows
  );

  writeSchemaDiagnosticSheet_(
    ss,
    'Schema_Planilhas_Resumo',
    ['Run_TS', 'Aba_Original', 'Qtd_Colunas', 'Qtd_Linhas'],
    resumo
  );

  return {
    success: true,
    abas: sheets.length,
    colunas: rows.length,
    sheetsCriadas: ['Schema_Planilhas_Bruto', 'Schema_Planilhas_Resumo']
  };
}

function getSchemaBigQueryContext_() {
  const projectId = (typeof BQ_PROJECT !== 'undefined' && BQ_PROJECT)
    ? BQ_PROJECT
    : 'operaciones-br';
  const datasetId = (typeof BQ_DATASET !== 'undefined' && BQ_DATASET)
    ? BQ_DATASET
    : 'sales_intelligence';
  return { projectId: projectId, datasetId: datasetId };
}

function getSheetToBigQueryTableMap_() {
  return {
    'Historico_Alteracoes_Ganhos': '',
    'Links relatorios': '',
    'Historico_Ganhos': 'closed_deals_won',
    'Historico_Perdidas': 'closed_deals_lost',
    'Pipeline_Aberto': 'pipeline',
    'Alteracoes_Oportunidade': '',
    'Atividades': 'atividades',
    '🎯 Análise Forecast IA': 'pipeline',
    '📉 Análise Perdidas': 'closed_deals_lost',
    '📈 Análise Ganhas': 'closed_deals_won',
    'Análise Sales Specialist': 'sales_specialist'
  };
}

function normalizeSchemaKey_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getBigQuerySchemaMap_(projectId, datasetId) {
  const tableMap = {};
  const sheetTableMap = getSheetToBigQueryTableMap_();
  const tableNames = Array.from(new Set(Object.keys(sheetTableMap)
    .map(k => sheetTableMap[k])
    .filter(Boolean)));

  tableNames.forEach(tableName => {
    try {
      const table = BigQuery.Tables.get(projectId, datasetId, tableName);
      const fields = (((table || {}).schema || {}).fields || []).map(f => String(f.name || '').trim()).filter(Boolean);

      const byNorm = {};
      fields.forEach(f => { byNorm[normalizeSchemaKey_(f)] = f; });

      tableMap[tableName] = {
        exists: true,
        fields: fields,
        fieldsByNorm: byNorm
      };
    } catch (error) {
      tableMap[tableName] = {
        exists: false,
        error: String((error && error.message) || error || 'Erro ao ler schema'),
        fields: [],
        fieldsByNorm: {}
      };
    }
  });

  return tableMap;
}

/**
 * Gera visão conjunta dos schemas: Planilha x BigQuery (somente diagnóstico, sem alterações).
 */
function gerarSchemaConjuntoPlanilhaBigQuery() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  gerarSchemaPlanilhasBruto();

  const src = ss.getSheetByName('Schema_Planilhas_Bruto');
  if (!src || src.getLastRow() <= 1) {
    return { success: false, message: 'Nao foi possivel ler Schema_Planilhas_Bruto.' };
  }

  const rows = src.getDataRange().getValues();
  const headers = rows[0].map(h => String(h || '').trim());
  const idx = {
    aba: headers.indexOf('Aba_Original'),
    colIndex: headers.indexOf('Col_Index'),
    colOriginal: headers.indexOf('Coluna_Original'),
    colCanonica: headers.indexOf('Coluna_Canonica_Sugerida'),
    confianca: headers.indexOf('Confianca'),
    regra: headers.indexOf('Regra_Match')
  };

  const mapSheetToTable = getSheetToBigQueryTableMap_();
  const bqContext = getSchemaBigQueryContext_();
  const bqSchema = getBigQuerySchemaMap_(bqContext.projectId, bqContext.datasetId);

  const output = [];
  const matchedByTable = {};
  Object.keys(bqSchema).forEach(t => { matchedByTable[t] = {}; });

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetName = String(row[idx.aba] || '').trim();
    const tableName = mapSheetToTable[sheetName] || '';
    const colOriginal = String(row[idx.colOriginal] || '').trim();
    const colCanonica = String(row[idx.colCanonica] || '').trim();
    const originalNorm = normalizeSchemaKey_(colOriginal);
    const canonicalNorm = normalizeSchemaKey_(colCanonica);

    let bqFound = '';
    let status = 'ABA_SEM_MAPEAMENTO_BQ';
    let obs = '';

    if (!tableName) {
      status = 'ABA_SEM_TABELA_BQ';
      obs = 'Aba sem tabela destino no sync atual';
    } else if (!bqSchema[tableName] || !bqSchema[tableName].exists) {
      status = 'TABELA_BQ_NAO_ENCONTRADA';
      obs = (bqSchema[tableName] && bqSchema[tableName].error) || 'Tabela nao encontrada';
    } else {
      const byNorm = bqSchema[tableName].fieldsByNorm;
      if (canonicalNorm && byNorm[canonicalNorm]) {
        bqFound = byNorm[canonicalNorm];
        status = 'MATCH_CANONICO';
      } else if (originalNorm && byNorm[originalNorm]) {
        bqFound = byNorm[originalNorm];
        status = 'MATCH_ORIGINAL';
      } else {
        status = 'NAO_ENCONTRADO_NO_BQ';
      }

      if (bqFound) matchedByTable[tableName][bqFound] = true;
    }

    output.push([
      ts,
      sheetName,
      tableName,
      row[idx.colIndex],
      colOriginal,
      colCanonica,
      bqFound,
      String(row[idx.confianca] || ''),
      String(row[idx.regra] || ''),
      status,
      obs
    ]);
  }

  Object.keys(bqSchema).forEach(tableName => {
    const schema = bqSchema[tableName];
    if (!schema.exists) return;
    schema.fields.forEach(field => {
      if (matchedByTable[tableName][field]) return;
      output.push([
        ts,
        '',
        tableName,
        '',
        '',
        '',
        field,
        '',
        '',
        'SO_BIGQUERY',
        'Coluna existe no BigQuery sem correspondencia atual na planilha mapeada'
      ]);
    });
  });

  writeSchemaDiagnosticSheet_(
    ss,
    'Schema_Conjunto_Planilha_BQ',
    ['Run_TS', 'Aba_Original', 'BQ_Tabela', 'Col_Index', 'Coluna_Planilha', 'Coluna_Canonica_Sugerida', 'Coluna_BQ', 'Confianca', 'Regra_Match', 'Status_Match', 'Observacao'],
    output
  );

  return {
    success: true,
    sheet: 'Schema_Conjunto_Planilha_BQ',
    linhas: output.length,
    projectId: bqContext.projectId,
    datasetId: bqContext.datasetId
  };
}