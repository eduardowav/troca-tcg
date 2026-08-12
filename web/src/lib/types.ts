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

/**
 * Raridade, já traduzida. Espelha `raridades` (db/schema/16_raridades.sql).
 *
 * A fonte devolve o nome no idioma da resposta — "Comum" nas cartas modernas e
 * "Common" nas antigas, que só existem no endpoint inglês. O mapa no banco junta
 * os dois num rótulo só; aqui já chega resolvido.
 */
export interface Raridade {
  rotulo: string
  ordem: number
}

export const COLUNAS_RARIDADE = 'fonte, rotulo, ordem'

/** Filtro da busca de cartas. `null` em todos = catálogo inteiro. */
export interface FiltrosBusca {
  serie: string | null
  set: string | null
  raridade: string | null
}

export const SEM_FILTRO: FiltrosBusca = {
  serie: null,
  set: null,
  raridade: null,
}

export function temFiltro(f: FiltrosBusca): boolean {
  return f.serie !== null || f.set !== null || f.raridade !== null
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

// A escolha de qual das linhas de preço representa a carta mudou de casa: agora
// depende do acabamento anunciado, e mora em lib/acabamentos.ts junto com a
// ponte entre as duas taxonomias.

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
})

/** "US$ 5,27". */
export function formatarMoeda(valor: number): string {
  return MOEDA.format(valor)
}

/** Devolve null quando não há número — preço ausente não vira "—". */
export function formatarPreco(preco?: PrecoTCGplayer): string | null {
  const valor = preco?.mercado ?? preco?.baixo
  return valor == null ? null : formatarMoeda(valor)
}

/**
 * Quão desigual é uma troca, pela referência de preço.
 *
 * Duas travas, e as duas importam. **Razão** sozinha grita em carta barata: uma
 * comum de US$ 0,13 contra outra de US$ 0,50 é quase 4x e não é problema de
 * ninguém. **Diferença absoluta** sozinha cala em carta cara: US$ 300 contra
 * US$ 290 são dez dólares de distância e troca perfeitamente normal. Só quando
 * as duas disparam é que há desequilíbrio de verdade.
 *
 * `null` quando falta preço de algum lado — não dá para afirmar desequilíbrio
 * sem os dois números, e chutar seria pior que calar.
 */
const RAZAO_MINIMA = 3
const DIFERENCA_MINIMA = 5

export interface Desequilibrio {
  /** Quantas vezes o lado caro cabe no barato. */
  razao: number
  diferenca: number
  valorDou: number
  valorRecebo: number
  /** true quando quem lê é o lado que entrega mais valor. */
  euEntregoMais: boolean
}

export function desequilibrio(
  precoDou?: PrecoTCGplayer,
  precoRecebo?: PrecoTCGplayer,
): Desequilibrio | null {
  return desequilibrioDeValores(
    precoDou?.mercado ?? precoDou?.baixo,
    precoRecebo?.mercado ?? precoRecebo?.baixo,
  )
}

/**
 * O mesmo cálculo a partir de dois números já somados.
 *
 * Existe para a proposta, onde cada lado pode ter mais de uma carta: ali o que
 * se compara é o total de um lote contra o do outro, e não duas linhas de
 * preço. A troca sugerida continua entrando pela função de cima, que é 1×1 por
 * desenho.
 */
export function desequilibrioDeValores(
  dou?: number | null,
  recebo?: number | null,
): Desequilibrio | null {
  if (dou == null || recebo == null || dou <= 0 || recebo <= 0) return null

  const maior = Math.max(dou, recebo)
  const menor = Math.min(dou, recebo)
  const razao = maior / menor
  const diferenca = maior - menor
  if (razao < RAZAO_MINIMA || diferenca < DIFERENCA_MINIMA) return null

  return {
    razao,
    diferenca,
    valorDou: dou,
    valorRecebo: recebo,
    euEntregoMais: dou > recebo,
  }
}

/** "104x" ou "3,5x" — inteiro quando é grande, porque a casa decimal não informa. */
export function formatarRazao(razao: number): string {
  return razao >= 10
    ? `${Math.round(razao)}x`
    : `${razao.toFixed(1).replace('.', ',')}x`
}

/** As duas listas — nunca "coleção". */
export type ListingKind = 'OFERTA' | 'PROCURA'

/** Nome de exibição da carta: PT quando existe, senão EN. */
export function nomeCarta(c: Carta): string {
  return c.nome_pt ?? c.nome_en
}

/**
 * O número como está impresso no rodapé da carta: "086/131".
 *
 * É assim que o colecionador identifica a carta — "regigigas (086/131)" — e é a
 * notação que a Liga Pokémon usa. O total vem de `sets`, não da carta, então
 * quem chama passa o set; sem ele, sobra o número sozinho.
 */
export function numeroImpresso(c: Carta, total?: number | null): string {
  return total ? `${c.numero}/${total}` : c.numero
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
