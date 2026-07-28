"""Autenticação: valida o JWT emitido pelo Supabase Auth e extrai o user id.

O Supabase está migrando do segredo compartilhado (HS256) para chaves de assinatura
assimétricas (ES256/RS256) publicadas num JWKS, e os dois formatos convivem durante a
rotação. Quem decide o caminho é o `alg` do header do token — nunca reaproveitamos o
material do JWKS como segredo HMAC, que é justamente o buraco do ataque de confusão
de algoritmo.
"""

import asyncio
import time
from typing import Any
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

security = HTTPBearer()

ALGORITMOS_ASSIMETRICOS = frozenset({"ES256", "RS256", "EdDSA"})
JWKS_TTL_SEGUNDOS = 600

_jwks: dict[str, Any] = {}
_jwks_expira_em = 0.0
_jwks_lock = asyncio.Lock()


def _nao_autorizado(mensagem: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=mensagem)


async def _carregar_jwks(forcar: bool = False) -> dict[str, Any]:
    """Chaves públicas do projeto, indexadas por kid, com cache de 10 min."""
    global _jwks, _jwks_expira_em

    async with _jwks_lock:
        if not forcar and _jwks and time.monotonic() < _jwks_expira_em:
            return _jwks

        if not settings.SUPABASE_URL:
            raise _nao_autorizado("Servidor sem SUPABASE_URL para validar a sessão.")

        url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient(timeout=5) as cliente:
                resposta = await cliente.get(url)
                resposta.raise_for_status()
                dados = resposta.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Um JWKS velho em cache vale mais que derrubar todo mundo por rede.
            if _jwks:
                return _jwks
            raise _nao_autorizado("Não foi possível validar a sessão agora.") from exc

        _jwks = {c["kid"]: c for c in dados.get("keys", []) if c.get("kid")}
        _jwks_expira_em = time.monotonic() + JWKS_TTL_SEGUNDOS
        return _jwks


async def _chave_publica(kid: str | None) -> dict[str, Any]:
    if not kid:
        raise _nao_autorizado("Sessão inválida. Entre novamente.")

    chave = (await _carregar_jwks()).get(kid)
    if chave is None:
        # kid desconhecido costuma ser rotação de chave: recarrega uma vez.
        chave = (await _carregar_jwks(forcar=True)).get(kid)
    if chave is None:
        raise _nao_autorizado("Sessão inválida. Entre novamente.")
    return chave


async def usuario_atual(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> UUID:
    token = cred.credentials

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise _nao_autorizado("Sessão inválida. Entre novamente.") from exc

    algoritmo = header.get("alg")
    chave: Any
    if algoritmo in ALGORITMOS_ASSIMETRICOS:
        chave = await _chave_publica(header.get("kid"))
    elif algoritmo == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise _nao_autorizado("Servidor sem SUPABASE_JWT_SECRET configurado.")
        chave = settings.SUPABASE_JWT_SECRET
    else:
        raise _nao_autorizado("Sessão inválida. Entre novamente.")

    try:
        payload = jwt.decode(
            token,
            chave,
            algorithms=[algoritmo],
            audience="authenticated",
        )
    except JWTError as exc:
        raise _nao_autorizado("Sessão inválida. Entre novamente.") from exc

    sub = payload.get("sub")
    if not sub:
        raise _nao_autorizado("Token sem identificação.")

    try:
        return UUID(sub)
    except (ValueError, AttributeError, TypeError) as exc:
        raise _nao_autorizado("Token com identificação inválida.") from exc
