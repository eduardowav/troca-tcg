import { toast } from 'sonner'

import { registerSW } from 'virtual:pwa-register'

/**
 * A troca de versão do app instalado.
 *
 * **O problema, em uma frase:** um PWA instalado não fecha. O Android o guarda
 * no alternador por dias, e enquanto a aba viver ela roda o JavaScript que
 * baixou no dia em que foi aberta.
 *
 * Até 2026-08-21 o service worker chamava `skipWaiting()` sozinho. O efeito era
 * pior do que ficar desatualizado: o worker novo assumia, apagava do cache os
 * pedaços de rota da versão antiga, e a tela continuava sendo a antiga. Quando
 * a pessoa tocasse numa tela que ainda não tinha visitado, o pedaço seria
 * buscado na rede — onde ele também não existe mais, porque o nome tem hash — e
 * a navegação quebrava sem dizer por quê.
 *
 * **A troca passa a ser um convite.** Aparece um aviso com um botão; quem está
 * no meio de escrever uma proposta termina primeiro. Nada recarrega sozinho:
 * recarregar em cima de alguém é perder o que a pessoa estava fazendo para
 * ganhar uma versão que podia esperar dois minutos.
 *
 * **Por que não avisar por notificação push.** Foi considerado e recusado em
 * 2026-08-21. Notificação é a coisa mais cara que este app pede — a permissão é
 * uma só, e ela existe para "sua carta apareceu" e "alguém quer trocar com
 * você", que são o motor do produto. Gastar essa permissão com "saiu versão
 * nova" ensina a pessoa a ignorar o aviso, e o passo seguinte é ela desligar
 * tudo. Fora que só quem já autorizou push receberia, e a atualização não é
 * notícia sobre a conta dela: é manutenção nossa.
 */

/** Guarda contra laço de recarga quando um pedaço some. */
const CHAVE_RECARGA = 'troca:recarregou-por-pedaco-ausente'

/**
 * Manda o worker novo assumir e recarrega a tela.
 *
 * **A recarga é nossa, e não do plugin, por um caso medido em 2026-08-21.** O
 * `vite-plugin-pwa` só recarrega quando o Workbox marca o evento como
 * atualização, e ele não marca quando o service worker foi registrado nesta
 * mesma visita — quem instalou o app e ficou usando sem fechar cai exatamente
 * aí. O sintoma seria o pior possível: tocar em "Atualizar" e não acontecer
 * nada.
 *
 * O tempo limite é a segunda rede: se o worker novo já estiver no controle
 * quando a pessoa tocar, o `controllerchange` não vem, e sem ele o botão ficaria
 * mudo de novo.
 */
async function trocarDeVersao(): Promise<void> {
  let feito = false
  const recarregar = () => {
    if (feito) return
    feito = true
    window.location.reload()
  }

  const registro = await navigator.serviceWorker?.getRegistration()
  const esperando = registro ? await esperarWorkerNovo(registro) : null

  // Nada esperando depois de cinco segundos: o que falta é só a tela, e
  // recarregar já basta.
  if (!esperando) {
    recarregar()
    return
  }

  // Quem manda recarregar é a **troca de controle**, não um relógio. Um tempo
  // limite disparado antes de o worker novo assumir traz a versão velha de
  // volta e deixa a nova esperando de novo — medido em 2026-08-21, e o sintoma
  // é o pior possível: o botão parece não funcionar. Os seis segundos abaixo
  // são só a rede de segurança para o caso de a troca nunca vir.
  navigator.serviceWorker.addEventListener('controllerchange', recarregar, {
    once: true,
  })
  window.setTimeout(recarregar, 6000)
  esperando.postMessage({ type: 'SKIP_WAITING' })
}

/**
 * Espera o worker novo chegar ao estado de espera.
 *
 * Ele não está lá no instante em que o aviso aparece: o plugin mostra o aviso
 * ainda na instalação — que num precache de 75 arquivos leva o seu tempo —, e
 * `registration.waiting` só é preenchido depois. Perguntar uma vez só, no toque,
 * dá `null` e manda a lógica pelo caminho errado.
 */
function esperarWorkerNovo(
  registro: ServiceWorkerRegistration,
  limiteMs = 5000,
): Promise<ServiceWorker | null> {
  return new Promise((resolver) => {
    if (registro.waiting) return resolver(registro.waiting)
    const inicio = Date.now()
    const olhar = window.setInterval(() => {
      if (registro.waiting) {
        window.clearInterval(olhar)
        resolver(registro.waiting)
      } else if (Date.now() - inicio > limiteMs) {
        window.clearInterval(olhar)
        resolver(null)
      }
    }, 100)
  })
}

export function iniciarAtualizacao(): void {
  registerSW({
    onNeedRefresh() {
      toast('Tem uma versão nova do TrocaTCG', {
        // **Id fixo, e ele não é enfeite.** Quando a busca por versão parte do
        // app — que é o nosso caso, no `onRegisteredSW` —, o Workbox trata a
        // atualização como externa e dispara o gancho **duas vezes**: uma no
        // `installed` e outra no `waiting`. Sem o id, apareciam dois avisos
        // idênticos empilhados. Medido em 2026-08-21.
        id: 'versao-nova',
        description: 'Atualize quando terminar o que está fazendo.',
        // Sem tempo para sumir: um aviso de atualização que desaparece em quatro
        // segundos é um aviso que ninguém vê. Ele fica até a pessoa resolver.
        duration: Infinity,
        action: {
          label: 'Atualizar',
          onClick: () => void trocarDeVersao(),
        },
      })
    },

    onRegisteredSW(_url, registro) {
      if (!registro) return
      // O navegador só procura versão nova em navegação, e num PWA instalado
      // navegação é coisa rara. Estas duas linhas são o que faz o aviso chegar
      // a quem deixou o app aberto: quando ele volta para a frente, e de hora
      // em hora enquanto estiver ali.
      const procurar = () => {
        if (document.visibilityState === 'visible') void registro.update()
      }
      document.addEventListener('visibilitychange', procurar)
      setInterval(procurar, 60 * 60 * 1000)
    },
  })

  // A rede de segurança, e ela vale sozinha: o Vite avisa quando um pedaço de
  // rota não carrega — o caso do app velho pedindo um arquivo que o deploy
  // levou embora. Sem isto a pessoa vê uma tela que não abre; com isto, ela vê
  // um piscar. Uma vez só por sessão, senão vira laço quando a falha é de rede.
  window.addEventListener('vite:preloadError', () => {
    if (sessionStorage.getItem(CHAVE_RECARGA)) return
    sessionStorage.setItem(CHAVE_RECARGA, 'sim')
    window.location.reload()
  })
}
