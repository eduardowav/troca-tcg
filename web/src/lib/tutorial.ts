/**
 * Se a pessoa já viu a explicação de como o app funciona.
 *
 * Mora no `localStorage`, e é decisão deliberada não guardar isto no perfil: é
 * preferência de leitura, não dado da conta. Guardar no banco custaria uma
 * coluna, uma migração e uma escrita autenticada para responder a uma pergunta
 * que só interessa a este aparelho — e um `perfil.tutorial_visto` viraria mais
 * um campo que ninguém sabe se pode apagar.
 *
 * O preço é que quem trocar de aparelho vê a explicação de novo, uma vez. É o
 * preço certo: em aparelho novo, ver como o app funciona é mais provável de
 * ajudar do que de atrapalhar.
 *
 * A chave segue o padrão das outras (`troca:tema`).
 */

const CHAVE = 'troca:tutorial-visto'

export function tutorialJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'sim'
  } catch {
    // Navegador com armazenamento bloqueado (modo privado de alguns, iframe sem
    // permissão): a resposta honesta é "não sei", e nesse caso mostrar é melhor
    // que esconder — a explicação tem saída, e a falta dela não tem.
    return false
  }
}

export function marcarTutorialVisto(): void {
  try {
    localStorage.setItem(CHAVE, 'sim')
  } catch {
    // Não poder lembrar não pode impedir de continuar.
  }
}
