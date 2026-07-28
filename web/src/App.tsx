import { Navigate, Route, Routes } from 'react-router-dom'

import { ExigePerfil, ExigeSessao } from '@/components/RotaProtegida'
import { usePerfil } from '@/hooks/usePerfil'
import CompletarCadastro from '@/routes/CompletarCadastro'
import Entrar from '@/routes/Entrar'
import Onboarding from '@/routes/Onboarding'
import Pronto from '@/routes/Pronto'
import Termos from '@/routes/Termos'

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/termos" element={<Termos />} />

      <Route element={<ExigeSessao />}>
        <Route path="/completar-cadastro" element={<CompletarCadastro />} />

        <Route element={<ExigePerfil />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pronto" element={<Pronto />} />
          {/* Próximas fases: /minhas-cartas, /matches, /perfil */}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Quem ainda não montou as listas cai no onboarding; os demais, no que já existe. */
function Inicio() {
  const { data: perfil } = usePerfil()
  return <Navigate to={perfil?.onboarding_ok ? '/pronto' : '/onboarding'} replace />
}
