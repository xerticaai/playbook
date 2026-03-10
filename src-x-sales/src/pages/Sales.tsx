import {
  useState, useEffect, useRef, type FormEvent,
} from 'react'
import Background from '../components/Background'
import { useTheme } from '../hooks/useTheme'
import { getUserByEmail, fetchWeeklyAgenda } from '../lib/api'
import type { XSalesUser, Deal, CrmActivity, AgendaData } from '../lib/types'

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
function categoriaCss(c?: string) {
  const m: Record<string, string> = { ZUMBI: 'sl-b-red', CRITICO: 'sl-b-yellow', ALTA_PRIORIDADE: 'sl-b-green', MONITORAR: 'sl-b-gray' }
  return m[c ?? ''] ?? 'sl-b-gray'
}
function riskClass(d: Deal): 'alto' | 'medio' | 'baixo' {
  const cat = d.Categoria_Pauta ?? '', score = d.Risco_Score ?? 0
  if (cat === 'ZUMBI' || score > 75) return 'alto'
  if (cat === 'CRITICO' || score > 45) return 'medio'
  return 'baixo'
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_DEALS: Deal[] = [
  { deal_id: 'D001', Oportunidade: 'Projeto Vertex AI', Conta: 'ACME Corp', Gross: 320000, Fase_Atual: 'Negociação', Data_Prevista: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10), Confianca: 72, Dias_Funil: 45, Risco_Score: 65, Categoria_Pauta: 'CRITICO', Proxima_Acao_Pipeline: 'Enviar proposta revisada até sexta-feira.', Produtos: 'Vertex AI, BigQuery', Perfil_Cliente: 'Nomeada' },
  { deal_id: 'D002', Oportunidade: 'Migração Cloud Run', Conta: 'Beta SA', Gross: 180000, Fase_Atual: 'Proposta', Data_Prevista: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10), Confianca: 55, Dias_Funil: 32, Risco_Score: 40, Categoria_Pauta: 'MONITORAR', Produtos: 'Cloud Run, GKE', Perfil_Cliente: 'Transacional' },
  { deal_id: 'D003', Oportunidade: 'Workspace Enterprise', Conta: 'Gama Ltda', Gross: 95000, Fase_Atual: 'Qualificação', Data_Prevista: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), Confianca: 38, Dias_Funil: 18, Risco_Score: 22, Categoria_Pauta: 'ALTA_PRIORIDADE', Produtos: 'Workspace Business Plus' },
  { deal_id: 'D004', Oportunidade: 'Analytics Platform', Conta: 'Delta Inc', Gross: 520000, Fase_Atual: 'Fechamento', Data_Prevista: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10), Confianca: 88, Dias_Funil: 67, Risco_Score: 15, Categoria_Pauta: 'ALTA_PRIORIDADE', Produtos: 'Looker, BigQuery', Perfil_Cliente: 'Nomeada', sabatina_questions: ['Qual o critério de decisão final?', 'Existe dependência de aprovação de board?', 'Qual a data de kick-off esperada?'] },
  { deal_id: 'D005', Oportunidade: 'Data Warehouse Modernization', Conta: 'Épsilon SA', Gross: 240000, Fase_Atual: 'Prospecção', Data_Prevista: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), Confianca: 25, Dias_Funil: 120, Risco_Score: 88, Categoria_Pauta: 'ZUMBI', risk_tags: ['sem atividade 90d', 'stakeholder mudou'] },
]
const DEMO_ACTIVITIES: CrmActivity[] = [
  { tipo: 'reuniao', conta: 'ACME Corp', data: new Date(Date.now() - 2 * 86400000).toISOString(), descricao: 'Demo técnica do Vertex AI realizada com o time de dados.' },
  { tipo: 'email', conta: 'Beta SA', data: new Date(Date.now() - 5 * 86400000).toISOString(), descricao: 'Proposta comercial enviada para aprovação da diretoria.' },
  { tipo: 'call', conta: 'Gama Ltda', data: new Date(Date.now() - 7 * 86400000).toISOString(), descricao: 'Qualificação de necessidades — confirmado interesse em Workspace.' },
]

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
  const roleLabel: Record<string, string> = { admin: 'Administrador', exec: 'Executivo', sales: 'Vendedor', automation: 'Automação' }
  const canInspect = user.role !== 'sales'

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
                {roleLabel[displayed.role] ?? displayed.role}
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
    <div className="sl-tab-content" style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
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
function TabPipeline({ deals }: { deals: Deal[] }) {
  const [stageFilter, setStageFilter] = useState('todos')
  const [search, setSearch]           = useState('')
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())

  const STAGES = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Revisão Executiva', 'Fechamento']
  const filtered = deals
    .filter(d => stageFilter === 'todos' || d.Fase_Atual === stageFilter)
    .filter(d => !search || (d.Oportunidade ?? '').toLowerCase().includes(search) || (d.Conta ?? '').toLowerCase().includes(search))
  const maxDias = Math.max(1, ...deals.map(d => d.Dias_Funil ?? 0))

  function toggle(i: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-poppins text-xl font-bold text-white">Meu Pipeline</h1>
          <p className="font-roboto text-xs text-gray-400 mt-0.5">Pipeline de {filtered.length} oportunidades abertas</p>
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

      <div className="sl-glass" style={{ padding: 0, borderRadius: 16, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="sl-tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>ID</th><th>Oportunidade</th><th>Conta</th>
                <th className="text-right">Valor (R$)</th><th>Etapa</th>
                <th>Funil</th><th>Prev. Fechamento</th><th>Risco</th>
                <th className="text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600 text-xs">Nenhuma oportunidade para este filtro.</td></tr>
              )}
              {filtered.map((d, i) => {
                const pct    = Math.min(100, Math.round(((d.Dias_Funil ?? 0) / maxDias) * 100))
                const barClr = pct > 70 ? '#fca5a5' : pct > 40 ? '#fcd34d' : 'var(--x-green)'
                const isExp  = expanded.has(i)
                const acao   = d.acao_sugerida ?? d.Proxima_Acao_Pipeline ?? ''
                const sabatina = (d.sabatina_questions ?? []).slice(0, 3)
                return [
                  <tr key={`row-${i}`} className={`sl-deal-row${isExp ? ' expanded' : ''}`} onClick={() => toggle(i)}>
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
                      <div className="font-roboto text-xs text-gray-400 mb-0.5">{d.Dias_Funil ?? 0}d</div>
                      <div className="sl-funil-bar"><div className="sl-funil-fill" style={{ width: pct + '%', background: barClr }} /></div>
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
                            <p className="font-poppins text-[9px] font-bold text-xGreen uppercase tracking-[.18em] mb-2">Detalhes</p>
                            <div className="space-y-1.5 text-[11px] text-gray-400">
                              {d.Tipo_Oportunidade && <p><span className="text-gray-500">Tipo:</span> {d.Tipo_Oportunidade}</p>}
                              {d.Produtos && <p><span className="text-gray-500">Produtos:</span> {d.Produtos}</p>}
                              {d.Confianca != null && <p><span className="text-gray-500">Confiança:</span> {d.Confianca}%</p>}
                              {d.Categoria_Pauta && (
                                <p><span className="text-gray-500">Categoria:</span>{' '}
                                  <span className={`sl-badge ${categoriaCss(d.Categoria_Pauta)}`}>{d.Categoria_Pauta}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="font-poppins text-[9px] font-bold text-xGreen uppercase tracking-[.18em] mb-2">Próxima Ação</p>
                            <p className="text-[11px] text-gray-300 leading-relaxed">{acao || 'Nenhuma ação registrada.'}</p>
                            {(d.risk_tags ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {d.risk_tags!.map((t, j) => <span key={j} className="sl-badge sl-b-red" style={{ fontSize: 9 }}>{t}</span>)}
                              </div>
                            )}
                          </div>
                          {sabatina.length > 0 && (
                            <div>
                              <p className="font-poppins text-[9px] font-bold text-xCyan uppercase tracking-[.18em] mb-2">Sabatina AI</p>
                              <ol className="space-y-1.5 list-decimal list-inside text-[11px] text-gray-400">
                                {sabatina.map((q, j) => <li key={j} className="leading-snug">{String(q)}</li>)}
                              </ol>
                            </div>
                          )}
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
    </div>
  )
}

// ─── Activities tab ────────────────────────────────────────────────────────────
function TabActivities({ activities }: { activities: CrmActivity[] }) {
  const typeIcon:  Record<string, string> = { call: 'ph-phone-call', email: 'ph-envelope', reuniao: 'ph-users', nota: 'ph-note' }
  const typeColor: Record<string, string> = { call: 'var(--x-cyan)', email: 'var(--x-green)', reuniao: 'var(--x-pink)', nota: 'var(--text-muted)' }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
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
function TabCalculator({ deals }: { deals: Deal[] }) {
  const earnable = deals.filter(d => (d.Gross ?? 0) > 0)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [mult, setMult]       = useState(3)

  function toggle(i: number) {
    setChecked(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })
  }
  const base = Array.from(checked).reduce((sum, i) => sum + (earnable[i]?.Gross ?? 0), 0)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
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
  const [viewingSeller,  setViewingSeller]  = useState<XSalesUser | null>(null)
  const [allUsers,       setAllUsers]       = useState<XSalesUser[]>([])
  const [agenda,         setAgenda]         = useState<AgendaData | null>(null)
  const [allDeals,       setAllDeals]       = useState<Deal[]>([])
  const [activeTab,      setActiveTab]      = useState<TabId>('dashboard')
  const [quarter]        = useState('FY26-Q2')
  const [globalSearch,   setGlobalSearch]   = useState('')
  const [loading,        setLoading]        = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (!saved) return
    try {
      const u = JSON.parse(saved) as XSalesUser
      setCurrentUser(u)
      loadData(u.sellerCanonical ?? null)
    } catch { sessionStorage.removeItem(SESSION_KEY) }

    // load user list for inspect mode
    try {
      const cached = localStorage.getItem('xsales_users_cache')
      if (cached) setAllUsers(JSON.parse(cached))
    } catch { /* ignore */ }
  }, [])

  async function loadData(canonical: string | null) {
    if (!canonical) { setAgenda(null); setAllDeals([]); return }
    setLoading(true)
    try {
      const result = await fetchWeeklyAgenda(canonical)
      if (result) {
        setAgenda(result)
        setAllDeals((result.deals ?? []).map(d => ({ ...d, Fase_Atual: normalizeStage(d.Fase_Atual) })))
      } else {
        useDemoData()
      }
    } catch {
      useDemoData()
    } finally { setLoading(false) }
  }

  function useDemoData() {
    setAgenda({ vendedor: 'Demo', deals: DEMO_DEALS, summary: {}, performance: { last_activities: DEMO_ACTIVITIES } })
    setAllDeals(DEMO_DEALS)
  }

  function onSuccess(u: XSalesUser) {
    setCurrentUser(u)
    loadData(u.sellerCanonical ?? null)
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setCurrentUser(null); setViewingSeller(null); setAgenda(null); setAllDeals([])
  }

  async function changeInspect(seller: XSalesUser | null) {
    setViewingSeller(seller)
    const canonical = (seller ?? currentUser)?.sellerCanonical ?? null
    await loadData(canonical)
  }

  function onGlobalSearch(val: string) {
    setGlobalSearch(val.toLowerCase())
    if (val) setActiveTab('pipeline')
  }

  const activities = agenda?.performance?.last_activities ?? DEMO_ACTIVITIES
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

          {/* Tab content */}
          <main className="sl-tab-area">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <p className="font-poppins text-sm text-gray-500 animate-pulse">Carregando dados…</p>
              </div>
            )}
            {!loading && activeTab === 'dashboard'  && <TabDashboard deals={dealsForDisplay} user={viewingSeller ?? currentUser!} onGoToPipeline={() => setActiveTab('pipeline')} />}
            {!loading && activeTab === 'pipeline'   && <TabPipeline deals={dealsForDisplay} />}
            {!loading && activeTab === 'activities' && <TabActivities activities={activities} />}
            {!loading && activeTab === 'calculator' && <TabCalculator deals={allDeals} />}
          </main>
        </div>
      </div>
    </>
  )
}
