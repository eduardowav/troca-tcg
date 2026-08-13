import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { CelulaBrutal, GradeBrutal } from '@/components/brutal/Cartas'
import {
  BotaoBrutal,
  Cartela,
  IconeEstrela,
  IconeTrocar,
  ParDeCartas,
  Selo,
} from '@/components/brutal/Pecas'
import { IconeTroca } from '@/components/ui/Icone'
import { Falha, motivoDoErro } from '@/components/Falha'
import { useAnuncios, useCartasPorId, useProcuradas } from '@/hooks/useAnuncios'
import { useMatches } from '@/hooks/useMatches'
import { useVitrine } from '@/hooks/useVitrine'
import type { CartaProcurada } from '@/lib/anuncios'
import { cn } from '@/lib/cn'
import {
  euAceitei,
  type Match,
  parceiro,
  prazoTexto,
  prazoUrgente,
  reputacaoTexto,
} from '@/lib/matches'
import { donosTexto, ORDEM_PADRAO } from '@/lib/vitrine'
import { useUsuarioId } from '@/stores/auth'

/**
 * Feed de trocas — primeira tela do mundo neobrutalista.
 *
 * O Figma desenha esta tela (frame `pokeswap-home`) só no caminho feliz e só em
 * 390px. As outras três situações — carregando, erro, vazio — e o layout de
 * desktop não estão no arquivo, e são exatamente onde a pessoa passa a maior
 * parte do tempo enquanto a base é pequena. Estão aqui na mesma linguagem:
 * mesma borda, mesma sombra dura, mesma família de tipos.
 *
 * A moldura da marca (logo no topo) não mora nesta rota de propósito. No Figma
 * ela aparece em todas as telas, o que quer dizer que é moldura do app, não da
 * tela — e repeti-la em treze rotas é treze lugares para ela sair de sintonia.
 * Ela entra no `LayoutApp`, junto com a barra de baixo.
 */
export default function Matches() {

  const meuId = useUsuarioId()
  const { data: matches, isPending, isError, error, refetch } = useMatches()

  const ids = useMemo(
    () => (matches ?? []).flatMap((m) => m.itens.map((i) => i.card_id)),
    [matches],
  )
  const { data: cartas } = useCartasPorId(ids)

  return (
    // Mesma moldura de Minhas cartas e do Onboarding: container largo para as
    // cartas respirarem, coluna estreita para o texto — linha longa cansa de ler.
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 2xl:max-w-[120rem]">
      {/* O recuo do notch é da `MarcaApp`, que vem antes desta tela e é a
          primeira coisa da página. Aqui sobra só o vão entre a marca e o
          título — 20px, como no arquivo. */}
      <header className="w-full max-w-xl pt-5">
        <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta lg:text-[28px]">
          Trocas possíveis
        </h1>
        <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          Cada uma é alguém que tem o que você procura — e quer o que você
          oferece.
        </p>
      </header>

      <div className="mt-6 flex-1">
        {isPending ? (
          <Esqueleto />
        ) : isError ? (
          <Falha motivo={motivoDoErro(error)} onTentar={() => refetch()} compacta />
        ) : !matches?.length ? (
          <Vazio />
        ) : (
          // Grade como nas outras telas: no desktop as trocas ficam lado a lado
          // em vez de uma coluna estreita com metade da tela vazia. O gap de 24
          // é o do arquivo; ele vale para os dois eixos.
          //
          // O `grid-cols-1` não é redundante. Sem ele a coluna implícita nasce
          // `auto`, que dimensiona pelo max-content do item — e o nome da carta
          // tem `truncate`, ou seja, `white-space: nowrap`: o max-content é o
          // nome inteiro numa linha só. No celular isso empurrava a cartela para
          // 418px num viewport de 375 e a página rolava na horizontal, com o
          // selo e o botão cortados. `grid-cols-1` é `minmax(0, 1fr)`, e é o
          // zero que deixa a coluna encolher e o `truncate` de dentro funcionar.
          <ul className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {matches.map((match) => (
              <li key={match.id}>
                <CartaoMatch match={match} meuId={meuId} cartas={cartas} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CartaoMatch({
  match,
  meuId,
  cartas,
}: {
  match: Match
  meuId: string | undefined
  cartas?: Map<string, import('@/lib/types').Carta>
}) {
  const outro = parceiro(match, meuId)
  const dou = match.itens.find((i) => i.de_user_id === meuId)
  const recebo = match.itens.find((i) => i.para_user_id === meuId)
  const prazo = prazoTexto(match)
  const reputacao = outro && reputacaoTexto(outro)

  return (
    // A cartela não é um link.
    //
    // Ela era, e isso escondia o alvo mais óbvio da tela: com a linha inteira
    // abrindo a troca, não havia como tocar numa das cartas para ver a carta.
    // Agora são três alvos declarados — cada carta abre `/carta/:id`, o botão
    // abre a troca, e o resto da cartela não é clicável. Decisão do Eduardo,
    // vendo rodar no celular.
    <Cartela className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2.5">
          {/* Sem avatar: o perfil não tem foto no produto. O lugar dela no
              desenho fica com a inicial, que é dado que existe. */}
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-meu font-titulo text-[15px] font-black text-tinta">
            {(outro?.nome_exibicao ?? outro?.username ?? '?')
              .charAt(0)
              .toUpperCase()}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-titulo text-[15px] font-bold text-tinta">
              @{outro?.username ?? 'alguém'}
            </span>
            {reputacao && (
              <span className="flex items-center gap-1">
                <IconeEstrela className="size-3 shrink-0 text-azul" />
                <span className="truncate font-dado text-[12px] font-semibold text-apagado">
                  {reputacao}
                </span>
              </span>
            )}
          </span>

          <EstadoDaTroca
            status={match.status}
            jaAceitei={euAceitei(match, meuId)}
          />
        </div>

        <ParDeCartas
          dou={dou && cartas?.get(dou.card_id)}
          recebo={recebo && cartas?.get(recebo.card_id)}
        />

        <hr className="border-0 border-t-2 border-dashed border-tinta/25" />

        <div className="flex items-center justify-between gap-3">
          {/* O rodapé do arquivo mostra "MATCH ID / TRD-8821". O id real é um
              uuid, e um uuid inteiro não cabe nem ajuda. O prazo ocupa esse
              lugar: é a informação do rodapé que mais decide o que a pessoa faz
              hoje, e ela já existia na tela antiga. */}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-dado text-[10px] uppercase text-apagado">
              {prazo ? 'Prazo' : 'Troca'}
            </span>
            <span
              className={cn(
                'truncate font-dado text-[12px] font-bold',
                prazo && prazoUrgente(match) ? 'text-azul' : 'text-tinta',
              )}
            >
              {prazo ?? `#${match.id.slice(0, 8).toUpperCase()}`}
            </span>
          </span>

          {/* As duas setas do ícone giram meia volta ao passar o dedo/cursor:
              o glifo é uma troca, e girá-lo é a própria ação acontecendo. Em
              CSS, e não no motion, porque é estado de hover puro — e o
              `prefers-reduced-motion` global já zera a duração. */}
          <BotaoBrutal to={`/matches/${match.id}`} className="group/trocar">
            Trocar
            <IconeTrocar className="size-3.5 transition-transform duration-300 group-hover/trocar:rotate-180" />
          </BotaoBrutal>
        </div>
      </Cartela>
  )
}

/**
 * PENDENTE quer dizer "alguém aceitou e falta alguém", e isso é coisa oposta
 * conforme quem aceitou: se fui eu, a bola está com a outra pessoa; se foi ela,
 * a bola está comigo — e aí é uma chamada para agir, não um aviso de espera.
 *
 * No arquivo do Figma todo selo é branco com borda preta. Manter os quatro
 * iguais desfaria a distinção que esta tela já tinha: numa lista, a linha em que
 * não há nada a fazer chamaria tanta atenção quanto a única que depende da
 * pessoa. Só "falta você" ganha o azul — o mesmo da ação primária, que é o
 * vocabulário do arquivo para "aqui se clica".
 */
function EstadoDaTroca({
  status,
  jaAceitei,
}: {
  status: Match['status']
  jaAceitei: boolean
}) {
  const mapa: Partial<
    Record<Match['status'], { texto: string; tom: 'neutro' | 'acao' }>
  > = {
    SUGERIDO: { texto: 'nova', tom: 'neutro' },
    PENDENTE: jaAceitei
      ? { texto: 'esperando', tom: 'neutro' }
      : { texto: 'falta você', tom: 'acao' },
    ACEITO: { texto: 'combinada', tom: 'neutro' },
  }
  const selo = mapa[status]
  if (!selo) return null

  return <Selo tom={selo.tom}>{selo.texto}</Selo>
}

function Esqueleto() {
  return (
    <ul
      className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3"
      aria-hidden
    >
      {[0, 1].map((i) => (
        <li key={i}>
          <Cartela className="flex flex-col gap-4 p-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-meu" />
            <div className="flex items-center gap-2">
              <div className="aspect-[2.5/3.5] flex-1 animate-pulse rounded-[var(--radius-controle)] border-2 border-tinta bg-meu" />
              <div className="size-8 shrink-0 rounded-full border-2 border-tinta bg-cartela" />
              <div className="aspect-[2.5/3.5] flex-1 animate-pulse rounded-[var(--radius-controle)] border-2 border-tinta bg-papel" />
            </div>
          </Cartela>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tela vazia — e a vitrine como destino de quem cai nela.
 *
 * Enquanto a base for pequena esta é a tela principal, não a exceção: quase todo
 * mundo que se cadastra abre o feed e não encontra troca. Sem mais nada, ela diz
 * "você fez tudo certo e não tem nada" — que é como um marketplace vazio começa
 * a morrer.
 *
 * Até aqui as três saídas apontavam para `/minhas-cartas`, ou seja, pediam mais
 * digitação a quem acabou de digitar. O motor precisa dos dois lados declarados
 * e boa parte das pessoas só declara um; é exatamente esse público que a vitrine
 * existe para atender, e é para lá que esta tela manda agora — para apontar em
 * carta que já está na base, com nome e arte, em vez de escrever no vácuo.
 *
 * Duas notícias diferentes disputam o primeiro lugar, e a mais forte ganha:
 * quando há gente procurando o que a pessoa oferece, metade da troca já existe e
 * é isso que ela vê. Sem isso, a saída é a amostra da vitrine.
 */
function Vazio() {
  const { data: procuradas } = useProcuradas(true)
  const { data: anuncios } = useAnuncios()

  // Ter Procuro é outra pergunta que "ter demanda": dá para ter as duas listas
  // cheias e nenhum match, e dá para ter só o Ofereço. As saídas são diferentes.
  const temProcuro = (anuncios ?? []).some(
    (a) => a.tipo === 'PROCURA' && a.ativo,
  )

  if (procuradas?.length) return <DemandaPelasMinhas procuradas={procuradas} />
  return <PortaDaVitrine temProcuro={temProcuro} pronto={Boolean(anuncios)} />
}

/**
 * Tem gente de olho no que a pessoa oferece — e falta ela querer algo de volta.
 *
 * O caminho para querer algo de volta passa pelo acervo de quem já quer a carta
 * dela: ali a troca fecha dos dois lados numa proposta só, sem esperar o motor.
 * Por isso cada `@nome` é um link, e não texto.
 */
function DemandaPelasMinhas({ procuradas }: { procuradas: CartaProcurada[] }) {
  const ids = useMemo(() => procuradas.map((p) => p.card_id), [procuradas])
  const { data: cartas } = useCartasPorId(ids)

  return (
    <div className="pb-6">
      <div className="w-full max-w-xl">
        <p className="font-titulo text-[17px] font-bold text-tinta">
          Nenhuma troca fechada ainda — mas tem gente de olho no que você
          oferece.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Falta a outra metade: a troca só aparece quando você também quer
          alguma carta de quem procura a sua. Toque num nome para ver o que a
          pessoa tem.
        </p>
      </div>

      <GradeBrutal className="mt-5">
        {procuradas.map((p) => {
          const carta = cartas?.get(p.card_id)
          if (!carta) return null
          return (
            <CelulaBrutal key={p.card_id} carta={carta} destaque="OFERTA">
              <QuemQuer procurada={p} />
            </CelulaBrutal>
          )
        })}
      </GradeBrutal>

      <BotaoBrutal to="/vitrine" className="mt-5">
        Ver a vitrine
      </BotaoBrutal>
    </div>
  )
}

/** Quantas cartas da vitrine cabem numa amostra sem virar a segunda vitrine. */
const AMOSTRA = 6

/**
 * A vitrine trazida para dentro da tela vazia.
 *
 * Amostra de verdade, com arte e com quanta gente tem cada carta, e não só um
 * botão: um botão pede fé de que existe algo do outro lado, e quem está numa
 * tela vazia acabou de aprender que talvez não exista.
 *
 * Qual amostra depende do que falta. Quem tem Procuro vê as cartas do próprio
 * Procuro que alguém está oferecendo — são trocas que só faltam de um lado, e a
 * proposta resolve o que o motor não fecha. Quem não tem Procuro vê o feed
 * inteiro, porque para essa pessoa a pergunta ainda é "o que existe por aqui".
 */
function PortaDaVitrine({
  temProcuro,
  pronto,
}: {
  temProcuro: boolean
  pronto: boolean
}) {
  const filtros = useMemo(
    () =>
      temProcuro
        ? { ordem: ORDEM_PADRAO, so_procuro: true }
        : { ordem: ORDEM_PADRAO },
    [temProcuro],
  )
  // Só depois de saber se há Procuro: a resposta escolhe a consulta. A chave é
  // a mesma que a vitrine usa com esses filtros, então chegar lá é instantâneo.
  const { data } = useVitrine(filtros, pronto)

  const amostra = useMemo(
    () => (data?.pages ?? []).flat().slice(0, AMOSTRA),
    [data],
  )
  const { data: cartas } = useCartasPorId(
    useMemo(() => amostra.map((c) => c.card_id), [amostra]),
  )

  // Nem o Procuro tem carta na vitrine, ou a vitrine está vazia: sem amostra a
  // tela volta a ser texto e saída — e a saída continua sendo a vitrine, onde a
  // própria tela explica o que não achou.
  if (!amostra.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela text-tinta shadow-[var(--shadow-duro)]">
          <IconeTroca className="size-6" />
        </span>
        <p className="mt-5 font-titulo text-[17px] font-bold text-tinta">
          Nenhuma troca possível ainda.
        </p>
        <p className="mt-2 max-w-xs font-corpo text-[14px] leading-relaxed text-apagado">
          {temProcuro
            ? 'Uma troca aparece quando alguém tem o que você procura e quer o que você oferece. Nada do seu Procuro está na vitrine neste momento.'
            : 'Uma troca aparece quando alguém tem o que você procura e quer o que você oferece. Quanto mais cartas nas suas listas, mais chances.'}
        </p>
        <BotaoBrutal to="/vitrine" className="mt-6">
          Ver a vitrine
        </BotaoBrutal>
        <Link
          to="/minhas-cartas"
          className="mt-4 font-corpo text-[14px] font-medium text-azul underline underline-offset-2"
        >
          Ajustar minhas cartas
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <div className="w-full max-w-xl">
        <p className="font-titulo text-[17px] font-bold text-tinta">
          {temProcuro
            ? 'Nenhuma troca fechada ainda — mas o que você procura está na vitrine.'
            : 'Nenhuma troca possível ainda — e ninguém sabe o que você quer.'}
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          {temProcuro
            ? 'Estas cartas do seu Procuro estão sendo oferecidas agora. O motor só fecha quando os dois lados querem; aqui você propõe direto a quem tem.'
            : 'A troca só aparece quando você também procura alguma coisa. Estas são cartas que a base tem para trocar — escolher aqui é mais rápido que escrever a lista de memória.'}
        </p>
      </div>

      <GradeBrutal className="mt-5">
        {amostra.map((item) => {
          const carta = cartas?.get(item.card_id)
          if (!carta) return null
          return (
            <CelulaBrutal
              key={item.card_id}
              carta={carta}
              para={`/vitrine/carta/${item.card_id}`}
            >
              <p className="rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu px-2 py-1.5 font-titulo text-[11px] font-bold text-tinta">
                {donosTexto(item)}
              </p>
            </CelulaBrutal>
          )
        })}
      </GradeBrutal>

      <BotaoBrutal
        to={temProcuro ? '/vitrine?so_procuro=true' : '/vitrine'}
        className="mt-5"
      >
        {temProcuro ? 'Ver tudo do meu Procuro' : 'Ver a vitrine'}
      </BotaoBrutal>
    </div>
  )
}

/**
 * Quem procura esta carta.
 *
 * Nomeia as pessoas em vez de só contar — decisão do Eduardo: a tela fica
 * concreta com gente, e um número não dá vontade de voltar. Cada nome leva ao
 * acervo da pessoa, que é onde a proposta é montada: quem quer a minha carta é
 * a pessoa com quem a troca tem mais chance de fechar hoje.
 *
 * Contato continua fora: a API não manda, e quem quiser falar precisa do aceite
 * mútuo, que é o que protege os dois lados.
 */
function QuemQuer({ procurada }: { procurada: CartaProcurada }) {
  const restantes = procurada.procurando - procurada.pessoas.length

  return (
    <div className="rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu px-2 py-1.5">
      <p className="font-titulo text-[11px] font-bold text-tinta">
        {procurada.procurando === 1
          ? '1 pessoa procura'
          : `${procurada.procurando} pessoas procuram`}
      </p>
      <p className="mt-1 font-dado text-[10px] leading-relaxed break-words text-apagado">
        {procurada.pessoas.map((q, i) => (
          <span key={q.user_id}>
            {i > 0 && ', '}
            <Link
              to={`/vitrine/acervo/${q.username}`}
              className="underline underline-offset-2 hover:text-tinta"
            >
              @{q.username}
            </Link>
          </span>
        ))}
        {restantes > 0 && ` e mais ${restantes}`}
      </p>
    </div>
  )
}

