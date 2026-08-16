"""O freio da API — quem conta, quanto, e por que não usa o slowapi.

Item 1 do bloco de segurança da seção 17. O `Limiter` do slowapi existia desde o
começo, guardado em `app.state`, com o handler do 429 registrado e
`default_limits` de 100/minuto — e **não limitava nada**, porque o
`SlowAPIMiddleware` nunca havia sido adicionado.

**Adicionar o middleware não resolveu**, e é isso que explica este módulo existir.
O `SlowAPIMiddleware` resolve qual rota está sendo chamada varrendo `app.routes`
à procura de um objeto com `.endpoint`; quando não acha, ele **libera a
requisição** (`_should_exempt` devolve True para handler nulo). A partir do
FastAPI 0.140, `include_router` não achata mais as rotas na aplicação: cada
inclusão vira um `_IncludedRouter` que guarda os caminhos sem o prefixo e resolve
o casamento por conta própria. Resultado: nenhuma rota é encontrada, todas são
tratadas como isentas, e o freio segue sem frear — o mesmo defeito, numa forma
nova e ainda mais difícil de ver.

Medido em 2026-08-16, com o middleware instalado: 310 chamadas a `/v1/planos` em
0,4 segundo, 310 respostas 200.

Então o freio passou a ser escrito aqui, sobre a `limits` — que é a biblioteca
que o próprio slowapi usa por baixo. São quarenta linhas que não dependem de
como o FastAPI monta a tabela de rotas, e essa independência é o ponto: a forma
mudou uma vez e pode mudar de novo.

**A chave é a pessoa, não o endereço.** Contar por IP seria errado exatamente no
dia que mais importa: o lançamento é um evento numa loja (ver "O risco número
um", seção 21), com dezenas de pessoas no mesmo Wi-Fi e, portanto, no mesmo IP
público. Um balde por IP transformaria quarenta pessoas cadastrando cartas num
único cliente estourando o limite, e o app cairia na frente de todas elas, no
primeiro dia, por causa de uma proteção contra abuso. O mesmo vale para as
operadoras com CGNAT, onde metade de um bairro sai pelo mesmo endereço.

**O `sub` é lido sem validar a assinatura, e isso é seguro aqui.** Forjar um
token dá acesso a nada — quem valida é `usuario_atual`, com o JWKS, e uma
requisição com token inventado morre em 401. O que um atacante ganharia é escapar
do próprio balde, e para isso ele já pode trocar de IP. As rotas públicas seguem
contadas por endereço, porque ninguém manda `Authorization` nelas.
"""

import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

#: Requisições por minuto, por pessoa (ou por IP, para quem não tem sessão).
#:
#: O número anterior era 100 e nunca chegou a valer. Mantê-lo agora que o freio
#: existe seria estreá-lo já apertado: o feed, o acervo e a vitrine disparam
#: várias requisições por abertura de tela, e 100 é o tipo de teto que só aparece
#: na mão de quem está usando o app de verdade. O alvo é raspagem — varrer a
#: vitrine ou `/u/{username}` para montar uma base de contatos —, não uso
#: intenso.
LIMITE_PADRAO = "300/minute"

#: Caminhos que não entram na conta.
#:
#: Só um, e não é conveniência: `/v1/health` é o que o Render consulta para
#: decidir se o serviço está vivo, e um 429 ali não seria um pedido recusado —
#: seria o deploy marcado como não-saudável e derrubado. Somam-se nela o
#: healthcheck do Render, o keep-alive do Actions e qualquer monitoramento, todos
#: vindo de endereços que não são de gente. O custo de isentar é zero: ela não
#: devolve dado nenhum.
#:
#: As rotas internas (`/v1/internal/jobs/*`) **não** são isentas e não precisam:
#: o cron as chama poucas vezes por dia. O receptor do Mercado Pago também segue
#: limitado — uma rajada dele que estourasse o teto receberia 429 e seria
#: reenviada, que é o comportamento que a idempotência de `webhook_events` já
#: cobre.
ISENTOS = frozenset({"/v1/health"})

_limite = parse(LIMITE_PADRAO)
_estrategia = MovingWindowRateLimiter(MemoryStorage())


def chave(request: Request) -> str:
    """Quem está sendo contado: a pessoa da sessão, ou o endereço de quem não tem.

    O prefixo evita que um `sub` e um IP caiam no mesmo balde — improvável, mas
    prevenir custa um caractere.
    """
    cabecalho = request.headers.get("authorization") or ""
    if cabecalho.lower().startswith("bearer "):
        try:
            sub = jwt.get_unverified_claims(cabecalho[7:].strip()).get("sub")
            if sub:
                return f"u:{sub}"
        except (JWTError, ValueError, AttributeError):
            # Token ilegível cai no IP. Recusar token não é trabalho deste
            # módulo — é de `usuario_atual`, e ele faz melhor.
            pass

    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado:
        # Atrás do proxy do Render, o endereço real é o primeiro da lista; sem
        # isto, todo mundo seria contado como o balanceador — um balde só para o
        # app inteiro, que é pior que não ter freio.
        return f"ip:{encaminhado.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'desconhecido'}"


class Limitador(BaseHTTPMiddleware):
    """Conta e corta, sem perguntar ao roteador qual rota é.

    A independência é deliberada: a versão anterior desta proteção dependia de
    resolver o handler da rota, e foi exatamente aí que ela quebrou sem avisar.
    Um caminho é um caminho — o `path` do pedido basta para saber se é isento.
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ISENTOS:
            return await call_next(request)

        k = chave(request)
        if not _estrategia.hit(_limite, k):
            janela = _estrategia.get_window_stats(_limite, k)
            espera = max(1, int(janela.reset_time - time.time()))
            # Log em nível de aviso, não de erro: bater no teto é o freio
            # funcionando, e a chave dá para distinguir raspagem de gente
            # apressada quando alguém for olhar.
            logger.warning("[limite] %s barrado em %s", k, request.url.path)
            return JSONResponse(
                status_code=429,
                content={
                    "codigo": "MUITAS_REQUISICOES",
                    "detalhe": (
                        "Você fez pedidos demais em pouco tempo. "
                        f"Tente de novo em {espera} segundos."
                    ),
                },
                headers={"Retry-After": str(espera)},
            )
        return await call_next(request)
