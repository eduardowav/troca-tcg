"""Mercado Pago — o provedor da assinatura do PRO.

Tudo que fala com a API deles mora aqui. O resto do app não sabe o que é um
`preapproval`, e é assim que trocar de provedor um dia continua sendo reescrever
um arquivo em vez de caçar chamadas espalhadas.

**Escrito e desligado**, como o WhatsApp e o push: sem `MERCADO_PAGO_ACCESS_TOKEN`
o `ativo()` é falso e nenhuma chamada sai. A regra continua exercitável pelos
testes, e o dia de ligar é uma linha de ambiente.

**O checkout não passa por aqui.** O app cria a assinatura, recebe um
`init_point` e redireciona — quem coleta cartão é o Mercado Pago. Nenhum dado de
cartão toca o TrocaTCG, o que tira do projeto a parte cara de guardar pagamento.
"""

import hashlib
import hmac
import logging
import time
from typing import Any

import aiohttp

from app.core.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.mercadopago.com"

#: Teto de qualquer chamada. A criação da assinatura acontece dentro da
#: requisição de quem está esperando na tela; o webhook busca o recurso antes de
#: responder. Nos dois casos, lentidão do provedor não pode virar timeout nosso.
TIMEOUT = 10.0

#: Os dois períodos vendidos, e a frequência de cada um em meses. O preço não
#: está aqui de propósito — ele mora no plano, do lado do Mercado Pago, e
#: repetido em dois lugares é como a tela e a cobrança passam a discordar.
PERIODOS = {"mensal": 1, "anual": 12}


def ativo() -> bool:
    """Há credencial para falar com o Mercado Pago?

    Falso hoje. Quem chama decide o que fazer: o roteador de assinatura recusa
    com 503, e o receptor de webhook nem chega a ser exercitado sem segredo.
    """
    return bool(settings.MERCADO_PAGO_ACCESS_TOKEN)


def plano_do_periodo(periodo: str) -> str:
    """O `preapproval_plan_id` configurado para `mensal` ou `anual`."""
    return {
        "mensal": settings.MERCADO_PAGO_PLANO_MENSAL,
        "anual": settings.MERCADO_PAGO_PLANO_ANUAL,
    }.get(periodo, "")


async def _chamar(
    metodo: str, caminho: str, corpo: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Uma chamada à API do Mercado Pago, com erro que sobe para quem pediu.

    Nada de engolir falha: quem cria assinatura está parado na tela, e quem
    processa webhook precisa saber que não conseguiu ler o recurso — responder
    200 sem ter lido faria o Mercado Pago parar de reenviar um aviso que nunca
    foi tratado.
    """
    tempo = aiohttp.ClientTimeout(total=TIMEOUT)
    cabecalhos = {"Authorization": f"Bearer {settings.MERCADO_PAGO_ACCESS_TOKEN}"}

    async with aiohttp.ClientSession(timeout=tempo) as sessao:
        async with sessao.request(
            metodo, f"{BASE_URL}{caminho}", json=corpo, headers=cabecalhos
        ) as resposta:
            texto = await resposta.text()
            if resposta.status >= 400:
                logger.error(
                    "[mercado_pago] %s %s devolveu %s: %s",
                    metodo,
                    caminho,
                    resposta.status,
                    texto[:300],
                )
                resposta.raise_for_status()
            return await resposta.json()


async def criar_assinatura(
    *, plano_id: str, email: str, referencia: str, back_url: str
) -> dict[str, Any]:
    """Cria o `preapproval` e devolve o recurso, com `id` e `init_point`.

    `external_reference` leva o id do usuário no TrocaTCG. É o que amarra os dois
    lados: sem ele, uma notificação chegaria dizendo que *alguma* assinatura
    mudou, e descobrir de quem exigiria confiar no e-mail — que a pessoa troca.

    O status nasce `pending`: ninguém está assinado até autorizar o pagamento na
    tela do Mercado Pago.
    """
    return await _chamar(
        "POST",
        "/preapproval",
        {
            "preapproval_plan_id": plano_id,
            "payer_email": email,
            "external_reference": referencia,
            "back_url": back_url,
        },
    )


async def buscar_assinatura(preapproval_id: str) -> dict[str, Any]:
    """O estado real da assinatura, direto da fonte.

    É esta chamada que torna o webhook confiável: o corpo da notificação traz
    só um id, e é aqui que se descobre o que aconteceu de verdade.
    """
    return await _chamar("GET", f"/preapproval/{preapproval_id}")


async def cancelar_assinatura(preapproval_id: str) -> dict[str, Any]:
    """Cancela do nosso lado o que a pessoa pediu para cancelar.

    Cancelamento não tira o PRO na hora — quem faz isso é a carência dos 7 dias,
    conforme o item 10 da seção 16. Aqui só se avisa o Mercado Pago para não
    cobrar de novo.
    """
    return await _chamar(
        "PUT", f"/preapproval/{preapproval_id}", {"status": "cancelled"}
    )


def _carimbo_fresco(carimbo: str) -> bool:
    """O `ts` da assinatura está dentro da janela de tolerância?

    O `ts` sempre entrou no manifesto — ou seja, sempre esteve *coberto* pelo
    HMAC — e nunca foi comparado com o relógio. A diferença importa: assinatura
    cobrindo o carimbo prova que ninguém o alterou, não que ele é de agora. Sem
    esta conferência, uma notificação capturada continua válida para sempre.

    Hoje o estrago de um reenvio já é contido pela idempotência de
    `webhook_events` — mesma assinatura, mesmo `notificacao_id`, resposta
    "repetida" —, mas essa é uma camada só, e ela é uma tabela que cresce sem
    fim. A janela é a camada que recusa antes de tocar no banco.

    **Carimbo ilegível reprova.** É a escolha certa para um receptor de
    pagamento: um `ts` que não é número não vem do Mercado Pago.

    O provedor manda segundos, mas dois campos de carimbo do mesmo painel vêm em
    milissegundos, e trocar a unidade recusaria toda notificação legítima de uma
    vez. Treze dígitos são milissegundos — a diferença é grande demais para
    caber em ambiguidade.
    """
    try:
        segundos = int(carimbo)
    except (TypeError, ValueError):
        return False

    if segundos > 10**11:
        segundos //= 1000

    tolerancia = settings.MERCADO_PAGO_TOLERANCIA_SEGUNDOS
    if tolerancia <= 0:
        return True

    # `abs` porque relógio adiantado também é suspeito, e porque o desvio entre
    # o relógio do provedor e o nosso corre para os dois lados.
    return abs(time.time() - segundos) <= tolerancia


def assinatura_confere(
    *, x_signature: str | None, x_request_id: str | None, data_id: str | None
) -> bool:
    """A notificação veio mesmo do Mercado Pago?

    O `x-signature` chega como `ts=<carimbo>,v1=<hmac>`, e o HMAC-SHA256 é sobre
    o manifesto `id:<data.id>;request-id:<x-request-id>;ts:<carimbo>;` com o
    segredo cadastrado no painel.

    **Sem segredo configurado, nada passa.** Um receptor que aceitasse tudo
    enquanto a variável está vazia seria uma rota pública que promove qualquer um
    a PRO — e o pior momento de descobrir isso é depois.

    A comparação é `compare_digest` e não `==`: comparação de string devolve mais
    cedo no primeiro byte diferente, e essa diferença de tempo é o suficiente
    para adivinhar o valor byte a byte.
    """
    segredo = settings.MERCADO_PAGO_WEBHOOK_SECRET
    if not segredo or not x_signature or not data_id:
        return False

    partes = dict(
        pedaco.strip().split("=", 1)
        for pedaco in x_signature.split(",")
        if "=" in pedaco
    )
    carimbo, recebido = partes.get("ts"), partes.get("v1")
    if not carimbo or not recebido:
        return False

    if not _carimbo_fresco(carimbo):
        return False

    # O id alfanumérico chega em maiúsculas em alguns tópicos e o manifesto é
    # montado com ele em minúsculas — o que a documentação pede e o que o
    # primeiro 401 inexplicável ensina.
    manifesto = f"id:{data_id.lower()};request-id:{x_request_id or ''};ts:{carimbo};"
    calculado = hmac.new(
        segredo.encode(), manifesto.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(calculado, recebido)
