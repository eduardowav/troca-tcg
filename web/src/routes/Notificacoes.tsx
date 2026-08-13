import { Link } from 'react-router-dom'

import {
  Cartela,
  IconeCartasBrutal,
  IconeSino,
  IconeTrocar,
  IconeTrocas,
  Pokebola,
  Selo,
} from '@/components/brutal/Pecas'
import { useMarcarLidas, useNotificacoes } from '@/hooks/useNotificacoes'
import { cn } from '@/lib/cn'
import { Falha, motivoDoErro } from '@/components/Falha'
import {
  iconeDe,
  type Notificacao,
  pedeResposta,
  type TipoNotificacao,
} from '@/lib/notificacoes'

/**
 * A caixa de avisos.
 *
 * Existe por causa de um buraco específico: uma proposta vence em 72 horas, e
 * até agora ela morria calada — quem recebeu só descobria abrindo o app por
 * conta própria. Os outros eventos entram junto porque a mesma caixa serve
 * para todos.
 *
 * Não há filtro de "não lidas" na tela. A lista é curta e ordenada por
 * recência, e um seletor com duas opções ali em cima custaria mais atenção do
 * que economiza — o que separa lida de não lida é a marca visual da linha, que
 * se lê sem clicar em nada.
 *
 * Abrir a tela **não** marca tudo como lido. Marcar por chegar é o que faz uma
 * caixa perder o sentido: a pessoa que abre no ônibus, lê o título de três
 * avisos e sai perderia o rastro dos dois que não teve tempo de abrir. Some o
 * que a pessoa tocou, e o resto continua esperando — o botão de marcar todas
 * está no topo para quem quiser zerar de uma vez.
 */
export default function Notificacoes() {
  const { data: notificacoes, isPending, isError, error, refetch } =
    useNotificacoes()
  const marcar = useMarcarLidas()

  const naoLidas = (notificacoes ?? []).filter((n) => !n.lida).length

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 pb-8 2xl:max-w-[120rem]">
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Notificações
        </h1>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          O que aconteceu enquanto você não estava aqui. Proposta esperando
          resposta é o que vence primeiro — são 72 horas por rodada.
        </p>
      </header>

      {naoLidas > 0 && (
        <div className="mt-4 w-full max-w-xl">
          <button
            type="button"
            onClick={() => marcar.mutate(undefined)}
            disabled={marcar.isPending}
            className="rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-3 py-1.5 font-titulo text-[12px] font-extrabold uppercase text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)] disabled:opacity-60"
          >
            Marcar todas como lidas
          </button>
        </div>
      )}

      <div className="mt-5 flex-1">
        {isPending ? (
          <p className="py-10 text-center font-corpo text-[15px] text-apagado">
            Carregando…
          </p>
        ) : isError ? (
          <Falha motivo={motivoDoErro(error)} onTentar={() => refetch()} compacta />
        ) : !notificacoes?.length ? (
          <Vazio />
        ) : (
          <ul className="grid w-full grid-cols-1 gap-3 lg:max-w-3xl">
            {notificacoes.map((n) => (
              <li key={n.id}>
                <Linha notificacao={n} aoAbrir={() => marcar.mutate([n.id])} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Uma linha da caixa.
 *
 * É um `Link` quando tem destino e uma `div` quando não tem — e todas têm hoje.
 * O caso sem link existe porque a coluna é anulável no banco, e uma linha morta
 * que parece clicável é pior do que uma que não parece.
 *
 * Marcar como lida acontece ao abrir, não ao renderizar: é o toque da pessoa
 * que diz "eu vi isto".
 */
function Linha({
  notificacao,
  aoAbrir,
}: {
  notificacao: Notificacao
  aoAbrir: () => void
}) {
  const conteudo = <Corpo notificacao={notificacao} />

  const moldura = cn(
    'block transition-shadow',
    !notificacao.lida && 'hover:shadow-[var(--shadow-duro)]',
  )

  if (!notificacao.link) {
    return <div className={moldura}>{conteudo}</div>
  }

  return (
    <Link to={notificacao.link} onClick={aoAbrir} className={moldura}>
      {conteudo}
    </Link>
  )
}

function Corpo({ notificacao }: { notificacao: Notificacao }) {
  const naoLida = !notificacao.lida

  return (
    <Cartela
      className={cn(
        'flex items-start gap-3 p-4',
        // A não lida é a única com sombra dura e fundo de papel: é a diferença
        // que se lê de relance, sem contar pontinho nenhum. A lida recua para o
        // fundo da tela e continua ali, legível, sem competir.
        naoLida
          ? 'bg-papel shadow-[var(--shadow-duro-sm)]'
          : 'bg-cartela shadow-none opacity-80',
      )}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela text-tinta"
      >
        <Icone tipo={notificacao.tipo} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-titulo text-[15px] leading-snug font-bold text-tinta">
            {notificacao.titulo}
          </span>
          {pedeResposta(notificacao.tipo) && naoLida && (
            <Selo tom="acao">Sua vez</Selo>
          )}
        </span>

        <span className="mt-1 block font-corpo text-[13px] leading-relaxed text-apagado">
          {notificacao.corpo}
        </span>

        <span className="mt-1.5 block font-dado text-[11px] uppercase text-apagado">
          {quando(notificacao.criado_em)}
        </span>
      </span>
    </Cartela>
  )
}

function Icone({ tipo }: { tipo: TipoNotificacao }) {
  const familia = iconeDe(tipo)
  if (familia === 'proposta') return <IconeTrocar className="size-5" />
  if (familia === 'carta') return <IconeCartasBrutal className="size-5" />
  return <IconeTrocas className="size-5" />
}

/**
 * Há quanto tempo, em português curto.
 *
 * Relativo e não absoluto: "há 2 horas" responde a pergunta que a pessoa faz
 * olhando a caixa ("isto é novo?"), e "11/08 às 14h" a obriga a calcular. Passa
 * para data cheia depois de uma semana, quando o relativo perde a utilidade e
 * "há 9 dias" já não diz mais nada que a data não diga melhor.
 */
function quando(iso: string): string {
  const agora = Date.now()
  const entao = new Date(iso).getTime()
  const minutos = Math.round((agora - entao) / 60000)

  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`

  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`

  const dias = Math.round(horas / 24)
  if (dias <= 7) return dias === 1 ? 'ontem' : `há ${dias} dias`

  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

/**
 * A caixa vazia.
 *
 * Diz o que vai chegar aqui, não só que está vazia: quem abriu o sino pela
 * primeira vez está perguntando para que serve esta tela, e "nada por aqui" não
 * responde.
 */
function Vazio() {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <Pokebola className="size-16" />
      <span className="mt-6">
        <Selo>Tudo em dia</Selo>
      </span>
      <p className="mt-4 font-titulo text-[17px] font-bold text-tinta">
        Nenhum aviso por enquanto.
      </p>
      <p className="mt-2 max-w-sm font-corpo text-[14px] leading-relaxed text-apagado">
        Aqui chega o que precisa de você: proposta esperando resposta, troca
        combinada, e quando alguém passa a procurar uma carta que você oferece.
      </p>
      <span className="mt-6 text-apagado" aria-hidden>
        <IconeSino className="size-6" />
      </span>
    </div>
  )
}
