/**
 * Gera o favicon e os ícones do PWA a partir da marca.
 *
 *   node scripts/gerar-icones.mjs
 *
 * A fonte é uma só: `public/marca.svg`, a arte exportada do Figma, sem fundo.
 * Deste script saem, todos derivados dela:
 *
 *   - `favicon.svg`          a marca sobre o papel do app, em quadrado arredondado
 *   - `pwa-192/512.png`      o mesmo enquadramento, rasterizado
 *   - `apple-touch-icon.png` sem canto arredondado (quem arredonda é o iOS) e
 *                            sem transparência (o iOS pinta o vão de preto)
 *   - `pwa-maskable-512.png` marca menor e fundo sangrando, porque o Android
 *                            recorta um círculo de 80% do lado
 *
 * Guardar cópias da arte em cada arquivo é o que faz uma marca virar quatro
 * marcas parecidas na primeira mudança. Trocar a marca é substituir
 * `marca.svg` e rodar isto.
 *
 * Usa o Chromium do Playwright, que já é dependência de desenvolvimento — nada
 * de ImageMagick ou sharp só para rasterizar quatro imagens.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, '..', 'public')

/** O fundo do app (`--color-papel`), e não branco puro: o ícone é a primeira
 *  coisa que se vê do produto, e ele já começa na cor em que o app abre. */
const PAPEL = '#F4EEE4'

/** O quadro do ícone e o raio do canto, na proporção do arquivo do Figma. */
const QUADRO = 640
const RAIO = 100
/** Quanto do quadro a arte ocupa — a arte, não o desenho: a exportação da
 *  identidade já vem com 7,6% de margem em cada lado.
 *
 *  O número sai da **área de proteção** do manual da marca (v1.0, 2026):
 *  "respiro mínimo: 25% da altura do ícone", e essa área tem de ficar livre de
 *  texto, borda e qualquer outro elemento. Num quadro quadrado isso quer dizer
 *  desenho + 2 × (0,25 × desenho) ≤ quadro, ou seja, desenho ≤ 2/3 do lado.
 *  Como a arte carrega os 7,6% próprios, 0,78 dela dá 0,66 de desenho e o
 *  respiro fica em 26% — pouco acima do mínimo, que é o lado certo de errar.
 *
 *  Era 0,90 até 2026-08-19, o que dava 12% de respiro: metade do que o manual
 *  pede. O ícone encolheu de propósito. */
const OCUPACAO = 0.78

const marca = (await readFile(join(PUBLICO, 'marca.svg'), 'utf8'))
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim()

/** As dimensões saem do `viewBox` do próprio arquivo, e não de dois números
 *  cravados aqui: a marca já trocou uma vez (2026-08-19, de 577×458 para
 *  720×720), e naquele dia o valor antigo não daria erro — daria um ícone
 *  esticado, que é o tipo de defeito que passa por decisão de design. */
const [, , LARGURA_MARCA, ALTURA_MARCA] = marca
  .match(/viewBox="([^"]+)"/)[1]
  .trim()
  .split(/\s+/)
  .map(Number)

/** A cor também: desde a marca nova, o azul mora num `fill` no `<svg>` de
 *  `marca.svg` e as formas herdam dele. Só que aqui o `<svg>` é descartado — o
 *  que entra no ícone são as formas —, e sem repor a cor no grupo elas herdariam
 *  o `fill="none"` do quadro e o ícone sairia **em branco**, sem erro nenhum no
 *  console. */
const COR_MARCA = marca.match(/<svg[^>]*\sfill="([^"]+)"/)[1]

/** A marca centrada no quadro, na escala pedida. */
function composta({ ocupacao = OCUPACAO, raio = RAIO } = {}) {
  const [largura, altura] = [LARGURA_MARCA, ALTURA_MARCA]
  const escala = (QUADRO * ocupacao) / largura
  const x = (QUADRO - largura * escala) / 2
  const y = (QUADRO - altura * escala) / 2

  return `<svg width="${QUADRO}" height="${QUADRO}" viewBox="0 0 ${QUADRO} ${QUADRO}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${QUADRO}" height="${QUADRO}" rx="${raio}" fill="${PAPEL}"/>
  <g fill="${COR_MARCA}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${escala.toFixed(4)})">
${marca
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')
  .trim()
  .split('\n')
  .map((linha) => '    ' + linha.trim())
  .join('\n')}
  </g>
</svg>`
}

const CABECALHO_FAVICON = `<!--
  ARQUIVO GERADO — não edite à mão.
  Sai de \`public/marca.svg\` por \`node scripts/gerar-icones.mjs\`.

  É a marca sobre o papel do app, em quadrado arredondado: o ícone do site.
  A versão sem fundo, que o cabeçalho do app usa, é a própria \`marca.svg\`.
-->
`

const PNGS = [
  { nome: 'pwa-192.png', lado: 192 },
  { nome: 'pwa-512.png', lado: 512 },
  // Sem canto e sem transparência: o iOS arredonda por conta e pinta de preto
  // qualquer vão que sobre.
  { nome: 'apple-touch-icon.png', lado: 180, raio: 0 },
  // Zona segura do Android: círculo de 80% do lado, ou seja, um quadrado de
  // 0,56 do lado inscrito nele. Como a arte traz margem própria, 0,66 dela é que
  // dá esses 0,56 de desenho — e o desenho aqui preenche os quatro cantos do
  // próprio quadro (dois círculos e duas quinas), então é o quadrado inteiro que
  // tem de caber, não uma aproximação dele.
  { nome: 'pwa-maskable-512.png', lado: 512, raio: 0, ocupacao: 0.66 },
]

await mkdir(PUBLICO, { recursive: true })
await writeFile(join(PUBLICO, 'favicon.svg'), CABECALHO_FAVICON + composta() + '\n')
console.log('favicon.svg')

const navegador = await chromium.launch()
try {
  for (const { nome, lado, raio, ocupacao } of PNGS) {
    const aba = await navegador.newPage({
      viewport: { width: lado, height: lado },
      deviceScaleFactor: 1,
    })
    await aba.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0}svg{display:block;width:${lado}px;height:${lado}px}</style>
       ${composta({ raio, ocupacao })}`,
    )
    await writeFile(
      join(PUBLICO, nome),
      await aba.locator('svg').screenshot({ omitBackground: true }),
    )
    await aba.close()
    console.log(`${nome} — ${lado}×${lado}`)
  }
} finally {
  await navegador.close()
}
