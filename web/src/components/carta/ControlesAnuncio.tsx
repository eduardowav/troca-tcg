import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { type Carta, codigoSet, type ListingKind, nomeCarta } from '@/lib/types'

/**
 * Controles de anúncio, compartilhados por quem **cria** e por quem **edita**.
 *
 * Moram aqui porque as duas telas precisam concordar: o que a pessoa escolhe ao
 * adicionar uma carta é o mesmo que ela reencontra depois para ajustar, e dois
 * conjuntos de controles parecidos-mas-não-iguais é como uma tela começa a
 * mentir sobre a outra.
 */

/** A folha que sobe de baixo. Esc fecha, e a página não rola atrás dela. */
export function FolhaInferior({
  aberto,
  onFechar,
  rotulo,
  carta,
  tipo,
  fecharNoTopo = true,
  children,
}: {
  aberto: boolean
  onFechar: () => void
  rotulo: string
  carta: Carta
  tipo: ListingKind
  /**
   * Quem já tem um botão de encerrar no rodapé desliga este.
   *
   * Vale para a folha de edição, onde cada controle salva sozinho: ali "Fechar"
   * no topo e "Concluído" embaixo fazem exatamente a mesma coisa com dois nomes
   * diferentes. Na folha de adicionar não é o caso — lá nada foi gravado ainda,
   * então "Fechar" é desistir, e continua fazendo sentido ao lado do confirmar.
   */
  fecharNoTopo?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto, onFechar])

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onFechar}
            className="fixed inset-0 z-40 bg-ink-deep/75 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={rotulo}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto',
              'rounded-t-[20px] border-t border-edge bg-surface',
              'shadow-[var(--shadow-pop)]',
            )}
          >
            <div className="mx-auto w-full max-w-xl px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {/* Puxador: diz "isso arrasta/fecha" sem precisar de texto. */}
              <div
                aria-hidden
                className="mx-auto mb-4 h-1 w-10 rounded-full bg-edge"
              />

              <div className="flex items-center gap-3">
                <CartaThumb
                  carta={carta}
                  className={cn(
                    'w-12 shrink-0 ring-2',
                    tipo === 'OFERTA' ? 'ring-offer' : 'ring-want',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium text-paper">
                    {nomeCarta(carta)}
                  </p>
                  <p className="set-code mt-0.5 text-[12px] text-muted">
                    {codigoSet(carta)}
                  </p>
                </div>
                {fecharNoTopo && (
                  <Button variant="ghost" size="sm" onClick={onFechar}>
                    Fechar
                  </Button>
                )}
              </div>

              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function Quantidade({
  valor,
  onMudar,
}: {
  valor: number
  onMudar: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px] text-muted">Quantidade</span>
      <div className="flex items-center gap-1">
        <Passo
          rotulo="Diminuir"
          desabilitado={valor <= 1}
          onClick={() => onMudar(valor - 1)}
        >
          −
        </Passo>
        <span
          aria-live="polite"
          className="w-9 text-center text-[15px] tabular-nums text-paper"
        >
          {valor}
        </span>
        <Passo
          rotulo="Aumentar"
          desabilitado={valor >= 99}
          onClick={() => onMudar(valor + 1)}
        >
          +
        </Passo>
      </div>
    </div>
  )
}

function Passo({
  children,
  rotulo,
  desabilitado,
  onClick,
}: {
  children: React.ReactNode
  rotulo: string
  desabilitado?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-[8px] border border-edge bg-surface-2 text-paper transition-colors hover:border-[var(--color-faint)] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function Escolha<T extends string | number>({
  rotulo,
  opcoes,
  valor,
  onMudar,
}: {
  rotulo: string
  opcoes: { valor: T; rotulo: string; titulo?: string }[]
  valor: T
  onMudar: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] text-muted">{rotulo}</span>
      <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const ativo = o.valor === valor
          return (
            <button
              key={String(o.valor)}
              type="button"
              role="radio"
              aria-checked={ativo}
              title={o.titulo}
              onClick={() => onMudar(o.valor)}
              className={cn(
                'h-9 rounded-[8px] border px-3 text-[13px] transition-colors',
                ativo
                  ? 'border-[var(--color-volt)] bg-[color-mix(in_oklab,var(--color-volt)_18%,transparent)] text-paper'
                  : 'border-edge bg-surface-2 text-muted hover:text-paper',
              )}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
