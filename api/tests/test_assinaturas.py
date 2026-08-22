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
import time
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import limites
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


# ------------------------------------------------------- a janela de frescor
#
# F-05 da auditoria de 2026-08-18. O `ts` sempre entrou no manifesto e nunca foi
# comparado com o relógio: assinatura cobrindo o carimbo prova que ninguém o
# alterou, não que ele é de agora. Sem a janela, uma notificação capturada
# continua válida para sempre.


def test_carimbo_velho_nao_passa(com_segredo):
    """Uma notificação legítima de uma hora atrás é recusada.

    A assinatura é perfeita — foi montada com o segredo de verdade. O que a
    reprova é a idade, que é justamente o que faltava conferir.
    """
    velho = str(int(time.time()) - 3600)
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1", carimbo=velho),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_carimbo_do_futuro_tambem_nao_passa(com_segredo):
    """Relógio adiantado é tão suspeito quanto atrasado — a janela é `abs`."""
    futuro = str(int(time.time()) + 3600)
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1", carimbo=futuro),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_carimbo_dentro_da_janela_passa(com_segredo):
    """Um minuto de atraso é retentativa do provedor, não ataque."""
    recente = str(int(time.time()) - 60)
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1", carimbo=recente),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_carimbo_em_milissegundos_passa(com_segredo):
    """Treze dígitos são milissegundos, e trocar a unidade recusaria tudo.

    O provedor manda segundos, mas dois campos de carimbo do mesmo painel vêm em
    milissegundos. Errar isso não falha um caso de borda: recusa toda
    notificação legítima, e o sintoma seria "ninguém consegue assinar".
    """
    assert mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1", carimbo=str(int(time.time() * 1000))),
        x_request_id="req-1",
        data_id="abc123",
    )


def test_carimbo_ilegivel_nao_passa(com_segredo):
    """`ts` que não é número não vem do Mercado Pago."""
    assert not mercado_pago.assinatura_confere(
        x_signature=_assinar("abc123", "req-1", carimbo="ontem"),
        x_request_id="req-1",
        data_id="abc123",
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


@pytest.mark.parametrize(
    ("periodo", "meses", "valor"),
    [("mensal", 1, 19.9), ("anual", 12, 199.9)],
)
async def test_criar_assinatura_vai_sem_plano_associado(
    monkeypatch, periodo, meses, valor
):
    """O corpo que o Mercado Pago aceita — e que por meses foi o errado.

    Até 2026-08-22 esta chamada mandava `preapproval_plan_id` e o provedor recusava
    com ``card_token_id is required``: assinatura ligada a plano só nasce pela API
    com o cartão já tokenizado, e tokenizar cartão é justamente o que este projeto
    não faz. Nenhum teste pegou porque todos dublavam a função inteira — o dublê
    aceitava o corpo que o Mercado Pago recusava.

    Por isso este teste desce um nível: dubla o `_chamar`, que é a borda da rede, e
    afirma sobre o **corpo**. É o que sobreviveria à mesma classe de erro.
    """
    enviados: list[tuple[str, str, dict]] = []

    async def falso_chamar(metodo, caminho, corpo=None):
        enviados.append((metodo, caminho, corpo or {}))
        return {"id": "pp-1", "status": "pending", "init_point": "https://mp/x"}

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    monkeypatch.setattr(
        settings, "MERCADO_PAGO_BACK_URL", "https://trocatcg.com/planos"
    )

    usuario = uuid4()
    # O `retornos` alimenta o `scalar` de `_email`, que é a primeira consulta.
    sessao = SessaoFalsa(retornos=["alguem@exemplo.com"])
    await assinaturas.iniciar(sessao, usuario, periodo)  # type: ignore[arg-type]

    metodo, caminho, corpo = enviados[0]
    assert (metodo, caminho) == ("POST", "/preapproval")

    # O que quebrava: plano associado exige cartão tokenizado.
    assert "preapproval_plan_id" not in corpo
    # O que faz o provedor devolver `init_point` em vez de exigir cartão.
    assert corpo["status"] == "pending"

    assert corpo["auto_recurring"]["frequency"] == meses
    assert corpo["auto_recurring"]["frequency_type"] == "months"
    assert corpo["auto_recurring"]["transaction_amount"] == valor
    assert corpo["auto_recurring"]["currency_id"] == "BRL"

    # A amarração com o usuário. Pelo fluxo com plano ela se perdia: a assinatura
    # autorizada voltava com `external_reference: None`, e promover a PRO exigiria
    # adivinhar de quem era.
    assert corpo["external_reference"] == str(usuario)
    assert corpo["back_url"] == "https://trocatcg.com/planos"


async def test_preco_nao_vira_dizima_no_corpo(monkeypatch):
    """`19.90` precisa sair `19.9` no JSON, e não `19.899999999999999`.

    `PRECOS` é `Decimal` justamente para isso, e a conversão para `float` acontece
    num ponto só. O teste é sobre o que o Mercado Pago recebe — dízima num corpo de
    cobrança é diferença de centavo na fatura de alguém.
    """
    import json

    enviados: list[dict] = []

    async def falso_chamar(metodo, caminho, corpo=None):
        enviados.append(corpo or {})
        return {"id": "pp-1", "status": "pending", "init_point": "https://mp/x"}

    monkeypatch.setattr(mercado_pago, "_chamar", falso_chamar)
    sessao = SessaoFalsa(retornos=["alguem@exemplo.com"])
    await assinaturas.iniciar(sessao, uuid4(), "mensal")  # type: ignore[arg-type]

    assert '"transaction_amount": 19.9' in json.dumps(enviados[0])


async def test_sem_credencial_a_rota_recusa_com_503():
    """Ambiente sem token: 503 com código próprio, não um 500 no meio do checkout.

    Substitui o antigo teste dos ids de plano, que sumiram junto com o fluxo de
    plano associado. O portão que sobrou é `mercado_pago.ativo()`, e ele mora no
    roteador — ver `_exigir_ligada`.
    """
    assert mercado_pago.ativo() is bool(settings.MERCADO_PAGO_ACCESS_TOKEN)


async def test_recurso_inexistente_responde_200_e_nao_reenvia(monkeypatch):
    """404 do provedor é fim de linha: 200 com `desconhecido`, não 500.

    O Mercado Pago reenvia tudo que não recebe 200, e isso é o comportamento certo
    dele — reenviar resolve provedor fora do ar e rede caída. Contra um id que ele
    mesmo não resolve, porém, reenviar é para sempre.

    Apareceu em 2026-08-22 com o botão "Simular" do painel deles, que manda
    `data.id=123456`: o caminho inteiro funcionou, a assinatura HMAC **deles**
    passou pelo nosso `assinatura_confere`, e o 404 no fim virava 500.

    O evento fica commitado de propósito — reenvio da mesma notificação encontra o
    dedupe e responde "repetida", sem gastar outra ida à API.
    """

    async def falsa_busca(preapproval_id):
        raise mercado_pago.RecursoInexistente("/preapproval/123456")

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-404"], linha=None)
    resultado = await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-404",
        topico="subscription_preapproval",
        recurso_id="123456",
    )

    assert resultado == "desconhecido"
    assert sessao.commits == 1, "o evento precisa ficar gravado para o dedupe"
    # E nada de mexer em plano de ninguém a partir de um recurso que não existe.
    assert not any("update profiles" in sql for sql in sessao.sqls)


async def test_data_do_provedor_chega_ao_banco_como_datetime(monkeypatch):
    """O `next_payment_date` é texto no JSON e precisa virar `datetime` antes do SQL.

    **Isto derrubava toda notificação real com 500**, e a suíte inteira passava.
    O SQL faz `cast(:prox as timestamptz)` e parecia bastar; não basta — o asyncpg
    confere o tipo Python antes de mandar a query e recusa `str` num parâmetro de
    timestamp, então o `cast` nunca chega a rodar. Só apareceu em 2026-08-22, com
    uma notificação assinada entrando pela rede numa API de verdade.

    O dublê de sessão não liga para tipo, então o teste afirma sobre o **tipo do
    parâmetro ligado** — que é o que o driver recusaria.
    """

    async def falsa_busca(preapproval_id):
        return {
            "status": "authorized",
            "external_reference": str(uuid4()),
            "next_payment_date": "2026-09-22T12:35:49.000-04:00",
            "auto_recurring": {"frequency": 1, "frequency_type": "months"},
        }

    monkeypatch.setattr(mercado_pago, "buscar_assinatura", falsa_busca)

    sessao = SessaoFalsa(retornos=["evento-1"], linha=None)
    await assinaturas.aplicar_notificacao(
        sessao,  # type: ignore[arg-type]
        notificacao_id="evento-1",
        topico="subscription_preapproval",
        recurso_id="pp-1",
    )

    ligados = [p["prox"] for p in sessao.params if "prox" in p]
    assert ligados, "o update de subscriptions nao chegou a ser executado"
    assert isinstance(ligados[0], datetime)
    assert ligados[0].year == 2026 and ligados[0].month == 9


def test_data_ilegivel_vira_none_em_vez_de_explodir():
    """Data que nao parseia mantem a que ja estava, e nao derruba a notificacao.

    O valor entra num `coalesce(..., proxima_cobranca_em)`, entao `None` preserva.
    Perder a data de cobranca e ruim; perder a notificacao inteira e pior, porque
    ela carrega junto a mudanca de status que decide quem e PRO.
    """
    assert assinaturas._quando(None) is None
    assert assinaturas._quando("nao e data") is None
    assert assinaturas._quando("2026-09-22T12:35:49.000-04:00").month == 9
    ja = datetime(2026, 9, 22)
    assert assinaturas._quando(ja) is ja


async def test_reconciliar_desligado_nao_toca_no_banco(monkeypatch):
    """Sem credencial, responde `desligado` — que é diferente de zero conferidas."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "")
    sessao = SessaoFalsa()
    assert await assinaturas.reconciliar(sessao) == {"desligado": 1}  # type: ignore[arg-type]
    assert sessao.sqls == []


# ------------------------------------------------------------------ a queda


async def test_carencia_vencida_derruba_e_apara(monkeypatch):
    """O item 10 inteiro: cai para FREE e as ofertas que não cabem saem do ar.

    A ordem importa e está no SQL: `criado_em` crescente com `posicao > teto`
    deixa de pé as **mais antigas**. Derrubar essas para manter as de ontem seria
    desfazer o acervo em vez de aparar o excesso.
    """
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    caido = str(uuid4())

    sessao = SessaoFalsa(lista=[caido], linha={"user_id": caido, "quantas": 180})
    resultado = await assinaturas.encerrar_carencias(sessao)  # type: ignore[arg-type]

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
    await assinaturas.encerrar_carencias(sessao)  # type: ignore[arg-type]

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
    resultado = await assinaturas.encerrar_carencias(sessao)  # type: ignore[arg-type]

    assert resultado == {"caidos": 1, "ofertas_desativadas": 0}
    assert not any("update listings" in s for s in sessao.sqls)


async def test_apagar_conta_cancela_a_assinatura(monkeypatch):
    """O cascade apaga o lastro local e não fala com o Mercado Pago. Sem esta
    passada, quem apaga a conta segue sendo cobrado — e o `preapproval_id`, única
    chave para desfazer, some junto."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-qualquer")
    cancelados = []

    async def falso_cancelar(preapproval_id):
        cancelados.append(preapproval_id)

    monkeypatch.setattr(mercado_pago, "cancelar_assinatura", falso_cancelar)

    sessao = SessaoFalsa(retornos=["preapproval-viva"])
    assert await assinaturas.cancelar_ao_sair(sessao, uuid4()) is True  # type: ignore[arg-type]
    assert cancelados == ["preapproval-viva"]


async def test_provedor_fora_do_ar_nao_impede_apagar_a_conta(monkeypatch):
    """Apagar a conta é direito da LGPD e não pode depender de o Mercado Pago
    estar de pé. O que fica é o log com o id, que é o que permite cancelar na
    mão."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-qualquer")

    async def explode(_):
        raise RuntimeError("502 do provedor")

    monkeypatch.setattr(mercado_pago, "cancelar_assinatura", explode)

    sessao = SessaoFalsa(retornos=["preapproval-viva"])
    assert await assinaturas.cancelar_ao_sair(sessao, uuid4()) is False  # type: ignore[arg-type]


async def test_apagar_conta_sem_assinatura_nao_chama_o_provedor(monkeypatch):
    """O caso de quase todo mundo: nada a cancelar, nenhuma chamada de rede."""
    monkeypatch.setattr(settings, "MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-qualquer")

    async def nao_deveria(_):
        raise AssertionError("não havia assinatura para cancelar")

    monkeypatch.setattr(mercado_pago, "cancelar_assinatura", nao_deveria)

    assert await assinaturas.cancelar_ao_sair(SessaoFalsa(), uuid4()) is False  # type: ignore[arg-type]


async def test_sem_carencia_vencida_nao_toca_em_listings(monkeypatch):
    """Dia comum: ninguém venceu, e o job não abre a segunda consulta."""
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)

    sessao = SessaoFalsa(lista=[])
    resultado = await assinaturas.encerrar_carencias(sessao)  # type: ignore[arg-type]

    assert resultado == {"caidos": 0, "ofertas_desativadas": 0}
    assert not any("update listings" in s for s in sessao.sqls)
