"""Schemas de denúncia."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

#: Os mesmos cinco do check em db/schema/22_denuncias.sql. Duplicar a lista aqui
#: é de propósito: o banco é a garantia e a API é a mensagem de erro decente —
#: sem o Literal, um motivo inválido só quebraria no insert, virando 500 em vez
#: de 422 com o campo apontado.
Motivo = Literal[
    "NAO_APARECEU",
    "USO_PARA_VENDA",
    "CARTA_DIFERENTE",
    "CONDUTA",
    "OUTRO",
]


class DenunciaCriar(BaseModel):
    """Uma denúncia sobre a outra pessoa desta troca.

    Não tem campo para dizer *quem* está sendo denunciado: o denunciado é o outro
    participante do match, lido no banco. Deixar o cliente mandar o id abriria a
    porta para denunciar terceiros passando um match do qual se participa — e
    seria um campo a validar no lugar de um campo a não ter.
    """

    motivo: Motivo
    descricao: str | None = Field(default=None, max_length=1000)

    @field_validator("descricao")
    @classmethod
    def _limpa_descricao(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class DenunciaOut(BaseModel):
    """O recibo. Devolve o que foi registrado, nunca o que será feito.

    Sem campo de status ou de resultado de propósito: prometer desfecho numa
    resposta HTTP é prometer o que a moderação — que é uma pessoa lendo — não
    pode cumprir em milissegundos. A tela agradece e sai.
    """

    id: str
    motivo: Motivo
    criado_em: datetime
