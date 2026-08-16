/**
 * Gera os screenshots que o manifesto declara.
 *
 *   npm run dev            # noutro terminal
 *   node scripts/gerar-screenshots.mjs [url]
 *
 * Saem daqui `public/screenshot-estreito.png` e `public/screenshot-largo.png`.
 * São o que o Chrome mostra na caixa de instalação do PWA: sem eles a caixa
 * aparece como um alerta de sistema com o nome do app e nada mais; com eles, ela
 * vira uma prévia parecida com a de uma loja de aplicativos. É a diferença entre
 * "algum site quer se instalar" e "este app quer se instalar".
 *
 * **Os dois formatos não são opcionais.** O Chrome escolhe por `form_factor`: no
 * celular usa `narrow`, no desktop usa `wide`, e se faltar o do contexto ele
 * ignora os dois e volta para a caixa sem prévia. Declarar só um é o mesmo que
 * não declarar nenhum na metade dos casos.
 *
 * A tela capturada é a **pública** (`/`), e por dois motivos: ela não exige
 * sessão, o que faz este script rodar sem credencial nenhuma, e é ela que
 * descreve o produto para quem ainda não entrou — que é exatamente quem lê a
 * caixa de instalação.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, '..', 'public')
const URL = process.argv[2] ?? 'http://localhost:5173'

/**
 * `narrow` na proporção de celular, `wide` na de desktop.
 *
 * O Chrome pede largura mínima de 720 para o `wide` e rejeita em silêncio o que
 * não atende — "em silêncio" aqui quer dizer que a caixa volta a ser a de sempre
 * e ninguém descobre por quê.
 */
const ALVOS = [
  { nome: 'screenshot-estreito.png', largura: 720, altura: 1280 },
  { nome: 'screenshot-largo.png', largura: 1280, altura: 720 },
]

await mkdir(PUBLICO, { recursive: true })

const navegador = await chromium.launch()
try {
  for (const { nome, largura, altura } of ALVOS) {
    const aba = await navegador.newPage({
      viewport: { width: largura, height: altura },
      deviceScaleFactor: 1,
      // O manifesto tem `theme_color` e `background_color` claros, e a caixa de
      // instalação é do sistema. Uma prévia escura ao lado deles leria como
      // outro app — o tema claro é o que o app promete ao ser instalado.
      colorScheme: 'light',
    })
    await aba.goto(URL, { waitUntil: 'networkidle' })
    await aba.evaluate(() => document.fonts.ready)
    await writeFile(join(PUBLICO, nome), await aba.screenshot())
    await aba.close()
    console.log(`${nome} — ${largura}×${altura}`)
  }
} finally {
  await navegador.close()
}
