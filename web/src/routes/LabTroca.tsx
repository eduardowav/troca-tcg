import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'

import { Cartela, IconeSetaDireita } from '@/components/brutal/Pecas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { cn } from '@/lib/cn'
import { type Som, tocar } from '@/lib/sons'
import { type Carta, nomeCarta } from '@/lib/types'

/**
 * Laboratório da animação de troca — rota de desenvolvimento, fora de produção.
 *
 * Existe para decidir **antes** de embutir. A selagem antiga foi desligada por
 * não caber no mundo novo, e a substituta precisa ser escolhida vendo rodar, com
 * som junto e no tamanho do celular — não descrita numa mensagem.
 *
 * Quatro combinações, que são duas perguntas cruzadas: as cartas **giram** ou
 * **deslizam** ao trocar de lado? e o acordo termina com **carimbo** ou sem?
 *
 * **A animação é CSS, não motion.** O giro no eixo vertical (`rotateY`) não
 * anima pelo motion neste projeto: ele não escreve transform nenhum, sem erro no
 * console. E há um segundo defeito que custou caro achar — quando a rotação cai
 * num múltiplo exato de 360°, o motion conclui que nada mudou e **descarta a
 * pose inteira**, deslocamento incluído: a cena rodava com os sons tocando e as
 * cartas paradas. O navegador faz as duas coisas sem reclamar, então os quadros
 * moram em `index.css` e aqui só se decide qual classe entra.
 *
 * As duas cartas são reais, com id fixo: o teste é sobre movimento e som, e
 * carregar arte de verdade é o que revela se a animação funciona com o que a
 * pessoa vê no app — retângulo colorido perdoa qualquer coisa.
 *
 * Quando uma combinação for escolhida, ela sai daqui para o detalhe do match e
 * esta rota morre — o `import.meta.env.DEV` em App.tsx garante que ela nunca
 * chegue ao usuário enquanto isso não acontece.
 */
const CARTAS = [
  'e8bad5ad-7126-47b2-b8c6-ddda2ebf95e6', // Mega Dragonite ex
  'a33b93ec-4946-4b05-92d9-94773daabcfd', // Mew ex
]

type Movimento = 'gira' | 'desliza'

interface Roteiro {
  valor: string
  nome: string
  movimento: Movimento
  selo: boolean
  duracao: number
  descricao: string
}

const ROTEIROS: Roteiro[] = [
  {
    valor: 'gira-selo',
    nome: 'Giro e selo',
    movimento: 'gira',
    selo: true,
    // A volta inteira precisa de mais tempo que um deslize: 360° em meio
    // segundo vira borrão, e o que se quer ver é a carta girando.
    duracao: 0.85,
    descricao:
      'Cada carta dá uma volta completa sobre o eixo vertical enquanto assume o lugar da outra, e o carimbo cai por cima no fim. É a combinação que você pediu.',
  },
  {
    valor: 'gira',
    nome: 'Giro, sem selo',
    movimento: 'gira',
    selo: false,
    duracao: 0.85,
    descricao:
      'A mesma volta, sem o carimbo. Serve para medir quanto o selo pesa — e para ver se a troca se explica só com o movimento.',
  },
  {
    valor: 'desliza-selo',
    nome: 'Troca de lugar e selo',
    movimento: 'desliza',
    selo: true,
    duracao: 0.6,
    descricao:
      'As cartas passam uma pela outra e assumem o lado do novo dono; o carimbo vem depois. Sem giro, é a mais rápida das que terminam em selo.',
  },
  {
    valor: 'desliza',
    nome: 'Troca de lugar, sem selo',
    movimento: 'desliza',
    selo: false,
    duracao: 0.6,
    descricao:
      'A troca dita literalmente e nada mais. É a mais curta das quatro.',
  },
]

const SONS: { valor: Som | 'nenhum'; nome: string }[] = [
  { valor: 'nenhum', nome: 'Sem som' },
  { valor: 'deslize', nome: 'Deslize de papel' },
  { valor: 'baralho', nome: 'Baralho' },
  { valor: 'clique', nome: 'Clique seco' },
  { valor: 'selo', nome: 'Carimbo' },
  { valor: 'fechou', nome: 'Duas notas' },
]

export default function LabTroca() {
  const semMovimentoDoSistema = useReducedMotion()

  const [escolhido, setEscolhido] = useState(ROTEIROS[0].valor)
  const [somDoGesto, setSomDoGesto] = useState<Som | 'nenhum'>('deslize')
  const [somDoFecho, setSomDoFecho] = useState<Som | 'nenhum'>('fechou')
  const [volume, setVolume] = useState(0.8)
  const [velocidade, setVelocidade] = useState(1)
  const [rodando, setRodando] = useState(false)
  const [trocando, setTrocando] = useState(false)
  const [selado, setSelado] = useState(false)
  const [registro, setRegistro] = useState<string[]>([])

  // Muda a cada execução e serve de `key` das cartas: remontar é o jeito mais
  // confiável de reiniciar uma animação de CSS, que só toca uma vez por
  // elemento. Sem isto, rodar duas vezes seguidas só funcionaria na primeira.
  const [execucao, setExecucao] = useState(0)

  const roteiro = ROTEIROS.find((r) => r.valor === escolhido) ?? ROTEIROS[0]

  const { data: cartas } = useCartasPorId(CARTAS)
  const [esquerda, direita] = useMemo(
    () => CARTAS.map((id) => cartas?.get(id)),
    [cartas],
  )

  function anotar(linha: string) {
    setRegistro((antes) => [linha, ...antes].slice(0, 6))
  }

  function soar(qual: Som | 'nenhum', momento: string) {
    if (qual === 'nenhum') return
    tocar(qual, volume)
    anotar(`♪ ${qual} — ${momento}`)
  }

  /** Duração em segundos, já com o multiplicador de velocidade da tela. */
  const t = (segundos: number) => segundos / velocidade

  /**
   * Espera em **segundos** — a unidade do resto do arquivo.
   *
   * É ela que marca o tempo da cena: a animação de CSS corre sozinha, e o
   * relógio daqui só decide quando o carimbo entra e quando o botão volta a
   * ficar disponível. A duração mora no roteiro, então os dois não saem de
   * sincronia.
   *
   * Existe também porque a primeira versão misturou segundo com milissegundo
   * num `setTimeout(t(420) * 1000)` — sete minutos de "Rodando…". Com a
   * conversão num lugar só, o erro não volta.
   */
  const espera = (segundos: number) =>
    new Promise((pronto) => setTimeout(pronto, segundos * 1000))

  async function rodar() {
    if (rodando) return
    setRodando(true)
    setSelado(false)

    // Volta ao ponto de partida antes de qualquer coisa: rodar duas vezes
    // seguidas tem de dar o mesmo resultado.
    setTrocando(false)
    await espera(0.05)

    anotar(`▶ ${roteiro.nome}`)
    soar(somDoGesto, 'as cartas saem da mão')
    setExecucao((n) => n + 1)
    setTrocando(true)
    await espera(t(roteiro.duracao))

    if (roteiro.selo) {
      // Onde há carimbo, ele **é** o fecho: tocar o som do fecho no selo e
      // outra vez no fim seriam dois "pronto" para um acordo só.
      setSelado(true)
      soar(somDoFecho, 'o carimbo cai')
      await espera(t(0.5))
    } else {
      soar(somDoFecho, 'troca combinada')
    }

    setRodando(false)
  }

  function voltar() {
    setSelado(false)
    setTrocando(false)
  }

  const duracaoCss = `${t(roteiro.duracao)}s`

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-8">
      <header>
        <p className="font-dado text-[11px] uppercase text-apagado">
          Rota de desenvolvimento
        </p>
        <h1 className="mt-1 font-titulo text-[26px] leading-[1.1] font-black text-tinta">
          Laboratório da troca
        </h1>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Quatro combinações: as cartas giram ou deslizam ao trocar de lado, com
          carimbo no fim ou sem. Nada aqui está ligado ao fluxo real — é para
          escolher vendo rodar.
        </p>
      </header>

      {semMovimentoDoSistema && (
        <Cartela className="mt-5 p-4">
          <p className="font-titulo text-[14px] font-bold text-tinta">
            Seu sistema pede menos movimento.
          </p>
          <p className="mt-1.5 font-corpo text-[13px] leading-relaxed text-apagado">
            As cartas vão aparecer já trocadas, sem a viagem — é o que o app faz
            para quem pede isso ao sistema, e é o que você está vendo aqui.
          </p>
        </Cartela>
      )}

      {/* ------------------------------------------------------------ palco */}
      <div className="mt-6">
        <Cartela className="p-4">
          {/* `items-stretch` para as duas cartas terem a mesma altura: com
              `items-start`, a de nome curto ficava mais baixa que a outra e as
              duas pareciam de tamanhos diferentes.

              `overflow-hidden` porque as cartas andam 105% para o lado: sem
              ele, a que sai empurra a largura da página e o celular ganha uma
              barra de rolagem horizontal no meio da animação. O `p-1` dá o vão
              para a sombra dura não ser cortada no repouso. */}
          <div
            // O vão entre as colunas e o tamanho da seta são declarados uma vez
            // e usados nos dois lugares: aqui, para desenhar a fileira, e em
            // `index.css`, para calcular o quanto cada carta anda. Enquanto
            // forem as mesmas variáveis, a carta para exatamente no lugar da
            // outra — o caminho é a largura dela mais a seta mais os dois vãos.
            //
            // Antes disso o deslocamento era um `105%` chutado, que ignorava a
            // seta no meio: a carta parava a uns 40px do lugar, e por uma
            // distância diferente em cada largura de tela.
            style={{
              ['--troca-vao' as string]: '0.5rem',
              ['--troca-seta' as string]: '2rem',
            }}
            className="relative flex items-stretch gap-[var(--troca-vao)] overflow-hidden p-1 [perspective:1200px]"
          >
            <CartaNoPalco
              key={`a-${execucao}`}
              carta={esquerda}
              etiqueta="Sua"
              className={
                trocando ? `troca-anima troca-${roteiro.movimento}-a` : undefined
              }
              duracao={duracaoCss}
            />

            {/* A seta sai de cena assim que as cartas começam a andar.
                Ela existe para dizer "isto aqui é uma troca" enquanto nada se
                move; no instante em que as cartas trocam de lado, quem diz isso
                é o movimento — e a seta vira um obstáculo no meio do caminho,
                atravessada pelas duas. Volta quando a cena volta ao começo. */}
            <span
              aria-hidden
              className={cn(
                // Centrada nos dois eixos: `self-center` a põe na metade da
                // altura das cartas (que são de altura igual desde que a
                // fileira virou `items-stretch`), e como ela é o item do meio,
                // o eixo horizontal já é o vão entre as duas. O `mt` fixo que
                // havia aqui a pendurava na altura da primeira arte e
                // desalinhava assim que um nome ganhava a segunda linha.
                'grid size-[var(--troca-seta)] shrink-0 self-center place-items-center',
                'rounded-[16px] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]',
                'transition-all duration-150',
                // Em CSS, e não no motion, pelo mesmo motivo das cartas: a
                // animação inteira desta cena mora na folha de estilo, e
                // misturar os dois motores num palco só é como se perde o
                // controle de quem escreve o quê.
                trocando && 'scale-50 opacity-0',
              )}
            >
              <IconeSetaDireita className="size-4 text-tinta" />
            </span>

            <CartaNoPalco
              key={`b-${execucao}`}
              carta={direita}
              etiqueta="Dela"
              className={
                trocando ? `troca-anima troca-${roteiro.movimento}-b` : undefined
              }
              duracao={duracaoCss}
            />

            {/* O carimbo do acordo. Entra torto e com mola, como um selo batido
                à mão. */}
            {selado && (
              <motion.div
                initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
                animate={{ scale: 1, opacity: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                className="pointer-events-none absolute inset-x-0 top-1/2 grid -translate-y-1/2 place-items-center"
              >
                <span className="rounded-[var(--radius-controle)] border-4 border-tinta bg-azul px-4 py-2 font-titulo text-[18px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro)]">
                  Trocado
                </span>
              </motion.div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={rodar}
              disabled={rodando}
              className="h-11 flex-1 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul font-titulo text-[13px] font-extrabold uppercase text-azul-tinta shadow-[var(--shadow-duro-sm)] transition-shadow hover:shadow-[var(--shadow-duro)] disabled:opacity-50"
            >
              {rodando ? 'Rodando…' : 'Rodar'}
            </button>
            <button
              type="button"
              onClick={voltar}
              className="h-11 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 font-titulo text-[13px] font-extrabold uppercase text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
            >
              Voltar
            </button>
          </div>
        </Cartela>
      </div>

      {/* --------------------------------------------------------- roteiros */}
      <section className="mt-6">
        <h2 className="font-titulo text-[15px] font-black text-tinta">
          Qual animação
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {ROTEIROS.map((r) => (
            <button
              key={r.valor}
              type="button"
              onClick={() => setEscolhido(r.valor)}
              aria-pressed={r.valor === escolhido}
              className={cn(
                'rounded-[var(--radius-controle)] border-2 border-tinta p-3 text-left transition-shadow',
                r.valor === escolhido
                  ? 'bg-meu shadow-[var(--shadow-duro-xs)]'
                  : 'bg-cartela hover:shadow-[var(--shadow-duro-xs)]',
              )}
            >
              <span className="font-titulo text-[14px] font-bold text-tinta">
                {r.nome}
              </span>
              <span className="mt-1 block font-corpo text-[13px] leading-relaxed text-apagado">
                {r.descricao}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- sons */}
      <section className="mt-6">
        <h2 className="font-titulo text-[15px] font-black text-tinta">
          Quais sons
        </h2>
        <p className="mt-1.5 font-corpo text-[13px] leading-relaxed text-apagado">
          Sintetizados na hora, sem arquivo nenhum. Toque em cada um para ouvir
          isolado — o navegador só libera áudio depois de um toque seu.
        </p>

        <EscolhaDeSom
          rotulo="Quando as cartas saem"
          valor={somDoGesto}
          onValor={setSomDoGesto}
          volume={volume}
        />
        <EscolhaDeSom
          rotulo="Quando a troca fecha"
          valor={somDoFecho}
          onValor={setSomDoFecho}
          volume={volume}
        />

        <label className="mt-4 block">
          <span className="font-dado text-[11px] uppercase text-apagado">
            Volume — {Math.round(volume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--color-azul)]"
          />
        </label>

        <label className="mt-3 block">
          <span className="font-dado text-[11px] uppercase text-apagado">
            Velocidade — {velocidade.toFixed(2)}×
          </span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={velocidade}
            onChange={(e) => setVelocidade(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--color-azul)]"
          />
        </label>
      </section>

      {registro.length > 0 && (
        <section className="mt-6">
          <h2 className="font-dado text-[11px] uppercase text-apagado">
            O que aconteceu
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {registro.map((linha, i) => (
              <li
                key={`${linha}-${i}`}
                className={cn(
                  'font-dado text-[12px]',
                  i === 0 ? 'text-tinta' : 'text-apagado',
                )}
              >
                {linha}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CartaNoPalco({
  carta,
  etiqueta,
  className,
  duracao,
}: {
  carta?: Carta
  etiqueta: string
  className?: string
  duracao: string
}) {
  return (
    <div
      // A duração vem por variável de CSS: a animação mora na folha de estilo,
      // mas quem sabe quanto ela dura é a tela, por causa do controle de
      // velocidade.
      style={{ ['--troca-dur' as string]: duracao }}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta p-2',
        etiqueta === 'Sua' ? 'bg-meu' : 'bg-papel',
        className,
      )}
    >
      <span
        className={cn(
          'self-start rounded-[var(--radius-etiqueta)] px-2 py-0.5 font-dado text-[10px] font-bold uppercase',
          etiqueta === 'Sua'
            ? 'bg-azul text-azul-tinta'
            : 'bg-tinta text-cartela',
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
        <div className="aspect-[2.5/3.5] animate-pulse rounded-[var(--radius-imagem)] border-2 border-tinta bg-cartela" />
      )}
      {/* Duas linhas de altura sempre, mesmo com nome de uma linha só: "Mew ex"
          deixava a carta dele mais baixa que a do lado, e duas cartas de alturas
          diferentes na mesma troca leem como defeito. */}
      <span className="line-clamp-2 min-h-[2.4em] font-titulo text-[13px] leading-tight font-bold text-tinta">
        {carta ? nomeCarta(carta) : '—'}
      </span>
    </div>
  )
}

function EscolhaDeSom({
  rotulo,
  valor,
  onValor,
  volume,
}: {
  rotulo: string
  valor: Som | 'nenhum'
  onValor: (v: Som | 'nenhum') => void
  volume: number
}) {
  return (
    <div className="mt-4">
      <p className="font-dado text-[11px] uppercase text-apagado">{rotulo}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SONS.map((s) => (
          <button
            key={s.valor}
            type="button"
            onClick={() => {
              onValor(s.valor)
              if (s.valor !== 'nenhum') tocar(s.valor, volume)
            }}
            aria-pressed={valor === s.valor}
            className={cn(
              'rounded-[var(--radius-etiqueta)] border-2 border-tinta px-2.5 py-1.5',
              'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
              valor === s.valor
                ? 'bg-azul text-azul-tinta'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            {s.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
