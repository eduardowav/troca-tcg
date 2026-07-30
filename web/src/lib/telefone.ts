import { z } from 'zod'

/**
 * Telefone de WhatsApp brasileiro — é por ele que a troca é combinada depois do
 * aceite mútuo.
 *
 * Guardamos formatado, não só os dígitos: `contato_visivel` é texto livre que a
 * outra pessoa lê na tela do match, e "(91) 98765-4321" se copia para o WhatsApp
 * melhor que "91987654321".
 */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Aceita 10 (fixo) ou 11 (celular) dígitos, com DDD. */
export function telefoneValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length !== 10 && d.length !== 11) return false
  // DDD brasileiro vai de 11 a 99; celular tem 9 na frente do número.
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  if (d.length === 11 && d[2] !== '9') return false
  return true
}

export function formatarTelefone(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Link de conversa direta no WhatsApp, com a primeira mensagem já escrita.
 *
 * Devolve `null` quando o contato guardado não dá um WhatsApp confiável, e aí a
 * tela mostra só o texto puro, como sempre mostrou. Dois casos caem aqui:
 * `contato_visivel` é texto livre e pode ser um @ de outra rede; e telefone
 * fixo, que `telefoneValido` aceita mas quase nunca tem WhatsApp — o link
 * abriria a tela de "número inválido", que é pior que não ter botão.
 *
 * O 55 entra aqui e não no banco de propósito — o que a pessoa cadastrou é o
 * número como ela o escreve, e é assim que ele continua sendo exibido.
 */
export function linkWhatsApp(contato: string, mensagem: string): string | null {
  if (!telefoneValido(contato)) return null
  const digitos = apenasDigitos(contato)
  if (digitos.length !== 11) return null
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(mensagem)}`
}

export const telefoneSchema = z
  .string()
  .trim()
  .min(1, 'Informe seu WhatsApp para combinarem a troca.')
  .refine(telefoneValido, 'Confira o número: use DDD + telefone.')
  .transform(formatarTelefone)
