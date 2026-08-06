import { useMutation, useQuery } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { denunciarMatch, type MotivoDenuncia } from '@/lib/denuncias'
import { obterPerfilPublico, type PerfilPublico } from '@/lib/perfil'

/**
 * O perfil de outra pessoa.
 *
 * Chave por @ e não por id: é o @ que vem da URL e dos links espalhados pelo
 * app. `staleTime` de cinco minutos porque o que muda aqui são contadores de
 * troca, que só se mexem quando um desfecho é registrado — e quem registra é a
 * outra ponta, então não há o que invalidar deste lado.
 *
 * Sem retry: @ que não existe devolve 404, e insistir três vezes só atrasa a
 * mensagem de "não encontramos ninguém com esse @".
 */
export function usePerfilPublico(username: string | undefined) {
  return useQuery<PerfilPublico>({
    queryKey: ['perfil-publico', username],
    enabled: Boolean(username),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => obterPerfilPublico(username as string),
  })
}

/**
 * Denunciar.
 *
 * Não invalida nada de propósito: a denúncia não muda uma linha do que está na
 * tela. Reputação continua sendo assunto do desfecho do match, e prometer o
 * contrário — um contador que sobe, um selo que aparece — seria dizer que a
 * moderação já aconteceu. Ela é uma pessoa lendo, e leva o tempo que leva.
 */
export function useDenunciar() {
  return useMutation<
    unknown,
    ApiError,
    { id: string; motivo: MotivoDenuncia; descricao?: string }
  >({
    mutationFn: ({ id, motivo, descricao }) =>
      denunciarMatch(id, motivo, descricao),
  })
}
