import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  Escolha,
  FolhaInferior,
  Quantidade,
} from '@/components/carta/ControlesAnuncio'
import { Button } from '@/components/ui/Button'
import { useAcabamentosDaCarta } from '@/hooks/useAcabamentos'
import { useAdicionarAnuncio } from '@/hooks/useAnuncios'
import { NORMAL } from '@/lib/acabamentos'
import { CONDICOES, type Condicao, PRIORIDADES } from '@/lib/anuncios'
import { useAvisoDeErro } from '@/hooks/usePlanos'
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
 *
 * O acabamento entrou por último e é o que mais mudou a conta: o matcher casa
 * acabamento com acabamento, e enquanto ninguém escolhia, todo anúncio nascia
 * "Normal". Quem tinha a reverse anunciava a normal sem saber, e a diferença só
 * aparecia na mesa — que é onde a troca fura.
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
  const avisar = useAvisoDeErro()
  const [quantidade, setQuantidade] = useState(1)
  const [condicao, setCondicao] = useState<Condicao>('NM')
  const [acabamento, setAcabamento] = useState(NORMAL)
  const [prioridade, setPrioridade] = useState(2)
  const [qualquerFinish, setQualquerFinish] = useState(false)

  const { data: porCarta } = useAcabamentosDaCarta(carta ? [carta.id] : [])
  const acabamentos = (carta && porCarta?.get(carta.id)) || []

  // Cada carta começa do zero: manter a condição da anterior faria a segunda
  // carta herdar uma escolha que era sobre outra carta.
  useEffect(() => {
    if (!carta) return
    setQuantidade(1)
    setCondicao('NM')
    setPrioridade(2)
    setQualquerFinish(false)
  }, [carta])

  // O acabamento não pode cair no padrão do schema: uma carta que só existe em
  // holo não tem "Normal" para oferecer, e mandar `finish_id = 1` faria a API
  // recusar o anúncio com uma mensagem que a pessoa não pediu para ver. Normal
  // quando existe (é a impressão da maioria), a primeira da ordem quando não.
  //
  // A dependência é a lista de ids em texto, não o array: a consulta chega
  // depois da carta e o React Query devolve um array novo a cada resposta, então
  // comparar por identidade reabriria o efeito e desfaria a escolha da pessoa.
  const idsDisponiveis = acabamentos.map((a) => a.id).join('-')
  useEffect(() => {
    const ids = idsDisponiveis.split('-').filter(Boolean).map(Number)
    if (!ids.length) return
    setAcabamento(ids.includes(NORMAL) ? NORMAL : ids[0])
  }, [idsDisponiveis])

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
        finish_id: acabamento,
        prioridade,
        aceita_qualquer_finish: tipo === 'PROCURA' ? qualquerFinish : false,
      },
      {
        onSuccess: () => {
          toast.success(`${nomeCarta(carta)} entrou em ${lista}.`)
          onFechar()
        },
        // O teto de ofertas bate aqui: é a tela de cadastrar uma carta.
        onError: (erro) => avisar(erro, 'Não foi possível adicionar agora.'),
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

        {/* Some quando a carta só teve uma impressão: escolha de opção única não
            é escolha, é um controle a mais para ler. O anúncio sai com ela do
            mesmo jeito, e o detalhe da troca mostra qual é. */}
        {acabamentos.length > 1 && (
          <Escolha
            rotulo={
              tipo === 'OFERTA'
                ? 'Acabamento da sua carta'
                : 'Acabamento que você procura'
            }
            opcoes={acabamentos.map((a) => ({
              valor: a.id,
              rotulo: a.nome_curto,
              titulo: a.nome_pt,
            }))}
            valor={acabamento}
            onMudar={(v) => setAcabamento(v as number)}
          />
        )}

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
