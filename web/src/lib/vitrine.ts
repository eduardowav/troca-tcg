import type { Condicao } from '@/lib/anuncios'
import { api } from '@/lib/api'
import { formatarMoeda } from '@/lib/types'

/**
 * A vitrine: o acervo da base, alcançado por carta.
 *
 * Espelha `api/app/schemas/vitrine.py`. Como no resto do app, cartas saem por
 * `card_id` e o catálogo (nome, arte, raridade) é lido direto do Supabase — ver
 * `useCartasPorId`. Contato não existe em nenhum destes tipos: a vitrine é lida
 * justamente por quem ainda não passou por aceite nenhum.
 */

/** Uma carta que existe na base, com quanta gente a oferece. */
export interface CartaNaVitrine {
  card_id: string
  donos: number
  /** O anúncio mais recente desta carta — é o que ordena o feed por padrão. */
  mais_recente: string
  /**
   * A oferta mais barata, em dólar, no acabamento que cada dono anunciou — e
   * não o preço da impressão comum: uma reverse não vale o que a normal vale.
   *
   * Nulo quando a TCGplayer não cota a carta, o que acontece com 1.681 delas.
   */
  preco?: number | null
}

/**
 * Quem tem uma carta, e em que estado.
 *
 * `listing_id` é o que faz a tela virar proposta: os itens de uma proposta
 * entram por anúncio, nunca por carta solta.
 */
export interface OfertaNaVitrine {
  listing_id: string
  card_id: string
  username: string
  nome_exibicao: string
  /** Selo de reconhecimento de quem anuncia, ou nulo. Ver `Selo.tsx`. */
  selo?: string | null
  condicao: Condicao
  finish_id: number
  quantidade: number
  idioma: string
  trocas_concluidas: number
  trocas_furadas: number
  trocas_desistidas?: number
}

/** Uma carta do OFERTA de alguém, com o vínculo vivo do anúncio junto. */
export interface CartaDoAcervo {
  listing_id: string
  card_id: string
  condicao: Condicao
  finish_id: number
  quantidade: number
  prioridade: number
  /** Está no meu Procuro — o sinal que transforma a lista em sugestão. */
  reciproco: boolean
}

/**
 * As ordens da vitrine, na ordem em que aparecem no seletor.
 *
 * Espelha `ORDENS` de services/vitrine.py — o servidor recusa qualquer chave
 * fora da lista dele, então acrescentar uma aqui sem acrescentar lá devolve 422.
 *
 * "Novidade" é o padrão porque é a pergunta que a vitrine responde: o que
 * apareceu de novo. As outras são de quem já sabe o que procura.
 */
// Rótulos curtos porque o seletor divide a fileira em três com a Coleção e o
// Eu procuro: "Menor preço" não cabe na coluna e virava "MENOR PR…", que não diz
// nada. "+ barato" é como se fala, e cabe.
export const ORDENS = [
  { valor: 'novidade', rotulo: 'Novidades' },
  { valor: 'nome', rotulo: 'A–Z' },
  { valor: 'preco_menor', rotulo: '+ barato' },
  { valor: 'preco_maior', rotulo: '+ caro' },
  { valor: 'donos', rotulo: 'Mais gente' },
] as const

export type OrdemVitrine = (typeof ORDENS)[number]['valor']

export const ORDEM_PADRAO: OrdemVitrine = 'novidade'

export interface FiltrosVitrine {
  q?: string
  set?: string
  serie?: string
  raridade?: string
  ordem?: OrdemVitrine
  /** Só as cartas que estão no meu Procuro — a vitrine virando matching. */
  so_procuro?: boolean
  page?: number
}

/**
 * Só entra na URL o filtro que existe.
 *
 * Mandar `?q=&set=` faria a API receber string vazia onde ela espera ausência —
 * e, mais prático que isso, a chave do React Query mudaria a cada tecla apagada.
 */
function consulta(filtros: FiltrosVitrine): string {
  const params = new URLSearchParams()
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.set) params.set('set', filtros.set)
  if (filtros.serie) params.set('serie', filtros.serie)
  if (filtros.raridade) params.set('raridade', filtros.raridade)
  if (filtros.ordem && filtros.ordem !== ORDEM_PADRAO) {
    params.set('ordem', filtros.ordem)
  }
  if (filtros.so_procuro) params.set('so_procuro', 'true')
  if (filtros.page && filtros.page > 1) params.set('page', String(filtros.page))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const listarVitrine = (filtros: FiltrosVitrine = {}) =>
  api.get<CartaNaVitrine[]>(`/vitrine${consulta(filtros)}`)

export const quemTemACarta = (cardId: string) =>
  api.get<OfertaNaVitrine[]>(`/vitrine/carta/${cardId}`)

/**
 * Uma das duas listas de alguém.
 *
 * `OFERTA` por padrão, que é o caminho da vitrine — de lá se chega para montar
 * proposta. `PROCURA` serve ao perfil público, que mostra a pessoa inteira: sem
 * ele, quem olha um perfil não consegue responder "e o que eu tenho que serve
 * para essa pessoa?", que é a metade da troca que depende de quem está olhando.
 */
export const acervoDe = (username: string, tipo: 'OFERTA' | 'PROCURA' = 'OFERTA') =>
  api.get<CartaDoAcervo[]>(
    `/vitrine/acervo/${username}?tipo=${tipo}`,
  )

/** Cartas por página — o mesmo `TAMANHO_PAGINA` de services/vitrine.py. */
export const TAMANHO_PAGINA = 24

/**
 * Quanta gente oferece a carta, em uma linha.
 *
 * O número sozinho ("3") não diz nada numa grade; a frase inteira é o que
 * transforma a célula em convite.
 */
export function donosTexto(carta: CartaNaVitrine): string {
  return carta.donos === 1 ? '1 pessoa tem' : `${carta.donos} pessoas têm`
}

/**
 * O preço na célula da vitrine.
 *
 * "A partir de" quando há mais de uma oferta: o número é o da mais barata, e
 * dizê-lo sem o "a partir de" faria a carta parecer ter preço único quando as
 * outras ofertas podem ser bem mais caras — uma reverse e uma normal da mesma
 * carta convivem na mesma linha do feed.
 *
 * Nulo quando não há cotação; quem chama decide se cala ou escreve outra coisa.
 */
export function precoTexto(carta: CartaNaVitrine): string | null {
  if (carta.preco == null) return null
  const valor = formatarMoeda(carta.preco)
  return carta.donos > 1 ? `a partir de ${valor}` : valor
}
