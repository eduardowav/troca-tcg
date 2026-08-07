import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Cartela, IconeEstrela } from '@/components/brutal/Pecas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import { estiloBotao } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useMarcaOculta } from '@/hooks/useMundo'
import { useQuemTem } from '@/hooks/useVitrine'
import { reputacaoTexto } from '@/lib/matches'
import type { OfertaNaVitrine } from '@/lib/vitrine'
import { codigoSet, nomeCarta } from '@/lib/types'

/**
 * Quem tem esta carta.
 *
 * O passo do meio entre o feed e a proposta: a vitrine mostra a carta, esta tela
 * mostra as pessoas, e é aqui que a decisão acontece — porque escolher de quem
 * pedir é escolher com quem marcar um encontro. Daí a reputação ao lado de cada
 * @, e não só a condição da carta.
 *
 * Contato continua fora, como em toda tela anterior ao aceite.
 */
export default function VitrineCarta() {
  useMarcaOculta()

  const { cardId } = useParams<{ cardId: string }>()
  const { data: ofertas, isPending, isError } = useQuemTem(cardId)
  const { data: cartas } = useCartasPorId(useMemo(() => (cardId ? [cardId] : []), [cardId]))
  const carta = cardId ? cartas?.get(cardId) : undefined

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-5 py-8 lg:max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          to="/vitrine"
          aria-label="Voltar para a vitrine"
          className="voltar grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <p className="font-titulo text-[18px] leading-none font-black text-tinta">
          Quem tem esta carta
        </p>
      </div>

      {carta && (
        <div className="mt-6 flex items-start gap-4">
          <Link to={`/carta/${carta.id}`} className="block w-24 shrink-0 sm:w-32">
            <CartaThumb
              carta={carta}
              className="rounded-[var(--radius-imagem)] border-2 border-tinta"
            />
          </Link>
          <div className="min-w-0">
            <h1 className="titulo-pagina font-titulo text-[24px] leading-[1.15] font-black text-tinta lg:text-[30px]">
              {nomeCarta(carta)}
            </h1>
            <p className="mt-1.5 font-dado text-[12px] text-apagado">
              {codigoSet(carta)}
              {carta.set_nome && ` • ${carta.set_nome}`}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex-1">
        {isPending ? (
          <p className="font-corpo text-[15px] text-apagado">Carregando…</p>
        ) : isError ? (
          <p className="font-titulo text-[17px] font-bold text-tinta">
            Não deu para carregar quem tem esta carta.
          </p>
        ) : !ofertas?.length ? (
          <div className="py-8">
            <p className="font-titulo text-[17px] font-bold text-tinta">
              Ninguém está oferecendo esta carta agora.
            </p>
            {/* Sem oferta, o caminho útil é o inverso: entrar na fila de quem a
                procura, para o matcher avisar quando alguém anunciar. */}
            <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
              Coloque a carta no seu Procuro: quando alguém anunciar, a troca
              aparece sozinha nas suas trocas possíveis.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {ofertas.map((oferta) => (
              <li key={oferta.listing_id}>
                <LinhaDeOferta oferta={oferta} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LinhaDeOferta({ oferta }: { oferta: OfertaNaVitrine }) {
  const acabamentoPorId = useAcabamentoPorId()
  const acabamento = acabamentoPorId(oferta.finish_id)

  // A mesma leitura de reputação do feed de trocas — nota com o denominador ao
  // lado, "novo por aqui" quando ainda não há desfecho nenhum.
  const reputacao = reputacaoTexto({
    user_id: '',
    username: oferta.username,
    nome_exibicao: oferta.nome_exibicao,
    trocas_concluidas: oferta.trocas_concluidas,
    trocas_furadas: oferta.trocas_furadas,
    trocas_desistidas: oferta.trocas_desistidas,
    aceitou: null,
    confirmou_conclusao: false,
  })

  return (
    <Cartela className="flex items-center gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-meu font-titulo text-[15px] font-black text-tinta">
        {(oferta.nome_exibicao || oferta.username).charAt(0).toUpperCase()}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to={`/u/${oferta.username}`}
          className="truncate font-titulo text-[15px] font-bold text-tinta underline underline-offset-2"
        >
          @{oferta.username}
        </Link>
        {reputacao && (
          <span className="flex items-center gap-1">
            <IconeEstrela className="size-3 shrink-0 text-azul" />
            <span className="truncate font-dado text-[12px] font-semibold text-apagado">
              {reputacao}
            </span>
          </span>
        )}
        <span className="font-dado text-[11px] uppercase text-apagado">
          {oferta.condicao}
          {acabamento && ` · ${acabamento.nome_curto}`}
          {oferta.quantidade > 1 && ` · ${oferta.quantidade}x`}
        </span>
      </span>

      {/* Leva ao acervo de quem anunciou, com esta carta já escolhida: a
          proposta começa da
          carta que a pessoa estava olhando, não de uma tela em branco.

          `Link` com o estilo do botão, e não um `Button` dentro de um `Link`:
          isto é navegação, e botão dentro de âncora é markup inválido — perde
          abrir em nova aba e o menu de contexto. */}
      <Link
        to={`/vitrine/acervo/${oferta.username}?quero=${oferta.listing_id}`}
        className={estiloBotao({ variant: 'primary', size: 'sm' })}
      >
        Propor
      </Link>
    </Cartela>
  )
}
