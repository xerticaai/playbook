const STAGNANT_ALERT_CONFIG = {
  defaultDomain: 'xertica.com',
  fixedRecipients: [
    'amalia.silva@xertica.com',
    'barbara.pessoa@xertica.com'
  ],
  specialistByProfile: {
    customer_success: 'emilio.goncalves@xertica.com',
    bdms: 'gabriele.oliveira@xertica.com'
  },
  secretPropertyKey: 'STAGNANT_ALERT_SECRET',
  cooldownPropertyPrefix: 'STAGNANT_ALERT_LAST_SENT_',
  cooldownHours: 24,
  senderName: 'Xertica.ai Sales Intelligence'
};

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validateStagnantAlertSecret_(payload.secret);
    const result = sendStagnantOpportunityAlert_(payload.deal || {}, {
      source: payload.source || 'frontend',
      actor: payload.actor || 'sistema'
    });
    return jsonOutput_({ success: true, data: result });
  } catch (err) {
    return jsonOutput_({
      success: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function sendStagnantOpportunityAlert_(deal, context) {
  enforceStagnantAlertCooldown_(deal);

  const recipients = resolveStagnantAlertRecipients_(deal);
  const subject = buildStagnantAlertSubject_(deal);
  const htmlBody = buildStagnantAlertHtml_(deal, context || {});
  const plainBody = buildStagnantAlertPlainText_(deal, context || {});

  const to = recipients.to;
  const cc = recipients.cc.join(',');

  GmailApp.sendEmail(to, subject, plainBody, {
    cc: cc,
    htmlBody: htmlBody,
    name: STAGNANT_ALERT_CONFIG.senderName,
    noReply: true
  });

  markStagnantAlertSent_(deal);

  return {
    to: to,
    cc: recipients.cc,
    profile: recipients.profile,
    opportunity: safeString_(deal.oportunidade || deal.name || deal.Oportunidade),
    seller: safeString_(deal.vendedor || deal.seller || deal.owner || deal.Vendedor),
    sentAt: new Date().toISOString()
  };
}

function testStagnantOpportunityAlert_() {
  const sampleDeal = {
    oportunidade: 'PCDR-129266-Polícia Civil RS-investigacao criminal (PROCERGS)-Polícia Civil do Rio Grande do Sul',
    conta: 'PROCERGS',
    vendedor: 'Alex Araujo',
    fase_atual: 'Evaluación',
    fiscal_q: 'FY26-Q1',
    data_prevista: '2026-03-31',
    dias_funil: 249,
    idle_dias: 86,
    atividades: 18,
    gross: 70000,
    net: 52000,
    confianca: 30,
    risco_score: 1,
    meddic_score: 42,
    tipo_oportunidade: 'NOVO CLIENTE',
    portfolio: 'FDM',
    acao_sugerida: 'A data de fechamento é irrealista; mover para Q2 e reengajar cliente.',
    risco_principal: 'Cliente pausou as conversas para maio, elevando risco de perda de prioridade.'
  };

  return sendStagnantOpportunityAlert_(sampleDeal, {
    source: 'manual_test',
    actor: Session.getActiveUser().getEmail() || 'manual_test'
  });
}

function resolveStagnantAlertRecipients_(deal) {
  const sellerName = safeString_(deal.vendedor || deal.seller || deal.owner || deal.Vendedor);
  const sellerEmail = normalizeSellerEmail_(sellerName);
  const profile = classifyOpportunityProfile_(deal);
  const specialistEmail = STAGNANT_ALERT_CONFIG.specialistByProfile[profile] || STAGNANT_ALERT_CONFIG.specialistByProfile.bdms;

  const fixedRecipients = STAGNANT_ALERT_CONFIG.fixedRecipients.map(normalizeEmail_).filter(Boolean);
  const allCc = dedupeEmails_([specialistEmail].concat(fixedRecipients));

  if (!sellerEmail) {
    throw new Error('Não foi possível determinar o email do vendedor a partir do nome informado.');
  }

  const ccWithoutTo = allCc.filter(function(email) {
    return email !== sellerEmail;
  });

  return {
    to: sellerEmail,
    cc: ccWithoutTo,
    profile: profile
  };
}

function classifyOpportunityProfile_(deal) {
  const raw = (deal.tipo_oportunidade || deal.Tipo_Oportunidade || deal.perfil_cliente || deal.Perfil_Cliente || '').toString();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.indexOf('customer success') >= 0 || normalized.indexOf('cs') >= 0) {
    return 'customer_success';
  }
  return 'bdms';
}

function buildStagnantAlertSubject_(deal) {
  const opp = safeString_(deal.oportunidade || deal.name || deal.Oportunidade || 'Oportunidade sem nome');
  const idle = Number(deal.idle_dias || deal.idleDays || 0) || 0;
  return '[Alerta Estagnação] ' + opp + ' · ' + idle + 'd sem atividade';
}

function buildStagnantAlertHtml_(deal, context) {
  const opp = escapeHtml_(safeString_(deal.oportunidade || deal.name || deal.Oportunidade || 'Não informado'));
  const account = escapeHtml_(safeString_(deal.conta || deal.account || deal.Conta || 'Não informado'));
  const seller = escapeHtml_(safeString_(deal.vendedor || deal.seller || deal.owner || deal.Vendedor || 'Não informado'));
  const phase = escapeHtml_(safeString_(deal.fase_atual || deal.stage || deal.Fase_Atual || 'Não informado'));
  const quarter = escapeHtml_(safeString_(deal.fiscal_q || deal.quarter || deal.Fiscal_Q || 'Não informado'));
  const closeDate = escapeHtml_(safeString_(deal.data_prevista || deal.close_date || deal.closeDate || deal.Data_Prevista || 'Não informado'));
  const tipo = escapeHtml_(safeString_(deal.tipo_oportunidade || deal.Tipo_Oportunidade || deal.perfil_cliente || deal.Perfil_Cliente || 'Não informado'));
  const portfolio = escapeHtml_(safeString_(deal.portfolio || deal.Portfolio || deal.portfolio_fdm || deal.Portfolio_FDM || 'Não informado'));
  const idleDays = Number(deal.idle_dias || deal.idleDays || 0) || 0;
  const pipelineDays = Number(deal.dias_funil || deal.pipeline_days || deal.Dias_Funil || 0) || 0;
  const activities = Number(deal.atividades || deal.activities || deal.Atividades || 0) || 0;
  const confidence = Number(deal.confianca || deal.confidence || deal.Confianca || 0) || 0;
  const risk = Number(deal.risco_score || deal.risk_score || deal.Risco_Score || 0) || 0;
  const meddic = Number(deal.meddic_score || deal.meddic || deal.MEDDIC_Score || 0) || 0;
  const gross = formatMoneyUsd_(deal.gross || deal.value || deal.Gross || 0);
  const net = formatMoneyUsd_(deal.net || deal.Net || deal.netValue || 0);
  const suggestedAction = escapeHtml_(safeString_(deal.acao_sugerida || deal.suggested_action || deal.Acao_Sugerida || 'Sem recomendação registrada.'));
  const riskReason = escapeHtml_(safeString_(deal.risco_principal || deal.main_risk || deal.Risco_Principal || 'Sem risco principal registrado.'));
  const actor = escapeHtml_(safeString_(context.actor || 'sistema'));
  const source = escapeHtml_(safeString_(context.source || 'frontend'));

  return '<!doctype html>' +
    '<html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0B1020;font-family:Arial,sans-serif;color:#E2E8F0;">' +
    '<div style="max-width:720px;margin:24px auto;border:1px solid #1F2937;border-radius:14px;overflow:hidden;background:#111827;">' +
    '<div style="padding:18px 22px;background:linear-gradient(135deg,#00BEFF22,#8B5CF622);border-bottom:1px solid #1F2937;">' +
    '<div style="font-size:12px;letter-spacing:.08em;color:#67E8F9;font-weight:700;text-transform:uppercase;">Xertica.ai · Alerta automático</div>' +
    '<h2 style="margin:8px 0 0;font-size:20px;line-height:1.3;color:#F8FAFC;">Oportunidade estagnada: ação imediata necessária</h2>' +
    '</div>' +
    '<div style="padding:20px 22px;">' +
    '<p style="margin:0 0 14px;font-size:14px;color:#CBD5E1;">Detectamos inatividade relevante nesta oportunidade. Recomendamos atualização de plano e próximos passos em até 24h.</p>' +
    '<div style="border:1px solid #263247;border-radius:10px;padding:14px;background:#0F172A;">' +
    '<div style="font-size:15px;font-weight:700;color:#F8FAFC;line-height:1.4;">' + opp + '</div>' +
    '<div style="margin-top:6px;font-size:13px;color:#94A3B8;">Conta: ' + account + ' · Vendedor: ' + seller + '</div>' +
    '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<span style="padding:4px 10px;border-radius:999px;border:1px solid #00BEFF55;background:#00BEFF1A;color:#67E8F9;font-size:12px;font-weight:700;">Fase: ' + phase + '</span>' +
    '<span style="padding:4px 10px;border-radius:999px;border:1px solid #8B5CF655;background:#8B5CF61A;color:#C4B5FD;font-size:12px;font-weight:700;">Tipo: ' + tipo + '</span>' +
    '<span style="padding:4px 10px;border-radius:999px;border:1px solid #34D39955;background:#34D3991A;color:#86EFAC;font-size:12px;font-weight:700;">Portfólio: ' + portfolio + '</span>' +
    '</div>' +
    '</div>' +
    '<table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:13px;">' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Quarter</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + quarter + '</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Data prevista</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + closeDate + '</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Dias sem atividade</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F59E0B;font-weight:800;">' + idleDays + ' dias</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Dias no pipeline</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + pipelineDays + ' dias</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Atividades</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + activities + '</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Gross / Net</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + gross + ' / ' + net + '</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Confiança</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + confidence + '%</td></tr>' +
    '<tr><td style="padding:8px;border-bottom:1px solid #1F2937;color:#94A3B8;">Risco / MEDDIC</td><td style="padding:8px;border-bottom:1px solid #1F2937;color:#F8FAFC;font-weight:700;">' + risk + ' / 5 · ' + meddic + '</td></tr>' +
    '</table>' +
    '<div style="margin-top:14px;padding:12px;border:1px solid #334155;border-radius:8px;background:#0F172A;">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;font-weight:700;">Ação sugerida</div>' +
    '<div style="margin-top:6px;font-size:13px;line-height:1.55;color:#E2E8F0;">' + suggestedAction + '</div>' +
    '</div>' +
    '<div style="margin-top:10px;padding:12px;border:1px solid #7F1D1D;border-radius:8px;background:#7F1D1D1A;">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#FCA5A5;font-weight:700;">Risco principal</div>' +
    '<div style="margin-top:6px;font-size:13px;line-height:1.55;color:#FECACA;">' + riskReason + '</div>' +
    '</div>' +
    '<div style="margin-top:16px;padding:12px;border-radius:10px;background:#00BEFF1A;border:1px solid #00BEFF44;">' +
    '<div style="font-size:13px;color:#67E8F9;font-weight:700;">Próximo passo esperado</div>' +
    '<div style="margin-top:5px;font-size:13px;color:#CFFAFE;line-height:1.5;">Atualizar status, plano e data de fechamento no CRM e registrar atividade de follow-up em até 24h.</div>' +
    '</div>' +
    '<div style="margin-top:14px;font-size:11px;color:#64748B;">Origem: ' + source + ' · Acionado por: ' + actor + ' · ' + escapeHtml_(new Date().toISOString()) + '</div>' +
    '</div></div></body></html>';
}

function buildStagnantAlertPlainText_(deal, context) {
  const line = [];
  line.push('Alerta de Oportunidade Estagnada');
  line.push('');
  line.push('Oportunidade: ' + safeString_(deal.oportunidade || deal.name || deal.Oportunidade || 'Não informado'));
  line.push('Conta: ' + safeString_(deal.conta || deal.account || deal.Conta || 'Não informado'));
  line.push('Vendedor: ' + safeString_(deal.vendedor || deal.seller || deal.owner || deal.Vendedor || 'Não informado'));
  line.push('Tipo: ' + safeString_(deal.tipo_oportunidade || deal.Tipo_Oportunidade || deal.perfil_cliente || deal.Perfil_Cliente || 'Não informado'));
  line.push('Fase: ' + safeString_(deal.fase_atual || deal.stage || deal.Fase_Atual || 'Não informado'));
  line.push('Quarter: ' + safeString_(deal.fiscal_q || deal.quarter || deal.Fiscal_Q || 'Não informado'));
  line.push('Data prevista: ' + safeString_(deal.data_prevista || deal.close_date || deal.closeDate || deal.Data_Prevista || 'Não informado'));
  line.push('Idle: ' + (Number(deal.idle_dias || deal.idleDays || 0) || 0) + ' dias');
  line.push('Pipeline: ' + (Number(deal.dias_funil || deal.pipeline_days || deal.Dias_Funil || 0) || 0) + ' dias');
  line.push('Gross / Net: ' + formatMoneyUsd_(deal.gross || deal.value || deal.Gross || 0) + ' / ' + formatMoneyUsd_(deal.net || deal.Net || deal.netValue || 0));
  line.push('Confiança: ' + (Number(deal.confianca || deal.confidence || deal.Confianca || 0) || 0) + '%');
  line.push('Risco principal: ' + safeString_(deal.risco_principal || deal.main_risk || deal.Risco_Principal || 'Sem risco principal registrado.'));
  line.push('Ação sugerida: ' + safeString_(deal.acao_sugerida || deal.suggested_action || deal.Acao_Sugerida || 'Sem recomendação registrada.'));
  line.push('');
  line.push('Origem: ' + safeString_(context.source || 'frontend') + ' | Acionado por: ' + safeString_(context.actor || 'sistema'));
  return line.join('\n');
}

function validateStagnantAlertSecret_(incomingSecret) {
  const expected = PropertiesService.getScriptProperties().getProperty(STAGNANT_ALERT_CONFIG.secretPropertyKey);
  if (!expected) {
    return;
  }
  if (!incomingSecret || String(incomingSecret) !== String(expected)) {
    throw new Error('Secret inválido para envio de alerta de oportunidade estagnada.');
  }
}

function enforceStagnantAlertCooldown_(deal) {
  const cooldownMs = Number(STAGNANT_ALERT_CONFIG.cooldownHours || 24) * 60 * 60 * 1000;
  if (!(cooldownMs > 0)) return;

  const key = buildStagnantAlertCooldownKey_(deal);
  const props = PropertiesService.getScriptProperties();
  const rawLast = props.getProperty(key);
  if (!rawLast) return;

  const lastTs = Number(rawLast);
  if (!Number.isFinite(lastTs) || lastTs <= 0) return;

  const now = Date.now();
  const elapsed = now - lastTs;
  if (elapsed >= cooldownMs) return;

  const remainingMs = cooldownMs - elapsed;
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  throw new Error('Cooldown ativo para esta oportunidade. Aguarde ' + remainingHours + 'h ' + remainingMinutes + 'min para reenviar.');
}

function markStagnantAlertSent_(deal) {
  const key = buildStagnantAlertCooldownKey_(deal);
  PropertiesService.getScriptProperties().setProperty(key, String(Date.now()));
}

function buildStagnantAlertCooldownKey_(deal) {
  const base = [
    safeString_(deal.oportunidade || deal.name || deal.Oportunidade),
    safeString_(deal.conta || deal.account || deal.Conta),
    safeString_(deal.vendedor || deal.seller || deal.owner || deal.Vendedor)
  ].join('|').toLowerCase();

  const normalized = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9|]+/g, '_')
    .replace(/_+/g, '_')
    .trim();

  const digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized || 'unknown')
  );

  return STAGNANT_ALERT_CONFIG.cooldownPropertyPrefix + digest;
}

function normalizeSellerEmail_(sellerName) {
  const raw = safeString_(sellerName);
  if (!raw) return '';

  if (raw.indexOf('@') >= 0) {
    return normalizeEmail_(raw);
  }

  const slug = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (!slug.length) return '';
  if (slug.length === 1) {
    return normalizeEmail_(slug[0] + '@' + STAGNANT_ALERT_CONFIG.defaultDomain);
  }

  return normalizeEmail_(slug[0] + '.' + slug[slug.length - 1] + '@' + STAGNANT_ALERT_CONFIG.defaultDomain);
}

function normalizeEmail_(raw) {
  const text = safeString_(raw).toLowerCase();
  if (!text) return '';

  if (text.indexOf('@') < 0) {
    return text + '@' + STAGNANT_ALERT_CONFIG.defaultDomain;
  }

  const parts = text.split('@');
  const local = parts[0];
  let domain = parts[1] || '';
  if (!domain) domain = STAGNANT_ALERT_CONFIG.defaultDomain;
  if (domain === 'xertica') domain = 'xertica.com';
  return local + '@' + domain;
}

function dedupeEmails_(list) {
  const seen = {};
  const out = [];
  (list || []).forEach(function(item) {
    const email = normalizeEmail_(item);
    if (!email) return;
    if (seen[email]) return;
    seen[email] = true;
    out.push(email);
  });
  return out;
}

function formatMoneyUsd_(value) {
  const num = Number(value || 0) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function safeString_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function escapeHtml_(value) {
  return safeString_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}