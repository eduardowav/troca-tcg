import { supabase } from '@/lib/supabase'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

if (!BASE) {
  // Mesmo cuidado do supabase.ts: falha clara em vez de erro obscuro no 1º fetch.
  console.warn('API não configurada: defina VITE_API_URL em web/.env')
}

/**
 * Erro vindo da API no formato padrão `{"erro": {codigo, mensagem, campo?}}`.
 *
 * `mensagem` já vem em português pronta para exibir; `codigo` é o que o cliente
 * usa para decidir (ex.: PERFIL_NAO_ENCONTRADO dispara a criação do perfil).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campo?: string,
  ) {
    super(mensagem)
    this.name = 'ApiError'
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function requisitar<T>(
  metodo: Metodo,
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  // getSession já renova o token expirado antes de devolvê-lo.
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (corpo !== undefined) headers['Content-Type'] = 'application/json'

  let resposta: Response
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch {
    throw new ApiError(
      0,
      'REDE_INDISPONIVEL',
      'Não foi possível falar com o servidor. Confira sua conexão.',
    )
  }

  if (resposta.status === 204) return undefined as T

  const texto = await resposta.text()
  let json: unknown = null
  if (texto) {
    try {
      json = JSON.parse(texto)
    } catch {
      json = null // resposta não-JSON (proxy, HTML de erro) cai no genérico abaixo
    }
  }

  if (!resposta.ok) throw traduzirErro(resposta.status, json)
  return json as T
}

/** Normaliza os três formatos de erro que a API pode devolver. */
function traduzirErro(status: number, json: unknown): ApiError {
  const corpo = json as
    | { erro?: { codigo: string; mensagem: string; campo?: string } }
    | { detail?: unknown }
    | null

  // 1. Erro de regra de negócio (app.core.errors.RegraNegocio)
  const erro = corpo && 'erro' in corpo ? corpo.erro : undefined
  if (erro?.codigo) {
    return new ApiError(status, erro.codigo, erro.mensagem, erro.campo)
  }

  const detail = corpo && 'detail' in corpo ? corpo.detail : undefined

  // 2. Validação do Pydantic: detail é uma lista de problemas por campo
  if (Array.isArray(detail) && detail.length > 0) {
    const primeiro = detail[0] as { loc?: unknown[]; msg?: string }
    const loc = primeiro.loc ?? []
    return new ApiError(
      status,
      'DADOS_INVALIDOS',
      primeiro.msg ?? 'Dados inválidos.',
      typeof loc.at(-1) === 'string' ? (loc.at(-1) as string) : undefined,
    )
  }

  // 3. HTTPException simples (ex.: 401 do HTTPBearer)
  if (typeof detail === 'string') {
    return new ApiError(
      status,
      status === 401 ? 'NAO_AUTENTICADO' : 'ERRO_API',
      detail,
    )
  }

  return new ApiError(
    status,
    status === 401 ? 'NAO_AUTENTICADO' : 'ERRO_API',
    status >= 500
      ? 'O servidor teve um problema. Tente de novo em instantes.'
      : 'Não foi possível completar a ação.',
  )
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    requisitar<T>('POST', caminho, corpo ?? {}),
  patch: <T>(caminho: string, corpo: unknown) =>
    requisitar<T>('PATCH', caminho, corpo),
  // DELETE com corpo é raro e proposital: desligar o push manda o endpoint do
  // navegador, que é longo demais para caber em caminho e não identifica um
  // recurso nosso. Quem não passa corpo continua mandando DELETE sem corpo.
  del: (caminho: string, corpo?: unknown) =>
    requisitar<void>('DELETE', caminho, corpo),
}

/**
 * Acorda a API antes de alguém precisar dela.
 *
 * O serviço da API está no plano gratuito do Render, que hiberna depois de 15
 * minutos sem tráfego. A volta custa cerca de 35 segundos — quase tudo é o
 * Render alocando e subindo o contêiner, não código nosso: o `import` do
 * `app.main` leva 2,4s do total.
 *
 * O keep-alive do GitHub Actions cobre o caso normal, mas ele nunca vai cobrir
 * todos: o agendador do Actions é "melhor esforço" e atrasa sob carga. Esta
 * chamada é a segunda linha de defesa, e paga por si mesma justamente na hora
 * em que o keep-alive falhou.
 *
 * Ela não deixa a espera menor — deixa ela mais cedo. Sai no instante em que o
 * app monta, enquanto a pessoa ainda está lendo a tela de entrada ou digitando
 * a senha; quando a primeira tela de dado pede alguma coisa, o servidor já
 * acordou. É por isso que fica no `main.tsx` e não numa tela: dentro de uma
 * tela ela só correria depois da navegação, que é tarde demais.
 *
 * Sem `await`, sem estado e sem erro visível de propósito. Falhar aqui não
 * significa nada — a requisição de verdade vem depois e tem o tratamento dela.
 * `cache: 'no-store'` porque uma resposta servida do cache acorda ninguém.
 */
export function aquecer(): Promise<void> {
  if (!BASE) return Promise.resolve()
  return fetch(`${BASE}/health`, { cache: 'no-store' }).then(
    () => undefined,
    () => undefined,
  )
}
