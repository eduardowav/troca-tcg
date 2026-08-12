"""Verificação do número de WhatsApp — rotas construídas e desligadas.

O app não chama nada disto: o cadastro segue sem pedágio e não há tela de
código. Enquanto `VERIFICACAO_TELEFONE_ATIVA` for falso, as duas rotas de
escrita respondem 503 com código próprio — desligado por configuração, como o
push sem chave VAPID e como os limites de plano antes da cobrança.

O interruptor fica **no roteador**, e não no serviço, de propósito: a regra
inteira (gerar, guardar, conferir, limitar) continua exercitável pelos testes
com o recurso desligado, que é o que garante que o dia de ligar seja uma linha
de ambiente e não uma redescoberta.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.core.config import settings
from app.core.errors import RegraNegocio
from app.db.session import get_session
from app.schemas.verificacao import (
    CodigoConferido,
    CodigoEnviado,
    CodigoPedido,
    SituacaoVerificacao,
)
from app.services import verificacao_telefone

router = APIRouter(prefix="/me/telefone", tags=["verificação"])


def _exigir_ligado() -> None:
    if not settings.VERIFICACAO_TELEFONE_ATIVA:
        raise RegraNegocio(
            "VERIFICACAO_DESLIGADA",
            "A verificação de número ainda não está disponível.",
            status_code=503,
        )


@router.get("", response_model=SituacaoVerificacao)
async def situacao(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> SituacaoVerificacao:
    """Responde sem 503: saber que não há verificação é resposta legítima."""
    return SituacaoVerificacao(
        **await verificacao_telefone.situacao(session, user_id)  # type: ignore[arg-type]
    )


@router.post("/codigo", response_model=CodigoEnviado)
async def pedir_codigo(
    corpo: CodigoPedido,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> CodigoEnviado:
    _exigir_ligado()
    return CodigoEnviado(
        **await verificacao_telefone.solicitar(session, user_id, corpo.telefone)  # type: ignore[arg-type]
    )


@router.post("/confirmar", response_model=SituacaoVerificacao)
async def confirmar_codigo(
    corpo: CodigoConferido,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> SituacaoVerificacao:
    _exigir_ligado()
    await verificacao_telefone.confirmar(session, user_id, corpo.codigo)
    return SituacaoVerificacao(
        **await verificacao_telefone.situacao(session, user_id)  # type: ignore[arg-type]
    )
