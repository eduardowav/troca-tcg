"""Rotas de perfil próprio (/me)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.core.errors import RegraNegocio
from app.db.session import get_session
from app.schemas.profile import PerfilAtualizar, PerfilCriar, PerfilOut
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
