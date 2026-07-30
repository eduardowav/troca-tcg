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
        'flex min-w-0 flex-1 flex-col gap-2',
        alinhamento === 'end' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-medium tracking-wide uppercase',
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
              'ring-2',
              // A miniatura de 56px vinha de quando o feed era uma coluna
              // estreita. Na grade larga ela ficava minúscula ao lado das
              // células de Ofereço e Procuro, onde a arte é o que identifica a
              // carta — é o mesmo argumento de GradeDeCartas.
              grande ? 'w-44' : 'w-20',
              cor === 'offer' ? 'ring-offer' : 'ring-want',
            )}
          />
          <span className="min-w-0 max-w-full">
            <span
              className={cn(
                'block truncate text-paper',
                grande ? 'text-[17px]' : 'text-[13px]',
              )}
            >
              {nomeCarta(carta)}
            </span>
            <span className="set-code block text-[10px] text-muted">
              {codigoSet(carta)}
            </span>
            <SeloPreco preco={preco} className="mt-0.5" />
          </span>
        </>
      ) : (
        <div
          className={cn(
            'aspect-[2.5/3.5] animate-pulse rounded-[10px] bg-surface-2',
            grande ? 'w-44' : 'w-20',
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
        grande ? 'w-12' : 'w-7',
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
