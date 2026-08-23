import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { AcaoSecundaria, Cartela, Selo } from '@/components/brutal/Pecas'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePerfil } from '@/hooks/usePerfil'
import { usePlanos } from '@/hooks/usePlanos'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  assinar,
  ECONOMIA_ANUAL,
  formatarPreco,
  type Limites,
  type Periodo,
} from '@/lib/planos'

/**
 * A tela de planos (item 8 da Fase C, seção 16).
 *
 * **Reconstruída em 2026-08-22 para converter**, no mesmo dia em que
 * `COBRANCA_ATIVA` ligou e o botão de assinar passou a existir. Antes ela era uma
 * tabela informativa com um "assinatura em breve" no rodapé — o que era honesto
 * enquanto não havia como pagar, e virou o pior estado possível no minuto em que
 * os limites começaram a valer: todas as restrições, nenhuma saída.
 *
 * **A ordem mudou, e é a mudança que mais importa.** Antes: estado da cobrança →
 * tabela → princípio. Agora: oferta com botão → tabela → princípio. Quem abre
 * esta tela quase sempre chegou aqui por ter esbarrado num limite, e a primeira
 * coisa que ela precisa ver é o preço e o botão, não um parágrafo explicando o
 * estado do sistema.
 *
 * **Os números vêm da API**, de `core/limites.py`, que é onde a regra é
 * aplicada — ver `lib/planos.ts`. Uma tabela que promete 20 e um backend que
 * barra em 15 é o defeito que só aparece depois de alguém pagar.
 *
 * **A linha do match triangular continua marcada como "em breve"**, e continua
 * sendo a única. O motor está pronto e desligado (`TRIANGULAR_ATIVO`), a tela de
 * três pontas ficou para um mês depois do lançamento, e listar como pronto o que
 * não existe é o começo de vender o que não se entrega. Vender uma assinatura
 * cujo item mais chamativo diz "em breve" é ruim; mentir sobre ele é pior.
 *
 * **O que não muda de plano fica escrito junto.** O ciclo do match inteiro —
 * abrir, aceitar, recusar, contrapropor, concluir, avaliar, denunciar — é livre
 * nos dois. Se um FREE não pudesse responder, a proposta de quem paga morreria
 * sem resposta: seria punir o assinante.
 *
 * As peças são exportadas para o `/lab/planos`, que monta os quatro estados lado
 * a lado com dados de mentira — é lá que se decide aparência sem depender de ter
 * uma conta em cada situação.
 */
export default function Planos() {
  useMarcaOculta()

  const { data: perfil } = usePerfil()
  const { data, isPending } = usePlanos()

  const cobrando = data?.cobranca_ativa ?? false
  const ePro = cobrando && perfil?.plano === 'PRO'
  // Parceiro é PRO sem pagar. Precisa vir separado porque a cartela do PRO fala
  // de assinatura ativa e de cancelar — duas coisas que não existem para quem
  // tem o plano por acordo, e prometer que ele "cai" seria assustar à toa.
  const eParceiro = cobrando && (perfil?.parceiro ?? false)

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link
          to="/perfil"
          aria-label="Voltar para o perfil"
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <h1 className="font-titulo text-[24px] leading-none font-black text-tinta">
          Planos
        </h1>
      </div>

      {isPending || !data ? (
        <div className="mt-6 h-64 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
      ) : (
        <>
          <Topo
            cobrando={cobrando}
            ePro={ePro}
            eParceiro={eParceiro}
            precos={data.precos}
          />

          <Comparacao free={data.planos.FREE} pro={data.planos.PRO} />

          <Principio />
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- o topo */

/**
 * A primeira coisa da tela. Quatro estados, e só um deles vende.
 *
 * Os outros três existem para **não** vender: para quem já é PRO, para quem é
 * Parceiro e para o caso de a cobrança estar desligada. Oferecer assinatura a
 * quem já tem tudo é o erro que faz a pessoa desconfiar do resto da tela.
 */
export function Topo(props: {
  cobrando: boolean
  ePro: boolean
  eParceiro: boolean
  precos: Record<Periodo, string>
}) {
  const { cobrando, ePro, eParceiro, precos } = props

  if (!cobrando) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Ainda não estamos cobrando</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Hoje todo mundo tem o PRO.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Nenhum limite desta tabela está valendo — nem o de cartas, nem o de
          propostas por dia. Ela está aqui para você ver o que vai mudar quando a
          assinatura entrar, e nada muda sem aviso antes.
        </p>
      </Cartela>
    )
  }

  if (eParceiro) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Você é Parceiro</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Você tem o PRO, e não paga por ele.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Tudo do PRO está liberado na sua conta, sem assinatura e sem
          vencimento. Não há nada para pagar nem para cancelar.
        </p>
      </Cartela>
    )
  }

  if (ePro) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Você é PRO</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Sem teto de cartas, e a lista cola de uma vez.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Sua assinatura está ativa. Cancelar é a qualquer tempo, e nada do que
          você cadastrou é apagado se ela cair.
        </p>
      </Cartela>
    )
  }

  return <Oferta precos={precos} />
}

/**
 * A oferta, e o único lugar da tela que pede uma decisão.
 *
 * **O anual vem escolhido por padrão**, e não é truque de venda — é o que a
 * pessoa escolheria sabendo a conta: são dois meses de graça, e o TCG é hobby de
 * ano, não de mês. Quem quiser mensal troca com um toque, e o mensal está do lado
 * com o mesmo peso visual, não escondido.
 *
 * **O preço aparece por mês nos dois**, com o total do ano embaixo. "R$ 199,90"
 * sozinho parece caro ao lado de "R$ 19,90"; "R$ 16,66 por mês" é a mesma coisa
 * dita na unidade em que a pessoa compara. O total continua na tela porque
 * esconder o valor que sai do cartão seria o tipo de conversão que gera
 * estorno.
 */
export function Oferta({
  precos,
  aoAssinar,
}: {
  precos: Record<Periodo, string>
  /** Só o laboratório passa isto, para não chamar a API de verdade. */
  aoAssinar?: (periodo: Periodo) => void
}) {
  const [periodo, setPeriodo] = useState<Periodo>('anual')
  const [enviando, setEnviando] = useState(false)

  const porMes =
    periodo === 'anual'
      ? formatarPreco(String(Number(precos.anual) / 12))
      : formatarPreco(precos.mensal)

  async function assinarAgora() {
    if (aoAssinar) return aoAssinar(periodo)
    setEnviando(true)
    try {
      const { init_point } = await assinar(periodo)
      // `replace` e não `href`: se a pessoa voltar do Mercado Pago sem concluir,
      // o botão do navegador tem de trazê-la para os planos, não para o
      // checkout de novo — que criaria uma segunda assinatura pendente.
      window.location.replace(init_point)
    } catch (erro) {
      setEnviando(false)
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível abrir o pagamento. Tente de novo em instantes.',
      )
    }
  }

  return (
    <Cartela className="mt-6 p-5">
      <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
        O FREE é o teste. O PRO é o app.
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
        Sem teto de cartas, sem teto de propostas, e a lista inteira cola de uma
        vez.
      </p>

      <div
        role="radiogroup"
        aria-label="Período da assinatura"
        className="mt-4 flex gap-2"
      >
        <Periodicidade
          escolhido={periodo === 'anual'}
          aoEscolher={() => setPeriodo('anual')}
          titulo="Anual"
          etiqueta={ECONOMIA_ANUAL}
        />
        <Periodicidade
          escolhido={periodo === 'mensal'}
          aoEscolher={() => setPeriodo('mensal')}
          titulo="Mensal"
        />
      </div>

      <p className="mt-4 font-titulo text-[28px] leading-none font-black text-tinta">
        {porMes}
        <span className="ml-1.5 font-corpo text-[14px] font-medium text-apagado">
          por mês
        </span>
      </p>
      <p className="mt-1 font-corpo text-[13px] text-apagado">
        {periodo === 'anual'
          ? `Cobrado ${formatarPreco(precos.anual)} uma vez por ano.`
          : `Cobrado ${formatarPreco(precos.mensal)} todo mês.`}
      </p>

      <button
        type="button"
        onClick={assinarAgora}
        disabled={enviando}
        className={cn(
          'mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-5 py-3',
          'font-titulo text-[15px] font-extrabold uppercase text-azul-tinta',
          'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
          'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
          'disabled:opacity-60 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0',
        )}
      >
        {enviando ? 'Abrindo o pagamento…' : 'Assinar o PRO'}
      </button>

      {/* O que tira o dedo do freio, em uma linha. Cartão, Pix e boleto porque
          cartão de crédito não é universal neste público — e é o Mercado Pago
          que decide quais aparecem, conforme a conta que recebe. */}
      <p className="mt-2.5 text-center font-corpo text-[12px] leading-relaxed text-apagado">
        Cartão, Pix ou boleto pelo Mercado Pago. Cancele quando quiser — nada do
        que você cadastrou é apagado.
      </p>
    </Cartela>
  )
}

/** Um dos dois períodos. Botão de rádio com cara de etiqueta. */
function Periodicidade({
  escolhido,
  aoEscolher,
  titulo,
  etiqueta,
}: {
  escolhido: boolean
  aoEscolher: () => void
  titulo: string
  etiqueta?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={escolhido}
      onClick={aoEscolher}
      className={cn(
        'flex-1 rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-2.5 text-left transition-shadow',
        escolhido
          ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
          : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
      )}
    >
      <span className="block font-titulo text-[14px] font-extrabold uppercase">
        {titulo}
      </span>
      {etiqueta && (
        <span
          className={cn(
            'mt-0.5 block font-corpo text-[12px]',
            escolhido ? 'text-azul-tinta/80' : 'text-apagado',
          )}
        >
          {etiqueta}
        </span>
      )}
    </button>
  )
}

/* -------------------------------------------------------------- a comparação */

/** Uma linha da comparação. `null` no valor vira "Ilimitado". */
interface Linha {
  o_que: string
  free: ReactNode
  pro: ReactNode
  /** Escrito embaixo, quando o número sozinho engana. */
  nota?: string
}

/**
 * O que muda entre os planos.
 *
 * **A ordem é de força de venda, não de assunto** — mudou em 2026-08-22. As três
 * primeiras linhas são as que fazem alguém assinar: teto de cartas, teto de
 * propostas e colar a lista. O que é igual nos dois planos desceu para o fim, e
 * continua na tela porque calar sobre o que não muda é como a pessoa supõe que
 * muda tudo.
 */
export function Comparacao({ free, pro }: { free: Limites; pro: Limites }) {
  const teto = (n: number | null) => (n === null ? 'Ilimitado' : String(n))
  const dias = (n: number | null) => (n === null ? 'Completo' : `${n} dias`)

  const linhas: Linha[] = [
    {
      o_que: 'Cartas anunciadas',
      free: teto(free.max_ofertas),
      pro: teto(pro.max_ofertas),
      nota: 'Só o que você oferece entra nessa conta.',
    },
    {
      o_que: 'Propostas por dia',
      free: teto(free.propostas_por_dia),
      pro: teto(pro.propostas_por_dia),
      nota: 'Cada carta que você quer é uma conversa. No FREE dá para começar cinco por dia.',
    },
    {
      o_que: 'Colar a lista de uma vez',
      free: <Marca tem={free.cadastro_em_massa} />,
      pro: <Marca tem={pro.cadastro_em_massa} />,
      nota: 'No FREE dá para cadastrar carta por carta, sem limite de vezes.',
    },
    {
      o_que: 'Avisar quando a carta aparecer',
      free: <Marca tem={free.alerta_carta} />,
      pro: <Marca tem={pro.alerta_carta} />,
      nota: 'Você marca a carta que falta e o app avisa no dia em que alguém anunciar.',
    },
    {
      o_que: 'Match triangular',
      free: <Marca tem={free.triangular} />,
      pro: <span className="font-dado text-[11px] uppercase">Em breve</span>,
      nota: 'A troca de três pontas, quando ninguém tem exatamente o que o outro quer. Ainda não está no ar.',
    },
    {
      o_que: 'Histórico de trocas',
      free: dias(free.historico_dias),
      pro: dias(pro.historico_dias),
      nota: 'Sua reputação não depende dessa janela — ela conta tudo, sempre.',
    },
    {
      o_que: 'Cartas procuradas',
      free: 'Ilimitado',
      pro: 'Ilimitado',
      nota: 'Dizer o que falta nunca tem teto: é o que faz o app achar par para os outros.',
    },
    {
      o_que: 'Matches que você vê',
      free: 'Todos',
      pro: 'Todos',
    },
  ]

  return (
    <section className="mt-7">
      <h2 className="font-dado text-[11px] uppercase text-apagado">
        O que muda
      </h2>

      {/* Cabeçalho fixo das duas colunas. Repetir em cada linha seria ruído;
          sem ele, os dois números soltos à direita não dizem de quem são. */}
      <div className="mt-2 flex items-center gap-3 px-4">
        <span className="flex-1" />
        <span className="w-[72px] shrink-0 text-center font-dado text-[11px] uppercase text-apagado">
          Free
        </span>
        <span className="w-[72px] shrink-0 text-center font-dado text-[11px] uppercase text-apagado">
          Pro
        </span>
      </div>

      <div className="mt-1.5 flex flex-col gap-2">
        {linhas.map((linha) => (
          <div
            key={linha.o_que}
            className="rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 py-3 shadow-[var(--shadow-duro-xs)]"
          >
            <div className="flex items-center gap-3">
              <span className="flex-1 font-corpo text-[14px] font-medium text-tinta">
                {linha.o_que}
              </span>
              <Coluna>{linha.free}</Coluna>
              <Coluna destaque>{linha.pro}</Coluna>
            </div>
            {linha.nota && (
              <p className="mt-1.5 font-corpo text-[12px] leading-relaxed text-apagado">
                {linha.nota}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Coluna({
  children,
  destaque,
}: {
  children: ReactNode
  destaque?: boolean
}) {
  return (
    <span
      className={cn(
        'w-[72px] shrink-0 text-center font-dado text-[12px] font-bold',
        destaque ? 'text-tinta' : 'text-apagado',
      )}
    >
      {children}
    </span>
  )
}

/** ✓ ou —, e o leitor de tela ouve a palavra, não o desenho. */
function Marca({ tem }: { tem: boolean }) {
  return (
    <>
      <span aria-hidden>{tem ? '✓' : '—'}</span>
      <span className="sr-only">{tem ? 'inclui' : 'não inclui'}</span>
    </>
  )
}

/**
 * O que a tabela não diz, e é o que sustenta as escolhas dela.
 *
 * Está na tela, e não só na doc, porque é promessa a quem paga e a quem não
 * paga: ninguém perde participação por não assinar. Fica **depois** da oferta de
 * propósito — é o que segura a objeção de quem já leu o preço, não a abertura.
 */
export function Principio() {
  return (
    <section className="mt-7">
      <h2 className="font-dado text-[11px] uppercase text-apagado">
        O que nunca muda de plano
      </h2>
      <Cartela className="mt-2 p-4">
        <p className="font-corpo text-[14px] leading-relaxed text-apagado">
          Abrir, aceitar, recusar e contrapropor. Concluir a troca, avaliar quem
          trocou com você e denunciar quem não deveria estar aqui. Ver a vitrine,
          o acervo de alguém e quem tem a carta que falta.
        </p>
        <p className="mt-2.5 font-corpo text-[14px] leading-relaxed text-apagado">
          O PRO cobra conveniência e alcance — nunca participação. Se quem não
          assina não pudesse responder, a proposta de quem assina morreria sem
          resposta.
        </p>
        <p className="mt-2.5 font-corpo text-[14px] leading-relaxed text-apagado">
          E não existe destaque pago na vitrine. Nunca vai existir: o feed é o
          mesmo para todo mundo.
        </p>
      </Cartela>

      <AcaoSecundaria to="/termos" className="mt-4">
        Termos e privacidade
      </AcaoSecundaria>
    </section>
  )
}
