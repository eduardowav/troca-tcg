"""Preenche a imagem que o sync não gravou, buscando a mesma carta em inglês.

## Por que existe

O sync pede a listagem da expansão em português (`/v2/pt/sets/<code>`), e nela o
campo `image` vem **nulo** para as cartas que só têm arte em inglês — quase todas
promo. O `tcgdex.py` já sabe cair para o inglês, mas só em `obter_detalhe`, para
raridade e preço; a imagem nunca herdou essa queda. Resultado medido em
2026-08-25: **1.126 de 15.997 cartas sem arte, 7% do catálogo**.

Este script fechou 555 delas e o catálogo caiu para 3,57%. **Ele é remendo, não
conserto** — o conserto é o sync tentar o inglês quando o `image` vier nulo, e
está registrado como pendência. Enquanto isso não existir, um sync novo não
desfaz o que aqui foi feito (o `on conflict` só sobrescreve com o que vier), mas
carta nova com o mesmo defeito entra sem arte.

## O que ele aceita, e o que recusa de propósito

Só o caminho **idêntico** em outro idioma:

    pt/<serie>/<set>/<numero>/low.webp  ->  en/<serie>/<set>/<numero>/low.webp

O caminho carrega série, expansão e número, então um 200 ali é a mesma carta em
inglês. Não é palpite, é a mesma coordenada.

**Ficam de fora as galerias** — `swsh9.5tg`, `swsh12.5gg`, `swsh4.5sv` e as
outras. A arte delas existe, mas sob o caminho da expansão-mãe, e ali um 200
prova que existe *algo* naquele endereço, não que é *esta* carta. Num app onde a
pessoa fecha troca olhando a imagem, arte errada é pior que arte nenhuma. Isso
precisa da API para confirmar carta a carta, e em 25/08 ela estava inalcançável
(`api.tcgdex.net` recusava conexão; o `assets.tcgdex.net` respondia normal).

As 571 restantes não têm arte em lugar nenhum — conferido nos dois idiomas.

## Uso

    # com a DATABASE_URL do ambiente carregada
    python api/scripts/backfill_imagens.py            # só mede
    python api/scripts/backfill_imagens.py --aplicar  # grava
"""

import asyncio
import os
import sys

import asyncpg
import httpx

BASE = "https://assets.tcgdex.net"
CONCORRENCIA = 16


async def main() -> None:
    aplicar = "--aplicar" in sys.argv
    # O app fala SQLAlchemy; o asyncpg cru recusa o prefixo do driver.
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(url, statement_cache_size=0)
    faltando = await conn.fetch("""
        select c.id, s.serie_code, c.set_code, c.numero
          from cards c join sets s on s.code = c.set_code
         where c.imagem_url is null or c.imagem_url = ''
         order by c.set_code, c.numero
    """)
    print(f"sem imagem: {len(faltando)}")

    limite = asyncio.Semaphore(CONCORRENCIA)
    achadas: list[tuple[str, str]] = []
    por_set: dict[str, list[int]] = {}

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as http:

        async def testar(linha) -> None:
            destino = (
                f"{BASE}/en/{linha['serie_code']}/{linha['set_code']}"
                f"/{linha['numero']}/low.webp"
            )
            async with limite:
                try:
                    r = await http.head(destino)
                    ok = r.status_code == 200
                except httpx.HTTPError:
                    ok = False
            marcador = por_set.setdefault(linha["set_code"], [0, 0])
            marcador[0 if ok else 1] += 1
            if ok:
                achadas.append((destino, linha["id"]))

        await asyncio.gather(*(testar(x) for x in faltando))

    print(f"com arte em inglês: {len(achadas)}")
    print(f"sem arte em lugar nenhum: {len(faltando) - len(achadas)}")
    print("\npor expansão (achadas/perdidas):")
    for code, (ok, nao) in sorted(por_set.items(), key=lambda p: -p[1][0]):
        if ok:
            print(f"  {code:16} {ok:4} / {nao}")

    if not aplicar:
        print("\n(medição apenas — use --aplicar para gravar)")
    else:
        await conn.executemany(
            "update cards set imagem_url = $1 where id = $2", achadas
        )
        print(f"\ngravadas: {len(achadas)}")

    await conn.close()


asyncio.run(main())
