import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

/**
 * Alerta de carta — "avise quando aparecer" (Fase B da seção 16).
 *
 * A lista inteira vem numa consulta só e a tela pergunta por carta. São poucos
 * por pessoa (é a lista do que ela está esperando, não do que ela procura), e
 * uma chamada por carta aberta seria uma requisição em toda página de detalhe
 * para responder o estado de um interruptor.
 */

const CHAVE = ['alertas'] as const

export interface Alerta {
  card_id: string
  finish_id: number | null
  criado_em: string
}

export function useAlertas() {
  return useQuery<Alerta[]>({
    queryKey: CHAVE,
    queryFn: () => api.get<Alerta[]>('/me/alerts'),
    staleTime: 60_000,
  })
}

/** O interruptor de uma carta. `undefined` enquanto a lista não chegou. */
export function useAlertaDaCarta(cardId: string | undefined) {
  const { data } = useAlertas()
  if (!data || !cardId) return undefined
  return data.some((a) => a.card_id === cardId)
}

export function useLigarAlerta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cardId: string) => api.post('/me/alerts', { card_id: cardId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useDesligarAlerta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cardId: string) => api.del(`/me/alerts/${cardId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}
