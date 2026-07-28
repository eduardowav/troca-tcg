"""Testes do matching que não dependem de um Postgres real."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.match import MatchOut, ParticipanteCompleto, ParticipanteResumo
from app.services import matching


def test_hash_grupo_independe_da_ordem():
    """Dedup: A consultando e B consultando têm de gerar a mesma chave.

    Se dependesse da ordem, cada lado criaria o seu match e o par veria duas
    sugestões do mesmo negócio.
    """
    a, b = uuid4(), uuid4()
    assert matching._hash_grupo(a, b) == matching._hash_grupo(b, a)


def test_hash_grupo_distingue_pares():
    a, b, c = uuid4(), uuid4(), uuid4()
    assert matching._hash_grupo(a, b) != matching._hash_grupo(a, c)


def test_resumo_nao_tem_campo_de_contato():
    """Regra inviolável: o feed não pode nem ter onde guardar o contato."""
    assert "contato_visivel" not in ParticipanteResumo.model_fields


def test_completo_tem_contato():
    assert "contato_visivel" in ParticipanteCompleto.model_fields


def test_match_do_feed_descarta_contato_mesmo_se_vier():
    """Mesmo alimentado com contato, o MatchOut do feed não o serializa."""
    saida = MatchOut(
        id=str(uuid4()),
        tipo="DIRETO",
        status="SUGERIDO",
        score=4.0,
        expira_em="2026-08-04T00:00:00+00:00",
        participantes=[
            ParticipanteResumo.model_validate(
                {
                    "user_id": str(uuid4()),
                    "username": "alguem",
                    "nome_exibicao": "Alguém",
                    "contato_visivel": "@zap-secreto",
                }
            )
        ],
        itens=[],
    )
    assert "zap-secreto" not in saida.model_dump_json()


def test_compatibilidade_exige_condicao_e_finish():
    """O SQL de compatibilidade precisa manter as quatro travas de troca."""
    sql = matching._COMPATIVEL
    assert "o.condicao <= p.condicao" in sql  # oferta ao menos tão boa
    assert "p.aceita_qualquer_finish or o.finish_id = p.finish_id" in sql
    assert "o.idioma  = p.idioma" in sql
    assert "o.user_id <> p.user_id" in sql  # ninguém troca consigo mesmo


def test_feed_exige_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/matches").status_code in (401, 403)


def test_responder_exige_autenticacao():
    client = TestClient(app)
    resp = client.post(f"/v1/me/matches/{uuid4()}/responder", json={"aceitou": True})
    assert resp.status_code in (401, 403)
