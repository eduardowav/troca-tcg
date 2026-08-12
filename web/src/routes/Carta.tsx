import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { SeloRaridade } from '@/components/brutal/Cartas'
import { BotaoBrutal, Cartela } from '@/components/brutal/Pecas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import { AvisarQuandoAparecer } from '@/components/carta/AvisarQuandoAparecer'
import { FolhaAdicionar } from '@/components/carta/FolhaAdicionar'
import { useAcabamentosDaCarta } from '@/hooks/useAcabamentos'
import { useAnuncios, useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useCatalogo } from '@/hooks/useCatalogo'
import { useMarcaOculta } from '@/hooks/useMundo'
import { precoDoAcabamento } from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
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
 *
 * Cópia do frame `pokeswap-card-detail` na pele, não na informação. Três coisas
 * do arquivo não têm lastro aqui e ficaram de fora:
 *
 * - **ESTADO e IDIOMA** são propriedades do anúncio, não da carta. A mesma carta
 *   tem condição diferente em cada lista de cada pessoa; fixá-las na página do
 *   catálogo seria afirmar que existe uma.
 * - **MINHAS ANOTAÇÕES** não existe no schema. Um campo de texto por carta é
 *   tabela nova, não pintura.
 * - **VALOR ESTIMADO (MÉDIA DO MERCADO)**, em número único, apaga a diferença
 *   que esta tela existe para mostrar: a mesma carta sai por US$ 0,13 em normal
 *   e US$ 0,22 em reverse. O bloco de preço continua uma linha por acabamento.
 */
export default function CartaDetalhe() {
  useMarcaOculta()

  const { id } = useParams<{ id: string }>()
  const ids = id ? [id] : []
  const { data: cartas, isPending } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)
  const { data: acabamentosPorCarta } = useAcabamentosDaCarta(ids)
  const { data: catalogo } = useCatalogo()
  const { data: anuncios } = useAnuncios()
  const [aAdicionar, setAAdicionar] = useState<ListingKind | null>(null)

  const carta = id ? cartas?.get(id) : undefined
  const lista = id ? precos?.get(id) : undefined
  const set = carta && catalogo?.setsPorCodigo.get(carta.set_code)

  // Uma linha de preço por acabamento que a fonte precifica de verdade. Os
  // especiais ficam de fora: todos herdariam o número da reverse e a tela
  // mostraria "Poké Ball US$ 0,22 · Master Ball US$ 0,22", três preços iguais
  // afirmando algo que não é verdade sobre nenhum dos dois.
  const porAcabamento = (id ? (acabamentosPorCarta?.get(id) ?? []) : [])
    .map((a) => ({ acabamento: a, escolha: precoDoAcabamento(lista, a) }))
    .filter((linha) => linha.escolha?.exato)

  const jaEm = (tipo: ListingKind) =>
    (anuncios ?? []).some((a) => a.card_id === id && a.tipo === tipo)

  if (isPending) {
    return (
      <Moldura>
        <div className="mx-auto aspect-[2.5/3.5] w-[20rem] max-w-full animate-pulse rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela" />
      </Moldura>
    )
  }

  if (!carta) {
    return (
      <Moldura>
        <p className="font-titulo text-[17px] font-bold text-tinta">
          Carta não encontrada.
        </p>
        <BotaoBrutal to="/buscar" className="mt-5 self-start">
          Voltar para a busca
        </BotaoBrutal>
      </Moldura>
    )
  }

  const valorComum = formatarPreco(precoDoAcabamento(lista, undefined)?.preco)

  return (
    <Moldura>
      {/* O cabeçalho desta tela é a volta e o título, sem a marca — é o que a
          `card-detail` do arquivo desenha, e é o que faz sentido numa tela em
          que se entrou. O voltar é botão redondo com borda, mesma peça do sino:
          no celular, um link de texto de 13px não é alvo de toque. */}
      <div className="flex items-center gap-3">
        <Link
          to="/buscar"
          aria-label="Voltar para a busca"
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <p className="font-titulo text-[18px] leading-none font-black text-tinta">
          Detalhes da carta
        </p>
      </div>

      {/* Empilhado no celular, lado a lado a partir de sm: a arte é o assunto,
          e no telefone ela merece a largura inteira antes dos dados. */}
      <div className="mt-5 flex flex-col gap-7 sm:flex-row sm:items-start">
        <CartaThumb
          carta={carta}
          alta
          className="w-full max-w-[20rem] self-center rounded-[var(--radius-controle)] border-2 border-tinta shadow-[var(--shadow-duro)] sm:w-[20rem] sm:max-w-none sm:self-start lg:w-[24rem]"
        />

        <div className="min-w-0 flex-1">
          <h1 className="font-titulo text-[26px] leading-[1.1] font-black text-tinta lg:text-[32px]">
            {nomeCarta(carta)}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="font-dado text-[12px] font-medium text-apagado">
              {numeroImpresso(carta, set?.total_oficial)}
              {set && ` • ${set.sigla ?? set.code}`}
            </p>
            {carta.raridade && <SeloRaridade raridade={carta.raridade} />}
          </div>

          {/* A divisória tracejada é do arquivo — ela separa identidade de
              dados sem pesar como uma borda cheia. */}
          <hr className="mt-5 border-0 border-t-2 border-dashed border-tinta/25" />

          <dl className="mt-5 flex flex-col gap-2.5">
            <Linha rotulo="Expansão" valor={set?.nome ?? carta.set_code} />
            {carta.nome_pt && carta.nome_en !== carta.nome_pt && (
              <Linha rotulo="Nome em inglês" valor={carta.nome_en} />
            )}
          </dl>

          {/* O preço ganha cartela própria, como o `VALOR ESTIMADO` do arquivo:
              é o dado que decide se a troca é justa, e no corpo da lista ele
              pesava igual a "expansão". A diferença é que aqui pode haver mais
              de uma linha — uma por acabamento. */}
          <Cartela className="mt-4 flex flex-col gap-2 p-3.5">
            <p className="font-dado text-[10px] uppercase text-apagado">
              Preço de referência · TCGplayer
            </p>
            {porAcabamento.length > 0 ? (
              porAcabamento.map(({ acabamento, escolha }) => (
                <p
                  key={acabamento.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="font-corpo text-[14px] text-tinta">
                    {acabamento.nome_pt}
                  </span>
                  <span className="font-titulo text-[18px] font-black text-azul">
                    {formatarPreco(escolha?.preco)}
                  </span>
                </p>
              ))
            ) : valorComum ? (
              <p className="font-titulo text-[22px] font-black text-azul">
                {valorComum}
              </p>
            ) : (
              <p className="font-corpo text-[14px] text-apagado">
                Sem preço listado para esta carta.
              </p>
            )}
          </Cartela>

          {/* Ofereço em azul cheio e Procuro em cartela, seguindo o par de
              ações do arquivo (`OFERECER PARA TROCA` cheio, `EDITAR CARTA`
              vazado). As duas listas são pares no produto — a hierarquia aqui é
              de gesto, não de importância: quem chega numa carta pelo feed ou
              pela busca costuma estar decidindo se a oferece. */}
          <div className="mt-6 flex flex-col gap-2">
            <p className="font-corpo text-[14px] text-apagado">
              Colocar esta carta em:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <AcaoLista
                ativa
                usada={jaEm('OFERTA')}
                onClick={() => setAAdicionar('OFERTA')}
                rotulo="Ofereço"
                rotuloUsado="Já ofereço"
              />
              <AcaoLista
                usada={jaEm('PROCURA')}
                onClick={() => setAAdicionar('PROCURA')}
                rotulo="Procuro"
                rotuloUsado="Já procuro"
              />
            </div>
            <p className="font-corpo text-[13px] leading-relaxed text-apagado">
              Você escolhe condição e quantidade no passo seguinte.
            </p>
          </div>

          <AvisarQuandoAparecer cardId={carta.id} className="mt-4" />
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

function AcaoLista({
  ativa = false,
  usada,
  onClick,
  rotulo,
  rotuloUsado,
}: {
  ativa?: boolean
  usada: boolean
  onClick: () => void
  rotulo: string
  rotuloUsado: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={usada}
      className={cn(
        'rounded-[var(--radius-controle)] border-2 border-tinta px-4 py-3',
        'font-titulo text-[14px] font-extrabold uppercase transition-shadow',
        ativa
          ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
          : 'bg-cartela text-tinta',
        // Já está na lista: perde a sombra e a saturação, mas não some. Quem
        // chega aqui precisa saber que a carta já está lá, e um botão ausente
        // não conta isso.
        usada && 'cursor-default opacity-50 shadow-none',
        !usada && 'hover:shadow-[var(--shadow-duro)]',
      )}
    >
      {usada ? rotuloUsado : rotulo}
    </button>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 font-dado text-[11px] uppercase text-apagado">
        {rotulo}
      </dt>
      <dd className="min-w-0 text-right font-corpo text-[14px] text-tinta">
        {valor ?? <span className="text-apagado">não informado</span>}
      </dd>
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-6 pt-5 pb-10 xl:max-w-5xl">
      {children}
    </div>
  )
}
