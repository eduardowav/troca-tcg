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

Schema aplicado: as migrações de `db/schema/` (00–13). RLS ativo em todas as
tabelas; catálogo com leitura pública, `match_events` trancado para a API, e os
grants do PostgREST fechados na 11 (escrita só pela API).

## Catálogo

Fonte: TCGdex (`https://api.tcgdex.net/v2`, idioma `pt`, sem chave).

A hierarquia da fonte virou schema na migração 12: **série → set → carta**, em
`series`, `sets` e `cards`. O nome da expansão saiu de `cards.set_nome` (repetido
em cada carta) e passou a morar em `sets`, junto com sigla oficial, contagens,
logo, símbolo e data de lançamento. `cards.set_code` é FK para `sets.code`.

Carregado: **todo o ocidente — 15.997 cartas, 112 sets, 11 séries.**

```bash
cd api
uv run python -m app.jobs.catalog.run --serie sv    # uma série
uv run python -m app.jobs.catalog.run sv03 sv08.5   # sets avulsos
uv run python -m app.jobs.catalog.run --all         # todos os sets da fonte
```

O `--serie` resolve a lista de sets no próprio endpoint da TCGdex, então não há
lista de códigos para manter aqui. Os upserts são idempotentes: rodar de novo
atualiza, não duplica.

| Série | Sets | Cartas | Só em inglês |
|---|---|---|---|
| `swsh` — Espada e Escudo | 25 | 3663 | 25 |
| `sv` — Escarlate e Violeta | 18 | 3656 | 0 |
| `sm` — Sol e Lua | 18 | 2899 | 163 |
| `xy` — XY | 15 | 1710 | 117 |
| `bw` — Black & White | 12 | 1336 | 161 |
| `me` — Megaevolução | 8 | 1047 | 0 |
| `ex` — EX | 5 | 552 | 552 |
| `hgss` — HeartGold SoulSilver | 4 | 414 | 414 |
| `dp` — Diamante & Pérola | 3 | 386 | 386 |
| `base` — Coleção Básica | 3 | 228 | 228 |
| `col` — Chamado das Lendas | 1 | 106 | 106 |

Três notas de leitura desses números:

- **A TCGdex só tem o card-a-card em português a partir de Black & White (2011).**
  Nos blocos anteriores ela traduz o nome do set mas devolve a lista de cartas
  vazia. Essas cartas existem em papel e são trocadas, então o sync cai para o
  inglês: `nome_pt` fica nulo e `nomeCarta()` no frontend mostra o `nome_en`.
  São 2152 cartas nessa condição — todas com imagem.
- A contagem é a do catálogo em português quando ele existe. `svp` (Black Star
  Promos) declara 225 cartas e trouxe 218 — promos que a Copag não publicou em PT.
- `mee` e `mep` não têm imagem na TCGdex; o `CartaThumb` cai para a arte
  tipográfica com o código do set, então aparecem normalmente na busca.

**`tcgp` (Estampas Ilustradas Pocket) ficou de fora de propósito**: é o jogo de
celular, as cartas são digitais e não se trocam em mão. Se um dia entrar, entra
como jogo separado, não como mais uma série.

### Busca

A busca é a função `buscar_cartas(termo, limite, deslocamento)` no Postgres
(`db/schema/13_busca_cartas.sql`), chamada por RPC — o frontend não monta mais
filtro nenhum. O query builder do PostgREST não tem como expressar "ordene por
quão bem casou", e sem isso 87 Charizards chegam em ordem aleatória.

O que a função resolve, na ordem em que apareceu testando com gente digitando:

| Caso | Antes | Agora |
|---|---|---|
| `pokemon` (sem acento) | 0 resultados | acha "Pokémon" |
| `pesquisa professor` | 0 resultados | acha "Pesquisa de Professores" |
| `charizrd` (typo) | 0 resultados | 82 Charizards |
| `charizard` | 24 de 87, ordem do número impresso | 24 de 87, exato → recente |
| `%` | catálogo inteiro | nada (curinga é escapado) |

Como funciona: `cards.busca_pt`/`busca_en` são colunas **geradas** com o nome sem
acento e em minúsculas — a normalização é paga na escrita, e é o que torna o
índice trigram utilizável (um índice sobre `nome_pt` não serve para uma busca
sobre `unaccent(nome_pt)`). Os termos viram um padrão único `%a%b%`, então as
palavras não precisam ser contíguas. Quem não casa por LIKE ainda pode entrar
pela similaridade trigram, sempre ranqueada **depois** de qualquer casamento
literal. A ordem final é relevância → set mais recente → número natural
('2' antes de '10'). ~16 ms com 16 mil cartas.

`total` volta em cada linha (janela calculada antes do LIMIT), e é o que o app
usa para dizer "Mostrando 24 de 87 cartas" e decidir se mostra "Mostrar mais".

#### Filtro (migração 14)

`buscar_cartas` ganhou `filtro_serie` e `filtro_set`, e com filtro **o termo
deixa de ser obrigatório**: escolher uma expansão e navegar as 207 cartas de 151
em ordem de Pokédex é um uso legítimo, e antes a tela exigia digitar duas letras
antes de mostrar qualquer coisa. Com expansão escolhida, um termo só de dígitos
casa com o **número impresso** — PRE + "59" leva direto à Umbreon 059. Fora
desse caso o número não entra: "125" sem filtro traria uma carta de cada uma das
112 expansões.

No app (`web/src/components/carta/FiltroCatalogo.tsx`), dois `<select>` nativos —
no celular abrem o seletor do sistema, que ganha de qualquer dropdown desenhado,
e a lista tem 112 expansões. Os dois se mantêm coerentes: escolher a expansão
fixa a série junto, e trocar a série derruba a expansão que não pertence a ela.

**Atalho "OBF 125"**, que é como o colecionador escreve: interpretado no
frontend (`interpretarAtalho` em `useCardSearch`), onde dá para *mostrar* o que
foi entendido. Exige a parte numérica de propósito — várias siglas são também
nome de Pokémon (`MEW` é a sigla de 151), e quem digita só "mew" quer o Mew.

⚠️ **Filtro por raridade não existe porque o dado não existe:** `cards.raridade`
é 100% nulo. A TCGdex não traz raridade no brief do set — sairia uma request por
carta, ~16 mil. Enriquecer isso é uma decisão à parte.

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
