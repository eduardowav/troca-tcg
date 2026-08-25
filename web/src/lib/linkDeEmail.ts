import type { EmailOtpType } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

/**
 * O link do e-mail, trocado por sessão aqui dentro em vez de no `supabase.co`.
 *
 * Até 2026-08-25 o botão dos e-mails apontava para
 * `qbdtcpotehvbkozppmyu.supabase.co/auth/v1/verify?…&redirect_to=…`: o Supabase
 * validava o token e devolvia a pessoa para cá com a sessão no fragmento da
 * URL, que o `detectSessionInUrl` do cliente recolhia sozinho. Funcionava, e
 * mesmo assim custava caro em duas frentes:
 *
 * **Filtro de spam.** O remetente é `@trocatcg.com`, o link era de
 * `supabase.co` e o logo vinha de `onrender.com` — três domínios numa mensagem
 * que pede senha, que é a forma de um phishing. Com o `token_hash`, o endereço
 * do botão é o mesmo domínio de quem assina o e-mail, sem redirecionamento no
 * meio.
 *
 * **Link gasto antes de a pessoa clicar.** O antivírus da caixa de entrada abre
 * os links da mensagem para inspecionar. Abrir o `/auth/v1/verify` **consome**
 * o token, que serve uma vez só — a pessoa clicava e recebia "este link não
 * vale mais". Aqui a troca só acontece quando o JavaScript roda, e nenhum
 * scanner de e-mail executa a página.
 *
 * O par `token_hash`/`type` vem dos templates em `docs/emails/`, montado como
 * `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`. O `RedirectTo` é a
 * origem que o app pediu, então o link continua voltando para onde a pessoa
 * estava — `localhost` no desenvolvimento, o domínio em produção.
 */

/** Os únicos tipos que os nossos e-mails mandam. */
const TIPOS: readonly EmailOtpType[] = ['recovery', 'signup', 'email_change']

function tipoValido(valor: string | null): valor is EmailOtpType {
  return valor !== null && (TIPOS as readonly string[]).includes(valor)
}

/**
 * Há um link de e-mail para trocar nesta carga da página?
 *
 * Conferido **antes** de qualquer `await` para que o `stores/auth` saiba
 * segurar o estado de carregando: sem isso a tela decide que não há sessão,
 * pisca "este link não vale mais", e só depois a sessão chega.
 */
export function temTokenDeEmail(): boolean {
  const busca = new URLSearchParams(window.location.search)
  return Boolean(busca.get('token_hash')) && tipoValido(busca.get('type'))
}

/**
 * Troca o token da URL por sessão e limpa o endereço.
 *
 * O `replaceState` tira o token da barra antes que ele vá parar no histórico,
 * no `Referer` de qualquer imagem da página ou num print de tela pedido pelo
 * suporte. É higiene, não estética: enquanto ele estiver lá, é uma senha.
 *
 * Erros não sobem. Token vencido, já usado ou adulterado terminam sem sessão, e
 * é a tela de destino que já sabe explicar isso — `/nova-senha` e `/entrar`
 * dizem a mesma coisa há semanas, e dizem melhor do que um toast genérico.
 */
export async function trocarTokenPorSessao(): Promise<void> {
  const busca = new URLSearchParams(window.location.search)
  const token_hash = busca.get('token_hash')
  const type = busca.get('type')
  if (!token_hash || !tipoValido(type)) return

  busca.delete('token_hash')
  busca.delete('type')
  const limpo =
    window.location.pathname +
    (busca.toString() ? `?${busca}` : '') +
    window.location.hash
  window.history.replaceState(null, '', limpo)

  const { error } = await supabase.auth.verifyOtp({ token_hash, type })
  if (error) console.warn('Link de e-mail não valeu:', error.message)
}
