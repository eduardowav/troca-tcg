import { useMemo, useState } from 'react'

import { AcaoSecundaria, ParDeCartas } from '@/components/brutal/Pecas'
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
      <h2 className="font-titulo text-[18px] font-black text-tinta">
        Atividade recente
      </h2>

      {isPending ? (
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              aria-hidden
              className="cartela h-[132px] animate-pulse rounded-card bg-surface"
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
  {
    rotulo: string
    /** O texto do selo, curto — é ele que dá a leitura de relance. */
    badge: string
    /** A pintura do selo. Azul só para a que deu certo. */
    selo: string
    cor: string
    rotulos: { dou: string; recebo: string }
  }
> = {
  CONCLUIDO: {
    rotulo: 'Troca concluída',
    badge: 'Troca',
    selo: 'border-azul bg-meu text-azul',
    cor: 'text-offer',
    rotulos: { dou: 'Você deu', recebo: 'Você recebeu' },
  },
  FURADO: {
    rotulo: 'Não aconteceu',
    badge: 'Furo',
    selo: 'border-alerta bg-alerta-fraco text-alerta',
    cor: 'text-alert',
    rotulos: { dou: 'Você daria', recebo: 'Você receberia' },
  },
  EXPIRADO: {
    rotulo: 'Expirou',
    badge: 'Prazo',
    selo: 'border-tinta bg-papel text-apagado',
    cor: 'text-faint',
    rotulos: { dou: 'Você daria', recebo: 'Você receberia' },
  },
  // "Desmarcada", sem dizer por quem: a mesma linha aparece no histórico dos
  // dois, e quem recebeu a desistência não desmarcou nada. Quem quiser saber
  // abre a troca, que tem a frase certa para cada lado. A cor é a neutra, não a
  // de alerta — desmarcar avisando é o oposto de furar.
  CANCELADO: {
    rotulo: 'Desmarcada',
    badge: 'Cancelada',
    selo: 'border-tinta bg-papel text-apagado',
    cor: 'text-muted',
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

  const [aberta, setAberta] = useState(false)

  return (
    <li>
      {/* A linha é o formato de "atividade recente" do arquivo: selo, uma frase
          e a data. Ela não navega — expande. Abrir a troca inteira só para
          conferir quais cartas eram custava sair do perfil e voltar, e a
          resposta cabe aqui embaixo. O link para o detalhe continua existindo,
          dentro do que abriu, porque é lá que o contato reaparece. */}
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-imagem)] border-2 border-tinta bg-cartela p-3 text-left transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
      >
        <span
          className={cn(
            'shrink-0 rounded-[4px] border px-1.5 py-1 font-dado text-[10px] font-bold uppercase',
            desfecho.selo,
          )}
        >
          {desfecho.badge}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-corpo text-[13px] font-bold text-tinta">
            {desfecho.rotulo} com {outro?.nome_exibicao ?? 'alguém'}
          </span>
          {quando && (
            <span className="font-dado text-[10px] text-apagado">{quando}</span>
          )}
        </span>

        <span aria-hidden className="shrink-0 font-dado text-[11px] text-apagado">
          {aberta ? '▲' : '▼'}
        </span>
      </button>

      {aberta && (
        <div className="mt-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-papel p-3">
          {/* Mesma regra do detalhe: numa troca que aconteceu, cada carta
              aparece do lado de quem ficou com ela. */}
          {/* O par tem teto de largura, então numa coluna larga ele deixaria
              metade do painel vazia à direita. Centralizado, o vão fica dos dois
              lados e lê como margem em vez de sobra. */}
          <div className="mx-auto max-w-xs">
            <ParDeCartas
              dou={dou && cartas?.get(dou.card_id)}
              recebo={recebo && cartas?.get(recebo.card_id)}
              rotulos={desfecho.rotulos}
              trocado={troca.status === 'CONCLUIDO'}
            />
          </div>
          <AcaoSecundaria to={`/matches/${troca.id}`} className="mt-3">
            Abrir a troca
          </AcaoSecundaria>
        </div>
      )}
    </li>
  )
}

function Vazio() {
  return (
    <p className="cartela mt-3 rounded-card border border-edge-soft px-4 py-6 text-center text-[14px] leading-relaxed text-muted">
      Nenhuma troca terminou ainda. Quando você e a outra pessoa confirmarem que
      se encontraram, a troca aparece aqui — e entra na sua reputação.
    </p>
  )
}
