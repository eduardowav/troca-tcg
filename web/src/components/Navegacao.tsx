import { NavLink, Outlet } from 'react-router-dom'

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
      {/* Espaço para o conteúdo não terminar debaixo da barra. */}
      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <Navegacao />
    </>
  )
}

function Navegacao() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-sm"
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
