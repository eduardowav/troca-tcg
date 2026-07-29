"""Testes da fonte de catálogo (TCGdex). Sem rede e sem banco: o transporte HTTP
é simulado com httpx.MockTransport e testamos só a lógica de transformação."""

from datetime import date

import httpx
import pytest

from app.jobs.catalog.tcgdex import TCGdex, montar_imagem

# Mesma carta (localId 001) em PT e EN; a 002 só tem nome PT para exercitar o fallback.
_RESPOSTAS = {
    "/v2/pt/series/sv": {
        "id": "sv",
        "name": "Escarlate e Violeta",
        "logo": "https://assets.tcgdex.net/pt/sv/sv01/logo",
        "sets": [{"id": "sv01", "name": "Escarlate e Violeta"}, {"id": "sv03"}],
    },
    "/v2/pt/sets/sv03": {
        "id": "sv03",
        "name": "Obsidiana em Chamas",
        "abbreviation": {"official": "OBF"},
        "cardCount": {"official": 197, "total": 230},
        "logo": "https://assets.tcgdex.net/pt/sv/sv03/logo",
        "symbol": "https://assets.tcgdex.net/univ/sv/sv03/symbol",
        "releaseDate": "2023-08-11",
        "serie": {"id": "sv", "name": "Escarlate e Violeta"},
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
    # set sem metadados: a fonte nem sempre traz sigla, contagem ou data
    "/v2/pt/sets/mee": {"id": "mee", "name": "Megaevolução Energia", "cards": []},
    "/v2/en/sets/mee": {"name": "Mega Evolution Energy", "cards": []},
    # set antigo: a TCGdex traduz o nome do set mas não tem o card-a-card em PT
    "/v2/pt/sets/base1": {"id": "base1", "name": "Coleção Básica", "cards": []},
    "/v2/en/sets/base1": {
        "name": "Base Set",
        "cards": [
            {
                "id": "base1-4",
                "localId": "4",
                "name": "Charizard",
                "image": "https://assets.tcgdex.net/en/base/base1/4",
            }
        ],
    },
}


def _handler(request: httpx.Request) -> httpx.Response:
    dados = _RESPOSTAS.get(request.url.path)
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


async def test_obter_serie_lista_os_sets(fonte: TCGdex):
    serie, set_codes = await fonte.obter_serie("sv")

    assert serie.code == "sv"
    assert serie.nome == "Escarlate e Violeta"
    assert serie.logo_url == "https://assets.tcgdex.net/pt/sv/sv01/logo"
    assert set_codes == ["sv01", "sv03"]


async def test_obter_set_traz_metadados(fonte: TCGdex):
    conjunto, _ = await fonte.obter_set("sv03")

    assert conjunto.code == "sv03"
    assert conjunto.nome == "Obsidiana em Chamas"
    assert conjunto.sigla == "OBF"  # é assim que o jogador lê: "OBF 125/197"
    assert conjunto.total_oficial == 197
    assert conjunto.total_impresso == 230  # inclui as secretas
    assert conjunto.lancado_em == date(2023, 8, 11)
    # a série vem junto para o sync conseguir gravar a linha-pai da FK
    assert conjunto.serie_code == "sv"
    assert conjunto.serie_nome == "Escarlate e Violeta"


async def test_obter_set_sem_metadados_nao_quebra(fonte: TCGdex):
    conjunto, cartas = await fonte.obter_set("mee")

    assert conjunto.nome == "Megaevolução Energia"
    assert conjunto.sigla is None
    assert conjunto.total_oficial is None
    assert conjunto.lancado_em is None
    assert conjunto.serie_code is None
    assert cartas == []


async def test_set_sem_pt_cai_para_o_ingles(fonte: TCGdex):
    """Sets anteriores a Black & White não têm card-a-card em PT na fonte.

    O set existe em papel e é trocado, então vem em inglês com `nome_pt` nulo —
    é o caso que `nomeCarta()` no frontend já resolve. Sem isso, todo o vintage
    ficaria fora do catálogo.
    """
    conjunto, cartas = await fonte.obter_set("base1")

    assert conjunto.nome == "Coleção Básica"  # o set é traduzido, as cartas não
    assert len(cartas) == 1
    assert cartas[0].nome_pt is None
    assert cartas[0].nome_en == "Charizard"
    assert cartas[0].imagem_url == "https://assets.tcgdex.net/en/base/base1/4/low.webp"


async def test_obter_cartas_mescla_pt_e_en(fonte: TCGdex):
    _, cartas = await fonte.obter_set("sv03")

    assert len(cartas) == 2
    por_id = {c.external_id: c for c in cartas}

    oddish = por_id["sv03-001"]
    assert oddish.set_code == "sv03"
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
