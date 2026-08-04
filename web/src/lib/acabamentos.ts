import type { PrecoTCGplayer } from '@/lib/types'

/**
 * Acabamento — nunca "variante".
 *
 * A palavra é fixa desde o começo do projeto: `variant` é campo da TCGdex com
 * outro significado, mais grosseiro, e as duas coisas juntas viram bug de
 * interpretação no sync. Espelha `finishes` (db/schema/03_finishes.sql, ampliada
 * pela 19).
 */
export interface Acabamento {
  id: number
  codigo: string
  /** O que vai no botão: "Reverse", "Master Ball". */
  nome_curto: string
  /** O nome inteiro, que vira dica: "Reverse holo", "Master Ball reverse". */
  nome_pt: string
  familia: 'BASE' | 'REVERSE' | 'ESPECIAL'
  ordem: number
  /** Baldes de `card_prices` que representam este acabamento, em ordem. */
  tipos_tcgplayer: string[]
}

export const COLUNAS_ACABAMENTO =
  'id, codigo, nome_curto, nome_pt, familia, ordem, tipos_tcgplayer'

/** O acabamento que o resto do app assume quando ninguém escolheu. */
export const NORMAL = 1

/**
 * Os acabamentos que uma carta sem catálogo pode ter.
 *
 * 1.681 das 15.997 cartas não têm nenhum acabamento catalogado — promos, cartas
 * só em PT, sets antigos que a TCGplayer não precifica. Some daí a fonte de
 * evidência, não a carta: ela continua existindo e alguém quer trocá-la. Nesses
 * casos a tela oferece as três impressões que qualquer carta pode ter, em vez de
 * travar em Normal. É a mesma escolha que a API faz ao validar (services/
 * listings._validar_acabamentos): ausência de dado não é "não existe".
 */
export const BASE_QUANDO_DESCONHECIDO = [1, 2, 3]

/**
 * O preço da linha certa — o ponto da história toda.
 *
 * A mesma carta sai por US$ 0,13 em normal e US$ 0,22 em reverse, e até aqui o
 * app mostrava sempre a primeira, escolhida por uma ordem fixa que ignorava o
 * acabamento anunciado. Numa tela cuja função é deixar a assimetria visível
 * antes do encontro, mostrar o preço da impressão errada é justamente o erro
 * que faz a troca furar.
 *
 * `exato: false` quando a fonte não separa preço para aquele acabamento. Vale
 * para a família ESPECIAL inteira: a TCGplayer não abre balde para padrão de
 * Poké Ball, então o número é o da impressão de que ela deriva — e uma Master
 * Ball vale bem mais que a reverse comum. O valor ainda ajuda a comparar duas
 * cartas; o que não pode é passar por preciso.
 */
export interface PrecoEscolhido {
  preco: PrecoTCGplayer
  exato: boolean
}

export function precoDoAcabamento(
  precos: PrecoTCGplayer[] | undefined,
  acabamento: Acabamento | undefined,
): PrecoEscolhido | undefined {
  if (!precos?.length) return undefined

  if (acabamento) {
    for (const tipo of acabamento.tipos_tcgplayer) {
      const achado = precos.find((p) => p.tipo_tcgplayer === tipo)
      if (achado) {
        return { preco: achado, exato: acabamento.familia !== 'ESPECIAL' }
      }
    }
  }

  // Sem acabamento (as telas de catálogo, onde ninguém escolheu ainda) ou com um
  // cujo balde a carta não tem: cai na impressão comum e assume a imprecisão.
  const comum = precoComum(precos)
  return comum && { preco: comum, exato: !acabamento }
}

/**
 * A impressão que representa a carta quando não há acabamento no contexto.
 *
 * O critério é **assumir a impressão mais comum**: entre a 1st edition de uma
 * Base Set a US$ 101 e a unlimited a US$ 35, mostrar a primeira inflaria o valor
 * de quase todo mundo, porque quase ninguém tem a 1st. Errar para baixo é o erro
 * barato — quem tem a versão cara sabe que tem, e diz.
 */
const ORDEM_COMUM = [
  'normal',
  'unlimited',
  'holofoil',
  'unlimited-holofoil',
  'reverse-holofoil',
  '1st-edition',
  '1st-edition-holofoil',
]

export function precoComum(
  precos: PrecoTCGplayer[],
): PrecoTCGplayer | undefined {
  for (const tipo of ORDEM_COMUM) {
    const achado = precos.find((p) => p.tipo_tcgplayer === tipo)
    if (achado) return achado
  }
  // Balde novo na fonte: escolhe o mais barato, que é o mesmo critério de
  // assumir a impressão comum — e é determinístico, ao contrário da ordem em que
  // o banco devolveu as linhas.
  return [...precos].sort(
    (a, b) => (a.mercado ?? a.baixo ?? 0) - (b.mercado ?? b.baixo ?? 0),
  )[0]
}
