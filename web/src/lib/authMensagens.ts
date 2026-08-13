/**
 * Traduz os erros do Supabase Auth (que vêm em inglês, prontos para dev, não
 * para jogador) em frases que a pessoa entende e sabe o que fazer a seguir.
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
    return 'Esse e-mail já tem conta. Entre em vez de criar.'
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
