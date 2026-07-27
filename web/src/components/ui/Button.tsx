import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'

import { cn } from '@/lib/cn'

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 select-none',
    'font-medium whitespace-nowrap rounded-[var(--radius-control)]',
    'transition-[transform,background-color,border-color,color,box-shadow]',
    'duration-150 ease-out active:translate-y-px',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
    'disabled:pointer-events-none disabled:opacity-45',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-volt text-[var(--color-volt-ink)] font-bold hover:bg-volt-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_20px_-8px_var(--color-volt)]',
        offer:
          'bg-[color-mix(in_oklab,var(--color-offer)_16%,transparent)] text-offer border border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-offer)_24%,transparent)]',
        want:
          'bg-[color-mix(in_oklab,var(--color-want)_15%,transparent)] text-want border border-[color-mix(in_oklab,var(--color-want)_38%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-want)_22%,transparent)]',
        subtle:
          'bg-surface-2 text-paper border border-edge hover:border-[var(--color-faint)]',
        ghost: 'text-muted hover:text-paper hover:bg-surface-2',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-13 px-5 text-base',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, loading, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

function Spinner() {
  return (
    <span
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
      aria-hidden
    />
  )
}
