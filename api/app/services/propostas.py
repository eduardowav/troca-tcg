"""Regra de negócio da proposta — a troca que o matcher não enxerga.

A proposta nasce da vitrine (services/vitrine) e morre no aceite: a partir dali
é um `matches` comum e responde a tudo o que a seção 13 já resolve — prazo,
prorrogação, revelação de contato, conclusão bilateral, furo, denúncia,
reputação. Nada disso é reescrito aqui, e essa é a razão de a proposta ser uma
tabela à parte convertida no aceite, em vez de mais estados dentro de `matches`
(ver o cabeçalho de db/schema/23_propostas.sql).

Três regras moram neste arquivo e em nenhum outro lugar:

1. **Vez.** Quem responde é `vez_de`. Contrapropor não muda o status — a
   proposta continua ABERTA —, muda de quem é a vez. Por isso não existe status
   CONTRAPROPOSTA: status é desfecho, vez é coluna.
2. **Rodada.** Teto de 4. Na rodada 4 só restam aceitar e recusar.
3. **Itens entram por anúncio.** Nunca por carta solta: é o anúncio que prova
   que a carta existe naquele acabamento e naquela condição, e é o sumiço dele
   que faz a proposta caducar.

O que **não** mora aqui: reputação. Recusar não é furar — é a resposta que o
produto está pedindo, e cobrá-la faria as pessoas pararem de responder.
"""

from uuid import UUID

from sqlalchemy import bindparam, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.core.limites import limites_de
from app.schemas.proposta import (
    ContrapropostaCriar,
    ItemProposta,
    PropostaCriar,
    PropostaOut,
    PropostaResumo,
    RodadaProposta,
)
from app.services import notificacoes

#: Teto de rodadas, o mesmo do check em db/schema/23. Rodada 1 é a proposta; 2,
#: 3 e 4 são contrapropostas. Duplicar aqui é de propósito: o banco é a garantia
#: e a API é a mensagem de erro decente — sem isto, estourar o teto viraria 500
#: em vez de RODADA_ESGOTADA.
MAX_RODADAS = 4

#: 72h por rodada, e não os 7 dias do match: prazo de match é o tempo de marcar
#: um encontro presencial; prazo de proposta é o tempo de responder uma pergunta
#: no celular. Reinicia a cada rodada.
PRAZO_DA_RODADA = "72 hours"

#: Prazo do match que o aceite cria — o mesmo default de `matches`, repetido
#: aqui porque o insert declara a coluna.
PRAZO_DO_MATCH = "7 days"

CAIXAS = ("recebidas", "enviadas", "minha_vez", "historico")


def _nao_encontrada() -> RegraNegocio:
    """404 e não 403, como no resto da API: para quem não participa, a proposta
    não existe — confirmar que existe já entregaria informação."""
    return RegraNegocio(
        "PROPOSTA_NAO_ENCONTRADA", "Proposta não encontrada.", status_code=404
    )


def _encerrada() -> RegraNegocio:
    return RegraNegocio(
        "PROPOSTA_ENCERRADA",
        "Essa proposta já foi respondida.",
        status_code=409,
    )


def hash_grupo(proposta_id: str) -> str:
    """A chave de dedup do match que o aceite cria.

    `PROPOSTA:{id}`, nunca `DIRETO:{a}:{b}` — o hash direto é único por par de
    pessoas e já está ocupado pela sugestão que o matcher mantém para a mesma
    dupla. Com ele aqui, o unique derrubaria o aceite justamente das duplas que
    também dão match automático. Como o match nasce ACEITO e nunca SUGERIDO, o
    `sincronizar_matches` também não o apaga na varredura de sugestões.
    """
    return f"PROPOSTA:{proposta_id}"


# --------------------------------------------------------------------- leitura

# Uma proposta com os dois lados nomeados. O `where` é a autorização: quem não é
# autor nem destinatário não recebe linha, e sem linha a rota devolve 404.
_PROPOSTA = """
    select p.id::text as id, p.status::text as status, p.rodada,
           p.criada_em, p.expira_em, p.respondida_em,
           p.match_id::text as match_id,
           p.autor_id::text as autor_id, p.destinatario_id::text as destinatario_id,
           p.vez_de::text as vez_de_id,
           a.username as autor, a.nome_exibicao as autor_nome,
           d.username as destinatario, d.nome_exibicao as destinatario_nome
    from propostas p
    join profiles a on a.id = p.autor_id
    join profiles d on d.id = p.destinatario_id
"""

_UMA_PROPOSTA = text(f"""
    {_PROPOSTA}
    where p.id = cast(:id as uuid)
      and cast(:eu as uuid) in (p.autor_id, p.destinatario_id)
""")

# As caixas de `/me/propostas`. Cada uma responde a uma pergunta diferente da
# tela, e só `minha_vez` alimenta a badge da aba: proposta enviada e ainda não
# respondida não é tarefa de quem enviou.
_FILTROS_DA_CAIXA = {
    "recebidas": "p.destinatario_id = cast(:eu as uuid) and p.status = 'ABERTA'",
    "enviadas": "p.autor_id = cast(:eu as uuid) and p.status = 'ABERTA'",
    "minha_vez": "p.vez_de = cast(:eu as uuid) and p.status = 'ABERTA'",
    "historico": (
        "cast(:eu as uuid) in (p.autor_id, p.destinatario_id) and p.status <> 'ABERTA'"
    ),
}

# Aberta ordena por urgência (o que vence primeiro está no topo); histórico
# ordena por recência, como o histórico de matches.
_ORDEM_DA_CAIXA = {
    "recebidas": "p.expira_em",
    "enviadas": "p.expira_em",
    "minha_vez": "p.expira_em",
    "historico": "coalesce(p.respondida_em, p.criada_em) desc",
}

# Os itens de várias propostas de uma vez, agrupados depois em Python. O
# `expanding` monta o `in (...)` com um parâmetro por id — os ids nunca entram
# no texto do SQL — e é o que evita duas idas ao banco por proposta da lista.
#
# O left join com `listings` é o vínculo vivo: `disponivel` diz se o anúncio
# ainda está no ar *agora*. Quando ele sai, o `on delete set null` da FK zera o
# `listing_id` e a carta continua legível pela cópia guardada no item — é o que
# permite a tela dizer "esta carta saiu do ar" em vez de sumir com a linha.
_ITENS = text("""
    select pi.proposta_id::text as proposta_id, pi.rodada,
           pi.listing_id::text as listing_id, pi.card_id::text as card_id,
           pi.de_user_id::text as de_user_id, pi.para_user_id::text as para_user_id,
           pi.condicao::text as condicao, pi.finish_id, pi.quantidade,
           (l.id is not null) as disponivel
    from proposta_itens pi
    left join listings l on l.id = pi.listing_id and l.ativo
    where pi.proposta_id in :ids
    order by pi.rodada, pi.card_id
""").bindparams(bindparam("ids", expanding=True))


def _quem_jogou(linha: dict, rodada: int) -> tuple[str, str]:
    """(id, @) de quem jogou uma rodada.

    A vez alterna a cada rodada e a rodada 1 é sempre de quem abriu, então a
    paridade basta: ímpar é o autor, par é o destinatário. Derivar dos itens
    seria mais indireto e daria o mesmo resultado — cada rodada é jogada por uma
    pessoa só, e o trigger `proposta_item_coerente` garante que os itens são dos
    dois lados da negociação.
    """
    if rodada % 2 == 1:
        return linha["autor_id"], linha["autor"]
    return linha["destinatario_id"], linha["destinatario"]


def _monta_rodadas(linha: dict, itens: list[dict]) -> list[RodadaProposta]:
    """Agrupa os itens em rodadas, cada uma vista por quem a jogou."""
    por_rodada: dict[int, RodadaProposta] = {}
    for item in itens:
        rodada = item["rodada"]
        jogador_id, jogador = _quem_jogou(linha, rodada)
        atual = por_rodada.get(rodada)
        if atual is None:
            atual = RodadaProposta(rodada=rodada, por=jogador, quero=[], ofereco=[])
            por_rodada[rodada] = atual

        carta = ItemProposta(
            listing_id=item["listing_id"],
            card_id=item["card_id"],
            condicao=item["condicao"],
            finish_id=item["finish_id"],
            quantidade=item["quantidade"],
            disponivel=item["disponivel"],
        )
        # Quem jogou a rodada pede o que vem na direção dele e entrega o resto.
        if item["para_user_id"] == jogador_id:
            atual.quero.append(carta)
        else:
            atual.ofereco.append(carta)

    return [por_rodada[r] for r in sorted(por_rodada)]


async def _itens_das_propostas(
    session: AsyncSession, ids: list[str]
) -> dict[str, list[dict]]:
    if not ids:
        return {}
    linhas = (await session.execute(_ITENS, {"ids": ids})).mappings().all()
    por_proposta: dict[str, list[dict]] = {}
    for linha in linhas:
        por_proposta.setdefault(linha["proposta_id"], []).append(dict(linha))
    return por_proposta


def _resumo(linha: dict, eu: str, itens: list[dict]) -> PropostaResumo:
    corrente = [i for i in itens if i["rodada"] == linha["rodada"]]
    rodadas = _monta_rodadas(linha, corrente)
    sou_autor = linha["autor_id"] == eu
    vez_do_autor = linha["vez_de_id"] == linha["autor_id"]
    return PropostaResumo(
        id=linha["id"],
        status=linha["status"],
        rodada=linha["rodada"],
        vez_de=linha["autor"] if vez_do_autor else linha["destinatario"],
        com=linha["destinatario"] if sou_autor else linha["autor"],
        com_nome=linha["destinatario_nome"] if sou_autor else linha["autor_nome"],
        minha_vez=linha["vez_de_id"] == eu,
        criada_em=linha["criada_em"],
        expira_em=linha["expira_em"],
        respondida_em=linha["respondida_em"],
        match_id=linha["match_id"],
        atual=rodadas[0] if rodadas else None,
    )


async def listar(
    session: AsyncSession, user_id: UUID, caixa: str = "minha_vez", limite: int = 50
) -> list[PropostaResumo]:
    """As propostas de uma caixa, com a rodada corrente já dentro de cada uma."""
    if caixa not in _FILTROS_DA_CAIXA:
        raise RegraNegocio(
            "CAIXA_INVALIDA",
            "Caixa de propostas desconhecida.",
            campo="caixa",
            status_code=422,
        )

    linhas = (
        (
            await session.execute(
                text(f"""
                    {_PROPOSTA}
                    where {_FILTROS_DA_CAIXA[caixa]}
                    order by {_ORDEM_DA_CAIXA[caixa]}
                    limit :limite
                """),
                {"eu": str(user_id), "limite": limite},
            )
        )
        .mappings()
        .all()
    )

    itens = await _itens_das_propostas(session, [linha["id"] for linha in linhas])
    return [
        _resumo(dict(linha), str(user_id), itens.get(linha["id"], []))
        for linha in linhas
    ]


async def obter(session: AsyncSession, user_id: UUID, proposta_id: UUID) -> PropostaOut:
    """O detalhe: todas as rodadas, em ordem — é ele que a tela lê como conversa."""
    linha = await _carregar(session, user_id, proposta_id)
    itens = (await _itens_das_propostas(session, [linha["id"]])).get(linha["id"], [])
    resumo = _resumo(linha, str(user_id), itens)
    return PropostaOut(
        **resumo.model_dump(),
        autor=linha["autor"],
        destinatario=linha["destinatario"],
        rodadas=_monta_rodadas(linha, itens),
    )


async def _carregar(session: AsyncSession, user_id: UUID, proposta_id: UUID) -> dict:
    linha = (
        (
            await session.execute(
                _UMA_PROPOSTA, {"id": str(proposta_id), "eu": str(user_id)}
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        raise _nao_encontrada()
    return dict(linha)


# --------------------------------------------------------------------- escrita


async def _validar_itens(
    session: AsyncSession, dono_id: str, listing_ids: list[UUID]
) -> list[dict]:
    """Os anúncios existem, estão no ar e são de quem se diz dono deles.

    Sem esta checagem, uma proposta poderia oferecer a carta de um terceiro ou
    pedir uma carta que saiu do ar entre montar a tela e apertar o botão — e o
    erro só apareceria no aceite, quando a outra pessoa já tivesse decidido.

    Devolve a cópia que vai para `proposta_itens`: card, condição e acabamento
    são gravados junto do `listing_id` porque o anúncio é volátil e um histórico
    que depende dele se reescreve sozinho.
    """
    # dict.fromkeys tira duplicata mantendo a ordem: a mesma carta duas vezes na
    # mesma rodada bateria no unique idx_proposta_item_unico, e o segundo clique
    # num card da tela não é erro do usuário.
    ids = list(dict.fromkeys(str(x) for x in listing_ids))

    linhas = (
        (
            await session.execute(
                text("""
                    select id::text as listing_id, card_id::text as card_id,
                           condicao::text as condicao, finish_id
                    from listings
                    where id in :ids
                      and user_id = cast(:dono as uuid)
                      and ativo and tipo = 'OFERTA'
                """).bindparams(bindparam("ids", expanding=True)),
                {"ids": ids, "dono": dono_id},
            )
        )
        .mappings()
        .all()
    )

    if len(linhas) != len(ids):
        raise RegraNegocio(
            "ANUNCIO_INDISPONIVEL",
            "Alguma dessas cartas saiu do ar. Recarregue e monte de novo.",
            status_code=409,
        )
    return [dict(linha) for linha in linhas]


_INSERIR_ITEM = text("""
    insert into proposta_itens
      (proposta_id, rodada, listing_id, card_id, de_user_id, para_user_id,
       condicao, finish_id, quantidade)
    values
      (cast(:proposta as uuid), :rodada, cast(:listing as uuid),
       cast(:card as uuid), cast(:de as uuid), cast(:para as uuid),
       :condicao, :finish_id, 1)
""")


async def _gravar_itens(
    session: AsyncSession,
    proposta_id: str,
    rodada: int,
    *,
    quero: list[dict],
    ofereco: list[dict],
    eu: str,
    outro: str,
) -> None:
    """As duas direções da rodada, numa ida só ao banco.

    Quantidade é sempre 1: o contrato manda ids de anúncio, não pares
    (anúncio, quantidade). A coluna existe no banco para o dia em que a tela
    perguntar — enquanto não pergunta, duas unidades da mesma carta seriam duas
    linhas, e o unique por (proposta, rodada, anúncio) não deixa.
    """
    params = [
        {
            "proposta": proposta_id,
            "rodada": rodada,
            "listing": item["listing_id"],
            "card": item["card_id"],
            "de": outro,
            "para": eu,
            "condicao": item["condicao"],
            "finish_id": item["finish_id"],
        }
        for item in quero
    ] + [
        {
            "proposta": proposta_id,
            "rodada": rodada,
            "listing": item["listing_id"],
            "card": item["card_id"],
            "de": eu,
            "para": outro,
            "condicao": item["condicao"],
            "finish_id": item["finish_id"],
        }
        for item in ofereco
    ]
    await session.execute(_INSERIR_ITEM, params)


async def _checar_limite_diario(session: AsyncSession, user_id: UUID) -> None:
    """O teto de propostas abertas por dia, por plano.

    É limite de plano e não constraint porque constraint não distingue FREE de
    PRO (ver core/limites.py e a seção 22.5). Conta as últimas 24h em vez do dia
    do calendário: a janela móvel não devolve cota de presente à meia-noite, que
    é justamente quando um disparo em massa passaria despercebido.

    O antiabuso principal não é este — é o "uma negociação aberta por dupla" do
    índice único. Este aqui cobre o outro caso: uma pessoa abrindo proposta para
    a base inteira, uma para cada.
    """
    # `for update` trava a linha de quem está abrindo a proposta até o fim da
    # transação, e é o que torna o teto um teto (F-06 da auditoria de
    # 2026-08-18). Sem ela isto é contar-e-depois-gravar: dez requisições
    # simultâneas leem as mesmas "nove abertas hoje", as dez passam, e o limite
    # que existe para impedir disparo em massa é furado exatamente pelo disparo
    # em massa — o caso que ele foi escrito para pegar.
    #
    # A trava é na própria pessoa, que é a unidade do limite. Duas pessoas
    # abrindo proposta ao mesmo tempo não esperam uma pela outra; a mesma pessoa
    # abrindo dez de uma vez, sim.
    plano = await session.scalar(
        text("select plano from profiles where id = cast(:eu as uuid) for update"),
        {"eu": str(user_id)},
    )
    limite = limites_de(plano or "FREE").propostas_por_dia

    abertas_hoje = await session.scalar(
        text("""
            select count(*) from propostas
            where autor_id = cast(:eu as uuid)
              and criada_em > now() - interval '24 hours'
        """),
        {"eu": str(user_id)},
    )
    if (abertas_hoje or 0) >= limite:
        raise RegraNegocio(
            "LIMITE_DE_PROPOSTAS",
            "Você já enviou muitas propostas hoje. Tente de novo amanhã.",
            status_code=429,
        )


async def abrir(
    session: AsyncSession, user_id: UUID, dados: PropostaCriar
) -> PropostaOut:
    """Abre a negociação: rodada 1, e a vez é de quem recebeu.

    A vez nasce do outro lado porque quem abriu já jogou. É essa mesma leitura
    que faz a badge da aba contar só o que espera resposta *minha*.
    """
    destinatario = (
        (
            await session.execute(
                text("""
                    select id::text as id from profiles
                    where username = :u and bloqueado = false
                """),
                {"u": dados.para},
            )
        )
        .mappings()
        .first()
    )
    if destinatario is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO",
            "Não encontramos ninguém com esse @.",
            campo="para",
            status_code=404,
        )
    if destinatario["id"] == str(user_id):
        raise RegraNegocio(
            "PROPOSTA_PARA_SI_MESMO",
            "Você não pode propor uma troca para você mesmo.",
            campo="para",
            status_code=400,
        )

    await _checar_limite_diario(session, user_id)

    quero = await _validar_itens(session, destinatario["id"], dados.quero)
    ofereco = await _validar_itens(session, str(user_id), dados.ofereco)

    try:
        linha = (
            (
                await session.execute(
                    text(f"""
                        insert into propostas
                          (autor_id, destinatario_id, rodada, vez_de, expira_em)
                        values (cast(:eu as uuid), cast(:para as uuid), 1,
                                cast(:para as uuid),
                                now() + interval '{PRAZO_DA_RODADA}')
                        returning id::text as id
                    """),
                    {"eu": str(user_id), "para": destinatario["id"]},
                )
            )
            .mappings()
            .first()
        )
        assert linha is not None
        await _gravar_itens(
            session,
            linha["id"],
            1,
            quero=quero,
            ofereco=ofereco,
            eu=str(user_id),
            outro=destinatario["id"],
        )
        # Dentro da mesma transação do insert: se a proposta não existir, o
        # aviso de que ela chegou não pode existir. É esta notificação que
        # fecha o buraco de a proposta vencer em 72h sem ninguém saber dela.
        await notificacoes.proposta_recebida(
            session,
            para=destinatario["id"],
            de=user_id,
            quem=await notificacoes.arroba(session, user_id),
            proposta_id=linha["id"],
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # idx_proposta_uma_por_dupla (db/schema/23). Deixar o índice decidir, em
        # vez de contar antes, é o que fecha a corrida entre dois envios
        # simultâneos — e cobre também o caso de o outro lado ter aberto uma
        # proposta enquanto esta tela estava montada.
        if "idx_proposta_uma_por_dupla" in str(exc.orig):
            raise RegraNegocio(
                "PROPOSTA_JA_ABERTA",
                "Já existe uma negociação aberta com essa pessoa.",
                status_code=409,
            ) from exc
        raise

    return await obter(session, user_id, UUID(linha["id"]))


def _o_outro(linha: dict, user_id: UUID) -> tuple[str, str]:
    """(id do outro lado, @ de quem está agindo).

    A linha de `_carregar` já traz os dois lados nomeados, então quem notifica
    não precisa voltar ao banco para descobrir a quem avisar nem como assinar o
    aviso. É sempre este par: para quem vai, e de quem veio.
    """
    if linha["autor_id"] == str(user_id):
        return linha["destinatario_id"], linha["autor"]
    return linha["autor_id"], linha["destinatario"]


def _exigir_aberta(linha: dict) -> None:
    if linha["status"] != "ABERTA":
        raise _encerrada()


def _exigir_minha_vez(linha: dict, user_id: UUID) -> None:
    if linha["vez_de_id"] != str(user_id):
        raise RegraNegocio(
            "NAO_E_SUA_VEZ",
            "Agora é a outra pessoa que precisa responder.",
            status_code=409,
        )


async def _encerrar(session: AsyncSession, proposta_id: str, status: str) -> None:
    """Fecha a proposta num desfecho, se ela ainda estiver aberta.

    O `where status = 'ABERTA'` é o guarda de corrida: os dois lados podem
    apertar botões ao mesmo tempo, e sem ele o segundo sobrescreveria o desfecho
    do primeiro. Quem não achou linha para atualizar perdeu a corrida e recebe o
    mesmo 409 de quem chegou tarde.
    """
    res = await session.execute(
        text("""
            update propostas
               set status = cast(:s as proposta_status), respondida_em = now()
             where id = cast(:id as uuid) and status = 'ABERTA'
        """),
        {"s": status, "id": proposta_id},
    )
    if res.rowcount == 0:
        await session.rollback()
        raise _encerrada()


async def recusar(
    session: AsyncSession, user_id: UUID, proposta_id: UUID
) -> PropostaOut:
    """Encerra sem contraproposta. Não toca em reputação — recusar não é furar."""
    linha = await _carregar(session, user_id, proposta_id)
    _exigir_aberta(linha)
    _exigir_minha_vez(linha, user_id)

    await _encerrar(session, linha["id"], "RECUSADA")
    outro, eu = _o_outro(linha, user_id)
    await notificacoes.proposta_recusada(
        session, para=outro, de=user_id, quem=eu, proposta_id=linha["id"]
    )
    await session.commit()
    return await obter(session, user_id, proposta_id)


async def retirar(
    session: AsyncSession, user_id: UUID, proposta_id: UUID
) -> PropostaOut:
    """Desiste da própria jogada, antes de o outro responder.

    Quem retira é quem **fez** a última jogada — ou seja, quem *não* tem a vez.
    Quem tem a vez não precisa disto: para ela existem aceitar, recusar e
    contrapropor, que são respostas, e retirar seria um quarto botão dizendo a
    mesma coisa que recusar.

    É a saída de quem se arrependeu: mandou a carta errada, vendeu a carta, ou
    simplesmente mudou de ideia antes de a outra pessoa olhar. Sem ela, a única
    saída seria deixar as 72h vencerem — e proposta pendurada é o que tranca a
    dupla, porque só existe uma negociação aberta por dupla.
    """
    linha = await _carregar(session, user_id, proposta_id)
    _exigir_aberta(linha)
    if linha["vez_de_id"] == str(user_id):
        raise RegraNegocio(
            "NAO_E_SUA_JOGADA",
            "Esta proposta está esperando a sua resposta — aceite, recuse ou "
            "contraproponha.",
            status_code=409,
        )

    await _encerrar(session, linha["id"], "RETIRADA")
    outro, eu = _o_outro(linha, user_id)
    await notificacoes.proposta_retirada(
        session, para=outro, de=user_id, quem=eu, proposta_id=linha["id"]
    )
    await session.commit()
    return await obter(session, user_id, proposta_id)


async def contrapropor(
    session: AsyncSession, user_id: UUID, proposta_id: UUID, dados: ContrapropostaCriar
) -> PropostaOut:
    """Nova rodada: outros itens, a vez volta para o outro lado, prazo reinicia.

    Não muda o status de propósito — a proposta continua ABERTA. Contrapropor é
    a conversa acontecendo, não um desfecho, e é por isso que a tela consegue
    listar "o que está em aberto" sem a pergunta impossível "aberta ou
    contraproposta?".
    """
    linha = await _carregar(session, user_id, proposta_id)
    _exigir_aberta(linha)
    _exigir_minha_vez(linha, user_id)

    if linha["rodada"] >= MAX_RODADAS:
        raise RegraNegocio(
            "RODADA_ESGOTADA",
            "Esta negociação chegou ao limite de rodadas. Agora é aceitar ou recusar.",
            status_code=409,
        )

    outro = (
        linha["destinatario_id"]
        if linha["autor_id"] == str(user_id)
        else linha["autor_id"]
    )
    quero = await _validar_itens(session, outro, dados.quero)
    ofereco = await _validar_itens(session, str(user_id), dados.ofereco)

    # A rodada sobe antes dos itens porque o trigger `proposta_item_coerente`
    # recusa item de rodada futura — e o `and rodada = :rodada` fecha a corrida
    # de dois cliques no mesmo botão: o segundo não acha linha e para aqui.
    res = await session.execute(
        text(f"""
            update propostas
               set rodada = rodada + 1,
                   vez_de = cast(:outro as uuid),
                   expira_em = now() + interval '{PRAZO_DA_RODADA}'
             where id = cast(:id as uuid)
               and status = 'ABERTA'
               and vez_de = cast(:eu as uuid)
               and rodada = :rodada
        """),
        {
            "id": linha["id"],
            "outro": outro,
            "eu": str(user_id),
            "rodada": linha["rodada"],
        },
    )
    if res.rowcount == 0:
        await session.rollback()
        raise _encerrada()

    await _gravar_itens(
        session,
        linha["id"],
        linha["rodada"] + 1,
        quero=quero,
        ofereco=ofereco,
        eu=str(user_id),
        outro=outro,
    )
    # A contraproposta é o caso em que a vez muda de mãos sem a proposta mudar
    # de status: sem aviso, ela é indistinguível de nada ter acontecido.
    _, eu_arroba = _o_outro(linha, user_id)
    await notificacoes.proposta_sua_vez(
        session,
        para=outro,
        de=user_id,
        quem=eu_arroba,
        proposta_id=linha["id"],
        rodada=linha["rodada"] + 1,
    )
    await session.commit()
    return await obter(session, user_id, proposta_id)


async def aceitar(
    session: AsyncSession, user_id: UUID, proposta_id: UUID
) -> PropostaOut:
    """O aceite: nasce o match e a proposta vira histórico.

    O match nasce `PROPOSTA`/`ACEITO`, com os dois participantes já com
    `aceitou = true` — não há segundo aceite a esperar, porque a negociação
    inteira foi o aceite. Daí em diante nada é novo: prazo, prorrogação,
    contato, conclusão bilateral, furo e denúncia são os do match comum.

    Os itens da rodada corrente viram `match_items`. Quantidade não vai junto
    porque `match_items` não tem a coluna — hoje isso não perde informação, já
    que toda linha de proposta é 1 (ver `_gravar_itens`).
    """
    linha = await _carregar(session, user_id, proposta_id)
    _exigir_aberta(linha)
    _exigir_minha_vez(linha, user_id)

    # Uma carta que saiu do ar no meio da conversa não pode virar troca
    # combinada: seria marcar um encontro para entregar o que não existe mais.
    indisponiveis = await session.scalar(
        text("""
            select count(*)
            from proposta_itens pi
            left join listings l on l.id = pi.listing_id and l.ativo
            where pi.proposta_id = cast(:id as uuid)
              and pi.rodada = :rodada
              and l.id is null
        """),
        {"id": linha["id"], "rodada": linha["rodada"]},
    )
    if indisponiveis:
        raise RegraNegocio(
            "ANUNCIO_INDISPONIVEL",
            "Alguma carta desta proposta saiu do ar. Peça uma nova proposta.",
            status_code=409,
        )

    match = (
        (
            await session.execute(
                text(f"""
                    insert into matches (tipo, status, score, hash_grupo, expira_em)
                    values ('PROPOSTA', 'ACEITO', 0, :hash,
                            now() + interval '{PRAZO_DO_MATCH}')
                    returning id::text as id
                """),
                {"hash": hash_grupo(linha["id"])},
            )
        )
        .mappings()
        .first()
    )
    assert match is not None
    match_id = match["id"]

    # Participantes em ordem estável, como em `_gravar_match`: "posicao" não pode
    # depender de quem apertou o botão. Os dois já entram com aceite registrado.
    primeiro, segundo = sorted([linha["autor_id"], linha["destinatario_id"]])
    await session.execute(
        text("""
            insert into match_participants
              (match_id, user_id, posicao, aceitou, respondeu_em)
            values (cast(:m as uuid), cast(:u0 as uuid), 0, true, now()),
                   (cast(:m as uuid), cast(:u1 as uuid), 1, true, now())
        """),
        {"m": match_id, "u0": primeiro, "u1": segundo},
    )

    await session.execute(
        text("""
            insert into match_items
              (match_id, card_id, de_user_id, para_user_id, condicao, finish_id)
            select cast(:m as uuid), card_id, de_user_id, para_user_id,
                   condicao, finish_id
            from proposta_itens
            where proposta_id = cast(:p as uuid) and rodada = :rodada
        """),
        {"m": match_id, "p": linha["id"], "rodada": linha["rodada"]},
    )

    # O evento guarda de qual proposta o match nasceu. É o rastro que separa,
    # depois, a troca que veio da vitrine da que veio do motor — a pergunta que
    # decide se a vitrine fica.
    await session.execute(
        text("""
            insert into match_events (match_id, user_id, evento, payload)
            values (cast(:m as uuid), cast(:u as uuid), 'ACEITO',
                    cast(:payload as jsonb))
        """),
        {
            "m": match_id,
            "u": str(user_id),
            "payload": f'{{"proposta": "{linha["id"]}"}}',
        },
    )

    res = await session.execute(
        text("""
            update propostas
               set status = 'ACEITA', respondida_em = now(),
                   match_id = cast(:m as uuid)
             where id = cast(:id as uuid) and status = 'ABERTA'
        """),
        {"m": match_id, "id": linha["id"]},
    )
    if res.rowcount == 0:
        # Alguém encerrou a proposta entre a leitura e aqui: o match recém-criado
        # não tem dono e some junto com o rollback.
        await session.rollback()
        raise _encerrada()

    # O link vai para o match, não para a proposta: o que interessa a quem
    # recebe o aviso é o contato, e ele está do outro lado.
    outro, eu_arroba = _o_outro(linha, user_id)
    await notificacoes.proposta_aceita(
        session, para=outro, de=user_id, quem=eu_arroba, match_id=match_id
    )
    await session.commit()
    return await obter(session, user_id, proposta_id)


async def expirar_propostas(session: AsyncSession) -> int:
    """Fecha as negociações que passaram das 72h. Devolve quantas expiraram.

    Não commita, como `expirar_vencidos`: quem chama fecha a transação. Não
    registra evento nem toca em reputação — não houve encontro marcado, logo não
    houve encontro que deu errado, e proposta ignorada não é troca furada.

    `respondida_em` fica nulo de propósito: expirar não é responder, e é essa
    diferença que o histórico da tela mostra.

    A varredura é global e sai barata pelo índice parcial `idx_proposta_vencendo`
    (expira_em, só em ABERTA), que não enxerga histórico.
    """
    res = await session.execute(
        text("""
            update propostas set status = 'EXPIRADA'
            where status = 'ABERTA' and expira_em <= now()
            returning id::text as id,
                      autor_id::text as autor_id,
                      destinatario_id::text as destinatario_id
        """)
    )
    vencidas = res.mappings().all()

    # Os dois lados são avisados, e não só quem tinha a vez: para quem deixou
    # vencer é a explicação do sumiço, e para quem esperava é a notícia de que
    # a dupla destravou — só existe uma negociação aberta por dupla.
    for linha in vencidas:
        for pessoa in (linha["autor_id"], linha["destinatario_id"]):
            await notificacoes.proposta_expirada(
                session, para=pessoa, proposta_id=linha["id"]
            )

    return len(vencidas)
