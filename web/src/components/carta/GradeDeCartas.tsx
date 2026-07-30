import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { cn } from '@/lib/cn'
import {
  type Carta,
  codigoSet,
  formatarPreco,
  type ListingKind,
  nomeCarta,
  type PrecoTCGplayer,
} from '@/lib/types'

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
    <ul
      className={cn(
        'grid gap-2.5',
        // Duas colunas no celular e mais uma a cada respiro de largura: no
        // desktop a tela vira bancada de loja, com dezenas de artes à vista.
        'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        className,
      )}
    >
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
  preco,
  para,
  children,
}: {
  carta: Carta
  /** Lista em que a carta já está, se estiver em alguma. */
  destaque?: ListingKind | null
  /** Preço de referência, quando a tela o carrega. Ausente não vira traço. */
  preco?: PrecoTCGplayer
  /**
   * Destino ao tocar na arte. Só as telas de descoberta passam isto: em Minhas
   * cartas o toque já abre o editor, e dois destinos no mesmo gesto seria pior
   * que nenhum.
   */
  para?: string
  /** Ações da célula — mudam por tela: duas listas no onboarding, uma em Minhas cartas. */
  children: React.ReactNode
}) {
  const identidade = (
    <>
      <CartaThumb carta={carta} className="carta-cresce w-full" />

      <div className="min-w-0 px-0.5">
        <p className="truncate text-[15px] leading-tight font-medium text-paper lg:text-[16px] 2xl:text-[17px]">
          {nomeCarta(carta)}
        </p>
        <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[12px] text-muted lg:text-[13px] 2xl:text-[14px]">
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
        {carta.raridade && (
          <p className="mt-1 truncate text-[12px] text-faint lg:text-[13px]">{carta.raridade}</p>
        )}
        <SeloPreco preco={preco} />
      </div>
    </>
  )

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'grupo-carta relative flex flex-col gap-2 rounded-card border p-2',
        'transition-colors',
        destaque ? DESTAQUE[destaque] : 'border-edge-soft bg-surface/50',
      )}
    >
      {para ? (
        <Link
          to={para}
          className="flex flex-col gap-2 rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
        >
          {identidade}
        </Link>
      ) : (
        identidade
      )}

      {children}
    </motion.li>
  )
}

/**
 * Preço de referência da carta.
 *
 * Fica discreto de propósito: serve para perceber que uma carta vale bem mais
 * que a outra, não para virar tabela de mercado. Quem quiser precisão vai à
 * TCGplayer — daí a fonte estar dita, e o valor sair em dólar como ela publica.
 *
 * Sem preço, não desenha nada. Boa parte do catálogo (promos, cartas só em PT)
 * simplesmente não existe na TCGplayer, e um "—" em metade da grade seria ruído
 * dizendo "faltou dado" onde a resposta honesta é "não se aplica".
 */
export function SeloPreco({
  preco,
  className,
}: {
  preco?: PrecoTCGplayer
  className?: string
}) {
  const valor = formatarPreco(preco)
  if (!valor) return null

  return (
    <p className={cn('mt-1 text-[12px] text-muted lg:text-[13px] 2xl:text-[14px]', className)}>
      <span className="text-paper tabular-nums">{valor}</span>
      <span className="text-faint"> · TCGplayer</span>
    </p>
  )
}

/**
 * Par de ações de uma carta: Ofereço e Procuro lado a lado.
 *
 * Os dois botões dividem a largura da célula — o alvo de toque cresce e fica
 * claro que a ação é daquela carta, não da lista aberta. As duas telas usam o
 * mesmo par: quem busca uma carta decide na hora para qual lista ela vai, sem
 * ter de sair e voltar por outra aba.
 */
export function AcoesDeLista({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>
}

export function BotaoLista({
  tipo,
  ativo,
  onClick,
  disabled,
  rotulo,
}: {
  tipo: ListingKind
  ativo: boolean
  onClick: () => void
  disabled?: boolean
  /** Sobrescreve o texto — "Na lista" quando a carta já está lá. */
  rotulo?: string
}) {
  const oferta = tipo === 'OFERTA'
  const nome = oferta ? 'Ofereço' : 'Procuro'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      aria-label={`${rotulo ?? nome} — ${nome}`}
      className={cn(
        'h-9 rounded-[var(--radius-control)] px-2 text-[14px] font-medium lg:text-[15px]',
        'transition-[background-color,color,border-color] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
        'disabled:cursor-default',
        ativo
          ? oferta
            ? 'bg-offer text-[#06231f]'
            : 'bg-want text-[#241703]'
          : oferta
            ? 'border border-[color-mix(in_oklab,var(--color-offer)_35%,transparent)] text-offer hover:bg-[color-mix(in_oklab,var(--color-offer)_14%,transparent)] disabled:opacity-40 disabled:hover:bg-transparent'
            : 'border border-[color-mix(in_oklab,var(--color-want)_32%,transparent)] text-want hover:bg-[color-mix(in_oklab,var(--color-want)_12%,transparent)] disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {rotulo ?? nome}
    </button>
  )
}
