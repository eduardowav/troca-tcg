/** Espelha a tabela `cards` do catálogo (ver db/schema/02_cards.sql). */
export interface Carta {
  id: string
  external_id: string
  set_code: string
  numero: string
  nome_pt: string | null
  nome_en: string
  raridade: string | null
  imagem_url: string | null
}

/** Projeção usada em toda leitura de `cards` — mantém os selects em sintonia.
 *  Sem `*`: com grant por coluna no Supabase, o asterisco derruba a query. */
export const COLUNAS_CARTA =
  'id, external_id, set_code, numero, nome_pt, nome_en, raridade, imagem_url'

/** Espelha `sets` (db/schema/12_series_sets.sql). O nome da expansão mora aqui,
 *  não em cada carta. `sigla` é a abreviação impressa: 'OBF', 'PRE'. */
export interface SetCatalogo {
  code: string
  serie_code: string | null
  nome: string
  sigla: string | null
  total_oficial: number | null
  total_impresso: number | null
  logo_url: string | null
  simbolo_url: string | null
  lancado_em: string | null
}

export const COLUNAS_SET =
  'code, serie_code, nome, sigla, total_oficial, total_impresso, logo_url, simbolo_url, lancado_em'

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
