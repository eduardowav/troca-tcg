"""Rotas internas, disparadas por cron (GitHub Actions) e protegidas por header.

Ver seções 5, 10 e 18 da doc. Existem o sync de catálogo e a expiração; os jobs
`triangular` e `notify-wanted` entram nas Fases 5 e 6, e o cron já os chama —
ver o teste que guarda essa lista em tests/test_internal.py.
"""

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.jobs.catalog.sync import sincronizar_sets
from app.jobs.catalog.tcgdex import TCGdex
from app.services import alertas, matching, propostas, triangular

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


@router.post("/expire", dependencies=[Depends(_verifica_secret)])
async def expire(session: AsyncSession = Depends(get_session)) -> dict[str, int]:
    """Fecha o que passou do prazo — trocas e propostas. Devolve quantas venceram.

    O `sincronizar_matches` já varre os matches vencidos, mas só quando alguém
    abre o app — e o match que mais precisa vencer é justamente o das duas
    pessoas que sumiram. Sem esta passada diária, ele ficaria PENDENTE para
    sempre, ocupando o par (só existe um match por dupla) e mantendo fora da
    métrica-mãe uma troca que na prática não aconteceu.

    Proposta vencida é ainda mais urgente que match vencido: são 72h, não sete
    dias, e enquanto ela está ABERTA a dupla inteira fica travada — o índice
    único deixa uma negociação por par de pessoas. As duas varreduras dividem a
    mesma transação porque as duas são o mesmo trabalho: liberar o que ficou
    pendurado.

    O commit é daqui de propósito: as duas funções rodam no meio de transações
    alheias (a de `sincronizar_matches`, no caso dos matches). Quem chama sozinho
    fecha sozinho — sem isto o job rodaria todo dia sem expirar nada.
    """
    expirados = await matching.expirar_vencidos(session)
    propostas_expiradas = await propostas.expirar_propostas(session)
    await session.commit()
    return {"expirados": expirados, "propostas": propostas_expiradas}


@router.post("/notify-wanted", dependencies=[Depends(_verifica_secret)])
async def notify_wanted(
    horas: int = 24,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Avisa quem oferece uma carta que passou a ser procurada.

    O cron chama esta rota a cada quinze minutos, e ela varre uma janela de 24h
    — bem maior que o intervalo, de propósito: uma execução perdida não deixa
    buraco, porque a seguinte revisita o mesmo período. Quem impede o aviso
    repetido não é a janela e sim o dedupe de sete dias do serviço.

    O commit é daqui pelo mesmo motivo do `expire`: o serviço não fecha a
    transação de quem o chama.
    """
    enviadas = await matching.notificar_cartas_procuradas(session, horas=horas)
    await session.commit()
    return {"notificadas": enviadas}


@router.post("/triangular", dependencies=[Depends(_verifica_secret)])
async def recalcular_triangulares(
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Recalcula os ciclos A→B→C→A. Diário, na janela das 06:00 BRT.

    Desligado por `TRIANGULAR_ATIVO`, responde `{"desligado": 1}` sem tocar no
    banco — o que é diferente de responder zero triângulos. Ver o serviço.

    O commit é daqui, como nos outros jobs: o serviço não fecha a transação de
    quem o chama.
    """
    resultado = await triangular.recalcular(session)
    await session.commit()
    return resultado


@router.post("/notify-alerts", dependencies=[Depends(_verifica_secret)])
async def notify_alerts(
    horas: int = 24,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Avisa quem pediu para ser avisado quando a carta aparecesse.

    O irmão do `notify-wanted`, no sentido contrário: aquele avisa quem oferece
    que passaram a procurar; este avisa quem espera que passaram a oferecer. Mesma
    janela generosa e mesmo motivo — execução perdida não deixa buraco.

    O dedupe daqui é de 24 horas, não de sete dias: é pedido explícito da pessoa,
    e carta boa aparece e some no mesmo dia.
    """
    enviadas = await alertas.notificar_cartas_disponiveis(session, horas=horas)
    await session.commit()
    return {"notificadas": enviadas}
