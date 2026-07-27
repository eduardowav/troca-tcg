"""Implementação da fonte de catálogo sobre a TCGdex (api.tcgdex.net/v2).

Escolhida por ser a única opção gratuita com cobertura em português — no Brasil a
Copag distribui as cartas traduzidas, e a busca quebra nas cartas de treinador sem
o nome em PT. Busca em PT e cai para EN quando a tradução não existe.
"""

import httpx

from app.jobs.catalog.base import CartaCatalogo, FonteCatalogo, SetResumo


def montar_imagem(base: str | None) -> str | None:
    """A TCGdex devolve a imagem como URL base, sem extensão.

    Usamos a versão pequena (`low.webp`) nas listas — ver seção 15 da doc (banda).
    """
    return f"{base}/low.webp" if base else None


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

    async def listar_sets(self) -> list[SetResumo]:
        dados = await self._get(f"{self._idioma}/sets")
        return [SetResumo(id=s["id"], nome=s.get("name", s["id"])) for s in dados]

    async def obter_cartas_do_set(self, set_id: str) -> list[CartaCatalogo]:
        pt = await self._get(f"{self._idioma}/sets/{set_id}")
        en = await self._get(f"en/sets/{set_id}")

        # nome em inglês por localId, para fallback e busca cruzada
        nomes_en = {
            c["localId"]: c.get("name") for c in en.get("cards", []) if c.get("localId")
        }
        set_nome = pt.get("name")

        cartas: list[CartaCatalogo] = []
        for c in pt.get("cards", []):
            local_id = c.get("localId")
            if not local_id or not c.get("id"):
                continue
            nome_en = nomes_en.get(local_id) or c.get("name") or c["id"]
            cartas.append(
                CartaCatalogo(
                    external_id=c["id"],
                    set_code=set_id,
                    set_nome=set_nome,
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
