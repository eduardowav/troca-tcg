import { preferenciasAgora } from '@/stores/preferencias'

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
 * Em dólar porque a fonte é americana e não existe preço em real ali. **O que
 * vem do banco continua em dólar**; a conversão para real, quando a pessoa
 * escolhe, acontece só na hora de escrever na tela (`formatarMoeda`), com a
 * cotação da PTAX — ver `stores/preferencias.ts` e `db/schema/35_cotacao.sql`.
 *
 * Guardar em dólar não é detalhe de implementação: os pisos da regra de troca
 * desigual são em dólar, e compará-los contra reais faria o alerta mudar de
 * comportamento conforme o câmbio do dia.
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

const EM_DOLAR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
})

const EM_REAL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * O número que representa a carta, na base que a pessoa escolheu.
 *
 * **É aqui que "menor" e "médio" viram um número só**, e é de propósito que
 * exista um lugar só: enquanto cada tela escolhia com um `mercado ?? baixo`
 * próprio, trocar a base significaria caçar seis linhas iguais espalhadas.
 *
 * A reserva cruzada existe porque as duas colunas falham em casos diferentes:
 * medido no catálogo em 2026-08-21, `baixo` está em todas as 24.607 linhas e
 * `mercado` falta em 17. Quem pede "menor" e recebe o médio numa carta rara está
 * melhor servido do que quem recebe um traço.
 *
 * Continua em **dólar**: converter é trabalho de quem exibe, não de quem
 * escolhe. A regra de troca desigual depende disso — os pisos dela são em
 * dólar, e comparar em real faria o alerta mudar de comportamento conforme o
 * câmbio do dia.
 */
export function valorDoPreco(preco?: PrecoTCGplayer | null): number | null {
  if (!preco) return null
  const { base } = preferenciasAgora()
  const escolhido = base === 'menor' ? preco.baixo : preco.mercado
  const reserva = base === 'menor' ? preco.mercado : preco.baixo
  return escolhido ?? reserva ?? null
}

/**
 * "US$ 5,27" ou "R$ 27,21", conforme a escolha em Configurações.
 *
 * Recebe **sempre dólar** — é a moeda da fonte, e é a única em que os números do
 * app são comparáveis entre si. A conversão acontece no último instante, aqui.
 *
 * Sem cotação carregada, escreve em dólar em vez de esconder: número na moeda
 * da fonte é pior que na moeda de casa, e muito melhor que um traço.
 */
export function formatarMoeda(valorEmDolar: number): string {
  const { moeda, cotacao } = preferenciasAgora()
  if (moeda === 'BRL' && cotacao) return EM_REAL.format(valorEmDolar * cotacao.valor)
  return EM_DOLAR.format(valorEmDolar)
}

/** Devolve null quando não há número — preço ausente não vira "—". */
export function formatarPreco(preco?: PrecoTCGplayer): string | null {
  const valor = valorDoPreco(preco)
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
 *
 * ## Por que duas faixas, e não um par de números
 *
 * Até 2026-08-21 a regra era uma só: 3x **e** US$ 5. Ela tinha um buraco do
 * tamanho do produto — **US$ 300 por US$ 600 passava calado**, porque é "só" 2x.
 * Trezentos dólares de distância é a troca mais desigual que este app vai ver, e
 * era justamente a que ele não comentava. Baixar tudo para 2x consertaria essa
 * e criaria a praga oposta: US$ 5 por US$ 10 viraria alerta, e alerta que
 * aparece em briga pequena é alerta que se aprende a fechar sem ler.
 *
 * Daí as faixas: **quanto mais dinheiro em jogo, menos desproporção é preciso
 * para valer um aviso.** Uma troca de dez dólares de distância já merece
 * comentário com o dobro de valor; abaixo disso, só o triplo.
 *
 * O que cada faixa faz, com os casos que decidiram os números:
 *
 *     0,05 x 0,20     4,0x    0,15    cala   (centavos, e é o caso do dia a dia)
 *     0,50 x 2,00     4,0x    1,50    cala
 *     2,00 x 6,00     3,0x    4,00    cala   (3x, mas quatro dólares)
 *     3,00 x 12,00    4,0x    9,00    AVISA  (faixa de baixo)
 *     8,00 x 16,00    2,0x    8,00    cala   (2x sem dinheiro suficiente)
 *    15,00 x 30,00    2,0x   15,00    AVISA  (faixa de cima)
 *   300,00 x 600,00   2,0x  300,00    AVISA  (o buraco que existia)
 *
 * Mexer nestes quatro números muda o que o app diz a duas pessoas prestes a
 * atravessar a cidade. Mexer com a tabela acima na frente.
 */
const FAIXAS: ReadonlyArray<{ razao: number; diferenca: number }> = [
  // Dinheiro grande: o dobro já basta.
  { razao: 2, diferenca: 10 },
  // Dinheiro pequeno: precisa do triplo para não virar ruído.
  { razao: 3, diferenca: 5 },
]

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
  return desequilibrioDeValores(valorDoPreco(precoDou), valorDoPreco(precoRecebo))
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
  const alguma = FAIXAS.some(
    (faixa) => razao >= faixa.razao && diferenca >= faixa.diferenca,
  )
  if (!alguma) return null

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
