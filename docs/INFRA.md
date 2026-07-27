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

Schema aplicado: as 11 migrações de `db/schema/` (00–10). RLS ativo em todas as
tabelas; catálogo com leitura pública, `match_events` trancado para a API.

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
