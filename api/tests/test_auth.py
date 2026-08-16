"""Validação do JWT do Supabase, e a trava de conta bloqueada.

A validação do token mora em `usuario_da_sessao`; `usuario_atual` é ela mais a
consulta de bloqueio, e é essa que as rotas usam. A separação existe para que as
duas rotas que precisam funcionar para quem foi bloqueado — ver o próprio perfil
e apagar a conta — possam pedir só a primeira."""

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
    resultado = await auth.usuario_da_sessao(_cred(_token({"sub": str(user_id)})))
    assert resultado == user_id
    assert isinstance(resultado, UUID)


async def test_recusa_assinatura_de_outro_segredo():
    token = _token({"sub": str(uuid4())}, chave="segredo-errado")
    with pytest.raises(HTTPException) as e:
        await auth.usuario_da_sessao(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_token_expirado():
    token = _token({"sub": str(uuid4()), "exp": int(time.time()) - 60})
    with pytest.raises(HTTPException) as e:
        await auth.usuario_da_sessao(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_audience_errada():
    token = _token({"sub": str(uuid4()), "aud": "outra-coisa"})
    with pytest.raises(HTTPException) as e:
        await auth.usuario_da_sessao(_cred(token))
    assert e.value.status_code == 401


async def test_recusa_token_sem_sub():
    with pytest.raises(HTTPException) as e:
        await auth.usuario_da_sessao(_cred(_token({})))
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
        await auth.usuario_da_sessao(_cred(f"{forjado}.{resto}"))
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
        await auth.usuario_da_sessao(_cred(f"{cabecalho}.{resto}"))
    assert e.value.status_code == 401
    assert chamou["kid"] == "chave-qualquer"


# ------------------------------------------------- a trava de conta bloqueada


class _SessaoComBloqueio:
    """Devolve o que a consulta de bloqueio pediria. `None` = conta sem perfil."""

    def __init__(self, bloqueado: bool | None):
        self.bloqueado = bloqueado
        self.sqls: list[str] = []

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        return self.bloqueado


async def test_conta_bloqueada_nao_passa():
    """O item 2 do bloco de segurança: até 2026-08-16, `bloqueado` só filtrava
    listagem. Quem foi bloqueado sumia da vitrine e continuava criando anúncio,
    abrindo proposta e aceitando match — invisível, não impedido."""
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(uuid4(), _SessaoComBloqueio(True))  # type: ignore[arg-type]

    assert e.value.status_code == 403
    assert "bloqueada" in e.value.detail


async def test_o_bloqueio_devolve_403_e_nao_401():
    """401 mandaria o app derrubar a sessão e pedir login de novo — e o login
    funcionaria, criando um laço de entrar e ser deslogado sem ler o motivo. A
    sessão é válida; o que não vale é o que a pessoa quer fazer."""
    with pytest.raises(HTTPException) as e:
        await auth.usuario_atual(uuid4(), _SessaoComBloqueio(True))  # type: ignore[arg-type]
    assert e.value.status_code != 401


async def test_conta_normal_passa():
    eu = uuid4()
    assert await auth.usuario_atual(eu, _SessaoComBloqueio(False)) == eu  # type: ignore[arg-type]


async def test_conta_sem_perfil_passa():
    """Quem criou a conta e ainda não completou o cadastro não tem linha em
    `profiles`. Barrar aí trancaria justamente a tela de completar cadastro."""
    eu = uuid4()
    assert await auth.usuario_atual(eu, _SessaoComBloqueio(None)) == eu  # type: ignore[arg-type]


def _dependencias_de_auth(rota) -> set[str]:
    """Os nomes das dependências de autenticação de uma rota.

    Lê `dependant`, que o FastAPI monta na própria rota do router — e não
    `app.routes`, que a partir da 0.140 guarda as inclusões aninhadas num
    `_IncludedRouter` sem expor as rotas de dentro. Foi essa mesma mudança que
    fez o rate limit do slowapi liberar tudo calado; aqui ela só faria o teste
    passar vazio, que é pior, porque um teste vazio parece verde.
    """
    return {
        d.call.__name__
        for d in rota.dependant.dependencies
        if d.call.__name__.startswith("usuario_")
    }


def _rotas_autenticadas():
    """Toda rota do app que exige sessão, lida dos routers de origem."""
    from app.routers import (
        alertas,
        assinaturas,
        listings,
        matches,
        notificacoes,
        planos,
        propostas,
        users,
        verificacao,
        vitrine,
    )

    for modulo in (
        alertas,
        assinaturas,
        listings,
        matches,
        notificacoes,
        planos,
        propostas,
        users,
        verificacao,
        vitrine,
    ):
        for atributo in vars(modulo).values():
            if not hasattr(atributo, "routes"):
                continue
            for rota in atributo.routes:
                if not hasattr(rota, "dependant"):
                    continue
                auth_deps = _dependencias_de_auth(rota)
                if auth_deps:
                    for metodo in getattr(rota, "methods", set()):
                        yield f"{metodo} {rota.path}", auth_deps


def test_existe_rota_autenticada_para_inspecionar():
    """Guarda contra o teste abaixo passar por não ter encontrado nada.

    Sem isto, uma mudança na forma de montar rotas faria a varredura devolver
    vazio e o teste seguinte ficaria verde afirmando o contrário do que quer.
    """
    assert len(list(_rotas_autenticadas())) > 20


def test_so_ver_o_perfil_e_apagar_a_conta_escapam_da_trava():
    """O desenho do item 2, verificado de fora.

    A trava vale por padrão e só as exceções se declaram, então uma rota nova
    nasce fechada. É o oposto de marcar rota por rota, onde esquecer uma abre um
    buraco silencioso — e são mais de vinte rotas que escrevem.

    Ver o perfil: quem foi bloqueado precisa poder descobrir isso, senão cria uma
    segunda conta. Apagar: é direito da LGPD, não recompensa por bom
    comportamento.
    """
    sem_trava = {
        nome for nome, deps in _rotas_autenticadas() if "usuario_da_sessao" in deps
    }
    assert sem_trava == {"GET /me", "DELETE /me"}
