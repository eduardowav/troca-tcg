import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
  const semMovimento = useReducedMotion()

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
          <AnimatePresence>
            {contagem ? (
              // Mesma mola da badge da barra de baixo, e pelo mesmo motivo: o
              // número aparece quando alguém responde do outro lado, sem a
              // pessoa ter feito nada. O `NumberFlow` rola de 1 para 2 em vez
              // de trocar, que é o que conta que chegou mais uma.
              <motion.span
                initial={semMovimento ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                className={cn(
                  'grid min-w-5 place-items-center rounded-full border-2 border-tinta px-1 font-dado text-[11px] font-bold',
                  isActive ? 'bg-cartela text-tinta' : 'bg-azul text-azul-tinta',
                )}
              >
                <NumberFlow value={contagem} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  )
}
