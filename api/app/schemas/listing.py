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


class AnuncioBulkIn(BaseModel):
    itens: list[AnuncioItem] = Field(min_length=1, max_length=300)


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
