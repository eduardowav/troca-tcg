import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { LockupTrocaTCG } from '@/components/brutal/Pecas'
import { useConviteDeInstalacao } from '@/hooks/useInstalacao'
import {
  aceitarConvite,
  estaInstalado,
  precisaDoSafari,
  sistema,
  type Sistema,
} from '@/lib/instalacao'

/**
 * "Baixar o app" — a página que precisa existir porque não existe loja.
 *
 * Quem ouve falar de um app procura a App Store, não acha nada e conclui que o
 * app não existe. O TrocaTCG é um PWA: quem instala é o navegador, e o caminho
 * é diferente em cada sistema — e escondido em ambos. Daí uma página com a
 * palavra que a pessoa vai procurar ("baixar") e o passo a passo dos dois.
 *
 * **No iPhone isto deixou de ser divulgação.** Desde o Web Push, instalar é a
 * condição para o aviso chegar: no Safari em aba o `PushManager` não existe, e
 * nenhuma proposta prestes a vencer vai vibrar o celular de ninguém. É por isso
 * que Configurações manda para cá quem ainda não instalou, e é por isso que
 * essa consequência aparece logo no começo, e não como detalhe no rodapé.
 *
 * Pública de propósito: o link é para colar no grupo, e quem chega por ele
 * ainda não tem conta.
 *
 * Os passos são numerados e cada um traz o **glifo** que a pessoa vai procurar
 * na tela — o quadrado com a seta do Compartilhar, os três pontos do Chrome.
 * Nome do menu sem o desenho obriga a caçar; é o desenho que a pessoa reconhece
 * em meio segundo. Estes glifos moram aqui e não em `Pecas.tsx` porque não são
 * do TrocaTCG: são de outros sistemas, desenhados na língua deste mundo (traço
 * de 2px, `currentColor`) só para serem reconhecidos.
 */
export default function Instalar() {
  const instalado = estaInstalado()
  const meuSistema = sistema()

  return (
    <div className="mx-auto w-full max-w-xl px-6 pb-20">
      <header className="pt-10">
        <Link to="/">
          <LockupTrocaTCG />
        </Link>

        <h1 className="mt-8 font-titulo text-[32px] leading-[1.05] font-black text-balance text-tinta lg:text-[38px]">
          Baixar o TrocaTCG
        </h1>
        <p className="mt-4 font-corpo text-[16px] leading-relaxed text-apagado">
          Não procure na loja de aplicativos: o TrocaTCG não está lá, e não
          precisa estar. Ele se instala pelo próprio navegador, em três toques, e
          depois abre igual a qualquer outro app — com ícone na tela de início e
          sem a barra de endereço em cima.
        </p>
      </header>

      {instalado ? <JaInstalado /> : <PorQueInstalar />}

      {/* Os dois caminhos ficam escritos mesmo com o sistema detectado. Metade
          das vezes alguém abre isto no computador para dizer ao outro o que
          tocar no celular — e um detector errado numa página de ajuda deixa a
          pessoa sem a única instrução que ela veio buscar. O detectado vem
          primeiro e diz que é o dela. */}
      <div className="mt-14 flex flex-col gap-12">
        {ordenar(meuSistema).map((qual) => (
          <Bloco key={qual} qual={qual} meuSistema={meuSistema} />
        ))}
      </div>

      <footer className="mt-14 border-t-2 border-dashed border-tinta/25 pt-6">
        <p className="font-dado text-[11px] uppercase text-apagado">
          Não deu certo? Escreva para{' '}
          <a
            href="mailto:eduardowav@icloud.com"
            className="text-tinta underline underline-offset-2"
          >
            eduardowav@icloud.com
          </a>
        </p>
      </footer>
    </div>
  )
}

/** O sistema de quem está lendo vem primeiro; os outros dois seguem na ordem. */
function ordenar(meu: Sistema): Sistema[] {
  const todos: Sistema[] = ['ios', 'android', 'computador']
  return [meu, ...todos.filter((s) => s !== meu)]
}

/**
 * Para quem já instalou, a página inteira seria instrução para uma coisa já
 * feita. Ela vira confirmação e um caminho para a frente — que é o aviso, o
 * motivo de a maioria chegar aqui.
 */
function JaInstalado() {
  return (
    <section className="mt-8 rounded-[var(--radius-cartela)] border-2 border-tinta bg-meu p-5 shadow-[var(--shadow-duro)]">
      <h2 className="font-titulo text-[18px] font-black text-tinta">
        O app já está instalado neste aparelho
      </h2>
      <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
        Você está lendo isto de dentro do app instalado. Se o aviso de troca
        ainda não chega, o interruptor está em Configurações — e ele precisa de
        um toque seu, o navegador não deixa o app ligar sozinho.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/configuracoes"
          className="flex h-11 items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-4 font-titulo text-[14px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro-xs)] transition-shadow hover:shadow-[var(--shadow-duro)]"
        >
          Ligar os avisos
        </Link>
        <Link
          to="/app"
          className="flex h-11 items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 font-titulo text-[14px] font-black uppercase text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          Ir para as trocas
        </Link>
      </div>
    </section>
  )
}

/**
 * Três motivos, e o primeiro é o que fez esta página virar necessidade em vez
 * de divulgação. Nenhum promete o que o app não faz: o precache existe, então a
 * terceira linha é verdade; e a ressalva do iPhone está na própria primeira.
 */
function PorQueInstalar() {
  return (
    <section className="mt-8 rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela p-5 shadow-[var(--shadow-duro)]">
      <h2 className="font-titulo text-[18px] font-black text-tinta">
        Por que instalar
      </h2>
      <ul className="mt-3 flex flex-col gap-2.5 font-corpo text-[15px] leading-relaxed text-apagado">
        <li>
          <strong className="font-semibold text-tinta">
            O aviso chega com o app fechado.
          </strong>{' '}
          Proposta nova, troca aceita, prazo vencendo. No iPhone,{' '}
          <strong className="font-semibold text-tinta">
            instalar é a única forma
          </strong>{' '}
          de o aviso chegar — no Safari em aba o sistema não entrega nenhum.
        </li>
        <li>
          <strong className="font-semibold text-tinta">Abre como app.</strong>{' '}
          Ícone junto dos outros, tela inteira, sem barra de endereço.
        </li>
        <li>
          <strong className="font-semibold text-tinta">
            Não ocupa espaço de app.
          </strong>{' '}
          São alguns megabytes de cache, e o que você já viu continua abrindo com
          a internet ruim.
        </li>
      </ul>
    </section>
  )
}

function Bloco({ qual, meuSistema }: { qual: Sistema; meuSistema: Sistema }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-titulo text-[22px] leading-none font-black text-tinta">
          {TITULOS[qual]}
        </h2>
        {qual === meuSistema && (
          <span className="rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu px-2 py-0.5 font-dado text-[10px] font-bold uppercase text-tinta">
            É o seu
          </span>
        )}
      </div>

      {qual === 'ios' && <PassosIOS />}
      {qual === 'android' && <PassosAndroid />}
      {qual === 'computador' && <PassosComputador />}
    </section>
  )
}

const TITULOS: Record<Sistema, string> = {
  ios: 'No iPhone e no iPad',
  android: 'No Android',
  computador: 'No computador',
}

function PassosIOS() {
  // A checagem é de user agent, então erra em casos de borda (um Safari pedindo
  // site de computador, por exemplo). Por isso o aviso é uma nota acima dos
  // passos, e não uma troca do conteúdo: quem estiver no Safari lê uma linha
  // que não se aplica; quem estiver no Chrome sem ela não acharia o menu.
  const foraDoSafari = precisaDoSafari()

  return (
    <>
      {foraDoSafari && (
        <p className="mt-3 rounded-[var(--radius-controle)] border-2 border-ambar bg-ambar-fraco px-4 py-3 font-corpo text-[14px] leading-relaxed text-ambar">
          Você está em outro navegador. No iPhone, só o Safari instala o app:
          abra este mesmo endereço nele antes de seguir os passos.
        </p>
      )}

      <ol className="mt-4 flex flex-col gap-3">
        <Passo numero={1} glifo={<GlifoCompartilhar />}>
          <strong className="font-semibold text-tinta">
            Toque em Compartilhar
          </strong>{' '}
          — este quadradinho com a seta para cima, na barra de baixo do Safari.
          Se a barra tiver sumido, role a página para cima que ela volta.
        </Passo>
        <Passo numero={2} glifo={<GlifoMaisNoQuadrado />}>
          Role a lista e toque em{' '}
          <strong className="font-semibold text-tinta">
            “Adicionar à Tela de Início”
          </strong>
          . Ela fica na segunda metade do menu, depois das opções de
          compartilhamento.
        </Passo>
        <Passo numero={3} glifo={<GlifoTelaDeInicio />}>
          Confirme em{' '}
          <strong className="font-semibold text-tinta">“Adicionar”</strong>, no
          canto de cima. O ícone do TrocaTCG aparece junto dos seus apps — e é
          por ele que você abre daqui para a frente.
        </Passo>
      </ol>

      <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
        Depois de instalado, abra o app pelo ícone e ligue os avisos em
        Configurações. Enquanto você usar pelo Safari em aba, o iPhone não
        entrega aviso nenhum — não é ajuste que falte, é o sistema.
      </p>
    </>
  )
}

function PassosAndroid() {
  const temConvite = useConviteDeInstalacao()
  const [instalando, setInstalando] = useState(false)

  return (
    <>
      {/* O botão só existe quando o Chrome ofereceu o convite. Um botão fixo
          "Instalar" que não faz nada em metade dos aparelhos seria pior que a
          ausência dele — e os passos abaixo continuam valendo em qualquer
          caso, inclusive quando o convite não veio. */}
      {temConvite && (
        <button
          type="button"
          disabled={instalando}
          onClick={async () => {
            setInstalando(true)
            try {
              const resultado = await aceitarConvite()
              if (resultado === 'aceito') {
                toast.success('Instalado. Abra o TrocaTCG pelo ícone.')
              }
            } catch {
              toast.error(
                'O navegador não abriu a instalação. Dá para instalar pelo menu, logo abaixo.',
              )
            } finally {
              setInstalando(false)
            }
          }}
          className="mt-4 flex h-13 w-full items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta bg-azul font-titulo text-[15px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform] hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-45"
        >
          {instalando ? 'Abrindo…' : 'Instalar agora'}
        </button>
      )}

      <ol className="mt-4 flex flex-col gap-3">
        <Passo numero={1} glifo={<GlifoTresPontos />}>
          No Chrome, toque nos{' '}
          <strong className="font-semibold text-tinta">três pontinhos</strong> do
          canto de cima.
        </Passo>
        <Passo numero={2} glifo={<GlifoBaixar />}>
          Toque em{' '}
          <strong className="font-semibold text-tinta">“Instalar app”</strong>.
          Em versões mais antigas ele se chama “Adicionar à tela inicial”.
        </Passo>
        <Passo numero={3} glifo={<GlifoTelaDeInicio />}>
          Confirme em{' '}
          <strong className="font-semibold text-tinta">“Instalar”</strong>. O
          ícone vai para a tela inicial e para a gaveta de apps.
        </Passo>
      </ol>

      <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
        No Android o aviso funciona mesmo sem instalar, mas some junto com o
        navegador se você limpar as abas. Instalado, ele fica.
      </p>
    </>
  )
}

function PassosComputador() {
  return (
    <>
      <ol className="mt-4 flex flex-col gap-3">
        <Passo numero={1} glifo={<GlifoBaixar />}>
          No Chrome ou no Edge, procure o{' '}
          <strong className="font-semibold text-tinta">ícone de instalar</strong>{' '}
          na ponta direita da barra de endereço.
        </Passo>
        <Passo numero={2} glifo={<GlifoTelaDeInicio />}>
          Confirme em{' '}
          <strong className="font-semibold text-tinta">“Instalar”</strong>. O
          TrocaTCG passa a abrir em janela própria.
        </Passo>
      </ol>

      <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
        O app é feito para o celular — é lá que a troca é combinada e é lá que o
        aviso chega. No computador ele funciona, e o Safari do Mac não instala.
      </p>
    </>
  )
}

/**
 * Um passo: número, glifo e a frase.
 *
 * Mesma peça do "Como funciona" da home — número em selo azul sobre a moldura
 * clara —, com o glifo do sistema no lugar do ícone do app. A numeração se
 * justifica pelo mesmo motivo de lá: aqui é sequência de verdade, e fora de
 * ordem nenhum dos passos existe.
 */
function Passo({
  numero,
  glifo,
  children,
}: {
  numero: number
  glifo: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex gap-3 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-4 shadow-[var(--shadow-duro-xs)]">
      <span className="relative grid size-10 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu text-tinta">
        {glifo}
        <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border-2 border-tinta bg-azul font-dado text-[10px] font-bold text-azul-tinta">
          {numero}
        </span>
      </span>
      <span className="min-w-0 font-corpo text-[14px] leading-relaxed text-apagado">
        {children}
      </span>
    </li>
  )
}

/* --------------------------------------------------------------------------
   Glifos dos outros sistemas.

   Decorativos para o leitor de tela (`aria-hidden`): o que eles mostram já está
   escrito na frase ao lado, e um rótulo aqui leria duas vezes a mesma coisa.
   -------------------------------------------------------------------------- */

/** Compartilhar, do iOS: a caixa aberta em cima com a seta saindo. */
function GlifoCompartilhar() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M7 11v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9" />
      <path d="M12 15V3" />
      <path d="M8.5 6.5 12 3l3.5 3.5" />
    </svg>
  )
}

/** "Adicionar à Tela de Início": o quadrado com o mais dentro. */
function GlifoMaisNoQuadrado() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}

/** O menu do Chrome no Android: três pontos em pé. */
function GlifoTresPontos() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

/** Instalar: a seta entrando na bandeja, como o ícone da barra de endereço. */
function GlifoBaixar() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M12 3v11" />
      <path d="M8 10.5 12 14.5l4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

/** O fim do caminho: o celular com o ícone do app já lá. */
function GlifoTelaDeInicio() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <rect x="9.5" y="7" width="5" height="5" rx="1.5" fill="currentColor" />
      <path d="M10 18h4" />
    </svg>
  )
}
