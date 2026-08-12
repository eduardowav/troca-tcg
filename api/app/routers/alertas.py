"""Alerta de carta — o interruptor de "avise quando aparecer" (/me/alerts).

Recurso do PRO. O portão mora no serviço, não aqui: é regra de negócio e precisa
valer para qualquer caminho que um dia chegue a ele — não só para esta rota.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.services import alertas

router = APIRouter(prefix="/me/alerts", tags=["alertas"])


class AlertaIn(BaseModel):
    card_id: UUID
    #: Nulo é "qualquer acabamento", e é o caso comum de quem pediu no vazio da
    #: busca — ali a pessoa quer a carta, não uma versão dela.
    finish_id: int | None = None


class AlertaOut(BaseModel):
    card_id: str
    finish_id: int | None
    criado_em: datetime


@router.get("", response_model=list[AlertaOut])
async def listar(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[AlertaOut]:
    return [AlertaOut(**linha) for linha in await alertas.listar(session, user_id)]


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def criar(
    corpo: AlertaIn,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Passa a vigiar a carta. Idempotente — a tela é um interruptor."""
    await alertas.criar(session, user_id, corpo.card_id, corpo.finish_id)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover(
    card_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Para de vigiar. Sem 404 quando não havia alerta: o fim é o mesmo."""
    await alertas.remover(session, user_id, card_id)
