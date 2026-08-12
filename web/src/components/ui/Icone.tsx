/**
 * Ícones de linha, desenhados aqui em vez de emoji.
 *
 * Emoji renderiza diferente em cada sistema e destoa do mundo de "carta física"
 * do produto. Estes herdam `currentColor` e o tamanho vem do `className`, então
 * acompanham a cor e a escala do contexto.
 */
interface IconeProps {
  className?: string
}

function Base({
  className = 'size-6',
  children,
}: IconeProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  )
}

/** Duas cartas sobrepostas — a lista Ofereço. */
export function IconeCartas(props: IconeProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="11" height="15" rx="2" />
      <path d="M8.5 4.2 17.8 2.6a2 2 0 0 1 2.3 1.6l2 11.6a2 2 0 0 1-1.6 2.3l-2.5.5" />
    </Base>
  )
}

/** Lupa — a lista Procuro. */
export function IconeBusca(props: IconeProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Base>
  )
}

/** Duas setas em sentidos opostos — a troca. */
export function IconeTroca(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M3 8h14l-3.5-3.5" />
      <path d="M21 16H7l3.5 3.5" />
    </Base>
  )
}

/** Envelope. Sem uso desde que a confirmação de e-mail saiu (2026-08-12);
 *  fica para o "esqueci minha senha", que é a próxima tela a falar de caixa de
 *  entrada — ver item 8 da seção 17. */
export function IconeEnvelope(props: IconeProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Base>
  )
}

/** Silhueta — perfil. */
export function IconePerfil(props: IconeProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  )
}
