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

Schema aplicado: as migrações de `db/schema/` (00–12). RLS ativo em todas as
tabelas; catálogo com leitura pública, `match_events` trancado para a API, e os
grants do PostgREST fechados na 11 (escrita só pela API).

## Catálogo

Fonte: TCGdex (`https://api.tcgdex.net/v2`, idioma `pt`, sem chave).

A hierarquia da fonte virou schema na migração 12: **série → set → carta**, em
`series`, `sets` e `cards`. O nome da expansão saiu de `cards.set_nome` (repetido
em cada carta) e passou a morar em `sets`, junto com sigla oficial, contagens,
logo, símbolo e data de lançamento. `cards.set_code` é FK para `sets.code`.

Carregado hoje: **4703 cartas em 26 sets, 2 séries.**

```bash
cd api
uv run python -m app.jobs.catalog.run --serie sv    # Escarlate e Violeta
uv run python -m app.jobs.catalog.run --serie me    # Megaevolução
uv run python -m app.jobs.catalog.run sv03 sv08.5   # sets avulsos
```

O `--serie` resolve a lista de sets no próprio endpoint da TCGdex, então não há
lista de códigos para manter aqui. Os upserts são idempotentes: rodar de novo
atualiza, não duplica.

| Série | Sets | Cartas |
|---|---|---|
| `sv` — Escarlate e Violeta | 18 | 3656 |
| `me` — Megaevolução | 8 | 1047 |

Duas notas de leitura desses números:

- A contagem é a do **catálogo em português**. `svp` (Black Star Promos) declara
  225 cartas e trouxe 218 — promos que a Copag não publicou em PT.
- `mee` e `mep` não têm imagem na TCGdex; o `CartaThumb` cai para a arte
  tipográfica com o código do set, então aparecem normalmente na busca.

`sets.sigla` guarda a abreviação impressa na carta (`OBF`, `PRE`, `MEW`), que é
como o jogador lê o canto — "OBF 125/197". A UI ainda mostra o `set_code`
(`SV03`); a sigla está no banco esperando a troca.

### Próximo passo: sets japoneses e chineses

São **expansões diferentes** das ocidentais, não traduções. A TCGdex cobre as duas
(`/v2/ja/series` devolve 14 séries, `/v2/zh-cn/series` devolve 3), e os ids não
colidem no banco porque `cards.external_id` é único e case-sensitive — o `SV`
japonês e o `sv` ocidental são chaves distintas.

Falta o que o schema ainda não tem: **nenhuma coluna diz de que região a carta
é**. Sem isso, buscar "Pikachu" devolveria a versão japonesa e a ocidental
misturadas, sem o jogador saber qual é qual — e trocar uma pela outra é troca
diferente. Com a migração 12 o lugar disso ficou óbvio: uma coluna `regiao` em
`sets` (26 linhas), não em `cards` (4703). A busca então filtra por join.
Atenção também ao `nome_en not null`: puxando pelo endpoint `ja` os nomes vêm em
japonês.

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
