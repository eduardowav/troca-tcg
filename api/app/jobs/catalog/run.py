"""Runner manual do sync de catálogo.

Uso:
    uv run python -m app.jobs.catalog.run sv03 sv08.5   # sets específicos
    uv run python -m app.jobs.catalog.run --serie sv    # o bloco inteiro
    uv run python -m app.jobs.catalog.run --all         # todos os sets (pesado)
"""

import asyncio
import sys

import httpx

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs.catalog.sync import sincronizar_serie, sincronizar_sets
from app.jobs.catalog.tcgdex import TCGdex


async def _run(args: list[str]) -> None:
    # timeout generoso: alguns sets grandes (svp, com 225 promos) demoram a
    # responder, e uma falha aqui obriga a reprocessar o set inteiro.
    async with httpx.AsyncClient(timeout=60.0) as client:
        fonte = TCGdex(client, settings.TCGDEX_BASE_URL, settings.TCGDEX_IDIOMA)
        async with SessionLocal() as session:
            if args[0] == "--serie":
                if len(args) < 2:
                    print("uso: --serie <codigo> (ex.: sv, me)")
                    raise SystemExit(1)
                total = await sincronizar_serie(session, fonte, args[1])
                alvo = f"série {args[1]}"
            else:
                set_codes = await fonte.listar_sets() if args == ["--all"] else args
                total = await sincronizar_sets(session, fonte, set_codes)
                alvo = f"{len(set_codes)} set(s)"
    await engine.dispose()
    print(f"{total} cartas sincronizadas de {alvo}.")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(
            "uso: python -m app.jobs.catalog.run <set_code> [<set_code> ...]"
            " | --serie <codigo> | --all"
        )
        raise SystemExit(1)
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
