"""Receptor de notificações do Mercado Pago.

Pública e sem sessão — quem chama é o servidor deles, que não tem conta aqui. É a
única rota do app nessa condição além do health e da tabela de preço, e por isso
ela carrega as três regras que a tornam segura:

1. **Valida a assinatura antes de tudo.** HMAC-SHA256 sobre o manifesto, com o
   segredo do painel, comparado por `compare_digest`. Sem segredo configurado,
   nada passa: uma rota pública que aceitasse qualquer corpo seria um botão de
   virar PRO.

2. **Não confia no corpo.** Dele sai só o id; o estado vem de uma consulta à API
   do Mercado Pago. Corpo forjado que passasse pela assinatura ainda não
   promoveria ninguém.

3. **Responde 200 rápido e sempre que tratou.** O Mercado Pago reenvia quando não
   recebe 200 a tempo — o que é o comportamento certo dele e a razão de a
   idempotência viver no serviço.

Vale lembrar o que ainda falta em volta: o rate limit da API **não roda** (item 1
do bloco de segurança da seção 17), e esta é a rota pública que mais precisa
dele. Quem tenta adivinhar o HMAC hoje pode tentar à vontade.
"""

import logging

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.services import assinaturas, mercado_pago

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/mercadopago")
async def mercadopago(
    request: Request,
    response: Response,
    x_signature: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Trata uma notificação de assinatura.

    O `data.id` vem tanto na query (`?data.id=...`, que é como o Mercado Pago
    monta a URL) quanto no corpo. A query tem precedência porque é sobre ela que
    a assinatura é calculada — validar um id e processar outro seria validar
    nada.
    """
    corpo = {}
    try:
        corpo = await request.json()
    except Exception:
        # Corpo ilegível não é motivo para 500: a assinatura ainda decide. Mas
        # engolir calado é como uma integração quebrada vira mistério — se o
        # Mercado Pago mudar o formato do corpo, este log é o único lugar onde
        # isso aparece antes de virar "as assinaturas pararam de funcionar".
        logger.info("[webhook] corpo ilegivel (request-id %s)", x_request_id)

    data_id = request.query_params.get("data.id") or str(
        (corpo.get("data") or {}).get("id") or ""
    )

    if not mercado_pago.assinatura_confere(
        x_signature=x_signature, x_request_id=x_request_id, data_id=data_id
    ):
        logger.warning("[webhook] assinatura inválida (request-id %s)", x_request_id)
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"resultado": "assinatura_invalida"}

    topico = (
        request.query_params.get("type")
        or request.query_params.get("topic")
        or corpo.get("type")
        or corpo.get("topic")
        or ""
    )
    # O id da notificação é o que dedupe usa. Sem ele no corpo, o par
    # request-id + recurso é o mais próximo de único que sobra.
    notificacao_id = str(corpo.get("id") or f"{x_request_id}:{data_id}")

    resultado = await assinaturas.aplicar_notificacao(
        session,
        notificacao_id=notificacao_id,
        topico=topico,
        recurso_id=data_id,
    )
    return {"resultado": resultado}
