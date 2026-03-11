import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import Background from '../components/Background'
import { useTheme } from '../hooks/useTheme'
import { fetchUsers, createUser, updateUser, deleteUserById } from '../lib/api'
import type { XSalesUser, AuditEntry, UserRole, CompanyCargo, PersonaData, RlsScope } from '../lib/types'
import { getUserHubs, derivePersonaData } from '../lib/types'

// ─── Constants ────────────────────────────────────────────────────
const LOGO = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png'
const LOG_KEY     = 'xsales_admin_log'
const SESSION_KEY = 'xsales_admin_auth'

const ROLE_BADGE: Record<UserRole, string> = {
  admin:      'adm-b-cyan',
  exec:       'adm-b-purple',
  sales:      'adm-b-green',
  automation: 'adm-b-pink',
  marketing:  'adm-b-blue',
  contratos:  'adm-b-indigo',
}
const ROLE_LABEL: Record<UserRole, string> = {
  admin:      'Admin',
  exec:       'Executivo',
  sales:      'Sales',
  automation: 'Automation',
  marketing:  'Marketing',
  contratos:  'Contratos',
}

const HUB_OPTIONS: { value: UserRole; label: string; badgeClass: string; icon: string }[] = [
  { value: 'admin',      label: 'Admin',      badgeClass: 'adm-b-cyan',   icon: 'ph-shield-check' },
  { value: 'exec',       label: 'Executivo',  badgeClass: 'adm-b-purple', icon: 'ph-chart-bar' },
  { value: 'sales',      label: 'Sales',      badgeClass: 'adm-b-green',  icon: 'ph-target' },
  { value: 'automation', label: 'Automation', badgeClass: 'adm-b-pink',   icon: 'ph-robot' },
  { value: 'marketing',  label: 'Marketing',  badgeClass: 'adm-b-blue',   icon: 'ph-megaphone' },
  { value: 'contratos',  label: 'Contratos',  badgeClass: 'adm-b-indigo', icon: 'ph-files' },
]

const CARGO_OPTIONS: CompanyCargo[] = [
  'CEO', 'COO', 'CTO',
  'Diretor Comercial', 'VP de Vendas',
  'Head de Marketing',
  'Account Executive', 'Sales Manager',
  'Gerente de Operações', 'Engenheiro de Dados',
  'Analista Jurídico', 'Outro',
]

const PERSONA_OPTIONS: PersonaData[] = ['BDM_CS', 'SS', 'ADMIN']
const RLS_OPTIONS: RlsScope[] = ['OWNER', 'SS', 'ALL']
const LOG_BADGE: Record<string, string> = {
  'CRIAR': 'adm-b-green', 'EDITAR': 'adm-b-cyan', 'DESATIVAR': 'adm-b-grey',
  'ATIVAR': 'adm-b-green', 'REMOVER': 'adm-b-pink',
}

// ─── Audit helpers ─────────────────────────────────────────────────
function loadLog(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}
function pushLog(type: string, target: string, by: string) {
  const l = loadLog()
  l.unshift({ type, target, when: new Date().toLocaleString('pt-BR'), by })
  localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 100)))
}
function fmtDate(iso?: string) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—' }

// ─── Gate ──────────────────────────────────────────────────────────
function Gate({ onSuccess }: { onSuccess: (secret: string, users: XSalesUser[]) => void }) {
  const [pwd, setPwd]     = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit() {
    if (!pwd.trim()) { setErr('Digite a senha.'); return }
    setBusy(true); setErr('')
    try {
      const users = await fetchUsers(pwd.trim())
      sessionStorage.setItem(SESSION_KEY, pwd.trim())
      onSuccess(pwd.trim(), users)
    } catch (e: unknown) {
      setErr((e as { status?: number }).status === 401 ? 'Senha incorreta.' : 'Erro ao conectar.')
    } finally { setBusy(false) }
  }

  return (
    <div className="admin-gate-overlay">
      <div className="admin-gate-card">
        <div className="admin-gate-ring">
          <img src={LOGO} alt="X" />
        </div>
        <p className="font-poppins text-[9px] font-bold uppercase tracking-[.2em] text-xCyan mb-1.5">
          Área Restrita
        </p>
        <h2 className="font-poppins text-xl font-bold text-white mb-1">Admin Panel</h2>
        <p className="font-roboto text-sm text-gray-500 font-light mb-7">
          Controle de acessos e governança do X-Sales Hub.
        </p>
        <input
          type="password" value={pwd} onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Senha de acesso" autoComplete="off"
          className="adm-input text-center mb-4"
        />
        <button onClick={submit} disabled={busy} className="adm-btn-primary w-full justify-center">
          {busy ? 'Validando…' : 'Entrar'} <i className="ph ph-arrow-right" />
        </button>
        {err && <p className="font-roboto text-xs text-red-400 mt-3">{err}</p>}
      </div>
    </div>
  )
}

// ─── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accentClass }: {
  label: string; value: number; icon: string; accentClass: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    el.style.setProperty('--mouse-x', `${x}px`); el.style.setProperty('--mouse-y', `${y}px`)
    el.style.transform = `perspective(1200px) rotateX(${((y - r.height / 2) / (r.height / 2)) * -4}deg) rotateY(${((x - r.width / 2) / (r.width / 2)) * 4}deg) scale3d(1.02,1.02,1.02)`
  }, [])
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'perspective(1200px) rotateX(0) rotateY(0) scale3d(1,1,1)'
  }, [])
  return (
    <div ref={ref} className="adm-card" style={{ padding: 20, transformStyle: 'preserve-3d' }}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="flex items-center gap-4">
        <div className={`adm-kpi-icon ${accentClass}`}>
          <i className={`ph ${icon}`} style={{ fontSize: 24 }} />
        </div>
        <div>
          <p className="adm-kpi-label">{label}</p>
          <p className="adm-kpi-value">{value}</p>
        </div>
      </div>
    </div>
  )
}

// ─── User Modal ────────────────────────────────────────────────────
interface ModalProps {
  user: Partial<XSalesUser>
  onClose: () => void
  onSave: (payload: Partial<XSalesUser>, id?: string) => Promise<void>
}

function UserModal({ user, onClose, onSave }: ModalProps) {
  const [email,  setEmail]  = useState(user.email ?? '')
  const [name,   setName]   = useState(user.displayName ?? '')
  const [hubs,   setHubs]   = useState<UserRole[]>(
    (Array.isArray(user.hubs) && user.hubs.length > 0)
      ? user.hubs
      : (user.role ? [user.role] : [])
  )
  const [cargo,  setCargo]  = useState<CompanyCargo | ''>(user.cargo ?? '')
  const [personaData, setPersonaData] = useState<PersonaData>(
    derivePersonaData({ personaData: user.personaData, cargo: user.cargo, role: (user.role || 'sales') as UserRole })
  )
  const [principalOwner, setPrincipalOwner] = useState((user.principalOwner || user.sellerCanonical || '').toLowerCase())
  const [principalSs, setPrincipalSs] = useState((user.principalSs || '').toLowerCase())
  const [rlsScope, setRlsScope] = useState<RlsScope>((user.rlsScope as RlsScope) || 'OWNER')
  const [active, setActive] = useState<boolean>(user.isActive ?? true)
  const [seller, setSeller] = useState(user.sellerCanonical ?? '')
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')
  const editing = !!user.id

  function toggleHub(h: UserRole) {
    setHubs(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h])
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!email || !name || hubs.length === 0) { setErr('Preencha todos os campos e selecione ao menos um hub.'); return }
    if (personaData === 'BDM_CS' && !principalOwner.trim()) {
      setErr('Para persona BDM/CS, informe o vínculo principal Owner.'); return
    }
    if (personaData === 'SS' && !principalSs.trim()) {
      setErr('Para persona SS, informe o vínculo principal SS.'); return
    }
    if (hubs.includes('sales') && !seller.trim()) {
      setErr('Informe a vinculação de dados para o perfil Sales.'); return
    }

    const normalizedRlsScope: RlsScope = personaData === 'ADMIN' ? 'ALL' : (personaData === 'SS' ? 'SS' : 'OWNER')
    setBusy(true)
    try {
      await onSave({
        email: email.toLowerCase().trim(),
        displayName: name.trim(),
        role: hubs[0] as UserRole,   // primary = first selected hub
        hubs,
        cargo,
        personaData,
        principalOwner: principalOwner.trim().toLowerCase() || null,
        principalSs: principalSs.trim().toLowerCase() || null,
        rlsScope: normalizedRlsScope || rlsScope,
        isActive: active,
        sellerCanonical: hubs.includes('sales') ? seller.trim().toLowerCase() : null,
      }, user.id)
      onClose()
    } catch (e: unknown) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="adm-modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal-card">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="adm-modal-icon-wrap">
              <i className={`ph ${editing ? 'ph-pencil-simple' : 'ph-user-plus'} text-xl`} />
            </div>
            <h2 className="font-poppins text-lg font-bold text-white tracking-wide">
              {editing ? 'Editar Acesso' : 'Novo Acesso'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <i className="ph ph-x text-2xl" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="adm-label">E-mail corporativo (Google Auth)</label>
            <div className="relative">
              <i className="ph ph-envelope-simple absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="nome@xertica.com" className="adm-input !pl-11" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="adm-label">Nome completo</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Nome Sobrenome" className="adm-input" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="adm-label">Cargo na empresa</label>
              <select value={cargo} onChange={e => setCargo(e.target.value as CompanyCargo)}
                className="adm-select">
                <option value="">Selecionar cargo…</option>
                {CARGO_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 sm:col-span-1">
              <label className="adm-label">Persona de dados</label>
              <select value={personaData} onChange={e => setPersonaData(e.target.value as PersonaData)} className="adm-select">
                {PERSONA_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="adm-label">RLS Scope</label>
              <select value={personaData === 'ADMIN' ? 'ALL' : rlsScope} onChange={e => setRlsScope(e.target.value as RlsScope)} className="adm-select" disabled={personaData === 'ADMIN'}>
                {RLS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="adm-label">Vínculo principal Owner</label>
              <input type="text" value={principalOwner} onChange={e => setPrincipalOwner(e.target.value)}
                placeholder="ex.: carlos moll"
                className="adm-input"
                disabled={personaData === 'SS'} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="adm-label">Vínculo principal SS</label>
              <input type="text" value={principalSs} onChange={e => setPrincipalSs(e.target.value)}
                placeholder="ex.: gabriele oliveira"
                className="adm-input"
                disabled={personaData === 'BDM_CS'} />
            </div>
          </div>

          {/* Hub multi-select */}
          <div>
            <label className="adm-label">Módulos com acesso <span className="text-gray-600">(selecione um ou mais)</span></label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {HUB_OPTIONS.map(h => {
                const on = hubs.includes(h.value)
                return (
                  <button type="button" key={h.value}
                    onClick={() => toggleHub(h.value)}
                    className={`adm-hub-btn${on ? ' active' : ''} ${h.badgeClass}`}>
                    <i className={`ph ${h.icon} text-sm`} />
                    <span>{h.label}</span>
                    {on && <i className="ph ph-check-circle text-xs ml-auto" />}
                  </button>
                )
              })}
            </div>
            {hubs.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-1.5 font-roboto">
                Primário: <span className="text-gray-300">{ROLE_LABEL[hubs[0]]}</span>
                {hubs.length > 1 && ` + ${hubs.length - 1} adicional(is)`}
              </p>
            )}
          </div>

          <div>
            <label className="adm-label">Status</label>
            <select value={active ? '1' : '0'} onChange={e => setActive(e.target.value === '1')}
              className="adm-select">
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </div>

          {hubs.includes('sales') && (
            <div className="adm-scope-box">
              <label className="adm-label !text-xGreen flex items-center gap-2">
                <i className="ph ph-link" /> Vinculação de Dados de Vendas
              </label>
              <p className="text-[11px] text-gray-400 mb-3 leading-relaxed font-roboto">
                Nome do vendedor <strong className="text-gray-300">exatamente</strong> como está cadastrado
                no banco de dados. Restringe a Visão Sales às oportunidades desta pessoa.
              </p>
              <div className="relative">
                <i className="ph ph-user-circle absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input type="text" value={seller} onChange={e => setSeller(e.target.value)}
                  placeholder="Nome Sobrenome (igual ao banco de dados)"
                  className="adm-input !pl-9" style={{ borderColor: 'rgba(192,255,125,0.4)' }} />
              </div>
            </div>
          )}

          {err && <p className="text-red-400 text-xs font-roboto">{err}</p>}

          <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
            <button type="button" onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-poppins font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wide">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="adm-btn-primary">
              {busy ? 'Salvando…' : 'Salvar permissões'} <i className="ph ph-check-circle text-base ml-1" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Admin page ────────────────────────────────────────────────────
export default function Admin() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [secret,    setSecret]    = useState('')
  const [users,     setUsers]     = useState<XSalesUser[]>([])
  const [authed,    setAuthed]    = useState(false)
  const [query,     setQuery]     = useState('')
  const [activeTab, setActiveTab] = useState<'dir' | 'log'>('dir')
  const [modalUser, setModalUser] = useState<Partial<XSalesUser> | null>(null) // null = closed
  const [auditLog,  setAuditLog]  = useState<AuditEntry[]>([])

  // Restore session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (!saved) return
    fetchUsers(saved)
      .then(u => { setSecret(saved); setUsers(u); setAuthed(true); setAuditLog(loadLog()) })
      .catch(() => sessionStorage.removeItem(SESSION_KEY))
  }, [])

  function onSuccess(s: string, u: XSalesUser[]) {
    setSecret(s); setUsers(u); setAuthed(true); setAuditLog(loadLog())
  }
  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setAuthed(false); setSecret(''); setUsers([])
  }

  function addAudit(type: string, target: string) {
    pushLog(type, target, 'Administrador')
    setAuditLog(loadLog())
  }

  async function onSave(payload: Partial<XSalesUser>, id?: string) {
    if (id) {
      const updated = await updateUser(secret, id, payload)
      setUsers(u => u.map(x => x.id === id ? updated : x))
      addAudit('EDITAR', payload.displayName ?? '')
    } else {
      const created = await createUser(secret, { ...payload, createdBy: 'Administrador' })
      setUsers(u => [...u, created])
      addAudit('CRIAR', payload.displayName ?? '')
    }
  }

  async function toggleActive(u: XSalesUser) {
    const updated = await updateUser(secret, u.id, { isActive: !u.isActive })
    setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
    addAudit(u.isActive ? 'DESATIVAR' : 'ATIVAR', u.displayName)
  }

  async function removeUser(u: XSalesUser) {
    if (!confirm(`Remover "${u.displayName}" permanentemente?`)) return
    await deleteUserById(secret, u.id)
    setUsers(prev => prev.filter(x => x.id !== u.id))
    addAudit('REMOVER', u.displayName)
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' })
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `xsales_users_${new Date().toISOString().slice(0, 10)}.json`,
    }).click()
  }

  async function importJSON() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
      let list: Partial<XSalesUser>[]
      try { list = JSON.parse(await file.text()) } catch { alert('JSON inválido.'); return }
      if (!Array.isArray(list)) { alert('O arquivo deve conter um array de usuários.'); return }
      if (!confirm(`Importar ${list.length} usuários? Duplicatas serão ignoradas.`)) return
      let created = 0, skipped = 0
      for (const u of list) {
        if (!u.email) { skipped++; continue }
        try {
          const newUser = await createUser(secret, {
            ...u,
            email: (u.email || '').toLowerCase(),
            sellerCanonical: (u.sellerCanonical || '').toLowerCase() || null,
          })
          setUsers(prev => [...prev, newUser]); created++
        } catch { skipped++ }
      }
      // Refresh from server to ensure consistency
      try { const fresh = await fetchUsers(secret); setUsers(fresh) } catch { /* ignore */ }
      alert(`Importação: ${created} criados, ${skipped} ignorados.`)
    }
    input.click()
  }

  const filtered = users.filter(u => {
    if (!query) return true
    const q = query.toLowerCase()
    return (u.email || '').includes(q) || (u.displayName || '').toLowerCase().includes(q)
  })

  if (!authed) return (
    <>
      <Background />
      <Gate onSuccess={onSuccess} />
    </>
  )

  return (
    <>
      <Background />

      {/* Navbar */}
      <nav className="hub-navbar py-3 px-6 sm:px-8 fade-up">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => { window.location.href = '/' }}>
            <img src={LOGO} className="h-6 w-6 object-contain"
              style={{ filter: 'drop-shadow(0 0 8px rgba(0,190,255,.4))' }} alt="X" />
            <div className="h-5 w-px bg-white/10 mx-1" />
            <span className="font-poppins text-xs font-semibold text-xCyan tracking-[.2em] uppercase">
              Admin · Acessos
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <div className="font-poppins text-[13px] font-semibold text-white">Administrador</div>
              <div className="font-poppins text-[9px] text-xCyan uppercase tracking-[.2em] font-bold">
                Administrador
              </div>
            </div>
            <button onClick={toggleTheme} title="Alternar tema"
              className="h-9 w-9 rounded-full border border-white/20 flex items-center justify-center text-white/70 hover:border-xCyan transition-all"
              style={{ background: 'linear-gradient(135deg,rgba(255,255,255,.1),transparent)' }}>
              <i className={`ph ${theme === 'dark' ? 'ph-moon' : 'ph-sun'} text-base`} />
            </button>
            <button onClick={logout}
              className="h-9 w-9 rounded-full border border-white/20 flex items-center justify-center text-white/80 hover:border-xCyan transition-all"
              style={{ background: 'linear-gradient(135deg,rgba(255,255,255,.1),transparent)' }}>
              <i className="ph ph-sign-out text-base" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-grow flex flex-col px-4 sm:px-6 lg:px-8 py-10 relative z-10 max-w-7xl mx-auto w-full">

        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 fade-up">
          <div>
            <h1 className="font-poppins text-3xl font-bold tracking-tight text-white mb-2">
              Gestão de Acessos
            </h1>
            <p className="font-roboto text-sm text-gray-400 font-light">
              Gerencie quem acessa cada módulo do X-Sales e quais dados cada pessoa pode visualizar.
            </p>
          </div>
          <button onClick={() => setModalUser({})} className="adm-btn-primary shrink-0">
            <i className="ph ph-plus-circle text-lg" /> Novo Usuário
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 fade-up delay-100">
          <KpiCard label="Total Ativos"    value={users.filter(u => u.isActive).length}
            icon="ph-users"        accentClass="adm-kpi-cyan" />
          <KpiCard label="Escopos Sales"   value={users.filter(u => u.sellerCanonical).length}
            icon="ph-target"       accentClass="adm-kpi-green" />
          <KpiCard label="Hubs Vinculados" value={users.reduce((s, u) => s + getUserHubs(u).length, 0)}
            icon="ph-shield-check" accentClass="adm-kpi-pink" />
        </div>

        {/* Table card */}
        <div className="adm-card !p-0 !rounded-2xl fade-up delay-200 overflow-hidden">

          {/* Toolbar */}
          <div className="px-6 py-5 border-b border-white/[.06] bg-black/20 flex flex-wrap gap-6 items-center">
            {(['dir', 'log'] as const).map(t => (
              <button key={t} className={`adm-tab${activeTab === t ? ' active' : ''}`}
                onClick={() => setActiveTab(t)}>
                {t === 'dir' ? 'Diretório de Acessos' : 'Trilha de Auditoria'}
              </button>
            ))}
            <div className="ml-auto relative">
              <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar email ou nome…"
                className="adm-input !py-2 !pl-9 !pr-4 !w-64 !bg-transparent !text-xs !rounded-lg" />
            </div>
          </div>

          {/* Directory tab */}
          {activeTab === 'dir' && (
            <div>
              {filtered.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Usuário</th><th>Cargo</th><th>Persona/RLS</th><th>Hubs de Acesso</th><th>Vinculação de Dados</th>
                        <th>Criado em</th><th>Status</th><th className="text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className={`adm-ava ${u.role}`}>
                                {(u.displayName || u.email || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white text-[13px] leading-snug">
                                  {u.displayName}
                                </div>
                                <div className="text-gray-500 text-xs">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-xs text-gray-400">
                            {u.cargo
                              ? <span className="font-roboto">{u.cargo}</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="text-xs text-gray-400">
                            <div className="flex flex-col gap-0.5">
                              <span>{u.personaData || derivePersonaData(u)}</span>
                              <span className="text-gray-600">{u.rlsScope || '—'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {getUserHubs(u).map(h => (
                                <span key={h} className={`adm-badge ${ROLE_BADGE[h] ?? 'adm-b-grey'} !text-[9px] !py-0.5`}>
                                  {ROLE_LABEL[h] ?? h}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="font-mono text-xs text-gray-400">
                            <div className="flex flex-wrap gap-1">
                              {u.principalOwner && <span className="adm-badge adm-b-green !text-[10px]">owner:{u.principalOwner}</span>}
                              {u.principalSs && <span className="adm-badge adm-b-purple !text-[10px]">ss:{u.principalSs}</span>}
                              {!u.principalOwner && !u.principalSs && !u.sellerCanonical && <span className="text-gray-600">—</span>}
                              {!u.principalOwner && !u.principalSs && u.sellerCanonical && <span className="adm-badge adm-b-green !text-[10px]">owner:{u.sellerCanonical}</span>}
                            </div>
                          </td>
                          <td className="text-xs text-gray-500">{fmtDate(u.createdAt)}</td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span className={`adm-sdot ${u.isActive ? 's-on' : 's-off'}`} />
                              <span className={`text-xs ${u.isActive ? 'text-xGreen' : 'text-gray-500'}`}>
                                {u.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <button className="adm-btn-icon" onClick={() => setModalUser(u)} title="Editar">
                                <i className="ph ph-pencil-simple" />
                              </button>
                              <button className="adm-btn-icon" onClick={() => toggleActive(u)}
                                title={u.isActive ? 'Desativar' : 'Ativar'}>
                                <i className={`ph ${u.isActive ? 'ph-toggle-right text-xGreen' : 'ph-toggle-left text-gray-500'}`} />
                              </button>
                              <button className="adm-btn-icon adm-btn-del" onClick={() => removeUser(u)} title="Remover">
                                <i className="ph ph-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center font-roboto text-sm text-gray-600 px-6">
                  {users.length === 0
                    ? <span>Nenhum usuário cadastrado. Clique em <strong className="text-gray-500">Novo Usuário</strong> para começar.</span>
                    : 'Nenhum resultado para a busca.'}
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/[.04] bg-black/10 flex justify-between items-center">
                <span className="text-xs text-gray-500 font-poppins">
                  {filtered.length === users.length
                    ? `${filtered.length} registro(s)`
                    : `${filtered.length} de ${users.length} registro(s)`}
                </span>
                <div className="flex gap-2">
                  <button onClick={importJSON}
                    className="adm-btn-icon !w-auto !px-3 flex items-center gap-1.5 text-xs font-poppins font-semibold">
                    <i className="ph ph-download-simple text-sm" /> Importar
                  </button>
                  <button onClick={exportJSON}
                    className="adm-btn-icon !w-auto !px-3 flex items-center gap-1.5 text-xs font-poppins font-semibold">
                    <i className="ph ph-export text-sm" /> Exportar lista
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audit tab */}
          {activeTab === 'log' && (
            <div>
              {auditLog.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="adm-table">
                    <thead>
                      <tr><th>Evento</th><th>Usuário Afetado</th><th>Por</th><th>Quando</th></tr>
                    </thead>
                    <tbody>
                      {auditLog.map((l, i) => (
                        <tr key={i}>
                          <td><span className={`adm-badge ${LOG_BADGE[l.type] ?? 'adm-b-grey'}`}>{l.type}</span></td>
                          <td className="text-gray-300">{l.target}</td>
                          <td className="text-gray-500 text-xs">{l.by}</td>
                          <td className="text-gray-500 text-xs">{l.when}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center font-roboto text-sm text-gray-600">
                  Nenhuma ação registrada nesta sessão.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* User modal */}
      {modalUser !== null && (
        <UserModal user={modalUser} onClose={() => setModalUser(null)} onSave={onSave} />
      )}
    </>
  )
}
