import { useQuery } from '@tanstack/react-query'

import { garantirPerfil, type Perfil } from '@/lib/perfil'
import { useUsuarioId } from '@/stores/auth'

/**
 * Perfil do usuário logado.
 *
 * `data === null` significa autenticado mas sem perfil — falta completar o
 * cadastro (ver rota /completar-cadastro).
 */
export function usePerfil() {
  const userId = useUsuarioId()

  return useQuery<Perfil | null>({
    queryKey: ['perfil', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
    queryFn: garantirPerfil,
  })
}
