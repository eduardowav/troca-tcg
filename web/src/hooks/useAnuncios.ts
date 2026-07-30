import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type Anuncio,
  type AnuncioEdicao,
  type AnuncioNovo,
  atualizarAnuncio,
  criarAnuncio,
  listarAnuncios,
  listarProcuradas,
  removerAnuncio,
} from '@/lib/anuncios'
import { supabase } from '@/lib/supabase'
import {
  COLUNAS_CARTA,
  COLUNAS_PRECO,
  type Carta,
  precoPrincipal,
  type PrecoTCGplayer,
} from '@/lib/types'

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

/**
 * Demanda pelas minhas ofertas — alimenta a tela vazia de trocas.
 *
 * `enabled` porque só a tela sem match nenhum pergunta isso: quando há troca
 * para mostrar, a troca é o assunto, e a consulta seria trabalho jogado fora.
 */
export function useProcuradas(ativo: boolean) {
  return useQuery({
    queryKey: ['procuradas'],
    enabled: ativo,
    staleTime: 60 * 1000,
    queryFn: () => listarProcuradas(),
  })
}

/**
 * Preço de referência por carta, já resolvido para um acabamento só.
 *
 * Consulta separada de `useCartasPorId` de propósito: preço é a única coisa do
 * catálogo que vence, então tem cache próprio e prazo próprio. Juntar no mesmo
 * select faria o nome e a arte — que não mudam nunca — expirarem junto com ele.
 */
export function usePrecosPorId(ids: string[]) {
  const chave = [...new Set(ids)].sort()

  return useQuery({
    queryKey: ['precos', 'porId', chave],
    enabled: chave.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Map<string, PrecoTCGplayer>> => {
      const { data, error } = await supabase
        .from('card_prices')
        .select(COLUNAS_PRECO)
        .in('card_id', chave)

      if (error) throw error

      const porCarta = new Map<string, PrecoTCGplayer[]>()
      for (const preco of (data ?? []) as PrecoTCGplayer[]) {
        const lista = porCarta.get(preco.card_id)
        if (lista) lista.push(preco)
        else porCarta.set(preco.card_id, [preco])
      }

      const principais = new Map<string, PrecoTCGplayer>()
      for (const [card_id, lista] of porCarta) {
        const escolhido = precoPrincipal(lista)
        if (escolhido) principais.set(card_id, escolhido)
      }
      return principais
    },
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
      // Traz o set junto para a lista mostrar o mesmo "PRE 059" da busca — sem
      // isso, a mesma carta apareceria como "SV08.5 059" aqui e "PRE 059" lá.
      // `raridades` entra por embed graças à FK criada na migração 16: sem ela,
      // a lista mostraria "Rare Holo" em português no meio das outras telas.
      const { data, error } = await supabase
        .from('cards')
        .select(`${COLUNAS_CARTA}, sets(nome, sigla), raridades(rotulo)`)
        .in('id', chave)

      if (error) throw error

      type ComSet = Carta & {
        sets: { nome: string; sigla: string | null } | null
        raridades: { rotulo: string } | null
      }
      return new Map(
        (data as unknown as ComSet[]).map(({ sets, raridades, ...carta }) => [
          carta.id,
          {
            ...carta,
            raridade: raridades?.rotulo ?? carta.raridade,
            set_nome: sets?.nome ?? null,
            set_sigla: sets?.sigla ?? null,
          },
        ]),
      )
    },
  })
}

/**
 * Adiciona uma carta à lista aberta.
 *
 * Sem otimismo aqui de propósito: o id do anúncio nasce no servidor, e o upsert
 * da API é idempotente — recadastrar a mesma carta reativa o anúncio existente
 * em vez de criar outro. Esperar a resposta evita inventar uma linha fantasma.
 */
export function useAdicionarAnuncio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (item: AnuncioNovo) => criarAnuncio(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
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
