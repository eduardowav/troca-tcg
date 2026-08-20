"""O painel de erro — e a prova de que ele filtra o que promete filtrar.

Dois defeitos deste projeto nasceram do mesmo lugar: proteção configurada que
não fazia nada (o freio da API, duas vezes). Um Sentry mal ligado erra do mesmo
jeito, só que ao contrário — ele *parece* quieto porque nada chega, e ninguém
descobre até o dia em que se procura um erro que nunca foi enviado.

Por isso nenhum teste daqui lê configuração. O que cada um faz é levantar um
`sentry_sdk` de verdade com um transporte de mentira, bater numa rota e contar o
que saiu pelo fio.

O transporte falso é a peça central: sem ele o teste precisaria de rede, e um
teste que precisa de rede é um teste que alguém desliga.
"""

import pytest
import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from app.core.config import settings
from app.core.errors import RegraNegocio, regra_negocio_handler
from app.core.monitoramento import iniciar

#: DSN sintético. Nunca é resolvido — o transporte falso substitui o envio.
DSN_DE_TESTE = "https://naoexiste@o0.ingest.sentry.io/0"


class TransporteFalso(Transport):
    """Guarda os envelopes em memória em vez de mandá-los para o Sentry."""

    def __init__(self) -> None:
        super().__init__()
        self.envelopes: list = []

    def capture_envelope(self, envelope) -> None:
        self.envelopes.append(envelope)

    @property
    def eventos(self) -> list:
        return [
            item
            for envelope in self.envelopes
            for item in envelope.items
            if item.type == "event"
        ]


@pytest.fixture
def transporte(monkeypatch):
    """Sentry ligado pelo `iniciar()` de verdade, com o fio de saída trocado.

    Nada aqui repete a configuração do módulo — só o DSN e o transporte são
    postos de fora. O que a suíte exercita é o `core/monitoramento.py`: o filtro
    de regra de negócio, a denylist do scrubber, o `send_default_pii`.

    O `init(dsn=None)` do fim não é higiene opcional: o cliente do Sentry é
    global do processo, e um teste que o deixasse ligado passaria a capturar as
    exceções de todos os testes seguintes da suíte.
    """
    falso = TransporteFalso()
    monkeypatch.setattr(settings, "SENTRY_DSN", DSN_DE_TESTE)
    iniciar(transporte=falso)
    yield falso
    sentry_sdk.flush()
    sentry_sdk.init(dsn=None)


def app_de_teste() -> FastAPI:
    """Um app com as três formas de dar errado que a API tem.

    Montado **depois** do `init`, como o `app.main` faz: a integração do Sentry
    com o Starlette entra na construção da pilha de middlewares, e um app já
    construído não é instrumentado. É a razão de `iniciar()` ser a primeira
    linha do `main.py`, antes de o `FastAPI(...)` existir.
    """
    aplicacao = FastAPI()
    aplicacao.add_exception_handler(RegraNegocio, regra_negocio_handler)

    @aplicacao.get("/regra")
    async def regra():
        raise RegraNegocio("LIMITE_DO_PLANO", "Você chegou ao limite de anúncios.")

    @aplicacao.get("/ausente")
    async def ausente():
        raise HTTPException(status_code=404, detail="não existe")

    @aplicacao.get("/quebrado")
    async def quebrado():
        raise ValueError("isto é defeito nosso")

    return aplicacao


def test_sem_dsn_nao_liga_nada():
    """Rodar o projeto na própria máquina não exige conta no Sentry."""
    assert settings.SENTRY_DSN == ""
    iniciar()
    assert not sentry_sdk.get_client().is_active()


def test_regra_de_negocio_nao_vira_evento(transporte):
    """Limite de plano não é defeito — e são centenas por dia num app saudável.

    O free tier são 5 mil eventos por mês. Sem este filtro, uma semana de uso
    normal gasta a cota inteira em "não pode" e afoga o defeito de verdade.
    """
    cliente = TestClient(app_de_teste(), raise_server_exceptions=False)
    resposta = cliente.get("/regra")
    sentry_sdk.flush()

    assert resposta.status_code == 400
    assert resposta.json()["erro"]["codigo"] == "LIMITE_DO_PLANO"
    assert transporte.eventos == []


def test_quatrocentos_nao_vira_evento(transporte):
    """404 é o servidor funcionando."""
    cliente = TestClient(app_de_teste(), raise_server_exceptions=False)
    assert cliente.get("/ausente").status_code == 404
    sentry_sdk.flush()

    assert transporte.eventos == []


def test_defeito_de_verdade_chega(transporte):
    """E o outro lado da moeda: o que é defeito precisa sair daqui.

    Este é o teste que teria pegado um Sentry instalado e mudo — o modo de falhar
    que já custou dois meses de rate limit que não limitava.
    """
    cliente = TestClient(app_de_teste(), raise_server_exceptions=False)
    assert cliente.get("/quebrado").status_code == 500
    sentry_sdk.flush()

    assert len(transporte.eventos) == 1
    evento = transporte.eventos[0].payload.json
    assert evento["exception"]["values"][-1]["type"] == "ValueError"
    # A rota vem junto: stack sem saber qual endereço foi chamado é metade do
    # que se procura às três da manhã.
    assert evento["request"]["url"].endswith("/quebrado")


def test_segredo_de_cabecalho_nao_viaja(transporte):
    """`X-Job-Secret` abre as rotas internas; não pode acabar num painel web.

    Este teste pegou um vazamento de verdade em 2026-08-20, e o vazamento não
    estava onde se procurava. Os cabeçalhos em `request.headers` saíam limpos
    pela denylist do scrubber — e o mesmo segredo chegava inteiro pelo **stack**,
    dentro do `scope` do ASGI que é variável local de um middleware. Denylist
    limpa por nome de chave; ali o valor mora numa lista de pares de bytes, sem
    nome nenhum. A correção foi `include_local_variables=False`.

    Vale para o `Authorization` também, que é o caso grave: token de sessão do
    Supabase publicado num painel web a cada erro de renderização.
    """
    cliente = TestClient(app_de_teste(), raise_server_exceptions=False)
    cliente.get(
        "/quebrado",
        headers={
            "X-Job-Secret": "abracadabra",
            "Authorization": "Bearer token-de-sessao-de-alguem",
        },
    )
    sentry_sdk.flush()

    evento = str(transporte.eventos[0].payload.json)
    assert "abracadabra" not in evento
    assert "token-de-sessao-de-alguem" not in evento


def test_main_liga_o_sentry_antes_de_montar_o_app(monkeypatch):
    """A ordem no `main.py`, provada em vez de comentada.

    Se `iniciar()` for chamado depois do `FastAPI(...)` — um `import` mudado de
    lugar por um formatador, por exemplo — a integração deixa de instrumentar o
    app e o Sentry passa a receber só o que o código enviar à mão. Nada quebra,
    nada avisa, e o painel fica quase vazio parecendo boa notícia.

    O teste recarrega o módulo e pergunta, no instante da chamada, se o objeto
    `app` já existia. Tem de não existir.
    """
    import importlib
    import sys

    from app.core import monitoramento

    visto: dict[str, bool] = {}
    modulo = importlib.import_module("app.main")

    def espiao(**_) -> None:
        visto["app_ja_existia"] = hasattr(sys.modules["app.main"], "app")

    # `reload` reexecuta o módulo **no mesmo namespace**: o `app` da importação
    # anterior continua lá e responderia "já existia" sem que a ordem tivesse
    # nada de errado. Tirar o atributo antes é o que faz a pergunta valer.
    monkeypatch.delattr(modulo, "app")
    monkeypatch.setattr(monitoramento, "iniciar", espiao)
    importlib.reload(modulo)

    assert visto["app_ja_existia"] is False
