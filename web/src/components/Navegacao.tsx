import { NavLink, Outlet } from 'react-router-dom'

import {
  IconeCartasBrutal,
  IconeMensagem,
  IconePessoa,
  IconeSino,
  IconeTrocas,
  IconeVitrine,
  MarcaTrocaTCG,
} from '@/components/brutal/Pecas'
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
      {/* O lockup: marca à esquerda, palavra à direita, alinhadas pela altura
          do x. A marca já tem borda e cor próprias — envolvê-la num quadrado,
          como o raio antigo exigia, criaria uma segunda moldura em volta de uma
          coisa que já é moldurada. */}
      <span className="flex items-center gap-2">
        <MarcaTrocaTCG className="h-7 w-auto shrink-0" />
        <span className="font-titulo text-[24px] leading-none font-black text-tinta">
          TrocaTCG
        </span>
      </span>

      <SinoApp />
    </header>
  )
}

/**
 * O sino, com o ponto de aviso condicionado a existir aviso.
 *
 * Hoje `temAviso` nunca chega ligado: notificações são a Fase 6 e não há o que
 * contar. Ponto aceso sem nada atrás é uma promessa que a tela não cumpre —
 * a pessoa toca esperando novidade e encontra "ainda não mora aqui", que é
 * exatamente o contrário do que o ponto disse.
 *
 * O ponto não foi apagado, foi condicionado: quando a Fase 6 existir, é passar
 * a contagem para cá e ele volta com a mesma aparência do arquivo. Código vivo
 * atrás de uma condição envelhece melhor do que markup comentado, que ninguém
 * relê e que o linter não vigia.
 *
 * O tom é azul, não vermelho — é o que o `alert-dot` do Figma desenha
 * (`fill="#0038FF"`): ali ele conta novidade, não erro.
 */
function SinoApp({ temAviso = false }: { temAviso?: boolean }) {
  return (
    <NavLink
      to="/notificacoes"
      // O rótulo carrega o aviso junto: quem navega por leitor de tela não vê
      // o ponto, e "Notificações" sozinho esconderia que há algo novo.
      aria-label={temAviso ? 'Notificações — há novidades' : 'Notificações'}
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
                    <Icone className="size-6" />
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute -top-2.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-volt"
                      />
                    )}
                    {badge && minhaVez > 0 && (
                      <span
                        aria-hidden
                        className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full border-2 border-tinta bg-azul px-1 font-dado text-[9px] font-bold text-azul-tinta"
                      >
                        {minhaVez}
                      </span>
                    )}
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
