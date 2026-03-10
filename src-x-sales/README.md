# X-Sales Hub — React SPA

Aplicação React 18 + TypeScript + Tailwind que substitui progressivamente as páginas HTML legadas do X-Sales Hub, hospedado em **Firebase Hosting** no projeto `operaciones-br` (site `xsales`).

🌐 **URL de produção:** `https://x-sales.web.app`

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Estilos | Tailwind CSS 3 + CSS global com custom properties |
| Roteamento | React Router 6 |
| Ícones | Phosphor Icons (CDN) |
| Hosting | Firebase Hosting (`xsales`) |
| API | Cloud Run — `sales-intelligence-api-j7loux7yta-uc.a.run.app` |
| Auth | Google Identity + lookup em Firestore via API (`xsales_users`) |

---

## Estrutura do projeto

```
src-x-sales/
├── src/
│   ├── App.tsx                  # Configuração de rotas
│   ├── main.tsx                 # Ponto de entrada
│   ├── styles/
│   │   └── global.css           # Design tokens, tema claro/escuro, classes adm-*
│   ├── components/
│   │   └── Background.tsx       # Orbs + grid animado (compartilhado)
│   ├── hooks/
│   │   └── useTheme.ts          # Toggle dark/light, persiste em localStorage
│   ├── lib/
│   │   ├── types.ts             # XSalesUser, UserRole, AuditEntry
│   │   └── api.ts               # fetchUsers, createUser, updateUser, deleteUserById, getUserByEmail
│   └── pages/
│       ├── Hub.tsx              # Página inicial — cards de acesso
│       ├── Admin.tsx            # Gestão de usuários (migrado de admin.html)
│       ├── Marketing.tsx        # Visão de marketing
│       └── NotFound.tsx         # 404
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

**Saída do build:** `public-x-sales/` (diretório de hospedagem Firebase).

---

## Rotas

| Rota | Componente | Descrição |
|---|---|---|
| `/` | `Hub` | Central de navegação com cards |
| `/admin` | `Admin` | Gestão de acessos (requer senha admin) |
| `/marketing` | `Marketing` | Visão de Marketing |
| `/sales` | `Sales` | ⏳ Sales Workspace (migração em andamento) |
| `/executivo` | `Executivo` | ⏳ Visão Executiva (migração planejada) |
| `/automacao` | `Automacao` | ⏳ Central de Automações (migração planejada) |
| `*` | `NotFound` | 404 |

---

## Autenticação

### Admin (`/admin`)
- Senha via header `X-Admin-Secret` validada contra a API
- Sessão em `sessionStorage['xsales_admin_auth']`

### Sales Workspace (`/sales`)
- Google Identity Services (Client ID configurável)
- Fallback: email corporativo → lookup em `GET /api/xsales/users/by-email`
- `currentUser` em `sessionStorage['xsales_current_user']`
- **Inspect mode:** usuários `admin` e `exec` podem visualizar o painel de qualquer vendedor

---

## Design System

### Tokens CSS (`:root` em `global.css`)

```css
--bg-deep, --bg-surface         /* fundos */
--glass-border, --glass-highlight /* bordas de vidro */
--text-main, --text-muted, --text-white, --text-gray
--x-cyan, --x-cyan-glow         /* azul principal */
--x-green, --x-green-glow       /* verde / Sales */
--x-pink, --x-pink-glow         /* rosa / Automation */
--x-orange, --x-blue            /* laranja, índigo */
```

### Tema claro
Ativado com `data-theme="light"` no `<html>`, gerenciado pelo hook `useTheme`.  
Persiste em `localStorage['xsales_theme']`.

### Classes de componentes

| Prefix | Uso |
|---|---|
| `.hub-card` | Cards da Hub page (com efeito 3D + flashlight) |
| `.adm-*` | Componentes da página Admin |
| `.hub-navbar` | Navbar compartilhada |
| `.glass` | Superfície de vidro genérica |
| `.fade-up`, `.delay-*` | Animações de entrada |

---

## API Reference

**Base URL:** `https://sales-intelligence-api-j7loux7yta-uc.a.run.app`

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/xsales/users` | GET | `X-Admin-Secret` | Lista todos os usuários |
| `/api/xsales/users` | POST | `X-Admin-Secret` | Cria usuário |
| `/api/xsales/users/{id}` | PUT | `X-Admin-Secret` | Atualiza usuário |
| `/api/xsales/users/{id}` | DELETE | `X-Admin-Secret` | Remove usuário |
| `/api/xsales/users/by-email` | GET | — | Busca usuário por email (auth Sales) |
| `/api/weekly-agenda` | GET | — | Dados do pipeline por `?seller=<canonical>` |

---

## Build & Deploy

```bash
# Desenvolvimento
cd src-x-sales
npm run dev

# Build de produção
npm run build
# → emite para /public-x-sales/

# Deploy Firebase
cd ..
firebase deploy --only hosting:xsales
```

---

## Migração de páginas legadas

| Página legada | Linhas | Status | React |
|---|---|---|---|
| `public-x-sales/admin.html` | 741 | ✅ Migrado + removido | `src/pages/Admin.tsx` |
| `public-x-sales/vendedores.html` | 889 | ✅ Migrado + removido | `src/pages/Sales.tsx` |
| `public-x-sales/executivo.html` | 157 | ✅ Migrado + removido | `src/pages/Executivo.tsx` |
| `public-x-sales/automacao.html` | 199 | ✅ Migrado + removido | `src/pages/Automacao.tsx` |

### `vendedores.html` → `Sales.tsx` — Mapeamento de componentes

```
Gate            Tela de login (Google SSO + email fallback)
Sidebar         Navegação lateral com avatar do usuário
Topbar          Busca global + inspect mode select + tema
InspectBanner   Banner de modo inspeção (admin/exec only)

// Tabs (React Router ou estado local)
TabDashboard    KPIs + Fechamentos iminentes + War Room (Intelligence)
TabPipeline     Tabela expansível com filtros de etapa + busca
TabActivities   Timeline de atividades CRM
TabCalculator   Simulador de comissão (checkboxes + range slider)
```

**Estado principal:**
```typescript
currentUser:   XSalesUser | null    // usuário autenticado
viewingSeller: XSalesUser | null    // null = própria conta (inspect mode)
allDeals:      Deal[]               // dados do /api/weekly-agenda
agendaData:    AgendaResponse | null
activeTab:     'dashboard' | 'pipeline' | 'activities' | 'calculator'
stageFilter:   string               // filtro de etapa do pipeline
pipelineSearch: string
```

---

## Convenções

- **Componentes sub-página:** definidos inline no arquivo da página (não criar arquivos separados para sub-componentes usados em um só lugar)
- **CSS:** preferir classes `adm-*` / `hub-*` no `global.css` sobre Tailwind inline para padrões complexos
- **API calls:** sempre via `src/lib/api.ts`, nunca `fetch` direto nos componentes
- **Tipos:** `XSalesUser`, `UserRole`, `AuditEntry` em `src/lib/types.ts`; tipos específicos de página inline no próprio arquivo
