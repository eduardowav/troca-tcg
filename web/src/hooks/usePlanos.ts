import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ApiError } from '@/lib/api'
import {
  eLimiteDePlano,
  obterPlanos,
  obterSituacao,
  type Planos,
  type SituacaoDoPlano,
} from '@/lib/planos'

/**
 * Os planos, com os limites vindos da API.
 *
 * `staleTime` longo de propósito: isto muda quando alguém edita
 * `core/limites.py` e faz deploy, não durante a sessão de ninguém.
 */
export function usePlanos() {
  return useQuery<Planos>({
    queryKey: ['planos'],
    queryFn: obterPlanos,
    staleTime: 60 * 60_000,
  })
}

/**
 * O aviso de erro de toda escrita do app, com o convite ao PRO embutido.
 *
 * **O convite aparece no instante em que a pessoa esbarra num limite, e só
 * aí** — seção 16. Faixa fixa dizendo "assine" é anúncio; a mesma frase no
 * momento em que a pessoa quis fazer algo e não pôde é resposta. A diferença
 * está toda no quando.
 *
 * O que muda em relação ao `toast.error` que estava espalhado é só o botão: a
 * mensagem continua sendo a que a API mandou, porque ela já explica a regra em
 * português ("Seu plano permite anunciar até 20 cartas"). Sem o botão, a pessoa
 * lia a explicação e não tinha para onde ir com ela.
 *
 * Uso: `onError: (e) => avisar(e, 'Não foi possível cadastrar agora.')`
 */
export function useAvisoDeErro() {
  const navegar = useNavigate()

  return useCallback(
    (erro: unknown, generica: string) => {
      if (eLimiteDePlano(erro)) {
        toast.error(erro.message, {
          action: { label: 'Ver planos', onClick: () => navegar('/planos') },
          // Mais tempo que o padrão: este toast pede uma decisão, e o de sempre
          // some antes de alguém terminar de ler a regra e resolver se quer.
          duration: 8000,
        })
        return
      }

      toast.error(erro instanceof ApiError ? erro.message : generica)
    },
    [navegar],
  )
}

/**
 * A assinatura desta pessoa, do lado do Mercado Pago.
 *
 * Separado do `usePlanos`: aquilo é tabela de preço, pública e quase imutável;
 * isto é estado de conta, muda quando o webhook chega e não pode ficar em cache
 * de uma hora. `staleTime` curto porque a volta do checkout é exatamente o
 * momento em que a resposta velha estaria errada.
 */
export function useAssinatura(ligado = true) {
  return useQuery<SituacaoDoPlano>({
    queryKey: ['assinatura'],
    queryFn: obterSituacao,
    enabled: ligado,
    staleTime: 30_000,
  })
}
