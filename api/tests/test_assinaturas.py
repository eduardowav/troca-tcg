"""Testes da assinatura do PRO — sem Postgres e sem rede, como o resto.

A cobrança está desligada, e é por isso que a regra precisa de teste agora: o dia
de ligar tem de ser uma linha em `core/limites.py`, não uma redescoberta de como
o webhook decidia quem é PRO.

O que se prova aqui é o que custa caro errar:

- que a notificação sem assinatura válida **não** promove ninguém;
- que o corpo da notificação nunca vira estado — o estado vem da API;
- que o reenvio do Mercado Pago não é aplicado duas vezes;
- que `pending` não promove e que a queda passa pela carência de 7 dias;
- que a carência não reinicia a cada notificação repetida do mesmo problema.

O checkout em si é do Mercado Pago e depende de rede; o que fica aqui é a decisão
de promover, manter ou derrubar.
"""

import hashlib
import hmac
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.core.limites import COBRANCA_ATIVA
from app.main import app
from app.services import assinaturas, mercado_pago

SEGREDO = "segredo-de-teste"


class SessaoFalsa:
    """Dublê no espírito do test_verificacao_telefone.

    `retornos` é consumido em ordem por `scalar`; `linha` é o que o `mappings()`
    devolve; `lista` é o que `scalars().all()` devolve. Nenhum teste aqui depende
    de SQL de verdade — o que se verifica é a regra, e os SQLs ficam visíveis
    para o teste conferir quando importa.
    """

    def __init__(self, retornos=None, linha=None, lista=None):
        self.retornos = list(retornos or [])
        self.linha = linha
        self.lista = list(lista or [])
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        linha, lista = self.linha, self.lista

        class Res:
            def mappings(self_inner):
                class M:
                    def first(self_m):
                        return linha

                    def all(self_m):
                        return [linha] if linha else []

                return M()

            def scalars(self_inner):
                class S:
                    def all(self_s):
                        return lista

                return S()

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.retornos.pop(0) if self.retornos else None

    async def commit(self):
        self.commits += 1


def _assinar(data_id: str, request_id: str, carimbo: str = "1700000000") -> str:
    """Monta um `x-signature` legítimo, do jeito que o Mercado Pago monta."""
    manifesto = f"id:{data_id.lower()};request-id:{request_id};ts:{carimbo};"
    v1 = hmac.new(SEGREDO.encode(), manifesto.encode(), hashlib.sha256).hexdigest()
    return f"ts={carimbo},v1={v1}"


@pytest.fixture
def com_segredo(monkeypatch):
    monkeypatch.setattr(settings, "MERCADO_PAGO_WEBHOOK_SECRET", SEGREDO)


# ------------------------------------------------------------------ a assinatura


def test_assinatura_valida_passa(com_segredo):
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1"),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_id_em_maiusculas_confere_igual(com_segredo):
    """O manifesto é montado com o id em minúsculas — a documentação pede, e o
    primeiro 401 inexplicável ensina."""
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("ABC123", "req-1"),
        x_request_id="req-1",
        data_id="ABC123",
    )


def test_hmac_de_outro_recurso_nao_passa(com_segredo):
    """Assinatura legítima de uma notificação não vale para outra — senão bastaria
    capturar uma e trocar o id."""
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1"),
        x_request_id="req-1",
        data_id="outro-recurso",
    )


def test_sem_segredo_configurado_nada_passa(monkeypatch):
    """O estado de hoje. Um receptor que aceitasse tudo enquanto a variável está
    vazia seria uma rota pública que promove qualquer um a PRO."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_WEBHOOK_SECRET", "")
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1"),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_assinatura_malformada_nao_derruba(com_segredo):
    for ruim in (None, "", "lixo", "ts=1", "v1=abc", "ts=,v1="):
        assert not mercado_pago.assinatura_confere(
            x_signature=ruim, x_request_id="req-1", data_id="abc123"
        )


# ------------------------------------------------------------------ o receptor


def test_webhook_recusa_assinatura_invalida(com_segredo):
    resp = TestClient(app).post(
        "/v1/webhooks/mercadopago?data.id=abc123&type=subscription_preapproval",
        json={"id": 1, "data": {"id": "abc123"}},
        headers={"x-signature": "ts=1,v1=naoconfere", "x-request-id": "req-1"},
    )
    assert resp.status_code == 401
    assert resp.json()["resultado"] == "assinatura_invalida"


def test_webhook_sem_cabecalho_nenhum_recusa(com_segredo):
    resp = TestClient(app).post(
        "/v1/webhooks/mercadopago?data.id=abc123&type=subscription_preapproval",
        json={"id": 1},
    )
    assert resp.status_code == 401


# ------------------------------------------------------------------ a decisão


async def test_corpo_nao_e_fonte_de_nada(monkeypatch):
    """O status vem da API, nunca do que chegou escrito.

    Aqui o corpo diria `authorized`; o que vale é o `cancelled` que a consulta
    devolve. É esta busca que torna inútil forjar corpo.
    """
    buscados: list[str] = []

    async def falsa_busca(preapproval_id):
        buscados.append(preapproval_id)
        return {"status": "cancelled", "external_reference": str(uuid4())}

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha=None)
    resultado = await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    assert resultado == "aplicada"
    assert buscados == ["preapproval-1"]
    # Nenhum update promovendo alguém a PRO saiu desta notificação. (O `set` na
    # busca é de propósito: a carência menciona `plano = 'PRO'` no `where`.)
    assert not any("set plano = 'PRO'" in sql for sql in sessao.sqls)


async def test_reenvio_nao_e_aplicado_duas_vezes(monkeypatch):
    """O Mercado Pago reenvia quando não recebe 200 a tempo — e reenviar é o
    comportamento certo dele. O que não pode é o aviso ser aplicado de novo."""
    chamadas: list[str] = []

    async def falsa_busca(preapproval_id):
        chamadas.append(preapproval_id)
        return {"status": "authorized", "external_reference": str(uuid4())}

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    # `scalar` do insert devolve None: o `on conflict do nothing` não inseriu.
    sessao = SessaoFalsa(retornos=[None])
    resultado = await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    assert resultado == "repetida"
    # Nem a consulta ao provedor chegou a acontecer.
    assert chamadas == []


async def test_topico_de_fora_e_ignorado(monkeypatch):
    """O tópico de plano avisa que o *preço* mudou, não que alguém assinou."""
    sessao = SessaoFalsa()
    resultado = await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval_plan",
        recurso_id="plano-1",
    )
    assert resultado == "ignorado"
    assert sessao.sqls == []


async def test_autorizada_promove_e_limpa_a_carencia(monkeypatch):
    """Quem falhou e voltou a pagar não pode cair no prazo antigo."""
    dono = str(uuid4())

    async def falsa_busca(_):
        return {
            "status": "authorized",
            "external_reference": dono,
            "next_payment_date": "2026-09-13T00:00:00.000-04:00",
            "auto_recurring": {"frequency": 1, "frequency_type": "months"},
        }

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha={"user_id": dono})
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    promocao = [s for s in sessao.sqls if "set plano = 'PRO'" in s]
    assert len(promocao) == 1
    assert "plano_expira_em = null" in promocao[0]


async def test_pendente_nao_promove_nem_derruba(monkeypatch):
    """Assinatura criada e não autorizada. Quem fechou a aba no meio do checkout
    está aqui, e promover essa pessoa seria dar o plano por ter clicado."""
    dono = str(uuid4())

    async def falsa_busca(_):
        return {"status": "pending", "external_reference": dono}

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha={"user_id": dono})
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    assert not any("set plano = 'PRO'" in sql for sql in sessao.sqls)
    assert not any("plano_expira_em = now()" in sql for sql in sessao.sqls)


async def test_cancelada_abre_carencia_em_vez_de_derrubar(monkeypatch):
    """Cortar na hora seria cobrar o mês inteiro e entregar até o dia do
    cancelamento."""
    dono = str(uuid4())

    async def falsa_busca(_):
        return {"status": "cancelled", "external_reference": dono}

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha={"user_id": dono})
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    carencia = [s for s in sessao.sqls if "plano_expira_em = now()" in s]
    assert len(carencia) == 1
    assert f"interval '{assinaturas.CARENCIA_DIAS} days'" in carencia[0]
    # Ninguém vira FREE por causa de uma notificação: quem derruba é o job.
    assert not any("plano = 'FREE'" in sql for sql in sessao.sqls)


async def test_a_carencia_nao_reinicia_a_cada_notificacao(monkeypatch):
    """Uma assinatura que falha todos os dias daria PRO para sempre se cada aviso
    empurrasse o prazo. Quem impede é o `plano_expira_em is null` na condição."""
    dono = str(uuid4())

    async def falsa_busca(_):
        return {"status": "paused", "external_reference": dono}

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-2"], linha={"user_id": dono})
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-2",
        topico="subscription_preapproval",
        recurso_id="preapproval-1",
    )

    carencia = [s for s in sessao.sqls if "plano_expira_em = now()" in s][0]
    assert "plano_expira_em is null" in carencia
    # E só quem tem o que perder entra em carência.
    assert "plano = 'PRO'" in carencia


async def test_preapproval_desconhecido_nao_mexe_em_plano(monkeypatch):
    """Notificação de uma assinatura que este banco não conhece (painel do
    Mercado Pago, ambiente trocado). Fica o registro e nada mais."""

    async def falsa_busca(_):
        return {"status": "authorized"}  # sem external_reference

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha=None)
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="desconhecido",
    )

    assert not any("update profiles" in sql for sql in sessao.sqls)


# ------------------------------------------------------------------ o interruptor


def test_rotas_de_assinatura_estao_desligadas():
    """Enquanto `COBRANCA_ATIVA` for falso, `plano_vigente()` devolve PRO para
    todo mundo — vender assinatura nesse estado seria cobrar pelo que já está na
    mão. Este teste quebra de propósito no dia da virada."""
    assert COBRANCA_ATIVA is False

    resp = TestClient(app).post(
        "/v1/me/assinatura",
        json={"periodo": "mensal"},
        headers={"Authorization": "Bearer nao-importa"},
    )
    # 401 (sessão) ou 503 (desligada) — o que não pode é 201.
    assert resp.status_code in (401, 503)


async def test_periodo_invalido_e_recusado_com_campo():
    with pytest.raises(RegraNegocio) as e:
        await assinaturas.iniciar(SessaoFalsa(), uuid4(), "semanal")  # type: ignore[arg-type]
    assert e.value.codigo == "PERIODO_INVALIDO"
    assert e.value.campo == "periodo"


async def test_sem_plano_configurado_recusa(monkeypatch):
    """Ambiente novo sem os ids dos planos: 503, não um 500 no meio do checkout."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_PLANO_MENSAL", "")
    with pytest.raises(RegraNegocio) as e:
        await assinaturas.iniciar(SessaoFalsa(), uuid4(), "mensal")  # type: ignore[arg-type]
    assert e.value.codigo == "ASSINATURA_INDISPONIVEL"
    assert e.value.status_code == 503


async def test_reconciliar_desligado_nao_toca_no_banco(monkeypatch):
    """Sem credencial, responde `desligado` — que é diferente de zero conferidas."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")
    sessao = SessaoFalsa()
    assert await assinaturas.reconciliar(sessao) == {"desligado": 1}  # type: ignore[arg-type]
    assert sessao.sqls == []
