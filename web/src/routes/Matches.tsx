import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { CelulaCarta, GradeDeCartas } from '@/components/carta/GradeDeCartas'
import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { IconeTroca } from '@/components/ui/Icone'
import { useCartasPorId, useProcuradas } from '@/hooks/useAnuncios'
import { useMatches } from '@/hooks/useMatches'
import type { CartaProcurada } from '@/lib/anuncios'
import { cn } from '@/lib/cn'
import {
  euAceitei,
  type Match,
  parceiro,
  prazoTexto,
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
    // Mesma moldura de Minhas cartas e do Onboarding: container largo para as
    // cartas respirarem, coluna estreita para o texto — linha longa cansa de ler.
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] 2xl:max-w-[120rem] flex-col px-5">
      <header className="w-full max-w-xl pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1] lg:text-[34px]">Trocas possíveis</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted lg:text-[16px]">
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
          // Grade como nas outras telas: no desktop as trocas ficam lado a lado
          // em vez de uma coluna estreita com metade da tela vazia.
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {matches.map((match) => (
              <li key={match.id}>
                <CartaoMatch match={match} meuId={meuId} cartas={cartas} />
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
  const prazo = prazoTexto(match)
  const reputacao = outro && reputacaoTexto(outro)

  return (
    <Link
      to={`/matches/${match.id}`}
      className="block rounded-[var(--radius-card)] border border-edge bg-surface p-4 transition-colors hover:border-[var(--color-faint)] lg:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-paper lg:text-[17px]">
            {outro?.nome_exibicao ?? 'Alguém'}
          </span>
          <span className="set-code block text-[11px] text-muted lg:text-[12px]">
            @{outro?.username}
            {reputacao && ` · ${reputacao}`}
          </span>
        </span>
        <Selo status={match.status} jaAceitei={euAceitei(match, meuId)} />
      </div>

      <div className="mt-4">
        <LinhaDeTroca
          dou={dou && cartas?.get(dou.card_id)}
          recebo={recebo && cartas?.get(recebo.card_id)}
        />
      </div>

      {prazo && (
        <p className="mt-4 text-[12px] text-faint lg:text-[13px]">{prazo}</p>
      )}
    </Link>
  )
}

/**
 * PENDENTE quer dizer "alguém aceitou e falta alguém", e isso é coisa oposta
 * conforme quem aceitou: se fui eu, a bola está com a outra pessoa; se foi ela,
 * a bola está comigo — e aí é uma chamada para agir, não um aviso de espera.
 * O detalhe já fazia essa distinção; o feed dizia "esperando o outro" nos dois
 * casos, e mandava a pessoa esperar justamente quando faltava ela.
 *
 * A distinção estava só nas palavras, e as duas saíam no mesmo laranja de
 * Procuro: numa lista, a linha em que não há nada a fazer chamava tanta atenção
 * quanto a única que depende da pessoa. Agora "falta você" é a única com fundo —
 * é o selo que existe para ser perseguido, e a métrica-mãe é troca concluída.
 * "Esperando o outro" desce para o cinza de espera, junto com "nova".
 */
function Selo({
  status,
  jaAceitei,
}: {
  status: Match['status']
  jaAceitei: boolean
}) {
  const mapa: Partial<Record<Match['status'], { texto: string; cor: string }>> = {
    SUGERIDO: { texto: 'nova', cor: 'text-muted border-edge' },
    PENDENTE: jaAceitei
      ? { texto: 'esperando o outro', cor: 'text-muted border-edge' }
      : {
          texto: 'falta você',
          cor: 'text-want border-[color-mix(in_oklab,var(--color-want)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-want)_12%,transparent)] font-medium',
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
        'shrink-0 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap lg:text-[12px]',
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
        <p className="mt-4 text-[15px] text-paper lg:text-[16px]">Nenhuma troca possível ainda.</p>
        <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted lg:text-[15px]">
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
    <div className="pb-6">
      <div className="w-full max-w-xl">
        <p className="text-[15px] text-paper lg:text-[16px]">
          Nenhuma troca fechada ainda — mas tem gente de olho no que você
          oferece.
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted lg:text-[15px]">
          Falta a outra metade: a troca só aparece quando você também quer
          alguma carta de quem procura a sua.
        </p>
      </div>

      {/* Mesma grade e mesma célula das telas de Ofereço e Procuro — são cartas
          suas, e ler diferente aqui faria parecer outra coisa. O destaque de
          OFERTA é o mesmo que Minhas cartas usa para o que você oferece. */}
      <GradeDeCartas className="mt-5">
        {procuradas.map((p) => {
          const carta = cartas?.get(p.card_id)
          if (!carta) return null
          return (
            <CelulaCarta key={p.card_id} carta={carta} destaque="OFERTA">
              <QuemQuer procurada={p} />
            </CelulaCarta>
          )
        })}
      </GradeDeCartas>

      <Link
        to="/minhas-cartas"
        className="mt-4 flex h-13 w-full max-w-xl items-center justify-center rounded-[var(--radius-control)] border border-edge bg-surface-2 text-[15px] text-paper transition-colors hover:border-[var(--color-faint)]"
      >
        Adicionar cartas que eu procuro
      </Link>
    </div>
  )
}

/**
 * Quem procura esta carta.
 *
 * Nomeia as pessoas em vez de só contar — decisão do Eduardo: a tela fica
 * concreta com gente, e um número não dá vontade de voltar. Contato continua
 * fora: a API não manda, e quem quiser falar precisa do aceite mútuo, que é o
 * que protege os dois lados.
 */
function QuemQuer({ procurada }: { procurada: CartaProcurada }) {
  const restantes = procurada.procurando - procurada.pessoas.length

  return (
    <div className="rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-want)_32%,transparent)] bg-[color-mix(in_oklab,var(--color-want)_10%,transparent)] px-2 py-1.5">
      <p className="text-[11px] font-medium text-want lg:text-[12px]">
        {procurada.procurando === 1
          ? '1 pessoa procura'
          : `${procurada.procurando} pessoas procuram`}
      </p>
      <p className="set-code mt-1 text-[10px] leading-relaxed break-words text-muted lg:text-[11px]">
        {procurada.pessoas.map((q) => `@${q.username}`).join(', ')}
        {restantes > 0 && ` e mais ${restantes}`}
      </p>
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
