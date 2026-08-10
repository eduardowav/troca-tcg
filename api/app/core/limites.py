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

Ver seção 16 da doc.
"""

from dataclasses import dataclass

#: Vira True junto com a Fase C (Mercado Pago, webhook, tela de planos). Até lá,
#: os limites de plano estão escritos e desligados — ligar é trocar esta linha,
#: não refatorar.
COBRANCA_ATIVA = False


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
    #: Propostas abertas por pessoa nas últimas 24h (seção 22.5). Mora aqui, e
    #: não numa constraint, porque constraint não distingue FREE de PRO. Não é o
    #: antiabuso principal da vitrine — esse é o índice único "uma negociação
    #: aberta por dupla" —, e sim o teto de quem dispararia proposta para a base
    #: inteira. O número é generoso de propósito: uma pessoa que abre dez
    #: negociações num dia está usando o app, não abusando dele.
    propostas_por_dia: int


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
        propostas_por_dia=10,
    ),
    "PRO": Limites(
        max_ofertas=None,
        cadastro_em_massa=True,
        matches_visiveis=None,
        triangular=True,
        alerta_carta=True,
        historico_dias=None,
        propostas_por_dia=100,
    ),
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
