import { Link } from 'react-router-dom'
import Background from '../components/Background'

const LOGO_X = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png'

/* ---------- KPI card ---------- */
interface KpiProps {
  label:  string
  value:  string
  delta?: string
  good?:  boolean
  icon:   string
  color:  string
}

function KpiCard({ label, value, delta, good, icon, color }: KpiProps) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3" style={{ borderRadius: '16px' }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily:'var(--font-body)', fontSize:'10px', textTransform:'uppercase', letterSpacing:'1.5px', color:'var(--text-muted)', fontWeight:700 }}>
          {label}
        </span>
        <div style={{
          width:'32px', height:'32px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
          background: `${color}18`, border:`1px solid ${color}40`,
        }}>
          <i className={`ph ${icon}`} style={{ color, fontSize:'16px' }} />
        </div>
      </div>
      <div>
        <p style={{ fontFamily:'var(--font-heading)', fontSize:'26px', fontWeight:700, color:'var(--text-white)', margin:0, letterSpacing:'-0.5px' }}>
          {value}
        </p>
        {delta && (
          <p style={{ margin:'4px 0 0', fontSize:'11px', color: good ? 'var(--x-green)' : '#FF6B6B', fontFamily:'var(--font-body)', fontWeight:500 }}>
            {good ? '▲' : '▼'} {delta}
          </p>
        )}
      </div>
    </div>
  )
}

/* ---------- Funnel bar ---------- */
function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontFamily:'var(--font-body)', fontSize:'11px', color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
        <span style={{ fontFamily:'var(--font-heading)', fontSize:'12px', color:'var(--text-white)', fontWeight:600 }}>{count.toLocaleString('pt-BR')} <span style={{ color:'var(--text-muted)' }}>({pct}%)</span></span>
      </div>
      <div style={{ height:'6px', borderRadius:'4px', background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: color, borderRadius:'4px', transition:'width 1s ease' }} />
      </div>
    </div>
  )
}

/* ---------- Channel row ---------- */
function ChannelRow({ channel, leads, conv, color }: { channel: string; leads: number; conv: string; color: string }) {
  return (
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
      <td style={{ padding:'10px 12px', fontFamily:'var(--font-body)', fontSize:'12px', color:'var(--text-main)' }}>
        <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background:color, marginRight:'8px', verticalAlign:'middle' }} />
        {channel}
      </td>
      <td style={{ padding:'10px 12px', fontFamily:'var(--font-heading)', fontSize:'12px', color:'var(--text-white)', textAlign:'right', fontWeight:600 }}>
        {leads.toLocaleString('pt-BR')}
      </td>
      <td style={{ padding:'10px 12px', fontFamily:'var(--font-body)', fontSize:'12px', color:'var(--x-green)', textAlign:'right', fontWeight:500 }}>
        {conv}
      </td>
    </tr>
  )
}

/* ---------- Marketing page ---------- */
export default function Marketing() {
  const kpis: KpiProps[] = [
    { label:'Leads (mês)', value:'1.248',  delta:'12% vs mês anterior', good:true,  icon:'ph-users',            color:'#00BEFF' },
    { label:'MQLs',        value:'312',    delta:'8% vs mês anterior',  good:true,  icon:'ph-funnel',           color:'#FFB340' },
    { label:'SQLs',        value:'94',     delta:'3% vs mês anterior',  good:false, icon:'ph-currency-dollar',  color:'#C0FF7D' },
    { label:'Pipeline gerado', value:'R$ 2,1M', delta:'5% vs mês anterior', good:true, icon:'ph-chart-line-up', color:'#FF89FF' },
  ]

  const funnelData = [
    { label:'Visitantes únicos', count:18400, total:18400, color:'#00BEFF' },
    { label:'Leads capturados',  count:1248,  total:18400, color:'#5CD5FF' },
    { label:'MQLs qualificados', count:312,   total:18400, color:'#FFB340' },
    { label:'SQLs aceitos',      count:94,    total:18400, color:'#C0FF7D' },
    { label:'Oportunidades won', count:21,    total:18400, color:'#FF89FF' },
  ]

  const channels = [
    { channel:'Google Ads',     leads:410, conv:'3.8%', color:'#4285F4' },
    { channel:'LinkedIn Ads',   leads:298, conv:'2.9%', color:'#0A66C2' },
    { channel:'Orgânico / SEO', leads:244, conv:'5.1%', color:'#C0FF7D' },
    { channel:'Indicação',      leads:186, conv:'9.2%', color:'#FFB340' },
    { channel:'Eventos',        leads:110, conv:'7.4%', color:'#FF89FF' },
  ]

  return (
    <>
      <Background />

      {/* Navbar */}
      <nav className="hub-navbar py-3 px-6 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 group" style={{ textDecoration:'none' }}>
              <i className="ph ph-arrow-left text-white/50 group-hover:text-xOrange transition-colors" style={{ fontSize:'16px' }} />
              <img src={LOGO_X} alt="X-Sales" className="h-6 w-6 object-contain" style={{ filter:'drop-shadow(0 0 8px rgba(255,179,64,0.5))' }} />
            </Link>
            <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="font-poppins text-[11px] font-semibold text-white/30 tracking-[0.2em] uppercase">X-Sales</span>
              <i className="ph ph-caret-right text-white/20" style={{ fontSize:'10px' }} />
              <span className="font-poppins text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color:'#FFB340' }}>Visão Marketing</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-poppins font-bold uppercase tracking-[0.2em]"
              style={{ background:'rgba(255,179,64,0.1)', border:'1px solid rgba(255,179,64,0.4)', color:'#FFB340', boxShadow:'0 0 12px rgba(255,179,64,0.3)' }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background:'#FFB340' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background:'#FFB340' }} />
              </span>
              Marketing / Growth
            </span>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-grow px-4 sm:px-6 lg:px-8 py-8 relative z-10" style={{ maxWidth:'1400px', margin:'0 auto', width:'100%' }}>

        {/* Header */}
        <div className="mb-8 fade-up">
          <h1 className="font-poppins text-3xl font-bold text-white mb-1" style={{ letterSpacing:'-0.5px' }}>
            Visão <span style={{ color:'#FFB340' }}>Marketing</span>
          </h1>
          <p style={{ fontFamily:'var(--font-body)', color:'var(--text-muted)', fontSize:'13px', margin:0 }}>
            Geração de demanda · Pipeline contribution · Campanhas ativas — Q1 2026
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 fade-up delay-100">
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Middle row: funnel + channels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 fade-up delay-200">

          {/* Funnel */}
          <div className="glass rounded-2xl p-6" style={{ borderRadius:'16px' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'14px', fontWeight:700, color:'var(--text-white)', margin:0 }}>
                Funil de Conversão
              </h2>
              <span style={{ fontFamily:'var(--font-body)', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px' }}>
                Março 2026
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {funnelData.map(f => <FunnelBar key={f.label} {...f} />)}
            </div>
            <p style={{ fontFamily:'var(--font-body)', fontSize:'11px', color:'var(--text-muted)', marginTop:'18px', textAlign:'center' }}>
              Taxa visitante → won: <strong style={{ color:'#C0FF7D' }}>0,11%</strong>
            </p>
          </div>

          {/* Channels */}
          <div className="glass rounded-2xl p-6" style={{ borderRadius:'16px' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'14px', fontWeight:700, color:'var(--text-white)', margin:0 }}>
                Leads por Canal
              </h2>
              <span style={{ fontFamily:'var(--font-body)', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px' }}>
                Este mês
              </span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ textAlign:'left',  padding:'6px 12px', fontFamily:'var(--font-body)', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600 }}>Canal</th>
                  <th style={{ textAlign:'right', padding:'6px 12px', fontFamily:'var(--font-body)', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600 }}>Leads</th>
                  <th style={{ textAlign:'right', padding:'6px 12px', fontFamily:'var(--font-body)', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600 }}>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {channels.map(c => <ChannelRow key={c.channel} {...c} />)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom row: placeholder charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 fade-up delay-300">

          {/* MQL trend */}
          <div className="glass rounded-2xl p-6 lg:col-span-2" style={{ borderRadius:'16px' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'14px', fontWeight:700, color:'var(--text-white)', margin:0 }}>
                MQL → SQL por Mês
              </h2>
              <span className="text-[10px] font-semibold font-poppins uppercase tracking-widest px-2 py-1 rounded-full"
                style={{ background:'rgba(255,179,64,0.1)', border:'1px solid rgba(255,179,64,0.3)', color:'#FFB340' }}>
                Em breve
              </span>
            </div>
            <div style={{ height:'160px', display:'flex', alignItems:'center', justifyContent:'center', 
              border:'1px dashed rgba(255,255,255,0.08)', borderRadius:'12px', flexDirection:'column', gap:'8px' }}>
              <i className="ph ph-chart-bar" style={{ fontSize:'32px', color:'rgba(255,179,64,0.3)' }} />
              <p style={{ fontFamily:'var(--font-body)', fontSize:'12px', color:'var(--text-muted)', margin:0 }}>
                Conectar ao BigQuery para exibir tendência de qualificação
              </p>
            </div>
          </div>

          {/* Pipeline attribution */}
          <div className="glass rounded-2xl p-6" style={{ borderRadius:'16px' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'14px', fontWeight:700, color:'var(--text-white)', margin:0 }}>
                Pipeline Atribuído
              </h2>
              <span className="text-[10px] font-semibold font-poppins uppercase tracking-widest px-2 py-1 rounded-full"
                style={{ background:'rgba(255,179,64,0.1)', border:'1px solid rgba(255,179,64,0.3)', color:'#FFB340' }}>
                Em breve
              </span>
            </div>
            <div style={{ height:'160px', display:'flex', alignItems:'center', justifyContent:'center', 
              border:'1px dashed rgba(255,255,255,0.08)', borderRadius:'12px', flexDirection:'column', gap:'8px' }}>
              <i className="ph ph-chart-donut" style={{ fontSize:'32px', color:'rgba(255,137,255,0.3)' }} />
              <p style={{ fontFamily:'var(--font-body)', fontSize:'12px', color:'var(--text-muted)', margin:0, textAlign:'center', padding:'0 8px' }}>
                Atribuição UTM vs CRM
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 py-5 border-t border-white/5 relative z-10"
        style={{ background:'rgba(3,7,13,0.4)', backdropFilter:'blur(20px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 flex justify-between items-center">
          <span className="font-roboto text-xs text-white/30 tracking-[0.15em] uppercase font-light">
            &copy; {new Date().getFullYear()} Xertica.ai · Visão Marketing
          </span>
          <Link to="/" className="font-poppins text-[10px] font-semibold text-white/30 tracking-[0.2em] uppercase hover:text-xOrange transition-colors" style={{ textDecoration:'none' }}>
            ← Hub
          </Link>
        </div>
      </footer>
    </>
  )
}
