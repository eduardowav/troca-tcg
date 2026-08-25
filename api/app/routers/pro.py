"""O PRO (/me/pro) — comprar tempo por Pix e saber quanto falta.

O interruptor é `COBRANCA_ATIVA`, e ele mora **no roteador**, como o da
verificação de número: a regra inteira continua exercitável pelos testes com a
cobrança desligada, e o dia de ligar é uma linha em `core/limites.py`.

Enquanto estiver desligada, `plano_vigente()` devolve PRO para todo mundo — e
vender nesse estado seria cobrar pelo que já está na mão. Por isso a rota de
pagamento responde 503 com código próprio, e a tela de planos segue sem botão.

A situação do plano (GET) responde sempre: saber que não há PRO é resposta
legítima, e é dela que Configurações tira o rótulo.

**Era `/me/assinatura` até 2026-08-23.** O nome mudou junto com a coisa: não há
assinatura, há compra de tempo. Ver `services/pro.py` e `db/schema/38`. O PWA é o
único cliente desta API, então a rota antiga não ficou de pé para ninguém.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.core.errors import RegraNegocio
from app.core.limites import COBRANCA_ATIVA
from app.db.session import get_session
from app.services import mercado_pago, pro

router = APIRouter(prefix="/me/pro", tags=["pro"])


def _exigir_ligada() -> None:
    if not COBRANCA_ATIVA:
        raise RegraNegocio(
            "COBRANCA_DESLIGADA",
            "O PRO ainda não está à venda — todo mundo está com os recursos liberados.",
            status_code=503,
        )
    if not mercado_pago.ativo():
        raise RegraNegocio(
            "PAGAMENTO_INDISPONIVEL",
            "O pagamento está temporariamente indisponível.",
            status_code=503,
        )


class CompraIn(BaseModel):
    #: `mensal` ou `anual`. Quanto custa cada um vem de `PRECOS`.
    periodo: str


class CobrancaPix(BaseModel):
    """A cobrança gerada, como a folha do Pix precisa dela."""

    payment_id: str
    periodo: str
    valor: Decimal
    #: O "copia e cola". A imagem do QR é desenhada a partir dele no navegador —
    #: mandar o PNG em base64 seria trafegar dezenas de KB por algo derivável.
    qr_code: str
    #: Quando o código morre. A folha conta o tempo a partir daqui.
    expira_em: datetime | None = None
    #: Esta cobrança já existia? A tela diz "você já tem um Pix aberto" em vez de
    #: fingir que acabou de criar um.
    reaproveitada: bool = False


class SituacaoDoPro(BaseModel):
    plano: str
    #: Até quando o PRO comprado vale. Nulo para quem não tem.
    plano_expira_em: datetime | None = None
    #: A tela deve oferecer renovação? Verdadeiro só dentro da janela de três
    #: dias antes do vencimento — a mesma do aviso, e por isso decidida no
    #: servidor. Ver `pro.situacao`. Falso não fecha a rota de pagamento; só
    #: tira o botão de quem não precisa vê-lo.
    pode_renovar: bool = False
    #: O PRO desta pessoa é do projeto e não vence — hoje, quem tem o selo
    #: FOUNDER. Sai como booleano derivado do selo e não como plano próprio: o
    #: que a tela precisa saber é "esta pessoa paga?", e um valor novo em
    #: `plano` obrigaria todo lugar que compara com `'PRO'` a aprender outro
    #: nome. Ver `39_founder_nao_paga.sql`.
    vitalicio: bool = False
    #: Status da última cobrança, ou nulo para quem nunca comprou.
    status: str | None = None
    periodo: str | None = None
    #: O "copia e cola" da cobrança pendente, **só enquanto ela vale**. É o que
    #: faz a folha do Pix reabrir sozinha quando a pessoa volta ao app no meio
    #: do pagamento.
    qr_code: str | None = None
    pix_expira_em: datetime | None = None
    pago_em: datetime | None = None


@router.get("", response_model=SituacaoDoPro)
async def situacao(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> SituacaoDoPro:
    return SituacaoDoPro(**await pro.situacao(session, user_id))


@router.post(
    "/pagamentos", response_model=CobrancaPix, status_code=status.HTTP_201_CREATED
)
async def comprar(
    corpo: CompraIn,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> CobrancaPix:
    """Gera o Pix e devolve o código. Ninguém vira PRO aqui.

    Quem credita é o webhook, depois de o dinheiro existir. A pessoa que fecha a
    folha sem pagar fica com uma cobrança pendente que morre em trinta minutos, e
    com o plano de antes.
    """
    _exigir_ligada()
    return CobrancaPix(**await pro.comprar(session, user_id, corpo.periodo))
