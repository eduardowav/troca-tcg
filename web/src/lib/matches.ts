import { api } from '@/lib/api'
import type { Condicao } from '@/lib/anuncios'

/**
 * Espelha ParticipanteResumo/ParticipanteCompleto da API.
 *
 * `contato_visivel` é opcional aqui porque no feed ele simplesmente não vem —
 * a API só o serializa quando o match inteiro está ACEITO. Ver
 * api/app/schemas/match.py.
 */
export interface ParticipanteMatch {
  user_id: string
  username: string
  nome_exibicao: string
  trocas_concluidas: number
  trocas_furadas: number
  aceitou: boolean | null
  confirmou_conclusao: boolean
  contato_visivel?: string | null
}

/**
 * Como a reputação de um estranho é dita em uma linha.
 *
 * Nunca em porcentagem: "100% de trocas ok" com uma troca só é a mesma etiqueta
 * de quem tem quarenta, e "0%" condena quem levou um furo na estreia. Contagem
 * carrega o próprio denominador — "1 troca ok" já se anuncia como amostra
 * pequena, sem precisar de aviso.
 */
export function reputacaoTexto(p: ParticipanteMatch): string | null {
  const { trocas_concluidas: ok, trocas_furadas: furos } = p
  // Contadores ausentes é cliente e API fora de passo — acontece de verdade num
  // PWA que se atualiza sozinho. Sem número, não se diz nada: "undefined de NaN"
  // ao lado do nome de um estranho é pior que a linha sem reputação alguma.
  if (typeof ok !== 'number' || typeof furos !== 'number') return null
  if (ok + furos === 0) return 'novo por aqui'
  if (furos === 0) return ok === 1 ? '1 troca ok' : `${ok} trocas ok`
  const total = ok + furos
  return `${ok} de ${total} ${total === 1 ? 'troca' : 'trocas'} ok`
}

/** Uma carta indo de alguém para alguém. */
export interface ItemMatch {
  card_id: string
  de_user_id: string
  para_user_id: string
  condicao: Condicao
  finish_id: number
}

export type MatchStatus =
  | 'SUGERIDO'
  | 'PENDENTE'
  | 'ACEITO'
  | 'RECUSADO'
  | 'CONCLUIDO'
  | 'FURADO'
  | 'EXPIRADO'

export interface Match {
  id: string
  tipo: 'DIRETO' | 'MULTIPLO' | 'TRIANGULAR'
  status: MatchStatus
  score: number
  expira_em: string
  participantes: ParticipanteMatch[]
  itens: ItemMatch[]
}

/** Status que o histórico do perfil lista. Ver services/matching._HISTORICO. */
export type Desfecho = 'CONCLUIDO' | 'FURADO' | 'EXPIRADO'

/**
 * Uma troca encerrada. `desfecho_em` é quando ela virou o que é — vem do último
 * evento do match, em ISO 8601 (a API serializa `datetime`, não texto do
 * Postgres, justamente para o `new Date` do Safari aceitar).
 */
export interface MatchEncerrado extends Match {
  status: Desfecho
  desfecho_em: string
}

export const listarMatches = () => api.get<Match[]>('/me/matches')

export const listarHistorico = () =>
  api.get<MatchEncerrado[]>('/me/matches/historico')

/**
 * A data do desfecho como a tela mostra.
 *
 * O ano só aparece quando não é o corrente: numa lista em que quase tudo é dos
 * últimos meses, "2026" repetido em cada linha é ruído que empurra o que importa.
 * Data inválida devolve nulo em vez de "Invalid Date" — o histórico continua
 * legível sem ela.
 */
export function dataDoDesfecho(iso: string): string | null {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return null
  const esteAno = quando.getFullYear() === new Date().getFullYear()
  return quando.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    ...(esteAno ? {} : { year: 'numeric' }),
  })
}

export const obterMatch = (id: string) => api.get<Match>(`/me/matches/${id}`)

export const responderMatch = (id: string, aceitou: boolean) =>
  api.post<Match>(`/me/matches/${id}/responder`, { aceitou })

/** Confirma que a troca aconteceu. Só fecha quando os dois confirmam. */
export const concluirMatch = (id: string) =>
  api.post<Match>(`/me/matches/${id}/concluir`)

/** Avisa que a outra pessoa não apareceu. */
export const furouMatch = (id: string) => api.post<Match>(`/me/matches/${id}/furou`)

export function euConfirmei(match: Match, meuId: string | undefined): boolean {
  return (
    match.participantes.find((p) => p.user_id === meuId)?.confirmou_conclusao ===
    true
  )
}

/** Quem é o outro lado da troca. Em DIRETO só há um. */
export function parceiro(
  match: Match,
  meuId: string | undefined,
): ParticipanteMatch | undefined {
  return match.participantes.find((p) => p.user_id !== meuId)
}

export function euAceitei(match: Match, meuId: string | undefined): boolean {
  return match.participantes.find((p) => p.user_id === meuId)?.aceitou === true
}

/** Dias inteiros até expirar — o match some do feed em 7 dias. */
export function diasParaExpirar(match: Match): number {
  const ms = new Date(match.expira_em).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
