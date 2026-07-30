"""Schemas de anúncio (listing) — as listas Ofereço e Procuro."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Condicao = Literal["NM", "LP", "MP", "HP", "DMG"]
Tipo = Literal["OFERTA", "PROCURA"]


class AnuncioItem(BaseModel):
    card_id: UUID
    tipo: Tipo
    quantidade: int = Field(default=1, ge=1, le=99)
    condicao: Condicao = "NM"
    finish_id: int = 1  # NORMAL; o onboarding ainda não coleta acabamento
    idioma: str = Field(default="pt", min_length=2, max_length=2)
    prioridade: int = Field(default=2, ge=1, le=3)
    aceita_qualquer_finish: bool = False


class AnuncioAtualizar(BaseModel):
    """Edição inline da tela Minhas cartas — só o que o dono pode mexer.

    `card_id` e `tipo` ficam de fora de propósito: trocar a carta ou mudar de
    Ofereço para Procuro é outro anúncio, não uma edição. Quem faz isso remove e
    cadastra de novo.
    """

    quantidade: int | None = Field(default=None, ge=1, le=99)
    condicao: Condicao | None = None
    prioridade: int | None = Field(default=None, ge=1, le=3)
    aceita_qualquer_finish: bool | None = None


class AnuncioBulkIn(BaseModel):
    itens: list[AnuncioItem] = Field(min_length=1, max_length=300)


class CartaProcurada(BaseModel):
    """Quantas pessoas procuram uma carta que eu ofereço.

    Só a contagem, nunca quem. Saber o nome de quem procura permitiria procurar a
    pessoa por fora e furar o aceite mútuo, que é justamente o que protege os
    dois lados aqui — e é a regra que o resto da API já segue (ver
    ParticipanteResumo em schemas/match.py).
    """

    card_id: str
    procurando: int


class AnuncioOut(BaseModel):
    id: str
    card_id: str
    tipo: str
    quantidade: int
    condicao: str
    finish_id: int
    idioma: str
    prioridade: int
    aceita_qualquer_finish: bool
    ativo: bool
