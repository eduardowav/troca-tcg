"""Testes do PRO comprado por Pix — sem Postgres e sem rede, como o resto.

**Substituiu `test_assinaturas.py` em 2026-08-23**, quando o PRO deixou de ser
assinatura recorrente de cartão. O que sobreviveu à troca inteiro foi a parte que
não era do modelo de cobrança: a validação HMAC do webhook, a idempotência por id
de notificação e a queda de plano com aparo das ofertas. O que morreu junto com a
recorrência foram os testes de cancelamento e de carência.

O que se prova aqui é o que custa caro errar:

- que a notificação sem assinatura válida **não** credita ninguém;
- que o corpo da notificação nunca vira estado — o estado vem da API;
- que o reenvio do Mercado Pago não é aplicado duas vezes;
- que dois avisos *diferentes* do mesmo pagamento creditam **um** período só —
  a trava que a assinatura não precisava e o Pix precisa;
- que quem tem cobrança viva recebe o mesmo código, e não um segundo;
- que comprar empilha em cima do que sobra, em vez de reiniciar.

O pagamento em si é do Mercado Pago e depende de rede; o que fica aqui é a
decisão de creditar, manter ou derrubar.
"""

import hashlib
import hmac
import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import limites
from app.core.config import settings
from app.core.errors import RegraNegocio
from app.core.limites import COBRANCA_ATIVA, PRECOS
from app.main import app
from app.services import mercado_pago, pro

SEGREDO = "segredo-de-teste"


class SessaoFalsa:
    """Dublê no espírito do test_verificacao_telefone.

    `retornos` é consumido em ordem por `scalar`; `linhas` é consumido em ordem
    por `mappings().first()`, e `linha` é o valor fixo de quem não precisa de
    fila; `lista` é o que `scalars().all()` devolve e `todos` o que
    `mappings().all()` devolve. Nenhum teste aqui depende de SQL de verdade — o
    que se verifica é a regra, e os SQLs ficam visíveis para o teste conferir
    quando importa.

    **A fila de `linhas` nasceu com o Pix.** `comprar` faz duas consultas que
    devolvem linha — a de cobrança viva e o insert com `returning` — e um valor
    fixo responderia as duas iguais, que é exatamente o estado que o código
    trata como "já existe cobrança".
    """

    def __init__(self, retornos=None, linha=None, lista=None, linhas=None, todos=None):
        self.retornos = list(retornos or [])
        self.linha = linha
        self.linhas = list(linhas) if linhas is not None else None
        self.lista = list(lista or [])
        self.todos = todos
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        sessao = self

        class Res:
            def mappings(self_inner):
                class M:
                    def first(self_m):
                        if sessao.linhas is not None:
                            return sessao.linhas.pop(0) if sessao.linhas else None
                        return sessao.linha

                    def all(self_m):
                        if sessao.todos is not None:
                            return sessao.todos
                        return [sessao.linha] if sessao.linha else []

                return M()

            def scalars(self_inner):
                class S:
                    def all(self_s):
                        return sessao.lista

                return S()

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.retornos.pop(0) if self.retornos else None

    async def commit(self):
        self.commits += 1


def _assinar(data_id: str, request_id: str, carimbo: str | None = None) -> str:
    """Monta um `x-signature` legítimo, do jeito que o Mercado Pago monta.

    O carimbo é **de agora** por padrão, e não uma constante: desde a janela de
    frescor (`_carimbo_fresco`), um `ts` fixo envelhece e o dia em que ele passa
    da tolerância é o dia em que a suíte inteira quebra sem nada ter mudado.
    Quem quer um carimbo velho passa um — é o que os testes da janela fazem.
    """
    carimbo = carimbo if carimbo is not None else str(int(time.time()))
    manifesto = f"id:{data_id.lower()};request-id:{request_id};ts:{carimbo};"
    v1 = hmac.new(SEGREDO.encode(), manifesto.encode(), hashlib.sha256).hexdigest()
    return f"ts={carimbo},v1={v1}"


@pytest.fixture
def com_segredo(monkeypatch):
    monkeypatch.setattr(settings, "MERCADO_PAGO_WEBHOOK_SECRET", SEGREDO)


def _pagamento(**extra):
    """Um pagamento do jeito que o Mercado Pago devolve, com o QR no lugar dele."""
    base = {
        "id": "pay-1",
        "status": "pending",
        "description": "TrocaTCG PRO mensal",
        "transaction_amount": float(PRECOS["mensal"]),
        "date_of_expiration": "2026-08-23T20:30:00.000+00:00",
        "point_of_interaction": {
            "transaction_data": {
                "qr_code": "00020126BR.GOV.BCB.PIX...5204000053039865802BR",
                "qr_code_base64": "iVBORw0KGgo=",
            }
        },
    }
    base.update(extra)
    return base


# ---------------------------------------------------------- a assinatura do aviso
# (HMAC — atravessou a troca de modelo de cobrança sem uma linha de mudança)


def test_assinatura_valida_passa(com_segredo):
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1"),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_id_em_maiusculas_confere_igual(com_segredo):
    """O manifesto é montado com o id em minúsculas — o que a documentação pede
    e o que o primeiro 401 inexplicável ensina."""
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("PAY-ABC", "req-1"),
        x_request_id="req-1",
        data_id="PAY-ABC",
    )


def test_hmac_de_outro_recurso_nao_passa(com_segredo):
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-outro", "req-1"),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_sem_segredo_configurado_nada_passa(monkeypatch):
    """Uma rota pública que aceitasse tudo enquanto a variável está vazia seria
    um botão de virar PRO."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_WEBHOOK_SECRET", "")
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1"),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_assinatura_malformada_nao_derruba(com_segredo):
    for ruim in ("", "lixo", "ts=1", "v1=abc", "ts=,v1="):
        assert not mercado_pago.assinatura_confere(
            x_signature=ruim, x_request_id="req-1", data_id="pay-1"
        )


def test_carimbo_velho_nao_passa(com_segredo, monkeypatch):
    monkeypatch.setattr(settings, "MERCADO_PAGO_TOLERANCIA_SEGUNDOS", 300)
    velho = str(int(time.time()) - 3600)
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1", velho),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_carimbo_do_futuro_tambem_nao_passa(com_segredo, monkeypatch):
    """`abs` porque relógio adiantado também é suspeito."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_TOLERANCIA_SEGUNDOS", 300)
    futuro = str(int(time.time()) + 3600)
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1", futuro),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_carimbo_em_milissegundos_passa(com_segredo, monkeypatch):
    """Treze dígitos são milissegundos, e trocar a unidade recusaria toda
    notificação legítima de uma vez."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_TOLERANCIA_SEGUNDOS", 300)
    ms = str(int(time.time()) * 1000)
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1", ms),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_carimbo_ilegivel_nao_passa(com_segredo, monkeypatch):
    monkeypatch.setattr(settings, "MERCADO_PAGO_TOLERANCIA_SEGUNDOS", 300)
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("pay-1", "req-1", "ontem"),
        x_request_id="req-1",
        data_id="pay-1",
    )


def test_webhook_recusa_assinatura_invalida(com_segredo):
    resp = TestClient(app).post(
        "/v1/webhooks/mercadopago?data.id=pay-1&type=payment",
        json={"id": 1, "type": "payment", "data": {"id": "pay-1"}},
        headers={"x-signature": "ts=1,v1=deadbeef", "x-request-id": "req-1"},
    )
    assert resp.status_code == 401
    assert resp.json()["resultado"] == "assinatura_invalida"


def test_webhook_sem_cabecalho_nenhum_recusa(com_segredo):
    resp = TestClient(app).post(
        "/v1/webhooks/mercadopago?data.id=pay-1&type=payment",
        json={"id": 1},
    )
    assert resp.status_code == 401


# ------------------------------------------------------------------ o crédito


async def test_corpo_nao_e_fonte_de_nada(monkeypatch):
    """O status vem da API, nunca do que chegou escrito.

    Aqui o corpo diria `approved`; o que vale é o `rejected` que a consulta
    devolve. É esta busca que torna inútil forjar corpo.
    """
    buscados: list[str] = []

    async def falsa_busca(payment_id):
        buscados.append(payment_id)
        return _pagamento(status="rejected", external_reference=str(uuid4()))

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"])
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    assert resultado == "registrado"
    assert buscados == ["pay-1"]
    assert not any("set plano = 'PRO'" in sql for sql in sessao.sqls)


async def test_reenvio_nao_e_aplicado_duas_vezes(monkeypatch):
    """O Mercado Pago reenvia quando não recebe 200 a tempo — e reenviar é o
    comportamento certo dele. O que não pode é o aviso ser aplicado de novo."""
    chamadas: list[str] = []

    async def falsa_busca(payment_id):
        chamadas.append(payment_id)
        return _pagamento(status="approved")

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    # `scalar` do insert devolve None: o `on conflict do nothing` não inseriu.
    sessao = SessaoFalsa(retornos=[None])
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    assert resultado == "repetida"
    # Nem a consulta ao provedor chegou a acontecer.
    assert chamadas == []


async def test_topico_de_fora_e_ignorado():
    """Só `payment` interessa. O app recebia tópicos de assinatura até 23/08, e
    reagir a eles agora seria mexer em plano por um aviso que não é de dinheiro."""
    sessao = SessaoFalsa()
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="pp-1",
    )
    assert resultado == "ignorado"
    assert sessao.sqls == []


@pytest.mark.parametrize(("periodo", "meses"), [("mensal", 1), ("anual", 12)])
async def test_aprovado_credita_o_periodo_comprado(monkeypatch, periodo, meses):
    """O dinheiro entrou: o PRO passa a valer, e por quantos meses foi comprado."""
    dono = str(uuid4())

    async def falsa_busca(_):
        return _pagamento(status="approved", external_reference=dono)

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(
        retornos=["evento-1"], linha={"user_id": dono, "periodo": periodo}
    )
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    assert resultado == "creditada"
    promocao = [s for s in sessao.sqls if "set plano = 'PRO'" in s]
    assert len(promocao) == 1
    assert [p for p in sessao.params if "meses" in p][0]["meses"] == meses


async def test_credito_empilha_em_cima_do_que_sobra(monkeypatch):
    """Renovar cedo não pode custar os dias que faltavam.

    Sem o `greatest`, quem paga faltando dez dias perde os dez — e o único
    momento seguro de renovar passaria a ser o último dia, que é justamente o
    dia em que se esquece. O outro lado do `greatest` é quem voltou depois de
    ter caído: a conta parte de hoje, não de uma data no passado.
    """
    dono = str(uuid4())

    async def falsa_busca(_):
        return _pagamento(status="approved", external_reference=dono)

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(
        retornos=["evento-1"], linha={"user_id": dono, "periodo": "mensal"}
    )
    await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    promocao = [s for s in sessao.sqls if "set plano = 'PRO'" in s][0]
    assert "greatest(" in promocao
    assert "coalesce(plano_expira_em, now())" in promocao
    assert "make_interval(months => :meses)" in promocao


async def test_dois_avisos_do_mesmo_pagamento_creditam_uma_vez(monkeypatch):
    """A trava que a assinatura não precisava e o Pix precisa.

    `payment.created` e `payment.updated` são dois avisos legítimos do mesmo
    dinheiro: ids de notificação diferentes, os dois passam pelo dedupe de
    `webhook_events`. Quem impede o segundo de creditar outro mês é o
    `where status <> 'approved'` do `update` — se ele sumir, o teste que pega
    isso é este.
    """

    async def falsa_busca(_):
        return _pagamento(status="approved", external_reference=str(uuid4()))

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    # A transição não devolveu linha: o pagamento já estava `approved`.
    sessao = SessaoFalsa(retornos=["evento-2"], linha=None)
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-2",
        topico="payment",
        recurso_id="pay-1",
    )

    assert resultado == "repetida"
    assert not any("set plano = 'PRO'" in s for s in sessao.sqls)

    transicao = [s for s in sessao.sqls if "update pro_pagamentos" in s][0]
    assert "status <> 'approved'" in transicao


async def test_pendente_nao_credita_nem_derruba(monkeypatch):
    """QR gerado e não pago. Promover quem clicou seria dar o plano pelo clique."""

    async def falsa_busca(_):
        return _pagamento(status="pending", external_reference=str(uuid4()))

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"])
    await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    assert not any("set plano = 'PRO'" in s for s in sessao.sqls)
    assert not any("plano = 'FREE'" in s for s in sessao.sqls)


async def test_pagamento_sem_dono_nao_mexe_em_plano(monkeypatch):
    """Sem `external_reference` e sem linha local, não há a quem creditar.

    Mexer no plano de alguém a partir de um vínculo que não se conhece é pior
    que não fazer nada.
    """

    async def falsa_busca(_):
        return _pagamento(status="approved")

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha=None)
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-desconhecido",
    )

    assert resultado == "repetida"
    assert not any("set plano = 'PRO'" in s for s in sessao.sqls)


async def test_linha_perdida_e_reconstruida_pelo_external_reference(monkeypatch):
    """O POST saiu e a resposta se perdeu: o pagamento existe lá e não aqui.

    A pessoa paga, a notificação chega, e sem esta reconstrução ela pagaria sem
    receber. O `external_reference` é o que permite reconstruir, e é por isso
    que ele viaja na criação.
    """
    dono = str(uuid4())

    async def falsa_busca(_):
        return _pagamento(
            status="approved",
            external_reference=dono,
            description="TrocaTCG PRO anual",
        )

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(
        retornos=["evento-1"], linha={"user_id": dono, "periodo": "anual"}
    )
    await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="pay-1",
    )

    reconstrucao = [s for s in sessao.sqls if "insert into pro_pagamentos" in s]
    assert len(reconstrucao) == 1
    assert "on conflict (payment_id) do nothing" in reconstrucao[0]
    # O período saiu da descrição que este app escreveu na criação.
    assert [p for p in sessao.params if "per" in p][0]["per"] == "anual"


async def test_recurso_inexistente_responde_200_e_nao_reenvia(monkeypatch):
    """404 é fim de linha. Responder 500 faria o Mercado Pago reenviar para
    sempre, contra um id que ele mesmo não resolve."""

    async def falsa_busca(_):
        raise mercado_pago.RecursoInexistente("/v1/payments/123456")

    monkeypatch.setattr(mercado_pago, "buscar_pagamento", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"])
    resultado = await pro.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="payment",
        recurso_id="123456",
    )

    assert resultado == "desconhecido"
    # O evento fica commitado: na próxima vez o dedupe responde sem gastar outra
    # ida à API deles.
    assert sessao.commits == 1
    assert not any("set plano = 'PRO'" in s for s in sessao.sqls)


# ------------------------------------------------------------------- a compra


def test_rotas_do_pro_estao_ligadas():
    """`COBRANCA_ATIVA` está ligada, e o que barra é a sessão.

    Continua valendo o essencial — **sem credencial válida ninguém gera Pix** —,
    e o 503 permanece possível porque `_exigir_ligada` ainda recusa se o Mercado
    Pago não estiver configurado no ambiente.
    """
    assert COBRANCA_ATIVA is True

    resp = TestClient(app).post(
        "/v1/me/pro/pagamentos",
        json={"periodo": "mensal"},
        headers={"Authorization": "Bearer nao-importa"},
    )
    # 401 (sessão inválida) ou 503 (provedor sem credencial). Nunca 201.
    assert resp.status_code in (401, 503)


async def test_periodo_invalido_e_recusado_com_campo():
    with pytest.raises(RegraNegocio) as e:
        await pro.comprar(SessaoFalsa(linhas=[None]), uuid4(), "semanal")  # type: ignore[arg-type]
    assert e.value.codigo == "PERIODO_INVALIDO"
    assert e.value.campo == "periodo"


@pytest.mark.parametrize("periodo", ["mensal", "anual"])
async def test_o_corpo_que_o_mercado_pago_recebe(monkeypatch, periodo):
    """O corpo do Pix, afirmado na borda da rede.

    Dubla o `_chamar` e não a função inteira, e a razão é história: até
    2026-08-22 os testes dublavam `criar_assinatura` completa, o dublê aceitava
    um corpo que o Mercado Pago recusava, e o erro só apareceu em produção. Um
    teste que não desce até o corpo não pega essa classe de defeito.
    """
    enviados: list[tuple[str, str, dict, str | None]] = []

    async def falso_chamar(metodo, caminho, corpo=None, *, chave=None):
        enviados.append((metodo, caminho, corpo or {}, chave))
        return _pagamento()

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)

    usuario = uuid4()
    sessao = SessaoFalsa(
        retornos=["alguem@exemplo.com"],
        linhas=[None, {"payment_id": "pay-1", "qr_code": "x"}],
    )
    await pro.comprar(sessao, usuario, periodo)  # type: ignore[arg-type]

    metodo, caminho, corpo, chave = enviados[0]
    assert (metodo, caminho) == ("POST", "/v1/payments")
    assert corpo["payment_method_id"] == "pix"
    assert corpo["transaction_amount"] == float(PRECOS[periodo])
    assert corpo["payer"] == {"email": "alguem@exemplo.com"}
    # A amarração com o usuário: é o que permite reconstruir a compra quando a
    # resposta do POST se perde.
    assert corpo["external_reference"] == str(usuario)
    # Sem CPF: o Mercado Pago aceita Pix só com o e-mail, e pedir documento por
    # precaução é coletar dado pessoal que não se precisa.
    assert "identification" not in corpo["payer"]
    # E a chave que impede a retentativa de virar segunda cobrança.
    assert chave and chave.startswith(f"pro:{usuario}:{periodo}:")


async def test_preco_nao_vira_dizima_no_corpo(monkeypatch):
    """`14.90` precisa sair `14.9` no JSON, e não `14.899999999999999`.

    `PRECOS` é `Decimal` justamente para isso, e a conversão para `float`
    acontece num ponto só. Dízima num corpo de cobrança é diferença de centavo
    na conta de alguém.
    """
    import json

    enviados: list[dict] = []

    async def falso_chamar(metodo, caminho, corpo=None, *, chave=None):
        enviados.append(corpo or {})
        return _pagamento()

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    sessao = SessaoFalsa(
        retornos=["alguem@exemplo.com"], linhas=[None, {"payment_id": "pay-1"}]
    )
    await pro.comprar(sessao, uuid4(), "mensal")  # type: ignore[arg-type]

    esperado = f'"transaction_amount": {float(PRECOS["mensal"])}'
    assert esperado in json.dumps(enviados[0])


async def test_cobranca_viva_e_reaproveitada_sem_tocar_no_provedor(monkeypatch):
    """Duas cobranças válidas na mão da mesma pessoa é como se paga duas vezes.

    O Pix não pergunta se a outra já foi paga antes de aceitar a segunda.
    """
    chamou = False

    async def falso_chamar(*a, **kw):
        nonlocal chamou
        chamou = True
        return _pagamento()

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)

    viva = {
        "payment_id": "pay-antigo",
        "periodo": "mensal",
        "valor": PRECOS["mensal"],
        "qr_code": "00020126...",
        "expira_em": datetime.now(UTC) + timedelta(minutes=20),
    }
    sessao = SessaoFalsa(linhas=[viva])
    resultado = await pro.comprar(sessao, uuid4(), "anual")  # type: ignore[arg-type]

    assert resultado["payment_id"] == "pay-antigo"
    assert resultado["reaproveitada"] is True
    # Nem o e-mail foi buscado: a função devolve antes de qualquer trabalho.
    assert chamou is False
    assert sessao.commits == 0


async def test_pagamento_sem_qr_nao_vira_folha_vazia(monkeypatch):
    """Conta de vendedor sem chave Pix devolve 201 e nenhum QR.

    Sem esta guarda a tela mostraria uma folha vazia e a pessoa ficaria
    esperando um código que nunca vem.
    """

    async def falso_chamar(metodo, caminho, corpo=None, *, chave=None):
        return {"id": "pay-1", "status": "pending"}

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    sessao = SessaoFalsa(retornos=["alguem@exemplo.com"], linhas=[None])

    with pytest.raises(RegraNegocio) as e:
        await pro.comprar(sessao, uuid4(), "mensal")  # type: ignore[arg-type]
    assert e.value.codigo == "PIX_INDISPONIVEL"
    assert sessao.commits == 0


def test_chave_de_idempotencia_e_estavel_na_janela():
    """Chave nova a cada chamada não protege de nada.

    Se o POST sai e a resposta se perde, não há linha local, a checagem de
    cobrança viva não acha nada, e a tentativa seguinte criaria uma segunda
    cobrança. A chave é (pessoa, período, janela) justamente para que o Mercado
    Pago devolva o mesmo pagamento.
    """
    alguem = uuid4()
    a = pro._chave_de_idempotencia(alguem, "mensal", 30)
    b = pro._chave_de_idempotencia(alguem, "mensal", 30)
    assert a == b
    # Período diferente é compra diferente.
    assert a != pro._chave_de_idempotencia(alguem, "anual", 30)
    # Pessoa diferente também.
    assert a != pro._chave_de_idempotencia(uuid4(), "mensal", 30)


def test_vencimento_sai_no_formato_que_o_provedor_aceita():
    """ISO 8601 com milissegundos e fuso explícito.

    Sem os milissegundos a recusa é um 400 com mensagem genérica, que é a mesma
    de outros seis erros e não diz qual campo está errado.
    """
    texto = mercado_pago._vencimento(30)
    assert texto.endswith("+00:00")
    assert ".000+" in texto
    quando = datetime.fromisoformat(texto)
    faltando = (quando - datetime.now(UTC)).total_seconds()
    assert 29 * 60 < faltando <= 30 * 60


async def test_sem_credencial_a_rota_recusa_com_503(monkeypatch):
    """Ambiente sem token: 503 com código próprio, não um 500 no meio da compra."""
    from app.routers import pro as roteador

    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")
    with pytest.raises(RegraNegocio) as e:
        roteador._exigir_ligada()
    assert e.value.codigo == "PAGAMENTO_INDISPONIVEL"
    assert e.value.status_code == 503


async def test_recusa_do_provedor_vira_erro_com_frase(monkeypatch):
    """O bug de 23/08, virado teste.

    Um 400 do Mercado Pago subia cru até o `ServerErrorMiddleware`, que responde
    por fora do `CORSMiddleware`: o navegador bloqueava a resposta e o PWA
    traduzia em "confira sua conexão". Recusa do provedor e rede caindo tinham a
    mesma cara.
    """

    async def falso_chamar(metodo, caminho, corpo=None, *, chave=None):
        raise mercado_pago.FalhaDoProvedor(400, '{"message":"User bad request"}')

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    sessao = SessaoFalsa(retornos=["alguem@exemplo.com"], linhas=[None])

    with pytest.raises(RegraNegocio) as e:
        await pro.comprar(sessao, uuid4(), "mensal")  # type: ignore[arg-type]
    assert e.value.codigo == "PAGAMENTO_INDISPONIVEL"
    assert e.value.status_code == 502


async def test_erro_de_rede_vira_falha_do_provedor(monkeypatch):
    """A borda: `aiohttp` não escapa de `mercado_pago.py`.

    Quem chama captura `FalhaDoProvedor` e não importa `aiohttp` — é o que
    mantém a promessa do cabeçalho do módulo. Se um dia uma exceção de rede
    voltar a vazar daqui, o `comprar` deixa de reconhecê-la e o bug de 23/08
    volta inteiro, com outra cara.
    """
    import aiohttp

    class SessaoQueNaoConecta:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def request(self, *a, **kw):
            raise aiohttp.ClientConnectionError("sem rota até o provedor")

    monkeypatch.setattr(aiohttp, "ClientSession", SessaoQueNaoConecta)
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-qualquer")

    with pytest.raises(mercado_pago.FalhaDoProvedor) as e:
        await mercado_pago.buscar_pagamento("pay-1")
    assert e.value.status is None


# --------------------------------------------------------------------- a queda


async def test_prazo_vencido_derruba_e_apara(monkeypatch):
    """O item 10 inteiro: cai para FREE e as ofertas que não cabem saem do ar.

    A ordem importa e está no SQL: `criado_em` crescente com `posicao > teto`
    deixa de pé as **mais antigas**. Derrubar essas para manter as de ontem seria
    desfazer o acervo em vez de aparar o excesso.
    """
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    caido = str(uuid4())

    sessao = SessaoFalsa(lista=[caido], linha={"user_id": caido, "quantas": 180})
    resultado = await pro.expirar_vencidos(sessao)  # type: ignore[arg-type]

    assert resultado == {"caidos": 1, "ofertas_desativadas": 180}

    apara = [s for s in sessao.sqls if "update listings" in s][0]
    assert "ativo = false" in apara
    assert "tipo = 'OFERTA'" in apara
    assert "order by criado_em" in apara
    assert "posicao > :teto" in apara
    # Nada é apagado, nunca.
    assert not any("delete from listings" in s for s in sessao.sqls)

    teto = limites.PLANOS["FREE"].max_ofertas
    assert [p for p in sessao.params if "teto" in p][0]["teto"] == teto


async def test_a_queda_avisa_quem_perdeu_oferta(monkeypatch):
    """Descobrir dias depois, ao abrir o app por outro motivo, é descobrir tarde.

    O aviso diz o número e a palavra que evita o susto: nada foi apagado.
    """
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    caido = str(uuid4())

    sessao = SessaoFalsa(lista=[caido], linha={"user_id": caido, "quantas": 3})
    await pro.expirar_vencidos(sessao)  # type: ignore[arg-type]

    aviso = [p for p in sessao.params if p.get("tipo") == "PLANO_EXPIROU"]
    assert len(aviso) == 1
    assert "Nada foi apagado" in aviso[0]["corpo"]
    assert "3 ofertas" in aviso[0]["corpo"]
    # O link leva ao acervo, que é onde se reativa — não à tela de preço.
    assert aviso[0]["link"] == "/minhas-cartas"


async def test_cobranca_desligada_nao_desativa_oferta_nenhuma(monkeypatch):
    """Mesmo portão de `_checar_teto_de_ofertas`, pelo mesmo motivo: ninguém está
    pagando, e derrubar oferta de quem nunca foi cobrado seria punir pelo que o
    app ainda não vende. Este teste quebra de propósito no dia da virada."""
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", False)

    sessao = SessaoFalsa(lista=[str(uuid4())], linha={"user_id": "x", "quantas": 9})
    resultado = await pro.expirar_vencidos(sessao)  # type: ignore[arg-type]

    assert resultado == {"caidos": 1, "ofertas_desativadas": 0}
    assert not any("update listings" in s for s in sessao.sqls)


async def test_sem_prazo_vencido_nao_toca_em_listings():
    sessao = SessaoFalsa(lista=[])
    resultado = await pro.expirar_vencidos(sessao)  # type: ignore[arg-type]
    assert resultado == {"caidos": 0, "ofertas_desativadas": 0}
    assert not any("update listings" in s for s in sessao.sqls)


# -------------------------------------------------------- a janela de renovação


async def test_a_janela_de_renovacao_e_decidida_no_servidor():
    """O botão de renovar não é conta da tela, e a janela é a mesma do aviso.

    Decisão do Eduardo em 2026-08-24: "Renovar com Pix" visível o ano inteiro
    para quem acabou de pagar é anúncio. Uma constante só governa as duas coisas
    — sem isso, o app manda "vence em 3 dias" e a tela de destino não oferece
    como pagar.

    A conta é feita no banco de propósito: o relógio do celular de quem usa o app
    erra, e um botão que aparece ou some conforme o horário errado da pessoa é
    pior que um botão fixo.
    """
    sessao = SessaoFalsa(linha={"plano": "PRO", "pode_renovar": True})
    resultado = await pro.situacao(sessao, uuid4())  # type: ignore[arg-type]

    assert resultado["pode_renovar"] is True

    consulta = sessao.sqls[0]
    assert "make_interval(days => :janela)" in consulta
    assert "plano = 'PRO'" in consulta
    assert sessao.params[0]["janela"] == pro.JANELA_DE_RENOVACAO_DIAS
    # A mesma constante do aviso — é o que mantém os dois em acordo.
    assert [p for p in sessao.params if "janela" in p][0][
        "janela"
    ] == pro.JANELA_DE_RENOVACAO_DIAS


async def test_quem_nao_tem_perfil_nao_pode_renovar():
    """`pode_renovar` precisa existir na resposta mesmo no caminho degenerado —
    ausente, o Pydantic cairia no default e a tela decidiria por conta própria."""
    sessao = SessaoFalsa(linha=None)
    resultado = await pro.situacao(sessao, uuid4())  # type: ignore[arg-type]
    assert resultado == {"plano": "FREE", "status": None, "pode_renovar": False}


async def test_esconder_o_botao_nao_fecha_a_rota(monkeypatch):
    """Fora da janela o botão some, mas quem quer pagar adiantado consegue.

    A intenção é não insistir com quem já pagou, não proibir quem quer pagar — e
    o crédito empilha a partir do fim do período atual de qualquer forma, então
    pagar cedo nunca custa dias a ninguém.
    """
    enviados = []

    async def falso_chamar(metodo, caminho, corpo=None, *, chave=None):
        enviados.append(caminho)
        return _pagamento()

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    sessao = SessaoFalsa(
        retornos=["alguem@exemplo.com"], linhas=[None, {"payment_id": "pay-1"}]
    )
    # Nenhuma checagem de janela no caminho da compra.
    await pro.comprar(sessao, uuid4(), "anual")  # type: ignore[arg-type]
    assert enviados == ["/v1/payments"]


# ------------------------------------------------------------------- o aviso


async def test_aviso_de_vencimento_diz_a_data():
    """A peça que o Pix avulso exige e a assinatura não exigia.

    "Seu plano está acabando" não deixa ninguém decidir nada. A pessoa precisa
    saber se paga hoje ou depois de amanhã.
    """
    alguem = str(uuid4())
    vence = datetime(2026, 9, 12, tzinfo=UTC)

    sessao = SessaoFalsa(
        todos=[{"user_id": alguem, "plano_expira_em": vence}], retornos=[None, 1]
    )
    resultado = await pro.avisar_vencimento(sessao)  # type: ignore[arg-type]

    assert resultado["vencendo"] == 1
    # O `corpo` separa a inserção da consulta de dedupe, que carrega o mesmo tipo.
    aviso = [
        p for p in sessao.params if p.get("tipo") == "PRO_VENCENDO" and "corpo" in p
    ]
    assert len(aviso) == 1
    assert "12/09" in aviso[0]["corpo"]
    # Aqui o caminho é comprar, não consertar o acervo — o link muda com isso.
    assert aviso[0]["link"] == "/planos"


async def test_aviso_de_vencimento_so_olha_o_pro_que_ainda_vale():
    """Quem já caiu recebe o outro aviso, e receber os dois é o app se
    contradizendo em duas notificações seguidas."""
    sessao = SessaoFalsa(todos=[])
    resultado = await pro.avisar_vencimento(sessao)  # type: ignore[arg-type]

    assert resultado == {"avisados": 0, "vencendo": 0}
    consulta = sessao.sqls[0]
    assert "plano = 'PRO'" in consulta
    assert "plano_expira_em > now()" in consulta
    assert "make_interval(days => :d)" in consulta


# ------------------------------------------------------------------ a fronteira


async def test_reconciliar_desligado_nao_toca_no_banco(monkeypatch):
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")
    sessao = SessaoFalsa()
    assert await pro.reconciliar(sessao) == {"desligado": 1}  # type: ignore[arg-type]
    assert sessao.sqls == []


def test_erro_de_negocio_responde_por_dentro_do_cors():
    """O que faltava na resposta de 23/08: o cabeçalho que o navegador exige.

    Este teste não é sobre o PRO — é sobre a diferença entre as duas saídas de
    erro do app. `RegraNegocio` tem handler registrado e sai por dentro do
    `CORSMiddleware`; exceção crua sai pelo `ServerErrorMiddleware`, que é mais
    externo, e chega ao navegador sem `access-control-allow-origin` — que é como
    uma recusa do provedor virou "confira sua conexão".

    Um 401 serve de sonda porque também vem de handler. Se um dia o CORS parar
    de cobrir as respostas de erro, todo erro do app volta a chegar no PWA como
    falha de rede.
    """
    origem = settings.cors_origins_list[0]

    resp = TestClient(app).post(
        "/v1/me/pro/pagamentos",
        json={"periodo": "mensal"},
        headers={"Origin": origem},
    )

    assert resp.status_code >= 400
    assert resp.headers.get("access-control-allow-origin") == origem
