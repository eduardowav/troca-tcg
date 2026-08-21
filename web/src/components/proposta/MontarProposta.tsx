import { useEffect, useMemo, useState } from 'react'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import { Cartela, LinkNoTexto } from '@/components/brutal/Pecas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import { Button } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useAnuncios, useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useAcervo } from '@/hooks/useVitrine'
import { type Acabamento, precoDoAcabamento } from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import { type ItensDaProposta, MAX_ITENS } from '@/lib/propostas'
import {
  formatarMoeda,
  type PrecoTCGplayer,
  valorDoPreco,
} from '@/lib/types'

/**
 * A mesa onde a proposta é montada, em dois passos: primeiro o que vem, depois
 * o que vai.
 *
 * **Por que dois passos.** Antes as duas listas moravam na mesma página, uma
 * embaixo da outra. No celular, com trinta cartas no acervo da outra pessoa, a
 * segunda lista ficava a uma rolagem inteira de distância — e quem montava a
 * proposta simplesmente não descobria que precisava oferecer algo. A barra de
 * baixo dizia "Escolha dos dois lados", o que explica o problema para quem já
 * sabe qual é. Relato do Eduardo testando no celular (2026-08-12): escolheu as
 * cartas e não entendeu por que o envio não ligava.
 *
 * Cada passo mostra **um acervo só**, e é essa a diferença que resolve: não há
 * segunda lista escondida abaixo da dobra, porque não há segunda lista na tela.
 * O passo 2 abre com o resumo do que foi pedido — miniaturas, não texto —, que
 * é ao mesmo tempo a memória do que se está negociando e o caminho de volta.
 *
 * É a mesma peça na proposta e na contraproposta — as duas fazem a mesma coisa
 * (escolher o que vem e o que vai), e o que muda é só de onde a seleção parte.
 * Ter uma peça só é o que garante que contrapor nunca ofereça menos do que
 * propor: a rodada 2 tem exatamente as mesmas cartas disponíveis que a 1.
 *
 * Os itens são **anúncios**, não cartas. Isso não é detalhe de API: é o que
 * garante que a carta oferecida existe com aquela condição e aquele acabamento,
 * e é o que faz a proposta caducar sozinha quando o anúncio sai do ar.
 */
export function MontarProposta({
  outro,
  inicial,
  rotulo,
  enviando,
  onEnviar,
  onCancelar,
}: {
  /** O @ da outra pessoa — de quem é o acervo do lado de cá. */
  outro: string
  /** De onde a seleção parte. Na contraproposta, são os termos da rodada atual. */
  inicial?: ItensDaProposta
  rotulo: string
  enviando: boolean
  onEnviar: (itens: ItensDaProposta) => void
  onCancelar?: () => void
}) {
  const [quero, setQuero] = useState<string[]>(inicial?.quero ?? [])
  const [ofereco, setOfereco] = useState<string[]>(inicial?.ofereco ?? [])
  const [passo, setPasso] = useState<1 | 2>(1)

  // Trocar de passo volta ao topo. A página que fica é outra, e herdar a
  // rolagem da anterior faz a nova abrir no meio de uma grade — que é
  // exatamente o desorientar que estes dois passos existem para acabar.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [passo])

  const { data: acervo, isPending: carregandoAcervo } = useAcervo(outro)
  const { data: anuncios } = useAnuncios()

  // Só o meu OFERTA entra: proposta é o que eu **tenho** indo embora. O meu
  // Procuro é desejo, e desejo não se entrega a ninguém.
  const meus = useMemo(
    () => (anuncios ?? []).filter((a) => a.tipo === 'OFERTA' && a.ativo),
    [anuncios],
  )

  const ids = useMemo(
    () => [
      ...(acervo ?? []).map((c) => c.card_id),
      ...meus.map((a) => a.card_id),
    ],
    [acervo, meus],
  )
  const { data: cartas } = useCartasPorId(ids)
  const { data: precos, isSuccess: precosProntos } = usePrecosPorId(ids)
  const acabamentoPorId = useAcabamentoPorId()

  // Todo anúncio das duas listas, alcançável pelo id — é o que transforma a
  // seleção (uma lista de `listing_id`) em soma de preços.
  const porListing = useMemo(() => {
    const mapa = new Map<string, { cardId: string; finishId: number }>()
    for (const c of acervo ?? []) {
      mapa.set(c.listing_id, { cardId: c.card_id, finishId: c.finish_id })
    }
    for (const a of meus) {
      mapa.set(a.id, { cardId: a.card_id, finishId: a.finish_id })
    }
    return mapa
  }, [acervo, meus])

  function somar(escolhidos: string[]) {
    return totalEscolhido(escolhidos, porListing, precos, acabamentoPorId)
  }

  function alternar(
    lista: string[],
    setLista: (v: string[]) => void,
    id: string,
  ) {
    setLista(
      lista.includes(id)
        ? lista.filter((x) => x !== id)
        : // O teto é o do schema da API (MAX_ITENS). Barrar aqui é melhor do que
          // deixar o envio falhar depois de a pessoa ter montado tudo.
          lista.length >= MAX_ITENS
          ? lista
          : [...lista, id],
    )
  }

  const podeEnviar = quero.length > 0 && ofereco.length > 0 && !enviando
  const valorQuero = somar(quero)
  const valorOfereco = somar(ofereco)

  return (
    <div className="pb-32">
      <Passos atual={passo} />

      {passo === 1 ? (
        <Lado
          className="mt-5"
          titulo={`O que você quer de @${outro}`}
          vazio={
            carregandoAcervo
              ? 'Carregando o acervo…'
              : `@${outro} não tem nenhuma carta anunciada agora.`
          }
          cartas={(acervo ?? []).map((c) => ({
            listingId: c.listing_id,
            cardId: c.card_id,
            condicao: c.condicao,
            finishId: c.finish_id,
            reciproco: c.reciproco,
          }))}
          escolhidos={quero}
          onAlternar={(id) => alternar(quero, setQuero, id)}
          cartasPorId={cartas}
          acabamentoPorId={acabamentoPorId}
          precos={precos}
          precosProntos={precosProntos}
        />
      ) : (
        <>
          <PedidoResumido
            escolhidos={quero}
            porListing={porListing}
            cartasPorId={cartas}
            outro={outro}
            onVoltar={() => setPasso(1)}
          />

          <Lado
            className="mt-6"
            titulo="O que você oferece em troca"
            vazio={
              <>
                Você ainda não tem cartas na lista Ofereço — e é dela que sai o
                seu lado da troca.{' '}
                <LinkNoTexto to="/minhas-cartas">
                  Cadastrar o que você tem sobrando
                </LinkNoTexto>
                .
              </>
            }
            cartas={meus.map((a) => ({
              listingId: a.id,
              cardId: a.card_id,
              condicao: a.condicao,
              finishId: a.finish_id,
            }))}
            escolhidos={ofereco}
            onAlternar={(id) => alternar(ofereco, setOfereco, id)}
            cartasPorId={cartas}
            acabamentoPorId={acabamentoPorId}
            precos={precos}
            precosProntos={precosProntos}
          />
        </>
      )}

      {/* A barra fica presa embaixo porque a escolha acontece rolando a página:
          sem ela, a pessoa monta a proposta no fim da lista e precisa voltar ao
          topo para descobrir onde enviar. Acima da barra de navegação, que é do
          app inteiro e continua alcançável. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4">
        <Cartela className="mx-auto flex w-full max-w-xl items-center gap-3 p-3">
          {/* "Você recebe / você dá", e não "dela ↔ sua": a proposta é lida por
              quem está montando, e o app não sabe (nem pergunta) o gênero de
              ninguém. É a mesma voz do cartão da lista. */}
          <p className="min-w-0 flex-1 font-dado text-[12px] leading-snug text-apagado">
            Recebe <span className="font-bold text-tinta">{quero.length}</span>
            {passo === 2 && (
              <>
                {' · dá '}
                <span className="font-bold text-tinta">{ofereco.length}</span>
              </>
            )}
            {/* A frase que falta é sempre a do passo em que a pessoa está. No
                passo 1, cobrar o lado que ainda nem apareceu na tela seria
                repetir o erro que os dois passos vieram consertar. */}
            {quero.length === 0 ? (
              <span className="mt-0.5 block">Escolha ao menos uma carta.</span>
            ) : passo === 1 ? (
              // Na contraproposta o meu lado já vem preenchido da rodada
              // anterior. Mandar "escolha o que você dá" para quem já escolheu
              // é o app não estar prestando atenção.
              <span className="mt-0.5 block">
                {ofereco.length > 0
                  ? `Seu lado já tem ${ofereco.length}.`
                  : 'Agora escolha o que você dá.'}
              </span>
            ) : ofereco.length === 0 ? (
              <span className="mt-0.5 block">Falta o seu lado.</span>
            ) : (
              // Os dois totais na mesma linha em que já estão as contagens: é
              // aqui que a proposta é fechada, e a soma que interessa é a que
              // está montada agora — não a de quando a página abriu. Quem não
              // tem preço nenhum dos dois lados não vê linha nenhuma, em vez de
              // ver "US$ 0,00", que seria mentira.
              (valorQuero.temPreco || valorOfereco.temPreco) && (
                <span className="mt-0.5 block">
                  {formatarMoeda(valorQuero.valor)}
                  {!valorQuero.exato && <span aria-hidden> ~</span>}
                  {' contra '}
                  {formatarMoeda(valorOfereco.valor)}
                  {!valorOfereco.exato && <span aria-hidden> ~</span>}
                </span>
              )
            )}
          </p>

          {passo === 1 ? (
            <>
              {onCancelar && (
                <Button variant="ghost" size="sm" onClick={onCancelar}>
                  Cancelar
                </Button>
              )}
              {/* O botão que faltava. Ele não envia nada — leva ao passo em que
                  as minhas cartas existem, que é o que ninguém achava rolando. */}
              <Button
                variant="primary"
                size="md"
                disabled={quero.length === 0}
                onClick={() => setPasso(2)}
              >
                Minhas cartas
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setPasso(1)}>
                Voltar
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={enviando}
                disabled={!podeEnviar}
                onClick={() => onEnviar({ quero, ofereco })}
              >
                {rotulo}
              </Button>
            </>
          )}
        </Cartela>
      </div>
    </div>
  )
}

interface ItemEscolhivel {
  listingId: string
  cardId: string
  condicao: string
  finishId: number
  reciproco?: boolean
}

/**
 * Onde a pessoa está, em dois traços.
 *
 * Dois passos sem indicador viram "a tela mudou sozinha". O trecho preenchido é
 * o passo atual; o vazio é o que falta — e o texto ao lado diz o mesmo em
 * palavras, porque cor e largura sozinhas não são informação para quem não as
 * distingue.
 */
function Passos({ atual }: { atual: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex items-center gap-1.5">
        <span className="h-1.5 w-8 rounded-full border-2 border-tinta bg-azul" />
        <span
          className={cn(
            'h-1.5 w-8 rounded-full border-2 border-tinta',
            atual === 2 ? 'bg-azul' : 'bg-papel',
          )}
        />
      </span>
      <p className="font-dado text-[11px] uppercase text-apagado">
        Passo {atual} de 2
      </p>
    </div>
  )
}

/**
 * O que já foi pedido, no topo do passo 2.
 *
 * Miniaturas e não texto: quem está escolhendo o que dar precisa ver **o que
 * vai receber** enquanto decide, e "2 cartas" não sustenta essa comparação. É
 * também o caminho de volta — a faixa inteira é o botão, porque mexer no pedido
 * é a segunda coisa mais provável de se querer nesta tela.
 *
 * A tira rola de lado quando não cabe. Vinte cartas pedidas é caso raro, mas
 * espremer vinte miniaturas na largura do celular apagaria a arte, que é
 * justamente o que faz a lembrança funcionar.
 */
function PedidoResumido({
  escolhidos,
  porListing,
  cartasPorId,
  outro,
  onVoltar,
}: {
  escolhidos: string[]
  porListing: Map<string, { cardId: string; finishId: number }>
  cartasPorId?: Map<string, import('@/lib/types').Carta>
  outro: string
  onVoltar: () => void
}) {
  return (
    <button
      type="button"
      onClick={onVoltar}
      className={cn(
        'mt-5 flex w-full items-center gap-3 rounded-[var(--radius-controle)]',
        'border-2 border-tinta bg-meu p-3 text-left',
        'shadow-[var(--shadow-duro-xs)] transition-shadow hover:shadow-[var(--shadow-duro)]',
      )}
    >
      <span aria-hidden className="font-titulo text-[16px] font-black text-tinta">
        ←
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-dado text-[11px] uppercase text-apagado">
          Você pede de @{outro}
        </span>
        <span className="mt-1.5 flex gap-1.5 overflow-x-auto">
          {escolhidos.map((id) => {
            const anuncio = porListing.get(id)
            const carta = anuncio && cartasPorId?.get(anuncio.cardId)
            if (!carta) return null
            return (
              <CartaThumb
                key={id}
                carta={carta}
                className="w-11 shrink-0 border-2 border-tinta"
              />
            )
          })}
        </span>
      </span>
      <span className="shrink-0 font-dado text-[11px] uppercase text-apagado">
        Mudar
      </span>
    </button>
  )
}

/**
 * Quanto vale um lado da proposta que está sendo montada.
 *
 * Soma pelo acabamento de cada anúncio, como o resto do app: a reverse e a
 * normal da mesma carta não valem o mesmo, e é montando a proposta que essa
 * diferença ainda dá para corrigir.
 *
 * `exato` cai quando alguma carta escolhida não tem cotação ou tem preço
 * aproximado — o total continua servindo para comparar os dois lados, mas não
 * pode aparecer como número fechado.
 */
function totalEscolhido(
  escolhidos: string[],
  porListing: Map<string, { cardId: string; finishId: number }>,
  precos: Map<string, PrecoTCGplayer[]> | undefined,
  acabamentoPorId: (id: number | undefined) => Acabamento | undefined,
): { valor: number; exato: boolean; temPreco: boolean } {
  let valor = 0
  let exato = true
  let temPreco = false

  for (const id of escolhidos) {
    const anuncio = porListing.get(id)
    const escolhido =
      anuncio &&
      precoDoAcabamento(
        precos?.get(anuncio.cardId),
        acabamentoPorId(anuncio.finishId),
      )
    const numero = valorDoPreco(escolhido?.preco)
    if (numero == null) {
      exato = false
      continue
    }
    valor += numero
    temPreco = true
    if (!escolhido?.exato) exato = false
  }

  return { valor, exato, temPreco }
}

function Lado({
  titulo,
  vazio,
  cartas,
  escolhidos,
  onAlternar,
  cartasPorId,
  acabamentoPorId,
  precos,
  precosProntos,
  className,
}: {
  titulo: string
  /** Nó, e não texto: o vazio do meu lado leva a "cadastrar o que você tem". */
  vazio: React.ReactNode
  cartas: ItemEscolhivel[]
  escolhidos: string[]
  onAlternar: (listingId: string) => void
  cartasPorId?: Map<string, import('@/lib/types').Carta>
  acabamentoPorId: (id: number | undefined) => Acabamento | undefined
  precos?: Map<string, PrecoTCGplayer[]>
  /** A consulta de preços já respondeu — separa "não tem" de "ainda vindo". */
  precosProntos?: boolean
  className?: string
}) {
  return (
    <section className={className}>
      <h2 className="font-titulo text-[17px] font-black text-tinta">{titulo}</h2>

      {cartas.length === 0 ? (
        <p className="mt-3 font-corpo text-[14px] text-apagado">{vazio}</p>
      ) : (
        <GradeBrutal className="mt-3">
          {cartas.map((item) => {
            const carta = cartasPorId?.get(item.cardId)
            if (!carta) return null
            const escolhida = escolhidos.includes(item.listingId)
            const acabamento = acabamentoPorId(item.finishId)

            return (
              <CelulaBrutal
                key={item.listingId}
                carta={carta}
                destaque={escolhida ? 'OFERTA' : null}
                // A célula já sabe desenhar preço — é a mesma da busca e da
                // vitrine. O que faltava era passar a linha do acabamento
                // anunciado, que é a única que vale numa proposta.
                preco={precoDoAcabamento(precos?.get(item.cardId), acabamento)}
                precoCarregado={precosProntos}
              >
                <div className="flex flex-col gap-1.5">
                  <p className="font-dado text-[10px] uppercase text-apagado">
                    {item.condicao}
                    {acabamento && ` · ${acabamento.nome_curto}`}
                    {/* A carta que fecha com o meu Procuro aparece marcada: numa
                        lista de trinta, é ela que responde "o que eu peço?". */}
                    {item.reciproco && (
                      <span className="text-azul"> · eu procuro</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => onAlternar(item.listingId)}
                    aria-pressed={escolhida}
                    className={cn(
                      'rounded-[var(--radius-etiqueta)] border-2 border-tinta px-2 py-1.5',
                      'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
                      escolhida
                        ? 'bg-azul text-azul-tinta'
                        : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
                    )}
                  >
                    {escolhida ? 'Escolhida' : 'Escolher'}
                  </button>
                </div>
              </CelulaBrutal>
            )
          })}
        </GradeBrutal>
      )}
    </section>
  )
}
