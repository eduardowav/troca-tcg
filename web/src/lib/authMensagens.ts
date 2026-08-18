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
 * fecha o buraco. A causa raiz é a confirmação de e-mail estar desligada no
 * Supabase, e quem chamar `supabase.co` direto continua distinguindo os dois
 * casos. Está registrado lá como risco residual, com o custo de fechá-lo.
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
  if (m.includes('password should be')) {
    return 'Senha muito curta. Use ao menos 8 caracteres.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'E-mail inválido.'
  }
  // O limite de envio de e-mail é outro problema, e a frase de "muitas
  // tentativas" mandaria a pessoa tentar de novo em um minuto — o que não
  // resolve. O remetente padrão do Supabase libera poucos e-mails por hora, e
  // quem esbarra nisso precisa saber que a espera é longa e não é culpa dela.
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
