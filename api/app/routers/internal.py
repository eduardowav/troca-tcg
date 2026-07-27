"""Rotas internas, disparadas por cron (GitHub Actions) e protegidas por header.

Ver seções 5, 10 e 18 da doc. Nesta fase só o sync de catálogo existe; os demais
jobs (triangular, expire, notify-wanted) entram nas fases seguintes.
"""

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.jobs.catalog.sync import sincronizar_sets
from app.jobs.catalog.tcgdex import TCGdex

router = APIRouter(prefix="/internal/jobs", tags=["internal"])


def _verifica_secret(x_job_secret: str = Header(...)) -> None:
    if x_job_secret != settings.JOB_SECRET:
        raise HTTPException(status_code=403, detail="Job secret inválido.")


class SyncCatalogIn(BaseModel):
    # None ou lista vazia = sincroniza todos os sets (pesado; use com parcimônia).
    set_ids: list[str] | None = None


@router.post("/sync-catalog", dependencies=[Depends(_verifica_secret)])
async def sync_catalog(
    payload: SyncCatalogIn,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        fonte = TCGdex(client, settings.TCGDEX_BASE_URL, settings.TCGDEX_IDIOMA)
        set_ids = payload.set_ids or [s.id for s in await fonte.listar_sets()]
        total = await sincronizar_sets(session, fonte, set_ids)
    return {"sets": len(set_ids), "cartas": total}
