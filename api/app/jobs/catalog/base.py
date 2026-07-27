"""Contrato da fonte de catálogo.

O catálogo é a única dependência externa crítica do projeto. Isolar o acesso atrás
desta interface é o que torna a troca de provedor um arquivo novo, não um refactor
(ver Apêndice A da doc). Hoje a implementação é a TCGdex; amanhã pode ser outra.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SetResumo:
    """Um set (expansão) no catálogo da fonte."""

    id: str
    nome: str


@dataclass(frozen=True)
class CartaCatalogo:
    """Uma carta normalizada, pronta para upsert em `cards`.

    `raridade` e preço ficam None nesta fase: os dados "brief" do set não trazem
    raridade (exigiria uma request por carta) e preço vem de outra rota. Ver doc.
    """

    external_id: str
    set_code: str
    set_nome: str | None
    numero: str
    nome_pt: str | None
    nome_en: str
    raridade: str | None = None
    imagem_url: str | None = None


class FonteCatalogo(Protocol):
    """Provedor de catálogo de cartas. Implemente para trocar de fonte."""

    async def listar_sets(self) -> list[SetResumo]: ...

    async def obter_cartas_do_set(self, set_id: str) -> list[CartaCatalogo]: ...
