import { rotuloSet, useCatalogo } from '@/hooks/useCatalogo'
import { cn } from '@/lib/cn'
import { type FiltrosBusca, SEM_FILTRO, temFiltro } from '@/lib/types'

interface FiltroCatalogoProps {
  filtros: FiltrosBusca
  onFiltros: (f: FiltrosBusca) => void
  className?: string
}

/**
 * Filtro por série (bloco) e expansão.
 *
 * `<select>` nativo de propósito: no celular ele abre o seletor do sistema, que
 * ganha de qualquer dropdown que a gente desenhasse — e a lista tem 112
 * expansões, onde rolagem nativa importa. O estilo entra por fora, na casca.
 */
export function FiltroCatalogo({
  filtros,
  onFiltros,
  className,
}: FiltroCatalogoProps) {
  const { data: catalogo } = useCatalogo()

  // Enquanto o catálogo não chega, os seletores aparecem desabilitados em vez de
  // não aparecerem: some o pulo de layout que empurrava a lista para baixo.
  if (!catalogo) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Seletor rotulo="Série" valor="" onValor={() => {}} ativo={false} carregando>
          <option value="">Todas as séries</option>
        </Seletor>
        <Seletor
          rotulo="Expansão"
          valor=""
          onValor={() => {}}
          ativo={false}
          carregando
        >
          <option value="">Todas as expansões</option>
        </Seletor>
      </div>
    )
  }

  // Sem série escolhida, a lista de expansões é o catálogo inteiro em ordem de
  // lançamento — quem sabe o nome do set não deveria ter de saber o bloco antes.
  const setsVisiveis = filtros.serie
    ? (catalogo.setsPorSerie.get(filtros.serie) ?? [])
    : catalogo.sets

  function escolherSerie(serie: string) {
    const novaSerie = serie || null
    // O set escolhido pode não pertencer à série nova; nesse caso ele cai.
    const setAtual = catalogo!.sets.find((s) => s.code === filtros.set)
    const mantemSet =
      setAtual && (!novaSerie || setAtual.serie_code === novaSerie)
    onFiltros({ serie: novaSerie, set: mantemSet ? filtros.set : null })
  }

  function escolherSet(code: string) {
    if (!code) {
      onFiltros({ ...filtros, set: null })
      return
    }
    // Escolher a expansão fixa a série junto: some a chance de o par ficar
    // incoerente ("série sv" + "expansão me01") e devolver zero sem explicação.
    const set = catalogo!.sets.find((s) => s.code === code)
    onFiltros({ serie: set?.serie_code ?? filtros.serie, set: code })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Seletor
        rotulo="Série"
        valor={filtros.serie ?? ''}
        onValor={escolherSerie}
        ativo={filtros.serie !== null}
      >
        <option value="">Todas as séries</option>
        {catalogo.series.map((s) => (
          <option key={s.code} value={s.code}>
            {s.nome}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo="Expansão"
        valor={filtros.set ?? ''}
        onValor={escolherSet}
        ativo={filtros.set !== null}
      >
        <option value="">Todas as expansões</option>
        {setsVisiveis.map((s) => (
          <option key={s.code} value={s.code}>
            {rotuloSet(s)}
          </option>
        ))}
      </Seletor>

      {temFiltro(filtros) && (
        <button
          type="button"
          onClick={() => onFiltros(SEM_FILTRO)}
          className="h-9 rounded-[var(--radius-control)] px-2.5 text-[13px] text-muted transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
        >
          Limpar
        </button>
      )}
    </div>
  )
}

function Seletor({
  rotulo,
  valor,
  onValor,
  ativo,
  carregando,
  children,
}: {
  rotulo: string
  valor: string
  onValor: (v: string) => void
  ativo: boolean
  carregando?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative min-w-0">
      <select
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        aria-label={rotulo}
        disabled={carregando}
        className={cn(
          'h-9 max-w-[min(15rem,60vw)] appearance-none truncate',
          'rounded-[var(--radius-control)] border pr-7 pl-3',
          'text-[13px] transition-colors focus:outline-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
          carregando && 'opacity-50',
          ativo
            ? 'border-[color-mix(in_oklab,var(--color-volt)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-volt)_14%,transparent)] text-paper'
            : 'border-edge bg-surface text-muted hover:text-paper',
        )}
      >
        {children}
      </select>
      <ChevronBaixo
        className={cn(
          'pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2',
          ativo ? 'text-paper' : 'text-faint',
        )}
      />
    </div>
  )
}

function ChevronBaixo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
