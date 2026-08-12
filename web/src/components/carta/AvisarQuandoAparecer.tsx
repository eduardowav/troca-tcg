import { toast } from 'sonner'

import {
  useAlertaDaCarta,
  useDesligarAlerta,
  useLigarAlerta,
} from '@/hooks/useAlertas'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * "Avise quando aparecer" — o alerta de carta (Fase B da seção 16).
 *
 * **Não é o Procuro.** O Procuro declara o desejo e alimenta o matcher, que só
 * fecha com reciprocidade: se ninguém quiser nada do que você tem, a carta pode
 * aparecer e nada acontece. O alerta cobre exatamente essa espera de um lado só
 * — por isso os dois convivem, e por isso o texto daqui fala em *avisar*, nunca
 * em *procurar*.
 *
 * Vive em dois lugares, e os dois são o mesmo momento visto de ângulos
 * diferentes: no detalhe da carta, onde a pessoa decide o que fazer com ela; e
 * no vazio da vitrine, onde ela acabou de descobrir que ninguém tem. É desse
 * vazio que o recurso nasce, e é lá que ele responde a uma pergunta que a tela
 * antes deixava sem resposta.
 *
 * O interruptor não aparece enquanto a lista de alertas não chegou: um botão
 * que nasce dizendo "Ligar" e vira "Desligar" meio segundo depois pisca a
 * própria resposta na cara de quem está lendo.
 */
export function AvisarQuandoAparecer({
  cardId,
  className,
}: {
  cardId: string
  className?: string
}) {
  const ligado = useAlertaDaCarta(cardId)
  const ligar = useLigarAlerta()
  const desligar = useDesligarAlerta()

  if (ligado === undefined) return null

  const mexendo = ligar.isPending || desligar.isPending

  return (
    <button
      type="button"
      disabled={mexendo}
      aria-pressed={ligado}
      onClick={() => {
        const acao = ligado ? desligar : ligar
        acao.mutate(cardId, {
          onSuccess: () =>
            toast.success(
              ligado
                ? 'Você não será mais avisado desta carta.'
                : 'Pronto. Avisamos assim que alguém anunciar esta carta.',
            ),
          onError: (erro) =>
            toast.error(
              erro instanceof ApiError
                ? erro.message
                : 'Não foi possível mudar o aviso agora.',
            ),
        })
      }}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-[var(--radius-controle)]',
        'border-2 border-tinta px-4 py-3 text-left font-corpo text-[14px] font-medium',
        'transition-shadow disabled:opacity-45',
        ligado
          ? 'bg-meu text-tinta shadow-[var(--shadow-duro-xs)]'
          : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
        className,
      )}
    >
      <span>
        {ligado
          ? 'Avisamos quando alguém anunciar'
          : 'Avise quando alguém anunciar'}
      </span>
      <span
        aria-hidden
        className="shrink-0 font-dado text-[11px] uppercase text-apagado"
      >
        {ligado ? 'Desligar' : 'Ligar'}
      </span>
    </button>
  )
}
