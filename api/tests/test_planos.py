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


def test_o_pro_e_publico_e_derivado_nunca_guardado_como_selo():
    """O selo de PRO sai das três telas onde a pessoa é avaliada, e é derivado.

    Decisão do Eduardo em 2026-08-24: aparece em tudo, como o FOUNDER. O que
    **não** pode acontecer é `PRO` virar um valor de `profiles.selo` — a coluna
    guarda um só, então quem fosse FOUNDER e PRO perderia um dos dois, e o selo
    teria de ser apagado à mão toda vez que um plano vence. Derivado de `plano`,
    ele some sozinho.

    O `plano` continua fora do público: sai um booleano. Mandar a coluna crua
    abriria a porta para a tela inventar regra de limite a partir de um campo
    público, e quem manda em limite é o backend.
    """
    from app.schemas.match import ParticipanteResumo
    from app.schemas.profile import PerfilPublicoOut
    from app.schemas.vitrine import OfertaNaVitrine

    for modelo in (PerfilPublicoOut, ParticipanteResumo, OfertaNaVitrine):
        assert "pro" in modelo.model_fields, modelo.__name__
        assert modelo.model_fields["pro"].annotation is bool
        # O plano cru não atravessa para quem não é dono.
        assert "plano" not in modelo.model_fields, modelo.__name__


def test_uma_fonte_so_para_o_pro_publico():
    """Três consultas alimentam o selo, e um `plano = 'PRO'` copiado em cada uma
    é como a vitrine e o perfil passam a discordar sobre a mesma pessoa."""
    from app.services import matching, vitrine
    from app.services.profiles import _COLUNAS_PUBLICAS, pro_publico

    assert pro_publico("") in _COLUNAS_PUBLICAS
    assert pro_publico() in str(vitrine._QUEM_TEM)
    assert matching.profiles.pro_publico is pro_publico


def test_o_alias_de_cada_consulta_bate_com_o_from():
    """O 500 de 2026-08-24, virado teste.

    `pro_publico` era constante com `p.` chumbado. Funciona onde há `join
    profiles p`; em `_COLUNAS_PUBLICAS`, cuja consulta é `from profiles` sem
    alias, o Postgres respondeu `missing FROM-clause entry for table "p"` — 500
    em toda leitura de perfil, para todo mundo logado, e o health continuou 200
    porque não toca em perfil.

    **Nenhum teste pegou porque todos dublam a sessão**, e um dublê aceita SQL
    que o banco recusa. Este não roda SQL, mas prende a regra que o erro
    violou: coluna com prefixo `p.` só pode existir onde a consulta declara
    esse alias.
    """
    from app.services import vitrine
    from app.services.profiles import _COLUNAS, _COLUNAS_PUBLICAS

    # As duas consultas de perfil são `from profiles` sem alias — nenhuma coluna
    # delas pode vir com prefixo de tabela.
    for colunas in (_COLUNAS_PUBLICAS, _COLUNAS):
        assert "p." not in colunas, colunas

    # A da vitrine tem, e declara.
    consulta = str(vitrine._QUEM_TEM)
    assert "join profiles p" in consulta
    assert "(p.plano = 'PRO') as pro" in consulta


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
