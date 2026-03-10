import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
        <Route path="/" element={<Hub />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/executivo" element={<Executivo />} />
        <Route path="/automacao" element={<Automacao />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
