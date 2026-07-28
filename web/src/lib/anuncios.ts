import { api } from '@/lib/api'
import type { ListingKind } from '@/lib/types'

export type Condicao = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'

/** Espelha AnuncioItem da API (api/app/schemas/listing.py). */
export interface AnuncioNovo {
  card_id: string
  tipo: ListingKind
  quantidade?: number
  condicao?: Condicao
  finish_id?: number
  idioma?: string
  prioridade?: number
  aceita_qualquer_finish?: boolean
}

/** Espelha AnuncioOut da API. */
export interface Anuncio {
  id: string
  card_id: string
  tipo: ListingKind
  quantidade: number
  condicao: Condicao
  finish_id: number
  idioma: string
  prioridade: number
  aceita_qualquer_finish: boolean
  ativo: boolean
}

export const listarAnuncios = (tipo?: ListingKind) =>
  api.get<Anuncio[]>(`/me/listings${tipo ? `?tipo=${tipo}` : ''}`)

export const criarAnuncio = (item: AnuncioNovo) =>
  api.post<Anuncio>('/me/listings', item)

/** Lote do onboarding. A API também marca `onboarding_ok` no perfil. */
export const criarAnunciosEmLote = (itens: AnuncioNovo[]) =>
  api.post<{ cadastradas: number }>('/me/listings/bulk', { itens })

export const removerAnuncio = (id: string) => api.del(`/me/listings/${id}`)
