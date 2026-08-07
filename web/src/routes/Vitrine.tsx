import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import { BotaoBrutal } from '@/components/brutal/Pecas'
import { AbasDaVitrine } from '@/components/proposta/AbasDaVitrine'
import { IconeBusca } from '@/components/ui/Icone'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useDebounced } from '@/hooks/useDebounced'
import { useVitrine } from '@/hooks/useVitrine'
import { donosTexto } from '@/lib/vitrine'

/**
 * A vitrine — a porta de entrada de quem ainda não tem troca nenhuma.
 *
 * O motor de matching precisa dos dois lados declarados, e boa parte das pessoas
 * só declara um: sabe o que tem, não sabe o que quer. Quem nunca preencheu o
 * Procuro é invisível para o matcher por mais cartas que tenha — e no começo,
 * sem densidade, isso é quase todo mundo. Aqui a pessoa vê o acervo da base e
 * aponta, que é como se troca no balcão da loja.
 *
 * O feed é por **carta**, não por anúncio: cinco pessoas com o mesmo Charizard
 * são uma célula, e quem são as cinco é a pergunta seguinte. Sem isso a carta
 * mais comum da cidade ocuparia a primeira tela inteira.
 */
export default function Vitrine() {
  const [params, setParams] = useSearchParams()
  const [termo, setTermo] = useState(params.get('q') ?? '')
  const busca = useDebounced(termo)

  const filtros = useMemo(() => ({ q: busca || undefined }), [busca])
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVitrine(filtros)

  const cartasDaVitrine = useMemo(
    () => (data?.pages ?? []).flat(),
    [data],
  )
  const { data: cartas } = useCartasPorId(
    useMemo(() => cartasDaVitrine.map((c) => c.card_id), [cartasDaVitrine]),
  )

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 pb-8 2xl:max-w-[120rem]">
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Vitrine
        </h1>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          Tudo que a comunidade tem para trocar. Ache uma carta, veja quem tem e
          ofereça algo em troca — sem precisar saber o que a pessoa procura.
        </p>
      </header>

      <AbasDaVitrine className="mt-5" />

      <div className="relative mt-4 w-full max-w-xl">
        <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-apagado" />
        <input
          type="search"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value)
            // A URL acompanha: a vitrine filtrada é compartilhável e sobrevive a
            // um recarregamento, como a busca do catálogo.
            setParams(e.target.value ? { q: e.target.value } : {}, {
              replace: true,
            })
          }}
          aria-label="Buscar carta na vitrine"
          placeholder="Busque: Charizard, Umbreon, Pesquisa…"
          className="h-12 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela pr-3 pl-10 font-corpo text-[16px] text-tinta placeholder:text-apagado focus:outline-none lg:h-14 lg:text-[17px]"
        />
      </div>

      <div className="mt-5 flex-1">
        {isPending ? (
          <p className="py-10 text-center font-corpo text-[15px] text-apagado">
            Carregando a vitrine…
          </p>
        ) : isError ? (
          <div className="flex flex-col items-center py-14 text-center">
            <p className="font-titulo text-[17px] font-bold text-tinta">
              Não deu para carregar a vitrine.
            </p>
            <button onClick={() => refetch()} className="mt-5">
              <BotaoBrutal>Tentar de novo</BotaoBrutal>
            </button>
          </div>
        ) : !cartasDaVitrine.length ? (
          <Vazio buscando={Boolean(busca)} />
        ) : (
          <>
            <GradeBrutal>
              {cartasDaVitrine.map((item) => {
                const carta = cartas?.get(item.card_id)
                if (!carta) return null
                return (
                  <CelulaBrutal
                    key={item.card_id}
                    carta={carta}
                    para={`/vitrine/carta/${item.card_id}`}
                  >
                    <p className="rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu px-2 py-1.5 font-titulo text-[11px] font-bold text-tinta">
                      {donosTexto(item)}
                    </p>
                  </CelulaBrutal>
                )
              })}
            </GradeBrutal>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 w-full"
              >
                <BotaoBrutal className="w-full justify-center">
                  {isFetchingNextPage ? 'Carregando…' : 'Mostrar mais'}
                </BotaoBrutal>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * O vazio da vitrine é notícia diferente do vazio da busca.
 *
 * Sem ninguém anunciando, o problema é a base — e a única coisa útil a fazer é
 * cadastrar as próprias cartas, que é o que faz a vitrine existir para o
 * próximo. Com busca, é só o termo que não achou nada.
 */
function Vazio({ buscando }: { buscando: boolean }) {
  if (buscando) {
    return (
      <p className="py-10 text-center font-titulo text-[17px] font-bold text-tinta">
        Ninguém está oferecendo essa carta agora.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="font-titulo text-[17px] font-bold text-tinta">
        A vitrine ainda está vazia.
      </p>
      <p className="mt-2 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
        Ninguém tem cartas anunciadas por aqui neste momento. Cadastrar as suas é
        o que faz a vitrine existir para quem chegar depois.
      </p>
      <BotaoBrutal to="/minhas-cartas" className="mt-6">
        Cadastrar minhas cartas
      </BotaoBrutal>
    </div>
  )
}
