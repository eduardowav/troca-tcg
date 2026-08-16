/**
 * Confere que o CSP do `render.yaml` ainda autoriza o script inline do
 * `index.html`.
 *
 *   node scripts/conferir-csp.mjs
 *
 * **Por que isto existe.** O `index.html` tem um script inline — o que aplica o
 * tema antes da primeira pintura, para quem escolheu escuro não ver um flash
 * branco a cada abertura. Ele precisa ser inline: um `<script src>` só executa
 * depois de baixar, e o ponto dele é acontecer antes de qualquer coisa.
 *
 * Um CSP com `script-src 'self'` bloqueia script inline, e a saída barata seria
 * `'unsafe-inline'` — que desliga justamente a proteção pela qual o CSP existe.
 * A saída certa é autorizar aquele script pelo hash do conteúdo.
 *
 * O problema do hash é como ele falha: mudar uma vírgula no script invalida o
 * hash, o navegador bloqueia, e **o app continua funcionando** — só volta o
 * flash branco que ninguém liga a um arquivo de infraestrutura editado semanas
 * antes. É o mesmo formato de defeito do rate limit que passou um mês
 * configurado e inerte.
 *
 * Então o CI confere. Falha aqui é barulhenta e aponta o que fazer.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const INDEX = join(AQUI, '..', 'index.html')
const RENDER = join(AQUI, '..', '..', 'render.yaml')

/**
 * Lê normalizando CRLF para LF.
 *
 * **Sem isto, o script acusa erro no Windows e passa no Linux** — e o hash certo
 * seria o do Linux, porque é o que o CI e o Render constroem. O `.gitattributes`
 * guarda o arquivo em LF (`git ls-files --eol` diz `i/lf w/crlf`), a cópia local
 * fica em CRLF, e o SHA-256 de um texto muda inteiro com uma quebra de linha
 * diferente.
 *
 * Custou uma falsa falha na primeira execução deste script. Vale a linha.
 */
const ler = async (caminho) => (await readFile(caminho, 'utf8')).replace(/\r\n/g, '\n')

const html = await ler(INDEX)
const render = await ler(RENDER)

const inlines = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]

if (inlines.length === 0) {
  console.log('Nenhum script inline no index.html — nada a conferir.')
  process.exit(0)
}

const faltando = []
for (const [, corpo] of inlines) {
  const hash = 'sha256-' + createHash('sha256').update(corpo, 'utf8').digest('base64')
  if (!render.includes(hash)) faltando.push({ hash, corpo })
}

if (faltando.length) {
  console.error('\nCSP desatualizado: o render.yaml não autoriza script inline do index.html.\n')
  for (const { hash, corpo } of faltando) {
    console.error(`  hash esperado: '${hash}'`)
    console.error(`  trecho:        ${JSON.stringify(corpo.trim().slice(0, 70))}…\n`)
  }
  console.error('Troque o hash antigo no `Content-Security-Policy` do render.yaml.')
  console.error('Sem isso o navegador bloqueia o script — e o app não quebra, só')
  console.error('volta o flash branco no modo escuro, que ninguém vai ligar a isto.\n')
  process.exit(1)
}

console.log(`CSP confere: ${inlines.length} script inline autorizado por hash.`)
