import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { IconeTroca } from '@/components/ui/Icone'
import { useCartasPorId, useProcuradas } from '@/hooks/useAnuncios'
import { useMatches } from '@/hooks/useMatches'
import { cn } from '@/lib/cn'
import { codigoSet, nomeCarta } from '@/lib/types'
import {
  diasParaExpirar,
  type Match,
  parceiro,
  reputacaoTexto,
} from '@/lib/matches'
import { useUsuarioId } from '@/stores/auth'

export default function Matches() {
  const meuId = useUsuarioId()
  const { data: matches, isPending, isError, refetch } = useMatches()

  const ids = useMemo(
    () => (matches ?? []).flatMap((m) => m.itens.map((i) => i.card_id)),
    [matches],
  )
  const { data: cartas } = useCartasPorId(ids)

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5">
      <header className="pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">Trocas possíveis</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Cada uma é alguém que tem o que você procura — e quer o que você
          oferece.
        </p>
      </header>

      <div className="mt-7 flex-1">
        {isPending ? (
          <Esqueleto />
        ) : isError ? (
          <Recuperavel onTentar={() => refetch()} />
        ) : !matches?.length ? (
          <Vazio />
        ) : (
          <ul className="flex flex-col gap-3">
            {matches.map((match) => (
              <li key={match.id}>
                <CartaoMatch
                  match={match}
                  meuId={meuId}
                  cartas={cartas}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CartaoMatch({
  match,
  meuId,
  cartas,
}: {
  match: Match
  meuId: string | undefined
  cartas?: Map<string, import('@/lib/types').Carta>
}) {
  const outro = parceiro(match, meuId)
  const dou = match.itens.find((i) => i.de_user_id === meuId)
  const recebo = match.itens.find((i) => i.para_user_id === meuId)
  const dias = diasParaExpirar(match)
  const reputacao = outro && reputacaoTexto(outro)

  return (
    <Link
      to={`/matches/${match.id}`}
      className="block rounded-[var(--radius-card)] border border-edge bg-surface p-4 transition-colors hover:border-[var(--color-faint)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-paper">
            {outro?.nome_exibicao ?? 'Alguém'}
          </span>
          <span className="set-code block text-[11px] text-muted">
            @{outro?.username}
            {reputacao && ` · ${reputacao}`}
          </span>
        </span>
        <Selo status={match.status} />
      </div>

      <div className="mt-4">
        <LinhaDeTroca
          dou={dou && cartas?.get(dou.card_id)}
          recebo={recebo && cartas?.get(recebo.card_id)}
        />
      </div>

      <p className="mt-4 text-[12px] text-faint">
        {dias === 0
          ? 'Expira hoje'
          : dias === 1
            ? 'Expira amanhã'
            : `Expira em ${dias} dias`}
      </p>
    </Link>
  )
}

function Selo({ status }: { status: Match['status'] }) {
  const mapa: Partial<Record<Match['status'], { texto: string; cor: string }>> = {
    SUGERIDO: { texto: 'nova', cor: 'text-muted border-edge' },
    PENDENTE: {
      texto: 'esperando o outro',
      cor: 'text-want border-[color-mix(in_oklab,var(--color-want)_40%,transparent)]',
    },
    ACEITO: {
      texto: 'combinada',
      cor: 'text-offer border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)]',
    },
  }
  const selo = mapa[status]
  if (!selo) return null

  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap',
        selo.cor,
      )}
    >
      {selo.texto}
    </span>
  )
}

function Esqueleto() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {[0, 1].map((i) => (
        <li
          key={i}
          className="rounded-[var(--radius-card)] border border-edge bg-surface p-4"
        >
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 flex items-center gap-3">
            <div className="aspect-[2.5/3.5] w-14 flex-1 animate-pulse rounded-[10px] bg-surface-2" />
            <div className="aspect-[2.5/3.5] w-14 flex-1 animate-pulse rounded-[10px] bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tela vazia.
 *
 * Enquanto a base for pequena esta é a tela principal, não a exceção: quase todo
 * mundo que se cadastra abre o feed e não encontra troca. Sem mais nada, ela diz
 * "você fez tudo certo e não tem nada" — que é como um marketplace vazio começa
 * a morrer.
 *
 * Quando há gente procurando o que a pessoa oferece, é isso que ela vê primeiro:
 * metade da troca já existe. E o que falta é acionável — o match precisa das
 * duas pernas, então quem tem procura e não tem match precisa querer alguma
 * coisa de volta.
 */
function Vazio() {
  const { data: procuradas } = useProcuradas(true)
  const ids = useMemo(
    () => (procuradas ?? []).map((p) => p.card_id),
    [procuradas],
  )
  const { data: cartas } = useCartasPorId(ids)

  if (!procuradas?.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <div className="grid size-12 place-items-center rounded-2xl border border-edge bg-surface text-muted">
          <IconeTroca className="size-6" />
        </div>
        <p className="mt-4 text-[15px] text-paper">Nenhuma troca possível ainda.</p>
        <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">
          Uma troca aparece quando alguém tem o que você procura e quer o que
          você oferece. Quanto mais cartas nas suas listas, mais chances.
        </p>
        <Link
          to="/minhas-cartas"
          className="mt-5 text-[14px] text-paper underline underline-offset-4"
        >
          Ajustar minhas cartas
        </Link>
      </div>
    )
  }

  return (
    <div className="py-6">
      <div className="rounded-[var(--radius-card)] border border-edge bg-surface p-5">
        <p className="text-[15px] text-paper">
          Nenhuma troca fechada ainda — mas tem gente de olho no que você
          oferece.
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Falta a outra metade: a troca só aparece quando você também quer
          alguma carta de quem procura a sua.
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {procuradas.map((p) => {
            const carta = cartas?.get(p.card_id)
            return (
              <li key={p.card_id} className="flex items-center gap-3">
                {carta ? (
                  <CartaThumb carta={carta} className="w-11 shrink-0" />
                ) : (
                  <div className="aspect-[2.5/3.5] w-11 shrink-0 rounded-[10px] bg-surface-2" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-paper">
                    {carta ? nomeCarta(carta) : 'Carta sua'}
                  </p>
                  <p className="set-code text-[11px] text-muted">
                    {carta && `${codigoSet(carta)} · `}
                    <span className="text-want">
                      {p.procurando === 1
                        ? '1 pessoa procura'
                        : `${p.procurando} pessoas procuram`}
                    </span>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <Link
        to="/minhas-cartas"
        className="mt-3 flex h-13 items-center justify-center rounded-[var(--radius-control)] border border-edge bg-surface-2 text-[15px] text-paper transition-colors hover:border-[var(--color-faint)]"
      >
        Adicionar cartas que eu procuro
      </Link>
    </div>
  )
}

function Recuperavel({ onTentar }: { onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="text-[15px] text-paper">Não deu para carregar as trocas.</p>
      <button
        onClick={onTentar}
        className="mt-5 h-9 rounded-[var(--radius-control)] border border-edge bg-surface-2 px-4 text-[14px] text-paper hover:border-[var(--color-faint)]"
      >
        Tentar de novo
      </button>
    </div>
  )
}
