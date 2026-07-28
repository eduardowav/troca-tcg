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
  del: (caminho: string) => requisitar<void>('DELETE', caminho),
}
