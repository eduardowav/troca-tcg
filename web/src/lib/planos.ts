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
 * ser: o valor viaja na chamada e `PRECOS` em `core/limites.py` é o dono. A
 * exceção virou o caso mais forte da regra: limite divergente irrita, preço
 * divergente é cobrança que não bate com a tela.
 *
 * **O PRO é comprado por Pix desde 2026-08-23**, e não assinado. Não há
 * renovação automática, não há cancelamento, e o que a pessoa compra é tempo —
 * ver `services/pro.py` e `db/schema/38`.
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
 * plano ao mesmo tempo (5 no FREE, ilimitado no PRO desde 2026-08-22). Cem propostas em 24 horas não é
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

/** O que `POST /me/pro/pagamentos` devolve: a cobrança Pix, pronta para pagar. */
export interface CobrancaPix {
  payment_id: string
  periodo: Periodo
  /** Em reais, como texto — `"14.90"`. Mesmo motivo de `precos` acima. */
  valor: string
  /**
   * O "copia e cola" do Pix. É o que a pessoa cola no banco, e é a partir dele
   * que o QR é desenhado na tela — a imagem não viaja pela rede.
   */
  qr_code: string
  /** Quando o código morre. São trinta minutos a contar da criação. */
  expira_em: string | null
  /**
   * Esta cobrança já existia?
   *
   * A API devolve o Pix vivo em vez de criar um segundo — ver `services/pro.py`.
   * A tela precisa saber para não dizer "código gerado" a quem está recebendo o
   * mesmo de dois minutos atrás.
   */
  reaproveitada: boolean
}

/**
 * Gera o Pix da compra do PRO e devolve o código.
 *
 * **Ninguém vira PRO aqui.** A cobrança nasce pendente e quem credita é o
 * webhook, depois de o dinheiro existir — ver `services/pro.py`. Quem fecha a
 * folha sem pagar fica com o plano de antes, que é o desenho certo: o dinheiro
 * promove, não o clique.
 *
 * **Substituiu o `assinar()` em 2026-08-23**, que mandava a pessoa para o
 * checkout do Mercado Pago com `window.location.replace`. Não há mais para onde
 * mandar: o Pix acontece dentro do app, e a pessoa nunca sai da tela.
 */
export const comprarPro = (periodo: Periodo) =>
  api.post<CobrancaPix>('/me/pro/pagamentos', { periodo })

/** O que `GET /me/pro` responde. Nulos são o normal de quem nunca comprou. */
export interface SituacaoDoPro {
  plano: string
  /** Até quando o PRO comprado vale. Nulo para quem não tem. */
  plano_expira_em: string | null
  /**
   * A tela deve oferecer renovação?
   *
   * **Quem decide é o servidor**, e a conta é feita no banco. Verdadeiro só nos
   * três dias antes do vencimento — a mesma janela do aviso, para o app não
   * mandar uma notificação dizendo "vence em 3 dias" e a tela de destino não ter
   * como pagar. Fora dela, a cartela informa a data e não vende nada.
   */
  pode_renovar: boolean
  /** Status da última cobrança. Nulo para quem nunca comprou. */
  status: string | null
  periodo: Periodo | null
  /**
   * O código da cobrança pendente, **só enquanto ela vale**. É o que faz a
   * folha do Pix reabrir sozinha quando a pessoa volta ao app no meio do
   * pagamento — sem isso, voltar significaria gerar outra cobrança.
   */
  qr_code: string | null
  pix_expira_em: string | null
  pago_em: string | null
}

export const obterSituacao = () => api.get<SituacaoDoPro>('/me/pro')

/**
 * Quantos dias faltam para a data, arredondado para cima. Negativo virou zero.
 *
 * A tela conta em dias porque é assim que a pessoa pensa em prazo de plano —
 * "vence em 3 dias" decide, "vence em 71 horas" não.
 */
export function diasAte(quando: string | null): number | null {
  if (!quando) return null
  const ms = new Date(quando).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
