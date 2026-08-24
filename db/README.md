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
| 11 | `schema/11_grants.sql` | GRANTs do PostgREST — a camada abaixo das policies |
| 12 | `schema/12_series_sets.sql` | séries e expansões, saindo de `cards.set_code` desnormalizado |
| 13 | `schema/13_busca_cartas.sql` | busca por nome com ranking (trigram) |
| 14 | `schema/14_busca_filtros.sql` | filtro por série, expansão e número |
| 15 | `schema/15_precos_tcgplayer.sql` | preço de referência da TCGplayer |
| 16 | `schema/16_raridades.sql` | raridade normalizada em 28 rótulos, com ordem |
| 17 | `schema/17_busca_raridade.sql` | filtro por raridade |
| 18 | `schema/18_busca_plano.sql` | correção de plano: a busca volta a usar o índice |
| 19 | `schema/19_acabamentos.sql` | seed de `card_finishes` e `set_finish_rules` |
| 20 | `schema/20_prazo_e_desistencia.sql` | prorrogação, `CANCELADO` e `trocas_desistidas` |
| 21 | `schema/21_acabamento_dos_anuncios_antigos.sql` | correção dos anúncios que diziam "Normal" |
| 22 | `schema/22_denuncias.sql` | `user_reports` acertada: match obrigatório, motivos em check, uma por troca |
| 23 | `schema/23_propostas.sql` | propostas: a troca que o matcher não enxerga, com rodadas e prazo |
| 24 | `schema/24_notificacoes.sql` | `notifications` ligada: policy, grant e a publicação do Realtime |
| 25 | `schema/25_push_subscriptions.sql` | inscrições de Web Push — escrita e leitura só pela API |
| 26 | `schema/26_verificacao_telefone.sql` | código de uso único do WhatsApp, construído e desligado |
| 27 | `schema/27_baixa_por_troca.sql` | baixa de estoque quando a troca conclui |
| 28 | `schema/28_resolver_lista.sql` | catálogo respondendo a muitos nomes numa consulta (cadastro em massa) |
| 29 | `schema/29_alertas_de_carta.sql` | "avise quando aparecer" |
| 30 | `schema/30_assinaturas.sql` | lastro local da assinatura do PRO e dedupe de webhook |
| 31 | `schema/31_grants_das_tabelas_antigas.sql` | os GRANTs que o 11 não alcançou + tabela nova nasce fechada |
| 32 | `schema/32_rls_do_match_sem_recursao.sql` | as policies do match, que recursavam infinito desde julho |
| 33 | `schema/33_resolver_lista_exige_identificacao.sql` | a lista colada lê `xxx/xxx` e diz se identificou a carta ou só chutou |
| 34 | `schema/34_exclusao_de_conta_nao_trava.sql` | o aceite da isenção deixa de prender o match, e apagar a conta volta a funcionar |
| 35 | `schema/35_cotacao.sql` | cotação do dólar (PTAX), para quem prefere ler preço em real |
| 36 | `schema/36_parceiro.sql` | Parceiro: PRO que não paga, e o registro do porquê |
| 37 | `schema/37_founder.sql` | selo do perfil, começando pelo FOUNDER |
| 38 | `schema/38_pro_por_pix.sql` | o PRO vira tempo comprado por Pix: `pro_pagamentos`, e `plano_expira_em` muda de significado |

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

## `queries/` — o que não roda no deploy

`schema/` é aplicado; `queries/` é consultado. São queries de operação, que uma
pessoa executa à mão no SQL Editor do Supabase e que ficam versionadas porque
representam uma decisão de produto, não um comando avulso.

| Arquivo | Quando se usa |
|---|---|
| `queries/moderacao.sql` | Ler e decidir denúncias: a fila, o contexto do match, reincidência dos dois lados, e as duas únicas ações (marcar resolvida, bloquear) |

A moderação é deliberadamente manual e sem tela. A API grava denúncia e não lê
nenhuma, e o 22 revoga `anon`/`authenticated` da tabela — ler exige a connection
string. O runbook explica por quê, e o que a moderação **não** pode fazer
(mexer em reputação é o principal).

## Convenção

- Nomes de domínio em português (`anuncio`, `troca`, `carta`), termos técnicos em inglês.
- Acabamento é sempre `finish`, **nunca** `variant` (colide com o campo homônimo da TCGdex).
- Vocabulário proibido: `collection`, `coleção`, `deck`, `binder`, `pasta`.
