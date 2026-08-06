import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { useDenunciar } from '@/hooks/usePerfilPublico'
import { ApiError } from '@/lib/api'
import {
  LIMITE_DESCRICAO,
  MOTIVOS,
  type MotivoDenuncia,
} from '@/lib/denuncias'
import type { MatchStatus } from '@/lib/matches'

/** Onde já houve o que denunciar: contato revelado, ou troca encerrada. */
const COM_HISTORIA: MatchStatus[] = [
  'ACEITO',
  'CONCLUIDO',
  'FURADO',
  'EXPIRADO',
  'CANCELADO',
]

export function cabeDenuncia(status: MatchStatus): boolean {
  return COM_HISTORIA.includes(status)
}

/**
 * Denunciar a outra pessoa da troca.
 *
 * Nasce fechada, atrás de um link em letra miúda no pé da tela, e é de propósito
 * que ela seja difícil de acionar por acidente e fácil de achar quando
 * procurada. Denúncia à mão, em botão de tamanho normal ao lado de "a troca
 * aconteceu", convidaria a resolver com ela um desentendimento que ainda cabe
 * numa conversa — e a fila da moderação encheria de gente chateada, não de gente
 * lesada.
 *
 * O tom do texto não acusa nem tranquiliza demais: quem chega aqui já sabe o que
 * aconteceu, e o que ele precisa é entender o que a denúncia faz (registra, para
 * uma pessoa ler) e o que ela não faz (não bloqueia ninguém, não mexe em
 * reputação). Prometer punição imediata seria mentir; dizer "vamos analisar" sem
 * dizer o que isso significa seria empurrar com a barriga.
 */
export function Denunciar({
  matchId,
  nome,
  status,
}: {
  matchId: string
  nome: string
  status: MatchStatus
}) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null)
  const [descricao, setDescricao] = useState('')
  const [enviada, setEnviada] = useState(false)
  const denunciar = useDenunciar()
  const grupo = useId()

  if (!cabeDenuncia(status)) return null

  if (enviada) {
    return (
      <div className="cartela mt-8 rounded-[var(--radius-card)] border border-edge bg-surface p-4">
        <p className="text-[14px] leading-relaxed text-paper">
          Denúncia registrada. Obrigado por contar.
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Uma pessoa vai ler o que você escreveu junto do histórico dessa troca.
          Não avisamos {nome} de que a denúncia partiu de você.
        </p>
      </div>
    )
  }

  if (!aberto) {
    return (
      <div className="mt-8 text-center">
        <button
          onClick={() => setAberto(true)}
          className="text-[13px] text-faint underline underline-offset-4 hover:text-alert"
        >
          Algo errado nessa troca?
        </button>
      </div>
    )
  }

  function enviar() {
    if (!motivo) return
    denunciar.mutate(
      { id: matchId, motivo, descricao },
      {
        onSuccess: () => setEnviada(true),
        onError: (erro) => {
          // Já denunciada é 409, e não é erro de quem clicou: é alguém em dúvida
          // se o primeiro envio funcionou. A resposta certa é confirmar que sim.
          if (erro instanceof ApiError && erro.codigo === 'DENUNCIA_JA_ENVIADA') {
            return setEnviada(true)
          }
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível enviar agora.',
          )
        },
      },
    )
  }

  const restantes = LIMITE_DESCRICAO - descricao.length

  return (
    <div className="cartela mt-8 rounded-[var(--radius-card)] border border-edge bg-surface p-5">
      <p className="text-[15px] font-medium text-paper">
        O que aconteceu com {nome}?
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Isso não bloqueia ninguém nem mexe na reputação de {nome} — quem move a
        reputação é o desfecho da troca. Fica registrado para uma pessoa da
        moderação ler.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Motivo da denúncia</legend>
        <div className="flex flex-col gap-1.5">
          {MOTIVOS.map((m) => (
            <label
              key={m.valor}
              className="flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-edge-soft bg-surface-2 p-3 has-[:checked]:border-[color-mix(in_oklab,var(--color-alert)_45%,transparent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-volt"
            >
              <input
                type="radio"
                name={grupo}
                value={m.valor}
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-alert)]"
              />
              <span className="min-w-0">
                <span className="block text-[14px] text-paper">{m.rotulo}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">
                  {m.dica}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-[13px] text-muted">
          Conte o que houve {motivo === 'OUTRO' ? '' : '(opcional)'}
        </span>
        <textarea
          value={descricao}
          maxLength={LIMITE_DESCRICAO}
          rows={4}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Data, hora e lugar combinados ajudam bastante."
          className="mt-1.5 w-full resize-y rounded-[var(--radius-control)] border border-edge bg-surface-2 px-3 py-2 text-[15px] leading-relaxed text-paper placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
        />
        {/* Só perto do fim: um contador desde o primeiro caractere transforma um
            campo livre num teste de concisão, e aqui a pessoa está relatando. */}
        {restantes <= 100 && (
          <span className="mt-1 block text-right text-[12px] text-faint">
            {restantes} caracteres restantes
          </span>
        )}
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="md"
          block
          disabled={!motivo}
          loading={denunciar.isPending}
          onClick={enviar}
          className="text-alert hover:text-alert"
        >
          Enviar denúncia
        </Button>
        <Button
          variant="subtle"
          size="md"
          block
          disabled={denunciar.isPending}
          onClick={() => {
            setAberto(false)
            setMotivo(null)
            setDescricao('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
