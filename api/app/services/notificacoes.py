"""Notificações in-app: o catálogo de eventos e como cada um vira uma linha.

Esta camada existe por um motivo só, e vale dizê-lo antes do código: **uma
proposta vence em 72 horas e, até aqui, morria calada.** Quem recebeu não tinha
como saber que era a vez dele a não ser abrindo o app por conta própria. Tudo
neste arquivo é sobre isso — o resto dos eventos entra junto porque a mesma
tabela e o mesmo caminho servem para todos, não porque cada um deles valha um
sistema.

**O texto mora aqui, não no frontend.** A tabela guarda `titulo` e `corpo` já
escritos, e não um par (tipo, payload) para o cliente traduzir. Duas razões: a
notificação precisa fazer sentido daqui a um mês, quando o texto do app já mudou
— e o Web Push da próxima leva manda título e corpo para o sistema operacional,
que não tem acesso a tradução nenhuma do lado do cliente.

**Nada aqui commita.** Toda função recebe a sessão de quem chamou e escreve
dentro da transação dele. Notificação é parte do evento, não um efeito à parte:
se a proposta não foi gravada, a notificação de que ela chegou não pode existir.

**Ninguém é notificado do que fez.** O `_notificar` ignora silenciosamente
qualquer tentativa de escrever para quem disparou o evento. Isso é guarda de
verdade, não zelo: quase toda função aqui recebe os dois lados de uma troca, e
trocar a ordem dos argumentos seria fácil demais.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import push

#: Tipos gravados em `notifications.tipo`. É texto livre na coluna (ver o 08),
#: então a lista canônica é esta — e o frontend agrupa ícone e cor por ela.
TIPO_PROPOSTA_RECEBIDA = "PROPOSTA_RECEBIDA"
TIPO_PROPOSTA_SUA_VEZ = "PROPOSTA_SUA_VEZ"
TIPO_PROPOSTA_ACEITA = "PROPOSTA_ACEITA"
TIPO_PROPOSTA_RECUSADA = "PROPOSTA_RECUSADA"
TIPO_PROPOSTA_RETIRADA = "PROPOSTA_RETIRADA"
TIPO_PROPOSTA_EXPIRADA = "PROPOSTA_EXPIRADA"
TIPO_NOVO_MATCH = "NOVO_MATCH"
TIPO_MATCH_ACEITO = "MATCH_ACEITO"
TIPO_MATCH_CONCLUIDO = "MATCH_CONCLUIDO"
TIPO_MATCH_FURADO = "MATCH_FURADO"
TIPO_MATCH_CANCELADO = "MATCH_CANCELADO"
TIPO_MATCH_EXPIRADO = "MATCH_EXPIRADO"
TIPO_CARTA_PROCURADA = "CARTA_PROCURADA"
TIPO_CARTA_DISPONIVEL = "CARTA_DISPONIVEL"
TIPO_PLANO_EXPIROU = "PLANO_EXPIROU"

#: Quais destes vibram o celular. É a coluna "Push" da matriz da seção 12: o que
#: espera resposta de alguém, mais a carta procurada, que é a única varredura e
#: a que traz gente de volta. O resto — recusada, retirada, vencida, furada,
#: cancelada, expirada — é registro do que aconteceu e fica na caixa. Um app que
#: vibra treze vezes por dia perde a permissão que levou meses para conseguir.
TIPOS_COM_PUSH = frozenset(
    {
        TIPO_PROPOSTA_RECEBIDA,
        TIPO_PROPOSTA_SUA_VEZ,
        TIPO_PROPOSTA_ACEITA,
        TIPO_NOVO_MATCH,
        TIPO_MATCH_ACEITO,
        TIPO_MATCH_CONCLUIDO,
        TIPO_CARTA_PROCURADA,
        # A carta que a pessoa **pediu** para ser avisada. É o único aviso que
        # ela ligou com o próprio dedo, e o que ela espera é justamente o
        # celular vibrando — carta boa some no mesmo dia.
        TIPO_CARTA_DISPONIVEL,
        # A queda de plano. Não espera resposta de ninguém, o que a colocaria
        # fora desta lista, mas é o único aviso do app que descreve algo que já
        # mudou na vitrine da pessoa sem ela ter feito nada — e o que ela precisa
        # fazer a respeito tem prazo. Descobrir dias depois, ao abrir o app por
        # outro motivo, é descobrir tarde.
        TIPO_PLANO_EXPIROU,
    }
)

_INSERIR = text("""
    insert into notifications (user_id, tipo, titulo, corpo, link)
    values (cast(:u as uuid), :tipo, :titulo, :corpo, :link)
""")

#: Existe uma notificação igual (mesma pessoa, mesmo tipo, mesmo link) recente?
#: Serve ao job de carta procurada, que varre uma janela e roda a cada 15 min.
_JA_EXISTE = text("""
    select 1 from notifications
    where user_id = cast(:u as uuid)
      and tipo = :tipo
      and link is not distinct from :link
      and criado_em > now() - make_interval(hours => :horas)
    limit 1
""")


async def _notificar(
    session: AsyncSession,
    *,
    para: UUID | str | None,
    tipo: str,
    titulo: str,
    corpo: str,
    link: str | None = None,
    de: UUID | str | None = None,
    dedupe_horas: int | None = None,
) -> bool:
    """Grava uma notificação. Devolve se ela foi mesmo gravada.

    `de` é quem causou o evento: se for a mesma pessoa que receberia, não
    escreve nada. `dedupe_horas` evita repetir a mesma linha dentro da janela —
    só o job de carta procurada precisa disso, porque é o único que roda em
    varredura em vez de nascer de uma ação.
    """
    if para is None:
        return False
    if de is not None and str(de) == str(para):
        return False

    if dedupe_horas is not None:
        repetida = await session.scalar(
            _JA_EXISTE,
            {"u": str(para), "tipo": tipo, "link": link, "horas": dedupe_horas},
        )
        if repetida:
            return False

    await session.execute(
        _INSERIR,
        {
            "u": str(para),
            "tipo": tipo,
            "titulo": titulo,
            "corpo": corpo,
            "link": link,
        },
    )

    # O push entra na fila da sessão e sai depois do commit, no `get_session`.
    # Enfileirar aqui, e não em cada evento, é o que garante que as duas guardas
    # de cima — não notificar quem agiu, não repetir dentro da janela — valham
    # também para o celular: quem não recebe linha não recebe vibração.
    if tipo in TIPOS_COM_PUSH:
        push.agendar(
            session, para=para, tipo=tipo, titulo=titulo, corpo=corpo, link=link
        )

    return True


async def arroba(session: AsyncSession, user_id: UUID | str) -> str:
    """O @ de alguém, para assinar o texto da notificação.

    Existe porque nem todo ponto de disparo tem o nome à mão — quem abre uma
    proposta sabe para quem vai, não como se chama. Uma consulta a mais numa
    escrita rara é barato; passar o nome errado no texto, não.
    """
    nome = await session.scalar(
        text("select username from profiles where id = cast(:u as uuid)"),
        {"u": str(user_id)},
    )
    return nome or "alguém"


def _link_proposta(proposta_id: UUID | str) -> str:
    return f"/propostas/{proposta_id}"


def _link_match(match_id: UUID | str) -> str:
    return f"/matches/{match_id}"


# ---------------------------------------------------------------------------
# Leitura — o que a caixa e a badge mostram
# ---------------------------------------------------------------------------

#: Teto de linhas devolvidas. A caixa é um histórico curto, não um arquivo: quem
#: precisa de algo de duas semanas atrás procura a troca, não a notificação.
LIMITE_PADRAO = 50


async def listar(
    session: AsyncSession,
    user_id: UUID,
    *,
    apenas_nao_lidas: bool = False,
    limite: int = LIMITE_PADRAO,
) -> list[dict]:
    """A caixa de alguém, da mais recente para a mais antiga."""
    filtro = "and lida = false" if apenas_nao_lidas else ""
    linhas = await session.execute(
        text(f"""
            select id::text as id, tipo, titulo, corpo, link, lida, criado_em
            from notifications
            where user_id = cast(:u as uuid) {filtro}
            order by criado_em desc
            limit :limite
        """),
        {"u": str(user_id), "limite": limite},
    )
    return [dict(linha) for linha in linhas.mappings().all()]


async def contar_nao_lidas(session: AsyncSession, user_id: UUID) -> int:
    """O número da badge. Coberto pelo índice parcial do 24."""
    total = await session.scalar(
        text("""
            select count(*) from notifications
            where user_id = cast(:u as uuid) and lida = false
        """),
        {"u": str(user_id)},
    )
    return int(total or 0)


async def marcar_lidas(
    session: AsyncSession, user_id: UUID, ids: list[str] | None = None
) -> int:
    """Marca como lidas. Sem ids, marca todas as não lidas. Devolve quantas.

    O `user_id` está no `where` mesmo quando vêm ids: sem ele, um id chutado de
    outra pessoa seria marcado como lido por quem não é dono. É a mesma regra do
    resto da API — o token diz quem é, e o dono é sempre parte da consulta.
    """
    if ids:
        res = await session.execute(
            text("""
                update notifications set lida = true
                where user_id = cast(:u as uuid)
                  and lida = false
                  and id = any(cast(:ids as uuid[]))
            """),
            {"u": str(user_id), "ids": list(ids)},
        )
    else:
        res = await session.execute(
            text("""
                update notifications set lida = true
                where user_id = cast(:u as uuid) and lida = false
            """),
            {"u": str(user_id)},
        )
    await session.commit()
    return res.rowcount or 0


# ---------------------------------------------------------------------------
# Propostas — a negociação da vitrine
# ---------------------------------------------------------------------------


async def proposta_recebida(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    proposta_id: UUID | str,
) -> None:
    """A primeira rodada: alguém abriu uma negociação com você.

    O texto diz o prazo porque o prazo é o que faz a pessoa abrir agora. Sem
    ele, "você recebeu uma proposta" compete com todo o resto do celular.
    """
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_PROPOSTA_RECEBIDA,
        titulo=f"@{quem} propôs uma troca",
        corpo="É a sua vez de responder. A proposta vence em 72 horas.",
        link=_link_proposta(proposta_id),
    )


async def proposta_sua_vez(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    proposta_id: UUID | str,
    rodada: int,
) -> None:
    """A contraproposta: a vez voltou para o outro lado, com prazo novo."""
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_PROPOSTA_SUA_VEZ,
        titulo=f"@{quem} fez uma contraproposta",
        corpo=(
            f"Rodada {rodada}: é a sua vez de responder. A proposta vence em 72 horas."
        ),
        link=_link_proposta(proposta_id),
    )


async def proposta_aceita(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    match_id: UUID | str,
) -> None:
    """O aceite fecha a negociação e abre a troca — o link já é o do match.

    Mandar para a proposta seria mandar para o histórico. O que a pessoa
    precisa agora é do contato, e ele está do outro lado.
    """
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_PROPOSTA_ACEITA,
        titulo=f"@{quem} aceitou a troca",
        corpo="A troca está combinada. Abra para ver o contato e se organizarem.",
        link=_link_match(match_id),
    )


async def proposta_recusada(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    proposta_id: UUID | str,
) -> None:
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_PROPOSTA_RECUSADA,
        titulo=f"@{quem} recusou a proposta",
        corpo="A negociação foi encerrada. Você pode propor de novo quando quiser.",
        link=_link_proposta(proposta_id),
    )


async def proposta_retirada(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    proposta_id: UUID | str,
) -> None:
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_PROPOSTA_RETIRADA,
        titulo=f"@{quem} retirou a proposta",
        corpo="A negociação foi desfeita antes da resposta.",
        link=_link_proposta(proposta_id),
    )


async def proposta_expirada(
    session: AsyncSession, *, para: UUID | str, proposta_id: UUID | str
) -> None:
    """As 72h venceram. Vai para os dois lados: um perdeu a vez, o outro ficou
    sem resposta, e para ambos a dupla acabou de destravar."""
    await _notificar(
        session,
        para=para,
        tipo=TIPO_PROPOSTA_EXPIRADA,
        titulo="Uma proposta venceu",
        corpo="Ninguém respondeu em 72 horas. Dá para começar outra negociação.",
        link=_link_proposta(proposta_id),
    )


# ---------------------------------------------------------------------------
# Matches — o motor
# ---------------------------------------------------------------------------

#: O texto de "troca nova" muda com o tipo, e o TRIANGULAR já está escrito. O
#: motor de ciclos é a Fase 5 e ainda não existe (o enum e o limite de plano
#: existem, o algoritmo não); quando ele nascer, tudo o que precisa fazer é
#: chamar `match_novo` com o tipo certo — nada aqui precisa mudar.
_TEXTO_MATCH_NOVO = {
    "DIRETO": (
        "Uma troca nova para você",
        "Vocês dois têm o que o outro procura. Abra para ver as cartas.",
    ),
    "MULTIPLO": (
        "Uma troca nova, com mais de uma carta",
        "Vocês dois têm o que o outro procura. Abra para ver as cartas.",
    ),
    "TRIANGULAR": (
        "Uma troca de três pontas fecha com você",
        "Ninguém tinha o que o outro queria em par — mas em trio, fecha. "
        "Abra para ver o triângulo.",
    ),
    "PROPOSTA": (
        "Uma troca combinada",
        "A negociação virou troca. Abra para ver o contato.",
    ),
}


async def match_novo(
    session: AsyncSession,
    *,
    para: UUID | str,
    match_id: UUID | str,
    tipo: str = "DIRETO",
) -> None:
    """Uma sugestão nova apareceu no feed de alguém.

    Só para match recém-criado. O `sincronizar_matches` roda a cada escrita de
    anúncio e reescreve os mesmos pares o tempo todo; avisar a cada passagem
    transformaria a coisa mais útil do app na mais irritante.
    """
    titulo, corpo = _TEXTO_MATCH_NOVO.get(tipo, _TEXTO_MATCH_NOVO["DIRETO"])
    await _notificar(
        session,
        para=para,
        tipo=TIPO_NOVO_MATCH,
        titulo=titulo,
        corpo=corpo,
        link=_link_match(match_id),
    )


async def match_aceito(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    match_id: UUID | str,
    combinado: bool,
) -> None:
    """Alguém respondeu à sugestão.

    `combinado` separa os dois momentos que o produto trata como um só: o
    primeiro aceite ainda espera o outro lado; o segundo revela o contato. Só o
    segundo pede uma ação — e o texto tem de dizer qual.
    """
    if combinado:
        titulo = f"@{quem} também aceitou — troca combinada"
        corpo = "Agora vocês veem o contato um do outro. Combinem o encontro."
    else:
        titulo = f"@{quem} aceitou a troca"
        corpo = "Falta você aceitar para o contato aparecer para os dois."
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_MATCH_ACEITO,
        titulo=titulo,
        corpo=corpo,
        link=_link_match(match_id),
    )


async def match_concluido(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    match_id: UUID | str,
    fechou: bool,
) -> None:
    """Confirmação de que a troca aconteceu — de um lado, ou dos dois.

    Quando só um confirmou, a notificação é um pedido: a reputação dos dois
    depende da confirmação do outro, e é aqui que ela é cobrada.
    """
    if fechou:
        titulo = "Troca concluída"
        corpo = f"Você e @{quem} confirmaram. A reputação de vocês dois subiu."
    else:
        titulo = f"@{quem} confirmou a troca"
        corpo = "Confirme também para a troca contar para vocês dois."
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_MATCH_CONCLUIDO,
        titulo=titulo,
        corpo=corpo,
        link=_link_match(match_id),
    )


async def match_furado(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    match_id: UUID | str,
) -> None:
    """Alguém registrou que a troca furou.

    Sem o @ de quem registrou, de propósito: a notificação chega para quem
    acabou de levar um furo no número, e nomear quem apertou o botão convida à
    represália antes de a pessoa abrir a tela e ler o que aconteceu.
    """
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_MATCH_FURADO,
        titulo="Uma troca foi marcada como furada",
        corpo="Abra para ver os detalhes. Se algo estiver errado, você pode denunciar.",
        link=_link_match(match_id),
    )


async def match_cancelado(
    session: AsyncSession,
    *,
    para: UUID | str,
    de: UUID | str,
    quem: str,
    match_id: UUID | str,
) -> None:
    """Desistência: encerra sem acusar ninguém, e o texto acompanha isso."""
    await _notificar(
        session,
        para=para,
        de=de,
        tipo=TIPO_MATCH_CANCELADO,
        titulo=f"@{quem} desistiu da troca",
        corpo="A troca foi desmarcada. Ninguém levou furo por isso.",
        link=_link_match(match_id),
    )


async def match_expirado(
    session: AsyncSession, *, para: UUID | str, match_id: UUID | str
) -> None:
    await _notificar(
        session,
        para=para,
        tipo=TIPO_MATCH_EXPIRADO,
        titulo="Uma troca combinada venceu",
        corpo="O prazo acabou sem confirmação dos dois lados.",
        link=_link_match(match_id),
    )


# ---------------------------------------------------------------------------
# Carta procurada — o job
# ---------------------------------------------------------------------------


async def carta_procurada(
    session: AsyncSession,
    *,
    para: UUID | str,
    card_id: UUID | str,
    carta: str,
    quantos: int,
) -> bool:
    """Alguém pôs no Procuro uma carta que você oferece.

    É a única notificação que não nasce de uma ação sobre você — nasce de uma
    varredura — e por isso é a única com dedupe. A janela de sete dias é longa
    de propósito: a mesma carta voltando toda semana é lembrete, a mesma carta
    voltando a cada quinze minutos é o app se tornando insuportável.

    O link vai para a vitrine da carta, e não para o anúncio de quem procura:
    de lá dá para ver todo mundo que a quer e abrir a proposta.
    """
    if quantos > 1:
        corpo = f"{quantos} pessoas procuram esta carta que você oferece."
    else:
        corpo = "Alguém procura esta carta que você oferece."
    return await _notificar(
        session,
        para=para,
        tipo=TIPO_CARTA_PROCURADA,
        titulo=f"Procuram sua {carta}",
        corpo=f"{corpo} Abra para propor a troca.",
        link=f"/vitrine/carta/{card_id}",
        dedupe_horas=24 * 7,
    )


async def carta_disponivel(
    session: AsyncSession,
    *,
    para: UUID | str,
    card_id: UUID | str,
    carta: str,
    quantos: int,
) -> bool:
    """A carta que você pediu para vigiar apareceu no Ofereço de alguém.

    A segunda notificação de varredura, e por isso a segunda com dedupe — mas a
    janela é de 24 horas, não de sete dias como a da carta procurada. As duas
    coisas não se parecem: aquela é o app puxando alguém de volta por algo que
    ele não pediu, esta é o cumprimento de um pedido explícito, e carta boa
    aparece e some no mesmo dia. Uma semana de silêncio depois do primeiro aviso
    faria a pessoa perder a segunda oferta que ela estava esperando.

    O link vai para a vitrine da carta: é de lá que se vê quem tem e se abre a
    proposta, que é a única coisa que a pessoa quer fazer ao ler isto.
    """
    corpo = (
        f"{quantos} pessoas anunciaram esta carta."
        if quantos > 1
        else "Alguém anunciou esta carta."
    )
    return await _notificar(
        session,
        para=para,
        tipo=TIPO_CARTA_DISPONIVEL,
        titulo=f"Apareceu: {carta}",
        corpo=f"{corpo} Abra para ver quem tem.",
        link=f"/vitrine/carta/{card_id}",
        dedupe_horas=24,
    )


async def plano_expirou(
    session: AsyncSession,
    *,
    para: UUID | str,
    desativados: int,
    teto: int,
) -> bool:
    """A carência acabou: o plano caiu para FREE e as ofertas excedentes saíram.

    **Diz o número.** "Seu plano mudou" é a versão do aviso que não deixa a
    pessoa fazer nada — ela abriria o acervo para descobrir o tamanho do estrago.
    Dizer quantas ofertas saíram e quantas ficaram é o que transforma a
    notificação em decisão: reativar as que importam, ou assinar de novo.

    **Nada foi apagado**, e o texto precisa dizer isso na primeira linha. Quem lê
    "180 ofertas desativadas" sem essa palavra entende que perdeu o cadastro de
    180 cartas, e é o susto que faz alguém abandonar o app antes de olhar.

    O link vai para o acervo, que é onde se reativa — não para a tela de planos.
    Mandar quem acabou de perder o plano direto para a página de preço é cobrar
    antes de consertar; o caminho para assinar de novo está no acervo, junto do
    aviso de teto, e é lá que a pessoa decide qual dos dois caminhos quer.
    """
    return await _notificar(
        session,
        para=para,
        tipo=TIPO_PLANO_EXPIROU,
        titulo="Seu PRO terminou",
        corpo=(
            f"Nada foi apagado. {desativados} "
            f"{'ofertas saíram' if desativados > 1 else 'oferta saiu'} do ar "
            f"para caber no limite de {teto} do plano FREE — "
            "abra o acervo para escolher quais reativar."
        ),
        link="/minhas-cartas",
    )
