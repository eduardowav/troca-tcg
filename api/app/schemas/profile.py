"""Schemas de perfil (entrada e saída)."""

import re

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


class PerfilOut(BaseModel):
    id: str
    username: str
    nome_exibicao: str
    cidade: str
    bairro: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    # Só aparece em /me: é o dono vendo o próprio contato.
    contato_visivel: str | None = None
    trocas_concluidas: int
    trocas_furadas: int
    # Fora da razão da `reputacao` de propósito: desistir avisando não é furar.
    # Aparece como contador próprio — o custo da desistência é transparência.
    trocas_desistidas: int = 0
    reputacao: int | None = None
    plano: str
    onboarding_ok: bool
