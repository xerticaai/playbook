export type UserRole = 'admin' | 'exec' | 'sales' | 'automation'

export interface XSalesUser {
  id:              string
  email:           string
  displayName:     string
  role:            UserRole
  sellerCanonical: string | null
  isActive:        boolean
  createdAt:       string
  createdBy:       string
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

