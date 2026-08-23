"""Assinatura do PRO — o lado do TrocaTCG.

O provedor mora em `services/mercado_pago.py`; aqui fica a regra: quem vira PRO,
quando cai, e o que fazer com uma notificação que chegou.

**A verdade do plano é `profiles.plano`, e quem a escreve é o webhook.** A tela
não decide plano — ela mostra. Uma pessoa que chega à tela de sucesso do Mercado
Pago antes de a notificação chegar continua FREE por alguns segundos, e isso é
correto: o dinheiro é que promove, não o redirecionamento.

**A queda tem carência — e cancelar não é queda.** Assinatura que deixa de estar
autorizada por *falha de pagamento* (cartão recusado, Pix não pago) não derruba
ninguém na hora: são 7 dias com os limites do PRO, tempo de resolver.

Cancelamento voluntário é outro evento, e este módulo tratou os dois como um só
até 2026-08-22 — ver o docstring de `cancelar`. Quem cancela mantém o PRO até o
fim do ciclo que já pagou, porque o dinheiro daquele ciclo já entrou. Ver o item
10 da seção 16.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.core.limites import PRECOS, limites_de, plano_vigente
from app.services import mercado_pago, notificacoes

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


@asynccontextmanager
async def _provedor(acao: str) -> AsyncIterator[None]:
    """Falha do Mercado Pago vira erro de negócio, para quem está na tela.

    **Só no caminho de quem está esperando.** O webhook e os jobs continuam
    deixando a exceção subir: virar 500 lá é o que faz o Mercado Pago reenviar a
    notificação, e engolir isso significaria dar por tratado um aviso que não
    foi.

    Aqui é o contrário — quem clicou em "Assinar" precisa de uma frase, e sem
    esta tradução ela não chegava. A exceção crua subia até o
    `ServerErrorMiddleware`, que responde por fora do `CORSMiddleware`: o 500
    saía sem `access-control-allow-origin`, o navegador bloqueava a resposta, e
    o `fetch` do PWA rejeitava como se a rede tivesse caído. Em 2026-08-23 um
    400 do Mercado Pago apareceu na tela como "Confira sua conexão", e foram
    cinco tentativas antes de alguém olhar o log do servidor.

    502 e não 400: o pedido de quem clicou estava certo, quem recusou foi o
    intermediário. O `codigo` é o mesmo nos dois casos porque a diferença entre
    "recusaram" e "não deu para perguntar" não muda nada do que a pessoa pode
    fazer — o detalhe fica no log, com o corpo da resposta deles.
    """
    try:
        yield
    except mercado_pago.FalhaDoProvedor as exc:
        logger.error("[assinaturas] %s falhou no provedor: %s", acao, exc)
        raise RegraNegocio(
            "PAGAMENTO_INDISPONIVEL",
            f"Não foi possível {acao} agora. Tente de novo em alguns minutos.",
            status_code=502,
        ) from exc


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

    # O preço vem de casa desde 2026-08-22 — ver `PRECOS` em `core/limites.py` e
    # o docstring de `criar_assinatura`. Antes daqui saía um `preapproval_plan_id`
    # de ambiente, e a checagem era "o plano está configurado?". Agora a pergunta
    # não faz sentido: o valor é constante do código, não configuração, e um
    # período fora do mapa já foi recusado acima.
    async with _provedor("iniciar a assinatura"):
        recurso = await mercado_pago.criar_assinatura(
            periodo=periodo,
            valor=PRECOS[periodo],
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
    """Cancela a renovação. **O PRO continua até o fim do ciclo já pago.**

    Corrigido em 2026-08-22, e o que estava aqui antes era um bug com dinheiro
    dentro: o cancelamento abria a carência de 7 dias, que é regra pensada para
    *falha de pagamento*. Para quem paga R$ 199,90 no anual e cancela no segundo
    mês, isso retinha o valor de dez meses e cortava o serviço correspondente.

    **Os dois eventos não são o mesmo, e o módulo os tratava como se fossem.**
    Quando o pagamento falha, o dinheiro não entrou: os 7 dias são um favor, o app
    entrega serviço não pago enquanto a pessoa resolve. Quando alguém cancela, o
    dinheiro entrou por inteiro e referente ao ciclo todo — a pessoa não pediu
    para parar de receber, pediu para não ser cobrada de novo.

    E é o modelo que sustenta não haver devolução proporcional: não se devolve
    porque **o serviço continua sendo prestado** até o fim do ciclo pago. Cortar o
    acesso derrubaria essa justificativa e traria a devolução de volta.

    Os Termos (§8) sempre disseram isto; era o código que discordava do contrato.
    """
    linha = (
        (
            await session.execute(
                text("""
                    select preapproval_id, proxima_cobranca_em
                    from subscriptions
                    where user_id = :u and status <> 'cancelled'
                    order by criado_em desc limit 1
                """),
                {"u": str(user_id)},
            )
        )
        .mappings()
        .first()
    )
    if not linha:
        raise RegraNegocio(
            "SEM_ASSINATURA", "Não há assinatura ativa para cancelar.", status_code=404
        )

    preapproval_id = linha["preapproval_id"]
    # Antes do `_registrar` de propósito: se o Mercado Pago não confirmou o
    # cancelamento, gravar "cancelled" aqui deixaria o app dizendo que a
    # renovação parou enquanto a cobrança continua saindo todo mês.
    async with _provedor("cancelar a assinatura"):
        await mercado_pago.cancelar_assinatura(preapproval_id)
    await _registrar(session, preapproval_id, "cancelled", None)

    # `_registrar` acabou de gravar `now() + 7 dias`, porque para ele `cancelled`
    # e "pagamento falhou" são o mesmo evento. Para cancelamento voluntário não
    # são, e esta linha corrige por cima — a ordem é proposital.
    #
    # Sem o `and plano_expira_em is null` que `_registrar` usa: aqui sobrescrever
    # é o ponto, não o acidente.
    await session.execute(
        text("""
            update profiles
               set plano_expira_em = case
                     when cast(:fim as timestamptz) > now()
                       then cast(:fim as timestamptz)
                     else coalesce(plano_expira_em, now() + interval '7 days')
                   end
             where id = cast(:u as uuid)
               and plano = 'PRO'
        """),
        {"fim": _quando(linha["proxima_cobranca_em"]), "u": str(user_id)},
    )
    await session.commit()


async def cancelar_ao_sair(session: AsyncSession, user_id: UUID) -> bool:
    """Cancela a assinatura de quem está apagando a conta. Devolve se cancelou.

    **Existe porque a cobrança não mora aqui.** O `on delete cascade` de
    `subscriptions` apaga o lastro local e não toca no Mercado Pago: sem esta
    passada, quem apaga a conta continua sendo cobrado todo mês por um app onde
    não tem mais conta — e o `preapproval_id`, que é a única chave para cancelar,
    sai do banco junto. O estrago é silencioso dos dois lados e só aparece na
    fatura.

    **Não commita e não levanta.** A exclusão da conta é o pedido da pessoa e um
    direito da LGPD; ela não pode falhar porque o provedor de pagamento está fora
    do ar. Quando a chamada falha, fica o log com o `preapproval_id` — que é o
    que permite cancelar na mão — e a conta some do mesmo jeito.
    """
    preapproval_id = await session.scalar(
        text("""
            select preapproval_id from subscriptions
            where user_id = :u and status <> 'cancelled'
            order by criado_em desc limit 1
        """),
        {"u": str(user_id)},
    )
    if not preapproval_id or not mercado_pago.ativo():
        return False

    try:
        await mercado_pago.cancelar_assinatura(preapproval_id)
    except Exception:
        logger.exception(
            "[assinaturas] conta apagada com assinatura viva — cancelar na mão: %s",
            preapproval_id,
        )
        return False
    return True


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

    try:
        recurso = await mercado_pago.buscar_assinatura(recurso_id)
    except mercado_pago.RecursoInexistente:
        # Fim de linha, e por isso 200 e não 500. O Mercado Pago reenvia tudo que
        # não recebe 200: contra um id que ele mesmo não resolve, isso seria
        # reenvio para sempre. O evento fica commitado de propósito — na próxima
        # vez que a mesma notificação chegar, o dedupe responde "repetida" sem
        # gastar outra ida à API deles.
        logger.warning(
            "[assinaturas] notificação de recurso que o provedor não conhece: %s",
            recurso_id,
        )
        await session.commit()
        return "desconhecido"

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


def _quando(valor: str | datetime | None) -> datetime | None:
    """A data que o Mercado Pago manda como texto, virada `datetime`.

    **Sem isto o webhook devolvia 500 em toda notificação real**, e nenhum teste
    pegava. O provedor manda `next_payment_date` como `'2026-08-22T12:35:49.000-04:00'`,
    e o SQL fazia `cast(:prox as timestamptz)` acreditando que o banco resolveria.
    Não resolve: o asyncpg confere o tipo Python **antes** de mandar a query, e
    recusa `str` num parâmetro de timestamp — o `cast` do SQL nunca chega a rodar.

    Descoberto em 2026-08-22, mandando uma notificação assinada por um túnel para
    a API local. Os testes passavam porque o dublê de sessão não liga em tipo
    nenhum, e porque os casos com data usavam `None`.

    **Data ilegível vira `None`, e não exceção.** No SQL o valor entra dentro de
    um `coalesce(..., proxima_cobranca_em)`: `None` mantém o que já estava. Perder
    a data de cobrança é ruim; perder a notificação inteira — que é o que uma
    exceção aqui faria — é pior, porque ela também carrega a mudança de status
    que decide quem é PRO.
    """
    if valor is None or isinstance(valor, datetime):
        return valor
    try:
        return datetime.fromisoformat(valor)
    except ValueError:
        logger.warning("[assinaturas] next_payment_date ilegível: %r", valor)
        return None


async def _registrar(
    session: AsyncSession,
    preapproval_id: str,
    status: str,
    proxima_cobranca: str | datetime | None,
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
                    "prox": _quando(proxima_cobranca),
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


#: As ofertas excedentes que sobram além do teto, da mais recente para a mais
#: antiga. As mais **antigas** é que ficam de pé: são as que a pessoa cadastrou
#: quando ainda era FREE, ou as que ela carrega desde sempre, e derrubar essas
#: para manter as de ontem seria desfazer o acervo em vez de aparar o excesso.
#:
#: `row_number` e não `offset`: o corte é por pessoa, e um `offset` numa consulta
#: que mistura várias pessoas pularia as primeiras linhas da lista inteira.
_DESATIVAR_EXCEDENTES = text("""
    with ordenadas as (
        select id,
               user_id,
               row_number() over (
                   partition by user_id order by criado_em, id
               ) as posicao
          from listings
         where user_id = any(cast(:ids as uuid[]))
           and tipo = 'OFERTA'
           and ativo = true
    ),
    desativadas as (
        update listings
           set ativo = false
         where id in (select id from ordenadas where posicao > :teto)
     returning user_id::text
    )
    select user_id, count(*) as quantas
      from desativadas
     group by user_id
""")


async def encerrar_carencias(session: AsyncSession) -> dict[str, int]:
    """Derruba para FREE quem passou dos 7 dias e apara o que não cabe mais.

    Roda pelo cron. Fecha o item 10 da seção 16 inteiro: a queda de plano e a
    desativação das ofertas excedentes, da mais recente para a mais antiga.

    **Nada é apagado, nunca.** `ativo = false` é o mesmo soft delete que o resto
    do app usa: a carta continua no acervo, com condição, acabamento e idioma
    intactos, e reativá-la é um clique. O que sai é a *vitrine*, não o cadastro —
    e a pessoa escolhe quais 20 voltam.

    **O teto sai de `plano_vigente`, não de `limites_de` direto.** Enquanto
    `COBRANCA_ATIVA` for falso o vigente é PRO, o teto é `None` e nada é
    desativado: ninguém está pagando, e derrubar oferta de quem nunca foi cobrado
    seria punir pelo que o app ainda não vende. É o mesmo portão de
    `_checar_teto_de_ofertas`, pelo mesmo motivo.

    Não commita: quem chama fecha a transação, como o resto dos jobs.
    """
    caidos = (
        (
            await session.execute(
                text("""
                    update profiles
                       set plano = 'FREE', plano_expira_em = null
                     where plano_expira_em is not null
                       and plano_expira_em < now()
                 returning id::text
                """)
            )
        )
        .scalars()
        .all()
    )
    if not caidos:
        return {"caidos": 0, "ofertas_desativadas": 0}

    teto = limites_de(plano_vigente("FREE")).max_ofertas
    if teto is None:
        return {"caidos": len(caidos), "ofertas_desativadas": 0}

    aparados = (
        (
            await session.execute(
                _DESATIVAR_EXCEDENTES, {"ids": list(caidos), "teto": teto}
            )
        )
        .mappings()
        .all()
    )

    for linha in aparados:
        await notificacoes.plano_expirou(
            session, para=linha["user_id"], desativados=linha["quantas"], teto=teto
        )

    return {
        "caidos": len(caidos),
        "ofertas_desativadas": sum(linha["quantas"] for linha in aparados),
    }


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

    return {"conferidas": conferidas, **await encerrar_carencias(session)}
