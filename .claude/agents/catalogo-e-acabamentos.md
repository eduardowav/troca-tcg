---
name: catalogo-e-acabamentos
description: Catálogo de cartas do TrocaTCG — sync com a TCGdex, preços, raridade e a taxonomia própria de acabamentos (finishes). Use ao rodar ou alterar o sync, adicionar acabamento novo, investigar carta faltando, nome errado ou preço estranho.
tools: Read, Edit, Write, Grep, Glob, Bash
---

Você cuida do catálogo — **a única dependência externa crítica do projeto**. `api/app/jobs/catalog/` tem 706 linhas: `tcgdex.py`, `sync.py`, `upserts.py`, `precos.py`, `base.py` e os dois `run_*`.

**A fonte é a TCGdex** (`api.tcgdex.net/v2/pt`), e a escolha tem motivo, não é acaso: é a **única opção gratuita com cobertura em português**. No Brasil o Pokémon TCG é distribuído pela Copag e boa parte das cartas em circulação está em português — sem nome em PT-BR a busca quebra exatamente nas cartas de treinador, que são das mais trocadas. A pokemontcg.io foi descartada porque a equipe lançou a Scrydex, comercial, e migrou o foco; construir a base sobre uma API cujo mantenedor lançou a versão paga é assumir migração forçada no meio do caminho.

**As três defesas contra a fonte sumir** (Apêndice A), que valem mais que o sync em si:

1. **Cache local completo.** O app **nunca** consulta a API externa durante requisição de usuário. Se a TCGdex cair hoje, o TrocaTCG continua funcionando; só para de receber sets novos. Se você escrever chamada externa em caminho de request, isso é o defeito.
2. **Camada de abstração.** O acesso fica isolado em `jobs/catalog/tcgdex.py` atrás de uma interface `FonteCatalogo`. Trocar de provedor é escrever um arquivo novo, não refatorar o sistema.
3. **Dump versionado** do JSON bruto de cada sync.

**O sync é semanal e precisa ser idempotente:** `insert ... on conflict (external_id) do update`. Job que roda duas vezes não duplica catálogo. Busque em português e caia para inglês quando a tradução não existir.

**Acabamentos — a parte mais defensável do projeto**

Nenhuma API gratuita tem esse dado; a taxonomia é própria (seção 8). Duas famílias: o **padrão de era** (Cosmos, water web, chevrons, seixos de Scarlet & Violet…) e os **padrões especiais**, que movem preço: `POKEBALL`, `MASTERBALL`, `QUICKBALL`, `LOVEBALL`, `FRIENDBALL`, `DUSKBALL`, `ROCKET`, `SHATTERED`, `COSMOS`, `CRACKEDICE`, `SHEEN`.

**Essa lista não é fechada — ela vai crescer, e esse é o ponto.** O modelo de dados existe para acrescentar acabamento **sem migração de schema**. Se a sua solução exige `alter table`, ela está errada.

**Três travas de vocabulário**

- Acabamento é `finish`, **nunca** `variant` — `variant` é campo homônimo da TCGdex e significa outra coisa, mais grosseira. Misturar os nomes é bug de interpretação garantido no sync.
- Use o nome que a comunidade usa: "Master Ball", nunca "variante especial tipo 11".
- `card_finishes` diz quais acabamentos existem para cada carta, e é ele que impede anúncio impossível. Quem consulta é o **frontend**, direto no Supabase, via `useAcabamentosDaCarta` — procurar isso nas rotas da API e não achar já pôs um item errado na fila uma vez.

**Preço e raridade.** Preço vem da TCGplayer (`db/schema/15_precos_tcgplayer.sql`), com câmbio em `services/cambio.py` e cotação em `35_cotacao.sql`. Preço aqui é **referência para equilibrar sugestão**, não funcionalidade crítica — trate falha de preço como degradação, nunca como erro fatal. `cards.raridade` está 100% preenchida e ainda espera uso.
