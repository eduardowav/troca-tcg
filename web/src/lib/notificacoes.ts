import { api } from '@/lib/api'

/**
 * A caixa de notificações.
 *
 * Espelha `api/app/schemas/notificacao.py`. `titulo` e `corpo` chegam prontos do
 * servidor — este arquivo não monta texto de notificação, e é de propósito: a
 * linha guardada tem de continuar fazendo sentido daqui a um mês, com o app já
 * mudado, e o Web Push da próxima leva entrega esses dois campos direto ao
 * sistema operacional, onde não existe tradução do lado do cliente.
 */

/** Os tipos que o backend grava. Só servem para escolher ícone e cor. */
export type TipoNotificacao =
  | 'PROPOSTA_RECEBIDA'
  | 'PROPOSTA_SUA_VEZ'
  | 'PROPOSTA_ACEITA'
  | 'PROPOSTA_RECUSADA'
  | 'PROPOSTA_RETIRADA'
  | 'PROPOSTA_EXPIRADA'
  | 'NOVO_MATCH'
  | 'MATCH_ACEITO'
  | 'MATCH_CONFIRME'
  | 'MATCH_CONCLUIDO'
  | 'MATCH_FURADO'
  | 'MATCH_CANCELADO'
  | 'MATCH_EXPIRADO'
  | 'CARTA_PROCURADA'
  | 'CARTA_DISPONIVEL'
  | 'PLANO_EXPIROU'

export interface Notificacao {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string
  /** Caminho interno do app, nunca URL absoluta. */
  link: string | null
  lida: boolean
  criado_em: string
}

export interface ContagemNaoLidas {
  nao_lidas: number
}

export function listarNotificacoes(apenasNaoLidas = false, limite = 50) {
  const busca = new URLSearchParams()
  if (apenasNaoLidas) busca.set('nao_lidas', 'true')
  busca.set('limite', String(limite))
  return api.get<Notificacao[]>(`/me/notifications?${busca}`)
}

export function contarNaoLidas() {
  return api.get<ContagemNaoLidas>('/me/notifications/nao-lidas')
}

/**
 * Marca como lidas. Sem ids, marca todas.
 *
 * A resposta é a contagem que sobrou, não quantas foram marcadas — é o número
 * que a badge precisa em seguida, e poupa a chamada que viria logo depois.
 */
export function marcarLidas(ids?: string[]) {
  return api.post<ContagemNaoLidas>('/me/notifications/read', { ids: ids ?? [] })
}

/**
 * O ícone de cada tipo, do mesmo conjunto que o resto do app usa.
 *
 * Agrupado por família e não por tipo: proposta é conversa, match é troca,
 * carta é o acervo. Quem lê a caixa não precisa distinguir quinze ícones —
 * precisa saber, de relance, de que assunto cada linha trata.
 *
 * `PLANO_EXPIROU` entra em 'carta' e não numa família própria: o que mudou para
 * quem lê são as ofertas que saíram do ar, não uma abstração chamada plano.
 */
export function iconeDe(tipo: TipoNotificacao): 'proposta' | 'troca' | 'carta' {
  if (tipo.startsWith('PROPOSTA_')) return 'proposta'
  if (tipo.startsWith('CARTA_') || tipo === 'PLANO_EXPIROU') return 'carta'
  return 'troca'
}

/**
 * Se a linha pede ação de quem recebeu.
 *
 * Só três pedem, e são as que o produto existe para entregar: é a sua vez de
 * responder uma proposta, e a confirmação da troca que o outro já confirmou.
 * A tela destaca essas; o resto é notícia.
 *
 * `MATCH_CONFIRME` é o pedido; `MATCH_CONCLUIDO` é a notícia de que os dois
 * confirmaram. Eram o mesmo tipo até 2026-08-21, e por isso a linha que
 * anunciava a troca fechada — a última do fluxo, quando não falta nada a
 * ninguém — vinha marcada como "sua vez".
 */
export function pedeResposta(tipo: TipoNotificacao): boolean {
  return (
    tipo === 'PROPOSTA_RECEBIDA' ||
    tipo === 'PROPOSTA_SUA_VEZ' ||
    tipo === 'MATCH_CONFIRME'
  )
}
