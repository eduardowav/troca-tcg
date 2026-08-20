import { Component, type ReactNode, useEffect, useState } from 'react'

import { AcaoSecundaria, BotaoBrutal, Selo } from '@/components/brutal/Pecas'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { capturarErro } from '@/lib/erros'

/**
 * A tela de quando algo dá errado — no mundo do app, não no do navegador.
 *
 * Até aqui cada tela improvisava a própria: um `<p>` cinza dizendo "não deu
 * para carregar", e o `FalhaAoCarregar` do `RotaProtegida` ainda escrito com os
 * tokens do playmat, que a migração deixou para trás. O resultado é que o pior
 * momento do app — aquele em que a pessoa não sabe se a culpa é dela, da
 * internet ou de nós — era o único sem desenho nenhum.
 *
 * **Três motivos, e a diferença entre eles é a única coisa que a pessoa quer
 * saber.** Sem internet ela mexe no wi-fi; servidor fora ela espera; app
 * quebrado ela recarrega. Uma mensagem genérica ("erro inesperado") faz as três
 * pessoas tentarem a coisa errada.
 *
 * **Nada aqui culpa quem está lendo.** "Verifique sua conexão" quando o servidor
 * caiu é mentira que manda a pessoa procurar defeito na casa dela.
 */

export type Motivo = 'offline' | 'servidor' | 'quebrou'

const TEXTOS: Record<
  Motivo,
  { selo: string; titulo: string; corpo: string; acao: string }
> = {
  offline: {
    selo: 'Sem internet',
    titulo: 'Seu aparelho está sem conexão.',
    corpo:
      'O que você já tinha aberto continua aqui — o app guarda as telas por que passou. Para ver trocas novas, precisa de internet.',
    acao: 'Tentar de novo',
  },
  servidor: {
    selo: 'Fora do ar',
    titulo: 'O servidor não respondeu.',
    corpo:
      'Não é o seu aparelho e não é a sua internet: o problema é do nosso lado. Costuma voltar sozinho em alguns minutos.',
    acao: 'Tentar de novo',
  },
  quebrou: {
    selo: 'Erro',
    titulo: 'Alguma coisa quebrou por aqui.',
    corpo:
      'A tela não conseguiu se montar. Recarregar resolve na maioria das vezes; se insistir, me avise pelo contato do rodapé dos termos.',
    acao: 'Recarregar',
  },
}

/**
 * De que tipo é este erro.
 *
 * A ordem importa: aparelho sem rede vence qualquer coisa, porque nesse estado
 * nenhuma chamada ia dar certo mesmo — inclusive as que voltariam 500 se
 * tivessem chegado ao servidor.
 */
export function motivoDoErro(erro: unknown): Motivo {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline'
  }
  if (erro instanceof ApiError) {
    // `status 0` é o fetch que nem saiu (DNS, TLS, servidor recusando conexão);
    // 5xx é o servidor tendo respondido que não consegue. Os dois são "fora do
    // ar" para quem está do lado de cá.
    if (erro.status === 0 || erro.status >= 500) return 'servidor'
  }
  return 'quebrou'
}

export function Falha({
  motivo = 'servidor',
  onTentar,
  compacta,
  className,
}: {
  motivo?: Motivo
  /** Sem isto, o botão recarrega a página inteira. */
  onTentar?: () => void
  /**
   * Dentro de uma tela que já existe — a lista que não carregou, com o
   * cabeçalho e a navegação em volta. Ocupa o vão da lista em vez da tela
   * inteira, e o emblema encolhe: ali a moldura do app já diz onde a pessoa
   * está, e um bloco de altura de tela empurraria isso tudo para fora da vista.
   */
  compacta?: boolean
  className?: string
}) {
  const texto = TEXTOS[motivo]
  const online = useOnline()

  // Voltou a internet: o botão deixa de ser uma aposta e passa a ser um
  // caminho. A tentativa não é automática de propósito — recarregar sozinho
  // debaixo do dedo de quem está lendo é o tipo de esperteza que assusta.
  const voltou = motivo === 'offline' && online

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-xl flex-col items-center justify-center text-center',
        compacta ? 'py-12' : 'min-h-[70dvh] px-6',
        className,
      )}
    >
      {/* `role="alert"` e não `status`: isto interrompe o que a pessoa estava
          fazendo, e o leitor de tela precisa anunciar na hora. O desenho é
          `aria-hidden` — quem carrega o recado é o texto. */}
      <div role="alert" className="flex flex-col items-center">
        <Emblema motivo={motivo} compacta={compacta} />

        <span className={compacta ? 'mt-5' : 'mt-7'}>
          <Selo>{voltou ? 'Conexão de volta' : texto.selo}</Selo>
        </span>

        <h1
          className={cn(
            compacta ? 'mt-4 text-[18px]' : 'mt-5 text-[22px]',
            'font-titulo leading-[1.15] font-black text-balance text-tinta',
          )}
        >
          {voltou ? 'A internet voltou.' : texto.titulo}
        </h1>
        <p className="mt-2.5 max-w-sm font-corpo text-[14px] leading-relaxed text-apagado">
          {voltou
            ? 'Seu aparelho está conectado de novo. Toque para carregar o que faltava.'
            : texto.corpo}
        </p>

        <button
          type="button"
          onClick={() => (onTentar ? onTentar() : window.location.reload())}
          className="group mt-7"
        >
          <BotaoBrutal>{texto.acao}</BotaoBrutal>
        </button>

        {/* Uma saída lateral, para quem chegou aqui numa tela específica e só
            quer sair dela. Em erro de rede ela não promete nada: se a internet
            caiu, o feed também não vai carregar — por isso só aparece quando o
            problema é do app. */}
        {/* Esta tela foi a primeira a trocar o link azul pela etiqueta de
            borda, e por um tempo foi a única — o desenho morava aqui, escrito à
            mão. Hoje ele é `AcaoSecundaria` e vale para todo link solto do app;
            ver o comentário da peça em `brutal/Pecas.tsx`. */}
        {motivo === 'quebrou' && (
          <AcaoSecundaria to="/matches" className="mt-5">
            Ir para as trocas
          </AcaoSecundaria>
        )}
      </div>
    </div>
  )
}

/** O aparelho está conectado? Reage a cair e a voltar. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const ligou = () => setOnline(true)
    const caiu = () => setOnline(false)
    window.addEventListener('online', ligou)
    window.addEventListener('offline', caiu)
    return () => {
      window.removeEventListener('online', ligou)
      window.removeEventListener('offline', caiu)
    }
  }, [])

  return online
}

/**
 * O emblema de cada motivo.
 *
 * Mesma peça em todos: quadrado de borda grossa com sombra dura, como as
 * cartelas do resto do app. O que muda é o desenho dentro — tomada solta para
 * "sem internet", torre para "servidor", carta rasgada para "quebrou". Sem
 * pokébola: ela gira nas telas em desenvolvimento e é indicador de carregamento
 * (ver DESIGN.md), e aqui nada está carregando.
 *
 * O `alerta-fraco` só entra em "quebrou": vermelho neste mundo é o que não tem
 * volta, e ficar sem internet tem volta assim que o wi-fi voltar.
 */
function Emblema({ motivo, compacta }: { motivo: Motivo; compacta?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid place-items-center rounded-[var(--radius-cartela)]',
        compacta ? 'size-14' : 'size-20',
        'border-2 border-tinta shadow-[var(--shadow-duro)]',
        motivo === 'quebrou' ? 'bg-alerta-fraco text-alerta' : 'bg-cartela text-tinta',
      )}
    >
      {motivo === 'offline' && <DesenhoSemSinal compacta={compacta} />}
      {motivo === 'servidor' && <DesenhoServidor compacta={compacta} />}
      {motivo === 'quebrou' && <DesenhoCartaRasgada compacta={compacta} />}
    </span>
  )
}

/** Ondas de sinal cortadas pela barra — o vocabulário universal de "sem rede". */
function DesenhoSemSinal({ compacta }: { compacta?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={compacta ? 'size-7' : 'size-10'}
    >
      <path d="M3 4.5 20.5 20" />
      <path d="M4.5 9.5a15 15 0 0 1 4-2.4" />
      <path d="M19.5 9.5a15 15 0 0 0-6.6-2.9" />
      <path d="M7.6 13.1a10 10 0 0 1 2.2-1.2" />
      <path d="M16.5 13.2a10 10 0 0 0-2-1.1" />
      <circle cx="12" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Duas gavetas empilhadas com a luzinha — como se desenha servidor. */
function DesenhoServidor({ compacta }: { compacta?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={compacta ? 'size-7' : 'size-10'}
    >
      <rect x="3" y="4.5" width="18" height="6.5" rx="2" />
      <rect x="3" y="13" width="18" height="6.5" rx="2" />
      <path d="M7 7.75h.01M7 16.25h.01" />
      <path d="M14 7.75h3M14 16.25h3" />
    </svg>
  )
}

/** Uma carta partida ao meio: o que quebrou é do app, não da rede. */
function DesenhoCartaRasgada({ compacta }: { compacta?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={compacta ? 'size-7' : 'size-10'}
    >
      <path d="M10.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.5" />
      <path d="M13.5 3H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4.5" />
      <path d="M12 3l-1.5 4 3 3-3 3 1.5 4-1.5 4" />
    </svg>
  )
}

/**
 * O limite de erro do app inteiro.
 *
 * Sem ele, uma exceção durante a renderização deixa a tela **em branco** — o
 * React desmonta a árvore e não põe nada no lugar. Tela branca é o pior desfecho
 * possível: não diz o que houve, não oferece saída, e some com o app sem
 * explicação.
 *
 * Classe porque o React só oferece `componentDidCatch` assim; é o único
 * componente de classe do projeto, e é por isso.
 *
 * Erro de renderização não é erro de rede: quem chega aqui é bug nosso, e o
 * motivo é sempre `quebrou`. Falha de API não sobe até aqui — ela é tratada
 * pelas telas, que sabem o que estavam pedindo.
 */
export class LimiteDeErro extends Component<
  { children: ReactNode },
  { quebrou: boolean }
> {
  state = { quebrou: false }

  static getDerivedStateFromError() {
    return { quebrou: true }
  }

  componentDidCatch(erro: unknown, info: unknown) {
    // O console fica, e não é redundância: na máquina de quem desenvolve não há
    // DSN, e ali ele é o painel inteiro.
    console.error('[TrocaTCG] erro de renderização', erro, info)
    // E o painel de verdade, quando existe. Este é o erro que mais precisava
    // dele: quebra de renderização acontece no celular de outra pessoa, que vê
    // a carta rasgada, recarrega e segue — sem deixar rastro nenhum aqui.
    capturarErro(erro, { componente: info })
  }

  render() {
    if (!this.state.quebrou) return this.props.children
    return <Falha motivo="quebrou" />
  }
}
