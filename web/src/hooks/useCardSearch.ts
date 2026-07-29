import { useInfiniteQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import type { Carta } from '@/lib/types'

const POR_PAGINA = 24

/** A função devolve a contagem completa junto de cada linha (ver 13_busca_cartas.sql). */
interface CartaBusca extends Carta {
  total: number
}

/**
 * Busca cartas pelo nome em PT ou EN. Toda a inteligência mora em
 * `buscar_cartas()` no Postgres: acento e caixa não importam, palavras não
 * precisam ser contíguas, erro de digitação cai na similaridade, e a ordem é
 * relevância → carta mais recente.
 *
 * Aqui não dá para fazer isso com o query builder do PostgREST — `.or(ilike)`
 * não tem como expressar "ordene por quão bem casou". Daí a RPC.
 */
export function useCardSearch(termo: string) {
  const q = termo.trim()

  const query = useInfiniteQuery({
    queryKey: ['cards', 'busca', q],
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CartaBusca[]> => {
      const { data, error } = await supabase.rpc('buscar_cartas', {
        termo: q,
        limite: POR_PAGINA,
        deslocamento: pageParam,
      })
      if (error) throw error
      return (data ?? []) as CartaBusca[]
    },
    getNextPageParam: (ultima, paginas) => {
      const carregadas = paginas.reduce((n, p) => n + p.length, 0)
      // `total` é igual em todas as linhas; a página vazia zera e encerra.
      const total = ultima[0]?.total ?? 0
      return carregadas < total ? carregadas : undefined
    },
  })

  const paginas = query.data?.pages
  const cartas = paginas?.flat()

  return {
    cartas: cartas as Carta[] | undefined,
    total: paginas?.[0]?.[0]?.total ?? 0,
    /** Primeira carga: ainda não há nada na tela. */
    carregando: query.isFetching && !paginas,
    temMais: query.hasNextPage,
    carregarMais: query.fetchNextPage,
    carregandoMais: query.isFetchingNextPage,
    erro: query.isError,
  }
}
