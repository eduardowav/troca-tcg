import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { Button, estiloBotao } from '@/components/ui/Button'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useDesfechoMatch, useMatch, useResponderMatch } from '@/hooks/useMatches'
import { CONDICOES } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  diasParaExpirar,
  euAceitei,
  euConfirmei,
  type Match,
  parceiro,
} from '@/lib/matches'
import { linkWhatsApp } from '@/lib/telefone'
import { type Carta, codigoSet, nomeCarta } from '@/lib/types'
import { useUsuarioId } from '@/stores/auth'

export default function MatchDetalhe() {
  const { id } = useParams<{ id: string }>()
  const meuId = useUsuarioId()
  const { data: match, isPending, isError } = useMatch(id)
  const responder = useResponderMatch()
  const desfecho = useDesfechoMatch()

  const ids = useMemo(
    () => (match?.itens ?? []).map((i) => i.card_id),
    [match],
  )
  const { data: cartas } = useCartasPorId(ids)

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

  function registrarDesfecho(aconteceu: boolean) {
    desfecho.mutate(
      { id: match!.id, aconteceu },
      {
        onSuccess: (novo) =>
          toast.success(
            novo.status === 'CONCLUIDO'
              ? 'Troca concluída pelos dois. Reputação atualizada.'
              : aconteceu
                ? 'Confirmado. Falta a outra pessoa confirmar.'
                : 'Registrado. Obrigado por avisar.',
          ),
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
        className="text-[13px] text-muted underline underline-offset-4 hover:text-paper"
      >
        ← Trocas
      </Link>

      <h1 className="mt-5 text-[26px] leading-[1.15]">
        Troca com {outro?.nome_exibicao ?? 'alguém'}.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        @{outro?.username}
        {outro?.reputacao != null && ` · ${outro.reputacao}% de trocas concluídas`}
      </p>

      <div className="mt-8 rounded-[var(--radius-card)] border border-edge bg-surface p-5">
        <LinhaDeTroca
          dou={dou && cartas?.get(dou.card_id)}
          recebo={recebo && cartas?.get(recebo.card_id)}
          tamanho="grande"
        />

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-edge-soft pt-4 text-[13px]">
          <Detalhe rotulo="Você entrega" condicao={dou?.condicao} />
          <Detalhe rotulo="Você recebe" condicao={recebo?.condicao} />
        </dl>
      </div>

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

      <p className="mt-6 text-center text-[12px] text-faint">
        Expira em {diasParaExpirar(match)} dia(s). A troca acontece
        presencialmente, combinada entre vocês.
      </p>
    </Moldura>
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
    <div>
      <dt className="text-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-paper">
        {condicao ?? '—'}
        {dica && <span className="text-muted"> · {dica}</span>}
      </dd>
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
      <div className="mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4 text-center">
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
      <p className="mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4 text-center text-[14px] leading-relaxed text-muted">
        Você confirmou que a troca aconteceu. Falta a outra pessoa confirmar
        para ela entrar na reputação de vocês.
      </p>
    )
  }

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4">
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
  const cor = tom === 'offer' ? 'var(--color-offer)' : 'var(--color-alert)'
  return (
    <div
      className="mt-5 rounded-[var(--radius-card)] border p-5"
      style={{
        borderColor: `color-mix(in oklab, ${cor} 40%, transparent)`,
        background: `color-mix(in oklab, ${cor} 10%, transparent)`,
      }}
    >
      <p className="text-[15px] font-medium" style={{ color: cor }}>
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
    <div className="mt-5 rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-offer)_10%,transparent)] p-5">
      <p className="text-[15px] font-medium text-offer">Troca combinada.</p>
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 py-10">
      {children}
    </div>
  )
}
