"""Testes da fonte de catálogo (TCGdex). Sem rede e sem banco: o transporte HTTP
é simulado com httpx.MockTransport e testamos só a lógica de transformação."""

import httpx
import pytest

from app.jobs.catalog.tcgdex import TCGdex, montar_imagem

# Mesma carta (localId 001) em PT e EN; a 002 só tem nome PT para exercitar o fallback.
_SETS = {
    "/v2/pt/sets/sv03": {
        "name": "Obsidiana em Chamas",
        "cards": [
            {
                "id": "sv03-001",
                "localId": "001",
                "name": "Oddish",
                "image": "https://assets.tcgdex.net/pt/sv/sv03/001",
            },
            {"id": "sv03-002", "localId": "002", "name": "Pesquisa do Professor"},
        ],
    },
    "/v2/en/sets/sv03": {
        "name": "Obsidian Flames",
        "cards": [
            {"id": "sv03-001", "localId": "001", "name": "Oddish"},
            {"id": "sv03-002", "localId": "002", "name": "Professor's Research"},
        ],
    },
}


def _handler(request: httpx.Request) -> httpx.Response:
    dados = _SETS.get(request.url.path)
    if dados is None:
        return httpx.Response(404, json={"erro": "not found"})
    return httpx.Response(200, json=dados)


@pytest.fixture
def fonte() -> TCGdex:
    client = httpx.AsyncClient(transport=httpx.MockTransport(_handler))
    return TCGdex(client, base_url="https://api.tcgdex.net/v2", idioma="pt")


def test_montar_imagem():
    assert montar_imagem(None) is None
    assert montar_imagem("https://x/sv03/001") == "https://x/sv03/001/low.webp"


async def test_obter_cartas_mescla_pt_e_en(fonte: TCGdex):
    cartas = await fonte.obter_cartas_do_set("sv03")

    assert len(cartas) == 2
    por_id = {c.external_id: c for c in cartas}

    oddish = por_id["sv03-001"]
    assert oddish.set_code == "sv03"
    assert oddish.set_nome == "Obsidiana em Chamas"
    assert oddish.numero == "001"
    assert oddish.nome_pt == "Oddish"
    assert oddish.nome_en == "Oddish"
    assert oddish.imagem_url == "https://assets.tcgdex.net/pt/sv/sv03/001/low.webp"
    assert oddish.raridade is None

    # carta de treinador: nome PT distinto do EN, casados pelo localId
    prof = por_id["sv03-002"]
    assert prof.nome_pt == "Pesquisa do Professor"
    assert prof.nome_en == "Professor's Research"
    assert prof.imagem_url is None  # sem 'image' no brief
