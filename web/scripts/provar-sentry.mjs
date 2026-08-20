/**
 * Prova que o painel de erro do PWA envia — e que o CSP deixa.
 *
 *   npm run provar:sentry
 *
 * Este projeto já foi enganado duas vezes por proteção configurada que não fazia
 * nada (o freio da API, em `core/limitador.py`). O Sentry erra do mesmo jeito, e
 * pior: quando não chega evento nenhum, o painel vazio **parece boa notícia**.
 * Só olhando o fio dá para separar "não houve erro" de "o erro não saiu daqui".
 *
 * São dois modos de falhar, e este script cobre os dois:
 *
 * 1. **O SDK não inicializa.** Falta o DSN no build, o `import()` não é
 *    disparado, `capturarErro` vira função vazia.
 * 2. **O navegador bloqueia o envio.** O `connect-src` do `render.yaml` precisa
 *    listar o host do ingest, e o host carrega o id da organização. Errar aqui
 *    não quebra nada visível: a requisição morre no console de quem usa o app.
 *
 * Por isso o servidor daqui devolve **o CSP de verdade**, lido do `render.yaml`
 * — não uma cópia. Copiar o cabeçalho seria testar a cópia.
 *
 * Nada sai desta máquina: a rota do ingest é interceptada e respondida
 * localmente. O DSN é sintético.
 *
 * O controle negativo importa tanto quanto o teste: com `CONTROLE=1` os hosts do
 * Sentry são retirados do CSP e o envio **tem** de ser bloqueado. Sem isso não
 * há como saber se o teste está medindo alguma coisa.
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = join(AQUI, '..')
// Build próprio, em pasta própria: o `dist` normal não fica com um DSN de
// mentira dentro à espera de alguém rodar `npm run preview` e se enganar.
const DIST = join(WEB, 'dist-prova')
const RENDER_YAML = join(WEB, '..', 'render.yaml')

/** DSN sintético, com host que casa com o curinga do CSP. */
const DSN = 'https://exemplo@o1.ingest.us.sentry.io/1'
const PORTA = 4321

/** O `Content-Security-Policy` do `render.yaml`, o mesmo que o Render serve. */
async function cspDeProducao() {
  const linhas = (await readFile(RENDER_YAML, 'utf8')).split('\n')
  const cabecalho = linhas.findIndex((l) => l.includes('name: Content-Security-Policy'))
  if (cabecalho < 0) throw new Error('render.yaml sem Content-Security-Policy')
  // Duas linhas abaixo do `name:` começa o bloco `value: >-`; ele termina na
  // primeira linha em branco, comentário ou próximo item da lista.
  const corpo = linhas.slice(cabecalho + 2)
  const fim = corpo.findIndex((l) => /^\s*(- path|#|$)/.test(l))
  return corpo
    .slice(0, fim)
    .map((l) => l.trim())
    .join(' ')
}

const TIPOS = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

async function servir(csp) {
  const servidor = createServer(async (req, res) => {
    const caminho = req.url.split('?')[0]
    let arquivo = join(DIST, caminho === '/' ? 'index.html' : caminho)
    let corpo
    try {
      corpo = await readFile(arquivo)
    } catch {
      // SPA: qualquer caminho desconhecido devolve o index, como o Render faz.
      arquivo = join(DIST, 'index.html')
      corpo = await readFile(arquivo)
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
      'Content-Security-Policy': csp,
    })
    res.end(corpo)
  })
  await new Promise((pronto) => servidor.listen(PORTA, pronto))
  return servidor
}

// O build precisa do DSN em tempo de compilação: sem ele o `import()` do SDK é
// código morto e o Rollup o remove inteiro — que é o comportamento certo em
// desenvolvimento, e o que tornaria esta prova impossível de fazer sobre o
// `dist` de sempre.
console.log('Compilando com um DSN de mentira…')
// O binário do vite pelo caminho, e não por `npx`: o atalho `.cmd` do Windows
// não é executável para o `spawn` sem shell, e a falha vinha sem mensagem.
const build = spawnSync(
  process.execPath,
  [
    join(WEB, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--outDir',
    'dist-prova',
    '--logLevel',
    'warn',
  ],
  { cwd: WEB, env: { ...process.env, VITE_SENTRY_DSN: DSN }, stdio: 'inherit' },
)
if (build.status !== 0) {
  console.error(build.error ?? 'vite build falhou')
  process.exit(build.status ?? 1)
}

let csp = await cspDeProducao()
const controle = Boolean(process.env.CONTROLE)
if (controle) {
  csp = csp
    .split(' ')
    .filter((t) => !t.includes('sentry.io'))
    .join(' ')
}

const servidor = await servir(csp)
const navegador = await chromium.launch()
const pagina = await navegador.newPage()

const envios = []
const bloqueios = []
await pagina.route('**/*.ingest.*.sentry.io/**', async (rota) => {
  envios.push(rota.request().url())
  await rota.fulfill({ status: 200, body: '{}' })
})
pagina.on('console', (m) => {
  if (/Content Security Policy|Refused to/.test(m.text())) bloqueios.push(m.text())
})

await pagina.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle' })

// Quebra do jeito que uma tela quebra de verdade: exceção não tratada.
await pagina.evaluate(() => {
  setTimeout(() => {
    throw new Error('prova do painel de erro')
  }, 0)
})
await pagina.waitForTimeout(2500)

await navegador.close()
servidor.close()
await rm(DIST, { recursive: true, force: true })

console.log(`\nenvios ao Sentry: ${envios.length}`)
for (const url of envios) console.log('  ', url.split('?')[0])
console.log(`bloqueios de CSP: ${bloqueios.length}`)
for (const b of bloqueios) console.log('  ', b.slice(0, 140))

const esperado = controle
  ? envios.length === 0 && bloqueios.length > 0
  : envios.length > 0 && bloqueios.length === 0

if (!esperado) {
  console.error(
    controle
      ? '\nControle negativo falhou: sem os hosts no CSP o envio deveria ter sido bloqueado.'
      : '\nO evento não saiu. Confira o `connect-src` do render.yaml (o host do' +
          ' ingest precisa estar lá) e o `import()` de src/lib/erros.ts.',
  )
  process.exit(1)
}
console.log(controle ? '\nControle negativo confere.' : '\nO painel de erro recebe.')
