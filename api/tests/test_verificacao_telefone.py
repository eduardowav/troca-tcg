"""Testes da verificação de número — sem Postgres e sem rede, como o resto.

O recurso está desligado no app, e é justamente por isso que ele precisa de
teste agora: o dia de ligar tem de ser uma linha de ambiente, não uma
redescoberta de como a regra funcionava. O que se prova aqui é o que custa caro
errar — que o código não é gravado em claro, que ele expira, que a força bruta
esbarra num teto, que o reenvio tem espera e que o número é sempre normalizado
antes de contar limite.

O envio em si é da Cloud API da Meta e depende de rede; o que fica aqui é a
decisão de mandar.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.main import app
from app.services import verificacao_telefone as vt
from app.services import whatsapp


class SessaoFalsa:
    """Dublê no espírito do test_push: guarda os SQLs e devolve o combinado.

    `retornos` é consumido em ordem por `scalar`; `linha` é o que o `mappings()`
    devolve. Nenhum teste aqui depende de SQL de verdade — o que se verifica é a
    regra, e os SQLs ficam visíveis para o teste conferir quando importa.
    """

    def __init__(self, retornos=None, linha=None):
        self.retornos = list(retornos or [])
        self.linha = linha
        self.sqls: list[str] = []
        self.params: list[dict] = []

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        linha = self.linha
        retornos = self.retornos

        class Res:
            def scalar(self):
                return retornos.pop(0) if retornos else None

            def mappings(self):
                class M:
                    def first(self_inner):
                        return linha

                return M()

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.retornos.pop(0) if self.retornos else None


def agora():
    return datetime.now(UTC)


# ------------------------------------------------------------------ normalização


def test_normaliza_formatos_para_o_mesmo_numero():
    # Três jeitos de escrever o mesmo telefone. Se algum escapasse, o teto
    # diário se contornaria trocando parêntese por espaço.
    assert vt.normalizar("(91) 98765-4321") == "91987654321"
    assert vt.normalizar("91 98765 4321") == "91987654321"
    assert vt.normalizar("+55 (91) 98765-4321") == "91987654321"
    # Fixo de 10 dígitos continua válido: nem todo mundo tem WhatsApp em celular.
    assert vt.normalizar("(91) 3241-0000") == "9132410000"


def test_numero_curto_e_recusado_com_campo():
    with pytest.raises(RegraNegocio) as e:
        vt.normalizar("98765-4321")
    assert e.value.codigo == "TELEFONE_INVALIDO"
    assert e.value.campo == "telefone"


# ------------------------------------------------------------------ o código


def test_codigo_tem_seis_digitos_e_varia():
    codigos = {vt._gerar_codigo() for _ in range(50)}
    assert all(len(c) == vt.DIGITOS and c.isdigit() for c in codigos)
    # Não é prova de aleatoriedade — é prova de que não há constante disfarçada.
    assert len(codigos) > 1


async def test_solicitar_grava_hash_e_nunca_o_codigo(monkeypatch):
    enviados: list[tuple[str, str]] = []

    async def falso_envio(telefone, codigo):
        enviados.append((telefone, codigo))
        return "registrado_no_log"

    monkeypatch.setattr(whatsapp, "enviar_codigo", falso_envio)

    sessao = SessaoFalsa(retornos=[None, 0])  # sem envio anterior, zero hoje
    saida = await vt.solicitar(sessao, uuid4(), "(91) 98765-4321")  # type: ignore[arg-type]

    assert len(enviados) == 1
    telefone, codigo = enviados[0]
    assert telefone == "91987654321"

    gravado = sessao.params[-1]
    assert gravado["tel"] == "91987654321"
    assert gravado["hash"] == vt._hash(codigo)
    # O código em claro não pode estar em parâmetro nenhum do insert.
    assert codigo not in str(gravado)
    assert saida["expira_em"] > agora()


async def test_envio_falho_derruba_o_pedido(monkeypatch):
    """Sem mensagem entregue, o código gravado tem de morrer com a transação.

    Quem chama é o `get_session`, que só faz commit no fim da requisição — então
    aqui basta o erro subir. Se ele fosse engolido, o teto diário do número
    ficaria consumido por uma mensagem que ninguém recebeu.
    """

    async def envio_quebrado(telefone, codigo):
        raise RuntimeError("graph.facebook.com fora do ar")

    monkeypatch.setattr(whatsapp, "enviar_codigo", envio_quebrado)

    with pytest.raises(RuntimeError):
        await vt.solicitar(SessaoFalsa(retornos=[None, 0]), uuid4(), "91987654321")  # type: ignore[arg-type]


# ------------------------------------------------------------------ os limites


async def test_reenvio_antes_da_espera_e_recusado():
    recente = agora() - timedelta(seconds=10)
    with pytest.raises(RegraNegocio) as e:
        await vt.solicitar(SessaoFalsa(retornos=[recente]), uuid4(), "91987654321")  # type: ignore[arg-type]
    assert e.value.codigo == "AGUARDE_PARA_REENVIAR"
    assert e.value.status_code == 429


async def test_teto_diario_por_numero():
    antigo = agora() - timedelta(minutes=30)
    sessao = SessaoFalsa(retornos=[antigo, vt.ENVIOS_POR_DIA])
    with pytest.raises(RegraNegocio) as e:
        await vt.solicitar(sessao, uuid4(), "91987654321")  # type: ignore[arg-type]
    assert e.value.codigo == "LIMITE_DE_CODIGOS"
    # O teto conta por telefone, não por conta: criar conta é de graça.
    assert sessao.params[1]["tel"] == "91987654321"


# ------------------------------------------------------------------ conferência


def linha_de(codigo="123456", **troca):
    base = {
        "id": uuid4(),
        "telefone": "91987654321",
        "codigo_hash": vt._hash(codigo),
        "expira_em": agora() + timedelta(minutes=5),
        "tentativas": 0,
    }
    base.update(troca)
    return base


async def test_confirmar_carimba_o_perfil():
    sessao = SessaoFalsa(linha=linha_de("123456"))
    quando = await vt.confirmar(sessao, uuid4(), "123456")  # type: ignore[arg-type]

    assert quando <= agora()
    atualizacao = sessao.params[-1]
    # O número verificado vira o do perfil, já no formato que o app exibe.
    assert atualizacao["tel"] == "(91) 98765-4321"
    assert "contato_verificado_em" in sessao.sqls[-1]


async def test_codigo_errado_conta_tentativa():
    sessao = SessaoFalsa(linha=linha_de("123456"))
    with pytest.raises(RegraNegocio) as e:
        await vt.confirmar(sessao, uuid4(), "000000")  # type: ignore[arg-type]
    assert e.value.codigo == "CODIGO_INCORRETO"
    # A contagem sobe mesmo com a resposta sendo erro — é ela que fecha a porta
    # da força bruta, e ela não pode depender de o cliente colaborar.
    assert "tentativas = tentativas + 1" in sessao.sqls[-1]


async def test_codigo_expirado_nao_confere():
    sessao = SessaoFalsa(linha=linha_de(expira_em=agora() - timedelta(seconds=1)))
    with pytest.raises(RegraNegocio) as e:
        await vt.confirmar(sessao, uuid4(), "123456")  # type: ignore[arg-type]
    assert e.value.codigo == "CODIGO_EXPIRADO"


async def test_tentativas_esgotadas_matam_o_codigo():
    sessao = SessaoFalsa(linha=linha_de(tentativas=vt.TENTATIVAS_MAX))
    with pytest.raises(RegraNegocio) as e:
        await vt.confirmar(sessao, uuid4(), "123456")  # type: ignore[arg-type]
    assert e.value.codigo == "CODIGO_BLOQUEADO"


async def test_confirmar_sem_pedido_e_404():
    with pytest.raises(RegraNegocio) as e:
        await vt.confirmar(SessaoFalsa(linha=None), uuid4(), "123456")  # type: ignore[arg-type]
    assert e.value.codigo == "CODIGO_NAO_SOLICITADO"
    assert e.value.status_code == 404


# ------------------------------------------------------------------ desligado


def test_whatsapp_desligado_sem_credencial(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_TOKEN", "")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_ID", "")
    assert whatsapp.ativo() is False


def test_log_nao_mostra_o_numero_inteiro():
    assert whatsapp._mascarar("91987654321") == "91*****4321"


def test_rotas_exigem_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/telefone").status_code in (401, 403)
    for caminho, corpo in (
        ("/v1/me/telefone/codigo", {"telefone": "91987654321"}),
        ("/v1/me/telefone/confirmar", {"codigo": "123456"}),
    ):
        # A trava de autenticação vem antes do 503 do interruptor: sem sessão
        # não se descobre nem que o recurso existe.
        assert client.post(caminho, json=corpo).status_code in (401, 403), caminho
