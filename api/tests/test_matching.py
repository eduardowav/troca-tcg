"""Testes do matching que não dependem de um Postgres real."""

import asyncio
import inspect
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.auth import usuario_atual
from app.core.config import settings
from app.db.session import get_session
from app.main import app
from app.routers import listings as rotas_listings
from app.routers import matches as rotas_matches
from app.schemas.listing import CartaProcurada, QuemProcura
from app.schemas.match import MatchOut, ParticipanteCompleto, ParticipanteResumo
from app.services import matching, termos


async def _vazio() -> dict:
    """Substitui `_itens_por_match` nos testes da isenção: o que se mede ali é
    quem pergunta pelo contato, e os itens da troca não têm parte nisso."""
    return {}


class _SessaoComMatch:
    """Devolve uma linha de match com o status pedido, e nada mais.

    `obter_match` faz uma consulta só antes de decidir sobre o contato, e é essa
    decisão que os testes observam — o resto do caminho é substituído.
    """

    def __init__(self, status: str):
        self.status = status

    async def execute(self, _sql, _params=None):
        linha = {
            "id": str(uuid4()),
            "tipo": "DIRETO",
            "status": self.status,
            "score": 4.0,
            "expira_em": "2026-08-20T00:00:00+00:00",
            "prorrogacoes": 0,
            "desistiu_por": None,
        }

        class Res:
            def mappings(self_inner):
                class M:
                    def first(self_m):
                        return linha

                return M()

        return Res()


class _SessaoDeEscrita:
    """Dublê para `registrar_revelacao`: guarda o SQL e os parâmetros.

    `ja_aceitou` é o que o `scalar` da guarda de idempotência devolve.
    """

    def __init__(self, ja_aceitou: bool = False):
        self.ja_aceitou = ja_aceitou
        self.sqls: list[str] = []
        self.params: list[dict] = []

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return 1 if self.ja_aceitou else None

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return None


def test_hash_grupo_independe_da_ordem():
    """Dedup: A consultando e B consultando têm de gerar a mesma chave.

    Se dependesse da ordem, cada lado criaria o seu match e o par veria duas
    sugestões do mesmo negócio.
    """
    a, b = uuid4(), uuid4()
    assert matching._hash_grupo(a, b) == matching._hash_grupo(b, a)


def test_hash_grupo_distingue_pares():
    a, b, c = uuid4(), uuid4(), uuid4()
    assert matching._hash_grupo(a, b) != matching._hash_grupo(a, c)


def test_resumo_nao_tem_campo_de_contato():
    """Regra inviolável: o feed não pode nem ter onde guardar o contato."""
    assert "contato_visivel" not in ParticipanteResumo.model_fields


def test_completo_tem_contato():
    assert "contato_visivel" in ParticipanteCompleto.model_fields


def test_match_do_feed_descarta_contato_mesmo_se_vier():
    """Mesmo alimentado com contato, o MatchOut do feed não o serializa."""
    saida = MatchOut(
        id=str(uuid4()),
        tipo="DIRETO",
        status="SUGERIDO",
        score=4.0,
        expira_em="2026-08-04T00:00:00+00:00",
        participantes=[
            ParticipanteResumo.model_validate(
                {
                    "user_id": str(uuid4()),
                    "username": "alguem",
                    "nome_exibicao": "Alguém",
                    "contato_visivel": "@zap-secreto",
                }
            )
        ],
        itens=[],
    )
    assert "zap-secreto" not in saida.model_dump_json()


def test_compatibilidade_exige_condicao_e_finish():
    """O SQL de compatibilidade precisa manter as quatro travas de troca."""
    sql = matching._COMPATIVEL
    assert "o.condicao <= p.condicao" in sql  # oferta ao menos tão boa
    assert "p.aceita_qualquer_finish or o.finish_id = p.finish_id" in sql
    assert "o.idioma  = p.idioma" in sql
    assert "o.user_id <> p.user_id" in sql  # ninguém troca consigo mesmo


def _schema_resposta(caminho: str, metodo: str) -> str:
    """Nome do schema que a rota realmente serializa, lido do OpenAPI.

    Vale mais que inspecionar `response_model` no objeto da rota: é o contrato
    publicado, e é ele que o FastAPI usa para filtrar a saída.
    """
    conteudo = app.openapi()["paths"][caminho][metodo]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    if conteudo.get("type") == "array":
        return conteudo["items"]["$ref"].rsplit("/", 1)[-1]
    return conteudo["$ref"].rsplit("/", 1)[-1]


def test_feed_nao_expoe_contato():
    """O feed lista muita gente de uma vez: o schema dele não tem contato."""
    assert _schema_resposta("/v1/me/matches", "get") == "MatchOut"
    assert "contato_visivel" not in str(
        app.openapi()["components"]["schemas"]["ParticipanteResumo"]
    )


def test_detalhe_deixa_o_contato_passar():
    """Regressão: com MatchOut aqui, o FastAPI filtrava o contato da resposta e
    a revelação depois do aceite mútuo nunca acontecia."""
    assert _schema_resposta("/v1/me/matches/{match_id}", "get") == "MatchCompleto"
    assert (
        _schema_resposta("/v1/me/matches/{match_id}/responder", "post")
        == "MatchCompleto"
    )


# ------------------------------------------- a isenção antes do contato


def test_contato_so_sai_com_a_isencao_aceita(monkeypatch):
    """O coração do item 3: aceite mútuo **não basta** mais.

    `obter_match` só pede o contato ao banco (`completo=True`) quando existe
    aceite registrado para esta troca. Sem ele, o match volta com
    `ParticipanteResumo`, que não tem onde guardar contato — a trava não é uma
    caixa na tela, é a ausência do dado na resposta.
    """
    pedidos: list[bool] = []

    async def falso_participantes(_s, _ids, *, completo):
        pedidos.append(completo)
        return {}

    async def nao_aceitou(_s, _u, _m):
        return False

    monkeypatch.setattr(matching, "_participantes_por_match", falso_participantes)
    monkeypatch.setattr(matching, "_itens_por_match", lambda *_a, **_k: _vazio())
    monkeypatch.setattr(matching.termos, "aceitou_revelacao", nao_aceitou)

    asyncio.run(
        matching.obter_match(_SessaoComMatch("ACEITO"), uuid4(), uuid4())  # type: ignore[arg-type]
    )
    assert pedidos == [False]


def test_contato_sai_depois_da_isencao(monkeypatch):
    """E o outro lado da mesma regra: com o aceite, o contato volta a sair."""
    pedidos: list[bool] = []

    async def falso_participantes(_s, _ids, *, completo):
        pedidos.append(completo)
        return {}

    async def aceitou(_s, _u, _m):
        return True

    monkeypatch.setattr(matching, "_participantes_por_match", falso_participantes)
    monkeypatch.setattr(matching, "_itens_por_match", lambda *_a, **_k: _vazio())
    monkeypatch.setattr(matching.termos, "aceitou_revelacao", aceitou)

    asyncio.run(
        matching.obter_match(_SessaoComMatch("ACEITO"), uuid4(), uuid4())  # type: ignore[arg-type]
    )
    assert pedidos == [True]


def test_match_nao_aceito_nem_pergunta_pela_isencao(monkeypatch):
    """A ordem das condições importa: uma consulta a menos no caminho de quem
    abre um match que ainda nem foi aceito, que é a maioria das aberturas."""
    perguntou = []

    async def falso_participantes(_s, _ids, *, completo):
        return {}

    async def aceitou(_s, _u, _m):
        perguntou.append(True)
        return True

    monkeypatch.setattr(matching, "_participantes_por_match", falso_participantes)
    monkeypatch.setattr(matching, "_itens_por_match", lambda *_a, **_k: _vazio())
    monkeypatch.setattr(matching.termos, "aceitou_revelacao", aceitou)

    asyncio.run(
        matching.obter_match(_SessaoComMatch("SUGERIDO"), uuid4(), uuid4())  # type: ignore[arg-type]
    )
    assert perguntou == []


def test_revelar_contato_exige_autenticacao():
    """A única porta do contato é POST, e ela pede sessão como todas as outras."""
    client = TestClient(app)
    resp = client.post(f"/v1/me/matches/{uuid4()}/contato")
    assert resp.status_code in (401, 403)


def test_revelar_contato_devolve_o_match_completo():
    """Devolver o match inteiro é o que evita a costura no cache do frontend."""
    assert (
        _schema_resposta("/v1/me/matches/{match_id}/contato", "post") == "MatchCompleto"
    )


def test_registro_do_aceite_grava_versao_match_e_ip():
    """O que dá valor probatório ao registro: o quê, de quem, em qual troca e
    de onde. Sem o `match_id`, o aceite viraria uma assinatura global — e a
    isenção fala de *um* encontro, com *uma* pessoa."""
    sql = str(termos.registrar_revelacao.__doc__)  # garante que a função existe
    assert sql

    sessao = _SessaoDeEscrita()
    asyncio.run(
        termos.registrar_revelacao(sessao, uuid4(), uuid4(), "200.1.2.3")  # type: ignore[arg-type]
    )
    insercao = [s for s in sessao.sqls if "insert into term_acceptances" in s][0]
    assert "versao" in insercao and "match_id" in insercao and "ip" in insercao

    params = sessao.params[-1]
    assert params["c"] == termos.REVELACAO_CONTATO
    assert params["v"] == settings.TERMOS_VERSAO
    assert params["ip"] == "200.1.2.3"


def test_aceite_repetido_nao_empilha_linha():
    """Reabrir a mesma troca não grava de novo: a primeira linha é a que marca
    o instante em que a pessoa leu o texto, e é essa data que interessa."""
    sessao = _SessaoDeEscrita(ja_aceitou=True)
    asyncio.run(
        termos.registrar_revelacao(sessao, uuid4(), uuid4(), None)  # type: ignore[arg-type]
    )
    assert not any("insert into term_acceptances" in s for s in sessao.sqls)


def test_feed_exige_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/matches").status_code in (401, 403)


def test_responder_exige_autenticacao():
    client = TestClient(app)
    resp = client.post(f"/v1/me/matches/{uuid4()}/responder", json={"aceitou": True})
    assert resp.status_code in (401, 403)


# ------------------------------------------- onde o motor roda (e onde não)


def _codigo(fn) -> str:
    """A fonte sem as linhas de comentário.

    Os comentários destas rotas explicam justamente por que o
    `sincronizar_matches` não está lá — procurar o nome na fonte crua acharia a
    explicação e o teste passaria a afirmar o contrário do que quer.
    """
    linhas = inspect.getsource(fn).splitlines()
    return "\n".join(x for x in linhas if not x.strip().startswith("#"))


def test_feed_nao_ressincroniza():
    """Ler o feed não pode disparar escrita.

    Era a operação mais cara do app: um GET na tela mais visitada gastava
    `9 × parceiros + 5` idas ao banco, com o Postgres a ~120 ms de distância.
    Ler não muda match — só escrita muda.
    """
    fonte = _codigo(rotas_matches.listar)
    assert "sincronizar_matches" not in fonte
    assert "listar_matches" in fonte


def test_historico_tambem_nao_ressincroniza():
    fonte = _codigo(rotas_matches.historico)
    assert "sincronizar_matches" not in fonte


def test_toda_escrita_de_anuncio_ressincroniza():
    """O contrapeso do teste acima: se a leitura não recalcula, a escrita tem de
    recalcular — em todas as rotas, senão o match nasce e ninguém vê."""
    for rota in (
        rotas_listings.criar,
        rotas_listings.criar_bulk,
        rotas_listings.atualizar,
        rotas_listings.remover,
    ):
        assert "sincronizar_matches" in _codigo(rota), rota.__name__


def test_feed_le_participantes_e_itens_em_lote():
    """Uma consulta para todos os matches, não duas por match.

    Com o banco a um oceano de distância, `2K+1` idas viram segundos de tela
    parada. O `.get(` no lugar do `await` é a assinatura de que o lote foi lido
    antes do laço.
    """
    fonte = inspect.getsource(matching.listar_matches)
    assert "_participantes_por_match" in fonte
    assert "_itens_por_match" in fonte
    assert "await _participantes" not in fonte.split("return")[-1]


def test_ids_do_lote_nunca_entram_no_texto_do_sql():
    """Os ids viram parâmetros; só os nomes gerados aqui entram na consulta."""
    lista, params = matching._lista_de_ids(["abc", "def"], "m")
    assert lista == "cast(:m0 as uuid), cast(:m1 as uuid)"
    assert params == {"m0": "abc", "m1": "def"}


def test_lote_vazio_nao_consulta():
    """Sem matches não há `in ()` — que seria erro de sintaxe no Postgres."""
    assert matching._lista_de_ids([], "m") == ("", {})


def test_demanda_nomeia_quem_procura():
    """A tela vazia diz quem procura, não só quantos (decisão de 2026-07-30)."""
    assert set(CartaProcurada.model_fields) == {"card_id", "procurando", "pessoas"}
    assert set(QuemProcura.model_fields) == {"user_id", "username", "nome_exibicao"}


def test_demanda_nao_expoe_contato():
    """Identidade sim, contato não: nomear é decisão de produto, revelar o
    telefone antes do aceite mútuo continua sendo a regra inviolável."""
    assert "contato_visivel" not in QuemProcura.model_fields
    # Nas propriedades publicadas, não no texto: a docstring do schema fala de
    # contato justamente para explicar por que ele não está aqui.
    propriedades = app.openapi()["components"]["schemas"]["QuemProcura"]["properties"]
    assert not [c for c in propriedades if "contato" in c]


def test_demanda_conta_pessoa_uma_vez_so():
    """Duas PROCURAs da mesma carta (condições diferentes) são uma pessoa
    interessada, não duas — daí o distinct na CTE."""
    assert "select distinct o.card_id, p.user_id" in matching._DEMANDA.text


def test_demanda_usa_a_mesma_regra_do_matching():
    """Contagem solta por carta inflaria o número com gente que nunca daria
    match: quem procura a carta em condição que a minha não atende não é
    demanda, é falsa esperança."""
    assert matching._COMPATIVEL in matching._DEMANDA.text
    assert "pr.bloqueado = false" in matching._DEMANDA.text
    assert "count(*) as procurando" in matching._DEMANDA.text


def test_demanda_serializa_carta_procurada():
    assert _schema_resposta("/v1/me/listings/procuradas", "get") == "CartaProcurada"


def test_demanda_exige_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/listings/procuradas").status_code in (401, 403)


def test_historico_nao_e_engolido_pela_rota_de_detalhe(monkeypatch):
    """O FastAPI resolve na ordem de declaração: com `/{match_id}` antes,
    "historico" seria lido como UUID e a resposta viria 422 — a tela de perfil
    ficaria vazia sem explicação.

    Testa o comportamento, não a ordem da lista de rotas: em FastAPI 0.141
    `app.routes` guarda as rotas incluídas atrás de `_IncludedRouter`, sem `path`,
    então inspecionar a lista não prova nada. Aqui a rota é chamada de verdade,
    com a sessão e a autenticação substituídas para não precisar de Postgres.
    """

    async def sem_banco(*_args, **_kwargs):
        return []

    monkeypatch.setattr(matching, "listar_historico", sem_banco)
    app.dependency_overrides[usuario_atual] = lambda: uuid4()
    app.dependency_overrides[get_session] = lambda: None
    try:
        resposta = TestClient(app).get("/v1/me/matches/historico")
    finally:
        app.dependency_overrides.clear()

    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == []


def test_historico_serializa_sem_contato():
    """Lista de muita gente de uma vez: mesma regra do feed."""
    assert _schema_resposta("/v1/me/matches/historico", "get") == "MatchNoHistorico"
    participantes = app.openapi()["components"]["schemas"]["MatchNoHistorico"][
        "properties"
    ]["participantes"]
    assert participantes["items"]["$ref"].endswith("ParticipanteResumo")


def test_historico_so_traz_o_que_terminou():
    """CONCLUIDO/FURADO explicam os contadores do perfil; EXPIRADO e CANCELADO
    explicam a troca que sumiu do feed. RECUSADO e SUGERIDO não são histórico."""
    sql = matching._HISTORICO.text
    assert "m.status in ('CONCLUIDO', 'FURADO', 'EXPIRADO', 'CANCELADO')" in sql
    assert "RECUSADO" not in sql
    assert "SUGERIDO" not in sql


def test_historico_ordena_pelo_desfecho():
    """Mais recente primeiro, e a data vem do último evento do match — `matches`
    não guarda quando mudou de status."""
    sql = matching._HISTORICO.text
    assert "order by h.desfecho_em desc" in sql
    assert "max(e.criado_em) from match_events e" in sql


def test_datas_saem_em_iso_8601():
    """`::text` do Postgres sai com espaço no lugar do T, e o Safari do iOS trata
    isso como data inválida — "Expira em NaN dia(s)". O app é lido no celular."""
    schemas = app.openapi()["components"]["schemas"]
    for schema, campo in (
        ("MatchOut", "expira_em"),
        ("MatchCompleto", "expira_em"),
        ("MatchNoHistorico", "expira_em"),
        ("MatchNoHistorico", "desfecho_em"),
    ):
        assert schemas[schema]["properties"][campo]["format"] == "date-time", (
            f"{schema}.{campo} não é date-time"
        )


def test_nenhuma_data_vira_texto_no_sql():
    """Guarda a origem do problema, não só o sintoma.

    O schema hoje coage o texto de volta para datetime, então um `::text` que
    voltar não quebra nada — até alguém declarar o campo como `str` de novo e o
    NaN reaparecer no iPhone. Ids continuam saindo como texto de propósito; data,
    não.
    """
    assert "expira_em::text" not in inspect.getsource(matching)


def test_historico_exige_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/matches/historico").status_code in (401, 403)


def test_desistir_nao_mexe_na_reputacao_de_ninguem():
    """A decisão de produto vive aqui: desistir declarado não é furo.

    Se `registrar_desistencia` tocasse `trocas_furadas`, o botão viraria uma
    auto-denúncia e ninguém clicaria — a pessoa sumiria, o match viraria
    EXPIRADO, e a métrica-mãe pioraria em vez de melhorar.
    """
    fonte = inspect.getsource(matching.registrar_desistencia)
    assert "trocas_desistidas" in fonte
    assert "trocas_furadas" not in fonte
    assert "trocas_concluidas" not in fonte


def test_desistencia_volta_a_ser_sugerida_depois_da_carencia():
    """CANCELADO ressuscita como EXPIRADO, mas não no mesmo instante.

    Sem a comparação com `expira_em`, a troca que a pessoa acabou de desmarcar
    reapareceria no feed no refresh seguinte.
    """
    fonte = inspect.getsource(matching._gravar_match)
    assert "matches.status = 'CANCELADO' and matches.expira_em <= now()" in fonte


def test_prorrogacao_tem_teto():
    """Prazo que estica sem fim é o mesmo que não ter prazo — e o par fica preso,
    porque só existe um match por dupla de pessoas."""
    assert matching._LIMITE_PRORROGACOES == 2
    fonte = inspect.getsource(matching.prorrogar)
    assert "prorrogacoes < :limite" in fonte
    # Somar sobre uma data já vencida devolveria um prazo que nasce vencido.
    assert "greatest(now(), expira_em)" in fonte


def test_prazo_so_estica_com_troca_em_andamento():
    fonte = inspect.getsource(matching.prorrogar)
    assert '("PENDENTE", "ACEITO")' in fonte


def test_rotas_novas_estao_publicadas():
    """Lê o OpenAPI, não `app.routes`: em FastAPI 0.141 as rotas incluídas ficam
    atrás de um `_IncludedRouter` sem `path`, e inspecionar a lista não prova
    nada (ver a nota em api-nao-sobe / testes anteriores)."""
    caminhos = app.openapi()["paths"]
    assert "/v1/me/matches/{match_id}/desistir" in caminhos
    assert "/v1/me/matches/{match_id}/estender" in caminhos


def test_match_expoe_prorrogacoes_e_quem_desistiu():
    """A tela precisa dos dois: um decide se ainda oferece o botão de estender,
    o outro decide entre "você desistiu" e "a outra pessoa desistiu"."""
    props = app.openapi()["components"]["schemas"]["MatchCompleto"]["properties"]
    assert "prorrogacoes" in props
    assert "desistiu_por" in props
    assert (
        "trocas_desistidas"
        in MatchOut.model_fields["participantes"].annotation.__args__[0].model_fields
    )


def test_mais_cartas_nao_repete_a_carta_da_troca():
    """A carta que já está sendo trocada não é "mais uma carta"."""
    sql = matching._MAIS_CARTAS.text
    assert "card_id not in (" in sql
    assert "select card_id from match_items where match_id = :m" in sql


def test_mais_cartas_inverte_o_tipo_para_reciprocidade():
    """OFERTA dela só interessa contra o meu PROCURA, e vice-versa — a mesma
    regra do matcher, dita para uma pessoa só."""
    sql = matching._MAIS_CARTAS.text
    assert "when l.tipo = 'OFERTA' then 'PROCURA'::listing_kind" in sql
    assert "else 'OFERTA'::listing_kind" in sql


def test_mais_cartas_poe_o_reciproco_primeiro():
    """A ordem é o produto desta tela: o que fecha com você primeiro."""
    assert "order by reciproco desc" in matching._MAIS_CARTAS.text


def test_mais_cartas_so_traz_anuncio_ativo():
    assert "l.ativo" in matching._MAIS_CARTAS.text


def test_mais_cartas_nao_expoe_contato():
    """Acervo é público (11_grants.sql); contato continua saindo só após o
    aceite mútuo, e este schema não tem onde guardá-lo."""
    props = app.openapi()["components"]["schemas"]["CartaDoParceiro"]["properties"]
    assert not [c for c in props if "contato" in c]
    assert "user_id" not in props


def test_mais_cartas_esta_publicada_e_exige_autenticacao():
    assert "/v1/me/matches/{match_id}/mais-cartas" in app.openapi()["paths"]
    client = TestClient(app)
    resp = client.get(f"/v1/me/matches/{uuid4()}/mais-cartas")
    assert resp.status_code in (401, 403)
