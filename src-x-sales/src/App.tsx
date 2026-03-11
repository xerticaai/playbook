import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Hub from './pages/Hub'
import Marketing from './pages/Marketing'
import Admin from './pages/Admin'
import Sales from './pages/Sales'
import Executivo from './pages/Executivo'
import Automacao from './pages/Automacao'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Canonical routes */}
        <Route path="/" element={<Hub />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/executivo" element={<Executivo />} />
        <Route path="/automacao" element={<Automacao />} />

        {/* Legacy aliases (same domain only) */}
        <Route path="/vendedores" element={<Navigate to="/sales" replace />} />
        <Route path="/seller" element={<Navigate to="/sales" replace />} />
        <Route path="/dashboard" element={<Navigate to="/executivo" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
