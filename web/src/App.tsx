import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LayoutApp } from '@/components/Navegacao'
import { ExigePerfil, ExigeSessao } from '@/components/RotaProtegida'
import { usePerfil } from '@/hooks/usePerfil'
import Entrar from '@/routes/Entrar'
import Home from '@/routes/Home'

/**
 * Divisão do pacote por rota — medido em 2026-08-18.
 *
 * O app inteiro vinha num arquivo só: **912 KiB cru, 269 KiB comprimido**, e
 * quem abria a Home baixava as 28 telas antes da primeira pintura, incluindo as
 * que talvez nunca visitasse. No 4G de uma loja, isso é a primeira impressão.
 *
 * **`Home` e `Entrar` ficam estáticas**, e só elas: são a primeira e a segunda
 * tela de todo mundo que chega. Carregá-las sob demanda trocaria peso por um
 * piscar no caminho crítico, que é pior — o ganho de dividir está em adiar o que
 * *não* é caminho crítico, não em adiar tudo.
 *
 * As duas telas de `/lab` entram aqui com ganho extra: o `import.meta.env.DEV`
 * tira a **rota** do bundle de produção, mas o `import` estático no topo mantinha
 * o **componente** dentro dele. Bancada de decisão viajava junto com o app de
 * quem usa. Com `lazy`, o pedaço existe e nunca é pedido.
 */
const CompletarCadastro = lazy(() => import('@/routes/CompletarCadastro'))
const Buscar = lazy(() => import('@/routes/Buscar'))
const ColarLista = lazy(() => import('@/routes/ColarLista'))
const CartaDetalhe = lazy(() => import('@/routes/Carta'))
const Configuracoes = lazy(() => import('@/routes/Configuracoes'))
const EditarPerfil = lazy(() => import('@/routes/EditarPerfil'))
const Mensagens = lazy(() =>
  import('@/routes/EmBreve').then((m) => ({ default: m.Mensagens })),
)
const Instalar = lazy(() => import('@/routes/Instalar'))
const LabAzul = lazy(() => import('@/routes/LabAzul'))
const LabTroca = lazy(() => import('@/routes/LabTroca'))
const MatchDetalhe = lazy(() => import('@/routes/Match'))
const Matches = lazy(() => import('@/routes/Matches'))
const MinhasCartas = lazy(() => import('@/routes/MinhasCartas'))
const Notificacoes = lazy(() => import('@/routes/Notificacoes'))
const NovaSenha = lazy(() => import('@/routes/NovaSenha'))
const Recuperar = lazy(() => import('@/routes/Recuperar'))
const Onboarding = lazy(() => import('@/routes/Onboarding'))
const Acervo = lazy(() => import('@/routes/Acervo'))
const PerfilTela = lazy(() => import('@/routes/Perfil'))
const Planos = lazy(() => import('@/routes/Planos'))
const PerfilPublicoTela = lazy(() => import('@/routes/PerfilPublico'))
const Pronto = lazy(() => import('@/routes/Pronto'))
const PropostaDetalhe = lazy(() => import('@/routes/Proposta'))
const Propostas = lazy(() => import('@/routes/Propostas'))
const Termos = lazy(() => import('@/routes/Termos'))
const Vitrine = lazy(() => import('@/routes/Vitrine'))
const VitrineCarta = lazy(() => import('@/routes/VitrineCarta'))

/**
 * O que ocupa a tela enquanto o pedaço da rota chega.
 *
 * Papel creme e nada mais — deliberadamente. Um spinner aqui apareceria por
 * ~100 ms numa rede boa e viraria um pisca a cada navegação; o fundo na cor da
 * página faz a troca de tela parecer instantânea quando é rápida, e só um vazio
 * curto quando não é. Quem está offline não chega aqui: o service worker já
 * guardou os pedaços no precache.
 */
function Carregando() {
  return <div className="min-h-[100dvh] bg-paper" aria-busy="true" />
}

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Rotas />
    </Suspense>
  )
}

function Rotas() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/termos" element={<Termos />} />
      {/* Recuperação de senha. As duas são públicas por definição: quem chega
          aqui não consegue entrar. `/nova-senha` é o destino do link do e-mail,
          e ela mesma confere se a sessão de recuperação existe — sem isso, um
          link vencido cairia numa tela pedindo senha que nunca ia salvar. */}
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/nova-senha" element={<NovaSenha />} />
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

      {/* Laboratório do azul de link, pela mesma regra: é bancada para uma
          decisão de desenho que o DESIGN.md deixou em aberto, e morre com ela.
          Fora do `LayoutApp` porque a barra de navegação carrega o azul da aba
          ativa e entraria no quadro como quarta amostra sem ser convidada. */}
      {import.meta.env.DEV && <Route path="/lab/azul" element={<LabAzul />} />}

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
            {/* Planos fica dentro do app, e não em rota pública: o destino do
                convite é quem já esbarrou num limite, e o estado "você é PRO"
                depende do perfil. Vira pública no dia em que a assinatura for
                argumento de divulgação — hoje ela nem cobra. */}
            <Route path="/planos" element={<Planos />} />
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
