"""Healthcheck.

Consulta o banco de verdade (`select 1`), não retorna só 200. Isso é requisito,
não detalhe: o mesmo ping de keep-alive que mantém a API do Render acordada
também mantém o projeto Supabase ativo — desde que toque o banco. Ver seção 6 da doc.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> JSONResponse:
    try:
        await session.execute(text("select 1"))
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "error"},
        )
    return JSONResponse(
        status_code=200,
        content={"status": "ok", "db": "ok"},
    )
