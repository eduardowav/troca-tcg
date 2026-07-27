/** Espelha a tabela `cards` do catálogo (ver db/schema/02_cards.sql). */
export interface Carta {
  id: string
  external_id: string
  set_code: string
  set_nome: string | null
  numero: string
  nome_pt: string | null
  nome_en: string
  raridade: string | null
  imagem_url: string | null
}

/** As duas listas — nunca "coleção". */
export type ListingKind = 'OFERTA' | 'PROCURA'

/** Nome de exibição da carta: PT quando existe, senão EN. */
export function nomeCarta(c: Carta): string {
  return c.nome_pt ?? c.nome_en
}

/** Código de set no vernáculo do colecionador: "PRE 059/131". */
export function codigoSet(c: Carta): string {
  return `${c.set_code.toUpperCase()} ${c.numero}`
}
