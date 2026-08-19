import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { NavLink, Outlet } from 'react-router-dom'

import {
  IconeCartasBrutal,
  IconeMensagem,
  IconePessoa,
  IconeSino,
  IconeTrocas,
  IconeVitrine,
  LockupTrocaTCG,
} from '@/components/brutal/Pecas'
import { useAssinarNotificacoes, useNaoLidas } from '@/hooks/useNotificacoes'
import { useNavegacaoPorNotificacao } from '@/hooks/usePush'
import { useMinhaVez } from '@/hooks/usePropostas'
import { cn } from '@/lib/cn'

/**
 * Barra fixa embaixo — o app é um PWA usado no celular, e o polegar alcança a
 * base da tela, não o topo.
 *
 * Só as telas de uso contínuo entram aqui. Onboarding fica de fora de
 * propósito: é um fluxo de foco, com bandeja própria no rodapé, e sair no meio
 * dele não ajuda ninguém.
 */
// Os quatro ícones vêm do arquivo do Figma, menos o de cartas: lá ele é um
// `card-sim` (chip de celular), e num app de troca de cartas essa leitura errada
// custa mais do que a fidelidade ganha. Esse foi redesenhado na mesma língua dos
// outros — caixa de 22, traço de 2, ponta redonda.
const ABAS = [
  { para: '/matches', rotulo: 'Trocas', Icone: IconeTrocas },
  // Ao lado de Trocas, e não escondida dentro dela (decisão do Eduardo,
  // 2026-08-07): a vitrine é porta de entrada de quem tem o feed vazio, e
  // enterrá-la numa tela vazia esconderia justamente de quem mais precisa.
  // Leva ao feed; as propostas ficam na metade irmã, com o seletor de cima.
  { para: '/vitrine', rotulo: 'Vitrine', Icone: IconeVitrine, badge: true },
  { para: '/minhas-cartas', rotulo: 'Minhas cartas', Icone: IconeCartasBrutal },
  // Mensagens ainda não existem: a aba leva para uma tela que diz isso e
  // aponta o caminho de hoje (WhatsApp depois do aceite). Está aqui, e não
  // escondida até o chat ficar pronto, porque a ausência da aba faz a pessoa
  // procurar a função achando que ela está em algum canto.
  { para: '/mensagens', rotulo: 'Mensagens', Icone: IconeMensagem },
  { para: '/perfil', rotulo: 'Perfil', Icone: IconePessoa },
]

export function LayoutApp() {
  // Uma assinatura para o app inteiro, montada aqui porque é o componente que
  // envolve toda tela logada. Pô-la no sino faria a inscrição nascer e morrer
  // junto do cabeçalho de cada rota.
  useAssinarNotificacoes()
  // O outro canal da mesma notificação: quando ela chega pelo sistema e a
  // pessoa toca nela com o app já aberto, é aqui que o pedido de navegação do
  // service worker é atendido.
  useNavegacaoPorNotificacao()

  return (
    <>
      <MarcaApp />
      {/* Espaço para o conteúdo não terminar debaixo da barra. */}
      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <Navegacao />
    </>
  )
}

/**
 * A marca no topo do app.
 *
 * Mora aqui, e não em cada rota, porque no arquivo do Figma ela aparece nas sete
 * telas — o que quer dizer que é moldura do app, não conteúdo da tela. Repeti-la
 * em treze rotas seriam treze lugares para ela sair de sintonia.
 *
 * Fica escondida por padrão e só aparece com `data-mundo="brutal"` (regra em
 * `index.css`). As telas que ainda estão no playmat trazem a própria marca no
 * cabeçalho — a linha `TROCATCG` em mono —, e mostrar esta junto daria duas
 * marcas na mesma tela. Quando a última migrar, o `display: none` sai e esta
 * passa a valer sempre.
 *
 * Não é link. O Figma não a torna interativa, e a aba "Trocas" da barra de baixo
 * já leva ao mesmo lugar: um segundo alvo para o mesmo destino só divide a
 * atenção.
 *
 * Ela carrega o `safe-area-inset-top` do app inteiro. Como é a primeira coisa da
 * página, é dela o recuo do notch — se cada tela tratasse por conta, a que
 * esquecesse nasceria debaixo dele.
 */
function MarcaApp() {
  return (
    <header className="marca-app mx-auto w-full max-w-[100rem] items-center justify-between px-6 pt-[calc(1rem+env(safe-area-inset-top))] 2xl:max-w-[120rem]">
      <LockupTrocaTCG />

      <SinoApp />
    </header>
  )
}

/**
 * O sino, com o ponto de aviso condicionado a existir aviso.
 *
 * O ponto ficou apagado desde o Figma porque não havia o que contar — e ponto
 * aceso sem nada atrás é uma promessa que a tela não cumpre. Agora há: a
 * contagem vem de `/me/notifications/nao-lidas` e sobe sozinha pelo Realtime,
 * assinado uma vez no `LayoutApp`.
 *
 * O número não é desenhado, só o ponto. A caixa é curta e ordenada por
 * recência: quem toca o sino vê o que chegou em duas linhas de leitura, e
 * "3" ali em cima não mudaria o gesto seguinte. A contagem exata vai no rótulo
 * acessível, onde ela de fato informa alguém.
 *
 * O tom é azul, não vermelho — é o que o `alert-dot` do Figma desenha
 * (`fill="#0038FF"`): ali ele conta novidade, não erro.
 */
function SinoApp() {
  const naoLidas = useNaoLidas()
  const temAviso = naoLidas > 0

  return (
    <NavLink
      to="/notificacoes"
      // O rótulo carrega o aviso junto: quem navega por leitor de tela não vê
      // o ponto, e "Notificações" sozinho esconderia que há algo novo.
      aria-label={
        temAviso ? `Notificações — ${naoLidas} não lidas` : 'Notificações'
      }
      className="relative grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
    >
      <IconeSino className="size-5" />
      {temAviso && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-tinta bg-azul"
        />
      )}
    </NavLink>
  )
}

function Navegacao() {
  // O que espera resposta minha. Fica na aba da vitrine porque é lá que as
  // propostas moram — e é a única contagem do app que representa uma tarefa da
  // pessoa, não uma novidade genérica.
  const minhaVez = useMinhaVez()

  // Quem pediu menos movimento ao sistema recebe a barra parada. O `!important`
  // do CSS global zera duração de transição e de `animation`, mas não alcança o
  // motion, que anima por JavaScript — aqui a decisão precisa ser tomada no
  // componente.
  const semMovimento = useReducedMotion()

  return (
    <nav
      aria-label="Navegação principal"
      className="nav-app fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-sm"
    >
      <ul className="mx-auto flex w-full max-w-xl pb-[env(safe-area-inset-bottom)]">
        {ABAS.map(({ para, rotulo, Icone, badge }) => (
          <li key={para} className="min-w-0 flex-1">
            <NavLink
              to={para}
              // A contagem entra no rótulo acessível: quem navega por leitor de
              // tela não vê o número desenhado sobre o ícone.
              aria-label={
                badge && minhaVez
                  ? `${rotulo} — ${minhaVez} esperando resposta sua`
                  : undefined
              }
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 px-1',
                  // 10px e não 11: com cinco abas, "Minhas cartas" a 11px não
                  // cabe num celular de 375 e quebra a linha da barra inteira.
                  'text-[10px] transition-colors',
                  isActive ? 'text-paper' : 'text-muted hover:text-paper',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    {/* O ícone dá um salto curto ao virar ativo e afunda no
                        toque. É o mesmo gesto físico das peças do mundo novo —
                        a sombra que salta no botão —, traduzido para algo que
                        não tem sombra. Curto de propósito: a barra é tocada
                        dezenas de vezes por sessão, e o que encanta na primeira
                        atrasa na vigésima. */}
                    <motion.span
                      className="block"
                      animate={
                        semMovimento
                          ? undefined
                          : { scale: isActive ? [1, 1.18, 1] : 1 }
                      }
                      whileTap={semMovimento ? undefined : { scale: 0.86 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                    >
                      <Icone className="size-6" />
                    </motion.span>

                    {/* A barrinha é uma peça só que desliza entre as abas, e
                        não uma que some aqui e nasce ali: com `layoutId` o
                        motion move a mesma caixa, e o traço acompanha o dedo em
                        vez de piscar. */}
                    {isActive && (
                      <motion.span
                        aria-hidden
                        layoutId={semMovimento ? undefined : 'aba-ativa'}
                        className="absolute -top-2.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-volt"
                        transition={{
                          type: 'spring',
                          stiffness: 480,
                          damping: 38,
                        }}
                      />
                    )}

                    <AnimatePresence>
                      {badge && minhaVez > 0 && (
                        // A badge nasce com mola e some sem alarde: ela aparece
                        // quando alguém responde do outro lado, ou seja, sem a
                        // pessoa ter feito nada — e uma coisa que aparece
                        // sozinha precisa se anunciar.
                        <motion.span
                          aria-hidden
                          initial={semMovimento ? false : { scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 620,
                            damping: 24,
                          }}
                          className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full border-2 border-tinta bg-azul px-1 font-dado text-[9px] font-bold text-azul-tinta"
                        >
                          {/* O número rola em vez de trocar: de 1 para 2 é uma
                              proposta nova chegando, e a rolagem conta isso. */}
                          <NumberFlow value={minhaVez} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className="w-full truncate text-center">{rotulo}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
