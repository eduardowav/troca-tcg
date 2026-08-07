import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import { BotaoBrutal, Cartela } from '@/components/brutal/Pecas'
import { FiltroCatalogo } from '@/components/carta/FiltroCatalogo'
import { AbasDaVitrine } from '@/components/proposta/AbasDaVitrine'
import { IconeBusca } from '@/components/ui/Icone'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useDebounced } from '@/hooks/useDebounced'
import { useVitrine } from '@/hooks/useVitrine'
import { cn } from '@/lib/cn'
import { type FiltrosBusca, SEM_FILTRO, temFiltro } from '@/lib/types'
import {
  donosTexto,
  ORDEM_PADRAO,
  ORDENS,
  type OrdemVitrine,
  precoTexto,
} from '@/lib/vitrine'

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

  // Catálogo, ordem e "fecha comigo" moram na URL, como o termo de busca: a
  // vitrine filtrada é compartilhável, sobrevive ao recarregamento e volta
  // inteira quando a pessoa entra numa carta e aperta voltar.
  const [catalogo, setCatalogo] = useState<FiltrosBusca>(SEM_FILTRO)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const ordem = ordemDaUrl(params.get('ordem'))
  const soProcuro = params.get('so_procuro') === 'true'

  function mexerNaUrl(mudanca: Record<string, string | null>) {
    const novo = new URLSearchParams(params)
    for (const [chave, valor] of Object.entries(mudanca)) {
      if (valor) novo.set(chave, valor)
      else novo.delete(chave)
    }
    setParams(novo, { replace: true })
  }

  const filtros = useMemo(
    () => ({
      q: busca || undefined,
      set: catalogo.set ?? undefined,
      serie: catalogo.serie ?? undefined,
      raridade: catalogo.raridade ?? undefined,
      ordem,
      so_procuro: soProcuro || undefined,
    }),
    [busca, catalogo, ordem, soProcuro],
  )
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
            mexerNaUrl({ q: e.target.value || null })
          }}
          aria-label="Buscar carta na vitrine"
          placeholder="Busque: Charizard, Umbreon, Pesquisa…"
          className="h-12 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela pr-3 pl-10 font-corpo text-[16px] text-tinta placeholder:text-apagado focus:outline-none lg:h-14 lg:text-[17px]"
        />
      </div>

      {/* Ordem, catálogo e reciprocidade numa fileira só, e a fileira tem a
          mesma largura das abas e do campo de busca — três blocos empilhados
          com as bordas alinhadas, em vez de uma linha curta boiando à esquerda.
          Cada controle leva `flex-1` pelo mesmo motivo que as abas: bordas
          desalinhadas num mundo de borda grossa leem como defeito.

          Três controles é o teto do que cabe num celular sem virar painel — e o
          painel de coleção fica fechado por padrão, como na busca do catálogo,
          porque a maioria das visitas não filtra nada. */}
      {/* Grade de três colunas iguais, e não `flex-1`: com flex, o rótulo dos
          botões (que não quebra linha) puxava largura e a coluna da ordem
          nascia menor que as outras duas. Em grid as três colunas são iguais
          por construção, e as bordas alinham com as abas e a busca de cima. */}
      <div className="mt-3 grid w-full max-w-xl grid-cols-3 gap-2">
        <label className="relative min-w-0">
          <span className="sr-only">Ordenar a vitrine</span>
          {/* `w-full` dentro de um `flex-1`, e não a largura que o conteúdo
              pede: `<select>` nativo se dimensiona pela **maior** opção da
              lista ("Mais gente tem"), então ele nascia largo mesmo mostrando
              "A–Z" e empurrava o "Eu procuro" para a linha de baixo. Preso à
              coluna, ele divide a fileira em três partes iguais — e o rótulo
              comprido trunca no fechado, mas aparece inteiro na lista aberta,
              que é onde a escolha acontece. */}
          <select
            value={ordem}
            onChange={(e) =>
              mexerNaUrl({
                ordem: e.target.value === ORDEM_PADRAO ? null : e.target.value,
              })
            }
            className="h-10 w-full appearance-none truncate rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela pr-5 pl-2 font-titulo text-[11px] font-extrabold uppercase text-tinta focus:outline-none"
          >
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 font-dado text-[9px] text-apagado"
          >
            ▼
          </span>
        </label>

        <button
          type="button"
          onClick={() => setFiltrosAbertos((v) => !v)}
          aria-expanded={filtrosAbertos}
          className={cn(
            'inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-controle)] border-2 border-tinta px-2',
            'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
            temFiltro(catalogo)
              ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]'
              : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
          )}
        >
          <span className="truncate">Coleção</span>
          {quantosFiltros(catalogo) > 0 && (
            <span className="font-dado text-[11px]">
              {quantosFiltros(catalogo)}
            </span>
          )}
        </button>

        {/* O filtro que transforma a vitrine em matching manual: só as cartas
            que já estão no seu Procuro. Para quem declarou o que quer e ainda
            não deu match, é a lista de trocas que faltam só de um lado. */}
        <button
          type="button"
          onClick={() => mexerNaUrl({ so_procuro: soProcuro ? null : 'true' })}
          aria-pressed={soProcuro}
          className={cn(
            'inline-flex h-10 min-w-0 items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta px-2',
            'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
            soProcuro
              ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]'
              : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
          )}
        >
          <span className="truncate">Eu procuro</span>
        </button>
      </div>

      {filtrosAbertos && (
        <Cartela className="mt-3 w-full max-w-xl p-3">
          <FiltroCatalogo filtros={catalogo} onFiltros={setCatalogo} />
        </Cartela>
      )}

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
          <Vazio
            buscando={Boolean(busca)}
            filtrando={temFiltro(catalogo)}
            soProcuro={soProcuro}
            onLimpar={() => {
              setCatalogo(SEM_FILTRO)
              mexerNaUrl({ so_procuro: null })
            }}
          />
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
                      {/* O preço fica dentro da mesma etiqueta, na linha de
                          baixo: são a mesma informação — o que existe daquela
                          carta na prateleira e por quanto —, e duas etiquetas
                          empilhadas roubariam a altura da arte na célula.

                          Carta sem cotação não fica em silêncio. São 1.681 do
                          catálogo — promos, cartas só em PT, sets velhos que a
                          TCGplayer não precifica —, e a linha ausente lia como
                          "o app não carregou" em vez de "não há cotação para
                          esta". É a mesma frase, e o mesmo tom apagado, que a
                          célula do catálogo já usa. */}
                      <span
                        className={cn(
                          'mt-0.5 block font-dado text-[10px] font-medium',
                          precoTexto(item) ? 'text-apagado' : 'text-apagado/70',
                        )}
                      >
                        {precoTexto(item) ?? 'sem preço listado'}
                      </span>
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

/** Quantos filtros de catálogo estão ativos — o número que aparece no botão. */
function quantosFiltros(f: FiltrosBusca): number {
  return [f.serie, f.set, f.raridade].filter(Boolean).length
}

/**
 * A ordem que veio na URL, se for uma das que existem.
 *
 * Link velho ou digitado à mão cai no padrão em vez de virar 422: a vitrine é a
 * tela que as pessoas compartilham, e um parâmetro que não existe mais não pode
 * quebrar a página inteira.
 */
function ordemDaUrl(valor: string | null): OrdemVitrine {
  return ORDENS.some((o) => o.valor === valor)
    ? (valor as OrdemVitrine)
    : ORDEM_PADRAO
}

/**
 * O vazio da vitrine é notícia diferente do vazio da busca.
 *
 * Sem ninguém anunciando, o problema é a base — e a única coisa útil a fazer é
 * cadastrar as próprias cartas, que é o que faz a vitrine existir para o
 * próximo. Com busca, é só o termo que não achou nada.
 */
function Vazio({
  buscando,
  filtrando,
  soProcuro,
  onLimpar,
}: {
  buscando: boolean
  filtrando: boolean
  soProcuro: boolean
  onLimpar: () => void
}) {
  // "Eu procuro" sem resultado é a notícia mais específica das três, e a única
  // que não é sobre a busca: quer dizer que ninguém da base tem nenhuma das
  // cartas do seu Procuro. Vem antes justamente por ser a mais informativa.
  if (soProcuro) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <p className="font-titulo text-[17px] font-bold text-tinta">
          Nada do seu Procuro está na vitrine agora.
        </p>
        <p className="mt-2 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
          Ninguém está oferecendo, neste momento, as cartas que você marcou
          como procuradas. Sem o filtro dá para ver o resto do que existe.
        </p>
        <button onClick={onLimpar} className="mt-6">
          <BotaoBrutal>Ver a vitrine inteira</BotaoBrutal>
        </button>
      </div>
    )
  }

  if (filtrando && !buscando) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <p className="font-titulo text-[17px] font-bold text-tinta">
          Nenhuma carta com esses filtros.
        </p>
        <button onClick={onLimpar} className="mt-5">
          <BotaoBrutal>Limpar filtros</BotaoBrutal>
        </button>
      </div>
    )
  }

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
