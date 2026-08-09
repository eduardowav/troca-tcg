/**
 * Os sons do app, sintetizados na hora — nenhum arquivo de áudio.
 *
 * A escolha não é de preguiça: um `.mp3` de 20 KB por gesto vira quatro pedidos
 * de rede, cache para invalidar e um kit que envelhece no repositório. Aqui cada
 * som é meia dúzia de osciladores; dá para afinar mexendo num número, e o custo
 * de embarcar é zero. Se algum dia virar som gravado — uma carta de verdade
 * sendo deslizada —, esta camada continua sendo a porta: troca-se o corpo da
 * função, não quem chama.
 *
 * **Nada toca sem gesto.** O navegador (e o iOS em especial) só libera áudio
 * depois de um toque do usuário, e é por isso que o `AudioContext` nasce
 * preguiçoso, na primeira chamada de `tocar`. Chamar isto fora de um gesto não
 * quebra nada: o contexto nasce suspenso e o som simplesmente não sai.
 *
 * Volume baixo de propósito. Isto é um app de troca de cartas usado no ônibus,
 * não um jogo — o som é confirmação, não trilha.
 */

export type Som = 'clique' | 'deslize' | 'selo' | 'baralho' | 'fechou'

let contexto: AudioContext | null = null

function pegarContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!contexto) {
    const Contexto =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Contexto) return null
    contexto = new Contexto()
  }
  // O Safari devolve o contexto suspenso mesmo criado dentro do gesto.
  if (contexto.state === 'suspended') void contexto.resume()
  return contexto
}

/** Um envelope curto: sobe rápido, cai rápido, nunca estala. */
function envelope(
  ctx: AudioContext,
  inicio: number,
  duracao: number,
  volume: number,
): GainNode {
  const ganho = ctx.createGain()
  ganho.gain.setValueAtTime(0, inicio)
  ganho.gain.linearRampToValueAtTime(volume, inicio + 0.012)
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao)
  return ganho
}

/** Ruído branco — a matéria-prima do papel deslizando. */
function ruido(ctx: AudioContext, duracao: number): AudioBufferSourceNode {
  const amostras = Math.floor(ctx.sampleRate * duracao)
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate)
  const canal = buffer.getChannelData(0)
  for (let i = 0; i < amostras; i++) canal[i] = Math.random() * 2 - 1
  const fonte = ctx.createBufferSource()
  fonte.buffer = buffer
  return fonte
}

function tom(
  ctx: AudioContext,
  inicio: number,
  frequencia: number,
  duracao: number,
  volume: number,
  forma: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator()
  osc.type = forma
  osc.frequency.setValueAtTime(frequencia, inicio)
  const ganho = envelope(ctx, inicio, duracao, volume)
  osc.connect(ganho).connect(ctx.destination)
  osc.start(inicio)
  osc.stop(inicio + duracao + 0.02)
}

/** Um sopro de papel: ruído passando por um filtro que varre para cima. */
function sopro(
  ctx: AudioContext,
  inicio: number,
  duracao: number,
  volume: number,
  de: number,
  para: number,
): void {
  const fonte = ruido(ctx, duracao)
  const filtro = ctx.createBiquadFilter()
  filtro.type = 'bandpass'
  filtro.Q.value = 1.2
  filtro.frequency.setValueAtTime(de, inicio)
  filtro.frequency.exponentialRampToValueAtTime(para, inicio + duracao)
  const ganho = envelope(ctx, inicio, duracao, volume)
  fonte.connect(filtro).connect(ganho).connect(ctx.destination)
  fonte.start(inicio)
  fonte.stop(inicio + duracao + 0.02)
}

/**
 * Toca um dos sons. Silencioso e sem erro quando o navegador não deixa.
 *
 *   clique   — toque num controle: um blip seco, quase um estalo de plástico
 *   deslize  — a carta saindo da mão: sopro de papel subindo
 *   baralho  — várias cartas de uma vez: três sopros em sequência
 *   selo     — o carimbo do acordo: um baque grave com estalo em cima
 *   fechou   — a troca combinada: duas notas subindo, a única coisa musical
 */
export function tocar(som: Som, volume = 1): void {
  const ctx = pegarContexto()
  if (!ctx) return
  const agora = ctx.currentTime + 0.01

  switch (som) {
    case 'clique':
      tom(ctx, agora, 880, 0.05, 0.06 * volume, 'square')
      break

    case 'deslize':
      sopro(ctx, agora, 0.22, 0.05 * volume, 700, 2600)
      break

    case 'baralho':
      // Três cartas caindo uma sobre a outra, cada uma um tico mais aguda —
      // é o que a mão ouve ao separar as repetidas.
      for (let i = 0; i < 3; i++) {
        sopro(ctx, agora + i * 0.075, 0.12, 0.04 * volume, 600 + i * 250, 2200)
      }
      break

    case 'selo':
      // Baque de carimbo: corpo grave curto, com um estalo seco por cima.
      tom(ctx, agora, 120, 0.16, 0.16 * volume, 'sine')
      sopro(ctx, agora, 0.06, 0.07 * volume, 1800, 500)
      break

    case 'fechou':
      // As duas notas do acordo. Quinta justa, curta, sem reverberação: é um
      // "pronto", não uma fanfarra.
      tom(ctx, agora, 587.33, 0.14, 0.07 * volume, 'triangle')
      tom(ctx, agora + 0.1, 880, 0.22, 0.07 * volume, 'triangle')
      break
  }
}
