"""Camada centralizada de limites por plano.

Na v1 o gate existe no código mas está aberto: todos recebem os limites PRO.
Ligar a cobrança depois é trocar o default, não refatorar. Ver seção 16 da doc.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Limites:
    max_anuncios: int
    matches_visiveis: int
    triangular: bool
    alerta_carta: bool
    historico_dias: int
    #: Propostas abertas por pessoa nas últimas 24h (seção 22.5). Mora aqui, e
    #: não numa constraint, porque constraint não distingue FREE de PRO. Não é o
    #: antiabuso principal da vitrine — esse é o índice único "uma negociação
    #: aberta por dupla" —, e sim o teto de quem dispararia proposta para a base
    #: inteira. O número é generoso de propósito: uma pessoa que abre dez
    #: negociações num dia está usando o app, não abusando dele.
    propostas_por_dia: int


PLANOS: dict[str, Limites] = {
    "FREE": Limites(
        max_anuncios=150,
        matches_visiveis=5,
        triangular=False,
        alerta_carta=False,
        historico_dias=30,
        propostas_por_dia=10,
    ),
    "PRO": Limites(
        max_anuncios=10_000,
        matches_visiveis=999,
        triangular=True,
        alerta_carta=True,
        historico_dias=3650,
        propostas_por_dia=100,
    ),
}


def limites_de(plano: str) -> Limites:
    return PLANOS.get(plano, PLANOS["FREE"])
