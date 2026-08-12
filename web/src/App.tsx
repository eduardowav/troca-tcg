import { Navigate, Route, Routes } from 'react-router-dom'

import { LayoutApp } from '@/components/Navegacao'
import { ExigePerfil, ExigeSessao } from '@/components/RotaProtegida'
import { usePerfil } from '@/hooks/usePerfil'
import CompletarCadastro from '@/routes/CompletarCadastro'
import Buscar from '@/routes/Buscar'
import ColarLista from '@/routes/ColarLista'
import CartaDetalhe from '@/routes/Carta'
import Configuracoes from '@/routes/Configuracoes'
import EditarPerfil from '@/routes/EditarPerfil'
import { Mensagens } from '@/routes/EmBreve'
import Entrar from '@/routes/Entrar'
import Home from '@/routes/Home'
import Instalar from '@/routes/Instalar'
import LabTroca from '@/routes/LabTroca'
import MatchDetalhe from '@/routes/Match'
import Matches from '@/routes/Matches'
import MinhasCartas from '@/routes/MinhasCartas'
import Notificacoes from '@/routes/Notificacoes'
import Onboarding from '@/routes/Onboarding'
import Acervo from '@/routes/Acervo'
import PerfilTela from '@/routes/Perfil'
import PerfilPublicoTela from '@/routes/PerfilPublico'
import Pronto from '@/routes/Pronto'
import PropostaDetalhe from '@/routes/Proposta'
import Propostas from '@/routes/Propostas'
import Termos from '@/routes/Termos'
import Vitrine from '@/routes/Vitrine'
import VitrineCarta from '@/routes/VitrineCarta'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/termos" element={<Termos />} />
      {/* Pública, e fora do `LayoutApp`: é o link para colar no grupo, e quem
          chega por ele ainda não tem conta. Quem já instalou e cai aqui de
          dentro do app vê a tela de confirmação, não o passo a passo. */}
      <Route path="/instalar" element={<Instalar />} />

      {/* Laboratório da animação de troca. Só existe em desenvolvimento: a
          condição é avaliada no build, então em produção a rota não entra na
          tabela e o componente sai do pacote pelo tree-shaking. É bancada de
          decisão, não funcionalidade — quando a animação for escolhida, ela vai
          para o detalhe do match e esta rota morre. */}
      {import.meta.env.DEV && (
        <Route path="/lab/troca" element={<LabTroca />} />
      )}

      <Route element={<ExigeSessao />}>
        <Route path="/completar-cadastro" element={<CompletarCadastro />} />

        <Route element={<ExigePerfil />}>
          <Route path="/app" element={<Inicio />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pronto" element={<Pronto />} />
          <Route element={<LayoutApp />}>
            <Route path="/minhas-cartas" element={<MinhasCartas />} />
            {/* Cadastro em massa (Fase B da seção 16). Rota filha de
                "minhas-cartas" porque é de lá que se entra e para lá que se
                volta — colar lista é uma forma de cadastrar, não um lugar. */}
            <Route path="/minhas-cartas/colar" element={<ColarLista />} />
            <Route path="/buscar" element={<Buscar />} />
            <Route path="/carta/:id" element={<CartaDetalhe />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/matches/:id" element={<MatchDetalhe />} />
            {/* A vitrine e as propostas: o caminho de quem ainda não tem match.
                Cada passo parte de algo concreto — carta, depois quem a tem,
                depois o acervo dessa pessoa. Não há rota que liste gente. */}
            <Route path="/vitrine" element={<Vitrine />} />
            <Route path="/vitrine/carta/:cardId" element={<VitrineCarta />} />
            <Route path="/vitrine/acervo/:username" element={<Acervo />} />
            <Route path="/propostas" element={<Propostas />} />
            <Route path="/propostas/:id" element={<PropostaDetalhe />} />
            {/* Mensagens existe no Figma e ainda não no produto. A tela é
                honesta sobre isso e diz por onde a coisa acontece hoje. */}
            <Route path="/mensagens" element={<Mensagens />} />
            <Route path="/notificacoes" element={<Notificacoes />} />
            <Route path="/perfil" element={<PerfilTela />} />
            {/* Editar e configurar saem do perfil e viram tela própria: a
                aba mostra quem você é; mexer é outra tarefa. */}
            <Route path="/perfil/editar" element={<EditarPerfil />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            {/* Depois de "/perfil" e com prefixo próprio: um "/:username" solto
                na raiz engoliria toda rota nova que viesse depois dele. */}
            <Route path="/u/:username" element={<PerfilPublicoTela />} />
          </Route>
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
