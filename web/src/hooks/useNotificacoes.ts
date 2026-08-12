import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  contarNaoLidas,
  listarNotificacoes,
  marcarLidas,
  type Notificacao,
} from '@/lib/notificacoes'
import { supabase } from '@/lib/supabase'
import { useUsuarioId } from '@/stores/auth'

const CHAVE = ['notificacoes'] as const

export function useNotificacoes(apenasNaoLidas = false) {
  return useQuery({
    queryKey: [...CHAVE, apenasNaoLidas],
    queryFn: () => listarNotificacoes(apenasNaoLidas),
  })
}

/**
 * O número da badge.
 *
 * Rota própria, e não o `length` da lista: a badge é perguntada em toda troca
 * de tela e só precisa de um inteiro, enquanto a lista traz cinquenta linhas.
 * Quem mantém esse número em dia sem polling é o `useAssinarNotificacoes`.
 */
export function useNaoLidas() {
  const { data } = useQuery({
    queryKey: [...CHAVE, 'nao-lidas'],
    queryFn: contarNaoLidas,
    staleTime: 60 * 1000,
  })
  return data?.nao_lidas ?? 0
}

export function useMarcarLidas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => marcarLidas(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/**
 * Assina as notificações desta pessoa no Supabase Realtime.
 *
 * Monta uma vez, no layout do app. É o que faz a badge acender enquanto a
 * pessoa está com o app aberto — sem polling e sem custo: o Realtime vem no
 * free tier, e a linha chega pelo mesmo websocket que já está de pé.
 *
 * **O filtro do lado do cliente não é a segurança.** `user_id=eq.<id>` existe
 * para não receber tráfego alheio; quem garante o isolamento é a policy
 * "le proprias notificacoes" (db/schema/24), que o `postgres_changes` aplica
 * com o token de quem assinou. Uma inscrição sem filtro nenhum continuaria não
 * entregando a notificação de outra pessoa.
 *
 * O toast é clicável e leva ao link da notificação — que é o ponto inteiro
 * disto: a proposta que vencia calada agora chega com um caminho até ela.
 */
export function useAssinarNotificacoes() {
  const userId = useUsuarioId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId) return

    const canal = supabase
      .channel(`notificacoes:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        ({ new: nova }) => {
          const linha = nova as Notificacao
          queryClient.invalidateQueries({ queryKey: CHAVE })
          // O feed e as caixas de proposta mudam junto com quase toda
          // notificação — quem foi avisado de uma troca nova quer encontrá-la
          // na lista, não um cache de trinta segundos atrás.
          queryClient.invalidateQueries({ queryKey: ['matches'] })
          queryClient.invalidateQueries({ queryKey: ['propostas'] })

          toast(linha.titulo, {
            description: linha.corpo,
            action: linha.link
              ? { label: 'Abrir', onClick: () => navigate(linha.link as string) }
              : undefined,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [userId, queryClient, navigate])
}
