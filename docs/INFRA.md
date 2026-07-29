# Infraestrutura — registro operacional

Dados **não-secretos** da infra do TrocaTCG. Segredos nunca entram aqui — ficam no
`.env` local (fora do git) e em GitHub Secrets.

## Supabase

| Item | Valor |
|---|---|
| Projeto | `troca-tcg` |
| Ref / Project ID | `qbdtcpotehvbkozppmyu` |
| URL | https://qbdtcpotehvbkozppmyu.supabase.co |
| Região | `sa-east-1` (São Paulo) |
| Plano | Free |
| Postgres | 17 |

**Chave pública (anon / publishable)** — pode ir no frontend, é segura por design:
`sb_publishable_fnmDKHi19WNJU3SrDp5WeQ_RsuTbo_W`

**Segredos (pegar no painel, nunca commitar):**
- `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_JWT_SECRET` → *Project Settings > API*
- Senha do banco / connection string → *Project Settings > Database*

Schema aplicado: as migrações de `db/schema/` (00–11). RLS ativo em todas as
tabelas; catálogo com leitura pública, `match_events` trancado para a API, e os
grants do PostgREST fechados na 11 (escrita só pela API).

## Catálogo

Fonte: TCGdex (`https://api.tcgdex.net/v2`, idioma `pt`, sem chave).

Carregado hoje: **o bloco Megaevolução inteiro** — 1047 cartas em 8 sets.

```bash
cd api
uv run python -m app.jobs.catalog.run me01 me02 me02.5 me03 me04 me05 mee mep
```

| Set | Nome | Cartas |
|---|---|---|
| `me01` | Megaevolução | 188 |
| `me02` | Fogo Fantasmagórico | 130 |
| `me02.5` | Heróis Excelsos | 295 |
| `me03` | Equilíbrio Perfeito | 124 |
| `me04` | Caos Ascendente | 122 |
| `me05` | Escuridão Absoluta | 120 |
| `mee` | Megaevolução Energia | 8 |
| `mep` | MEP Black Star Promos | 60 |

`mee` e `mep` não têm imagem na TCGdex; o `CartaThumb` cai para a arte
tipográfica com o código do set, então aparecem normalmente na busca.

O set `sv08.5` (Evoluções Prismáticas) foi carregado antes e removido — a decisão
foi começar só pelo bloco Megaevolução. Para trazê-lo de volta:
`uv run python -m app.jobs.catalog.run sv08.5`.

### Próximo passo: sets japoneses e chineses

São **coleções diferentes** das ocidentais, não traduções. A TCGdex cobre as duas
(`/v2/ja/series` devolve 14 séries, `/v2/zh-cn/series` devolve 3), e os ids não
colidem no banco porque `cards.external_id` é único e case-sensitive — o `SV`
japonês e o `sv` ocidental são chaves distintas.

Falta, porém, o que o schema ainda não tem: **nenhuma coluna diz de que região a
carta é**. Sem isso, buscar "Pikachu" devolveria a versão japonesa e a ocidental
misturadas, sem o jogador saber qual é qual — e trocar uma pela outra é troca
diferente. Antes de sincronizar JP/CN, prever em `cards` algo como
`regiao`/`idioma_origem`, com filtro na busca. Atenção também ao `nome_en not
null`: puxando pelo endpoint `ja` os nomes vêm em japonês.

## GitHub

| Item | Valor |
|---|---|
| Repo | https://github.com/eduardowav/troca-tcg (público) |

**Secrets a configurar** (Settings > Secrets and variables > Actions), conforme o deploy avança:
- `API_URL` — base pública da API no Render (ex.: `https://trocatcg-api.onrender.com`). Liga keep-alive e jobs.
- `JOB_SECRET` — mesmo valor do `.env` da API. Protege as rotas `/internal/*`.
- `DATABASE_URL_DIRECT` — connection string direta do Postgres (para o backup `pg_dump`).

Enquanto esses secrets não existem, os workflows de keep-alive/backup/jobs pulam
graciosamente (não falham).

## A configurar ainda (Fase 1)

- [ ] Deploy da API no Render + secret `API_URL`
- [ ] Deploy do PWA no Cloudflare Pages
- [ ] `JOB_SECRET` e `DATABASE_URL_DIRECT` nos GitHub Secrets
- [ ] Habilitar `pg_cron` no painel se for usar agendamento no banco (hoje os jobs
      rodam por GitHub Actions)
