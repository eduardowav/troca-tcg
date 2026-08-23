import { api, ApiError } from '@/lib/api'

/**
 * Os planos como a tela os mostra.
 *
 * **Os limites vêm da API** (`GET /v1/planos`), lidos de `core/limites.py`, que é
 * onde a regra é aplicada. Repetir os números aqui criaria duas verdades sobre a
 * mesma promessa, e a divergência apareceria depois de alguém pagar.
 *
 * **O preço vem da API também, desde 2026-08-22.** Ele era a exceção deliberada
 * aqui — "texto de venda, e na Fase C quem manda é o Mercado Pago" —, e deixou de
 * ser: a assinatura passou a ser criada sem plano associado, então o valor viaja
 * na chamada e `PRECOS` em `core/limites.py` é o dono. A exceção virou o caso
 * mais forte da regra: limite divergente irrita, preço divergente é cobrança que
 * não bate com a tela.
 */

export interface Limites {
  /** Cartas anunciadas como OFERTA. `null` é ilimitado. */
  max_ofertas: number | null
  cadastro_em_massa: boolean
  matches_visiveis: number | null
  triangular: boolean
  alerta_carta: boolean
  /** Janela do histórico de trocas. `null` é completo. */
  historico_dias: number | null
  /**
   * Propostas abertas por dia. `null` é ilimitado — o PRO desde 2026-08-22.
   *
   * Nulável como os outros tetos, e não zero-como-ilimitado: zero é um número
   * legítimo, e um dia pode existir um plano que não abre proposta nenhuma.
   */
  propostas_por_dia: number | null
}

export interface Planos {
  /**
   * Enquanto for falso, `plano_vigente()` devolve PRO para todo mundo e ninguém
   * esbarra em limite nenhum. A tela muda de recado com isto — comparar planos
   * num app onde tudo está liberado é falar do que *vai* valer, não do que vale.
   */
  cobranca_ativa: boolean
  planos: Record<'FREE' | 'PRO', Limites>
  /**
   * O valor de cada período, em reais e como texto — `"19.90"`.
   *
   * Texto e não número porque quem formata é `formatarPreco` logo abaixo: número
   * de dinheiro atravessando JSON é como `19.90` chega na tela escrito `19.9`.
   */
  precos: Record<Periodo, string>
}

export type Periodo = 'mensal' | 'anual'

export const obterPlanos = () => api.get<Planos>('/planos')

/** `"19.90"` vira `"R$ 19,90"`. A vírgula é a do Brasil, e a API manda ponto. */
export const formatarPreco = (valor: string) =>
  `R$ ${Number(valor).toFixed(2).replace('.', ',')}`

/**
 * O que o anual economiza, dito como quem compra pensa.
 *
 * Continua sendo texto daqui, e não conta feita: são dez meses pelo preço de
 * doze, e "dois meses de graça" é a frase que vende isso. Derivar da diferença
 * entre os dois preços produziria "economize 16%", que é verdade e não convence
 * ninguém. Se a razão entre os planos mudar, esta linha muda junto — e é por
 * isso que ela está encostada nos dois valores que a API serve.
 */
export const ECONOMIA_ANUAL = 'dois meses de graça'

/**
 * Os códigos de erro que significam "isto é do PRO".
 *
 * `LIMITE_DE_PROPOSTAS` entra com uma ressalva: ele é antiabuso **e** limite de
 * plano ao mesmo tempo (10 no FREE, 100 no PRO). Cem propostas em 24 horas não é
 * alguém usando o app, então quem bate nesse teto no PRO não está sendo convidado
 * a nada — mas quem bate nas dez do FREE está, e é o mesmo código. A tela de
 * planos explica os dois números, que é o melhor que dá para fazer sem inventar
 * um código novo na API.
 */
const CODIGOS_DO_PRO = new Set([
  'LIMITE_DE_ANUNCIOS',
  'RECURSO_DO_PRO',
  'LIMITE_DE_PROPOSTAS',
])

/** Este erro é um limite de plano — e não uma falha? */
export function eLimiteDePlano(erro: unknown): erro is ApiError {
  return erro instanceof ApiError && CODIGOS_DO_PRO.has(erro.codigo)
}

/** O que `POST /me/assinatura` devolve: para onde mandar a pessoa. */
export interface AssinaturaCriada {
  /** O checkout do Mercado Pago. É para lá que a pessoa vai. */
  init_point: string
  preapproval_id: string
}

/**
 * Cria a assinatura e devolve o checkout.
 *
 * **Ninguém vira PRO aqui.** A linha nasce `pending` e quem promove é o webhook,
 * depois de o pagamento existir — ver `services/assinaturas.py`. Quem fecha a aba
 * no meio do caminho fica com uma assinatura pendente e o plano de antes, que é
 * o desenho certo: o dinheiro promove, não o clique.
 *
 * Nenhum dado de cartão passa por aqui. O app manda a pessoa para o Mercado Pago
 * e ela volta pelo `back_url`.
 */
export const assinar = (periodo: Periodo) =>
  api.post<AssinaturaCriada>('/me/assinatura', { periodo })
