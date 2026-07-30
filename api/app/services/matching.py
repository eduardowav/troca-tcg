"""Motor de matching direto (A↔B) — a Fase 3 do roadmap.

Roda sob demanda: sempre que o usuário mexe nas listas ou abre o feed,
recalculamos os matches dele. Para uma comunidade local isso é barato e dá o
retorno imediato que um job periódico não daria — quem acabou de cadastrar a
carta já vê com quem trocar.

Duas decisões de produto embutidas aqui:

1. **Um match por par de pessoas.** Duas pessoas podem ter várias combinações
   possíveis; sugerimos só a melhor. Cinco sugestões quase iguais para o mesmo
   par diluem a atenção, e a métrica-mãe é troca concluída, não troca sugerida.

2. **Condição pedida é o mínimo aceitável.** O enum card_condition é declarado
   do melhor para o pior (NM, LP, MP, HP, DMG), então `oferta <= procura` no
   Postgres significa "a carta oferecida é pelo menos tão boa quanto a pedida".
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.schemas.match import (
    ItemMatch,
    MatchOut,
    ParticipanteCompleto,
    ParticipanteResumo,
)

# Uma OFERTA atende uma PROCURA quando é a mesma carta, no mesmo idioma, em
# condição pelo menos tão boa quanto a pedida, e com o acabamento que a pessoa
# aceita. `aceita_qualquer_finish` só existe do lado da PROCURA (05_listings.sql).
_COMPATIVEL = """
      o.card_id = p.card_id
  and o.idioma  = p.idioma
  and o.condicao <= p.condicao
  and (p.aceita_qualquer_finish or o.finish_id = p.finish_id)
  and o.tipo = 'OFERTA' and p.tipo = 'PROCURA'
  and o.ativo and p.ativo
  and o.user_id <> p.user_id
"""

# Para cada parceiro, a melhor combinação: uma carta que eu dou e uma que recebo.
# O score soma a prioridade das duas procuras atendidas (2 a 6) — quanto maior,
# mais as duas pessoas queriam justamente aquilo.
_PARES = text(f"""
with eu_dou as (
  select p.user_id as parceiro, o.card_id, o.condicao, o.finish_id, p.prioridade
  from listings o join listings p on {_COMPATIVEL}
  where o.user_id = :eu
),
eu_recebo as (
  select o.user_id as parceiro, o.card_id, o.condicao, o.finish_id, p.prioridade
  from listings o join listings p on {_COMPATIVEL}
  where p.user_id = :eu
),
combinado as (
  select d.parceiro,
         d.card_id     as card_dou,
         d.condicao    as cond_dou,
         d.finish_id   as finish_dou,
         r.card_id     as card_recebo,
         r.condicao    as cond_recebo,
         r.finish_id   as finish_recebo,
         (d.prioridade + r.prioridade) as score,
         row_number() over (
           partition by d.parceiro
           order by (d.prioridade + r.prioridade) desc, d.card_id, r.card_id
         ) as posicao
  from eu_dou d
  join eu_recebo r on r.parceiro = d.parceiro
)
select c.* from combinado c
join profiles pr on pr.id = c.parceiro
where c.posicao = 1 and pr.bloqueado = false
""")


def _nao_encontrado() -> RegraNegocio:
    return RegraNegocio(
        "MATCH_NAO_ENCONTRADO", "Match não encontrado.", status_code=404
    )


def _hash_grupo(a: UUID | str, b: UUID | str) -> str:
    """Dedup por par de pessoas, independente de quem consultou primeiro."""
    x, y = sorted([str(a), str(b)])
    return f"DIRETO:{x}:{y}"


async def expirar_vencidos(session: AsyncSession) -> int:
    """Fecha as trocas que passaram do prazo. Devolve quantas expiraram.

    Só expira o que alguém chegou a responder (PENDENTE/ACEITO). Sugestão que
    ninguém tocou não vira EXPIRADO de propósito: a métrica-mãe é
    CONCLUIDO/(CONCLUIDO+FURADO+EXPIRADO), e contar toda sugestão ignorada como
    fracasso afogaria o sinal em ruído. Sugestão vencida de par que ainda casa é
    renovada no upsert do sincronizar; a de par que não casa mais é apagada.

    A varredura é global, não só do usuário da vez — senão um match entre duas
    pessoas que sumiram do app ficaria pendurado para sempre. Sai barato porque
    o índice idx_matches_status é exatamente (status, expira_em).
    """
    res = await session.execute(
        text("""
            update matches set status = 'EXPIRADO'
            where status in ('PENDENTE', 'ACEITO') and expira_em <= now()
            returning id::text
        """)
    )
    ids = [linha["id"] for linha in res.mappings().all()]

    for match_id in ids:
        await session.execute(
            text("insert into match_events (match_id, evento) values (:m, 'EXPIRADO')"),
            {"m": match_id},
        )

    return len(ids)


async def sincronizar_matches(session: AsyncSession, user_id: UUID) -> int:
    """Recalcula os matches diretos do usuário. Devolve quantos estão vigentes.

    Só mexe no que ainda é sugestão: match que alguém já aceitou ou recusou é
    histórico, e histórico não se reescreve — inclusive porque a métrica-mãe
    depende de conseguir contar o que furou.
    """
    # Varre os vencidos antes de recalcular: sem isso, um match ACEITO que
    # passou do prazo continuaria bloqueando o hash_grupo do par e a dupla nunca
    # receberia uma sugestão nova.
    await expirar_vencidos(session)

    pares = (await session.execute(_PARES, {"eu": str(user_id)})).mappings().all()
    vigentes = {_hash_grupo(user_id, p["parceiro"]) for p in pares}

    # Sugestões que não se sustentam mais (alguém removeu a carta) somem.
    await session.execute(
        text("""
            delete from matches
            where status = 'SUGERIDO'
              and id in (
                select mp.match_id from match_participants mp
                where mp.user_id = :eu
              )
              and (:nenhum or hash_grupo <> all(:vigentes))
        """),
        {
            "eu": str(user_id),
            "vigentes": list(vigentes) or [""],
            "nenhum": not vigentes,
        },
    )

    for par in pares:
        await _gravar_match(session, user_id, par)

    await session.commit()
    return len(pares)


async def _gravar_match(session: AsyncSession, eu: UUID, par: dict) -> None:
    parceiro = par["parceiro"]
    hash_grupo = _hash_grupo(eu, parceiro)

    res = await session.execute(
        text("""
            insert into matches (tipo, status, score, hash_grupo)
            values ('DIRETO', 'SUGERIDO', :score, :hash)
            on conflict (hash_grupo) do update
              set score = excluded.score,
                  status = 'SUGERIDO',
                  expira_em = now() + interval '7 days'
              where matches.status in ('SUGERIDO', 'EXPIRADO')
            returning id::text
        """),
        {"score": par["score"], "hash": hash_grupo},
    )
    linha = res.mappings().first()
    if linha is None:
        return  # já existe e alguém respondeu: não é mais sugestão, deixa quieto

    match_id = linha["id"]

    # Se este match está ressuscitando de um EXPIRADO, os participantes ainda
    # carregam o aceite da rodada anterior — sem zerar, a tela mostraria uma
    # troca "já combinada" que na verdade acabou de ser sugerida de novo. No
    # caminho normal (match ainda SUGERIDO) isto é inócuo: ninguém respondeu.
    await session.execute(
        text("""
            update match_participants
            set aceitou = null, respondeu_em = null, confirmou_conclusao = false
            where match_id = :m
        """),
        {"m": match_id},
    )

    # Participantes em ordem estável, para "posicao" não variar entre execuções.
    for posicao, uid in enumerate(sorted([str(eu), str(parceiro)])):
        await session.execute(
            text("""
                insert into match_participants (match_id, user_id, posicao)
                values (:m, :u, :p)
                on conflict (match_id, user_id) do nothing
            """),
            {"m": match_id, "u": uid, "p": posicao},
        )

    # Itens são recalculados: a melhor combinação pode ter mudado.
    await session.execute(
        text("delete from match_items where match_id = :m"), {"m": match_id}
    )
    itens = [
        (par["card_dou"], str(eu), str(parceiro), par["cond_dou"], par["finish_dou"]),
        (
            par["card_recebo"],
            str(parceiro),
            str(eu),
            par["cond_recebo"],
            par["finish_recebo"],
        ),
    ]
    for card_id, de, para, condicao, finish_id in itens:
        await session.execute(
            text("""
                insert into match_items
                  (match_id, card_id, de_user_id, para_user_id, condicao, finish_id)
                values (:m, :c, :de, :para, :cond, :fin)
            """),
            {
                "m": match_id,
                "c": str(card_id),
                "de": de,
                "para": para,
                "cond": condicao,
                "fin": finish_id,
            },
        )


async def listar_matches(session: AsyncSession, user_id: UUID) -> list[MatchOut]:
    """Feed do usuário. Serializa ParticipanteResumo — nunca o contato."""
    linhas = (
        (
            await session.execute(
                text("""
            select m.id::text, m.tipo::text, m.status::text, m.score,
                   m.expira_em::text
            from matches m
            join match_participants mp on mp.match_id = m.id
            where mp.user_id = :eu
              and m.status in ('SUGERIDO','PENDENTE','ACEITO')
              and m.expira_em > now()
            order by m.score desc, m.criado_em desc
        """),
                {"eu": str(user_id)},
            )
        )
        .mappings()
        .all()
    )

    return [
        MatchOut(
            id=linha["id"],
            tipo=linha["tipo"],
            status=linha["status"],
            score=float(linha["score"]),
            expira_em=linha["expira_em"],
            participantes=await _participantes(session, linha["id"], completo=False),
            itens=await _itens(session, linha["id"]),
        )
        for linha in linhas
    ]


async def _participantes(
    session: AsyncSession, match_id: str, *, completo: bool
) -> list:
    colunas = (
        "p.id::text as user_id, p.username, p.nome_exibicao, "
        "p.trocas_concluidas, p.trocas_furadas, "
        "mp.aceitou, mp.confirmou_conclusao"
    )
    if completo:
        colunas += ", p.contato_visivel"

    linhas = (
        (
            await session.execute(
                text(f"""
            select {colunas}
            from match_participants mp join profiles p on p.id = mp.user_id
            where mp.match_id = :m order by mp.posicao
        """),
                {"m": match_id},
            )
        )
        .mappings()
        .all()
    )

    modelo = ParticipanteCompleto if completo else ParticipanteResumo
    return [
        modelo(
            user_id=r["user_id"],
            username=r["username"],
            nome_exibicao=r["nome_exibicao"],
            trocas_concluidas=r["trocas_concluidas"],
            trocas_furadas=r["trocas_furadas"],
            aceitou=r["aceitou"],
            confirmou_conclusao=r["confirmou_conclusao"],
            **({"contato_visivel": r["contato_visivel"]} if completo else {}),
        )
        for r in linhas
    ]


async def _itens(session: AsyncSession, match_id: str) -> list[ItemMatch]:
    linhas = (
        (
            await session.execute(
                text("""
            select card_id::text, de_user_id::text, para_user_id::text,
                   condicao::text, finish_id
            from match_items where match_id = :m
        """),
                {"m": match_id},
            )
        )
        .mappings()
        .all()
    )
    return [ItemMatch(**dict(r)) for r in linhas]


async def responder(
    session: AsyncSession, user_id: UUID, match_id: UUID, aceitou: bool
) -> MatchOut:
    """Aceita ou recusa. O contato só é revelado quando *todos* aceitaram."""
    res = await session.execute(
        text("""
            update match_participants set aceitou = :aceitou, respondeu_em = now()
            where match_id = :m and user_id = :u
            returning match_id::text
        """),
        {"aceitou": aceitou, "m": str(match_id), "u": str(user_id)},
    )
    if res.mappings().first() is None:
        raise RegraNegocio(
            "MATCH_NAO_ENCONTRADO", "Match não encontrado.", status_code=404
        )

    if not aceitou:
        novo = "RECUSADO"
    else:
        pendentes = await session.scalar(
            text("""
                select count(*) from match_participants
                where match_id = :m and (aceitou is null or aceitou = false)
            """),
            {"m": str(match_id)},
        )
        novo = "ACEITO" if not pendentes else "PENDENTE"

    await session.execute(
        text("update matches set status = :s where id = :m"),
        {"s": novo, "m": str(match_id)},
    )
    await session.execute(
        text("""
            insert into match_events (match_id, user_id, evento)
            values (:m, :u, :e)
        """),
        {
            "m": str(match_id),
            "u": str(user_id),
            "e": "ACEITO" if aceitou else "RECUSADO",
        },
    )
    await session.commit()

    return await obter_match(session, user_id, match_id)


async def _exigir_aceito(session: AsyncSession, user_id: UUID, match_id: UUID) -> None:
    """Só troca combinada tem desfecho — antes disso não houve encontro."""
    status = await session.scalar(
        text("""
            select m.status::text from matches m
            join match_participants mp on mp.match_id = m.id
            where m.id = :m and mp.user_id = :u
        """),
        {"m": str(match_id), "u": str(user_id)},
    )
    if status is None:
        raise _nao_encontrado()
    if status != "ACEITO":
        raise RegraNegocio(
            "MATCH_SEM_DESFECHO",
            "Só dá para registrar o desfecho de uma troca combinada.",
            status_code=409,
        )


async def confirmar_conclusao(
    session: AsyncSession, user_id: UUID, match_id: UUID
) -> MatchOut:
    """Confirma que a troca aconteceu. Só vira CONCLUIDO quando os dois confirmam.

    Exigir os dois lados é o que dá valor à reputação: se um lado sozinho
    pudesse fechar, inflar o próprio número seria trivial.
    """
    await _exigir_aceito(session, user_id, match_id)

    await session.execute(
        text("""
            update match_participants set confirmou_conclusao = true
            where match_id = :m and user_id = :u
        """),
        {"m": str(match_id), "u": str(user_id)},
    )
    await session.execute(
        text(
            "insert into match_events (match_id, user_id, evento) "
            "values (:m, :u, 'CONCLUIDO')"
        ),
        {"m": str(match_id), "u": str(user_id)},
    )

    faltam = await session.scalar(
        text("""
            select count(*) from match_participants
            where match_id = :m and confirmou_conclusao = false
        """),
        {"m": str(match_id)},
    )

    if not faltam:
        await session.execute(
            text("update matches set status = 'CONCLUIDO' where id = :m"),
            {"m": str(match_id)},
        )
        await session.execute(
            text("""
                update profiles set trocas_concluidas = trocas_concluidas + 1
                where id in (
                  select user_id from match_participants where match_id = :m
                )
            """),
            {"m": str(match_id)},
        )

    await session.commit()
    return await obter_match(session, user_id, match_id)


async def registrar_furo(
    session: AsyncSession, user_id: UUID, match_id: UUID
) -> MatchOut:
    """Registra que a outra pessoa não apareceu.

    O furo conta contra quem faltou, não contra quem avisou — senão ninguém
    avisaria. Fica um match_event com o autor: é o rastro que permite revisar
    denúncia injusta depois.
    """
    await _exigir_aceito(session, user_id, match_id)

    outro = await session.scalar(
        text("""
            select user_id::text from match_participants
            where match_id = :m and user_id <> :u limit 1
        """),
        {"m": str(match_id), "u": str(user_id)},
    )
    if outro is None:
        raise _nao_encontrado()

    await session.execute(
        text("update matches set status = 'FURADO' where id = :m"),
        {"m": str(match_id)},
    )
    await session.execute(
        text("update profiles set trocas_furadas = trocas_furadas + 1 where id = :f"),
        {"f": outro},
    )
    await session.execute(
        text("""
            insert into match_events (match_id, user_id, evento, payload)
            values (:m, :u, 'NOSHOW', cast(:payload as jsonb))
        """),
        {"m": str(match_id), "u": str(user_id), "payload": f'{{"faltou": "{outro}"}}'},
    )
    await session.commit()
    return await obter_match(session, user_id, match_id)


async def obter_match(session: AsyncSession, user_id: UUID, match_id: UUID) -> MatchOut:
    """Detalhe. Contato só entra quando o match inteiro está ACEITO."""
    linha = (
        (
            await session.execute(
                text("""
            select m.id::text, m.tipo::text, m.status::text, m.score,
                   m.expira_em::text
            from matches m join match_participants mp on mp.match_id = m.id
            where m.id = :m and mp.user_id = :eu
        """),
                {"m": str(match_id), "eu": str(user_id)},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        raise RegraNegocio(
            "MATCH_NAO_ENCONTRADO", "Match não encontrado.", status_code=404
        )

    # CONCLUIDO entra junto: as duas pessoas já se encontraram, esconder o
    # contato depois do fato não protege ninguém e só atrapalha quem precisa
    # retomar o assunto.
    completo = linha["status"] in ("ACEITO", "CONCLUIDO")
    return MatchOut(
        id=linha["id"],
        tipo=linha["tipo"],
        status=linha["status"],
        score=float(linha["score"]),
        expira_em=linha["expira_em"],
        participantes=await _participantes(session, linha["id"], completo=completo),
        itens=await _itens(session, linha["id"]),
    )
