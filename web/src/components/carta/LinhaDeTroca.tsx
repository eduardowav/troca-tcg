import { CartaThumb } from '@/components/carta/CartaThumb'
import { SeloPreco } from '@/components/carta/GradeDeCartas'
import { cn } from '@/lib/cn'
import {
  type Carta,
  codigoSet,
  nomeCarta,
  type PrecoTCGplayer,
} from '@/lib/types'

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
  precos,
  tamanho = 'compacto',
}: {
  dou?: Carta
  recebo?: Carta
  /** Preço de referência por carta. Só o detalhe do match passa isto. */
  precos?: Map<string, PrecoTCGplayer>
  tamanho?: 'compacto' | 'grande'
}) {
  const grande = tamanho === 'grande'

  return (
    <div className="flex items-center gap-3">
      <Lado
        carta={dou}
        rotulo="Você dá"
        cor="offer"
        grande={grande}
        alinhamento="end"
        preco={dou && precos?.get(dou.id)}
      />

      <Direcao grande={grande} />

      <Lado
        carta={recebo}
        rotulo="Você recebe"
        cor="want"
        grande={grande}
        alinhamento="start"
        preco={recebo && precos?.get(recebo.id)}
      />
    </div>
  )
}

function Lado({
  carta,
  rotulo,
  cor,
  grande,
  alinhamento,
  preco,
}: {
  carta?: Carta
  rotulo: string
  cor: 'offer' | 'want'
  grande: boolean
  alinhamento: 'start' | 'end'
  preco?: PrecoTCGplayer
}) {
  return (
    <div
      className={cn(
        'grupo-carta relative flex min-w-0 flex-1 flex-col gap-2',
        alinhamento === 'end' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        className={cn(
          'text-[12px] font-medium tracking-wide uppercase lg:text-[13px]',
          cor === 'offer' ? 'text-offer' : 'text-want',
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
                'block truncate text-paper',
                grande ? 'text-[18px] lg:text-[20px]' : 'text-[15px] lg:text-[16px]',
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
    </div>
  )
}

/** O trilho entre as duas pontas. Decorativo: a direção já está nos rótulos. */
function Direcao({ grande }: { grande: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-1',
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
