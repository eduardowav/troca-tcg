import { useMemo, useState } from 'react'

import { CelulaCarta, GradeDeCartas } from '@/components/carta/GradeDeCartas'
import { Button } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import {
  type Acabamento,
  NORMAL,
  precoDoAcabamento,
} from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import type { CartaDoParceiro, MatchStatus } from '@/lib/matches'
import type { Carta, ListingKind, PrecoTCGplayer } from '@/lib/types'

/**
 * Estados em que o acervo da pessoa não é convite nenhum.
 *
 * Depois de alguém não aparecer, desistir ou deixar o prazo vencer, empurrar
 * mais trinta cartas dela é o app insistindo onde já não deu — a mesma razão
 * pela qual a desistência ganhou carência de 7 dias antes de o motor sugerir o
 * par de novo (db/schema/20).
 */
const SEM_CONVITE: MatchStatus[] = ['RECUSADO', 'FURADO', 'EXPIRADO', 'CANCELADO']

export const cabeMaisCartas = (status: MatchStatus) => !SEM_CONVITE.includes(status)

/**
 * A frase muda com o tempo verbal da troca, não só com o texto.
 *
 * São três momentos e não um: antes do aceite não existe WhatsApp para combinar
 * — o contato só é revelado quando os dois aceitam —, e depois da troca feita
 * "vocês vão se encontrar" fala de um encontro que já aconteceu. Prometer
 * contato que a tela não mostra, ou marcar encontro no passado, é o tipo de
 * frase que faz a pessoa desconfiar do resto.
 */
function convite(status: MatchStatus, nome: string): string {
  if (status === 'CONCLUIDO') {
    return `Vocês já trocaram uma vez. ${nome} ainda anuncia estas — se quiserem repetir, é só chamar no WhatsApp.`
  }
  if (status === 'ACEITO') {
    return 'Já que vocês vão se encontrar, dá para combinar mais de uma carta na mesma viagem. Combinem pelo WhatsApp — estas ainda não fazem parte da troca.'
  }
  return 'Se fecharem esta troca, dá para combinar mais de uma carta no mesmo encontro. O contato aparece quando os dois aceitam.'
}

/**
 * O resto do acervo de quem está do outro lado desta troca.
 *
 * Existe para o desperdício mais óbvio do produto: duas pessoas que já se
 * acharam, já combinaram e vão se encontrar levam **uma** carta cada. Se ela tem
 * outras trinta, as vinte e nove restantes ficam invisíveis exatamente no
 * momento em que trocar mais uma custa zero — a viagem já vai acontecer.
 *
 * A tela não inventa vocabulário novo. As cartas usam a mesma célula da busca e
 * de Minhas cartas, e "fecha comigo" é o mesmo `destaque` que já significa "esta
 * carta está numa das suas listas". A ordem vem do servidor, com o recíproco
 * primeiro.
 */
export function MaisCartas({
  cartas,
  nome,
  status,
}: {
  cartas: CartaDoParceiro[]
  /** Primeiro nome de quem está do outro lado. A seção fala dela. */
  nome: string
  /** Decide o tempo verbal do convite — e se há convite. */
  status: MatchStatus
}) {
  const ids = useMemo(() => cartas.map((c) => c.card_id), [cartas])
  const { data: catalogo } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)
  const acabamentoPorId = useAcabamentoPorId()

  // Some inteira quando não há nada. Uma seção anunciando que a pessoa não tem
  // mais nada é ruído num ecrã que existe para tratar de uma troca específica.
  if (cartas.length === 0 || !cabeMaisCartas(status)) return null

  const dela = cartas.filter((c) => c.tipo === 'OFERTA')
  const paraEla = cartas.filter((c) => c.tipo === 'PROCURA')

  return (
    <section
      aria-label={`Outras cartas de ${nome}`}
      className="mt-8 border-t border-edge-soft pt-6"
    >
      <h2 className="text-[18px] leading-tight text-balance lg:text-[20px]">
        Mais trocas com {nome}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted lg:text-[15px]">
        {convite(status, nome)}
      </p>

      {/* A cor é do ponto de vista de quem lê, não do dono da carta: o que ela
          oferece é o que eu posso receber (Procuro), o que ela procura é o que
          eu posso dar (Ofereço). É a mesma inversão da linha de troca logo
          acima, onde "você recebe" já é âmbar. */}
      <Grupo
        titulo={`O que mais ${nome} tem`}
        itens={dela}
        ladoDaCor="PROCURA"
        rotuloReciproco="você procura"
        catalogo={catalogo}
        precos={precos}
        acabamentoPorId={acabamentoPorId}
      />
      <Grupo
        titulo={`O que ${nome} procura`}
        itens={paraEla}
        ladoDaCor="OFERTA"
        rotuloReciproco="você oferece"
        catalogo={catalogo}
        precos={precos}
        acabamentoPorId={acabamentoPorId}
      />
    </section>
  )
}

/** Quantas cartas aparecem antes de "Mostrar mais" — três fileiras no celular. */
const VISIVEIS = 6

function Grupo({
  titulo,
  itens,
  ladoDaCor,
  rotuloReciproco,
  catalogo,
  precos,
  acabamentoPorId,
}: {
  titulo: string
  itens: CartaDoParceiro[]
  /** A minha lista a que estas cartas pertenceriam. Decide a cor do grupo. */
  ladoDaCor: ListingKind
  rotuloReciproco: string
  catalogo?: Map<string, Carta>
  precos?: Map<string, PrecoTCGplayer[]>
  acabamentoPorId: (id: number | undefined) => Acabamento | undefined
}) {
  // Revela por página, não tudo de uma vez: quem anuncia sessenta cartas viraria
  // sessenta células com imagem de CDN num toque só, dentro de uma tela que é
  // sobre outra coisa. Cada toque pede mais uma leva, e quem quiser o acervo
  // inteiro chega lá.
  const [limite, setLimite] = useState(VISIVEIS)
  if (itens.length === 0) return null

  const mostrando = itens.slice(0, limite)
  const restantes = itens.length - mostrando.length

  return (
    <div className="mt-6">
      <h3
        className={cn(
          'flex items-baseline gap-2 text-[14px] font-medium lg:text-[15px]',
          ladoDaCor === 'OFERTA' ? 'text-offer' : 'text-want',
        )}
      >
        {titulo}
        <span className="set-code text-[13px] text-muted">{itens.length}</span>
      </h3>

      {/* Menos colunas que a busca, e a razão é a moldura: esta tela é uma
          coluna de leitura (max-w-3xl), não a bancada larga do catálogo. Com as
          seis colunas de lá, a célula fica com ~95px, o nome vira reticências e
          o preço quebra em duas linhas — some justamente a arte, que é como o
          colecionador reconhece a carta.
          Para em três de propósito: `VISIVEIS` é seis, e três é a última
          largura em que a primeira leva fecha fileira certa. Com quatro
          colunas ela mostra 4+2 e o "Mostrar mais" nasce debaixo de uma
          fileira pela metade, com dois buracos ao lado. */}
      <GradeDeCartas className="mt-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
        {mostrando.map((item) => {
          const carta = catalogo?.get(item.card_id)
          if (!carta) return null
          const acabamento = acabamentoPorId(item.finish_id)
          return (
            <CelulaCarta
              key={`${item.card_id}-${item.tipo}`}
              carta={carta}
              para={`/carta/${item.card_id}`}
              preco={precoDoAcabamento(precos?.get(item.card_id), acabamento)}
              // O destaque só marca o recíproco. Pintar tudo faria a cor deixar
              // de significar "isto fecha com você" e virar cor da seção.
              destaque={item.reciproco ? ladoDaCor : null}
            >
              <p className="min-w-0 truncate text-[13px] text-muted">
                {item.reciproco ? (
                  <span
                    className={
                      ladoDaCor === 'OFERTA' ? 'text-offer' : 'text-want'
                    }
                  >
                    {rotuloReciproco}
                  </span>
                ) : (
                  <span>
                    {item.condicao}
                    {acabamento &&
                      acabamento.id !== NORMAL &&
                      ` · ${acabamento.nome_curto}`}
                  </span>
                )}
              </p>
            </CelulaCarta>
          )
        })}
      </GradeDeCartas>

      {restantes > 0 && (
        // Mesmo botão da busca (`subtle`, largura toda): é o gesto de "revelar
        // mais desta grade" e já existe no app. A contagem entra porque aqui o
        // total é sabido — na busca, que pagina no servidor, não é.
        <Button
          variant="subtle"
          block
          className="mt-3"
          onClick={() => setLimite((atual) => atual + VISIVEIS)}
        >
          Mostrar mais {Math.min(restantes, VISIVEIS)}
        </Button>
      )}
    </div>
  )
}
