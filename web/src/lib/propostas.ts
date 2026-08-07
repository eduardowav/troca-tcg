import type { Condicao } from '@/lib/anuncios'
import { api } from '@/lib/api'

/**
 * A proposta: a negociação que nasce na vitrine e morre no aceite.
 *
 * Espelha `api/app/schemas/proposta.py`. Depois do aceite ela vira um match
 * comum — daí `match_id`, que é por onde a tela salta para `/matches/:id` e o
 * resto do ciclo (contato, conclusão, furo) continua como sempre.
 */

export type PropostaStatus =
  | 'ABERTA'
  | 'ACEITA'
  | 'RECUSADA'
  /** Quem fez a última jogada puxou de volta antes de o outro responder. */
  | 'RETIRADA'
  | 'EXPIRADA'

/** As quatro caixas de `/me/propostas`. */
export type Caixa = 'minha_vez' | 'recebidas' | 'enviadas' | 'historico'

/**
 * Uma carta dentro de uma rodada.
 *
 * `card_id`, `condicao` e `finish_id` vêm da cópia guardada no item — o
 * histórico não se reescreve quando o dono edita a lista. `disponivel` é o
 * oposto: vem do anúncio agora, e é o que avisa que a carta saiu do ar no meio
 * da conversa.
 */
export interface ItemProposta {
  listing_id: string | null
  card_id: string
  condicao: Condicao
  finish_id: number
  quantidade: number
  disponivel: boolean
}

/**
 * Uma rodada, sempre do ponto de vista de quem a jogou (`por`).
 *
 * Quem jogou pede o que está em `quero` e entrega o que está em `ofereco`. É o
 * que permite a tela dizer "você pediu X, ela ofereceu Y no lugar" sem inventar
 * perspectiva.
 */
export interface RodadaProposta {
  rodada: number
  por: string
  quero: ItemProposta[]
  ofereco: ItemProposta[]
}

export interface PropostaResumo {
  id: string
  status: PropostaStatus
  rodada: number
  /** O @ de quem deve a resposta. */
  vez_de: string
  /** A outra pessoa da negociação, seja ela quem abriu ou quem recebeu. */
  com: string
  com_nome: string
  minha_vez: boolean
  criada_em: string
  expira_em: string
  respondida_em?: string | null
  match_id?: string | null
  atual?: RodadaProposta | null
}

export interface Proposta extends PropostaResumo {
  autor: string
  destinatario: string
  rodadas: RodadaProposta[]
}

/** O corpo de abrir e de contrapropor: ids de anúncio, dos dois lados. */
export interface ItensDaProposta {
  quero: string[]
  ofereco: string[]
}

export const listarPropostas = (caixa: Caixa) =>
  api.get<PropostaResumo[]>(`/me/propostas?caixa=${caixa}`)

export const obterProposta = (id: string) =>
  api.get<Proposta>(`/me/propostas/${id}`)

export const abrirProposta = (para: string, itens: ItensDaProposta) =>
  api.post<Proposta>('/me/propostas', { para, ...itens })

export const aceitarProposta = (id: string) =>
  api.post<Proposta>(`/me/propostas/${id}/aceitar`)

export const recusarProposta = (id: string) =>
  api.post<Proposta>(`/me/propostas/${id}/recusar`)

export const contraporProposta = (id: string, itens: ItensDaProposta) =>
  api.post<Proposta>(`/me/propostas/${id}/contrapropor`, itens)

export const retirarProposta = (id: string) =>
  api.post<Proposta>(`/me/propostas/${id}/retirar`)

/** O teto de rodadas, espelhando services/propostas.MAX_RODADAS. */
export const MAX_RODADAS = 4

/**
 * Teto de itens por lado numa rodada — o mesmo `MAX_ITENS` do schema da API.
 *
 * Barrar na tela em vez de deixar o envio falhar: quem monta uma proposta com
 * trinta cartas descobriria o limite só depois de ter escolhido as trinta.
 */
export const MAX_ITENS = 20

/**
 * Ainda dá para contrapropor?
 *
 * Na rodada 4 só restam aceitar e recusar: acima disso não há chat interno para
 * sustentar a conversa, e cada rodada custa um dia parado.
 */
export function podeContrapor(proposta: PropostaResumo): boolean {
  return (
    proposta.status === 'ABERTA' &&
    proposta.minha_vez &&
    proposta.rodada < MAX_RODADAS
  )
}

/**
 * Retirar é de quem **não** tem a vez — quem fez a última jogada e se
 * arrependeu antes de o outro olhar. Quem tem a vez responde; não retira.
 */
export function podeRetirar(proposta: PropostaResumo): boolean {
  return proposta.status === 'ABERTA' && !proposta.minha_vez
}

/** Alguma carta desta rodada saiu do ar — a proposta não fecha mais assim. */
export function temCartaForaDoAr(rodada?: RodadaProposta | null): boolean {
  if (!rodada) return false
  return [...rodada.quero, ...rodada.ofereco].some((i) => !i.disponivel)
}

/**
 * O prazo de uma proposta é curto — 72h, não os 7 dias do match —, então ele é
 * dito em horas quando falta menos de um dia. "Expira em 0 dias" não é frase.
 *
 * Nulo quando a data não dá para ler, como em `prazoTexto` dos matches: uma data
 * quebrada viraria "NaN" na tela, que é pior do que não falar de prazo.
 */
export function prazoDaProposta(proposta: PropostaResumo): string | null {
  const ms = new Date(proposta.expira_em).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return 'Prazo vencido'

  const horas = Math.ceil(ms / 3_600_000)
  if (horas <= 1) return 'Menos de 1 hora'
  if (horas < 24) return `${horas} horas`
  const dias = Math.ceil(horas / 24)
  return dias === 1 ? '1 dia' : `${dias} dias`
}

/** As últimas horas, quando o prazo vira notícia em vez de rodapé. */
export const HORAS_URGENTE = 12

export function prazoApertado(proposta: PropostaResumo): boolean {
  if (proposta.status !== 'ABERTA') return false
  const ms = new Date(proposta.expira_em).getTime() - Date.now()
  return !Number.isNaN(ms) && ms <= HORAS_URGENTE * 3_600_000
}

/** O selo curto de cada desfecho — o que cabe no canto de um cartão. */
export const DESFECHO: Record<PropostaStatus, string> = {
  ABERTA: 'em aberto',
  ACEITA: 'virou troca',
  RECUSADA: 'recusada',
  RETIRADA: 'retirada',
  EXPIRADA: 'sem resposta',
}

/**
 * Quem fez o quê, em uma linha — o que o selo sozinho não conta.
 *
 * "Recusada" não diz se fui eu que recusei ou se recusaram a minha proposta, e
 * essas são notícias opostas para quem abre o histórico semanas depois. Dá para
 * saber sem campo novo: quem recusa é quem tinha a **vez**; quem retira é quem
 * fez a última jogada, ou seja, quem *não* tinha a vez. As duas colunas param no
 * instante do desfecho e continuam legíveis depois.
 */
export function desfechoTexto(p: PropostaResumo): string {
  switch (p.status) {
    case 'ACEITA':
      return 'Vocês fecharam — virou troca'
    case 'RECUSADA':
      return p.minha_vez ? 'Você recusou' : `@${p.com} recusou`
    case 'RETIRADA':
      return p.minha_vez ? `@${p.com} retirou` : 'Você retirou'
    case 'EXPIRADA':
      return 'Ninguém respondeu no prazo'
    default:
      return p.minha_vez ? 'Esperando você' : `Esperando @${p.com}`
  }
}

/**
 * O parágrafo do desfecho, na tela de detalhe.
 *
 * Cada encerramento deixa uma pergunta em aberto — "e agora?", "isso conta
 * contra mim?" —, e é ela que este texto responde. Sem isto, a proposta
 * encerrada é um selo cinza e um monte de cartas sem explicação.
 */
export function desfechoExplicado(p: PropostaResumo): string | null {
  switch (p.status) {
    case 'RECUSADA':
      return p.minha_vez
        ? 'Você recusou esta proposta. Nada foi registrado contra ninguém — recusar é uma resposta, não um furo.'
        : 'Não rolou desta vez. As cartas continuam na vitrine, e nada disso conta na reputação de ninguém.'
    case 'RETIRADA':
      return p.minha_vez
        ? 'A proposta foi puxada de volta antes de você responder.'
        : 'Você puxou a proposta de volta antes de a outra pessoa responder.'
    case 'EXPIRADA':
      return 'As 72 horas passaram sem resposta. O prazo da proposta é curto de propósito: é o tempo de responder uma pergunta no celular, não o de marcar um encontro.'
    default:
      return null
  }
}

/**
 * A data do desfecho como a tela mostra — mesma regra do histórico de trocas.
 *
 * O ano só aparece quando não é o corrente, e data ilegível devolve nulo em vez
 * de "Invalid Date".
 */
export function dataDaProposta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return null
  const esteAno = quando.getFullYear() === new Date().getFullYear()
  return quando.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    ...(esteAno ? {} : { year: 'numeric' }),
  })
}

/**
 * Como cada rodada se apresenta: quem jogou e o que aquilo foi.
 *
 * A rodada 1 é a proposta; as outras são contrapropostas — e chamar as duas de
 * "rodada 2" na tela obrigaria quem lê a traduzir sozinho o que aconteceu.
 */
export function rodadaTexto(rodada: RodadaProposta, euJoguei: boolean): string {
  const quem = euJoguei ? 'Você' : `@${rodada.por}`
  return rodada.rodada === 1
    ? `${quem} abriu a proposta`
    : `${quem} trocou o que vem`
}
