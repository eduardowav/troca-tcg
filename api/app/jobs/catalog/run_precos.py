"""Runner do sync de preço (TCGplayer) e raridade.

Uso:
    uv run python -m app.jobs.catalog.run_precos              # 500 cartas
    uv run python -m app.jobs.catalog.run_precos --limite 3000
    uv run python -m app.jobs.catalog.run_precos --tudo       # o catálogo inteiro

Roda quantas vezes precisar: a varredura retoma de onde parou, começando pelas
cartas nunca verificadas e depois pelas mais antigas. Rodar de novo num catálogo
já varrido é o que atualiza os preços, que é justamente o que envelhece.
"""

import asyncio
import sys

import httpx

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs.catalog.precos import sincronizar_precos
from app.jobs.catalog.tcgdex import TCGdex

_PADRAO = 500


def _limite(args: list[str]) -> int:
    if "--tudo" in args:
        return 10**9
    if "--limite" in args:
        i = args.index("--limite")
        if i + 1 >= len(args) or not args[i + 1].isdigit():
            print("uso: --limite <n>")
            raise SystemExit(1)
        return int(args[i + 1])
    return _PADRAO


async def _run(args: list[str]) -> None:
    limite = _limite(args)

    def progresso(verificadas: int, gravados: int, total: int) -> None:
        print(f"  {verificadas}/{total} cartas · {gravados} preços", flush=True)

    # Timeout curto de propósito: são milhares de requisições e uma carta lenta
    # não pode segurar o lote. Quem falhar volta na próxima rodada, sem carimbo.
    async with httpx.AsyncClient(timeout=20.0) as client:
        fonte = TCGdex(client, settings.TCGDEX_BASE_URL, settings.TCGDEX_IDIOMA)
        async with SessionLocal() as session:
            verificadas, gravados = await sincronizar_precos(
                session, fonte, limite, ao_vivo=progresso
            )
    await engine.dispose()
    print(f"{verificadas} cartas verificadas, {gravados} preços gravados.")


def main() -> None:
    asyncio.run(_run(sys.argv[1:]))


if __name__ == "__main__":
    main()
