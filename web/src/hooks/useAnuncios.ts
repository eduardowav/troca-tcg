import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type Anuncio,
  type AnuncioEdicao,
  atualizarAnuncio,
  listarAnuncios,
  removerAnuncio,
} from '@/lib/anuncios'
import { supabase } from '@/lib/supabase'
import { COLUNAS_CARTA, type Carta } from '@/lib/types'

const CHAVE = ['anuncios'] as const

/**
 * Anúncios do usuário, vindos da API (dados dele, autenticados).
 *
 * O AnuncioOut carrega só `card_id` — nome e imagem moram no catálogo, que o
 * frontend lê direto do Postgres com a anon key. Manter assim preserva a divisão
 * do projeto: API para dado de usuário, leitura pública para catálogo.
 */
export function useAnuncios() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: () => listarAnuncios(),
  })
}

/** Cartas do catálogo por id, em um mapa pronto para o render das listas. */
export function useCartasPorId(ids: string[]) {
  // Ordena para a chave não variar com a ordem de chegada dos anúncios.
  const chave = [...new Set(ids)].sort()

  return useQuery({
    queryKey: ['cards', 'porId', chave],
    enabled: chave.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, Carta>> => {
      const { data, error } = await supabase
        .from('cards')
        .select(COLUNAS_CARTA)
        .in('id', chave)

      if (error) throw error
      return new Map((data as Carta[]).map((c) => [c.id, c]))
    },
  })
}

/** Edição inline com atualização otimista — o controle responde na hora. */
export function useEditarAnuncio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: AnuncioEdicao }) =>
      atualizarAnuncio(id, dados),

    onMutate: async ({ id, dados }) => {
      await queryClient.cancelQueries({ queryKey: CHAVE })
      const anterior = queryClient.getQueryData<Anuncio[]>(CHAVE)

      queryClient.setQueryData<Anuncio[]>(CHAVE, (atual) =>
        atual?.map((a) => (a.id === id ? { ...a, ...dados } : a)),
      )
      return { anterior }
    },

    // Falhou (ex.: 409 de anúncio duplicado): desfaz o otimismo.
    onError: (_erro, _vars, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(CHAVE, contexto.anterior)
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/**
 * Remoção. A API faz soft delete (ativo=false), então o anúncio some da lista
 * mas o histórico e os matches existentes continuam de pé.
 */
export function useRemoverAnuncio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => removerAnuncio(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CHAVE })
      const anterior = queryClient.getQueryData<Anuncio[]>(CHAVE)
      queryClient.setQueryData<Anuncio[]>(CHAVE, (atual) =>
        atual?.filter((a) => a.id !== id),
      )
      return { anterior }
    },

    onError: (_erro, _id, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(CHAVE, contexto.anterior)
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}
