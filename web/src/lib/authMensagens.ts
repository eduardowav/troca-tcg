/**
 * Traduz os erros do Supabase Auth (que vêm em inglês, prontos para dev, não
 * para jogador) em frases que a pessoa entende e sabe o que fazer a seguir.
 *
 * **Uma frase daqui não pode responder "esse e-mail tem conta?"** — achado F-03
 * da auditoria de 2026-08-18. Até então o cadastro devolvia "Esse e-mail já tem
 * conta", que é um oráculo: quem quisesse saber quais e-mails de uma lista estão
 * no app só precisava tentar criar conta com cada um. Isso vale mais para este
 * app do que para a média, porque o produto todo é gente combinando encontro
 * presencial — a lista de quem está aqui é informação sobre pessoas, não sobre
 * contas.
 *
 * Ver `docs/SEGURANCA.md`: o texto daqui fecha o que a tela mostra, e **não**
 * fecha o buraco — o front nunca é a fronteira. Quem fechou a causa raiz foi a
 * **volta da confirmação de e-mail em 2026-08-21** (risco residual R-1): com
 * ela ligada, o `signUp` devolve usuário ofuscado em vez de "já existe", e nem
 * quem chama o `supabase.co` direto distingue mais os dois casos.
 *
 * A frase ambígua abaixo continua, e continua de propósito: ela é a única
 * proteção se a confirmação for desligada de novo pelo painel, que é uma
 * decisão de produto e não de código.
 */
export function mensagemAuth(bruta: string): string {
  const m = bruta.toLowerCase()

  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar — veja sua caixa de entrada.'
  }
  if (m.includes('already registered') || m.includes('already exists')) {
    // Deliberadamente ambígua entre "já existe" e "não deu para criar", e
    // deliberadamente sem sugerir "entre em vez de criar" — a sugestão era a
    // parte que confirmava a existência da conta. Quem de fato já tem conta
    // encontra o caminho no "Entrar" e no "Esqueci minha senha", que estão na
    // mesma tela, a um toque.
    return 'Não foi possível criar a conta com esses dados. Confira o e-mail, ou entre se já tiver conta.'
  }
  // A senha está numa base de vazamento — o Supabase compara com o
  // HaveIBeenPwned quando a proteção do painel está ligada (pendência §5.1 de
  // `docs/SEGURANCA.md`; conferida como **desligada** em 2026-08-21).
  //
  // A frase entra antes do interruptor, e não depois: o dia em que ele for
  // ligado, quem esbarrar nele vê a explicação em português em vez do
  // "Não foi possível concluir" genérico — que é o pior recado possível aqui,
  // porque manda tentar de novo exatamente o que nunca vai passar.
  //
  // Não é o mesmo caso do medidor de `lib/forcaSenha.ts`: lá a senha é fraca
  // por construção, aqui ela pode ser ótima no papel e estar num vazamento.
  if (m.includes('known to be weak') || m.includes('pwned')) {
    return 'Essa senha apareceu em vazamentos conhecidos na internet. Escolha outra.'
  }
  if (m.includes('password should be')) {
    return 'Senha muito curta. Use ao menos 8 caracteres.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'E-mail inválido.'
  }
  // **Dois limites diferentes, e dizer o errado é pior que não dizer nada.**
  //
  // O primeiro é o intervalo entre dois envios seguidos — 15 segundos, medido
  // em 2026-08-21 pedindo dois cadastros em sequência. Quem clica em "reenviar"
  // duas vezes bate nele, e mandá-la esperar uma hora faria abandonar uma espera
  // de quinze segundos. O Supabase diz quantos segundos faltam; a frase repete
  // o número dele em vez de inventar um.
  const segundos = bruta.match(/after (\d+) seconds?/i)
  if (segundos) {
    return `Espere ${segundos[1]} segundos e peça de novo.`
  }
  // O segundo é a cota do remetente, que é por hora. Aí a espera é longa mesmo,
  // e quem esbarra precisa saber que não é culpa dela.
  if (m.includes('email rate limit') || m.includes('over_email_send_rate')) {
    return 'Muitos e-mails pedidos em pouco tempo. Tente de novo em uma hora.'
  }
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
  }
  // A senha nova não pode ser a antiga — o Supabase recusa, e sem tradução a
  // pessoa lê inglês na tela mais frágil do app.
  if (m.includes('should be different from the old password')) {
    return 'A senha nova precisa ser diferente da antiga.'
  }
  if (m.includes('auth session missing') || m.includes('session_not_found')) {
    return 'Este link de senha venceu ou já foi usado. Peça outro.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com o servidor. Confira sua internet.'
  }
  return 'Não foi possível concluir. Tente de novo em instantes.'
}
