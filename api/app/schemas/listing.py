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


class QuemProcura(BaseModel):
    """Quem procura uma carta minha: identidade sim, contato não.

    Mostrar nome e @ é decisão de produto do Eduardo (2026-07-30) — a tela vazia
    fica mais concreta com gente do que com número. O que **não** muda é o
    contato: continua saindo só depois do aceite mútuo, e por isso este schema
    não tem onde guardá-lo, do mesmo jeito que ParticipanteResumo.
    """

    user_id: str
    username: str
    nome_exibicao: str


class CartaProcurada(BaseModel):
    card_id: str
    procurando: int
    pessoas: list[QuemProcura] = []


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
