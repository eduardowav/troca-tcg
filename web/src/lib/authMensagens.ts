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
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com o servidor. Confira sua internet.'
  }
  return 'Não foi possível concluir. Tente de novo em instantes.'
}
