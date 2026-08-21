"""Testes da cotação do dólar — sem Postgres e sem rede, como o resto da suíte.

O que custa caro errar aqui não é o número: é o que acontece quando o Banco
Central não responde. Uma falha que zerasse a linha tiraria o preço da tela de
todo mundo que escolheu ver em real, e por causa de indisponibilidade de
terceiro.
"""

from datetime import date

import httpx
import pytest

from app.services import cambio


class SessaoFalsa:
    def __init__(self) -> None:
        self.sqls: list[str] = []
        self.params: list[dict] = []

    async def execute(self, sql, params=None):
        self.sqls.append(" ".join(str(sql).split()))
        self.params.append(params or {})
        return type("Res", (), {"rowcount": 1})()


def _resposta(valor: float | None):
    """O corpo do Olinda: lista vazia em dia sem boletim."""
    return {"value": [{"cotacaoVenda": valor}] if valor is not None else []}


@pytest.fixture
def dia_fixo(monkeypatch):
    monkeypatch.setattr(cambio, "_hoje", lambda: date(2026, 8, 21))
    return date(2026, 8, 21)


async def test_guarda_a_cotacao_de_venda(monkeypatch, dia_fixo):
    """Venda, e não compra: o número serve para estimar quanto custaria repor a
    carta, e repor é comprar dólar."""

    async def falso(_cliente, dia):
        assert dia == dia_fixo
        return __import__("decimal").Decimal("5.1625")

    monkeypatch.setattr(cambio, "_buscar_no_bcb", falso)
    sessao = SessaoFalsa()

    resultado = await cambio.atualizar(sessao)  # type: ignore[arg-type]

    assert resultado["valor"] == pytest.approx(5.1625)
    assert resultado["referencia"] == "2026-08-21"
    assert any("insert into cotacoes" in sql for sql in sessao.sqls)
    assert sessao.params[-1]["moeda"] == "BRL"


async def test_anda_para_tras_ate_achar_boletim(monkeypatch, dia_fixo):
    """Sábado, domingo e feriado devolvem lista vazia. A data guardada é a da
    fonte, não a do dia em que o job rodou — é o que deixa a tela dizer que o
    câmbio é de sexta."""
    vistos: list[date] = []

    async def falso(_cliente, dia):
        vistos.append(dia)
        if dia == date(2026, 8, 19):
            return __import__("decimal").Decimal("5.20")
        return None

    monkeypatch.setattr(cambio, "_buscar_no_bcb", falso)
    sessao = SessaoFalsa()

    resultado = await cambio.atualizar(sessao)  # type: ignore[arg-type]

    assert vistos == [date(2026, 8, 21), date(2026, 8, 20), date(2026, 8, 19)]
    assert resultado["referencia"] == "2026-08-19"


async def test_rede_fora_mantem_o_valor_anterior(monkeypatch, dia_fixo):
    """Nada de escrita: a linha de ontem continua valendo. Zerar por não ter
    conseguido falar com o Banco Central tiraria o preço da tela de todo mundo."""

    async def explode(_cliente, _dia):
        raise httpx.ConnectError("sem rede")

    monkeypatch.setattr(cambio, "_buscar_no_bcb", explode)
    sessao = SessaoFalsa()

    assert await cambio.atualizar(sessao) == {"mantida": 1}  # type: ignore[arg-type]
    assert sessao.sqls == []


async def test_semana_inteira_sem_boletim_tambem_mantem(monkeypatch, dia_fixo):
    async def vazio(_cliente, _dia):
        return None

    monkeypatch.setattr(cambio, "_buscar_no_bcb", vazio)
    sessao = SessaoFalsa()

    assert await cambio.atualizar(sessao) == {"mantida": 1}  # type: ignore[arg-type]
    assert sessao.sqls == []


def test_o_corpo_vazio_do_olinda_vira_none():
    """Guarda o formato da fonte: `value: []` é como o Banco Central diz "não
    houve boletim", e ler isso como zero viraria dólar a R$ 0,00 na tela."""
    assert _resposta(None)["value"] == []
    assert _resposta(5.16)["value"][0]["cotacaoVenda"] == 5.16
