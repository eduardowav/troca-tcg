"""Schemas de proposta — a negociação humana da seção 22 da doc.

Entrada e saída seguem a mesma regra do resto da API: o cliente manda
`listing_id`, nunca `card_id` solto. É o anúncio que prova que a carta existe
com aquele acabamento e aquela condição, e é o sumiço dele que faz a proposta
caducar sozinha (`proposta_itens.listing_id` anulável, ver db/schema/23).

Contato não aparece em lugar nenhum daqui. Enquanto há negociação não há troca
combinada, e a revelação continua acontecendo só dentro do match que o aceite
gera — em `MatchCompleto`, como sempre.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

#: Teto de itens por lado numa rodada. Não é limite de banco: é a mesma ideia do
#: teto de 4 rodadas — uma proposta com trinta cartas de cada lado não é uma
#: proposta, é um inventário, e ninguém responde a um inventário em 72h.
MAX_ITENS = 20


class PropostaCriar(BaseModel):
    """Abre a negociação. `para` é o @, não o id.

    O @ é o que a tela tem na mão: chega-se a alguém por uma carta da vitrine, e
    o que a carta carrega é o dono. Pedir o uuid obrigaria a rota de vitrine a
    expor o id do usuário, que ela não tem motivo para expor.
    """

    para: str = Field(min_length=3, max_length=20)
    #: Anúncios da outra pessoa que eu quero receber.
    quero: list[UUID] = Field(min_length=1, max_length=MAX_ITENS)
    #: Anúncios meus que eu ofereço em troca.
    ofereco: list[UUID] = Field(min_length=1, max_length=MAX_ITENS)


class ContrapropostaCriar(BaseModel):
    """Nova rodada. Sem `para`: a dupla já está definida desde a rodada 1."""

    quero: list[UUID] = Field(min_length=1, max_length=MAX_ITENS)
    ofereco: list[UUID] = Field(min_length=1, max_length=MAX_ITENS)


class ItemProposta(BaseModel):
    """Uma carta dentro de uma rodada.

    `card_id`, `condicao` e `finish_id` vêm da cópia guardada no item, não do
    anúncio: o histórico da negociação não pode se reescrever quando o dono
    editar a lista. `disponivel` é o oposto — vem do anúncio *agora*, e é o que
    a tela usa para avisar que aquela carta saiu do ar no meio da conversa.
    """

    listing_id: str | None = None
    card_id: str
    condicao: str
    finish_id: int
    quantidade: int
    disponivel: bool


class RodadaProposta(BaseModel):
    """Uma rodada da negociação, do ponto de vista de quem a jogou.

    `quero` e `ofereco` são sempre lidos a partir de `por`: quem jogou a rodada
    pede o que está em `quero` e entrega o que está em `ofereco`. É o que faz a
    tela conseguir dizer "você pediu X, ela ofereceu Y no lugar" sem inventar
    perspectiva nenhuma.
    """

    rodada: int
    por: str
    quero: list[ItemProposta] = []
    ofereco: list[ItemProposta] = []


class PropostaResumo(BaseModel):
    """A proposta como ela aparece numa lista (as caixas de `/me/propostas`).

    Traz a rodada corrente inteira de propósito: sem ela a lista seria um monte
    de "proposta de @fulano" e o app precisaria de uma requisição por linha para
    mostrar qual carta está em jogo — que é a única coisa que importa ali.
    """

    id: str
    status: str
    rodada: int
    #: O @ de quem deve a resposta.
    vez_de: str
    #: A outra pessoa da negociação, seja ela quem abriu ou quem recebeu.
    com: str
    com_nome: str
    #: Atalho do que a tela pergunta o tempo todo — e a badge da aba sai daqui.
    minha_vez: bool
    criada_em: datetime
    expira_em: datetime
    respondida_em: datetime | None = None
    match_id: str | None = None
    atual: RodadaProposta | None = None


class PropostaOut(PropostaResumo):
    """O detalhe: todas as rodadas, em ordem.

    Datas são `datetime` pelo mesmo motivo de `MatchOut`: com `str`, o valor sai
    no formato `::text` do Postgres e o Safari do iOS devolve `Invalid Date`.
    """

    autor: str
    destinatario: str
    rodadas: list[RodadaProposta] = []
