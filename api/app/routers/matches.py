"""Rotas do feed de matches (/me/matches)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
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
from app.schemas.report import DenunciaCriar, DenunciaOut
from app.services import matching, reports, termos

router = APIRouter(prefix="/me/matches", tags=["matches"])


def _ip(request: Request) -> str | None:
    """O IP de quem aceitou, para o registro ter valor probatório.

    Mesma leitura de `routers/users.py`: atrás do proxy do Render, o endereço
    real está no `x-forwarded-for`, e `request.client.host` seria sempre o do
    balanceador.
    """
    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.client.host if request.client else None


class Resposta(BaseModel):
    aceitou: bool


@router.get("", response_model=list[MatchOut])
async def listar(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[MatchOut]:
    # Sem `sincronizar_matches` aqui: quem recalcula é a escrita do anúncio, em
    # /me/listings. Ler o feed não muda match nenhum — se ninguém mexeu numa
    # lista, o resultado seria o mesmo — e ressincronizar a cada abertura fazia
    # da tela mais visitada do app a operação mais cara dele.
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


@router.post("/{match_id}/contato", response_model=MatchCompleto)
async def revelar_contato(
    match_id: UUID,
    request: Request,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    """Registra o aceite da isenção e devolve o match já com o contato.

    É a única porta pela qual `contato_visivel` sai daqui. O `GET` do detalhe
    omite o campo enquanto não houver aceite para este match — ver
    `services/termos.py` para por que a trava é do servidor e não do modal.

    Devolve o match inteiro, e não só o contato, porque é isso que a tela tem em
    mãos: um POST que respondesse `{"contato": "..."}` obrigaria o frontend a
    costurar a resposta dentro do objeto que já tem, e essa costura é onde o
    estado das duas telas começa a divergir.

    Não confere o status do match: quem pede a revelação de um match que ainda
    não foi aceito grava o aceite e recebe o match **sem** contato, porque quem
    decide isso continua sendo `obter_match`. Recusar aqui seria uma segunda
    regra dizendo a mesma coisa, e duas regras iguais divergem com o tempo.
    """
    await termos.registrar_revelacao(session, user_id, match_id, _ip(request))
    await session.commit()
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


@router.post(
    "/{match_id}/denunciar",
    response_model=DenunciaOut,
    status_code=status.HTTP_201_CREATED,
)
async def denunciar(
    match_id: UUID,
    dados: DenunciaCriar,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> DenunciaOut:
    """Relata a outra pessoa desta troca. Não muda a reputação dela — ver
    services/reports."""
    return await reports.denunciar(session, user_id, match_id, dados)


@router.post("/{match_id}/responder", response_model=MatchCompleto)
async def responder(
    match_id: UUID,
    corpo: Resposta,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> MatchOut:
    return await matching.responder(session, user_id, match_id, corpo.aceitou)
