"""Implementação da fonte de catálogo sobre a TCGdex (api.tcgdex.net/v2).

Escolhida por ser a única opção gratuita com cobertura em português — no Brasil a
Copag distribui as cartas traduzidas, e a busca quebra nas cartas de treinador sem
o nome em PT. Busca em PT e cai para EN quando a tradução não existe.
"""

from datetime import date

import httpx

from app.jobs.catalog.base import (
    CartaCatalogo,
    FonteCatalogo,
    SerieCatalogo,
    SetCatalogo,
)


def montar_imagem(base: str | None) -> str | None:
    """A TCGdex devolve a imagem como URL base, sem extensão.

    Usamos a versão pequena (`low.webp`) nas listas — ver seção 15 da doc (banda).
    """
    return f"{base}/low.webp" if base else None


def _data(valor: str | None) -> date | None:
    """`releaseDate` vem como 'AAAA-MM-DD'; sets antigos às vezes vêm sem ela."""
    try:
        return date.fromisoformat(valor) if valor else None
    except ValueError:
        return None


class TCGdex(FonteCatalogo):
    def __init__(
        self,
        client: httpx.AsyncClient,
        base_url: str = "https://api.tcgdex.net/v2",
        idioma: str = "pt",
    ) -> None:
        self._client = client
        self._base = base_url.rstrip("/")
        self._idioma = idioma

    async def listar_sets(self) -> list[str]:
        dados = await self._get(f"{self._idioma}/sets")
        return [s["id"] for s in dados if s.get("id")]

    async def obter_serie(self, serie_code: str) -> tuple[SerieCatalogo, list[str]]:
        dados = await self._get(f"{self._idioma}/series/{serie_code}")
        serie = SerieCatalogo(
            code=dados["id"],
            nome=dados.get("name") or dados["id"],
            logo_url=dados.get("logo"),
        )
        codigos = [s["id"] for s in dados.get("sets", []) if s.get("id")]
        return serie, codigos

    async def obter_set(self, set_code: str) -> tuple[SetCatalogo, list[CartaCatalogo]]:
        pt = await self._get(f"{self._idioma}/sets/{set_code}")
        en = await self._get(f"en/sets/{set_code}")

        return self._montar_set(set_code, pt), self._montar_cartas(set_code, pt, en)

    @staticmethod
    def _montar_set(set_code: str, pt: dict) -> SetCatalogo:
        contagem = pt.get("cardCount") or {}
        serie = pt.get("serie") or {}
        return SetCatalogo(
            code=set_code,
            serie_code=serie.get("id"),
            nome=pt.get("name") or set_code,
            serie_nome=serie.get("name"),
            sigla=(pt.get("abbreviation") or {}).get("official"),
            total_oficial=contagem.get("official"),
            total_impresso=contagem.get("total"),
            logo_url=pt.get("logo"),
            simbolo_url=pt.get("symbol"),
            lancado_em=_data(pt.get("releaseDate")),
        )

    @staticmethod
    def _montar_cartas(set_code: str, pt: dict, en: dict) -> list[CartaCatalogo]:
        # nome em inglês por localId, para fallback e busca cruzada
        nomes_en = {
            c["localId"]: c.get("name") for c in en.get("cards", []) if c.get("localId")
        }

        cartas: list[CartaCatalogo] = []
        for c in pt.get("cards", []):
            local_id = c.get("localId")
            if not local_id or not c.get("id"):
                continue
            nome_en = nomes_en.get(local_id) or c.get("name") or c["id"]
            cartas.append(
                CartaCatalogo(
                    external_id=c["id"],
                    set_code=set_code,
                    numero=local_id,
                    nome_pt=c.get("name"),
                    nome_en=nome_en,
                    imagem_url=montar_imagem(c.get("image")),
                )
            )
        return cartas

    async def _get(self, caminho: str) -> list | dict:
        resp = await self._client.get(f"{self._base}/{caminho}")
        resp.raise_for_status()
        return resp.json()
