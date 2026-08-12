"""WhatsApp — o canal que entrega o código de verificação.

**Escrito e desligado.** Sem `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` no ambiente
nada sai daqui, e isso não é erro: é o estado de hoje e o de qualquer implantação
que ainda não tenha chip nem conta na Meta. O mesmo padrão de `services/push.py`,
que passa por `ativo()` antes de qualquer coisa.

**Cloud API da Meta, não biblioteca não oficial.** As bibliotecas que dirigem um
WhatsApp comum por trás (Baileys, whatsapp-web.js) sobem numa tarde e são
violação dos termos; mandar mensagem automática para quem nunca falou com você é
exatamente o padrão que eles detectam, e o número é banido. A falha é silenciosa
— o código para de chegar e o cadastro morre sem erro em lugar nenhum. Por isso
a via oficial, que cobra centavos por mensagem e não some no meio da noite.

**O número que manda sai do WhatsApp comum.** Registrar um número na plataforma
o desliga do aplicativo normal, então ele é um chip só para isto. É por isso que
o remetente nunca vai ser o telefone pessoal de ninguém.

**Mensagem de autenticação é template aprovado.** A Meta não deixa mandar texto
livre para quem não falou com você antes; o que sai é um modelo cadastrado, com
o código como único parâmetro. O nome dele mora em `WHATSAPP_TEMPLATE`.
"""

import logging
from typing import Literal

import aiohttp

from app.core.config import settings

logger = logging.getLogger(__name__)

#: Versão da Graph API no caminho da chamada. Fixa de propósito: a Meta mantém
#: cada versão por cerca de dois anos e muda formato entre elas — descobrir isso
#: por um 400 em produção é pior do que subir o número de propósito um dia.
VERSAO_API = "v21.0"

#: Teto da chamada inteira. O pedido do código acontece dentro da requisição da
#: pessoa, e a nuvem da Meta lenta não pode segurar a resposta da API além disto.
TIMEOUT = 8.0

Resultado = Literal["enviado", "registrado_no_log"]


def ativo() -> bool:
    """Há credencial para falar com a Cloud API?

    Falso hoje, e é o estado esperado. Quem chama decide o que fazer com isso —
    o roteador recusa o pedido com 503, e o serviço de verificação continua
    gerando e guardando o código, para que o fluxo inteiro seja testável sem
    conta na Meta.
    """
    return bool(settings.WHATSAPP_TOKEN and settings.WHATSAPP_PHONE_ID)


async def enviar_codigo(telefone: str, codigo: str) -> Resultado:
    """Manda o código para um número já normalizado (dígitos, com DDD, sem 55).

    Desligado, escreve no log e devolve `registrado_no_log`: em desenvolvimento
    é assim que se lê o código sem celular nenhum na mão. Ligado, dispara o
    template de autenticação e devolve `enviado`.

    Erros de rede sobem para quem chamou. Aqui não há o "falhar em silêncio" do
    push: lá o aviso é enfeite sobre um fato já gravado; aqui a mensagem **é** o
    serviço — quem pediu o código está parado na tela esperando por ele, e um
    sucesso mentiroso a deixaria esperando para sempre.
    """
    if not ativo():
        logger.info(
            "[whatsapp] desligado — código de %s seria %s", _mascarar(telefone), codigo
        )
        return "registrado_no_log"

    url = f"https://graph.facebook.com/{VERSAO_API}/{settings.WHATSAPP_PHONE_ID}/messages"
    corpo = {
        "messaging_product": "whatsapp",
        # O 55 entra só aqui. No banco o número é guardado como a pessoa o usa no
        # Brasil (DDD + assinante), e o país é assunto do transporte.
        "to": f"55{telefone}",
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_TEMPLATE,
            "language": {"code": settings.WHATSAPP_TEMPLATE_IDIOMA},
            # Template de autenticação tem duas partes obrigatórias e ambas
            # levam o mesmo código: o corpo, que a pessoa lê, e o botão, que
            # copia para a área de transferência. Mandar só o corpo faz a Meta
            # recusar a mensagem inteira.
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": codigo}],
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": codigo}],
                },
            ],
        },
    }

    tempo = aiohttp.ClientTimeout(total=TIMEOUT)
    async with aiohttp.ClientSession(timeout=tempo) as sessao:
        async with sessao.post(
            url,
            json=corpo,
            headers={"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"},
        ) as resposta:
            if resposta.status >= 400:
                detalhe = await resposta.text()
                logger.error(
                    "[whatsapp] %s ao enviar para %s: %s",
                    resposta.status,
                    _mascarar(telefone),
                    detalhe[:300],
                )
                resposta.raise_for_status()
    return "enviado"


def _mascarar(telefone: str) -> str:
    """`91987654321` vira `91*****4321`.

    O log é lido em máquina que não é a da pessoa, e um arquivo de log com a
    lista de telefones de quem se cadastrou é a mesma coisa que o dump público
    que o backup deixou de ser.
    """
    return telefone[:2] + "*" * max(len(telefone) - 6, 0) + telefone[-4:]
