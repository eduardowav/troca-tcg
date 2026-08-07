"""Testes da vitrine e das propostas — sem Postgres, como o resto da suíte.

O que dá para provar sem banco é bastante: as regras que moram em SQL literal
(recortes, ordens, filtros), as que moram em constantes (teto de rodadas, prazo)
e as que moram na forma da resposta (o que o schema tem e o que ele não tem).
O que depende de dado real fica para o banco de verdade.
"""

import inspect
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.auth import usuario_atual
from app.core.limites import limites_de
from app.db.session import get_session
from app.main import app
from app.schemas.proposta import ContrapropostaCriar, PropostaCriar
from app.services import propostas, vitrine

# --------------------------------------------------------------- busca da vitrine


def test_padrao_de_busca_junta_palavras_com_curinga():
    """ "pesquisa professor" tem de achar "Pesquisa de Professores" — é assim que
    o jogador digita, e é a mesma regra do `buscar_cartas` do banco."""
    assert vitrine.padrao_de_busca("pesquisa professor") == "pesquisa%professor"


def test_padrao_de_busca_escapa_curinga_digitado():
    """Sem escapar, buscar por "%" devolveria o catálogo inteiro."""
    assert vitrine.padrao_de_busca("100%") == "100\\%"
    assert vitrine.padrao_de_busca("a_b") == "a\\_b"
    assert vitrine.padrao_de_busca("a\\b") == "a\\\\b"


def test_busca_normaliza_no_banco_e_nao_em_python():
    """Duas definições de "sem acento" só divergem em produção: a do Postgres é a
    que gerou as colunas `busca_pt`/`busca_en`, então é ela que vale."""
    assert "public.normaliza_busca(:padrao)" in vitrine._FEED
    assert "unaccent" not in inspect.getsource(vitrine.padrao_de_busca)


def test_termo_de_uma_letra_nao_filtra():
    """Mesma trava do `buscar_cartas` (`length(t) >= 2`): uma letra casa com meio
    catálogo e não é busca, é ruído."""
    assert "len(padrao) >= 2" in inspect.getsource(vitrine.feed)


# ------------------------------------------------------------------ feed


def test_feed_e_por_carta_e_nao_por_anuncio():
    """Cinco pessoas com o mesmo Charizard são uma linha, não cinco — senão a
    carta mais comum da cidade ocuparia a página inteira."""
    sql = vitrine._FEED
    assert "count(distinct l.user_id) as donos" in sql
    assert "group by l.card_id" in sql


def test_feed_ordena_por_novidade_quando_ninguem_pede_outra_coisa():
    """A vitrine responde "o que apareceu de novo", que é a pergunta que o
    índice idx_listings_vitrine (criado_em desc) foi criado para atender. As
    outras ordens existem para quem já sabe o que procura — o padrão é para
    quem não sabe."""
    assert vitrine.ORDEM_PADRAO == "novidade"
    assert vitrine.ORDENS["novidade"].startswith("mais_recente desc")


def test_feed_exclui_voce_e_quem_esta_bloqueado():
    sql = vitrine._FEED
    assert "l.user_id <> cast(:eu as uuid)" in sql
    assert "p.bloqueado = false" in sql


def test_feed_so_traz_oferta_ativa():
    assert "l.ativo and l.tipo = 'OFERTA'" in vitrine._FEED


def test_filtros_opcionais_nao_viram_consultas_diferentes():
    """Um SQL só, com o ramo constante descartado pelo plano — e o cast explícito
    porque `$1 is null` sozinho não deixa o Postgres inferir o tipo."""
    sql = vitrine._FEED
    assert "cast(:padrao as text) is null" in sql
    assert "cast(:set_code as text) is null" in sql
    assert "cast(:serie as text) is null" in sql
    assert "cast(:raridade as text) is null" in sql


# ------------------------------------------------------------------ ordens


def test_ordem_e_lista_fechada():
    """A ordem entra em SQL por f-string — é a única forma de ordenar por coluna
    variável — e o que impede injeção é a chave ser procurada no dicionário
    antes. Mesmo desenho das caixas de proposta."""
    assert set(vitrine.ORDENS) == {
        "novidade",
        "nome",
        "preco_menor",
        "preco_maior",
        "donos",
    }
    assert vitrine.ORDEM_PADRAO in vitrine.ORDENS
    fonte = inspect.getsource(vitrine.feed)
    assert "if ordem not in ORDENS" in fonte
    assert "ORDENS[ordem]" in fonte


def test_ordem_desconhecida_e_recusada_na_borda():
    """O `pattern` da rota barra antes do serviço, com 422 e campo apontado."""
    esquema = app.openapi()["paths"]["/v1/vitrine"]["get"]["parameters"]
    padrao = next(p for p in esquema if p["name"] == "ordem")["schema"]["pattern"]
    for chave in vitrine.ORDENS:
        assert chave in padrao


def test_preco_vem_do_acabamento_anunciado():
    """Uma reverse não vale o que a normal vale: o preço que ordena a vitrine é
    o do acabamento **daquele anúncio**, não o da impressão comum."""
    sql = vitrine._FEED
    assert "join finishes f on f.id = l.finish_id" in sql
    assert "cp.tipo_tcgplayer = any(f.tipos_tcgplayer)" in sql
    # A mesma preferência de balde que o cliente usa em `precoDoAcabamento`.
    assert "array_position(f.tipos_tcgplayer, cp.tipo_tcgplayer)" in sql
    # E a mesma escolha de campo que `formatarPreco` faz no cliente.
    assert "coalesce(cp.mercado, cp.baixo)" in sql


def test_preco_agrega_as_duas_pontas():
    """`min` para quem ordena por menor preço, `max` para quem ordena por maior:
    a carta com oferta de US$ 5 e de US$ 50 é barata numa lista e cara na outra.
    Uma média esconderia as duas."""
    assert "min(preco.valor) as preco" in vitrine._FEED
    assert "max(preco.valor) as preco_maior" in vitrine._FEED
    assert vitrine.ORDENS["preco_menor"].startswith("preco asc")
    assert vitrine.ORDENS["preco_maior"].startswith("preco_maior desc")


def test_carta_sem_cotacao_vai_para_o_fim():
    """Carta sem preço existe (as promo que a TCGplayer não lista). Abrir a
    lista com elas seria abrir com o que não responde à pergunta."""
    assert "nulls last" in vitrine.ORDENS["preco_menor"]
    assert "nulls last" in vitrine.ORDENS["preco_maior"]


def test_ordem_por_nome_usa_a_coluna_normalizada():
    """A–Z de quem lê em português: sem acento e sem caixa, como a busca."""
    assert "min(coalesce(c.busca_pt, c.busca_en)) as nome_ordem" in vitrine._FEED
    assert vitrine.ORDENS["nome"].startswith("nome_ordem asc")


def test_so_procuro_recorta_pelo_meu_procuro():
    """O filtro que transforma a vitrine em matching manual."""
    sql = vitrine._FEED
    assert "not cast(:so_procuro as boolean)" in sql
    assert "meu.tipo = 'PROCURA' and meu.card_id = l.card_id" in sql


# ------------------------------------------------------------------ acervo


def test_acervo_devolve_o_anuncio_e_nao_so_a_carta():
    """É o `listing_id` que faz a tela virar proposta: os itens entram por
    anúncio, nunca por carta solta."""
    assert "l.id::text as listing_id" in vitrine._ACERVO.text
    assert "listing_id" in vitrine.CartaDoAcervo.model_fields


def test_acervo_marca_o_que_esta_no_meu_procuro():
    """`reciproco` é o que transforma uma lista de cartas em sugestão do que
    pedir — a mesma ideia de `_MAIS_CARTAS`, sem o gate de match."""
    sql = vitrine._ACERVO.text
    assert "meu.tipo = 'PROCURA'" in sql
    assert "order by reciproco desc" in sql


def test_acervo_bloqueado_some_como_se_nao_existisse():
    """404 igual ao de perfil inexistente: confirmar que a conta existe mas está
    bloqueada é contar sobre a moderação a quem não tem nada com isso."""
    fonte = inspect.getsource(vitrine.acervo_de)
    assert "username = :u and bloqueado = false" in fonte
    assert "PERFIL_NAO_ENCONTRADO" in fonte


def test_vitrine_nao_tem_onde_guardar_contato():
    """A vitrine é lida por quem ainda não passou por aceite nenhum — o contato
    continua saindo só dentro do match."""
    for schema in ("CartaNaVitrine", "OfertaNaVitrine", "CartaDoAcervo"):
        propriedades = app.openapi()["components"]["schemas"][schema]["properties"]
        assert not [c for c in propriedades if "contato" in c], schema


def test_quem_tem_a_carta_poe_quem_ja_trocou_primeiro():
    """Entre dois anúncios iguais, o que decide é a pessoa."""
    assert "order by p.trocas_concluidas desc" in vitrine._QUEM_TEM.text


# ------------------------------------------------------- contratos publicados


def test_rotas_da_vitrine_estao_publicadas_e_exigem_login():
    caminhos = app.openapi()["paths"]
    assert "/v1/vitrine" in caminhos
    assert "/v1/vitrine/carta/{card_id}" in caminhos
    assert "/v1/vitrine/acervo/{username}" in caminhos

    client = TestClient(app)
    assert client.get("/v1/vitrine").status_code in (401, 403)
    assert client.get(f"/v1/vitrine/carta/{uuid4()}").status_code in (401, 403)
    assert client.get("/v1/vitrine/acervo/marina").status_code in (401, 403)


def test_rotas_de_proposta_estao_publicadas():
    caminhos = app.openapi()["paths"]
    for rota in (
        "/v1/me/propostas",
        "/v1/me/propostas/{proposta_id}",
        "/v1/me/propostas/{proposta_id}/aceitar",
        "/v1/me/propostas/{proposta_id}/recusar",
        "/v1/me/propostas/{proposta_id}/contrapropor",
        "/v1/me/propostas/{proposta_id}/retirar",
    ):
        assert rota in caminhos, rota


def test_rotas_de_proposta_exigem_login():
    client = TestClient(app)
    assert client.get("/v1/me/propostas").status_code in (401, 403)
    assert client.post(
        "/v1/me/propostas", json={"para": "marina", "quero": [], "ofereco": []}
    ).status_code in (401, 403)
    assert client.post(f"/v1/me/propostas/{uuid4()}/aceitar").status_code in (401, 403)


def test_filtro_da_caixa_e_fechado():
    """As quatro caixas da seção 22.7, e só elas: `caixa` entra em SQL montado
    por f-string, e o que impede injeção é a lista fechada dos dois lados."""
    assert set(propostas.CAIXAS) == {
        "recebidas",
        "enviadas",
        "minha_vez",
        "historico",
    }
    assert set(propostas._FILTROS_DA_CAIXA) == set(propostas.CAIXAS)
    assert set(propostas._ORDEM_DA_CAIXA) == set(propostas.CAIXAS)

    esquema = app.openapi()["paths"]["/v1/me/propostas"]["get"]["parameters"][0]
    for caixa in propostas.CAIXAS:
        assert caixa in esquema["schema"]["pattern"]


def test_caixa_desconhecida_e_recusada_na_borda(monkeypatch):
    async def sem_banco(*_args, **_kwargs):
        return []

    monkeypatch.setattr(propostas, "listar", sem_banco)
    app.dependency_overrides[usuario_atual] = lambda: uuid4()
    app.dependency_overrides[get_session] = lambda: None
    try:
        resposta = TestClient(app).get("/v1/me/propostas?caixa=tudo")
    finally:
        app.dependency_overrides.clear()
    assert resposta.status_code == 422


# --------------------------------------------------------------- as regras


def test_proposta_entra_por_anuncio_e_nao_por_carta():
    """O anúncio é a prova de que a carta existe naquela condição e naquele
    acabamento — e é o sumiço dele que faz a proposta caducar sozinha."""
    assert set(PropostaCriar.model_fields) == {"para", "quero", "ofereco"}
    assert set(ContrapropostaCriar.model_fields) == {"quero", "ofereco"}
    # Sem `para` na contraproposta: a dupla já está definida desde a rodada 1.
    assert "card_id" not in PropostaCriar.model_fields


def test_teto_de_rodadas_e_quatro():
    """Decisão do Eduardo (2026-08-07): com duas idas e voltas de cada lado,
    quase toda negociação que tinha acordo possível acha o acordo."""
    assert propostas.MAX_RODADAS == 4
    fonte = inspect.getsource(propostas.contrapropor)
    assert 'linha["rodada"] >= MAX_RODADAS' in fonte
    assert "RODADA_ESGOTADA" in fonte


def test_prazo_da_rodada_e_de_72h_e_reinicia():
    """Prazo de match é o tempo de marcar um encontro; prazo de proposta é o
    tempo de responder uma pergunta no celular."""
    assert propostas.PRAZO_DA_RODADA == "72 hours"
    assert "expira_em = now() + interval" in inspect.getsource(propostas.contrapropor)


def test_contraproposta_nao_muda_o_status():
    """Não existe status CONTRAPROPOSTA: contrapropor muda de quem é a vez, não
    a situação da proposta — senão "aberta ou contraproposta?" viraria pergunta
    obrigatória em toda listagem."""
    fonte = inspect.getsource(propostas.contrapropor)
    assert "set rodada = rodada + 1" in fonte
    assert "vez_de = cast(:outro as uuid)" in fonte
    assert "set status" not in fonte


def test_contraproposta_sobe_a_rodada_antes_dos_itens():
    """O trigger `proposta_item_coerente` recusa item de rodada futura, então a
    ordem não é estética: invertida, o insert falha."""
    fonte = inspect.getsource(propostas.contrapropor)
    assert fonte.index("set rodada = rodada + 1") < fonte.index("_gravar_itens")


def test_retirar_e_de_quem_nao_tem_a_vez():
    """Quem tem a vez já tem três respostas (aceitar, recusar, contrapropor).
    Retirar é a saída de quem fez a última jogada e se arrependeu antes de o
    outro olhar."""
    fonte = inspect.getsource(propostas.retirar)
    assert 'if linha["vez_de_id"] == str(user_id):' in fonte
    assert "NAO_E_SUA_JOGADA" in fonte


def test_responder_exige_ser_a_vez():
    for funcao in (propostas.aceitar, propostas.recusar, propostas.contrapropor):
        assert "_exigir_minha_vez" in inspect.getsource(funcao), funcao.__name__


def test_toda_acao_exige_proposta_aberta():
    for funcao in (
        propostas.aceitar,
        propostas.recusar,
        propostas.contrapropor,
        propostas.retirar,
    ):
        assert "_exigir_aberta" in inspect.getsource(funcao), funcao.__name__


# ---------------------------------------------------------------- o aceite


def test_hash_do_match_nao_colide_com_a_sugestao_do_motor():
    """`DIRETO:{a}:{b}` é único por par e já está ocupado pela sugestão que o
    matcher mantém para a mesma dupla — com ele, o unique derrubaria o aceite."""
    proposta_id = str(uuid4())
    assert propostas.hash_grupo(proposta_id) == f"PROPOSTA:{proposta_id}"
    assert "DIRETO" not in propostas.hash_grupo(proposta_id)


def test_aceite_cria_match_ja_aceito_pelos_dois():
    """A negociação inteira foi o aceite: não há segundo aceite a esperar, e é
    isso que faz o contato aparecer na hora."""
    fonte = inspect.getsource(propostas.aceitar)
    assert "insert into matches (tipo, status, score, hash_grupo, expira_em)" in fonte
    assert "'PROPOSTA', 'ACEITO'" in fonte
    assert "0, true, now()" in fonte and "1, true, now()" in fonte


def test_aceite_recusa_carta_que_saiu_do_ar():
    """Marcar um encontro para entregar o que não existe mais é o pior desfecho
    possível — pior que a proposta morrer."""
    fonte = inspect.getsource(propostas.aceitar)
    assert "ANUNCIO_INDISPONIVEL" in fonte
    assert "left join listings l on l.id = pi.listing_id and l.ativo" in fonte


def test_aceite_leva_os_itens_da_rodada_corrente():
    fonte = inspect.getsource(propostas.aceitar)
    assert "insert into match_items" in fonte
    assert "where proposta_id = cast(:p as uuid) and rodada = :rodada" in fonte


def test_aceite_deixa_rastro_da_proposta_no_match():
    """Separar a troca que veio da vitrine da que veio do motor é a pergunta que
    decide se a vitrine fica."""
    assert '"proposta"' in inspect.getsource(propostas.aceitar)


def test_proposta_nao_mexe_em_reputacao():
    """Recusar não é furar: é a resposta que o produto está pedindo, e cobrá-la
    faria as pessoas pararem de responder."""
    fonte = inspect.getsource(propostas)
    assert "trocas_furadas" not in fonte
    assert "trocas_concluidas" not in fonte
    assert "trocas_desistidas" not in fonte


def test_proposta_nao_reserva_a_carta():
    """Reservar seria mentir sobre disponibilidade em troca de nada: não há
    custódia, a carta física está com a pessoa (seção 22.6)."""
    fonte = inspect.getsource(propostas)
    assert "set ativo = false" not in fonte
    assert "update listings" not in fonte


# ------------------------------------------------------------- antiabuso


def test_uma_negociacao_por_dupla_e_decidida_pelo_indice():
    """Contar antes perderia a corrida entre dois envios simultâneos — e o caso
    real é justamente o de duas telas montadas ao mesmo tempo."""
    fonte = inspect.getsource(propostas.abrir)
    assert "idx_proposta_uma_por_dupla" in fonte
    assert "PROPOSTA_JA_ABERTA" in fonte


def test_teto_diario_vem_do_plano():
    """Constraint não distingue FREE de PRO, então o teto mora em limites.py."""
    assert limites_de("FREE").propostas_por_dia < limites_de("PRO").propostas_por_dia
    fonte = inspect.getsource(propostas._checar_limite_diario)
    assert "propostas_por_dia" in fonte
    assert "LIMITE_DE_PROPOSTAS" in fonte
    # Janela móvel: a cota não volta de presente à meia-noite.
    assert "now() - interval '24 hours'" in fonte


def test_itens_sao_dos_donos_certos():
    """Sem isto, uma proposta poderia oferecer a carta de um terceiro."""
    fonte = inspect.getsource(propostas._validar_itens)
    assert "user_id = cast(:dono as uuid)" in fonte
    assert "ativo and tipo = 'OFERTA'" in fonte
    assert "ANUNCIO_INDISPONIVEL" in fonte


def test_abrir_valida_cada_lado_com_o_dono_dele():
    fonte = inspect.getsource(propostas.abrir)
    assert '_validar_itens(session, destinatario["id"], dados.quero)' in fonte
    assert "_validar_itens(session, str(user_id), dados.ofereco)" in fonte


def test_proposta_para_si_mesmo_e_barrada_com_mensagem():
    """O check `proposta_dois_lados` também barraria — mas em 500, não em erro
    de formulário."""
    assert "PROPOSTA_PARA_SI_MESMO" in inspect.getsource(propostas.abrir)


# ------------------------------------------------------- leitura e perspectiva


def _linha(autor: str, destinatario: str, rodada: int = 1) -> dict:
    return {
        "id": str(uuid4()),
        "status": "ABERTA",
        "rodada": rodada,
        "criada_em": "2026-08-07T12:00:00+00:00",
        "expira_em": "2026-08-10T12:00:00+00:00",
        "respondida_em": None,
        "match_id": None,
        "autor_id": autor,
        "destinatario_id": destinatario,
        "vez_de_id": destinatario,
        "autor": "eduardo",
        "autor_nome": "Eduardo",
        "destinatario": "marina",
        "destinatario_nome": "Marina",
    }


def _item(rodada: int, de: str, para: str, card: str) -> dict:
    return {
        "proposta_id": "p",
        "rodada": rodada,
        "listing_id": str(uuid4()),
        "card_id": card,
        "de_user_id": de,
        "para_user_id": para,
        "condicao": "NM",
        "finish_id": 1,
        "quantidade": 1,
        "disponivel": True,
    }


def test_quem_jogou_a_rodada_alterna():
    """Rodada 1 é sempre de quem abriu, e a vez alterna a cada rodada."""
    a, b = str(uuid4()), str(uuid4())
    linha = _linha(a, b)
    assert propostas._quem_jogou(linha, 1) == (a, "eduardo")
    assert propostas._quem_jogou(linha, 2) == (b, "marina")
    assert propostas._quem_jogou(linha, 3) == (a, "eduardo")


def test_rodada_e_lida_pela_perspectiva_de_quem_jogou():
    """ "você pediu X, ela ofereceu Y no lugar" só se escreve se cada rodada
    souber quem pediu o quê."""
    a, b = str(uuid4()), str(uuid4())
    linha = _linha(a, b, rodada=2)
    itens = [
        _item(1, de=b, para=a, card="charizard"),  # eduardo pediu
        _item(1, de=a, para=b, card="mewtwo"),  # eduardo ofereceu
        _item(2, de=a, para=b, card="pikachu"),  # marina pediu
        _item(2, de=b, para=a, card="mewtwo"),  # marina ofereceu
    ]

    rodadas = propostas._monta_rodadas(linha, itens)
    assert [r.rodada for r in rodadas] == [1, 2]

    primeira, segunda = rodadas
    assert primeira.por == "eduardo"
    assert [i.card_id for i in primeira.quero] == ["charizard"]
    assert [i.card_id for i in primeira.ofereco] == ["mewtwo"]

    assert segunda.por == "marina"
    assert [i.card_id for i in segunda.quero] == ["pikachu"]
    assert [i.card_id for i in segunda.ofereco] == ["mewtwo"]


def test_resumo_traz_a_rodada_corrente_e_de_quem_e_a_vez():
    """A lista precisa da carta em jogo: sem ela seriam N requisições para
    montar a tela que a pessoa abre para decidir o que responder."""
    a, b = str(uuid4()), str(uuid4())
    linha = _linha(a, b, rodada=2)
    itens = [
        _item(1, de=b, para=a, card="charizard"),
        _item(2, de=a, para=b, card="pikachu"),
    ]

    de_quem_recebeu = propostas._resumo(linha, b, itens)
    assert de_quem_recebeu.minha_vez is True
    assert de_quem_recebeu.vez_de == "marina"
    assert de_quem_recebeu.com == "eduardo"
    assert de_quem_recebeu.atual is not None
    assert de_quem_recebeu.atual.rodada == 2

    de_quem_abriu = propostas._resumo(linha, a, itens)
    assert de_quem_abriu.minha_vez is False
    assert de_quem_abriu.com == "marina"


def test_itens_de_varias_propostas_saem_numa_consulta_so():
    """Uma ida ao banco para a caixa inteira, não duas por proposta — o mesmo
    motivo do lote no feed de matches."""
    fonte = inspect.getsource(propostas.listar)
    assert "_itens_das_propostas" in fonte
    assert "for linha in linhas" in fonte.split("_itens_das_propostas")[1]
    assert "expanding=True" in inspect.getsource(propostas)


def test_disponibilidade_do_item_vem_do_anuncio_agora():
    """A cópia guardada mantém o histórico legível; o `listing_id` diz se a
    carta ainda está no ar — e é o que a tela usa para avisar que caducou."""
    assert "(l.id is not null) as disponivel" in propostas._ITENS.text


def test_detalhe_traz_todas_as_rodadas():
    fonte = inspect.getsource(propostas.obter)
    assert "rodadas=_monta_rodadas(linha, itens)" in fonte


def test_quem_nao_participa_recebe_404():
    """404 e não 403: confirmar que a proposta existe já entregaria informação."""
    assert "cast(:eu as uuid) in (p.autor_id, p.destinatario_id)" in (
        propostas._UMA_PROPOSTA.text
    )
    assert "PROPOSTA_NAO_ENCONTRADA" in inspect.getsource(propostas._nao_encontrada)


# ------------------------------------------------------------------ expiração


def test_expiracao_so_toca_no_que_esta_aberto():
    fonte = inspect.getsource(propostas.expirar_propostas)
    assert "where status = 'ABERTA' and expira_em <= now()" in fonte


def _corpo(fn) -> str:
    """A fonte sem a docstring.

    Mesma ideia do `_codigo` de test_matching: a docstring destas funções explica
    justamente o que elas *não* fazem, e procurar o termo na fonte crua acharia a
    explicação — o teste passaria afirmando o contrário do que quer.
    """
    return inspect.getsource(fn).split('"""')[-1]


def test_expiracao_nao_marca_como_respondida():
    """Expirar não é responder, e é essa diferença que o histórico mostra."""
    assert "respondida_em" not in _corpo(propostas.expirar_propostas)


def test_expiracao_nao_commita():
    """Quem chama fecha a transação — a mesma regra de `expirar_vencidos`."""
    assert "commit" not in _corpo(propostas.expirar_propostas)


def test_datas_da_proposta_saem_em_iso_8601():
    """`::text` do Postgres sai com espaço no lugar do T e o Safari do iOS
    devolve `Invalid Date`. O app é lido no celular."""
    schemas = app.openapi()["components"]["schemas"]
    for campo in ("criada_em", "expira_em"):
        assert schemas["PropostaOut"]["properties"][campo]["format"] == "date-time"
