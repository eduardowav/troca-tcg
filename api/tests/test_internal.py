"""Testes das rotas internas, as que só o cron chama.

Sem Postgres, como o resto da suíte: a sessão é uma dublê que devolve as linhas
combinadas e conta os commits. E um teste lê o `jobs.yml` de verdade — cron e API
são dois arquivos que ninguém abre junto, e é exatamente aí que a lista de jobs
desanda sem ninguém perceber.
"""

import inspect
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import get_session
from app.main import app
from app.services import matching

JOBS_YML = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "jobs.yml"

# Jobs que o cron já chama e a API ainda não tem — o `|| echo falhou` do workflow
# segura o 404 até lá. Encolhe a cada fase; quando esvaziar, some com o teste.
#
# `notify-wanted` saiu daqui quando as notificações entraram, e `triangular` saiu
# em 2026-08-12, quando o motor de ciclos ficou pronto — desligado por
# `TRIANGULAR_ATIVO` enquanto a tela de três pontas não existe, mas a rota
# responde. A lista está vazia, e é para ficar: rota que o cron chama e a API não
# tem é job que nunca roda.
PENDENTES: set[str] = set()


class SessaoFalsa:
    """Dublê de AsyncSession: entrega as linhas uma vez só e conta os commits."""

    def __init__(self, linhas=()):
        self._linhas = list(linhas)
        self.sqls: list[str] = []
        self.commits = 0

    async def execute(self, sql, _params=None):
        self.sqls.append(str(sql))
        linhas, self._linhas = self._linhas, []
        return type(
            "Res",
            (),
            {
                "mappings": lambda self: type("M", (), {"all": lambda self: linhas})(),
            },
        )()

    async def commit(self):
        self.commits += 1


@pytest.fixture
def sessao():
    """Duas trocas vencidas esperando a varredura."""
    falsa = SessaoFalsa([{"id": "match-1"}, {"id": "match-2"}])

    async def _dep():
        yield falsa

    app.dependency_overrides[get_session] = _dep
    yield falsa
    app.dependency_overrides.clear()


def _expirar(secret: str | None = None):
    headers = {} if secret is None else {"X-Job-Secret": secret}
    return TestClient(app).post("/v1/internal/jobs/expire", headers=headers)


# ------------------------------------------------------------------ o segredo


def test_segredo_errado_nao_roda_o_job(sessao):
    assert _expirar("nao-e-esse").status_code == 403
    assert sessao.commits == 0


def test_sem_header_nao_roda_o_job(sessao):
    """Sem o header o FastAPI barra na validação (422), não no 403 — o que
    importa é que o corpo do job não chega a rodar."""
    assert _expirar().status_code in (403, 422)
    assert sessao.commits == 0


def test_sync_catalog_tambem_e_protegido():
    """Rota com corpo: o segredo tem de barrar antes da validação do payload."""
    resp = TestClient(app).post(
        "/v1/internal/jobs/sync-catalog",
        json={"set_ids": ["sv03"]},
        headers={"X-Job-Secret": "nao-e-esse"},
    )
    assert resp.status_code == 403


# ------------------------------------------------------------------- o expire


def test_expire_devolve_quantas_venceram(sessao):
    resp = _expirar(settings.JOB_SECRET)
    assert resp.status_code == 200
    # A dublê entrega as linhas uma vez só: as duas trocas vencidas vão para o
    # `expirar_vencidos`, e a varredura de propostas que roda logo depois volta
    # vazia. É o suficiente para provar que as duas acontecem no mesmo job.
    assert resp.json() == {"expirados": 2, "propostas": 0}


def test_expire_varre_proposta_vencida_tambem(sessao):
    """72h de proposta vencem antes dos 7 dias do match, e proposta pendurada
    trava a dupla inteira — só existe uma negociação aberta por par."""
    _expirar(settings.JOB_SECRET)
    assert any("propostas set status = 'EXPIRADA'" in sql for sql in sessao.sqls)


def test_expire_registra_um_evento_por_troca(sessao):
    """O histórico é a única resposta para "aceitei e a troca sumiu do feed":
    sem a linha em match_events, a tela do usuário fica com um buraco."""
    _expirar(settings.JOB_SECRET)
    assert sum("match_events" in sql for sql in sessao.sqls) == 2


def test_expire_fecha_a_transacao(sessao):
    """`expirar_vencidos` não commita — ela também roda no meio do sincronizar.
    Sem o commit na rota, o job rodaria todo dia sem expirar nada."""
    _expirar(settings.JOB_SECRET)
    assert sessao.commits == 1


def test_expire_so_toca_no_que_alguem_respondeu():
    """Sugestão que ninguém abriu não vira EXPIRADO de propósito: a métrica-mãe
    é CONCLUIDO/(CONCLUIDO+FURADO+EXPIRADO), e contar toda sugestão ignorada
    como fracasso afogaria o sinal em ruído."""
    fonte = inspect.getsource(matching.expirar_vencidos)
    assert "status in ('PENDENTE', 'ACEITO')" in fonte
    assert "'SUGERIDO'" not in fonte


# ---------------------------------------------------------- cron × API


def _jobs_do_cron() -> set[str]:
    """Os nomes passados para a função `chamar` do workflow."""
    return set(re.findall(r"^\s*chamar (\S+)", JOBS_YML.read_text("utf-8"), re.M))


def _jobs_publicados() -> set[str]:
    prefixo = "/v1/internal/jobs/"
    return {
        caminho[len(prefixo) :]
        for caminho in app.openapi()["paths"]
        if caminho.startswith(prefixo)
    }


def test_cron_nao_chama_rota_que_nao_existe():
    """O workflow engole falha (`|| echo`), então um nome errado no curl passaria
    despercebido para sempre — o job simplesmente nunca rodaria."""
    desconhecidos = _jobs_do_cron() - _jobs_publicados() - PENDENTES
    assert not desconhecidos


def test_expire_esta_dos_dois_lados():
    assert "expire" in _jobs_do_cron()
    assert "expire" in _jobs_publicados()


def test_lista_de_pendentes_nao_apodrece():
    """Quando `triangular` ou `notify-wanted` entrarem, este teste quebra e
    obriga a tirá-los de PENDENTES — senão a lista viraria um curinga que
    esconde justamente o erro que o teste de cima procura."""
    assert PENDENTES.isdisjoint(_jobs_publicados())


def test_todo_job_do_cron_esta_previsto():
    """Nada de rota interna nova que o cron nunca aprendeu a chamar. O
    sync-catalog fica de fora porque é disparo manual — catálogo inteiro é
    pesado e não tem por que rodar sozinho todo dia."""
    assert _jobs_publicados() - _jobs_do_cron() == {"sync-catalog"}
