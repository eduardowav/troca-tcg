"""O que a API expõe de si mesma, e o que ela aceita nos campos livres.

Itens 4 e 7 do bloco de segurança da seção 17.

O primeiro é sobre o contrato: `/docs` e `/openapi.json` entregam o mapa inteiro
da API — incluindo `/internal/jobs/*` — a quem teria de levantá-lo sozinho, e o
`/docs` ainda dá o botão de disparar cada rota. Some em produção.

O segundo é sobre confiar no que entra: `bairro` e `avatar_url` chegavam sem
limite de tamanho e sem validação, e o `avatar_url` é servido a terceiros no
perfil público — o que a pessoa escreve ali é renderizado no navegador de outra.
"""

import importlib

import pytest
from pydantic import ValidationError

from app.schemas.profile import PerfilAtualizar, PerfilCriar

# --------------------------------------------------- o contrato em produção


def _app_com_ambiente(monkeypatch, ambiente: str):
    """Recria o app com o ambiente pedido.

    O `FastAPI(...)` roda na importação do módulo, então trocar a configuração
    depois não muda nada — é preciso reimportar. Testar a expressão em vez do app
    provaria só que a expressão existe.
    """
    from app.core import config

    monkeypatch.setattr(config.settings, "ENVIRONMENT", ambiente)
    import app.main

    return importlib.reload(app.main).app


@pytest.mark.parametrize("caminho", ["/docs", "/redoc", "/openapi.json"])
def test_documentacao_fechada_em_producao(monkeypatch, caminho):
    from fastapi.testclient import TestClient

    producao = _app_com_ambiente(monkeypatch, "production")
    assert TestClient(producao).get(caminho).status_code == 404


@pytest.mark.parametrize("caminho", ["/docs", "/openapi.json"])
def test_documentacao_aberta_fora_de_producao(monkeypatch, caminho):
    """Fechar em desenvolvimento seria trocar um risco por atrito diário: é essa
    tela que se usa para conferir um contrato enquanto se escreve a rota."""
    from fastapi.testclient import TestClient

    dev = _app_com_ambiente(monkeypatch, "development")
    assert TestClient(dev).get(caminho).status_code == 200


def test_a_raiz_nao_anuncia_a_documentacao_em_producao(monkeypatch):
    """Endereço anunciado que responde 404 é pior que silêncio: diz que existe
    algo ali e convida a procurar."""
    from fastapi.testclient import TestClient

    producao = _app_com_ambiente(monkeypatch, "production")
    assert "docs" not in TestClient(producao).get("/").json()


def test_o_contrato_continua_legivel_pelo_codigo(monkeypatch):
    """`openapi_url=None` tira a rota, não o documento.

    A diferença importa: outros testes leem `app.openapi()` para provar coisas
    como "o feed não serializa contato". Se fechar em produção apagasse o
    documento, essas provas cairiam justamente no ambiente que importa.
    """
    producao = _app_com_ambiente(monkeypatch, "production")
    assert producao.openapi()["paths"]["/v1/me/matches"]["get"]


@pytest.fixture(autouse=True)
def restaura_o_app(monkeypatch):
    """Devolve `app.main` ao estado normal.

    Sem isto, o módulo recarregado com `ENVIRONMENT=production` fica no
    `sys.modules` e o resto da suíte passa a importar um app sem `/openapi.json`
    — quebrando testes que não têm nada a ver com este arquivo.
    """
    yield
    from app.core import config

    monkeypatch.setattr(config.settings, "ENVIRONMENT", "development")
    import app.main

    importlib.reload(app.main)


# ----------------------------------------------------- o que entra nos campos


def test_bairro_tem_teto():
    """Sem `max_length`, o Pydantic aceita megabytes e o Postgres guarda sem
    reclamar — `bairro` é `text`."""
    with pytest.raises(ValidationError):
        PerfilCriar(
            username="alguem",
            nome_exibicao="Alguém",
            bairro="x" * 200,
            aceite_termos=True,
        )


def test_avatar_url_tem_teto():
    with pytest.raises(ValidationError):
        PerfilAtualizar(avatar_url="https://exemplo.com/" + "x" * 600)


@pytest.mark.parametrize(
    "endereco",
    [
        "javascript:alert(document.cookie)",
        "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
        "http://exemplo.com/foto.png",
        "//exemplo.com/foto.png",
    ],
)
def test_avatar_url_so_aceita_https(endereco):
    """Este campo é renderizado no navegador de outra pessoa, no perfil público.

    `javascript:` e `data:` com SVG são execução, não imagem. `http://` é
    conteúdo misto numa página servida por HTTPS. Nenhum dos quatro tem uso
    legítimo aqui — toda hospedagem de imagem serve por HTTPS.
    """
    with pytest.raises(ValidationError):
        PerfilAtualizar(avatar_url=endereco)


def test_avatar_url_https_passa():
    dados = PerfilAtualizar(avatar_url="https://exemplo.com/foto.png")
    assert dados.avatar_url == "https://exemplo.com/foto.png"


def test_avatar_url_vazio_vira_nulo():
    """Campo apagado na tela chega como string vazia; guardar `""` faria a tela
    tentar carregar uma imagem de endereço nenhum."""
    assert PerfilAtualizar(avatar_url="   ").avatar_url is None


def test_o_evento_de_furo_nao_monta_json_com_f_string():
    """Item 7. O valor é um uuid vindo do banco, então não era explorável — era
    frágil: no dia em que alguém puser ali um campo escrito por gente, a f-string
    vira injeção de JSON sem que a linha mude de aparência."""
    import inspect

    from app.services import matching

    fonte = inspect.getsource(matching.registrar_furo)
    assert "json.dumps" in fonte
    assert '{{"faltou"' not in fonte
