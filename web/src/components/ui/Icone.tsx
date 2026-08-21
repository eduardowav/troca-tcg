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

/** Olho — mostrar a senha que está sendo digitada. */
export function IconeOlho(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  )
}

/** Olho cortado — esconder de volta. A barra é o que se lê como "não". */
export function IconeOlhoFechado(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M3 3.5 21 20.5" />
      {/* Metades do olho, interrompidas onde a barra passa: um olho inteiro com
          risco por cima vira rabisco no tamanho em que este ícone é lido. */}
      <path d="M9.9 6c.7-.2 1.4-.3 2.1-.3 6 0 9.5 6.3 9.5 6.3s-1 1.9-2.9 3.5" />
      <path d="M6.2 8.2C3.8 9.9 2.5 12 2.5 12S6 18.3 12 18.3c1.3 0 2.4-.3 3.4-.7" />
      <path d="M10 10a3 3 0 0 0 4 4" />
    </Base>
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

/** Envelope. Nas duas telas que mandam alguém à caixa de entrada: o "esqueci
 *  minha senha" e, desde 2026-08-21, a confirmação de e-mail no cadastro. */
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
