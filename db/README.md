# Banco de dados — TrocaTCG

Schema versionado em SQL puro. Esta é a **fonte da verdade** do banco: tabelas,
RLS, funções e o seed de acabamentos. É SQL cru (e não Alembic autogenerate)
porque o schema usa RLS, funções e seed que o autogenerate não captura bem.

## Ordem de aplicação

Os arquivos são numerados e devem ser aplicados em ordem — há dependências de
foreign key entre eles (ex.: `listings` referencia `finishes`, `cards` e `profiles`).

| # | Arquivo | Conteúdo |
|---|---|---|
| 00 | `schema/00_extensions.sql` | uuid-ossp, pg_trgm, pg_cron |
| 01 | `schema/01_enums.sql` | card_condition, listing_kind, match_kind, match_status |
| 02 | `schema/02_cards.sql` | catálogo Pokémon + índices trigram |
| 03 | `schema/03_finishes.sql` | acabamentos (+ seed), card_finishes, set_finish_rules |
| 04 | `schema/04_profiles.sql` | perfis + função `reputacao()` |
| 05 | `schema/05_listings.sql` | anúncios (Ofereço/Procuro) |
| 06 | `schema/06_matches.sql` | matches, participantes, itens, eventos |
| 07 | `schema/07_terms_reports.sql` | aceites de termos, denúncias |
| 08 | `schema/08_notifications.sql` | notificações, push subscriptions |
| 09 | `schema/09_rls.sql` | Row Level Security (tabelas de usuário) |
| 10 | `schema/10_hardening.sql` | RLS do catálogo (leitura pública) + trava de `match_events` + search_path da função |

> **Dependência do Supabase Auth:** `profiles.id` referencia `auth.users(id)`.
> Aplique este schema em um projeto Supabase (onde o schema `auth` já existe).
> `pg_cron` precisa ser habilitado uma vez em *Database > Extensions* no painel.

## Como aplicar

### Via psql (banco local ou Supabase com connection string)

```bash
for f in schema/*.sql; do
  psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Via Supabase (MCP / dashboard)

Aplique cada arquivo na ordem numérica pelo SQL Editor ou por migration.

## Convenção

- Nomes de domínio em português (`anuncio`, `troca`, `carta`), termos técnicos em inglês.
- Acabamento é sempre `finish`, **nunca** `variant` (colide com o campo homônimo da TCGdex).
- Vocabulário proibido: `collection`, `coleção`, `deck`, `binder`, `pasta`.
