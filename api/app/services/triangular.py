"""Match triangular — a troca que fecha em três, quando não fecha em dois.

**A** dá para **B**, **B** dá para **C**, **C** dá para **A**. Nenhum dos três
pares se resolve sozinho: é a troca que o motor direto nunca vai sugerir, e é o
carro-chefe do PRO (seção 16) porque nenhum grupo de WhatsApp consegue enxergar
isso na mão.

**Construído e desligado.** O motor está aqui, testado e chamado pelo cron —
mas `TRIANGULAR_ATIVO` nasce falso, e enquanto for falso o job não grava nada. O
motivo não é o motor: é a tela. Toda a interface de troca deste app é escrita
para duas pessoas e duas cartas (`ParDeCartas`, "você recebe / você dá"), e um
match de três participantes chegaria nela como uma troca torta, com a carta de
alguém que não aparece em lugar nenhum. Ligar sem a tela seria estrear o
carro-chefe quebrado.

**Por que Python e não SQL.** Em SQL seria um auto-join triplo com produto
cartesiano no meio. Aqui as arestas viram listas de adjacência e a varredura é
proporcional ao número de arestas, não ao cubo dos usuários. Ver seção 9.2.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limites import limites_de, plano_vigente
from app.services import notificacoes

logger = logging.getLogger(__name__)

#: Quantos triângulos uma pessoa pode receber por rodada. O feed de trocas é a
#: tela principal do app; inundá-la com dez sugestões triangulares empurraria
#: para baixo as diretas, que são as que fecham mais fácil.
MAX_POR_USUARIO = 5

#: Ordem de preferência quando o mesmo par tem várias cartas possíveis.
_ORDEM_CONDICAO = {"NM": 0, "LP": 1, "MP": 2, "HP": 3, "DMG": 4}


@dataclass(frozen=True)
class Aresta:
    """`de` oferece uma carta que `para` procura."""

    de: str
    para: str
    card_id: str
    condicao: str
    finish_id: int
    #: Prioridade que quem procura deu à carta (1 a 3). Vira score.
    prioridade: int


@dataclass(frozen=True)
class Triangulo:
    ciclo: tuple[str, str, str]
    itens: tuple[Aresta, Aresta, Aresta]
    score: float


# As arestas do grafo: quem consegue atender quem, e com qual carta.
#
# Mesma regra de compatibilidade do motor direto (`matching._COMPATIVEL`) —
# idioma igual, condição no mínimo a pedida, acabamento igual ou "aceita
# qualquer" —, com três filtros a mais que só fazem sentido aqui:
#
#   * `quantidade > 0`: estoque zerado por troca concluída não é oferta.
#   * `bloqueado = false` dos dois lados, como em toda listagem.
#   * o plano: triangular é recurso do PRO, e alguém que não o tem não pode
#     entrar num ciclo — nem como beneficiário, nem como perna do caminho de
#     outra pessoa. Filtrar aqui, na origem, é o que impede um triângulo de
#     nascer dependendo de quem não pode participar dele.
_ARESTAS = text("""
    select distinct
      o.user_id::text as de,
      p.user_id::text as para,
      o.card_id::text as card_id,
      o.condicao::text as condicao,
      o.finish_id as finish_id,
      p.prioridade as prioridade
    from listings o
    join listings p
      on o.card_id = p.card_id
     and o.idioma = p.idioma
     and o.condicao <= p.condicao
     and (p.aceita_qualquer_finish or o.finish_id = p.finish_id)
    join profiles dono on dono.id = o.user_id
    join profiles quer on quer.id = p.user_id
    where o.tipo = 'OFERTA' and p.tipo = 'PROCURA'
      and o.ativo and p.ativo
      and o.quantidade > 0
      and o.user_id <> p.user_id
      and dono.bloqueado = false
      and quer.bloqueado = false
      and dono.plano = any(:planos)
      and quer.plano = any(:planos)
""")


def _planos_com_triangular() -> list[str]:
    """Os planos que hoje dão direito a triangular.

    Passa por `plano_vigente`, como todo limite comercial: enquanto a cobrança
    não existir, todo mundo entra — bloquear antes de haver o que assinar seria
    pedágio, não oferta.
    """
    return [
        plano
        for plano in ("FREE", "PRO")
        if limites_de(plano_vigente(plano)).triangular
    ]


def melhor_aresta(candidatas: list[Aresta]) -> Aresta:
    """A melhor carta para um mesmo par: condição primeiro, prioridade depois.

    Condição vem antes de propósito. Prioridade é o quanto a pessoa quer a
    carta; condição é o estado em que ela vai chegar — e uma carta muito
    desejada que aparece machucada frustra mais do que a segunda da lista em
    Near Mint. O `card_id` no fim é só desempate estável, para o mesmo grafo
    produzir o mesmo triângulo em duas execuções.
    """
    return min(
        candidatas,
        key=lambda a: (
            _ORDEM_CONDICAO.get(a.condicao, 9),
            -a.prioridade,
            a.card_id,
        ),
    )


def detectar(
    arestas: list[Aresta], max_por_usuario: int = MAX_POR_USUARIO
) -> list[Triangulo]:
    """Acha os ciclos A→B→C→A. Ver seção 9.2 da doc.

    O ciclo é guardado uma vez só: `{A,B,C}` é o mesmo negócio visto de três
    entradas diferentes, e sem o conjunto como chave o mesmo triângulo seria
    gravado três vezes — uma por pessoa que serviu de ponto de partida.

    A ordenação final é por score, e o teto por pessoa é aplicado **depois**
    dela: com o corte aplicado durante a varredura, quem entrasse primeiro no
    laço tomaria as cinco vagas com os triângulos que aparecessem antes, não com
    os melhores.
    """
    saida: dict[str, set[str]] = defaultdict(set)
    por_par: dict[tuple[str, str], list[Aresta]] = defaultdict(list)

    for a in arestas:
        saida[a.de].add(a.para)
        por_par[(a.de, a.para)].append(a)

    vistos: set[frozenset[str]] = set()
    achados: list[Triangulo] = []

    for a in saida:
        for b in saida[a]:
            if b == a:
                continue
            for c in saida.get(b, ()):
                if c in (a, b) or a not in saida.get(c, ()):
                    continue

                chave = frozenset((a, b, c))
                if chave in vistos:
                    continue
                vistos.add(chave)

                itens = (
                    melhor_aresta(por_par[(a, b)]),
                    melhor_aresta(por_par[(b, c)]),
                    melhor_aresta(por_par[(c, a)]),
                )
                achados.append(
                    Triangulo(
                        ciclo=(a, b, c),
                        itens=itens,
                        score=float(sum(i.prioridade for i in itens)),
                    )
                )

    achados.sort(key=lambda t: (-t.score, t.ciclo))

    contagem: dict[str, int] = defaultdict(int)
    escolhidos: list[Triangulo] = []
    for tri in achados:
        if any(contagem[u] >= max_por_usuario for u in tri.ciclo):
            continue
        escolhidos.append(tri)
        for u in tri.ciclo:
            contagem[u] += 1
    return escolhidos


def hash_grupo(ciclo: tuple[str, str, str]) -> str:
    """Dedup pelo trio, independente de por quem a varredura começou."""
    return "TRIANGULAR:" + ":".join(sorted(ciclo))


async def _gravar(session: AsyncSession, tri: Triangulo) -> tuple[str, bool] | None:
    """Grava um triângulo.

    Devolve o id e se ele é inédito — a segunda metade é o que decide avisar ou
    ficar quieto. `None` quando o match existe e já saiu de sugestão: alguém
    respondeu, e o job não mexe no que virou negociação.
    """
    res = await session.execute(
        text("""
            insert into matches (tipo, status, score, hash_grupo)
            values ('TRIANGULAR', 'SUGERIDO', :score, :hash)
            on conflict (hash_grupo) do update
              set score = excluded.score,
                  status = 'SUGERIDO',
                  expira_em = now() + interval '7 days',
                  prorrogacoes = 0
              where matches.status in ('SUGERIDO', 'EXPIRADO')
            returning id::text, (xmax = 0) as inedito
        """),
        {"score": tri.score, "hash": hash_grupo(tri.ciclo)},
    )
    linha = res.mappings().first()
    if linha is None:
        return None

    match_id = linha["id"]

    await session.execute(
        text("""
            update match_participants
            set aceitou = null, respondeu_em = null, confirmou_conclusao = false
            where match_id = :m
        """),
        {"m": match_id},
    )

    # A posição **é** o ciclo, e não a ordem alfabética do match direto: aqui
    # ela diz quem dá para quem. Perder essa ordem seria perder a troca.
    for posicao, pessoa in enumerate(tri.ciclo):
        await session.execute(
            text("""
                insert into match_participants (match_id, user_id, posicao)
                values (:m, :u, :p)
                on conflict (match_id, user_id) do update set posicao = excluded.posicao
            """),
            {"m": match_id, "u": pessoa, "p": posicao},
        )

    await session.execute(
        text("delete from match_items where match_id = :m"), {"m": match_id}
    )
    for item in tri.itens:
        await session.execute(
            text("""
                insert into match_items
                  (match_id, card_id, de_user_id, para_user_id, condicao, finish_id)
                values (:m, :c, :de, :para, :cond, :fin)
            """),
            {
                "m": match_id,
                "c": item.card_id,
                "de": item.de,
                "para": item.para,
                "cond": item.condicao,
                "fin": item.finish_id,
            },
        )

    return match_id, bool(linha["inedito"])


async def recalcular(session: AsyncSession) -> dict[str, int]:
    """Roda a varredura inteira. Devolve o que foi visto e o que foi gravado.

    Desligado (`TRIANGULAR_ATIVO` falso), sai sem tocar no banco e diz isso em
    vez de mentir um zero — quem lê a resposta do cron precisa distinguir "não
    achei triângulo" de "não fui procurar".

    Não commita: quem chama fecha a transação, como o resto dos jobs.
    """
    if not settings.TRIANGULAR_ATIVO:
        return {"arestas": 0, "triangulos": 0, "novos": 0, "desligado": 1}

    linhas = (
        (await session.execute(_ARESTAS, {"planos": _planos_com_triangular()}))
        .mappings()
        .all()
    )
    arestas = [Aresta(**dict(linha)) for linha in linhas]
    triangulos = detectar(arestas)

    novos = 0
    for tri in triangulos:
        gravado = await _gravar(session, tri)
        if gravado is None:
            continue
        match_id, inedito = gravado
        if not inedito:
            continue

        novos += 1
        # Um aviso por pessoa do trio, e só quando o triângulo é inédito: o job
        # roda todo dia sobre o mesmo grafo, e avisar a cada passagem
        # transformaria a melhor sugestão do app na mais irritante.
        for pessoa in tri.ciclo:
            await notificacoes.match_novo(
                session, para=pessoa, match_id=match_id, tipo="TRIANGULAR"
            )

    logger.info(
        "[triangular] %d arestas, %d triângulos, %d novos",
        len(arestas),
        len(triangulos),
        novos,
    )
    return {
        "arestas": len(arestas),
        "triangulos": len(triangulos),
        "novos": novos,
        "desligado": 0,
    }
