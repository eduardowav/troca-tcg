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
  /** Vêm do join com `sets`. Opcionais porque nem toda leitura de carta os traz. */
  set_nome?: string | null
  set_sigla?: string | null
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

/** Espelha `series` — o bloco. 'sv' = Escarlate e Violeta, 'me' = Megaevolução. */
export interface SerieCatalogo {
  code: string
  nome: string
  logo_url: string | null
}

export const COLUNAS_SERIE = 'code, nome, logo_url'

/** Filtro da busca de cartas. `null` nos dois = catálogo inteiro. */
export interface FiltrosBusca {
  serie: string | null
  set: string | null
}

export const SEM_FILTRO: FiltrosBusca = { serie: null, set: null }

export function temFiltro(f: FiltrosBusca): boolean {
  return f.serie !== null || f.set !== null
}

/**
 * Preço de referência da TCGplayer, espelhando `card_prices`.
 *
 * Em dólar porque a fonte é americana e não existe preço em real ali —
 * converter exigiria uma fonte de câmbio, que vence junto e daria falsa
 * precisão a um número que já é estimativa.
 */
export interface PrecoTCGplayer {
  card_id: string
  tipo_tcgplayer: string
  moeda: string
  baixo: number | null
  mercado: number | null
}

export const COLUNAS_PRECO = 'card_id, tipo_tcgplayer, moeda, baixo, mercado'

// A mesma carta tem preços diferentes por acabamento, e a fonte usa sete baldes.
// A ordem abaixo escolhe qual representa a carta, e o critério é **assumir a
// impressão mais comum**: entre a 1st edition de uma Base Set a US$ 101 e a
// unlimited a US$ 35, mostrar a primeira inflaria o valor de quase todo mundo,
// porque quase ninguém tem a 1st. Errar para baixo é o erro barato aqui — quem
// tem a versão cara sabe que tem, e diz.
const ORDEM_ACABAMENTO = [
  'normal',
  'unlimited',
  'holofoil',
  'unlimited-holofoil',
  'reverse-holofoil',
  '1st-edition',
  '1st-edition-holofoil',
]

export function precoPrincipal(
  precos: PrecoTCGplayer[],
): PrecoTCGplayer | undefined {
  for (const tipo of ORDEM_ACABAMENTO) {
    const achado = precos.find((p) => p.tipo_tcgplayer === tipo)
    if (achado) return achado
  }
  // Balde novo na fonte: escolhe o mais barato, que é o mesmo critério de
  // assumir a impressão comum — e é determinístico, ao contrário da ordem em
  // que o banco devolveu as linhas.
  return [...precos].sort(
    (a, b) => (a.mercado ?? a.baixo ?? 0) - (b.mercado ?? b.baixo ?? 0),
  )[0]
}

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
})

/** "US$ 5,27". Devolve null quando não há número — preço ausente não vira "—". */
export function formatarPreco(preco?: PrecoTCGplayer): string | null {
  const valor = preco?.mercado ?? preco?.baixo
  return valor == null ? null : MOEDA.format(valor)
}

/** As duas listas — nunca "coleção". */
export type ListingKind = 'OFERTA' | 'PROCURA'

/** Nome de exibição da carta: PT quando existe, senão EN. */
export function nomeCarta(c: Carta): string {
  return c.nome_pt ?? c.nome_en
}

/**
 * Código de set no vernáculo do colecionador: "PRE 059".
 *
 * A sigla é o que está impresso no canto da carta, e é por ela que o jogador
 * reconhece a expansão. O `set_code` da fonte ("sv08.5") só aparece quando a
 * sigla não existe — alguns sets de promo não têm.
 */
export function codigoSet(c: Carta): string {
  return `${(c.set_sigla ?? c.set_code).toUpperCase()} ${c.numero}`
}
