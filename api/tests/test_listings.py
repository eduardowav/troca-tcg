"""Testes dos anúncios que não dependem de um Postgres real."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.schemas.listing import AnuncioAtualizar
from app.services import listings


class UniqueViolationError(Exception):
    """Imita asyncpg.exceptions.UniqueViolationError — o que importa é o nome."""


class ForeignKeyViolationError(Exception):
    pass


def _integrity(orig: Exception) -> IntegrityError:
    return IntegrityError("update listings ...", {}, orig)


def test_atualizar_aceita_campo_isolado():
    """PATCH parcial: só o que veio no corpo entra no update."""
    dados = AnuncioAtualizar(quantidade=3)
    campos = dados.model_dump(exclude_unset=True)
    assert campos == {"quantidade": 3}


def test_atualizar_vazio_nao_gera_update():
    assert AnuncioAtualizar().model_dump(exclude_unset=True) == {}


def test_atualizar_valida_limites():
    with pytest.raises(ValidationError):
        AnuncioAtualizar(quantidade=0)
    with pytest.raises(ValidationError):
        AnuncioAtualizar(quantidade=100)
    with pytest.raises(ValidationError):
        AnuncioAtualizar(prioridade=4)
    with pytest.raises(ValidationError):
        AnuncioAtualizar(condicao="PERFEITA")  # type: ignore[arg-type]


def test_atualizar_nao_deixa_trocar_carta_nem_tipo():
    """card_id/tipo não são editáveis: mudar isso é outro anúncio."""
    dados = AnuncioAtualizar.model_validate(
        {"card_id": str(uuid4()), "tipo": "PROCURA"}
    )
    assert dados.model_dump(exclude_unset=True) == {}


def test_duplicado_vence_a_checagem_de_carta():
    """Regressão: a unique key contém card_id, então a ordem das checagens importa.

    Sem o branch de unique vindo primeiro, um anúncio duplicado seria reportado
    como "carta não encontrada no catálogo" — mensagem errada para o usuário.
    """
    orig = UniqueViolationError(
        "duplicate key value violates unique constraint "
        '"listings_user_id_card_id_tipo_condicao_finish_id_idioma_key"'
    )
    erro = listings._traduzir(_integrity(orig))
    assert erro.codigo == "ANUNCIO_DUPLICADO"
    assert erro.status_code == 409
    assert erro.campo == "condicao"


def test_card_id_invalido_continua_traduzido():
    orig = ForeignKeyViolationError(
        'insert or update on table "listings" violates foreign key '
        'constraint "listings_card_id_fkey"'
    )
    erro = listings._traduzir(_integrity(orig))
    assert erro.codigo == "CARTA_INVALIDA"
    assert erro.status_code == 422


def test_finish_invalido_continua_traduzido():
    orig = ForeignKeyViolationError(
        'violates foreign key constraint "listings_finish_id_fkey"'
    )
    erro = listings._traduzir(_integrity(orig))
    assert erro.codigo == "ACABAMENTO_INVALIDO"


def test_patch_exige_autenticacao():
    client = TestClient(app)
    resp = client.patch(f"/v1/me/listings/{uuid4()}", json={"quantidade": 2})
    assert resp.status_code in (401, 403)
