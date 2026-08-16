"""Alerta de carta — "avise quando aparecer".

A busca que não acha nada é o momento mais frustrante do app e o único em que a
pessoa está claramente disposta a esperar. O alerta é a resposta a esse vazio:
ela pede para ser avisada, e o job avisa quando alguém puser a carta no Ofereço.

**Não é o Procuro, e não é o aviso que já existe.** O `CARTA_PROCURADA` corre no
sentido contrário — avisa quem *oferece* que passaram a procurar a carta dele. O
sentido que faltava é este, e ele falta porque sem reciprocidade o matcher não
cria match nenhum: alguém pôs a sua carta à venda e nada acontece. Ver a
migração `29`.

Recurso do PRO (`core/limites.alerta_carta`): é vigilância contínua do catálogo,
que é conveniência e alcance — nunca participação. Enquanto `COBRANCA_ATIVA` for
falso o portão está aberto para todo mundo, como o resto da Fase A.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.core.limites import limites_de, plano_vigente
from app.services import notificacoes


async def _plano(session: AsyncSession, user_id: UUID) -> str:
    return (
        await session.scalar(
            text("select plano from profiles where id = :id"), {"id": str(user_id)}
        )
    ) or "FREE"


async def criar(
    session: AsyncSession,
    user_id: UUID,
    card_id: UUID,
    finish_id: int | None = None,
) -> None:
    """Passa a vigiar uma carta para esta pessoa. Idempotente.

    Repetir o pedido não é erro nem duplica linha: a tela é um interruptor, e um
    toque duplo (ou dois aparelhos) não pode virar dois avisos da mesma
    novidade. O acabamento novo sobrescreve o antigo pelo mesmo motivo.
    """
    if not limites_de(plano_vigente(await _plano(session, user_id))).alerta_carta:
        raise RegraNegocio(
            "RECURSO_DO_PRO",
            "Ser avisado quando a carta aparecer é do PRO. No plano atual dá "
            "para pôr a carta no Procuro e acompanhar pela vitrine.",
            status_code=402,
        )

    await session.execute(
        text("""
            insert into card_alerts (user_id, card_id, finish_id)
            values (:u, :c, :f)
            on conflict (user_id, card_id) do update set finish_id = excluded.finish_id
        """),
        {"u": str(user_id), "c": str(card_id), "f": finish_id},
    )
    await session.commit()


async def remover(session: AsyncSession, user_id: UUID, card_id: UUID) -> None:
    """Para de vigiar. Sem erro quando não havia alerta — o fim é o mesmo."""
    await session.execute(
        text("delete from card_alerts where user_id = :u and card_id = :c"),
        {"u": str(user_id), "c": str(card_id)},
    )
    await session.commit()


async def listar(session: AsyncSession, user_id: UUID) -> list[dict]:
    """As cartas que esta pessoa espera, da mais recente para a mais antiga."""
    linhas = (
        (
            await session.execute(
                text("""
                    select a.card_id::text as card_id, a.finish_id, a.criado_em
                    from card_alerts a
                    where a.user_id = :u
                    order by a.criado_em desc
                """),
                {"u": str(user_id)},
            )
        )
        .mappings()
        .all()
    )
    return [dict(linha) for linha in linhas]


# A oferta nova que alguém está esperando.
#
# A janela é sobre `o.criado_em`, a OFERTA nova — mesma escolha do
# `notify-wanted`: o trabalho é proporcional ao que mudou, não ao tamanho da
# base. Quem impede a repetição é o dedupe de sete dias do serviço de
# notificação, não a janela.
#
# `finish_id` nulo no alerta quer dizer "qualquer acabamento", que é o caso
# comum de quem pediu no vazio da busca. Preenchido, ele aperta: quem pediu a
# reverse não quer ser avisado da normal.
#
# O anúncio de quem pediu o alerta não conta — ninguém precisa ser avisado da
# própria carta —, e quem está bloqueado não gera aviso nem recebe.
_OFERTAS_ESPERADAS = text("""
    select a.user_id::text as espera,
           o.card_id::text as card_id,
           coalesce(c.nome_pt, c.nome_en) as carta,
           count(distinct o.user_id) as quantos
    from card_alerts a
    join listings o
      on o.card_id = a.card_id
     and o.tipo = 'OFERTA'
     and o.ativo = true
     and o.quantidade > 0
     and (a.finish_id is null or o.finish_id = a.finish_id)
    join profiles quem_espera on quem_espera.id = a.user_id
    join profiles dono on dono.id = o.user_id
    join cards c on c.id = o.card_id
    where o.user_id <> a.user_id
      and quem_espera.bloqueado = false
      and dono.bloqueado = false
      and o.criado_em > now() - make_interval(hours => :horas)
    group by a.user_id, o.card_id, coalesce(c.nome_pt, c.nome_en)
""")


async def notificar_cartas_disponiveis(session: AsyncSession, horas: int = 24) -> int:
    """Avisa quem espera uma carta que acabou de ser anunciada. Devolve quantos.

    Roda pelo cron (`/internal/jobs/notify-alerts`), no mesmo intervalo e com a
    mesma janela generosa do `notify-wanted`: uma execução perdida não deixa
    buraco, porque a seguinte revisita o período.

    O alerta **não** é consumido pelo aviso. A carta pode aparecer e sumir antes
    de a pessoa abrir o app, e apagar o alerta no primeiro aviso a deixaria sem
    vigilância justamente por causa de uma oferta que ela não chegou a ver. Quem
    encerra é ela, tocando de novo no interruptor — ou a exclusão da conta.

    Não commita: quem chama fecha a transação, como o resto dos jobs.
    """
    linhas = (
        (await session.execute(_OFERTAS_ESPERADAS, {"horas": horas})).mappings().all()
    )

    enviadas = 0
    for r in linhas:
        if await notificacoes.carta_disponivel(
            session,
            para=r["espera"],
            card_id=r["card_id"],
            carta=r["carta"],
            quantos=r["quantos"],
        ):
            enviadas += 1
    return enviadas
