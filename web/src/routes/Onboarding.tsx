import NumberFlow from '@number-flow/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { FiltroCatalogo } from '@/components/carta/FiltroCatalogo'
import { CelulaCarta, GradeDeCartas } from '@/components/carta/GradeDeCartas'
import { Button } from '@/components/ui/Button'
import { useCardSearch } from '@/hooks/useCardSearch'
import { useDebounced } from '@/hooks/useDebounced'
import { criarAnunciosEmLote } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  type Carta,
  type FiltrosBusca,
  type ListingKind,
  nomeCarta,
  SEM_FILTRO,
  temFiltro,
} from '@/lib/types'
import { contar, type Selecao, useOnboarding } from '@/stores/onboarding'

const META = 10

export default function Onboarding() {
  const [termo, setTermo] = useState('')
  const [filtros, setFiltros] = useState<FiltrosBusca>(SEM_FILTRO)
  const busca = useDebounced(termo, 250)
  const {
    cartas: resultados,
    total,
    carregando,
    temMais,
    carregarMais,
    carregandoMais,
    atalho,
    ativa,
  } = useCardSearch(busca, filtros)

  const selecoes = useOnboarding((s) => s.selecoes)
  const { total: totalSelecionado } = contar(selecoes)
  const faltam = Math.max(0, META - totalSelecionado)

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 pb-32">
      <Cabecalho total={totalSelecionado} faltam={faltam} />

      <BuscaCartas termo={termo} onTermo={setTermo} />

      <FiltroCatalogo
        filtros={filtros}
        onFiltros={setFiltros}
        className="mt-3"
      />

      {atalho && (
        <p role="status" className="mt-2 text-xs text-muted">
          Lendo como carta{' '}
          <span className="set-code text-paper">{atalho.numero}</span> de{' '}
          <span className="text-paper">{atalho.set.nome}</span>.
        </p>
      )}

      <div className="mt-5 flex-1">
        {!ativa ? (
          <EstadoVazio temSelecoes={totalSelecionado > 0} />
        ) : carregando ? (
          <ListaSkeleton />
        ) : resultados && resultados.length > 0 ? (
          <>
            <Contagem mostrando={resultados.length} total={total} />
            <GradeDeCartas>
              {resultados.map((carta) => (
                <CartaEscolhivel key={carta.id} carta={carta} />
              ))}
            </GradeDeCartas>
            {temMais && (
              <Button
                variant="subtle"
                block
                className="mt-3"
                loading={carregandoMais}
                onClick={() => carregarMais()}
              >
                Mostrar mais
              </Button>
            )}
          </>
        ) : (
          <SemResultados termo={busca} comFiltro={temFiltro(filtros)} />
        )}
      </div>

      <BandejaSelecao total={totalSelecionado} faltam={faltam} />
    </div>
  )
}

/* ---------- Cabeçalho + progresso ---------- */

function Cabecalho({ total, faltam }: { total: number; faltam: number }) {
  const pronto = faltam === 0
  return (
    <header className="pt-8">
      <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
      <h1 className="mt-3 text-[28px] leading-[1.1]">
        Comece pela carta que você mais quer.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Tudo que você colocar aqui fica disponível para troca. Monte suas listas
        de <span className="font-medium text-offer">Ofereço</span> e{' '}
        <span className="font-medium text-want">Procuro</span> — o app encontra
        com quem trocar.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-volt"
            initial={false}
            animate={{ width: `${Math.min(100, (total / META) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 240, damping: 30 }}
          />
        </div>
        <p className="shrink-0 text-sm text-muted">
          {pronto ? (
            <span className="font-medium text-paper">Pronto para o 1º match</span>
          ) : (
            <>
              <NumberFlow
                value={total}
                className="font-semibold text-paper"
              />{' '}
              / {META} cartas
            </>
          )}
        </p>
      </div>
    </header>
  )
}

/* ---------- Campo de busca ---------- */

function BuscaCartas({
  termo,
  onTermo,
}: {
  termo: string
  onTermo: (v: string) => void
}) {
  return (
    <div className="sticky top-3 z-20 mt-6">
      <div className="relative">
        <IconeBusca className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          value={termo}
          onChange={(e) => onTermo(e.target.value)}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Busque: Pikachu, Umbreon, Pesquisa…"
          aria-label="Buscar carta pelo nome"
          className={cn(
            'h-13 w-full rounded-[var(--radius-control)] pl-11 pr-4',
            'bg-surface text-[16px] text-paper placeholder:text-muted',
            'border border-edge shadow-[var(--shadow-card)]',
            'transition-colors focus:border-volt focus:outline-none',
          )}
        />
      </div>
    </div>
  )
}

/* ---------- Célula de resultado ---------- */

function CartaEscolhivel({ carta }: { carta: Carta }) {
  const alternar = useOnboarding((s) => s.alternar)
  const tipo = useOnboarding((s) => s.selecoes[carta.id]?.tipo)

  return (
    <CelulaCarta carta={carta} destaque={tipo}>
      {/* Os dois botões dividem a largura da carta: o alvo de toque cresce e
          fica claro que são a ação daquela carta, não da lista. */}
      <div className="grid grid-cols-2 gap-1.5">
        <BotaoLista
          ativo={tipo === 'OFERTA'}
          tipo="OFERTA"
          onClick={() => alternar(carta, 'OFERTA')}
        />
        <BotaoLista
          ativo={tipo === 'PROCURA'}
          tipo="PROCURA"
          onClick={() => alternar(carta, 'PROCURA')}
        />
      </div>
    </CelulaCarta>
  )
}

function BotaoLista({
  ativo,
  tipo,
  onClick,
}: {
  ativo: boolean
  tipo: ListingKind
  onClick: () => void
}) {
  const oferta = tipo === 'OFERTA'
  const label = oferta ? 'Ofereço' : 'Procuro'
  const cor = oferta ? 'offer' : 'want'
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'h-9 rounded-[var(--radius-control)] px-2 text-[13px] font-medium',
        'transition-[background-color,color,border-color] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
        ativo
          ? cor === 'offer'
            ? 'bg-offer text-[#06231f]'
            : 'bg-want text-[#241703]'
          : cor === 'offer'
            ? 'border border-[color-mix(in_oklab,var(--color-offer)_35%,transparent)] text-offer hover:bg-[color-mix(in_oklab,var(--color-offer)_14%,transparent)]'
            : 'border border-[color-mix(in_oklab,var(--color-want)_32%,transparent)] text-want hover:bg-[color-mix(in_oklab,var(--color-want)_12%,transparent)]',
      )}
    >
      {label}
    </button>
  )
}

/* ---------- Contagem ---------- */

function Contagem({ mostrando, total }: { mostrando: number; total: number }) {
  if (total <= mostrando) return null
  return (
    <p role="status" className="mb-2 text-xs text-muted">
      Mostrando {mostrando} de {total} cartas
    </p>
  )
}

/* ---------- Estados ---------- */

function EstadoVazio({ temSelecoes }: { temSelecoes: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 pt-10 text-center">
      <div className="grid place-items-center rounded-2xl border border-edge bg-surface p-4">
        <IconeBusca className="size-6 text-muted" />
      </div>
      <p className="mt-4 text-[15px] text-muted">
        {temSelecoes
          ? 'Continue adicionando — quanto maior a lista, mais rápido o match aparece.'
          : 'Busque pelo nome, ou escolha uma expansão para navegar carta a carta.'}
      </p>
    </div>
  )
}

function SemResultados({
  termo,
  comFiltro,
}: {
  termo: string
  comFiltro: boolean
}) {
  return (
    <div className="px-6 pt-10 text-center">
      <p className="text-[15px] text-paper">
        {termo ? `Nenhuma carta para “${termo}”.` : 'Nenhuma carta aqui.'}
      </p>
      <p className="mt-1 text-sm text-muted">
        {comFiltro
          ? 'Talvez esteja em outra expansão — tente limpar o filtro.'
          : 'Tente outro nome — em português ou inglês.'}
      </p>
    </div>
  )
}

function ListaSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-card border border-edge-soft p-2"
        >
          <div className="aspect-[2.5/3.5] w-full animate-pulse rounded-[10px] bg-surface-2" />
          <div className="space-y-1.5 px-0.5">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
            <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="h-9 animate-pulse rounded-[var(--radius-control)] bg-surface-2" />
        </li>
      ))}
    </ul>
  )
}

/* ---------- Bandeja de seleção (sticky) ---------- */

function BandejaSelecao({ total, faltam }: { total: number; faltam: number }) {
  const selecoes = useOnboarding((s) => s.selecoes)
  const remover = useOnboarding((s) => s.remover)
  const lista = Object.values(selecoes)
  const pronto = faltam === 0
  const { salvar, salvando } = useSalvarListas(lista)

  return (
    <AnimatePresence>
      {total > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-ink/85 backdrop-blur-md"
        >
          <div className="mx-auto w-full max-w-xl px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {lista.map(({ carta, tipo }) => (
                <li key={carta.id} className="relative shrink-0">
                  <CartaThumb
                    carta={carta}
                    className={cn(
                      'w-10 ring-2',
                      tipo === 'OFERTA' ? 'ring-offer' : 'ring-want',
                    )}
                  />
                  <button
                    onClick={() => remover(carta.id)}
                    aria-label={`Remover ${nomeCarta(carta)}`}
                    className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-edge bg-surface-2 text-muted hover:text-paper"
                  >
                    <span className="text-xs leading-none">×</span>
                  </button>
                </li>
              ))}
            </ul>

            {pronto ? (
              <Button
                variant="primary"
                size="lg"
                block
                loading={salvando}
                onClick={salvar}
              >
                {salvando ? 'Salvando suas listas…' : 'Ver meus matches'}
              </Button>
            ) : (
              <div
                role="status"
                className="flex h-13 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-edge bg-surface-2 text-[15px] text-muted"
              >
                Faltam
                <NumberFlow value={faltam} className="font-bold text-paper" />
                {faltam === 1 ? 'carta' : 'cartas'} para o 1º match
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Persistência do lote ---------- */

/**
 * Manda as seleções para POST /me/listings/bulk — o único write, já autenticado.
 *
 * O onboarding ainda não pergunta condição nem acabamento, então vai o padrão do
 * schema: NM e finish NORMAL (id 1). O upsert da API é idempotente, então repetir
 * o envio depois de um erro de rede não duplica nada.
 */
function useSalvarListas(lista: Selecao[]) {
  const limpar = useOnboarding((s) => s.limpar)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () =>
      criarAnunciosEmLote(
        lista.map(({ carta, tipo }) => ({ card_id: carta.id, tipo })),
      ),
    onSuccess: async () => {
      limpar()
      // O bulk também marca onboarding_ok; o perfil em cache ficou velho.
      await queryClient.invalidateQueries({ queryKey: ['perfil'] })
      navigate('/pronto', { replace: true })
    },
    onError: (erro) => {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível salvar suas listas. Tente de novo.',
      )
    },
  })

  return { salvar: () => mutation.mutate(), salvando: mutation.isPending }
}

/* ---------- Ícone ---------- */

function IconeBusca({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}
