import { api } from '@/lib/api'

/**
 * Web Push — ligar e desligar o aviso no sistema, deste navegador.
 *
 * Três coisas precisam ser verdade ao mesmo tempo para existir push: o
 * navegador suporta, a origem é segura (https ou localhost) e a pessoa deu
 * permissão. Nenhuma delas é suposição segura — no iPhone a primeira só vale
 * com o app instalado na tela de início, e por isso as funções daqui devolvem
 * estado em vez de estourar.
 *
 * A chave pública VAPID vem do ambiente de build, como a URL da API. Ela é
 * pública por desenho: é o que o navegador guarda para reconhecer quem tem
 * direito de mandar aviso para aquela inscrição. A privada nunca sai do Render.
 */

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/** O que a inscrição vira no corpo da API — o formato do `toJSON()` nativo. */
interface InscricaoJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Este navegador é capaz de receber push?
 *
 * `PushManager` ausente é o caso do Safari em aba no iPhone: lá o service
 * worker existe, o push não. É a diferença que obriga a tela a falar em
 * "instalar o app" em vez de "permitir notificações".
 */
export function suportaPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(CHAVE_PUBLICA)
  )
}

/**
 * O app está rodando instalado (tela de início / janela própria)?
 *
 * No iPhone é a condição para o push existir. No Android não é obrigatório,
 * mas continua sendo a resposta certa para "por que não aparece?".
 */
export function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // O Safari do iOS não implementa `display-mode`; ele tem esta bandeira.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export type EstadoPush = 'indisponivel' | 'negado' | 'desligado' | 'ligado'

/**
 * Em que pé está o aviso neste navegador.
 *
 * `negado` é um beco: uma vez recusada, a permissão não pode ser pedida de
 * novo por código — só nas configurações do sistema. A tela precisa dizer isso
 * em vez de oferecer um botão que não faz nada.
 */
export async function estadoAtual(): Promise<EstadoPush> {
  if (!suportaPush()) return 'indisponivel'
  if (Notification.permission === 'denied') return 'negado'

  const registro = await navigator.serviceWorker.getRegistration()
  const inscricao = await registro?.pushManager.getSubscription()
  return inscricao ? 'ligado' : 'desligado'
}

/**
 * Pede a permissão, inscreve no serviço de push e registra na API.
 *
 * Tem de ser chamada de dentro de um toque da pessoa: os navegadores recusam
 * `Notification.requestPermission()` fora de gesto do usuário.
 */
export async function ligar(): Promise<EstadoPush> {
  if (!suportaPush()) return 'indisponivel'

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') {
    return permissao === 'denied' ? 'negado' : 'desligado'
  }

  // `ready` e não `getRegistration`: logo depois de abrir o app o worker pode
  // ainda estar instalando, e inscrever num registro pela metade falha.
  const registro = await navigator.serviceWorker.ready
  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Sem isto o Chrome recusa a inscrição: ele exige que todo push mostre
      // notificação visível, e é exatamente o que este app faz.
      userVisibleOnly: true,
      applicationServerKey: base64ParaBytes(CHAVE_PUBLICA),
    }))

  await api.post('/me/push-subscription', inscricao.toJSON() as InscricaoJSON)
  return 'ligado'
}

/**
 * Desliga aqui, e só aqui.
 *
 * Apaga dos dois lados — do navegador e do banco. Fazer só um dos dois deixaria
 * a API mandando aviso para uma inscrição que ninguém escuta, ou o navegador
 * recebendo de uma linha que a tela jura ter apagado.
 */
export async function desligar(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.getRegistration()
  const inscricao = await registro?.pushManager.getSubscription()
  if (!inscricao) return 'desligado'

  const dados = inscricao.toJSON() as InscricaoJSON
  await inscricao.unsubscribe()
  // Depois do `unsubscribe`, e não antes: se a chamada falhar, o aparelho já
  // parou de receber — o contrário deixaria a pessoa achando que desligou.
  await api.del('/me/push-subscription', dados)
  return 'desligado'
}

/**
 * A chave VAPID em base64url vira os bytes que o `subscribe` espera.
 *
 * O navegador quer o ponto da curva cru, não texto; e base64url troca `+/` por
 * `-_` e corta o preenchimento, que o `atob` exige de volta.
 */
function base64ParaBytes(base64url: string): ArrayBuffer {
  const preenchimento = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + preenchimento).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(base64)
  // O buffer é criado explicitamente, e não por `new Uint8Array(n)`: o tipo do
  // atalho é `ArrayBufferLike`, que abre a porta para `SharedArrayBuffer` e não
  // serve onde a API do navegador pede `BufferSource`.
  const buffer = new ArrayBuffer(bruto.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return buffer
}
