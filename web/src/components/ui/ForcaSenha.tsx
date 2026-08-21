import { cn } from '@/lib/cn'
import type { ForcaSenha as Forca } from '@/lib/forcaSenha'

/**
 * O medidor de força, embaixo do campo de senha.
 *
 * Quatro blocos e uma palavra. A conta mora em `lib/forcaSenha.ts`; aqui só se
 * decide como ela aparece.
 *
 * **Três cores, e não cinco.** O sistema não tem verde — cor é significado
 * neste app, e os três acentos que existem já têm papel: vermelho é o que está
 * errado, âmbar é o aviso, azul é o caminho em frente. Uma senha boa e uma
 * forte partilham o azul de propósito: a diferença entre elas não é o tipo de
 * recado, é quantos blocos acenderam.
 *
 * **A dica é a parte que trabalha.** Um medidor que só pinta de vermelho diz
 * "está ruim" e deixa a pessoa adivinhando a saída — e a saída que se costuma
 * adivinhar é acrescentar um `!` no fim, que quase não muda nada. Então cada
 * nível fraco vem com o próximo passo escrito, e ele fala de comprimento,
 * porque é o que de fato move a medida.
 *
 * **Um recado por vez.** Quando o formulário já reprovou a senha, o `Campo`
 * imprime o motivo em vermelho logo acima; repetir a mesma frase aqui seria a
 * mesma coisa dita duas vezes, uma delas em cinza.
 */
export function ForcaSenha({
  forca,
  erro,
  className,
}: {
  forca: Forca
  /** O erro que o `Campo` já está mostrando, se houver. */
  erro?: string
  className?: string
}) {
  // Campo vazio não é senha fraca: é campo vazio. O medidor nasce no primeiro
  // caractere para não receber quem chega com um aviso já aceso.
  if (!forca.preenchida) return null

  const tom = TONS[forca.pontos]
  const dica = erro ? null : forca.dica

  return (
    <div className={cn('-mt-1 flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2.5">
        <div aria-hidden className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((bloco) => (
            <span
              key={bloco}
              className={cn(
                'h-2 flex-1 rounded-[3px] border-2 border-tinta transition-colors',
                bloco <= forca.pontos ? tom.bloco : 'bg-papel',
              )}
            />
          ))}
        </div>
        <span
          aria-hidden
          className={cn(
            'font-dado text-[11px] font-bold uppercase tabular-nums',
            tom.texto,
          )}
        >
          {forca.rotulo}
        </span>
      </div>

      {dica && (
        <p aria-hidden className="text-[13px] leading-snug text-apagado">
          {dica}
        </p>
      )}

      {/* A versão para quem não vê a barra. Fica fora da ordem visual e diz a
          frase inteira: a cor e os quatro blocos não chegam ao leitor de tela,
          e "Razoável" sozinho não é informação. `polite` porque isto muda a
          cada tecla — interromper quem digita seria pior que não falar. */}
      <p role="status" aria-live="polite" className="sr-only">
        {`Força da senha: ${forca.rotulo}.${forca.dica ? ` ${forca.dica}` : ''}`}
      </p>
    </div>
  )
}

/**
 * Vermelho até "Fraca", âmbar em "Razoável", azul de "Boa" para cima.
 *
 * No escuro a palavra "Boa"/"Forte" sai do azul e vira tinta, pela regra de
 * `.text-azul` em index.css — o azul da marca não se lê sobre a cartela
 * escura. Os blocos continuam azuis nos dois temas: `bg-azul` fica de fora da
 * regra, e é neles que a cor faz o trabalho.
 */
const TONS = [
  { bloco: 'bg-alerta', texto: 'text-alerta' },
  { bloco: 'bg-alerta', texto: 'text-alerta' },
  { bloco: 'bg-ambar-marca', texto: 'text-ambar' },
  { bloco: 'bg-azul', texto: 'text-azul' },
  { bloco: 'bg-azul', texto: 'text-azul' },
] as const
