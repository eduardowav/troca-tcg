import { NavLink, Outlet } from 'react-router-dom'

import { IconeRaio } from '@/components/brutal/Pecas'
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
    <header className="marca-app mx-auto w-full max-w-[100rem] items-center gap-2 px-6 pt-[calc(1rem+env(safe-area-inset-top))] 2xl:max-w-[120rem]">
      <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-azul text-azul-tinta">
        <IconeRaio className="size-4" />
      </span>
      <span className="font-titulo text-[24px] leading-none font-black text-tinta">
        TrocaTCG
      </span>
    </header>
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
