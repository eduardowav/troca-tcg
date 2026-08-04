import { motion } from 'motion/react'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { SeloPreco } from '@/components/carta/GradeDeCartas'
import { IconeTroca } from '@/components/ui/Icone'
import {
  type Acabamento,
  NORMAL,
  type PrecoEscolhido,
} from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import { type Carta, codigoSet, nomeCarta } from '@/lib/types'

const ROTULOS_PADRAO = { dou: 'Você dá', recebo: 'Você recebe' }

/** O que cada ponta da linha carrega além da carta. */
export interface LadoDaTroca {
  acabamento?: Acabamento
  preco?: PrecoEscolhido
}

/**
 * A linha de troca: o que sai de você, o que chega até você.
 *
 * É o coração visual do produto — a hora em que a troca deixa de ser abstrata.
 * Por isso as duas cartas aparecem de frente uma para a outra, com a direção
 * explícita no meio: dar e receber são coisas diferentes e precisam ler
 * diferente, daí as cores de Ofereço e Procuro em cada ponta.
 */
export function LinhaDeTroca({
  dou,
  recebo,
  lados,
  tamanho = 'compacto',
  rotulos = ROTULOS_PADRAO,
  selando = false,
  trocado = false,
}: {
  dou?: Carta
  recebo?: Carta
  /**
   * Acabamento e preço de cada ponta.
   *
   * Vem por lado, e não por carta, porque as duas coisas dependem do anúncio e
   * não do catálogo: a mesma carta pode aparecer numa troca como reverse e
   * noutra como normal, com preços diferentes. Quem tem essa informação é a tela
   * que carregou o match. O feed não passa nada e continua mostrando só as artes.
   */
  lados?: { dou?: LadoDaTroca; recebo?: LadoDaTroca }
  tamanho?: 'compacto' | 'grande'
  /**
   * O tempo verbal dos dois rótulos.
   *
   * O histórico precisa disto: "você dá" sobre uma troca concluída semana
   * passada está errado, e sobre uma que expirou sem acontecer está errado duas
   * vezes. Quem mostra troca em aberto não passa nada.
   */
  rotulos?: { dou: string; recebo: string }
  /**
   * A troca acabou de fechar pelos dois lados — toca a selagem uma vez.
   *
   * É o único instante do produto em que a métrica-mãe sobe, e até aqui ele
   * passava como um toast cinza. Não é enfeite: é o retorno do gesto que o app
   * inteiro existe para provocar.
   */
  selando?: boolean
  /**
   * A troca aconteceu: cada carta já está do lado do novo dono.
   *
   * O lado esquerdo é você. Enquanto a troca está de pé, ele mostra o que você
   * vai entregar — o custo primeiro. Depois de concluída, mostra o que ficou com
   * você. As duas leituras são verdadeiras nos seus momentos, e a travessia das
   * cartas durante a selagem é a passagem de uma para a outra.
   *
   * Só CONCLUIDO troca de lado. Furada e expirada continuam como estavam: nelas
   * a carta não saiu da mão de ninguém.
   */
  trocado?: boolean
}) {
  const grande = tamanho === 'grande'

  return (
    // Alinhado pelo topo, não pelo centro: as duas colunas quase nunca têm a
    // mesma altura — nome de duas linhas de um lado, selo de acabamento do
    // outro — e centralizar fazia uma carta subir e a outra descer, sem que
    // nada nelas justificasse o degrau. Pelo topo, o rótulo e a arte de cada
    // lado começam na mesma linha e o que sobra fica embaixo, que é onde o
    // olho já espera diferença.
    <div className="relative flex items-start gap-3">
      <Lado
        carta={dou}
        rotulo={rotulos.dou}
        cor="offer"
        grande={grande}
        alinhamento={trocado ? 'start' : 'end'}
        ordem={trocado ? 3 : 1}
        animar={selando}
        acabamento={lados?.dou?.acabamento}
        preco={lados?.dou?.preco}
      />

      {/* O trilho sai de cena durante a selagem: a marca ocupa o lugar dele, e
          é a mesma ideia dita de outro jeito. Os dois ao mesmo tempo, no mesmo
          eixo, viram sobreposição de dois desenhos parecidos. */}
      <Direcao grande={grande} atenuado={selando} />

      <Lado
        carta={recebo}
        rotulo={rotulos.recebo}
        cor="want"
        grande={grande}
        alinhamento={trocado ? 'end' : 'start'}
        ordem={trocado ? 1 : 3}
        animar={selando}
        // Passa por cima na travessia: duas cartas cruzando no mesmo eixo sem
        // ordem de profundidade lêem como uma piscando dentro da outra.
        naFrente
        acabamento={lados?.recebo?.acabamento}
        preco={lados?.recebo?.preco}
      />

      {selando && <Selagem />}
    </div>
  )
}

/**
 * A selagem: o trilho acordando.
 *
 * A referência que o Eduardo mandou resolve o momento com setas atravessando as
 * duas cartas e uma marca no fim. Aqui elas não são desenho novo — são o mesmo
 * trilho que separa as duas pontas desde sempre, nas mesmas cores de Ofereço e
 * Procuro, fazendo pela primeira vez o que ele sempre representou parado: uma
 * carta indo, outra vindo. Fecha com o ícone de troca do próprio app.
 *
 * Fica por cima de tudo e não recebe evento: é comentário sobre a tela, não
 * parte dela. `aria-hidden` porque quem usa leitor de tela recebe a notícia pelo
 * toast e pelo painel de "troca concluída" — repetir em enfeite é ruído.
 */
function Selagem() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <Rastro sentido="direita" />
      <Rastro sentido="esquerda" />
      <span className="marca-troca absolute top-1/2 left-1/2 grid size-13 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[color-mix(in_oklab,var(--color-offer)_50%,transparent)] bg-surface text-offer shadow-[0_0_28px_-4px_var(--color-offer)]">
        <IconeTroca className="size-7" />
      </span>
    </div>
  )
}

/**
 * Três divisas percorrendo a linha. O atraso entre elas é o que vira rastro.
 *
 * Cada uma ocupa a largura toda da linha e caminha por `transform`, não por
 * `left`. Parece detalhe e não é: animar `left` obriga o navegador a recalcular
 * layout a cada quadro, e era isso que fazia a passagem tremer. `transform`
 * roda no compositor e não toca no layout.
 */
function Rastro({ sentido }: { sentido: 'direita' | 'esquerda' }) {
  const paraDireita = sentido === 'direita'
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'absolute inset-x-0 flex',
            paraDireita
              ? 'rastro-direita top-[30%] text-offer'
              : 'rastro-esquerda top-[62%] justify-end text-want',
          )}
          style={{ animationDelay: `${i * 110}ms` }}
        >
          <Divisa invertida={!paraDireita} />
        </span>
      ))}
    </>
  )
}

function Divisa({ invertida }: { invertida?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-7 w-4', invertida && 'scale-x-[-1]')}
    >
      <path d="m2.5 3 6.5 7-6.5 7" />
    </svg>
  )
}

function Lado({
  carta,
  rotulo,
  cor,
  grande,
  alinhamento,
  ordem,
  animar,
  naFrente,
  acabamento,
  preco,
}: {
  carta?: Carta
  rotulo: string
  cor: 'offer' | 'want'
  grande: boolean
  alinhamento: 'start' | 'end'
  /** Posição no flex. Trocar isto é o que faz as cartas atravessarem. */
  ordem: number
  /** Só durante a selagem. Fora dela a troca de lados é instantânea — quem abre
   *  uma troca já concluída não pode ver as cartas cruzando de novo. */
  animar?: boolean
  naFrente?: boolean
  acabamento?: Acabamento
  preco?: PrecoEscolhido
}) {
  return (
    <motion.div
      // 'position' e não `true`: a coluna muda de altura sozinha quando a imagem
      // da carta carrega, e animar tamanho faria o cartão respirar à toa.
      layout={animar ? 'position' : false}
      // Mola superamortecida (razão ~1,14), não curva fixa. Uma carta deslizando
      // parte do repouso e chega ao repouso; a desaceleração exponencial que o
      // resto do app usa arranca de uma vez e depois rasteja, o que num percurso
      // longo lê como engasgo. Superamortecida quer dizer que ela não passa do
      // ponto e não volta — mola aqui é suavidade, não elástico.
      transition={{ type: 'spring', stiffness: 70, damping: 20, mass: 1.1 }}
      style={{ order: ordem, zIndex: animar && naFrente ? 30 : undefined }}
      className={cn(
        'grupo-carta relative flex min-w-0 flex-1 flex-col gap-2',
        alinhamento === 'end' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        className={cn(
          'text-[12px] font-medium tracking-wide uppercase lg:text-[13px]',
          // O sufixo do nome da classe é o gancho de pele; a classe de cor é o
          // que pinta no mundo padrão.
          cor === 'offer' ? 'rotulo-offer text-offer' : 'rotulo-want text-want',
        )}
      >
        {rotulo}
      </span>

      {carta ? (
        <>
          <CartaThumb
            carta={carta}
            className={cn(
              'carta-cresce ring-2',
              // A miniatura de 56px vinha de quando o feed era uma coluna
              // estreita. Na grade larga ela ficava minúscula ao lado das
              // células de Ofereço e Procuro, onde a arte é o que identifica a
              // carta — é o mesmo argumento de GradeDeCartas.
              //
              // Teto, não largura fixa: a coluna já é `flex-1 min-w-0`, mas um
              // filho de largura fixa não encolhe com ela — no celular as duas
              // cartas "grandes" somavam 424px dentro de ~310px e vazavam pelas
              // duas bordas da tela. Onde couber, o teto é a medida de antes.
              'w-full',
              grande ? 'max-w-44 lg:max-w-52 2xl:max-w-60' : 'max-w-20 lg:max-w-28 2xl:max-w-32',
              cor === 'offer' ? 'ring-offer' : 'ring-want',
            )}
          />
          <span className="min-w-0 max-w-full">
            <span
              className={cn(
                'block text-paper',
                // No detalhe o nome não pode ser cortado: a tela existe para
                // dizer qual carta sai e qual entra, e a 18px "Mega Dragonite
                // ex" não cabe na metade de um celular — virava "Mega Drago…".
                // Duas linhas resolvem sem empurrar nada para fora; da terceira
                // em diante o corte volta, porque aí é nome de carta promocional
                // comprido e o resto do cartão importa mais.
                grande
                  ? 'line-clamp-2 text-[18px] leading-[1.2] text-balance lg:text-[20px]'
                  : 'truncate text-[15px] lg:text-[16px]',
              )}
            >
              {nomeCarta(carta)}
            </span>
            <span className="set-code block text-[11px] text-muted lg:text-[12px]">
              {codigoSet(carta)}
            </span>
            {grande && carta.raridade && (
              <span className="mt-0.5 block text-[12px] text-faint">
                {carta.raridade}
              </span>
            )}
            {/* Normal não vira selo: é o acabamento da maioria das cartas e
                repeti-lo em toda troca gastaria destaque com o que não
                distingue. Reverse, Poké Ball e companhia mudam o que está sendo
                trocado — e mudam o preço — então precisam ser vistos sem ler a
                linha de baixo. */}
            {acabamento && acabamento.id !== NORMAL && (
              <span
                title={acabamento.nome_pt}
                className={cn(
                  'mt-1 inline-block rounded-[6px] border px-1.5 py-0.5 leading-none',
                  grande ? 'text-[12px]' : 'text-[11px]',
                  cor === 'offer'
                    ? 'border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] text-offer'
                    : 'border-[color-mix(in_oklab,var(--color-want)_40%,transparent)] text-want',
                )}
              >
                {acabamento.nome_curto}
              </span>
            )}
            <SeloPreco preco={preco} className="mt-0.5" />
          </span>
        </>
      ) : (
        <div
          className={cn(
            'aspect-[2.5/3.5] w-full animate-pulse rounded-[10px] bg-surface-2',
            grande ? 'max-w-44 lg:max-w-52' : 'max-w-20 lg:max-w-28',
          )}
        />
      )}
    </motion.div>
  )
}

/** O trilho entre as duas pontas. Decorativo: a direção já está nos rótulos. */
function Direcao({ grande, atenuado }: { grande: boolean; atenuado?: boolean }) {
  return (
    <div
      aria-hidden
      // Ordem explícita: as duas pontas usam `order` para atravessar, e o padrão
      // 0 deste trilho o jogaria para antes das duas.
      style={{ order: 2 }}
      className={cn(
        // `self-center` porque a linha passou a alinhar pelo topo: sem isto o
        // trilho subiria para junto dos rótulos, e ele é o eixo entre as duas
        // artes, não um terceiro rótulo.
        'trilho flex shrink-0 self-center flex-col items-center justify-center gap-1',
        'transition-opacity duration-300',
        atenuado && 'opacity-0',
        // No celular o trilho disputa espaço com as cartas, que são o assunto:
        // 48px ali são 48px que a arte não tem.
        grande ? 'w-8 sm:w-12' : 'w-7 lg:w-10',
      )}
    >
      <Seta direcao="direita" />
      <Seta direcao="esquerda" />
    </div>
  )
}

function Seta({ direcao }: { direcao: 'direita' | 'esquerda' }) {
  const paraDireita = direcao === 'direita'
  return (
    <span
      className={cn(
        'flex w-full items-center gap-0.5',
        paraDireita ? 'text-offer' : 'flex-row-reverse text-want',
      )}
    >
      <span className="h-px flex-1 bg-current opacity-50" />
      <span className="text-[10px] leading-none">{paraDireita ? '▸' : '◂'}</span>
    </span>
  )
}
