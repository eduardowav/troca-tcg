"""Autenticação: valida o JWT emitido pelo Supabase Auth e extrai o user id.

O Supabase está migrando do segredo compartilhado (HS256) para chaves de assinatura
assimétricas (ES256/RS256) publicadas num JWKS, e os dois formatos convivem durante a
rotação. Quem decide o caminho é o `alg` do header do token — nunca reaproveitamos o
material do JWKS como segredo HMAC, que é justamente o buraco do ataque de confusão
de algoritmo.

**Aqui também mora a trava de conta bloqueada** (item 2 do bloco de segurança da
seção 17). Até 2026-08-16, `bloqueado` só filtrava listagem: quem foi bloqueado
sumia da vitrine, do matcher e do perfil público, e continuava criando anúncio,
abrindo proposta, aceitando match e denunciando. Ficava invisível, não impedido —
e invisível é pior, porque o outro lado da troca não vê com quem está lidando.

A trava ficou em `usuario_atual`, e não numa dependência aplicada às rotas de
escrita, por causa de como as duas falham. São mais de vinte rotas que escrevem;
esquecer de marcar uma delas abre um buraco silencioso, e o buraco é justamente
o que este item existe para fechar. Invertendo — todo mundo é barrado, e as
exceções se declaram — esquecer passa a ser seguro: uma rota nova nasce fechada.

Custa uma consulta por requisição autenticada, indexada pela chave primária. É
ruído perto do resto: o feed sozinho faz umas trinta.
"""

import asyncio
import time
from typing import Any
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session

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


async def usuario_da_sessao(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> UUID:
    """Só valida o token e devolve quem é. **Não confere bloqueio.**

    Use `usuario_atual` em tudo. Esta existe para as duas rotas que precisam
    continuar funcionando para quem foi bloqueado, e cada uma tem um motivo que
    não é conveniência:

    - **`GET /me`** — quem foi bloqueado precisa poder descobrir isso. Um app que
      simplesmente para de funcionar sem dizer por quê empurra a pessoa para
      criar uma segunda conta, que é o oposto do que o bloqueio quer.
    - **`DELETE /me`** — apagar a própria conta é direito da LGPD, e não é o tipo
      de coisa que se condiciona a bom comportamento.
    """
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


async def usuario_atual(
    user_id: UUID = Depends(usuario_da_sessao),
    session: AsyncSession = Depends(get_session),
) -> UUID:
    """Quem está pedindo — e que não está bloqueado.

    **403, e não 401.** A sessão é válida e a pessoa é quem diz ser; o que não
    vale é o que ela quer fazer. Um 401 mandaria o app derrubar a sessão e pedir
    login de novo, e o login funcionaria — daí a pessoa entraria num laço de
    entrar e ser deslogada, sem nunca ler o motivo.

    **Conta sem perfil passa.** Quem criou a conta e ainda não completou o
    cadastro não tem linha em `profiles`, e barrar aí trancaria justamente a
    tela de completar cadastro. Só bloqueio explícito barra.
    """
    bloqueado = await session.scalar(
        text("select bloqueado from profiles where id = cast(:id as uuid)"),
        {"id": str(user_id)},
    )
    if bloqueado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Esta conta está bloqueada por descumprir os termos de uso. "
                "Você ainda pode ver seu perfil e apagar sua conta."
            ),
        )
    return user_id
