"""Testes de perfil público e denúncia — sem Postgres, como o resto da suíte.

Onde o serviço tem regra própria (normalizar o @, traduzir a violação de índice,
recusar match alheio), a sessão é substituída por uma dublê que registra o SQL e
os parâmetros. É mais do que espiar o código-fonte: exercita o caminho de
verdade, inclusive o `except`.
"""

import inspect
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.core.errors import RegraNegocio
from app.main import app
from app.schemas.profile import PerfilOut, PerfilPublicoOut
from app.schemas.report import DenunciaCriar, Motivo
from app.services import profiles, reports

DDL_DENUNCIAS = (
    Path(__file__).resolve().parents[2] / "db" / "schema" / "22_denuncias.sql"
)


class SessaoFalsa:
    """Dublê de AsyncSession: guarda o que foi pedido, devolve o combinado."""

    def __init__(self, *, linha=None, escalar=None, erro=None):
        self._linha = linha
        self._escalar = escalar
        self._erro = erro
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        if self._erro is not None:
            raise self._erro
        linha = self._linha
        return type(
            "Res",
            (),
            {"mappings": lambda self: type("M", (), {"first": lambda self: linha})()},
        )()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self._escalar

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def _erro_de_indice(nome: str) -> IntegrityError:
    return IntegrityError("insert", {}, Exception(f'duplicate key value ... "{nome}"'))


# ---------------------------------------------------------------- perfil público


def test_perfil_publico_nao_tem_onde_guardar_contato():
    """A mesma regra do feed de matches: quem não tem o campo não vaza o campo."""
    assert "contato_visivel" not in PerfilPublicoOut.model_fields
    propriedades = app.openapi()["components"]["schemas"]["PerfilPublicoOut"][
        "properties"
    ]
    assert not [c for c in propriedades if "contato" in c]


def test_perfil_publico_nao_expoe_estado_da_conta():
    """`plano` e `onboarding_ok` dizem respeito à conta, não a quem a pessoa é."""
    assert "plano" not in PerfilPublicoOut.model_fields
    assert "onboarding_ok" not in PerfilPublicoOut.model_fields
    # `parceiro` entrou em 2026-08-22 e cai na mesma regra: que alguém tem o PRO
    # de cortesia é assunto da conta, e no perfil público seria dizer a estranhos
    # quem tem acordo comercial com o app.
    assert "parceiro" not in PerfilPublicoOut.model_fields


def test_parceiro_e_booleano_e_o_motivo_nunca_sai():
    """A API diz *que* alguém é parceiro, nunca *por quê*.

    `parceiro_motivo` é o acordo — "loja tal, patrocínio fechado em 03/2026" — e
    é registro de quem administra. A tela precisa do booleano para não oferecer
    assinatura a quem já tem tudo e não pode cancelar nada; o texto não tem
    destinatário do lado do cliente.

    O teste olha o contrato servido, e não só o modelo: é o `openapi()` que diz o
    que de fato sai pela rede.
    """
    assert PerfilOut.model_fields["parceiro"].annotation is bool
    propriedades = app.openapi()["components"]["schemas"]["PerfilOut"]["properties"]
    assert "parceiro" in propriedades
    assert not [c for c in propriedades if "motivo" in c]


def test_me_estende_o_publico_e_nao_o_contrario():
    """A herança é a garantia estrutural.

    Se `PerfilPublicoOut` herdasse de `PerfilOut`, todo campo privado novo
    nasceria público e dependeria de alguém lembrar de removê-lo. Nesta direção,
    o público só cresce quando alguém escreve nele.
    """
    assert issubclass(PerfilOut, PerfilPublicoOut)
    assert not issubclass(PerfilPublicoOut, PerfilOut)


def test_me_continua_com_o_contato_do_dono():
    """A separação não pode ter custado a edição do próprio contato."""
    assert "contato_visivel" in PerfilOut.model_fields


async def test_perfil_publico_normaliza_o_arroba():
    """@s são gravados em minúsculas; um link com "Eduardo" tem de achar."""
    sessao = SessaoFalsa(linha=None)
    assert await profiles.perfil_publico(sessao, "  Eduardo_01  ") is None
    assert sessao.params[0]["u"] == "eduardo_01"


async def test_perfil_publico_ignora_quem_esta_bloqueado():
    """Mesmo filtro do matcher: um perfil navegável seria a brecha por onde
    quem foi bloqueado voltaria a ser encontrado."""
    sessao = SessaoFalsa(linha=None)
    await profiles.perfil_publico(sessao, "alguem")
    assert "bloqueado = false" in sessao.sqls[0]


async def test_perfil_publico_calcula_reputacao():
    sessao = SessaoFalsa(
        linha={
            "id": str(uuid4()),
            "username": "alguem",
            "nome_exibicao": "Alguém",
            "cidade": "Belém",
            "bairro": None,
            "avatar_url": None,
            "bio": None,
            "trocas_concluidas": 3,
            "trocas_furadas": 1,
            "trocas_desistidas": 2,
            "desde": "2026-01-01T00:00:00+00:00",
        }
    )
    perfil = await profiles.perfil_publico(sessao, "alguem")
    assert perfil is not None
    assert perfil.reputacao == 75
    # Desistência fica fora da razão, mas aparece: é lida por quem vai marcar
    # um encontro. Ver services/matching.registrar_desistencia.
    assert perfil.trocas_desistidas == 2


def test_perfil_publico_esta_publicado_e_exige_autenticacao():
    """Aberto, o endpoint entregaria a base de usuários a quem itera @s."""
    assert "/v1/u/{username}" in app.openapi()["paths"]
    assert TestClient(app).get("/v1/u/alguem").status_code in (401, 403)


def test_desde_sai_em_iso_8601():
    """`::text` do Postgres quebra no Safari do iOS — ver test_matching."""
    schemas = app.openapi()["components"]["schemas"]
    for schema in ("PerfilPublicoOut", "PerfilOut"):
        assert schemas[schema]["properties"]["desde"]["format"] == "date-time"


# ---------------------------------------------------------------------- denúncia


def test_denuncia_nao_deixa_o_cliente_escolher_o_denunciado():
    """O denunciado sai do match, não do corpo: com um id no corpo, participar
    de um match qualquer viraria licença para denunciar terceiros."""
    assert "denunciado_id" not in DenunciaCriar.model_fields
    assert set(DenunciaCriar.model_fields) == {"motivo", "descricao"}


def test_motivos_da_api_sao_os_mesmos_do_banco():
    """A lista vive em dois lugares (Literal e check). Divergir significaria
    422 no cliente para um motivo válido, ou 500 no insert para um inválido."""
    ddl = DDL_DENUNCIAS.read_text(encoding="utf-8")
    for motivo in Motivo.__args__:
        assert f"'{motivo}'" in ddl, f"{motivo} não está no check do 22_denuncias"


def test_motivo_invalido_e_recusado():
    with pytest.raises(ValidationError):
        DenunciaCriar(motivo="NAO_GOSTEI")


def test_descricao_em_branco_vira_ausente():
    assert DenunciaCriar(motivo="OUTRO", descricao="   ").descricao is None
    assert DenunciaCriar(motivo="OUTRO").descricao is None


def test_denuncia_nao_mexe_na_reputacao_de_ninguem():
    """A decisão de produto vive aqui: denunciar não derruba número de ninguém.

    Reputação sobe e desce pelos desfechos do match, que exigem os dois lados.
    Se um clique unilateral mexesse nela, a denúncia viraria arma.
    """
    fonte = inspect.getsource(reports.denunciar)
    assert "trocas_furadas" not in fonte
    assert "trocas_concluidas" not in fonte
    assert "trocas_desistidas" not in fonte
    assert "bloqueado" not in fonte


async def test_denuncia_de_match_alheio_da_404():
    """404 e não 403: para quem não participa, a troca não existe."""
    sessao = SessaoFalsa(escalar=None)
    with pytest.raises(RegraNegocio) as e:
        await reports.denunciar(
            sessao, uuid4(), uuid4(), DenunciaCriar(motivo="CONDUTA")
        )
    assert e.value.codigo == "MATCH_NAO_ENCONTRADO"
    assert e.value.status_code == 404


async def test_denuncia_repetida_vira_recado_e_nao_erro():
    """O segundo clique é alguém em dúvida se o primeiro funcionou."""
    sessao = SessaoFalsa(
        escalar=str(uuid4()), erro=_erro_de_indice("idx_denuncia_uma_por_troca")
    )
    with pytest.raises(RegraNegocio) as e:
        await reports.denunciar(
            sessao, uuid4(), uuid4(), DenunciaCriar(motivo="NAO_APARECEU")
        )
    assert e.value.codigo == "DENUNCIA_JA_ENVIADA"
    assert e.value.status_code == 409
    assert sessao.rollbacks == 1


async def test_outra_violacao_de_integridade_nao_vira_denuncia_duplicada():
    """Traduzir tudo para 409 esconderia bug: uma FK quebrada não é repetição."""
    sessao = SessaoFalsa(
        escalar=str(uuid4()), erro=_erro_de_indice("user_reports_match_id_fkey")
    )
    with pytest.raises(IntegrityError):
        await reports.denunciar(
            sessao, uuid4(), uuid4(), DenunciaCriar(motivo="CONDUTA")
        )


async def test_denuncia_grava_o_outro_participante():
    outro = str(uuid4())
    criado = "2026-08-06T12:00:00+00:00"
    sessao = SessaoFalsa(
        escalar=outro,
        linha={"id": str(uuid4()), "motivo": "CARTA_DIFERENTE", "criado_em": criado},
    )
    saida = await reports.denunciar(
        sessao,
        uuid4(),
        uuid4(),
        DenunciaCriar(motivo="CARTA_DIFERENTE", descricao="  veio LP  "),
    )
    assert saida.motivo == "CARTA_DIFERENTE"
    assert sessao.params[-1]["denunciado"] == outro
    assert sessao.params[-1]["descricao"] == "veio LP"
    assert sessao.commits == 1


def test_denuncia_esta_publicada_e_exige_autenticacao():
    assert "/v1/me/matches/{match_id}/denunciar" in app.openapi()["paths"]
    resp = TestClient(app).post(
        f"/v1/me/matches/{uuid4()}/denunciar", json={"motivo": "CONDUTA"}
    )
    assert resp.status_code in (401, 403)


def test_recibo_da_denuncia_nao_promete_desfecho():
    """Prometer resultado numa resposta HTTP é prometer o que uma pessoa lendo
    denúncias não cumpre em milissegundos."""
    props = app.openapi()["components"]["schemas"]["DenunciaOut"]["properties"]
    assert set(props) == {"id", "motivo", "criado_em"}
