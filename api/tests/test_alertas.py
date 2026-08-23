"""Testes do alerta de carta — o portão, a idempotência e a varredura.

O alerta é o segundo aviso que nasce de varredura, e varredura é onde o app vira
insuportável se alguém errar a mão: o teste do dedupe existe para isso. O do
portão existe pelo motivo oposto — para o dia em que a cobrança ligar não
fechar, sem querer, o que devia continuar aberto.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import limites
from app.core.errors import RegraNegocio
from app.main import app
from app.services import alertas, notificacoes


class SessaoFalsa:
    def __init__(self, plano="FREE", linhas=()):
        self.plano = plano
        self.linhas = list(linhas)
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        linhas = self.linhas

        class Res:
            def mappings(self):
                class M:
                    def all(self_inner):
                        return linhas

                    def first(self_inner):
                        return linhas[0] if linhas else None

                return M()

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.plano

    async def commit(self):
        self.commits += 1


# ------------------------------------------------------------------ o portão


async def test_free_nao_cria_alerta(monkeypatch):
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    with pytest.raises(RegraNegocio) as e:
        await alertas.criar(SessaoFalsa("FREE"), uuid4(), uuid4())  # type: ignore[arg-type]
    assert e.value.codigo == "RECURSO_DO_PRO"
    assert e.value.status_code == 402
    # A frase aponta a saída que existe no FREE, em vez de só fechar a porta.
    assert "Procuro" in e.value.mensagem


async def test_pro_cria_alerta(monkeypatch):
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    sessao = SessaoFalsa("PRO")
    await alertas.criar(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert sessao.commits == 1


async def test_portao_fechado_agora_que_a_cobranca_esta_ligada():
    """Invertido em 2026-08-22, quando `COBRANCA_ATIVA` virou para o lançamento.

    Ele afirmava o contrário — que o FREE passava, porque `plano_vigente()` devolvia
    PRO para todo mundo enquanto ninguém pagava. Quebrou de propósito no dia da
    virada, que era o serviço que ele prestava.

    Agora prova a outra metade da mesma regra: alerta de carta é do PRO, e o FREE
    é recusado sem tocar no banco.
    """
    assert limites.COBRANCA_ATIVA is True
    sessao = SessaoFalsa("FREE")
    with pytest.raises(RegraNegocio) as e:
        await alertas.criar(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert e.value.status_code == 402
    assert sessao.commits == 0


async def test_criar_e_idempotente():
    """Toque duplo, ou dois aparelhos, não podem virar dois avisos."""
    sessao = SessaoFalsa("PRO")
    await alertas.criar(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    escrita = next(s for s in sessao.sqls if "insert into card_alerts" in s)
    assert "on conflict (user_id, card_id) do update" in escrita


async def test_remover_nao_reclama_do_que_nao_existe():
    sessao = SessaoFalsa("PRO")
    await alertas.remover(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert sessao.commits == 1


# ------------------------------------------------------------------ a varredura


async def test_varredura_notifica_quem_espera(monkeypatch):
    chamadas: list[dict] = []

    async def falso(session, **kw):
        chamadas.append(kw)
        return True

    monkeypatch.setattr(notificacoes, "carta_disponivel", falso)

    sessao = SessaoFalsa(
        linhas=[
            {
                "espera": str(uuid4()),
                "card_id": str(uuid4()),
                "carta": "Charizard ex",
                "quantos": 2,
            }
        ]
    )
    assert await alertas.notificar_cartas_disponiveis(sessao, horas=24) == 1  # type: ignore[arg-type]
    assert chamadas[0]["carta"] == "Charizard ex"
    assert chamadas[0]["quantos"] == 2


async def test_varredura_ignora_a_propria_oferta_e_quem_esta_bloqueado():
    sessao = SessaoFalsa()
    await alertas.notificar_cartas_disponiveis(sessao, horas=24)  # type: ignore[arg-type]
    sql = sessao.sqls[0]
    assert "o.user_id <> a.user_id" in sql
    # Bloqueado não gera aviso nem recebe: os dois lados são conferidos.
    assert "quem_espera.bloqueado = false" in sql
    assert "dono.bloqueado = false" in sql
    # Estoque zerado não é carta disponível — ver a baixa por troca.
    assert "o.quantidade > 0" in sql


async def test_alerta_nao_e_consumido_pelo_aviso():
    """A carta some no mesmo dia; apagar no primeiro aviso deixaria a pessoa
    sem vigilância por causa de uma oferta que ela não chegou a ver."""
    sessao = SessaoFalsa()
    await alertas.notificar_cartas_disponiveis(sessao, horas=24)  # type: ignore[arg-type]
    assert not any("delete from card_alerts" in s for s in sessao.sqls)


def test_dedupe_do_aviso_e_de_um_dia():
    """Vinte e quatro horas, e não os sete dias da carta procurada: aquilo é o
    app puxando alguém por algo que não pediu; isto é pedido explícito."""
    import inspect

    fonte = inspect.getsource(notificacoes.carta_disponivel)
    assert "dedupe_horas=24" in fonte


def test_carta_disponivel_vibra_o_celular():
    assert notificacoes.TIPO_CARTA_DISPONIVEL in notificacoes.TIPOS_COM_PUSH


def test_rotas_exigem_autenticacao():
    cliente = TestClient(app)
    assert cliente.get("/v1/me/alerts").status_code in (401, 403)
    assert cliente.post(
        "/v1/me/alerts", json={"card_id": str(uuid4())}
    ).status_code in (401, 403)
