"""Schemas de perfil (entrada e saída)."""

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


#: Teto de campo livre curto. `bairro` e `avatar_url` entravam sem limite nenhum
#: (item 7 da segurança, resolvido em 2026-08-16): sem `max_length`, o Pydantic
#: aceita megabytes, o Postgres aceita `text` sem reclamar, e o `avatar_url` de
#: terceiros ainda é servido no perfil público. Não era explorável hoje; era o
#: tipo de campo que vira problema no dia em que alguém procura por um.
_MAX_BAIRRO = 60
_MAX_URL = 500


class PerfilCriar(BaseModel):
    username: str
    nome_exibicao: str = Field(min_length=1, max_length=60)
    bairro: str | None = Field(default=None, max_length=_MAX_BAIRRO)
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
    bairro: str | None = Field(default=None, max_length=_MAX_BAIRRO)
    bio: str | None = Field(default=None, max_length=200)
    contato_visivel: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=_MAX_URL)

    @field_validator("avatar_url")
    @classmethod
    def _so_https(cls, v: str | None) -> str | None:
        """Endereço de imagem, e só por HTTPS.

        Este campo é servido a terceiros no perfil público, então o que entra
        aqui é renderizado no navegador de outra pessoa. Sem validação, um
        `javascript:` ou um `data:` com SVG viram execução na página de quem
        olha o perfil — e o app ainda não tem CSP para segurar isso sozinho.

        Aceitar só `https://` é a regra mais estreita que não atrapalha ninguém:
        toda hospedagem de imagem serve por HTTPS, e o app não hospeda avatar.
        """
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not v.startswith("https://"):
            raise ValueError("O endereço da imagem precisa começar com https://")
        return v

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
    #: Selo de reconhecimento, ou nulo. Hoje só existe `FOUNDER`.
    #:
    #: **Público de propósito** — é a razão de ele existir. Um selo que só o dono
    #: enxerga não reconhece ninguém; o que ele faz é dizer a quem vai trocar com
    #: essa pessoa que ela estava aqui antes de haver app.
    #:
    #: Não é plano e não concede nada: quem manda no limite é `profiles.plano`.
    #: Ver `db/schema/37_founder.sql` para por que isto não virou `plano =
    #: 'FOUNDER'`.
    selo: str | None = None
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
    #: PRO sem pagar — patrocínio, permuta, contrato. Ver `36_parceiro.sql`.
    #:
    #: Booleano, e não o motivo: o motivo é o acordo, e é registro de quem
    #: administra. A pessoa precisa saber que o plano dela é de cortesia — senão
    #: a tela de planos ofereceria assinatura a quem já tem tudo —, não precisa
    #: ler a cláusula.
    parceiro: bool = False
