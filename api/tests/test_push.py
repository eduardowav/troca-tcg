"""Testes do Web Push — sem Postgres e sem rede, como o resto da suíte.

O que dá para provar aqui é o que mais custa caro errar: que push nenhum sai
sem chave configurada, que a fila morre junto com a transação desfeita, que só
os eventos da matriz vibram o celular, e que a inscrição de outra pessoa não é
apagável chutando um endpoint.

O envio em si — a cifragem, o POST no FCM — é do `pywebpush` e depende de rede;
o que fica aqui é a decisão de mandar.
"""

import inspect

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import notificacoes, push


class SessaoFalsa:
    """Mesmo dublê do test_notificacoes, com o `info` que a fila usa."""

    def __init__(self):
        self.info: dict = {}
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return type(
            "Res",
            (),
            {
                "rowcount": 1,
                "mappings": lambda self: type("M", (), {"all": lambda self: []})(),
            },
        )()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return None

    async def commit(self):
        self.commits += 1


def com_chaves(monkeypatch) -> None:
    """Liga o push para o teste. Sem isto tudo é no-op, que é o padrão."""
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "publica-de-teste")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "privada-de-teste")


# ------------------------------------------------------------- desligado por padrão


def sem_chaves(monkeypatch) -> None:
    """Desliga o push. Explícito porque o `.env` da máquina pode ter chave — o
    teste é sobre a ausência delas, não sobre o ambiente de quem roda."""
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")


def test_sem_chaves_nao_ha_push(monkeypatch):
    """Desenvolvimento e qualquer implantação sem VAPID: o canal in-app continua
    inteiro e nada tenta sair para a rede."""
    sem_chaves(monkeypatch)
    assert push.ativo() is False

    sessao = SessaoFalsa()
    push.agendar(
        sessao,
        para="alguem",
        tipo="PROPOSTA_RECEBIDA",
        titulo="t",
        corpo="c",
        link=None,
    )
    assert sessao.info == {}


def test_sessao_sem_info_nao_quebra(monkeypatch):
    """Os dublês de teste e qualquer sessão que não seja AsyncSession de verdade
    passam batido em vez de derrubar a notificação."""
    com_chaves(monkeypatch)

    class Crua:
        pass

    push.agendar(
        Crua(),
        para="alguem",
        tipo="PROPOSTA_RECEBIDA",
        titulo="t",
        corpo="c",
        link=None,
    )


# --------------------------------------------------------------------- a fila


async def test_notificacao_enfileira_o_push(monkeypatch):
    com_chaves(monkeypatch)
    sessao = SessaoFalsa()

    await notificacoes._notificar(
        sessao,
        para="quem-recebe",
        de="quem-agiu",
        tipo=notificacoes.TIPO_PROPOSTA_RECEBIDA,
        titulo="@fulano propôs uma troca",
        corpo="É a sua vez.",
        link="/propostas/1",
    )

    fila = sessao.info["push_pendentes"]
    assert len(fila) == 1
    assert fila[0]["user_id"] == "quem-recebe"
    assert fila[0]["link"] == "/propostas/1"


async def test_evento_fora_da_matriz_nao_vibra(monkeypatch):
    """Recusada é registro do que aconteceu: entra na caixa, não no celular."""
    com_chaves(monkeypatch)
    sessao = SessaoFalsa()

    await notificacoes._notificar(
        sessao,
        para="quem-recebe",
        de="quem-agiu",
        tipo=notificacoes.TIPO_PROPOSTA_RECUSADA,
        titulo="t",
        corpo="c",
    )

    assert "push_pendentes" not in sessao.info


async def test_quem_agiu_nao_recebe_push(monkeypatch):
    """A guarda do `_notificar` vale para os dois canais: sem linha na caixa,
    sem vibração — e é por isso que o push é enfileirado lá dentro, e não em
    cada evento."""
    com_chaves(monkeypatch)
    sessao = SessaoFalsa()

    await notificacoes._notificar(
        sessao,
        para="mesma-pessoa",
        de="mesma-pessoa",
        tipo=notificacoes.TIPO_PROPOSTA_RECEBIDA,
        titulo="t",
        corpo="c",
    )

    assert "push_pendentes" not in sessao.info


async def test_fila_vazia_nao_consulta_o_banco():
    """A imensa maioria das requisições não gera notificação nenhuma, e todas
    passam por `enviar_pendentes` no fim. Ele tem de sair de graça."""
    sessao = SessaoFalsa()
    assert await push.enviar_pendentes(sessao) == 0
    assert sessao.sqls == []


# ------------------------------------------------------------------ garantias


def test_push_sai_depois_do_commit():
    """Notificação é parte da transação do evento; push não é. Se o envio
    entrasse antes do commit, a rede do FCM poderia derrubar uma proposta."""
    fonte = inspect.getsource(push.agendar)
    assert "webpush" not in fonte

    from app.db import session as modulo_sessao

    assert "enviar_pendentes" in inspect.getsource(modulo_sessao.get_session)


def test_transacao_desfeita_esvazia_a_fila():
    """Uma proposta que bate no índice de "uma por dupla" faz rollback e devolve
    409 — e não pode avisar ninguém de uma proposta que não existe."""
    fonte = inspect.getsource(push._limpar_no_rollback)
    assert "after_rollback" in fonte
    assert "pop" in fonte


def test_inscricao_morta_e_apagada():
    """404 e 410 querem dizer "esse navegador não existe mais". Guardar isso
    faria toda notificação futura gastar rede para tomar o mesmo erro."""
    fonte = inspect.getsource(push._um)
    assert "404" in fonte and "410" in fonte
    assert "mortas.append" in fonte


def test_remocao_leva_o_dono_no_where():
    """Sem o `user_id`, um endpoint chutado desligaria o aviso de outra pessoa."""
    fonte = inspect.getsource(push.remover)
    assert "user_id = cast(:u as uuid)" in fonte


def test_inscricao_e_idempotente():
    """O serviço de push troca o endpoint sozinho, e o cliente reenvia a cada
    abertura: sem o upsert isso viraria uma linha nova por reenvio."""
    assert "on conflict (endpoint) do update" in inspect.getsource(push.registrar)


# -------------------------------------------------------------------- rotas


def test_rotas_publicadas():
    caminhos = app.openapi()["paths"]
    assert "/v1/me/push-subscription" in caminhos
    metodos = caminhos["/v1/me/push-subscription"]
    assert "post" in metodos and "delete" in metodos


def test_inscricao_exige_login():
    cliente = TestClient(app)
    corpo = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abcdefghijklmnop",
        "keys": {"p256dh": "chave", "auth": "auth"},
    }
    assert cliente.post("/v1/me/push-subscription", json=corpo).status_code == 401
    assert (
        cliente.request("DELETE", "/v1/me/push-subscription", json=corpo).status_code
        == 401
    )
