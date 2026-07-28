import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  /** true até o Supabase responder pela primeira vez (evita piscar o /entrar). */
  carregando: boolean
}

export const useAuth = create<AuthState>(() => ({
  session: null,
  carregando: true,
}))

// O Supabase persiste a sessão em localStorage e a renova sozinho; aqui só
// espelhamos o estado dele. onAuthStateChange dispara INITIAL_SESSION assim que
// termina de hidratar, então este subscribe cobre também a carga inicial.
supabase.auth.onAuthStateChange((_evento, session) => {
  useAuth.setState({ session, carregando: false })
})

export const useUsuarioId = () => useAuth((s) => s.session?.user.id)

export async function sair() {
  await supabase.auth.signOut()
  queryClient.clear()
}
