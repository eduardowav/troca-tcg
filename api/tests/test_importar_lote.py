"""Testes do cadastro em massa — o portão do PRO e o que ele não pode fechar.

O risco desta funcionalidade não é ela falhar: é ela travar o que não devia. O
`bulk` do onboarding e o `importar` da lista colada compartilham quase tudo, e
confundir os dois fecharia a porta de entrada do app para quem não paga. Metade
dos testes daqui existe para isso.
"""

from uuid import uuid4

import pytest

from app.core import limites
from app.core.errors import RegraNegocio
from app.schemas.listing import AnuncioItem
from app.services import listings


class SessaoFalsa:
    def __init__(self, plano="FREE"):
        self.plano = plano
        self.sqls: list[str] = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))

        class Res:
            rowcount = 1

            def mappings(self):
                class M:
                    def first(self_inner):
                        return {"plano": "FREE", "ofertas": 1}

                return M()

            def first(self):
                return None

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        return self.plano

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def item(tipo="OFERTA"):
    return AnuncioItem(card_id=uuid4(), tipo=tipo, finish_id=1)


async def sem_acabamentos(monkeypatch, quantos=1):
    """O resolvedor de acabamentos fala com o catálogo; aqui ele é constante."""

    async def resolver(_session, pares):
        return [1 for _ in pares]

    monkeypatch.setattr(listings, "_resolver_acabamentos", resolver)


# ------------------------------------------------------------------ o portão


async def test_free_nao_cola_lista(monkeypatch):
    """Com a cobrança ligada, o FREE bate no portão — e a mensagem tem saída."""
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    await sem_acabamentos(monkeypatch)

    with pytest.raises(RegraNegocio) as e:
        await listings.importar_lote(SessaoFalsa("FREE"), uuid4(), [item()])  # type: ignore[arg-type]
    assert e.value.codigo == "RECURSO_DO_PRO"
    assert e.value.status_code == 402
    # A frase diz o que ainda dá para fazer. Muro sem saída é pedágio.
    assert "carta por carta" in e.value.mensagem


async def test_pro_cola_lista(monkeypatch):
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    await sem_acabamentos(monkeypatch)

    sessao = SessaoFalsa("PRO")
    assert await listings.importar_lote(sessao, uuid4(), [item()]) == 1  # type: ignore[arg-type]
    assert sessao.commits == 1


async def test_portao_fechado_agora_que_a_cobranca_esta_ligada(monkeypatch):
    """Invertido em 2026-08-22, quando `COBRANCA_ATIVA` virou para o lançamento.

    Ele afirmava que o FREE passava, porque `plano_vigente()` devolvia PRO para
    todo mundo enquanto ninguém pagava — e quebrar no dia da virada era o serviço
    que ele prestava: ligar a chave tinha de ser decisão, nunca efeito colateral.

    Agora prova a outra metade: colar a lista de uma vez é do PRO, e o FREE leva
    402 com o código que a tela sabe traduzir. **O onboarding não passa por aqui**
    — `criar_bulk` é outro caminho, e travá-lo por plano fecharia a porta da
    frente do app.
    """
    assert limites.COBRANCA_ATIVA is True
    await sem_acabamentos(monkeypatch)

    sessao = SessaoFalsa("FREE")
    with pytest.raises(RegraNegocio) as e:
        await listings.importar_lote(sessao, uuid4(), [item()])  # type: ignore[arg-type]
    assert e.value.codigo == "RECURSO_DO_PRO"
    assert e.value.status_code == 402


# ------------------------------------------------------------------ o que ele não fecha


async def test_importar_nao_mexe_no_onboarding(monkeypatch):
    """`onboarding_ok` é do `criar_bulk`. Quem cola lista já entrou."""
    await sem_acabamentos(monkeypatch)
    sessao = SessaoFalsa("PRO")
    await listings.importar_lote(sessao, uuid4(), [item()])  # type: ignore[arg-type]
    assert not any("onboarding_ok" in s for s in sessao.sqls)


async def test_onboarding_nao_passa_pelo_portao(monkeypatch):
    """O `bulk` continua livre com a cobrança ligada e conta FREE.

    É a porta de entrada do app: toda conta nova passa por ela, e travá-la por
    plano seria cobrar para começar a usar.
    """
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    await sem_acabamentos(monkeypatch)

    sessao = SessaoFalsa("FREE")
    assert await listings.criar_bulk(sessao, uuid4(), [item()]) == 1  # type: ignore[arg-type]
    assert any("onboarding_ok" in s for s in sessao.sqls)


async def test_teto_de_ofertas_continua_valendo(monkeypatch):
    """O portão é sobre trabalho; quantas cartas cabem é o teto, e ele fica.

    Só OFERTA aciona a conferência — Procura é ilimitada nos dois planos.
    """
    await sem_acabamentos(monkeypatch)

    sessao = SessaoFalsa("PRO")
    await listings.importar_lote(sessao, uuid4(), [item("OFERTA")])  # type: ignore[arg-type]
    assert any("plano" in s and "ofertas" in s for s in sessao.sqls)

    so_procura = SessaoFalsa("PRO")
    await listings.importar_lote(so_procura, uuid4(), [item("PROCURA")])  # type: ignore[arg-type]
    assert not any("ofertas" in s for s in so_procura.sqls)
