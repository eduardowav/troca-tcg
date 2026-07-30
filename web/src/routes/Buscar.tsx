import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { FiltroCatalogo } from '@/components/carta/FiltroCatalogo'
import {
  AcoesDeLista,
  BotaoLista,
  CelulaCarta,
  GradeDeCartas,
} from '@/components/carta/GradeDeCartas'
import { Button } from '@/components/ui/Button'
import { IconeBusca } from '@/components/ui/Icone'
import { FolhaAdicionar } from '@/components/carta/FolhaAdicionar'
import { useAnuncios, usePrecosPorId } from '@/hooks/useAnuncios'
import { useCardSearch } from '@/hooks/useCardSearch'
import { useDebounced } from '@/hooks/useDebounced'
import {
  type Carta,
  type FiltrosBusca,
  type ListingKind,
  SEM_FILTRO,
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

  const { data: anuncios } = useAnuncios()
  const precos = usePrecosPorId((resultados ?? []).map((c) => c.id)).data
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-5 pb-8">
      <header className="w-full max-w-xl pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">Buscar cartas</h1>
      </header>

      <div className="w-full">
        {/* A busca desta tela é campo comum, não a lista suspensa: aqui o
            resultado é a página inteira, e uma lista caindo por cima dela
            competiria com o que a pessoa veio ver. Largura do conteúdo, para
            alinhar com a grade que ela alimenta. */}
        <div className="relative mt-5">
          <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
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
            className="h-12 w-full rounded-[var(--radius-control)] border border-edge bg-surface pr-3 pl-10 text-[16px] text-paper placeholder:text-muted focus:border-volt focus:outline-none"
          />
        </div>

        <FiltroCatalogo
          filtros={filtros}
          onFiltros={setFiltros}
          className="mt-3"
        />

        {atalho && (
          <p role="status" className="mt-2 text-[13px] text-muted">
            Lendo como carta{' '}
            <span className="set-code text-paper">{atalho.numero}</span> de{' '}
            <span className="text-paper">{atalho.set.nome}</span>.
          </p>
        )}
      </div>

      <div className="mt-5 flex-1">
        {!ativa ? (
          <Convite />
        ) : carregando ? (
          <p className="py-10 text-center text-[15px] text-muted">Buscando…</p>
        ) : resultados?.length ? (
          <>
            {total > resultados.length && (
              <p role="status" className="mb-2 text-[13px] text-muted">
                Mostrando {resultados.length} de {total} cartas
              </p>
            )}
            <GradeDeCartas>
              {resultados.map((carta) => {
                const naOferta = porTipo.OFERTA.has(carta.id)
                const naProcura = porTipo.PROCURA.has(carta.id)
                return (
                  <CelulaCarta
                    key={carta.id}
                    carta={carta}
                    destaque={naOferta ? 'OFERTA' : naProcura ? 'PROCURA' : null}
                    preco={precos?.get(carta.id)}
                    para={`/carta/${carta.id}`}
                  >
                    <AcoesDeLista>
                      <BotaoLista
                        tipo="OFERTA"
                        ativo={naOferta}
                        disabled={naOferta}
                        rotulo={naOferta ? 'Na lista' : undefined}
                        onClick={() => setAAdicionar({ carta, tipo: 'OFERTA' })}
                      />
                      <BotaoLista
                        tipo="PROCURA"
                        ativo={naProcura}
                        disabled={naProcura}
                        rotulo={naProcura ? 'Na lista' : undefined}
                        onClick={() => setAAdicionar({ carta, tipo: 'PROCURA' })}
                      />
                    </AcoesDeLista>
                  </CelulaCarta>
                )
              })}
            </GradeDeCartas>
            {temMais && (
              <Button
                variant="subtle"
                block
                className="mt-3"
                loading={carregandoMais}
                onClick={() => carregarMais()}
              >
                Mostrar mais
              </Button>
            )}
          </>
        ) : (
          <p className="py-10 text-center text-[15px] text-muted">
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

function Convite() {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-edge bg-surface text-muted">
        <IconeBusca className="size-6" />
      </div>
      <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">
        Busque pelo nome, ou escolha uma expansão para navegar carta a carta.
      </p>
    </div>
  )
}
