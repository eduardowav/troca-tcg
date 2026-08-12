"""Rotas da caixa de notificações (/me/notifications) e da inscrição de push.

Nenhuma rota **cria** notificação: quem cria é o evento, lá nos serviços. Daqui
só se lê, se marca como lida, e se liga ou desliga o aviso no celular.

A contagem tem rota própria, separada da lista, porque são duas perguntas com
frequências muito diferentes: a badge pergunta em toda troca de tela e só quer
um número; a caixa pergunta quando alguém a abre e quer cinquenta linhas.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.notificacao import (
    ContagemNaoLidas,
    InscricaoPush,
    MarcarLidas,
    NotificacaoOut,
)
from app.services import notificacoes, push

router = APIRouter(prefix="/me/notifications", tags=["notificações"])

#: Router separado porque o caminho é outro (`/me/push-subscription`, como a
#: seção 10 da doc previa) — e porque é outro assunto: aquilo é a caixa, isto é
#: o aparelho.
router_push = APIRouter(prefix="/me/push-subscription", tags=["notificações"])


@router.get("", response_model=list[NotificacaoOut])
async def listar(
    nao_lidas: bool = Query(default=False),
    limite: int = Query(default=notificacoes.LIMITE_PADRAO, ge=1, le=100),
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[NotificacaoOut]:
    linhas = await notificacoes.listar(
        session, user_id, apenas_nao_lidas=nao_lidas, limite=limite
    )
    return [NotificacaoOut(**linha) for linha in linhas]


# Declarada antes de qualquer rota com parâmetro neste prefixo, pela mesma razão
# de `/me/matches/historico`: o FastAPI resolve na ordem, e um `/{id}` que
# aparecesse depois engoliria "nao-lidas".
@router.get("/nao-lidas", response_model=ContagemNaoLidas)
async def contar(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> ContagemNaoLidas:
    """Só o número da badge."""
    return ContagemNaoLidas(
        nao_lidas=await notificacoes.contar_nao_lidas(session, user_id)
    )


@router.post("/read", response_model=ContagemNaoLidas)
async def marcar_lidas(
    corpo: MarcarLidas | None = None,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> ContagemNaoLidas:
    """Marca as informadas — ou todas, se vier vazio.

    Devolve a contagem que sobrou, e não quantas foram marcadas: é o número que
    a badge precisa a seguir, e evita a segunda chamada que o cliente faria de
    qualquer jeito.
    """
    await notificacoes.marcar_lidas(session, user_id, corpo.ids if corpo else None)
    return ContagemNaoLidas(
        nao_lidas=await notificacoes.contar_nao_lidas(session, user_id)
    )


@router_push.post("", status_code=status.HTTP_204_NO_CONTENT)
async def inscrever(
    corpo: InscricaoPush,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Liga o aviso no sistema para **este** navegador.

    Idempotente de propósito: o navegador pode renovar a inscrição sozinho
    (o serviço de push troca o endpoint de tempos em tempos), e o cliente
    reenvia a cada abertura sem precisar saber se já mandou antes.
    """
    await push.registrar(
        session,
        user_id,
        endpoint=corpo.endpoint,
        p256dh=corpo.keys.p256dh,
        auth=corpo.keys.auth,
    )


@router_push.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def desinscrever(
    corpo: InscricaoPush,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Desliga o aviso deste navegador. Os outros aparelhos continuam."""
    await push.remover(session, user_id, corpo.endpoint)
