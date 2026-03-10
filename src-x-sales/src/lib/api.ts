import type { XSalesUser, AgendaData } from './types'

export const API_BASE = 'https://sales-intelligence-api-j7loux7yta-uc.a.run.app'

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

