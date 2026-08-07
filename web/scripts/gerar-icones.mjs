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
const PAPEL = '#FFFDF5'

/** O quadro do ícone e o raio do canto, na proporção do arquivo do Figma. */
const QUADRO = 640
const RAIO = 100
/** Quanto do quadro a marca ocupa. O resto é a margem que todo ícone de app
 *  tem — sem ela a arte encosta na borda e some quando o sistema arredonda. */
const OCUPACAO = 0.76

const marca = (await readFile(join(PUBLICO, 'marca.svg'), 'utf8'))
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim()

/** A marca centrada no quadro, na escala pedida. */
function composta({ ocupacao = OCUPACAO, raio = RAIO } = {}) {
  const [largura, altura] = [577, 458]
  const escala = (QUADRO * ocupacao) / largura
  const x = (QUADRO - largura * escala) / 2
  const y = (QUADRO - altura * escala) / 2

  return `<svg width="${QUADRO}" height="${QUADRO}" viewBox="0 0 ${QUADRO} ${QUADRO}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${QUADRO}" height="${QUADRO}" rx="${raio}" fill="${PAPEL}"/>
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${escala.toFixed(4)})">
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
  // Zona segura do Android: círculo de 80% do lado.
  { nome: 'pwa-maskable-512.png', lado: 512, raio: 0, ocupacao: 0.56 },
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
