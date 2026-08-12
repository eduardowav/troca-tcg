import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  desligar,
  estadoAtual,
  type EstadoPush,
  ligar,
  suportaPush,
} from '@/lib/push'

const CHAVE = ['push'] as const

/**
 * O estado do aviso no sistema, neste navegador.
 *
 * Consulta e não `useState`: o estado real mora no navegador (a inscrição do
 * `PushManager`), não no React — e ele muda por fora do app, quando a pessoa
 * revoga a permissão nas configurações do sistema ou reinstala o PWA.
 *
 * Sem `staleTime`: é barato (não sai da máquina) e ficar desatualizado aqui
 * significa desenhar um interruptor mentindo sobre o próprio estado.
 */
export function useEstadoPush() {
  return useQuery<EstadoPush>({
    queryKey: CHAVE,
    queryFn: estadoAtual,
  })
}

export function useLigarPush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ligar,
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useDesligarPush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: desligar,
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/**
 * Ouve o service worker pedindo para navegar.
 *
 * Quando a pessoa toca numa notificação com o app já aberto, o worker prefere
 * reaproveitar a aba a abrir outra. Onde o `WindowClient.navigate` não existe —
 * o Safari do iOS — ele manda esta mensagem, e quem navega é o roteador daqui:
 * sem recarregar a página e sem perder o que estava na tela.
 */
export function useNavegacaoPorNotificacao() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!suportaPush()) return

    function aoReceber(evento: MessageEvent) {
      const dados = evento.data as { tipo?: string; link?: string } | null
      if (dados?.tipo === 'NAVEGAR' && dados.link) navigate(dados.link)
    }

    navigator.serviceWorker.addEventListener('message', aoReceber)
    return () => navigator.serviceWorker.removeEventListener('message', aoReceber)
  }, [navigate])
}
