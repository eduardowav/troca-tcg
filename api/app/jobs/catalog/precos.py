"""Sync de preço (TCGplayer) e raridade — uma requisição por carta.

Este job é caro e por isso tem forma diferente do sync de catálogo: lá uma
requisição traz um set inteiro, aqui traz **uma carta**. São ~16 mil idas à
TCGdex para varrer tudo, então três coisas importam mais que velocidade:

1. **Retomada.** `cards.precos_verificado_em` marca "já tentei", que não é o
   mesmo que "tem preço" — boa parte do catálogo (promos, cartas só em PT, sets
   antigos) não existe na TCGplayer e nunca vai gerar linha. Sem esse carimbo, a
   rodada seguinte varreria as mesmas cartas para sempre.
2. **Educação com a fonte.** É uma API pública e gratuita, sem chave. Um punhado
   de conexões simultâneas dá conta do recado; abrir cem seria abusar de quem
   está bancando a conta.
3. **Não perder o que já foi feito.** O commit acontece a cada lote, então
   interromper no meio custa o lote corrente, não a varredura inteira.

Rodar em pedaços é esperado:
    uv run python -m app.jobs.catalog.precos --limite 2000
"""

import asyncio
from collections.abc import Callable

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.catalog.base import DetalheCarta, FonteCatalogo

# Quantas cartas por ida ao banco. Mesmo raciocínio do upsert de cartas: 250
# linhas num executemany, não 250 viagens.
_LOTE = 250

# Conexões simultâneas com a TCGdex.
_PARALELAS = 8

_UPSERT_PRECO = text("""
    insert into card_prices
      (card_id, tipo_tcgplayer, moeda, baixo, mercado, fonte_atualizada_em,
       sincronizado_em)
    values
      (:card_id, :tipo, :moeda, :baixo, :mercado, :fonte_atualizada_em, now())
    on conflict (card_id, tipo_tcgplayer) do update set
      moeda               = excluded.moeda,
      baixo               = excluded.baixo,
      mercado             = excluded.mercado,
      fonte_atualizada_em = excluded.fonte_atualizada_em,
      sincronizado_em     = now()
""")

# Duas coisas numa ida só, e a ordem entre elas importa: `cards.raridade` é FK
# para `raridades`, então uma raridade que a TCGdex invente amanhã precisa existir
# no mapa antes de encostar na carta. Cadastrar sozinho (com o próprio nome e
# ordem 99, no fim da lista) é o que impede a varredura inteira de morrer por
# causa de um nome novo num set novo — depois alguém traduz a linha com calma.
#
# `coalesce` na raridade pelo mesmo motivo do upsert de cartas: se a fonte não
# trouxer, não apaga o que já estava lá.
_MARCAR_CARTA = text("""
    with mapeada as (
        insert into raridades (fonte, rotulo, ordem)
        -- Os casts não são enfeite: sem eles o Postgres não consegue inferir o
        -- tipo do parâmetro num `select` sem tabela, e a query morre com
        -- "could not determine data type of parameter".
        select cast(:raridade as text), cast(:raridade as text), 99
         where cast(:raridade as text) is not null
        on conflict (fonte) do nothing
    )
    update cards
       set raridade = coalesce(:raridade, raridade),
           precos_verificado_em = now()
     where id = :card_id
""")

# Nunca verificadas primeiro; depois as mais antigas, que é o que envelhece.
_PENDENTES = text("""
    select id::text as card_id, external_id
      from cards
     order by precos_verificado_em asc nulls first, external_id
     limit :limite
""")


async def sincronizar_precos(
    session: AsyncSession,
    fonte: FonteCatalogo,
    limite: int,
    *,
    ao_vivo: Callable[[int, int, int], None] | None = None,
) -> tuple[int, int]:
    """Varre até `limite` cartas. Devolve (cartas verificadas, preços gravados)."""
    cartas = (await session.execute(_PENDENTES, {"limite": limite})).mappings().all()
    if not cartas:
        return 0, 0

    semaforo = asyncio.Semaphore(_PARALELAS)
    verificadas = 0
    gravados = 0

    for inicio in range(0, len(cartas), _LOTE):
        lote = cartas[inicio : inicio + _LOTE]
        detalhes = await asyncio.gather(
            *(_buscar(fonte, semaforo, c["external_id"]) for c in lote)
        )

        precos_params: list[dict] = []
        marcas_params: list[dict] = []
        for carta, detalhe in zip(lote, detalhes, strict=True):
            if detalhe is None:
                # Falhou a requisição: não marca como verificada, para a próxima
                # rodada tentar de novo. Erro de rede não é ausência de preço.
                continue
            marcas_params.append(
                {"card_id": carta["card_id"], "raridade": detalhe.raridade}
            )
            for preco in detalhe.precos:
                precos_params.append(
                    {
                        "card_id": carta["card_id"],
                        "tipo": preco.tipo,
                        "moeda": preco.moeda,
                        "baixo": preco.baixo,
                        "mercado": preco.mercado,
                        "fonte_atualizada_em": preco.fonte_atualizada_em,
                    }
                )

        if precos_params:
            await session.execute(_UPSERT_PRECO, precos_params)
        if marcas_params:
            await session.execute(_MARCAR_CARTA, marcas_params)
        await session.commit()

        verificadas += len(marcas_params)
        gravados += len(precos_params)
        if ao_vivo:
            ao_vivo(verificadas, gravados, len(cartas))

    return verificadas, gravados


async def _buscar(
    fonte: FonteCatalogo, semaforo: asyncio.Semaphore, external_id: str
) -> DetalheCarta | None:
    """Uma carta, com a falha isolada.

    Uma carta que a fonte não conhece ou uma conexão que cai não podem derrubar
    a varredura inteira — são milhares de requisições e alguma vai falhar.

    `None` significa "tente de novo depois"; `DetalheCarta` vazio significa "a
    fonte respondeu que não tem". A distinção é o que separa erro de rede de
    ausência de preço, e é ela que decide se a carta fica marcada.
    """
    async with semaforo:
        try:
            return await fonte.obter_detalhe(external_id)
        except httpx.HTTPStatusError as erro:
            if erro.response.status_code == 404:
                return DetalheCarta(raridade=None, precos=[])
            return None
        except (TimeoutError, httpx.HTTPError):
            return None
