/**
 * Gera a imagem de compartilhamento (Open Graph) a partir da marca.
 *
 *   node scripts/gerar-og.mjs
 *
 * Sai daqui `public/og.png`, 1200×630 — o que aparece quando alguém cola o link
 * do TrocaTCG num grupo de WhatsApp. E o lançamento é por grupo de WhatsApp:
 * sem esta imagem, o link vira uma linha cinza com o endereço cru, que é a
 * diferença entre "olha isso" e um link que ninguém toca.
 *
 * Mesma fonte e mesma técnica de `gerar-icones.mjs`: a arte é `public/marca.svg`
 * e quem rasteriza é o Chromium do Playwright, que já é dependência de
 * desenvolvimento. Mudou a marca, rode os dois scripts.
 *
 * **Por que PNG e não SVG:** o WhatsApp, o Facebook e o iMessage não renderizam
 * SVG em prévia de link. Um `og:image` apontando para SVG não quebra — some, que
 * é pior, porque não dá erro em lugar nenhum.
 *
 * As proporções não são escolha estética. 1200×630 é a razão 1.91:1 que o
 * WhatsApp e o Facebook recortam sem cortar nada; qualquer outra vira uma tesoura
 * passando no meio do desenho.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, '..', 'public')

/** Os mesmos tokens do app — a prévia é a primeira tela que a pessoa vê dele. */
const PAPEL = '#F4EEE4'
const TINTA = '#171717'
const AZUL = '#0067FF'
/** O texto sobre o azul. Não é o papel: o bege sobre #0067FF dá 4,15:1 e
 *  reprova o piso de 4,5:1 — o branco da cartela dá 4,79:1 e passa. É a mesma
 *  conta que fixou `--color-azul-tinta` em branco no `index.css`. */
const SOBRE_AZUL = '#FFFDF5'

const LARGURA = 1200
const ALTURA = 630

const arquivoMarca = (await readFile(join(PUBLICO, 'marca.svg'), 'utf8'))
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim()

/** O `viewBox` e a cor saem do próprio arquivo. Cravá-los aqui foi o que
 *  quebrou na troca de marca de 2026-08-19: o quadro antigo (577×458) esticaria
 *  o ícone novo, e a cor, que agora mora num `fill` no `<svg>` — descartado
 *  logo abaixo —, deixaria as formas herdarem o `fill="none"` do quadro e sairia
 *  uma prévia com um vão branco no lugar da marca, sem erro nenhum. */
const CAIXA_MARCA = arquivoMarca.match(/viewBox="([^"]+)"/)[1]
const COR_MARCA = arquivoMarca.match(/<svg[^>]*\sfill="([^"]+)"/)[1]
const [, , LARGURA_MARCA, ALTURA_MARCA] = CAIXA_MARCA.trim().split(/\s+/).map(Number)

const marca = arquivoMarca
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')
  .trim()

/**
 * A prévia.
 *
 * Texto grande e poucas palavras: no WhatsApp esta imagem aparece com cerca de
 * 300 px de largura, e o que não se lê nesse tamanho não está lá. Por isso a
 * frase é a promessa do produto em cinco palavras, e não a descrição inteira que
 * o `og:description` já carrega em texto de verdade — repeti-la na imagem gasta
 * o espaço em que ela não pode ser lida.
 *
 * A borda grossa e a sombra dura são o mundo do app (ver o contrato de direção
 * no `index.html`): a prévia precisa parecer a mesma coisa que abre depois do
 * toque, senão o link promete um produto e entrega outro.
 */
const pagina = `<!doctype html>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=Inter:wght@500&display=swap');
  html, body { margin: 0; }
  .quadro {
    width: ${LARGURA}px; height: ${ALTURA}px;
    background: ${PAPEL};
    display: flex; align-items: center; gap: 64px;
    padding: 0 88px; box-sizing: border-box;
    font-family: 'Outfit', system-ui, sans-serif;
    position: relative; overflow: hidden;
  }
  /* A faixa azul na base é o mesmo azul de ação do app, e existe para a imagem
     não terminar em creme sobre o fundo branco da conversa — sem ela a prévia
     não tem onde acabar. */
  .faixa {
    position: absolute; left: 0; right: 0; bottom: 0; height: 18px;
    background: ${AZUL};
  }
  /* A altura manda e a largura acompanha a proporção do arquivo: a marca já
     mudou de formato uma vez (era mais larga que alta, virou quadrada), e um par
     de números cravados aqui a teria achatado sem avisar. */
  .arte {
    width: ${(300 * LARGURA_MARCA) / ALTURA_MARCA}px; height: 300px; flex: none;
    filter: drop-shadow(10px 10px 0 ${TINTA});
  }
  .texto { display: flex; flex-direction: column; gap: 18px; }
  h1 {
    margin: 0; font-size: 76px; line-height: 0.98; font-weight: 900;
    color: ${TINTA}; letter-spacing: -0.02em;
  }
  /* 24ch mantém a frase em duas linhas. Em quatro ela empilha peso na metade
     de cima e deixa um vazio embaixo que parece erro de recorte — e recorte é
     exatamente o que o leitor suspeita numa prévia de link. */
  p {
    margin: 0; font-family: 'Inter', system-ui, sans-serif;
    font-size: 30px; line-height: 1.35; font-weight: 500;
    color: ${TINTA}; opacity: 0.72; max-width: 24ch;
  }
  .selo {
    align-self: flex-start; margin-top: 6px;
    border: 4px solid ${TINTA}; border-radius: 999px;
    padding: 10px 22px; background: ${AZUL}; color: ${SOBRE_AZUL};
    font-size: 24px; font-weight: 800; letter-spacing: 0.02em;
    box-shadow: 6px 6px 0 ${TINTA};
  }
</style>
<div class="quadro">
  <svg class="arte" viewBox="${CAIXA_MARCA}" fill="${COR_MARCA}" xmlns="http://www.w3.org/2000/svg">
    ${marca}
  </svg>
  <div class="texto">
    <h1>Troque cartas<br>sem procurar</h1>
    <p>Você diz o que tem e o que quer. O app acha com quem trocar.</p>
    <div class="selo">Pokémon TCG · Belém</div>
  </div>
  <div class="faixa"></div>
</div>
`

await mkdir(PUBLICO, { recursive: true })

const navegador = await chromium.launch()
try {
  const aba = await navegador.newPage({
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: 1,
  })
  await aba.setContent(pagina)
  // As fontes vêm da rede; sem esperar, o texto sai no fallback do sistema e a
  // imagem fica com outra tipografia que a do app.
  await aba.evaluate(() => document.fonts.ready)
  await writeFile(join(PUBLICO, 'og.png'), await aba.locator('.quadro').screenshot())
  console.log(`og.png — ${LARGURA}×${ALTURA}`)
} finally {
  await navegador.close()
}
