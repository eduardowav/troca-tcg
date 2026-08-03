"""Schemas de match.

A regra inviolável do contato mora aqui: `ParticipanteResumo` não tem campo de
contato nenhum, e é ele que o feed serializa. O contato só aparece em
`ParticipanteCompleto`, usado apenas depois do aceite mútuo. Separar em dois
schemas — em vez de um campo opcional — é o que impede um vazamento por
descuido: não dá para esquecer de limpar um campo que não existe.
"""

from datetime import datetime

from pydantic import BaseModel


class ParticipanteResumo(BaseModel):
    """
    Reputação vai em contadores, não em porcentagem.

    Porcentagem sozinha mente com amostra pequena: quem concluiu uma única troca
    vira "100%", indistinguível de quem concluiu quarenta, e quem levou um furo
    na estreia fica marcado com "0%" para sempre. Mandando os dois inteiros, a
    tela mostra o denominador — e é o denominador que deixa a pessoa julgar
    quanto peso dar ao número.
    """

    user_id: str
    username: str
    nome_exibicao: str
    trocas_concluidas: int = 0
    trocas_furadas: int = 0
    aceitou: bool | None = None
    confirmou_conclusao: bool = False


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


class MatchNoHistorico(MatchOut):
    """Uma troca já encerrada, como ela aparece no histórico do perfil.

    Herda de MatchOut, não de MatchCompleto: uma lista não precisa de contato, e
    a regra do arquivo continua valendo — quem não tem o campo não vaza o campo.
    Quem quiser retomar o assunto abre o detalhe, que revela o contato de novo.

    `desfecho_em` é `datetime`, não `str` como `expira_em`. Deliberado: assim o
    FastAPI serializa em ISO 8601 com o `T` no meio. O `::text` do Postgres sai
    com espaço ("2026-08-03 05:40:35+00"), que o Chrome perdoa e o Safari do iOS
    trata como data inválida — e o histórico é lido no celular.
    """

    desfecho_em: datetime
