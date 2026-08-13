"""Testes da rota de planos.

O valor desta rota é ser **a mesma fonte** que a regra usa. Um teste que
repetisse os números aqui recriaria a divergência que ela existe para evitar:
alguém mudaria o teto em `limites.py`, o teste quebraria, e o reflexo seria
consertar o teste. Por isso a comparação é sempre contra `PLANOS`, e o que se
afirma são as propriedades que a tela depende — não os valores.

Não precisa de banco: a rota é constante e pública.
"""

from dataclasses import fields

from fastapi.testclient import TestClient

from app.core.limites import COBRANCA_ATIVA, PLANOS, Limites
from app.main import app


def _corpo() -> dict:
    resp = TestClient(app).get("/v1/planos")
    assert resp.status_code == 200
    return resp.json()


def test_serve_os_limites_que_a_regra_aplica():
    corpo = _corpo()
    for nome, limites in PLANOS.items():
        for campo in fields(Limites):
            assert corpo["planos"][nome][campo.name] == getattr(limites, campo.name)


def test_expoe_todo_limite_declarado():
    """Limite novo em `Limites` chega à tela sem ninguém lembrar da rota."""
    corpo = _corpo()
    esperados = {campo.name for campo in fields(Limites)}
    for nome in PLANOS:
        assert set(corpo["planos"][nome]) == esperados


def test_diz_se_a_cobranca_esta_ligada():
    """A tela muda de recado com isto — ver `routes/Planos.tsx`."""
    assert _corpo()["cobranca_ativa"] is COBRANCA_ATIVA


def test_e_publica():
    """Tabela de preço não pede sessão: quem ainda não tem conta olha."""
    resp = TestClient(app).get("/v1/planos")
    assert resp.status_code == 200


def test_o_pro_nao_e_pior_que_o_free_em_nada():
    """Uma inversão de teto aqui vira promessa quebrada na tela de planos.

    `None` é ilimitado nos dois campos de teto, então ele vence qualquer número.
    """
    free, pro = PLANOS["FREE"], PLANOS["PRO"]

    assert pro.max_ofertas is None or (
        free.max_ofertas is not None and pro.max_ofertas >= free.max_ofertas
    )
    assert pro.historico_dias is None or (
        free.historico_dias is not None and pro.historico_dias >= free.historico_dias
    )
    assert pro.propostas_por_dia >= free.propostas_por_dia
    assert pro.cadastro_em_massa >= free.cadastro_em_massa
    assert pro.triangular >= free.triangular
    assert pro.alerta_carta >= free.alerta_carta
