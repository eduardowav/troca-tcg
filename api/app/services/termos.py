"""Aceite de termos — o do cadastro e o da revelação de contato.

O aceite do cadastro mora em `services/profiles.py`, junto da criação do perfil.
Aqui fica o segundo, que a seção 4.2 chama de **o mais importante dos quatro**:
o instante em que a pessoa sai da plataforma e entra numa negociação pessoal.

**Este módulo existe porque um modal não é uma trava.** O jeito barato de
construir isto seria uma caixa no frontend cobrindo um contato que a API já
mandou — e aí o contato está no JSON, legível por qualquer um que abra as
ferramentas do navegador, e o registro do aceite prova que a pessoa clicou num
botão, não que ela viu o texto antes do dado. O que se quer provar é o contrário:
que o contato **não existia** deste lado antes do aceite.

Por isso a decisão fica no servidor. `obter_match` só serializa
`contato_visivel` para quem já tem linha em `term_acceptances` com contexto
`REVELACAO_CONTATO` para aquele match, e a única forma de criar essa linha é
`POST /v1/matches/{id}/contato`.

**O aceite é por match, não por pessoa.** Um aceite global seria assinado uma vez
na vida e valeria para toda troca futura — e a isenção fala de *uma* combinação,
com *uma* pessoa, num *um* encontro. Registrar o `match_id` é o que faz o
documento significar alguma coisa no dia em que for preciso mostrá-lo.

**A versão é gravada junto.** `TERMOS_VERSAO` muda quando o texto muda; sem ela,
o registro provaria que alguém aceitou algo, sem dizer o quê.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

#: O contexto gravado na coluna `contexto` de `term_acceptances`. O outro valor
#: em uso é `CADASTRO`, escrito por `services/profiles.py`.
REVELACAO_CONTATO = "REVELACAO_CONTATO"


async def aceitou_revelacao(
    session: AsyncSession, user_id: UUID, match_id: UUID
) -> bool:
    """Esta pessoa já aceitou a isenção para este match?

    Não confere a versão de propósito. Quem aceitou o texto de julho e voltou ao
    mesmo match em agosto já leu a isenção naquele encontro — pedir de novo por
    causa de uma vírgula reabriria uma caixa bloqueante na frente de quem só quis
    reler um telefone. O que a versão gravada serve é para provar *o que* foi
    aceito, não para decidir quem precisa aceitar de novo.
    """
    return bool(
        await session.scalar(
            text("""
                select 1 from term_acceptances
                where user_id = cast(:u as uuid)
                  and match_id = cast(:m as uuid)
                  and contexto = :c
                limit 1
            """),
            {"u": str(user_id), "m": str(match_id), "c": REVELACAO_CONTATO},
        )
    )


async def registrar_revelacao(
    session: AsyncSession, user_id: UUID, match_id: UUID, ip: str | None
) -> None:
    """Grava o aceite da isenção antes de o contato ser revelado.

    Idempotente: reabrir a mesma troca não empilha linhas. A primeira é a que
    tem valor probatório — ela marca o instante em que a pessoa leu o texto pela
    primeira vez naquele encontro, e é essa data que interessa.

    Não commita: quem chama fecha a transação, como o resto dos serviços.
    """
    if await aceitou_revelacao(session, user_id, match_id):
        return

    await session.execute(
        text("""
            insert into term_acceptances (user_id, contexto, versao, match_id, ip)
            values (cast(:u as uuid), :c, :v, cast(:m as uuid), cast(:ip as inet))
        """),
        {
            "u": str(user_id),
            "c": REVELACAO_CONTATO,
            "v": settings.TERMOS_VERSAO,
            "m": str(match_id),
            "ip": ip,
        },
    )
