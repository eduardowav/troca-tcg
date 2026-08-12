"""Engine e sessão async do SQLAlchemy."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """A sessão da requisição — e o lugar onde o push sai.

    O envio fica aqui, e não dentro dos serviços, porque ele precisa acontecer
    **depois** do commit: notificação é parte da transação do evento, push não
    é. Quem escreveu a notificação só enfileirou (`services/push.agendar`); a
    fila é esvaziada quando o handler já devolveu a resposta, com a sessão ainda
    aberta para apagar as inscrições que morreram.

    O import mora dentro da função de propósito: `services.push` importa a
    configuração e o SQLAlchemy, e um import no topo daqui fecharia um ciclo no
    dia em que ele precisar de qualquer outra coisa deste módulo.
    """
    from app.services import push

    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await push.enviar_pendentes(session)
