"""Assinatura do PRO (/me/assinatura) — construída e desligada.

O interruptor é `COBRANCA_ATIVA`, e ele mora **no roteador**, como o da
verificação de número: a regra inteira continua exercitável pelos testes com a
cobrança desligada, e o dia de ligar é uma linha em `core/limites.py`.

Enquanto estiver desligada, `plano_vigente()` devolve PRO para todo mundo — e
vender assinatura nesse estado seria cobrar pelo que já está na mão. Por isso as
rotas respondem 503 com código próprio, e a tela de planos segue sem botão.

A situação do plano (GET) responde sempre: saber que não há assinatura é resposta
legítima, e é dela que Configurações tira o rótulo do plano.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.core.errors import RegraNegocio
from app.core.limites import COBRANCA_ATIVA
from app.db.session import get_session
from app.services import assinaturas, mercado_pago

router = APIRouter(prefix="/me/assinatura", tags=["assinatura"])


def _exigir_ligada() -> None:
    if not COBRANCA_ATIVA:
        raise RegraNegocio(
            "COBRANCA_DESLIGADA",
            "A assinatura ainda não está disponível — todo mundo está com os "
            "recursos liberados.",
            status_code=503,
        )
    if not mercado_pago.ativo():
        raise RegraNegocio(
            "ASSINATURA_INDISPONIVEL",
            "A assinatura está temporariamente indisponível.",
            status_code=503,
        )


class AssinaturaIn(BaseModel):
    #: `mensal` ou `anual`. O preço de cada um mora no Mercado Pago.
    periodo: str


class AssinaturaCriada(BaseModel):
    #: Para onde redirecionar. O checkout é lá, e é por isso que nenhum dado de
    #: cartão passa pelo TrocaTCG.
    init_point: str
    preapproval_id: str


class SituacaoDoPlano(BaseModel):
    plano: str
    #: Fim da carência, quando a assinatura falhou. Nulo é o normal.
    plano_expira_em: datetime | None = None
    #: Status do lado do Mercado Pago, ou nulo para quem nunca assinou.
    status: str | None = None
    periodo: str | None = None
    proxima_cobranca_em: datetime | None = None


@router.get("", response_model=SituacaoDoPlano)
async def situacao(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> SituacaoDoPlano:
    return SituacaoDoPlano(**await assinaturas.situacao(session, user_id))


@router.post("", response_model=AssinaturaCriada, status_code=status.HTTP_201_CREATED)
async def assinar(
    corpo: AssinaturaIn,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> AssinaturaCriada:
    """Cria a assinatura e devolve o checkout. Ninguém vira PRO aqui.

    Quem promove é o webhook, depois de o pagamento existir. A pessoa que fecha a
    aba no meio do caminho fica com uma assinatura `pending` e o plano de antes.
    """
    _exigir_ligada()
    return AssinaturaCriada(
        **await assinaturas.iniciar(session, user_id, corpo.periodo)
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def cancelar(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Cancela a renovação. O PRO fica até o fim da carência de 7 dias."""
    _exigir_ligada()
    await assinaturas.cancelar(session, user_id)
