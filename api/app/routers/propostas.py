"""Rotas da negociação (/me/propostas).

As quatro ações são POST porque nenhuma delas é idempotente do ponto de vista do
produto: cada uma consome a vez de quem clicou. O aceite devolve a proposta já
com `match_id` preenchido — é por ele que a tela salta para a troca, que a
partir desse instante responde às rotas de /me/matches como qualquer outra.

Escrita de proposta **não** dispara `sincronizar_matches`: a negociação não muda
anúncio nenhum, e o match que o aceite cria nasce ACEITO, fora do alcance do
motor (que só mexe no que ainda é sugestão).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.proposta import (
    ContrapropostaCriar,
    PropostaCriar,
    PropostaOut,
    PropostaResumo,
)
from app.services import propostas

router = APIRouter(prefix="/me/propostas", tags=["propostas"])


@router.get("", response_model=list[PropostaResumo])
async def listar(
    caixa: str = Query(
        default="minha_vez",
        pattern="^(recebidas|enviadas|minha_vez|historico)$",
    ),
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[PropostaResumo]:
    """As caixas da aba. `minha_vez` é a que alimenta a badge."""
    return await propostas.listar(session, user_id, caixa)


@router.post("", response_model=PropostaOut, status_code=status.HTTP_201_CREATED)
async def abrir(
    dados: PropostaCriar,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    """Abre a negociação a partir da vitrine."""
    return await propostas.abrir(session, user_id, dados)


@router.get("/{proposta_id}", response_model=PropostaOut)
async def detalhar(
    proposta_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    """Todas as rodadas, em ordem — a conversa inteira."""
    return await propostas.obter(session, user_id, proposta_id)


@router.post("/{proposta_id}/aceitar", response_model=PropostaOut)
async def aceitar(
    proposta_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    """Fecha o acordo da rodada corrente e devolve a proposta com `match_id`."""
    return await propostas.aceitar(session, user_id, proposta_id)


@router.post("/{proposta_id}/recusar", response_model=PropostaOut)
async def recusar(
    proposta_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    return await propostas.recusar(session, user_id, proposta_id)


@router.post("/{proposta_id}/contrapropor", response_model=PropostaOut)
async def contrapropor(
    proposta_id: UUID,
    dados: ContrapropostaCriar,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    """Nova rodada. Mesmo corpo do POST, sem `para` — a dupla já está definida."""
    return await propostas.contrapropor(session, user_id, proposta_id, dados)


@router.post("/{proposta_id}/retirar", response_model=PropostaOut)
async def retirar(
    proposta_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> PropostaOut:
    """Desiste da própria jogada, antes de o outro responder — ver o serviço."""
    return await propostas.retirar(session, user_id, proposta_id)
