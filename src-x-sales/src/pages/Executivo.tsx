import Background from '../components/Background'
import { useTheme } from '../hooks/useTheme'

const LOGO = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png'

const segmentoRows = [
  { seg: 'Enterprise',  deals: '—', totalBRL: '—', avgDays: '—', winRate: '—' },
  { seg: 'Mid-Market',  deals: '—', totalBRL: '—', avgDays: '—', winRate: '—' },
  { seg: 'SMB',         deals: '—', totalBRL: '—', avgDays: '—', winRate: '—' },
]

export default function Executivo() {
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <>
      <Background />
      <nav className="hub-navbar py-3 px-6 sm:px-8 fade-up">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => { window.location.href = '/' }}>
            <img src={LOGO} className="h-6 w-6 object-contain"
              style={{ filter: 'drop-shadow(0 0 8px rgba(0,190,255,.4))' }} alt="X" />
            <div className="h-5 w-px bg-white/10 mx-1" />
            <span className="font-poppins text-xs font-semibold text-xCyan tracking-[.2em] uppercase">
              Visão Executiva
            </span>
          </div>
          <button onClick={toggleTheme} title="Alternar tema"
            className="h-9 w-9 rounded-full border border-white/20 flex items-center justify-center text-white/70 hover:border-xCyan transition-all"
            style={{ background: 'linear-gradient(135deg,rgba(255,255,255,.1),transparent)' }}>
            <i className={`ph ${theme === 'dark' ? 'ph-moon' : 'ph-sun'} text-base`} />
          </button>
        </div>
      </nav>

      <main className="flex-grow px-4 sm:px-6 lg:px-8 py-10 relative z-10 max-w-7xl mx-auto w-full">

        {/* Hero */}
        <div className="flex items-start gap-5 mb-10 fade-up">
          <div className="flex-1">
            <p className="font-poppins text-[9px] font-bold uppercase tracking-[.2em] text-xCyan mb-1">Acesso Restrito</p>
            <h1 className="font-poppins text-3xl font-bold text-white mb-2">Visão Executiva de Pipeline</h1>
            <p className="font-roboto text-sm text-gray-400 font-light">
              Consolidação de pipeline por segmento, oportunidades de destaque, negócios em risco e
              indicadores de performance de equipe para lideranças.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 fade-up delay-100">
          {[
            { label: 'Pipeline Total',        value: '—',   sub: 'Consolidado BRL' },
            { label: 'Forecast Ponderado',    value: '—',   sub: 'Probabilidade × Valor' },
            { label: 'Win Rate Geral',        value: '—',   sub: 'Fechados / Iniciados' },
            { label: 'Negócios em Risco',     value: '—',   sub: 'Score ≥ 60 ou estagnados' },
          ].map((k, i) => (
            <div key={i} className="adm-card p-5">
              <p className="adm-kpi-label">{k.label}</p>
              <p className="adm-kpi-value">{k.value}</p>
              {k.sub && <p className="font-roboto text-[10px] text-gray-600 mt-1">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Top Oportunidades */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Top Oportunidades Abertas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Conta</th>
                  <th>Vendedor</th>
                  <th>Valor (BRL)</th>
                  <th>Etapa</th>
                  <th>Previsão de Fechamento</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={6} className="text-center py-10 text-gray-600 font-roboto text-xs">
                  Dados a serem carregados via API. Utilize a página de Vendas para visualização por vendedor.
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance por Segmento */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Performance por Segmento</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Segmento</th>
                  <th>Negócios Ativos</th>
                  <th>Pipeline Total</th>
                  <th>Ciclo Médio (dias)</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {segmentoRows.map((s, i) => (
                  <tr key={i}>
                    <td className="font-semibold text-white text-[13px]">{s.seg}</td>
                    <td className="text-gray-400 text-xs">{s.deals}</td>
                    <td className="text-gray-400 text-xs">{s.totalBRL}</td>
                    <td className="text-gray-400 text-xs">{s.avgDays}</td>
                    <td className="text-gray-400 text-xs">{s.winRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Negócios Estagnados */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Negócios Estagnados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Vendedor</th>
                  <th>Dias sem Atualização</th>
                  <th>Valor (BRL)</th>
                  <th>Etapa</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} className="text-center py-10 text-gray-600 font-roboto text-xs">
                  Dados a serem carregados via API.
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </>
  )
}
