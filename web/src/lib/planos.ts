import { api, ApiError } from '@/lib/api'

/**
 * Os planos como a tela os mostra.
 *
 * **Os limites vêm da API** (`GET /v1/planos`), lidos de `core/limites.py`, que é
 * onde a regra é aplicada. Repetir os números aqui criaria duas verdades sobre a
 * mesma promessa, e a divergência apareceria depois de alguém pagar.
 *
 * **O preço mora aqui**, e é a exceção deliberada: ele não é regra de negócio do
 * backend hoje — nenhum código decide nada com ele —, é texto de venda. Na Fase C
 * quem passa a mandar nele é o Mercado Pago.
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
  propostas_por_dia: number
}

export interface Planos {
  /**
   * Enquanto for falso, `plano_vigente()` devolve PRO para todo mundo e ninguém
   * esbarra em limite nenhum. A tela muda de recado com isto — comparar planos
   * num app onde tudo está liberado é falar do que *vai* valer, não do que vale.
   */
  cobranca_ativa: boolean
  planos: Record<'FREE' | 'PRO', Limites>
}

export const obterPlanos = () => api.get<Planos>('/planos')

/** R$ 19,90/mês ou R$ 199,90/ano — o anual sai por dez meses. */
export const PRECO = {
  mensal: 'R$ 19,90',
  anual: 'R$ 199,90',
  /** O que o anual economiza, dito como quem compra pensa. */
  economia: 'dois meses de graça',
} as const

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
