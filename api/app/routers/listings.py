"""Rotas dos anúncios do usuário (/me/listings).

**Toda rota que escreve recalcula os matches de quem escreveu.** É aqui que o
motor roda, não na abertura do feed: mexer numa lista é o único evento que pode
criar, mudar ou desfazer uma troca possível, e é o momento em que a pessoa está
esperando o app reagir ao que ela acabou de fazer. Ler o feed não muda nada.

O custo fica na escrita, que é rara e já é uma ação deliberada, em vez de na
leitura, que é constante. Como `_gravar_match` grava os dois participantes, o
match aparece para o parceiro sem que ele precise fazer coisa alguma.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.schemas.listing import (
    AnuncioAtualizar,
    AnuncioBulkIn,
    AnuncioItem,
    AnuncioOut,
    CartaProcurada,
)
from app.services import listings, matching

router = APIRouter(prefix="/me/listings", tags=["anuncios"])


@router.get("", response_model=list[AnuncioOut])
async def listar(
    tipo: str | None = Query(default=None, pattern="^(OFERTA|PROCURA)$"),
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[AnuncioOut]:
    return await listings.listar_anuncios(session, user_id, tipo)


@router.post("", response_model=AnuncioOut, status_code=status.HTTP_201_CREATED)
async def criar(
    item: AnuncioItem,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> AnuncioOut:
    anuncio = await listings.criar_anuncio(session, user_id, item)
    await matching.sincronizar_matches(session, user_id)
    return anuncio


@router.get("/procuradas", response_model=list[CartaProcurada])
async def procuradas(
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> list[CartaProcurada]:
    """Alimenta a tela vazia de trocas: quem procura o que eu ofereço.

    Declarada antes de qualquer rota com parâmetro no mesmo prefixo — o FastAPI
    resolve na ordem, e um dia que apareça um `/me/listings/{id}` em GET esta
    rota seria engolida por ele.
    """
    return await matching.demanda_pelas_minhas_ofertas(session, user_id)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def criar_bulk(
    corpo: AnuncioBulkIn,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    n = await listings.criar_bulk(session, user_id, corpo.itens)
    # Uma sincronização para o lote inteiro, não uma por carta: é o caminho do
    # onboarding, onde chegam dezenas de cartas de uma vez.
    await matching.sincronizar_matches(session, user_id)
    return {"cadastradas": n}


@router.patch("/{anuncio_id}", response_model=AnuncioOut)
async def atualizar(
    anuncio_id: UUID,
    dados: AnuncioAtualizar,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> AnuncioOut:
    # Editar conta: mudar condição, acabamento ou prioridade muda com quem a
    # carta casa e quanto vale o score.
    anuncio = await listings.atualizar_anuncio(session, user_id, anuncio_id, dados)
    await matching.sincronizar_matches(session, user_id)
    return anuncio


@router.delete("/{anuncio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover(
    anuncio_id: UUID,
    user_id: UUID = Depends(usuario_atual),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Remover conta ainda mais: a sugestão que dependia desta carta precisa
    # sumir do feed do parceiro, e é o `sincronizar_matches` que a apaga.
    await listings.remover_anuncio(session, user_id, anuncio_id)
    await matching.sincronizar_matches(session, user_id)
