import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { COLUNAS_CARTA, type Carta } from '@/lib/types'

/**
 * Busca cartas pelo nome em PT ou EN direto no catálogo (leitura pública via RLS).
 * O jogador digita "Pikachu" ou "Pesquisa" e vê as cartas reais, com imagem.
 */
export function useCardSearch(termo: string) {
  const q = termo.trim()

  return useQuery({
    queryKey: ['cards', 'search', q],
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Carta[]> => {
      const padrao = `%${q}%`
      const { data, error } = await supabase
        .from('cards')
        .select(COLUNAS_CARTA)
        .or(`nome_pt.ilike.${padrao},nome_en.ilike.${padrao}`)
        .order('numero', { ascending: true })
        .limit(24)

      if (error) throw error
      return (data ?? []) as Carta[]
    },
  })
}
