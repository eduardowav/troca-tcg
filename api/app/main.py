"""Ponto de entrada da API do TrocaTCG."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.errors import RegraNegocio, regra_negocio_handler
from app.db.session import engine
from app.routers import (
    alertas,
    health,
    internal,
    listings,
    matches,
    notificacoes,
    planos,
    propostas,
    users,
    verificacao,
    vitrine,
)

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="TrocaTCG API",
    description="Quadro de trocas de Pokémon TCG para comunidades locais.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(RegraNegocio, regra_negocio_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Todas as rotas ficam sob /v1 (ver seção 10 da doc).
app.include_router(health.router, prefix="/v1")
app.include_router(users.router, prefix="/v1")
app.include_router(listings.router, prefix="/v1")
app.include_router(matches.router, prefix="/v1")
app.include_router(vitrine.router, prefix="/v1")
app.include_router(propostas.router, prefix="/v1")
app.include_router(alertas.router, prefix="/v1")
# Pública como o health: é tabela de preço, e quem ainda não tem conta olha.
app.include_router(planos.router, prefix="/v1")
app.include_router(notificacoes.router, prefix="/v1")
app.include_router(notificacoes.router_push, prefix="/v1")
# Verificação de número: registrada e desligada por configuração
# (`VERIFICACAO_TELEFONE_ATIVA`). Entra na tabela de rotas para poder ser
# exercitada pelos testes; nenhuma tela do app a chama.
app.include_router(verificacao.router, prefix="/v1")
app.include_router(internal.router, prefix="/v1")


@app.get("/")
async def raiz() -> dict[str, str]:
    return {"nome": "TrocaTCG API", "versao": "0.1.0", "docs": "/docs"}
