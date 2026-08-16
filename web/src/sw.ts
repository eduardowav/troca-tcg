/// <reference lib="webworker" />

/**
 * O service worker do app.
 *
 * Ele existia antes desta leva, gerado inteiro pelo `vite-plugin-pwa` no modo
 * `generateSW` — que dá cache offline e nada mais. Push exige tratar o evento
 * `push`, e evento não se declara num arquivo gerado: por isso o plugin passou
 * para `injectManifest`, onde o arquivo é este e o plugin só injeta a lista de
 * coisas para precachear (`self.__WB_MANIFEST`).
 *
 * O que o app tinha continua aqui — precache com limpeza de versões velhas e
 * o desvio de navegação que faz o PWA abrir qualquer rota offline. O que é novo
 * são os dois eventos do fim.
 */
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

/**
 * O que a notificação carrega — o mesmo JSON que `services/push.py` monta.
 *
 * Não há `corpo`: na tela de bloqueio o aviso é uma linha. A segunda frase mora
 * na caixa do app, que é onde há espaço para ela.
 */
interface AvisoPush {
  tipo?: string
  titulo?: string
  link?: string | null
}

// `autoUpdate` no plugin significa: a versão nova assume assim que chega, sem
// esperar todas as abas fecharem. Sem estas duas linhas o modo `injectManifest`
// não faz isso sozinho, e o app ficaria preso na versão anterior até a pessoa
// fechar tudo — que num PWA instalado quase nunca acontece.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// O app é uma SPA: `/propostas/abc` não é arquivo nenhum no servidor. Sem este
// desvio, abrir o app offline em qualquer rota que não seja a raiz daria erro
// de rede. No modo gerado isto vinha de graça; aqui é declarado.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/**
 * Chegou um aviso do serviço de push.
 *
 * O texto vem pronto do backend — o worker não traduz nada e não sabe de
 * usuário. É a mesma decisão que faz `titulo` e `corpo` morarem na tabela: aqui
 * não há acesso a tradução, a idioma nem a estado do app.
 *
 * `tag` pelo tipo faz o sistema **substituir** o aviso anterior do mesmo tipo em
 * vez de empilhar: três contrapropostas na mesma noite são uma notícia, não
 * três — e a caixa do app guarda todas de qualquer forma.
 */
self.addEventListener('push', (evento: PushEvent) => {
  let aviso: AvisoPush = {}
  try {
    aviso = (evento.data?.json() ?? {}) as AvisoPush
  } catch {
    // Push sem corpo, ou com corpo que não é o nosso. Acontece com o "teste"
    // que alguns navegadores mandam pelo DevTools — e um worker que estoura
    // aqui deixa de mostrar a notificação, o que é pior que mostrar a genérica.
    aviso = {}
  }

  evento.waitUntil(mostrar(aviso))
})

/**
 * Mostra o aviso — se ainda houver permissão para isso.
 *
 * **A permissão pode ter sumido com a inscrição ainda viva.** Revogar o aviso
 * nas configurações do navegador não avisa o servidor, e ele continua mandando;
 * o push chega aqui e o `showNotification` estoura com "No notification
 * permission has been granted for this origin". Também acontece com o push de
 * teste que o DevTools dispara.
 *
 * Sem este cuidado a promessa rejeitada morre dentro do `waitUntil`, e aí não é
 * só ruído no console: o navegador trata o push como não atendido e alguns
 * mostram no lugar uma notificação genérica de "este site foi atualizado em
 * segundo plano" — que é pior que não mostrar nada, porque não diz nada e ainda
 * parece defeito.
 *
 * **E a inscrição é encerrada.** Sem isso o servidor seguiria gastando envio
 * para um destino que não mostra nada, indefinidamente: o serviço de push
 * responde sucesso (a inscrição existe), então nunca chega o 404 ou 410 que faz
 * `services/push.py` apagar a linha. Cancelando aqui, o próximo envio recebe o
 * erro que limpa o registro do outro lado.
 */
async function mostrar(aviso: AvisoPush): Promise<void> {
  // `Notification` é global no worker em runtime, mas o `lib.webworker` não a
  // declara em `ServiceWorkerGlobalScope` — daí a leitura pelo escopo global com
  // asserção, em vez de `self.Notification`, que não compila.
  const permissao = (globalThis as unknown as { Notification?: { permission: string } })
    .Notification?.permission

  if (permissao !== 'granted') {
    const inscricao = await self.registration.pushManager.getSubscription()
    await inscricao?.unsubscribe()
    return
  }

  await self.registration.showNotification(aviso.titulo ?? 'TrocaTCG', {
    // Sem `body`: o título já diz o que aconteceu e o que fazer, e o resto do
    // texto está na caixa do app, a um toque daqui.
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: aviso.tipo ?? 'trocatcg',
    data: { link: aviso.link ?? '/app' },
  })
}

/**
 * Tocou na notificação.
 *
 * Se o app já está aberto em alguma aba, ela é reaproveitada e navegada — abrir
 * uma segunda janela do mesmo PWA é o jeito rápido de a pessoa ficar com duas
 * sessões e achar que perdeu o que estava fazendo. Só quando não há nenhuma é
 * que uma janela nova abre.
 */
self.addEventListener('notificationclick', (evento: NotificationEvent) => {
  evento.notification.close()

  const link = (evento.notification.data?.link as string | undefined) ?? '/app'
  const destino = new URL(link, self.location.origin).href

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const aba of abas) {
        if (new URL(aba.url).origin !== self.location.origin) continue
        await aba.focus()

        // `navigate` não existe em todo navegador (o Safari do iOS é um deles),
        // ainda que o tipo do TypeScript garanta que sim — daí a checagem em
        // tempo de execução. Sem ele, a mensagem manda o app navegar por conta
        // própria, pelo roteador, que é inclusive melhor: não recarrega a
        // página e não perde o que estava na tela.
        const cliente = aba as WindowClient & {
          navigate?: (url: string) => Promise<WindowClient | null>
        }
        if (typeof cliente.navigate === 'function') {
          await cliente.navigate(destino).catch(() => undefined)
        } else {
          cliente.postMessage({ tipo: 'NAVEGAR', link })
        }
        return
      }

      await self.clients.openWindow(destino)
    })(),
  )
})
