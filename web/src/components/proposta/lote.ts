import type { CartaDoLote } from '@/components/brutal/Pecas'
import type { Acabamento } from '@/lib/acabamentos'
import type { ItemProposta } from '@/lib/propostas'
import type { Carta } from '@/lib/types'

/**
 * Os itens de um lado da rodada no formato que `ParDeLotes` entende.
 *
 * Mora aqui, e não em `lib/propostas`, porque o formato é da peça visual: a lib
 * espelha a API e não deve conhecer componente nenhum.
 *
 * A carta que saiu do ar continua na lista, marcada — sumir com ela deixaria a
 * proposta com um buraco sem explicação, e é justamente essa carta que explica
 * por que a proposta não fecha mais.
 */
export function paraLote(
  itens: ItemProposta[] | undefined,
  cartas: Map<string, Carta> | undefined,
  acabamentoPorId?: (id: number | undefined) => Acabamento | undefined,
): CartaDoLote[] {
  return (itens ?? []).map((item, i) => ({
    // O índice entra na chave porque a mesma carta pode aparecer duas vezes num
    // lote (condições diferentes), e `listing_id` é nulo depois que o anúncio sai.
    chave: `${item.listing_id ?? item.card_id}-${i}`,
    carta: cartas?.get(item.card_id),
    condicao: item.condicao,
    acabamento: acabamentoPorId?.(item.finish_id),
    disponivel: item.disponivel,
  }))
}
