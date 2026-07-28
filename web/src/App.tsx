import { Navigate, Route, Routes } from 'react-router-dom'

import { ExigePerfil, ExigeSessao } from '@/components/RotaProtegida'
import { usePerfil } from '@/hooks/usePerfil'
import CompletarCadastro from '@/routes/CompletarCadastro'
import Entrar from '@/routes/Entrar'
import Home from '@/routes/Home'
import MatchDetalhe from '@/routes/Match'
import Matches from '@/routes/Matches'
import MinhasCartas from '@/routes/MinhasCartas'
import Onboarding from '@/routes/Onboarding'
import Pronto from '@/routes/Pronto'
import Termos from '@/routes/Termos'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/termos" element={<Termos />} />

      <Route element={<ExigeSessao />}>
        <Route path="/completar-cadastro" element={<CompletarCadastro />} />

        <Route element={<ExigePerfil />}>
          <Route path="/app" element={<Inicio />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pronto" element={<Pronto />} />
          <Route path="/minhas-cartas" element={<MinhasCartas />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetalhe />} />
          {/* Próximas fases: /perfil */}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/**
 * Entrada de quem já está logado: quem ainda não montou as listas cai no
 * onboarding, os demais vão direto para as trocas — que é o motivo do app
 * existir.
 */
function Inicio() {
  const { data: perfil } = usePerfil()
  return <Navigate to={perfil?.onboarding_ok ? '/matches' : '/onboarding'} replace />
}
