"""Schemas de notificação."""

from datetime import datetime

from pydantic import BaseModel, Field


class NotificacaoOut(BaseModel):
    """Uma linha da caixa.

    `titulo` e `corpo` vêm prontos do banco — o cliente não monta texto (ver o
    docstring de services/notificacoes). `link` é um caminho interno do app,
    nunca uma URL absoluta: quem clica navega, não sai.
    """

    id: str
    tipo: str
    titulo: str
    corpo: str
    link: str | None = None
    lida: bool
    criado_em: datetime


class MarcarLidas(BaseModel):
    """Quais marcar. Lista vazia (o padrão) é "todas as minhas não lidas".

    O corpo aceita ids para o caso de a pessoa abrir uma notificação sozinha, e
    aceita o vazio para o botão "marcar todas" — que é o gesto mais comum e não
    deveria exigir do cliente montar a lista do que ele acabou de mostrar.
    """

    ids: list[str] = Field(default_factory=list)


class ContagemNaoLidas(BaseModel):
    """O que a badge precisa saber, e nada mais."""

    nao_lidas: int


class ChavesPush(BaseModel):
    """As duas chaves que o navegador gera para cifrar a mensagem até ele.

    Vêm aninhadas em `keys` porque é assim que o `PushSubscription.toJSON()` do
    navegador as entrega, e reescrever o formato no cliente só criaria uma
    tradução a mais para alguém errar.
    """

    p256dh: str = Field(max_length=255)
    auth: str = Field(max_length=255)


class InscricaoPush(BaseModel):
    """Um navegador pedindo para receber aviso no sistema.

    O `endpoint` é a URL do serviço de push daquele aparelho (FCM, Mozilla,
    Apple) e é ele que identifica a inscrição — não o usuário. O teto de
    tamanho existe porque este é um dos poucos campos em que o cliente escolhe
    o valor inteiro: sem ele, um endpoint de 10 MB entraria no banco.
    """

    endpoint: str = Field(min_length=20, max_length=2048)
    keys: ChavesPush
