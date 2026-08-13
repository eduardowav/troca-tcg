import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Falha, motivoDoErro } from '@/components/Falha'
import { usePerfil } from '@/hooks/usePerfil'
import { useAuth } from '@/stores/auth'

/** Exige sessão do Supabase. Manda para /entrar guardando de onde a pessoa veio. */
export function ExigeSessao() {
  const carregando = useAuth((s) => s.carregando)
  const session = useAuth((s) => s.session)
  const location = useLocation()

  if (carregando) return <Carregando />
  if (!session) {
    return (
      <Navigate to="/entrar" state={{ de: location.pathname }} replace />
    )
  }
  return <Outlet />
}

/**
 * Exige sessão E perfil criado. Use dentro de <ExigeSessao>.
 *
 * O perfil é criado sob demanda pelo usePerfil (a partir do user_metadata do
 * cadastro); quando não dá, a pessoa cai em /completar-cadastro.
 */
export function ExigePerfil() {
  const { data: perfil, isPending, error, refetch } = usePerfil()

  if (isPending) return <Carregando />
  // A primeira coisa que o app faz depois de entrar é carregar o perfil, então
  // este é o lugar onde uma queda de servidor aparece antes de qualquer outro —
  // e onde ela precisa dizer de quem é a culpa. `motivoDoErro` separa aparelho
  // sem rede de servidor fora do ar; a tela dá a resposta certa para cada um.
  if (error) {
    return (
      <Falha motivo={motivoDoErro(error)} onTentar={() => void refetch()} />
    )
  }
  if (!perfil) return <Navigate to="/completar-cadastro" replace />
  return <Outlet />
}

function Carregando() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="grid min-h-[100dvh] place-items-center"
    >
      <span className="size-6 animate-spin rounded-full border-2 border-faint border-t-transparent" />
    </div>
  )
}

