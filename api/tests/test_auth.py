"""Validação do JWT do Supabase — os dois formatos de assinatura."""

import time
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from app.core import auth
from app.core.config import settings

SEGREDO = "segredo-de-teste-nao-usado-em-lugar-nenhum"


def _cred(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _token(payload: dict, *, alg: str = "HS256", chave: str = SEGREDO) -> str:
    base = {"aud": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode({**base, **payload}, chave, algorithm=alg)


@pytest.fixture(autouse=True)
def _segredo(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SEGREDO)


async def test_aceita_token_hs256_legado():
    user_id = uuid4()
    resultado = await auth.usuario_atual(_cred(_token({"sub": str(user_id)})))
    assert resultado == user_id
    assert isinstance(resultado, UUID)


async def test_recusa_assinatura_de_outro_segredo():
    token = _token({"sub": str(uuid4())}, chave="segredo-errado")
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_token_expirado():
    token = _token({"sub": str(uuid4()), "exp": int(time.time()) - 60})
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_audience_errada():
    token = _token({"sub": str(uuid4()), "aud": "outra-coisa"})
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_token_sem_sub():
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(_token({})))
    assert e.value.status_code == 401


async def test_recusa_alg_none():
    """alg=none é a tentativa clássica de burlar a verificação."""
    token = jwt.encode(
        {"sub": str(uuid4()), "aud": "authenticated"}, "", algorithm="HS256"
    )
    _, resto = token.split(".", 1)
    # Header forjado {"alg":"none","typ":"JWT"} em base64url, sem padding.
    forjado = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(f"{forjado}.{resto}"))
    assert e.value.status_code == 401


async def test_token_assimetrico_usa_o_jwks_e_nao_o_segredo(
    monkeypatch: pytest.MonkeyPatch,
):
    """ES256 nunca pode cair no caminho HMAC — é o ataque de confusão de algoritmo."""
    chamou = {}

    async def _falso(kid):
        chamou["kid"] = kid
        raise auth._nao_autorizado("Sessão inválida. Entre novamente.")

    monkeypatch.setattr(auth, "_chave_publica", _falso)

    # Token com header ES256 mas assinado em HMAC com o segredo do servidor.
    token = jwt.encode(
        {"sub": str(uuid4()), "aud": "authenticated"},
        SEGREDO,
        algorithm="HS256",
        headers={"kid": "chave-qualquer"},
    )
    cabecalho = "eyJhbGciOiJFUzI1NiIsImtpZCI6ImNoYXZlLXF1YWxxdWVyIiwidHlwIjoiSldUIn0"
    _, resto = token.split(".", 1)

    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(_cred(f"{cabecalho}.{resto}"))
    assert e.value.status_code == 401
    assert chamou["kid"] == "chave-qualquer"
