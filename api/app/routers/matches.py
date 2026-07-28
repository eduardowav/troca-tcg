"""Rotas do feed de matches (/me/matches)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.match import MatchCompleto, MatchOut
from app.services import matching

router = APIRouter(prefix="/me/matches", tags=["matches"])


class Resposta(BaseModel):
    aceitou: bool


@router.get("", response_model=list[MatchOut])
async def listar(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[MatchOut]:
    # Matching roda sob demanda: abrir o feed já traz o que surgiu desde a
    # última visita, sem depender de job agendado.
    await matching.sincronizar_matches(session, user_id)
    return await matching.listar_matches(session, user_id)


# Detalhe e resposta usam MatchCompleto porque é neles que o contato pode
# aparecer. O `response_model` do FastAPI *filtra* a saída pelo schema
# declarado: com MatchOut aqui, o contato seria descartado mesmo depois do
# aceite mútuo e a revelação nunca aconteceria. Quem decide preencher continua
# sendo o serviço (só com o match ACEITO) — o schema apenas deixa passar.
# O feed segue em MatchOut, onde contato não tem o que fazer.
@router.get("/{match_id}", response_model=MatchCompleto)
async def detalhar(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.obter_match(session, user_id, match_id)


@router.post("/{match_id}/responder", response_model=MatchCompleto)
async def responder(
    match_id: UUID,
    corpo: Resposta,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.responder(session, user_id, match_id, corpo.aceitou)
