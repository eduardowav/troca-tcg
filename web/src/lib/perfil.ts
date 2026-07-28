import { api, ApiError } from '@/lib/api'
import { supabase } from '@/lib/supabase'

/** Espelha PerfilOut da API (api/app/schemas/profile.py). */
export interface Perfil {
  id: string
  username: string
  nome_exibicao: string
  cidade: string
  bairro: string | null
  avatar_url: string | null
  bio: string | null
  trocas_concluidas: number
  trocas_furadas: number
  reputacao: number | null
  plano: string
  onboarding_ok: boolean
}

export interface PerfilNovo {
  username: string
  nome_exibicao: string
  bairro?: string | null
  contato_visivel?: string | null
  aceite_termos: boolean
}

export const obterPerfil = () => api.get<Perfil>('/me')
export const criarPerfil = (dados: PerfilNovo) => api.post<Perfil>('/me', dados)

/**
 * Dados do cadastro que ficam no user_metadata do Supabase até virarem perfil.
 *
 * O perfil só pode ser criado com um JWT em mãos, e quando o Supabase exige
 * confirmação de e-mail a sessão só existe depois — possivelmente em outro
 * aparelho. Guardar no metadata faz o POST /me acontecer no primeiro acesso
 * autenticado, venha ele de onde vier.
 */
export interface CadastroPendente {
  username: string
  nome_exibicao: string
  aceite_termos: boolean
}

/** Perfil da sessão atual, criando-o a partir do cadastro pendente se faltar. */
export async function garantirPerfil(): Promise<Perfil | null> {
  try {
    return await obterPerfil()
  } catch (erro) {
    if (!(erro instanceof ApiError) || erro.codigo !== 'PERFIL_NAO_ENCONTRADO') {
      throw erro
    }
  }

  const { data } = await supabase.auth.getUser()
  const meta = (data.user?.user_metadata ?? {}) as Partial<CadastroPendente>
  if (!meta.username || !meta.nome_exibicao) return null

  try {
    return await criarPerfil({
      username: meta.username,
      nome_exibicao: meta.nome_exibicao,
      aceite_termos: Boolean(meta.aceite_termos),
    })
  } catch (erro) {
    // Outra aba criou primeiro: o perfil existe, é só buscar de novo.
    if (erro instanceof ApiError && erro.codigo === 'PERFIL_JA_EXISTE') {
      return obterPerfil()
    }
    // Username tomado no meio do caminho: cai na tela de completar cadastro.
    if (erro instanceof ApiError && erro.codigo === 'USERNAME_EM_USO') return null
    throw erro
  }
}

/**
 * Checa se o @username está livre antes do cadastro.
 *
 * Leitura direta do Postgres via anon key — `profiles` tem select público
 * (db/schema/09_rls.sql) porque a reputação precisa ser visível.
 */
export async function usernameDisponivel(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (error) return true // na dúvida, deixa seguir: a API decide de verdade
  return data === null
}
