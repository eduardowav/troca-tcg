import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  AcaoSecundaria,
  Cartela,
  LinkNoTexto,
  ParDeLotes,
  Selo,
  totalDoLote,
} from '@/components/brutal/Pecas'
import { paraLote } from '@/components/proposta/lote'
import {
  ModalTrocaDesigual,
  ResumoDesigual,
} from '@/components/TrocaDesigual'
import { MontarProposta } from '@/components/proposta/MontarProposta'
import { Button, estiloBotao } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useMarcaOculta } from '@/hooks/useMundo'
import type { Acabamento } from '@/lib/acabamentos'
import {
  useAceitarProposta,
  useContrapor,
  useProposta,
  useRecusarProposta,
  useRetirarProposta,
} from '@/hooks/usePropostas'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  dataDaProposta,
  DESFECHO,
  desfechoExplicado,
  desfechoTexto,
  type ItemProposta,
  type ItensDaProposta,
  MAX_RODADAS,
  podeContrapor,
  podeRetirar,
  prazoDaProposta,
  type Proposta,
  type RodadaProposta,
  rodadaTexto,
  temCartaForaDoAr,
} from '@/lib/propostas'
import {
  type Carta,
  desequilibrioDeValores,
  type Desequilibrio,
  type PrecoTCGplayer,
} from '@/lib/types'

/**
 * A negociação inteira, rodada a rodada.
 *
 * É a tela que substitui o chat que não existe: as rodadas **são** a conversa, e
 * o teto de quatro é o que impede a proposta de virar chat mal feito. Por isso
 * cada rodada aparece na íntegra, em ordem, com o nome de quem a jogou — quem
 * abre a tela precisa reconstruir o que foi dito sem ninguém ter escrito nada.
 */
export default function PropostaDetalhe() {
  useMarcaOculta()

  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { data: proposta, isPending, isError } = useProposta(id)

  const aceitar = useAceitarProposta()
  const recusar = useRecusarProposta()
  const retirar = useRetirarProposta()
  const contrapor = useContrapor()
  const [contrapondo, setContrapondo] = useState(false)
  const [avisandoDesigual, setAvisandoDesigual] = useState(false)

  const ids = useMemo(
    () =>
      (proposta?.rodadas ?? []).flatMap((r) =>
        [...r.quero, ...r.ofereco].map((i) => i.card_id),
      ),
    [proposta],
  )
  const { data: cartas } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)
  const acabamentoPorId = useAcabamentoPorId()

  if (isPending) {
    return (
      <Moldura>
        <div className="h-40 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
      </Moldura>
    )
  }

  if (isError || !proposta) {
    return (
      <Moldura>
        <p className="font-titulo text-[17px] font-bold text-tinta">
          Essa proposta não está mais disponível.
        </p>
        <AcaoSecundaria to="/propostas" className="mt-4 self-center">
          Voltar para as propostas
        </AcaoSecundaria>
      </Moldura>
    )
  }

  const aberta = proposta.status === 'ABERTA'
  const prazo = prazoDaProposta(proposta)
  const foraDoAr = temCartaForaDoAr(proposta.atual)

  // O desequilíbrio da rodada que está de pé, e só dela: numa proposta
  // encerrada o aviso viraria retrospecto de uma decisão já tomada. Compara
  // totais, não cartas — de um lado pode haver três e do outro uma.
  const desigual = desequilibrioDaRodada(
    proposta,
    proposta.atual,
    cartas,
    precos,
    acabamentoPorId,
  )
  const enviando =
    aceitar.isPending ||
    recusar.isPending ||
    retirar.isPending ||
    contrapor.isPending

  function erro(e: unknown, alternativa: string) {
    toast.error(e instanceof ApiError ? e.message : alternativa)
  }

  /**
   * O clique nos botões de resposta.
   *
   * Aceitar com desequilíbrio abre a caixa em vez de mandar — é ela que chama
   * `enviarResposta` depois do segundo clique. Recusar e retirar passam direto:
   * o aviso segura quem está prestes a fechar, não quem está saindo.
   */
  function responder(acao: 'aceitar' | 'recusar' | 'retirar') {
    if (acao === 'aceitar' && desigual) {
      setAvisandoDesigual(true)
      return
    }
    enviarResposta(acao)
  }

  function enviarResposta(acao: 'aceitar' | 'recusar' | 'retirar') {
    const mutacao =
      acao === 'aceitar' ? aceitar : acao === 'recusar' ? recusar : retirar

    mutacao.mutate(proposta!.id, {
      onSuccess: (nova) => {
        setAvisandoDesigual(false)
        if (acao === 'aceitar' && nova.match_id) {
          // O aceite não termina aqui: ele cria a troca, e é lá que a pessoa
          // combina o encontro e vê o contato. Mandar para a troca é continuar
          // a mesma tarefa, não abrir outra.
          //
          // `?selar=1` é o bilhete que pede a selagem na chegada. Sem ele a
          // tela da troca nasceria com o acordo já pronto e não teria transição
          // nenhuma para anunciar — o instante em que a troca passou a existir
          // aconteceu aqui, uma tela atrás.
          toast.success('Proposta aceita! A troca está combinada.')
          navegar(`/matches/${nova.match_id}?selar=1`)
          return
        }
        toast.success(
          acao === 'recusar' ? 'Proposta recusada.' : 'Proposta retirada.',
        )
      },
      onError: (e) => erro(e, 'Não foi possível responder agora.'),
    })
  }

  function enviarContraproposta(itens: ItensDaProposta) {
    contrapor.mutate(
      { id: proposta!.id, itens },
      {
        onSuccess: () => {
          setContrapondo(false)
          toast.success(`Contraproposta enviada para @${proposta!.com}.`)
        },
        onError: (e) => erro(e, 'Não foi possível contrapropor agora.'),
      },
    )
  }

  return (
    <Moldura>
      <div className="flex items-center gap-3">
        <Link
          to="/propostas"
          aria-label="Voltar para as propostas"
          className="voltar grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <p className="font-titulo text-[18px] leading-none font-black text-tinta">
          A proposta
        </p>
      </div>

      <h1 className="titulo-pagina mt-5 font-titulo text-[26px] leading-[1.15] font-black text-tinta lg:text-[32px]">
        Proposta com {proposta.com_nome || `@${proposta.com}`}.
      </h1>
      <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
        <LinkNoTexto to={`/u/${proposta.com}`}>@{proposta.com}</LinkNoTexto>
        {' · '}
        Rodada {proposta.rodada} de {MAX_RODADAS}
        {aberta && prazo && ` · responder em ${prazo}`}
      </p>

      {!aberta && (
        // O desfecho ganha cartela própria, e não só um selo: uma proposta
        // encerrada é lida dias depois, fora de contexto, e "recusada" sozinho
        // não diz quem recusou, quando, nem se aquilo pesa contra alguém.
        <Cartela className="mt-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-titulo text-[15px] font-bold text-tinta">
              {desfechoTexto(proposta)}
            </p>
            <Selo>{DESFECHO[proposta.status]}</Selo>
          </div>
          {dataDaProposta(proposta.respondida_em) && (
            <p className="mt-1 font-dado text-[11px] uppercase text-apagado">
              {dataDaProposta(proposta.respondida_em)}
            </p>
          )}
          {desfechoExplicado(proposta) && (
            <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
              {desfechoExplicado(proposta)}
            </p>
          )}
          {/* Uma saída só, e ela sempre existe: quem fechou vai para a troca,
              onde mora o contato e o prazo do encontro; quem não fechou volta
              para o acervo da pessoa, porque propor de novo é legítimo. Uma
              proposta encerrada não pode ser um beco. */}
          {proposta.status === 'ACEITA' && proposta.match_id ? (
            <>
              <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
                O contato de vocês está liberado na tela da troca, junto com o
                prazo para se encontrarem.
              </p>
              <Link
                to={`/matches/${proposta.match_id}`}
                className={cn(
                  estiloBotao({ variant: 'primary', size: 'md' }),
                  'mt-4',
                )}
              >
                Abrir a troca
              </Link>
            </>
          ) : (
            <Link
              to={`/vitrine/acervo/${proposta.com}`}
              className={cn(estiloBotao({ variant: 'subtle', size: 'sm' }), 'mt-4')}
            >
              Ver o acervo de @{proposta.com}
            </Link>
          )}
        </Cartela>
      )}

      {aberta && foraDoAr && (
        <Cartela className="mt-5 p-4" >
          <p className="font-titulo text-[15px] font-bold text-tinta">
            Uma das cartas saiu do ar.
          </p>
          <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
            Quem anunciou removeu ou trocou o anúncio. Esta proposta não fecha
            mais como está — dá para trocar o que vem e seguir a conversa.
          </p>
        </Cartela>
      )}

      <section className="mt-8">
        <h2 className="font-titulo text-[17px] font-black text-tinta">
          A conversa
        </h2>
        {/* O que substitui o chat que não existe. Dizer isso na tela evita a
            pergunta que a ausência do chat provoca ("onde eu falo com essa
            pessoa?") e explica por que as rodadas acabam. */}
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
          Não há conversa por escrito aqui: cada rodada é uma resposta com
          cartas, e são até {MAX_RODADAS}. Quem topar primeiro fecha a troca.
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {proposta.rodadas.map((rodada) => (
            <li key={rodada.rodada}>
              <RodadaNaTela
                rodada={rodada}
                proposta={proposta}
                cartas={cartas}
                precos={precos}
              />
            </li>
          ))}
        </ol>
      </section>

      {aberta && desigual && <ResumoDesigual dados={desigual} />}

      {aberta && !contrapondo && (
        <Acoes
          proposta={proposta}
          enviando={enviando}
          onResponder={responder}
          onContrapor={() => setContrapondo(true)}
        />
      )}

      {contrapondo && (
        <section className="mt-8">
          <h2 className="font-titulo text-[17px] font-black text-tinta">
            Trocar o que vem
          </h2>
          <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
            A rodada atual já vem marcada. Mude o que quiser e envie — a vez
            volta para @{proposta.com}.
          </p>
          <div className="mt-5">
            <MontarProposta
              outro={proposta.com}
              inicial={pontoDePartida(proposta)}
              rotulo="Enviar contraproposta"
              enviando={contrapor.isPending}
              onEnviar={enviarContraproposta}
              onCancelar={() => setContrapondo(false)}
            />
          </div>
        </section>
      )}

      {/* Fora do fluxo da página: é uma parada antes do único passo
          irreversível desta tela, e não mais uma seção dela. */}
      <ModalTrocaDesigual
        aberto={avisandoDesigual}
        dados={desigual}
        contexto="proposta"
        salvando={aceitar.isPending}
        onAceitar={() => enviarResposta('aceitar')}
        onVoltar={() => setAvisandoDesigual(false)}
      />
    </Moldura>
  )
}

/**
 * De onde a contraproposta parte: os termos da rodada atual, lidos do meu lado.
 *
 * Começar do zero seria pedir para a pessoa remontar o que ela acabou de ler —
 * e contrapropor quase sempre é mudar **uma** carta, não a proposta inteira.
 *
 * Item sem `listing_id` fica de fora: o anúncio saiu do ar e não existe mais o
 * que enviar. É o mesmo motivo pelo qual a API recusaria.
 */
function pontoDePartida(proposta: Proposta): ItensDaProposta {
  const rodada = proposta.atual
  if (!rodada) return { quero: [], ofereco: [] }

  const euJoguei = rodada.por !== proposta.com
  const quero = euJoguei ? rodada.quero : rodada.ofereco
  const ofereco = euJoguei ? rodada.ofereco : rodada.quero

  const ids = (itens: ItemProposta[]) =>
    itens.flatMap((i) => (i.listing_id && i.disponivel ? [i.listing_id] : []))

  return { quero: ids(quero), ofereco: ids(ofereco) }
}

function Acoes({
  proposta,
  enviando,
  onResponder,
  onContrapor,
}: {
  proposta: Proposta
  enviando: boolean
  onResponder: (acao: 'aceitar' | 'recusar' | 'retirar') => void
  onContrapor: () => void
}) {
  // Quem tem a vez responde; quem fez a última jogada só pode puxá-la de volta.
  // São conjuntos de botões diferentes de propósito: oferecer "recusar" a quem
  // acabou de propor seria oferecer recusar a própria proposta.
  if (!proposta.minha_vez) {
    return (
      <div className="mt-8 flex flex-col gap-3">
        <Cartela className="p-4">
          <p className="font-titulo text-[15px] font-bold text-tinta">
            Esperando @{proposta.com}.
          </p>
          {/* "A outra pessoa", nunca "ela": o app não sabe o gênero de ninguém —
              não pergunta e não deduz do @. */}
          <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
            A outra pessoa pode aceitar, recusar ou trocar o que vem. Enquanto
            não responder, você pode retirar sem prejuízo nenhum à sua reputação.
          </p>
        </Cartela>
        {podeRetirar(proposta) && (
          <Button
            variant="ghost"
            size="md"
            block
            disabled={enviando}
            onClick={() => onResponder('retirar')}
          >
            Retirar proposta
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="mt-8 flex flex-col gap-2">
      {/* O que o botão azul faz depois de clicado. Aceitar é o único passo
          irreversível desta tela — vira uma troca combinada, com contato
          liberado e prazo correndo —, e a pessoa merece saber disso antes. */}
      <Cartela className="mb-2 p-4">
        <p className="font-titulo text-[15px] font-bold text-tinta">
          Sua vez de responder.
        </p>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
          Se aceitar, isto vira uma troca combinada: o contato de vocês aparece
          na tela da troca e vocês têm uma semana para se encontrar. Se faltar
          pouco para fechar, troque o que vem em vez de recusar.
        </p>
      </Cartela>

      <Button
        variant="primary"
        size="lg"
        block
        loading={enviando}
        onClick={() => onResponder('aceitar')}
      >
        Aceitar e combinar a troca
      </Button>

      {podeContrapor(proposta) ? (
        <Button
          variant="subtle"
          size="md"
          block
          disabled={enviando}
          onClick={onContrapor}
        >
          Trocar o que vem
        </Button>
      ) : (
        // Rodada 4: o teto existe para a negociação fechar, e a tela precisa
        // dizer por que o botão sumiu — botão ausente sem explicação lê como
        // defeito do app.
        <p className="text-center font-corpo text-[13px] text-apagado">
          Última rodada: agora é aceitar ou recusar.
        </p>
      )}

      <Button
        variant="ghost"
        size="md"
        block
        disabled={enviando}
        onClick={() => onResponder('recusar')}
      >
        Recusar
      </Button>
      <p className="mt-1 text-center font-corpo text-[13px] text-apagado">
        Recusar não conta contra ninguém — é a resposta que a outra pessoa está
        esperando.
      </p>
    </div>
  )
}

/**
 * Os dois lados de uma rodada, lidos sempre do meu ponto de vista.
 *
 * Quem jogou a rodada decide o que é meu: na que eu joguei, `ofereco` sai da
 * minha mão; na que a outra pessoa jogou, o que sai é o que ela pediu (`quero`
 * dela). Errar isto inverte a troca inteira, e é a mesma conta que a cartela da
 * rodada e o aviso de desequilíbrio precisam fazer — por isso ela é uma só.
 */
function ladosDaRodada(
  proposta: Proposta,
  rodada: RodadaProposta,
): { dou: ItemProposta[]; recebo: ItemProposta[] } {
  const euJoguei = rodada.por !== proposta.com
  return {
    dou: euJoguei ? rodada.ofereco : rodada.quero,
    recebo: euJoguei ? rodada.quero : rodada.ofereco,
  }
}

/**
 * O aviso de troca desigual, calculado sobre os totais dos dois lotes.
 *
 * Cala quando falta preço de alguma carta — e aqui isso é mais comum que na
 * troca sugerida, porque um lote de cinco cartas só precisa de uma sem cotação
 * para o total virar chute. Afirmar "você entrega 4x mais" com um lado
 * incompleto seria pior que não dizer nada.
 */
function desequilibrioDaRodada(
  proposta: Proposta,
  rodada: RodadaProposta | null | undefined,
  cartas: Map<string, Carta> | undefined,
  precos: Map<string, PrecoTCGplayer[]> | undefined,
  acabamentoPorId: (id: number | undefined) => Acabamento | undefined,
): Desequilibrio | null {
  if (!rodada || !precos) return null

  const lados = ladosDaRodada(proposta, rodada)
  const dou = totalDoLote(paraLote(lados.dou, cartas, acabamentoPorId, precos))
  const recebo = totalDoLote(
    paraLote(lados.recebo, cartas, acabamentoPorId, precos),
  )
  if (!dou.exato || !recebo.exato) return null

  return desequilibrioDeValores(dou.valor, recebo.valor)
}

function RodadaNaTela({
  rodada,
  proposta,
  cartas,
  precos,
}: {
  rodada: RodadaProposta
  proposta: Proposta
  cartas?: Map<string, Carta>
  precos?: Map<string, PrecoTCGplayer[]>
}) {
  const euJoguei = rodada.por !== proposta.com
  const atual = rodada.rodada === proposta.rodada
  const acabamentoPorId = useAcabamentoPorId()
  const lados = ladosDaRodada(proposta, rodada)

  // Três tempos verbais, como no detalhe da troca: o que está de pé, o que
  // aconteceu e o que não vai acontecer. "Você dá" numa proposta recusada
  // afirmaria uma entrega que nunca houve.
  const naoRolou = proposta.status !== 'ABERTA' && proposta.status !== 'ACEITA'
  const rotulos = naoRolou
    ? { dou: 'Você daria', recebo: 'Você receberia' }
    : { dou: 'Você dá', recebo: 'Você recebe' }

  // A rodada anterior é referência: é contra ela que a contraproposta faz
  // sentido, e dizer "no lugar do que veio antes" poupa a pessoa de rolar para
  // cima para lembrar o que mudou.
  const anterior = proposta.rodadas.find((r) => r.rodada === rodada.rodada - 1)

  return (
    <Cartela className={cn('p-4', !atual && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-titulo text-[15px] font-bold text-tinta">
            {rodadaTexto(rodada, euJoguei)}
          </p>
          <p className="mt-0.5 font-dado text-[11px] uppercase text-apagado">
            Rodada {rodada.rodada} de {MAX_RODADAS}
            {rodada.rodada === 1 && dataDaProposta(proposta.criada_em)
              ? ` · ${dataDaProposta(proposta.criada_em)}`
              : ''}
          </p>
        </div>
        {atual && proposta.status === 'ABERTA' && <Selo tom="acao">atual</Selo>}
      </div>

      {anterior && (
        <p className="mt-2 font-corpo text-[13px] leading-relaxed text-apagado">
          No lugar do que veio na rodada {anterior.rodada}.
        </p>
      )}

      {/* Toda rodada é lida do **meu** lado, mesmo a que a outra pessoa jogou:
          o que sai da minha mão à esquerda, o que entra à direita, como no feed
          de trocas. Quem jogou a rodada já está dito no título — inverter
          também o par obrigaria a pessoa a traduzir a troca a cada cartela. */}
      <div className="mt-4">
        <ParDeLotes
          tamanho="grande"
          dou={paraLote(lados.dou, cartas, acabamentoPorId, precos)}
          recebo={paraLote(lados.recebo, cartas, acabamentoPorId, precos)}
          rotulos={rotulos}
        />
      </div>
    </Cartela>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-5 py-8 lg:max-w-3xl">
      {children}
    </div>
  )
}
