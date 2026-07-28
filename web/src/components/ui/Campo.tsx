import { forwardRef, useId } from 'react'

import { cn } from '@/lib/cn'

export interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string
  dica?: string
  /** Prefixo fixo dentro do campo, como o "@" do username. */
  prefixo?: string
}

export const Campo = forwardRef<HTMLInputElement, CampoProps>(
  ({ rotulo, erro, dica, prefixo, className, ...props }, ref) => {
    const id = useId()
    const idAuxiliar = `${id}-aux`

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {rotulo}
        </label>

        <div className="relative">
          {prefixo && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[16px] text-faint"
            >
              {prefixo}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro || dica ? idAuxiliar : undefined}
            className={cn(
              'h-13 w-full rounded-[var(--radius-control)] pr-4',
              prefixo ? 'pl-7.5' : 'pl-4',
              'bg-surface text-[16px] text-paper placeholder:text-faint',
              'border shadow-[var(--shadow-card)]',
              'transition-colors focus:outline-none',
              erro
                ? 'border-alert focus:border-alert'
                : 'border-edge focus:border-volt',
              className,
            )}
            {...props}
          />
        </div>

        {(erro || dica) && (
          <p
            id={idAuxiliar}
            role={erro ? 'alert' : undefined}
            className={cn('text-[13px]', erro ? 'text-alert' : 'text-muted')}
          >
            {erro ?? dica}
          </p>
        )}
      </div>
    )
  },
)
Campo.displayName = 'Campo'
