"""Regra de negócio de perfil.

Writes passam pela API (conexão asyncpg como owner ignora RLS). O perfil só é criado
aqui, nunca pelo cliente — é onde mora o gate de plano e o registro de aceite.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import RegraNegocio
from app.schemas.profile import (
    PerfilAtualizar,
    PerfilCriar,
    PerfilOut,
    PerfilPublicoOut,
)

# O que qualquer pessoa logada pode ver. Sem contato_visivel, sem plano e sem
# onboarding_ok: contato tem regra própria (só após aceite mútuo), e os outros
# dois são estado interno da conta, não informação sobre quem é a pessoa.
_COLUNAS_PUBLICAS = """
  id::text, username, nome_exibicao, cidade, bairro, avatar_url, bio,
  trocas_concluidas, trocas_furadas, trocas_desistidas, criado_em as desde
"""

# contato_visivel entra aqui porque estas colunas só alimentam o PerfilOut, que
# só é servido em /me — é o dono vendo o próprio contato para poder editá-lo. A
# regra de nunca revelar contato de terceiros vive em schemas/match.py, e é lá
# que ela precisa continuar valendo.
_COLUNAS = f"{_COLUNAS_PUBLICAS}, contato_visivel, plano, onboarding_ok"


def _reputacao(concluidas: int, furadas: int) -> int | None:
    total = concluidas + furadas
    return round(concluidas / total * 100) if total else None


def _para_out(row: dict) -> PerfilOut:
    return PerfilOut(
        **row,
        reputacao=_reputacao(row["trocas_concluidas"], row["trocas_furadas"]),
    )


async def obter_perfil(session: AsyncSession, user_id: UUID) -> PerfilOut | None:
    res = await session.execute(
        text(f"select {_COLUNAS} from profiles where id = :id"),
        {"id": str(user_id)},
    )
    row = res.mappings().first()
    return _para_out(dict(row)) if row else None


async def perfil_publico(
    session: AsyncSession, username: str
) -> PerfilPublicoOut | None:
    """O perfil de outra pessoa, por @.

    Existe para uma pergunta só: **com quem eu vou me encontrar?** Até aqui o app
    pedia que alguém combinasse um encontro presencial com um estranho sabendo
    dele apenas o nome de exibição. A reputação já era calculada e já vinha no
    match em contadores; o que faltava era o lugar onde ela se lê inteira, junto
    do bairro, da bio e de há quanto tempo a pessoa está por aqui.

    Busca por `username` e não por id porque o @ é o que a pessoa digita, o que
    cabe numa URL e o que ela passa para um amigo. O id continua saindo no corpo
    — é dele que o app precisa para abrir uma denúncia.

    `bloqueado = false` repete o filtro do matcher (services/matching): quem está
    bloqueado não aparece em sugestão nenhuma, e um perfil ainda navegável seria
    a brecha por onde ele voltaria a ser encontrado.
    """
    res = await session.execute(
        text(
            f"select {_COLUNAS_PUBLICAS} from profiles "
            "where username = :u and bloqueado = false"
        ),
        {"u": username.strip().lower()},
    )
    row = res.mappings().first()
    if row is None:
        return None
    dados = dict(row)
    return PerfilPublicoOut(
        **dados,
        reputacao=_reputacao(dados["trocas_concluidas"], dados["trocas_furadas"]),
    )


async def criar_perfil(
    session: AsyncSession,
    user_id: UUID,
    dados: PerfilCriar,
    ip: str | None,
) -> PerfilOut:
    if not dados.aceite_termos:
        raise RegraNegocio(
            "ACEITE_TERMOS_NECESSARIO",
            "É preciso aceitar os termos de uso para criar a conta.",
            campo="aceite_termos",
            status_code=422,
        )

    try:
        await session.execute(
            text(
                "insert into profiles "
                "(id, username, nome_exibicao, bairro, contato_visivel) "
                "values (:id, :username, :nome, :bairro, :contato)"
            ),
            {
                "id": str(user_id),
                "username": dados.username,
                "nome": dados.nome_exibicao,
                "bairro": dados.bairro,
                "contato": dados.contato_visivel,
            },
        )
        await session.execute(
            text("""
                insert into term_acceptances (user_id, contexto, versao, ip)
                values (:id, 'CADASTRO', :versao, :ip)
            """),
            {"id": str(user_id), "versao": settings.TERMOS_VERSAO, "ip": ip},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _traduzir_conflito(exc) from exc

    perfil = await obter_perfil(session, user_id)
    assert perfil is not None
    return perfil


async def atualizar_perfil(
    session: AsyncSession, user_id: UUID, dados: PerfilAtualizar
) -> PerfilOut:
    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        perfil = await obter_perfil(session, user_id)
        if perfil is None:
            raise RegraNegocio(
                "PERFIL_NAO_ENCONTRADO", "Perfil não encontrado.", status_code=404
            )
        return perfil

    mapa = {
        "username": "username",
        "nome_exibicao": "nome_exibicao",
        "bairro": "bairro",
        "bio": "bio",
        "contato_visivel": "contato_visivel",
        "avatar_url": "avatar_url",
    }
    sets = ", ".join(f"{mapa[k]} = :{k}" for k in campos)
    campos["id"] = str(user_id)
    try:
        res = await session.execute(
            text(f"update profiles set {sets} where id = :id returning {_COLUNAS}"),
            campos,
        )
        row = res.mappings().first()
        await session.commit()
    except IntegrityError as exc:
        # Desde que o @ virou editável, trocar para um já tomado passa por aqui.
        await session.rollback()
        raise _traduzir_conflito(exc) from exc
    if row is None:
        raise RegraNegocio(
            "PERFIL_NAO_ENCONTRADO", "Perfil não encontrado.", status_code=404
        )
    return _para_out(dict(row))


async def excluir_conta(session: AsyncSession, user_id: UUID) -> None:
    """Apaga a conta e tudo que está preso a ela. Não tem volta.

    A ordem importa: `match_items` e `match_events` apontam para `profiles` sem
    ON DELETE, então bloqueiam a remoção. Apagar antes os matches em que a pessoa
    participou resolve — e faz sentido de produto, porque uma troca combinada com
    quem saiu não vai acontecer.

    A reputação de quem fica não é afetada: `trocas_concluidas` e `trocas_furadas`
    são contadores na própria linha do perfil, não uma soma dos matches.

    Por fim removemos a linha em `auth.users`; o ON DELETE CASCADE dela leva
    junto o perfil, os anúncios, o aceite dos termos e as inscrições de push.
    """
    await session.execute(
        text("""
            delete from matches
            where id in (
              select match_id from match_participants where user_id = :id
            )
        """),
        {"id": str(user_id)},
    )
    await session.execute(
        text("delete from auth.users where id = :id"),
        {"id": str(user_id)},
    )
    await session.commit()


def _traduzir_conflito(exc: IntegrityError) -> RegraNegocio:
    constraint = getattr(exc.orig, "constraint_name", "") or str(exc.orig)
    if "username" in constraint:
        return RegraNegocio(
            "USERNAME_EM_USO",
            "Esse nome de usuário já está em uso. Tente outro.",
            campo="username",
            status_code=409,
        )
    if "pkey" in constraint:
        return RegraNegocio(
            "PERFIL_JA_EXISTE",
            "Seu perfil já foi criado.",
            status_code=409,
        )
    return RegraNegocio(
        "PERFIL_INVALIDO", "Não foi possível criar o perfil.", status_code=400
    )
