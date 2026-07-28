import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listarMatches,
  type Match,
  obterMatch,
  responderMatch,
} from '@/lib/matches'

const CHAVE = ['matches'] as const

/**
 * Feed de matches.
 *
 * O GET dispara o recálculo no servidor (matching roda sob demanda), então cada
 * visita já traz o que surgiu desde a última. Por isso `staleTime` curto: voltar
 * para o feed depois de mexer nas listas deve refletir a mudança.
 */
export function useMatches() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: listarMatches,
    staleTime: 30 * 1000,
  })
}

export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, id],
    enabled: Boolean(id),
    queryFn: () => obterMatch(id as string),
  })
}

/** Aceitar ou recusar. A resposta já vem com o status novo — e, se todo mundo
 *  aceitou, com o contato liberado. */
export function useResponderMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, aceitou }: { id: string; aceitou: boolean }) =>
      responderMatch(id, aceitou),

    onSuccess: (match: Match) => {
      queryClient.setQueryData([...CHAVE, match.id], match)
      queryClient.invalidateQueries({ queryKey: CHAVE })
    },
  })
}
