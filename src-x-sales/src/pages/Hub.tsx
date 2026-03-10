import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Background from '../components/Background'

/* ---------- Types ---------- */
type GlowColor = 'cyan' | 'green' | 'pink' | 'blue' | 'purple'

interface CardData {
  glow:    GlowColor
  label:   string
  icon:    string
  title:   string
  desc:    string
  url:     string         // full URL or path
  react?:  boolean        // true = use React Router
  external?: boolean      // true = window.open
}

/* ---------- Logos ---------- */
const LOGOS = {
  cyan:   'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png',
  green:  'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/X_symbol_variation8_Green_white.png',
  pink:   'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation6-Pink_white.png',
  blue:   'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png',
  purple: 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation6-Pink_white.png',
}

const THEME_COLORS: Record<GlowColor, string> = {
  cyan:   '#00BEFF',
  green:  '#C0FF7D',
  pink:   '#FF89FF',
  blue:   '#3B82F6',
  purple: '#A85CA9',
}

const CARDS: CardData[] = [
  {
    glow:    'cyan',
    label:   'Diretoria / C-Level',
    icon:    LOGOS.cyan,
    title:   'Visão Executiva',
    desc:    'Acesso consolidado ao painel corporativo. Visualize KPIs de receita, pipeline (Won/Lost) e performance geral da equipe.',
    url:     '/executivo',
    react:   true,
  },
  {
    glow:    'green',
    label:   'Vendedores / Sales',
    icon:    LOGOS.green,
    title:   'Visão Sales',
    desc:    'Espaço restrito para gestão de contas. Acompanhe suas oportunidades, faturamento e projeção de comissões.',
    url:     '/sales',
    react:   true,
  },
  {
    glow:    'pink',
    label:   'Data / Operações',
    icon:    LOGOS.pink,
    title:   'Automation Hub',
    desc:    'Central de rotinas automatizadas. Monitore logs de sincronização e alertas de negócios estagnados via Apps Script.',
    url:     '/automacao',
    react:   true,
  },
  {
    glow:    'blue',
    label:   'Marketing / Growth',
    icon:    LOGOS.blue,
    title:   'Visão Marketing',
    desc:    'Funil de geração de demanda, campanhas ativas, conversão MQL→SQL e contribuição do marketing ao pipeline.',
    url:     '/marketing',
    react:   true,
  },
  {
    glow:     'purple',
    label:    'Jurídico / Licitações',
    icon:     LOGOS.purple,
    title:    'Visão Contratos',
    desc:     'Gestão de documentos e contratos para licitações. Controle de vigências, status de assinaturas e repositório centralizado.',
    url:      'https://www.appsheet.com/start/75369b22-d30d-424b-95f4-198423a3c9a6?platform=desktop#appName=XerticaControlededocumentosparalicita%C3%A7%C3%B5es-314139594&vss=H4sIAAAAAAAAA6WOwQrCMBBE_2XO-YJcxYOIXhQvxsPabCDYJqVJ1RLy7yZS6bl43Le8mUl4Wn6dIjUPyGtarj1PkEgK56lnBamw8S4OvlUQCkfqFkhBISPfxM-OHCDTGln-0yxgNbtojeWhJlWvJMxWeVdnBhSQBbox0r3l79Ri5FyY8c0YWF_KjNX1Yee2756cPnhdAg21gfMH_fj8klsBAAA%3D&view=Contas',
    external: true,
  },
]

/* ---------- HubCard ---------- */
function HubCard({ card, onNavigate }: { card: CardData; onNavigate: (c: CardData) => void }) {
  const cardRef = useRef<HTMLButtonElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    el.style.setProperty('--mouse-x', x + 'px')
    el.style.setProperty('--mouse-y', y + 'px')
    const rotX = ((y - rect.height / 2) / (rect.height / 2)) * -5
    const rotY = ((x - rect.width  / 2) / (rect.width  / 2)) *  5
    el.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02,1.02,1.02)`
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (cardRef.current)
      cardRef.current.style.transform = 'perspective(1200px) rotateX(0) rotateY(0) scale3d(1,1,1)'
  }, [])

  return (
    <div className="hub-card-wrap" style={{ perspective: '1200px' }}>
      <button
        ref={cardRef}
        className={`hub-card glow-${card.glow}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => onNavigate(card)}
      >
        <div className="card-inner">
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px' }}>
            <div className="card-icon-wrap">
              <img src={card.icon} alt="" />
            </div>
            <span style={{ fontFamily:'var(--font-body)', fontSize:'10px', textTransform:'uppercase', letterSpacing:'1.5px', color:'var(--text-muted)', fontWeight:700 }}>
              {card.label}
            </span>
          </div>
          <h3 className="card-value" style={{ fontFamily:'var(--font-heading)', fontSize:'21px', fontWeight:700, lineHeight:1.2, marginBottom:'8px', letterSpacing:'-0.5px', color:'var(--text-white)', transition:'color 0.3s, text-shadow 0.3s' }}>
            {card.title}
          </h3>
          <p style={{ fontFamily:'var(--font-body)', fontSize:'12px', color:'var(--text-gray)', lineHeight:1.55, flexGrow:1, fontWeight:300 }}>
            {card.desc}
          </p>
          <div className="action-arrow">
            <span>Acessar</span>
            <i className="ph ph-arrow-right" style={{ fontSize:'18px' }} />
          </div>
        </div>
      </button>
    </div>
  )
}

/* ---------- AuthOverlay ---------- */
interface OverlayState {
  active:  boolean
  title:   string
  color:   string
  logo:    string
}

function AuthOverlay({
  state,
  onCancel,
}: {
  state: OverlayState
  onCancel: () => void
}) {
  return (
    <div className={`auth-overlay${state.active ? ' active' : ''}`}>
      <div
        className="auth-card"
        style={{
          borderColor: state.active ? `${state.color}60` : undefined,
          boxShadow:   state.active ? `0 20px 80px ${state.color}30, inset 0 0 30px ${state.color}10` : undefined,
        }}
      >
        <div className="scanner-wrap">
          <img src={state.logo} alt="" />
          <div
            className="scanner-line"
            style={{
              background:  state.color,
              boxShadow:   `0 0 15px 4px ${state.color}80, 0 0 5px 1px #fff`,
            }}
          />
        </div>
        <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'19px', fontWeight:700, color:'#fff', margin:'0 0 6px', letterSpacing:'0.5px' }}>
          Verificação Segura
        </h2>
        <p style={{ fontFamily:'var(--font-body)', fontSize:'12px', color:'#8899b0', margin:'0 0 24px', fontWeight:300 }}>
          A estabelecer túnel encriptado e validar permissões para:
          <strong style={{ color: state.color, display:'block', marginTop:'6px', fontSize:'14px', fontFamily:'var(--font-heading)' }}>
            {state.title}
          </strong>
        </p>
        <button
          onClick={onCancel}
          style={{
            width:'100%', padding:'12px', borderRadius:'10px',
            border:`1px solid ${state.color}50`, background:`${state.color}10`,
            color: state.color, fontFamily:'var(--font-heading)',
            fontSize:'11px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase',
            cursor:'pointer', transition:'all 0.3s ease',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ---------- Hub page ---------- */
export default function Hub() {
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [overlay, setOverlay] = useState<OverlayState>({
    active: false,
    title:  '',
    color:  '#00BEFF',
    logo:   LOGOS.cyan,
  })

  const handleNavigate = useCallback((card: CardData) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    setOverlay({
      active: true,
      title:  card.title,
      color:  THEME_COLORS[card.glow],
      logo:   LOGOS[card.glow],
    })

    timerRef.current = setTimeout(() => {
      setOverlay(s => ({ ...s, active: false }))
      if (card.external) {
        window.open(card.url, '_blank')
      } else if (card.react) {
        navigate(card.url)
      } else {
        window.location.href = card.url
      }
    }, 2200)
  }, [navigate])

  const handleCancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOverlay(s => ({ ...s, active: false }))
  }, [])

  return (
    <>
      <Background />

      {/* Navbar */}
      <nav className="hub-navbar py-3 px-6 sm:px-8 fade-up">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={LOGOS.cyan}
              alt="Xertica X"
              className="h-6 w-6 object-contain"
              style={{ filter:'drop-shadow(0 0 8px rgba(0,190,255,0.4))' }}
            />
            <div className="hidden sm:block">
              <img
                src="https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/xertica.ai/Copy%20of%20Logo_XERTICA_white.png"
                alt="Xertica.ai"
                className="h-4 object-contain"
              />
            </div>
            <div className="h-6 w-px bg-white/10 mx-3 hidden sm:block" />
            <span className="font-poppins text-[11px] font-semibold text-white/50 tracking-[0.25em] uppercase hidden sm:block">
              Operations Portal
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="/admin"
              className="h-9 w-9 rounded-full border border-white/20 flex items-center justify-center text-white/80 transition-all hover:text-white hover:border-xCyan"
              style={{ background:'linear-gradient(135deg,rgba(255,255,255,0.1),transparent)', transition:'all 0.3s' }}
              title="Admin"
            >
              <i className="ph ph-shield-check text-base" />
            </a>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-grow flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-10 relative z-10">

        {/* Hero */}
        <div className="text-center max-w-2xl mb-12">
          <div className="flex justify-center mb-6 fade-up">
            <div className="xertica-hero-ring">
              <img src={LOGOS.cyan} alt="Xertica" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-xCyan/40 text-xCyan text-[9px] font-poppins font-bold uppercase tracking-[0.2em] mb-5 fade-up delay-100"
            style={{ background:'rgba(0,190,255,0.1)', boxShadow:'0 0 20px rgba(0,190,255,0.4)' }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-xCyan opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-xCyan" />
            </span>
            Acesso Seguro
          </div>

          <h1 className="font-poppins text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white fade-up delay-200 text-center">
            Selecione o{' '}
            <span className="relative whitespace-nowrap inline-block mt-2 sm:mt-0">
              <span className="absolute -inset-2 bg-gradient-to-r from-xCyan via-xPink to-xCyan opacity-30 blur-2xl animate-pulse" />
              <span className="relative text-transparent bg-clip-text bg-gradient-to-r from-[#80DFFF] via-[#FFB3FF] to-[#80DFFF]"
                style={{ filter:'drop-shadow(0 2px 10px rgba(255,255,255,0.2))' }}>
                Módulo de Visão
              </span>
            </span>
          </h1>
        </div>

        {/* Cards grid — 1 col → 2 → 3 → 5 */}
        <div className="hub-cards-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 max-w-[1600px] w-full">
          {CARDS.map(card => (
            <HubCard key={card.title} card={card} onNavigate={handleNavigate} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-5 border-t border-white/5 relative z-10 fade-up delay-300"
        style={{ background:'rgba(3,7,13,0.4)', backdropFilter:'blur(20px)' }}
      >
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3" style={{ opacity:0.6 }}>
            <img src={LOGOS.cyan} alt="" className="h-4 w-4 grayscale" />
            <span className="font-roboto text-xs text-white/50 tracking-[0.15em] uppercase font-light">
              &copy; {new Date().getFullYear()} Xertica.ai
            </span>
          </div>
          <div className="flex gap-8 font-poppins text-[10px] font-semibold text-white/50 tracking-[0.2em] uppercase">
            <a href="#" className="hover:text-xCyan transition-colors">Suporte TI</a>
            <a href="/admin" className="hover:text-xCyan transition-colors">Admin</a>
          </div>
        </div>
      </footer>

      <AuthOverlay state={overlay} onCancel={handleCancel} />
    </>
  )
}
