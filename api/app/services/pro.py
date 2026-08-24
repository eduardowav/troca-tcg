"""O PRO — o lado do TrocaTCG.

O provedor mora em `services/mercado_pago.py`; aqui fica a regra: quem vira PRO,
por quanto tempo, e o que fazer com uma notificação que chegou.

**Substituiu `services/assinaturas.py` em 2026-08-23.** O PRO era assinatura
recorrente de cartão e passou a ser **tempo comprado por Pix** — a razão inteira
está em `db/schema/38`, e o resumo é que recorrência no Mercado Pago é cartão de
crédito e mais nada, enquanto quem troca carta em Belém paga por Pix.

**A verdade do plano é `profiles.plano` mais `profiles.plano_expira_em`, e quem
as escreve é o webhook.** A tela não decide plano — ela mostra. Quem gerou o QR e
ainda não pagou continua FREE, e isso é correto: o dinheiro é que promove.

**Comprar empilha, não reinicia.** Quem paga com o PRO ainda valendo soma o novo
período ao que sobra, em vez de perder os dias restantes. Sem isso, renovar cedo
seria punido, e o único momento seguro de pagar seria o último dia — que é
exatamente o dia em que a pessoa esquece.

**O que sumiu junto com a assinatura, e vale dizer por quê:**

- *A carência de 7 dias.* Existia porque cartão recusa: o app entregava serviço
  não pago enquanto a pessoa resolvia. Pix ou entrou ou não entrou, e o PRO
  nunca começa antes do dinheiro. Não há o que perdoar.
- *O cancelamento.* Não há renovação para cancelar. Com ele some o bug que
  retinha dez meses de quem pagava o anual (corrigido em 22/08) — agora ele é
  impossível de reintroduzir, porque o estado que o permitia não existe mais.

**O que entrou no lugar:** o aviso de vencimento. Sem renovação automática, quem
esquece cai — e cair sem ter sido avisado é a única forma de a pessoa perder
dinheiro neste desenho. Ver `avisar_vencimento`.
"""

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.core.limites import PRECOS, limites_de, plano_vigente
from app.services import mercado_pago, notificacoes

logger = logging.getLogger(__name__)

#: O único status do Mercado Pago que credita tempo. `pending` é QR gerado e não
#: pago — quem fechou a folha antes de abrir o banco está aqui, e promover essa
#: pessoa seria dar o plano por ter clicado.
APROVADO = "approved"

#: A janela de renovação, em dias antes do vencimento. **Governa duas coisas**, e
#: de propósito uma só constante: quando o aviso sai, e quando o botão de renovar
#: aparece na tela.
#:
#: Três, e não um: renovar exige abrir o banco e ter o dinheiro, e um dia de
#: prazo é um aviso que chega junto com a queda.
#:
#: **O botão entrou nesta janela por decisão do Eduardo em 2026-08-24.** Um
#: "Renovar com Pix" visível o ano inteiro para quem acabou de pagar é anúncio, e
#: contradiz o princípio da seção 16 — o convite ao PRO aparece no instante em
#: que a pessoa esbarra num limite, e não como faixa fixa. Fora da janela a
#: cartela continua dizendo até quando o plano vale, que é a informação; o que
#: some é a venda.
JANELA_DE_RENOVACAO_DIAS = 3

#: O tópico que este app trata. Era `subscription_preapproval` até 2026-08-23;
#: pagamento avulso notifica por `payment`.
TOPICOS = frozenset({"payment"})


@asynccontextmanager
async def _provedor(acao: str) -> AsyncIterator[None]:
    """Falha do Mercado Pago vira erro de negócio, para quem está na tela.

    **Só no caminho de quem está esperando.** O webhook e os jobs continuam
    deixando a exceção subir: virar 500 lá é o que faz o Mercado Pago reenviar a
    notificação, e engolir isso significaria dar por tratado um aviso que não
    foi.

    Aqui é o contrário — quem clicou em "Pagar com Pix" precisa de uma frase, e
    sem esta tradução ela não chegava. A exceção crua subia até o
    `ServerErrorMiddleware`, que responde por fora do `CORSMiddleware`: o 500
    saía sem `access-control-allow-origin`, o navegador bloqueava a resposta, e
    o `fetch` do PWA rejeitava como se a rede tivesse caído. Em 2026-08-23 um
    400 do Mercado Pago apareceu na tela como "Confira sua conexão", e foram
    cinco tentativas antes de alguém olhar o log do servidor.

    502 e não 400: o pedido de quem clicou estava certo, quem recusou foi o
    intermediário.
    """
    try:
        yield
    except mercado_pago.FalhaDoProvedor as exc:
        logger.error("[pro] %s falhou no provedor: %s", acao, exc)
        raise RegraNegocio(
            "PAGAMENTO_INDISPONIVEL",
            f"Não foi possível {acao} agora. Tente de novo em alguns minutos.",
            status_code=502,
        ) from exc


async def _email(session: AsyncSession, user_id: UUID) -> str:
    """O e-mail da conta, que o Mercado Pago exige para criar a cobrança.

    Vem de `auth.users` porque é lá que ele mora — `profiles` nunca guardou
    e-mail, e duplicá-lo aqui criaria uma segunda verdade que envelhece sozinha.

    **Endereço com `+` e domínio descartável são recusados pelo Mercado Pago**,
    os dois com a mesma mensagem genérica (`User bad request`), que não diz qual
    é o caso. Custou uma tarde em 23/08. A tradução de `_provedor` é o que evita
    que isso volte a aparecer na tela como falha de rede.
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


def _chave_de_idempotencia(user_id: UUID, periodo: str, minutos: int) -> str:
    """O `X-Idempotency-Key` da criação da cobrança.

    **Determinística, e não um uuid solto — e a diferença é dinheiro.** Uma chave
    nova a cada chamada não protege de nada: se o POST sai daqui e a resposta se
    perde no caminho de volta, não há linha local, a checagem de cobrança viva
    não acha nada, e a próxima tentativa cria uma *segunda* cobrança. Duas
    cobranças válidas na mão da mesma pessoa, e o Pix não pergunta se a outra já
    foi paga.

    A chave é (pessoa, período, janela), e a janela tem a duração do QR. Dentro
    dela o Mercado Pago devolve o mesmo pagamento em vez de criar outro; passada
    ela, o QR anterior já morreu e uma cobrança nova é o que se quer.

    O corte da janela é fixo no relógio, não contado a partir da primeira
    chamada, o que deixa uma fresta: uma retentativa exatamente na virada cai na
    janela seguinte e gera outra cobrança. A fresta é de segundos contra trinta
    minutos, e fechá-la exigiria gravar a chave antes de saber o id do pagamento
    — uma linha a mais, escrita para o caso raro, que teria de ser limpa depois.
    """
    janela = int(time.time()) // max(60, minutos * 60)
    return f"pro:{user_id}:{periodo}:{janela}"


_COBRANCA_VIVA = text("""
    select payment_id, periodo, valor, qr_code, expira_em
      from pro_pagamentos
     where user_id = cast(:u as uuid)
       and status = 'pending'
       and expira_em > now()
       and qr_code is not null
     order by criado_em desc
     limit 1
""")


async def comprar(session: AsyncSession, user_id: UUID, periodo: str) -> dict:
    """Gera a cobrança Pix e devolve o QR. Ninguém vira PRO aqui.

    **Cobrança viva é reaproveitada, e essa é a regra que evita pagar duas
    vezes.** Quem fecha a folha do QR e volta um minuto depois recebe o mesmo
    "copia e cola", não um segundo. Gerar outro deixaria dois códigos válidos
    para a mesma compra na mão da mesma pessoa — e o Pix não pergunta se já foi
    pago antes de aceitar o segundo.

    **Reaproveita só quando o período é o mesmo.** Pedir outro período troca a
    cobrança: a anterior é cancelada no Mercado Pago e uma nova nasce.

    Isto era o contrário até 2026-08-24, e o Eduardo achou o defeito usando o
    app: gerou o mensal, clicou no anual e recebeu o mensal de volta. Quem toca
    no plano errado ficava trinta minutos preso a ele. O argumento que sustentava
    o desenho antigo — "cancelar uma cobrança que talvez já tenha sido paga é
    dinheiro entrando sem nada para creditar" — não se sustenta: **o Mercado Pago
    recusa cancelar pagamento aprovado**. Cancelamento que passa é prova de que o
    dinheiro não entrou, e não há corrida a perder.

    Quando o cancelamento falha, a cobrança antiga volta como estava. É o
    caminho seguro: pode ser que ela tenha acabado de ser paga, e nesse caso
    gerar a segunda seria pedir para pagar duas vezes. Quem resolve é o webhook,
    segundos depois.
    """
    if periodo not in mercado_pago.PERIODOS:
        raise RegraNegocio(
            "PERIODO_INVALIDO",
            "Escolha entre o plano mensal e o anual.",
            campo="periodo",
        )

    viva = (
        (await session.execute(_COBRANCA_VIVA, {"u": str(user_id)})).mappings().first()
    )
    if viva and viva["periodo"] == periodo:
        return {**dict(viva), "reaproveitada": True}

    if viva and not await _trocar_de_periodo(session, viva):
        # Não deu para matar a anterior — provavelmente porque acabou de ser
        # paga. Devolver a que existe é o único caminho que não arrisca uma
        # segunda cobrança viva.
        return {**dict(viva), "reaproveitada": True}

    valor = PRECOS[periodo]
    minutos = settings.MERCADO_PAGO_PIX_MINUTOS

    async with _provedor("gerar o Pix"):
        recurso = await mercado_pago.criar_pagamento_pix(
            periodo=periodo,
            valor=valor,
            email=await _email(session, user_id),
            referencia=str(user_id),
            chave=_chave_de_idempotencia(user_id, periodo, minutos),
            minutos=minutos,
        )

    qr = mercado_pago.qr_do_pagamento(recurso)
    if not qr:
        # Pagamento criado sem QR não é falha de rede nem recusa: é a conta do
        # vendedor sem chave Pix cadastrada, e o Mercado Pago responde 201 do
        # mesmo jeito. Sem esta guarda, a tela mostraria uma folha vazia e a
        # pessoa ficaria esperando um código que nunca vem.
        logger.error(
            "[pro] pagamento %s criado sem QR — chave Pix do vendedor?",
            recurso.get("id"),
        )
        raise RegraNegocio(
            "PIX_INDISPONIVEL",
            "O pagamento por Pix está temporariamente indisponível.",
            status_code=502,
        )

    linha = (
        (
            await session.execute(
                text("""
                    insert into pro_pagamentos
                           (user_id, payment_id, periodo, valor, status,
                            qr_code, expira_em)
                    values (cast(:u as uuid), :p, :per, :v, :s,
                            :qr, cast(:exp as timestamptz))
                    on conflict (payment_id) do update
                       set qr_code = excluded.qr_code, atualizado_em = now()
                 returning payment_id, periodo, valor, qr_code, expira_em
                """),
                {
                    "u": str(user_id),
                    "p": str(recurso["id"]),
                    "per": periodo,
                    "v": valor,
                    "s": recurso.get("status", "pending"),
                    "qr": qr,
                    "exp": _quando(recurso.get("date_of_expiration")),
                },
            )
        )
        .mappings()
        .first()
    )
    await session.commit()

    return {**dict(linha or {}), "reaproveitada": False}


async def _trocar_de_periodo(session: AsyncSession, viva: dict) -> bool:
    """Mata a cobrança pendente para dar lugar a outra. Devolve se conseguiu.

    **A recusa do provedor é a trava, e é ela que torna isto seguro.** O Mercado
    Pago não cancela pagamento aprovado: se a chamada passa, ninguém pagou. Se
    ela falha, o motivo mais provável é que alguém acabou de pagar — e aí a
    resposta certa é não gerar cobrança nenhuma, deixar o webhook creditar, e
    devolver a que existe.

    Não levanta. Falar com o provedor pode não dar certo por rede também, e
    nesse caso o resultado desejado é o mesmo: fique com a cobrança que já
    existe. Quem chama decide o que mostrar.
    """
    try:
        await mercado_pago.cancelar_pagamento(viva["payment_id"])
    except Exception:
        logger.warning(
            "[pro] não deu para cancelar %s ao trocar de período",
            viva["payment_id"],
            exc_info=True,
        )
        return False

    await session.execute(
        text("""
            update pro_pagamentos
               set status = 'cancelled', atualizado_em = now()
             where payment_id = :p and status = 'pending'
        """),
        {"p": viva["payment_id"]},
    )
    logger.info("[pro] cobrança %s cancelada para troca de período", viva["payment_id"])
    return True


async def situacao(session: AsyncSession, user_id: UUID) -> dict:
    """O que a tela precisa dizer sobre o PRO desta pessoa.

    Traz o plano e, se houver, a última cobrança — que é o que permite a folha
    do Pix se reabrir sozinha quando a pessoa volta ao app com o QR ainda vivo.

    **`pode_renovar` é decidido aqui, e não na tela.** É a mesma janela do aviso
    de vencimento (`JANELA_DE_RENOVACAO_DIAS`), e ter as duas coisas saindo de
    uma constante só é o que impede o app de avisar "vence em 3 dias" numa
    notificação cuja tela de destino não oferece como pagar.

    **Só esconde o botão; não fecha a rota.** Quem quiser comprar fora da janela
    ainda consegue por `POST /me/pro/pagamentos`, e isso é deliberado: a intenção
    é não insistir com quem já pagou, não proibir quem quer pagar adiantado. O
    crédito empilha a partir do fim do período atual de qualquer forma — ver
    `_creditar` —, então pagar cedo nunca custa dias a ninguém.
    """
    linha = (
        (
            await session.execute(
                text("""
                    select p.plano,
                           p.plano_expira_em,
                           -- Quem decide se o botão de renovar existe é o
                           -- servidor, e a conta é feita **no banco**: o relógio
                           -- do celular de quem usa o app erra, e um botão que
                           -- aparece ou some conforme o horário errado da pessoa
                           -- é pior que um botão fixo.
                           (
                             p.plano = 'PRO'
                             and p.plano_expira_em is not null
                             and p.plano_expira_em
                                 < now() + make_interval(days => :janela)
                           ) as pode_renovar,
                           g.status,
                           g.periodo,
                           g.qr_code,
                           g.expira_em as pix_expira_em,
                           g.pago_em
                    from profiles p
                    left join lateral (
                        select status, periodo, qr_code, expira_em, pago_em
                        from pro_pagamentos
                        where user_id = p.id
                        order by criado_em desc
                        limit 1
                    ) g on true
                    where p.id = :id
                """),
                {"id": str(user_id), "janela": JANELA_DE_RENOVACAO_DIAS},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        return {"plano": "FREE", "status": None, "pode_renovar": False}

    dados = dict(linha)
    # O QR só viaja para a tela enquanto vale. Devolver um vencido faria a folha
    # reabrir com um código que o banco recusa — pior que não reabrir.
    if dados.get("status") != "pending" or not _vivo(dados.get("pix_expira_em")):
        dados["qr_code"] = None
    return dados


def _vivo(quando: datetime | None) -> bool:
    """A data ainda está no futuro? Nulo é "não", e não "para sempre"."""
    if quando is None:
        return False
    agora = datetime.now(quando.tzinfo or UTC)
    return quando > agora


async def aplicar_notificacao(
    session: AsyncSession,
    *,
    notificacao_id: str,
    topico: str,
    recurso_id: str,
) -> str:
    """Trata uma notificação do Mercado Pago. Devolve o que foi feito.

    **Idempotente em duas camadas, e as duas são necessárias.** A primeira é o id
    da notificação, em `webhook_events`: o Mercado Pago reenvia quando não recebe
    200 a tempo, e reenviar é o comportamento certo dele. A segunda está em
    `_creditar`, e é a que importa quando o mesmo pagamento gera notificações
    *diferentes* — `payment.created` e `payment.updated` são dois avisos
    legítimos do mesmo dinheiro, passam os dois pelo dedupe, e sem a segunda
    camada creditariam o período duas vezes.

    **O corpo da notificação não é fonte de nada.** Dele sai só o id; o estado
    vem de uma consulta à API. Corpo forjado que passasse pela assinatura ainda
    assim não creditaria nada.
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
        recurso = await mercado_pago.buscar_pagamento(recurso_id)
    except mercado_pago.RecursoInexistente:
        # Fim de linha, e por isso 200 e não 500. O Mercado Pago reenvia tudo que
        # não recebe 200: contra um id que ele mesmo não resolve, isso seria
        # reenvio para sempre. O evento fica commitado de propósito — na próxima
        # vez que a mesma notificação chegar, o dedupe responde "repetida" sem
        # gastar outra ida à API deles.
        logger.warning(
            "[pro] notificação de pagamento que o provedor não conhece: %s",
            recurso_id,
        )
        await session.commit()
        return "desconhecido"

    resultado = await _registrar(session, str(recurso_id), recurso)
    await session.commit()
    return resultado


async def _registrar(session: AsyncSession, payment_id: str, recurso: dict) -> str:
    """Grava o estado do pagamento e credita o PRO quando o dinheiro entrou.

    **A linha local pode não existir**, e o caso não é raro o bastante para ser
    ignorado: se o POST que criou a cobrança saiu daqui e a resposta se perdeu no
    caminho de volta, o pagamento existe no Mercado Pago e não existe no banco.
    A pessoa paga, a notificação chega, e sem esta reconstrução ela pagaria sem
    receber. O `external_reference` é o que permite reconstruir — é o id do
    usuário, e é por isso que ele viaja na criação.
    """
    status = recurso.get("status", "pending")
    dono = recurso.get("external_reference")

    if dono:
        # Reconstrução do que se perdeu. `do nothing` porque o caso normal é a
        # linha já existir, e nesse caso quem manda é o que foi gravado na
        # criação — não o que se deduz agora do recurso.
        await session.execute(
            text("""
                insert into pro_pagamentos
                       (user_id, payment_id, periodo, valor, status)
                values (cast(:u as uuid), :p, :per, :v, 'pending')
                on conflict (payment_id) do nothing
            """),
            {
                "u": dono,
                "p": payment_id,
                "per": _periodo_do_recurso(recurso) or "mensal",
                "v": Decimal(str(recurso.get("transaction_amount") or 0)),
            },
        )

    if status != APROVADO:
        await session.execute(
            text("""
                update pro_pagamentos
                   set status = :s, atualizado_em = now()
                 where payment_id = :p and status <> 'approved'
            """),
            {"s": status, "p": payment_id},
        )
        return "registrado"

    return await _creditar(session, payment_id, recurso)


async def _creditar(session: AsyncSession, payment_id: str, recurso: dict) -> str:
    """Soma o período comprado ao PRO de quem pagou. Roda uma vez por pagamento.

    **A transição é a trava.** O `where status <> 'approved'` faz o próprio
    `update` decidir se este é o primeiro aviso de aprovação deste pagamento: se
    a linha já estava aprovada, nada volta e nada é creditado. É o que impede
    `payment.created` e `payment.updated` do mesmo dinheiro — dois avisos
    legítimos, dois ids de notificação diferentes — de creditarem dois períodos.

    **`greatest(..., now())` é o que faz a compra empilhar.** Quem renova faltando
    dez dias soma o período novo aos dez que sobravam; quem voltou depois de ter
    caído soma a partir de hoje, e não a partir de uma data no passado — sem o
    `greatest`, quem passou dois meses fora compraria um mês e continuaria
    vencido.
    """
    linha = (
        (
            await session.execute(
                text("""
                    update pro_pagamentos
                       set status = 'approved',
                           pago_em = coalesce(pago_em, now()),
                           atualizado_em = now()
                     where payment_id = :p
                       and status <> 'approved'
                 returning user_id::text, periodo
                """),
                {"p": payment_id},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        # Ou já foi creditado — o caso comum, e a razão de esta função existir —,
        # ou é um pagamento que nunca teve linha aqui e cujo `external_reference`
        # não veio. Mexer no plano de alguém a partir de um vínculo que não se
        # conhece é pior que não fazer nada.
        logger.info("[pro] pagamento %s sem crédito a aplicar", payment_id)
        return "repetida"

    meses = mercado_pago.PERIODOS.get(linha["periodo"], 1)
    await session.execute(
        text("""
            update profiles
               set plano = 'PRO',
                   plano_expira_em = greatest(
                       coalesce(plano_expira_em, now()), now()
                   ) + make_interval(months => :meses)
             where id = cast(:u as uuid)
        """),
        {"meses": meses, "u": linha["user_id"]},
    )
    logger.info(
        "[pro] pagamento %s creditou %s meses para %s",
        payment_id,
        meses,
        linha["user_id"],
    )
    return "creditada"


def _periodo_do_recurso(recurso: dict) -> str | None:
    """`mensal` ou `anual`, deduzido do que o Mercado Pago devolve.

    Só serve à reconstrução de uma linha perdida — no caminho normal o período
    veio da tela e está gravado. A descrição é a primeira fonte porque é o que
    este app escreveu na criação; o valor é a segunda, e vale menos porque preço
    muda (há reajuste previsto para janeiro de 2027, e uma compra de agosto
    consultada em fevereiro não bateria com `PRECOS`).
    """
    descricao = (recurso.get("description") or "").lower()
    for nome in mercado_pago.PERIODOS:
        if nome in descricao:
            return nome

    try:
        valor = Decimal(str(recurso.get("transaction_amount")))
    except (TypeError, ValueError, ArithmeticError):
        return None
    for nome, preco in PRECOS.items():
        if preco == valor:
            return nome
    return None


def _quando(valor: str | datetime | None) -> datetime | None:
    """A data que o Mercado Pago manda como texto, virada `datetime`.

    **Sem isto o webhook devolvia 500 em toda notificação real**, e nenhum teste
    pegava. O provedor manda datas como `'2026-08-22T12:35:49.000-04:00'`, e o
    SQL fazia `cast(:x as timestamptz)` acreditando que o banco resolveria. Não
    resolve: o asyncpg confere o tipo Python **antes** de mandar a query, e
    recusa `str` num parâmetro de timestamp — o `cast` do SQL nunca chega a
    rodar.

    Descoberto em 2026-08-22, mandando uma notificação assinada por um túnel para
    a API local. Os testes passavam porque o dublê de sessão não liga em tipo
    nenhum, e porque os casos com data usavam `None`.

    **Data ilegível vira `None`, e não exceção.** Perder a data de vencimento do
    QR é ruim; perder a notificação inteira — que é o que uma exceção aqui faria
    — é pior, porque ela também carrega o estado que decide quem é PRO.
    """
    if valor is None or isinstance(valor, datetime):
        return valor
    try:
        return datetime.fromisoformat(valor)
    except ValueError:
        logger.warning("[pro] data ilegível do provedor: %r", valor)
        return None


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


async def expirar_vencidos(session: AsyncSession) -> dict[str, int]:
    """Derruba para FREE quem passou da data comprada e apara o que não cabe.

    Roda pelo cron. Fecha o item 10 da seção 16 inteiro: a queda de plano e a
    desativação das ofertas excedentes, da mais recente para a mais antiga.

    **Chamava-se `encerrar_carencias` até 2026-08-23**, e a mudança é de
    significado, não de nome: `plano_expira_em` era o fim de um prazo de favor
    depois de um cartão recusado, e passou a ser o fim do tempo que a pessoa
    pagou. O SQL é o mesmo porque a pergunta é a mesma — quem passou da data? —,
    mas agora ninguém cai devendo nada.

    **Nada é apagado, nunca.** `ativo = false` é o mesmo soft delete que o resto
    do app usa: a carta continua no acervo, com condição, acabamento e idioma
    intactos, e reativá-la é um clique. O que sai é a *vitrine*, não o cadastro —
    e a pessoa escolhe quais 20 voltam.

    **O teto sai de `plano_vigente`, não de `limites_de` direto.** Enquanto
    `COBRANCA_ATIVA` for falso o vigente é PRO, o teto é `None` e nada é
    desativado: ninguém está pagando, e derrubar oferta de quem nunca foi cobrado
    seria punir pelo que o app ainda não vende.

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


async def avisar_vencimento(session: AsyncSession) -> dict[str, int]:
    """Avisa quem está a três dias de perder o PRO.

    **É a peça que o Pix avulso exige e a assinatura não exigia.** Cartão renova
    sozinho; aqui, quem não pagar de novo cai. Sem este aviso o churn é
    silencioso — a pessoa descobre que perdeu o PRO ao esbarrar num limite, dias
    depois, e o que ela sente é que o app tirou algo dela.

    **Dedupe de 72 horas, não de 24.** O job roda diariamente e a janela dos três
    dias pega a mesma pessoa em três execuções seguidas; sem a janela larga, ela
    receberia o mesmo aviso três vezes. Com ela, recebe um.

    Não commita: quem chama fecha a transação, como o resto dos jobs.
    """
    vencendo = (
        (
            await session.execute(
                text("""
                    select id::text as user_id, plano_expira_em
                      from profiles
                     where plano = 'PRO'
                       and plano_expira_em is not null
                       and plano_expira_em > now()
                       and plano_expira_em < now() + make_interval(days => :d)
                """),
                {"d": JANELA_DE_RENOVACAO_DIAS},
            )
        )
        .mappings()
        .all()
    )

    avisados = 0
    for linha in vencendo:
        if await notificacoes.pro_vencendo(
            session, para=linha["user_id"], em=linha["plano_expira_em"]
        ):
            avisados += 1
    return {"avisados": avisados, "vencendo": len(vencendo)}


async def reconciliar(session: AsyncSession) -> dict[str, int]:
    """Confere no Mercado Pago os pagamentos que ficaram pendentes.

    Existe porque **webhook se perde**. Uma notificação que não chega deixa quem
    pagou sem o PRO — e essa pessoa não tem como saber que o problema foi nosso;
    para ela o Pix saiu da conta e o app não mudou. Esta passada é o que fecha o
    buraco.

    O recorte é por cobrança ainda `pending` e já vencida: passado o prazo do QR,
    ou o dinheiro entrou (e o aviso se perdeu) ou não vai entrar mais. O que não
    entrou fica marcado, e para de ser varrido.
    """
    if not mercado_pago.ativo():
        return {"desligado": 1}

    pendentes = (
        (
            await session.execute(
                text("""
                    select payment_id
                      from pro_pagamentos
                     where status = 'pending'
                       and expira_em is not null
                       and expira_em < now()
                     order by criado_em
                     limit 200
                """)
            )
        )
        .scalars()
        .all()
    )

    creditadas = 0
    for payment_id in pendentes:
        try:
            recurso = await mercado_pago.buscar_pagamento(payment_id)
        except mercado_pago.RecursoInexistente:
            # O provedor não conhece este id e nunca vai conhecer. Marcar é o que
            # o tira da varredura — sem isso ele volta em toda execução, para
            # sempre.
            await session.execute(
                text(
                    "update pro_pagamentos set status = 'desconhecido', "
                    "atualizado_em = now() where payment_id = :p"
                ),
                {"p": payment_id},
            )
            continue
        except Exception:
            # Um pagamento ilegível não pode derrubar a varredura inteira: os
            # outros continuam, e este volta na próxima passada.
            logger.exception("[pro] falha ao reconciliar %s", payment_id)
            continue

        if await _registrar(session, payment_id, recurso) == "creditada":
            creditadas += 1

    return {
        "conferidos": len(pendentes),
        "creditados": creditadas,
        **await expirar_vencidos(session),
    }
