"""Testes do healthcheck e da raiz.

Não dependem de um Postgres real: a dependência de sessão é substituída por um
duplo que simula sucesso ou falha do `select 1`.
"""

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_session
from app.main import app


class _FakeSessionOk:
    async def execute(self, *_args, **_kwargs) -> None:
        return None


class _FakeSessionErro:
    async def execute(self, *_args, **_kwargs) -> None:
        raise RuntimeError("banco indisponível")


def _override(fake) -> None:
    async def _dep():
        yield fake()

    app.dependency_overrides[get_session] = _dep


@pytest.fixture(autouse=True)
def _limpa_overrides():
    yield
    app.dependency_overrides.clear()


def test_raiz_responde():
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["nome"] == "TrocaTCG API"


def test_health_ok_quando_banco_responde():
    _override(_FakeSessionOk)
    client = TestClient(app)
    resp = client.get("/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok"}


def test_health_degradado_quando_banco_falha():
    _override(_FakeSessionErro)
    client = TestClient(app)
    resp = client.get("/v1/health")
    assert resp.status_code == 503
    assert resp.json()["db"] == "error"
