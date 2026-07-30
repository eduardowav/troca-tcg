import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import {
  COLUNAS_RARIDADE,
  COLUNAS_SERIE,
  COLUNAS_SET,
  type Raridade,
  type SerieCatalogo,
  type SetCatalogo,
} from '@/lib/types'

export interface Catalogo {
  series: SerieCatalogo[]
  /** Ordenados do lançamento mais recente para o mais antigo. */
  sets: SetCatalogo[]
  /** Sets por série, para o segundo seletor depender do primeiro. */
  setsPorSerie: Map<string, SetCatalogo[]>
  /** Set por código, para resolver o total impresso de uma carta. */
  setsPorCodigo: Map<string, SetCatalogo>
  /** Raridades distintas, do mais comum ao mais raro. */
  raridades: Raridade[]
}

/**
 * Séries e expansões do catálogo, para os seletores do filtro.
 *
 * São 11 séries e 112 sets — cabe tudo em uma carga só, e o catálogo só muda
 * quando alguém roda o job de sync. Daí `staleTime: Infinity`: refazer essa
 * consulta durante a sessão seria gasto sem ganho nenhum.
 */
export function useCatalogo() {
  return useQuery({
    queryKey: ['catalogo'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Catalogo> => {
      const [rSeries, rSets, rRaridades] = await Promise.all([
        supabase.from('series').select(COLUNAS_SERIE).order('nome'),
        supabase
          .from('sets')
          .select(COLUNAS_SET)
          .order('lancado_em', { ascending: false, nullsFirst: false })
          .order('code'),
        supabase.from('raridades').select(COLUNAS_RARIDADE).order('ordem'),
      ])

      if (rSeries.error) throw rSeries.error
      if (rSets.error) throw rSets.error
      if (rRaridades.error) throw rRaridades.error

      const sets = (rSets.data ?? []) as SetCatalogo[]
      const setsPorSerie = new Map<string, SetCatalogo[]>()
      for (const s of sets) {
        if (!s.serie_code) continue
        const lista = setsPorSerie.get(s.serie_code)
        if (lista) lista.push(s)
        else setsPorSerie.set(s.serie_code, [s])
      }

      // O mapa tem uma linha por valor da fonte, e dois valores podem virar o
      // mesmo rótulo ("Comum" e "Common"). O seletor mostra rótulo, então a
      // repetição sai aqui — se ficasse, "Comum" apareceria duas vezes na lista.
      const raridades: Raridade[] = []
      const vistos = new Set<string>()
      for (const r of (rRaridades.data ?? []) as Raridade[]) {
        if (vistos.has(r.rotulo)) continue
        vistos.add(r.rotulo)
        raridades.push({ rotulo: r.rotulo, ordem: r.ordem })
      }

      return {
        series: (rSeries.data ?? []) as SerieCatalogo[],
        sets,
        setsPorSerie,
        setsPorCodigo: new Map(sets.map((s) => [s.code, s])),
        raridades,
      }
    },
  })
}

/** Rótulo da expansão nos seletores: "PRE · Evoluções Prismáticas". */
export function rotuloSet(s: SetCatalogo): string {
  return s.sigla ? `${s.sigla} · ${s.nome}` : s.nome
}
