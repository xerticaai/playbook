import { Link } from 'react-router-dom'
import Background from '../components/Background'

export default function NotFound() {
  return (
    <>
      <Background />
      <div className="flex-grow flex flex-col items-center justify-center text-center px-4 relative z-10">
        <p style={{ fontFamily:'var(--font-heading)', fontSize:'120px', fontWeight:700, color:'rgba(255,255,255,0.04)', margin:0, lineHeight:1 }}>404</p>
        <h1 className="font-poppins text-2xl font-bold text-white -mt-8 mb-3">Página não encontrada</h1>
        <p style={{ fontFamily:'var(--font-body)', color:'var(--text-muted)', marginBottom:'24px' }}>
          Esta rota não existe no X-Sales.
        </p>
        <Link
          to="/"
          className="font-poppins text-xs font-bold uppercase tracking-widest px-5 py-3 rounded-full transition-all"
          style={{ background:'rgba(0,190,255,0.1)', border:'1px solid rgba(0,190,255,0.4)', color:'#00BEFF', textDecoration:'none' }}
        >
          ← Voltar ao Hub
        </Link>
      </div>
    </>
  )
}
