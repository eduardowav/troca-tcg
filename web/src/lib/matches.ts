import { api } from '@/lib/api'
import type { Condicao } from '@/lib/anuncios'
import type { ListingKind } from '@/lib/types'

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
  /** Desistências declaradas. Não são furo, mas são ditas. */
  trocas_desistidas?: number
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

  const base =
    ok + furos === 0
      ? 'novo por aqui'
      : furos === 0
        ? ok === 1
          ? '1 troca ok'
          : `${ok} trocas ok`
        : `${ok} de ${ok + furos} ${ok + furos === 1 ? 'troca' : 'trocas'} ok`

  // Desistência entra à parte, nunca somada às furadas: quem avisou que não ia
  // dar fez o oposto de furar. Some quando é zero, que é o caso de quase todo
  // mundo — contador em zero ao lado de um nome só ocupa espaço e sugere que
  // alguém devia estar preocupado com ele.
  return desistencias(p) ? `${base} · ${desistenciaTexto(p)}` : base
}

function desistencias(p: ParticipanteMatch): number {
  return typeof p.trocas_desistidas === 'number' ? p.trocas_desistidas : 0
}

function desistenciaTexto(p: ParticipanteMatch): string {
  const n = desistencias(p)
  return n === 1 ? '1 desistência' : `${n} desistências`
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
  /** Alguém desistiu e avisou. Não é furo — ver db/schema/20. */
  | 'CANCELADO'

export interface Match {
  id: string
  tipo: 'DIRETO' | 'MULTIPLO' | 'TRIANGULAR'
  status: MatchStatus
  score: number
  expira_em: string
  /** Quantas vezes o prazo já foi esticado. O teto é 2. */
  prorrogacoes?: number
  /** Quem desistiu, quando a troca está cancelada. */
  desistiu_por?: string | null
  participantes: ParticipanteMatch[]
  itens: ItemMatch[]
}

/** Status que o histórico do perfil lista. Ver services/matching._HISTORICO. */
export type Desfecho = 'CONCLUIDO' | 'FURADO' | 'EXPIRADO' | 'CANCELADO'

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

/**
 * Uma carta que a outra pessoa anuncia, fora a que já está nesta troca.
 *
 * `tipo` é do ponto de vista **dela**: OFERTA é o que ela tem, PROCURA é o que
 * ela quer. Quem lê a tela inverte isso — o que ela tem é o que eu posso
 * receber. Ver `MaisCartas`, onde a inversão vira cor.
 */
export interface CartaDoParceiro {
  card_id: string
  tipo: ListingKind
  quantidade: number
  condicao: Condicao
  finish_id: number
  prioridade: number
  /** Fecha com as minhas listas: ela oferece o que procuro, ou procura o que ofereço. */
  reciproco: boolean
}

export const listarMaisCartas = (id: string) =>
  api.get<CartaDoParceiro[]>(`/me/matches/${id}/mais-cartas`)

/** Desiste da troca avisando. Encerra para os dois, sem acusar ninguém. */
export const desistirMatch = (id: string) =>
  api.post<Match>(`/me/matches/${id}/desistir`)

/** Mais uma semana de prazo. Qualquer um dos dois pode, até duas vezes. */
export const estenderMatch = (id: string) =>
  api.post<Match>(`/me/matches/${id}/estender`)

/** O teto de prorrogações, espelhando services/matching._LIMITE_PRORROGACOES. */
export const LIMITE_PRORROGACOES = 2

export function podeEstender(match: Match): boolean {
  return (
    (match.status === 'PENDENTE' || match.status === 'ACEITO') &&
    (match.prorrogacoes ?? 0) < LIMITE_PRORROGACOES
  )
}

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

/**
 * Dias inteiros até expirar — o match some do feed em 7 dias.
 *
 * Nulo quando a data não dá para ler, como `dataDoDesfecho`. A API manda ISO
 * 8601 justamente para o `new Date` do Safari aceitar, mas quem chama isto
 * escreve uma frase na tela: sem a guarda, uma data quebrada vira "Expira em
 * NaN dias" para o usuário, que é pior do que não falar de prazo nenhum.
 */
export function diasParaExpirar(match: Match): number | null {
  const ms = new Date(match.expira_em).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

/** O prazo como a tela escreve. Nulo quando não há data legível para mostrar. */
export function prazoTexto(match: Match): string | null {
  const dias = diasParaExpirar(match)
  if (dias === null) return null
  if (dias === 0) return 'Expira hoje'
  if (dias === 1) return 'Expira amanhã'
  return `Expira em ${dias} dias`
}

/**
 * Quando o prazo vira notícia, e não mais informação de rodapé.
 *
 * Dois dias é o corte porque a troca acontece em mão, e marcar um encontro
 * presencial leva pelo menos uma conversa e um dia livre em comum. Avisar no
 * último dia é avisar quando já não dá — e é a troca combinada que expira calada
 * que alimenta o EXPIRADO, denominador da métrica-mãe.
 */
export const DIAS_URGENTE = 2

export function prazoUrgente(match: Match): boolean {
  if (match.status !== 'PENDENTE' && match.status !== 'ACEITO') return false
  const dias = diasParaExpirar(match)
  return dias !== null && dias <= DIAS_URGENTE
}
