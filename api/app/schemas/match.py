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
    # Desistência declarada não é furo e fica fora da razão da reputação — mas
    # aparece, porque é lida por quem está prestes a marcar um encontro. É o que
    # impede o botão de desistir de virar rota de fuga de quem furaria.
    trocas_desistidas: int = 0
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
    """
    Datas são `datetime`, nunca `str`.

    O resto do arquivo usa `str` de propósito — os ids saem do Postgres já como
    texto e não têm o que ganhar virando UUID de novo. Data é o caso oposto: com
    `str`, o valor que chega do banco é o `::text` do Postgres
    ("2026-08-06 18:03:27+00", espaço no lugar do T), e esse formato não é ISO
    8601. O Chrome perdoa e devolve uma data; o Safari do iOS devolve
    `Invalid Date`, e a tela mostra "Expira em NaN dia(s)". Declarando
    `datetime`, o FastAPI serializa em ISO 8601 e as duas engines concordam.
    """

    id: str
    tipo: str
    status: str
    score: float
    expira_em: datetime
    #: Quantas vezes o prazo já foi esticado. A tela precisa para saber se ainda
    #: oferece o botão — o teto é 2 (services/matching.prorrogar).
    prorrogacoes: int = 0
    #: Quem desistiu, quando a troca está CANCELADA. "Você desistiu" e "Marina
    #: desistiu" são notícias diferentes, e sem isto a tela teria de escolher uma
    #: frase que serve mal para os dois.
    desistiu_por: str | None = None
    participantes: list[ParticipanteResumo]
    itens: list[ItemMatch]


class MatchCompleto(MatchOut):
    participantes: list[ParticipanteCompleto]  # type: ignore[assignment]


class MatchNoHistorico(MatchOut):
    """Uma troca já encerrada, como ela aparece no histórico do perfil.

    Herda de MatchOut, não de MatchCompleto: uma lista não precisa de contato, e
    a regra do arquivo continua valendo — quem não tem o campo não vaza o campo.
    Quem quiser retomar o assunto abre o detalhe, que revela o contato de novo.

    `desfecho_em` é `datetime` pelo mesmo motivo que `expira_em` — ver MatchOut.
    """

    desfecho_em: datetime
