import type { ReactNode } from 'react'
import { useState } from 'react'

import { Cartela } from '@/components/brutal/Pecas'
import { cn } from '@/lib/cn'

/**
 * Laboratório do azul de link — rota de desenvolvimento, fora de produção.
 *
 * Existe para uma decisão só, a que o `DESIGN.md` registra em "Achado em aberto:
 * azul de link no escuro": o azul da marca sobre a cartela escura dá 3,40:1 e
 * reprova o piso AA que o próprio documento fixa para texto. Em peça com borda de 2px o
 * mesmo azul funciona — ali quem separa do fundo é a borda, não a tinta —, mas
 * em **link solto** não há borda nenhuma fazendo esse trabalho.
 *
 * As duas saídas estão aqui lado a lado, com as mesmas amostras reais do app,
 * porque a escolha é de desenho e se faz vendo, não lendo número.
 *
 * **Os números são calculados na tela, não copiados.** A conta de contraste roda
 * sobre os hexadecimais que estão em `index.css` hoje; se um token mudar lá e
 * ninguém mexer aqui, esta rota passa a mostrar o valor novo em vez de repetir
 * um valor velho preso num comentário.
 *
 * **A decisão já foi tomada** (2026-08-13): link solto virou a etiqueta da
 * coluna B, link dentro de frase virou tinta sublinhada — a regra inteira está
 * no `DESIGN.md`, em "As duas formas de link", e nas peças `AcaoSecundaria` e
 * `LinkNoTexto`. A coluna "Como está hoje" mostra, daqui para a frente, como o
 * app **era**.
 *
 * O segundo achado — azul como texto que não é link — fechou em 2026-08-19,
 * pela saída A: o tema escuro passou a ter um `--color-azul-texto` clareado, e
 * com ele o preço do par e a etiqueta RARA passam. A rota fica de pé como
 * bancada: a conta aqui é a mesma, e é onde se julga o próximo tom que alguém
 * queira mexer. O `import.meta.env.DEV` em `App.tsx` garante que ela nunca
 * chegue ao usuário.
 */

/* ------------------------------------------------------------------ contraste
 *
 * WCAG 2.x: luminância relativa de cada cor, razão entre a mais clara e a mais
 * escura com o mesmo `+0,05` dos dois lados. Piso de 4,5:1 para texto miúdo e
 * 3:1 para elemento não-textual — borda, ícone.
 */
function canal(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminancia(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = canal((n >> 16) & 255)
  const g = canal((n >> 8) & 255)
  const b = canal(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

/**
 * Os tokens de `index.css`, repetidos aqui de propósito.
 *
 * A conta precisa de hexadecimal, e o que o navegador entrega em
 * `getComputedStyle` é a cor já resolvida do tema que está valendo — o que
 * impediria mostrar claro e escuro na mesma página, que é o ponto desta rota.
 */
const COR = {
  azul: '#0067ff',
  azulNoEscuro: '#3385ff',
  papelEscuro: '#171717',
  cartelaEscura: '#202020',
  tintaEscura: '#f4eee4',
  bordaEscura: '#6b6b6b',
  papelClaro: '#f4eee4',
  cartelaClara: '#fffdf5',
  tintaClara: '#171717',
} as const

type Saida = 'atual' | 'claro' | 'etiqueta'
type Tema = 'escuro' | 'claro'

interface Coluna {
  saida: Saida
  nome: string
  resumo: string
  custo: string
}

const COLUNAS: Coluna[] = [
  {
    saida: 'atual',
    nome: 'Como está hoje',
    resumo: '#0067FF, o azul da marca puro, sublinhado.',
    custo: 'Reprova AA no escuro (3,40:1 na cartela). É o achado.',
  },
  {
    saida: 'claro',
    nome: 'Saída A — clarear',
    resumo: '#3385FF no escuro — o azul da marca clareado 20%.',
    custo: 'Foi esta que entrou, em 2026-08-19, como `--color-azul-texto`.',
  },
  {
    saida: 'etiqueta',
    nome: 'Saída B — etiqueta',
    resumo: 'Borda de 2px e texto na tinta, como a saída da tela de falha.',
    custo: 'Mantém o azul da marca, mas muda 19 links um a um.',
  },
]

export default function LabAzul() {
  const [tema, setTema] = useState<Tema>('escuro')

  const papel = tema === 'escuro' ? COR.papelEscuro : COR.papelClaro
  const cartela = tema === 'escuro' ? COR.cartelaEscura : COR.cartelaClara
  const tinta = tema === 'escuro' ? COR.tintaEscura : COR.tintaClara
  const borda = tema === 'escuro' ? COR.bordaEscura : COR.tintaClara

  // O azul de link de cada saída, no tema que está na tela. A saída A só clareia
  // no escuro: no papel claro o #3385FF cai a 3,2:1 e reprova, e é por isso que
  // ela é uma sobrescrita dentro de `[data-tema='escuro']`, e não um token novo
  // valendo para os dois temas.
  const azulDaSaida = (saida: Saida) =>
    saida === 'claro' && tema === 'escuro' ? COR.azulNoEscuro : COR.azul

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <header>
        <p className="font-dado text-[11px] uppercase text-apagado">
          Rota de desenvolvimento
        </p>
        <h1 className="mt-1 font-titulo text-[26px] leading-[1.1] font-black text-tinta">
          Laboratório do azul de link
        </h1>
        <p className="mt-2 max-w-2xl font-corpo text-[14px] leading-relaxed text-apagado">
          As mesmas amostras reais do app nas três versões: como está hoje e as
          duas saídas. Nada aqui está ligado a tela nenhuma — os links não
          navegam. O problema só existe no papel escuro; o interruptor de tema
          está aí para conferir que a correção não estraga o claro.
        </p>
      </header>

      {/* --------------------------------------------------------------- tema */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-dado text-[11px] uppercase text-apagado">
          Papel
        </span>
        {(['escuro', 'claro'] as Tema[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTema(t)}
            aria-pressed={tema === t}
            className={cn(
              'rounded-[var(--radius-etiqueta)] border-2 border-tinta px-2.5 py-1.5',
              'font-titulo text-[11px] font-extrabold uppercase transition-shadow',
              tema === t
                ? 'bg-azul text-azul-tinta'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------ legenda */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {COLUNAS.map((coluna) => {
          // Na etiqueta quem lê é a tinta sobre a cartela; nas outras duas é o
          // azul sobre o papel, que é o fundo mais escuro dos dois e portanto o
          // caso pior. É essa a diferença que a legenda precisa mostrar.
          const razao =
            coluna.saida === 'etiqueta'
              ? contraste(tinta, cartela)
              : contraste(azulDaSaida(coluna.saida), papel)

          return (
            <section
              key={coluna.saida}
              className="rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-3"
            >
              <h2 className="font-titulo text-[14px] font-black text-tinta">
                {coluna.nome}
              </h2>
              <p className="mt-1 font-corpo text-[12px] leading-relaxed text-apagado">
                {coluna.resumo}
              </p>
              <p className="mt-1.5 font-corpo text-[12px] leading-relaxed text-apagado">
                {coluna.custo}
              </p>
              <Selo razao={razao} />

              {/* No claro a saída A é idêntica à de hoje, e a bancada tem de
                  dizer isso — três colunas com dois desenhos iguais e nenhuma
                  explicação leem como defeito da rota. */}
              {coluna.saida === 'claro' && tema === 'claro' && (
                <p className="mt-1.5 font-corpo text-[12px] leading-relaxed text-apagado">
                  No papel claro ela não muda nada: é sobrescrita do escuro.
                </p>
              )}
            </section>
          )
        })}
      </div>

      {/* ------------------------------------------------------------ amostras
          Uma fileira por amostra, e não uma coluna por saída.
          --------------------------------------------------------------------
          Em colunas, a etiqueta é mais alta que o link sublinhado e desalinha
          tudo o que vem abaixo dela: comparar a terceira amostra exigia rolar
          três painéis de alturas diferentes. Por fileira, os três tratamentos
          do mesmo trecho ficam sempre na mesma linha do olho — que é o gesto
          que esta rota existe para permitir. */}
      <div className="mt-6 flex flex-col gap-5">
        {AMOSTRAS.map((amostra) => (
          <div key={amostra.onde}>
            <p className="font-dado text-[10px] uppercase text-apagado">
              {amostra.onde}
            </p>
            <div className="mt-1.5 grid gap-3 md:grid-cols-3">
              {COLUNAS.map((coluna) => (
                /* O palco. `data-tema` aqui, e não no `<html>`, é o que põe os
                   três tratamentos na mesma página: o tema é um atributo, e a
                   regra de `index.css` vale para qualquer elemento que o
                   carregue.

                   Quem sobrescreve, desde 2026-08-19, é a coluna "como está
                   hoje" — invertido de propósito: a saída A **entrou**, e o
                   tema escuro já entrega `--color-azul-texto` clareado. Para
                   mostrar o achado é preciso desfazer a correção neste pedaço
                   da árvore, não aplicá-la. */
                <div
                  key={coluna.saida}
                  data-tema={tema === 'escuro' ? 'escuro' : undefined}
                  style={
                    coluna.saida === 'atual' && tema === 'escuro'
                      ? { ['--color-azul-texto' as string]: COR.azul }
                      : undefined
                  }
                  className="rounded-[var(--radius-cartela)] border-2 border-tinta bg-papel p-3"
                >
                  {/* No celular as três versões ficam empilhadas e perdem a
                      legenda de cima; aqui cada uma volta a dizer o nome. */}
                  <p className="font-dado text-[10px] uppercase text-apagado md:hidden">
                    {coluna.nome}
                  </p>
                  <div className="mt-1.5 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-3 md:mt-0">
                    {amostra.corpo(coluna.saida)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* --------------------------------------------------------------- conta */}
      <section className="mt-8">
        <h2 className="font-titulo text-[15px] font-black text-tinta">
          A conta, no papel {tema}
        </h2>
        <p className="mt-1.5 max-w-2xl font-corpo text-[13px] leading-relaxed text-apagado">
          Piso de 4,5:1 para texto miúdo e 3:1 para borda. A cartela é fundo de
          bloco e o papel é fundo de página — no escuro o azul reprova nos dois,
          e por margem maior sobre a cartela, que é onde a maioria destes links
          mora.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <Linha
            rotulo="Azul da marca sobre o papel"
            razao={contraste(COR.azul, papel)}
            piso={4.5}
          />
          <Linha
            rotulo="Azul da marca sobre a cartela"
            razao={contraste(COR.azul, cartela)}
            piso={4.5}
          />
          <Linha
            rotulo="Azul clareado sobre o papel"
            razao={contraste(COR.azulNoEscuro, papel)}
            piso={4.5}
          />
          <Linha
            rotulo="Azul clareado sobre a cartela"
            razao={contraste(COR.azulNoEscuro, cartela)}
            piso={4.5}
          />
          <Linha
            rotulo="Tinta sobre a cartela — o texto da etiqueta"
            razao={contraste(tinta, cartela)}
            piso={4.5}
          />
          <Linha
            rotulo="Borda sobre o papel — a moldura da etiqueta"
            razao={contraste(borda, papel)}
            piso={3}
          />
        </div>

        {tema === 'claro' && (
          <Cartela className="mt-4 p-4">
            <p className="font-titulo text-[14px] font-bold text-tinta">
              É por isto que a saída A vive dentro do escuro.
            </p>
            <p className="mt-1.5 font-corpo text-[13px] leading-relaxed text-apagado">
              O azul clareado sobre a cartela do tema claro dá{' '}
              {contraste(COR.azulNoEscuro, COR.cartelaClara).toFixed(2)}:1 e
              reprovaria o piso de texto no papel claro, onde hoje o azul da
              marca passa com {contraste(COR.azul, COR.cartelaClara).toFixed(2)}
              :1. Clarear vale como sobrescrita de tema, nunca como troca do
              token.
            </p>
          </Cartela>
        )}
      </section>
    </div>
  )
}

/** O número de contraste da coluna, com o veredito junto. */
function Selo({ razao }: { razao: number }) {
  const passa = razao >= 4.5
  return (
    <p
      className={cn(
        'mt-2.5 inline-block rounded-[var(--radius-etiqueta)] border-2 px-2 py-1',
        'font-dado text-[11px] font-bold uppercase',
        passa
          ? 'border-tinta bg-meu text-tinta'
          : 'border-alerta bg-alerta-fraco text-alerta',
      )}
    >
      {razao.toFixed(2)}:1 — {passa ? 'passa AA' : 'reprova AA'}
    </p>
  )
}

function Linha({
  rotulo,
  razao,
  piso,
}: {
  rotulo: string
  razao: number
  piso: number
}) {
  const passa = razao >= piso
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-3 py-2">
      <span className="font-corpo text-[13px] text-tinta">{rotulo}</span>
      <span
        className={cn(
          'shrink-0 font-dado text-[12px] font-bold',
          passa ? 'text-tinta' : 'text-alerta',
        )}
      >
        {razao.toFixed(2)}:1 {passa ? '✓' : '✕'}{' '}
        <span className="text-apagado">piso {piso}</span>
      </span>
    </div>
  )
}

/**
 * As cinco amostras, copiadas das telas onde elas moram hoje.
 *
 * Três delas são links **dentro de uma frase** — e é aí que a saída B cobra o
 * preço dela, porque uma etiqueta de borda no meio de um parágrafo quebra a
 * linha do texto. Elas estão aqui por isso: uma bancada só com links soltos
 * decidiria a favor da etiqueta sem mostrar o que ela custa.
 */
const AMOSTRAS: { onde: string; corpo: (saida: Saida) => ReactNode }[] = [
  {
    onde: 'Home — bloco de confiança',
    corpo: (saida) => (
      <>
        <p className="font-corpo text-[13px] leading-relaxed text-apagado">
          Não vende, não compra, não guarda carta e não fica com comissão.
        </p>
        <Elo saida={saida} solto>
          Termos e privacidade
        </Elo>
      </>
    ),
  },
  {
    onde: 'Entrar — aceite dos termos',
    corpo: (saida) => (
      <p className="font-corpo text-[13px] leading-relaxed text-apagado">
        Li e aceito os <Elo saida={saida}>termos de uso</Elo>. Entendo que o
        TrocaTCG apenas conecta pessoas.
      </p>
    ),
  },
  {
    onde: 'Matches — lista vazia',
    corpo: (saida) => (
      <>
        <p className="font-corpo text-[13px] leading-relaxed text-apagado">
          Nenhum match ainda.
        </p>
        <Elo saida={saida} solto>
          Ajustar minhas cartas
        </Elo>
      </>
    ),
  },
  {
    onde: 'Minhas cartas — colar lista',
    corpo: (saida) => (
      <p className="font-corpo text-[13px] leading-relaxed text-apagado">
        Tem uma lista pronta? <Elo saida={saida}>Cole de uma vez</Elo>
      </p>
    ),
  },
  {
    onde: 'Perfil público — é você',
    corpo: (saida) => (
      <p className="font-corpo text-[13px] leading-relaxed text-apagado">
        Este é o seu perfil, como a comunidade o vê.{' '}
        <Elo saida={saida}>Editar</Elo>
      </p>
    ),
  },
]

/**
 * Um link de amostra.
 *
 * O `href` existe para o elemento receber foco de teclado — o anel de foco faz
 * parte do que está sendo julgado —, e o clique é barrado porque nenhuma destas
 * amostras leva a lugar nenhum.
 *
 * `solto` diz que o link está sozinho numa linha; sem ele, o link é palavra no
 * meio de um parágrafo e a etiqueta tem de caber ali dentro.
 */
function Elo({
  saida,
  solto,
  children,
}: {
  saida: Saida
  solto?: boolean
  children: ReactNode
}) {
  if (saida === 'etiqueta') {
    return (
      <a
        href="#amostra"
        onClick={(e) => e.preventDefault()}
        className={cn(
          'rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-cartela',
          'px-3 py-1.5 font-dado text-[11px] font-bold uppercase text-tinta',
          'shadow-[var(--shadow-duro-xs)] transition-shadow hover:shadow-[var(--shadow-duro-sm)]',
          solto ? 'mt-3 inline-block' : 'inline-block align-baseline',
        )}
      >
        {children}
      </a>
    )
  }

  return (
    <a
      href="#amostra"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'font-corpo text-[13px] font-medium text-azul underline underline-offset-2',
        solto && 'mt-3 inline-block',
      )}
    >
      {children}
    </a>
  )
}
