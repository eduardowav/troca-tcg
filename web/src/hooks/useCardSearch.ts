import { useInfiniteQuery } from '@tanstack/react-query'

import { useCatalogo } from '@/hooks/useCatalogo'
import { supabase } from '@/lib/supabase'
import {
  type Carta,
  type FiltrosBusca,
  SEM_FILTRO,
  type SetCatalogo,
} from '@/lib/types'

const POR_PAGINA = 24

/** A função devolve a contagem completa junto de cada linha (ver 13_busca_cartas.sql). */
interface CartaBusca extends Carta {
  total: number
}

interface Atalho {
  set: SetCatalogo
  numero: string
}

/**
 * "OBF 125" é como o colecionador escreve uma carta. Reconhecer isso poupa dois
 * toques no filtro.
 *
 * Exige a parte numérica de propósito: várias siglas são também nome de Pokémon
 * — 'MEW' é a sigla de 151 — e quem digita só "mew" quer o Mew, não o set
 * inteiro. Com o número junto a intenção deixa de ser ambígua.
 */
function interpretarAtalho(
  termo: string,
  filtros: FiltrosBusca,
  sets: SetCatalogo[] | undefined,
): Atalho | null {
  if (!sets || filtros.set) return null

  const partes = termo.split(/\s+/).filter(Boolean)
  if (partes.length !== 2) return null

  const numero = partes[1]
  if (!/^\d{1,5}$/.test(numero)) return null

  const chave = partes[0].toLowerCase()
  const set = sets.find(
    (s) => s.sigla?.toLowerCase() === chave || s.code.toLowerCase() === chave,
  )
  return set ? { set, numero } : null
}

/**
 * Busca cartas pelo nome, com filtro opcional por série e expansão.
 *
 * A inteligência mora em `buscar_cartas()` no Postgres: acento e caixa não
 * importam, palavras não precisam ser contíguas, erro de digitação cai na
 * similaridade, e a ordem é relevância → carta mais recente. Aqui não dá para
 * fazer isso com o query builder do PostgREST — `.or(ilike)` não tem como
 * expressar "ordene por quão bem casou". Daí a RPC.
 *
 * Com filtro, o termo deixa de ser obrigatório: escolher uma expansão e navegar
 * as cartas dela é um uso legítimo.
 */
export function useCardSearch(
  termo: string,
  filtros: FiltrosBusca = SEM_FILTRO,
) {
  const { data: catalogo } = useCatalogo()

  const bruto = termo.trim()
  const atalho = interpretarAtalho(bruto, filtros, catalogo?.sets)

  const q = atalho ? atalho.numero : bruto
  const serie = filtros.serie
  const set = atalho ? atalho.set.code : filtros.set
  const raridade = filtros.raridade

  const query = useInfiniteQuery({
    queryKey: ['cards', 'busca', q, serie, set, raridade],
    enabled:
      q.length >= 2 || serie !== null || set !== null || raridade !== null,
    staleTime: 5 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CartaBusca[]> => {
      const { data, error } = await supabase.rpc('buscar_cartas', {
        termo: q,
        limite: POR_PAGINA,
        deslocamento: pageParam,
        filtro_serie: serie,
        filtro_set: set,
        filtro_raridade: raridade,
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
    /** Preenchido quando o termo foi lido como "SIGLA NÚMERO". */
    atalho,
    /** Falso quando falta termo e não há filtro — a tela mostra o estado vazio. */
    // Mesma condição do `enabled` acima, e precisa continuar sendo: `enabled`
    // decide se a consulta roda, `ativa` decide se a tela desenha o resultado.
    // Quando as duas discordam, a busca acontece e é jogada fora.
    ativa:
      q.length >= 2 || serie !== null || set !== null || raridade !== null,
  }
}
