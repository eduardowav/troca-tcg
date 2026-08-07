import { useMemo, useState } from 'react'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import { Cartela } from '@/components/brutal/Pecas'
import { Button } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useAnuncios, useCartasPorId } from '@/hooks/useAnuncios'
import { useAcervo } from '@/hooks/useVitrine'
import { cn } from '@/lib/cn'
import { type ItensDaProposta, MAX_ITENS } from '@/lib/propostas'

/**
 * A mesa onde a proposta é montada: o acervo da outra pessoa de um lado, as
 * minhas cartas do outro.
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
  const acabamentoPorId = useAcabamentoPorId()

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

  return (
    <div className="pb-32">
      <Lado
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
      />

      <Lado
        className="mt-8"
        titulo="O que você oferece em troca"
        vazio="Você ainda não tem cartas na lista Ofereço."
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
      />

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
            {' · dá '}
            <span className="font-bold text-tinta">{ofereco.length}</span>
            {quero.length === 0 || ofereco.length === 0 ? (
              <span className="mt-0.5 block">Escolha dos dois lados.</span>
            ) : null}
          </p>

          {onCancelar && (
            <Button variant="ghost" size="sm" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            loading={enviando}
            disabled={!podeEnviar}
            onClick={() => onEnviar({ quero, ofereco })}
          >
            {rotulo}
          </Button>
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

function Lado({
  titulo,
  vazio,
  cartas,
  escolhidos,
  onAlternar,
  cartasPorId,
  acabamentoPorId,
  className,
}: {
  titulo: string
  vazio: string
  cartas: ItemEscolhivel[]
  escolhidos: string[]
  onAlternar: (listingId: string) => void
  cartasPorId?: Map<string, import('@/lib/types').Carta>
  acabamentoPorId: (id: number | undefined) => { nome_curto: string } | undefined
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
