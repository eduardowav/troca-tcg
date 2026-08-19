"""Rotas da vitrine (/vitrine) — o acervo da base, alcançado por carta.

Todas exigem login, pelo mesmo motivo de `/u/{username}` (routers/users): a
policy do banco responde "isto pode ser lido", a rota responde "por quem". Aberta
ao público, a vitrine entregaria o acervo inteiro da comunidade a um raspador
que só precisa iterar páginas. Quem está logado deixa rastro, e para quem tem
conta o custo é zero.

O `user_id` aqui é filtro, não só porteiro: o próprio usuário sai do feed e da
lista de quem tem a carta, e o `reciproco` do acervo é calculado contra o
Procuro de quem está olhando.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.vitrine import CartaDoAcervo, CartaNaVitrine, OfertaNaVitrine
from app.services import vitrine

router = APIRouter(prefix="/vitrine", tags=["vitrine"])


@router.get("", response_model=list[CartaNaVitrine])
async def feed(
    q: str | None = Query(default=None, max_length=60),
    # `set` é palavra reservada em Python; o nome público continua sendo o do
    # contrato (seção 22.7), o interno é o que o interpretador aceita.
    set_code: str | None = Query(default=None, alias="set", max_length=20),
    serie: str | None = Query(default=None, max_length=20),
    raridade: str | None = Query(default=None, max_length=40),
    # O `pattern` repete as chaves de `vitrine.ORDENS` para o erro vir como 422
    # de validação, com o campo apontado, em vez de virar erro de regra lá
    # dentro. O serviço continua conferindo — ele também é chamado sem passar
    # pela rota, nos testes.
    ordem: str = Query(
        default=vitrine.ORDEM_PADRAO,
        pattern="^(novidade|nome|preco_menor|preco_maior|donos)$",
    ),
    #: "Só o que fecha comigo": as cartas da vitrine que estão no meu Procuro.
    so_procuro: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[CartaNaVitrine]:
    """O que a base tem para oferecer, na ordem que a pessoa pedir."""
    return await vitrine.feed(
        session,
        user_id,
        q=q,
        set_code=set_code,
        serie=serie,
        raridade=raridade,
        ordem=ordem,
        so_procuro=so_procuro,
        pagina=page,
    )


@router.get("/carta/{card_id}", response_model=list[OfertaNaVitrine])
async def quem_tem(
    card_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[OfertaNaVitrine]:
    """Quem tem esta carta, em que condição e com que acabamento."""
    return await vitrine.quem_tem_a_carta(session, user_id, card_id)


@router.get("/acervo/{username}", response_model=list[CartaDoAcervo])
async def acervo(
    username: str,
    tipo: str = Query(default="OFERTA", pattern="^(OFERTA|PROCURA)$"),
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[CartaDoAcervo]:
    """Uma das duas listas de uma pessoa — o passo que vira proposta.

    Chega-se aqui a partir de uma carta ou do perfil, nunca de uma busca por
    gente: continua não existindo diretório de pessoas (seção 22.2). É também a
    lista que a contraproposta lê para escolher a substituição.

    `tipo` é OFERTA por padrão, que é o caminho da vitrine. PROCURA serve ao
    perfil público, que mostra a pessoa inteira. O `pattern` do Query é a
    validação: o valor entra num cast para `listing_kind`, e restringir aqui
    devolve 422 em vez de deixar o Postgres reclamar de enum inválido.
    """
    return await vitrine.acervo_de(session, user_id, username, tipo=tipo)
