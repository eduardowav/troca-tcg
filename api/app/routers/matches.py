"""Rotas do feed de matches (/me/matches)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.match import (
    CartaDoParceiro,
    MatchCompleto,
    MatchNoHistorico,
    MatchOut,
)
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


# ⚠️ Esta rota tem de vir ANTES de `/{match_id}`: o FastAPI resolve na ordem de
# declaração, e `/{match_id}` casaria com "historico" primeiro, tentaria ler
# "historico" como UUID e devolveria 422. Coberto por teste — mover para baixo
# quebra a tela de perfil.
@router.get("/historico", response_model=list[MatchNoHistorico])
async def historico(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[MatchNoHistorico]:
    # Sem `sincronizar_matches` aqui, ao contrário do feed: histórico é o que já
    # terminou, e recalcular sugestões não muda uma linha desta lista.
    return await matching.listar_historico(session, user_id)


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


@router.get("/{match_id}/mais-cartas", response_model=list[CartaDoParceiro])
async def mais_cartas(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[CartaDoParceiro]:
    """O resto do acervo de quem cruzou com você — ver services/matching."""
    return await matching.mais_cartas_do_parceiro(session, user_id, match_id)


@router.post("/{match_id}/concluir", response_model=MatchCompleto)
async def concluir(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.confirmar_conclusao(session, user_id, match_id)


@router.post("/{match_id}/furou", response_model=MatchCompleto)
async def furou(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.registrar_furo(session, user_id, match_id)


@router.post("/{match_id}/desistir", response_model=MatchCompleto)
async def desistir(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    """Encerra a troca sem acusar ninguém. Ver services/matching."""
    return await matching.registrar_desistencia(session, user_id, match_id)


@router.post("/{match_id}/estender", response_model=MatchCompleto)
async def estender(
    match_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    """Mais uma semana de prazo. Qualquer um dos dois, até duas vezes."""
    return await matching.prorrogar(session, user_id, match_id)


@router.post("/{match_id}/responder", response_model=MatchCompleto)
async def responder(
    match_id: UUID,
    corpo: Resposta,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.responder(session, user_id, match_id, corpo.aceitou)
