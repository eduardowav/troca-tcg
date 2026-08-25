import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import { temTokenDeEmail, trocarTokenPorSessao } from '@/lib/linkDeEmail'
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

// Quem chega por link de e-mail traz o token na URL, e ele só vira sessão
// depois de uma ida ao servidor. Medido antes de qualquer await: o
// INITIAL_SESSION chega primeiro e chega vazio, e sem esta trava a tela de
// destino piscaria "este link não vale mais" antes de a sessão existir.
let trocandoTokenDoLink = temTokenDeEmail()

// O Supabase persiste a sessão em localStorage e a renova sozinho; aqui só
// espelhamos o estado dele. onAuthStateChange dispara INITIAL_SESSION assim que
// termina de hidratar, então este subscribe cobre também a carga inicial.
supabase.auth.onAuthStateChange((_evento, session) => {
  useAuth.setState({ session, carregando: trocandoTokenDoLink && !session })
})

if (trocandoTokenDoLink) {
  // O `finally` é o que garante a saída do carregando quando o token não vale:
  // sem sessão, nenhum evento de auth vem depois para desligá-lo.
  void trocarTokenPorSessao().finally(() => {
    trocandoTokenDoLink = false
    useAuth.setState({ carregando: false })
  })
}

export const useUsuarioId = () => useAuth((s) => s.session?.user.id)

export async function sair() {
  await supabase.auth.signOut()
  queryClient.clear()
}
