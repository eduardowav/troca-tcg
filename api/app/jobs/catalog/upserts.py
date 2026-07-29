"""Os upserts do catálogo, um por tabela de `db/schema/12_series_sets.sql`.

Ficam separados da orquestração porque é aqui que mora a regra de idempotência:
um job que roda duas vezes não pode duplicar nem apagar dado enriquecido à mão.
Daí o padrão `coalesce(excluded.x, tabela.x)` nas colunas que a fonte às vezes
não traz — sobrescrever com NULL seria perder informação que já tínhamos.
"""

from sqlalchemy import text

UPSERT_SERIE = text(
    """
    insert into series (code, nome, logo_url)
    values (:code, :nome, :logo_url)
    on conflict (code) do update set
      nome     = excluded.nome,
      logo_url = coalesce(excluded.logo_url, series.logo_url)
    """
)

# Chamado quando se sincroniza um set solto: garante a linha-pai da FK
# `sets.serie_code` sem exigir uma passada pela série inteira.
UPSERT_SERIE_MINIMA = text(
    """
    insert into series (code, nome)
    values (:code, :nome)
    on conflict (code) do nothing
    """
)

UPSERT_SET = text(
    """
    insert into sets
      (code, serie_code, nome, sigla, total_oficial, total_impresso,
       logo_url, simbolo_url, lancado_em)
    values
      (:code, :serie_code, :nome, :sigla, :total_oficial, :total_impresso,
       :logo_url, :simbolo_url, :lancado_em)
    on conflict (code) do update set
      serie_code     = coalesce(excluded.serie_code, sets.serie_code),
      nome           = excluded.nome,
      sigla          = coalesce(excluded.sigla, sets.sigla),
      total_oficial  = coalesce(excluded.total_oficial, sets.total_oficial),
      total_impresso = coalesce(excluded.total_impresso, sets.total_impresso),
      logo_url       = coalesce(excluded.logo_url, sets.logo_url),
      simbolo_url    = coalesce(excluded.simbolo_url, sets.simbolo_url),
      lancado_em     = coalesce(excluded.lancado_em, sets.lancado_em),
      atualizado_em  = now()
    """
)

UPSERT_CARTA = text(
    """
    insert into cards
      (external_id, set_code, numero, nome_pt, nome_en, raridade, imagem_url)
    values
      (:external_id, :set_code, :numero, :nome_pt, :nome_en, :raridade, :imagem_url)
    on conflict (external_id) do update set
      set_code   = excluded.set_code,
      numero     = excluded.numero,
      nome_pt    = excluded.nome_pt,
      nome_en    = excluded.nome_en,
      -- não apaga raridade já enriquecida se o brief não a trouxer
      raridade   = coalesce(excluded.raridade, cards.raridade),
      imagem_url = excluded.imagem_url
    """
)
