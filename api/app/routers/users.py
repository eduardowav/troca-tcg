"""Rotas de perfil: o próprio (/me) e o de terceiros (/u/{username})."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.core.errors import RegraNegocio
from app.db.session import get_session
from app.schemas.profile import (
    PerfilAtualizar,
    PerfilCriar,
    PerfilOut,
    PerfilPublicoOut,
)
from app.services import profiles

router = APIRouter(tags=["perfil"])


def _ip(request: Request) -> str | None:
    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("/me", response_model=PerfilOut)
async def meu_perfil(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PerfilOut:
    perfil = await profiles.obter_perfil(session, user_id)
    if perfil is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO",
            "Perfil ainda não criado.",
            status_code=404,
        )
    return perfil


@router.post("/me", response_model=PerfilOut, status_code=status.HTTP_201_CREATED)
async def criar_meu_perfil(
    dados: PerfilCriar,
    request: Request,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PerfilOut:
    return await profiles.criar_perfil(session, user_id, dados, _ip(request))


@router.patch("/me", response_model=PerfilOut)
async def atualizar_meu_perfil(
    dados: PerfilAtualizar,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PerfilOut:
    return await profiles.atualizar_perfil(session, user_id, dados)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_minha_conta(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Direito do titular (LGPD art. 18) — sem passar por e-mail nem por nós."""
    await profiles.excluir_conta(session, user_id)


@router.get("/u/{username}", response_model=PerfilPublicoOut, tags=["perfil público"])
async def perfil_de_alguem(
    username: str,
    _: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PerfilPublicoOut:
    """O perfil de outra pessoa — quem você vai encontrar.

    Exige login mesmo o perfil sendo público no banco (policy "perfis publicos",
    09_rls.sql). A policy responde "isto pode ser lido"; a rota responde "por
    quem", e são perguntas diferentes: aberta, ela entregaria a base de usuários
    inteira a um raspador que só precisa iterar @s. Quem está logado deixa
    rastro, e o custo para quem tem conta é zero.

    O `_` no lugar do id é de propósito: a autenticação aqui é porteiro, não
    filtro. O que se vê não muda conforme quem olha.
    """
    perfil = await profiles.perfil_publico(session, username)
    if perfil is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO",
            "Não encontramos ninguém com esse @.",
            status_code=404,
        )
    return perfil
