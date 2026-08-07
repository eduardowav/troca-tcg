import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  abrirProposta,
  aceitarProposta,
  type Caixa,
  contraporProposta,
  type ItensDaProposta,
  listarPropostas,
  obterProposta,
  type Proposta,
  recusarProposta,
  retirarProposta,
} from '@/lib/propostas'

const CHAVE = ['propostas'] as const

export function usePropostas(caixa: Caixa) {
  return useQuery({
    queryKey: [...CHAVE, caixa],
    staleTime: 30 * 1000,
    queryFn: () => listarPropostas(caixa),
  })
}

/**
 * Quantas propostas esperam resposta **minha** — a badge da aba.
 *
 * Reaproveita a caixa `minha_vez` em vez de uma rota de contagem: é a mesma
 * consulta que a tela abre logo a seguir, então o número já deixa a lista quente
 * no cache. Proposta enviada e ainda não respondida não entra: não é tarefa de
 * quem enviou.
 */
export function useMinhaVez() {
  const { data } = usePropostas('minha_vez')
  return data?.length ?? 0
}

export function useProposta(id: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, 'detalhe', id],
    enabled: Boolean(id),
    queryFn: () => obterProposta(id as string),
  })
}

/**
 * O que toda resposta de proposta faz com o cache.
 *
 * O detalhe é gravado direto (a API devolve a proposta inteira), as caixas são
 * invalidadas porque a proposta trocou de lista, e `matches` entra junto: um
 * aceite acabou de criar uma troca, e sem isso o feed de trocas mostraria a
 * lista de antes justamente no momento em que a pessoa é mandada para lá.
 */
function useAcaoDeProposta<V>(acao: (valor: V) => Promise<Proposta>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: acao,
    onSuccess: (proposta: Proposta) => {
      queryClient.setQueryData([...CHAVE, 'detalhe', proposta.id], proposta)
      queryClient.invalidateQueries({ queryKey: CHAVE })
      if (proposta.match_id) {
        queryClient.invalidateQueries({ queryKey: ['matches'] })
      }
    },
  })
}

export function useAbrirProposta() {
  return useAcaoDeProposta(
    ({ para, itens }: { para: string; itens: ItensDaProposta }) =>
      abrirProposta(para, itens),
  )
}

export function useAceitarProposta() {
  return useAcaoDeProposta((id: string) => aceitarProposta(id))
}

export function useRecusarProposta() {
  return useAcaoDeProposta((id: string) => recusarProposta(id))
}

export function useRetirarProposta() {
  return useAcaoDeProposta((id: string) => retirarProposta(id))
}

export function useContrapor() {
  return useAcaoDeProposta(
    ({ id, itens }: { id: string; itens: ItensDaProposta }) =>
      contraporProposta(id, itens),
  )
}
