/**
 * O painel de erro do lado do navegador (item 15 da ordem de execução).
 *
 * O que o app tinha até aqui era `console.error` dentro do limite de erro —
 * bom para o Eduardo com o inspetor remoto aberto, e inútil para os outros. A
 * tela quebrada de outra pessoa, no celular dela, não deixava rastro nenhum:
 * ela via a carta rasgada, recarregava, e a gente nunca soube que houve.
 *
 * **Três decisões, e todas custam menos do que parecem.**
 *
 * 1. `@sentry/browser`, não `@sentry/react`. O que o pacote do React traz é um
 *    limite de erro pronto e a instrumentação do roteador; o limite deste app já
 *    existe (`components/Falha.tsx`) e é melhor que o genérico, porque distingue
 *    sem internet de servidor fora de app quebrado. Sobraria o roteador, que
 *    serve ao rastreamento de desempenho — desligado aqui por causa da cota.
 *
 * 2. **Carregado sob demanda.** O `import()` mora dentro de `iniciar()`, então o
 *    SDK vira um pedaço separado do bundle e não entra no caminho da primeira
 *    pintura. Num app que abre em rede de celular, ~30 KB antes da primeira tela
 *    é preço alto para uma peça que só serve quando algo dá errado.
 *
 * 3. **Vazio é o estado normal.** Sem `VITE_SENTRY_DSN` nada é carregado e nada
 *    é enviado. Mesmo padrão do push sem chave VAPID: o app inteiro funciona sem
 *    isto, e quem desenvolve não manda o próprio erro para o painel de produção.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN

/**
 * A única função do SDK que guardamos, e o motivo é tamanho.
 *
 * Guardar o módulo inteiro (`Promise<typeof import('@sentry/browser')>`) mantém
 * vivo o namespace todo, e aí o Rollup não tem como descartar nada: entram a
 * repetição de sessão, o rastreamento e o widget de feedback, que este app não
 * usa. Medido em 2026-08-20: **153,7 KB comprimidos** guardando o módulo contra
 * **28,5 KB** guardando só a função (com as bandeiras `__SENTRY_DEBUG__` e
 * `__SENTRY_TRACING__` do `vite.config.ts`). O primeiro número é dois terços do
 * bundle do app inteiro, para uma peça que só serve quando algo dá errado.
 */
let capturar: ((erro: unknown, dica?: object) => void) | null = null

/**
 * O que quebrou antes de o SDK terminar de carregar.
 *
 * Sem esta fila haveria um buraco de alguns décimos de segundo logo na abertura
 * — e é justamente ali que mora o erro que mais importa, o que impede a primeira
 * tela de se montar. Quem quebra na abertura não recarrega: fecha o app.
 */
const espera: Array<[unknown, object | undefined]> = []

/**
 * Liga o Sentry, se houver DSN. Chamada uma vez, no `main.tsx`.
 *
 * Não devolve promessa de propósito: quem chama não tem o que esperar, e
 * `await` aqui seria um passo a mais antes da primeira tela.
 */
export function iniciarMonitoramento(): void {
  if (!DSN || capturar) return

  void import('@sentry/browser').then(({ init, captureException }) => {
    init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      // Só os erros. O rastreamento de desempenho e a repetição de sessão
      // consomem do mesmo balde de 5 mil eventos por mês do plano free, e um
      // app que ainda não abriu precisa do balde inteiro para defeito.
      tracesSampleRate: 0,
      // Sem IP e sem corpo de requisição. O painel serve para achar o defeito;
      // saber quem topou com ele não ajuda a consertar.
      sendDefaultPii: false,
      // A sessão do Supabase mora no `localStorage` deste domínio, e o SDK
      // anexa a URL de cada requisição que falhou. Um `access_token` em query
      // string viraria evento; nenhuma chamada nossa passa token por URL, e esta
      // linha é o que mantém isso verdade se um dia alguma passar.
      beforeSend(evento) {
        if (evento.request?.url) {
          evento.request.url = evento.request.url.split(/[?#]/)[0]
        }
        return evento
      },
      // Ruído que todo app na internet recebe e que não é defeito nosso:
      // extensão de navegador injetando script, tradutor automático da página,
      // e o `ResizeObserver loop` que o Chrome emite sem consequência nenhuma.
      ignoreErrors: [
        'ResizeObserver loop',
        'Non-Error promise rejection captured',
        /^chrome-extension:/,
        /^moz-extension:/,
      ],
    })
    capturar = captureException
    for (const [erro, dica] of espera.splice(0)) captureException(erro, dica)
  })
}

/**
 * Manda um erro para o painel, se houver painel.
 *
 * Quem chama é o limite de erro. Sem DSN vira nada — e o `console.error` de lá
 * continua existindo, porque na máquina de quem desenvolve ele é o painel.
 */
export function capturarErro(erro: unknown, contexto?: Record<string, unknown>): void {
  if (!DSN) return
  const dica = contexto ? { extra: contexto } : undefined
  if (capturar) capturar(erro, dica)
  // Ainda baixando: guarda para mandar quando chegar. A fila é curta por
  // construção — ela só existe durante o carregamento de um arquivo.
  else espera.push([erro, dica])
}
