import type { XSalesUser, AgendaData, PortalContext, PortalItemList } from './types'

export const API_BASE = 'https://sales-intelligence-api-j7loux7yta-uc.a.run.app'

async function buildHttpError(r: Response): Promise<Error> {
  const fallback = 'HTTP ' + r.status
  try {
    const data = await r.json()
    const detail = String((data as { details?: string; detail?: string; error?: string }).details
      || (data as { details?: string; detail?: string; error?: string }).detail
      || (data as { details?: string; detail?: string; error?: string }).error
      || '')
    const msg = detail ? `${fallback}: ${detail}` : fallback
    return Object.assign(new Error(msg), { status: r.status })
  } catch {
    return Object.assign(new Error(fallback), { status: r.status })
  }
}

function headers(secret: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Admin-Secret': secret }
}

export async function fetchUsers(secret: string): Promise<XSalesUser[]> {
  const r = await fetch(`${API_BASE}/api/xsales/users`, { headers: headers(secret) })
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status })
  const d = await r.json()
  return (d.users ?? []) as XSalesUser[]
}

export async function createUser(secret: string, payload: Partial<XSalesUser>): Promise<XSalesUser> {
  const r = await fetch(`${API_BASE}/api/xsales/users`, {
    method: 'POST', headers: headers(secret), body: JSON.stringify(payload),
  })
  if (r.status === 409) throw Object.assign(new Error('E-mail já cadastrado.'), { status: 409 })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'Erro ' + r.status)
  }
  const d = await r.json()
  return d.user as XSalesUser
}

export async function updateUser(secret: string, id: string, payload: Partial<XSalesUser>): Promise<XSalesUser> {
  const r = await fetch(`${API_BASE}/api/xsales/users/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: headers(secret), body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'Erro ' + r.status)
  }
  const d = await r.json()
  return d.user as XSalesUser
}

export async function deleteUserById(secret: string, id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/xsales/users/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: headers(secret),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'Erro ' + r.status)
  }
}

export async function getUserByEmail(email: string): Promise<XSalesUser | null> {
  const r = await fetch(`${API_BASE}/api/xsales/users/by-email?email=${encodeURIComponent(email)}`)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  return (d.user ?? null) as XSalesUser | null
}

export async function fetchWeeklyAgenda(canonical: string): Promise<AgendaData | null> {
  const r = await fetch(`${API_BASE}/api/weekly-agenda?seller=${encodeURIComponent(canonical)}`, {
    signal: AbortSignal.timeout(12000),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const json = await r.json()
  if (json.success && json.sellers && json.sellers.length > 0) {
    return json.sellers[0] as AgendaData
  }
  return null
}

async function fetchPortalList<T>(path: string, params: Record<string, string | number | undefined>): Promise<PortalItemList<T>> {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') usp.set(k, String(v))
  })
  const r = await fetch(`${API_BASE}${path}?${usp.toString()}`)
  if (!r.ok) throw await buildHttpError(r)
  return (await r.json()) as PortalItemList<T>
}

export async function fetchPortalContext(userEmail: string): Promise<PortalContext> {
  const r = await fetch(`${API_BASE}/api/v2/portal/me/context?user_email=${encodeURIComponent(userEmail)}`)
  if (!r.ok) throw await buildHttpError(r)
  return (await r.json()) as PortalContext
}

export async function fetchBdmCsKpi(userEmail: string, fiscalQ?: string, ownerKey?: string) {
  return fetchPortalList('/api/v2/portal/bdmcs/kpi-faturamento', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    owner_key: ownerKey,
  })
}

export async function fetchBdmCsActionQueue(userEmail: string, fiscalQ?: string, limit = 100, ownerKey?: string) {
  return fetchPortalList('/api/v2/portal/bdmcs/fila-acoes', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    limit,
    owner_key: ownerKey,
  })
}

export async function fetchBdmCsHandoff(userEmail: string, fiscalQ?: string, limit = 200, ownerKey?: string) {
  return fetchPortalList('/api/v2/portal/bdmcs/handoff-status', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    limit,
    owner_key: ownerKey,
  })
}

export async function fetchSsKpi(userEmail: string, fiscalQ?: string, ssKey?: string) {
  return fetchPortalList('/api/v2/portal/ss/kpi-net-gerado', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    ss_key: ssKey,
  })
}

export async function fetchSsClosingQueue(userEmail: string, fiscalQ?: string, limit = 200, ssKey?: string) {
  return fetchPortalList('/api/v2/portal/ss/fila-fechamento', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    limit,
    ss_key: ssKey,
  })
}

export async function fetchAdminGovernanceMonitor(userEmail: string, fiscalQ?: string, limit = 500) {
  return fetchPortalList('/api/v2/portal/admin/governance-monitor', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
    limit,
  })
}

export async function fetchAdminSlippageZumbis(userEmail: string, fiscalQ?: string) {
  return fetchPortalList('/api/v2/portal/admin/slippage-zumbis', {
    user_email: userEmail,
    fiscal_q: fiscalQ,
  })
}

