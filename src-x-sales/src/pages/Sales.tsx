import {
  useState, useEffect, useRef, type FormEvent,
} from 'react'
import Background from '../components/Background'
import { useTheme } from '../hooks/useTheme'
import {
  getUserByEmail,
  fetchWeeklyAgenda,
  fetchPortalContext,
  fetchBdmCsKpi,
  fetchBdmCsActionQueue,
  fetchBdmCsHandoff,
  fetchSsKpi,
  fetchSsClosingQueue,
} from '../lib/api'
import type { XSalesUser, Deal, CrmActivity, AgendaData, PortalContext } from '../lib/types'
import { getUserHubs, derivePersonaData } from '../lib/types'

// ─── Constants ──────────────────────────────────────────────────────────────
const LOGO_GREEN = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/X_symbol_variation8_Green_white.png'
const LOGO_TEXT  = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/xertica.ai/Copy%20of%20Logo_XERTICA_white.png'
const SESSION_KEY = 'xsales_current_user'

type TabId = 'dashboard' | 'pipeline' | 'activities' | 'calculator'
const TAB_TITLES: Record<TabId, string> = {
  dashboard:  'Visão Geral',
  pipeline:   'Meu Pipeline',
  activities: 'Atividades CRM',
  calculator: 'Simulador de Comissão',
}

interface KpiSnapshot {
  target_key: string
  fiscal_q: string
  meta: number
  realizado: number
  attainment_pct: number
  gap: number
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function splitHints(raw: string): string[] {
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitGaps(raw: string): string[] {
  return String(raw || '')
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function inferCategoria(risco: string): Deal['Categoria_Pauta'] {
  const v = risco.toLowerCase()
  if (v.includes('zumbi')) return 'ZUMBI'
  if (v.includes('crit')) return 'CRITICO'
  if (v.includes('aten')) return 'ALTA_PRIORIDADE'
  return 'MONITORAR'
}

function mapBdmActionToDeal(item: Record<string, unknown>): Deal {
  const risco = asString(item.Risco_Principal)
  const perguntas = asString(item.Perguntas_de_Auditoria_IA)
  const idle = asNumber(item.Idle_Dias || item.Idle || item.idle_dias)
  return {
    deal_id: asString(item.Oportunidade),
    Oportunidade: asString(item.Oportunidade),
    Conta: asString(item.Conta),
    Gross: asNumber(item.Gross),
    Fase_Atual: normalizeStage(asString(item.Fase_Atual)),
    Data_Prevista: asString(item.Data_Prevista),
    Risco_Score: Math.max(0, 100 - asNumber(item.action_sort_rank) * 10),
    Categoria_Pauta: inferCategoria(risco),
    Proxima_Acao_Pipeline: perguntas,
    acao_sugerida: asString(item.Acao_Sugerida || item.acao_sugerida || item.Acao_Desc || item.acao_desc || item.Perguntas_de_Auditoria_IA),
    acao_code: asString(item.Acao_Code || item.acao_code),
    velocity_predicao: asString(item.Velocity_Predicao || item.velocity_predicao),
    idle_dias: idle > 0 ? idle : undefined,
    risk_tags: [risco, asString(item.Status_Governanca_SS), asString(item.Elegibilidade_SS)].filter(Boolean),
    sabatina_questions: splitHints(perguntas),
    status_governanca_ss: asString(item.Status_Governanca_SS),
    sales_specialist_envolvido: asString(item.ss_key || item.Sales_Specialist_Envolvido),
    bant_score: asNumber(item.BANT_Score || item.bant_score),
    meddic_score: asNumber(item.MEDDIC_Score || item.meddic_score),
    bant_gaps: splitGaps(asString(item.BANT_Gaps || item.bant_gaps)),
    meddic_gaps: splitGaps(asString(item.MEDDIC_Gaps || item.meddic_gaps)),
    avaliacao_personas_ia: asString(item.Avaliacao_Personas_IA || item.personas_assessment),
    flag_aprovacao_previa: asString(item.Flag_Aprovacao_Previa || item.flag_aprovacao_previa),
    motivo_status_gtm: asString(item.Motivo_Status_GTM || item.motivo_status_gtm),
    mudancas_close_date: asNumber(item.Mudancas_Close_Date || item.close_date_changes),
  }
}

function mapSsQueueToDeal(item: Record<string, unknown>): Deal {
  const risco = asString(item.Risco_Principal)
  const perguntas = asString(item.Perguntas_de_Auditoria_IA)
  const idle = asNumber(item.Idle_Dias || item.Idle || item.idle_dias)
  return {
    deal_id: asString(item.Oportunidade),
    Oportunidade: asString(item.Oportunidade),
    Conta: asString(item.Conta),
    Gross: asNumber(item.Gross),
    Fase_Atual: normalizeStage(asString(item.Fase_Atual)),
    Data_Prevista: asString(item.Data_Prevista),
    Risco_Score: risco.toLowerCase().includes('alto') ? 80 : (risco.toLowerCase().includes('medio') ? 55 : 25),
    Categoria_Pauta: inferCategoria(risco),
    Proxima_Acao_Pipeline: perguntas,
    acao_sugerida: asString(item.Acao_Sugerida || item.acao_sugerida || item.Acao_Desc || item.acao_desc || item.Perguntas_de_Auditoria_IA),
    acao_code: asString(item.Acao_Code || item.acao_code),
    velocity_predicao: asString(item.Velocity_Predicao || item.velocity_predicao),
    idle_dias: idle > 0 ? idle : undefined,
    risk_tags: [risco, asString(item.Elegibilidade_SS), asString(item.Status_Governanca_SS)].filter(Boolean),
    sabatina_questions: splitHints(perguntas),
    status_governanca_ss: asString(item.Status_Governanca_SS),
    sales_specialist_envolvido: asString(item.ss_key || item.Sales_Specialist_Envolvido),
    bant_score: asNumber(item.BANT_Score || item.bant_score),
    meddic_score: asNumber(item.MEDDIC_Score || item.meddic_score),
    bant_gaps: splitGaps(asString(item.BANT_Gaps || item.bant_gaps)),
    meddic_gaps: splitGaps(asString(item.MEDDIC_Gaps || item.meddic_gaps)),
    avaliacao_personas_ia: asString(item.Avaliacao_Personas_IA || item.personas_assessment),
    flag_aprovacao_previa: asString(item.Flag_Aprovacao_Previa || item.flag_aprovacao_previa),
    motivo_status_gtm: asString(item.Motivo_Status_GTM || item.motivo_status_gtm),
    mudancas_close_date: asNumber(item.Mudancas_Close_Date || item.close_date_changes),
  }
}

function mapHandoffToActivities(items: Record<string, unknown>[]): CrmActivity[] {
  return items.slice(0, 20).map((item) => ({
    tipo: 'nota',
    conta: asString(item.Conta),
    data: asString(item.Data_Prevista) || new Date().toISOString(),
    descricao: [
      asString(item.Oportunidade),
      asString(item.Risco_Principal),
      asString(item.Status_Governanca_SS),
      asString(item.Perguntas_de_Auditoria_IA),
    ].filter(Boolean).join(' • '),
  }))
}

function mapQueueToActivities(items: Record<string, unknown>[]): CrmActivity[] {
  return items.slice(0, 20).map((item) => ({
    tipo: 'nota',
    conta: asString(item.Conta),
    data: asString(item.Data_Prevista) || new Date().toISOString(),
    descricao: [
      asString(item.Oportunidade),
      asString(item.Elegibilidade_SS),
      asString(item.Status_Governanca_SS),
      asString(item.Perguntas_de_Auditoria_IA),
    ].filter(Boolean).join(' • '),
  }))
}

// ─── Stage normalisation ─────────────────────────────────────────────────────
const STAGE_MAP: Record<string, string> = {
  prospeccion:'Prospecção', prospección:'Prospecção',
  calificacion:'Qualificação', calificación:'Qualificação',
  propuesta:'Proposta',
  negociacion:'Negociação', negociación:'Negociação',
  'revision ejecutiva':'Revisão Executiva', 'revisión ejecutiva':'Revisão Executiva',
  'revision ejecutivo':'Revisão Executiva', 'revisión ejecutivo':'Revisão Executiva',
  cierre:'Fechamento', 'closed won':'Fechamento', ganho:'Fechamento',
  'closed lost':'Perdido', perdido:'Perdido',
  prospecting:'Prospecção', qualification:'Qualificação',
  proposal:'Proposta', negotiation:'Negociação',
  'executive review':'Revisão Executiva', closing:'Fechamento',
  // Portuguese
  prospecção:'Prospecção', qualificação:'Qualificação', proposta:'Proposta',
  negociação:'Negociação', 'revisão executiva':'Revisão Executiva', fechamento:'Fechamento',
}

function normalizeStage(s?: string): string {
  if (!s) return ''
  const k = s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return STAGE_MAP[k] ?? STAGE_MAP[s.trim().toLowerCase()] ?? s
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmtR(v: number) {
  return 'R$\u00a0' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtK(v: number) {
  if (v >= 1e6) return 'R$\u00a0' + (v / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (v >= 1e3) return 'R$\u00a0' + (v / 1e3).toFixed(0) + 'K'
  return fmtR(v)
}
function fmtDate(s?: string) {
  if (!s) return '—'
  try { return new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return s }
}

// ─── CSS helpers ─────────────────────────────────────────────────────────────
function stageCss(f?: string) {
  const m: Record<string, string> = {
    'Prospecção': 'sl-stg-prosp', 'Qualificação': 'sl-stg-qual', 'Proposta': 'sl-stg-prop',
    'Negociação': 'sl-stg-neg', 'Revisão Executiva': 'sl-stg-rev', 'Fechamento': 'sl-stg-fech',
    'Perdido': 'sl-stg-prosp',
  }
  return 'sl-badge ' + (m[f ?? ''] ?? 'sl-stg-prosp')
}
function riskClass(d: Deal): 'alto' | 'medio' | 'baixo' {
  const cat = d.Categoria_Pauta ?? '', score = d.Risco_Score ?? 0
  if (cat === 'ZUMBI' || score > 75) return 'alto'
  if (cat === 'CRITICO' || score > 45) return 'medio'
  return 'baixo'
}

// ─── Gate ────────────────────────────────────────────────────────────────────
function Gate({ onSuccess }: { onSuccess: (u: XSalesUser) => void }) {
  const [email, setEmail] = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault(); setErr('')
    if (!email.trim()) { setErr('Digite seu e-mail corporativo.'); return }
    setBusy(true)
    try {
      const user = await getUserByEmail(email.trim().toLowerCase())
      if (!user) { setErr('Acesso não encontrado. Solicite ao administrador.'); return }
      if (!user.isActive) { setErr('Sua conta está inativa. Contate o administrador.'); return }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
      onSuccess(user)
    } catch { setErr('Erro ao verificar acesso. Tente novamente.') }
    finally { setBusy(false) }
  }

  return (
    <div className="sl-gate">
      <div className="sl-gate-card">
        <div className="sl-gate-ring">
          <img src={LOGO_GREEN} alt="X" />
        </div>
        <p className="font-poppins text-[9px] font-bold uppercase tracking-[.22em] text-xGreen mb-1">
          Visão Sales
        </p>
        <h2 className="font-poppins text-xl font-bold text-white mb-1">Identifique-se</h2>
        <p className="font-roboto text-sm text-gray-500 font-light mb-6">
          Acesse seu painel com a conta Google corporativa.
        </p>
        <form onSubmit={submit} className="w-full">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@xertica.com" autoComplete="email"
            className="sl-g-inp mb-3" />
          <button type="submit" disabled={busy} className="sl-g-btn">
            {busy ? 'Verificando…' : 'Acessar meu painel →'}
          </button>
        </form>
        {err && <p className="font-roboto text-xs text-red-400 mt-3">{err}</p>}
        <p className="font-roboto text-[11px] text-gray-600 mt-5">
          Sem acesso?{' '}
          <a href="/admin" className="text-xGreen hover:underline">Solicite ao Administrador</a>.
        </p>
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
interface SidebarProps {
  user: XSalesUser
  viewingSeller: XSalesUser | null
  activeTab: TabId
  oppCount: number
  hasActivities: boolean
  onTab: (t: TabId) => void
  onLogout: () => void
  quarter: string
}
function Sidebar({ user, viewingSeller, activeTab, oppCount, hasActivities, onTab, onLogout, quarter }: SidebarProps) {
  const displayed = viewingSeller ?? user
  const initials  = (displayed.displayName || 'U').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const roleLabel: Record<string, string> = { admin: 'Administrador', exec: 'Executivo', sales: 'Vendedor', automation: 'Automação', marketing: 'Marketing', contratos: 'Contratos' }
  const userHubs  = getUserHubs(user)
  const canInspect = userHubs.includes('admin') || userHubs.includes('exec')
  const primaryLabel = user.cargo || roleLabel[user.role] || user.role

  return (
    <aside className="sl-sidebar">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[.05] cursor-pointer"
        onClick={() => window.location.href = '/'}>
        <img src={LOGO_GREEN} className="h-6 w-6 object-contain drop-shadow-[0_0_7px_rgba(192,255,125,.4)]" alt="X" />
        <div>
          <img src={LOGO_TEXT} className="h-3 object-contain mb-0.5" alt="Xertica.ai" />
          <p className="font-poppins text-[9px] font-bold text-xGreen tracking-[.2em] uppercase">Sales Workspace</p>
        </div>
      </div>

      <div className="px-3 py-3 border-b border-white/[.04]">
        <div className="sl-sidebar-user">
          <div className="sl-user-avatar">{initials}</div>
          <div className="min-w-0">
            <p className="font-poppins text-xs font-semibold text-white truncate">{displayed.displayName || displayed.email}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-poppins text-[9px] uppercase tracking-wider text-gray-400 truncate">
                {primaryLabel}
              </span>
              {viewingSeller && (
                <span className="sl-inspect-badge">inspeção</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="sl-nav-group-title">Principal</div>
        {(['dashboard', 'pipeline', 'activities'] as TabId[]).map(t => (
          <button key={t} className={`sl-nav-item${activeTab === t ? ' active' : ''}`} onClick={() => onTab(t)}>
            <i className={`ph ${t === 'dashboard' ? 'ph-squares-four' : t === 'pipeline' ? 'ph-funnel' : 'ph-calendar-check'}`} />
            {t === 'dashboard' ? 'Visão Geral' : t === 'pipeline' ? 'Meu Pipeline' : 'Atividades CRM'}
            {t === 'pipeline' && <span className="sl-nav-badge">{oppCount}</span>}
            {t === 'activities' && hasActivities && <span className="sl-nav-dot" />}
          </button>
        ))}

        <div className="sl-nav-group-title" style={{ marginTop: 16 }}>Financeiro</div>
        <button className={`sl-nav-item${activeTab === 'calculator' ? ' active' : ''}`} onClick={() => onTab('calculator')}>
          <i className="ph ph-calculator" /> Simulador
        </button>

        {canInspect && (
          <>
            <div className="sl-nav-group-title" style={{ marginTop: 16 }}>Admin</div>
            <a href="/admin" className="sl-nav-item" style={{ textDecoration: 'none' }}>
              <i className="ph ph-shield-check" /> Painel Admin
            </a>
          </>
        )}
      </nav>

      <div className="px-3 pt-3 pb-4 border-t border-white/[.04]">
        <p className="font-poppins text-[9px] font-semibold text-gray-600 uppercase tracking-[.18em] px-2 mb-2">{quarter}</p>
        <button className="sl-nav-item w-full text-left" style={{ color: 'var(--text-muted)' }} onClick={onLogout}>
          <i className="ph ph-sign-out" /> Sair
        </button>
      </div>
    </aside>
  )
}

// ─── Inspect select ───────────────────────────────────────────────────────────
function InspectSelect({ allUsers, current, viewingSeller, onChange }: {
  allUsers: XSalesUser[]; current: XSalesUser
  viewingSeller: XSalesUser | null; onChange: (u: XSalesUser | null) => void
}) {
  const sellers = allUsers.filter(u => u.role === 'sales' && u.isActive && u.sellerCanonical)
  if (!sellers.length || current.role === 'sales') return null
  return (
    <div className="flex items-center gap-2">
      <i className="ph ph-eye text-xCyan text-sm flex-shrink-0" />
      <select value={viewingSeller?.id ?? ''} onChange={e => onChange(sellers.find(s => s.id === e.target.value) ?? null)}
        className="bg-transparent border border-white/10 text-[11px] text-white/70 px-2 py-1 rounded-lg outline-none cursor-pointer font-poppins">
        <option value="">— minha conta —</option>
        {sellers.map(s => <option key={s.id} value={s.id}>{s.displayName} ({s.sellerCanonical})</option>)}
      </select>
    </div>
  )
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────
function TabDashboard({ deals, user, onGoToPipeline }: {
  deals: Deal[]; user: XSalesUser; onGoToPipeline: () => void
}) {
  if (!deals.length) {
    return (
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 20px 30px' }}>
        <div className="sl-empty-state">
          <i className="ph ph-folder-open text-2xl text-gray-500" />
          <p className="font-poppins text-sm font-semibold text-white">Nenhuma oportunidade encontrada</p>
          <p className="font-roboto text-xs text-gray-400">
            Ajuste os filtros ou aguarde a sincronização para visualizar o pipeline.
          </p>
          <button type="button" className="sl-empty-cta" onClick={onGoToPipeline}>Abrir pipeline</button>
        </div>
      </div>
    )
  }

  const firstName = (user.displayName || 'Vendedor').split(' ')[0]
  const gross     = deals.reduce((s, d) => s + (d.Gross || 0), 0)
  const criticos  = deals.filter(d => d.Categoria_Pauta === 'CRITICO' || d.Categoria_Pauta === 'ZUMBI').length
  const altaPrio  = deals.filter(d => d.Categoria_Pauta === 'ALTA_PRIORIDADE').length
  const avgConf   = deals.length ? Math.round(deals.reduce((s, d) => s + (d.Confianca || 0), 0) / deals.length) : 0

  const today = new Date(); const in30 = new Date(today.getTime() + 30 * 86400000)
  const closing = deals
    .filter(d => { if (!d.Data_Prevista) return false; const dt = new Date(d.Data_Prevista); return dt >= today && dt <= in30 })
    .sort((a, b) => new Date(a.Data_Prevista!).getTime() - new Date(b.Data_Prevista!).getTime())
    .slice(0, 6)

  const warItems: { icon: string; color: string; title: string; body: string }[] = []
  deals.filter(d => d.Categoria_Pauta === 'ZUMBI').forEach(d =>
    warItems.push({ icon: 'ph-warning-circle', color: 'var(--x-pink)', title: 'Estagnada', body: `"${(d.Oportunidade || '').slice(0, 30)}" sem atualização há ${d.Dias_Funil ?? '?'}d.` }))
  deals.filter(d => d.Categoria_Pauta === 'CRITICO').slice(0, 2).forEach(d =>
    warItems.push({ icon: 'ph-fire', color: '#fca5a5', title: 'Crítico', body: `${(d.Oportunidade || '').slice(0, 30)} — ação urgente necessária.` }))
  deals.filter(d => (d.Risco_Score || 0) > 70 && d.Categoria_Pauta !== 'CRITICO' && d.Categoria_Pauta !== 'ZUMBI').slice(0, 2).forEach(d =>
    warItems.push({ icon: 'ph-chart-line-up', color: 'var(--x-cyan)', title: 'Alto Score IA', body: `${(d.Oportunidade || '').slice(0, 30)} · score ${d.Risco_Score}.` }))
  if (!warItems.length) warItems.push({ icon: 'ph-check-circle', color: 'var(--x-green)', title: 'Pipeline saudável', body: 'Nenhum negócio crítico identificado.' })

  return (
    <div className="sl-tab-content" style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 20px 30px' }}>
      <div className="mb-6">
        <p className="font-poppins text-[10px] font-bold text-xGreen uppercase tracking-[.22em] mb-1">Bem-vindo ao seu painel</p>
        <h1 className="font-poppins text-2xl font-bold text-white mb-1">
          Olá, <span style={{ background: 'linear-gradient(90deg,#C0FF7D,#80FFB0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{firstName}</span>.
        </h1>
        <p className="font-roboto text-sm text-gray-400">
          Você tem <span className="font-semibold text-red-400">{criticos}</span> negócios críticos que precisam de ação hoje.
        </p>

        <div className="sl-glass green mt-4" style={{ display: 'inline-block', width: '100%', maxWidth: 500, padding: 16 }}>
          <div className="flex justify-between items-end mb-1.5">
            <div>
              <p className="font-poppins text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Pipeline bruto · confiança média</p>
              <p className="font-poppins text-lg font-bold text-white">{fmtK(gross)}</p>
            </div>
            <p className="font-poppins font-bold text-xGreen text-base">{avgConf}%</p>
          </div>
          <div className="sl-progress-track">
            <div className="sl-progress-fill" style={{ width: Math.min(100, avgConf) + '%' }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: 'ph-funnel',     label: 'Pipeline bruto', value: fmtK(gross),      sub: `${deals.length} deals`, color: '' },
          { icon: 'ph-trend-up',   label: 'Alta Prioridade', value: String(altaPrio), sub: 'a fechar',             color: 'text-xGreen' },
          { icon: 'ph-warning',    label: 'Críticos',        value: String(criticos), sub: 'precisam de ação',     color: '',           style: { color: '#fbbf24' } },
          { icon: 'ph-money',      label: 'Comissão simulada', value: fmtK(gross * 0.03), sub: 'est. 3% s/ bruto',  color: '',           gradient: true },
        ].map((k, i) => (
          <div key={i} className={`sl-glass green${i === 3 ? ' border-green' : ''} p-5 cursor-default`}>
            <div className="sl-kpi-title">
              <i className={`ph ${k.icon} text-xCyan`} />{k.label}
            </div>
            <div className={`sl-kpi-value ${k.color}`} style={k.gradient
              ? { background: 'linear-gradient(90deg,var(--x-green),#80FFB0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
              : k.style}>
              {k.value}
            </div>
            <div className="sl-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="sl-glass green lg:col-span-2" style={{ minHeight: 290, maxHeight: 350, display: 'flex', flexDirection: 'column' }}>
          <div className="flex justify-between items-center px-4 pt-4 pb-3 border-b border-white/[.04] flex-shrink-0">
            <div><p className="font-poppins text-sm font-semibold text-white">Fechamentos iminentes</p>
              <p className="font-roboto text-[11px] text-gray-400">Próximos 30 dias</p></div>
            <button onClick={onGoToPipeline} className="font-poppins text-[11px] text-xGreen hover:underline">Ver pipeline</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {closing.length === 0
              ? <p className="text-center py-8 text-gray-600 text-xs font-roboto">Nenhum fechamento nos próximos 30 dias.</p>
              : <table className="sl-tbl" style={{ fontSize: 12 }}>
                  <tbody>
                    {closing.map((d, i) => {
                      const days = Math.round((new Date(d.Data_Prevista!).getTime() - today.getTime()) / 86400000)
                      return (
                        <tr key={i}>
                          <td style={{ padding: '10px 14px' }}>
                            <p className="font-poppins font-semibold text-white text-xs">{d.Oportunidade ?? '—'}</p>
                            <p className="font-roboto text-[10px] text-gray-500 mt-0.5">{d.Conta ?? ''} · fecha em {days}d</p>
                          </td>
                          <td style={{ padding: '10px 14px' }}><span className={stageCss(d.Fase_Atual)}>{d.Fase_Atual ?? '—'}</span></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }} className="font-poppins font-semibold text-white text-xs">{fmtR(d.Gross ?? 0)}</td>
                          <td style={{ padding: '10px 14px' }}><RiskBadge deal={d} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>}
          </div>
        </div>

        <div className="sl-glass pink" style={{ minHeight: 290, maxHeight: 350, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 10 }}>
            <div className="flex items-center gap-2 mb-2">
              <i className="ph-fill ph-sparkle text-xPink text-lg" />
              <h3 className="font-poppins font-bold text-sm" style={{ background: 'linear-gradient(90deg,var(--x-pink),#d156d2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Intelligence
              </h3>
            </div>
            <p className="font-roboto text-[11px] text-gray-400 mb-3">Ações sugeridas com base nos seus negócios.</p>
            <div className="space-y-2 overflow-y-auto flex-1">
              {warItems.slice(0, 5).map((it, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--sl-glass-border)' }}>
                  <div className="flex items-start gap-2">
                    <i className={`ph-fill ${it.icon} mt-0.5 flex-shrink-0`} style={{ fontSize: 13, color: it.color }} />
                    <div>
                      <p className="font-poppins text-xs font-semibold text-white leading-tight">{it.title}</p>
                      <p className="font-roboto text-[10px] text-gray-400 mt-0.5">{it.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ deal }: { deal: Deal }) {
  const cls = riskClass(deal)
  const [label, dotColor] =
    cls === 'alto'  ? ['Alto',  '#fca5a5'] :
    cls === 'medio' ? ['Médio', '#fcd34d'] :
                     ['Baixo', '#86efac']
  return (
    <span className={`sl-risk sl-risk-${cls}`}>
      <span className="sl-risk-dot" style={{ background: dotColor }} />{label}
    </span>
  )
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score?: number }) {
  const v = score ?? 0
  const cls = v >= 70 ? 'high' : v >= 40 ? 'med' : 'low'
  return <div className={`sl-score-ring ${cls}`} style={{ margin: '0 auto' }}>{v || '—'}</div>
}

// ─── Pipeline tab ─────────────────────────────────────────────────────────────
function priorityRank(d: Deal): number {
  const velocity = String(d.velocity_predicao || '').toUpperCase()
  const idle = d.idle_dias ?? 0
  const risk = d.Risco_Score ?? 0
  const slippage = d.mudancas_close_date ?? 0
  let score = risk
  if (velocity.includes('ESTAGN')) score += 45
  else if (velocity.includes('DESACELER')) score += 25
  if (idle >= 30) score += 25
  if (idle >= 90) score += 40
  if (slippage >= 2) score += 20
  return score
}

function velocityTone(d: Deal): 'stagnado' | 'desacelerando' | 'ok' {
  const v = String(d.velocity_predicao || '').toUpperCase()
  if (v.includes('ESTAGN')) return 'stagnado'
  if (v.includes('DESACELER')) return 'desacelerando'
  return 'ok'
}

function Barmeter({ label, score }: { label: string; score?: number }) {
  const value = Math.max(0, Math.min(100, score ?? 0))
  return (
    <div>
      <div className="sl-rx-meter-head">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="sl-rx-meter-track"><div className="sl-rx-meter-fill" style={{ width: `${value}%` }} /></div>
    </div>
  )
}

function TabPipeline({ deals }: { deals: Deal[] }) {
  const [stageFilter, setStageFilter] = useState('todos')
  const [search, setSearch]           = useState('')
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())

  const STAGES = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Revisão Executiva', 'Fechamento']
  const filtered = deals
    .filter(d => stageFilter === 'todos' || d.Fase_Atual === stageFilter)
    .filter(d => !search || (d.Oportunidade ?? '').toLowerCase().includes(search) || (d.Conta ?? '').toLowerCase().includes(search))
    .sort((a, b) => priorityRank(b) - priorityRank(a))

  const zombieDeals = deals.filter((d) => (d.idle_dias ?? 0) > 30 && (d.Dias_Funil ?? 0) > 90)
  const slippageDeals = deals.filter((d) => (d.mudancas_close_date ?? 0) >= 2)

  function toggle(i: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  return (
    <div style={{ maxWidth: 1560, margin: '0 auto', padding: '24px 20px 34px' }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-poppins text-xl font-bold text-white">Fila de Ação Diária</h1>
          <p className="font-roboto text-xs text-gray-400 mt-0.5">Prioridade invertida por risco e urgência ({filtered.length} oportunidades)</p>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value.toLowerCase())}
          placeholder="Buscar oportunidade…"
          className="bg-white/[.04] border border-white/10 rounded-lg text-xs text-white px-3 py-1.5 outline-none transition-colors focus:border-xGreen w-44 font-roboto placeholder-gray-600" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {['todos', ...STAGES].map(s => (
          <button key={s} className={`sl-pill${stageFilter === s ? ' active' : ''}`} onClick={() => setStageFilter(s)}>
            {s === 'todos' ? 'Todos' : s}
          </button>
        ))}
      </div>

      <div className="sl-hygiene-grid mb-4">
        <div className="sl-hygiene-card">
          <p className="sl-hygiene-title">Negócios Zumbis</p>
          <p className="sl-hygiene-value">{zombieDeals.length}</p>
          <p className="sl-hygiene-sub">funil acima de 90d e inatividade acima de 30d</p>
        </div>
        <div className="sl-hygiene-card">
          <p className="sl-hygiene-title">Alertas de Slippage</p>
          <p className="sl-hygiene-value">{slippageDeals.length}</p>
          <p className="sl-hygiene-sub">múltiplas mudanças de close date</p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="sl-empty-state">
          <i className="ph ph-database text-2xl text-gray-500" />
          <p className="font-poppins text-sm font-semibold text-white">Sem dados de pipeline</p>
          <p className="font-roboto text-xs text-gray-400">
            Não há oportunidades carregadas para este contexto.
          </p>
        </div>
      ) : (
      <div className="sl-glass" style={{ padding: 0, borderRadius: 16, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="sl-tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>ID</th><th>Oportunidade</th><th>Conta</th>
                <th className="text-right">Valor (R$)</th><th>Etapa</th>
                <th>Inatividade</th><th>Prev. Fechamento</th><th>Risco</th>
                <th className="text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600 text-xs">Nenhuma oportunidade para este filtro.</td></tr>
              )}
              {filtered.map((d, i) => {
                const idle = d.idle_dias ?? 0
                const tone = velocityTone(d)
                const isExp  = expanded.has(i)
                const acao   = d.acao_sugerida ?? d.Proxima_Acao_Pipeline ?? ''
                const sabatina = (d.sabatina_questions ?? []).slice(0, 3)
                const gaps = [...(d.bant_gaps ?? []), ...(d.meddic_gaps ?? [])]
                const ghosting = String(d.avaliacao_personas_ia || '').toLowerCase().includes('absente')
                  || String(d.avaliacao_personas_ia || '').toLowerCase().includes('economic buyer')
                  || String(d.Proxima_Acao_Pipeline || '').toLowerCase().includes('happy ears')
                const hasGtmBlock = String(d.flag_aprovacao_previa || '').toUpperCase().includes('APROVACAO') || String(d.motivo_status_gtm || '').toUpperCase().includes('FORA')
                return [
                  <tr key={`row-${i}`} className={`sl-deal-row ${tone}${isExp ? ' expanded' : ''}`} onClick={() => toggle(i)}>
                    <td style={{ padding: '8px 6px 8px 12px', width: 28 }}>
                      <i className={`ph ph-caret-right sl-expand-icon${isExp ? ' rotated' : ''}`} />
                    </td>
                    <td className="font-mono text-xs text-gray-400">{d.deal_id ?? d.ID_Salesforce ?? '—'}</td>
                    <td>
                      <div className="font-poppins font-semibold text-white text-[13px] leading-snug">{d.Oportunidade ?? '—'}</div>
                      {d.Perfil_Cliente === 'Nomeada' && <span className="sl-badge sl-b-nomeada mt-0.5 inline-block">Nomeada</span>}
                    </td>
                    <td className="font-roboto text-gray-300">{d.Conta ?? '—'}</td>
                    <td className="text-right font-poppins font-semibold text-white text-sm">{fmtR(d.Gross ?? 0)}</td>
                    <td><span className={stageCss(d.Fase_Atual)}>{d.Fase_Atual ?? '—'}</span></td>
                    <td>
                      <div className="font-roboto text-xs text-gray-300">Inativo há <span className="text-red-300 font-semibold">{idle} dias</span></div>
                      <div className={`sl-velocity-pill ${tone}`}>{d.velocity_predicao || 'SEM SINAL'}</div>
                    </td>
                    <td className="font-roboto text-sm text-gray-300">{fmtDate(d.Data_Prevista)}</td>
                    <td><RiskBadge deal={d} /></td>
                    <td style={{ textAlign: 'center' }}><ScoreRing score={d.Risco_Score} /></td>
                  </tr>,
                  isExp && (
                    <tr key={`det-${i}`} className="sl-deal-detail">
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div className="sl-details-inner grid grid-cols-1 md:grid-cols-3 gap-5">
                          <div>
                            <p className="font-poppins text-[9px] font-bold text-xGreen uppercase tracking-[.18em] mb-2">Raio-X do Deal</p>
                            <div className="space-y-2.5 text-[11px] text-gray-300">
                              <Barmeter label="BANT Score" score={d.bant_score} />
                              <Barmeter label="MEDDIC Score" score={d.meddic_score} />
                              <div>
                                <p className="text-[10px] text-gray-500 mb-1">Gaps críticos</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {gaps.length === 0 && <span className="sl-badge sl-b-green">Sem gaps</span>}
                                  {gaps.map((g, idx) => (
                                    <button type="button" key={idx} className="sl-gap-chip" title="Clique para atualizar no CRM">{g}</button>
                                  ))}
                                </div>
                              </div>
                              {ghosting && (
                                <div className="sl-critical-alert">
                                  Atenção: risco de Happy Ears. O decisor econômico está ausente das últimas interações.
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="font-poppins text-[9px] font-bold text-xGreen uppercase tracking-[.18em] mb-2">Ação Imediata</p>
                            <button type="button" className="sl-main-action" onClick={(ev) => ev.stopPropagation()}>
                              {d.acao_code ? `${d.acao_code} · ` : ''}{acao || 'Ação sugerida'}
                            </button>
                            <p className="text-[11px] text-gray-300 leading-relaxed mt-2">{d.Proxima_Acao_Pipeline || 'Sem orientação adicional.'}</p>
                            <div className="mt-3">
                              <p className="font-poppins text-[9px] font-bold text-xCyan uppercase tracking-[.18em] mb-1.5">Governança e Hand-off</p>
                              <p className="text-[11px] text-gray-400">SS envolvido: <span className="text-white">{d.sales_specialist_envolvido || 'não informado'}</span></p>
                              <p className="text-[11px] text-gray-400">Status SS: <span className="text-white">{d.status_governanca_ss || 'n/d'}</span></p>
                              <p className="text-[11px] text-gray-400">Aprovação prévia: <span className="text-white">{d.flag_aprovacao_previa || 'OK'}</span></p>
                              {d.motivo_status_gtm && <p className="text-[11px] text-gray-400">Motivo GTM: <span className="text-white">{d.motivo_status_gtm}</span></p>}
                              <button type="button" className="sl-advance-btn" disabled={hasGtmBlock} onClick={(ev) => ev.stopPropagation()}>
                                {hasGtmBlock ? 'Bloqueado: aprovação necessária' : 'Avançar fase'}
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="font-poppins text-[9px] font-bold text-xCyan uppercase tracking-[.18em] mb-2">Prepare-se para a L10</p>
                            <div className="sl-coaching-box">
                              {(sabatina.length ? sabatina : splitHints(d.Proxima_Acao_Pipeline || '')).slice(0, 4).map((q, j) => (
                                <p key={j} className="text-[11px] text-gray-300 leading-snug">• {String(q)}</p>
                              ))}
                            </div>
                            {(d.risk_tags ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {d.risk_tags!.map((t, j) => <span key={j} className="sl-badge sl-b-red" style={{ fontSize: 9 }}>{t}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="sl-loading-shell">
      <div className="sl-loading-card sl-shimmer" />
      <div className="sl-loading-grid">
        <div className="sl-loading-card sl-shimmer" />
        <div className="sl-loading-card sl-shimmer" />
        <div className="sl-loading-card sl-shimmer" />
      </div>
      <div className="sl-loading-card lg sl-shimmer" />
    </div>
  )
}

// ─── Activities tab ────────────────────────────────────────────────────────────
function TabActivities({ activities }: { activities: CrmActivity[] }) {
  const typeIcon:  Record<string, string> = { call: 'ph-phone-call', email: 'ph-envelope', reuniao: 'ph-users', nota: 'ph-note' }
  const typeColor: Record<string, string> = { call: 'var(--x-cyan)', email: 'var(--x-green)', reuniao: 'var(--x-pink)', nota: 'var(--text-muted)' }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 20px 30px' }}>
      <div className="mb-6">
        <h1 className="font-poppins text-xl font-bold text-white">Atividades CRM</h1>
        <p className="font-roboto text-xs text-gray-400 mt-0.5">Histórico de atividades do período</p>
      </div>
      <div className="sl-glass p-6">
        {activities.length === 0
          ? <p className="text-xs text-gray-600 text-center py-8 font-roboto">Nenhuma atividade registrada.</p>
          : <div className="sl-timeline">
              {activities.map((act, i) => {
                const icon  = typeIcon[act.tipo]  ?? 'ph-activity'
                const color = typeColor[act.tipo] ?? 'var(--text-muted)'
                return (
                  <div key={i} className="sl-tl-item">
                    <div className="sl-tl-dot" />
                    <div className="sl-tl-card">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2">
                          <i className={`ph-fill ${icon} flex-shrink-0`} style={{ color, fontSize: 14 }} />
                          <span className="font-poppins font-semibold text-white text-xs">{act.conta || 'Atividade'}</span>
                        </div>
                        <span className="font-roboto text-[10px] text-gray-500 flex-shrink-0">{fmtDate(act.data)}</span>
                      </div>
                      <p className="font-roboto text-[11px] text-gray-400 leading-relaxed">{act.descricao || ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>}
      </div>
    </div>
  )
}

// ─── Calculator tab ────────────────────────────────────────────────────────────
function TabCalculator({ deals, kpi }: { deals: Deal[]; kpi: KpiSnapshot | null }) {
  const earnable = deals.filter(d => (d.Gross ?? 0) > 0)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [mult, setMult]       = useState(3)

  function toggle(i: number) {
    setChecked(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })
  }
  const base = Array.from(checked).reduce((sum, i) => sum + (earnable[i]?.Gross ?? 0), 0)

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 20px 30px' }}>
      <div className="mb-6">
        <h1 className="font-poppins text-2xl font-bold text-white">Simulador de Ganhos</h1>
        <p className="font-roboto text-xs text-gray-400">Selecione as oportunidades e ajuste o multiplicador.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="sl-glass green p-5">
          <p className="font-poppins text-sm font-semibold text-white mb-3">Oportunidades em aberto</p>
          {earnable.length === 0
            ? <p className="text-xs text-gray-600 text-center py-4 font-roboto">Sem oportunidades disponíveis.</p>
            : <div className="space-y-2">
                {earnable.map((d, i) => (
                  <label key={i} className="sl-calc-row" onClick={() => toggle(i)}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)}
                        className="sl-sim-checkbox" onClick={e => e.stopPropagation()} />
                      <div>
                        <p className="font-poppins font-semibold text-white text-xs leading-tight">{d.Oportunidade ?? '—'}</p>
                        <p className="font-roboto text-[10px] text-gray-500 mt-0.5">{d.Conta ?? ''}</p>
                      </div>
                    </div>
                    <span className="font-poppins font-semibold text-white text-xs ml-3 flex-shrink-0">{fmtK(d.Gross ?? 0)}</span>
                  </label>
                ))}
              </div>}
        </div>

        <div className="sl-glass green p-6" style={{ borderColor: 'var(--sl-green-glow)' }}>
          <div className="flex flex-col gap-5 justify-between h-full">
            <div>
              <p className="font-roboto text-xs text-gray-400 mb-0.5">Base de cálculo selecionada</p>
              <p className="font-poppins text-xl font-bold text-white">{fmtR(base)}</p>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
                <span>Multiplicador (% comissão sobre bruto)</span>
                <span className="font-poppins text-white font-mono">{mult.toFixed(1)}%</span>
              </div>
              <input type="range" min={1} max={6} step={0.5} value={mult}
                onChange={e => setMult(parseFloat(e.target.value))}
                className="sl-range-slider" style={{ width: '100%' }} />
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'rgba(192,255,125,.06)', border: '1px solid var(--sl-green-glow)' }}>
              <p className="font-poppins text-[9px] text-gray-400 uppercase tracking-[.2em] mb-0.5">Comissão estimada</p>
              <p className="font-poppins text-3xl font-bold" style={{ background: 'linear-gradient(90deg,var(--x-green),#80FFB0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {fmtR(base * mult / 100)}
              </p>
              {kpi && (
                <p className="font-roboto text-[10px] text-gray-400 mt-2">
                  Meta: {fmtK(kpi.meta)} · Realizado: {fmtK(kpi.realizado)} · Atingimento: {kpi.attainment_pct.toFixed(1)}%
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Sales page ─────────────────────────────────────────────────────────
export default function Sales() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [currentUser,    setCurrentUser]    = useState<XSalesUser | null>(null)
  const [portalContext,  setPortalContext]  = useState<PortalContext | null>(null)
  const [viewingSeller,  setViewingSeller]  = useState<XSalesUser | null>(null)
  const [allUsers,       setAllUsers]       = useState<XSalesUser[]>([])
  const [agenda,         setAgenda]         = useState<AgendaData | null>(null)
  const [allDeals,       setAllDeals]       = useState<Deal[]>([])
  const [activitiesData, setActivitiesData] = useState<CrmActivity[]>([])
  const [kpiSnapshot,    setKpiSnapshot]    = useState<KpiSnapshot | null>(null)
  const [effectivePersona, setEffectivePersona] = useState<string | null>(null)
  const [dataMode,       setDataMode]       = useState<'legacy' | 'v2'>('legacy')
  const [loadError,      setLoadError]      = useState<string | null>(null)
  const [activeTab,      setActiveTab]      = useState<TabId>('dashboard')
  const [quarter]        = useState('FY26-Q2')
  const [globalSearch,   setGlobalSearch]   = useState('')
  const [loading,        setLoading]        = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  function isV2Enabled(): boolean {
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('v2') === '0') return false
    if (qs.get('v2') === '1') return true
    return localStorage.getItem('xsales_use_v2') !== '0'
  }

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (!saved) return
    try {
      const u = JSON.parse(saved) as XSalesUser
      setCurrentUser(u)
      loadData(u, null)
    } catch { sessionStorage.removeItem(SESSION_KEY) }

    // load user list for inspect mode
    try {
      const cached = localStorage.getItem('xsales_users_cache')
      if (cached) setAllUsers(JSON.parse(cached))
    } catch { /* ignore */ }
  }, [])

  async function loadData(baseUser: XSalesUser, inspectUser: XSalesUser | null) {
    const targetUser = inspectUser ?? baseUser
    const canonical = targetUser.sellerCanonical ?? null
    if (!canonical) { setAgenda(null); setAllDeals([]); return }
    setLoadError(null)
    setLoading(true)
    let v2Failed = false
    try {
      if (isV2Enabled()) {
        try {
          const ctx = await fetchPortalContext(baseUser.email)
          setPortalContext(ctx)

          const targetPersona = inspectUser ? derivePersonaData(targetUser) : ctx.persona
          setEffectivePersona(targetPersona)
          const ownerOverride = inspectUser ? (targetUser.principalOwner || targetUser.sellerCanonical || undefined) : undefined
          const ssOverride = inspectUser ? (targetUser.principalSs || undefined) : undefined

          if (targetPersona === 'BDM_CS' || targetPersona === 'ADMIN') {
            const [kpiRes, queueRes, handoffRes] = await Promise.all([
              fetchBdmCsKpi(baseUser.email, quarter, ownerOverride),
              fetchBdmCsActionQueue(baseUser.email, quarter, 150, ownerOverride),
              fetchBdmCsHandoff(baseUser.email, quarter, 80, ownerOverride),
            ])
            const queueItems = queueRes.items as Record<string, unknown>[]
            const handoffItems = handoffRes.items as Record<string, unknown>[]
            const deals = queueItems.map(mapBdmActionToDeal)
            const activities = mapHandoffToActivities(handoffItems)
            const kpiItem = (kpiRes.items[0] || {}) as Record<string, unknown>
            setAllDeals(deals)
            setActivitiesData(activities)
            setKpiSnapshot({
              target_key: asString(kpiItem.owner_key),
              fiscal_q: asString(kpiItem.fiscal_q),
              meta: asNumber(kpiItem.meta_net_faturado),
              realizado: asNumber(kpiItem.net_faturado_incremental),
              attainment_pct: asNumber(kpiItem.attainment_pct),
              gap: asNumber(kpiItem.gap_net),
            })
            setAgenda(null)
            setDataMode('v2')
            setLoadError(null)
            return
          }

          if (targetPersona === 'SS') {
            const [kpiRes, queueRes] = await Promise.all([
              fetchSsKpi(baseUser.email, quarter, ssOverride),
              fetchSsClosingQueue(baseUser.email, quarter, 150, ssOverride),
            ])
            const queueItems = queueRes.items as Record<string, unknown>[]
            const deals = queueItems.map(mapSsQueueToDeal)
            const activities = mapQueueToActivities(queueItems)
            const kpiItem = (kpiRes.items[0] || {}) as Record<string, unknown>
            setAllDeals(deals)
            setActivitiesData(activities)
            setKpiSnapshot({
              target_key: asString(kpiItem.ss_key),
              fiscal_q: asString(kpiItem.fiscal_q),
              meta: asNumber(kpiItem.meta_net_gerado),
              realizado: asNumber(kpiItem.net_gerado_elegivel),
              attainment_pct: asNumber(kpiItem.attainment_pct),
              gap: asNumber(kpiItem.gap_net),
            })
            setAgenda(null)
            setDataMode('v2')
            setLoadError(null)
            return
          }
        } catch (e) {
          v2Failed = true
          const msg = e instanceof Error ? e.message : 'erro desconhecido'
          setLoadError(`Falha no modo v2 (${msg}). Tentando legado...`)
        }
      }

      const result = await fetchWeeklyAgenda(canonical)
      if (result) {
        setAgenda(result)
        setAllDeals((result.deals ?? []).map(d => ({ ...d, Fase_Atual: normalizeStage(d.Fase_Atual) })))
        setActivitiesData(result.performance?.last_activities ?? [])
        setLoadError(null)
        setDataMode('legacy')
        setEffectivePersona(derivePersonaData(targetUser))
      } else {
        const msg = v2Failed
          ? 'Falha no v2 e não encontramos dados no legado para este vendedor.'
          : 'Não encontramos dados no legado para este vendedor.'
        setLoadError(msg)
        clearDataState()
      }
      setPortalContext(null)
      setKpiSnapshot(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido'
      setLoadError(`Falha ao carregar dados (${msg}).`) 
      clearDataState()
    } finally { setLoading(false) }
  }

  function clearDataState() {
    setAgenda(null)
    setAllDeals([])
    setActivitiesData([])
    setKpiSnapshot(null)
    setDataMode('legacy')
    setEffectivePersona(null)
  }

  function onSuccess(u: XSalesUser) {
    setCurrentUser(u)
    loadData(u, null)
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setCurrentUser(null); setViewingSeller(null); setAgenda(null); setAllDeals([])
    setActivitiesData([]); setPortalContext(null); setKpiSnapshot(null); setEffectivePersona(null)
  }

  async function changeInspect(seller: XSalesUser | null) {
    setViewingSeller(seller)
    if (currentUser) await loadData(currentUser, seller)
  }

  async function retryCurrentView() {
    if (currentUser) await loadData(currentUser, viewingSeller)
  }

  function onGlobalSearch(val: string) {
    setGlobalSearch(val.toLowerCase())
    if (val) setActiveTab('pipeline')
  }

  const activities = dataMode === 'v2' ? activitiesData : (agenda?.performance?.last_activities ?? [])
  const dealsForDisplay = globalSearch
    ? allDeals.filter(d => (d.Oportunidade ?? '').toLowerCase().includes(globalSearch) || (d.Conta ?? '').toLowerCase().includes(globalSearch))
    : allDeals

  if (!currentUser) return (
    <>
      <Background />
      <Gate onSuccess={onSuccess} />
    </>
  )

  return (
    <>
      <Background />
      <div className="sl-layout">

        {/* Sidebar */}
        <Sidebar
          user={currentUser}
          viewingSeller={viewingSeller}
          activeTab={activeTab}
          oppCount={allDeals.length}
          hasActivities={activities.length > 0}
          onTab={t => { setGlobalSearch(''); setActiveTab(t) }}
          onLogout={logout}
          quarter={quarter}
        />

        {/* Main */}
        <div className="sl-main-wrapper">

          {/* Topbar */}
          <header className="sl-topbar">
            <div className="flex items-center gap-3">
              <h2 className="font-poppins text-[15px] font-semibold text-white">{TAB_TITLES[activeTab]}</h2>
              <div className="h-3.5 w-px bg-white/15 hidden sm:block" />
              <span className="font-poppins text-[10px] text-gray-500 uppercase tracking-[.15em] hidden sm:block">{quarter}</span>
              <span className={`font-poppins text-[10px] uppercase tracking-[.15em] hidden sm:block ${dataMode === 'v2' ? 'text-xCyan' : 'text-gray-500'}`}>
                {dataMode === 'v2' ? `v2 ${effectivePersona || portalContext?.persona || ''}` : 'legado'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
                <input ref={searchRef} type="text" value={globalSearch}
                  onChange={e => onGlobalSearch(e.target.value)}
                  placeholder="Buscar oportunidade…" className="sl-search-bar" />
              </div>
              {currentUser.role !== 'sales' && (
                <InspectSelect
                  allUsers={allUsers} current={currentUser}
                  viewingSeller={viewingSeller} onChange={changeInspect}
                />
              )}
              <button onClick={toggleTheme} className="sl-theme-btn" title="Alternar tema">
                <i className={`ph ${theme === 'dark' ? 'ph-moon' : 'ph-sun'} text-sm`} />
              </button>
            </div>
          </header>

          {/* Inspect banner */}
          {viewingSeller && (
            <div className="sl-inspect-banner">
              <i className="ph ph-eye text-xCyan text-sm flex-shrink-0" />
              <span className="font-poppins text-[11px] font-semibold text-xCyan">Modo Inspeção</span>
              <span className="font-roboto text-xs text-gray-400">{viewingSeller.displayName} · {viewingSeller.sellerCanonical}</span>
            </div>
          )}

          {/* Data source/status banner */}
          <div className="sl-data-banner">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`sl-data-pill ${dataMode === 'v2' ? 'is-v2' : 'is-legacy'}`}>
                {dataMode === 'v2' ? `modo v2 ${portalContext?.persona || ''}` : 'modo legado'}
              </span>
              <span className="font-roboto text-[11px] text-gray-400">
                {dataMode === 'v2'
                  ? 'Dados carregados por persona/RLS com endpoints v2.'
                  : 'Dados carregados por endpoint legado de agenda semanal.'}
              </span>
              {dataMode === 'v2' && kpiSnapshot && (
                <span className="font-roboto text-[11px] text-gray-500">
                  alvo: {kpiSnapshot.target_key || 'n/a'} · {kpiSnapshot.fiscal_q || quarter}
                </span>
              )}
            </div>
            {loadError && (
              <div className="flex items-center gap-2.5 flex-wrap mt-2">
                <span className="sl-data-alert">{loadError}</span>
                <button type="button" onClick={retryCurrentView} className="sl-data-retry">
                  Tentar novamente
                </button>
              </div>
            )}
          </div>

          {/* Tab content */}
          <main className="sl-tab-area">
            {loading && (
              <LoadingShell />
            )}
            {!loading && activeTab === 'dashboard'  && <TabDashboard deals={dealsForDisplay} user={viewingSeller ?? currentUser!} onGoToPipeline={() => setActiveTab('pipeline')} />}
            {!loading && activeTab === 'pipeline'   && <TabPipeline deals={dealsForDisplay} />}
            {!loading && activeTab === 'activities' && <TabActivities activities={activities} />}
            {!loading && activeTab === 'calculator' && <TabCalculator deals={allDeals} kpi={kpiSnapshot} />}
          </main>
        </div>
      </div>
    </>
  )
}
