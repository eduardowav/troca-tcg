/**
 * Os três passos do TrocaTCG, escritos uma vez só.
 *
 * Eles aparecem em dois lugares: na tela de boas-vindas (`/como-funciona`) e,
 * resumidos, dentro da própria tela de montar as listas. Escrever duas vezes
 * seria garantir que um dos dois envelheceria — e o que envelhece é sempre o
 * que menos gente lê, que é justamente o que fica errado por mais tempo.
 *
 * **O texto é curto porque ninguém lê tutorial.** Cada passo tem um título que
 * se entende sozinho e uma frase que só existe para quem parou nele. Quem já
 * entendeu passa direto; quem não entendeu tem o mapa inteiro numa olhada.
 *
 * A ordem importa e é a do produto: montar, cruzar, combinar. O terceiro passo
 * carrega a parte que ninguém pode descobrir depois — **a troca é presencial e
 * é de vocês dois**, o app não entrega nada e não garante nada. Está nos termos,
 * e um termo aceito não é um termo lido.
 */

export interface Passo {
  numero: number
  titulo: string
  texto: string
}

export const PASSOS: Passo[] = [
  {
    numero: 1,
    titulo: 'Monte suas duas listas',
    texto:
      'O que você tem repetido entra em Ofereço. O que falta na sua coleção entra em Procuro. Uma carta em cada já basta para começar.',
  },
  {
    numero: 2,
    titulo: 'O app cruza as listas',
    texto:
      'Ele procura quem tem a carta que você quer e quer a carta que você tem. Você não precisa caçar ninguém, nem ficar perguntando em grupo.',
  },
  {
    numero: 3,
    titulo: 'Vocês combinam a troca',
    texto:
      'Quando os dois aceitam, o WhatsApp de cada um aparece para o outro. A troca acontece pessoalmente, entre vocês — o app conecta, não entrega carta.',
  },
]
