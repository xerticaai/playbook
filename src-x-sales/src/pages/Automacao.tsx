import Background from '../components/Background'
import { useTheme } from '../hooks/useTheme'

const LOGO = 'https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png'

const jobs = [
  { name: 'Alerta de Oportunidades Estagnadas', type: 'Apps Script + BigQuery', freq: 'Semanal — Seg 8h', status: 'ativo',    owner: 'Operações' },
  { name: 'Sincronização BigQuery ↔ Sheets',    type: 'Apps Script',            freq: 'Diário — 7h',    status: 'ativo',    owner: 'Operações' },
  { name: 'Auditoria de Base de Análise',        type: 'Apps Script',            freq: 'Semanal — Sex 18h', status: 'espera', owner: 'Operações' },
]

const integrations = [
  { name: 'Pipeline → BigQuery',        src: 'CRM / Sheets', dst: 'sales_intelligence.pipeline_master', method: 'Apps Script',              status: 'ativo' },
  { name: 'Alertas de Estagnação → E-mail', src: 'BigQuery',    dst: 'Gmail',                              method: 'Apps Script + Cloud Run',  status: 'ativo' },
  { name: 'Dashboard → Cloud Run API',  src: 'BigQuery',     dst: 'Frontend x-gtm.web.app',             method: 'REST (Cloud Run)',          status: 'ativo' },
]

export default function Automacao() {
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
              Central de Automações
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
            <p className="font-poppins text-[9px] font-bold uppercase tracking-[.2em] text-xCyan mb-1">X-Sales Hub</p>
            <h1 className="font-poppins text-3xl font-bold text-white mb-2">Central de Automações</h1>
            <p className="font-roboto text-sm text-gray-400 font-light">
              Monitoramento de jobs, log de execuções, alertas de falha e gestão de integrações com
              Apps Script, BigQuery e notificações automáticas.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 fade-up delay-100">
          {[
            { label: 'Jobs Ativos',       value: String(jobs.filter(j => j.status === 'ativo').length), color: 'text-xGreen' },
            { label: 'Execuções Hoje',    value: '—' },
            { label: 'Taxa de Sucesso',   value: '—',  color: 'text-xGreen' },
            { label: 'Falhas Pendentes',  value: '0',  color: 'text-yellow-400' },
          ].map((k, i) => (
            <div key={i} className="adm-card p-5">
              <p className="adm-kpi-label">{k.label}</p>
              <p className={`adm-kpi-value ${k.color ?? ''}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Jobs table */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Jobs Cadastrados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead><tr><th>Nome do Job</th><th>Tipo</th><th>Frequência</th><th>Última Execução</th><th>Status</th><th>Responsável</th></tr></thead>
              <tbody>
                {jobs.map((j, i) => (
                  <tr key={i}>
                    <td className="font-semibold text-white text-[13px]">{j.name}</td>
                    <td className="text-gray-400 text-xs">{j.type}</td>
                    <td className="text-gray-400 text-xs">{j.freq}</td>
                    <td className="text-gray-500 text-xs">—</td>
                    <td>
                      <span className={`adm-badge ${j.status === 'ativo' ? 'adm-b-green' : 'adm-b-grey'}`}>
                        {j.status === 'ativo' ? 'Ativo' : 'Aguardando'}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs">{j.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Log table */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Log de Execuções</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead><tr><th>Data/Hora</th><th>Job</th><th>Duração</th><th>Registros</th><th>Status</th><th>Detalhe</th></tr></thead>
              <tbody>
                <tr><td colSpan={6} className="text-center py-10 text-gray-600 font-roboto text-xs">
                  Nenhum log disponível via API. Consulte o Apps Script Console para histórico detalhado.
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Alertas Pendentes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead><tr><th>Severidade</th><th>Job</th><th>Mensagem</th><th>Detectado em</th><th>Ação</th></tr></thead>
              <tbody>
                <tr><td colSpan={5} className="text-center py-10 text-gray-600 font-roboto text-xs">
                  Nenhum alerta ativo no momento.
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Integrações */}
        <div className="adm-card !p-0 !rounded-2xl mb-6 fade-up delay-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.06] bg-black/20">
            <h2 className="font-poppins text-sm font-semibold text-white">Integrações Configuradas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead><tr><th>Integração</th><th>Origem</th><th>Destino</th><th>Método</th><th>Status</th></tr></thead>
              <tbody>
                {integrations.map((it, i) => (
                  <tr key={i}>
                    <td className="font-semibold text-white text-[13px]">{it.name}</td>
                    <td className="text-gray-400 text-xs">{it.src}</td>
                    <td className="font-mono text-[11px] text-gray-400">{it.dst}</td>
                    <td className="text-gray-400 text-xs">{it.method}</td>
                    <td><span className="adm-badge adm-b-green">Operacional</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </>
  )
}
