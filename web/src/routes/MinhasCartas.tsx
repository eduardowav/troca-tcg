import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import { BotaoBrutal } from '@/components/brutal/Pecas'
import { BuscaRapida } from '@/components/carta/BuscaRapida'
import {
  Escolha,
  FolhaInferior,
  Quantidade,
} from '@/components/carta/ControlesAnuncio'
import { Button } from '@/components/ui/Button'
import { IconeBusca, IconeCartas } from '@/components/ui/Icone'
import { useMundo } from '@/hooks/useMundo'
import { type Acabamento, NORMAL, precoDoAcabamento } from '@/lib/acabamentos'
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
  opcoesDeAcabamento,
  useAcabamentoPorId,
  useAcabamentosDaCarta,
} from '@/hooks/useAcabamentos'
import {
  useAdicionarAnuncio,
  useAnuncios,
  useCartasPorId,
  usePrecosPorId,
  useEditarAnuncio,
  useRemoverAnuncio,
} from '@/hooks/useAnuncios'

export default function MinhasCartas() {
  useMundo('brutal')

  // Ofereço abre primeiro: é a lista que o app precisa que exista para um match
  // acontecer, e a que costuma estar mais vazia (média 4, contra 7 de Procuro).
  const [aba, setAba] = useState<ListingKind>('OFERTA')

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
  const { data: acabamentos } = useAcabamentosDaCarta(ids)

  const porLista = useMemo(
    () => ({
      OFERTA: (anuncios ?? []).filter((a) => a.tipo === 'OFERTA'),
      PROCURA: (anuncios ?? []).filter((a) => a.tipo === 'PROCURA'),
    }),
    [anuncios],
  )

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 2xl:max-w-[120rem]">
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Minhas cartas
        </h1>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          O que você oferece e o que procura. Toque numa carta para ajustar
          quantidade, condição, acabamento e prioridade.
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
          className="shrink-0 rounded-[var(--radius-etiqueta)] px-2 py-2 font-corpo text-[14px] font-medium text-azul underline underline-offset-2"
        >
          Explorar
        </Link>
      </div>

      {/* Abas no celular, lado a lado no desktop.

          A versão anterior empilhava as duas listas no celular, e o comentário
          que estava aqui defendia isso: "a aba esconde metade da conversa atrás
          de um clique". A objeção é boa — e continua valendo onde as duas cabem
          juntas, que é o desktop, onde nada mudou.

          No celular elas nunca couberam: com média de 4 cartas em Ofereço e 7
          em Procuro, chegar na segunda lista custava rolar a primeira inteira, e
          as duas nunca estavam na tela ao mesmo tempo de qualquer forma. A
          "conversa" já estava partida — a aba só assume isso e devolve a
          largura toda para a grade. Decisão do Eduardo, com os números na mesa. */}
      <div className="mt-5 flex gap-2 lg:hidden">
        {(['OFERTA', 'PROCURA'] as const).map((t) => (
          <Aba
            key={t}
            ativa={aba === t}
            onClick={() => setAba(t)}
            rotulo={t === 'OFERTA' ? 'Ofereço' : 'Procuro'}
            quantas={porLista[t].length}
          />
        ))}
      </div>

      <div className="mt-5 w-full flex-1 pb-6">
        {isError ? (
          <div className="max-w-xl">
            <Recuperavel onTentar={() => refetch()} />
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2 lg:gap-x-0">
            <Coluna
              tipo="OFERTA"
              // A lista inativa sai do fluxo no celular e volta no desktop.
              // `hidden` e não desmontar: a grade guarda posição de rolagem e
              // as imagens já carregadas, e alternar aba não deve custar
              // recarregar arte que já está no navegador.
              className={cn(aba !== 'OFERTA' && 'hidden lg:block')}
              anuncios={porLista.OFERTA}
              cartas={cartas}
              precos={precos}
              acabamentos={acabamentos}
              carregando={isPending}
              remocao={remocao}
            />
            <Coluna
              tipo="PROCURA"
              className={cn(aba !== 'PROCURA' && 'hidden lg:block')}
              anuncios={porLista.PROCURA}
              cartas={cartas}
              precos={precos}
              acabamentos={acabamentos}
              carregando={isPending}
              remocao={remocao}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Uma aba do seletor de lista.
 *
 * A ativa é azul cheia com sombra dura; a inativa é papel com a mesma borda. O
 * contraste entre as duas é o que diz qual lista está na tela — não há cor por
 * lista no mundo novo, e não podia haver: nesta grade o azul já é `RARE` e o
 * âmbar já é `ULTRA RARE`, dentro da própria célula. Com uma lista por vez, a
 * aba resolve sozinha o que a cor resolveria, e sem disputar leitura com a
 * raridade.
 *
 * A contagem fica em mono ao lado do rótulo: é dado, e é ela que responde
 * "vale a pena trocar de aba?" antes do toque.
 */
function Aba({
  ativa,
  onClick,
  rotulo,
  quantas,
}: {
  ativa: boolean
  onClick: () => void
  rotulo: string
  quantas: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-2.5',
        'font-titulo text-[14px] font-extrabold uppercase transition-shadow',
        ativa
          ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
          : 'bg-papel text-tinta',
      )}
    >
      {rotulo}
      <span
        className={cn(
          'font-dado text-[12px] font-bold',
          ativa ? 'text-azul-tinta/80' : 'text-apagado',
        )}
      >
        {quantas}
      </span>
    </button>
  )
}

/* ---------- Uma lista ---------- */

function Coluna({
  tipo,
  className,
  anuncios,
  cartas,
  precos,
  acabamentos,
  carregando,
  remocao,
}: {
  tipo: ListingKind
  className?: string
  anuncios: Anuncio[]
  cartas?: Map<string, Carta>
  precos?: Map<string, PrecoTCGplayer[]>
  acabamentos?: Map<string, Acabamento[]>
  carregando: boolean
  remocao: Remocao
}) {
  const oferta = tipo === 'OFERTA'

  return (
    <section
      aria-label={oferta ? 'Ofereço' : 'Procuro'}
      className={cn(!oferta && 'lg:pl-8', oferta && 'lg:pr-8', className)}
    >
      {/* O cabeçalho só existe no desktop. No celular a aba já diz qual lista
          está na tela, e repetir o nome logo abaixo dela seria dizer duas vezes
          a mesma coisa no espaço mais caro do aparelho. */}
      <header className="hidden items-baseline gap-2 border-b-2 border-tinta pb-2 lg:flex">
        <h2 className="font-titulo text-[18px] font-black text-tinta">
          {oferta ? 'Ofereço' : 'Procuro'}
        </h2>
        <span className="font-dado text-[13px] font-bold text-apagado">
          {anuncios.length}
        </span>
        <span className="ml-auto font-corpo text-[13px] text-apagado">
          {oferta ? 'o que eu dou' : 'o que eu quero'}
        </span>
      </header>

      <div className="lg:mt-3">
        {carregando ? (
          <Esqueleto />
        ) : anuncios.length === 0 ? (
          <Vazio tipo={tipo} />
        ) : (
          // Menos colunas que a grade da busca: aqui cada lista tem metade da
          // tela, e herdar as seis colunas do catálogo espremeria a arte.
          <GradeBrutal className="lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {anuncios.map((anuncio) => (
              <CartaDaLista
                key={anuncio.id}
                anuncio={anuncio}
                carta={cartas?.get(anuncio.card_id)}
                precos={precos?.get(anuncio.card_id)}
                acabamentos={acabamentos?.get(anuncio.card_id)}
                remocao={remocao}
              />
            ))}
          </GradeBrutal>
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
  precos,
  acabamentos,
  remocao,
}: {
  anuncio: Anuncio
  carta?: Carta
  precos?: PrecoTCGplayer[]
  acabamentos?: Acabamento[]
  remocao: Remocao
}) {
  const [editando, setEditando] = useState(false)
  // Pela tabela, não pela lista da carta: anúncio antigo pode carregar um
  // acabamento que o catálogo da carta não lista. Ver useAcabamentoPorId.
  const acabamento = useAcabamentoPorId()(anuncio.finish_id)

  if (!carta) return <CelulaEsqueleto />

  return (
    <CelulaBrutal
      carta={carta}
      // O preço segue o acabamento anunciado, não a impressão comum: quem
      // anunciou a reverse vê o valor da reverse. É a mesma carta com dois
      // preços, e mostrar o outro é o começo de uma troca desigual.
      preco={precoDoAcabamento(precos, acabamento)}
    >
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
          'rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-papel',
          'font-dado text-[11px] font-medium text-tinta transition-shadow',
          'hover:shadow-[var(--shadow-duro-xs)]',
        )}
      >
        <span className="truncate">{resumo(anuncio, acabamento)}</span>
        <IconeLapis className="size-3.5 shrink-0" />
      </button>

      <EditorAnuncio
        aberto={editando}
        onFechar={() => setEditando(false)}
        anuncio={anuncio}
        carta={carta}
        acabamentos={opcoesDeAcabamento(acabamentos, acabamento)}
        remocao={remocao}
      />
    </CelulaBrutal>
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
  acabamentos,
  remocao,
}: {
  aberto: boolean
  onFechar: () => void
  anuncio: Anuncio
  carta: Carta
  acabamentos?: Acabamento[]
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

                {/* Corrigir o acabamento aqui é o que evita remover e
                    recadastrar a carta por causa de um toque errado — e é por
                    isso que `finish_id` é editável, ao contrário de carta e
                    tipo (api/app/schemas/listing.py). Trocar para um acabamento
                    que a pessoa já anuncia volta como 409, porque a chave única
                    do anúncio inclui o acabamento. */}
                {acabamentos && acabamentos.length > 1 && (
                  <Escolha
                    rotulo="Acabamento"
                    opcoes={acabamentos.map((a) => ({
                      valor: a.id,
                      rotulo: a.nome_curto,
                      titulo: a.nome_pt,
                    }))}
                    valor={anuncio.finish_id}
                    onMudar={(finish_id) =>
                      aplicar({ finish_id: finish_id as number })
                    }
                  />
                )}

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
 *
 * O acabamento entra pela mesma régua e pelo motivo oposto: ele **distingue** —
 * duas linhas da mesma carta na lista só se diferenciam por ele, e sem o rótulo
 * a pessoa não sabe qual das duas está prestes a editar. O Normal fica de fora
 * porque é o valor da maioria, como a prioridade padrão.
 */
const PRIORIDADE_PADRAO = 2

function resumo(a: Anuncio, acabamento?: Acabamento): string {
  const prioridade =
    a.prioridade === PRIORIDADE_PADRAO
      ? null
      : PRIORIDADES.find((p) => p.valor === a.prioridade)?.rotulo
  const acabamentoTexto =
    acabamento && acabamento.id !== NORMAL ? acabamento.nome_curto : null
  return [`${a.quantidade}×`, a.condicao, acabamentoTexto, prioridade]
    .filter(Boolean)
    .join(' · ')
}

/* ---------- Controles ---------- */

/* ---------- Estados da lista ---------- */

function Esqueleto() {
  return (
    <GradeBrutal className="lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          aria-hidden
          className="flex flex-col gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-2"
        >
          <div className="aspect-[2.5/3.5] animate-pulse rounded-[var(--radius-imagem)] border-2 border-tinta bg-papel" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-meu" />
        </li>
      ))}
    </GradeBrutal>
  )
}

function Vazio({ tipo }: { tipo: ListingKind }) {
  const oferta = tipo === 'OFERTA'
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela text-tinta shadow-[var(--shadow-duro)]">
        {oferta ? (
          <IconeCartas className="size-6" />
        ) : (
          <IconeBusca className="size-6" />
        )}
      </span>
      <p className="mt-5 font-titulo text-[17px] font-bold text-tinta">
        {oferta
          ? 'Você ainda não oferece nenhuma carta.'
          : 'Você ainda não procura nenhuma carta.'}
      </p>
      <p className="mt-2 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
        {oferta
          ? 'As cartas repetidas que você topa trocar entram aqui.'
          : 'As cartas que faltam para você entram aqui — é o que o app usa para achar match.'}
      </p>
      <p className="mt-5 font-dado text-[11px] uppercase text-apagado">
        Use a busca acima para começar
      </p>
    </div>
  )
}

function Recuperavel({ onTentar }: { onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="font-titulo text-[17px] font-bold text-tinta">
        Não deu para carregar suas cartas.
      </p>
      <p className="mt-2 font-corpo text-[14px] text-apagado">
        Pode ser a conexão. Tente de novo.
      </p>
      <button onClick={onTentar} className="mt-5">
        <BotaoBrutal>Tentar de novo</BotaoBrutal>
      </button>
    </div>
  )
}
