import { supabase } from '@/lib/supabase'

/**
 * Recuperação de senha — o caminho de volta para quem perdeu a conta.
 *
 * Até aqui não existia: quem esquecia a senha perdia tudo, sem tela, sem
 * endpoint e sem e-mail. Era o item que segurava a abertura para os usuários de
 * teste, porque é o único defeito do app que não tem contorno nenhum do lado de
 * quem usa.
 *
 * **Não depende da confirmação de e-mail estar ligada** (ela foi desligada em
 * 2026-08-12). O clique no link prova o domínio da caixa naquele momento, que é
 * exatamente o que a recuperação precisa saber. O que fica descoberto é o
 * e-mail digitado errado no cadastro — essa conta não tem caminho de volta, e a
 * saída é humana.
 */

/**
 * Para onde o link do e-mail devolve a pessoa.
 *
 * Montado a partir da origem atual, e não fixo no build: o mesmo app roda em
 * `localhost:5173`, no IP da rede local durante os testes e no domínio de
 * produção — e um endereço fixo mandaria quem pediu do celular cair no
 * computador de quem programou.
 *
 * **A origem precisa estar na lista de Redirect URLs do projeto no Supabase.**
 * Fora dela, o Supabase ignora o parâmetro e usa a Site URL, e o link abre em
 * outro lugar sem avisar ninguém.
 */
export function destinoDaRecuperacao(): string {
  return `${window.location.origin}/nova-senha`
}

/** Manda o e-mail com o link. Erros sobem para a tela traduzir. */
export async function pedirLinkDeRecuperacao(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: destinoDaRecuperacao(),
  })
  if (error) throw error
}

/**
 * Troca a senha da sessão de recuperação aberta pelo link.
 *
 * Exige sessão: o link do e-mail é o que a cria, e sem ela o Supabase recusa. É
 * por isso que a tela de nova senha confere a sessão antes de mostrar o
 * formulário — pedir a senha para depois dizer "esse link venceu" seria cobrar
 * o trabalho antes de conferir se ele serve.
 */
export async function definirNovaSenha(senha: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) throw error
}
