import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  Escolha,
  FolhaInferior,
  Quantidade,
} from '@/components/carta/ControlesAnuncio'
import { Button } from '@/components/ui/Button'
import { useAdicionarAnuncio } from '@/hooks/useAnuncios'
import { CONDICOES, type Condicao, PRIORIDADES } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { type Carta, type ListingKind, nomeCarta } from '@/lib/types'

/**
 * As especificações da carta, perguntadas na hora de adicionar.
 *
 * Antes o botão criava o anúncio direto, com o padrão do schema: NM, uma
 * unidade, acabamento normal. Funcionava, mas escondia a decisão — e são
 * justamente esses campos que decidem se um match existe. Condição é a mais
 * cara: o motor trata a condição pedida como mínimo aceitável, então uma carta
 * cadastrada como NM sem ninguém perguntar promete algo que a carta na mão
 * talvez não cumpra, e a diferença só aparece no encontro.
 *
 * Perguntar aqui custa um toque a mais e evita a viagem de volta a Minhas
 * cartas para corrigir o que nunca foi escolhido.
 */
export function FolhaAdicionar({
  carta,
  tipo,
  onFechar,
}: {
  /** A folha existe enquanto houver carta; `null` fecha. */
  carta: Carta | null
  tipo: ListingKind
  onFechar: () => void
}) {
  const adicionar = useAdicionarAnuncio()
  const [quantidade, setQuantidade] = useState(1)
  const [condicao, setCondicao] = useState<Condicao>('NM')
  const [prioridade, setPrioridade] = useState(2)
  const [qualquerFinish, setQualquerFinish] = useState(false)

  // Cada carta começa do zero: manter a condição da anterior faria a segunda
  // carta herdar uma escolha que era sobre outra carta.
  useEffect(() => {
    if (!carta) return
    setQuantidade(1)
    setCondicao('NM')
    setPrioridade(2)
    setQualquerFinish(false)
  }, [carta])

  if (!carta) return null

  const lista = tipo === 'OFERTA' ? 'Ofereço' : 'Procuro'

  function confirmar() {
    if (!carta) return
    adicionar.mutate(
      {
        card_id: carta.id,
        tipo,
        quantidade,
        condicao,
        prioridade,
        aceita_qualquer_finish: tipo === 'PROCURA' ? qualquerFinish : false,
      },
      {
        onSuccess: () => {
          toast.success(`${nomeCarta(carta)} entrou em ${lista}.`)
          onFechar()
        },
        onError: (erro) =>
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível adicionar agora.',
          ),
      },
    )
  }

  return (
    <FolhaInferior
      aberto
      onFechar={onFechar}
      rotulo={`Adicionar ${nomeCarta(carta)} a ${lista}`}
      carta={carta}
      tipo={tipo}
    >
      <div className="mt-5 flex flex-col gap-5">
        <Quantidade valor={quantidade} onMudar={setQuantidade} />

        <Escolha
          rotulo={
            tipo === 'OFERTA'
              ? 'Condição da sua carta'
              : 'Condição mínima que você aceita'
          }
          opcoes={CONDICOES.map((c) => ({
            valor: c.valor,
            rotulo: c.rotulo,
            titulo: c.dica,
          }))}
          valor={condicao}
          onMudar={(v) => setCondicao(v as Condicao)}
        />

        <Escolha
          rotulo="Prioridade"
          opcoes={PRIORIDADES.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
          valor={prioridade}
          onMudar={(v) => setPrioridade(v as number)}
        />

        {/* Só faz sentido em PROCURA: é o matcher que pode sugerir outro
            acabamento (db/schema/05_listings.sql). */}
        {tipo === 'PROCURA' && (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={qualquerFinish}
              onChange={(e) => setQualquerFinish(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-volt)]"
            />
            <span className="text-[14px] leading-relaxed text-muted">
              Aceito qualquer acabamento — aparecem mais trocas possíveis,
              marcadas quando o acabamento for diferente.
            </span>
          </label>
        )}

        <Button
          variant={tipo === 'OFERTA' ? 'offer' : 'want'}
          size="lg"
          block
          loading={adicionar.isPending}
          onClick={confirmar}
        >
          Adicionar a {lista}
        </Button>
      </div>
    </FolhaInferior>
  )
}
