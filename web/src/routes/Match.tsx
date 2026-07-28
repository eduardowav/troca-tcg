import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { LinhaDeTroca } from '@/components/carta/LinhaDeTroca'
import { Button } from '@/components/ui/Button'
import { useCartasPorId } from '@/hooks/useAnuncios'
import { useMatch, useResponderMatch } from '@/hooks/useMatches'
import { CONDICOES } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { diasParaExpirar, euAceitei, type Match, parceiro } from '@/lib/matches'
import { useUsuarioId } from '@/stores/auth'

export default function MatchDetalhe() {
  const { id } = useParams<{ id: string }>()
  const meuId = useUsuarioId()
  const { data: match, isPending, isError } = useMatch(id)
  const responder = useResponderMatch()

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

      {match.status === 'ACEITO' ? (
        <Contato outro={outro} />
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
 * Contato — só chega aqui com o match ACEITO pelos dois.
 *
 * A API nem serializa o campo antes disso (ParticipanteResumo não tem onde
 * guardá-lo), então este componente não precisa checar nada: se `contato_visivel`
 * chegou, é porque o aceite mútuo aconteceu.
 */
function Contato({
  outro,
}: {
  outro?: { nome_exibicao: string; contato_visivel?: string | null }
}) {
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

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 py-10">
      {children}
    </div>
  )
}
