"""Testes do matching que não dependem de um Postgres real."""

import inspect
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.auth import usuario_atual
from app.db.session import get_session
from app.main import app
from app.schemas.listing import CartaProcurada, QuemProcura
from app.schemas.match import MatchOut, ParticipanteCompleto, ParticipanteResumo
from app.services import matching


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


def test_feed_exige_autenticacao():
    client = TestClient(app)
    assert client.get("/v1/me/matches").status_code in (401, 403)


def test_responder_exige_autenticacao():
    client = TestClient(app)
    resp = client.post(f"/v1/me/matches/{uuid4()}/responder", json={"aceitou": True})
    assert resp.status_code in (401, 403)


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
    """CONCLUIDO/FURADO explicam os contadores do perfil; EXPIRADO explica a
    troca que sumiu do feed. RECUSADO e SUGERIDO não são histórico."""
    sql = matching._HISTORICO.text
    assert "m.status in ('CONCLUIDO', 'FURADO', 'EXPIRADO')" in sql
    assert "RECUSADO" not in sql
    assert "SUGERIDO" not in sql


def test_historico_ordena_pelo_desfecho():
    """Mais recente primeiro, e a data vem do último evento do match — `matches`
    não guarda quando mudou de status."""
    sql = matching._HISTORICO.text
    assert "order by desfecho_em desc" in sql
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
