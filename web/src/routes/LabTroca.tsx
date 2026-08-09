import type { TargetAndTransition, Transition } from 'motion/react'
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
 * som junto e no tamanho do celular — não descrita numa mensagem. Aqui dá para
 * rodar as três candidatas quantas vezes quiser, trocar o som de cada momento e
 * comparar, sem que nada disso encoste no fluxo real da troca.
 *
 * Quando uma das três for escolhida, ela sai daqui para o detalhe do match e
 * esta rota morre — o `import.meta.env.DEV` em App.tsx garante que ela nunca
 * chegue ao usuário enquanto isso não acontece.
 *
 * As duas cartas são reais, com id fixo: o teste é sobre movimento e som, e
 * carregar arte de verdade é o que revela se a animação funciona com o que a
 * pessoa vê no app — retângulo colorido perdoa qualquer coisa.
 */
const CARTAS = [
  'e8bad5ad-7126-47b2-b8c6-ddda2ebf95e6', // Mega Dragonite ex
  'a33b93ec-4946-4b05-92d9-94773daabcfd', // Mew ex
]

type Roteiro = 'lugar' | 'encontro' | 'giro'
type Fase = 'parado' | Roteiro

const ROTEIROS: { valor: Roteiro; nome: string; descricao: string }[] = [
  {
    valor: 'lugar',
    nome: 'Troca de lugar',
    descricao:
      'As duas cartas passam uma pela outra e assumem o lado do novo dono. É a troca dita literalmente, e é a mais curta das três.',
  },
  {
    valor: 'encontro',
    nome: 'Encontro e selo',
    descricao:
      'As cartas se encontram no meio, encostam, e o acordo é carimbado por cima. Tem momento de clímax — e é a que mais atrasa a tela.',
  },
  {
    valor: 'giro',
    nome: 'Giro',
    descricao:
      'Cada carta gira sobre o próprio eixo enquanto troca de lado. Lembra a carta virando na mão; é a mais discreta.',
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

/** Quanto dura cada cena, em segundos, antes do multiplicador de velocidade. */
const DURACAO: Record<Fase, number> = {
  parado: 0.3,
  lugar: 0.55,
  encontro: 0.45,
  giro: 0.6,
}

/**
 * As poses das duas cartas, por fase da cena.
 *
 * Declarativo, e não imperativo. A primeira versão disparava `animate()` por
 * seletor com o `useAnimate`, e não funcionou por dois motivos que valem o
 * registro: esperar os controles do motion (`await animate(...)`) nunca
 * resolvia — a tela ficava presa em "Rodando…" —, e o redesenho que o próprio
 * `setState` provoca devolvia as cartas ao lugar no meio do movimento. Com a
 * pose vindo do estado, quem manda é o React e a cena sobrevive a qualquer
 * redesenho.
 *
 * O deslocamento é percentual da própria carta (105% ≈ a largura dela mais o vão
 * de 8px), e não uma medida em pixels: as duas colunas têm a mesma largura,
 * então isso põe cada carta no lugar da outra em qualquer tela. Percentagem, e
 * não `calc()`: o motion sabe animar `x: '105%'`, mas com `calc(100% + 8px)`
 * ele não escreve transform nenhum — foi assim que a cena inteira ficou parada
 * enquanto os sons tocavam.
 */
const POSES: Record<Fase, { a: TargetAndTransition; b: TargetAndTransition }> = {
  parado: {
    a: { x: 0, y: 0, rotateY: 0, scale: 1 },
    b: { x: 0, y: 0, rotateY: 0, scale: 1 },
  },
  lugar: {
    a: { x: '105%', y: -10, rotateY: 0, scale: 1 },
    b: { x: '-105%', y: 10, rotateY: 0, scale: 1 },
  },
  encontro: {
    // Encostam, não se empilham: a 32% uma sumia atrás da outra e a cena virava
    // uma carta só. A 16% elas se tocam com o ombro, que é o gesto de acordo.
    a: { x: '16%', y: 0, rotateY: 0, scale: 0.94 },
    b: { x: '-16%', y: 0, rotateY: 0, scale: 0.94 },
  },
  giro: {
    a: { x: '105%', y: 0, rotateY: 180, scale: 1 },
    b: { x: '-105%', y: 0, rotateY: -180, scale: 1 },
  },
}

export default function LabTroca() {
  const semMovimentoDoSistema = useReducedMotion()

  const [roteiro, setRoteiro] = useState<Roteiro>('lugar')
  const [fase, setFase] = useState<Fase>('parado')
  const [somDoGesto, setSomDoGesto] = useState<Som | 'nenhum'>('deslize')
  const [somDoFecho, setSomDoFecho] = useState<Som | 'nenhum'>('fechou')
  const [volume, setVolume] = useState(0.8)
  const [velocidade, setVelocidade] = useState(1)
  const [rodando, setRodando] = useState(false)
  const [selado, setSelado] = useState(false)
  const [registro, setRegistro] = useState<string[]>([])

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
   * É ela que marca o tempo da cena: a fase entra, o relógio conta a duração
   * daquela pose, a próxima entra. As durações moram todas em `DURACAO`, então
   * relógio e animação não saem de sincronia.
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
    // seguidas tem de dar o mesmo resultado, e sem isto a segunda execução
    // começaria de onde a primeira parou.
    if (fase !== 'parado') {
      setFase('parado')
      await espera(t(DURACAO.parado))
    }

    anotar(`▶ ${ROTEIROS.find((r) => r.valor === roteiro)?.nome}`)
    soar(somDoGesto, 'as cartas saem da mão')
    setFase(roteiro)
    await espera(t(DURACAO[roteiro]))

    if (roteiro === 'encontro') {
      // Aqui o carimbo **é** o fecho: tocar o som do fecho no selo e outra vez
      // no fim seriam dois "pronto" para um acordo só.
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
    setFase('parado')
  }

  // Curva com um empurrão no fim: sobe rápido, passa um pouco do ponto e
  // assenta. É a leitura mecânica do mundo neobrutalista — peça que encaixa,
  // não bolha que flutua. O giro é o único que não a usa: carta virando na mão
  // não passa do ponto, ela para de frente.
  const transicao = {
    duration: t(DURACAO[fase]),
    ease:
      fase === 'giro'
        ? ([0.4, 0, 0.2, 1] as [number, number, number, number])
        : ([0.22, 1.15, 0.36, 1] as [number, number, number, number]),
  }

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
          Três candidatas a animação de fechamento, com som sintetizado na hora.
          Nada aqui está ligado ao fluxo real — é para escolher vendo rodar.
        </p>
      </header>

      {semMovimentoDoSistema && (
        <Cartela className="mt-5 p-4">
          <p className="font-titulo text-[14px] font-bold text-tinta">
            Seu sistema pede menos movimento.
          </p>
          <p className="mt-1.5 font-corpo text-[13px] leading-relaxed text-apagado">
            No app, isto desliga a animação inteira — quem pede menos movimento
            recebe o resultado direto. Aqui ela roda assim mesmo, senão não
            daria para avaliar; é a única mentira desta página.
          </p>
        </Cartela>
      )}

      {/* ------------------------------------------------------------ palco */}
      <div className="mt-6">
        <Cartela className="p-4">
          {/* `overflow-hidden` porque as cartas andam 105% para o lado: sem
              ele, a que sai empurrava a largura da página e o celular ganhava
              uma barra de rolagem horizontal no meio da animação. O `p-1` dá o
              vão para a sombra dura não ser cortada no repouso.

              O `data-fase` é gancho de inspeção — foi por ele que descobri que
              a cena rodava e o que não aparecia era o transform. Fica: é uma
              bancada de teste, e ver o estado por fora vale mais aqui do que a
              limpeza do markup. */}
          <div
            data-fase={fase}
            className="relative flex items-start gap-2 overflow-hidden p-1 [perspective:1200px]"
          >
            <CartaNoPalco
              carta={esquerda}
              etiqueta="Sua"
              pose={POSES[fase].a}
              transicao={transicao}
            />

            <motion.span
              animate={{
                rotate: fase === 'parado' ? 0 : 180,
                scale: fase === 'encontro' ? 0 : 1,
              }}
              transition={transicao}
              className="mt-16 grid size-8 shrink-0 place-items-center rounded-[16px] border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]"
            >
              <IconeSetaDireita className="size-4 text-tinta" />
            </motion.span>

            <CartaNoPalco
              carta={direita}
              etiqueta="Dela"
              pose={POSES[fase].b}
              transicao={transicao}
            />

            {/* O carimbo do acordo, que só o roteiro "encontro" usa. Entra
                torto e com mola, como um selo batido à mão. */}
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
              onClick={() => setRoteiro(r.valor)}
              aria-pressed={roteiro === r.valor}
              className={cn(
                'rounded-[var(--radius-controle)] border-2 border-tinta p-3 text-left transition-shadow',
                roteiro === r.valor
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
  pose,
  transicao,
}: {
  carta?: Carta
  etiqueta: string
  pose: TargetAndTransition
  transicao: Transition
}) {
  return (
    <motion.div
      animate={pose}
      transition={transicao}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta p-2',
        etiqueta === 'Sua' ? 'bg-meu' : 'bg-papel',
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
      <span className="line-clamp-2 font-titulo text-[13px] leading-tight font-bold text-tinta">
        {carta ? nomeCarta(carta) : '—'}
      </span>
    </motion.div>
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
