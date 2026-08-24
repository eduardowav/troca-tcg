import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { AcaoSecundaria, Cartela, Selo } from '@/components/brutal/Pecas'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePerfil } from '@/hooks/usePerfil'
import { usePlanos, usePro } from '@/hooks/usePlanos'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  type CobrancaPix,
  comprarPro,
  ECONOMIA_ANUAL,
  formatarPreco,
  diasAte,
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

  // Só este estado vende. Os outros três não podem ver botão nenhum — nem no
  // topo, nem no rodapé.
  const vendendo = cobrando && !ePro && !eParceiro

  // O período mora aqui, e não dentro da `Oferta`, porque agora há **dois**
  // botões na tela. Com estado local em cada um, alguém escolheria "mensal" em
  // cima, rolaria, e compraria o anual embaixo sem perceber.
  const compra = useCompra()

  const clienteDeQueries = useQueryClient()

  // Chamado pela folha quando o servidor confirma o crédito. **O perfil precisa
  // ser invalidado junto**, e não só a situação do PRO: é dele que sai o
  // `plano` que esta tela lê para decidir o que mostrar, e sem isso a pessoa
  // pagaria, a folha fecharia, e a tela continuaria oferecendo o que ela acabou
  // de comprar.
  const confirmarPagamento = useCallback(() => {
    compra.fechar()
    void clienteDeQueries.invalidateQueries({ queryKey: ['perfil'] })
    void clienteDeQueries.invalidateQueries({ queryKey: ['pro'] })
    toast.success('Pagamento confirmado. O PRO já está valendo.')
  }, [clienteDeQueries, compra])

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
          {/* **A tabela vem antes do preço** — decisão do Eduardo em 2026-08-22,
              e é a inversão do que estava aqui de manhã. O raciocínio: quem abre
              esta tela chegou por ter batido num teto, e a pergunta na cabeça
              dela é "o que eu ganho", não "quanto custa". Mostrar preço antes de
              a pessoa saber o que está comprando é pedir a decisão sem os dados.

              No topo fica só o gancho e um botão, para quem já decidiu não ter
              de atravessar a tabela inteira até poder agir. */}
          {vendendo ? (
            <GanchoDoTopo compra={compra} />
          ) : (
            <Topo
              cobrando={cobrando}
              ePro={ePro}
              eParceiro={eParceiro}
              precos={data.precos}
              compra={compra}
            />
          )}

          <Comparacao free={data.planos.FREE} pro={data.planos.PRO} />

          {vendendo && <Oferta precos={data.precos} compra={compra} />}

          <Principio />
        </>
      )}

      {/* A folha só existe depois de haver um código, e some no instante em que
          o pagamento é confirmado. Fica fora do `isPending` de propósito: quem
          está pagando não pode ver a folha piscar porque a tabela de preço
          resolveu revalidar. */}
      {compra.cobranca && (
        <FolhaPix
          cobranca={compra.cobranca}
          aoFechar={compra.fechar}
          aoPagar={confirmarPagamento}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ a compra */

/** O que os dois botões da tela compartilham. */
export interface Compra {
  periodo: Periodo
  escolher: (p: Periodo) => void
  gerando: boolean
  /** A cobrança aberta, ou nada. É ela que faz a folha do Pix aparecer. */
  cobranca: CobrancaPix | null
  pagarAgora: () => void
  fechar: () => void
}

/**
 * O período escolhido e a geração do Pix, num lugar só.
 *
 * **Existe porque a tela tem dois botões de comprar** — um na oferta e outro
 * depois da tabela. Com estado local em cada um, alguém escolheria "mensal" em
 * cima, rolaria, e compraria o anual embaixo sem perceber que trocou. Pagar o
 * plano errado é o defeito que a pessoa descobre no extrato.
 *
 * **Reescrito em 2026-08-23, quando o PRO virou compra por Pix.** Antes daqui
 * saía um `window.location.replace(init_point)` — a pessoa ia para o checkout do
 * Mercado Pago e voltava, se voltasse. Agora nada sai da tela: o código nasce
 * aqui, a folha abre por cima, e a pessoa só sai do app para abrir o banco.
 *
 * `aoComprar` é o desvio do `/lab/planos`: com ele, nada sai para o Mercado
 * Pago. Sem ele, cada toque no laboratório geraria uma cobrança de verdade.
 */
export function useCompra(aoComprar?: (periodo: Periodo) => void): Compra {
  const [periodo, setPeriodo] = useState<Periodo>('anual')
  const [gerando, setGerando] = useState(false)
  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null)

  async function pagarAgora() {
    if (aoComprar) return aoComprar(periodo)
    setGerando(true)
    try {
      const nova = await comprarPro(periodo)
      setCobranca(nova)
      if (nova.reaproveitada) {
        // Dizer isto importa: a pessoa pediu o anual, recebeu de volta o mensal
        // que deixou aberto há dez minutos, e sem o aviso ela pagaria o valor
        // errado achando que pagou o que escolheu agora.
        toast.info('Você já tinha um Pix aberto. Este é o mesmo código.')
      }
    } catch (erro) {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível gerar o Pix. Tente de novo em instantes.',
      )
    } finally {
      setGerando(false)
    }
  }

  return {
    periodo,
    escolher: setPeriodo,
    gerando,
    cobranca,
    pagarAgora,
    fechar: () => setCobranca(null),
  }
}

/** Para onde o botão do topo leva, e onde a oferta de verdade mora. */
const ANCORA_OFERTA = 'oferta'

/**
 * O botão. Os dois pontos da tela usam este, com **comportamentos diferentes**.
 *
 * O de baixo compra. O de cima só rola até o de baixo, e isso é decisão do
 * Eduardo em 2026-08-22: no topo a pessoa ainda não escolheu período, e o botão
 * de lá comprava o anual em silêncio, por ser o padrão. Levar até a escolha é
 * honesto e não custa nada — o toque continua sendo um só até a decisão.
 *
 * `scrollIntoView` respeita `prefers-reduced-motion`: rolagem suave é das
 * animações que mais incomodam quem tem sensibilidade vestibular, e aqui ela é
 * enfeite pleno — o salto seco leva ao mesmo lugar.
 */
function BotaoComprar({
  compra,
  leva,
  rotulo = 'Pagar com Pix',
}: {
  compra: Compra
  /** Em vez de comprar, rola até a oferta. É o botão do topo. */
  leva?: boolean
  rotulo?: string
}) {
  const semMovimento = useReducedMotion()

  function rolar() {
    document.getElementById(ANCORA_OFERTA)?.scrollIntoView({
      behavior: semMovimento ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <button
      type="button"
      onClick={leva ? rolar : compra.pagarAgora}
      disabled={!leva && compra.gerando}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-5 py-3',
        'font-titulo text-[15px] font-extrabold uppercase text-azul-tinta',
        'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
        'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        'disabled:opacity-60 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0',
      )}
    >
      {!leva && compra.gerando ? 'Gerando o Pix…' : rotulo}
    </button>
  )
}

/**
 * O gancho e um botão, antes da tabela.
 *
 * **É o compacto, e o preço não está aqui de propósito.** O preço mora na
 * `Oferta`, depois da comparação — ver o comentário na página. Este bloco existe
 * para quem já decidiu: sem ele, quem abriu a tela sabendo que quer assinar
 * precisaria atravessar oito linhas de tabela antes de encontrar um botão.
 *
 * Sem seletor de período também: a escolha é feita embaixo, onde o preço está.
 * Quem toca aqui leva o padrão, que é o anual — e o padrão está dito em texto,
 * porque botão que compra sem dizer o quê é o que gera reclamação.
 */
export function GanchoDoTopo({ compra }: { compra: Compra }) {
  return (
    <Cartela className="mt-6 p-5">
      <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
        Anuncie quantas cartas quiser.
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
        O FREE para em 20 cartas e 5 propostas por dia. O PRO tira os dois
        tetos.
      </p>
      <div className="mt-4">
        <BotaoComprar compra={compra} leva />
      </div>
    </Cartela>
  )
}

/* ------------------------------------------------------------------- o topo */

/**
 * A primeira coisa da tela. Quatro estados, e só um deles vende.
 *
 * Os outros três não vendem a *primeira* compra. Quem já é PRO vê a data e um
 * botão de renovar — desde 2026-08-23 renovar é uma ação de verdade, porque o
 * Pix não renova sozinho. Parceiro e cobrança desligada não veem botão nenhum:
 * oferecer o que a pessoa já tem de graça é o erro que faz ela desconfiar do
 * resto da tela.
 */
export function Topo(props: {
  cobrando: boolean
  ePro: boolean
  eParceiro: boolean
  precos: Record<Periodo, string>
  compra: Compra
}) {
  const { cobrando, ePro, eParceiro, precos, compra } = props

  if (!cobrando) {
    return (
      <Cartela className="mt-6 p-5">
        <Selo>Ainda não estamos cobrando</Selo>
        <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
          Hoje todo mundo tem o PRO.
        </p>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Nenhum limite desta tabela está valendo — nem o de cartas, nem o de
          propostas por dia. Ela está aqui para você ver o que vai mudar quando
          o PRO entrar, e nada muda sem aviso antes.
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
          Tudo do PRO está liberado na sua conta, por acordo com o TrocaTCG. Não
          tem cobrança e não tem vencimento — você não precisa pagar nada.
        </p>
      </Cartela>
    )
  }

  if (ePro) return <JaEPro compra={compra} />

  return <Oferta precos={precos} compra={compra} />
}

/**
 * Quem já tem o PRO: até quando ele vale, e como esticar.
 *
 * **O botão de cancelar sumiu em 2026-08-23, e não é regressão.** Ele existia
 * porque o §8 dos Termos promete "você cancela quando quiser, pelo próprio app,
 * sem multa" — e enquanto o PRO foi assinatura de cartão isso exigia uma tela.
 * Com o PRO comprado por Pix não há renovação para cancelar: nada volta a sair
 * da conta de ninguém, e um botão de cancelar aqui teria de responder à pergunta
 * "cancelar o quê?".
 *
 * **A data é o centro da cartela, e é a mudança que mais importa.** Assinatura
 * renovava sozinha, então o prazo era detalhe; agora ele é a única coisa que a
 * pessoa precisa saber, porque é ela quem tem de agir. Por isso a data aparece
 * grande, e não numa frase.
 *
 * **A renovação empilha, e a tela diz isso.** Quem paga faltando dez dias soma o
 * período novo aos dez que sobravam — ver `services/pro.py`. Sem essa frase, o
 * incentivo seria esperar o último dia, que é justamente o dia em que se
 * esquece.
 *
 * **O botão de renovar só existe dentro dos três dias finais** — decisão do
 * Eduardo em 2026-08-24, e quem decide é o servidor (`pode_renovar`). Um
 * "Renovar com Pix" visível o ano inteiro para quem acabou de pagar é anúncio, e
 * contradiz o princípio da seção 16: o convite ao PRO aparece quando a pessoa
 * esbarra num limite, não como faixa fixa. Fora da janela a cartela continua
 * dizendo até quando o plano vale — o que some é a venda, não a informação.
 */
function JaEPro({ compra }: { compra: Compra }) {
  const { data } = usePro()

  const expira = data?.plano_expira_em ?? null
  const dias = diasAte(expira)
  const quando = expira
    ? new Date(expira).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
      })
    : null

  // **Uma janela só, e ela vem do servidor.** Aqui já houve um sete local que
  // divergia dos três do aviso; duas contas de prazo na mesma tela é como uma
  // acaba dizendo "está acabando" enquanto a outra não oferece como resolver.
  const acabando = data?.pode_renovar ?? false

  return (
    <Cartela className="mt-6 p-5">
      <Selo>Você é PRO</Selo>
      <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
        Está tudo liberado na sua conta.
      </p>

      {quando ? (
        <>
          <p
            className={cn(
              'mt-4 font-titulo text-[22px] leading-none font-black',
              acabando ? 'text-alerta' : 'text-tinta',
            )}
          >
            Vale até {quando}
          </p>
          <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
            {acabando
              ? `Falta${dias === 1 ? '' : 'm'} ${dias} dia${dias === 1 ? '' : 's'}. Renove pelo Pix e o novo período começa quando este acabar — você não perde nada por pagar antes.`
              : 'Não há renovação automática e nada é cobrado de você sem que peça. Avisamos quando estiver perto de vencer.'}
          </p>
        </>
      ) : (
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Nada do que você cadastrou é apagado, e não há cobrança automática.
        </p>
      )}

      {/* Só dentro da janela. Fora dela esta cartela informa e não vende. */}
      {acabando && (
        <div className="mt-4">
          <BotaoComprar compra={compra} rotulo="Renovar com Pix" />
        </div>
      )}
    </Cartela>
  )
}

/* --------------------------------------------------------------- a folha do Pix */

/**
 * O Pix, por cima da tela. Nasceu em 2026-08-23, com a troca do cartão.
 *
 * **O "copia e cola" vem antes do QR, e é decisão de contexto.** Isto é um PWA
 * de celular: quem está com o app aberto na mão não tem uma segunda câmera para
 * apontar para a própria tela. O caminho real é copiar o código, abrir o banco e
 * colar. O QR fica embaixo, para quem paga do computador ou usa o celular de
 * outra pessoa.
 *
 * **A folha se fecha sozinha quando o dinheiro entra**, e é o que faz este fluxo
 * parecer instantâneo: enquanto ela está aberta, a tela pergunta ao servidor de
 * cinco em cinco segundos se o pagamento foi creditado — ver `usePro`. Quem
 * recebe o aviso do Mercado Pago é o servidor, e a pessoa está no aplicativo do
 * banco quando isso acontece.
 *
 * **Não há botão de "já paguei".** Ele existiria só para acalmar, não faria nada
 * que a espera já não faça, e ensinaria a pessoa a tocar nele antes de pagar.
 */
function FolhaPix({
  cobranca,
  aoFechar,
  aoPagar,
}: {
  cobranca: CobrancaPix
  aoFechar: () => void
  /** Chamado quando o servidor confirma o crédito. */
  aoPagar: () => void
}) {
  const { data } = usePro(true, true)
  const [copiado, setCopiado] = useState(false)
  const restante = useContagem(cobranca.expira_em)

  // O crédito é do servidor, e a folha só reage a ele. Comparar com `pago_em` e
  // não com `plano === 'PRO'`: quem renova já era PRO antes de pagar, e a
  // segunda condição nunca mudaria de valor.
  const pago = data?.status === 'approved' && Boolean(data?.pago_em)

  useEffect(() => {
    if (pago) aoPagar()
  }, [pago, aoPagar])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cobranca.qr_code)
      setCopiado(true)
      // Volta ao rótulo de antes: "Copiado" preso para sempre não diz se o
      // segundo toque funcionou, e alguém toca de novo justamente por dúvida.
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // `clipboard` exige contexto seguro e permissão, e falha calada em alguns
      // navegadores embutidos. Selecionar o texto na tela é a saída manual, e
      // ela precisa existir — por isso o código fica visível, e não escondido
      // atrás do botão.
      toast.error('Não foi possível copiar. Selecione o código abaixo.')
    }
  }

  const vencido = restante === 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={aoFechar}
        className="fixed inset-0 z-40 bg-tinta/70 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Pagamento por Pix"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto',
          'rounded-t-[20px] border-t-2 border-tinta bg-cartela',
          'shadow-[var(--shadow-duro)]',
        )}
      >
        <div className="mx-auto w-full max-w-xl px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div
            aria-hidden
            className="mx-auto mb-4 h-1 w-10 rounded-full bg-tinta/30"
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
                {formatarPreco(cobranca.valor)} no Pix
              </p>
              <p className="mt-1 font-corpo text-[13px] text-apagado">
                PRO {cobranca.periodo === 'anual' ? 'por 12 meses' : 'por 1 mês'}
                {restante !== null && !vencido
                  ? ` — o código vale por mais ${restante}`
                  : ''}
              </p>
            </div>
            <AcaoSecundaria onClick={aoFechar}>Fechar</AcaoSecundaria>
          </div>

          {vencido ? (
            /* Vencido é estado próprio, e não um erro: o código morreu porque
               ninguém pagou, que é o normal de quem desistiu. Gerar outro é um
               toque, e a folha não fica mostrando um código que o banco recusa. */
            <div className="mt-5 rounded-[var(--radius-controle)] border-2 border-tinta bg-papel p-4">
              <p className="font-corpo text-[14px] leading-relaxed text-tinta">
                Este código venceu. Nada foi cobrado — feche e gere outro quando
                quiser pagar.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={copiar}
                className={cn(
                  'mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-5 py-3',
                  'font-titulo text-[15px] font-extrabold uppercase text-azul-tinta',
                  'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
                  'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
                )}
              >
                {copiado ? 'Código copiado' : 'Copiar código Pix'}
              </button>

              <p className="mt-2.5 text-center font-corpo text-[12px] leading-relaxed text-apagado">
                Cole no aplicativo do seu banco, em Pix → Pix Copia e Cola. Assim
                que o pagamento cair, esta tela se fecha sozinha.
              </p>

              {/* O código à vista, e não escondido atrás do botão: quando a
                  cópia falha — contexto inseguro, navegador embutido —, marcar
                  o texto com o dedo é a única saída que sobra. */}
              <p className="mt-4 rounded-[var(--radius-controle)] border-2 border-tinta bg-papel p-3 font-dado text-[11px] leading-relaxed break-all text-tinta select-all">
                {cobranca.qr_code}
              </p>

              <div className="mt-5 flex flex-col items-center">
                <div className="rounded-[var(--radius-controle)] border-2 border-tinta bg-white p-3">
                  {/* Desenhado no navegador a partir do "copia e cola" — a
                      imagem nunca trafega pela rede nem ocupa linha no banco.
                      SVG e não PNG: escala sem borrar e não precisa de
                      `img-src data:` na CSP. */}
                  <QRCodeSVG
                    value={cobranca.qr_code}
                    size={168}
                    // Nível médio: o payload do Pix é longo, e correção alta
                    // engorda o QR a ponto de os módulos ficarem pequenos
                    // demais para a câmera de um celular mais velho.
                    level="M"
                    aria-label="QR Code do pagamento Pix"
                  />
                </div>
                <p className="mt-2 text-center font-corpo text-[12px] text-apagado">
                  Ou aponte a câmera do banco, se estiver pagando de outro
                  aparelho.
                </p>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2">
                <span
                  aria-hidden
                  className="size-2 animate-pulse rounded-full bg-azul"
                />
                <p className="font-corpo text-[13px] text-apagado">
                  Esperando o pagamento…
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Quanto falta para o código vencer, como `"12 min"` ou `"48 s"`.
 *
 * `null` quando não há data; `0` quando já venceu — e a folha usa o zero para
 * trocar de estado, porque um contador parado em "0 min" continua parecendo um
 * código válido.
 *
 * Conta de dez em dez segundos, não de um em um: a precisão que a pessoa precisa
 * é "ainda dá tempo", e um relógio que pisca a cada segundo numa tela de
 * pagamento cria pressa em vez de informar.
 */
function useContagem(expiraEm: string | null): string | number | null {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (!expiraEm) return
    const t = setInterval(() => setAgora(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [expiraEm])

  if (!expiraEm) return null
  const restante = new Date(expiraEm).getTime() - agora
  if (restante <= 0) return 0
  const minutos = Math.floor(restante / 60_000)
  return minutos >= 1 ? `${minutos} min` : `${Math.ceil(restante / 1000)} s`
}

/**
 * A oferta, e o único lugar da tela que pede uma decisão.
 *
 * **O anual vem escolhido por padrão**, e não é truque de venda — é o que a
 * pessoa escolheria sabendo a conta: são dois meses de graça, e o TCG é hobby de
 * ano, não de mês. Quem quiser mensal troca com um toque, e o mensal está do lado
 * com o mesmo peso visual, não escondido.
 *
 * **O preço aparece por mês nos dois**, com o total embaixo. "R$ 149,90"
 * sozinho parece caro ao lado de "R$ 14,90"; "R$ 12,49 por mês" é a mesma coisa
 * dita na unidade em que a pessoa compara. O total continua na tela porque
 * esconder o valor que sai da conta seria o tipo de conversão que gera
 * reclamação.
 */
export function Oferta({
  precos,
  compra,
}: {
  precos: Record<Periodo, string>
  compra: Compra
}) {
  const { periodo, escolher } = compra

  const porMes =
    periodo === 'anual'
      ? formatarPreco(String(Number(precos.anual) / 12))
      : formatarPreco(precos.mensal)

  return (
    // O `id` mora num `div` em volta, e não na `Cartela`: ela é peça
    // compartilhada por meia dúzia de telas, e acrescentar prop a ela para
    // atender uma âncora de uma tela só é alargar a superfície de todas.
    <div id={ANCORA_OFERTA} className="scroll-mt-4">
      <Cartela className="mt-6 p-5">
        <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
          Escolha por quanto tempo.
        </p>
        <div
          role="radiogroup"
          aria-label="Por quanto tempo"
          className="mt-4 flex gap-2"
        >
          <Periodicidade
            escolhido={periodo === 'anual'}
            aoEscolher={() => escolher('anual')}
            titulo="Anual"
          />
          <Periodicidade
            escolhido={periodo === 'mensal'}
            aoEscolher={() => escolher('mensal')}
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
            ? `${formatarPreco(precos.anual)} de uma vez, por 12 meses de PRO — ${ECONOMIA_ANUAL}.`
            : `${formatarPreco(precos.mensal)} de uma vez, por 1 mês de PRO.`}
        </p>

        <div className="mt-4">
          <BotaoComprar compra={compra} />
        </div>

        {/* O que tira o dedo do freio, em uma linha. **Pix e só Pix desde
          2026-08-23**, e dizer isso é a metade boa da troca: some a exigência
          de cartão de crédito, que neste público exclui mais gente do que o
          preço. A outra metade — não renova sozinho — está dita na mesma
          frase, porque descobrir isso depois é pior do que ler agora. */}
        <p className="mt-2.5 text-center font-corpo text-[12px] leading-relaxed text-apagado">
          Pagamento por Pix, sem cartão e sem cadastro. Não renova sozinho: você
          paga de novo quando quiser, e avisamos antes de vencer.
        </p>
      </Cartela>
    </div>
  )
}

/**
 * Um dos dois períodos. Botão de rádio com cara de etiqueta.
 *
 * **Encolheu em 2026-08-22.** Ele carregava o título e, só no anual, uma segunda
 * linha com "dois meses de graça" — o que deixava os dois botões desiguais em
 * altura e ambos grandes demais para o pouco texto que têm. A vantagem do anual
 * desceu para a linha do preço, que é onde ela decide alguma coisa: encostada no
 * valor cheio, e não solta dentro de um seletor.
 *
 * Uma linha, altura igual nos dois, e o alvo continua com 44px — o mínimo de
 * toque do DESIGN.md. Encolher o texto não é motivo para encolher o alvo.
 */
function Periodicidade({
  escolhido,
  aoEscolher,
  titulo,
}: {
  escolhido: boolean
  aoEscolher: () => void
  titulo: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={escolhido}
      onClick={aoEscolher}
      className={cn(
        'min-h-11 flex-1 rounded-[var(--radius-controle)] border-2 border-tinta px-3 text-center transition-shadow',
        'font-titulo text-[13px] font-extrabold uppercase',
        escolhido
          ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
          : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
      )}
    >
      {titulo}
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
/**
 * O que muda entre os planos — **uma tabela, não oito cartelas** desde
 * 2026-08-22.
 *
 * A versão anterior empilhava um cartão com borda e sombra por linha. Cada um
 * lia bem sozinho e o conjunto lia mal: para extrair uma comparação de duas
 * colunas a pessoa atravessava oito blocos, e a tela ficava longa o bastante
 * para o botão de assinar sumir na rolagem.
 *
 * Numa tabela só, os olhos descem a coluna do PRO e leem "Ilimitado, Ilimitado,
 * ✓, ✓" de uma vez. É o que uma comparação precisa fazer.
 *
 * **A ordem é de força de venda, não de assunto.** As três primeiras linhas são
 * as que fazem alguém assinar. O que é igual nos dois planos desceu para o fim, e
 * continua na tela porque calar sobre o que não muda é como a pessoa supõe que
 * muda tudo.
 *
 * **As notas saíram de dentro das linhas.** Nota por linha quebrava o
 * alinhamento das colunas, que é justamente o que faz a tabela funcionar. As
 * poucas que mudam a leitura de um número viraram um bloco embaixo, com o termo
 * em negrito para achar de qual linha é.
 *
 * `<table>` de verdade, e não uma grade de `div`: é tabela de dados, e leitor de
 * tela anuncia linha e coluna. `scope` nos cabeçalhos é o que faz isso valer.
 */
export function Comparacao({ free, pro }: { free: Limites; pro: Limites }) {
  const teto = (n: number | null) => (n === null ? 'Ilimitado' : String(n))
  const dias = (n: number | null) => (n === null ? 'Completo' : `${n} dias`)

  const linhas: Linha[] = [
    {
      o_que: 'Cartas anunciadas',
      free: teto(free.max_ofertas),
      pro: teto(pro.max_ofertas),
    },
    {
      o_que: 'Propostas por dia',
      free: teto(free.propostas_por_dia),
      pro: teto(pro.propostas_por_dia),
    },
    {
      o_que: 'Colar a lista de uma vez',
      free: <Marca tem={free.cadastro_em_massa} />,
      pro: <Marca tem={pro.cadastro_em_massa} />,
    },
    {
      o_que: 'Aviso quando a carta aparece',
      free: <Marca tem={free.alerta_carta} />,
      pro: <Marca tem={pro.alerta_carta} />,
    },
    {
      o_que: 'Match triangular',
      free: <Marca tem={free.triangular} />,
      pro: <span className="font-dado text-[11px] uppercase">Em breve</span>,
    },
    {
      o_que: 'Histórico de trocas',
      free: dias(free.historico_dias),
      pro: dias(pro.historico_dias),
    },
    { o_que: 'Cartas procuradas', free: 'Ilimitado', pro: 'Ilimitado' },
    { o_que: 'Matches que você vê', free: 'Todos', pro: 'Todos' },
  ]

  return (
    <section className="mt-7">
      <h2 className="font-dado text-[11px] uppercase text-apagado">
        O que muda
      </h2>

      <Cartela className="mt-2 overflow-hidden p-0">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Comparação entre os planos Free e Pro
          </caption>
          <thead>
            <tr className="border-b-2 border-tinta">
              <th scope="col" className="px-4 py-2.5 text-left">
                <span className="sr-only">Recurso</span>
              </th>
              <th scope="col" className={cabecalho}>
                Free
              </th>
              <th scope="col" className={cn(cabecalho, 'text-tinta')}>
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr
                key={linha.o_que}
                className={i > 0 ? 'border-t border-tinta/25' : undefined}
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-corpo text-[14px] font-medium text-tinta"
                >
                  {linha.o_que}
                </th>
                <td className={cn(celula, 'text-apagado')}>{linha.free}</td>
                <td className={cn(celula, 'text-tinta')}>{linha.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartela>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {NOTAS.map((nota) => (
          <p
            key={nota.termo}
            className="font-corpo text-[12px] leading-relaxed text-apagado"
          >
            <strong className="font-medium text-tinta">{nota.termo}:</strong>{' '}
            {nota.diz}
          </p>
        ))}
      </div>
    </section>
  )
}

const cabecalho =
  'w-[76px] px-2 py-2.5 text-center font-dado text-[11px] uppercase text-apagado'
const celula = 'w-[76px] px-2 py-3 text-center font-dado text-[12px] font-bold'

/**
 * O que o número sozinho não diz.
 *
 * Fora da tabela de propósito: dentro dela, cada nota empurrava as colunas para
 * baixo e desfazia o alinhamento.
 *
 * **Duas, e eram seis até 2026-08-22.** As outras quatro explicavam linhas que
 * não precisavam — número que já se explica, ou recurso igual nos dois planos.
 * Sobram as duas que fazem trabalho: uma responde ao medo de perder as cartas
 * ("o que acontece se eu parar de pagar"), a outra é ressalva honesta e não pode
 * sair. Nota que ninguém precisava ler é o que fazia a tela parecer longa.
 */
const NOTAS: { termo: string; diz: string }[] = [
  {
    termo: 'Cartas anunciadas',
    diz: 'conta só o que você oferece. Se o PRO cair, o que passa de 20 sai do ar e continua no seu acervo — nada é apagado.',
  },
  {
    termo: 'Match triangular',
    diz: 'ainda não está no ar: chega um mês depois do lançamento. Não assine por causa desta linha.',
  },
]

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
          Abrir, aceitar, recusar e contrapropor, concluir a troca, avaliar e
          denunciar: livre nos dois planos. O PRO cobra conveniência e alcance,
          nunca participação — e não existe destaque pago na vitrine.
        </p>
      </Cartela>

      <AcaoSecundaria to="/termos" className="mt-4">
        Termos e privacidade
      </AcaoSecundaria>
    </section>
  )
}
