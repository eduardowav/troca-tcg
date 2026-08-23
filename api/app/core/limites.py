"""Camada centralizada de limites por plano.

Dois eixos, e é importante não confundi-los:

**Limites de plano** (`max_ofertas`, `historico_dias`, `triangular`,
`alerta_carta`, `cadastro_em_massa`) existem para vender o PRO. Enquanto não
houver meio de pagamento, bloquear por eles é pedágio: a pessoa bate no muro sem
ter saída. Por isso passam por `plano_vigente()`, que devolve PRO para todo mundo
até `COBRANCA_ATIVA` virar True. A regra fica construída e testada; o portão
segue aberto.

**Limites de antiabuso** (`propostas_por_dia`) não são disso. Existem para o app
não virar disparador em massa, valem desde o primeiro dia e por isso são lidos
com `limites_de()` direto, sem passar pelo portão.

**O `propostas_por_dia` passou a ser as duas coisas em 2026-08-22**, e é a única
exceção à separação acima. Ele continua sendo lido sem o portão — quem é FREE
esbarra nos 5 mesmo que a cobrança esteja desligada —, mas o número deixou de ser
escolhido só por antiabuso e passou a ser argumento de venda. Ver o comentário
dele no dataclass.

Ver seção 16 da doc.
"""

from dataclasses import dataclass
from decimal import Decimal

#: **Ligada em 2026-08-22, para o lançamento.** Ficou falsa de julho até aqui, e
#: durante todo esse tempo `plano_vigente()` devolveu PRO para todo mundo — os
#: limites existiam escritos e não valiam para ninguém.
#:
#: A decisão foi do Eduardo, contra uma ressalva minha que vale registrar porque
#: ela pode voltar: com a cobrança ligada, o teto de 20 ofertas do FREE passa a
#: valer **inclusive no onboarding**, já que `criar_bulk` chama
#: `_checar_teto_de_ofertas`. Quem colar uma lista maior que 20 no cadastro tem o
#: lote inteiro recusado com 402, e isso aconteceria na frente de quem estivesse
#: ajudando, no dia do evento.
#:
#: O que derrubou a ressalva foi conhecimento da comunidade, que o código não
#: tem: ninguém chega com lista de 60 cartas pronta, e o cadastro típico é de 10
#: a 15. É o mesmo número que o comentário do FREE abaixo já usava para escolher
#: o teto — "raramente passa de dez cartas". A ressalva estava superdimensionada.
#:
#: **O sintoma a vigiar no dia**, se aparecer: 402 com código `LIMITE_DE_OFERTAS`
#: no cadastro de alguém. Se acontecer mais de uma ou duas vezes, o conserto é
#: subir `max_ofertas` do FREE — uma linha logo abaixo — e não desligar isto.
COBRANCA_ATIVA = True


@dataclass(frozen=True)
class Limites:
    #: Cartas anunciadas como OFERTA. `None` é ilimitado.
    #:
    #: Só OFERTA entra na conta. PROCURA é ilimitada nos dois planos de
    #: propósito: declarar o que se quer não custa nada ao sistema e é o que faz
    #: o matcher achar par para os *outros* — limitar demanda seria limitar o
    #: efeito de rede, que é justamente o que o princípio de precificação
    #: (seção 16) proíbe cobrar. Oferta é alcance de quem anuncia, e alcance é
    #: o que se cobra.
    max_ofertas: int | None
    #: Colar uma lista em vez de cadastrar uma a uma. Não limita *quanto* se
    #: cadastra, limita o trabalho — conveniência pura, sem custo de rede.
    cadastro_em_massa: bool
    #: Quantos matches o feed mostra. `None` nos dois planos na v1: esconder
    #: match é esconder o produto, e é a única alavanca que reduz direto a
    #: métrica-mãe. Reavaliar acima de ~500 usuários ativos.
    matches_visiveis: int | None
    triangular: bool
    alerta_carta: bool
    #: Janela do histórico de trocas. `None` é completo. Não mexe em reputação:
    #: `trocas_concluidas` e `trocas_furadas` são contadores em `profiles` e não
    #: dependem desta lista.
    historico_dias: int | None
    #: Propostas abertas por pessoa nas últimas 24h (seção 22.5). `None` é
    #: ilimitado. Mora aqui, e não numa constraint, porque constraint não
    #: distingue FREE de PRO.
    #:
    #: **Mudou em 2026-08-22, por decisão do Eduardo: FREE 10 -> 5, PRO 100 ->
    #: ilimitado.** Deixou de ser só antiabuso e passou a ser também argumento de
    #: venda, e a mudança de papel merece registro porque muda o raciocínio sobre
    #: o número. Antes: "generoso de propósito, quem abre dez negociações está
    #: usando o app, não abusando dele". Agora o cinco é apertado de propósito —
    #: é ele que faz quem usa de verdade encostar no teto e ver o PRO.
    #:
    #: **O que se perdeu junto:** o PRO deixa de ter teto de disparo. O índice
    #: único "uma negociação aberta por dupla" continua sendo o antiabuso
    #: principal da vitrine e não depende disto, então ninguém consegue metralhar
    #: a mesma pessoa. Mas um assinante mal-intencionado pode abrir proposta para
    #: a base inteira num dia, e é o tipo de coisa que só aparece quando acontece.
    #: Se aparecer, o conserto é um teto alto aqui (500, 1000) em vez de `None`.
    propostas_por_dia: int | None


PLANOS: dict[str, Limites] = {
    # FREE é o teste, não uma versão pobre do app: 20 ofertas cobrem com folga o
    # post típico de grupo local (raramente passa de dez cartas), então o teto só
    # encosta em quem tem coleção — que é quem tem por que assinar.
    "FREE": Limites(
        max_ofertas=20,
        cadastro_em_massa=False,
        matches_visiveis=None,
        triangular=False,
        alerta_carta=False,
        historico_dias=30,
        propostas_por_dia=5,
    ),
    "PRO": Limites(
        max_ofertas=None,
        cadastro_em_massa=True,
        matches_visiveis=None,
        triangular=True,
        alerta_carta=True,
        historico_dias=None,
        propostas_por_dia=None,
    ),
}


#: O preço do PRO, por período, em reais.
#:
#: **Mora aqui desde 2026-08-22, e antes morava no Mercado Pago.** A mudança veio
#: junto com a descoberta de que a assinatura precisa ser criada *sem plano
#: associado* — o fluxo com `preapproval_plan_id` exige `card_token_id`, ou seja,
#: exige que o app colete o cartão, que é justamente o que este projeto não faz.
#: Sem plano do lado deles, o valor viaja na chamada, e alguém aqui precisa ser o
#: dono dele.
#:
#: Ser um número e não uma string é de propósito: `criar_assinatura` manda isto
#: para o `auto_recurring`, e formatar preço é trabalho da tela. `Decimal` porque
#: `float` de dinheiro é como 19.90 vira 19.899999999999999 no corpo de uma
#: requisição de cobrança.
#:
#: A tela lê pela rota `/planos`, e não repete estes números — mesmo motivo dos
#: limites, e pior consequência: tabela que promete um valor e cobrança que
#: debita outro é a discussão que não se ganha.
PRECOS: dict[str, Decimal] = {
    "mensal": Decimal("19.90"),
    # Dez meses pelo preço de doze — os "dois meses de graça" que a tela diz.
    "anual": Decimal("199.90"),
}


def limites_de(plano: str) -> Limites:
    """Os limites declarados de um plano. Use em antiabuso."""
    return PLANOS.get(plano, PLANOS["FREE"])


def plano_vigente(plano: str) -> str:
    """O plano que vale hoje para efeito de limite comercial.

    Antes da cobrança existir, é PRO para todo mundo — ver o docstring do
    módulo. Depois dela, é o plano da pessoa.
    """
    return plano if COBRANCA_ATIVA else "PRO"
