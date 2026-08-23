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

#: Os dois períodos vendidos, e a frequência de cada um em meses.
#:
#: O preço **não** está aqui, e desde 2026-08-22 por um motivo diferente do
#: antigo: ele morava no plano do Mercado Pago, e agora mora em `PRECOS`, no
#: `core/limites.py`. Quanto custa é regra de negócio; de quantos em quantos
#: meses se cobra é vocabulário do provedor, e é só isso que este mapa é. Ele
#: serve nas duas direções — monta o `auto_recurring` na criação e lê a
#: frequência de volta em `_periodo_do_recurso`.
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
    `services/assinaturas.py`.

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
    metodo: str, caminho: str, corpo: dict[str, Any] | None = None
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
    """
    tempo = aiohttp.ClientTimeout(total=TIMEOUT)
    cabecalhos = {"Authorization": f"Bearer {settings.MERCADO_PAGO_ACCESS_TOKEN}"}

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


async def criar_assinatura(
    *, periodo: str, valor: Decimal, email: str, referencia: str, back_url: str
) -> dict[str, Any]:
    """Cria o `preapproval` e devolve o recurso, com `id` e `init_point`.

    `external_reference` leva o id do usuário no TrocaTCG. É o que amarra os dois
    lados: sem ele, uma notificação chegaria dizendo que *alguma* assinatura
    mudou, e descobrir de quem exigiria confiar no e-mail — que a pessoa troca.

    O status nasce `pending`: ninguém está assinado até autorizar o pagamento na
    tela do Mercado Pago.

    **Assinatura sem plano associado, e a escolha não é de estilo — 2026-08-22.**
    Esta função mandava `preapproval_plan_id` e o Mercado Pago recusava com
    ``{"message": "card_token_id is required", "status": 400}``. Não é
    contornável: assinatura ligada a plano só nasce pela API com o cartão já
    tokenizado, o que significa coletar cartão no nosso frontend — exatamente o
    que o cabeçalho deste módulo diz que o projeto não faz.

    Sem plano, manda-se o `auto_recurring` inteiro e `status: "pending"`, e o
    Mercado Pago devolve o `init_point` para a pessoa autorizar na tela dele.
    Provado ponta a ponta com credencial de teste: a assinatura voltou
    `authorized`, com `external_reference`, `next_payment_date` e `auto_recurring`
    corretos.

    **E é o fluxo que preserva o `external_reference`.** Pelo caminho do plano ele
    se perde — nem no corpo, nem como query no checkout ele sobrevive; a
    assinatura autorizada volta com `external_reference: None` e `payer_email`
    vazio, restando só o `payer_id`, que é identidade do Mercado Pago e não nossa.
    Seria uma promoção a PRO sem saber de quem.

    Some junto o `back_url` preso ao plano, que estava no domínio antigo desde a
    troca de 21/08 e devolveria quem pagou para a origem errada. Agora ele viaja
    por assinatura, e é o `MERCADO_PAGO_BACK_URL` que manda.

    **Armadilha para quem for testar isto na mão.** O Mercado Pago filtra conteúdo
    do corpo e recusa com ``{"code": "invalid_field_content"}`` — mensagem genérica
    que não diz qual campo. Um `external_reference` de enfeite como
    ``11111111-2222-3333-4444-555555555555`` cai nesse filtro, e o erro parece ser
    do corpo inteiro. UUID de verdade passa, que é o que o app manda
    (`str(user_id)`). Se este 400 aparecer num teste manual, desconfie do valor
    inventado antes de desconfiar do desenho.
    """
    return await _chamar(
        "POST",
        "/preapproval",
        {
            "reason": f"TrocaTCG PRO {periodo}",
            "auto_recurring": {
                "frequency": PERIODOS[periodo],
                "frequency_type": "months",
                # O valor é `Decimal` até aqui de propósito — ver `PRECOS` em
                # `core/limites.py`. A conversão para `float` acontece só neste
                # ponto, porque é o que o JSON aceita, e é segura para os valores
                # que vendemos: `json.dumps` escreve a repr mais curta que
                # round-trips, então 19.90 sai "19.9" e não "19.8999...".
                "transaction_amount": float(valor),
                "currency_id": "BRL",
            },
            "payer_email": email,
            "external_reference": referencia,
            "back_url": back_url,
            # O que faz o Mercado Pago devolver `init_point` em vez de exigir
            # cartão: a assinatura nasce à espera de autorização.
            "status": "pending",
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
