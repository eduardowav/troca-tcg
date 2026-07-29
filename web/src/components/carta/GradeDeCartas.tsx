import { motion } from 'motion/react'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { cn } from '@/lib/cn'
import { type Carta, codigoSet, type ListingKind, nomeCarta } from '@/lib/types'

/**
 * Grade de resultados: a arte primeiro, as ações embaixo.
 *
 * A lista em linha (miniatura de 44px à esquerda, botões à direita) funcionava
 * com 1047 cartas. Com 16 mil, quem escolhe reconhece a carta pela **arte**, não
 * pelo nome — "Charizard ex" existe dezenas de vezes e o que distingue é o
 * desenho. Duas colunas no celular dão uma carta grande o bastante para isso.
 */
export function GradeDeCartas({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', className)}>
      {children}
    </ul>
  )
}

/** Fundo e borda da célula quando a carta já está numa das listas. */
const DESTAQUE: Record<ListingKind, string> = {
  OFERTA:
    'border-[color-mix(in_oklab,var(--color-offer)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-offer)_8%,transparent)]',
  PROCURA:
    'border-[color-mix(in_oklab,var(--color-want)_42%,transparent)] bg-[color-mix(in_oklab,var(--color-want)_8%,transparent)]',
}

export function CelulaCarta({
  carta,
  destaque,
  children,
}: {
  carta: Carta
  /** Lista em que a carta já está, se estiver em alguma. */
  destaque?: ListingKind | null
  /** Ações da célula — mudam por tela: duas listas no onboarding, uma em Minhas cartas. */
  children: React.ReactNode
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'flex flex-col gap-2 rounded-card border p-2 transition-colors',
        destaque ? DESTAQUE[destaque] : 'border-edge-soft bg-surface/50',
      )}
    >
      <CartaThumb carta={carta} className="w-full" />

      <div className="min-w-0 px-0.5">
        <p className="truncate text-[13px] leading-tight font-medium text-paper">
          {nomeCarta(carta)}
        </p>
        <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[11px] text-muted">
          <span className="set-code shrink-0">{codigoSet(carta)}</span>
          {carta.set_nome && (
            <>
              <span aria-hidden className="shrink-0 text-faint">
                ·
              </span>
              <span className="truncate">{carta.set_nome}</span>
            </>
          )}
        </p>
      </div>

      {children}
    </motion.li>
  )
}
