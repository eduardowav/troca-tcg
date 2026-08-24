"""Ponto de entrada da API do TrocaTCG."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import RegraNegocio, regra_negocio_handler
from app.core.limitador import Limitador
from app.core.monitoramento import iniciar as iniciar_monitoramento
from app.db.session import engine
from app.routers import (
    alertas,
    health,
    internal,
    listings,
    matches,
    notificacoes,
    planos,
    pro,
    propostas,
    users,
    verificacao,
    vitrine,
    webhooks,
)

# Antes de qualquer coisa, inclusive de o FastAPI existir: erro que acontece na
# montagem do app é justamente o que ninguém vê, porque o serviço nem chega a
# responder. Sem `SENTRY_DSN` esta chamada não faz nada.
iniciar_monitoramento()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


# A documentação interativa some em produção (item 4 do bloco de segurança da
# seção 17, resolvido em 2026-08-16). O `/openapi.json` é o contrato inteiro —
# incluindo `/internal/jobs/*` — servido de graça a quem fosse levantar o mapa
# sozinho, e o `/docs` ainda dá o botão de disparar cada rota.
#
# **Some a rota, não o documento.** `app.openapi()` continua funcionando, e é
# dele que os testes leem o contrato para provar, por exemplo, que o feed não
# serializa contato. Fechar por `openapi_url=None` mantém essa prova de pé; um
# `if` em volta do teste a apagaria justamente no ambiente que importa.
_EXPOSTA = settings.ENVIRONMENT != "production"

app = FastAPI(
    title="TrocaTCG API",
    description="Quadro de trocas de Pokémon TCG para comunidades locais.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _EXPOSTA else None,
    redoc_url="/redoc" if _EXPOSTA else None,
    openapi_url="/openapi.json" if _EXPOSTA else None,
)

app.add_exception_handler(RegraNegocio, regra_negocio_handler)

# O freio da API. Não é o slowapi, e `core/limitador.py` explica por quê: o
# middleware dele libera toda requisição cuja rota ele não consegue resolver, e a
# partir do FastAPI 0.140 ele não resolve nenhuma. Foi assim que esta proteção
# ficou de julho a 2026-08-16 parecendo instalada e não contando nada.
app.add_middleware(Limitador)

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
# Assinatura: registrada e desligada por `COBRANCA_ATIVA`, como a verificação de
# número. Nenhuma tela do app a chama enquanto a cobrança não ligar.
app.include_router(pro.router, prefix="/v1")
# Receptor do Mercado Pago. Público por natureza — quem chama é o servidor deles,
# que não tem sessão aqui. Quem prova a origem é o HMAC do `x-signature`.
app.include_router(webhooks.router, prefix="/v1")
app.include_router(notificacoes.router, prefix="/v1")
app.include_router(notificacoes.router_push, prefix="/v1")
# Verificação de número: registrada e desligada por configuração
# (`VERIFICACAO_TELEFONE_ATIVA`). Entra na tabela de rotas para poder ser
# exercitada pelos testes; nenhuma tela do app a chama.
app.include_router(verificacao.router, prefix="/v1")
app.include_router(internal.router, prefix="/v1")


@app.get("/")
async def raiz() -> dict[str, str]:
    # Sem apontar para `/docs` em produção: um endereço anunciado que responde
    # 404 é pior que silêncio — diz que existe algo ali e convida a procurar.
    resposta = {"nome": "TrocaTCG API", "versao": "0.1.0"}
    return {**resposta, "docs": "/docs"} if _EXPOSTA else resposta
