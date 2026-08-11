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
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { SeloRaridade } from '@/components/brutal/Cartas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import {
  type Acabamento,
  NORMAL,
  type PrecoEscolhido,
} from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import { type Carta, formatarPreco } from '@/lib/types'

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

/**
 * A marca do app: três cartas em leque com as setas da troca na da frente.
 *
 * Substitui o raio dentro do quadrado azul, que era herança do playmat e não
 * dizia nada sobre o produto — raio é velocidade, e o app não é sobre isso. As
 * cartas empilhadas e as duas setas dizem as duas coisas que ele é: cartas, e
 * cartas que trocam de mão.
 *
 * É uma `<img>` de `public/marca.svg`, e não um SVG copiado para cá. Marca
 * duplicada é marca que sai de sintonia: aquele arquivo é a fonte de que saem o
 * favicon e os ícones do PWA (`scripts/gerar-icones.mjs`), então trocar a marca
 * vira substituir um arquivo, não caçar cópias pelo projeto.
 *
 * A versão sem fundo, e não o `favicon.svg`: o favicon traz a marca sobre um
 * quadrado de papel porque precisa se sustentar sozinho numa aba ou numa gaveta
 * de apps. Aqui ela já está sobre o papel do app, e o quadrado seria uma
 * moldura em volta de nada.
 *
 * `alt` vazio e `aria-hidden` porque o letreiro "TrocaTCG" vem ao lado em texto:
 * anunciar as duas coisas faria o leitor de tela dizer o nome do app duas vezes.
 *
 * A arte é mais larga que alta (577×458). Quem usa passa **altura** e deixa a
 * largura em `auto` — `size-*`, que fixa as duas, achataria o leque.
 *
 * **No escuro ela troca de arquivo**, e quem troca é o CSS, pela classe
 * `marca-svg` (regra em `index.css`). Não é teimosia: o tema é um atributo que
 * pode viver no `<html>` — no app — ou num `<div>` no meio da página, que é como
 * o laboratório mostra claro e escuro lado a lado. Um hook de React não enxerga
 * um atributo posto acima dele por outro componente; o CSS enxerga. Escolher
 * aqui, em JavaScript, daria a marca certa no app e a errada no laboratório —
 * justamente onde ela está sendo julgada.
 */
export function MarcaTrocaTCG({ className }: { className?: string }) {
  return (
    <img src="/marca.svg" alt="" aria-hidden className={cn('marca-svg', className)} />
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

/**
 * Engrenagem — o botão de configurações do frame de perfil.
 *
 * O export do arquivo veio com arte de 100px dentro de uma caixa de 20, e o
 * `stroke-width: 2` daquele sistema de coordenadas viraria 0,4px na tela. O path
 * é o original; a espessura subiu para 7 para bater opticamente com os outros
 * ícones (2px numa caixa de 22). É a única correção, e ela é de escala.
 */
export function IconeEngrenagem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40.294 17.2374C40.5236 14.8221 41.6454 12.5792 43.4403 10.9469C45.2351 9.31453 47.5741 8.41 50.0002 8.41C52.4264 8.41 54.7654 9.31453 56.5602 10.9469C58.3551 12.5792 59.4769 14.8221 59.7065 17.2374C59.8445 18.7976 60.3563 20.3016 61.1987 21.6221C62.0411 22.9426 63.1892 24.0408 64.5459 24.8235C65.9026 25.6063 67.4279 26.0507 68.9927 26.1191C70.5576 26.1875 72.1158 25.878 73.5357 25.2166C75.7403 24.2156 78.2385 24.0708 80.544 24.8102C82.8495 25.5497 84.7974 27.1205 86.0087 29.217C87.2199 31.3135 87.6077 33.7856 87.0967 36.1523C86.5856 38.5189 85.2123 40.6108 83.244 42.0207C81.9622 42.9201 80.916 44.1149 80.1936 45.5042C79.4713 46.8934 79.0942 48.4362 79.0942 50.002C79.0942 51.5678 79.4713 53.1105 80.1936 54.4998C80.916 55.889 81.9622 57.0839 83.244 57.9832C85.2123 59.3932 86.5856 61.485 87.0967 63.8517C87.6077 66.2183 87.2199 68.6905 86.0087 70.787C84.7974 72.8834 82.8495 74.4542 80.544 75.1937C78.2385 75.9331 75.7403 75.7883 73.5357 74.7874C72.1158 74.126 70.5576 73.8164 68.9927 73.8848C67.4279 73.9532 65.9026 74.3976 64.5459 75.1804C63.1892 75.9632 62.0411 77.0613 61.1987 78.3818C60.3563 79.7023 59.8445 81.2063 59.7065 82.7666C59.4769 85.1818 58.3551 87.4247 56.5602 89.0571C54.7654 90.6894 52.4264 91.5939 50.0002 91.5939C47.5741 91.5939 45.2351 90.6894 43.4403 89.0571C41.6454 87.4247 40.5236 85.1818 40.294 82.7666C40.1563 81.2058 39.6444 79.7012 38.8018 78.3802C37.9591 77.0592 36.8105 75.9608 35.4533 75.1779C34.096 74.395 32.5701 73.9508 31.0047 73.8828C29.4394 73.8148 27.8807 74.1251 26.4607 74.7874C24.256 75.7883 21.7579 75.9331 19.4523 75.1937C17.1468 74.4542 15.1989 72.8834 13.9877 70.787C12.7765 68.6905 12.3886 66.2183 12.8997 63.8517C13.4107 61.485 14.784 59.3932 16.7523 57.9832C18.0341 57.0839 19.0804 55.889 19.8027 54.4998C20.525 53.1105 20.9021 51.5678 20.9021 50.002C20.9021 48.4362 20.525 46.8934 19.8027 45.5042C19.0804 44.1149 18.0341 42.9201 16.7523 42.0207C14.7868 40.6101 13.4159 38.519 12.9061 36.154C12.3963 33.7889 12.784 31.3188 13.9939 29.2237C15.2038 27.1286 17.1495 25.5581 19.4527 24.8176C21.7559 24.077 24.2523 24.2192 26.4565 25.2166C27.8763 25.878 29.4346 26.1875 30.9994 26.1191C32.5642 26.0507 34.0895 25.6063 35.4462 24.8235C36.8029 24.0408 37.951 22.9426 38.7934 21.6221C39.6358 20.3016 40.1477 18.7976 40.2857 17.2374M62.4969 50.0034C62.4969 56.907 56.9005 62.5034 49.9969 62.5034C43.0933 62.5034 37.4969 56.907 37.4969 50.0034C37.4969 43.0999 43.0933 37.5034 49.9969 37.5034C56.9005 37.5034 62.4969 43.0999 62.4969 50.0034Z"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconeSino({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.55563 17.5007C8.70192 17.754 8.91231 17.9644 9.16568 18.1107C9.41904 18.257 9.70644 18.334 9.99899 18.334C10.2915 18.334 10.5789 18.257 10.8323 18.1107C11.0857 17.9644 11.2961 17.754 11.4424 17.5007M2.71773 12.7719C2.60886 12.8913 2.53702 13.0397 2.51094 13.1991C2.48485 13.3585 2.50566 13.522 2.57081 13.6698C2.63597 13.8176 2.74268 13.9433 2.87795 14.0316C3.01322 14.1199 3.17122 14.1669 3.33274 14.1671H16.6664C16.8279 14.1671 16.9859 14.1202 17.1212 14.0321C17.2566 13.944 17.3634 13.8185 17.4288 13.6708C17.4941 13.5231 17.5151 13.3596 17.4892 13.2001C17.4634 13.0407 17.3917 12.8922 17.283 12.7728C16.1747 11.6302 14.9996 10.4159 14.9996 6.66642C14.9996 5.34023 14.4729 4.06835 13.5352 3.13059C12.5975 2.19283 11.3257 1.666 9.99955 1.666C8.67344 1.666 7.40164 2.19283 6.46394 3.13059C5.52624 4.06835 4.99944 5.34023 4.99944 6.66642C4.99944 10.4159 3.82359 11.6302 2.71773 12.7719Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconeMensagem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.6304 16.8798C19.9742 16.5359 20.1674 16.0696 20.1674 15.5834V4.58334C20.1674 4.09711 19.9742 3.63079 19.6304 3.28697C19.2865 2.94316 18.8202 2.75 18.3339 2.75H3.66608C3.17981 2.75 2.71346 2.94316 2.36961 3.28697C2.02577 3.63079 1.8326 4.09711 1.8326 4.58334V19.5122C1.83262 19.641 1.8708 19.7668 1.94232 19.8738C2.01384 19.9808 2.11549 20.0642 2.23441 20.1135C2.35334 20.1627 2.4842 20.1756 2.61044 20.1505C2.73669 20.1254 2.85266 20.0634 2.94369 19.9724L4.96235 17.9539C5.30611 17.6101 5.77239 17.4168 6.25862 17.4167H18.3339C18.8202 17.4167 19.2865 17.2236 19.6304 16.8798Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* -------------------------------------------------- ícones da navegação */

/**
 * Trocas. No arquivo é composto: duas setas de 10px dentro de uma caixa de 22,
 * uma no canto superior esquerdo e outra deslocada 10px nos dois eixos. As duas
 * apontam para lados opostos e não se tocam — é troca, não ida e volta.
 *
 * Reproduzo a composição com `translate` em vez de reescrever os paths num
 * sistema de coordenadas só: os `d` continuam sendo os do arquivo, e a
 * geometria é a mesma que o Figma desenha.
 */
export function IconeTrocas({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(2 2)">
        <path
          d="M5 2.083L2.083 5L5 7.917M2.083 5H7.917"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(10 10)">
        <path
          d="M2.083 5H7.917M5 7.917L7.917 5L5 2.083"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/**
 * Perfil. Asset do arquivo, path preservado.
 */
export function IconePessoa({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.4174 19.25V17.4167C17.4174 16.4442 17.031 15.5116 16.3433 14.8239C15.6556 14.1363 14.7229 13.75 13.7503 13.75H8.24969C7.27711 13.75 6.34438 14.1363 5.65666 14.8239C4.96895 15.5116 4.5826 16.4442 4.5826 17.4167V19.25M14.6671 6.41667C14.6671 8.44171 13.0253 10.0833 11 10.0833C8.97472 10.0833 7.33291 8.44171 7.33291 6.41667C7.33291 4.39162 8.97472 2.75 11 2.75C13.0253 2.75 14.6671 4.39162 14.6671 6.41667Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Minhas cartas — duas cartas empilhadas, uma atrás da outra.
 *
 * Este não veio do arquivo. O Figma usa um `card-sim`, que é o glifo de chip de
 * celular: num app de troca de cartas, a leitura errada é grande demais para o
 * ganho de fidelidade. Mantive o conceito que o app já tinha e redesenhei na
 * mesma língua dos outros — caixa de 22, traço de 2, ponta redonda, mesma
 * proporção de margem. Decisão do Eduardo.
 *
 * A carta de trás aparece só nos dois lados que a da frente não cobre: desenhar
 * o retângulo inteiro atrás deixaria um cruzamento visível no traço, e a 22px
 * isso vira sujeira.
 */
export function IconeCartasBrutal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Carta de trás: só o ombro esquerdo e o topo. */}
      <path
        d="M5.5 15.5H4.4C3.6 15.5 3 14.9 3 14.1V4.4C3 3.6 3.6 3 4.4 3H12.5C13.3 3 13.9 3.6 13.9 4.4V5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Carta da frente, inteira. */}
      <rect
        x="6.5"
        y="6.5"
        width="12.5"
        height="12.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Vitrine — o toldo da loja sobre o balcão.
 *
 * Também não veio do arquivo: a vitrine é tela nova e o Figma não a desenha.
 * Está na mesma língua dos outros — caixa de 22, traço de 2, ponta redonda —, e
 * o conceito é o do balcão, que é literalmente o fluxo que a tela reproduz:
 * olhar o que a loja tem exposto e apontar.
 *
 * Toldo e corpo em duas peças, sem cruzamento de traço: a 22px um X de linhas
 * grossas vira borrão.
 */
export function IconeVitrine({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* O toldo, com a ondulação das três faixas. */}
      <path
        d="M3 8.2 4.3 4.2C4.5 3.5 5.1 3 5.8 3h10.4c.7 0 1.3.5 1.5 1.2L19 8.2M3 8.2h16M3 8.2c0 1.2 1 2.2 2.2 2.2S7.4 9.4 7.4 8.2m0 0c0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2m0 0c0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* O corpo da loja, aberto embaixo do toldo. */}
      <path
        d="M4.6 10.8V19h12.8v-8.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* --------------------------------------------------------------- pokébola */

/**
 * Indicador de carregamento das telas que ainda não existem.
 *
 * Não veio do Figma — o arquivo não desenha estado de carregamento. Foi
 * construída no vocabulário dele: borda preta grossa, cor chapada, sem
 * gradiente e sem brilho. O vermelho é o do `log-out-button`, o único do
 * arquivo, e é o mesmo tom que a pokébola pede.
 *
 * O giro fica no CSS (`.pokebola-gira`) e não numa classe do Tailwind porque
 * precisa de `@keyframes` e da regra de `prefers-reduced-motion` junto — as
 * duas coisas moram no mesmo lugar ou alguém muda uma e esquece a outra.
 */
export function Pokebola({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn('pokebola-gira', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="pokebola-corpo">
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>
      <g clipPath="url(#pokebola-corpo)">
        <rect x="0" y="0" width="100" height="50" fill="var(--color-alerta)" />
        <rect x="0" y="50" width="100" height="50" fill="var(--color-cartela)" />
        <rect
          x="0"
          y="43"
          width="100"
          height="14"
          fill="var(--color-tinta)"
        />
      </g>
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="var(--color-tinta)"
        strokeWidth="7"
      />
      <circle
        cx="50"
        cy="50"
        r="14"
        fill="var(--color-cartela)"
        stroke="var(--color-tinta)"
        strokeWidth="7"
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
/** O que cada ponta carrega além da carta. Só o detalhe da troca passa isto. */
export interface LadoDaTrocaBrutal {
  acabamento?: Acabamento
  preco?: PrecoEscolhido
}

export function ParDeCartas({
  dou,
  recebo,
  rotulos = { dou: 'Sua', recebo: 'Dela' },
  tamanho = 'compacto',
  lados,
  trocado = false,
  selando = false,
}: {
  dou: Carta | undefined
  recebo: Carta | undefined
  /**
   * O tempo verbal dos dois rótulos.
   *
   * O feed não passa nada e fica com "Sua/Dela", que é o que cabe numa linha de
   * lista. O detalhe passa "Você dá/Você recebe" — e, quando a troca já
   * aconteceu ou já não vai acontecer, "Você deu" ou "Você daria". São três
   * tempos, e quem decide é o status da troca, não esta peça.
   */
  rotulos?: { dou: string; recebo: string }
  /**
   * `grande` no detalhe da troca: arte maior, nome em dois tamanhos acima, e as
   * informações que só ali importam — raridade, acabamento e preço. No feed
   * nada disso cabe, e mostrar seria disputar espaço com a decisão de abrir.
   */
  tamanho?: 'compacto' | 'grande'
  /**
   * Acabamento e preço de cada ponta. Vem por lado, e não por carta, porque as
   * duas coisas dependem do anúncio e não do catálogo: a mesma carta pode
   * aparecer numa troca como reverse e noutra como normal, com preços
   * diferentes.
   */
  lados?: { dou?: LadoDaTrocaBrutal; recebo?: LadoDaTrocaBrutal }
  /**
   * A troca aconteceu: cada carta já está do lado do novo dono.
   *
   * O lado esquerdo é você. Enquanto a troca está de pé, ele mostra o que você
   * vai entregar — o custo primeiro. Depois de concluída, mostra o que ficou
   * com você. Só CONCLUIDO troca de lado: numa furada ou expirada a carta não
   * saiu da mão de ninguém.
   */
  trocado?: boolean
  /**
   * A troca está sendo selada agora: as duas cartas dão uma volta sobre o eixo
   * vertical e assumem o lugar uma da outra.
   *
   * Só o detalhe da troca passa isto, e só no instante do aceite — é o momento
   * em que a troca passa a existir. Os quadros moram em `index.css`
   * (`troca-gira-*`), e não no motion, porque `rotateY` não anima por lá; a
   * história completa está no comentário daquele arquivo.
   */
  selando?: boolean
}) {
  const grande = tamanho === 'grande'

  // O lado segue a posse, não a posição.
  //
  // Quem carrega isso hoje é a etiqueta — azul de um lado, preta do outro.
  // Enquanto a troca está de pé, a minha é a que eu vou entregar; depois de
  // concluída, ela deixou de ser, e quem passou a ser minha é a que eu recebi.
  // Fixar o lado na carta que sai marcava de "meu" justamente a que não é mais,
  // ao lado de um rótulo dizendo "Você deu". Achado testando uma troca
  // concluída, e continua valendo agora que a posse mora só na etiqueta.
  const cartaQueSai = (
    <LadoDaTroca
      carta={dou}
      etiqueta={rotulos.dou}
      lado={trocado ? 'dele' : 'meu'}
      grande={grande}
      acabamento={lados?.dou?.acabamento}
      preco={lados?.dou?.preco}
      className={selando ? 'troca-anima troca-gira-a' : undefined}
    />
  )
  const cartaQueEntra = (
    <LadoDaTroca
      carta={recebo}
      etiqueta={rotulos.recebo}
      lado={trocado ? 'meu' : 'dele'}
      grande={grande}
      acabamento={lados?.recebo?.acabamento}
      preco={lados?.recebo?.preco}
      className={selando ? 'troca-anima troca-gira-b' : undefined}
    />
  )

  return (
    // Esticado, não alinhado.
    //
    // As duas colunas quase nunca têm o mesmo conteúdo — nome de duas linhas de
    // um lado, de uma só do outro; selo de acabamento aqui e não ali —, e antes
    // isso virava duas molduras de alturas diferentes lado a lado, o que lia
    // como defeito e não como informação. `items-stretch` iguala as duas pela
    // mais alta; o `min-h` do nome, lá embaixo, faz a mais alta ser sempre a
    // mesma. Uma coisa sem a outra não resolve: sem o `min-h`, duas cartas de
    // nome curto encolhem as duas molduras juntas e o par muda de tamanho de
    // uma troca para a seguinte.
    <div
      // O vão e o tamanho da seta são declarados aqui e lidos pelas animações
      // em `index.css`: o caminho de uma carta até o lugar da outra é a largura
      // dela mais a seta mais os dois vãos. Enquanto forem as mesmas variáveis,
      // a carta para exatamente no lugar da outra, em qualquer tela.
      style={{
        ['--troca-vao' as string]: '0.5rem',
        ['--troca-seta' as string]: '2rem',
      }}
      className={cn(
        'flex items-stretch gap-[var(--troca-vao)]',
        // Enquanto sela, as cartas andam para fora da própria coluna; sem isto
        // a página ganha uma barra de rolagem horizontal no meio da cena.
        selando && 'overflow-hidden',
      )}
    >
      {trocado ? cartaQueEntra : cartaQueSai}
      {/* A seta fica fora das duas molduras, sobre o vão: ela é a relação entre
          elas, não propriedade de nenhuma. No tamanho grande ela desce para o
          meio das artes, que é onde o eixo da troca realmente está.

          Ela sai de cena enquanto a troca sela: parada, a seta é quem diz que
          aquilo é uma troca; em movimento, quem diz é o movimento — e ela vira
          um obstáculo atravessado pelas duas cartas. */}
      <span
        className={cn(
          'grid size-[var(--troca-seta)] shrink-0 place-items-center rounded-[16px] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]',
          // Com a fileira esticando, a seta precisa dizer onde fica: ela tem
          // altura fixa e não estica junto, então sem isto encostaria no topo.
          // No compacto, o meio da moldura; no grande, a altura das artes, que
          // é onde o eixo da troca realmente está.
          grande ? 'mt-16 self-start' : 'self-center',
          'transition-all duration-150',
          selando && 'scale-50 opacity-0',
        )}
      >
        <IconeSetaDireita className="size-4 text-tinta" />
      </span>
      {trocado ? cartaQueSai : cartaQueEntra}
    </div>
  )
}

function LadoDaTroca({
  carta,
  etiqueta,
  lado,
  grande = false,
  acabamento,
  preco,
  className,
}: {
  carta: Carta | undefined
  etiqueta: string
  lado: 'meu' | 'dele'
  grande?: boolean
  acabamento?: Acabamento
  preco?: PrecoEscolhido
  /** Classes da selagem, quando a troca está sendo fechada. */
  className?: string
}) {
  const valor = formatarPreco(preco?.preco)
  const classe = cn(
    // As duas molduras na mesma cor, e a cor é a do papel — a que era do lado
    // da outra pessoa. Decisão do Eduardo, vendo as duas rodando: o azul-claro
    // em ambas puxava o par inteiro para uma mancha fria; o papel deixa a arte
    // da carta ser a única cor forte ali dentro, que é o que se veio ver.
    // No escuro isso ainda ganha um segundo efeito: o papel é mais escuro que a
    // cartela, então a moldura afunda em vez de flutuar, e as duas artes ficam
    // sobre o tom mais fundo da tela.
    'flex min-w-0 flex-1 flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-papel p-2',
    // Teto no compacto. Sem ele, numa coluna larga — o histórico do perfil —
    // as duas cartas incham até ocupar a linha inteira e cada troca vira meia
    // tela. No feed a célula já é estreita e o teto não muda nada; era por
    // isso que o defeito não aparecia lá. A peça antiga tinha o mesmo limite.
    !grande && 'max-w-32',
    carta && 'transition-shadow hover:shadow-[var(--shadow-duro-xs)]',
    className,
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
        // `cartela`, e não `papel`: a moldura em volta virou papel também, e
        // dois papéis um dentro do outro deixariam o vão da carta que falta
        // indistinguível do fundo dela.
        <div className="aspect-[2.5/3.5] rounded-[var(--radius-imagem)] border-2 border-tinta bg-cartela" />
      )}

      <span className="flex min-w-0 flex-col gap-0.5">
        {/* Duas linhas para o nome — sempre duas, nem mais nem menos.
            No celular cada lado da troca tem ~107px, e em uma linha só
            "Mega Dragonite ex" vira "Mega Dragon…" — que é onde mora a
            diferença entre uma carta e outra. Numa troca de duas cartas
            parecidas, o nome cortado deixa as duas idênticas na tela.
            O `line-clamp` segura o teto em duas.

            O `min-h` é o piso, e existe pelo motivo oposto: "Mew ex" cabe
            numa linha, e sem o piso a moldura dele nascia mais baixa que a
            do vizinho de nome comprido. Duas cartas lado a lado com alturas
            diferentes leem como erro de alinhamento, não como "um nome é
            maior que o outro". `2lh` é literalmente "duas linhas desta
            entrelinha": muda junto com o `text-` de cada tamanho, sem
            número mágico para envelhecer. */}
        <span
          className={cn(
            'line-clamp-2 min-h-[2lh] font-titulo leading-tight font-bold text-tinta',
            grande ? 'text-[17px] lg:text-[19px]' : 'text-[14px]',
          )}
        >
          {carta?.nome_pt ?? carta?.nome_en ?? '—'}
        </span>
        {/* A linha de baixo continua em uma: é qualificador, e o nome já
            ganhou o espaço que faltava. */}
        <span className="truncate font-dado text-[11px] font-medium text-apagado">
          {carta?.set_sigla ?? carta?.set_nome ?? carta?.set_code}
          {carta?.numero && ` • ${carta.numero}`}
        </span>

        {/* Só no detalhe. Numa linha de feed, raridade e acabamento competiriam
            com a única decisão daquela tela, que é abrir a troca. Aqui são o
            que a pessoa confere antes de topar: é a reverse ou a normal? é a
            ilustração rara ou a comum? */}
        {/* `max-w-full` no invólucro, não só no selo.
            O `self-start` faz este span medir pelo conteúdo, e o
            `max-w-full` de dentro do `SeloRaridade` passa a resolver contra
            essa largura — que é o próprio texto. Resultado: "Ilustração Rara
            Especial" atravessava a borda da carta no celular. O teto tem de
            estar aqui, onde ainda se refere à coluna. */}
        {grande && carta?.raridade && (
          <span className="mt-1 max-w-full min-w-0 self-start">
            <SeloRaridade raridade={carta.raridade} />
          </span>
        )}

        {/* Normal não vira selo: é o acabamento da maioria das cartas e
            repeti-lo em toda troca gastaria destaque com o que não distingue.
            Reverse, Poké Ball e companhia mudam o que está sendo trocado — e
            mudam o preço — então precisam ser vistos sem ler a linha de baixo. */}
        {grande && acabamento && acabamento.id !== NORMAL && (
          <span
            title={acabamento.nome_pt}
            className="mt-1 self-start rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-cartela px-1.5 py-0.5 font-dado text-[10px] font-bold uppercase text-tinta"
          >
            {acabamento.nome_curto}
          </span>
        )}

        {grande && valor && (
          <span className="mt-1 font-dado text-[12px] font-bold text-azul">
            {valor}
            {!preco?.exato && <span aria-hidden> ~</span>}
          </span>
        )}
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

/* ------------------------------------------------------------- par de lotes */

/** Uma carta dentro de um lado da proposta. */
export interface CartaDoLote {
  chave: string
  carta: Carta | undefined
  condicao?: string
  acabamento?: Acabamento
  /** O anúncio ainda está no ar. Falso pinta a carta de caducada. */
  disponivel?: boolean
}

/**
 * O par de cartas quando cada lado pode ter mais de uma — a proposta.
 *
 * Mesma peça do feed de trocas, esticada: duas colunas frente a frente, a seta
 * no vão entre elas, azul-claro do lado de quem olha e papel do lado de lá. A
 * `ParDeCartas` não serve aqui porque ela é 1×1 por desenho (uma troca sugerida
 * é sempre uma carta por uma), e proposta é multi-item desde o schema: se B quer
 * duas cartas de A, elas vão na mesma proposta.
 *
 * Empilhar as cartas dentro de cada coluna, em vez de fazer uma grade solta com
 * rótulos de texto, é o que mantém a leitura da troca de pé: o eixo é
 * horizontal — o que sai da minha mão de um lado, o que entra do outro — e é a
 * seta no meio que diz isso sem nenhuma palavra.
 */
export function ParDeLotes({
  dou,
  recebo,
  rotulos = { dou: 'Sua', recebo: 'Dela' },
  tamanho = 'compacto',
  limite,
}: {
  dou: CartaDoLote[]
  recebo: CartaDoLote[]
  rotulos?: { dou: string; recebo: string }
  tamanho?: 'compacto' | 'grande'
  /** Quantas cartas cada coluna mostra antes de resumir o resto em "+N". */
  limite?: number
}) {
  const grande = tamanho === 'grande'
  const semMovimento = useReducedMotion()

  return (
    <div className="flex items-start gap-2">
      <LadoDoLote
        itens={dou}
        etiqueta={rotulos.dou}
        lado="meu"
        grande={grande}
        limite={limite}
      />
      {/* A seta desce até a altura da primeira arte — o eixo da troca está nas
          cartas, não na etiqueta que as nomeia.

          No detalhe ela entra deslizando da esquerda: é o gesto da troca
          acontecendo, e ali há uma proposta por tela. Na lista fica parada — vinte
          setas deslizando ao mesmo tempo viram um enxame, e a lista existe para
          ser varrida, não assistida. */}
      <motion.span
        initial={grande && !semMovimento ? { x: -6, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[16px] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]',
          grande ? 'mt-20' : 'mt-12',
        )}
      >
        <IconeSetaDireita className="size-4 text-tinta" />
      </motion.span>
      <LadoDoLote
        itens={recebo}
        etiqueta={rotulos.recebo}
        lado="dele"
        grande={grande}
        limite={limite}
      />
    </div>
  )
}

function LadoDoLote({
  itens,
  etiqueta,
  lado,
  grande,
  limite,
}: {
  itens: CartaDoLote[]
  etiqueta: string
  lado: 'meu' | 'dele'
  grande: boolean
  limite?: number
}) {
  const visiveis = limite ? itens.slice(0, limite) : itens
  const restantes = itens.length - visiveis.length

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta p-2',
        lado === 'meu' ? 'bg-meu' : 'bg-papel',
        !grande && 'max-w-40',
      )}
    >
      <span
        className={cn(
          'self-start rounded-[var(--radius-etiqueta)] px-2 py-0.5 font-dado text-[10px] font-bold uppercase',
          lado === 'meu' ? 'bg-azul text-azul-tinta' : 'bg-tinta text-cartela',
        )}
      >
        {etiqueta}
      </span>

      {visiveis.length === 0 && (
        <span className="py-4 text-center font-dado text-[11px] uppercase text-apagado">
          nada
        </span>
      )}

      {visiveis.map((item) => (
        <CartaDoLoteNaTela key={item.chave} item={item} grande={grande} />
      ))}

      {restantes > 0 && (
        <span className="font-dado text-[11px] font-bold text-apagado">
          + {restantes} carta{restantes > 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

function CartaDoLoteNaTela({
  item,
  grande,
}: {
  item: CartaDoLote
  grande: boolean
}) {
  const { carta, acabamento, condicao } = item
  // `disponivel` ausente quer dizer "não se pergunta" — é o caso da lista, onde
  // a carta não está em negociação. Só o `false` explícito pinta a caducada.
  const foraDoAr = item.disponivel === false

  const conteudo = (
    <>
      {carta ? (
        <CartaThumb
          carta={carta}
          className={cn(
            'rounded-[var(--radius-imagem)] border-2 border-tinta',
            foraDoAr && 'opacity-50',
          )}
        />
      ) : (
        <div className="aspect-[2.5/3.5] animate-pulse rounded-[var(--radius-imagem)] border-2 border-tinta bg-cartela" />
      )}

      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            'line-clamp-2 font-titulo leading-tight font-bold text-tinta',
            grande ? 'text-[16px] lg:text-[18px]' : 'text-[13px]',
          )}
        >
          {carta?.nome_pt ?? carta?.nome_en ?? '—'}
        </span>
        <span className="truncate font-dado text-[11px] font-medium text-apagado">
          {carta?.set_sigla ?? carta?.set_nome ?? carta?.set_code}
          {carta?.numero && ` • ${carta.numero}`}
        </span>

        {/* Condição e acabamento andam juntos e só aparecem no grande: são o que
            se confere antes de topar a troca — é a reverse ou a normal?, está
            NM ou jogada? —, e numa linha de lista disputariam com a decisão de
            abrir. Normal fica de fora: é a impressão da maioria e repeti-la
            gastaria destaque com o que não distingue. */}
        {grande && (condicao || acabamento) && (
          <span className="mt-0.5 font-dado text-[11px] uppercase text-apagado">
            {condicao}
            {acabamento &&
              acabamento.id !== NORMAL &&
              ` · ${acabamento.nome_curto}`}
          </span>
        )}

        {foraDoAr && (
          <span className="mt-0.5 font-dado text-[10px] font-bold uppercase text-alerta">
            fora do ar
          </span>
        )}
      </span>
    </>
  )

  const classe = cn(
    'flex min-w-0 flex-col gap-1.5',
    carta && 'transition-opacity hover:opacity-90',
  )

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
