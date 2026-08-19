import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import {
  acervoDe,
  type FiltrosVitrine,
  listarVitrine,
  quemTemACarta,
  TAMANHO_PAGINA,
} from '@/lib/vitrine'

const CHAVE = ['vitrine'] as const

/**
 * O feed da vitrine, página a página.
 *
 * Infinita e não paginada com números: a vitrine é para varrer, e quem varre não
 * quer voltar para a página 2 — quer continuar de onde parou. Trocar o termo de
 * busca muda a chave e a contagem recomeça, que é o comportamento certo.
 *
 * "Tem mais" é inferido do tamanho da última página: a API devolve uma lista
 * simples, sem total. Uma página cheia pode ser a última — nesse caso o botão
 * aparece uma vez a mais e a página seguinte volta vazia, que custa uma consulta
 * barata e evita fazer o feed contar a base inteira a cada abertura.
 *
 * `staleTime` de um minuto: a vitrine é tela de descoberta e ninguém precisa
 * dela ao segundo, mas ela também não pode envelhecer — a carta que apareceu
 * agora é justamente o que ela promete mostrar.
 *
 * `ativo` existe para quem chama de fora da vitrine: a tela vazia das trocas
 * mostra uma amostra do feed, e qual amostra depende de saber antes se a pessoa
 * tem Procuro. Perguntar as duas coisas ao mesmo tempo gastaria uma consulta
 * para jogar fora. Na própria vitrine o padrão vale e nada muda.
 */
export function useVitrine(filtros: FiltrosVitrine, ativo = true) {
  return useInfiniteQuery({
    queryKey: [...CHAVE, 'feed', filtros],
    enabled: ativo,
    staleTime: 60 * 1000,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listarVitrine({ ...filtros, page: pageParam }),
    getNextPageParam: (ultima, todas) =>
      ultima.length === TAMANHO_PAGINA ? todas.length + 1 : undefined,
  })
}

/** Quem tem uma carta — o passo entre o feed e a proposta. */
export function useQuemTem(cardId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, 'carta', cardId],
    enabled: Boolean(cardId),
    staleTime: 30 * 1000,
    queryFn: () => quemTemACarta(cardId as string),
  })
}

/**
 * O acervo de alguém.
 *
 * Chave debaixo de `vitrine`, e prazo curto: o `reciproco` de cada carta é
 * calculado contra o **meu** Procuro, então mexer nas minhas listas muda esta
 * resposta sem nada ter mudado do lado de lá.
 */
export function useAcervo(
  username: string | undefined,
  tipo: 'OFERTA' | 'PROCURA' = 'OFERTA',
) {
  return useQuery({
    // O `tipo` entra na chave: sem ele, o Ofereço e o Procuro da mesma pessoa
    // compartilhariam cache e a segunda lista mostraria a primeira.
    queryKey: [...CHAVE, 'acervo', username, tipo],
    enabled: Boolean(username),
    staleTime: 30 * 1000,
    queryFn: () => acervoDe(username as string, tipo),
  })
}
