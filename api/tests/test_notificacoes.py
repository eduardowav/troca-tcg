"""Testes das notificações — sem Postgres, como o resto da suíte.

O que dá para provar sem banco aqui é justamente o que mais custa caro errar:
para quem a linha vai, quando ela **não** vai, e se a consulta que a grava leva
o dono no `where`. O resto — que o Realtime entrega, que o índice é usado —
depende de banco de verdade e fica para lá.
"""

import inspect

from fastapi.testclient import TestClient

from app.main import app
from app.services import matching, notificacoes


class SessaoFalsa:
    """Dublê de AsyncSession: registra o SQL e devolve o que mandarem devolver."""

    def __init__(self, escalares=()):
        self._escalares = list(escalares)
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return type(
            "Res",
            (),
            {
                "rowcount": 1,
                "mappings": lambda self: type("M", (), {"all": lambda self: []})(),
            },
        )()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self._escalares.pop(0) if self._escalares else None

    async def commit(self):
        self.commits += 1


def inseriu(sessao: SessaoFalsa) -> bool:
    return any("insert into notifications" in sql for sql in sessao.sqls)


# ------------------------------------------------------------ para quem vai


async def test_ninguem_e_notificado_do_que_fez():
    """A guarda mais importante do arquivo: quase toda função recebe os dois
    lados de uma troca, e inverter a ordem dos argumentos seria fácil demais."""
    sessao = SessaoFalsa()
    gravou = await notificacoes._notificar(
        sessao, para="mesma-pessoa", de="mesma-pessoa", tipo="X", titulo="t", corpo="c"
    )
    assert gravou is False
    assert not inseriu(sessao)


async def test_notifica_quando_e_outra_pessoa():
    sessao = SessaoFalsa()
    gravou = await notificacoes._notificar(
        sessao, para="alguem", de="outra", tipo="X", titulo="t", corpo="c"
    )
    assert gravou is True
    assert inseriu(sessao)


async def test_destino_nulo_nao_quebra():
    """`_outro_participante` devolve None num match de uma ponta só; a
    notificação some em silêncio em vez de derrubar o desfecho da troca."""
    sessao = SessaoFalsa()
    assert (
        await notificacoes._notificar(
            sessao, para=None, tipo="X", titulo="t", corpo="c"
        )
        is False
    )
    assert not inseriu(sessao)


# ------------------------------------------------------------------- dedupe


async def test_carta_procurada_checa_antes_de_repetir():
    """É a única notificação que nasce de varredura, e o job roda a cada quinze
    minutos: sem o dedupe, a mesma carta viraria um aviso por passagem."""
    sessao = SessaoFalsa(escalares=[1])  # já existe uma igual
    gravou = await notificacoes.carta_procurada(
        sessao, para="dono", card_id="c1", carta="Pikachu", quantos=2
    )
    assert gravou is False
    assert not inseriu(sessao)


async def test_carta_procurada_grava_quando_nao_ha_repetida():
    sessao = SessaoFalsa(escalares=[None])
    assert await notificacoes.carta_procurada(
        sessao, para="dono", card_id="c1", carta="Pikachu", quantos=1
    )
    assert inseriu(sessao)


async def test_janela_do_dedupe_e_de_uma_semana():
    """Longa de propósito: a mesma carta voltando toda semana é lembrete; a cada
    quinze minutos, é o app se tornando insuportável."""
    sessao = SessaoFalsa(escalares=[None])
    await notificacoes.carta_procurada(
        sessao, para="dono", card_id="c1", carta="Pikachu", quantos=1
    )
    assert any(p.get("horas") == 24 * 7 for p in sessao.params)


async def test_eventos_de_acao_nao_deduplicam():
    """Duas propostas da mesma pessoa são dois avisos. Só a varredura deduplica —
    aqui, engolir a segunda seria engolir uma negociação inteira."""
    sessao = SessaoFalsa()
    await notificacoes.proposta_recebida(
        sessao, para="a", de="b", quem="fulano", proposta_id="p1"
    )
    assert not any("criado_em > now()" in sql for sql in sessao.sqls)


# -------------------------------------------------------------- o dono no where


async def test_marcar_lidas_por_id_ainda_filtra_pelo_dono():
    """Sem o user_id, um id chutado de outra pessoa seria marcado como lido por
    quem não é dono."""
    sessao = SessaoFalsa()
    await notificacoes.marcar_lidas(sessao, "eu", ["n1", "n2"])
    sql = next(s for s in sessao.sqls if "update notifications" in s)
    assert "user_id = cast(:u as uuid)" in sql


async def test_marcar_todas_tambem_filtra_pelo_dono():
    sessao = SessaoFalsa()
    await notificacoes.marcar_lidas(sessao, "eu", None)
    sql = next(s for s in sessao.sqls if "update notifications" in s)
    assert "user_id = cast(:u as uuid)" in sql


async def test_lista_so_nao_lidas_quando_pedem():
    sessao = SessaoFalsa()
    await notificacoes.listar(sessao, "eu", apenas_nao_lidas=True)
    assert any("and lida = false" in sql for sql in sessao.sqls)

    outra = SessaoFalsa()
    await notificacoes.listar(outra, "eu", apenas_nao_lidas=False)
    assert not any("and lida = false" in sql for sql in outra.sqls)


# --------------------------------------------------- conclusão: pedido x notícia


async def test_conclusao_de_um_lado_pede_a_do_outro():
    """Falta um lado: é pedido, e o tipo tem de dizer isso.

    A caixa destaca o que pede ação lendo só o `tipo` — texto ela não interpreta.
    Enquanto os dois desfechos compartilharam `MATCH_CONCLUIDO`, a linha da troca
    fechada aparecia marcada como "sua vez".
    """
    sessao = SessaoFalsa()
    await notificacoes.match_concluido(
        sessao, para="alguem", de="outra", quem="outra", match_id="m", fechou=False
    )
    assert sessao.params[-1]["tipo"] == notificacoes.TIPO_MATCH_CONFIRME


async def test_conclusao_dos_dois_e_noticia():
    """Ninguém tem o que fazer depois desta: é o fim do fluxo."""
    sessao = SessaoFalsa()
    await notificacoes.match_concluido(
        sessao, para="alguem", de="outra", quem="outra", match_id="m", fechou=True
    )
    assert sessao.params[-1]["tipo"] == notificacoes.TIPO_MATCH_CONCLUIDO


def test_os_dois_desfechos_da_conclusao_vibram():
    """Um pede ação, o outro é a recompensa da troca que fechou — e o push do
    segundo é anterior à separação dos tipos, então some sem querer se a lista
    não for conferida."""
    assert notificacoes.TIPO_MATCH_CONFIRME in notificacoes.TIPOS_COM_PUSH
    assert notificacoes.TIPO_MATCH_CONCLUIDO in notificacoes.TIPOS_COM_PUSH


# ------------------------------------------------------------------ catálogo


def test_triangular_ja_tem_texto_proprio():
    """O motor de ciclos é a Fase 5 e não existe. Quando existir, ele só chama
    `match_novo` com o tipo certo — este texto já está escrito e esperando."""
    titulo, _ = notificacoes._TEXTO_MATCH_NOVO["TRIANGULAR"]
    assert "três pontas" in titulo


def test_todo_tipo_de_match_tem_texto():
    """Um tipo sem entrada cairia no texto de DIRETO e mentiria sobre a troca."""
    assert set(notificacoes._TEXTO_MATCH_NOVO) >= {
        "DIRETO",
        "MULTIPLO",
        "TRIANGULAR",
        "PROPOSTA",
    }


# ------------------------------------------------------- quando NÃO se notifica


def test_match_novo_so_dispara_no_insert():
    """`sincronizar_matches` roda a cada escrita de anúncio e reescreve os mesmos
    pares indefinidamente. É o `xmax = 0` que separa o INSERT do UPDATE do
    upsert — sem ele, a coisa mais útil do app vira a mais irritante."""
    fonte = inspect.getsource(matching._gravar_matches)
    assert "(xmax = 0) as inedito" in fonte
    # A guarda mudou de forma em 2026-08-18, quando a gravação passou a ser em
    # lote: era `if inedito:` dentro da função de um par só, virou um `continue`
    # sobre as linhas devolvidas pelo upsert. O que este teste protege é a
    # decisão, não a sintaxe — o aviso continua preso ao `inedito`.
    assert 'linha["inedito"]' in fonte
    assert "continue" in fonte


def test_recusa_de_sugestao_nao_notifica():
    """Recusar uma sugestão do motor não é responder a uma pessoa — é dispensar
    uma ideia do app. Avisar transformaria "não quero" numa mensagem."""
    fonte = inspect.getsource(matching.responder)
    assert "if aceitou:" in fonte
    assert "match_aceito" in fonte


def test_furo_nao_nomeia_quem_registrou():
    """O aviso chega para quem acabou de levar um furo no número; nomear quem
    apertou o botão convida à represália antes de a pessoa ler a tela."""
    assert "quem" not in inspect.signature(notificacoes.match_furado).parameters


# ----------------------------------------------------------- carta procurada


def test_job_usa_a_mesma_regra_de_compatibilidade_do_matcher():
    """Contar quem procura a carta "em qualquer condição" prometeria demanda que
    o matcher nunca confirmaria."""
    assert matching._COMPATIVEL in matching._QUEM_PROCURA_O_QUE_OFERECO.text


def test_job_ignora_bloqueados_dos_dois_lados():
    sql = matching._QUEM_PROCURA_O_QUE_OFERECO.text
    assert "dono.bloqueado = false" in sql
    assert "quem.bloqueado = false" in sql


def test_job_so_olha_procura_recente():
    """Sem a janela, toda passagem do job reprocessaria a base inteira."""
    assert "p.criado_em > now() - make_interval" in (
        matching._QUEM_PROCURA_O_QUE_OFERECO.text
    )


# ------------------------------------------------------------------- rotas


def test_rotas_publicadas():
    caminhos = app.openapi()["paths"]
    assert "/v1/me/notifications" in caminhos
    assert "/v1/me/notifications/nao-lidas" in caminhos
    assert "/v1/me/notifications/read" in caminhos


def test_caminho_fixo_declarado_antes_de_qualquer_rota_com_parametro():
    """Mesma armadilha de `/me/matches/historico`: o FastAPI resolve na ordem de
    declaração, e um `/{id}` acima engoliria "nao-lidas", tentaria lê-lo como
    parâmetro e devolveria 422. Hoje não existe rota com parâmetro aqui — o
    teste é para o dia em que alguém acrescentar uma no lugar errado."""
    from app.routers import notificacoes as router_notif

    caminhos = [rota.path for rota in router_notif.router.routes]
    fixo = caminhos.index("/me/notifications/nao-lidas")
    com_parametro = [i for i, c in enumerate(caminhos) if "{" in c]
    assert all(i > fixo for i in com_parametro)


def test_notificacao_exige_login():
    cliente = TestClient(app)
    assert cliente.get("/v1/me/notifications").status_code == 401
    assert cliente.get("/v1/me/notifications/nao-lidas").status_code == 401
    assert cliente.post("/v1/me/notifications/read", json={}).status_code == 401
