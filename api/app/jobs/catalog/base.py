"""Contrato da fonte de catálogo.

O catálogo é a única dependência externa crítica do projeto. Isolar o acesso atrás
desta interface é o que torna a troca de provedor um arquivo novo, não um refactor
(ver Apêndice A da doc). Hoje a implementação é a TCGdex; amanhã pode ser outra.

A hierarquia é série (bloco) → set (expansão) → carta, espelhando `db/schema/
12_series_sets.sql`. Uma dataclass por tabela, para que o sync seja upsert direto.
"""

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class SerieCatalogo:
    """Um bloco: 'sv' = Escarlate e Violeta, 'me' = Megaevolução."""

    code: str
    nome: str
    logo_url: str | None = None


@dataclass(frozen=True)
class SetCatalogo:
    """Uma expansão, com os metadados que a carta sozinha não carrega.

    `sigla` é a abreviação impressa no canto ('OBF'), que é como o jogador lê a
    carta. `total_oficial` é o denominador impresso e `total_impresso` inclui as
    secretas — em Obsidiana em Chamas, 197 e 230.
    """

    code: str
    serie_code: str | None
    nome: str
    # Só existe para o sync conseguir garantir a linha-pai em `series` quando
    # alguém sincroniza um set solto (`run.py sv03`) sem passar pela série. Não
    # é coluna de `sets`.
    serie_nome: str | None = None
    sigla: str | None = None
    total_oficial: int | None = None
    total_impresso: int | None = None
    logo_url: str | None = None
    simbolo_url: str | None = None
    lancado_em: date | None = None


@dataclass(frozen=True)
class CartaCatalogo:
    """Uma carta normalizada, pronta para upsert em `cards`.

    `raridade` e preço ficam None nesta fase: os dados "brief" do set não trazem
    raridade (exigiria uma request por carta) e preço vem de outra rota. Ver doc.
    O nome do set não está aqui de propósito — mora em `sets`, uma linha só.
    """

    external_id: str
    set_code: str
    numero: str
    nome_pt: str | None
    nome_en: str
    raridade: str | None = None
    imagem_url: str | None = None


class FonteCatalogo(Protocol):
    """Provedor de catálogo de cartas. Implemente para trocar de fonte."""

    async def listar_sets(self) -> list[str]:
        """Códigos de todos os sets conhecidos pela fonte."""
        ...

    async def obter_serie(self, serie_code: str) -> tuple[SerieCatalogo, list[str]]:
        """A série e os códigos dos sets que a compõem."""
        ...

    async def obter_set(self, set_code: str) -> tuple[SetCatalogo, list[CartaCatalogo]]:
        """Set e cartas juntos: os dois saem da mesma resposta da fonte."""
        ...
