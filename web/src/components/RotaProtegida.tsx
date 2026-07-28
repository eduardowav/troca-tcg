import { Navigate, Outlet, useLocation } from 'react-router-dom'

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
  if (error) return <FalhaAoCarregar aoTentar={() => void refetch()} />
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

function FalhaAoCarregar({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-5 text-center">
      <h1 className="text-[22px] leading-tight">Não conseguimos te carregar.</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Pode ser a conexão ou o servidor fora do ar por um instante.
      </p>
      <button
        onClick={aoTentar}
        className="mx-auto mt-6 h-11 rounded-[var(--radius-control)] border border-edge bg-surface-2 px-5 text-[15px] font-medium text-paper hover:border-faint"
      >
        Tentar de novo
      </button>
    </div>
  )
}
