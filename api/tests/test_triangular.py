"""Testes do motor triangular — o grafo, sem banco e sem rede.

A detecção de ciclos é o único pedaço deste app em que um erro não aparece na
tela: ele aparece como uma sugestão que não fecha, ou como a mesma sugestão
chegando três vezes. Por isso os testes olham para as propriedades do grafo — o
trio contado uma vez só, a ordem do ciclo preservada, o teto por pessoa — e não
para o formato da saída.
"""

from app.core import limites
from app.core.config import settings
from app.services import triangular
from app.services.triangular import Aresta


def aresta(de, para, card="c", condicao="NM", finish=1, prioridade=2):
    return Aresta(
        de=de,
        para=para,
        card_id=f"{card}-{de}{para}",
        condicao=condicao,
        finish_id=finish,
        prioridade=prioridade,
    )


def trio():
    """O ciclo mínimo: A dá para B, B dá para C, C dá para A."""
    return [aresta("A", "B"), aresta("B", "C"), aresta("C", "A")]


# ------------------------------------------------------------------ o ciclo


def test_acha_o_triangulo():
    achados = triangular.detectar(trio())
    assert len(achados) == 1
    assert set(achados[0].ciclo) == {"A", "B", "C"}


def test_o_mesmo_trio_conta_uma_vez_so():
    """Visto de A, de B e de C é o mesmo negócio.

    Sem o conjunto como chave, a varredura gravaria três matches idênticos —
    um por ponto de partida.
    """
    assert len(triangular.detectar(trio())) == 1


def test_a_ordem_do_ciclo_e_preservada():
    """A posição diz quem dá para quem. Ordenar por id perderia a troca."""
    tri = triangular.detectar(trio())[0]
    a, b, c = tri.ciclo
    pares = {(i.de, i.para) for i in tri.itens}
    assert pares == {(a, b), (b, c), (c, a)}


def test_caminho_aberto_nao_e_triangulo():
    """A→B→C sem o C→A é fila, não ciclo: ninguém fecha nada."""
    assert triangular.detectar([aresta("A", "B"), aresta("B", "C")]) == []


def test_par_reciproco_nao_vira_triangulo():
    """A↔B é match direto e já é sugerido pelo motor de sempre."""
    assert triangular.detectar([aresta("A", "B"), aresta("B", "A")]) == []


def test_hash_independe_de_quem_comecou():
    assert triangular.hash_grupo(("A", "B", "C")) == triangular.hash_grupo(
        ("C", "A", "B")
    )


def test_hash_distingue_trios():
    assert triangular.hash_grupo(("A", "B", "C")) != triangular.hash_grupo(
        ("A", "B", "D")
    )


# ------------------------------------------------------------------ escolhas


def test_prefere_a_carta_em_melhor_condicao():
    """Condição antes de prioridade: carta muito querida que chega machucada
    frustra mais que a segunda da lista em Near Mint."""
    machucada = aresta("A", "B", card="x", condicao="HP", prioridade=3)
    boa = aresta("A", "B", card="y", condicao="NM", prioridade=1)
    assert triangular.melhor_aresta([machucada, boa]) is boa


def test_desempate_e_estavel():
    """Mesmo grafo, mesmo triângulo — em duas execuções e em duas máquinas."""
    a = aresta("A", "B", card="1")
    b = aresta("A", "B", card="2")
    assert triangular.melhor_aresta([a, b]) is triangular.melhor_aresta([b, a])


def test_teto_por_pessoa_fica_com_os_melhores():
    """O corte é aplicado depois da ordenação por score.

    Aplicado durante a varredura, quem aparecesse primeiro no laço tomaria as
    vagas com os triângulos que vieram antes, não com os melhores.
    """
    arestas = [
        # Trio fraco com A (score 3)
        aresta("A", "B", prioridade=1),
        aresta("B", "C", prioridade=1),
        aresta("C", "A", prioridade=1),
        # Trio forte com A (score 9)
        aresta("A", "D", prioridade=3),
        aresta("D", "E", prioridade=3),
        aresta("E", "A", prioridade=3),
    ]
    achados = triangular.detectar(arestas, max_por_usuario=1)
    assert len(achados) == 1
    assert achados[0].score == 9


def test_score_soma_as_prioridades_das_tres_pontas():
    tri = triangular.detectar(
        [
            aresta("A", "B", prioridade=3),
            aresta("B", "C", prioridade=2),
            aresta("C", "A", prioridade=1),
        ]
    )[0]
    assert tri.score == 6


# ------------------------------------------------------------------ o portão


def test_triangular_e_do_pro_quando_a_cobranca_ligar(monkeypatch):
    monkeypatch.setattr(limites, "COBRANCA_ATIVA", True)
    assert triangular._planos_com_triangular() == ["PRO"]


def test_portao_fechado_agora_que_a_cobranca_esta_ligada():
    """Invertido em 2026-08-22, quando `COBRANCA_ATIVA` virou para o lançamento.

    Ele afirmava que os dois planos entravam no triangular, porque
    `plano_vigente()` devolvia PRO para todo mundo. Agora só o PRO entra — que é
    o que a tabela de planos promete vender.
    """
    assert limites.COBRANCA_ATIVA is True
    assert set(triangular._planos_com_triangular()) == {"PRO"}


# ------------------------------------------------------------------ desligado


class SessaoFalsa:
    def __init__(self):
        self.sqls: list[str] = []

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        raise AssertionError("desligado não pode tocar no banco")


async def test_desligado_nao_toca_no_banco():
    """A tela de três pontas ainda não existe; o motor fica pronto e quieto."""
    assert settings.TRIANGULAR_ATIVO is False
    resultado = await triangular.recalcular(SessaoFalsa())  # type: ignore[arg-type]
    assert resultado["desligado"] == 1
    assert resultado["novos"] == 0


def test_arestas_respeitam_estoque_bloqueio_e_plano():
    sql = str(triangular._ARESTAS)
    assert "o.quantidade > 0" in sql
    assert "dono.bloqueado = false" in sql
    assert "quer.bloqueado = false" in sql
    assert "dono.plano = any(:planos)" in sql
    assert "quer.plano = any(:planos)" in sql
