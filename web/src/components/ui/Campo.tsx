import { forwardRef, useId, useState } from 'react'

import { IconeOlho, IconeOlhoFechado } from '@/components/ui/Icone'
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

    // Todo campo de senha ganha o olho, sem ninguém precisar pedir: é a mesma
    // necessidade em toda tela onde ele aparece — entrar, criar conta, senha
    // nova —, e deixar isso a cargo de cada tela garantiria que uma delas
    // esquecesse.
    const ehSenha = props.type === 'password'
    const [revelada, setRevelada] = useState(false)

    return (
      <div className="campo flex flex-col gap-1.5">
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
              'h-13 w-full rounded-[var(--radius-control)]',
              // Espaço para o olho, senão o texto passa por baixo dele — e é
              // justamente numa senha longa que isso aconteceria.
              ehSenha ? 'pr-14' : 'pr-4',
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
            // Depois do spread, de propósito: quem usa o componente passa
            // `type="password"`, e é aqui que ele vira `text` enquanto a senha
            // está à mostra.
            type={ehSenha && revelada ? 'text' : props.type}
          />

          {ehSenha && (
            /* Botão de verdade, e não um ícone clicável: é alcançável pelo
               teclado e anunciado pelo leitor de tela com o estado atual.
               `aria-pressed` diz "mostrando" ou "escondido"; o rótulo diz o que
               o toque vai fazer.

               A senha volta a ficar escondida ao trocar de tela porque o estado
               morre com o componente — e é o comportamento certo: revelar é uma
               decisão para aquele momento, não uma preferência. */
            <button
              type="button"
              onClick={() => setRevelada((v) => !v)}
              aria-pressed={revelada}
              aria-label={revelada ? 'Ocultar senha' : 'Mostrar senha'}
              title={revelada ? 'Ocultar senha' : 'Mostrar senha'}
              // Fora da ordem de tabulação: quem navega por teclado quer ir do
              // campo para o botão de entrar, e não parar num controle
              // opcional no meio do caminho. Continua alcançável por toque e
              // por leitor de tela, que não usa a ordem do Tab para navegar.
              tabIndex={-1}
              className={cn(
                // 44px de lado: é o alvo de toque mínimo que a mão acerta no
                // celular. O ícone continua com 20px — o que cresce é a área
                // sensível, não o desenho.
                'absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center',
                'rounded-[var(--radius-etiqueta)] text-muted',
                'transition-colors hover:text-paper',
              )}
            >
              {revelada ? (
                <IconeOlhoFechado className="size-5" />
              ) : (
                <IconeOlho className="size-5" />
              )}
            </button>
          )}
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
