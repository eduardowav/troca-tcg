import { useQuery } from '@tanstack/react-query'

import {
  type Acabamento,
  BASE_QUANDO_DESCONHECIDO,
  COLUNAS_ACABAMENTO,
} from '@/lib/acabamentos'
import { supabase } from '@/lib/supabase'

/**
 * Os catorze acabamentos, lidos uma vez por sessão.
 *
 * `staleTime: Infinity` porque isto é tabela de referência: acabamento novo
 * entra quando a Pokémon inventa um padrão, o que acontece uma ou duas vezes por
 * ano e chega junto com um deploy. Refazer a consulta a cada tela seria gastar
 * rede para reconfirmar catorze linhas que não mudaram.
 */
export function useAcabamentos() {
  return useQuery({
    queryKey: ['acabamentos'],
    staleTime: Infinity,
    queryFn: async (): Promise<Acabamento[]> => {
      const { data, error } = await supabase
        .from('finishes')
        .select(COLUNAS_ACABAMENTO)
        .eq('ativo', true)
        .order('ordem')

      if (error) throw error
      return (data ?? []) as unknown as Acabamento[]
    },
  })
}

/**
 * Acabamento por id, para quem tem o `finish_id` de um anúncio na mão.
 *
 * Procura na tabela inteira, e **não** na lista da carta — a diferença mordeu na
 * primeira vez que rodei isto. Uma Ilustração Rara Especial só existe em holo,
 * então `card_finishes` não tem Normal para ela; mas os anúncios antigos, feitos
 * antes de existir escolha, são todos `finish_id = 1`. Procurando na lista da
 * carta, o nome vinha vazio e o detalhe da troca simplesmente não dizia o
 * acabamento. Qual acabamento é ≠ quais a carta pode ter.
 */
export function useAcabamentoPorId() {
  const { data } = useAcabamentos()
  return (id: number | undefined) =>
    id === undefined ? undefined : data?.find((a) => a.id === id)
}

/**
 * As opções do seletor: o que a carta teve, mais o que o anúncio já diz.
 *
 * A união importa pelo mesmo caso acima. Sem ela, abrir o editor de um anúncio
 * antigo mostraria um seletor sem nada marcado — a pessoa veria as opções da
 * carta e nenhuma pista de qual é a dela, e o primeiro toque trocaria um valor
 * que ela não sabia qual era.
 */
export function opcoesDeAcabamento(
  daCarta: Acabamento[] | undefined,
  atual: Acabamento | undefined,
): Acabamento[] {
  const lista = daCarta ?? []
  if (!atual || lista.some((a) => a.id === atual.id)) return lista
  return [...lista, atual].sort((a, b) => a.ordem - b.ordem)
}

/**
 * Quais acabamentos cada carta teve de verdade.
 *
 * É o que impede a tela de oferecer um Master Ball de uma carta que nunca foi
 * impressa assim — e, do outro lado, o que faz o seletor aparecer com as opções
 * certas em vez de todas as catorze.
 *
 * Carta sem nenhuma linha cai nas três impressões-base. Ver
 * `BASE_QUANDO_DESCONHECIDO`: são 1.681 cartas sobre as quais o banco não tem
 * opinião, e travar em Normal ali seria inventar um fato.
 */
export function useAcabamentosDaCarta(ids: string[]) {
  const chave = [...new Set(ids)].sort()
  const { data: todos } = useAcabamentos()

  return useQuery({
    queryKey: ['acabamentos', 'porCarta', chave],
    enabled: chave.length > 0 && !!todos,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Map<string, Acabamento[]>> => {
      const { data, error } = await supabase
        .from('card_finishes')
        .select('card_id, finish_id')
        .in('card_id', chave)

      if (error) throw error

      const porId = new Map((todos ?? []).map((a) => [a.id, a]))
      const porCarta = new Map<string, Acabamento[]>()
      for (const linha of (data ?? []) as {
        card_id: string
        finish_id: number
      }[]) {
        const acabamento = porId.get(linha.finish_id)
        if (!acabamento) continue
        const lista = porCarta.get(linha.card_id)
        if (lista) lista.push(acabamento)
        else porCarta.set(linha.card_id, [acabamento])
      }

      const base = (todos ?? []).filter((a) =>
        BASE_QUANDO_DESCONHECIDO.includes(a.id),
      )
      for (const card_id of chave) {
        const lista = porCarta.get(card_id)
        if (lista) lista.sort((a, b) => a.ordem - b.ordem)
        else porCarta.set(card_id, base)
      }
      return porCarta
    },
  })
}
