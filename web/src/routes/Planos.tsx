import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { AcaoSecundaria, Cartela, Selo } from "@/components/brutal/Pecas";
import { useMarcaOculta } from "@/hooks/useMundo";
import { usePerfil } from "@/hooks/usePerfil";
import { useAssinatura, usePlanos } from "@/hooks/usePlanos";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  assinar,
  cancelarAssinatura,
  ECONOMIA_ANUAL,
  formatarPreco,
  type Limites,
  type Periodo,
} from "@/lib/planos";

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
  useMarcaOculta();

  const { data: perfil } = usePerfil();
  const { data, isPending } = usePlanos();

  const cobrando = data?.cobranca_ativa ?? false;
  const ePro = cobrando && perfil?.plano === "PRO";
  // Parceiro é PRO sem pagar. Precisa vir separado porque a cartela do PRO fala
  // de assinatura ativa e de cancelar — duas coisas que não existem para quem
  // tem o plano por acordo, e prometer que ele "cai" seria assustar à toa.
  const eParceiro = cobrando && (perfil?.parceiro ?? false);

  // Só este estado vende. Os outros três não podem ver botão nenhum — nem no
  // topo, nem no rodapé.
  const vendendo = cobrando && !ePro && !eParceiro;

  // O período mora aqui, e não dentro da `Oferta`, porque agora há **dois**
  // botões na tela. Com estado local em cada um, alguém escolheria "mensal" em
  // cima, rolaria, e assinaria o anual embaixo sem perceber.
  const compra = useCompra();

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
    </div>
  );
}

/* ------------------------------------------------------------------ a compra */

/** O que os dois botões da tela compartilham. */
export interface Compra {
  periodo: Periodo;
  escolher: (p: Periodo) => void;
  enviando: boolean;
  assinarAgora: () => void;
}

/**
 * O período escolhido e a ida ao checkout, num lugar só.
 *
 * **Existe porque a tela tem dois botões de assinar** — um na oferta e outro
 * depois da tabela. Com estado local em cada um, alguém escolheria "mensal" em
 * cima, rolaria, e assinaria o anual embaixo sem perceber que trocou. Cobrar o
 * plano errado é o defeito que a pessoa descobre na fatura.
 *
 * `aoAssinar` é o desvio do `/lab/planos`: com ele, nada sai para o Mercado
 * Pago. Sem ele, cada toque no laboratório criaria uma assinatura pendente de
 * verdade.
 */
export function useCompra(aoAssinar?: (periodo: Periodo) => void): Compra {
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [enviando, setEnviando] = useState(false);

  async function assinarAgora() {
    if (aoAssinar) return aoAssinar(periodo);
    setEnviando(true);
    try {
      const { init_point } = await assinar(periodo);
      // `replace` e não `href`: se a pessoa voltar do Mercado Pago sem concluir,
      // o botão do navegador tem de trazê-la para os planos, não para o
      // checkout de novo — que criaria uma segunda assinatura pendente.
      window.location.replace(init_point);
    } catch (erro) {
      setEnviando(false);
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : "Não foi possível abrir o pagamento. Tente de novo em instantes.",
      );
    }
  }

  return { periodo, escolher: setPeriodo, enviando, assinarAgora };
}

/** O botão, sozinho. Os dois pontos de compra da tela usam este. */
function BotaoAssinar({ compra }: { compra: Compra }) {
  return (
    <button
      type="button"
      onClick={compra.assinarAgora}
      disabled={compra.enviando}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-5 py-3",
        "font-titulo text-[15px] font-extrabold uppercase text-azul-tinta",
        "shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]",
        "hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        "disabled:opacity-60 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0",
      )}
    >
      {compra.enviando ? "Abrindo o pagamento…" : "Assinar o PRO"}
    </button>
  );
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
 * porque botão que compra sem dizer o quê é o que gera estorno.
 */
function GanchoDoTopo({ compra }: { compra: Compra }) {
  return (
    <Cartela className="mt-6 p-5">
      <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
        Sua lista inteira no ar, de uma vez.
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
        O FREE para em 20 cartas anunciadas e 5 propostas por dia. O PRO tira os
        dois tetos, cola a lista de uma vez e avisa quando a carta que falta
        aparece.
      </p>
      <div className="mt-4">
        <BotaoAssinar compra={compra} />
      </div>
      <p className="mt-2.5 text-center font-corpo text-[12px] leading-relaxed text-apagado">
        {compra.periodo === "anual"
          ? "Plano anual. O preço e o mensal estão logo abaixo da tabela."
          : "Plano mensal. O preço está logo abaixo da tabela."}
      </p>
    </Cartela>
  );
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
  cobrando: boolean;
  ePro: boolean;
  eParceiro: boolean;
  precos: Record<Periodo, string>;
  compra: Compra;
}) {
  const { cobrando, ePro, eParceiro, precos, compra } = props;

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
          a assinatura entrar, e nada muda sem aviso antes.
        </p>
      </Cartela>
    );
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
          tem cobrança, não tem vencimento e não há nada para cancelar.
        </p>
      </Cartela>
    );
  }

  if (ePro) return <Assinante />;

  return <Oferta precos={precos} compra={compra} />;
}

/**
 * Quem já assina: o estado da cobrança e a porta de saída.
 *
 * **O botão de cancelar existe porque os Termos o prometem.** O §8 diz "você
 * cancela quando quiser, pelo próprio app, sem multa", e até 2026-08-22 a rota
 * existia (`DELETE /me/assinatura`, testada) sem nenhuma tela chamando. Cláusula
 * em vigor sem interface é promessa quebrada por omissão, e a cobrança ligou no
 * mesmo dia em que isso foi notado.
 *
 * **Dois toques, e o primeiro não cancela nada.** Cancelamento é irreversível do
 * lado do provedor — desfazer é assinar de novo, com cobrança nova. O segundo
 * toque fica atrás de um aviso que diz o que vai acontecer, e o botão de fugir
 * ("Continuar PRO") é o que recebe o azul: numa dupla de botões, o destaque vai
 * para a saída segura, não para a irreversível.
 *
 * **O que a tela diz sobre prazo é o que a API responde**, e não uma frase fixa
 * daqui. O `assinaturas.py` abria carência de 7 dias no cancelamento e o §8 dos
 * Termos prometia "até o fim do período já pago" — dez meses de diferença para
 * quem paga o anual. Enquanto a divergência não for resolvida, esta tela mostra a
 * data que o servidor devolve e não afirma regra nenhuma.
 */
function Assinante() {
  const { data, refetch } = useAssinatura();
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const proxima = data?.proxima_cobranca_em
    ? new Date(data.proxima_cobranca_em).toLocaleDateString("pt-BR")
    : null;
  const jaCancelada = data?.status === "cancelled";

  async function cancelar() {
    setCancelando(true);
    try {
      await cancelarAssinatura();
      await refetch();
      setConfirmando(false);
      toast.success("Assinatura cancelada. Não haverá nova cobrança.");
    } catch (erro) {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : "Não foi possível cancelar agora. Tente de novo em instantes.",
      );
    } finally {
      setCancelando(false);
    }
  }

  return (
    <Cartela className="mt-6 p-5">
      <Selo>{jaCancelada ? "Assinatura cancelada" : "Você é PRO"}</Selo>
      <p className="mt-3 font-titulo text-[18px] leading-tight font-black text-tinta">
        Está tudo liberado na sua conta.
      </p>

      {jaCancelada ? (
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Não haverá nova cobrança. Nada do que você cadastrou é apagado, e você
          pode assinar de novo quando quiser.
        </p>
      ) : (
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
          Sua assinatura está ativa e renova sozinha
          {proxima ? `, com a próxima cobrança em ${proxima}` : ""}. Se o
          pagamento falhar, você tem 7 dias com os limites do PRO para resolver,
          e nada do que você cadastrou é apagado.
        </p>
      )}

      {!jaCancelada &&
        (confirmando ? (
          <div className="mt-4 rounded-[var(--radius-controle)] border-2 border-tinta bg-papel p-4">
            <p className="font-corpo text-[14px] leading-relaxed text-tinta">
              Cancelar não apaga nada do seu acervo. A renovação para, e para
              voltar ao PRO depois é preciso assinar de novo.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={cancelar}
                disabled={cancelando}
                className="flex-1 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 py-2.5 font-titulo text-[13px] font-extrabold uppercase text-tinta disabled:opacity-60"
              >
                {cancelando ? "Cancelando…" : "Sim, cancelar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={cancelando}
                className="flex-1 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul px-4 py-2.5 font-titulo text-[13px] font-extrabold uppercase text-azul-tinta disabled:opacity-60"
              >
                Continuar PRO
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="mt-4 font-corpo text-[13px] text-apagado underline underline-offset-2"
          >
            Cancelar assinatura
          </button>
        ))}
    </Cartela>
  );
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
  compra,
}: {
  precos: Record<Periodo, string>;
  compra: Compra;
}) {
  const { periodo, escolher } = compra;

  const porMes =
    periodo === "anual"
      ? formatarPreco(String(Number(precos.anual) / 12))
      : formatarPreco(precos.mensal);

  return (
    <Cartela className="mt-6 p-5">
      <p className="font-titulo text-[20px] leading-tight font-black text-tinta">
        Escolha como quer pagar.
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado">
        Os dois planos são o mesmo PRO. Muda só de quanto em quanto tempo a
        cobrança volta.
      </p>

      <div
        role="radiogroup"
        aria-label="Período da assinatura"
        className="mt-4 flex gap-2"
      >
        <Periodicidade
          escolhido={periodo === "anual"}
          aoEscolher={() => escolher("anual")}
          titulo="Anual"
          etiqueta={ECONOMIA_ANUAL}
        />
        <Periodicidade
          escolhido={periodo === "mensal"}
          aoEscolher={() => escolher("mensal")}
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
        {periodo === "anual"
          ? `Cobrado ${formatarPreco(precos.anual)} uma vez por ano.`
          : `Cobrado ${formatarPreco(precos.mensal)} todo mês.`}
      </p>

      <div className="mt-4">
        <BotaoAssinar compra={compra} />
      </div>

      {/* O que tira o dedo do freio, em uma linha. Cartão, Pix e boleto porque
          cartão de crédito não é universal neste público — e é o Mercado Pago
          que decide quais aparecem, conforme a conta que recebe. */}
      <p className="mt-2.5 text-center font-corpo text-[12px] leading-relaxed text-apagado">
        Pix, cartão ou boleto pelo Mercado Pago. Dá para cancelar quando quiser,
        sem multa, e nos primeiros 7 dias você pode desistir e receber o valor
        de volta.
      </p>
    </Cartela>
  );
}

/** Um dos dois períodos. Botão de rádio com cara de etiqueta. */
function Periodicidade({
  escolhido,
  aoEscolher,
  titulo,
  etiqueta,
}: {
  escolhido: boolean;
  aoEscolher: () => void;
  titulo: string;
  etiqueta?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={escolhido}
      onClick={aoEscolher}
      className={cn(
        "flex-1 rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-2.5 text-left transition-shadow",
        escolhido
          ? "bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]"
          : "bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]",
      )}
    >
      <span className="block font-titulo text-[14px] font-extrabold uppercase">
        {titulo}
      </span>
      {etiqueta && (
        <span
          className={cn(
            "mt-0.5 block font-corpo text-[12px]",
            escolhido ? "text-azul-tinta/80" : "text-apagado",
          )}
        >
          {etiqueta}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------- a comparação */

/** Uma linha da comparação. `null` no valor vira "Ilimitado". */
interface Linha {
  o_que: string;
  free: ReactNode;
  pro: ReactNode;
  /** Escrito embaixo, quando o número sozinho engana. */
  nota?: string;
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
  const teto = (n: number | null) => (n === null ? "Ilimitado" : String(n));
  const dias = (n: number | null) => (n === null ? "Completo" : `${n} dias`);

  const linhas: Linha[] = [
    {
      o_que: "Cartas anunciadas",
      free: teto(free.max_ofertas),
      pro: teto(pro.max_ofertas),
    },
    {
      o_que: "Propostas por dia",
      free: teto(free.propostas_por_dia),
      pro: teto(pro.propostas_por_dia),
    },
    {
      o_que: "Colar a lista de uma vez",
      free: <Marca tem={free.cadastro_em_massa} />,
      pro: <Marca tem={pro.cadastro_em_massa} />,
    },
    {
      o_que: "Aviso quando a carta aparece",
      free: <Marca tem={free.alerta_carta} />,
      pro: <Marca tem={pro.alerta_carta} />,
    },
    {
      o_que: "Match triangular",
      free: <Marca tem={free.triangular} />,
      pro: <span className="font-dado text-[11px] uppercase">Em breve</span>,
    },
    {
      o_que: "Histórico de trocas",
      free: dias(free.historico_dias),
      pro: dias(pro.historico_dias),
    },
    { o_que: "Cartas procuradas", free: "Ilimitado", pro: "Ilimitado" },
    { o_que: "Matches que você vê", free: "Todos", pro: "Todos" },
  ];

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
              <th scope="col" className={cn(cabecalho, "text-tinta")}>
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr
                key={linha.o_que}
                className={i > 0 ? "border-t border-tinta/25" : undefined}
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-corpo text-[14px] font-medium text-tinta"
                >
                  {linha.o_que}
                </th>
                <td className={cn(celula, "text-apagado")}>{linha.free}</td>
                <td className={cn(celula, "text-tinta")}>{linha.pro}</td>
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
            <strong className="font-medium text-tinta">{nota.termo}:</strong>{" "}
            {nota.diz}
          </p>
        ))}
      </div>
    </section>
  );
}

const cabecalho =
  "w-[76px] px-2 py-2.5 text-center font-dado text-[11px] uppercase text-apagado";
const celula = "w-[76px] px-2 py-3 text-center font-dado text-[12px] font-bold";

/**
 * O que o número sozinho não diz.
 *
 * Fora da tabela de propósito: dentro dela, cada nota empurrava as colunas para
 * baixo e desfazia o alinhamento. Só entram as que mudam a leitura de uma linha —
 * o resto é conversa que a tela de planos não precisa ter.
 */
const NOTAS: { termo: string; diz: string }[] = [
  {
    termo: "Cartas anunciadas",
    diz: "conta só o que você oferece. Se o PRO cair, o que passa de 20 sai do ar e continua no seu acervo — nada é apagado.",
  },
  {
    termo: "Propostas por dia",
    diz: "são 5 a cada 24 horas no FREE. Responder proposta não gasta nenhuma.",
  },
  {
    termo: "Colar a lista de uma vez",
    diz: "no FREE o cadastro é carta por carta, até o teto de 20.",
  },
  {
    termo: "Match triangular",
    diz: "a troca de três pontas, quando ninguém tem exatamente o que o outro quer. Ainda não está no ar: chega um mês depois do lançamento. Não assine por causa desta linha.",
  },
  {
    termo: "Cartas procuradas",
    diz: "dizer o que falta nunca tem teto — é assim que o app acha par para você e para os outros.",
  },
  {
    termo: "Matches que você vê",
    diz: "o app não guarda match para quem paga.",
  },
];

/** ✓ ou —, e o leitor de tela ouve a palavra, não o desenho. */
function Marca({ tem }: { tem: boolean }) {
  return (
    <>
      <span aria-hidden>{tem ? "✓" : "—"}</span>
      <span className="sr-only">{tem ? "inclui" : "não inclui"}</span>
    </>
  );
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
          trocou com você e denunciar quem não deveria estar aqui. Ver a
          vitrine, o acervo de alguém e quem tem a carta que falta.
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
  );
}
