"""Testes de perfil/anúncios que não dependem de um Postgres real."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.errors import RegraNegocio
from app.main import app
from app.schemas.listing import AnuncioItem
from app.schemas.profile import PerfilCriar
from app.services import profiles


def test_username_normaliza_e_valida():
    p = PerfilCriar(username="Eduardo_01", nome_exibicao="Eduardo", aceite_termos=True)
    assert p.username == "eduardo_01"

    with pytest.raises(ValidationError):
        PerfilCriar(username="ab", nome_exibicao="X", aceite_termos=True)

    with pytest.raises(ValidationError):
        PerfilCriar(username="com espaço", nome_exibicao="X", aceite_termos=True)


def test_anuncio_item_defaults():
    item = AnuncioItem(card_id=uuid4(), tipo="OFERTA")
    # Acabamento nasce vazio, e não em NORMAL: quem não escolhe recebe o
    # acabamento que a carta tem, decidido no serviço — ver
    # services/listings._resolver_acabamentos.
    assert item.finish_id is None
    assert item.condicao == "NM"
    assert item.quantidade == 1
    assert item.prioridade == 2


async def test_criar_perfil_exige_aceite():
    dados = PerfilCriar(username="alguem", nome_exibicao="Alguém", aceite_termos=False)
    # A regra dispara antes de tocar o banco, então a sessão nem é usada.
    with pytest.raises(RegraNegocio) as e:
        await profiles.criar_perfil(session=None, user_id=uuid4(), dados=dados, ip=None)  # type: ignore[arg-type]
    assert e.value.codigo == "ACEITE_TERMOS_NECESSARIO"


def test_me_exige_autenticacao():
    client = TestClient(app)
    resp = client.get("/v1/me")
    assert resp.status_code in (401, 403)
