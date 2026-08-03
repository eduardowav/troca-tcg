import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useHistorico } from '@/hooks/useMatches'
import { cn } from '@/lib/cn'
import {
  dataDoDesfecho,
  type Desfecho,
  type MatchEncerrado,
  parceiro,
} from '@/lib/matches'
import type { Carta } from '@/lib/types'
import { useUsuarioId } from '@/stores/auth'

/**
 * O histórico de trocas, dentro do perfil.
 *
 * Mora logo abaixo dos contadores de reputação porque é a resposta para a
 * pergunta que eles levantam: "1 concluída" não diz *qual*, e um número sem como
 * conferir é um número em que não se confia — inclusive o próprio.
 *
 * Cada linha leva ao detalhe da troca, que é onde o contato volta a aparecer:
 * retomar assunto com quem você já trocou é caso real, e ficaria sem caminho se
 * a troca só existisse enquanto estava aberta no feed.
 */
export function MinhasTrocas() {
  const { data: trocas, isPending, isError } = useHistorico()
  const meuId = useUsuarioId()

  // Um pedido de cartas para a lista inteira, não um por linha: `useCartasPorId`
  // ordena e deduplica a chave, então as duas cartas de cada troca vêm juntas.
  const ids = useMemo(
    () => (trocas ?? []).flatMap((t) => t.itens.map((i) => i.card_id)),
    [trocas],
  )
  const { data: cartas } = useCartasPorId(ids)

  // Erro aqui não pode derrubar o perfil: quem abriu a tela veio editar o nome
  // ou conferir a reputação, e as duas coisas continuam funcionando sem isto.
  if (isError) return null

  return (
    <section className="mt-10">
      <header className="flex items-baseline gap-2 border-b border-edge-soft pb-2">
        <h2 className="text-[18px] font-medium text-paper">Minhas trocas</h2>
        {trocas && trocas.length > 0 && (
          <span className="set-code text-[13px] text-muted">{trocas.length}</span>
        )}
        <span className="ml-auto text-[13px] text-faint">o que já terminou</span>
      </header>

      {isPending ? (
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-[132px] animate-pulse rounded-card bg-surface"
            />
          ))}
        </div>
      ) : !trocas || trocas.length === 0 ? (
        <Vazio />
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {trocas.map((troca) => (
            <Linha
              key={troca.id}
              troca={troca}
              meuId={meuId}
              cartas={cartas}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Como cada desfecho se anuncia.
 *
 * "Não aconteceu" em vez de "furada": o rótulo aparece no perfil de quem levou o
 * furo tanto quanto no de quem furou, e a tela não sabe de quem foi a culpa.
 * Expirada ganha texto próprio porque é o caso que mais confunde — a pessoa
 * aceitou, nada aconteceu, e a troca sumiu do feed sozinha.
 */
const DESFECHOS: Record<
  Desfecho,
  { rotulo: string; cor: string; rotulos: { dou: string; recebo: string } }
> = {
  CONCLUIDO: {
    rotulo: 'Concluída',
    cor: 'text-offer',
    rotulos: { dou: 'Você deu', recebo: 'Você recebeu' },
  },
  FURADO: {
    rotulo: 'Não aconteceu',
    cor: 'text-alert',
    rotulos: { dou: 'Você daria', recebo: 'Você receberia' },
  },
  EXPIRADO: {
    rotulo: 'Expirou sem acontecer',
    cor: 'text-faint',
    rotulos: { dou: 'Você daria', recebo: 'Você receberia' },
  },
}

function Linha({
  troca,
  meuId,
  cartas,
}: {
  troca: MatchEncerrado
  meuId: string | undefined
  cartas?: Map<string, Carta>
}) {
  const outro = parceiro(troca, meuId)
  const dou = troca.itens.find((i) => i.de_user_id === meuId)
  const recebo = troca.itens.find((i) => i.para_user_id === meuId)
  const desfecho = DESFECHOS[troca.status]
  const quando = dataDoDesfecho(troca.desfecho_em)

  return (
    <li>
      <Link
        to={`/matches/${troca.id}`}
        className={cn(
          'block rounded-card border border-edge bg-surface p-4',
          'transition-colors hover:border-[var(--color-faint)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
        )}
      >
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] text-paper">
            {outro?.nome_exibicao ?? 'Alguém'}
          </p>
          {quando && (
            <span className="shrink-0 text-[12px] text-faint">{quando}</span>
          )}
        </div>
        <p className={cn('mt-0.5 text-[13px]', desfecho.cor)}>
          {desfecho.rotulo}
        </p>

        {/* Mesma regra do detalhe: numa troca que aconteceu, cada carta aparece
            do lado de quem ficou com ela. Nas que furaram ou expiraram, não —
            ali a carta não saiu da mão de ninguém. */}
        <div className="mt-3">
          <LinhaDeTroca
            dou={dou && cartas?.get(dou.card_id)}
            recebo={recebo && cartas?.get(recebo.card_id)}
            rotulos={desfecho.rotulos}
            trocado={troca.status === 'CONCLUIDO'}
          />
        </div>
      </Link>
    </li>
  )
}

function Vazio() {
  return (
    <p className="mt-3 rounded-card border border-edge-soft px-4 py-6 text-center text-[14px] leading-relaxed text-muted">
      Nenhuma troca terminou ainda. Quando você e a outra pessoa confirmarem que
      se encontraram, a troca aparece aqui — e entra na sua reputação.
    </p>
  )
}
