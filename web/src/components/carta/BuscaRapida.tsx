import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { IconeBusca } from '@/components/ui/Icone'
import { useCardSearch } from '@/hooks/useCardSearch'
import { useCatalogo } from '@/hooks/useCatalogo'
import { useDebounced } from '@/hooks/useDebounced'
import { cn } from '@/lib/cn'
import { type Carta, nomeCarta, numeroImpresso } from '@/lib/types'

/** Quantas sugestões cabem antes de virar "ver todos". */
const SUGESTOES = 8

/**
 * Busca compacta: uma lista curta que cai por cima da tela.
 *
 * O painel anterior abria a grade inteira dentro da página, com filtros e arte
 * grande. No desktop passava; no celular, que é o alvo, comia a tela toda para
 * responder uma pergunta que costuma ser curta — o colecionador chega sabendo o
 * que quer e escreve "regigigas". Ele não está explorando o catálogo, está
 * localizando uma carta.
 *
 * Daí a forma: linha fina com miniatura, nome e o número como está impresso no
 * rodapé ("086/131"), que é como ele identifica a carta. Altura limitada com
 * rolagem própria, para a lista nunca empurrar o resto da página.
 *
 * Quem *está* explorando aperta Enter e vai para a página de busca, com filtros
 * e grade. Duas necessidades diferentes, dois lugares — em vez de um painel que
 * tentava servir as duas e ficava grande demais para a mais comum.
 */
export function BuscaRapida({ className }: { className?: string }) {
  const navegar = useNavigate()
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destacado, setDestacado] = useState(-1)
  const busca = useDebounced(termo, 200)
  const { cartas, total, carregando, ativa } = useCardSearch(busca)
  const { data: catalogo } = useCatalogo()
  const caixa = useRef<HTMLDivElement>(null)
  const listaId = useId()

  const sugestoes = (cartas ?? []).slice(0, SUGESTOES)

  // Clique fora fecha. Sem isto a lista fica presa na tela depois que a pessoa
  // desiste — e em celular "clicar fora" é o gesto natural de desistir.
  useEffect(() => {
    if (!aberto) return
    function aoClicar(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  // O destaque volta ao topo quando o resultado muda: manter o índice antigo
  // apontaria para outra carta, e Enter abriria a errada.
  useEffect(() => setDestacado(-1), [busca])

  function verTodos() {
    if (!termo.trim()) return
    setAberto(false)
    navegar(`/buscar?q=${encodeURIComponent(termo.trim())}`)
  }

  function abrirCarta(carta: Carta) {
    setAberto(false)
    navegar(`/carta/${carta.id}`)
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!sugestoes.length) return
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setDestacado((i) => {
        const proximo = i + passo
        if (proximo < 0) return sugestoes.length - 1
        if (proximo >= sugestoes.length) return 0
        return proximo
      })
      setAberto(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (destacado >= 0 && sugestoes[destacado]) abrirCarta(sugestoes[destacado])
      else verTodos()
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  const mostrarLista = aberto && ativa

  return (
    // `busca-rapida` não pinta nada: é o gancho por onde a pele alcança o
    // campo e o painel de sugestões. Mesmo papel do `thumb-carta`.
    <div ref={caixa} className={cn('busca-rapida relative', className)}>
      <div className="relative">
        <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-label="Buscar carta"
          placeholder="Busque: Regigigas, Umbreon, Pesquisa…"
          className={cn(
            'h-11 w-full rounded-[var(--radius-control)] pr-3 pl-10 lg:h-12',
            'border border-edge bg-surface text-[16px] text-paper',
            'placeholder:text-muted focus:border-volt focus:outline-none',
          )}
        />
      </div>

      {mostrarLista && (
        <div
          id={listaId}
          role="listbox"
          aria-label="Sugestões"
          className={cn(
            'absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden',
            'rounded-[var(--radius-card)] border border-edge bg-surface',
            'shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]',
          )}
        >
          {carregando && !sugestoes.length ? (
            <p className="px-3 py-4 text-center text-[14px] text-muted">
              Buscando…
            </p>
          ) : sugestoes.length ? (
            <>
              {/* Altura limitada e rolagem própria: a lista nunca empurra a
                  página, e no celular ela cabe acima do teclado. */}
              <ul className="max-h-[19rem] overflow-y-auto [scrollbar-width:thin]">
                {sugestoes.map((carta, i) => (
                  <Sugestao
                    key={carta.id}
                    carta={carta}
                    total={
                      catalogo?.setsPorCodigo.get(carta.set_code)?.total_oficial
                    }
                    destacada={i === destacado}
                    onEscolher={() => abrirCarta(carta)}
                    onApontar={() => setDestacado(i)}
                  />
                ))}
              </ul>

              <button
                type="button"
                onClick={verTodos}
                className="flex w-full items-center justify-between border-t border-edge-soft px-3 py-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-paper"
              >
                <span>Ver todas as {total} cartas</span>
                <span className="set-code text-[11px] text-faint">Enter</span>
              </button>
            </>
          ) : (
            <p className="px-3 py-4 text-center text-[14px] text-muted">
              Nenhuma carta com esse nome.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Sugestao({
  carta,
  total,
  destacada,
  onEscolher,
  onApontar,
}: {
  carta: Carta
  total?: number | null
  destacada: boolean
  onEscolher: () => void
  onApontar: () => void
}) {
  return (
    <li role="option" aria-selected={destacada}>
      <button
        type="button"
        onClick={onEscolher}
        onMouseEnter={onApontar}
        className={cn(
          'flex w-full items-center gap-3 px-2.5 py-2 text-left transition-colors',
          destacada ? 'bg-surface-2' : 'hover:bg-surface-2',
        )}
      >
        <CartaThumb carta={carta} className="w-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-paper lg:text-[16px]">
            {nomeCarta(carta)}
          </span>
          <span className="set-code block truncate text-[12px] text-muted lg:text-[13px]">
            {numeroImpresso(carta, total)}
            {carta.set_nome && ` · ${carta.set_nome}`}
          </span>
        </span>
      </button>
    </li>
  )
}
