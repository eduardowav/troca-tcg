import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { FolhaAdicionar } from '@/components/carta/FolhaAdicionar'
import { Button } from '@/components/ui/Button'
import { useAnuncios, useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useCatalogo } from '@/hooks/useCatalogo'
import {
  formatarPreco,
  type ListingKind,
  nomeCarta,
  numeroImpresso,
} from '@/lib/types'

/**
 * A página de uma carta.
 *
 * Fecha o caminho que a busca compacta abriu: a lista suspensa identifica a
 * carta, e é aqui que se decide o que fazer com ela. Mostra a arte grande — que
 * é como o colecionador confere se é mesmo aquela versão — junto do que
 * distingue uma impressão da outra: número impresso, expansão, raridade e preço.
 */
export default function CartaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const ids = id ? [id] : []
  const { data: cartas, isPending } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)
  const { data: catalogo } = useCatalogo()
  const { data: anuncios } = useAnuncios()
  const [aAdicionar, setAAdicionar] = useState<ListingKind | null>(null)

  const carta = id ? cartas?.get(id) : undefined
  const preco = id ? precos?.get(id) : undefined
  const set = carta && catalogo?.setsPorCodigo.get(carta.set_code)

  const jaEm = (tipo: ListingKind) =>
    (anuncios ?? []).some((a) => a.card_id === id && a.tipo === tipo)

  if (isPending) {
    return (
      <Moldura>
        <div className="mx-auto aspect-[2.5/3.5] w-[22rem] max-w-full animate-pulse rounded-[14px] bg-surface" />
      </Moldura>
    )
  }

  if (!carta) {
    return (
      <Moldura>
        <p className="text-[15px] text-paper">Carta não encontrada.</p>
        <Link
          to="/buscar"
          className="mt-4 inline-block text-[14px] text-paper underline underline-offset-4"
        >
          Voltar para a busca
        </Link>
      </Moldura>
    )
  }

  const valor = formatarPreco(preco)

  return (
    <Moldura>
      <Link
        to="/buscar"
        className="text-[13px] text-muted underline underline-offset-4 hover:text-paper"
      >
        ← Buscar
      </Link>

      {/* Empilhado no celular, lado a lado a partir de sm: a arte é o assunto,
          e no telefone ela merece a largura inteira antes dos dados. */}
      <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
        <CartaThumb
          carta={carta}
          alta
          className="w-full max-w-[20rem] self-center sm:w-[22rem] sm:max-w-none sm:self-start lg:w-[26rem] xl:w-[30rem]"
        />

        <div className="min-w-0 flex-1">
          <h1 className="text-[32px] leading-[1.1]">{nomeCarta(carta)}</h1>
          <p className="set-code mt-2 text-[14px] text-muted">
            {numeroImpresso(carta, set?.total_oficial)}
            {set && ` · ${set.sigla ?? set.code}`}
          </p>

          <dl className="mt-7 space-y-3.5 border-t border-edge-soft pt-5 text-[15px]">
            <Linha rotulo="Expansão" valor={set?.nome ?? carta.set_code} />
            <Linha rotulo="Raridade" valor={carta.raridade} />
            <Linha
              rotulo="Preço de referência"
              valor={valor}
              dica={valor ? 'TCGplayer, em dólar' : undefined}
            />
            {carta.nome_pt && carta.nome_en !== carta.nome_pt && (
              <Linha rotulo="Nome em inglês" valor={carta.nome_en} />
            )}
          </dl>

          <div className="mt-7 flex flex-col gap-2">
            <p className="text-[14px] text-muted">Colocar esta carta em:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="offer"
                size="lg"
                disabled={jaEm('OFERTA')}
                onClick={() => setAAdicionar('OFERTA')}
              >
                {jaEm('OFERTA') ? 'Já ofereço' : 'Ofereço'}
              </Button>
              <Button
                variant="want"
                size="lg"
                disabled={jaEm('PROCURA')}
                onClick={() => setAAdicionar('PROCURA')}
              >
                {jaEm('PROCURA') ? 'Já procuro' : 'Procuro'}
              </Button>
            </div>
            <p className="text-[13px] leading-relaxed text-faint">
              Você escolhe condição e quantidade no passo seguinte.
            </p>
          </div>
        </div>
      </div>

      <FolhaAdicionar
        carta={aAdicionar ? carta : null}
        tipo={aAdicionar ?? 'OFERTA'}
        onFechar={() => setAAdicionar(null)}
      />
    </Moldura>
  )
}

function Linha({
  rotulo,
  valor,
  dica,
}: {
  rotulo: string
  valor?: string | null
  dica?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{rotulo}</dt>
      <dd className="min-w-0 text-right text-paper">
        {valor ?? <span className="text-faint">não informado</span>}
        {dica && <span className="block text-[12px] text-faint">{dica}</span>}
      </dd>
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-5 py-10 xl:max-w-5xl">
      {children}
    </div>
  )
}
