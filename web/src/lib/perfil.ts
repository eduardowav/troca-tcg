import { api, ApiError } from '@/lib/api'
import { supabase } from '@/lib/supabase'

/**
 * Espelha PerfilPublicoOut da API — o perfil como terceiros o veem.
 *
 * A herança segue a da API de propósito (api/app/schemas/profile.py): o público
 * é a base e o próprio estende. Na direção contrária, todo campo privado novo
 * apareceria aqui como opcional e a tela pública passaria a ter onde exibi-lo.
 */
export interface PerfilPublico {
  id: string
  username: string
  nome_exibicao: string
  cidade: string
  bairro: string | null
  avatar_url: string | null
  bio: string | null
  trocas_concluidas: number
  trocas_furadas: number
  /** Desistências declaradas. Fora da razão da reputação — não são furo. */
  trocas_desistidas?: number
  reputacao: number | null
  /**
   * Selo de reconhecimento, ou nulo. Hoje só existe `FOUNDER`.
   *
   * Público de propósito — um selo que só o dono vê não reconhece ninguém.
   * Não é plano e não libera nada: quem manda no limite é `plano`.
   */
  selo?: string | null
  /**
   * Esta pessoa tem o PRO? Derivado de `profiles.plano` no servidor — não é um
   * valor de `selo`, e os dois convivem. Ver `SeloDaPessoa`.
   */
  pro?: boolean
  /** Quando a conta foi criada, em ISO 8601. */
  desde: string
}

/** Espelha PerfilOut da API — o dono vendo o próprio perfil, só em /me. */
export interface Perfil extends PerfilPublico {
  /** Só vem em /me — o dono vendo o próprio contato. */
  contato_visivel: string | null
  plano: string
  /**
   * PRO sem pagar — patrocínio de loja, permuta de serviço, contrato.
   *
   * Booleano e não o motivo: o motivo é o acordo, e é registro de quem
   * administra. A tela precisa saber que este PRO é de cortesia, para não
   * oferecer assinatura a quem já tem tudo e não pode cancelar nada.
   */
  parceiro?: boolean
  onboarding_ok: boolean
  /**
   * A conta foi bloqueada por descumprir os termos.
   *
   * Só existe aqui, e não no perfil público: lá quem foi bloqueado simplesmente
   * não aparece. Para o dono é o contrário — é a única forma de saber por que
   * toda ação passou a devolver 403, e sem isso a conclusão natural é que o app
   * quebrou, o que empurra a pessoa a criar uma segunda conta.
   */
  bloqueado?: boolean
}

export interface PerfilNovo {
  username: string
  nome_exibicao: string
  bairro?: string | null
  contato_visivel?: string | null
  aceite_termos: boolean
}

/** Campos que a tela de perfil edita. PATCH parcial: ausente = não mexer. */
export interface PerfilEdicao {
  username?: string
  nome_exibicao?: string
  contato_visivel?: string
  bio?: string | null
}

export const obterPerfil = () => api.get<Perfil>('/me')
export const criarPerfil = (dados: PerfilNovo) => api.post<Perfil>('/me', dados)
export const atualizarPerfil = (dados: PerfilEdicao) =>
  api.patch<Perfil>('/me', dados)

/** Apaga a conta no servidor. Irreversível — a sessão é encerrada depois. */
export const excluirConta = () => api.del('/me')

/** O perfil de outra pessoa, por @. Exige login — ver routers/users.py. */
export const obterPerfilPublico = (username: string) =>
  api.get<PerfilPublico>(`/u/${encodeURIComponent(username)}`)

/**
 * "Trocando desde março de 2026" — a antiguidade como ela se lê.
 *
 * Mês e ano, nunca o dia: a data exata da criação da conta não diz nada a quem
 * está decidindo se encontra a pessoa, e ainda cria a falsa impressão de um
 * registro preciso sobre alguém. O que importa é a ordem de grandeza — semanas
 * ou anos. Data ilegível devolve nulo, como `dataDoDesfecho` em lib/matches.
 */
export function membroDesde(iso: string): string | null {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return null
  return quando.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

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
  /** WhatsApp. Vai junto porque sem contato o match chega ao fim e trava. */
  contato_visivel?: string
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
      contato_visivel: meta.contato_visivel ?? null,
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
