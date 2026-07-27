import { useState } from 'react'

import { cn } from '@/lib/cn'
import { type Carta, nomeCarta } from '@/lib/types'

interface CartaThumbProps {
  carta: Carta
  className?: string
  /** Realce foil para acabamentos especiais (Master Ball etc.). Só no lugar certo. */
  foil?: boolean
}

/**
 * A carta como objeto físico: proporção 2.5×3.5, dentro de um "sleeve"
 * (moldura + anel interno). Skeleton enquanto carrega; sem imagem, cai para
 * a arte tipográfica com o código de set — nunca uma caixa quebrada.
 */
export function CartaThumb({ carta, className, foil }: CartaThumbProps) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(
    carta.imagem_url ? 'carregando' : 'erro',
  )

  return (
    <div
      className={cn(
        'relative aspect-[2.5/3.5] overflow-hidden rounded-[10px]',
        'bg-surface-2 ring-1 ring-edge/80',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
        foil && 'ring-transparent',
        className,
      )}
    >
      {foil && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[10px] opacity-60 mix-blend-screen holo-sweep"
        />
      )}

      {estado === 'carregando' && (
        <div className="absolute inset-0 animate-pulse bg-surface-2" />
      )}

      {carta.imagem_url && estado !== 'erro' && (
        <img
          src={carta.imagem_url}
          alt={nomeCarta(carta)}
          loading="lazy"
          decoding="async"
          onLoad={() => setEstado('ok')}
          onError={() => setEstado('erro')}
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            estado === 'ok' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

      {estado === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
          <span className="text-[13px] leading-tight font-medium text-paper/85">
            {nomeCarta(carta)}
          </span>
          <span className="set-code text-[10px] text-muted">
            {carta.set_code.toUpperCase()} {carta.numero}
          </span>
        </div>
      )}
    </div>
  )
}
