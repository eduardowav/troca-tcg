"""Testes da baixa de estoque na troca concluída — sem Postgres, como o resto.

O que custa caro errar aqui não é o SQL rodar: é **quando** ele roda. Baixar
estoque antes de a troca ter acontecido esconde carta que ainda existe, e baixar
duas vezes some com uma carta que a pessoa ainda tem. Os testes olham para essas
duas coisas, e para o que o SQL promete: os dois lados, a soma por unidade e o
piso zero.
"""

from uuid import uuid4

import pytest

from app.core.errors import RegraNegocio
from app.services import listings, matching, notificacoes


class SessaoFalsa:
    """Dublê: guarda os SQLs e devolve `scalar` na ordem combinada."""

    def __init__(self, escalares=None):
        self.escalares = list(escalares or [])
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})

        class Res:
            rowcount = 1

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.escalares.pop(0) if self.escalares else None

    async def commit(self):
        self.commits += 1


def sqls_de_baixa(sessao: SessaoFalsa) -> list[str]:
    return [s for s in sessao.sqls if "greatest(l.quantidade" in s]


# ------------------------------------------------------------------ o SQL


async def test_baixa_toca_os_dois_lados():
    sessao = SessaoFalsa()
    match = uuid4()
    await listings.baixar_por_troca(sessao, match)  # type: ignore[arg-type]

    baixas = sqls_de_baixa(sessao)
    assert len(baixas) == 2
    # Quem deu perde da OFERTA; quem recebeu perde da PROCURA. Uma sem a outra
    # deixaria metade do estoque mentindo.
    assert any("'OFERTA'" in s for s in baixas)
    assert any("'PROCURA'" in s for s in baixas)
    assert all(p.get("m") == str(match) for p in sessao.params)


async def test_baixa_conta_por_unidade_e_nao_por_carta():
    """Duas cópias da mesma carta na mesma troca descem duas unidades.

    É o motivo do `group by` com `count(*)`: um `update ... from` cru casaria a
    linha uma vez só, e a segunda cópia sairia de graça.
    """
    sessao = SessaoFalsa()
    await listings.baixar_por_troca(sessao, uuid4())  # type: ignore[arg-type]
    for sql in sqls_de_baixa(sessao):
        assert "count(*) as n" in sql
        assert "- s.n" in sql or "- a.n" in sql


async def test_baixa_nunca_grava_negativo_e_desativa_no_zero():
    sessao = SessaoFalsa()
    await listings.baixar_por_troca(sessao, uuid4())  # type: ignore[arg-type]
    for sql in sqls_de_baixa(sessao):
        assert "greatest(" in sql
        assert "then false" in sql


async def test_procura_aceita_acabamento_diferente():
    """A condição do Procuro é mínimo aceitável, não o que chegou.

    Casar por igualdade deixaria de baixar justamente as trocas que o
    `aceita_qualquer_finish` existe para permitir.
    """
    sessao = SessaoFalsa()
    await listings.baixar_por_troca(sessao, uuid4())  # type: ignore[arg-type]
    procura = next(s for s in sqls_de_baixa(sessao) if "'PROCURA'" in s)
    assert "aceita_qualquer_finish" in procura
    assert "l.condicao" not in procura


async def test_baixa_nao_faz_commit():
    """Ela vive ou morre com a conclusão que a chamou."""
    sessao = SessaoFalsa()
    await listings.baixar_por_troca(sessao, uuid4())  # type: ignore[arg-type]
    assert sessao.commits == 0


# ------------------------------------------------------------------ o momento


async def prepara(monkeypatch, faltam: int) -> SessaoFalsa:
    """Conclusão com `faltam` lados ainda por confirmar."""
    monkeypatch.setattr(matching, "obter_match", _match_qualquer)
    monkeypatch.setattr(notificacoes, "match_concluido", _nada)
    # 'ACEITO' para `_exigir_aceito`; depois a contagem de quem falta; depois o
    # outro participante, que aqui não interessa.
    return SessaoFalsa(escalares=["ACEITO", faltam, None])


async def _match_qualquer(*_args, **_kwargs):
    return "match"


async def _nada(*_args, **_kwargs):
    return None


async def test_um_lado_confirmando_nao_baixa_estoque(monkeypatch):
    """Metade da confirmação não é troca: a carta ainda está com os dois donos."""
    sessao = await prepara(monkeypatch, faltam=1)
    await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert sqls_de_baixa(sessao) == []


async def test_segundo_lado_confirmando_baixa(monkeypatch):
    sessao = await prepara(monkeypatch, faltam=0)
    await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert len(sqls_de_baixa(sessao)) == 2
    # E junto do que já acontecia: o match fecha e a reputação sobe.
    assert any("status = 'CONCLUIDO'" in s for s in sessao.sqls)
    assert any("trocas_concluidas + 1" in s for s in sessao.sqls)


async def test_conclusao_repetida_nao_baixa_de_novo(monkeypatch):
    """A segunda chamada esbarra no status: o match já não está em ACEITO.

    É esta guarda que torna a baixa idempotente sem precisar de marca própria —
    e é por isso que ela precisa de teste: quem mexer em `_exigir_aceito` amanhã
    está mexendo, sem saber, no estoque de todo mundo.
    """
    monkeypatch.setattr(matching, "obter_match", _match_qualquer)
    monkeypatch.setattr(notificacoes, "match_concluido", _nada)
    sessao = SessaoFalsa(escalares=["CONCLUIDO"])

    with pytest.raises(RegraNegocio) as e:
        await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]
    assert e.value.codigo == "MATCH_SEM_DESFECHO"
    assert sqls_de_baixa(sessao) == []
