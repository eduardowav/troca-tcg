"""Sentry — o painel de erro do backend (item 15 da ordem de execução).

Até aqui, erro em produção só existia se alguém estivesse olhando o log do
Render na hora. Log de plano free não fica: rola e some. O que este módulo compra
é a diferença entre "o Eduardo descobre porque alguém reclamou no WhatsApp" e "a
exceção chega com stack, rota, versão e quantas vezes aconteceu".

**Vazio é o estado normal.** Sem `SENTRY_DSN`, `iniciar()` não inicializa nada e
o app sobe idêntico ao de antes — mesmo padrão do push sem chave VAPID, do
WhatsApp sem chip e do Mercado Pago sem token. Ninguém precisa de conta no Sentry
para rodar o projeto na própria máquina.

**O que não vai para lá**, e as três decisões estão em `_antes_de_enviar`:

1. `RegraNegocio` não é erro. É o app dizendo "não pode" — anúncio repetido,
   limite do plano, proposta fora do prazo. São centenas por dia num app
   saudável, e num painel de 5 mil eventos por mês (o free) elas afogam o
   defeito de verdade em uma semana.
2. Resposta 4xx também não. `404` e `401` são o servidor funcionando.
3. Nem cabeçalho de autorização, nem segredo de job, nem assinatura de webhook.
   O `send_default_pii=False` já corta cookie e IP; o resto entra na denylist do
   scrubber por nome.
"""

import sentry_sdk
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber
from sentry_sdk.transport import Transport

from app.core.config import settings
from app.core.errors import RegraNegocio

# Os nomes que o scrubber do Sentry não conhece, porque são deste projeto. O
# `Authorization` já está no default; estes três não estariam.
_SEGREDOS = [*DEFAULT_DENYLIST, "x-job-secret", "x-signature", "x-request-id"]


def _antes_de_enviar(evento: dict, dica: dict) -> dict | None:
    """Último filtro antes de o evento sair da máquina.

    Devolver `None` descarta. É aqui, e não numa configuração do painel, porque
    o que não deve ser enviado é melhor não sair — regra no painel depende de
    alguém não mexer nela, e o evento já viajou.
    """
    excecao = (dica or {}).get("exc_info", (None, None, None))[1]

    # Regra de negócio é conversa com quem usa, não defeito — **enquanto o
    # status for de cliente**. A ressalva entrou em 2026-08-23, junto com o
    # `PAGAMENTO_INDISPONIVEL`: `RegraNegocio` passou a carregar também falha de
    # infraestrutura traduzida para quem está na tela (502, provedor de pagamento
    # fora do ar ou recusando), e essa é defeito por definição.
    #
    # Sem esta linha o conserto daquele dia teria trocado um erro barulhento e
    # ilegível por um erro legível e invisível: o 400 do Mercado Pago chegava ao
    # painel por ser exceção crua, e viraria silêncio ao virar regra de negócio.
    if isinstance(excecao, RegraNegocio) and excecao.status_code < 500:
        return None

    # `status_code` cobre o `HTTPException` do FastAPI e qualquer exceção nossa
    # que carregue o código da resposta. Abaixo de 500 o servidor respondeu o que
    # tinha de responder.
    codigo = getattr(excecao, "status_code", None)
    if isinstance(codigo, int) and codigo < 500:
        return None

    return evento


def iniciar(*, transporte: Transport | None = None) -> None:
    """Liga o Sentry, se houver DSN. Chamada uma vez, no `main.py`.

    O `transporte` existe para os testes, e existe **aqui** em vez de eles
    montarem o próprio `sentry_sdk.init`: teste que repete a configuração prova
    a configuração do teste. Trocando só o fio de saída, o que a suíte exercita
    é este arquivo — o filtro de regra de negócio e a denylist inclusive.
    """
    if not settings.SENTRY_DSN:
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        transport=transporte,
        environment=settings.ENVIRONMENT,
        # De qual deploy veio o erro. O Render publica o SHA do commit em
        # `RENDER_GIT_COMMIT`; sem ele o Sentry agrupa tudo numa versão só e a
        # pergunta "isso começou hoje?" fica sem resposta.
        release=settings.RELEASE or None,
        # Desligado por padrão, e é decisão de cota: o free tier são 5 mil
        # eventos por mês, e rastreamento de desempenho consome do mesmo balde
        # que os erros. Um app que ainda não abriu precisa dos erros.
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Sem IP, sem cookie, sem corpo de requisição. O painel serve para achar
        # o defeito; e-mail de quem usa não ajuda a achar defeito nenhum.
        send_default_pii=False,
        event_scrubber=EventScrubber(denylist=_SEGREDOS),
        # **Sem as variáveis locais de cada quadro do stack**, e isto não é
        # excesso de zelo: o `EventScrubber` limpa por *nome de chave*, e o que
        # vaza aqui não tem nome. O `scope` do ASGI é variável local de um
        # middleware, e dentro dele os cabeçalhos são uma lista de pares de
        # bytes — `(b'authorization', b'Bearer eyJ...')`. Nenhuma denylist pega
        # um valor dentro de uma lista.
        #
        # Medido, não suposto: com isto ligado, o `X-Job-Secret` de teste chegou
        # inteiro ao evento, pela terceira moldura do stack, com os cabeçalhos
        # já limpos em `request.headers`. O que se perde é o valor das variáveis
        # na hora do erro; o que se ganha é não publicar num painel web o token
        # de sessão de quem topou com o defeito. Ver
        # `tests/test_monitoramento.py::test_segredo_de_cabecalho_nao_viaja`.
        include_local_variables=False,
        before_send=_antes_de_enviar,
    )
