"""Schemas de match.

A regra inviolável do contato mora aqui: `ParticipanteResumo` não tem campo de
contato nenhum, e é ele que o feed serializa. O contato só aparece em
`ParticipanteCompleto`, usado apenas depois do aceite mútuo. Separar em dois
schemas — em vez de um campo opcional — é o que impede um vazamento por
descuido: não dá para esquecer de limpar um campo que não existe.
"""

from pydantic import BaseModel


class ParticipanteResumo(BaseModel):
    user_id: str
    username: str
    nome_exibicao: str
    reputacao: float | None = None
    aceitou: bool | None = None


class ParticipanteCompleto(ParticipanteResumo):
    """Só depois do aceite mútuo. Ver services/matching.aceitar_match."""

    contato_visivel: str | None = None


class ItemMatch(BaseModel):
    """Uma carta indo de alguém para alguém — a 'linha de troca'."""

    card_id: str
    de_user_id: str
    para_user_id: str
    condicao: str
    finish_id: int


class MatchOut(BaseModel):
    id: str
    tipo: str
    status: str
    score: float
    expira_em: str
    participantes: list[ParticipanteResumo]
    itens: list[ItemMatch]


class MatchCompleto(MatchOut):
    participantes: list[ParticipanteCompleto]  # type: ignore[assignment]
