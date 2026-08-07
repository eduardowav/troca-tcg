import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { BotaoBrutal, Cartela, ParDeLotes, Selo } from '@/components/brutal/Pecas'
import { AbasDaVitrine } from '@/components/proposta/AbasDaVitrine'
import { paraLote } from '@/components/proposta/lote'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { usePropostas } from '@/hooks/usePropostas'
import { estiloBotao } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  type Caixa,
  dataDaProposta,
  DESFECHO,
  desfechoTexto,
  prazoApertado,
  prazoDaProposta,
  type PropostaResumo,
} from '@/lib/propostas'
import type { Carta } from '@/lib/types'

/**
 * As propostas em aberto e as já encerradas.
 *
 * Quatro caixas, e a ordem delas é a ordem da urgência: o que espera resposta
 * minha vem primeiro, porque é a única lista em que a pessoa é o gargalo. O
 * histórico fica por último — ele é para consultar, não para agir.
 */
const CAIXAS: { valor: Caixa; rotulo: string }[] = [
  { valor: 'minha_vez', rotulo: 'Minha vez' },
  { valor: 'recebidas', rotulo: 'Recebidas' },
  { valor: 'enviadas', rotulo: 'Enviadas' },
  { valor: 'historico', rotulo: 'Encerradas' },
]

const SOBRE_A_CAIXA: Record<Caixa, string> = {
  minha_vez:
    'Cada uma espera uma resposta sua. Sem resposta em 72 horas, ela vence sozinha — e a carta volta a ficar livre para outra pessoa.',
  recebidas:
    'Propostas que chegaram até você e continuam abertas, inclusive as que já estão esperando a outra pessoa depois de você contrapropor.',
  enviadas:
    'As que você abriu e ainda estão de pé. Enquanto ninguém responder, dá para retirar sem prejuízo nenhum.',
  historico:
    'O que já terminou: as que viraram troca, as recusadas, as retiradas e as que venceram o prazo. Nada aqui conta na sua reputação — reputação é do encontro, não da negociação.',
}

function caixaDaUrl(valor: string | null): Caixa {
  return CAIXAS.some((c) => c.valor === valor) ? (valor as Caixa) : 'minha_vez'
}

export default function Propostas() {
  const [params, setParams] = useSearchParams()
  const caixa = caixaDaUrl(params.get('caixa'))

  const { data: propostas, isPending, isError, refetch } = usePropostas(caixa)

  const ids = useMemo(
    () =>
      (propostas ?? []).flatMap((p) =>
        [...(p.atual?.quero ?? []), ...(p.atual?.ofereco ?? [])].map(
          (i) => i.card_id,
        ),
      ),
    [propostas],
  )
  const { data: cartas } = useCartasPorId(ids)

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 pb-8 2xl:max-w-[120rem]">
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Propostas
        </h1>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          Conversas de troca com prazo de 72 horas. Cada rodada é uma resposta —
          aceitar, recusar ou trocar o que vem.
        </p>
      </header>

      <AbasDaVitrine className="mt-5" />

      <div className="mt-4 flex w-full max-w-xl flex-wrap gap-2">
        {CAIXAS.map((c) => (
          <button
            key={c.valor}
            type="button"
            onClick={() =>
              setParams(c.valor === 'minha_vez' ? {} : { caixa: c.valor }, {
                replace: true,
              })
            }
            aria-pressed={c.valor === caixa}
            className={cn(
              'rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-1.5',
              'font-titulo text-[12px] font-extrabold uppercase transition-shadow',
              c.valor === caixa
                ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            {c.rotulo}
          </button>
        ))}
      </div>

      {/* Uma linha por caixa. As quatro listas parecem a mesma coisa de longe —
          cartões com cartas e um selo — e é esta frase que diz o que cada uma
          responde, inclusive o que *não* está ali. */}
      <p className="mt-3 w-full max-w-xl font-corpo text-[13px] leading-relaxed text-apagado">
        {SOBRE_A_CAIXA[caixa]}
      </p>

      <div className="mt-5 flex-1">
        {isPending ? (
          <p className="py-10 text-center font-corpo text-[15px] text-apagado">
            Carregando…
          </p>
        ) : isError ? (
          <div className="flex flex-col items-center py-14 text-center">
            <p className="font-titulo text-[17px] font-bold text-tinta">
              Não deu para carregar as propostas.
            </p>
            <button onClick={() => refetch()} className="mt-5">
              <BotaoBrutal>Tentar de novo</BotaoBrutal>
            </button>
          </div>
        ) : !propostas?.length ? (
          <Vazio caixa={caixa} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {propostas.map((proposta) => (
              <li key={proposta.id}>
                <CartaoProposta proposta={proposta} cartas={cartas} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CartaoProposta({
  proposta,
  cartas,
}: {
  proposta: PropostaResumo
  cartas?: Map<string, Carta>
}) {
  const prazo = prazoDaProposta(proposta)
  const rodada = proposta.atual

  // A rodada guarda os itens pela perspectiva de quem a jogou. Aqui a leitura é
  // sempre a minha: o que **eu** recebo e o que **eu** dou. Sem esta inversão, a
  // proposta que eu recebi apareceria com as cartas trocadas de lado.
  const souEuQuemJogou = rodada?.por !== proposta.com
  const recebo = souEuQuemJogou ? rodada?.quero : rodada?.ofereco
  const dou = souEuQuemJogou ? rodada?.ofereco : rodada?.quero

  // Encerrada sem virar troca: as cartas não trocaram de mão, e o cartão inteiro
  // muda de tempo verbal por causa disso.
  const naoRolou =
    proposta.status !== 'ABERTA' && proposta.status !== 'ACEITA'

  return (
    <Cartela className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-meu font-titulo text-[15px] font-black text-tinta">
          {(proposta.com_nome || proposta.com).charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-titulo text-[15px] font-bold text-tinta">
            @{proposta.com}
          </span>
          <span className="font-dado text-[11px] uppercase text-apagado">
            Rodada {proposta.rodada}
          </span>
        </span>

        {proposta.status === 'ABERTA' ? (
          <Selo tom={proposta.minha_vez ? 'acao' : 'neutro'}>
            {proposta.minha_vez ? 'sua vez' : 'aguardando'}
          </Selo>
        ) : (
          <Selo>{DESFECHO[proposta.status]}</Selo>
        )}
      </div>

      {/* A mesma leitura do feed de trocas: o que sai da sua mão à esquerda, o
          que entra à direita, a seta no meio. Tempo verbal muda quando a troca
          não vai acontecer — "você recebe" afirmaria uma entrega que não houve. */}
      <ParDeLotes
        dou={paraLote(dou, cartas)}
        recebo={paraLote(recebo, cartas)}
        rotulos={{
          dou: naoRolou ? 'Você daria' : 'Você dá',
          recebo: naoRolou ? 'Você receberia' : 'Você recebe',
        }}
        // Duas cartas por lado numa lista; o resto vira "+N". Um lote de seis
        // esticaria o cartão até a altura da tela e a lista perderia o sentido.
        limite={2}
      />

      {/* O que aconteceu, em uma frase — só nas encerradas. "Recusada" sozinho
          não diz se fui eu que recusei ou se recusaram a minha proposta, e é
          isso que a pessoa procura semanas depois. */}
      {proposta.status !== 'ABERTA' && (
        <p className="font-corpo text-[13px] leading-snug text-apagado">
          {desfechoTexto(proposta)}
          {dataDaProposta(proposta.respondida_em) &&
            ` · ${dataDaProposta(proposta.respondida_em)}`}
        </p>
      )}

      <hr className="border-0 border-t-2 border-dashed border-tinta/25" />

      <div className="mt-auto flex items-center justify-between gap-3">
        {/* Aberta mostra prazo, que é o que decide o dia de quem lê. Encerrada
            mostra quando começou — o desfecho já está dito na linha acima, e
            repeti-lo aqui seria a mesma frase duas vezes no mesmo cartão. */}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-dado text-[10px] uppercase text-apagado">
            {proposta.status === 'ABERTA' ? 'Responder em' : 'Aberta em'}
          </span>
          <span
            className={cn(
              'truncate font-dado text-[12px] font-bold',
              proposta.status === 'ABERTA' && prazoApertado(proposta)
                ? 'text-azul'
                : 'text-tinta',
            )}
          >
            {proposta.status === 'ABERTA'
              ? (prazo ?? '—')
              : (dataDaProposta(proposta.criada_em) ?? '—')}
          </span>
        </span>

        {/* A que virou troca leva direto para a troca: dali em diante o assunto
            é encontro e contato, e a proposta já não tem o que dizer. */}
        {proposta.status === 'ACEITA' && proposta.match_id ? (
          <Link
            to={`/matches/${proposta.match_id}`}
            className={estiloBotao({ variant: 'primary', size: 'sm' })}
          >
            Abrir a troca
          </Link>
        ) : (
          <BotaoBrutal to={`/propostas/${proposta.id}`}>
            {proposta.status === 'ABERTA' && proposta.minha_vez
              ? 'Responder'
              : 'Ver'}
          </BotaoBrutal>
        )}
      </div>
    </Cartela>
  )
}


function Vazio({ caixa }: { caixa: Caixa }) {
  const frases: Record<Caixa, { titulo: string; texto: string }> = {
    minha_vez: {
      titulo: 'Nada esperando por você.',
      texto:
        'Quando alguém propuser uma troca ou responder a uma sua, ela aparece aqui.',
    },
    recebidas: {
      titulo: 'Ninguém propôs nada ainda.',
      texto:
        'Quanto mais cartas no seu Ofereço, mais gente encontra você pela vitrine.',
    },
    enviadas: {
      titulo: 'Você ainda não propôs nada.',
      texto:
        'A vitrine mostra o que a comunidade tem. Ache uma carta e ofereça algo em troca.',
    },
    historico: {
      titulo: 'Nenhuma proposta encerrada.',
      texto:
        'Aqui ficam as que viraram troca, as recusadas e as que venceram o prazo.',
    },
  }
  const frase = frases[caixa]

  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="font-titulo text-[17px] font-bold text-tinta">
        {frase.titulo}
      </p>
      <p className="mt-2 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
        {frase.texto}
      </p>
      <BotaoBrutal to="/vitrine" className="mt-6">
        Abrir a vitrine
      </BotaoBrutal>
    </div>
  )
}
