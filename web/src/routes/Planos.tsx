import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AcaoSecundaria, Cartela, Selo } from '@/components/brutal/Pecas'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePerfil } from '@/hooks/usePerfil'
import { usePlanos } from '@/hooks/usePlanos'
import { cn } from '@/lib/cn'
import {
  ECONOMIA_ANUAL,
  formatarPreco,
  type Limites,
  type Periodo,
} from '@/lib/planos'

/**
 * A tela de planos (item 8 da Fase C, seção 16).
 *
 * **Os números vêm da API**, de `core/limites.py`, que é onde a regra é
 * aplicada — ver `lib/planos.ts`. Uma tabela de preço que promete 20 e um
 * backend que barra em 15 é o defeito que só aparece depois de alguém pagar.
 *
 * **Enquanto a cobrança não estiver ligada, a tela diz isso na primeira linha.**
 * Hoje `plano_vigente()` devolve PRO para todo mundo, ninguém esbarra em limite
 * nenhum, e uma tela vendendo assinatura nesse estado estaria cobrando por algo
 * que já está na mão. Ela existe agora para ser julgada e para o convite ter
 * destino; o botão de assinar entra com o Mercado Pago.
 *
 * **A linha do match triangular é a única marcada como "em breve".** O motor
 * está pronto e desligado (`TRIANGULAR_ATIVO`), falta a tela de três pontas, e
 * ela ficou para depois da abertura aos usuários — decisão do Eduardo em
 * 2026-08-13. Listar como pronto o que não existe é o começo de vender o que não
 * se entrega, e a data de ligar a cobrança é depois dessa tela, não antes.
 *
 * **O que não muda de plano fica escrito junto.** O ciclo do match inteiro —
 * abrir, aceitar, recusar, contrapropor, concluir, avaliar, denunciar — é livre
 * nos dois, e vale mais dizer isso do que deixar a pessoa supor. Se um FREE não
 * pudesse responder, a proposta de quem paga morreria sem resposta: seria punir
 * o assinante.
 */
export default function Planos() {
  useMarcaOculta()

  const { data: perfil } = usePerfil()
  const { data, isPending } = usePlanos()

  const cobrando = data?.cobranca_ativa ?? false
  const ePro = cobrando && perfil?.plano === 'PRO'

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
          <Estado cobrando={cobrando} ePro={ePro} precos={data.precos} />

          <Comparacao free={data.planos.FREE} pro={data.planos.PRO} />

          <Principio />
        </>
      )}
    </div>
  )
}

/**
 * A primeira coisa que a tela diz: em que estado a cobrança está.
 *
 * Três estados, e o do meio é o de hoje. Sem ele, a tela seria uma oferta e a
 * pessoa sairia achando que precisa pagar por algo que já tem.
 */
function Estado({
  cobrando,
  ePro,
  precos,
}: {
  cobrando: boolean
  ePro: boolean
  precos: Record<Periodo, string>
}) {
  if (!cobrando) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Ainda não estamos cobrando</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Hoje todo mundo tem o PRO.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Nenhum limite desta tabela está valendo — nem o de ofertas, nem o de
          propostas por dia. Ela está aqui para você ver o que vai mudar quando a
          assinatura entrar, e nada muda sem aviso antes.
        </p>
      </Cartela>
    )
  }

  if (ePro) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Você é PRO</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Sem teto de ofertas, e a lista cola de uma vez.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Sua assinatura está ativa. Cancelar é a qualquer tempo, e nada do que
          você cadastrou é apagado se ela cair.
        </p>
      </Cartela>
    )
  }

  return (
    <Cartela className="mt-6 p-5">
      <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
        O FREE é o teste. O PRO é o app.
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
        {formatarPreco(precos.mensal)} por mês, ou {formatarPreco(precos.anual)}{' '}
        no ano — {ECONOMIA_ANUAL}.
      </p>
      {/* Sem botão de assinar: ele chega com o Mercado Pago (item 7 da Fase C).
          Um botão que não cobra hoje seria promessa de tela, e esta tela existe
          justamente para não prometer o que não entrega. */}
      <p className="mt-3 font-dado text-[11px] uppercase text-apagado">
        Assinatura em breve
      </p>
    </Cartela>
  )
}

/** Uma linha da comparação. `null` no valor vira "Ilimitado". */
interface Linha {
  o_que: string
  free: ReactNode
  pro: ReactNode
  /** Escrito embaixo, quando o número sozinho engana. */
  nota?: string
}

function Comparacao({ free, pro }: { free: Limites; pro: Limites }) {
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
      o_que: 'Cartas procuradas',
      free: 'Ilimitado',
      pro: 'Ilimitado',
      nota: 'Dizer o que falta nunca tem teto: é o que faz o app achar par para os outros.',
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
    },
    {
      o_que: 'Match triangular',
      free: <Marca tem={free.triangular} />,
      pro: <span className="font-dado text-[11px] uppercase">Em breve</span>,
      nota: 'A troca de três pontas, quando ninguém tem exatamente o que o outro quer. Ainda não está no ar.',
    },
    {
      o_que: 'Propostas por dia',
      free: String(free.propostas_por_dia),
      pro: String(pro.propostas_por_dia),
    },
    {
      o_que: 'Histórico de trocas',
      free: dias(free.historico_dias),
      pro: dias(pro.historico_dias),
      nota: 'Sua reputação não depende dessa janela — ela conta tudo, sempre.',
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

      {/* Cabeçalho fixo das duas colunas. Ele repete em cada linha seria ruído;
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
 * Está escrito na tela, e não só na doc, porque é promessa a quem paga e a quem
 * não paga: ninguém perde participação por não assinar.
 */
function Principio() {
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
