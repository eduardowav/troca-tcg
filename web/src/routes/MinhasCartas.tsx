import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { Button } from '@/components/ui/Button'
import {
  type Anuncio,
  CONDICOES,
  type Condicao,
  PRIORIDADES,
} from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { type Carta, codigoSet, type ListingKind, nomeCarta } from '@/lib/types'
import {
  useAnuncios,
  useCartasPorId,
  useEditarAnuncio,
  useRemoverAnuncio,
} from '@/hooks/useAnuncios'

export default function MinhasCartas() {
  const [aba, setAba] = useState<ListingKind>('OFERTA')
  const { data: anuncios, isPending, isError, refetch } = useAnuncios()

  const ids = useMemo(() => (anuncios ?? []).map((a) => a.card_id), [anuncios])
  const { data: cartas } = useCartasPorId(ids)

  const daAba = useMemo(
    () => (anuncios ?? []).filter((a) => a.tipo === aba),
    [anuncios, aba],
  )

  const totais = useMemo(
    () => ({
      OFERTA: (anuncios ?? []).filter((a) => a.tipo === 'OFERTA').length,
      PROCURA: (anuncios ?? []).filter((a) => a.tipo === 'PROCURA').length,
    }),
    [anuncios],
  )

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 pb-16">
      <header className="pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">Minhas cartas</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          O que você oferece e o que procura. Toque numa carta para ajustar
          quantidade, condição e prioridade.
        </p>
      </header>

      <Abas aba={aba} onAba={setAba} totais={totais} />

      <div className="mt-5 flex-1">
        {isPending ? (
          <Esqueleto />
        ) : isError ? (
          <Recuperavel onTentar={() => refetch()} />
        ) : daAba.length === 0 ? (
          <Vazio aba={aba} />
        ) : (
          <ul className="flex flex-col gap-2">
            {daAba.map((anuncio) => (
              <Linha
                key={anuncio.id}
                anuncio={anuncio}
                carta={cartas?.get(anuncio.card_id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------- Abas Ofereço / Procuro ---------- */

function Abas({
  aba,
  onAba,
  totais,
}: {
  aba: ListingKind
  onAba: (a: ListingKind) => void
  totais: Record<ListingKind, number>
}) {
  return (
    <div
      role="tablist"
      aria-label="Ofereço ou Procuro"
      className="mt-7 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-edge bg-surface p-1"
    >
      {(['OFERTA', 'PROCURA'] as const).map((t) => {
        const ativo = aba === t
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onAba(t)}
            className={cn(
              'relative h-9 rounded-[7px] text-[14px] font-medium transition-colors',
              ativo
                ? t === 'OFERTA'
                  ? 'text-offer'
                  : 'text-want'
                : 'text-muted hover:text-paper',
            )}
          >
            {ativo && (
              <motion.span
                layoutId="aba-minhas-cartas"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                className="absolute inset-0 rounded-[7px] bg-surface-2 shadow-[var(--shadow-card)]"
              />
            )}
            <span className="relative">
              {t === 'OFERTA' ? 'Ofereço' : 'Procuro'}
              <span className="ml-1.5 opacity-70">{totais[t]}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Linha da carta, com editor inline ---------- */

function Linha({ anuncio, carta }: { anuncio: Anuncio; carta?: Carta }) {
  const [aberto, setAberto] = useState(false)
  const editar = useEditarAnuncio()
  const remover = useRemoverAnuncio()

  const cor = anuncio.tipo === 'OFERTA' ? 'ring-offer' : 'ring-want'

  function aplicar(dados: Parameters<typeof editar.mutate>[0]['dados']) {
    editar.mutate(
      { id: anuncio.id, dados },
      {
        onError: (erro) =>
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível salvar a alteração.',
          ),
      },
    )
  }

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-edge bg-surface">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
      >
        {carta ? (
          <CartaThumb carta={carta} className={cn('w-11 shrink-0 ring-2', cor)} />
        ) : (
          <div className="aspect-[2.5/3.5] w-11 shrink-0 animate-pulse rounded-[10px] bg-surface-2" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-paper">
            {carta ? nomeCarta(carta) : 'Carregando…'}
          </span>
          <span className="set-code mt-0.5 block text-[11px] text-muted">
            {carta ? codigoSet(carta) : '—'}
          </span>
          <span className="mt-1 block text-[13px] text-muted">
            {resumo(anuncio)}
          </span>
        </span>

        <span
          aria-hidden
          className={cn(
            'shrink-0 text-muted transition-transform duration-200',
            aberto && 'rotate-180',
          )}
        >
          ⌄
        </span>
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 border-t border-edge-soft px-3 py-4">
              <Quantidade
                valor={anuncio.quantidade}
                onMudar={(quantidade) => aplicar({ quantidade })}
              />

              <Escolha
                rotulo="Condição"
                opcoes={CONDICOES.map((c) => ({
                  valor: c.valor,
                  rotulo: c.rotulo,
                  titulo: c.dica,
                }))}
                valor={anuncio.condicao}
                onMudar={(condicao) => aplicar({ condicao: condicao as Condicao })}
              />

              <Escolha
                rotulo="Prioridade"
                opcoes={PRIORIDADES.map((p) => ({
                  valor: p.valor,
                  rotulo: p.rotulo,
                }))}
                valor={anuncio.prioridade}
                onMudar={(prioridade) =>
                  aplicar({ prioridade: prioridade as number })
                }
              />

              {/* Só faz sentido em PROCURA: é o matcher que pode sugerir outro
                  acabamento (db/schema/05_listings.sql). */}
              {anuncio.tipo === 'PROCURA' && (
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={anuncio.aceita_qualquer_finish}
                    onChange={(e) =>
                      aplicar({ aceita_qualquer_finish: e.target.checked })
                    }
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-volt)]"
                  />
                  <span className="text-[14px] leading-relaxed text-muted">
                    Aceito qualquer acabamento — aparecem mais trocas possíveis,
                    marcadas quando o acabamento for diferente.
                  </span>
                </label>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={remover.isPending}
                  onClick={() =>
                    remover.mutate(anuncio.id, {
                      onSuccess: () =>
                        toast.success(
                          `${carta ? nomeCarta(carta) : 'Carta'} saiu da lista.`,
                        ),
                      onError: () =>
                        toast.error('Não foi possível remover agora.'),
                    })
                  }
                  className="text-alert hover:text-alert"
                >
                  Remover da lista
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function resumo(a: Anuncio): string {
  const prioridade = PRIORIDADES.find((p) => p.valor === a.prioridade)?.rotulo
  return [`${a.quantidade}×`, a.condicao, prioridade].filter(Boolean).join(' · ')
}

/* ---------- Controles ---------- */

function Quantidade({
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

function Escolha<T extends string | number>({
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

/* ---------- Estados da lista ---------- */

function Esqueleto() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-[var(--radius-card)] border border-edge bg-surface p-3"
        >
          <div className="aspect-[2.5/3.5] w-11 shrink-0 animate-pulse rounded-[10px] bg-surface-2" />
          <div className="flex-1">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Vazio({ aba }: { aba: ListingKind }) {
  const oferta = aba === 'OFERTA'
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-edge bg-surface">
        <span aria-hidden className="text-xl">
          {oferta ? '🎴' : '🔍'}
        </span>
      </div>
      <p className="mt-4 text-[15px] text-paper">
        {oferta
          ? 'Você ainda não oferece nenhuma carta.'
          : 'Você ainda não procura nenhuma carta.'}
      </p>
      <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">
        {oferta
          ? 'As cartas repetidas que você topa trocar entram aqui.'
          : 'As cartas que faltam para você entram aqui — é o que o app usa para achar match.'}
      </p>
      <Link
        to="/onboarding"
        className="mt-5 text-[14px] text-paper underline underline-offset-4"
      >
        Adicionar cartas
      </Link>
    </div>
  )
}

function Recuperavel({ onTentar }: { onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="text-[15px] text-paper">Não deu para carregar suas cartas.</p>
      <p className="mt-1.5 text-[14px] text-muted">
        Pode ser a conexão. Tente de novo.
      </p>
      <Button variant="subtle" size="sm" className="mt-5" onClick={onTentar}>
        Tentar de novo
      </Button>
    </div>
  )
}
