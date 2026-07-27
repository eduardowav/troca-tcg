import { Navigate, Route, Routes } from 'react-router-dom'

import Onboarding from '@/routes/Onboarding'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      {/* Próximas fases: /entrar, /minhas-cartas, /matches, /perfil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
