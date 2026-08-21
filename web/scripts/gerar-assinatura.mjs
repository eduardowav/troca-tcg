/**
 * Compõe a assinatura vertical a partir das duas peças da marca.
 *
 *   node scripts/gerar-assinatura.mjs
 *
 * Saem daqui `public/assinatura-vertical.svg` e a irmã escura. As fontes são
 * `marca.svg` e `palavra.svg`, os mesmos arquivos que o cabeçalho do app usa —
 * a assinatura vertical não é arte nova, é uma **composição** das duas.
 *
 * Por que um script e não um SVG escrito à mão: copiar os paths para um
 * terceiro arquivo criaria uma terceira cópia da marca, e o dia em que o
 * Eduardo mexer no desenho passariam a existir duas marcas parecidas. É a mesma
 * razão pela qual `gerar-icones.mjs` e `gerar-og.mjs` leem de `marca.svg` em vez
 * de guardar a arte dentro deles. Mudou a marca, rode os três.
 *
 * **As proporções não são escolha minha.** Saíram medidas do manual (v1.0,
 * página 09, "Composições da assinatura"), no pixel: a página foi rasterizada a
 * 110 dpi e as duas caixas foram lidas por varredura — ícone 126×125, palavra
 * 220×28, vão de 43, os dois centrados no mesmo eixo. As constantes abaixo são
 * essas medidas em relação à altura do ícone.
 *
 * O manual chama esta versão de "vertical | formatos estreitos": capas, cards,
 * stories, totens e composições centralizadas. A horizontal continua sendo a
 * principal — "na dúvida, use a assinatura horizontal".
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, '..', 'public')

/** Medidas do manual, em múltiplos da altura do ícone (página 09). */
const PALAVRA_ALTURA = 28 / 125
const VAO = 43 / 125

/** As cores da palavra, e só dela: o ícone é azul em qualquer aplicação. */
const PALAVRA_CLARA = '#F4EEE4'
const PALAVRA_ESCURA = '#171717'

const semComentario = (t) => t.replace(/<!--[\s\S]*?-->/g, '').trim()
const miolo = (t) =>
  t
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '')
    .trim()
const caixa = (t) =>
  t
    .match(/viewBox="([^"]+)"/)[1]
    .trim()
    .split(/\s+/)
    .map(Number)

const marca = semComentario(await readFile(join(PUBLICO, 'marca.svg'), 'utf8'))
const palavra = semComentario(await readFile(join(PUBLICO, 'palavra.svg'), 'utf8'))

const COR_ICONE = marca.match(/<svg[^>]*\sfill="([^"]+)"/)[1]

/** O `viewBox` do ícone é a prancheta, com margem própria; o desenho dentro
 *  dela é o que o manual mede. Sem descontar essa margem, o vão sairia maior do
 *  que o manual pede e a palavra ficaria mais estreita que o ícone. */
const [ivx, ivy, iw] = caixa(marca)
const ICONE_MARGEM = 55 / 720
const DESENHO = iw * (1 - 2 * ICONE_MARGEM)

const [pvx, pvy, pw, ph] = caixa(palavra)

const alturaPalavra = DESENHO * PALAVRA_ALTURA
const escalaPalavra = alturaPalavra / ph
const larguraPalavra = pw * escalaPalavra
const vao = DESENHO * VAO

/** A palavra é mais larga que o ícone (1,76×), então é ela que define a caixa. */
const LARGURA = larguraPalavra
const ALTURA = DESENHO + vao + alturaPalavra

/** O ícone entra centrado, e entra pelo desenho, não pela prancheta: é o
 *  desenho que precisa dividir o eixo com a palavra. */
const iconeX = (LARGURA - DESENHO) / 2 - ivx - iw * ICONE_MARGEM
const iconeY = -ivy - iw * ICONE_MARGEM

const palavraY = DESENHO + vao - pvy * escalaPalavra
const palavraX = -pvx * escalaPalavra

const n = (v) => Number(v.toFixed(2))
/** Vírgula, como o resto dos números escritos neste projeto. */
const pct = (v) => (v * 100).toFixed(1).replace('.', ',')

const cabecalho = (cor, quando) => `<!--
  A assinatura vertical do TrocaTCG, ${quando}.

  ARQUIVO GERADO — não edite à mão.
  Sai de \`public/marca.svg\` e \`public/palavra.svg\` por
  \`node scripts/gerar-assinatura.mjs\`.

  Ícone em cima, palavra embaixo, centrados no mesmo eixo. As proporções são as
  do manual da marca (v1.0, página 09), medidas no pixel da página rasterizada:
  a palavra tem ${pct(PALAVRA_ALTURA)}% da altura do desenho do ícone e o vão entre as
  duas tem ${pct(VAO)}%.

  É a versão para **formato estreito** — capa, card, story, totem. A horizontal
  continua sendo a principal, e é ela que o cabeçalho do app usa: o manual manda
  usá-la sempre que houver espaço.

  A cor ${cor} é da palavra. O ícone é azul em qualquer aplicação.
-->
`

const composta = (corPalavra) => `<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${n(LARGURA)} ${n(ALTURA)}"
>
  <g fill="${COR_ICONE}" transform="translate(${n(iconeX)} ${n(iconeY)})">
${miolo(marca)
  .split('\n')
  .map((l) => '    ' + l.trim())
  .join('\n')}
  </g>
  <g
    fill="${corPalavra}"
    transform="translate(${n(palavraX)} ${n(palavraY)}) scale(${escalaPalavra.toFixed(5)})"
  >
${miolo(palavra)
  .split('\n')
  .map((l) => '    ' + l.trim())
  .join('\n')}
  </g>
</svg>
`

const saidas = [
  ['assinatura-vertical.svg', PALAVRA_ESCURA, 'a que vai sobre fundo claro'],
  ['assinatura-vertical-escura.svg', PALAVRA_CLARA, 'a que vai sobre fundo escuro'],
]

for (const [nome, cor, quando] of saidas) {
  await writeFile(join(PUBLICO, nome), cabecalho(cor, quando) + composta(cor))
  console.log(`${nome} — ${n(LARGURA)}×${n(ALTURA)}`)
}
