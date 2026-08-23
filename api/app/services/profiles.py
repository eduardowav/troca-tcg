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
from app.services import assinaturas

# O que qualquer pessoa logada pode ver. Sem contato_visivel, sem plano e sem
# onboarding_ok: contato tem regra própria (só após aceite mútuo), e os outros
# dois são estado interno da conta, não informação sobre quem é a pessoa.
# `selo` está entre as públicas de propósito, e é a única coisa aqui que não
# descreve comportamento: é reconhecimento, e reconhecimento que só o dono vê não
# reconhece. Ver `db/schema/37_founder.sql`.
_COLUNAS_PUBLICAS = """
  id::text, username, nome_exibicao, cidade, bairro, avatar_url, bio,
  trocas_concluidas, trocas_furadas, trocas_desistidas, selo, criado_em as desde
"""

# contato_visivel entra aqui porque estas colunas só alimentam o PerfilOut, que
# só é servido em /me — é o dono vendo o próprio contato para poder editá-lo. A
# regra de nunca revelar contato de terceiros vive em schemas/match.py, e é lá
# que ela precisa continuar valendo.
#
# `bloqueado` entrou em 2026-08-16 com a trava do item 2 da segurança, e só faz
# sentido aqui: no perfil público seria delação, e para o dono é a única forma de
# descobrir por que o app parou de deixá-lo agir. Sem este campo, `GET /me`
# continuar aberto a conta bloqueada não serviria para nada — a pessoa veria o
# próprio perfil normal e concluiria que o app está quebrado.
# `parceiro` sai como booleano derivado, e o motivo **não** sai. O motivo é o
# acordo — "patrocínio fechado em 03/2026, revisar em 03/2027" —, e é registro
# interno: quem está vendo o próprio perfil precisa saber que tem PRO de
# cortesia, não ler a cláusula. Mandar o texto seria servir ao cliente um dado
# que só interessa a quem administra.
_COLUNAS = (
    f"{_COLUNAS_PUBLICAS}, contato_visivel, plano, onboarding_ok, bloqueado, "
    "(parceiro_motivo is not null) as parceiro"
)


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

    **As propostas saem antes dos matches**, e não por gosto: `propostas.vez_de`
    também aponta para `profiles` sem ON DELETE. As propostas da pessoa sumiriam
    de qualquer forma, por cascade de `autor_id` e `destinatario_id` — mas a
    conferência de `vez_de` acontece na mesma instrução, sem ordem garantida
    entre as duas, e era ela que derrubava a exclusão de quem já tinha negociado.
    Explícito aqui, o cascade nunca chega a ser posto à prova. Ver o
    `db/schema/34`, que fecha a outra ponta: o aceite da isenção prendia o match.

    Isto foi medido em produção em 2026-08-21, com `DELETE /v1/me` respondendo
    500 para as duas contas de teste que percorreram o caminho normal do
    produto. O item estava no checklist como pronto porque tinha sido conferido
    no código, e nunca contra uma conta que usou o app.

    A reputação de quem fica não é afetada: `trocas_concluidas` e `trocas_furadas`
    são contadores na própria linha do perfil, não uma soma dos matches.

    Por fim removemos a linha em `auth.users`; o ON DELETE CASCADE dela leva
    junto o perfil, os anúncios, o aceite dos termos e as inscrições de push.

    **A assinatura é cancelada antes de tudo**, e a ordem não é estética: o
    cascade apaga `subscriptions` e não fala com o Mercado Pago, então apagar
    primeiro deixaria a cobrança rodando lá sem o `preapproval_id` para desfazê-la
    aqui. Falha no provedor não interrompe a exclusão — ver `cancelar_ao_sair`.
    """
    await assinaturas.cancelar_ao_sair(session, user_id)
    await session.execute(
        text("""
            delete from propostas
            where autor_id = :id or destinatario_id = :id or vez_de = :id
        """),
        {"id": str(user_id)},
    )
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
