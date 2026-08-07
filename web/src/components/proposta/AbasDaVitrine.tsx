import { NavLink } from 'react-router-dom'

import { useMinhaVez } from '@/hooks/usePropostas'
import { cn } from '@/lib/cn'

/**
 * As duas metades da aba nova: a vitrine e as propostas.
 *
 * São telas irmãs — uma é onde a proposta nasce, a outra é onde ela é
 * respondida — e por isso dividem uma aba só na barra de baixo, com este
 * seletor por cima. Uma sexta aba lá embaixo espremeria as cinco existentes
 * para dar lugar a uma tela que, na maior parte dos dias, está vazia.
 *
 * O número ao lado de "Propostas" conta só o que espera resposta **minha**.
 * Proposta enviada e ainda não respondida não entra: não é tarefa de quem
 * enviou, e um contador que sobe quando eu ajo treina a pessoa a ignorá-lo.
 */
export function AbasDaVitrine({ className }: { className?: string }) {
  const minhaVez = useMinhaVez()

  return (
    <nav
      aria-label="Vitrine e propostas"
      className={cn('flex w-full max-w-xl gap-2', className)}
    >
      <Aba para="/vitrine">Vitrine</Aba>
      <Aba para="/propostas" contagem={minhaVez}>
        Propostas
      </Aba>
    </nav>
  )
}

function Aba({
  para,
  contagem,
  children,
}: {
  para: string
  contagem?: number
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={para}
      // `end` para "/vitrine" não continuar marcada dentro de
      // "/vitrine/carta/:id" — ali a pessoa saiu do feed e está numa carta.
      end
      className={({ isActive }) =>
        cn(
          'inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta px-4 py-2.5',
          'font-titulo text-[13px] font-extrabold uppercase transition-shadow',
          isActive
            ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
            : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {children}
          {contagem ? (
            <span
              className={cn(
                'grid min-w-5 place-items-center rounded-full border-2 border-tinta px-1 font-dado text-[11px] font-bold',
                isActive ? 'bg-cartela text-tinta' : 'bg-azul text-azul-tinta',
              )}
            >
              {contagem}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}
