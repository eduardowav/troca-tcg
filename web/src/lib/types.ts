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

/** Projeção usada em toda leitura de `cards` — mantém os selects em sintonia. */
export const COLUNAS_CARTA =
  'id, external_id, set_code, set_nome, numero, nome_pt, nome_en, raridade, imagem_url'

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
