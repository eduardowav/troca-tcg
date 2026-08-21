"""Máquina de estados do match: as transições que faltavam ser guardadas.

Achados F-01 e F-02 da auditoria de 2026-08-18, e os dois vêm do mesmo defeito
de forma: **ler o estado, decidir, e gravar sem conferir que o estado ainda é o
mesmo**. É o padrão que o resto do código já evita — `prorrogar` grava com
`where prorrogacoes < :limite`, `propostas.responder` com `where status =
'ABERTA'` — e que estas duas funções não seguiam.

O que se prova aqui não é o SQL rodar. É o que acontece quando a chamada chega
fora de hora ou duas vezes ao mesmo tempo:

- `responder` num match que já teve desfecho não reescreve o desfecho;
- a conclusão que perde a corrida não credita reputação nem baixa estoque.

Sem Postgres, como o resto da suíte: o dublê é quem decide o `rowcount`, que é
exatamente a variável que as correções passaram a consultar.
"""

from uuid import uuid4

import pytest

from app.core.errors import RegraNegocio
from app.services import matching, notificacoes, propostas


class SessaoFalsa:
    """Dublê com `rowcount` programável.

    `rowcounts` é consumido pelos `execute` na ordem; o que faltar vale 1. É o
    que permite encenar a transação que **perde** a corrida — aquela cujo
    `update ... where status = ...` não acha mais a linha.
    """

    def __init__(self, escalares=None, rowcounts=None):
        self.escalares = list(escalares or [])
        self.rowcounts = list(rowcounts or [])
        self.sqls: list[str] = []
        self.params: list[dict] = []
        self.commits = 0

    async def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        n = self.rowcounts.pop(0) if self.rowcounts else 1

        class Res:
            rowcount = n

        return Res()

    async def scalar(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return self.escalares.pop(0) if self.escalares else None

    async def commit(self):
        self.commits += 1


async def _match_qualquer(*_args, **_kwargs):
    return "match"


async def _nada(*_args, **_kwargs):
    return None


@pytest.fixture
def sem_efeito_colateral(monkeypatch):
    """Silencia o que vem depois da decisão: aviso e releitura do match."""
    monkeypatch.setattr(matching, "obter_match", _match_qualquer)
    monkeypatch.setattr(notificacoes, "match_aceito", _nada)
    monkeypatch.setattr(notificacoes, "match_concluido", _nada)
    monkeypatch.setattr(notificacoes, "arroba", _nada)


def _gravou_status(sessao: SessaoFalsa) -> bool:
    return any("update matches" in s and "set status" in s for s in sessao.sqls)


# ------------------------------------------------- F-01 · responder fora de hora
#
# Antes da correção, `responder` gravava `status` sem olhar o status anterior.
# A tela só mostra os botões enquanto a troca espera resposta — e é justamente
# por isso que a regra precisa estar no servidor: quem chama a API direto não
# passa pela tela.


@pytest.mark.parametrize(
    "status", ["ACEITO", "CONCLUIDO", "RECUSADO", "EXPIRADO", "CANCELADO"]
)
@pytest.mark.parametrize("aceitou", [True, False])
async def test_responder_so_vale_enquanto_espera_resposta(
    sem_efeito_colateral, status, aceitou
):
    """Todo status de desfecho recusa, e não grava nada.

    O caso que mais custa é `CONCLUIDO` com `aceitou=False`: apagava do
    histórico uma troca que aconteceu, deixando de pé os pontos de reputação que
    ela já tinha creditado. E `EXPIRADO` com `aceitou=True` ressuscitava a troca
    vencida, furando o prazo que o `expirar_vencidos` existe para aplicar.
    """
    sessao = SessaoFalsa(escalares=[status])

    with pytest.raises(RegraNegocio) as e:
        await matching.responder(sessao, uuid4(), uuid4(), aceitou)  # type: ignore[arg-type]

    assert e.value.codigo == "MATCH_JA_RESPONDIDO"
    assert e.value.status_code == 409
    assert not _gravou_status(sessao)
    assert sessao.commits == 0


@pytest.mark.parametrize("status", ["SUGERIDO", "PENDENTE"])
async def test_responder_funciona_nos_dois_status_que_esperam_resposta(
    sem_efeito_colateral, status
):
    """A correção não pode fechar o caminho que ela existe para proteger.

    **`SUGERIDO` está aqui por causa de um defeito de três dias.** A trava
    chegou em 2026-08-18 exigindo `PENDENTE`, e o teste de cima percorria cinco
    status ruins sem perceber que o status *bom* mais comum ficara de fora: todo
    match nasce `SUGERIDO`, então o primeiro "tenho interesse" de qualquer troca
    respondia 409 dizendo que ela já tinha desfecho. Ninguém conseguiu aceitar
    uma troca até 2026-08-21.

    A lista de casos ruins estava completa; a de casos bons, não. Uma trava se
    prova pelos dois lados.
    """
    # o status; ninguém mais falta; o outro participante.
    sessao = SessaoFalsa(escalares=[status, 0, str(uuid4())])

    await matching.responder(sessao, uuid4(), uuid4(), True)  # type: ignore[arg-type]

    assert _gravou_status(sessao)
    assert any(p.get("s") == "ACEITO" for p in sessao.params)
    assert sessao.commits == 1


@pytest.mark.parametrize("status", ["SUGERIDO", "PENDENTE"])
async def test_recusar_funciona_nos_dois_status_que_esperam_resposta(
    sem_efeito_colateral, status
):
    sessao = SessaoFalsa(escalares=[status])

    await matching.responder(sessao, uuid4(), uuid4(), False)  # type: ignore[arg-type]

    assert any(p.get("s") == "RECUSADO" for p in sessao.params)
    assert sessao.commits == 1


async def test_aceite_de_um_lado_so_deixa_pendente(sem_efeito_colateral):
    """Falta o outro: o match segue PENDENTE e o contato não é liberado."""
    sessao = SessaoFalsa(escalares=["PENDENTE", 1, str(uuid4())])

    await matching.responder(sessao, uuid4(), uuid4(), True)  # type: ignore[arg-type]

    assert any(p.get("s") == "PENDENTE" for p in sessao.params)


async def test_a_escrita_do_status_carrega_a_propria_guarda(sem_efeito_colateral):
    """A condição está no `update`, e não só na leitura anterior.

    A trava de `_status_do_participante` já serializa; esta condição é a camada
    que sobrevive a alguém remover a trava sem perceber o que ela segurava.

    **E ela precisa conhecer os mesmos status que a trava.** Enquanto dizia só
    `status = 'PENDENTE'`, o primeiro aceite de um match `SUGERIDO` não gravava
    nada nem quando a trava deixasse passar — a requisição responderia 200 e o
    match continuaria parado. Uma condição que some sem levantar erro nenhum só
    se pega olhando o SQL, e é o que este teste faz.
    """
    sessao = SessaoFalsa(escalares=["PENDENTE"])
    await matching.responder(sessao, uuid4(), uuid4(), False)  # type: ignore[arg-type]

    escrita = next(
        s for s in sessao.sqls if "update matches" in s and "set status" in s
    )
    assert "'SUGERIDO'" in escrita and "'PENDENTE'" in escrita


# ------------------------------------- F-02 · a conclusão que perde a corrida
#
# Duas requisições simultâneas do mesmo usuário passavam as duas pelo `if not
# faltam`: +1 em `trocas_concluidas` cada uma, e baixa de estoque dobrada.
# Agora quem credita é quem muda a linha, e só uma transação consegue mudá-la.


def _creditou_reputacao(sessao: SessaoFalsa) -> bool:
    return any("trocas_concluidas + 1" in s for s in sessao.sqls)


def _baixou_estoque(sessao: SessaoFalsa) -> bool:
    return any("greatest(l.quantidade" in s for s in sessao.sqls)


async def test_conclusao_que_perde_a_corrida_nao_credita(sem_efeito_colateral):
    """`rowcount == 0` significa que outra transação já fechou o match.

    É o clique duplo: as duas chamadas chegam com o match em ACEITO e com o
    outro lado já confirmado, as duas contam `faltam = 0`, e as duas tentam
    fechar. A que perde não pode creditar nada — antes da correção, creditava.
    """
    # ACEITO para `_exigir_aceito`; ninguém falta; o outro participante.
    # rowcounts: a gravação da confirmação passa, o fechamento do match não.
    sessao = SessaoFalsa(escalares=["ACEITO", 0, None], rowcounts=[1, 1, 0])

    await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]

    assert not _creditou_reputacao(sessao)
    assert not _baixou_estoque(sessao)


async def test_conclusao_que_ganha_a_corrida_credita_uma_vez(sem_efeito_colateral):
    """E a que ganha faz o trabalho inteiro — a correção não pode travar as duas."""
    sessao = SessaoFalsa(escalares=["ACEITO", 0, None], rowcounts=[1, 1, 1])

    await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]

    assert _creditou_reputacao(sessao)
    assert _baixou_estoque(sessao)


async def test_fechamento_do_match_exige_status_aceito(sem_efeito_colateral):
    sessao = SessaoFalsa(escalares=["ACEITO", 0, None])
    await matching.confirmar_conclusao(sessao, uuid4(), uuid4())  # type: ignore[arg-type]

    fechamento = next(s for s in sessao.sqls if "status = 'CONCLUIDO'" in s)
    assert "status = 'ACEITO'" in fechamento


# ------------------------------------------- a trava que serializa os desfechos


async def test_leitura_do_status_trava_a_linha_do_match():
    """`for update of m` é o que faz a segunda requisição esperar a primeira.

    Sem ela, `concluir`, `desistir`, `furar` e `prorrogar` são todos
    ler-decidir-gravar, e duas chamadas simultâneas passam as duas pela regra.
    A trava é sobre `matches` e só sobre ela (`of m`): uma linha só, então não há
    ordem de aquisição para dar errado entre as quatro.
    """
    sessao = SessaoFalsa(escalares=["ACEITO"])
    await matching._status_do_participante(sessao, uuid4(), uuid4())  # type: ignore[arg-type]

    assert "for update of m" in sessao.sqls[0]


# ---------------------------------------- F-06 · o teto de propostas por dia


async def test_teto_de_propostas_trava_a_pessoa_antes_de_contar():
    """Contar-e-depois-gravar deixa dez chamadas simultâneas passarem juntas.

    O limite existe para impedir disparo em massa, e sem a trava era furado
    exatamente pelo disparo em massa. A trava é na linha de quem abre a
    proposta, que é a unidade do limite: duas pessoas não esperam uma pela
    outra, a mesma pessoa abrindo dez de uma vez espera.
    """
    sessao = SessaoFalsa(escalares=["FREE", 0])
    await propostas._checar_limite_diario(sessao, uuid4())  # type: ignore[arg-type]

    leitura = sessao.sqls[0]
    assert "select plano from profiles" in leitura
    assert "for update" in leitura


async def test_teto_de_propostas_ainda_recusa_quem_estourou():
    sessao = SessaoFalsa(escalares=["FREE", 999])

    with pytest.raises(RegraNegocio) as e:
        await propostas._checar_limite_diario(sessao, uuid4())  # type: ignore[arg-type]

    assert e.value.codigo == "LIMITE_DE_PROPOSTAS"
    assert e.value.status_code == 429
