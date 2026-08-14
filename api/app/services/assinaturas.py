"""Assinatura do PRO — o lado do TrocaTCG.

O provedor mora em `services/mercado_pago.py`; aqui fica a regra: quem vira PRO,
quando cai, e o que fazer com uma notificação que chegou.

**A verdade do plano é `profiles.plano`, e quem a escreve é o webhook.** A tela
não decide plano — ela mostra. Uma pessoa que chega à tela de sucesso do Mercado
Pago antes de a notificação chegar continua FREE por alguns segundos, e isso é
correto: o dinheiro é que promove, não o redirecionamento.

**A queda tem carência.** Assinatura que deixa de estar autorizada (cartão
recusado, Pix não pago, cancelamento) não derruba ninguém na hora: são 7 dias com
os limites do PRO, tempo de resolver o pagamento. Ver o item 10 da seção 16.
"""

import logging
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.services import mercado_pago

logger = logging.getLogger(__name__)

#: Dias de carência entre a assinatura falhar e o plano cair de fato.
CARENCIA_DIAS = 7

#: O único status do Mercado Pago que compra o PRO. `pending` é assinatura
#: criada e não autorizada — quem fechou a aba no meio do checkout está aqui, e
#: promover essa pessoa seria dar o plano por ter clicado.
AUTORIZADA = "authorized"

#: Os tópicos que este app trata. O de plano (`subscription_preapproval_plan`)
#: fica de fora de propósito: ele avisa que o *preço* mudou, não que alguém
#: assinou, e reagir a ele mexendo em plano de gente seria confundir as coisas.
TOPICOS = frozenset({"subscription_preapproval", "subscription_authorized_payment"})


async def _email(session: AsyncSession, user_id: UUID) -> str:
    """O e-mail da conta, que o Mercado Pago exige para criar a assinatura.

    Vem de `auth.users` porque é lá que ele mora — `profiles` nunca guardou
    e-mail, e duplicá-lo aqui criaria uma segunda verdade que envelhece sozinha.
    """
    email = await session.scalar(
        text("select email from auth.users where id = :id"), {"id": str(user_id)}
    )
    if not email:
        raise RegraNegocio(
            "SEM_EMAIL",
            "Não foi possível identificar o e-mail da sua conta.",
            status_code=422,
        )
    return email


async def iniciar(session: AsyncSession, user_id: UUID, periodo: str) -> dict:
    """Cria a assinatura no Mercado Pago e devolve para onde mandar a pessoa.

    O `init_point` é o checkout deles. Nada de plano muda aqui: a linha nasce
    `pending` e só o webhook a promove.
    """
    if periodo not in mercado_pago.PERIODOS:
        raise RegraNegocio(
            "PERIODO_INVALIDO",
            "Escolha entre o plano mensal e o anual.",
            campo="periodo",
        )

    plano_id = mercado_pago.plano_do_periodo(periodo)
    if not plano_id:
        raise RegraNegocio(
            "ASSINATURA_INDISPONIVEL",
            "A assinatura ainda não está disponível.",
            status_code=503,
        )

    recurso = await mercado_pago.criar_assinatura(
        plano_id=plano_id,
        email=await _email(session, user_id),
        referencia=str(user_id),
        back_url=settings.MERCADO_PAGO_BACK_URL,
    )

    await session.execute(
        text("""
            insert into subscriptions (user_id, preapproval_id, status, periodo)
            values (:u, :p, :s, :per)
            on conflict (preapproval_id) do update
               set status = excluded.status, atualizado_em = now()
        """),
        {
            "u": str(user_id),
            "p": recurso["id"],
            "s": recurso.get("status", "pending"),
            "per": periodo,
        },
    )
    await session.commit()

    return {"init_point": recurso["init_point"], "preapproval_id": recurso["id"]}


async def situacao(session: AsyncSession, user_id: UUID) -> dict:
    """O que a tela de Configurações precisa dizer sobre o plano desta pessoa."""
    linha = (
        (
            await session.execute(
                text("""
                    select p.plano,
                           p.plano_expira_em,
                           s.status,
                           s.periodo,
                           s.proxima_cobranca_em
                    from profiles p
                    left join lateral (
                        select status, periodo, proxima_cobranca_em
                        from subscriptions
                        where user_id = p.id
                        order by criado_em desc
                        limit 1
                    ) s on true
                    where p.id = :id
                """),
                {"id": str(user_id)},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        return {"plano": "FREE", "status": None}
    return dict(linha)


async def cancelar(session: AsyncSession, user_id: UUID) -> None:
    """Cancela a assinatura ativa. O PRO continua até o fim da carência.

    Cortar na hora seria cobrar o mês inteiro e entregar até o dia do
    cancelamento — o contrário do que a tela promete.
    """
    preapproval_id = await session.scalar(
        text("""
            select preapproval_id from subscriptions
            where user_id = :u and status <> 'cancelled'
            order by criado_em desc limit 1
        """),
        {"u": str(user_id)},
    )
    if not preapproval_id:
        raise RegraNegocio(
            "SEM_ASSINATURA", "Não há assinatura ativa para cancelar.", status_code=404
        )

    await mercado_pago.cancelar_assinatura(preapproval_id)
    await _registrar(session, preapproval_id, "cancelled", None)
    await session.commit()


async def aplicar_notificacao(
    session: AsyncSession,
    *,
    notificacao_id: str,
    topico: str,
    recurso_id: str,
) -> str:
    """Trata uma notificação do Mercado Pago. Devolve o que foi feito.

    **Idempotente pelo id da notificação.** O Mercado Pago reenvia quando não
    recebe 200 a tempo, e reenviar é o comportamento certo dele; o que não pode é
    o mesmo aviso ser aplicado duas vezes. A chave é o id da *notificação* e não
    o do recurso, porque a mesma assinatura gera muitos avisos legítimos ao longo
    da vida — deduplicar por recurso engoliria mudança de estado de verdade.

    **O corpo da notificação não é fonte de nada.** Dele sai só o id; o estado
    vem de uma consulta à API. Corpo forjado que passasse pela assinatura ainda
    assim não promoveria ninguém.
    """
    if topico not in TOPICOS:
        return "ignorado"

    inserida = await session.scalar(
        text("""
            insert into webhook_events (id, topico, recurso_id)
            values (:i, :t, :r)
            on conflict (id) do nothing
            returning id
        """),
        {"i": notificacao_id, "t": topico, "r": recurso_id},
    )
    if inserida is None:
        return "repetida"

    recurso = await mercado_pago.buscar_assinatura(recurso_id)
    await _registrar(
        session,
        recurso_id,
        recurso.get("status", "pending"),
        recurso.get("next_payment_date"),
        user_id=recurso.get("external_reference"),
        periodo=_periodo_do_recurso(recurso),
    )
    await session.commit()
    return "aplicada"


def _periodo_do_recurso(recurso: dict) -> str | None:
    """`mensal` ou `anual`, lido da frequência que o Mercado Pago devolve."""
    recorrencia = recurso.get("auto_recurring") or {}
    if recorrencia.get("frequency_type") != "months":
        return None
    for nome, meses in mercado_pago.PERIODOS.items():
        if recorrencia.get("frequency") == meses:
            return nome
    return None


async def _registrar(
    session: AsyncSession,
    preapproval_id: str,
    status: str,
    proxima_cobranca: str | None,
    *,
    user_id: str | None = None,
    periodo: str | None = None,
) -> None:
    """Grava o status novo e ajusta o plano da pessoa conforme ele."""
    atualizada = (
        (
            await session.execute(
                text("""
                    update subscriptions
                       set status = :s,
                           proxima_cobranca_em = coalesce(
                               cast(:prox as timestamptz), proxima_cobranca_em
                           ),
                           periodo = coalesce(:per, periodo),
                           atualizado_em = now()
                     where preapproval_id = :p
                 returning user_id::text
                """),
                {
                    "s": status,
                    "prox": proxima_cobranca,
                    "per": periodo,
                    "p": preapproval_id,
                },
            )
        )
        .mappings()
        .first()
    )

    dono = (atualizada or {}).get("user_id") or user_id
    if not dono:
        # Assinatura que não existe deste lado: aconteceu fora do app (painel do
        # Mercado Pago, ou ambiente trocado). Fica o registro e nada mais — mexer
        # no plano de alguém a partir de um vínculo que não se conhece é pior que
        # não fazer nada.
        logger.warning(
            "[assinaturas] notificação de preapproval desconhecido: %s", preapproval_id
        )
        return

    if status == AUTORIZADA:
        # Assinatura em dia: PRO e sem carência pendurada. O `plano_expira_em`
        # precisa voltar a nulo, senão quem falhou e pagou de novo cairia no
        # prazo antigo.
        await session.execute(
            text(
                "update profiles set plano = 'PRO', plano_expira_em = null "
                "where id = cast(:u as uuid)"
            ),
            {"u": dono},
        )
        return

    if status == "pending":
        # Criada e não autorizada. Não promove e não derruba — quem é PRO por uma
        # assinatura antiga não pode cair por ter começado a trocar de plano.
        return

    # `paused` ou `cancelled`: começa a carência, e só para quem tem o que
    # perder. O `plano_expira_em is null` na condição é o que impede a carência
    # de reiniciar a cada notificação repetida do mesmo problema — sem ele, uma
    # assinatura que falha todo dia daria PRO para sempre.
    await session.execute(
        text(f"""
            update profiles
               set plano_expira_em = now() + interval '{CARENCIA_DIAS} days'
             where id = cast(:u as uuid)
               and plano = 'PRO'
               and plano_expira_em is null
        """),
        {"u": dono},
    )


async def encerrar_carencias(session: AsyncSession) -> int:
    """Derruba para FREE quem passou dos 7 dias. Devolve quantos caíram.

    Roda pelo cron. **Não desativa anúncio nenhum** — a desativação dos
    excedentes, do mais recente para o mais antigo, é o item 10 da seção 16 e
    ainda não existe. Até ela entrar, um ex-assinante com 200 ofertas fica FREE
    com 200 ofertas ativas, e só esbarra no teto ao tentar cadastrar a próxima.

    Não commita: quem chama fecha a transação, como o resto dos jobs.
    """
    return (
        await session.scalar(
            text("""
                with caidos as (
                    update profiles
                       set plano = 'FREE', plano_expira_em = null
                     where plano_expira_em is not null
                       and plano_expira_em < now()
                 returning id
                )
                select count(*) from caidos
            """)
        )
    ) or 0


async def reconciliar(session: AsyncSession) -> dict[str, int]:
    """Confere no Mercado Pago as assinaturas que já deviam ter sido cobradas.

    Existe porque **webhook se perde**. Uma notificação que não chega deixa uma
    pessoa PRO de graça, ou — pior — tira o PRO de quem pagou. Esta passada é o
    que fecha o buraco: para toda assinatura viva cuja próxima cobrança já
    passou, pergunta-se o estado real e aplica-se o mesmo caminho do webhook.

    O recorte por `proxima_cobranca_em` é o que mantém o trabalho proporcional ao
    que mudou, e não ao tamanho da base.
    """
    if not mercado_pago.ativo():
        return {"desligado": 1}

    pendentes = (
        (
            await session.execute(
                text("""
                    select preapproval_id
                    from subscriptions
                    where status <> 'cancelled'
                      and proxima_cobranca_em is not null
                      and proxima_cobranca_em < now()
                    order by proxima_cobranca_em
                    limit 200
                """)
            )
        )
        .scalars()
        .all()
    )

    conferidas = 0
    for preapproval_id in pendentes:
        try:
            recurso = await mercado_pago.buscar_assinatura(preapproval_id)
        except Exception:
            # Uma assinatura ilegível não pode derrubar a varredura inteira: as
            # outras continuam, e esta volta na próxima passada.
            logger.exception("[assinaturas] falha ao reconciliar %s", preapproval_id)
            continue
        await _registrar(
            session,
            preapproval_id,
            recurso.get("status", "pending"),
            recurso.get("next_payment_date"),
            user_id=recurso.get("external_reference"),
        )
        conferidas += 1

    return {"conferidas": conferidas, "caidos": await encerrar_carencias(session)}
