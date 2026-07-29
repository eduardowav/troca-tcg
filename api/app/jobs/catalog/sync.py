"""Orquestração do sync: busca na fonte e grava série → set → cartas, nessa ordem.

A ordem não é estética: `sets.serie_code` e `cards.set_code` são chaves
estrangeiras, então o pai tem de existir antes do filho. Ver `upserts.py` para as
declarações e `db/schema/12_series_sets.sql` para o desenho das tabelas.
"""

from dataclasses import asdict

from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.catalog.base import FonteCatalogo, SetCatalogo
from app.jobs.catalog.upserts import (
    UPSERT_CARTA,
    UPSERT_SERIE,
    UPSERT_SERIE_MINIMA,
    UPSERT_SET,
)


async def sincronizar_serie(
    session: AsyncSession,
    fonte: FonteCatalogo,
    serie_code: str,
) -> int:
    """Sincroniza um bloco inteiro (ex.: 'sv'). Retorna o total de cartas."""
    serie, set_codes = await fonte.obter_serie(serie_code)
    await session.execute(UPSERT_SERIE, asdict(serie))
    await session.commit()
    return await sincronizar_sets(session, fonte, set_codes)


async def sincronizar_sets(
    session: AsyncSession,
    fonte: FonteCatalogo,
    set_codes: list[str],
) -> int:
    """Sincroniza os sets informados. Retorna o total de cartas processadas.

    Commit por set: se um set falhar no meio, os anteriores já ficaram
    persistidos e um novo run só reprocessa o que faltou.
    """
    total = 0
    for set_code in set_codes:
        conjunto, cartas = await fonte.obter_set(set_code)
        await _gravar_set(session, conjunto)
        if cartas:
            # executemany: 250 cartas por set em uma ida ao banco, não 250 idas.
            await session.execute(UPSERT_CARTA, [asdict(c) for c in cartas])
        await session.commit()
        total += len(cartas)
    return total


async def _gravar_set(session: AsyncSession, conjunto: SetCatalogo) -> None:
    """Garante a série antes do set — a FK exige o pai."""
    if conjunto.serie_code:
        await session.execute(
            UPSERT_SERIE_MINIMA,
            {
                "code": conjunto.serie_code,
                "nome": conjunto.serie_nome or conjunto.serie_code,
            },
        )
    dados = asdict(conjunto)
    dados.pop("serie_nome")  # não é coluna de `sets`
    await session.execute(UPSERT_SET, dados)
