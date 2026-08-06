/**
 * A carta na grade, no mundo neobrutalista.
 *
 * Célula própria em vez de repintar a `CelulaCarta` do playmat, pelo mesmo
 * motivo que o feed ganhou a `ParDeCartas`: a do playmat também serve `Buscar`,
 * que ainda não foi olhada, e repintá-la migraria aquela tela de carona, sem
 * ninguém ter decidido como ela deve ficar. As duas convivem até `Buscar`
 * migrar; aí a antiga sai e sobra esta.
 *
 * Tudo que a célula antiga mostra continua aqui — arte, nome, código de set,
 * nome da expansão, raridade e preço de referência. Migração não é lugar de
 * perder informação sem querer.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CartaThumb } from '@/components/carta/CartaThumb'
import type { PrecoEscolhido } from '@/lib/acabamentos'
import { cn } from '@/lib/cn'
import {
  type Carta,
  codigoSet,
  formatarPreco,
  type ListingKind,
  nomeCarta,
} from '@/lib/types'

/* ------------------------------------------------------------------ grade */

export function GradeBrutal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <ul
      className={cn(
        // `grid-cols-2` explícito pelo mesmo motivo do feed: sem coluna
        // declarada a implícita nasce `auto` e dimensiona pelo max-content,
        // e nome de carta com `truncate` é `nowrap` — a grade estoura a tela.
        //
        // Mais colunas a cada respiro de largura: no desktop a busca vira
        // bancada de loja, com dezenas de artes à vista. Este é o padrão do
        // catálogo; quem tem menos espaço — Minhas cartas, com duas listas
        // dividindo a tela — passa a própria classe e sobrescreve.
        'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </ul>
  )
}

/* --------------------------------------------------------------- raridade */

/**
 * O selo de raridade em três níveis, como o arquivo desenha
 * (`COMMON` neutro, `RARE` azul, `ULTRA RARE` âmbar).
 *
 * O catálogo tem 35 rótulos distintos, misturando português e inglês — de
 * "Comum" a "Ilustração Rara Especial" e "Mega Hiper Raro". Mapear um a um
 * envelheceria mal: expansão nova traz rótulo novo, e o que não estivesse na
 * lista cairia em branco. A regra é por padrão no texto, e o que ela não
 * reconhece cai no neutro, que é o pior caso aceitável — carta comum com
 * cara de comum.
 *
 * O âmbar e o azul são os do arquivo (`rarity-tag`). O neutro é o mesmo do
 * selo de estado do feed, não um cinza escolhido por mim.
 */
const TOPO =
  /ultra|hiper|secret|ilustra|especial|shiny|radiante|legend|ace spec|classic|incríve|arte completa|brilhante/i
const RARA = /rar/i

function nivelDaRaridade(raridade: string): 'topo' | 'rara' | 'comum' {
  if (TOPO.test(raridade)) return 'topo'
  if (RARA.test(raridade)) return 'rara'
  return 'comum'
}

export function SeloRaridade({ raridade }: { raridade: string }) {
  const nivel = nivelDaRaridade(raridade)

  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded-[var(--radius-etiqueta)] border-[1.5px] border-tinta px-2 py-0.5',
        'font-dado text-[10px] font-bold uppercase',
        nivel === 'topo' && 'bg-ambar-fraco text-ambar',
        nivel === 'rara' && 'bg-meu text-azul',
        nivel === 'comum' && 'bg-cartela text-apagado',
      )}
    >
      {raridade}
    </span>
  )
}

/* ---------------------------------------------------------------- célula */

/**
 * Os dois botões de lista da busca — Ofereço e Procuro, lado a lado.
 *
 * O ativo vira azul cheio e o texto muda para "Na lista". Não some: quem varre
 * o catálogo precisa ver que aquela carta já foi escolhida, e botão ausente
 * conta isso pior do que botão apagado.
 */
export function AcoesBrutal({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>
}

export function BotaoListaBrutal({
  tipo,
  ativo,
  onClick,
  disabled,
}: {
  tipo: ListingKind
  ativo: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const nome = tipo === 'OFERTA' ? 'Ofereço' : 'Procuro'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      aria-label={`${ativo ? 'Já na lista' : 'Adicionar a'} ${nome}`}
      className={cn(
        'rounded-[var(--radius-etiqueta)] border-2 border-tinta px-1 py-1.5',
        'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
        ativo
          ? 'cursor-default bg-azul text-azul-tinta opacity-60'
          : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
      )}
    >
      {ativo ? 'Na lista' : nome}
    </button>
  )
}

/* ---------------------------------------------------------------- célula */

export function CelulaBrutal({
  carta,
  preco,
  precoCarregado = false,
  destaque,
  para,
  children,
}: {
  carta: Carta
  /** Preço de referência da TCGplayer, quando existe para esta carta. */
  preco?: PrecoEscolhido
  /**
   * Em qual lista a carta já está, se estiver em alguma.
   *
   * Vira fundo azul-claro — o mesmo "isto é meu" do par de cartas —, e não uma
   * cor por lista. Nesta grade o azul e o âmbar já significam raridade dentro
   * da própria célula, e uma terceira cor de região disputaria a leitura. Qual
   * das duas listas é fica com os botões embaixo, que já dizem.
   */
  destaque?: ListingKind | null
  /** Destino ao tocar na arte. Só as telas de descoberta passam isto. */
  para?: string
  /**
   * Se a consulta de preços já respondeu.
   *
   * Separa "esta carta não tem preço" de "o preço ainda está vindo" — sem isso,
   * a célula escreveria "sem preço listado" no instante entre a carta aparecer e
   * a consulta de preços chegar, e a frase piscaria antes do valor. Como a
   * consulta de preços é outra query, esse instante existe de verdade.
   */
  precoCarregado?: boolean
  /** Ações da célula — mudam por tela. */
  children?: ReactNode
}) {
  const valor = formatarPreco(preco?.preco)

  return (
    // `h-full` porque a célula precisa ocupar a altura inteira da linha da
    // grade para o rodapé ter onde encostar. O `stretch` do grid já estica o
    // `li`, mas só o item — declarar aqui é o que faz a coluna interna crescer
    // junto e o `mt-auto` lá embaixo ter espaço para empurrar.
    <li
      className={cn(
        'flex h-full flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta p-2 shadow-[var(--shadow-duro-xs)]',
        destaque ? 'bg-meu' : 'bg-cartela',
      )}
    >
      {/* A arte leva à página da carta nas telas de descoberta. Em Minhas
          cartas o toque já abre o editor, e dois destinos no mesmo gesto seria
          pior que nenhum — por isso `para` é opcional. */}
      {para ? (
        <Link to={para} className="block">
          <CartaThumb
            carta={carta}
            className="rounded-[var(--radius-imagem)] border-2 border-tinta"
          />
        </Link>
      ) : (
        <CartaThumb
          carta={carta}
          className="rounded-[var(--radius-imagem)] border-2 border-tinta"
        />
      )}

      <div className="flex min-w-0 flex-col gap-1">
        {/* Duas linhas para o nome, como no feed e pelo mesmo motivo: a célula
            tem pouco mais de 150px no celular, e "Charizard ex" existe dezenas
            de vezes — o que distingue está no fim do nome. */}
        <p className="line-clamp-2 font-titulo text-[14px] leading-tight font-bold text-tinta">
          {nomeCarta(carta)}
        </p>

        <p className="truncate font-dado text-[11px] font-medium text-apagado">
          {codigoSet(carta)}
          {carta.set_nome && ` • ${carta.set_nome}`}
        </p>

        {carta.raridade && <SeloRaridade raridade={carta.raridade} />}

        {/* Carta sem preço não fica em silêncio.
            O catálogo tem carta que a TCGplayer não lista — as promo da SVP, por
            exemplo. Antes a linha simplesmente não existia, e o vazio lia como
            "o app não carregou" em vez de "não há cotação para esta". Dizer a
            frase é mais honesto, e é a diferença entre uma falha aparente e um
            fato do catálogo.

            "listado" e não "sem preço": a carta tem valor, o que não existe é
            referência pública dela. */}
        {valor ? (
          <p className="truncate font-dado text-[11px] text-apagado">
            {valor}
            {!preco?.exato && <span aria-hidden> ~</span>}
          </p>
        ) : (
          precoCarregado && (
            <p className="truncate font-dado text-[11px] text-apagado/70">
              sem preço listado
            </p>
          )
        )}
      </div>

      {/* As ações ficam presas no rodapé da célula, não logo depois do texto.
          Preço e raridade são opcionais — o catálogo tem carta sem preço (as
          promo da SVP, por exemplo, não têm linha na TCGplayer) e carta sem
          raridade —, e sem isto cada célula punha o botão numa altura diferente
          conforme o que faltava. Numa grade lado a lado, dois botões
          desalinhados por 17px leem como defeito.

          `mt-auto` e não altura fixa no bloco de texto: nome de carta ocupa uma
          ou duas linhas, e fixar altura para acomodar o pior caso deixaria um
          vão em todas as outras. */}
      {children && <div className="mt-auto pt-1">{children}</div>}
    </li>
  )
}
