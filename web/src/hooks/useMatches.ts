import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  concluirMatch,
  desistirMatch,
  estenderMatch,
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
 * Desfecho da troca. Três saídas, não duas.
 *
 * Era um booleano — aconteceu ou não aconteceu — e essa era exatamente a falta:
 * quem desistiu de boa-fé tinha de escolher entre acusar o outro de um furo que
 * não houve e sumir. `DESISTI` é a terceira, e é a única que a própria pessoa
 * declara sobre si.
 *
 * Invalida o perfil junto porque é aqui que os contadores mudam — sem isso a
 * tela de perfil continuaria mostrando o número velho.
 */
export type Desfecho = 'ACONTECEU' | 'FUROU' | 'DESISTI'

export function useDesfechoMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, desfecho }: { id: string; desfecho: Desfecho }) =>
      desfecho === 'ACONTECEU'
        ? concluirMatch(id)
        : desfecho === 'FUROU'
          ? furouMatch(id)
          : desistirMatch(id),

    onSuccess: (match: Match) => {
      queryClient.setQueryData([...CHAVE, match.id], match)
      queryClient.invalidateQueries({ queryKey: CHAVE })
      queryClient.invalidateQueries({ queryKey: ['perfil'] })
    },
  })
}

/**
 * Mais uma semana de prazo.
 *
 * Não mexe em reputação nenhuma, então o perfil fica de fora da invalidação — o
 * que muda é a data da troca, e ela vem na resposta.
 */
export function useEstenderMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => estenderMatch(id),

    onSuccess: (match: Match) => {
      queryClient.setQueryData([...CHAVE, match.id], match)
      queryClient.invalidateQueries({ queryKey: CHAVE })
    },
  })
}
