"""O freio da API — e a prova de que ele freia.

Estes testes existem por causa de um defeito que enganou duas vezes.

Na primeira, o `Limiter` do slowapi estava configurado, guardado em `app.state`,
com o handler do 429 registrado — e não limitava nada, porque o
`SlowAPIMiddleware` nunca fora adicionado. Tudo parecia certo à leitura.

Na segunda, o middleware foi adicionado e **continuou não limitando**: ele
resolve a rota varrendo `app.routes` à procura de `.endpoint` e libera a
requisição quando não acha, e a partir do FastAPI 0.140 as rotas incluídas ficam
aninhadas num `_IncludedRouter` que ele não sabe abrir. Medido: 310 chamadas a
`/v1/planos` em 0,4 segundo, 310 respostas 200 — com o middleware instalado.

Daí a forma destes testes. **Nenhum deles lê configuração, e todos batem no app
de verdade**, não numa aplicação de mentira montada para o teste. Configuração é
exatamente o que pareceu certo nas duas vezes; só a rajada revelou o contrário.
"""

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from starlette.requests import Request

from app.core import limitador
from app.core.limitador import ISENTOS, LIMITE_PADRAO, chave
from app.main import app

#: O teto usado nos testes de rajada.
#:
#: O teto real é 300 por minuto, e dispará-lo a cada teste custava 107 segundos
#: de suíte para provar o que 5 provam igual: que o middleware conta, corta e
#: separa as pessoas. O número em si é conferido à parte, sem rede.
TETO_DE_TESTE = 5


@pytest.fixture(autouse=True)
def freio_curto():
    """Zera a contagem e aperta o teto, para cada teste.

    Zerar não é opcional: o armazenamento é do processo, então um teste que
    estoura o limite envenenaria os seguintes — e o resto da suíte junto.
    """
    original_limite = limitador._limite
    limitador._limite = parse(f"{TETO_DE_TESTE}/minute")
    limitador._estrategia = MovingWindowRateLimiter(MemoryStorage())
    yield
    limitador._limite = original_limite
    limitador._estrategia = MovingWindowRateLimiter(MemoryStorage())


def _token(sub: str) -> str:
    """Um JWT sem valor além do `sub`.

    Não precisa ser válido: o limitador lê o `sub` sem verificar assinatura, e é
    justamente essa propriedade que o teste da chave observa. Quem valida de
    verdade é `usuario_atual`, coberto em `test_auth.py`.
    """
    return jwt.encode({"sub": sub}, "nao-importa", algorithm="HS256")


def _pedido(cabecalhos: dict[str, str] | None = None, ip: str = "1.2.3.4") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/v1/planos",
            "headers": [
                (k.lower().encode(), v.encode()) for k, v in (cabecalhos or {}).items()
            ],
            "client": (ip, 1234),
        }
    )


# ------------------------------------------------------------------ a chave


def test_quem_tem_sessao_e_contado_pela_pessoa():
    """O ponto do módulo: no dia do lançamento dezenas de pessoas estarão no
    mesmo Wi-Fi da loja e, portanto, no mesmo IP. Contar por endereço faria o app
    cair na frente de todas elas por causa de uma proteção contra abuso."""
    assert (
        chave(_pedido({"authorization": f"Bearer {_token('pessoa-1')}"}))
        == "u:pessoa-1"
    )


def test_pessoas_diferentes_no_mesmo_ip_nao_dividem_balde():
    rede = {"ip": "200.9.9.9"}
    a = chave(_pedido({"authorization": f"Bearer {_token('a')}"}, **rede))
    b = chave(_pedido({"authorization": f"Bearer {_token('b')}"}, **rede))
    assert a != b


def test_sem_sessao_conta_por_endereco():
    assert chave(_pedido(ip="200.1.2.3")) == "ip:200.1.2.3"


def test_atras_do_proxy_conta_o_endereco_real():
    """Sem ler o `x-forwarded-for`, todo mundo viraria o balanceador do Render —
    um balde só para o app inteiro, que é pior do que não ter freio."""
    pedido = _pedido({"x-forwarded-for": "200.7.7.7, 10.0.0.1"}, ip="10.0.0.1")
    assert chave(pedido) == "ip:200.7.7.7"


def test_token_ilegivel_cai_no_endereco():
    """Recusar token não é trabalho deste módulo — é de `usuario_atual`, que faz
    melhor. Aqui, token quebrado só quer dizer "conte pelo IP"."""
    assert (
        chave(_pedido({"authorization": "Bearer nao-e-jwt"}, ip="200.4.5.6"))
        == "ip:200.4.5.6"
    )


def test_prefixo_impede_colisao_entre_pessoa_e_endereco():
    assert chave(_pedido()).startswith("ip:")
    assert chave(_pedido({"authorization": f"Bearer {_token('x')}"})).startswith("u:")


# ------------------------------------------------------- o freio, no app real


def _rajada(cliente: TestClient, caminho: str, n: int, **kwargs) -> dict[int, int]:
    contagem: dict[int, int] = {}
    for _ in range(n):
        codigo = cliente.get(caminho, **kwargs).status_code
        contagem[codigo] = contagem.get(codigo, 0) + 1
    return contagem


def test_o_freio_corta_no_app_de_verdade():
    """A prova que faltou duas vezes.

    `/v1/planos` é pública e não toca no banco, o que a torna a rota certa para
    medir o freio sem medir mais nada junto.
    """
    cliente = TestClient(app)
    teto = TETO_DE_TESTE
    contagem = _rajada(cliente, "/v1/planos", teto + 5)

    assert contagem.get(200) == teto
    assert contagem.get(429) == 5


def test_a_resposta_do_corte_diz_o_que_fazer():
    """Um 429 sem `Retry-After` e sem texto é um erro que a tela não sabe
    explicar — e quem bate no teto costuma ser gente apressada, não atacante."""
    cliente = TestClient(app)
    teto = TETO_DE_TESTE
    _rajada(cliente, "/v1/planos", teto)

    resposta = cliente.get("/v1/planos")
    assert resposta.status_code == 429
    assert resposta.json()["codigo"] == "MUITAS_REQUISICOES"
    assert int(resposta.headers["retry-after"]) >= 1


def test_uma_pessoa_estourando_nao_derruba_as_outras():
    cliente = TestClient(app)
    teto = TETO_DE_TESTE
    gastador = {"Authorization": f"Bearer {_token('gastador')}"}
    _rajada(cliente, "/v1/planos", teto + 2, headers=gastador)

    outra = {"Authorization": f"Bearer {_token('recem-chegada')}"}
    assert cliente.get("/v1/planos", headers=outra).status_code == 200


def test_health_nao_e_contada():
    """O Render decide se o serviço está vivo por esta rota. Um 429 aqui não
    seria um pedido recusado — seria o deploy derrubado."""
    cliente = TestClient(app)
    teto = TETO_DE_TESTE
    contagem = _rajada(cliente, "/v1/health", teto + 20)

    assert set(contagem) <= {200, 503}  # 503 é banco fora, não freio
    assert 429 not in contagem


def test_a_isencao_e_por_caminho_e_nao_por_rota_resolvida():
    """Regressão do segundo defeito: a isenção não pode depender de o middleware
    descobrir qual rota está sendo chamada, porque foi essa descoberta que falhou
    silenciosamente quando o FastAPI mudou a forma de incluir routers."""
    assert "/v1/health" in ISENTOS


def test_o_teto_real_e_generoso_e_por_minuto():
    """O teto de produção, conferido sem rede.

    Generoso de propósito: o alvo é raspagem, não uso intenso. O feed, o acervo e
    a vitrine disparam várias requisições por abertura de tela, e um teto
    apertado viraria um defeito intermitente que ninguém consegue reproduzir.
    """
    quantidade, _, unidade = LIMITE_PADRAO.partition("/")
    assert unidade == "minute"
    assert int(quantidade) >= 300
