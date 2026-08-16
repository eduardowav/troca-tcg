import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { LinkNoTexto, ParDeCartas } from '@/components/brutal/Pecas'
import { ModalIsencao } from '@/components/Isencao'
import { Denunciar } from '@/components/perfil/Denunciar'
import { Button, estiloBotao } from '@/components/ui/Button'
import { useAcabamentoPorId } from '@/hooks/useAcabamentos'
import { useCartasPorId, usePrecosPorId } from '@/hooks/useAnuncios'
import { useMarcaOculta } from '@/hooks/useMundo'
import {
  type Desfecho,
  useDesfechoMatch,
  useEstenderMatch,
  useMatch,
  useResponderMatch,
  useRevelarContato,
} from '@/hooks/useMatches'
import { type Acabamento, precoDoAcabamento } from '@/lib/acabamentos'
import { CONDICOES } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  euAceitei,
  euConfirmei,
  type Match,
  parceiro,
  podeEstender,
  prazoTexto,
  prazoUrgente,
  reputacaoTexto,
} from '@/lib/matches'
import { tocar } from '@/lib/sons'
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

/** Status em que a troca já acabou — o que muda o tempo verbal da tela. */
const ENCERRADOS = ['CONCLUIDO', 'FURADO', 'EXPIRADO', 'CANCELADO']

export default function MatchDetalhe() {
  useMarcaOculta()

  const { id } = useParams<{ id: string }>()
  const meuId = useUsuarioId()
  const { data: match, isPending, isError } = useMatch(id)
  const responder = useResponderMatch()
  const desfecho = useDesfechoMatch()
  const estender = useEstenderMatch()
  const ids = useMemo(
    () => (match?.itens ?? []).map((i) => i.card_id),
    [match],
  )
  const { data: cartas } = useCartasPorId(ids)
  const { data: precos } = usePrecosPorId(ids)
  const acabamentoPorId = useAcabamentoPorId()
  const selagem = useSelagem(match?.status)

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

  // Acabamento e preço andam juntos: o item da troca diz em que acabamento a
  // carta vai, e é a linha de preço daquele acabamento que vale. Antes disto o
  // aviso de troca desigual comparava sempre a impressão comum das duas cartas —
  // e uma reverse trocada por uma normal da mesma carta aparecia como troca
  // perfeitamente equilibrada.
  const acabamentoDou = acabamentoPorId(dou?.finish_id)
  const acabamentoRecebo = acabamentoPorId(recebo?.finish_id)

  const ladoDou = {
    acabamento: acabamentoDou,
    preco: precoDoAcabamento(dou && precos?.get(dou.card_id), acabamentoDou),
  }
  const ladoRecebo = {
    acabamento: acabamentoRecebo,
    preco: precoDoAcabamento(
      recebo && precos?.get(recebo.card_id),
      acabamentoRecebo,
    ),
  }

  const desigual = desequilibrio(ladoDou.preco?.preco, ladoRecebo.preco?.preco)

  // Uma decisão só, usada pela linha de troca e pela linha de condição. Elas
  // descrevem as mesmas duas cartas: se divergirem em ordem ou em tempo verbal,
  // a de baixo passa a falar da carta errada.
  //
  // São **três** tempos verbais, não dois. O passado só vale para a troca que
  // aconteceu; numa furada, expirada ou desmarcada, "você deu" afirma uma
  // entrega que nunca houve — e é a tela que a pessoa abre justamente para
  // entender o que aconteceu com aquelas cartas. O histórico do perfil já
  // distinguia os três casos; o detalhe, que é para onde ele leva, não.
  const rotulos =
    match.status === 'CONCLUIDO'
      ? { dou: 'Você deu', recebo: 'Você recebeu' }
      : ENCERRADOS.includes(match.status)
        ? { dou: 'Você daria', recebo: 'Você receberia' }
        : { dou: 'Você dá', recebo: 'Você recebe' }
  const trocado = match.status === 'CONCLUIDO'

  // O que o carimbo diz, e se ele existe. Duas palavras para dois fatos
  // diferentes: o acordo (ACEITO) e a entrega (CONCLUIDO). Nos outros estados
  // não há o que carimbar — uma troca recusada, furada ou vencida não deixou
  // marca de acordo nenhuma.
  const selo =
    match.status === 'CONCLUIDO'
      ? 'Trocado'
      : match.status === 'ACEITO'
        ? 'Combinada'
        : null
  const especificacoes = trocado
    ? [
        {
          rotulo: rotulos.recebo,
          condicao: recebo?.condicao,
          acabamento: ladoRecebo.acabamento,
        },
        {
          rotulo: rotulos.dou,
          condicao: dou?.condicao,
          acabamento: ladoDou.acabamento,
        },
      ]
    : [
        {
          rotulo: rotulos.dou,
          condicao: dou?.condicao,
          acabamento: ladoDou.acabamento,
        },
        {
          rotulo: rotulos.recebo,
          condicao: recebo?.condicao,
          acabamento: ladoRecebo.acabamento,
        },
      ]

  function registrarDesfecho(escolha: Desfecho) {
    desfecho.mutate(
      { id: match!.id, desfecho: escolha },
      {
        onSuccess: (novo) => {
          // A cena das cartas girando é daqui: é na conclusão que elas
          // mudaram de mão de verdade. O aceite ganha só o carimbo — combinar
          // não é entregar. Quem dispara é o `useSelagem`, observando o status
          // virar CONCLUIDO; este `toast` só dá a notícia por escrito.
          toast.success(
            novo.status === 'CONCLUIDO'
              ? 'Troca concluída pelos dois. Reputação atualizada.'
              : escolha === 'ACONTECEU'
                ? 'Confirmado. Falta a outra pessoa confirmar.'
                : escolha === 'DESISTI'
                  ? 'Troca desmarcada. A outra pessoa foi avisada.'
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
                ? 'Interesse marcado. Falta a outra pessoa.'
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
      {/* Tela em que se entra: volta e título próprio, sem a marca do app —
          mesma regra da página da carta, ligada pelo `useMarcaOculta`. */}
      <div className="flex items-center gap-3">
        <Link
          to="/matches"
          aria-label="Voltar para as trocas"
          className="voltar grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <p className="font-titulo text-[18px] leading-none font-black text-tinta">
          A troca
        </p>
      </div>

      <h1 className="titulo-pagina mt-5 text-[26px] leading-[1.15] lg:text-[32px]">
        Troca com {outro?.nome_exibicao ?? 'alguém'}.
      </h1>
      {/* O @ leva ao perfil dela. É o único caminho para "quem é essa pessoa?",
          e a pergunta vem antes de topar um encontro presencial com um estranho
          — por isso o link fica aqui em cima, e não escondido no rodapé. A
          reputação resumida continua ao lado: quem só quer o número não precisa
          sair da tela para lê-lo. */}
      <p className="mt-2 text-[15px] leading-relaxed text-muted lg:text-[16px]">
        {outro ? (
          <LinkNoTexto to={`/u/${outro.username}`}>
            @{outro.username}
          </LinkNoTexto>
        ) : (
          '@—'
        )}
        {reputacao && ` · ${reputacao}`}
      </p>

      <div className="cartela mt-8 rounded-[var(--radius-card)] border border-edge bg-surface p-5">
        {/* Tempo verbal: numa troca encerrada, "você dá" está falando de uma
            coisa que já aconteceu. O histórico do perfil já corrigia isso; o
            detalhe, que é para onde o histórico leva, não corrigia. */}
        <div className="relative">
          <ParDeCartas
            dou={dou && cartas?.get(dou.card_id)}
            recebo={recebo && cartas?.get(recebo.card_id)}
            lados={{ dou: ladoDou, recebo: ladoRecebo }}
            tamanho="grande"
            trocado={trocado}
            rotulos={rotulos}
            selando={selagem.selando}
          />

          {/* O carimbo fica, batido torto como um selo de mão — mas cada
              palavra tem de ser verdadeira no momento em que aparece.

              **COMBINADA** no aceite: vocês fecharam o acordo, e as cartas
              continuam cada uma do seu lado, porque ninguém entregou nada
              ainda. **TROCADO** só depois que os dois confirmam o encontro, e é
              lá que as cartas trocam de lado (regra do `ParDeCartas`). Carimbar
              "trocado" no aceite seria afirmar uma entrega que ainda não houve
              — e, se a troca furar, a tela teria mentido para os dois.

              Some enquanto as cartas giram: o selo é o que assenta depois delas,
              não um adesivo em cima do movimento. */}
          {selo && !selagem.selando && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 grid -translate-y-1/2 place-items-center">
              <span
                className={cn(
                  'rounded-[var(--radius-controle)] border-4 border-tinta bg-azul px-4 py-2',
                  'font-titulo text-[17px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro)]',
                  // A queda é do instante, não do estado: quem abre a tela dias
                  // depois encontra o selo parado, e não uma cena repetida.
                  selagem.selado ? 'selo-troca' : 'rotate-[-8deg]',
                )}
              >
                {selo}
              </span>
            </div>
          )}
        </div>

        {/* Os rótulos repetem, palavra por palavra, os das cartas logo acima —
            e na mesma ordem. Dizer "Você entrega" aqui e "Você dá" ali, a cem
            pixels de distância, obriga quem lê a checar se são a mesma coisa; e
            depois que as cartas trocam de lado, ficar parada aqui embaixo faz
            esta linha descrever a carta errada. */}
        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-edge-soft pt-4 text-[13px] lg:text-[15px]">
          {especificacoes.map((e) => (
            <Detalhe
              key={e.rotulo}
              rotulo={e.rotulo}
              condicao={e.condicao}
              acabamento={e.acabamento}
            />
          ))}
        </dl>
      </div>

      {/* Antes do aviso de desequilíbrio e das ações: prazo vencendo é a única
          coisa nesta tela com hora marcada. */}
      <PrazoApertado
        match={match}
        enviando={estender.isPending}
        onEstender={() =>
          estender.mutate(match.id, {
            onSuccess: () => toast.success('Prazo estendido por mais 7 dias.'),
            onError: (erro) =>
              toast.error(
                erro instanceof ApiError
                  ? erro.message
                  : 'Não foi possível estender agora.',
              ),
          })
        }
      />

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
      ) : match.status === 'CANCELADO' ? (
        // Quem desistiu e quem recebeu a desistência precisam de frases
        // diferentes: para um é a própria decisão, para o outro é notícia. Sem
        // isso a tela teria de escolher um texto que serve mal para os dois.
        <Encerrado
          titulo={
            match.desistiu_por === meuId
              ? 'Você desmarcou essa troca.'
              : `${outro?.nome_exibicao ?? 'A outra pessoa'} desmarcou essa troca.`
          }
          texto={
            match.desistiu_por === meuId
              ? 'Ninguém levou furo, e sua reputação de trocas segue intacta. As cartas voltam a procurar troca; daqui a uma semana, se vocês dois ainda tiverem interesse, ela pode ser sugerida de novo.'
              : 'Não foi um furo: a pessoa avisou antes do encontro. Suas cartas continuam disponíveis e voltam a aparecer para outras pessoas.'
          }
          tom="neutro"
        />
      ) : match.status === 'ACEITO' ? (
        <>
          <Contato
            matchId={match.id}
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

      {/* Por último, e em letra miúda. A tela existe para a troca dar certo; a
          denúncia é o que sobra quando não deu, e ocupar um lugar de destaque
          com ela sugeriria que dar errado é o caso comum. */}
      <Denunciar
        matchId={match.id}
        nome={primeiroNome(outro)}
        status={match.status}
      />

      <Rodape match={match} />
    </Moldura>
  )
}

/** O primeiro nome, que é como se fala de alguém. "Marina", não "Marina Alves". */
function primeiroNome(pessoa?: { nome_exibicao: string }): string {
  return pessoa?.nome_exibicao?.split(' ')[0] ?? 'quem está do outro lado'
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

/**
 * O prazo quando ele vira notícia.
 *
 * Sai da letra miúda do rodapé e sobe para dentro da tela nos dois últimos dias.
 * O motivo é a métrica-mãe: a troca combinada que expira calada vira EXPIRADO,
 * que conta contra os dois sem que nenhum tenha feito nada errado. Quase sempre
 * não é desinteresse — é a semana que passou. Um toque devolve a semana.
 *
 * Só aparece quando aperta. Um "expira em 6 dias" com botão ao lado convidaria a
 * esticar o prazo antes de tentar marcar, que é o oposto do que a tela quer.
 */
function PrazoApertado({
  match,
  onEstender,
  enviando,
}: {
  match: Match
  onEstender: () => void
  enviando: boolean
}) {
  if (!prazoUrgente(match)) return null

  const prazo = prazoTexto(match)
  const pode = podeEstender(match)

  return (
    // Empilhado no celular, lado a lado a partir de sm. Com o botão ao lado numa
    // largura de 390px, o parágrafo cai numa coluna de cinco linhas curtas e o
    // botão vira um alvo pequeno no canto — e é justamente no celular que este
    // aviso precisa ser tocado, porque é lá que a pessoa lê o app.
    <div
      role="status"
      data-tom="atencao"
      className="cartela mt-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-want)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-want)_8%,transparent)] p-4 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0 flex-1">
        <p className="titulo-tom text-[15px] font-medium text-want">{prazo}.</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {pode
            ? 'Depois disso ela sai das suas trocas e conta como não realizada para vocês dois. Se ainda estão combinando, estenda.'
            : 'Essa troca já foi estendida duas vezes. Se não der para se encontrarem agora, vale desmarcar em vez de deixar vencer.'}
        </p>
      </div>
      {pode && (
        <Button
          variant="want"
          size="md"
          block
          loading={enviando}
          onClick={onEstender}
          className="shrink-0 sm:w-auto"
        >
          Mais 7 dias
        </Button>
      )}
    </div>
  )
}

/**
 * O que exatamente sai e o que exatamente entra.
 *
 * Aqui o acabamento aparece **sempre**, inclusive o Normal — ao contrário do
 * selo sobre a carta, que só marca o que foge do comum. Esta é a linha que a
 * pessoa lê antes de topar a troca, e "Normal" dito por extenso é o que fecha a
 * dúvida de quem está trocando com um desconhecido: sem ele, silêncio sobre o
 * acabamento é indistinguível de "ninguém escolheu".
 */
function Detalhe({
  rotulo,
  condicao,
  acabamento,
}: {
  rotulo: string
  condicao?: string
  acabamento?: Acabamento
}) {
  const dica = CONDICOES.find((c) => c.valor === condicao)?.dica
  return (
    <div className="fileira">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-paper">
        {condicao ?? '—'}
        {dica && <span className="text-muted"> · {dica}</span>}
        {acabamento && (
          <span className="mt-0.5 block text-muted" title={acabamento.nome_pt}>
            {acabamento.nome_curto}
          </span>
        )}
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
        <p className="text-[15px] text-paper">Você marcou interesse.</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Quando a outra pessoa também marcar, o contato de vocês aparece aqui
          para combinarem onde e quando. Se não rolar, dá para desmarcar sem
          prejuízo à sua reputação.
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
        Tenho interesse
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
          A outra pessoa já marcou interesse. Falta você.
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
  onRegistrar: (desfecho: Desfecho) => void
}) {
  // Desistir encerra a troca para os dois e não tem desfazer — nem um "Desfazer"
  // no toast resolveria, porque o outro lado já foi avisado. Confirmar no lugar,
  // e só nesta: as outras duas ou dependem do outro lado (concluir) ou são o
  // registro de algo que já aconteceu (furo).
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false)

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
          onClick={() => onRegistrar('ACONTECEU')}
        >
          A troca aconteceu
        </Button>

        {/* As duas saídas negativas ficam juntas e abaixo, em peso menor: são o
            caminho de exceção. A ordem entre elas não é aleatória — desistir
            fala de você e vem primeiro; acusar o outro é o último recurso. */}
        {confirmandoDesistencia ? (
          <div className="mt-1 rounded-[var(--radius-control)] border border-edge-soft bg-surface-2 p-3">
            <p className="text-[14px] leading-relaxed text-paper">
              Desmarcar essa troca?
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              A outra pessoa é avisada e ninguém leva furo. Fica registrado como
              desistência no seu perfil — é o que mantém o aviso confiável.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="subtle"
                size="sm"
                disabled={enviando}
                onClick={() => setConfirmandoDesistencia(false)}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={enviando}
                onClick={() => onRegistrar('DESISTI')}
                className="flex-1"
              >
                Sim, desmarcar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            block
            disabled={enviando}
            onClick={() => setConfirmandoDesistencia(true)}
          >
            Não vou conseguir
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          block
          disabled={enviando}
          onClick={() => onRegistrar('FUROU')}
          className="text-alert hover:text-alert"
        >
          A pessoa não apareceu
        </Button>
      </div>
    </div>
  )
}

/**
 * O painel de troca encerrada.
 *
 * `neutro` existe por causa da desistência, e a cor é a decisão: pintá-la de
 * vermelho como o furo diria que alguém fez algo errado, e o produto acabou de
 * decidir o contrário — quem avisa antes faz o oposto de furar. Cartela comum,
 * sem moldura de alarme.
 */
function Encerrado({
  titulo,
  texto,
  tom,
}: {
  titulo: string
  texto: string
  tom: 'offer' | 'alert' | 'neutro'
}) {
  const bom = tom === 'offer'
  const ruim = tom === 'alert'
  return (
    <div
      data-tom={bom ? 'bom' : ruim ? 'ruim' : undefined}
      className={cn(
        'cartela mt-5 rounded-[var(--radius-card)] border p-5',
        bom &&
          'border-[color-mix(in_oklab,var(--color-offer)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-offer)_10%,transparent)]',
        ruim &&
          'border-[color-mix(in_oklab,var(--color-alert)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-alert)_10%,transparent)]',
        !bom && !ruim && 'border-edge bg-surface',
      )}
    >
      <p
        className={cn(
          'titulo-tom text-[15px] font-medium',
          bom ? 'text-offer' : ruim ? 'text-alert' : 'text-paper',
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
 * **E só depois da isenção.** O aceite mútuo deixa de bastar desde 2026-08-15:
 * a API omite `contato_visivel` enquanto não houver linha em `term_acceptances`
 * para esta troca, e quem cria essa linha é o botão daqui. Por isso o estado
 * "aceito, mas contato ausente" tem dois significados diferentes agora — a
 * pessoa não aceitou a isenção, ou a outra não cadastrou telefone — e a tela
 * precisa distinguir os dois: mandar cadastrar contato quem só não leu o aviso
 * seria mentir sobre de quem é a vez de agir.
 *
 * A distinção é `pediuContato`: enquanto ninguém pediu, a ausência é o esperado.
 * Depois de pedir e voltar sem contato, a ausência é do outro lado.
 */
function Contato({
  matchId,
  outro,
  cartaQueDou,
  cartaQueRecebo,
}: {
  matchId: string
  outro?: { nome_exibicao: string; contato_visivel?: string | null }
  cartaQueDou?: Carta
  cartaQueRecebo?: Carta
}) {
  const [pedindo, setPedindo] = useState(false)
  const [pediuContato, setPediuContato] = useState(false)
  const revelar = useRevelarContato()

  const link =
    outro?.contato_visivel &&
    linkWhatsApp(
      outro.contato_visivel,
      primeiraMensagem(outro.nome_exibicao, cartaQueDou, cartaQueRecebo),
    )

  async function aceitarIsencao() {
    try {
      await revelar.mutateAsync(matchId)
      setPediuContato(true)
      setPedindo(false)
    } catch (erro) {
      // A caixa fica aberta de propósito: fechá-la depois de uma falha daria a
      // impressão de que o aceite passou e o contato é que não existe.
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível liberar o contato agora.',
      )
    }
  }

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
      ) : pediuContato ? (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {outro?.nome_exibicao ?? 'A outra pessoa'} ainda não cadastrou um
          contato. Assim que cadastrar, ele aparece aqui.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            O contato de {outro?.nome_exibicao ?? 'quem trocou com você'} está
            liberado. Antes de abrir, leia como funciona daqui em diante.
          </p>
          <Button
            variant="primary"
            size="lg"
            block
            className="mt-4"
            onClick={() => setPedindo(true)}
          >
            Ver contato
          </Button>
        </>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        O TrocaTCG só conecta vocês — a troca acontece por conta e risco de cada
        um. Combine um lugar público e confira as cartas na hora.
      </p>

      <ModalIsencao
        aberto={pedindo}
        salvando={revelar.isPending}
        onAceitar={aceitarIsencao}
        onRecusar={() => setPedindo(false)}
      />
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

/**
 * Os dois instantes que merecem um carimbo — e só um deles move as cartas.
 *
 * **O aceite** é o acordo: as cartas continuam cada uma na mão do seu dono, e
 * por isso nada gira. Desce o selo COMBINADA, e só.
 *
 * **A conclusão** é a entrega: os dois confirmaram que se encontraram e as
 * cartas mudaram de mão de verdade. É aqui que elas giram e trocam de lado — a
 * cena existe para representar um fato, não para enfeitar um clique —, e o selo
 * que desce depois diz TROCADO.
 *
 * Toca uma vez, e só na transição. Uma troca combinada há três dias não precisa
 * se anunciar de novo; quem precisa é o segundo que acabou de acontecer.
 *
 * Três caminhos chegam aqui, e cada um é um acontecimento real:
 *
 *   1. O aceite mútuo nesta tela — o status vira ACEITO com ela aberta.
 *   2. O aceite de uma proposta, que cria a troca já ACEITA e manda para cá com
 *      `?selar=1`. Sem esse bilhete não haveria transição para observar: a tela
 *      nasceria com o acordo pronto.
 *   3. A segunda confirmação de conclusão, que vira CONCLUIDO com a tela aberta.
 *
 * Quem pede menos movimento recebe o carimbo sem a viagem das cartas. O som
 * fica: ele acompanha o selo, e é confirmação, não decoração de movimento.
 */
function useSelagem(status: string | undefined) {
  const [params, setParams] = useSearchParams()
  const semMovimento = useReducedMotion()
  const [selando, setSelando] = useState(false)
  const [selado, setSelado] = useState(false)
  const statusAnterior = useRef(status)
  const jaSelou = useRef<string | null>(null)

  // Lido **uma vez**, na montagem, e guardado. Duas armadilhas moram aqui, e as
  // duas custaram uma cena que nunca acontecia: `useSearchParams` devolve um
  // objeto novo a cada render, então depender dele reinicia o efeito sem parar;
  // e apagar o parâmetro da URL muda o próprio valor de que o efeito dependia,
  // reiniciando-o de novo. Nos dois casos a limpeza cancelava os próprios
  // temporizadores, o carimbo nunca caía e as cartas ficavam giradas para
  // sempre. Uma leitura só, num `ref`, não sofre nem de um nem de outro.
  const pedidoNaUrl = useRef(params.get('selar') === '1')

  // A limpeza da URL é assunto à parte da cena, e roda uma vez: sem isso, um
  // recarregamento — ou o botão voltar — repetiria a selagem.
  useEffect(() => {
    if (!pedidoNaUrl.current) return
    setParams(
      (atual) => {
        const limpa = new URLSearchParams(atual)
        limpa.delete('selar')
        return limpa
      },
      { replace: true },
    )
  }, [setParams])

  useEffect(() => {
    const anterior = statusAnterior.current
    statusAnterior.current = status

    const combinouAgora =
      status === 'ACEITO' &&
      ((anterior !== undefined && anterior !== 'ACEITO') || pedidoNaUrl.current)
    const trocouAgora =
      status === 'CONCLUIDO' && anterior !== undefined && anterior !== 'CONCLUIDO'

    if (!combinouAgora && !trocouAgora) return
    // Um carimbo por estado: a mesma tela pode ver o acordo e, dias depois, a
    // entrega — são dois acontecimentos, não a repetição de um.
    if (jaSelou.current === status) return
    jaSelou.current = status ?? null

    let vivo = true
    const marcas: number[] = []
    const daqui = (ms: number, faz: () => void) => {
      marcas.push(window.setTimeout(() => vivo && faz(), ms))
    }

    // As cartas só giram na entrega. Os 850ms são a duração da animação em
    // `index.css` — mudou lá, muda aqui.
    const giro = trocouAgora && !semMovimento ? 850 : 0
    if (giro) setSelando(true)

    daqui(giro, () => {
      // A viagem acaba no mesmo quadro em que o selo cai: as cartas já
      // assentaram e é a vez dele. Deixar `selando` ligado até o fim da cena
      // segurava o carimbo escondido justamente durante a queda.
      setSelando(false)
      setSelado(true)
      tocar('fechou')
    })

    // `selado` marca só o instante da queda; passado ele, o selo continua na
    // tela, agora parado. Quem abre a troca amanhã encontra o carimbo, não a
    // cena.
    daqui(giro + 900, () => setSelado(false))

    return () => {
      vivo = false
      marcas.forEach(window.clearTimeout)
    }
  }, [status, semMovimento])

  return { selando, selado }
}
