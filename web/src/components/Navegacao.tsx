import { NavLink, Outlet } from 'react-router-dom'

import {
  IconeMensagem,
  IconeRaio,
  IconeSino,
} from '@/components/brutal/Pecas'
import { IconeCartas, IconePerfil, IconeTroca } from '@/components/ui/Icone'
import { cn } from '@/lib/cn'

/**
 * Barra fixa embaixo — o app é um PWA usado no celular, e o polegar alcança a
 * base da tela, não o topo.
 *
 * Só as telas de uso contínuo entram aqui. Onboarding fica de fora de
 * propósito: é um fluxo de foco, com bandeja própria no rodapé, e sair no meio
 * dele não ajuda ninguém.
 */
const ABAS = [
  { para: '/matches', rotulo: 'Trocas', Icone: IconeTroca },
  { para: '/minhas-cartas', rotulo: 'Minhas cartas', Icone: IconeCartas },
  // Mensagens ainda não existem: a aba leva para uma tela que diz isso e
  // aponta o caminho de hoje (WhatsApp depois do aceite). Está aqui, e não
  // escondida até o chat ficar pronto, porque a ausência da aba faz a pessoa
  // procurar a função achando que ela está em algum canto.
  { para: '/mensagens', rotulo: 'Mensagens', Icone: IconeMensagem },
  { para: '/perfil', rotulo: 'Perfil', Icone: IconePerfil },
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
      <span className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-azul text-azul-tinta">
          <IconeRaio className="size-4" />
        </span>
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
  return (
    <nav
      aria-label="Navegação principal"
      className="nav-app fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-sm"
    >
      <ul className="mx-auto flex w-full max-w-xl pb-[env(safe-area-inset-bottom)]">
        {ABAS.map(({ para, rotulo, Icone }) => (
          <li key={para} className="flex-1">
            <NavLink
              to={para}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1',
                  'text-[11px] transition-colors',
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
                  </span>
                  {rotulo}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
