export type UserRole = 'admin' | 'exec' | 'sales' | 'automation' | 'marketing' | 'contratos'
export type PersonaData = 'BDM_CS' | 'SS' | 'ADMIN'
export type RlsScope = 'OWNER' | 'SS' | 'ALL'

/** Closed enum of company job titles shown in the Admin panel */
export type CompanyCargo =
  | 'CEO'
  | 'COO'
  | 'CTO'
  | 'Diretor Comercial'
  | 'VP de Vendas'
  | 'Head de Marketing'
  | 'Account Executive'
  | 'Sales Manager'
  | 'Gerente de Operações'
  | 'Engenheiro de Dados'
  | 'Analista Jurídico'
  | 'Outro'

export interface XSalesUser {
  id:              string
  email:           string
  displayName:     string
  /** Primary role — kept for legacy Firestore compat. Equals hubs[0]. */
  role:            UserRole
  /** All hub modules this user can access (multi-permission). */
  hubs:            UserRole[]
  /** Company job title (optional — legacy records may not have it). */
  cargo?:          CompanyCargo | ''
  /** Data persona used by Sales Vision RLS. */
  personaData?:    PersonaData
  /** Canonical owner for OWNER scoped views (pipeline.Vendedor / faturamento.comercial). */
  principalOwner?: string | null
  /** Canonical SS for SS scoped views (pipeline.Sales_Specialist_Envolvido). */
  principalSs?:    string | null
  /** Logical RLS scope for backend filtering. */
  rlsScope?:       RlsScope
  sellerCanonical: string | null
  isActive:        boolean
  createdAt:       string
  createdBy:       string
}

/** Derive hubs array from user record (backward-compat helper). */
export function getUserHubs(user: Pick<XSalesUser, 'role' | 'hubs'>): UserRole[] {
  return user.hubs?.length ? user.hubs : [user.role]
}

export function derivePersonaData(user: Pick<XSalesUser, 'personaData' | 'cargo' | 'role'>): PersonaData {
  if (user.personaData) return user.personaData
  const cargo = (user.cargo || '').toLowerCase()
  if (cargo.includes('specialist')) return 'SS'
  if (cargo.includes('bdm') || cargo === 'cs') return 'BDM_CS'
  if (user.role === 'admin' || user.role === 'exec') return 'ADMIN'
  return 'BDM_CS'
}

export interface AuditEntry {
  type:   string
  target: string
  by:     string
  when:   string
}

export interface Deal {
  deal_id?:              string
  ID_Salesforce?:        string
  Oportunidade?:         string
  Conta?:                string
  Gross?:                number
  Fase_Atual?:           string
  Data_Prevista?:        string
  Confianca?:            number
  Dias_Funil?:           number
  Risco_Score?:          number
  Categoria_Pauta?:      string
  Proxima_Acao_Pipeline?: string
  acao_sugerida?:        string
  Tipo_Oportunidade?:    string
  Produtos?:             string
  Perfil_Cliente?:       string
  risk_tags?:            string[]
  sabatina_questions?:   string[]
  velocity_predicao?:    string
  idle_dias?:            number
  acao_code?:            string
  status_governanca_ss?: string
  sales_specialist_envolvido?: string
  bant_score?:           number
  meddic_score?:         number
  bant_gaps?:            string[]
  meddic_gaps?:          string[]
  avaliacao_personas_ia?: string
  flag_aprovacao_previa?: string
  motivo_status_gtm?:    string
  mudancas_close_date?:  number
}

export interface CrmActivity {
  tipo:      string
  conta:     string
  data:      string
  descricao: string
}

export interface AgendaData {
  vendedor:    string
  deals:       Deal[]
  summary:     Record<string, unknown>
  performance: { last_activities: CrmActivity[] }
}

export interface PortalContext {
  email:           string
  persona:         PersonaData
  rls_scope:       RlsScope
  principal_owner: string | null
  principal_ss:    string | null
  cargo?:          CompanyCargo | ''
  hubs:            UserRole[]
}

export interface PortalItemList<T = Record<string, unknown>> {
  items: T[]
}

