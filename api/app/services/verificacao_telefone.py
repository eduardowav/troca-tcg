"""Verificação do número de WhatsApp por código de uso único.

**Construída e não ligada.** Não há tela, o cadastro não pede nada e o roteador
recusa enquanto não houver credencial da Meta. O que existe aqui é a regra —
gerar, guardar, conferir, limitar — pronta para o dia em que o pedido do código
entrar no primeiro aceite de troca. Ver o bloco "Cadastro sem verificação" na
seção 17 da doc, e a migração `db/schema/26_verificacao_telefone.sql`.

**O código nunca é gravado.** O banco guarda o SHA-256; o número em claro vive
na memória do processo, vai para o WhatsApp e acaba. A conferência compara hash
com hash por `compare_digest`, e não `==`: comparação de string devolve mais
cedo no primeiro byte diferente, e isso é um canal de tempo que, com seis
dígitos e reenvio livre, é explorável de verdade.

**Os limites moram aqui, e não no slowapi.** O rate limit global do `main.py`
não roda (item 1 do bloco de segurança da seção 17), e mesmo que rodasse ele
conta requisição por IP — o que precisa ser contado aqui é mensagem por número,
porque cada uma custa dinheiro e queima cota diária na Meta. Um teto que o banco
sustenta continua de pé quando o processo reinicia, quando há duas instâncias e
quando alguém troca de IP.
"""

import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.services import whatsapp

logger = logging.getLogger(__name__)

#: Seis dígitos: é o que cabe na memória de quem lê a mensagem e volta para o
#: app. A força bruta que seis dígitos permitiriam é fechada pelo teto de
#: tentativas, não pelo tamanho do código.
DIGITOS = 6
#: Quanto tempo o código vale. Dez minutos cobrem "abrir o WhatsApp, ler, voltar"
#: com folga, e deixam curta a janela de quem tenta adivinhar.
VALIDADE = timedelta(minutes=10)
#: Espera entre dois envios para o mesmo número. Segura o dedo nervoso no botão
#: "reenviar", que é o gasto mais bobo que este fluxo pode ter.
ESPERA_ENTRE_ENVIOS = timedelta(seconds=60)
#: Mensagens por número em 24h. É o teto que protege o saldo e a cota da Meta.
#: Segue o telefone, não a conta: criar conta é de graça.
ENVIOS_POR_DIA = 5
#: Erros por código antes de ele morrer.
TENTATIVAS_MAX = 5

_SO_DIGITOS = re.compile(r"\D+")


def normalizar(telefone: str) -> str:
    """`(91) 98765-4321` vira `91987654321`.

    O 55 é removido quando vem na frente de um número já completo — a pessoa
    copia do próprio WhatsApp e ele aparece. Guardar o número em formato único é
    o que faz o teto diário ser um teto: escrito de três jeitos, o mesmo
    telefone contaria três vezes.
    """
    digitos = _SO_DIGITOS.sub("", telefone or "")
    if len(digitos) in (12, 13) and digitos.startswith("55"):
        digitos = digitos[2:]
    if len(digitos) not in (10, 11):
        raise RegraNegocio(
            "TELEFONE_INVALIDO",
            "Informe o número com DDD, como (91) 98765-4321.",
            campo="telefone",
        )
    return digitos


def _hash(codigo: str) -> str:
    return hashlib.sha256(codigo.encode()).hexdigest()


def _gerar_codigo() -> str:
    """Seis dígitos de fonte criptográfica.

    `secrets` e não `random`: o segundo é previsível a partir de algumas saídas,
    e um código de verificação previsível não verifica nada.
    """
    return f"{secrets.randbelow(10**DIGITOS):0{DIGITOS}d}"


def _agora() -> datetime:
    return datetime.now(timezone.utc)


async def solicitar(
    session: AsyncSession, user_id: UUID, telefone: str
) -> dict[str, object]:
    """Gera o código, guarda o hash e manda pelo WhatsApp.

    Devolve `expira_em` e `reenviar_em` — o segundo é o que a tela usa para
    desabilitar o botão de reenvio sem precisar de um relógio do servidor.

    O envio acontece **depois** da gravação e antes do commit do `get_session`:
    se o WhatsApp falhar, o erro sobe, a transação é desfeita e o código gravado
    some junto. O contrário deixaria o teto diário consumido por uma mensagem
    que ninguém recebeu.
    """
    numero = normalizar(telefone)
    agora = _agora()

    ultimo = (
        await session.execute(
            text(
                "select criado_em from phone_verifications "
                "where telefone = :tel order by criado_em desc limit 1"
            ),
            {"tel": numero},
        )
    ).scalar()
    if ultimo is not None and agora - ultimo < ESPERA_ENTRE_ENVIOS:
        faltam = int((ESPERA_ENTRE_ENVIOS - (agora - ultimo)).total_seconds())
        raise RegraNegocio(
            "AGUARDE_PARA_REENVIAR",
            f"Espere {faltam} segundos para pedir outro código.",
            status_code=429,
        )

    envios_hoje = (
        await session.execute(
            text(
                "select count(*) from phone_verifications "
                "where telefone = :tel and criado_em > :desde"
            ),
            {"tel": numero, "desde": agora - timedelta(days=1)},
        )
    ).scalar() or 0
    if envios_hoje >= ENVIOS_POR_DIA:
        raise RegraNegocio(
            "LIMITE_DE_CODIGOS",
            "Muitos códigos pedidos para este número hoje. Tente amanhã.",
            status_code=429,
        )

    codigo = _gerar_codigo()
    expira_em = agora + VALIDADE

    await session.execute(
        text(
            "insert into phone_verifications "
            "(user_id, telefone, codigo_hash, expira_em) "
            "values (:uid, :tel, :hash, :exp)"
        ),
        {
            "uid": str(user_id),
            "tel": numero,
            "hash": _hash(codigo),
            "exp": expira_em,
        },
    )

    await whatsapp.enviar_codigo(numero, codigo)

    return {"expira_em": expira_em, "reenviar_em": agora + ESPERA_ENTRE_ENVIOS}


async def confirmar(session: AsyncSession, user_id: UUID, codigo: str) -> datetime:
    """Confere o código e carimba o perfil. Devolve o instante da verificação.

    Só o pedido mais recente da pessoa vale. Pedir um código novo invalida o
    anterior na prática — e é o que a pessoa espera, porque foi o último que ela
    recebeu.
    """
    linha = (
        (
            await session.execute(
                text(
                    "select id, telefone, codigo_hash, expira_em, tentativas "
                    "from phone_verifications "
                    "where user_id = :uid and confirmado_em is null "
                    "order by criado_em desc limit 1"
                ),
                {"uid": str(user_id)},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        raise RegraNegocio(
            "CODIGO_NAO_SOLICITADO",
            "Peça um código antes de confirmar.",
            status_code=404,
        )

    agora = _agora()
    if linha["expira_em"] <= agora:
        raise RegraNegocio(
            "CODIGO_EXPIRADO", "Esse código venceu. Peça outro.", campo="codigo"
        )
    if linha["tentativas"] >= TENTATIVAS_MAX:
        raise RegraNegocio(
            "CODIGO_BLOQUEADO",
            "Muitas tentativas para este código. Peça outro.",
            campo="codigo",
            status_code=429,
        )

    informado = _SO_DIGITOS.sub("", codigo or "")
    if not secrets.compare_digest(_hash(informado), linha["codigo_hash"]):
        # A tentativa é gravada mesmo com a resposta sendo erro: é a contagem que
        # fecha a porta da força bruta, e ela não pode depender de o cliente
        # colaborar. Update solto, fora de qualquer condição de corrida que
        # importe — duas tentativas simultâneas contarem como uma só encurta o
        # teto em uma unidade, o que é irrelevante diante de 10⁶ combinações.
        await session.execute(
            text(
                "update phone_verifications set tentativas = tentativas + 1 "
                "where id = :id"
            ),
            {"id": linha["id"]},
        )
        restam = TENTATIVAS_MAX - linha["tentativas"] - 1
        raise RegraNegocio(
            "CODIGO_INCORRETO",
            (
                "Código incorreto. Confira a mensagem e tente de novo."
                if restam > 0
                else "Código incorreto. Peça outro para tentar de novo."
            ),
            campo="codigo",
        )

    await session.execute(
        text("update phone_verifications set confirmado_em = :agora where id = :id"),
        {"agora": agora, "id": linha["id"]},
    )
    # O número confirmado passa a ser o do perfil. Cobre os dois casos com o
    # mesmo caminho: confirmar o que já estava lá, e trocar de número — que é
    # sempre uma troca seguida de confirmação, nunca uma troca solta.
    await session.execute(
        text(
            "update profiles set contato_visivel = :tel, contato_verificado_em = :agora "
            "where id = :uid"
        ),
        {"tel": _formatar(linha["telefone"]), "agora": agora, "uid": str(user_id)},
    )
    return agora


async def situacao(session: AsyncSession, user_id: UUID) -> dict[str, object]:
    """Se o número desta conta já foi verificado, e quando."""
    linha = (
        (
            await session.execute(
                text(
                    "select contato_visivel, contato_verificado_em "
                    "from profiles where id = :uid"
                ),
                {"uid": str(user_id)},
            )
        )
        .mappings()
        .first()
    )
    if linha is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO", "Perfil ainda não criado.", status_code=404
        )
    return {
        "telefone": linha["contato_visivel"],
        "verificado_em": linha["contato_verificado_em"],
        "disponivel": whatsapp.ativo(),
    }


def _formatar(digitos: str) -> str:
    """`91987654321` vira `(91) 98765-4321` — o formato que o app já exibe."""
    ddd, resto = digitos[:2], digitos[2:]
    meio = resto[:-4]
    return f"({ddd}) {meio}-{resto[-4:]}"
