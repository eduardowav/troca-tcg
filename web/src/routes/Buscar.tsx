import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  AcoesBrutal,
  BotaoListaBrutal,
  CelulaBrutal,
  GradeBrutal,
} from '@/components/brutal/Cartas'
import { BotaoBrutal, Cartela } from '@/components/brutal/Pecas'
import { FiltroCatalogo } from '@/components/carta/FiltroCatalogo'
import { FolhaAdicionar } from '@/components/carta/FolhaAdicionar'
import { IconeBusca } from '@/components/ui/Icone'
import { useAcabamentosDaCarta } from '@/hooks/useAcabamentos'
import { useAnuncios, usePrecosPorId } from '@/hooks/useAnuncios'
import { useCardSearch } from '@/hooks/useCardSearch'
import { useDebounced } from '@/hooks/useDebounced'
import { precoDoAcabamento } from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import {
  type Carta,
  type FiltrosBusca,
  type ListingKind,
  SEM_FILTRO,
  temFiltro,
} from '@/lib/types'

/**
 * Busca do catálogo, agora com tela própria.
 *
 * Existe para o outro modo de usar a busca: explorar. Quem sabe o nome da carta
 * resolve na lista curta do topo; quem quer varrer uma expansão, ou ver todas as
 * Ilustração Rara, precisa de filtros, arte grande e paginação — e isso não cabe
 * num dropdown sem virar aquele painel que tomava a tela do celular.
 */
export default function Buscar() {

  const [params, setParams] = useSearchParams()
  const [termo, setTermo] = useState(params.get('q') ?? '')
  const [filtros, setFiltros] = useState<FiltrosBusca>(SEM_FILTRO)
  const busca = useDebounced(termo)

  const {
    cartas: resultados,
    total,
    carregando,
    temMais,
    carregarMais,
    carregandoMais,
    atalho,
    ativa,
  } = useCardSearch(busca, filtros)

  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const { data: anuncios } = useAnuncios()
  const idsVisiveis = useMemo(
    () => (resultados ?? []).map((c) => c.id),
    [resultados],
  )
  const precos = usePrecosPorId(idsVisiveis).data
  const { data: acabamentos } = useAcabamentosDaCarta(idsVisiveis)
  // A carta escolhida e a lista de destino; `null` mantém a folha fechada.
  const [aAdicionar, setAAdicionar] = useState<{
    carta: Carta
    tipo: ListingKind
  } | null>(null)

  const porTipo = useMemo(
    () => ({
      OFERTA: new Set(
        (anuncios ?? []).filter((a) => a.tipo === 'OFERTA').map((a) => a.card_id),
      ),
      PROCURA: new Set(
        (anuncios ?? [])
          .filter((a) => a.tipo === 'PROCURA')
          .map((a) => a.card_id),
      ),
    }),
    [anuncios],
  )

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 pb-8 2xl:max-w-[120rem]">
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Buscar cartas
        </h1>
      </header>

      <div className="w-full">
        {/* A busca desta tela é campo comum, não a lista suspensa: aqui o
            resultado é a página inteira, e uma lista caindo por cima dela
            competiria com o que a pessoa veio ver. Largura do conteúdo, para
            alinhar com a grade que ela alimenta. */}
        <div className="relative mt-5">
          <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-apagado" />
          <input
            autoFocus
            type="search"
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value)
              // A URL acompanha para o resultado ser compartilhável e sobreviver
              // a um recarregamento.
              setParams(e.target.value ? { q: e.target.value } : {}, {
                replace: true,
              })
            }}
            aria-label="Buscar carta pelo nome"
            placeholder="Busque: Regigigas, Umbreon, Pesquisa…"
            className="h-12 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela pr-3 pl-10 font-corpo text-[16px] text-tinta placeholder:text-apagado focus:outline-none lg:h-14 lg:text-[17px]"
          />
        </div>

        {/* Um botão só, e os três seletores atrás dele.
            Três `<select>` sempre abertos ocupavam a largura inteira embaixo do
            campo e competiam com o resultado, que é o que a pessoa veio ver — e
            a maioria das buscas é por nome, sem filtro nenhum. Fechado por
            padrão, com a contagem de quantos estão ativos, para que estar
            fechado nunca esconda que há filtro aplicado. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            className={cn(
              'inline-flex items-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta px-4 py-2',
              'font-titulo text-[13px] font-extrabold uppercase transition-shadow',
              temFiltro(filtros)
                ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            Filtros
            {quantosFiltros(filtros) > 0 && (
              <span className="font-dado text-[12px]">
                {quantosFiltros(filtros)}
              </span>
            )}
            <span aria-hidden className="font-dado text-[11px]">
              {filtrosAbertos ? '▲' : '▼'}
            </span>
          </button>

          {temFiltro(filtros) && (
            <button
              type="button"
              onClick={() => setFiltros(SEM_FILTRO)}
              className="ml-2 font-corpo text-[13px] font-medium text-azul underline underline-offset-2"
            >
              Limpar
            </button>
          )}

          {filtrosAbertos && (
            <Cartela className="mt-3 p-3">
              <FiltroCatalogo filtros={filtros} onFiltros={setFiltros} />
            </Cartela>
          )}
        </div>

        {atalho && (
          <p role="status" className="mt-2 font-corpo text-[13px] text-apagado">
            Lendo como carta{' '}
            <span className="font-dado text-tinta">{atalho.numero}</span> de{' '}
            <span className="font-medium text-tinta">{atalho.set.nome}</span>.
          </p>
        )}
      </div>

      <div className="mt-5 flex-1">
        {!ativa ? (
          <Convite />
        ) : carregando ? (
          <p className="py-10 text-center font-corpo text-[15px] text-apagado">Buscando…</p>
        ) : resultados?.length ? (
          <>
            {total > resultados.length && (
              <p role="status" className="mb-3 font-dado text-[12px] uppercase text-apagado">
                Mostrando {resultados.length} de {total} cartas
              </p>
            )}
            <GradeBrutal>
              {resultados.map((carta) => {
                const naOferta = porTipo.OFERTA.has(carta.id)
                const naProcura = porTipo.PROCURA.has(carta.id)
                return (
                  <CelulaBrutal
                    key={carta.id}
                    carta={carta}
                    destaque={naOferta ? 'OFERTA' : naProcura ? 'PROCURA' : null}
                    // Sem acabamento no contexto: o catálogo mostra a impressão
                    // comum, que é o que a busca sempre mostrou. Quem escolhe
                    // acabamento é quem anuncia.
                    preco={precoDoAcabamento(precos?.get(carta.id), undefined)}
                    precoCarregado={precos != null}
                    acabamentos={acabamentos?.get(carta.id)}
                    para={`/carta/${carta.id}`}
                  >
                    <AcoesBrutal>
                      <BotaoListaBrutal
                        tipo="OFERTA"
                        ativo={naOferta}
                        disabled={naOferta}
                        onClick={() => setAAdicionar({ carta, tipo: 'OFERTA' })}
                      />
                      <BotaoListaBrutal
                        tipo="PROCURA"
                        ativo={naProcura}
                        disabled={naProcura}
                        onClick={() => setAAdicionar({ carta, tipo: 'PROCURA' })}
                      />
                    </AcoesBrutal>
                  </CelulaBrutal>
                )
              })}
            </GradeBrutal>
            {temMais && (
              <button
                onClick={() => carregarMais()}
                disabled={carregandoMais}
                className="mt-4 w-full"
              >
                <BotaoBrutal className="w-full justify-center">
                  {carregandoMais ? 'Carregando…' : 'Mostrar mais'}
                </BotaoBrutal>
              </button>
            )}
          </>
        ) : (
          <p className="py-10 text-center font-titulo text-[17px] font-bold text-tinta">
            Nenhuma carta com esse nome.
          </p>
        )}
      </div>

      <FolhaAdicionar
        carta={aAdicionar?.carta ?? null}
        tipo={aAdicionar?.tipo ?? 'OFERTA'}
        onFechar={() => setAAdicionar(null)}
      />
    </div>
  )
}

/** Quantos filtros estão ativos — o número que aparece no botão. */
function quantosFiltros(f: FiltrosBusca): number {
  return [f.serie, f.set, f.raridade].filter(Boolean).length
}

function Convite() {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <span className="grid size-14 place-items-center rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela text-tinta shadow-[var(--shadow-duro)]">
        <IconeBusca className="size-6" />
      </span>
      <p className="mt-5 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
        Busque pelo nome, ou escolha uma expansão para navegar carta a carta.
      </p>
    </div>
  )
}
