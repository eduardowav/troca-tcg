"""Orquestração do sync: busca na fonte e faz upsert idempotente em `cards`.

Idempotência via `on conflict (external_id) do update`: um job que roda duas vezes
não duplica catálogo. Ver Apêndice A da doc.
"""

from dataclasses import asdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.catalog.base import FonteCatalogo

_UPSERT = text(
    """
    insert into cards
      (external_id, set_code, set_nome, numero, nome_pt, nome_en, raridade, imagem_url)
    values
      (:external_id, :set_code, :set_nome, :numero, :nome_pt, :nome_en,
       :raridade, :imagem_url)
    on conflict (external_id) do update set
      set_code   = excluded.set_code,
      set_nome   = excluded.set_nome,
      numero     = excluded.numero,
      nome_pt    = excluded.nome_pt,
      nome_en    = excluded.nome_en,
      -- não apaga raridade já enriquecida se o brief não a trouxer
      raridade   = coalesce(excluded.raridade, cards.raridade),
      imagem_url = excluded.imagem_url
    """
)


async def sincronizar_sets(
    session: AsyncSession,
    fonte: FonteCatalogo,
    set_ids: list[str],
) -> int:
    """Sincroniza os sets informados. Retorna o total de cartas processadas.

    Commit por set: se um set falhar no meio, os anteriores já ficaram persistidos.
    """
    total = 0
    for set_id in set_ids:
        cartas = await fonte.obter_cartas_do_set(set_id)
        for carta in cartas:
            await session.execute(_UPSERT, asdict(carta))
            total += 1
        await session.commit()
    return total
