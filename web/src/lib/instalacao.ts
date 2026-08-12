/**
 * Instalação do app na tela de início — o que dá para saber e o que dá para
 * pedir.
 *
 * Não existe loja: quem instala é o navegador. E cada sistema faz isso de um
 * jeito — o Android manda um convite que o app pode disparar na hora, o iPhone
 * exige o caminho pelo menu Compartilhar do Safari e não avisa nada a ninguém.
 * Este módulo guarda essa diferença num lugar só, para a tela `/instalar` não
 * precisar adivinhar em qual dos dois mundos ela está.
 *
 * Os ouvintes são registrados na carga do módulo, e o módulo é importado no
 * `main.tsx`: o `beforeinstallprompt` chega logo depois da abertura da página,
 * bem antes de alguém navegar até `/instalar`, e quem assina tarde não recebe
 * nada — o evento não se repete por assinar depois.
 */

/**
 * O convite do Chrome. Não está na tipagem do DOM porque não é padrão de
 * ninguém além do próprio Chromium.
 */
interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let convite: EventoDeInstalacao | null = null
const ouvintes = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sem o `preventDefault` o Chrome desenha a própria barrinha de instalação
    // por cima do app. O convite passa a ser desta tela, que sabe explicar
    // antes de pedir.
    evento.preventDefault()
    convite = evento as EventoDeInstalacao
    avisar()
  })

  // Instalou por fora (pela barra de endereço, pelo menu): o convite guardado
  // aqui já não vale, e o botão que ele acende precisa sumir junto.
  window.addEventListener('appinstalled', () => {
    convite = null
    avisar()
  })
}

function avisar() {
  for (const ouvinte of ouvintes) ouvinte()
}

/** Assina a existência do convite. Devolve o cancelamento, para o React. */
export function assinarConvite(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

/** Há um convite guardado para disparar agora? */
export function temConvite(): boolean {
  return convite !== null
}

export type ResultadoConvite = 'aceito' | 'recusado' | 'indisponivel'

/**
 * Dispara o convite do Chrome.
 *
 * Tem de partir de um toque da pessoa, como o pedido de permissão do push. O
 * convite é de uso único — depois de mostrado, o mesmo evento não serve de novo,
 * e por isso ele é descartado antes mesmo da resposta: se a pessoa recusar, o
 * Chrome manda outro evento quando achar que é hora, e é esse novo que vale.
 */
export async function aceitarConvite(): Promise<ResultadoConvite> {
  if (!convite) return 'indisponivel'

  const evento = convite
  convite = null
  avisar()

  await evento.prompt()
  const { outcome } = await evento.userChoice
  return outcome === 'accepted' ? 'aceito' : 'recusado'
}

export type Sistema = 'ios' | 'android' | 'computador'

/**
 * Em que sistema esta pessoa está.
 *
 * Serve para ordenar a página, não para esconder nada: os dois caminhos ficam
 * escritos, porque metade das vezes alguém lê isto no computador para dizer ao
 * outro o que tocar no celular.
 */
export function sistema(): Sistema {
  if (typeof navigator === 'undefined') return 'computador'

  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // O iPad de 2019 para cá se apresenta como Mac. O que o denuncia é o toque:
  // Mac nenhum tem mais de um ponto de contato.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'computador'
}

/**
 * Está no iPhone, mas fora do Safari?
 *
 * Chrome, Firefox e Edge no iOS são o Safari por dentro, com outra casca — e a
 * casca não tem o "Adicionar à Tela de Início" no mesmo lugar, quando tem. A
 * instrução muda: antes de qualquer passo, abrir o endereço no Safari.
 */
export function precisaDoSafari(): boolean {
  return (
    sistema() === 'ios' && /crios|fxios|edgios|opios/i.test(navigator.userAgent)
  )
}

/**
 * O app está rodando instalado (tela de início / janela própria)?
 *
 * No iPhone é a condição para o push existir. No Android não é obrigatório, mas
 * continua sendo a resposta certa para "por que não aparece?".
 */
export function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // O Safari do iOS não implementa `display-mode`; ele tem esta bandeira.
    (navigator as { standalone?: boolean }).standalone === true
  )
}
