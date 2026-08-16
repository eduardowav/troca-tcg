"""Motor de matching direto (A↔B) — a Fase 3 do roadmap.

Roda **na escrita**: sempre que o usuário mexe nas listas — cadastra, edita ou
remove um anúncio — recalculamos os matches dele. Para uma comunidade local isso
é barato e dá o retorno imediato que um job periódico não daria: quem acabou de
cadastrar a carta já vê com quem trocar.

Antes rodava também a cada abertura do feed, e era a coisa mais cara do app: uma
leitura disparava uma escrita completa, `9 × parceiros + 5` idas ao banco, com o
Postgres a ~120 ms de distância (o Render não tem região na América do Sul). Ler
não precisa recalcular porque **só escrita muda match**: se ninguém mexeu em
anúncio nenhum desde a última vez, o resultado seria idêntico. E quando é o
*outro* que mexe, é a escrita dele que grava o par — `_gravar_match` insere os
dois participantes, não só quem disparou.

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
from app.core.limites import limites_de, plano_vigente
from app.schemas.listing import CartaProcurada, QuemProcura
from app.schemas.match import (
    CartaDoParceiro,
    ItemMatch,
    MatchNoHistorico,
    MatchOut,
    ParticipanteCompleto,
    ParticipanteResumo,
)
from app.services import listings, notificacoes, termos

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
        # Só o que alguém chegou a responder vira EXPIRADO (ver o docstring), e
        # é exatamente por isso que este aviso vale: houve encontro marcado, e
        # ele não aconteceu. Sugestão ignorada não chega aqui nem incomoda.
        for pessoa in await _participantes(session, match_id):
            await notificacoes.match_expirado(session, para=pessoa, match_id=match_id)

    return len(ids)


async def _participantes(session: AsyncSession, match_id: UUID | str) -> list[str]:
    """Os ids de quem está num match. Usado por quem notifica os dois lados."""
    linhas = await session.execute(
        text("select user_id::text as id from match_participants where match_id = :m"),
        {"m": str(match_id)},
    )
    return [linha["id"] for linha in linhas.mappings().all()]


async def _outro_participante(
    session: AsyncSession, match_id: UUID | str, user_id: UUID | str
) -> str | None:
    return await session.scalar(
        text("""
            select user_id::text from match_participants
            where match_id = :m and user_id <> cast(:u as uuid) limit 1
        """),
        {"m": str(match_id), "u": str(user_id)},
    )


async def sincronizar_matches(session: AsyncSession, user_id: UUID) -> int:
    """Recalcula os matches diretos do usuário. Devolve quantos estão vigentes.

    Só mexe no que ainda é sugestão: match que alguém já aceitou ou recusou é
    histórico, e histórico não se reescreve — inclusive porque a métrica-mãe
    depende de conseguir contar o que furou.
    """
    # Varre os vencidos antes de recalcular: sem isso, um match ACEITO que
    # passou do prazo continuaria bloqueando o hash_grupo do par e a dupla nunca
    # receberia uma sugestão nova. O job diário `/internal/jobs/expire` cobre
    # quem não voltou; esta chamada cobre o instante.
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
                  expira_em = now() + interval '7 days',
                  prorrogacoes = 0
              where matches.status in ('SUGERIDO', 'EXPIRADO')
                 -- Desistência volta a ser sugerida, mas só depois da carência
                 -- que `registrar_desistencia` gravou em expira_em: reoferecer
                 -- no mesmo instante a troca que a pessoa acabou de desmarcar
                 -- leria como o app ignorando a decisão dela. Uma semana depois
                 -- volta, porque desistir quase sempre é sobre o momento.
                 or (matches.status = 'CANCELADO' and matches.expira_em <= now())
            returning id::text, (xmax = 0) as inedito
        """),
        {"score": par["score"], "hash": hash_grupo},
    )
    linha = res.mappings().first()
    if linha is None:
        return  # já existe e alguém respondeu: não é mais sugestão, deixa quieto

    match_id = linha["id"]
    # `xmax = 0` separa o INSERT do UPDATE do upsert, e essa distinção é a
    # diferença entre notificar uma vez e notificar sempre: `sincronizar_matches`
    # roda a cada escrita de anúncio e reescreve os mesmos pares indefinidamente.
    # Sem isto, a coisa mais útil do app viraria a mais irritante.
    inedito = bool(linha["inedito"])

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
    # As duas linhas vão num INSERT só: a ida ao banco é o custo dominante aqui,
    # não o trabalho que o Postgres faz depois que a consulta chega.
    primeiro, segundo = sorted([str(eu), str(parceiro)])
    await session.execute(
        text("""
            insert into match_participants (match_id, user_id, posicao)
            values (:m, :u0, 0), (:m, :u1, 1)
            on conflict (match_id, user_id) do nothing
        """),
        {"m": match_id, "u0": primeiro, "u1": segundo},
    )

    # Itens são recalculados: a melhor combinação pode ter mudado.
    await session.execute(
        text("delete from match_items where match_id = :m"), {"m": match_id}
    )
    # As duas cartas da troca, também num INSERT só, pelo mesmo motivo.
    await session.execute(
        text("""
            insert into match_items
              (match_id, card_id, de_user_id, para_user_id, condicao, finish_id)
            values (:m, :c_dou,    :eu,     :parceiro, :cond_dou,    :fin_dou),
                   (:m, :c_recebo, :parceiro, :eu,     :cond_recebo, :fin_recebo)
        """),
        {
            "m": match_id,
            "eu": str(eu),
            "parceiro": str(parceiro),
            "c_dou": str(par["card_dou"]),
            "cond_dou": par["cond_dou"],
            "fin_dou": par["finish_dou"],
            "c_recebo": str(par["card_recebo"]),
            "cond_recebo": par["cond_recebo"],
            "fin_recebo": par["finish_recebo"],
        },
    )

    if inedito:
        # Os dois lados são avisados. Quem escreveu o anúncio está com o app
        # aberto e verá o feed de qualquer jeito; o parceiro é quem não tem
        # como saber que a troca dele apareceu — e é ele que a notificação
        # existe para alcançar.
        for pessoa in (str(eu), str(parceiro)):
            await notificacoes.match_novo(
                session, para=pessoa, match_id=match_id, tipo="DIRETO"
            )


async def listar_matches(session: AsyncSession, user_id: UUID) -> list[MatchOut]:
    """Feed do usuário. Serializa ParticipanteResumo — nunca o contato."""
    linhas = (
        (
            await session.execute(
                text("""
            select m.id::text, m.tipo::text, m.status::text, m.score,
                   m.expira_em, m.prorrogacoes
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

    ids = [linha["id"] for linha in linhas]
    participantes = await _participantes_por_match(session, ids, completo=False)
    itens = await _itens_por_match(session, ids)

    return [
        MatchOut(
            id=linha["id"],
            tipo=linha["tipo"],
            status=linha["status"],
            score=float(linha["score"]),
            expira_em=linha["expira_em"],
            prorrogacoes=linha["prorrogacoes"],
            participantes=participantes.get(linha["id"], []),
            itens=itens.get(linha["id"], []),
        )
        for linha in linhas
    ]


# Uma linha por (carta minha, pessoa que procura). O `distinct` importa: quem
# tem duas PROCURAs da mesma carta — condições diferentes, por exemplo — é uma
# pessoa só interessada, não duas.
_DEMANDA = text(f"""
with demanda as (
  select distinct o.card_id, p.user_id, pr.username, pr.nome_exibicao
  from listings o
  join listings p on {_COMPATIVEL}
  join profiles pr on pr.id = p.user_id
  where o.user_id = :eu and pr.bloqueado = false
),
mais_procuradas as (
  select card_id, count(*) as procurando
  from demanda
  group by card_id
  order by count(*) desc, card_id
  limit :limite
)
select m.card_id::text as card_id, m.procurando,
       d.user_id::text as user_id, d.username, d.nome_exibicao
from mais_procuradas m
join demanda d on d.card_id = m.card_id
order by m.procurando desc, m.card_id, d.username
""")

# Quantas pessoas a tela nomeia por carta. O resto vira "e mais N" — a lista é
# para dar rosto à demanda, não para virar diretório de usuários.
_NOMES_POR_CARTA = 6


async def demanda_pelas_minhas_ofertas(
    session: AsyncSession, user_id: UUID, limite: int = 5
) -> list[CartaProcurada]:
    """Quantas pessoas procuram cada carta que eu ofereço.

    Existe por causa da tela vazia. Enquanto a base for pequena, quase todo mundo
    que se cadastra abre o feed e não encontra troca nenhuma — a pessoa fez tudo
    certo e o app responde "não tem nada", que é como um marketplace vazio começa
    a morrer. Isto é o sinal de uma ponta só: a troca não fechou, mas existe
    gente do outro lado querendo o que você tem.

    Usa a **mesma** regra de compatibilidade do matching (`_COMPATIVEL`), não uma
    contagem solta por carta. Contar todo mundo que procura a carta em qualquer
    condição inflaria o número com gente que nunca daria match — prometer demanda
    que não existe é pior do que a tela vazia honesta que estava aqui antes.

    A consulta volta achatada, uma linha por (carta, pessoa), e o agrupamento
    acontece aqui: agregar em JSON no Postgres devolveria texto que ainda
    precisaria ser desserializado, e o volume é pequeno demais para pagar isso.
    """
    linhas = (
        (await session.execute(_DEMANDA, {"eu": str(user_id), "limite": limite}))
        .mappings()
        .all()
    )

    # dict preserva a ordem de inserção, que é a do SQL (mais procuradas antes).
    por_carta: dict[str, CartaProcurada] = {}
    for r in linhas:
        carta = por_carta.get(r["card_id"])
        if carta is None:
            carta = CartaProcurada(
                card_id=r["card_id"], procurando=r["procurando"], pessoas=[]
            )
            por_carta[r["card_id"]] = carta
        if len(carta.pessoas) < _NOMES_POR_CARTA:
            carta.pessoas.append(
                QuemProcura(
                    user_id=r["user_id"],
                    username=r["username"],
                    nome_exibicao=r["nome_exibicao"],
                )
            )
    return list(por_carta.values())


# Quem oferece uma carta que alguém acabou de passar a procurar.
#
# É a mesma regra de compatibilidade do matcher (`_COMPATIVEL`) lida da outra
# ponta: aqui não se exige reciprocidade nenhuma. O match precisa de duas mãos
# cheias; este aviso é para o caso de uma só — alguém quer a sua carta e você
# não quer nada dela. É exatamente a troca que o motor nunca vai sugerir, e a
# vitrine existe para essa pessoa conseguir dar o primeiro passo.
#
# A janela é sobre `p.criado_em`, a PROCURA nova. Sem ela, toda passagem do job
# reprocessaria a base inteira; com ela, o trabalho é proporcional ao que mudou.
# A repetição de fato é barrada pelo dedupe de sete dias em `carta_procurada` —
# são duas travas diferentes, uma de custo e outra de incômodo.
_QUEM_PROCURA_O_QUE_OFERECO = text(f"""
    select o.user_id::text as dono,
           o.card_id::text as card_id,
           coalesce(c.nome_pt, c.nome_en) as carta,
           count(distinct p.user_id) as quantos
    from listings o
    join listings p on {_COMPATIVEL}
    join profiles dono on dono.id = o.user_id
    join profiles quem on quem.id = p.user_id
    join cards c on c.id = o.card_id
    where p.user_id <> o.user_id
      and dono.bloqueado = false
      and quem.bloqueado = false
      and p.criado_em > now() - make_interval(hours => :horas)
    group by o.user_id, o.card_id, coalesce(c.nome_pt, c.nome_en)
""")


async def notificar_cartas_procuradas(session: AsyncSession, horas: int = 24) -> int:
    """Avisa quem oferece uma carta que passou a ser procurada. Devolve quantos.

    Roda pelo cron (`/internal/jobs/notify-wanted`) a cada quinze minutos. A
    janela padrão de 24h é bem maior que o intervalo de propósito: uma execução
    que falhe não deixa buraco, porque a seguinte revisita o mesmo período e o
    dedupe descarta o que já foi avisado.

    Não commita — quem chama fecha a transação, como o resto dos jobs.
    """
    linhas = (
        (await session.execute(_QUEM_PROCURA_O_QUE_OFERECO, {"horas": horas}))
        .mappings()
        .all()
    )

    enviadas = 0
    for r in linhas:
        if await notificacoes.carta_procurada(
            session,
            para=r["dono"],
            card_id=r["card_id"],
            carta=r["carta"],
            quantos=r["quantos"],
        ):
            enviadas += 1
    return enviadas


# O acervo do parceiro, menos o que já está nesta troca.
#
# `reciproco` inverte o tipo de propósito: uma OFERTA dela só interessa contra o
# meu PROCURA, e vice-versa. É a mesma regra do matcher, dita para uma pessoa só.
#
# A ordem é o produto inteiro desta tela: o que fecha com você primeiro, depois o
# que a pessoa marcou como prioridade alta, e o resto por último. Sem isso a
# lista é um monte de cartas e o trabalho de achar o que importa fica com quem lê.
_MAIS_CARTAS = text("""
    select l.card_id::text as card_id, l.tipo::text as tipo, l.quantidade,
           l.condicao::text as condicao, l.finish_id, l.prioridade,
           exists (
             select 1 from listings meu
             where meu.user_id = :eu and meu.ativo
               and meu.card_id = l.card_id
               and meu.tipo = case
                     when l.tipo = 'OFERTA' then 'PROCURA'::listing_kind
                     else 'OFERTA'::listing_kind
                   end
           ) as reciproco
    from listings l
    where l.user_id = :parceiro
      and l.ativo
      and l.card_id not in (
        select card_id from match_items where match_id = :m
      )
    order by reciproco desc, l.prioridade desc, l.card_id
    limit :limite
""")


async def mais_cartas_do_parceiro(
    session: AsyncSession, user_id: UUID, match_id: UUID, limite: int = 200
) -> list[CartaDoParceiro]:
    """O resto do acervo de quem cruzou com você nesta troca.

    Recortado pelo match de propósito. A regra que isto protege é "não há
    diretório de pessoas": não existe busca por usuário, lista de membros nem
    mensagem — chega-se a alguém por uma carta, nunca por gente.

    Este recorte já não é o único caminho para o acervo de alguém. A vitrine
    (seção 22 da doc, `db/schema/23_propostas.sql`) abre o mesmo dado a partir de
    uma carta, sem exigir match, porque uma proposta precisa nascer antes de
    existir troca. Continua valendo que o acervo é público desde o 09_rls
    ("le anuncios ativos") e que contato não é — este caminho aqui segue sendo o
    de dentro de uma troca já formada.

    Não exige aceite. A pergunta "vale a viagem?" é anterior ao aceite — uma
    carta só pode não valer o encontro, três valem —, e esconder isso até o
    aceite mútuo cobraria justamente na hora em que a pessoa está decidindo.
    Contato segue outra regra e continua saindo só depois do aceite dos dois.
    """
    parceiro = await session.scalar(
        text("""
            select outro.user_id::text
            from match_participants eu
            join match_participants outro
              on outro.match_id = eu.match_id and outro.user_id <> eu.user_id
            where eu.match_id = :m and eu.user_id = :eu
            limit 1
        """),
        {"m": str(match_id), "eu": str(user_id)},
    )
    if parceiro is None:
        raise _nao_encontrado()

    linhas = (
        (
            await session.execute(
                _MAIS_CARTAS,
                {
                    "eu": str(user_id),
                    "parceiro": parceiro,
                    "m": str(match_id),
                    "limite": limite,
                },
            )
        )
        .mappings()
        .all()
    )
    return [CartaDoParceiro(**dict(linha)) for linha in linhas]


def _lista_de_ids(ids: list[str], prefixo: str) -> tuple[str, dict[str, str]]:
    """Monta `:m0, :m1, ...` para um `in (...)`, com os ids como parâmetros.

    Os ids nunca entram no texto do SQL — só os *nomes* dos parâmetros entram,
    e eles são gerados aqui, não vêm de fora. É o que permite buscar os
    participantes de trinta matches numa consulta em vez de trinta.

    O `cast(... as uuid)` é explícito de propósito. Comparar uma coluna `uuid`
    com parâmetro textual funciona quando o Postgres consegue inferir o tipo,
    mas essa inferência é a única peça deste caminho que eu não conseguiria
    provar sem subir a aplicação inteira — e o caminho é o do feed. Declarar o
    tipo custa nada e mantém o índice em uso, ao contrário de `match_id::text`.
    """
    params = {f"{prefixo}{i}": valor for i, valor in enumerate(ids)}
    return ", ".join(f"cast(:{nome} as uuid)" for nome in params), params


async def _participantes_por_match(
    session: AsyncSession, match_ids: list[str], *, completo: bool
) -> dict[str, list]:
    """Os participantes de vários matches de uma vez, agrupados por match."""
    if not match_ids:
        return {}

    colunas = (
        "p.id::text as user_id, p.username, p.nome_exibicao, "
        "p.trocas_concluidas, p.trocas_furadas, p.trocas_desistidas, "
        "mp.aceitou, mp.confirmou_conclusao"
    )
    if completo:
        colunas += ", p.contato_visivel"

    lista, params = _lista_de_ids(match_ids, "m")
    linhas = (
        (
            await session.execute(
                text(f"""
            select mp.match_id::text as match_id, {colunas}
            from match_participants mp join profiles p on p.id = mp.user_id
            where mp.match_id in ({lista})
            order by mp.match_id, mp.posicao
        """),
                params,
            )
        )
        .mappings()
        .all()
    )

    modelo = ParticipanteCompleto if completo else ParticipanteResumo
    por_match: dict[str, list] = {}
    for r in linhas:
        por_match.setdefault(r["match_id"], []).append(
            modelo(
                user_id=r["user_id"],
                username=r["username"],
                nome_exibicao=r["nome_exibicao"],
                trocas_concluidas=r["trocas_concluidas"],
                trocas_furadas=r["trocas_furadas"],
                trocas_desistidas=r["trocas_desistidas"],
                aceitou=r["aceitou"],
                confirmou_conclusao=r["confirmou_conclusao"],
                **({"contato_visivel": r["contato_visivel"]} if completo else {}),
            )
        )
    return por_match


# O histórico: o que já terminou.
#
# Os três status são uma escolha. CONCLUIDO e FURADO estão aqui porque são
# exatamente os dois contadores que a tela de perfil mostra logo acima — sem esta
# lista, "1 concluída" é um número sem como saber qual troca foi. EXPIRADO entra
# porque é a única resposta para "aceitei uma troca e ela desapareceu do feed":
# sem a linha, o app parece ter perdido a troca.
#
# CANCELADO entra pelo mesmo motivo que EXPIRADO: a troca sai do feed e sem a
# linha o app pareceria tê-la perdido. Vale para os dois lados — quem recebeu a
# desistência precisa da linha ainda mais do que quem desistiu.
#
# RECUSADO fica fora de propósito: recusar uma sugestão não é uma troca que deu
# errado, é uma que nunca começou. Virar mural de recusas não ajuda ninguém —
# nem quem recusou, nem a leitura dos números de cima. SUGERIDO também não entra:
# não é histórico, é o feed.
#
# `desfecho_em` vem do último evento do match, que é o instante em que ele virou
# o que é. `matches` não tem coluna de atualização, e criar uma só para isto
# duplicaria o que match_events já registra. O coalesce cobre match antigo sem
# evento — não deveria existir, mas ordenar por nulo joga a linha para o fim da
# lista silenciosamente, e histórico com buraco é pior que histórico com data
# aproximada.
_DESISTIU_POR = """
  (select e.user_id::text from match_events e
    where e.match_id = m.id and e.evento = 'DESISTIU'
    order by e.criado_em desc limit 1) as desistiu_por
"""

# A janela do plano filtra por `desfecho_em`, que é expressão e não coluna — daí
# a subconsulta: em SQL não se referencia um alias do select dentro do where.
# `:dias` nulo é histórico completo, e o cast explícito existe porque sem ele o
# Postgres não consegue inferir o tipo de um parâmetro que só aparece num
# `is null`.
_HISTORICO = text(f"""
    select * from (
      select m.id::text, m.tipo::text, m.status::text, m.score,
             m.expira_em, m.prorrogacoes,
             {_DESISTIU_POR},
             coalesce(
               (select max(e.criado_em) from match_events e where e.match_id = m.id),
               m.criado_em
             ) as desfecho_em
      from matches m
      join match_participants mp on mp.match_id = m.id
      where mp.user_id = :eu
        and m.status in ('CONCLUIDO', 'FURADO', 'EXPIRADO', 'CANCELADO')
    ) h
    where cast(:dias as int) is null
       or h.desfecho_em > now() - make_interval(days => cast(:dias as int))
    order by h.desfecho_em desc
    limit :limite
""")


async def listar_historico(
    session: AsyncSession, user_id: UUID, limite: int = 50
) -> list[MatchNoHistorico]:
    """As trocas encerradas do usuário, da mais recente para a mais antiga.

    Serializa ParticipanteResumo, como o feed: contato não tem o que fazer numa
    lista. O limite existe para a tela não crescer sem fim — quem chegar nele já
    é um caso bom de ter, e paginar antes disso seria inventar problema.

    A janela é a do plano (`historico_dias`). Ela esconde linhas antigas, não
    apaga nada e não mexe em reputação: `trocas_concluidas` e `trocas_furadas`
    são contadores em `profiles` e não são recalculados a partir desta lista.
    """
    plano = await session.scalar(
        text("select plano from profiles where id = cast(:eu as uuid)"),
        {"eu": str(user_id)},
    )
    dias = limites_de(plano_vigente(plano or "FREE")).historico_dias

    linhas = (
        (
            await session.execute(
                _HISTORICO, {"eu": str(user_id), "limite": limite, "dias": dias}
            )
        )
        .mappings()
        .all()
    )

    ids = [linha["id"] for linha in linhas]
    participantes = await _participantes_por_match(session, ids, completo=False)
    itens = await _itens_por_match(session, ids)

    return [
        MatchNoHistorico(
            id=linha["id"],
            tipo=linha["tipo"],
            status=linha["status"],
            score=float(linha["score"]),
            expira_em=linha["expira_em"],
            prorrogacoes=linha["prorrogacoes"],
            desistiu_por=linha["desistiu_por"],
            desfecho_em=linha["desfecho_em"],
            participantes=participantes.get(linha["id"], []),
            itens=itens.get(linha["id"], []),
        )
        for linha in linhas
    ]


async def _itens_por_match(
    session: AsyncSession, match_ids: list[str]
) -> dict[str, list[ItemMatch]]:
    """As cartas de vários matches de uma vez, agrupadas por match."""
    if not match_ids:
        return {}

    lista, params = _lista_de_ids(match_ids, "m")
    linhas = (
        (
            await session.execute(
                text(f"""
            select match_id::text as match_id,
                   card_id::text, de_user_id::text, para_user_id::text,
                   condicao::text, finish_id
            from match_items where match_id in ({lista})
        """),
                params,
            )
        )
        .mappings()
        .all()
    )

    por_match: dict[str, list[ItemMatch]] = {}
    for r in linhas:
        dados = dict(r)
        por_match.setdefault(dados.pop("match_id"), []).append(ItemMatch(**dados))
    return por_match


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

    # Recusa não é notificada de propósito: quem recusa uma sugestão do motor
    # não está respondendo a uma pessoa, está dispensando uma ideia do app —
    # avisar transformaria "não quero" numa mensagem para alguém que não pediu
    # nada. Aceite é o contrário: é o único momento em que o outro lado precisa
    # agir, e o segundo aceite é o que revela o contato.
    if aceitou:
        outro = await _outro_participante(session, match_id, user_id)
        if outro is not None:
            await notificacoes.match_aceito(
                session,
                para=outro,
                de=user_id,
                quem=await notificacoes.arroba(session, user_id),
                match_id=match_id,
                combinado=novo == "ACEITO",
            )

    await session.commit()

    return await obter_match(session, user_id, match_id)


async def _status_do_participante(
    session: AsyncSession, user_id: UUID, match_id: UUID
) -> str:
    """O status do match, e a prova de que quem pergunta participa dele.

    O join com `match_participants` é a autorização: quem não está na troca
    recebe 404, não 403 — não confirmamos nem que o match existe.
    """
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
    return status


async def _exigir_aceito(session: AsyncSession, user_id: UUID, match_id: UUID) -> None:
    """Só troca combinada tem desfecho — antes disso não houve encontro."""
    status = await _status_do_participante(session, user_id, match_id)
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
        # A carta trocada sai do estoque dos dois lados: uma unidade da OFERTA
        # de quem deu, uma da PROCURA de quem recebeu. Aqui dentro do `if`, e
        # não acima: enquanto falta um lado confirmar, a troca não aconteceu —
        # e é só uma vez, porque a segunda chamada esbarra no `_exigir_aceito`,
        # que já vai encontrar o match em CONCLUIDO.
        await listings.baixar_por_troca(session, match_id)

    # A confirmação de um lado só vale com a do outro, e é aqui que ela é
    # cobrada — sem este aviso, a troca que aconteceu de verdade fica pendurada
    # esperando alguém lembrar de voltar ao app.
    outro = await _outro_participante(session, match_id, user_id)
    if outro is not None:
        await notificacoes.match_concluido(
            session,
            para=outro,
            de=user_id,
            quem=await notificacoes.arroba(session, user_id),
            match_id=match_id,
            fechou=not faltam,
        )

    await session.commit()
    return await obter_match(session, user_id, match_id)


_LIMITE_PRORROGACOES = 2
_PRAZO_EXTRA = "7 days"


async def prorrogar(session: AsyncSession, user_id: UUID, match_id: UUID) -> MatchOut:
    """Estica o prazo em uma semana. Qualquer um dos dois pode, até duas vezes.

    Um toque de um lado vale pelos dois de propósito: exigir que ambos peçam
    transformaria "ainda estamos combinando" numa negociação sobre negociar. Quem
    não quer mais tem a saída explícita ao lado (desistir), e ela é melhor do que
    deixar o prazo vencer calado.

    O teto de duas prorrogações é o que mantém EXPIRADO significando alguma
    coisa. Sem ele, uma troca que ninguém encerra ocupa o par no feed para
    sempre — só existe um match por dupla de pessoas.

    `greatest(now(), expira_em)` em vez de somar sobre a data velha: se o prazo
    já passou mas a varredura ainda não rodou, somar sete dias a uma data no
    passado devolveria um prazo que nasce vencido.
    """
    status = await _status_do_participante(session, user_id, match_id)
    if status not in ("PENDENTE", "ACEITO"):
        raise RegraNegocio(
            "PRAZO_NAO_PRORROGAVEL",
            "Só dá para estender o prazo de uma troca em andamento.",
            status_code=409,
        )

    res = await session.execute(
        text(f"""
            update matches
               set expira_em = greatest(now(), expira_em) + interval '{_PRAZO_EXTRA}',
                   prorrogacoes = prorrogacoes + 1
             where id = :m and prorrogacoes < :limite
            returning id::text
        """),
        {"m": str(match_id), "limite": _LIMITE_PRORROGACOES},
    )
    if res.mappings().first() is None:
        raise RegraNegocio(
            "PRAZO_NO_LIMITE",
            "Essa troca já foi estendida duas vezes.",
            status_code=409,
        )

    await session.execute(
        text(
            "insert into match_events (match_id, user_id, evento) "
            "values (:m, :u, 'PRORROGADO')"
        ),
        {"m": str(match_id), "u": str(user_id)},
    )
    await session.commit()
    return await obter_match(session, user_id, match_id)


async def registrar_desistencia(
    session: AsyncSession, user_id: UUID, match_id: UUID
) -> MatchOut:
    """Encerra a troca por decisão de quem está desistindo — sem acusar ninguém.

    O desfecho oferecia só "aconteceu" e "a pessoa não apareceu". Quem desistiu
    de boa-fé não tinha saída: ou acusava o outro de um furo que não houve, ou
    sumia. Sumir vira EXPIRADO, que conta contra os dois — o app empurrava gente
    honesta para o pior dos desfechos.

    CANCELADO fica fora do denominador da métrica-mãe, mas **não** sai de graça:
    `trocas_desistidas` sobe em quem desistiu e aparece ao lado da reputação,
    onde ela é lida por quem está prestes a marcar um encontro. Sem esse
    contador, desistir seria a rota de fuga barata de quem furaria de qualquer
    jeito, e os números do app ficariam bonitos sem serem verdade.

    `expira_em` vira carência de uma semana: o motor ressuscita match encerrado
    por prazo, e reoferecer no mesmo instante a troca que a pessoa acabou de
    desmarcar leria como o app ignorando a decisão dela. Uma semana depois volta,
    porque desistência quase sempre é sobre o momento, não sobre a carta.
    """
    await _exigir_aceito(session, user_id, match_id)

    await session.execute(
        text(f"""
            update matches
               set status = 'CANCELADO',
                   expira_em = now() + interval '{_PRAZO_EXTRA}'
             where id = :m
        """),
        {"m": str(match_id)},
    )
    await session.execute(
        text(
            "update profiles set trocas_desistidas = trocas_desistidas + 1 "
            "where id = :u"
        ),
        {"u": str(user_id)},
    )
    await session.execute(
        text(
            "insert into match_events (match_id, user_id, evento) "
            "values (:m, :u, 'DESISTIU')"
        ),
        {"m": str(match_id), "u": str(user_id)},
    )

    outro = await _outro_participante(session, match_id, user_id)
    if outro is not None:
        await notificacoes.match_cancelado(
            session,
            para=outro,
            de=user_id,
            quem=await notificacoes.arroba(session, user_id),
            match_id=match_id,
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

    # Vai para quem faltou, e sem o @ de quem registrou — ver o texto em
    # services/notificacoes. O número dessa pessoa acabou de mudar; ela merece
    # saber por onde, mas nomear quem apertou o botão convida à represália
    # antes de ela abrir a tela.
    await notificacoes.match_furado(session, para=outro, de=user_id, match_id=match_id)

    await session.commit()
    return await obter_match(session, user_id, match_id)


async def obter_match(session: AsyncSession, user_id: UUID, match_id: UUID) -> MatchOut:
    """Detalhe. Contato só entra com o match ACEITO **e** a isenção aceita.

    A segunda condição entrou em 2026-08-15 e é o item 3 da ordem de execução.
    Ela mora aqui, e não numa caixa do frontend, porque um modal sobre um contato
    que a API já mandou não esconde nada de quem abre as ferramentas do navegador
    — e o que a isenção precisa provar é que o dado **não saiu daqui** antes de a
    pessoa ler o texto. Ver `services/termos.py`.
    """
    linha = (
        (
            await session.execute(
                text(f"""
            select m.id::text, m.tipo::text, m.status::text, m.score,
                   m.expira_em, m.prorrogacoes,
                   {_DESISTIU_POR}
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
    #
    # A isenção é conferida **depois** do status, e nessa ordem de propósito: uma
    # consulta a menos no caminho de quem abre um match que ainda nem foi aceito,
    # que é a maioria das aberturas.
    trocado = linha["status"] in ("ACEITO", "CONCLUIDO")
    completo = trocado and await termos.aceitou_revelacao(session, user_id, match_id)
    ids = [linha["id"]]
    participantes = await _participantes_por_match(session, ids, completo=completo)
    itens = await _itens_por_match(session, ids)

    return MatchOut(
        id=linha["id"],
        tipo=linha["tipo"],
        status=linha["status"],
        score=float(linha["score"]),
        expira_em=linha["expira_em"],
        prorrogacoes=linha["prorrogacoes"],
        desistiu_por=linha["desistiu_por"],
        participantes=participantes.get(linha["id"], []),
        itens=itens.get(linha["id"], []),
    )
