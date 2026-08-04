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

/** Espelha AnuncioAtualizar da API: só o que a edição inline pode mexer. */
export interface AnuncioEdicao {
  quantidade?: number
  condicao?: Condicao
  /** Corrigível como a condição; carta e tipo não são. Ver o schema da API. */
  finish_id?: number
  prioridade?: number
  aceita_qualquer_finish?: boolean
}

/** Rótulos das condições, do jeito que o jogador fala. */
export const CONDICOES: { valor: Condicao; rotulo: string; dica: string }[] = [
  { valor: 'NM', rotulo: 'NM', dica: 'Quase perfeita' },
  { valor: 'LP', rotulo: 'LP', dica: 'Pouco usada' },
  { valor: 'MP', rotulo: 'MP', dica: 'Usada' },
  { valor: 'HP', rotulo: 'HP', dica: 'Muito usada' },
  { valor: 'DMG', rotulo: 'DMG', dica: 'Danificada' },
]

/** Prioridade 1–3 (schema: default 2). Quanto maior, mais o dono quer resolver. */
export const PRIORIDADES: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: 'Baixa' },
  { valor: 2, rotulo: 'Normal' },
  { valor: 3, rotulo: 'Alta' },
]

export const listarAnuncios = (tipo?: ListingKind) =>
  api.get<Anuncio[]>(`/me/listings${tipo ? `?tipo=${tipo}` : ''}`)

export const atualizarAnuncio = (id: string, dados: AnuncioEdicao) =>
  api.patch<Anuncio>(`/me/listings/${id}`, dados)

export const criarAnuncio = (item: AnuncioNovo) =>
  api.post<Anuncio>('/me/listings', item)

/** Lote do onboarding. A API também marca `onboarding_ok` no perfil. */
export const criarAnunciosEmLote = (itens: AnuncioNovo[]) =>
  api.post<{ cadastradas: number }>('/me/listings/bulk', { itens })

export const removerAnuncio = (id: string) => api.del(`/me/listings/${id}`)

/** Quem procura uma carta minha. A API não manda contato aqui — só depois do aceite. */
export interface QuemProcura {
  user_id: string
  username: string
  nome_exibicao: string
}

/** Demanda por uma carta que eu ofereço. `pessoas` vem no máximo com 6 nomes. */
export interface CartaProcurada {
  card_id: string
  procurando: number
  pessoas: QuemProcura[]
}

export const listarProcuradas = () =>
  api.get<CartaProcurada[]>('/me/listings/procuradas')
