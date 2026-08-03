import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  concluirMatch,
  furouMatch,
  listarHistorico,
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

/**
 * Trocas encerradas, para o histórico do perfil.
 *
 * A chave mora debaixo de `matches` de propósito: registrar um desfecho já
 * invalida essa raiz, então a troca que acabou de fechar aparece aqui sem
 * ninguém precisar lembrar de invalidar uma segunda chave. `staleTime` longo
 * porque histórico só muda quando uma troca termina — e é exatamente isso que a
 * invalidação cobre.
 */
export function useHistorico() {
  return useQuery({
    queryKey: [...CHAVE, 'historico'],
    queryFn: listarHistorico,
    staleTime: 5 * 60 * 1000,
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

/**
 * Desfecho da troca: aconteceu ou a pessoa não apareceu.
 *
 * Invalida o perfil junto porque é aqui que a reputação muda — sem isso a tela
 * de perfil continuaria mostrando o número velho.
 */
export function useDesfechoMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, aconteceu }: { id: string; aconteceu: boolean }) =>
      aconteceu ? concluirMatch(id) : furouMatch(id),

    onSuccess: (match: Match) => {
      queryClient.setQueryData([...CHAVE, match.id], match)
      queryClient.invalidateQueries({ queryKey: CHAVE })
      queryClient.invalidateQueries({ queryKey: ['perfil'] })
    },
  })
}
