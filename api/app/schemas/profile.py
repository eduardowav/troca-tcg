"""Schemas de perfil (entrada e saída)."""

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


class PerfilCriar(BaseModel):
    username: str
    nome_exibicao: str = Field(min_length=1, max_length=60)
    bairro: str | None = None
    contato_visivel: str | None = Field(default=None, max_length=120)
    aceite_termos: bool

    @field_validator("username")
    @classmethod
    def _normaliza_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not _USERNAME_RE.match(v):
            raise ValueError(
                "username deve ter 3–20 caracteres: letras minúsculas, números ou _"
            )
        return v


class PerfilAtualizar(BaseModel):
    username: str | None = None
    nome_exibicao: str | None = Field(default=None, min_length=1, max_length=60)
    bairro: str | None = None
    bio: str | None = Field(default=None, max_length=200)
    contato_visivel: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = None

    @field_validator("username")
    @classmethod
    def _normaliza_username(cls, v: str | None) -> str | None:
        # PATCH parcial: username ausente é "não mexer", não "apagar".
        if v is None:
            return None
        v = v.strip().lower()
        if not _USERNAME_RE.match(v):
            raise ValueError(
                "username deve ter 3–20 caracteres: letras minúsculas, números ou _"
            )
        return v


class PerfilPublicoOut(BaseModel):
    """O perfil como terceiros o veem — a base, não um recorte do /me.

    A herança aponta para cá de propósito, na mesma lógica de
    `ParticipanteResumo`/`ParticipanteCompleto` em schemas/match.py: quem tem
    menos campos é a classe-mãe, e quem tem mais estende. No sentido contrário
    — público herdando de /me e apagando o que sobra — todo campo privado novo
    nasceria público, e só um `del` bem lembrado o tiraria de lá. Aqui um campo
    novo só vaza se alguém o escrever nesta classe, de propósito.

    `reputacao` vem acompanhada dos três contadores porque porcentagem sozinha
    mente com amostra pequena — a razão longa está em schemas/match.py.
    """

    id: str
    username: str
    nome_exibicao: str
    cidade: str
    bairro: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    trocas_concluidas: int
    trocas_furadas: int
    # Fora da razão da `reputacao` de propósito: desistir avisando não é furar.
    # Aparece como contador próprio — o custo da desistência é transparência.
    trocas_desistidas: int = 0
    reputacao: int | None = None
    #: `datetime`, nunca `str` — o `::text` do Postgres não é ISO 8601 e o Safari
    #: do iOS devolve Invalid Date. A história completa está em schemas/match.py.
    desde: datetime


class PerfilOut(PerfilPublicoOut):
    """O dono vendo o próprio perfil. Só é servido em /me."""

    # Só aparece em /me: é o dono vendo o próprio contato, para poder editá-lo.
    contato_visivel: str | None = None
    plano: str
    onboarding_ok: bool
    #: A conta está bloqueada por descumprir os termos.
    #:
    #: Só para o dono — no perfil público seria delação, e a política é que quem
    #: foi bloqueado simplesmente não aparece. Aqui é o contrário: é a única
    #: forma de a pessoa saber por que o app parou de deixá-la agir, e sem isso
    #: ela conclui que o app quebrou e cria uma segunda conta.
    bloqueado: bool = False
