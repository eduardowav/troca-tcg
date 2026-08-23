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
    # `None` é ilimitado no PRO desde 2026-08-22, e a comparação precisa saber
    # disso: `None >= 5` explode em vez de reprovar.
    assert pro.propostas_por_dia is None or (
        free.propostas_por_dia is not None
        and pro.propostas_por_dia >= free.propostas_por_dia
    )
    assert pro.cadastro_em_massa >= free.cadastro_em_massa
    assert pro.triangular >= free.triangular
    assert pro.alerta_carta >= free.alerta_carta


# --------------------------------------------------------------------------
# O selo de perfil (2026-08-23) — e a fronteira que ele não pode cruzar
# --------------------------------------------------------------------------


def test_selo_nao_e_plano():
    """`FOUNDER` é identidade, e não pode virar um terceiro conjunto de limites.

    O pedido nasceu como "um plano novo, FOUNDER". Virou selo justamente porque
    os limites seriam idênticos aos do PRO — e `36_parceiro.sql` já havia
    descartado um `plano = 'PARCEIRO'` pelo mesmo motivo, um dia antes.

    Este teste é o que impede a regressão silenciosa: no dia em que alguém
    acrescentar `"FOUNDER"` a `PLANOS` para "ficar completo", a rota passa a
    anunciar um plano que ninguém pode comprar e a tela de planos ganha uma
    terceira coluna. Quem quiser mesmo fazer isso vai ter de apagar este teste,
    que é o ponto: a decisão fica visível.
    """
    assert set(PLANOS) == {"FREE", "PRO"}
    assert "FOUNDER" not in _corpo()["planos"]


def test_selo_sai_no_perfil_publico():
    """O selo é público — é a razão de ele existir.

    Um selo que só o dono enxerga não reconhece ninguém. A afirmação é sobre o
    **schema**, não sobre uma consulta: é `PerfilPublicoOut` quem decide o que
    terceiros veem, e o campo estar nele é o que faz o selo aparecer no perfil
    de outra pessoa, na lista de trocas e na vitrine.
    """
    from app.schemas.profile import PerfilPublicoOut

    assert "selo" in PerfilPublicoOut.model_fields
    # Nulo por padrão: a esmagadora maioria não tem selo, e um default obrigatório
    # forçaria toda consulta de perfil a lembrar de trazer a coluna.
    assert PerfilPublicoOut.model_fields["selo"].default is None
