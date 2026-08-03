import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { Button, estiloBotao } from '@/components/ui/Button'
import { useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useDesfechoMatch, useMatch, useResponderMatch } from '@/hooks/useMatches'
import { useMundo } from '@/hooks/useMundo'
import { CONDICOES } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  euAceitei,
  euConfirmei,
  type Match,
  parceiro,
  prazoTexto,
  reputacaoTexto,
} from '@/lib/matches'
import { linkWhatsApp } from '@/lib/telefone'
import {
  type Carta,
  codigoSet,
  desequilibrio,
  type Desequilibrio,
  formatarMoeda,
  formatarRazao,
  nomeCarta,
} from '@/lib/types'
import { useUsuarioId } from '@/stores/auth'

/** Varredura holo (2,4s) + a marca que entra depois dela, com folga para ler. */
const DURACAO_SELAGEM = 3200

/**
 * Tempo entre pedir a rolagem e soltar a animação.
 *
 * O botão que fecha a troca fica a mais de 400px abaixo das cartas: do topo da
 * linha de troca até a base dele são ~950px, mais do que cabe em qualquer
 * celular. Quem desce o dedo para confirmar não tem mais as cartas na tela — e a
 * primeira versão disto tocou a selagem inteira fora do campo de visão de quem
 * acabou de fechar a troca. Rolar até elas antes é o que faz a animação existir
 * para alguém.
 */
const ESPERA_ROLAGEM = 480

/**
 * Atraso entre o começo da selagem e a travessia das cartas.
 *
 * O holo acende primeiro. Se as cartas saíssem no mesmo quadro, o brilho viraria
 * borrão de movimento e o gesto perderia o começo — primeiro as cartas chamam
 * atenção para si, depois se movem.
 */
const ESPERA_TRAVESSIA = 260

/** Status em que a troca já acabou — o que muda o tempo verbal da tela. */
const ENCERRADOS = ['CONCLUIDO', 'FURADO', 'EXPIRADO']

export default function MatchDetalhe() {
  useMundo('brutal')
  const { id } = useParams<{ id: string }>()
  const meuId = useUsuarioId()
  const { data: match, isPending, isError } = useMatch(id)
  const responder = useResponderMatch()
  const desfecho = useDesfechoMatch()
  // 'mirando' é o intervalo em que a tela vai até as cartas; 'tocando' é a
  // animação. Separar os dois é o que garante que ninguém celebre no vazio.
  const [selagem, setSelagem] = useState<'parada' | 'mirando' | 'tocando'>(
    'parada',
  )
  const [cruzou, setCruzou] = useState(false)
  const linhaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selagem === 'parada') return

    if (selagem === 'mirando') {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      linhaRef.current?.scrollIntoView({
        block: 'center',
        behavior: suave ? 'smooth' : 'auto',
      })
      // Sem rolagem suave não há o que esperar: o salto já pôs as cartas na tela.
      const t = setTimeout(() => setSelagem('tocando'), suave ? ESPERA_ROLAGEM : 0)
      return () => clearTimeout(t)
    }

    // Toca uma vez e sai sozinha. Quem volta à tela depois vem atrás do contato
    // para retomar o assunto, e encontrar a festa de novo atrapalharia.
    const travessia = setTimeout(() => setCruzou(true), ESPERA_TRAVESSIA)
    const fim = setTimeout(() => setSelagem('parada'), DURACAO_SELAGEM)
    return () => {
      clearTimeout(travessia)
      clearTimeout(fim)
    }
  }, [selagem])

  const ids = useMemo(
    () => (match?.itens ?? []).map((i) => i.card_id),
    [match],
  )
  const { data: cartas } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)

  if (isPending) {
    return (
      <Moldura>
        <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      </Moldura>
    )
  }

  if (isError || !match) {
    return (
      <Moldura>
        <p className="text-[15px] text-paper">Essa troca não está mais disponível.</p>
        <Link
          to="/matches"
          className="mt-4 inline-block text-[14px] text-paper underline underline-offset-4"
        >
          Voltar para as trocas
        </Link>
      </Moldura>
    )
  }

  const outro = parceiro(match, meuId)
  const dou = match.itens.find((i) => i.de_user_id === meuId)
  const recebo = match.itens.find((i) => i.para_user_id === meuId)
  const jaAceitei = euAceitei(match, meuId)
  const reputacao = outro && reputacaoTexto(outro)
  const desigual = desequilibrio(
    dou && precos?.get(dou.card_id),
    recebo && precos?.get(recebo.card_id),
  )

  function registrarDesfecho(aconteceu: boolean) {
    desfecho.mutate(
      { id: match!.id, aconteceu },
      {
        onSuccess: (novo) => {
          // Só quando fecha pelos dois. Quem confirma primeiro não fechou nada
          // ainda — celebrar ali prometeria um desfecho que ainda depende do
          // outro lado, e é justamente o que fura.
          if (novo.status === 'CONCLUIDO') setSelagem('mirando')
          toast.success(
            novo.status === 'CONCLUIDO'
              ? 'Troca concluída pelos dois. Reputação atualizada.'
              : aconteceu
                ? 'Confirmado. Falta a outra pessoa confirmar.'
                : 'Registrado. Obrigado por avisar.',
          )
        },
        onError: (erro) =>
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível registrar agora.',
          ),
      },
    )
  }

  function decidir(aceitou: boolean) {
    responder.mutate(
      { id: match!.id, aceitou },
      {
        onSuccess: (novo) =>
          toast.success(
            novo.status === 'ACEITO'
              ? 'Troca combinada! O contato está liberado.'
              : aceitou
                ? 'Aceite registrado. Falta a outra pessoa.'
                : 'Troca recusada.',
          ),
        onError: (erro) =>
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível responder agora.',
          ),
      },
    )
  }

  return (
    <Moldura>
      <Link
        to="/matches"
        className="voltar text-[13px] text-muted underline underline-offset-4 hover:text-paper"
      >
        ← Trocas
      </Link>

      <h1 className="titulo-pagina mt-5 text-[26px] leading-[1.15] lg:text-[32px]">
        Troca com {outro?.nome_exibicao ?? 'alguém'}.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted lg:text-[16px]">
        @{outro?.username}
        {reputacao && ` · ${reputacao}`}
      </p>

      <div className="cartela mt-8 rounded-[var(--radius-card)] border border-edge bg-surface p-5">
        {/* Tempo verbal: numa troca encerrada, "você dá" está falando de uma
            coisa que já aconteceu. O histórico do perfil já corrigia isso; o
            detalhe, que é para onde o histórico leva, não corrigia. Durante a
            selagem o passado já vale — foi ela que acabou de acontecer. */}
        <div ref={linhaRef}>
          <LinhaDeTroca
            dou={dou && cartas?.get(dou.card_id)}
            recebo={recebo && cartas?.get(recebo.card_id)}
            precos={precos}
            tamanho="grande"
            selando={selagem === 'tocando'}
            // Fora da selagem o lado certo vem do status, sem estado nenhum:
            // quem abre uma troca concluída amanhã já encontra cada carta com
            // seu novo dono, e não vê a travessia acontecer de novo. Durante a
            // selagem quem manda é `cruzou`, que é o instante da passagem.
            trocado={
              selagem === 'parada' ? match.status === 'CONCLUIDO' : cruzou
            }
            rotulos={
              selagem !== 'parada' || ENCERRADOS.includes(match.status)
                ? { dou: 'Você deu', recebo: 'Você recebeu' }
                : undefined
            }
          />
        </div>

        {/* Os rótulos repetem, palavra por palavra, os das cartas logo acima.
            Dizer "Você entrega" aqui e "Você dá" ali, a cem pixels de distância,
            obriga quem lê a checar se são a mesma coisa — e essa linha existe
            justamente para dizer em que estado vem cada carta. */}
        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-edge-soft pt-4 text-[13px] lg:text-[15px]">
          <Detalhe rotulo="Você dá" condicao={dou?.condicao} />
          <Detalhe rotulo="Você recebe" condicao={recebo?.condicao} />
        </dl>
      </div>

      {desigual && <AvisoDesequilibrio dados={desigual} />}

      {match.status === 'CONCLUIDO' ? (
        <Encerrado
          titulo="Troca concluída."
          texto="Ela entrou na sua reputação. Obrigado por confirmar — é o que faz a próxima pessoa confiar em você."
          tom="offer"
        />
      ) : match.status === 'FURADO' ? (
        <Encerrado
          titulo="Troca marcada como não realizada."
          texto="Registramos que o encontro não aconteceu."
          tom="alert"
        />
      ) : match.status === 'ACEITO' ? (
        <>
          <Contato
            outro={outro}
            cartaQueDou={dou && cartas?.get(dou.card_id)}
            cartaQueRecebo={recebo && cartas?.get(recebo.card_id)}
          />
          <Desfecho
            match={match}
            meuId={meuId}
            enviando={desfecho.isPending}
            onRegistrar={registrarDesfecho}
          />
        </>
      ) : (
        <Combinar
          match={match}
          jaAceitei={jaAceitei}
          enviando={responder.isPending}
          onDecidir={decidir}
        />
      )}

      <Rodape match={match} />
    </Moldura>
  )
}

/**
 * A letra miúda do pé da página.
 *
 * O prazo só existe enquanto a troca está de pé: dizer "expira em 4 dias"
 * embaixo de uma troca já concluída é contradizer o cartão logo acima. Numa
 * troca encerrada sobra a segunda metade da frase, que continua verdadeira.
 */
function Rodape({ match }: { match: Match }) {
  const prazo = ENCERRADOS.includes(match.status) ? null : prazoTexto(match)

  return (
    <p className="mt-6 text-center text-[12px] leading-relaxed text-faint">
      {prazo && `${prazo}. `}A troca acontece presencialmente, combinada entre
      vocês.
    </p>
  )
}

function Detalhe({
  rotulo,
  condicao,
}: {
  rotulo: string
  condicao?: string
}) {
  const dica = CONDICOES.find((c) => c.valor === condicao)?.dica
  return (
    <div className="fileira">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-paper">
        {condicao ?? '—'}
        {dica && <span className="text-muted"> · {dica}</span>}
      </dd>
    </div>
  )
}

/**
 * Aviso de troca desigual.
 *
 * Não bloqueia e não julga: troca desigual é legítima — gente dá carta cara para
 * fechar amizade, para desencalhar, ou porque quer muito a outra. O que não pode
 * é a pessoa descobrir a diferença só na hora do encontro, porque aí ela some, e
 * some contando como furo na métrica-mãe.
 *
 * O aviso fala mais alto para quem entrega mais valor, mas aparece dos dois
 * lados: quem está levando vantagem também precisa saber, porque é do outro lado
 * que vem a desistência.
 *
 * "Mais alto" é a moldura, nunca a legibilidade. O lado de quem recebe mais já
 * foi pintado inteiro na cor da letra miúda, e a frase principal saía mais apagada
 * que o parágrafo de apoio logo abaixo dela — hierarquia ao contrário justamente
 * na tela que a pessoa precisa ler antes de marcar um encontro. Agora quem
 * entrega mais leva a moldura de Procuro e a frase na cor dela; quem recebe mais
 * leva a cartela neutra do resto da tela, com a frase em `paper`. Os dois casos
 * se leem; só um deles interrompe.
 */
function AvisoDesequilibrio({ dados }: { dados: Desequilibrio }) {
  const alerta = dados.euEntregoMais

  return (
    <div
      role="status"
      data-tom={alerta ? 'atencao' : undefined}
      className={cn(
        'cartela mt-5 rounded-[var(--radius-card)] border p-4',
        alerta
          ? 'border-[color-mix(in_oklab,var(--color-want)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-want)_8%,transparent)]'
          : 'border-edge bg-surface',
      )}
    >
      <p
        className={cn(
          'titulo-tom text-[15px] font-medium',
          alerta ? 'text-want' : 'text-paper',
        )}
      >
        {alerta
          ? `Você entrega cerca de ${formatarRazao(dados.razao)} mais valor do que recebe.`
          : `Você recebe cerca de ${formatarRazao(dados.razao)} mais valor do que entrega.`}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Pela referência da TCGplayer, {formatarMoeda(dados.valorDou)} de um lado
        e {formatarMoeda(dados.valorRecebo)} do outro.{' '}
        {dados.euEntregoMais
          ? 'Se não for de propósito, vale combinar uma compensação antes de fechar — mais cartas do outro lado, por exemplo.'
          : 'A outra pessoa pode pedir uma compensação, e troca muito desigual costuma furar no dia do encontro.'}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-faint">
        Preço é referência de mercado americano, não regra: condição, idioma e
        vontade de cada um valem mais do que a tabela.
      </p>
    </div>
  )
}

/** Aceite. Enquanto os dois lados não aceitarem, nenhum contato aparece. */
function Combinar({
  match,
  jaAceitei,
  enviando,
  onDecidir,
}: {
  match: Match
  jaAceitei: boolean
  enviando: boolean
  onDecidir: (aceitou: boolean) => void
}) {
  if (jaAceitei) {
    return (
      <div className="cartela mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4 text-center">
        <p className="text-[15px] text-paper">Você topou essa troca.</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Assim que a outra pessoa aceitar, os contatos de vocês aparecem aqui
          para combinarem onde se encontrar.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        block
        loading={enviando}
        onClick={() => onDecidir(true)}
      >
        Topo essa troca
      </Button>
      <Button
        variant="ghost"
        size="md"
        block
        disabled={enviando}
        onClick={() => onDecidir(false)}
      >
        Não tenho interesse
      </Button>
      {match.status === 'PENDENTE' && (
        <p className="mt-1 text-center text-[13px] text-want">
          A outra pessoa já aceitou. Falta você.
        </p>
      )}
    </div>
  )
}

/**
 * Desfecho: aconteceu ou não.
 *
 * Fica depois do contato de propósito — a pergunta só faz sentido para quem já
 * tentou marcar. Concluir exige os dois lados; avisar que a pessoa não apareceu
 * não, porque quem levou o furo não pode depender do outro para registrar.
 */
function Desfecho({
  match,
  meuId,
  enviando,
  onRegistrar,
}: {
  match: Match
  meuId: string | undefined
  enviando: boolean
  onRegistrar: (aconteceu: boolean) => void
}) {
  if (euConfirmei(match, meuId)) {
    return (
      <p className="cartela mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4 text-center text-[14px] leading-relaxed text-muted">
        Você confirmou que a troca aconteceu. Falta a outra pessoa confirmar
        para ela entrar na reputação de vocês.
      </p>
    )
  }

  return (
    <div className="cartela mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4">
      <p className="text-[15px] text-paper">Já se encontraram?</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        Confirmar é o que constrói a reputação de vocês dois.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="offer"
          size="md"
          block
          loading={enviando}
          onClick={() => onRegistrar(true)}
        >
          A troca aconteceu
        </Button>
        <Button
          variant="ghost"
          size="sm"
          block
          disabled={enviando}
          onClick={() => onRegistrar(false)}
          className="text-alert hover:text-alert"
        >
          A pessoa não apareceu
        </Button>
      </div>
    </div>
  )
}

function Encerrado({
  titulo,
  texto,
  tom,
}: {
  titulo: string
  texto: string
  tom: 'offer' | 'alert'
}) {
  const bom = tom === 'offer'
  return (
    <div
      data-tom={bom ? 'bom' : 'ruim'}
      className={cn(
        'cartela mt-5 rounded-[var(--radius-card)] border p-5',
        bom
          ? 'border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-offer)_10%,transparent)]'
          : 'border-[color-mix(in_oklab,var(--color-alert)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-alert)_10%,transparent)]',
      )}
    >
      <p
        className={cn(
          'titulo-tom text-[15px] font-medium',
          bom ? 'text-offer' : 'text-alert',
        )}
      >
        {titulo}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{texto}</p>
    </div>
  )
}

/**
 * Contato — só chega aqui com o match ACEITO pelos dois.
 *
 * A API nem serializa o campo antes disso (ParticipanteResumo não tem onde
 * guardá-lo), então este componente não precisa checar nada: se `contato_visivel`
 * chegou, é porque o aceite mútuo aconteceu.
 */
function Contato({
  outro,
  cartaQueDou,
  cartaQueRecebo,
}: {
  outro?: { nome_exibicao: string; contato_visivel?: string | null }
  cartaQueDou?: Carta
  cartaQueRecebo?: Carta
}) {
  const link =
    outro?.contato_visivel &&
    linkWhatsApp(
      outro.contato_visivel,
      primeiraMensagem(outro.nome_exibicao, cartaQueDou, cartaQueRecebo),
    )

  return (
    <div
      data-tom="bom"
      className="cartela mt-5 rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-offer)_10%,transparent)] p-5"
    >
      <p className="titulo-tom text-[15px] font-medium text-offer">
        Troca combinada.
      </p>
      {outro?.contato_visivel ? (
        <>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Fale com {outro.nome_exibicao} para marcar:
          </p>
          <p className="mt-2 text-[17px] break-all text-paper">
            {outro.contato_visivel}
          </p>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                estiloBotao({ variant: 'primary', size: 'lg', block: true }),
                'mt-4',
              )}
            >
              <IconeWhatsApp className="size-5" />
              Abrir conversa no WhatsApp
            </a>
          )}
        </>
      ) : (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {outro?.nome_exibicao ?? 'A outra pessoa'} ainda não cadastrou um
          contato. Assim que cadastrar, ele aparece aqui.
        </p>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        O TrocaTCG só conecta vocês — a troca acontece por conta e risco de cada
        um. Combine um lugar público e confira as cartas na hora.
      </p>
    </div>
  )
}

/**
 * A primeira mensagem, já escrita.
 *
 * Abrir conversa com estranho é o degrau onde a troca combinada morre, e o pior
 * dele é ter de redigir do zero. Nomear as duas cartas resolve dois problemas de
 * uma vez: quebra o gelo e deixa registrado por escrito, na conversa, qual carta
 * era qual — o mal-entendido que mais fura encontro marcado.
 */
function primeiraMensagem(
  nome: string,
  cartaQueDou?: Carta,
  cartaQueRecebo?: Carta,
): string {
  const primeiroNome = nome.split(' ')[0]
  const descrever = (c: Carta) => `${nomeCarta(c)} (${codigoSet(c)})`

  if (!cartaQueDou || !cartaQueRecebo) {
    return `Oi, ${primeiroNome}! Vim pelo TrocaTCG — topei nossa troca. Quando e onde fica bom pra você?`
  }
  return (
    `Oi, ${primeiroNome}! Vim pelo TrocaTCG. Topei nossa troca: ` +
    `eu levo ${descrever(cartaQueDou)} e você traz ${descrever(cartaQueRecebo)}. ` +
    `Quando e onde fica bom pra você?`
  )
}

function IconeWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03 0 1.19.87 2.35.99 2.51.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    // Um pouco mais larga que a coluna de leitura das outras telas: aqui o
    // conteúdo é a troca em si, e as duas cartas frente a frente são o que a
    // pessoa veio ver — não texto corrido, que é o que pede linha curta.
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-5 py-10 lg:max-w-3xl">
      {children}
    </div>
  )
}
