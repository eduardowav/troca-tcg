"""Regra de negócio dos anúncios — as listas Ofereço e Procuro."""

from uuid import UUID

from sqlalchemy import bindparam, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.core.limites import limites_de, plano_vigente
from app.schemas.listing import AnuncioAtualizar, AnuncioItem, AnuncioOut

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


# Acabamentos catalogados das cartas do lote, na ordem de exibição do catálogo.
# `expanding` monta o IN com um parâmetro por id em vez de interpolar texto —
# mesma regra de sempre, SQL parametrizado, e uma ida ao banco em vez de uma por
# carta do onboarding. A ordem importa: é ela que decide o padrão de quem não
# escolheu.
_ACABAMENTOS_DAS_CARTAS = text("""
    select cf.card_id::text as card_id, cf.finish_id
    from card_finishes cf
    join finishes f on f.id = cf.finish_id and f.ativo
    where cf.card_id in :ids
    order by f.ordem
""").bindparams(bindparam("ids", expanding=True))

NORMAL = 1

# Plano e ofertas ativas numa ida só ao banco: são lidos sempre juntos, e a
# escrita do anúncio já é o caminho mais quente do app depois do feed.
_PLANO_E_OFERTAS = text("""
    select
      (select plano from profiles where id = cast(:eu as uuid)) as plano,
      (select count(*) from listings
         where user_id = cast(:eu as uuid)
           and tipo = 'OFERTA' and ativo = true) as ofertas
""")


async def _checar_teto_de_ofertas(session: AsyncSession, user_id: UUID) -> None:
    """O teto de ofertas do plano — conferido depois da escrita, antes do commit.

    **Só OFERTA conta.** Procura é ilimitada nos dois planos; o porquê está em
    `core/limites.py`.

    **Depois do upsert, e não antes**, é o que faz a regra acertar o recadastro.
    `_UPSERT` reativa a carta que já existe em vez de duplicar, então somar "o
    que já tenho + o que está entrando" contaria de novo quem já estava lá e
    barraria quem só está editando a própria lista. Contar o resultado dentro da
    transação vê exatamente o que vai ficar gravado; o `raise` desfaz tudo.
    """
    linha = (
        (await session.execute(_PLANO_E_OFERTAS, {"eu": str(user_id)}))
        .mappings()
        .first()
    )
    plano = (linha["plano"] if linha else None) or "FREE"
    teto = limites_de(plano_vigente(plano)).max_ofertas
    if teto is None:
        return

    if (linha["ofertas"] if linha else 0) > teto:
        raise RegraNegocio(
            "LIMITE_DE_ANUNCIOS",
            f"Seu plano permite anunciar até {teto} cartas. "
            "Assine o PRO para anunciar sem limite.",
            status_code=409,
        )


async def _resolver_acabamentos(
    session: AsyncSession, pedidos: list[tuple[str, int | None]]
) -> list[int]:
    """Valida o acabamento escolhido, ou escolhe um quando ninguém escolheu.

    **Validar:** a FK de `listings.finish_id` garante que o acabamento existe no
    mundo; ela não sabe que Charizard nunca saiu em Master Ball. Quem sabe é
    `card_finishes` (db/schema/19_acabamentos.sql), e é ela que sustenta a
    promessa da tela: se o app oferece uma escolha, a escolha tem de valer.

    **Escolher:** `finish_id` ausente não é descuido do cliente, é o onboarding —
    a tela onde o atrito foi removido de propósito e que não pergunta acabamento.
    O padrão do schema era NORMAL fixo, e isso deixou de servir no instante em que
    passou a existir validação: **5.082 cartas do catálogo não têm Normal** (as
    holo e ultra raras, justamente as mais trocadas), e mandar NORMAL nelas
    reprovaria o lote inteiro de quem está entrando no app pela primeira vez.
    Resolver aqui, e não em cada tela, é o que mantém a regra num lugar só —
    qualquer cliente que omitir o campo recebe a mesma escolha.

    O critério é: Normal quando a carta tem (é a impressão da maioria), senão a
    primeira na ordem do catálogo, senão Normal mesmo — carta sem nada
    catalogado cai no padrão histórico.

    **Carta sem nenhum acabamento catalogado passa na validação.** São 1.681 das
    15.997 — promos, cartas só em PT, sets velhos que a TCGplayer não precifica e
    sobre os quais o banco não tem opinião. Bloquear ali seria transformar
    ausência de dado em "não existe", e o custo cairia justamente sobre a carta
    rara que alguém quer trocar. Errar por permitir demais custa uma conversa
    entre duas pessoas; errar por barrar custa o anúncio inteiro.
    """
    cartas = list({card_id for card_id, _ in pedidos})
    res = await session.execute(_ACABAMENTOS_DAS_CARTAS, {"ids": cartas})

    catalogados: dict[str, list[int]] = {}
    for linha in res.mappings().all():
        catalogados.setdefault(linha["card_id"], []).append(linha["finish_id"])

    resolvidos: list[int] = []
    for card_id, escolhido in pedidos:
        opcoes = catalogados.get(card_id, [])
        if escolhido is None:
            resolvidos.append(NORMAL if NORMAL in opcoes or not opcoes else opcoes[0])
            continue
        if opcoes and escolhido not in opcoes:
            raise RegraNegocio(
                "ACABAMENTO_INVALIDO",
                "Essa carta não existe nesse acabamento.",
                campo="finish_id",
                status_code=422,
            )
        resolvidos.append(escolhido)
    return resolvidos


def _params(user_id: UUID, item: AnuncioItem, finish_id: int) -> dict:
    return {
        "user_id": str(user_id),
        "card_id": str(item.card_id),
        "tipo": item.tipo,
        "quantidade": item.quantidade,
        "condicao": item.condicao,
        "finish_id": finish_id,
        "idioma": item.idioma,
        "prioridade": item.prioridade,
        "aceita_qualquer_finish": item.aceita_qualquer_finish,
    }


async def criar_anuncio(
    session: AsyncSession, user_id: UUID, item: AnuncioItem
) -> AnuncioOut:
    (finish_id,) = await _resolver_acabamentos(
        session, [(str(item.card_id), item.finish_id)]
    )
    try:
        res = await session.execute(_UPSERT, _params(user_id, item, finish_id))
        row = res.mappings().first()
        if item.tipo == "OFERTA":
            await _checar_teto_de_ofertas(session, user_id)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir(exc) from exc
    except RegraNegocio:
        await session.rollback()
        raise
    assert row is not None
    return AnuncioOut(**dict(row))


async def criar_bulk(
    session: AsyncSession, user_id: UUID, itens: list[AnuncioItem]
) -> int:
    """Persiste o lote do onboarding e marca onboarding_ok. Retorna quantos entraram."""
    # Uma consulta para o lote todo, não uma por carta: são até 300 itens.
    acabamentos = await _resolver_acabamentos(
        session, [(str(i.card_id), i.finish_id) for i in itens]
    )
    try:
        for item, finish_id in zip(itens, acabamentos, strict=True):
            await session.execute(_UPSERT, _params(user_id, item, finish_id))
        await session.execute(
            text("update profiles set onboarding_ok = true where id = :id"),
            {"id": str(user_id)},
        )
        if any(i.tipo == "OFERTA" for i in itens):
            await _checar_teto_de_ofertas(session, user_id)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir(exc) from exc
    except RegraNegocio:
        await session.rollback()
        raise
    return len(itens)


async def listar_anuncios(
    session: AsyncSession, user_id: UUID, tipo: str | None
) -> list[AnuncioOut]:
    sql = f"select {_COLUNAS} from listings where user_id = :id and ativo = true"
    params: dict[str, object] = {"id": str(user_id)}
    if tipo:
        sql += " and tipo = :tipo"
        params["tipo"] = tipo
    # O desempate por id não é enfeite: `criar_bulk` grava o lote inteiro numa
    # transação só, e o now() do Postgres é o horário de início da transação —
    # então todo o onboarding compartilha o mesmo criado_em. Sem o desempate a
    # ordem fica indeterminada e as cartas trocam de lugar a cada refetch, o que
    # faz o usuário clicar no controle da carta errada.
    sql += " order by criado_em desc, id"
    res = await session.execute(text(sql), params)
    return [AnuncioOut(**dict(r)) for r in res.mappings().all()]


async def obter_anuncio(
    session: AsyncSession, user_id: UUID, anuncio_id: UUID
) -> AnuncioOut:
    res = await session.execute(
        text(
            f"select {_COLUNAS} from listings "
            "where id = :id and user_id = :user_id and ativo = true"
        ),
        {"id": str(anuncio_id), "user_id": str(user_id)},
    )
    row = res.mappings().first()
    if row is None:
        raise _nao_encontrado()
    return AnuncioOut(**dict(row))


async def atualizar_anuncio(
    session: AsyncSession,
    user_id: UUID,
    anuncio_id: UUID,
    dados: AnuncioAtualizar,
) -> AnuncioOut:
    """Edição inline. PATCH vazio devolve o anúncio como está, sem tocar no banco."""
    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        return await obter_anuncio(session, user_id, anuncio_id)

    # A carta não vem no corpo do PATCH — e sem ela não dá para saber se o
    # acabamento novo existe para aquela carta. Só busca quando o campo veio.
    if "finish_id" in campos:
        atual = await obter_anuncio(session, user_id, anuncio_id)
        await _resolver_acabamentos(session, [(atual.card_id, campos["finish_id"])])

    sets = ", ".join(f"{c} = :{c}" for c in campos)
    params: dict[str, object] = {**campos}
    params["id"] = str(anuncio_id)
    params["user_id"] = str(user_id)

    try:
        res = await session.execute(
            text(
                f"update listings set {sets} "
                "where id = :id and user_id = :user_id and ativo = true "
                f"returning {_COLUNAS}"
            ),
            params,
        )
        row = res.mappings().first()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir(exc) from exc

    if row is None:
        raise _nao_encontrado()
    return AnuncioOut(**dict(row))


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
        raise _nao_encontrado()


# A carta que saiu da mão de quem deu. Uma linha por (dono, carta, condição,
# acabamento), com a contagem: uma proposta pode levar duas cópias do mesmo
# anúncio, e um `update ... from` sem o agrupamento desceria uma unidade só.
#
# O casamento é exato em condição e acabamento porque `match_items` copiou os
# dois do anúncio quando a troca foi montada — é a mesma carta física, não uma
# equivalente.
_BAIXA_OFERTA = text("""
    with saidas as (
      select de_user_id, card_id, condicao, finish_id, count(*) as n
      from match_items where match_id = :m
      group by 1, 2, 3, 4
    )
    update listings l
       set quantidade = greatest(l.quantidade - s.n, 0),
           ativo = case when l.quantidade - s.n <= 0 then false else l.ativo end
      from saidas s
     where l.user_id = s.de_user_id
       and l.card_id = s.card_id
       and l.tipo = 'OFERTA'
       and l.condicao = s.condicao
       and l.finish_id = s.finish_id
""")

# A carta que entrou na mão de quem recebeu — e some da procura dele.
#
# Aqui o casamento **não** é exato, e não pode ser: a condição do Procuro é o
# mínimo aceitável, não o que chegou (quem procura em NM aceita a carta que veio
# melhor), e `aceita_qualquer_finish` existe justamente para fechar troca com
# acabamento diferente. Por isso a linha alvo é escolhida por preferência —
# mesmo acabamento primeiro, depois a que aceita qualquer um — e nunca por
# igualdade. Sem Procuro cadastrado (quem trocou porque quis, não porque
# procurava) não há o que baixar, e o `left join` implícito do subselect
# devolve nulo sem tocar em nada.
_BAIXA_PROCURA = text("""
    with entradas as (
      select para_user_id, card_id, finish_id, count(*) as n
      from match_items where match_id = :m
      group by 1, 2, 3
    ),
    alvos as (
      select e.n,
             (select l.id from listings l
               where l.user_id = e.para_user_id
                 and l.card_id = e.card_id
                 and l.tipo = 'PROCURA'
                 and l.ativo = true
                 and (l.finish_id = e.finish_id or l.aceita_qualquer_finish)
               order by (l.finish_id = e.finish_id) desc, l.criado_em
               limit 1) as listing_id
        from entradas e
    )
    update listings l
       set quantidade = greatest(l.quantidade - a.n, 0),
           ativo = case when l.quantidade - a.n <= 0 then false else l.ativo end
      from alvos a
     where l.id = a.listing_id
""")


async def baixar_por_troca(session: AsyncSession, match_id: UUID) -> None:
    """Consome uma unidade de cada lado quando a troca é concluída.

    A quantidade existia no cadastro desde o começo e nunca era consumida: quem
    trocava a última cópia continuava com ela anunciada, e a próxima pessoa
    propunha por uma carta que já tinha ido embora. Some da OFERTA de quem deu e
    da PROCURA de quem recebeu — a segunda porque a procura foi atendida, e uma
    lista de desejos que não encolhe deixa de ser uma lista de desejos.

    **Na conclusão, não no aceite.** Aceitar é combinar um encontro; até ele
    acontecer a carta continua com o dono, e sumir da vitrine nesse ponto
    esconderia carta que ainda existe — inclusive quando a troca fura, que é
    exatamente quando ela precisa voltar a aparecer. O preço dessa escolha é a
    janela entre o aceite e a conclusão, em que outra pessoa ainda pode propor
    pela mesma carta; quem protege esse intervalo é o prazo de 7 dias e o índice
    de uma negociação aberta por dupla, não o estoque.

    Zerou, o anúncio é desativado em vez de apagado: a linha desativada é o que
    faz o recadastro cair no upsert que reativa (ver `_UPSERT`) em vez de bater
    no índice único. E `greatest(…, 0)` é rede de segurança — o piso zero passou
    a ser permitido na migração `27`, mas nada aqui deve depender de a contagem
    do banco estar perfeita para não gravar número negativo.

    Sem commit: quem chama é a conclusão do match, e a baixa tem de viver ou
    morrer com ela. Uma troca desfeita que já tivesse consumido o estoque
    deixaria a carta fora da vitrine sem nenhuma troca para justificar.
    """
    await session.execute(_BAIXA_OFERTA, {"m": str(match_id)})
    await session.execute(_BAIXA_PROCURA, {"m": str(match_id)})


def _nao_encontrado() -> RegraNegocio:
    return RegraNegocio(
        "ANUNCIO_NAO_ENCONTRADO", "Anúncio não encontrado.", status_code=404
    )


def _traduzir(exc: IntegrityError) -> RegraNegocio:
    detalhe = str(getattr(exc, "orig", exc))

    # Precisa vir antes das checagens de coluna: a unique key inclui card_id e
    # finish_id, então uma violação dela cairia no branch errado e diria
    # "carta não encontrada" para o que é, na verdade, anúncio duplicado.
    if (
        "duplicate key" in detalhe
        or "UniqueViolation" in type(getattr(exc, "orig", exc)).__name__
    ):
        return RegraNegocio(
            "ANUNCIO_DUPLICADO",
            "Você já tem essa carta na lista com essa condição.",
            campo="condicao",
            status_code=409,
        )

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
