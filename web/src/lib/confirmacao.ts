import { supabase } from '@/lib/supabase'

/**
 * Confirmação de e-mail — o link que prova a caixa antes de a conta valer.
 *
 * Ela ficou **desligada** de 2026-08-12 a 2026-08-21, e o motivo era funil:
 * quem se cadastrava entrava na hora. O que isso deixava aberto está escrito na
 * `docs/SEGURANCA.md` como risco residual R-1, e são duas coisas, não uma:
 *
 * 1. **Enumeração de e-mail.** Sem confirmação, o `signUp` distingue "já
 *    existe" de "criado" para quem chamar o `supabase.co` direto. A mensagem
 *    ambígua de `authMensagens.ts` fecha o que a *tela* diz, e o front não é a
 *    fronteira. Com a confirmação ligada, o Supabase devolve usuário ofuscado.
 * 2. **Account squatting**, que é o pior dos dois: dava para criar conta com o
 *    e-mail de outra pessoa, e ela só descobria ao tentar se cadastrar.
 *
 * O que se paga por isso é um passo a mais no cadastro — e, no dia do
 * lançamento, gente abrindo o e-mail no celular ali mesmo.
 */

/**
 * Para onde o link do e-mail devolve a pessoa.
 *
 * Montado da origem atual pelo mesmo motivo que o da recuperação de senha (ver
 * `recuperacao.ts`): o mesmo app roda em `localhost:5173` e em produção, e um
 * endereço fixo mandaria quem se cadastrou pelo celular cair na máquina de quem
 * programou.
 *
 * **A origem precisa estar nas Redirect URLs do projeto no Supabase.** Fora da
 * lista, o Supabase não recusa: ele responde 200 e usa a Site URL calado, e o
 * link abre em outro lugar sem ninguém saber. Medido em 2026-08-21 pelo
 * `auth_logs`: `http://localhost:5173` e `https://trocatcg-web.onrender.com`
 * estão as duas na lista.
 *
 * **`https://trocatcg.com` precisa entrar na lista antes de o DNS apontar para
 * cá** — é painel, não código, e está em `docs/INFRA.md`. Se o domínio subir
 * primeiro, quem se cadastrar por ele recebe o e-mail, clica, e cai no endereço
 * do Render: a conta confirma, mas a pessoa some do fluxo em que estava. E o
 * `www` conta como outra origem, então entra junto.
 *
 * O destino é `/entrar` porque é de lá que a pessoa saiu, e é a tela que sabe
 * explicar o link vencido. Quando o link é bom, ela nem chega a aparecer: a
 * sessão nasce da URL e a tela manda para dentro do app.
 */
export function destinoDaConfirmacao(): string {
  return `${window.location.origin}/entrar`
}

/**
 * Manda de novo o e-mail de confirmação.
 *
 * Existe porque o primeiro se perde: cai no spam, some numa promoção, ou a
 * pessoa fecha a aba antes de abrir. Sem este botão, a saída seria criar outra
 * conta — que o Supabase recusa, com uma mensagem que não ajuda ninguém.
 *
 * O teto de envio é do Supabase — **100 por hora neste projeto** desde
 * 2026-08-21, com o SMTP do Gmail. Era 30, e subiu para o lançamento: quarenta
 * pessoas cadastrando numa tarde, mais os reenvios e as recuperações de senha,
 * que saem do mesmo balde.
 *
 * Acima de ~75 o Supabase deixa de ser quem segura e o Gmail assume, e ele é
 * menos educado: bater no teto do Supabase dá erro limpo e traduzido; bater no
 * do Gmail é falha de SMTP, e o pior caso é o Google tratar a conta como spam e
 * cortar o envio inteiro — confirmação e recuperação juntas. Os 100 são folga
 * declarada, não capacidade real.
 *
 * Estourar o do Supabase é caso tratado: `authMensagens.ts` traduz o limite
 * numa frase que diz que a espera é longa e não é culpa de quem tentou.
 */
export async function reenviarConfirmacao(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: destinoDaConfirmacao() },
  })
  if (error) throw error
}

/**
 * O que o Supabase devolveu no fragmento da URL quando o link **não** valeu.
 *
 * Link vencido ou já usado volta para cá com `#error=...&error_description=...`
 * em vez de sessão. Sem ler isto, a pessoa que clicou num link de ontem cairia
 * na tela de entrar sem uma palavra sobre o que houve — e tentaria de novo o
 * mesmo link, que é o único caminho que não leva a lugar nenhum.
 *
 * Lido no primeiro render, antes de o `supabase-js` limpar o fragmento.
 */
export function erroDoLinkNaUrl(): string | null {
  const fragmento = window.location.hash.replace(/^#/, '')
  if (!fragmento.includes('error')) return null
  const dados = new URLSearchParams(fragmento)
  const descricao = dados.get('error_description') ?? dados.get('error')
  if (!descricao) return null
  // O Supabase manda o motivo em inglês e com `+` no lugar do espaço. Só dois
  // casos chegam aqui na prática, e os dois têm a mesma saída.
  //
  // A saída é "criar conta com o mesmo e-mail", e não é remendo: para uma conta
  // que existe e ainda não foi confirmada, o `signUp` não cria outra — ele
  // manda o link de novo e devolve o usuário ofuscado. Ou seja, o caminho que a
  // pessoa já conhece resolve, e a tela não precisa de um formulário só para
  // isto.
  const saida = 'Crie a conta de novo com o mesmo e-mail para receber outro.'
  return /expired|invalid/i.test(descricao)
    ? `Este link de confirmação venceu ou já foi usado. ${saida}`
    : `Não foi possível confirmar por este link. ${saida}`
}
