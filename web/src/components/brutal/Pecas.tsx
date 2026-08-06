/**
 * Peças do mundo neobrutalista, tiradas do Figma "TrocaTCG — Design".
 *
 * Vivem numa pasta própria, e não dentro de `components/ui`, porque durante a
 * migração os dois mundos coexistem: as telas que ainda estão no playmat usam
 * `Button`, `Campo` e companhia, e misturar as duas famílias no mesmo diretório
 * faria alguém importar a peça errada sem perceber. Quando a última tela migrar,
 * estas sobem para `ui/` e as antigas saem.
 *
 * Nada aqui inventa valor: cada cor, raio, sombra e tamanho de texto veio de um
 * nó do arquivo. Se faltar um tom, ele vem do frame que precisa dele — não de
 * um vizinho plausível.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { cn } from '@/lib/cn'
import type { Carta } from '@/lib/types'

/* ------------------------------------------------------------------ ícones */

/**
 * Glifos do Lucide, exportados do próprio arquivo do Figma.
 *
 * Os paths são os originais, byte a byte. A única mudança é o `stroke`, que no
 * export vinha fixo (`#0038FF` na estrela, `black` na seta, `white` no refresh)
 * e aqui vira `currentColor` — assim a peça que usa o ícone decide a cor, que é
 * como o resto do projeto já trata ícone. A geometria, essa, não se mexe.
 */
export function IconeEstrela({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.86073 1.03946C5.81876 1.06551 5.78491 1.10278 5.763 1.14705L4.6085 3.48655C4.53235 3.64068 4.41989 3.77401 4.28079 3.87504C4.14169 3.97608 3.98013 4.0418 3.81 4.06655L1.2275 4.44405C1.17835 4.451 1.13214 4.47161 1.09414 4.50354C1.05613 4.53547 1.02786 4.57743 1.01254 4.62464C0.997218 4.67186 0.995466 4.72242 1.00748 4.77058C1.0195 4.81874 1.0448 4.86256 1.0805 4.89705L2.9485 6.71555C3.0718 6.83562 3.16405 6.98389 3.21727 7.14757C3.27049 7.31125 3.2831 7.48541 3.254 7.65505L2.8135 10.2245C2.80493 10.2734 2.81024 10.3237 2.82883 10.3697C2.84742 10.4156 2.87854 10.4555 2.91865 10.4847C2.95876 10.5138 3.00625 10.5312 3.05573 10.5347C3.1052 10.5382 3.15467 10.5278 3.1985 10.5045L5.507 9.29055C5.65914 9.21066 5.82841 9.16892 6.00025 9.16892C6.17209 9.16892 6.34136 9.21066 6.4935 9.29055L8.8025 10.5045C8.84635 10.5279 8.89588 10.5384 8.94543 10.535C8.99499 10.5315 9.04258 10.5142 9.08277 10.485C9.12296 10.4559 9.15414 10.4159 9.17275 10.3699C9.19136 10.3238 9.19664 10.2735 9.188 10.2245L8.747 7.65455C8.71803 7.48499 8.7307 7.31094 8.78392 7.14736C8.83714 6.98379 8.92931 6.8356 9.0525 6.71555L10.9205 4.89655C10.9559 4.86202 10.981 4.81828 10.9928 4.77026C11.0046 4.72225 11.0028 4.67188 10.9875 4.62485C10.9722 4.57782 10.9441 4.53601 10.9062 4.50415C10.8684 4.47228 10.8224 4.45164 10.7735 4.44455L8.1905 4.06655C8.02056 4.0416 7.85922 3.9758 7.72031 3.87477C7.58141 3.77375 7.46909 3.64053 7.393 3.48655L6.238 1.14705C6.21609 1.10278 6.18224 1.06551 6.14027 1.03946C6.09831 1.01341 6.0499 0.9996 6.0005 0.9996C5.9511 0.9996 5.90269 1.01341 5.86073 1.03946Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconeRaio({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.31061 9.23139C2.41745 9.29847 2.54112 9.33384 2.66727 9.33341H7.33341C7.44123 9.33306 7.54753 9.35888 7.64319 9.40864C7.73885 9.45841 7.82101 9.53064 7.88262 9.61915C7.94423 9.70765 7.98346 9.80978 7.99694 9.91678C8.01042 10.0238 7.99774 10.1324 7.96 10.2335L6.68015 14.247C6.6601 14.3199 6.66543 14.3975 6.69526 14.467C6.72509 14.5365 6.77765 14.5937 6.84431 14.6294C6.91097 14.6651 6.98778 14.677 7.06212 14.6632C7.13646 14.6495 7.20391 14.6109 7.25342 14.5537L13.8527 7.75332C13.9321 7.65534 13.9822 7.53682 13.997 7.41153C14.0118 7.28623 13.9908 7.15931 13.9363 7.04551C13.8819 6.9317 13.7962 6.83568 13.6894 6.76861C13.5826 6.70153 13.4589 6.66616 13.3327 6.66659H8.66659C8.55877 6.66694 8.45247 6.64112 8.35681 6.59136C8.26115 6.54159 8.17899 6.46936 8.11738 6.38085C8.05577 6.29235 8.01654 6.19022 8.00306 6.08322C7.98958 5.97623 8.00226 5.86756 8.04 5.76653L9.31985 1.75296C9.3399 1.68006 9.33457 1.6025 9.30474 1.53302C9.27491 1.46354 9.22235 1.40627 9.15569 1.37061C9.08903 1.33494 9.01222 1.32301 8.93788 1.33676C8.86354 1.35051 8.79609 1.38913 8.74658 1.44628L2.14732 8.24668C2.06785 8.34466 2.01781 8.46318 2.00301 8.58847C1.9882 8.71377 2.00925 8.84069 2.0637 8.95449C2.11815 9.0683 2.20377 9.16432 2.31061 9.23139Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconeSetaDireita({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.3328 8H12.6672M8 12.6672L12.6672 8L8 3.3328"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconeTrocar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.75 7C1.75 5.60761 2.30312 4.27226 3.28769 3.28769C4.27226 2.30312 5.60761 1.75 7 1.75C8.46769 1.75552 9.87643 2.32821 10.9317 3.34833L12.25 4.66667M9.33333 4.66667H12.25V1.75M12.25 7C12.25 8.39239 11.6969 9.72774 10.7123 10.7123C9.72774 11.6969 8.39239 12.25 7 12.25C5.53231 12.2445 4.12357 11.6718 3.06833 10.6517L1.75 9.33333M1.75 12.25V9.33333H4.66667"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ----------------------------------------------------------------- cartela */

/**
 * A superfície que se levanta do papel: branca, borda preta de 2px e sombra
 * dura deslocada 4px. Os três andam juntos — sombra sem borda vira mancha, e
 * borda sem sombra devolve a cartela para o plano do fundo.
 */
export function Cartela({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- selo */

/**
 * Selo de estado, no canto do cabeçalho da troca.
 *
 * No Figma ele é sempre branco com borda preta. Aqui ganha um segundo tom: a
 * lista tem quatro estados e um deles — "falta você" — é o único em que a
 * pessoa precisa agir. Pintar os quatro igual devolveria o problema que o feed
 * antigo já tinha resolvido, com a linha acionável pesando o mesmo que o aviso
 * de espera. O tom `acao` usa o mesmo azul da ação primária, que é o vocabulário
 * do arquivo para "aqui se clica".
 */
export function Selo({
  children,
  tom = 'neutro',
}: {
  children: ReactNode
  tom?: 'neutro' | 'acao'
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border-2 border-tinta px-2.5 py-1 font-dado text-[11px] font-bold uppercase whitespace-nowrap',
        tom === 'acao' ? 'bg-azul text-azul-tinta' : 'bg-cartela text-tinta',
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------- par de cartas */

/**
 * As duas cartas de uma troca, com a seta no meio.
 *
 * O lado de quem olha tem fundo azul-claro e etiqueta azul; o lado do outro tem
 * fundo papel e etiqueta preta. É a única cor de região do mundo novo, e ela
 * carrega a informação mais importante da tela: qual das duas cartas sai da sua
 * mão.
 *
 * A moldura é 2,5×3,5 — em pé —, e não o 4:3 deitado do arquivo. O mock usava
 * recortes de ilustração; o catálogo real são scans de carta inteira, e cortá-los
 * numa faixa horizontal apaga nome, número e borda, que é justamente o que
 * identifica a carta. Decisão do Eduardo, tomada olhando as duas opções.
 */
export function ParDeCartas({
  dou,
  recebo,
}: {
  dou: Carta | undefined
  recebo: Carta | undefined
}) {
  return (
    <div className="flex items-center gap-2">
      <LadoDaTroca carta={dou} etiqueta="Sua" lado="meu" />
      {/* A seta fica fora das duas molduras, sobre o vão: ela é a relação entre
          elas, não propriedade de nenhuma. */}
      <span className="grid size-8 shrink-0 place-items-center rounded-[16px] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]">
        <IconeSetaDireita className="size-4 text-tinta" />
      </span>
      <LadoDaTroca carta={recebo} etiqueta="Dela" lado="dele" />
    </div>
  )
}

function LadoDaTroca({
  carta,
  etiqueta,
  lado,
}: {
  carta: Carta | undefined
  etiqueta: string
  lado: 'meu' | 'dele'
}) {
  const classe = cn(
    'flex min-w-0 flex-1 flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta p-2',
    lado === 'meu' ? 'bg-meu' : 'bg-papel',
    carta && 'transition-shadow hover:shadow-[var(--shadow-duro-xs)]',
  )

  const conteudo = (
    <>
      <span
        className={cn(
          'self-start rounded-[var(--radius-etiqueta)] px-2 py-0.5 font-dado text-[10px] font-bold uppercase',
          lado === 'meu' ? 'bg-azul text-azul-tinta' : 'bg-tinta text-cartela',
        )}
      >
        {etiqueta}
      </span>

      {carta ? (
        <CartaThumb
          carta={carta}
          className="rounded-[var(--radius-imagem)] border-2 border-tinta"
        />
      ) : (
        <div className="aspect-[2.5/3.5] rounded-[var(--radius-imagem)] border-2 border-tinta bg-papel" />
      )}

      <span className="flex min-w-0 flex-col gap-0.5">
        {/* Duas linhas para o nome, não uma.
            No celular cada lado da troca tem ~107px, e em uma linha só
            "Mega Dragonite ex" vira "Mega Dragon…" — que é onde mora a
            diferença entre uma carta e outra. Numa troca de duas cartas
            parecidas, o nome cortado deixa as duas idênticas na tela.
            O `line-clamp` segura em duas e ainda evita que um nome
            comprido empurre a cartela. */}
        <span className="line-clamp-2 font-titulo text-[14px] leading-tight font-bold text-tinta">
          {carta?.nome_pt ?? carta?.nome_en ?? '—'}
        </span>
        {/* A linha de baixo continua em uma: é qualificador, e o nome já
            ganhou o espaço que faltava. */}
        <span className="truncate font-dado text-[11px] font-medium text-apagado">
          {carta?.set_sigla ?? carta?.set_nome ?? carta?.set_code}
          {carta?.numero && ` • ${carta.numero}`}
        </span>
      </span>
    </>
  )

  // Cada carta abre a própria página. Sem carta carregada não há para onde ir,
  // e aí a moldura continua sendo uma caixa — link para lugar nenhum é pior do
  // que ausência de link.
  return carta ? (
    <Link to={`/carta/${carta.id}`} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  )
}

/* ------------------------------------------------------------------- botão */

/**
 * Ação primária: azul chapado, borda preta, sombra dura de 3px.
 *
 * A sombra cresce no hover e some no `:active`, com o botão descendo os mesmos
 * 3px — é o gesto que o mundo neobrutalista usa no lugar de escurecer a cor, e
 * faz a peça parecer física. São 3px sem animação de entrada, então não há o que
 * desligar em `prefers-reduced-motion`.
 *
 * Recebe `to`: este é o botão que abre a troca, e link que navega tem de ser
 * âncora — não `div` com `onClick`. Sem `to`, vira `<span>`, para quem já está
 * dentro de um link (o estado vazio embrulha o botão num `Link` próprio).
 */
export function BotaoBrutal({
  children,
  to,
  className,
}: {
  children: ReactNode
  to?: string
  className?: string
}) {
  const classe = cn(
    'inline-flex items-center gap-1.5 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-5 py-2.5',
    'font-titulo text-[14px] font-extrabold uppercase text-azul-tinta',
    'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
    'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
    className,
  )

  // Dois ramos escritos à mão, e não `const Peca = to ? Link : 'span'`: com
  // componente em variável o TypeScript não estreita o tipo das props, e o
  // `to?: string` bate de frente com o `to: To` obrigatório do `Link`.
  return to ? (
    <Link to={to} className={classe}>
      {children}
    </Link>
  ) : (
    <span className={classe}>{children}</span>
  )
}
