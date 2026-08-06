"""Regra de negócio de denúncia.

A denúncia é o único lugar do app em que alguém fala sobre outra pessoa para
nós, e não para ela. Por isso ela não muda nada visível: não bloqueia, não
suspende, não mexe em reputação. Reputação já tem dono — sobe e desce pelos
desfechos do match, que exigem os dois lados (services/matching). Se denunciar
mexesse no número, bastaria um clique unilateral para derrubar alguém, e a
denúncia viraria arma em vez de canal.

O que ela faz é gerar uma linha para uma pessoa ler depois. É pouco de propósito
e é honesto: a moderação de uma comunidade local de trocas é humana.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RegraNegocio
from app.schemas.report import DenunciaCriar, DenunciaOut


async def denunciar(
    session: AsyncSession, user_id: UUID, match_id: UUID, dados: DenunciaCriar
) -> DenunciaOut:
    """Registra uma denúncia sobre a outra pessoa desta troca.

    Não exige que o match tenha terminado, nem que tenha sido aceito. `furou` e
    `concluir` exigem ACEITO porque descrevem um encontro; denúncia descreve
    conduta, e conduta ruim aparece antes do encontro — quem manda o contato
    aceitando só para vender já fez o que se denuncia, e mandar a pessoa esperar
    o prazo vencer para poder relatar é o app protegendo o denunciado.
    """
    denunciado = await session.scalar(
        text("""
            select outro.user_id::text
            from match_participants eu
            join match_participants outro
              on outro.match_id = eu.match_id and outro.user_id <> eu.user_id
            where eu.match_id = :m and eu.user_id = :u
            limit 1
        """),
        {"m": str(match_id), "u": str(user_id)},
    )
    # 404 e não 403, como no resto de matching: para quem não participa da troca,
    # ela não existe — confirmar que existe já entregaria informação.
    if denunciado is None:
        raise RegraNegocio(
            "MATCH_NAO_ENCONTRADO", "Match não encontrado.", status_code=404
        )

    try:
        linha = (
            (
                await session.execute(
                    text("""
                        insert into user_reports
                          (autor_id, denunciado_id, match_id, motivo, descricao)
                        values (:autor, :denunciado, :m, :motivo, :descricao)
                        returning id::text, motivo, criado_em
                    """),
                    {
                        "autor": str(user_id),
                        "denunciado": denunciado,
                        "m": str(match_id),
                        "motivo": dados.motivo,
                        "descricao": dados.descricao,
                    },
                )
            )
            .mappings()
            .first()
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # idx_denuncia_uma_por_troca (22_denuncias.sql). O segundo clique não é
        # um erro do usuário: é alguém em dúvida se o primeiro funcionou.
        if "idx_denuncia_uma_por_troca" in str(exc.orig):
            raise RegraNegocio(
                "DENUNCIA_JA_ENVIADA",
                "Você já denunciou esta troca. Estamos analisando.",
                status_code=409,
            ) from exc
        raise

    assert linha is not None
    return DenunciaOut(**dict(linha))
