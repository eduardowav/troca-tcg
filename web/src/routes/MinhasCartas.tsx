import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { BuscaRapida } from '@/components/carta/BuscaRapida'
import {
  Escolha,
  FolhaInferior,
  Quantidade,
} from '@/components/carta/ControlesAnuncio'
import { CelulaCarta, GradeDeCartas } from '@/components/carta/GradeDeCartas'
import { Button } from '@/components/ui/Button'
import { IconeBusca, IconeCartas } from '@/components/ui/Icone'
import {
  type Anuncio,
  CONDICOES,
  type Condicao,
  PRIORIDADES,
} from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  type Carta,
  type ListingKind,
  nomeCarta,
  type PrecoTCGplayer,
} from '@/lib/types'
import {
  useAdicionarAnuncio,
  useAnuncios,
  useCartasPorId,
  usePrecosPorId,
  useEditarAnuncio,
  useRemoverAnuncio,
} from '@/hooks/useAnuncios'

export default function MinhasCartas() {
  const { data: anuncios, isPending, isError, refetch } = useAnuncios()
  // A remoção mora aqui, e não na célula, por um motivo que só aparece testando:
  // ela é otimista, então a célula desmonta assim que o cache é atualizado — e o
  // React Query não chama os callbacks passados no `mutate()` de um componente
  // que já saiu da tela. O aviso com "Desfazer" simplesmente nunca aparecia.
  // A página não desmonta ao remover uma carta.
  const remocao = useRemocaoComDesfazer()

  const ids = useMemo(() => (anuncios ?? []).map((a) => a.card_id), [anuncios])
  const { data: cartas } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)

  const porLista = useMemo(
    () => ({
      OFERTA: (anuncios ?? []).filter((a) => a.tipo === 'OFERTA'),
      PROCURA: (anuncios ?? []).filter((a) => a.tipo === 'PROCURA'),
    }),
    [anuncios],
  )

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] 2xl:max-w-[120rem] flex-col px-5">
      <header className="w-full max-w-xl pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1] lg:text-[34px]">Minhas cartas</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted lg:text-[16px]">
          O que você oferece e o que procura, lado a lado. Toque numa carta para
          ajustar quantidade, condição e prioridade.
        </p>
      </header>

      {/* A busca compacta resolve o caso comum (achar uma carta pelo nome) sem
          tomar a tela; quem quer explorar cai na página de busca pelo Enter ou
          pelo link ao lado. */}
      {/* A busca acompanha a largura do conteúdo, não a da coluna de leitura:
          ela é um controle da página inteira, e uma barra estreita sobre duas
          grades largas lia como se pertencesse só à primeira. */}
      <div className="mt-4 flex w-full items-center gap-2">
        <BuscaRapida className="flex-1" />
        <Link
          to="/buscar"
          className="shrink-0 rounded-[var(--radius-control)] px-2 py-2 text-[14px] text-muted transition-colors hover:text-paper"
        >
          Explorar
        </Link>
      </div>

      <div className="mt-6 w-full flex-1 pb-6">
        {isError ? (
          <div className="max-w-xl">
            <Recuperavel onTentar={() => refetch()} />
          </div>
        ) : (
          // As duas listas na mesma tela, uma em cada lado. A troca é uma
          // relação entre elas — o que eu dou e o que eu quero — e a aba
          // escondia metade da conversa atrás de um clique.
          //
          // Empilha abaixo de `lg` porque duas grades lado a lado num celular
          // dariam uma carta de largura cada: aí a comparação que motiva o
          // lado a lado deixa de existir e sobra só carta pequena.
          <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2 lg:gap-x-0">
            <Coluna
              tipo="OFERTA"
              anuncios={porLista.OFERTA}
              cartas={cartas}
              precos={precos}
              carregando={isPending}
              remocao={remocao}
            />
            <Coluna
              tipo="PROCURA"
              anuncios={porLista.PROCURA}
              cartas={cartas}
              precos={precos}
              carregando={isPending}
              remocao={remocao}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Uma lista ---------- */

function Coluna({
  tipo,
  anuncios,
  cartas,
  precos,
  carregando,
  remocao,
}: {
  tipo: ListingKind
  anuncios: Anuncio[]
  cartas?: Map<string, Carta>
  precos?: Map<string, PrecoTCGplayer>
  carregando: boolean
  remocao: Remocao
}) {
  const oferta = tipo === 'OFERTA'

  return (
    <section
      aria-label={oferta ? 'Ofereço' : 'Procuro'}
      className={cn(
        // A divisa precisa ser visível: sem ela, a última carta de uma lista e
        // a primeira da outra encostam e a tela vira uma grade só. O fio some
        // no empilhado, onde a separação já vem do cabeçalho de cada seção.
        !oferta && 'lg:border-l lg:border-edge-soft lg:pl-8',
        oferta && 'lg:pr-8',
      )}
    >
      <header className="flex items-baseline gap-2 border-b border-edge-soft pb-2">
        <h2
          className={cn(
            'text-[16px] font-medium lg:text-[18px]',
            oferta ? 'text-offer' : 'text-want',
          )}
        >
          {oferta ? 'Ofereço' : 'Procuro'}
        </h2>
        <span className="set-code text-[13px] text-muted">
          {anuncios.length}
        </span>
        <span className="ml-auto text-[13px] text-faint">
          {oferta ? 'o que eu dou' : 'o que eu quero'}
        </span>
      </header>

      <div className="mt-3">
        {carregando ? (
          <Esqueleto />
        ) : anuncios.length === 0 ? (
          <Vazio tipo={tipo} />
        ) : (
          // Menos colunas que a grade da busca: aqui cada lista tem metade da
          // tela, e herdar as seis colunas do catálogo espremeria a arte.
          <GradeDeCartas className="lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {anuncios.map((anuncio) => (
              <CartaDaLista
                key={anuncio.id}
                anuncio={anuncio}
                carta={cartas?.get(anuncio.card_id)}
                preco={precos?.get(anuncio.card_id)}
                remocao={remocao}
              />
            ))}
          </GradeDeCartas>
        )}
      </div>
    </section>
  )
}

/* ---------- Carta da lista ---------- */

/**
 * A carta como ela aparece na busca — mesma célula, mesma arte grande.
 *
 * O editor saiu de dentro da célula: numa coluna de ~240px, cinco botões de
 * condição e três de prioridade viravam sopa de letrinhas. Ele agora abre numa
 * folha por cima, que é onde há largura para os controles respirarem — e é o
 * gesto que o texto da tela já prometia ("toque numa carta para ajustar").
 */

/**
 * Remoção com desfazer, em vez de "tem certeza?".
 *
 * Confirmação cobra de todo mundo, inclusive de quem acertou, e é justamente
 * quem acertou que é a maioria. Desfazer cobra só de quem errou — e aqui dá para
 * oferecer de verdade: o anúncio some na hora (a mutation já é otimista), e a
 * volta recria o mesmo card com as mesmas especificações, porque o upsert da API
 * é idempotente e reativa a linha em vez de duplicar.
 */
type Remocao = ReturnType<typeof useRemocaoComDesfazer>

function useRemocaoComDesfazer() {
  const remover = useRemoverAnuncio()
  const recriar = useAdicionarAnuncio()

  function apagar(anuncio: Anuncio, carta: Carta, aoRemover?: () => void) {
    remover.mutate(anuncio.id, {
      onSuccess: () => {
        aoRemover?.()
        const lista = anuncio.tipo === 'OFERTA' ? 'Ofereço' : 'Procuro'
        toast.success(`${nomeCarta(carta)} saiu de ${lista}.`, {
          action: {
            label: 'Desfazer',
            onClick: () =>
              recriar.mutate({
                card_id: anuncio.card_id,
                tipo: anuncio.tipo,
                quantidade: anuncio.quantidade,
                condicao: anuncio.condicao,
                finish_id: anuncio.finish_id,
                idioma: anuncio.idioma,
                prioridade: anuncio.prioridade,
                aceita_qualquer_finish: anuncio.aceita_qualquer_finish,
              }),
          },
        })
      },
      onError: () => toast.error('Não foi possível remover agora.'),
    })
  }

  return { apagar, removendo: remover.isPending }
}

function CartaDaLista({
  anuncio,
  carta,
  preco,
  remocao,
}: {
  anuncio: Anuncio
  carta?: Carta
  preco?: PrecoTCGplayer
  remocao: Remocao
}) {
  const [editando, setEditando] = useState(false)

  if (!carta) return <CelulaEsqueleto />

  return (
    <CelulaCarta carta={carta} destaque={anuncio.tipo} preco={preco}>
      {/* A faixa de ações é uma só: abrir o editor. Remover mora lá dentro, junto
          das outras alterações da carta — foi decisão do Eduardo (2026-08-03).
          Uma lixeira permanente sobre cada carta é peso visual repetido em toda a
          grade para uma ação que ninguém faz em série, e ainda encostava no alvo
          de editar. */}
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex h-9 w-full min-w-0 items-center justify-between gap-2 px-2.5',
          'rounded-[var(--radius-control)] border border-edge bg-surface-2',
          'text-[14px] text-muted transition-colors hover:text-paper lg:text-[15px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
        )}
      >
        <span className="truncate">{resumo(anuncio)}</span>
        <IconeLapis className="size-3.5 shrink-0" />
      </button>

      <EditorAnuncio
        aberto={editando}
        onFechar={() => setEditando(false)}
        anuncio={anuncio}
        carta={carta}
        remocao={remocao}
      />
    </CelulaCarta>
  )
}

function CelulaEsqueleto() {
  return (
    <li
      aria-hidden
      className="flex flex-col gap-2 rounded-card border border-edge-soft p-2"
    >
      <div className="aspect-[2.5/3.5] w-full animate-pulse rounded-[10px] bg-surface-2" />
      <div className="space-y-1.5 px-0.5">
        <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-9 animate-pulse rounded-[var(--radius-control)] bg-surface-2" />
    </li>
  )
}

/* ---------- Editor em folha ---------- */

function EditorAnuncio({
  aberto,
  onFechar,
  anuncio,
  carta,
  remocao,
}: {
  aberto: boolean
  onFechar: () => void
  anuncio: Anuncio
  carta: Carta
  remocao: Remocao
}) {
  const editar = useEditarAnuncio()
  const { apagar, removendo } = remocao

  // Esc fecha, e a página não rola atrás da folha aberta.
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto, onFechar])

  function aplicar(dados: Parameters<typeof editar.mutate>[0]['dados']) {
    editar.mutate(
      { id: anuncio.id, dados },
      {
        onError: (erro) =>
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível salvar a alteração.',
          ),
      },
    )
  }

  return (
    <FolhaInferior
      aberto={aberto}
      onFechar={onFechar}
      rotulo={`Ajustar ${nomeCarta(carta)}`}
      carta={carta}
      tipo={anuncio.tipo}
      fecharNoTopo={false}
    >
              <div className="mt-5 flex flex-col gap-5">
                <Quantidade
                  valor={anuncio.quantidade}
                  onMudar={(quantidade) => aplicar({ quantidade })}
                />

                <Escolha
                  rotulo="Condição"
                  opcoes={CONDICOES.map((c) => ({
                    valor: c.valor,
                    rotulo: c.rotulo,
                    titulo: c.dica,
                  }))}
                  valor={anuncio.condicao}
                  onMudar={(condicao) =>
                    aplicar({ condicao: condicao as Condicao })
                  }
                />

                <Escolha
                  rotulo="Prioridade"
                  opcoes={PRIORIDADES.map((p) => ({
                    valor: p.valor,
                    rotulo: p.rotulo,
                  }))}
                  valor={anuncio.prioridade}
                  onMudar={(prioridade) =>
                    aplicar({ prioridade: prioridade as number })
                  }
                />

                {/* Só faz sentido em PROCURA: é o matcher que pode sugerir outro
                    acabamento (db/schema/05_listings.sql). */}
                {anuncio.tipo === 'PROCURA' && (
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={anuncio.aceita_qualquer_finish}
                      onChange={(e) =>
                        aplicar({ aceita_qualquer_finish: e.target.checked })
                      }
                      className="mt-0.5 size-5 shrink-0 accent-[var(--color-volt)]"
                    />
                    <span className="text-[14px] leading-relaxed text-muted">
                      Aceito qualquer acabamento — aparecem mais trocas
                      possíveis, marcadas quando o acabamento for diferente.
                    </span>
                  </label>
                )}

                {/* Cada controle acima já gravou sozinho, então "Concluído" não
                    salva nada — só encerra. Existe porque a folha precisa de um
                    fim declarado e alcançável pelo dedo: fechar por Esc, pelo
                    fundo ou pelo canto de cima é atalho de quem já sabe.
                    A remoção fica no extremo oposto, longe do alvo grande, e
                    segue com desfazer. */}
                <div className="mt-1 flex items-center gap-3 border-t border-edge-soft pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={removendo}
                    onClick={() => apagar(anuncio, carta, onFechar)}
                    className="shrink-0 text-alert hover:text-alert"
                  >
                    Remover da lista
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={onFechar}
                    className="ml-auto flex-1"
                  >
                    Concluído
                  </Button>
                </div>
              </div>
    </FolhaInferior>
  )
}

function IconeLapis({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/**
 * O resumo que cabe na faixa de ações da célula.
 *
 * Prioridade só aparece quando **não** é a padrão. "Normal" é o valor da imensa
 * maioria das cartas: repetido em todas, não distingue nenhuma, e era o que
 * empurrava o texto para o truncamento nas colunas estreitas. Quem mexeu na
 * prioridade vê; quem não mexeu ganha espaço.
 */
const PRIORIDADE_PADRAO = 2

function resumo(a: Anuncio): string {
  const prioridade =
    a.prioridade === PRIORIDADE_PADRAO
      ? null
      : PRIORIDADES.find((p) => p.valor === a.prioridade)?.rotulo
  return [`${a.quantidade}×`, a.condicao, prioridade].filter(Boolean).join(' · ')
}

/* ---------- Controles ---------- */

/* ---------- Estados da lista ---------- */

function Esqueleto() {
  return (
    <GradeDeCartas className="lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <CelulaEsqueleto key={i} />
      ))}
    </GradeDeCartas>
  )
}

function Vazio({ tipo }: { tipo: ListingKind }) {
  const oferta = tipo === 'OFERTA'
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-edge bg-surface text-muted">
        {oferta ? (
          <IconeCartas className="size-6" />
        ) : (
          <IconeBusca className="size-6" />
        )}
      </div>
      <p className="mt-4 text-[15px] text-paper">
        {oferta
          ? 'Você ainda não oferece nenhuma carta.'
          : 'Você ainda não procura nenhuma carta.'}
      </p>
      <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">
        {oferta
          ? 'As cartas repetidas que você topa trocar entram aqui.'
          : 'As cartas que faltam para você entram aqui — é o que o app usa para achar match.'}
      </p>
      <p className="mt-5 text-[13px] text-faint">
        Use “Adicionar carta” acima para começar.
      </p>
    </div>
  )
}

function Recuperavel({ onTentar }: { onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="text-[15px] text-paper">Não deu para carregar suas cartas.</p>
      <p className="mt-1.5 text-[14px] text-muted">
        Pode ser a conexão. Tente de novo.
      </p>
      <Button variant="subtle" size="sm" className="mt-5" onClick={onTentar}>
        Tentar de novo
      </Button>
    </div>
  )
}
