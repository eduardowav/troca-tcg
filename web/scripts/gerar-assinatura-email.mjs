/**
 * Gera a assinatura horizontal em PNG, para os e-mails.
 *
 *   node scripts/gerar-assinatura-email.mjs
 *
 * Sai daqui `public/assinatura-email.png` — ícone e palavra lado a lado, **sem
 * fundo**, na proporção do lockup que o cabeçalho do app usa.
 *
 * **Por que PNG, e não o SVG que já existe.** Nenhum cliente de e-mail grande
 * renderiza SVG: o Gmail bloqueia, o Outlook nem tenta. Um `<img src=".svg">`
 * num e-mail não dá erro — some, e some justamente na primeira coisa que a
 * pessoa vê. É a mesma razão do `gerar-og.mjs`, e a mesma técnica: quem
 * rasteriza é o Chromium do Playwright, que já é dependência de desenvolvimento.
 *
 * **Por que 2×.** Vai declarado no e-mail com metade da largura do arquivo. Sem
 * isso, quem lê no celular (que é quase todo mundo) vê a marca borrada — a tela
 * tem o dobro dos pontos que o arquivo traz.
 *
 * **Por que sem fundo.** É o manual: a assinatura não tem caixa. O e-mail já
 * desenha o papel bege atrás, e uma marca com fundo próprio viraria um retângulo
 * mais claro colado sobre ele. O custo está escrito no `docs/emails/README.md`:
 * a tinta é escura, então os templates declaram `color-scheme: light` para o
 * cliente de e-mail não inverter o papel e apagar a marca no modo escuro.
 *
 * As proporções são as do `LockupTrocaTCG` (`components/brutal/Pecas.tsx`), que
 * é a assinatura horizontal do app: ícone de 36, palavra de 22, vão de 10. Elas
 * ficam aqui em uma constante só — mudou lá, muda aqui, e o e-mail continua
 * sendo a mesma marca que abre depois do clique.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, '..', 'public')

/** As três medidas do lockup do app, em pixels de referência. */
const ICONE = 36
const PALAVRA = 22
const VAO = 10

/** Fator de rasterização. O e-mail declara a metade desta largura. */
const ESCALA = 2

const semComentario = (t) => t.replace(/<!--[\s\S]*?-->/g, '').trim()
const miolo = (t) =>
  t
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '')
    .trim()
const caixa = (t) => t.match(/viewBox="([^"]+)"/)[1].trim()
const proporcao = (t) => {
  const [, , largura, altura] = caixa(t).split(/\s+/).map(Number)
  return largura / altura
}

const marca = semComentario(await readFile(join(PUBLICO, 'marca.svg'), 'utf8'))
const palavra = semComentario(await readFile(join(PUBLICO, 'palavra.svg'), 'utf8'))

/** A cor sai do próprio arquivo: cravá-la aqui foi o que quebrou o og.png na
 *  troca de marca de 2026-08-19. */
const COR_MARCA = marca.match(/<svg[^>]*\sfill="([^"]+)"/)[1]
/** A palavra é tinta — o `fill` do arquivo claro. */
const COR_PALAVRA = palavra.match(/<svg[^>]*\sfill="([^"]+)"/)?.[1] ?? '#171717'

const larguraIcone = ICONE * proporcao(marca)
const larguraPalavra = PALAVRA * proporcao(palavra)
const LARGURA = larguraIcone + VAO + larguraPalavra
const ALTURA = ICONE

const pagina = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; }
  .assinatura {
    width: ${LARGURA}px; height: ${ALTURA}px;
    display: flex; align-items: center; gap: ${VAO}px;
  }
  .icone { width: ${larguraIcone}px; height: ${ICONE}px; flex: none; }
  .palavra { width: ${larguraPalavra}px; height: ${PALAVRA}px; flex: none; }
</style>
<div class="assinatura">
  <svg class="icone" viewBox="${caixa(marca)}" fill="${COR_MARCA}" xmlns="http://www.w3.org/2000/svg">${miolo(marca)}</svg>
  <svg class="palavra" viewBox="${caixa(palavra)}" fill="${COR_PALAVRA}" xmlns="http://www.w3.org/2000/svg">${miolo(palavra)}</svg>
</div>`

const navegador = await chromium.launch()
const aba = await navegador.newPage({
  viewport: { width: Math.ceil(LARGURA), height: Math.ceil(ALTURA) },
  deviceScaleFactor: ESCALA,
})
await aba.setContent(pagina)
await aba.locator('.assinatura').screenshot({
  path: join(PUBLICO, 'assinatura-email.png'),
  // Sem esta linha o PNG sai com fundo branco, e o branco sobre o papel bege do
  // e-mail vira um retângulo em volta da marca.
  omitBackground: true,
})
await navegador.close()

console.log(
  `assinatura-email.png — ${Math.round(LARGURA * ESCALA)}×${Math.round(ALTURA * ESCALA)}px,` +
    ` declarar no e-mail com width="${Math.round(LARGURA)}"`,
)
