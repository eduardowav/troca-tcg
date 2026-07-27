"""Runner manual do sync de catálogo.

Uso:
    uv run python -m app.jobs.catalog.run sv08.5 sv03      # sets específicos
    uv run python -m app.jobs.catalog.run --all            # todos os sets (pesado)
"""

import asyncio
import sys

import httpx

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs.catalog.sync import sincronizar_sets
from app.jobs.catalog.tcgdex import TCGdex


async def _run(set_ids: list[str]) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        fonte = TCGdex(client, settings.TCGDEX_BASE_URL, settings.TCGDEX_IDIOMA)
        if set_ids == ["--all"]:
            set_ids = [s.id for s in await fonte.listar_sets()]
        async with SessionLocal() as session:
            total = await sincronizar_sets(session, fonte, set_ids)
    await engine.dispose()
    print(f"{total} cartas sincronizadas de {len(set_ids)} set(s).")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("uso: python -m app.jobs.catalog.run <set_id> [<set_id> ...] | --all")
        raise SystemExit(1)
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
