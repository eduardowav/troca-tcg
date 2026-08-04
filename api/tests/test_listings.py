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


def test_atualizar_aceita_acabamento():
    """Acabamento é corrigível, ao contrário de carta e tipo — ver o schema."""
    dados = AnuncioAtualizar(finish_id=3)
    assert dados.model_dump(exclude_unset=True) == {"finish_id": 3}


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


class _Resultado:
    """O bastante da API do SQLAlchemy para o que `_validar_acabamentos` usa."""

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def mappings(self):
        return self

    def all(self):
        return self._linhas


class _SessaoFake:
    def __init__(self, linhas: list[dict]):
        self._linhas = linhas
        self.consultas = 0

    async def execute(self, *_args, **_kwargs):
        self.consultas += 1
        return _Resultado(self._linhas)


CARTA = str(uuid4())
OUTRA = str(uuid4())


async def test_acabamento_fora_do_catalogo_e_recusado():
    """Master Ball numa carta que nunca saiu em Master Ball."""
    sessao = _SessaoFake(
        [{"card_id": CARTA, "finish_id": 1}, {"card_id": CARTA, "finish_id": 3}]
    )
    with pytest.raises(Exception) as erro:
        await listings._resolver_acabamentos(sessao, [(CARTA, 11)])  # type: ignore[arg-type]
    assert erro.value.codigo == "ACABAMENTO_INVALIDO"  # type: ignore[attr-defined]
    assert erro.value.status_code == 422  # type: ignore[attr-defined]


async def test_acabamento_catalogado_passa():
    sessao = _SessaoFake(
        [{"card_id": CARTA, "finish_id": 1}, {"card_id": CARTA, "finish_id": 3}]
    )
    assert await listings._resolver_acabamentos(sessao, [(CARTA, 3)]) == [3]  # type: ignore[arg-type]


async def test_carta_sem_catalogo_aceita_qualquer_acabamento():
    """1.681 cartas não têm acabamento catalogado.

    Ausência de dado não é "não existe" — ver `_resolver_acabamentos`.
    """
    sessao = _SessaoFake([])
    assert await listings._resolver_acabamentos(sessao, [(CARTA, 11)]) == [11]  # type: ignore[arg-type]


async def test_sem_escolha_pega_normal_quando_existe():
    """O onboarding não pergunta acabamento e manda o campo vazio."""
    sessao = _SessaoFake(
        [{"card_id": CARTA, "finish_id": 1}, {"card_id": CARTA, "finish_id": 3}]
    )
    assert await listings._resolver_acabamentos(sessao, [(CARTA, None)]) == [1]  # type: ignore[arg-type]


async def test_sem_escolha_pega_o_primeiro_quando_nao_ha_normal():
    """Regressão: 5.082 cartas não existem em Normal.

    Antes de resolver no servidor, o onboarding mandava NORMAL fixo — e o lote
    inteiro de quem começava com uma ultra rara era reprovado.
    """
    sessao = _SessaoFake(
        [{"card_id": CARTA, "finish_id": 2}, {"card_id": CARTA, "finish_id": 3}]
    )
    assert await listings._resolver_acabamentos(sessao, [(CARTA, None)]) == [2]  # type: ignore[arg-type]


async def test_sem_escolha_e_sem_catalogo_cai_em_normal():
    sessao = _SessaoFake([])
    assert await listings._resolver_acabamentos(sessao, [(CARTA, None)]) == [1]  # type: ignore[arg-type]


async def test_lote_inteiro_em_uma_consulta():
    """O onboarding manda até 300 itens; 300 idas ao banco derrubariam a tela."""
    sessao = _SessaoFake([{"card_id": CARTA, "finish_id": 1}])
    resolvidos = await listings._resolver_acabamentos(  # type: ignore[arg-type]
        sessao, [(CARTA, 1), (OUTRA, None), (CARTA, None)]
    )
    assert resolvidos == [1, 1, 1]
    assert sessao.consultas == 1


def test_patch_exige_autenticacao():
    client = TestClient(app)
    resp = client.patch(f"/v1/me/listings/{uuid4()}", json={"quantidade": 2})
    assert resp.status_code in (401, 403)
