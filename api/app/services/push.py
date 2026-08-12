"""Web Push — a notificação que alcança o celular com o app fechado.

O canal in-app (`services/notificacoes.py`) só acende enquanto a pessoa está com
o app aberto. Este arquivo é o que faz o aviso chegar quando ela não está: o
navegador guarda uma inscrição num serviço de push do sistema (APNs no iPhone,
FCM no Android), a API manda a mensagem cifrada para lá, e o service worker
acorda para desenhá-la. Não há servidor nosso no meio e não há custo.

**Nem toda notificação vira push.** A matriz da seção 12 da doc decide: o que
espera resposta de alguém vibra o celular; o que é registro do que aconteceu
fica na caixa. Um app que vibra treze vezes por dia é desinstalado.

**O push é depois do commit, e fora da transação.** Uma proposta gravada com o
push falhando continua sendo uma proposta gravada; o contrário — a rede do FCM
derrubar a negociação — seria trocar o certo pelo enfeite. Por isso `agendar`
só põe numa fila presa à sessão, e quem esvazia é o `get_session`, depois que a
requisição terminou.

**Inscrição morta é apagada.** O 404 e o 410 do serviço de push querem dizer
"esse navegador não existe mais" — desinstalou o app, limpou os dados, trocou de
aparelho. Guardar isso para sempre faria toda notificação futura gastar uma
chamada de rede para tomar o mesmo erro.
"""

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

import aiohttp
from pywebpush import WebPushException, webpush_async
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

#: Chave da fila dentro de `session.info`.
_FILA = "push_pendentes"
#: Marca que o `after_rollback` desta sessão já foi ligado.
_LIGADO = "push_ligado"

#: Quanto tempo o serviço de push guarda a mensagem se o aparelho estiver
#: desligado. Um dia: depois disso o aviso perdeu a validade — quem abrir o app
#: vai ver a caixa de notificações, que é o registro permanente.
TTL = 24 * 60 * 60

#: Teto do envio inteiro. O push acontece no fim da requisição, e uma nuvem de
#: push lenta não pode segurar a resposta da API mais que isto.
TIMEOUT = 5.0


def ativo() -> bool:
    """Sem par VAPID configurado não há push — e não há erro, tampouco.

    É o estado do ambiente de desenvolvimento e o de qualquer implantação que
    ainda não gerou as chaves. O canal in-app continua inteiro sem isto.
    """
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def agendar(
    session: AsyncSession,
    *,
    para: UUID | str,
    tipo: str,
    titulo: str,
    corpo: str,
    link: str | None,
) -> None:
    """Põe um push na fila desta sessão. Não envia nada agora."""
    if not ativo():
        return

    info = getattr(session, "info", None)
    if info is None:  # sessões de teste, que não são AsyncSession de verdade
        return

    if not info.get(_LIGADO):
        _limpar_no_rollback(session)
        info[_LIGADO] = True

    info.setdefault(_FILA, []).append(
        {
            "user_id": str(para),
            "tipo": tipo,
            "titulo": titulo,
            "corpo": corpo,
            "link": link,
        }
    )


def _limpar_no_rollback(session: AsyncSession) -> None:
    """Transação desfeita, fila esvaziada.

    Sem isto, uma proposta que bateu no índice de "uma por dupla" — que faz
    rollback e devolve 409 — mandaria para o celular da outra pessoa o aviso de
    uma proposta que não existe.
    """
    sincrona = getattr(session, "sync_session", None)
    if sincrona is None:
        return

    @event.listens_for(sincrona, "after_rollback")
    def _(sessao_sincrona: Any) -> None:
        sessao_sincrona.info.pop(_FILA, None)


async def enviar_pendentes(session: AsyncSession) -> int:
    """Esvazia a fila da sessão. Devolve quantos aparelhos receberam.

    Chamada no fim da requisição, pelo `get_session`. Nunca levanta: aqui já não
    há nada a salvar — a notificação está gravada e a resposta, pronta.
    """
    info = getattr(session, "info", None)
    fila = info.pop(_FILA, None) if info is not None else None
    if not fila:
        return 0

    try:
        return await asyncio.wait_for(_enviar(session, fila), timeout=TIMEOUT)
    except TimeoutError:
        logger.warning(
            "push demorou demais e foi abandonado", extra={"itens": len(fila)}
        )
        return 0
    except Exception:  # noqa: BLE001 — ver o docstring: nada aqui pode subir
        logger.exception("falha ao enviar push")
        return 0


async def _enviar(session: AsyncSession, fila: list[dict]) -> int:
    """Uma consulta por pessoa, um POST por aparelho, todos em paralelo."""
    por_pessoa: dict[str, list[dict]] = {}
    for item in fila:
        por_pessoa.setdefault(item["user_id"], []).append(item)

    inscricoes = await _inscricoes(session, list(por_pessoa))
    if not inscricoes:
        return 0

    mortas: list[str] = []
    enviados = 0

    async with aiohttp.ClientSession() as http:
        tarefas = [
            _um(http, inscricao, item, mortas)
            for inscricao in inscricoes
            for item in por_pessoa.get(inscricao["user_id"], [])
        ]
        for resultado in await asyncio.gather(*tarefas, return_exceptions=True):
            if resultado is True:
                enviados += 1
            elif isinstance(resultado, BaseException):
                # O que não é recusa do serviço de push — DNS, TLS, tempo
                # esgotado. Sem esta linha, `return_exceptions=True` transforma
                # a falha em "zero aparelhos" sem registro nenhum, que foi
                # exatamente o que escondeu um erro de certificado no primeiro
                # teste real.
                logger.warning(
                    "push falhou: %s: %s", type(resultado).__name__, resultado
                )

    if mortas:
        await _apagar(session, mortas)

    return enviados


async def _um(
    http: aiohttp.ClientSession,
    inscricao: dict,
    item: dict,
    mortas: list[str],
) -> bool:
    """Um push para um aparelho.

    O texto vai pronto, como JSON: o service worker não traduz nada, ele desenha
    o que veio. É a mesma decisão do texto morar no backend — o sistema
    operacional não tem acesso a tradução do lado de lá.

    **O `corpo` não vai.** Na tela de bloqueio o aviso é uma linha, e uma linha
    é o que ele deve ser: "@fulano propôs uma troca" já diz o que aconteceu e o
    que fazer. A segunda frase — o prazo, o pedido de confirmação — continua na
    caixa do app, que é onde há espaço e onde a pessoa está lendo de fato.
    Decisão do Eduardo, vendo chegar no celular.
    """
    try:
        await webpush_async(
            subscription_info={
                "endpoint": inscricao["endpoint"],
                "keys": {"p256dh": inscricao["p256dh"], "auth": inscricao["auth"]},
            },
            data=json.dumps(
                {
                    "tipo": item["tipo"],
                    "titulo": item["titulo"],
                    "link": item["link"],
                }
            ),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=TTL,
            aiohttp_session=http,
        )
        return True
    except WebPushException as erro:
        status = getattr(erro.response, "status", None)
        if status in (404, 410):
            mortas.append(inscricao["endpoint"])
        else:
            logger.warning("push recusado (%s)", status)
        return False


_INSCRICOES = text("""
    select user_id::text as user_id, endpoint, p256dh, auth
    from push_subscriptions
    where user_id = any(cast(:ids as uuid[]))
""")


async def _inscricoes(session: AsyncSession, ids: list[str]) -> list[dict]:
    linhas = await session.execute(_INSCRICOES, {"ids": ids})
    return [dict(linha) for linha in linhas.mappings().all()]


async def _apagar(session: AsyncSession, endpoints: list[str]) -> None:
    """Some com as inscrições que o serviço de push declarou mortas."""
    await session.execute(
        text("delete from push_subscriptions where endpoint = any(:endpoints)"),
        {"endpoints": endpoints},
    )
    await session.commit()


# ---------------------------------------------------------------------------
# Inscrição — o que a tela de configurações grava e apaga
# ---------------------------------------------------------------------------


async def registrar(
    session: AsyncSession,
    user_id: UUID,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
) -> None:
    """Guarda (ou reaponta) a inscrição deste navegador.

    O conflito é no `endpoint`, que é único por navegador: quando duas pessoas
    usam o mesmo aparelho, a inscrição passa a ser de quem entrou por último em
    vez de virar linha órfã mandando aviso alheio.
    """
    await session.execute(
        text("""
            insert into push_subscriptions (user_id, endpoint, p256dh, auth)
            values (cast(:u as uuid), :endpoint, :p256dh, :auth)
            on conflict (endpoint) do update
               set user_id = excluded.user_id,
                   p256dh  = excluded.p256dh,
                   auth    = excluded.auth,
                   criado_em = now()
        """),
        {"u": str(user_id), "endpoint": endpoint, "p256dh": p256dh, "auth": auth},
    )
    await session.commit()


async def remover(session: AsyncSession, user_id: UUID, endpoint: str) -> None:
    """Desliga os avisos deste navegador. O `user_id` no `where` é a mesma regra
    de sempre: ninguém apaga a inscrição de outra pessoa chutando um endpoint."""
    await session.execute(
        text("""
            delete from push_subscriptions
            where user_id = cast(:u as uuid) and endpoint = :endpoint
        """),
        {"u": str(user_id), "endpoint": endpoint},
    )
    await session.commit()
