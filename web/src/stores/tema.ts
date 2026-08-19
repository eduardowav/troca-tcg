import { create } from 'zustand'

/**
 * O tema do app: claro, escuro, ou o que o sistema pedir.
 *
 * **Três estados e não um interruptor.** "Sistema" é o padrão porque quem põe o
 * celular no escuro à noite espera que os apps acompanhem, e porque um
 * interruptor de dois estados obriga a pessoa a escolher uma vez e viver com a
 * escolha o dia inteiro. Quem quiser fixar, fixa.
 *
 * O valor escolhido mora em `localStorage`, e não no perfil do servidor: é
 * preferência do aparelho, não da pessoa. O mesmo usuário pode querer escuro no
 * celular e claro no computador, e uma ida ao banco antes da primeira pintura
 * garantiria a piscada que o script do `index.html` existe para evitar.
 */
export type Tema = 'claro' | 'escuro' | 'sistema'

export const CHAVE = 'troca:tema'

interface TemaState {
  /** O que a pessoa escolheu — inclui "sistema", que não é um visual. */
  tema: Tema
  /**
   * O que está valendo na tela agora.
   *
   * Mora no estado, e não é calculado na hora por quem pergunta, por causa de
   * quem está em "sistema": ali `tema` não muda quando o celular vira a noite,
   * então um componente que só lesse `tema` não re-renderizaria e ficaria
   * mostrando o interruptor na posição errada sobre uma tela já escura.
   */
  efetivo: 'claro' | 'escuro'
}

function guardado(): Tema {
  const valor = localStorage.getItem(CHAVE)
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema'
}

const escuroNoSistema = window.matchMedia('(prefers-color-scheme: dark)')

/** O tema que vale agora, já resolvido — "sistema" não é um visual, é um modo. */
function resolvido(tema: Tema): 'claro' | 'escuro' {
  if (tema === 'sistema') return escuroNoSistema.matches ? 'escuro' : 'claro'
  return tema
}

/**
 * Pinta o `<html>`.
 *
 * O atributo vai na raiz, e não numa rota, pelo mesmo motivo do `data-mundo`: o
 * fundo da página e a barra de navegação são irmãos da rota, não filhos dela.
 * Sem isto, a tela ficaria escura dentro de uma moldura clara.
 *
 * A `theme-color` acompanha porque ela pinta a barra de status do celular
 * quando o app está instalado. Errada, ela é a única faixa clara no topo de uma
 * tela escura — e é a primeira coisa que se vê ao abrir.
 */
function aplicar(tema: Tema) {
  const efetivo = resolvido(tema)
  const raiz = document.documentElement

  if (efetivo === 'escuro') raiz.dataset.tema = 'escuro'
  else delete raiz.dataset.tema

  // Os dois espelham `--color-papel` de cada tema, e o claro virou bege em
  // 2026-08-19. Ficam em hexadecimal cravado, e não lidos do CSS, porque isto
  // roda antes da primeira pintura — mas por isso mesmo precisam ser trocados
  // junto com o token, aqui e no `index.html`.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', efetivo === 'escuro' ? '#171717' : '#F4EEE4')

  useTema.setState({ efetivo })
}

export const useTema = create<TemaState>(() => {
  const tema = guardado()
  return { tema, efetivo: resolvido(tema) }
})

export function definirTema(tema: Tema) {
  if (tema === 'sistema') localStorage.removeItem(CHAVE)
  else localStorage.setItem(CHAVE, tema)

  useTema.setState({ tema })
  aplicar(tema)
}

// Quem está em "sistema" acompanha a troca sem recarregar — o celular muda de
// tema sozinho no horário programado, e o app estar aberto na hora não pode ser
// o motivo de ele ficar para trás.
escuroNoSistema.addEventListener('change', () => {
  if (useTema.getState().tema === 'sistema') aplicar('sistema')
})

// O script do `index.html` já pintou a raiz antes desta linha rodar. Aplicar de
// novo aqui não pisca nada e cobre o caso de o script ter sido pulado — e é o
// que mantém a `theme-color` em dia, que ele não toca.
aplicar(useTema.getState().tema)
