import type { Condicao } from '@/lib/anuncios'
import { api } from '@/lib/api'

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
  /** O anúncio mais recente desta carta — é o que ordena o feed. */
  mais_recente: string
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

export interface FiltrosVitrine {
  q?: string
  set?: string
  raridade?: string
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
  if (filtros.raridade) params.set('raridade', filtros.raridade)
  if (filtros.page && filtros.page > 1) params.set('page', String(filtros.page))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const listarVitrine = (filtros: FiltrosVitrine = {}) =>
  api.get<CartaNaVitrine[]>(`/vitrine${consulta(filtros)}`)

export const quemTemACarta = (cardId: string) =>
  api.get<OfertaNaVitrine[]>(`/vitrine/carta/${cardId}`)

export const acervoDe = (username: string) =>
  api.get<CartaDoAcervo[]>(`/vitrine/acervo/${username}`)

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
