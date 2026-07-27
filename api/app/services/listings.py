"""Regra de negócio dos anúncios — as listas Ofereço e Procuro."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.schemas.listing import AnuncioItem, AnuncioOut

_COLUNAS = """
  id::text, card_id::text, tipo, quantidade, condicao, finish_id,
  idioma, prioridade, aceita_qualquer_finish, ativo
"""

# Upsert idempotente: recadastrar a mesma carta reativa o anúncio em vez de duplicar.
_UPSERT = text(
    """
    insert into listings
      (user_id, card_id, tipo, quantidade, condicao, finish_id, idioma,
       prioridade, aceita_qualquer_finish, ativo)
    values
      (:user_id, :card_id, :tipo, :quantidade, :condicao, :finish_id, :idioma,
       :prioridade, :aceita_qualquer_finish, true)
    on conflict (user_id, card_id, tipo, condicao, finish_id, idioma)
    do update set
      quantidade = excluded.quantidade,
      prioridade = excluded.prioridade,
      aceita_qualquer_finish = excluded.aceita_qualquer_finish,
      ativo = true
    returning
"""
    + _COLUNAS
)


def _params(user_id: UUID, item: AnuncioItem) -> dict:
    return {
        "user_id": str(user_id),
        "card_id": str(item.card_id),
        "tipo": item.tipo,
        "quantidade": item.quantidade,
        "condicao": item.condicao,
        "finish_id": item.finish_id,
        "idioma": item.idioma,
        "prioridade": item.prioridade,
        "aceita_qualquer_finish": item.aceita_qualquer_finish,
    }


async def criar_anuncio(
    session: AsyncSession, user_id: UUID, item: AnuncioItem
) -> AnuncioOut:
    try:
        res = await session.execute(_UPSERT, _params(user_id, item))
        row = res.mappings().first()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir(exc) from exc
    assert row is not None
    return AnuncioOut(**dict(row))


async def criar_bulk(
    session: AsyncSession, user_id: UUID, itens: list[AnuncioItem]
) -> int:
    """Persiste o lote do onboarding e marca onboarding_ok. Retorna quantos entraram."""
    try:
        for item in itens:
            await session.execute(_UPSERT, _params(user_id, item))
        await session.execute(
            text("update profiles set onboarding_ok = true where id = :id"),
            {"id": str(user_id)},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir(exc) from exc
    return len(itens)


async def listar_anuncios(
    session: AsyncSession, user_id: UUID, tipo: str | None
) -> list[AnuncioOut]:
    sql = f"select {_COLUNAS} from listings where user_id = :id and ativo = true"
    params: dict[str, object] = {"id": str(user_id)}
    if tipo:
        sql += " and tipo = :tipo"
        params["tipo"] = tipo
    sql += " order by criado_em desc"
    res = await session.execute(text(sql), params)
    return [AnuncioOut(**dict(r)) for r in res.mappings().all()]


async def remover_anuncio(
    session: AsyncSession, user_id: UUID, anuncio_id: UUID
) -> None:
    """Soft delete (ativo=false): mantém histórico e não quebra matches existentes."""
    res = await session.execute(
        text("""
            update listings set ativo = false
            where id = :id and user_id = :user_id and ativo = true
        """),
        {"id": str(anuncio_id), "user_id": str(user_id)},
    )
    await session.commit()
    if res.rowcount == 0:
        raise RegraNegocio(
            "ANUNCIO_NAO_ENCONTRADO", "Anúncio não encontrado.", status_code=404
        )


def _traduzir(exc: IntegrityError) -> RegraNegocio:
    detalhe = str(getattr(exc, "orig", exc))
    if "card_id" in detalhe or "cards" in detalhe:
        return RegraNegocio(
            "CARTA_INVALIDA",
            "Carta não encontrada no catálogo.",
            campo="card_id",
            status_code=422,
        )
    if "finish" in detalhe:
        return RegraNegocio(
            "ACABAMENTO_INVALIDO",
            "Acabamento inválido para essa carta.",
            campo="finish_id",
            status_code=422,
        )
    return RegraNegocio(
        "ANUNCIO_INVALIDO", "Não foi possível salvar o anúncio.", status_code=400
    )
