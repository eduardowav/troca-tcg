"""A vitrine: o acervo da base, alcançado por carta (seção 22 da doc).

Existe porque o motor de matching precisa dos **dois** lados declarados e boa
parte das pessoas só declara um — sabe o que tem, não sabe o que quer. Quem
nunca preencheu o PROCURA é invisível para o matcher por mais cartas que tenha,
e no começo isso é quase todo mundo.

A regra que a vitrine **não** derruba é "não há diretório de pessoas": não
existe busca por usuário, nem lista de membros. Chega-se a uma pessoa por uma
carta — feed → carta → quem tem → acervo dela —, e é por isso que o acervo é
buscado por `username` vindo de um anúncio, nunca de uma listagem de gente.

Nada aqui é dado novo: anúncio ativo já é público por policy desde `09_rls.sql`.
O que muda é o ângulo de leitura. Contato continua fora, como sempre.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.schemas.vitrine import CartaDoAcervo, CartaNaVitrine, OfertaNaVitrine

#: Cartas por página do feed. O mesmo 24 da busca de catálogo
#: (`buscar_cartas`, db/schema/13) — as duas telas são a mesma grade.
TAMANHO_PAGINA = 24


def padrao_de_busca(termo: str) -> str:
    """Transforma o que a pessoa digitou num padrão de LIKE.

    Mesma regra do `buscar_cartas` (db/schema/13), e pelos mesmos motivos:

      * `%` e `_` digitados são curingas para o LIKE — sem escapar, buscar por
        "%" devolveria o catálogo inteiro;
      * espaços viram `%`, então "pesquisa professor" acha "Pesquisa de
        Professores", que é como o jogador realmente digita.

    O que **não** é feito aqui é normalizar acento e caixa: quem faz isso é a
    `normaliza_busca` do Postgres, aplicada ao padrão dentro da consulta. Ela é
    a mesma função que gerou as colunas `busca_pt`/`busca_en`, e repetir a
    normalização em Python significaria manter duas definições de "sem acento"
    que só divergem em produção.
    """
    partes = [
        p.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        for p in termo.split()
        if p
    ]
    return "%".join(partes)


# O feed é por carta, não por anúncio: `count(distinct user_id)` no lugar de uma
# linha por anúncio impede que a carta mais comum da cidade ocupe a página toda.
#
# `max(criado_em)` ordena por novidade, que é a pergunta da tela — e é o índice
# `idx_listings_vitrine` (criado_em desc, parcial em ativo + OFERTA) que sustenta
# o recorte. Nenhum índice anterior servia: `idx_listings_matching` começa em
# card_id porque a pergunta dele é "quem mais tem esta carta", a oposta desta.
#
# Os filtros entram como `:param is null or ...` para a consulta ser uma só. O
# Postgres descarta o ramo constante no plano, então o custo é do filtro que
# veio, não da soma de todos. O `cast(... as text)` não é enfeite: `$1 is null`
# sozinho não dá ao Postgres contexto para inferir o tipo do parâmetro, e o
# asyncpg devolve "could not determine data type" em vez de rodar a consulta.
#
# O preço vem por anúncio, não por carta, e essa é a única forma honesta de
# ordenar: uma reverse não vale o que a normal vale, e é o acabamento **do
# anúncio** que está à venda na prateleira. O `lateral` resolve isso por linha —
# para o acabamento daquele anúncio, a primeira linha de `card_prices` na ordem
# de preferência que `finishes.tipos_tcgplayer` declara. `coalesce(mercado,
# baixo)` é a mesma escolha que o cliente já faz em `formatarPreco`.
#
# Agregado por carta vira duas pontas: `preco` é a oferta mais barata daquela
# carta (o que interessa a quem ordena por menor preço) e `preco_maior` é a mais
# cara (o que interessa a quem ordena por maior). Uma média esconderia as duas.
_FEED = """
    select l.card_id::text as card_id,
           count(distinct l.user_id) as donos,
           max(l.criado_em) as mais_recente,
           min(preco.valor) as preco,
           max(preco.valor) as preco_maior,
           min(coalesce(c.busca_pt, c.busca_en)) as nome_ordem
    from listings l
    join profiles p on p.id = l.user_id
    join cards c on c.id = l.card_id
    join sets s on s.code = c.set_code
    left join lateral (
      select coalesce(cp.mercado, cp.baixo) as valor
      from card_prices cp
      join finishes f on f.id = l.finish_id
      where cp.card_id = l.card_id
        and cp.tipo_tcgplayer = any(f.tipos_tcgplayer)
      order by array_position(f.tipos_tcgplayer, cp.tipo_tcgplayer)
      limit 1
    ) preco on true
    where l.ativo and l.tipo = 'OFERTA'
      and p.bloqueado = false
      and l.user_id <> cast(:eu as uuid)
      and (
        cast(:padrao as text) is null
        or c.busca_pt like '%' || public.normaliza_busca(:padrao) || '%'
        or c.busca_en like '%' || public.normaliza_busca(:padrao) || '%'
      )
      and (cast(:set_code as text) is null or c.set_code = :set_code)
      and (cast(:serie as text) is null or s.serie_code = :serie)
      and (cast(:raridade as text) is null or c.raridade = :raridade)
      -- "Só o que fecha comigo": a carta está no meu Procuro. É o filtro que
      -- transforma a vitrine em matching manual — e é o mais útil de todos para
      -- quem já declarou o que quer mas ainda não deu match, porque significa
      -- que falta só a outra metade.
      and (
        not cast(:so_procuro as boolean)
        or exists (
          select 1 from listings meu
          where meu.user_id = cast(:eu as uuid) and meu.ativo
            and meu.tipo = 'PROCURA' and meu.card_id = l.card_id
        )
      )
    group by l.card_id
    order by {ordem}
    limit :limite offset :deslocamento
"""

#: As ordens que a tela oferece, e o `order by` de cada uma.
#:
#: Dicionário fechado, e não texto vindo da requisição: o valor entra em SQL por
#: f-string — a única forma de ordenar por coluna variável — e o que impede
#: injeção é a chave ser procurada aqui antes. O mesmo desenho das caixas de
#: proposta.
#:
#: `nulls last` nas duas de preço porque carta sem cotação existe (as promo que a
#: TCGplayer não lista): mandá-las para o fim é melhor do que abrir a lista com
#: as que não têm preço nenhum, dos dois lados da ordenação.
ORDENS: dict[str, str] = {
    "novidade": "mais_recente desc, card_id",
    "nome": "nome_ordem asc, card_id",
    "preco_menor": "preco asc nulls last, card_id",
    "preco_maior": "preco_maior desc nulls last, card_id",
    "donos": "donos desc, mais_recente desc, card_id",
}

ORDEM_PADRAO = "novidade"


async def feed(
    session: AsyncSession,
    user_id: UUID,
    *,
    q: str | None = None,
    set_code: str | None = None,
    serie: str | None = None,
    raridade: str | None = None,
    ordem: str = ORDEM_PADRAO,
    so_procuro: bool = False,
    pagina: int = 1,
) -> list[CartaNaVitrine]:
    """O que a base tem para oferecer, na ordem que a pessoa pedir.

    O padrão é novidade — a vitrine responde "o que apareceu de novo", e é para
    isso que o índice `idx_listings_vitrine` existe. As outras ordens são de
    quem já sabe o que procura: nome para achar, preço para comparar.

    O próprio usuário fica de fora: ninguém troca consigo mesmo, e ver as
    próprias cartas no feed da vitrine só faria a base parecer maior do que é —
    justamente para quem está tentando descobrir se vale a pena ficar.

    Perfil bloqueado também fica de fora, como no matcher (`_PARES`) e na
    demanda: quem foi bloqueado não é sugerido nem alcançado.
    """
    if ordem not in ORDENS:
        raise RegraNegocio(
            "ORDEM_INVALIDA",
            "Não conheço essa ordenação.",
            campo="ordem",
            status_code=422,
        )

    # Termo de uma letra só casa com meio catálogo e não é busca, é ruído — a
    # mesma trava de `buscar_cartas` (`length(t) >= 2`).
    padrao = padrao_de_busca(q) if q else ""
    linhas = (
        (
            await session.execute(
                text(_FEED.format(ordem=ORDENS[ordem])),
                {
                    "eu": str(user_id),
                    "padrao": padrao if len(padrao) >= 2 else None,
                    "set_code": set_code or None,
                    "serie": serie or None,
                    "raridade": raridade or None,
                    "so_procuro": so_procuro,
                    "limite": TAMANHO_PAGINA,
                    "deslocamento": max(pagina - 1, 0) * TAMANHO_PAGINA,
                },
            )
        )
        .mappings()
        .all()
    )
    return [
        CartaNaVitrine(
            card_id=linha["card_id"],
            donos=linha["donos"],
            mais_recente=linha["mais_recente"],
            preco=linha["preco"],
        )
        for linha in linhas
    ]


# Quem tem esta carta. A ordem é de produto: quem já concluiu troca aparece
# antes, porque a pergunta de quem está escolhendo é "com quem eu marco?" — e
# entre dois anúncios iguais o que decide é a pessoa, não a carta.
_QUEM_TEM = text("""
    select l.id::text as listing_id, l.card_id::text as card_id,
           l.condicao::text as condicao, l.finish_id, l.quantidade, l.idioma,
           p.username, p.nome_exibicao, p.selo,
           p.trocas_concluidas, p.trocas_furadas, p.trocas_desistidas
    from listings l
    join profiles p on p.id = l.user_id
    where l.card_id = cast(:card as uuid)
      and l.ativo and l.tipo = 'OFERTA'
      and p.bloqueado = false
      and l.user_id <> cast(:eu as uuid)
    order by p.trocas_concluidas desc, p.trocas_furadas, l.criado_em desc
    limit :limite
""")


async def quem_tem_a_carta(
    session: AsyncSession, user_id: UUID, card_id: UUID, limite: int = 100
) -> list[OfertaNaVitrine]:
    """Os anúncios de uma carta — o passo entre o feed e a proposta."""
    linhas = (
        (
            await session.execute(
                _QUEM_TEM,
                {"card": str(card_id), "eu": str(user_id), "limite": limite},
            )
        )
        .mappings()
        .all()
    )
    return [OfertaNaVitrine(**dict(linha)) for linha in linhas]


# O acervo de alguém. Mesma ordem de `_MAIS_CARTAS` (services/matching): o que
# fecha com quem está olhando primeiro, depois a prioridade de quem anunciou.
#
# `reciproco` aqui só olha o meu PROCURA porque a lista é só de OFERTA dela —
# em `_MAIS_CARTAS` as duas direções aparecem porque lá a lista tem os dois
# tipos. A pergunta é a mesma: isto está no seu Procuro?
# O `tipo` é parâmetro desde 2026-08-18, quando o perfil público passou a mostrar
# os dois lados da pessoa em vez de só o que ela oferece.
#
# O `reciproco` **inverte junto**, e é o que mantém a coluna útil nos dois casos:
# numa lista de OFERTA ele diz "isto está no seu Procuro" (vale a pena pedir);
# numa de PROCURA, "isto está no seu Ofereço" (você tem o que essa pessoa quer).
# É sempre a mesma pergunta — "há troca aqui?" — feita do lado certo.
_ACERVO = text("""
    select l.id::text as listing_id, l.card_id::text as card_id,
           l.condicao::text as condicao, l.finish_id, l.quantidade, l.prioridade,
           exists (
             select 1 from listings meu
             where meu.user_id = cast(:eu as uuid) and meu.ativo
               and meu.card_id = l.card_id
               and meu.tipo = cast(:tipo_reciproco as listing_kind)
           ) as reciproco
    from listings l
    where l.user_id = cast(:dono as uuid)
      and l.ativo and l.tipo = cast(:tipo as listing_kind)
    order by reciproco desc, l.prioridade desc, l.card_id
    limit :limite
""")


async def acervo_de(
    session: AsyncSession,
    user_id: UUID,
    username: str,
    tipo: str = "OFERTA",
    limite: int = 200,
) -> list[CartaDoAcervo]:
    """Uma das duas listas de uma pessoa, alcançada pelo @.

    `tipo` nasceu OFERTA e continua sendo o padrão — é o que a vitrine pede,
    porque de lá se chega para montar uma proposta. PROCURA entrou em
    2026-08-18, para o perfil público mostrar a pessoa inteira: quem só vê o que
    alguém oferece não consegue responder "e o que eu tenho que serve para
    ela?", que é a metade da troca que depende de quem está olhando.

    O 404 de perfil bloqueado é o mesmo de perfil inexistente de propósito:
    confirmar que a conta existe mas está bloqueada é contar sobre a moderação
    a quem não tem nada com isso.
    """
    dono = await session.scalar(
        text("select id::text from profiles where username = :u and bloqueado = false"),
        {"u": username},
    )
    if dono is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO",
            "Não encontramos ninguém com esse @.",
            status_code=404,
        )

    linhas = (
        (
            await session.execute(
                _ACERVO,
                {
                    "eu": str(user_id),
                    "dono": dono,
                    "tipo": tipo,
                    "tipo_reciproco": "OFERTA" if tipo == "PROCURA" else "PROCURA",
                    "limite": limite,
                },
            )
        )
        .mappings()
        .all()
    )
    return [CartaDoAcervo(**dict(linha)) for linha in linhas]
