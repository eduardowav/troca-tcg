"""Mercado Pago — o provedor do pagamento do PRO.

Tudo que fala com a API deles mora aqui. O resto do app não sabe o que é um
`point_of_interaction`, e é assim que trocar de provedor um dia continua sendo
reescrever um arquivo em vez de caçar chamadas espalhadas.

**Escrito e desligado**, como o WhatsApp e o push: sem `MERCADO_PAGO_ACCESS_TOKEN`
o `ativo()` é falso e nenhuma chamada sai. A regra continua exercitável pelos
testes, e o dia de ligar é uma linha de ambiente.

**É Pix avulso, e não assinatura — 2026-08-23.** O módulo falava `/preapproval`
até essa data. Recorrência no Mercado Pago é cartão de crédito e mais nada, e o
público do app paga por Pix; a troca inteira está contada em `db/schema/38`. O
que sobrou é mais simples: uma cobrança nasce, alguém paga, o webhook credita
tempo de PRO.

**Nenhum dado de pagamento toca o TrocaTCG.** O que volta daqui é um "copia e
cola" do Pix, que é público por desenho — ele diz para quem vai o dinheiro e
quanto. Não há cartão, não há token, não há o que vazar.
"""

import hashlib
import hmac
import logging
import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import aiohttp

from app.core.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.mercadopago.com"

#: Teto de qualquer chamada. A criação da assinatura acontece dentro da
#: requisição de quem está esperando na tela; o webhook busca o recurso antes de
#: responder. Nos dois casos, lentidão do provedor não pode virar timeout nosso.
TIMEOUT = 10.0

#: Os dois períodos vendidos, e quantos meses de PRO cada um credita.
#:
#: Deixou de ser vocabulário do provedor em 2026-08-23. Enquanto o PRO foi
#: assinatura, este mapa montava o `auto_recurring` e o Mercado Pago é que
#: contava os ciclos. Com Pix avulso não há ciclo: a compra credita tempo, e
#: quem soma a data é `services/pro.py`. Fica aqui porque é aqui que o período
#: vira a descrição que aparece no extrato de quem paga.
#:
#: O preço não está aqui — mora em `PRECOS`, no `core/limites.py`. Quanto custa
#: é regra de negócio.
PERIODOS = {"mensal": 1, "anual": 12}


class RecursoInexistente(Exception):
    """O Mercado Pago respondeu 404: o recurso não existe e nunca vai existir.

    Separada das demais falhas de propósito, e o motivo é o comportamento de
    reenvio deles. O `_chamar` deixa qualquer erro subir para que o receptor de
    webhook devolva 500 e a notificação seja reenviada — o que é certo quando o
    provedor está fora do ar ou a rede falhou, porque a próxima tentativa
    resolve.

    404 não é dessa família. O recurso não existe, e responder 500 faz o Mercado
    Pago reenviar a mesma notificação para sempre, contra um id que nunca vai
    resolver. Quem chama trata isto como fim de linha, não como tentar de novo.

    Apareceu em 2026-08-22 com o botão "Simular" do painel deles, que manda
    `data.id=123456`. O caminho todo funcionou — a assinatura HMAC **deles**
    passou pelo nosso `assinatura_confere`, que era o que faltava provar — e
    parou aqui, no id de mentira.
    """


class FalhaDoProvedor(Exception):
    """O Mercado Pago recusou a chamada, ou não deu para chegar até ele.

    Existe para que quem chama possa distinguir "o provedor falhou" de qualquer
    outro erro **sem importar `aiohttp`**. O cabeçalho deste módulo promete que
    o resto do app não sabe o que é um `preapproval`; deixar um
    `ClientResponseError` subir quebrava a promessa por baixo, e o preço apareceu
    em 2026-08-23.

    Naquele dia um 400 do Mercado Pago virou, na tela de quem tentou assinar,
    "Não foi possível falar com o servidor. Confira sua conexão." O caminho: a
    exceção crua subia até o `ServerErrorMiddleware` do Starlette, que é mais
    externo que o `CORSMiddleware` (`main.py`), então o 500 saía **sem**
    `access-control-allow-origin`; o navegador bloqueava a resposta, o `fetch`
    rejeitava, e `web/src/lib/api.ts` traduzia isso em `REDE_INDISPONIVEL`. Uma
    recusa do provedor e a rede da pessoa caindo tinham exatamente a mesma cara.

    **Continua subindo para quem processa webhook**, que é o que o `_chamar`
    sempre prometeu: virar 500 ali é o que faz o Mercado Pago reenviar a
    notificação. Quem trata é só o caminho de quem está parado na tela — ver
    `services/pro.py`.

    `status` é o código HTTP deles quando houve resposta, e `None` quando nem
    isso (timeout, DNS, conexão recusada).
    """

    def __init__(self, status: int | None, corpo: str = "") -> None:
        self.status = status
        self.corpo = corpo
        super().__init__(f"Mercado Pago: {status or 'sem resposta'} {corpo}".strip())


def ativo() -> bool:
    """Há credencial para falar com o Mercado Pago?

    Falso hoje. Quem chama decide o que fazer: o roteador de assinatura recusa
    com 503, e o receptor de webhook nem chega a ser exercitado sem segredo.
    """
    return bool(settings.MERCADO_PAGO_ACCESS_TOKEN)


async def _chamar(
    metodo: str,
    caminho: str,
    corpo: dict[str, Any] | None = None,
    *,
    chave: str | None = None,
) -> dict[str, Any]:
    """Uma chamada à API do Mercado Pago, com erro que sobe para quem pediu.

    Nada de engolir falha: quem cria assinatura está parado na tela, e quem
    processa webhook precisa saber que não conseguiu ler o recurso — responder
    200 sem ter lido faria o Mercado Pago parar de reenviar um aviso que nunca
    foi tratado.

    **404 é a exceção, e vira `RecursoInexistente`.** Reenviar resolve falha
    passageira; contra um recurso que não existe, reenviar é para sempre. Ver o
    docstring da exceção.

    Todo o resto vira `FalhaDoProvedor` — inclusive o que nem chegou a ser
    resposta, como timeout e conexão recusada. Sobe igual ao que subia antes; o
    que muda é ser um tipo deste módulo, que quem chama consegue capturar sem
    importar `aiohttp`. Ver o docstring da exceção para o estrago que a falta
    disso causou na tela.

    **`chave` é o `X-Idempotency-Key`, e a criação de pagamento exige um.** Sem
    ele, um POST que sai daqui e cuja resposta se perde no caminho de volta vira
    uma segunda cobrança na próxima tentativa — duas cobranças vivas para a
    mesma compra, que é como alguém paga duas vezes. Com ele, o Mercado Pago
    devolve o pagamento que já criou.
    """
    tempo = aiohttp.ClientTimeout(total=TIMEOUT)
    cabecalhos = {"Authorization": f"Bearer {settings.MERCADO_PAGO_ACCESS_TOKEN}"}
    if chave:
        cabecalhos["X-Idempotency-Key"] = chave

    try:
        async with aiohttp.ClientSession(timeout=tempo) as sessao:
            async with sessao.request(
                metodo, f"{BASE_URL}{caminho}", json=corpo, headers=cabecalhos
            ) as resposta:
                texto = await resposta.text()
                if resposta.status == 404:
                    logger.warning(
                        "[mercado_pago] %s %s: recurso inexistente", metodo, caminho
                    )
                    raise RecursoInexistente(caminho)
                if resposta.status >= 400:
                    logger.error(
                        "[mercado_pago] %s %s devolveu %s: %s",
                        metodo,
                        caminho,
                        resposta.status,
                        texto[:300],
                    )
                    raise FalhaDoProvedor(resposta.status, texto[:300])
                return await resposta.json()
    except (aiohttp.ClientError, TimeoutError) as exc:
        # Rede, DNS, conexão recusada, estouro do `TIMEOUT`. Não houve resposta,
        # então não há status — e é justamente o caso em que tentar de novo mais
        # tarde costuma resolver, que é o que a mensagem na tela vai dizer.
        logger.error("[mercado_pago] %s %s não completou: %r", metodo, caminho, exc)
        raise FalhaDoProvedor(None) from exc


async def criar_pagamento_pix(
    *,
    periodo: str,
    valor: Decimal,
    email: str,
    referencia: str,
    chave: str,
    minutos: int,
    cpf: str | None = None,
    nome: str | None = None,
) -> dict[str, Any]:
    """Cria a cobrança Pix e devolve o pagamento, com `id` e o QR dentro.

    **Substituiu o `POST /preapproval` em 2026-08-23**, e a troca não foi de
    estilo. Assinatura no Mercado Pago é cartão de crédito e mais nada: o
    endpoint de recorrência engole `payment_methods_allowed` em silêncio e
    devolve o recurso com `payment_method_id: null`. Provado no mesmo dia,
    pedindo só `bank_transfer`/`pix`. Quem troca carta em Belém paga por Pix, e
    exigir cartão era cobrar de quem já tem banco. Ver `db/schema/38`.

    O QR volta em `point_of_interaction.transaction_data`: `qr_code` é o "copia
    e cola" e `qr_code_base64` é a imagem. **Só o `qr_code` é guardado** — a
    imagem se desenha a partir dele no navegador, e gravar PNG em base64 no
    Postgres seria pagar armazenamento por algo derivável.

    `external_reference` leva o id do usuário no TrocaTCG, e é o que amarra os
    dois lados quando a nossa ponta do POST cai: se a resposta se perder, a
    notificação ainda chega dizendo de quem é o dinheiro. Sem ele, restaria o
    e-mail do pagador — que a pessoa troca.

    `chave` é o `X-Idempotency-Key`, e é o id da linha local que vai guardar
    esta cobrança. A mesma chave devolve o mesmo pagamento em vez de criar
    outro, que é o que separa "o POST demorou" de "a pessoa tem duas cobranças
    vivas".

    **`cpf` é opcional aqui de propósito.** O Mercado Pago aceita Pix só com o
    e-mail do pagador; a identificação entra quando a conta dele exige, e nesse
    caso a recusa é um 400 com `payer.identification` na causa. Mandar sempre
    obrigaria a tela a pedir CPF de todo mundo — dado pessoal a mais, coletado
    por precaução, que é exatamente o que a LGPD manda não fazer.
    """
    corpo: dict[str, Any] = {
        # O que aparece no extrato de quem paga. Curto e reconhecível: quem lê
        # "MERCADOPAGO*TROCATCG" três dias depois precisa saber o que comprou.
        "description": f"TrocaTCG PRO {periodo}",
        # O valor é `Decimal` até aqui de propósito — ver `PRECOS` em
        # `core/limites.py`. A conversão para `float` acontece só neste ponto,
        # porque é o que o JSON aceita, e é segura para os valores que vendemos:
        # `json.dumps` escreve a repr mais curta que round-trips, então 14.90 sai
        # "14.9" e não "14.8999...".
        "transaction_amount": float(valor),
        "payment_method_id": "pix",
        "external_reference": referencia,
        "date_of_expiration": _vencimento(minutos),
        "payer": {"email": email},
    }
    if nome:
        # O Mercado Pago parte o nome em dois campos. Quem tem um nome só entra
        # com o sobrenome vazio, e não é erro — é o que o campo aceita.
        primeiro, _, resto = nome.strip().partition(" ")
        corpo["payer"]["first_name"] = primeiro
        corpo["payer"]["last_name"] = resto
    if cpf:
        corpo["payer"]["identification"] = {"type": "CPF", "number": cpf}

    return await _chamar("POST", "/v1/payments", corpo, chave=chave)


def _vencimento(minutos: int) -> str:
    """Quando o QR morre, no formato que o Mercado Pago aceita.

    Eles querem ISO 8601 **com milissegundos e com fuso explícito** —
    `2026-08-23T20:30:00.000+00:00`. Sem os milissegundos a recusa é um 400 com
    mensagem genérica, que é a mesma de outros seis erros e não diz qual campo
    está errado.

    UTC e não horário de Brasília: o offset viaja no texto, então o Mercado Pago
    resolve sozinho, e o servidor não precisa saber em que fuso ele mesmo roda.
    """
    quando = datetime.now(UTC) + timedelta(minutes=minutos)
    return quando.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


async def buscar_pagamento(payment_id: str) -> dict[str, Any]:
    """O estado real do pagamento, direto da fonte.

    É esta chamada que torna o webhook confiável: o corpo da notificação traz só
    um id, e é aqui que se descobre se o dinheiro entrou.
    """
    return await _chamar("GET", f"/v1/payments/{payment_id}")


def qr_do_pagamento(recurso: dict[str, Any]) -> str | None:
    """O "copia e cola" de dentro da resposta, ou nada.

    Existe para que o serviço não precise conhecer o caminho
    `point_of_interaction.transaction_data.qr_code` — que é vocabulário do
    provedor, e é isto que o cabeçalho deste módulo promete não vazar.
    """
    interacao = recurso.get("point_of_interaction") or {}
    return (interacao.get("transaction_data") or {}).get("qr_code")


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
