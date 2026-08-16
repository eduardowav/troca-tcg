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
 * A nota de 0 a 5, do jeito que o Figma desenha (`★ 4.9`).
 *
 * Sai da mesma conta que a função `reputacao()` do banco — concluídas sobre o
 * total de trocas que tiveram desfecho —, só que numa escala de cinco em vez de
 * cem. Desistência fica fora do denominador de propósito: quem avisou que não ia
 * dar fez o oposto de furar, e somá-la puniria justamente o comportamento que a
 * gente quer.
 *
 * `null` quando ainda não há desfecho nenhum. Nota zero e "sem trocas" são
 * coisas opostas, e uma escala que não distingue as duas condena quem chegou
 * agora.
 */
export function notaDeReputacao(p: ParticipanteMatch): number | null {
  const { trocas_concluidas: ok, trocas_furadas: furos } = p
  if (typeof ok !== 'number' || typeof furos !== 'number') return null
  const total = ok + furos
  if (total === 0) return null
  return Math.round((ok / total) * 5 * 10) / 10
}

/** Quantas trocas já tiveram desfecho — o denominador da nota. */
export function trocasComDesfecho(p: ParticipanteMatch): number {
  const { trocas_concluidas: ok, trocas_furadas: furos } = p
  if (typeof ok !== 'number' || typeof furos !== 'number') return 0
  return ok + furos
}

/**
 * Como a reputação de um estranho é dita em uma linha: `4,6 (28 trocas)`.
 *
 * A contagem entre parênteses não é enfeite, é o que impede a nota de mentir.
 * A versão anterior desta linha dizia "25 de 28 trocas ok" justamente porque a
 * contagem carregava o próprio denominador — uma nota resumida perde isso, e
 * quem fez uma troca certa viraria 5,0, igual a quem fez duzentas. Mantendo a
 * contagem ao lado, a amostra continua se anunciando.
 *
 * Quem ainda não tem desfecho não recebe nota: "novo por aqui" é informação
 * melhor do que um número que não existe.
 */
export function reputacaoTexto(p: ParticipanteMatch): string | null {
  // Contadores ausentes é cliente e API fora de passo — acontece de verdade num
  // PWA que se atualiza sozinho. Sem número, não se diz nada: "undefined de NaN"
  // ao lado do nome de um estranho é pior que a linha sem reputação alguma.
  if (
    typeof p.trocas_concluidas !== 'number' ||
    typeof p.trocas_furadas !== 'number'
  ) {
    return null
  }

  const nota = notaDeReputacao(p)
  const total = trocasComDesfecho(p)

  const base =
    nota == null
      ? 'novo por aqui'
      : // Vírgula, não ponto: é a separação decimal de quem lê em português, e
        // a linha inteira do app está em pt-BR.
        `${nota.toFixed(1).replace('.', ',')} (${total} ${total === 1 ? 'troca' : 'trocas'})`

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
  /**
   * 'PROPOSTA' é a troca que nasceu de alguém oferecer na vitrine, não do
   * motor de matching — ver db/schema/23. A tela precisa das duas vozes: uma é
   * "vocês dois têm o que o outro procura", a outra é "você ofereceu e a pessoa
   * topou".
   */
  tipo: 'DIRETO' | 'MULTIPLO' | 'TRIANGULAR' | 'PROPOSTA'
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

/**
 * Aceita a isenção e recebe o match já com o contato.
 *
 * **O contato não vem antes disto.** O `GET` do detalhe omite `contato_visivel`
 * enquanto não houver aceite registrado para este match — a trava é do servidor,
 * não do modal. Uma caixa cobrindo um dado que já chegou não esconde nada de
 * quem abre as ferramentas do navegador, e o que a isenção precisa provar é que
 * o dado não saiu de lá antes de a pessoa ler o texto.
 *
 * Devolve o match inteiro, que é o que a tela já tem em mãos — costurar um
 * `{contato}` solto dentro do objeto existente é onde os dois estados começam a
 * divergir.
 */
export const revelarContato = (id: string) =>
  api.post<Match>(`/me/matches/${id}/contato`)

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
