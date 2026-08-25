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
- Senha do banco / connection string → *Project Settings > Database*

**A API precisa de um segredo só: a `DATABASE_URL`.** O `SUPABASE_JWT_SECRET`
nunca foi preenchido e o app sempre funcionou, porque o JWKS deste projeto
publica **apenas ES256** — os tokens são assimétricos e o `auth.py` os valida
pela chave pública, que é buscada da `SUPABASE_URL`. O segredo compartilhado só
existe no ramo HS256, que este projeto não usa. Já o
`SUPABASE_SERVICE_ROLE_KEY` está declarado no `config.py` e **não é lido por
nenhuma linha do app**: é a chave que fura o RLS, e ela ficou de fora do Render
por isso mesmo. Se for mesmo morta, o lugar certo é sair do `config.py`.

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
('2' antes de '10') → id, este último como desempate estável para a paginação.
Custo atual: ~4,8 ms com 16 mil cartas (ver a seção da migração 18 abaixo — já
esteve em 245 ms).

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

### Preço (TCGplayer) e raridade

Os dois vêm da **mesma** requisição — a rota de carta única, `/{idioma}/cards/{id}`
— e por isso são um job só. O brief do set não traz nenhum dos dois, então o
custo é uma ida à fonte por carta: **15.997 requisições** para varrer tudo.

```bash
cd api
uv run python -m app.jobs.catalog.run_precos --limite 2000   # em pedaços
uv run python -m app.jobs.catalog.run_precos --tudo          # o catálogo inteiro
```

Estado da primeira varredura completa (2026-07-30):

| | |
|---|---|
| Cartas verificadas | 15.997 (100%) |
| **Raridade preenchida** | **15.997 (100%)** — era 0% |
| Cartas com preço | 14.316 (89,5%) |
| Linhas em `card_prices` | 24.607, em 7 acabamentos |

As 1.681 cartas sem preço não são falha: promos e cartas que a TCGplayer não
lista simplesmente não existem lá. `cards.precos_verificado_em` marca "já
tentei", que é diferente de "tem preço" — sem essa distinção o job varreria as
mesmas cartas para sempre e nunca terminaria.

**Só TCGplayer, por decisão do Eduardo.** A Cardmarket vem na mesma resposta e é
descartada: dois números discordando na tela não ajudam ninguém a decidir se a
troca é justa. O valor fica **em dólar**, como a fonte publica — converter
exigiria uma fonte de câmbio, que vence junto e daria falsa precisão a um número
que já é estimativa.

Um acabamento por linha, porque a mesma carta sai por US$ 0,13 em `normal` e
US$ 0,22 em `reverse-holofoil`. A tela escolhe **um** para representar a carta, e
o critério é assumir a impressão mais comum (`precoPrincipal`, em
`web/src/lib/types.ts`): entre a 1st edition de uma Base Set a US$ 101 e a
unlimited a US$ 35, mostrar a primeira inflaria o valor de quase todo mundo.

### Raridade: um nome só

⚠️ **A raridade vem no idioma da resposta**: "Comum"/"Rara Dupla" nas cartas
modernas, "Common"/"Rare Holo" nas antigas, que só existem no endpoint inglês.
Deu 36 valores distintos para o que deveria ser bem menos — e "Rare Secreta"
mistura os dois idiomas numa string só.

A migração 16 resolve com um **mapa** (`raridades`), não com uma coluna nova:
`cards.raridade` continua sendo exatamente o que a fonte disse, e a tela lê o
rótulo traduzido daqui. Mapa é dado, então raridade nova amanhã é uma linha
inserida, não um deploy. **36 valores viraram 28 rótulos.**

| | |
|---|---|
| Entradas no mapa | 35 |
| Rótulos distintos | 28 |
| Cartas sem raridade | 40 (a fonte devolvia a string `"None"`) |

`cards.raridade` é FK para `raridades`, e o job de preço **cadastra sozinho** uma
raridade desconhecida (com o próprio nome e `ordem` 99) antes de encostar na
carta — sem isso, um nome novo num set novo derrubaria a varredura inteira.
Depois é só traduzir a linha com calma.

A busca ganhou `filtro_raridade` na migração 17, e ele casa por **rótulo**: quem
escolhe "Comum" pega as 3.549 cartas que vieram como "Comum" e as 626 que vieram
como "Common". Como série e expansão, raridade sozinha dispensa o termo — dá para
navegar as 493 Ilustração Rara do catálogo sem digitar nada.

### A lentidão que a cláusula `SET` causava (migração 18)

A busca chegou a levar **~245 ms**. A investigação, medindo em vez de supondo:

| | |
|---|---|
| Corpo da função, solto como statement preparado | **2,6 ms** |
| O mesmo, chamado pela função | **245 ms** |
| Função sem a cláusula `SET` | **2,8 ms** |
| Função com outro `SET` qualquer (`set jit = off`) | **266 ms** |

Não era o `search_path`: era **haver um `SET`**. Função SQL com cláusula `SET`
não pode ser *inlined* na consulta que a chama; sem inlining, o corpo é planejado
uma vez com o parâmetro opaco, e **índice GIN de trigrama só serve quando o
planejador enxerga o texto** — é dele que os trigramas saem. Com `$1` desconhecido
não há o que procurar no índice, e sobra varredura sequencial em 16 mil linhas.

Largar o `SET search_path` resolveria e devolveria o inlining, mas é o
endurecimento que a 10 adotou. A saída que preserva as duas coisas é **plpgsql com
`EXECUTE ... USING`**: o `EXECUTE` monta um plano *one-shot* por chamada, já com o
valor real, que é justamente o que faltava.

Depois: **4,8 ms** na busca por nome (era 245), 2,3 a 12,4 ms nos outros casos.

Junto veio um empate de ordenação que já estava lá e só apareceu com o plano
novo: `sv10.5w` e `sv10.5b` saíram no mesmo dia e ambas têm uma carta 087, então
as chaves de ordenação empatavam e a ordem entre elas era arbitrária — o que, com
paginação por offset, faz o "Mostrar mais" repetir ou pular carta. O desempate
final por `id` fecha isso.

**Preço vence.** Diferente de nome e raridade, isto pede rodada periódica: rodar
o job de novo num catálogo já varrido é o que atualiza os valores, começando
pelos mais antigos (`card_prices.sincronizado_em`).

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

## Render

Os dois serviços — API e PWA — vivem no `render.yaml` da raiz, aplicado como
Blueprint. Infra como código: o que está no arquivo é o que existe.

| Serviço | Tipo | Plano |
|---|---|---|
| `trocatcg-api` | web · runtime `python` | free |
| `trocatcg-web` | web · runtime `static` | free |

**O PWA saiu do Cloudflare Pages e veio para o Render.** Uma plataforma só, e o
blueprint versionado no repo em vez de metade da configuração num painel sem
histórico. O que se perde: a borda do Cloudflare em São Paulo (só pesa na
primeira visita — depois o service worker serve tudo local) e a banda separada
(no Render os dois serviços dividem os 100 GB/mês e os minutos de pipeline do
workspace; como as imagens das cartas vêm da `assets.tcgdex.net`, sobra o
bundle, e 100 GB não é limite prático). Voltar atrás é apagar o bloco `static`.

### A região é o problema desta arquitetura

O Render oferece `oregon`, `ohio`, `virginia`, `frankfurt` e `singapore` —
**não há região na América do Sul**. O Postgres está em `sa-east-1`. Escolhemos
`virginia` por ser a menos distante: ~120 ms de ida e volta contra ~180 de
oregon.

Isso importa mais do que parece porque o feed **não é uma consulta, são umas
trinta**: `GET /v1/me/matches` chama `sincronizar_matches`, que grava, e o
`listar_matches` busca participantes e itens um match por vez. A conta é
`≈ 9 × parceiros + 5` idas ao banco. A ~120 ms cada, uma abertura de feed com
três matches passa de 3 segundos, e cada uma segura uma das 15 conexões do pool
(`pool_size=5` + `max_overflow=10`, os defaults do SQLAlchemy) durante todo esse
tempo. O `_PARES` em si custa 2,3 ms medidos — o banco não é o gargalo, a
distância é.

Cortar o N+1 do `listar_matches` e não ressincronizar a cada GET derruba isso
para ~5 consultas. Enquanto não for feito, é este número que limita quanta
gente o free tier aguenta ao mesmo tempo, não a RAM.

### Detalhes do blueprint que não são óbvios

- **`--proxy-headers --forwarded-allow-ips="*"` no start command.** Sem eles, o
  `request.client.host` é o IP do proxy do Render e o rate limit de 100/minuto
  do slowapi vale para o app inteiro somado, não por pessoa.
- **Build com `uv export | pip install`.** O runtime Python do Render vê
  `pyproject.toml` e assume Poetry. Exportar o `uv.lock` para requirements evita
  a heurística e mantém o lock como fonte única de versões.
- **`PYTHON_VERSION=3.12.8`**, porque o padrão do Render é 3.11 e o projeto
  exige >=3.12. É o primeiro lugar a olhar se o build falhar.
- **`buildFilter` por serviço**, para commit de front não reconstruir a API —
  os minutos de pipeline são compartilhados.
- **`VITE_API_URL` literal, não `fromService`.** Site estático não fica na rede
  privada do Render, e `property: host` devolveria o hostname interno, que o
  navegador de quem usa o app não alcança.

## Domínio próprio — `trocatcg.com`

Decidido em 2026-08-21: o **apex** serve o app, `www` redireciona para ele, e a
API fica em `api.trocatcg.com`. O apex ganhou a disputa contra `app.trocatcg.com`
por um motivo de boca, não de técnica — no dia do lançamento o endereço vai ser
ditado em voz alta para quarenta pessoas numa loja, e "app ponto" é uma palavra a
mais para cada uma delas errar.

**O código já está pronto** (commit desta data). O que falta é painel.

### Por que antes do lançamento, e não depois

PWA é presa à origem. Quem instalar pelo `trocatcg-web.onrender.com` fica com um
app apontando para lá **para sempre** — trocar o domínio depois não migra
ninguém, e não há tela que avise. Mesma coisa para link colado em grupo de
WhatsApp. Se o domínio vai entrar, ele entra antes de haver gente instalada.

O endereço do Render **não sai** por isso: ele continua no ar, e é o que segura
quem já instalou. Por isso o `CORS_ORIGINS` lista os dois, e o `connect-src` do
CSP lista as duas APIs.

### DNS, no provedor do domínio

```
trocatcg.com       A  ou ALIAS  ->  o IP/alvo que o Render mostrar
www.trocatcg.com   CNAME        ->  trocatcg-web.onrender.com
api.trocatcg.com   CNAME        ->  trocatcg-api.onrender.com
```

O apex é o único que não aceita CNAME — é limitação do DNS, não do Render. Se o
provedor oferecer `ALIAS` (ou `ANAME`), use: ele acompanha mudança de IP
sozinho. Só com `A` é preciso voltar aqui se o Render trocar o endereço.

O certificado TLS é emitido pelo Render sozinho, **depois** que o DNS resolve.
Até lá o domínio fica "pendente" no painel: é o estado normal, não erro.

### Supabase → Authentication → URL Configuration

Acrescentar às **Redirect URLs**, antes de apontar o DNS:

```
https://trocatcg.com/**
https://www.trocatcg.com/**
```

Fora da lista, o Supabase **não recusa** — responde 200 e usa a Site URL calado.
Na prática: a pessoa se cadastra pelo domínio novo, recebe o e-mail, clica, e
cai no endereço do Render. A conta confirma e ela some do fluxo em que estava.
O painel esconde a lista; para conferir o que está lá de verdade, ver a receita
do `auth_logs` na seção do Supabase acima.

A **Site URL** também muda para `https://trocatcg.com` — é ela que o Supabase
usa quando não tem para onde voltar.

### A ordem importa

1. Redirect URLs no Supabase (não quebra nada estando adiantado).
2. DNS apontado.
3. Esperar o certificado sair no painel do Render.
4. Só então compartilhar o primeiro link.

O passo 4 depende do 2 por um motivo que não aparece em log nenhum: a `og:image`
do `web/index.html` é absoluta e aponta para `trocatcg.com`. Enquanto o DNS não
resolver, **todo** link compartilhado chega sem prévia — inclusive o do
`onrender.com` —, porque o raspador busca a imagem no endereço do meta, não no
da página que abriu. A caixa do WhatsApp vem cinza e ninguém toca.

### O que fica para depois

O e-mail transacional saiu do Gmail em 2026-08-25 e passou ao Resend, com
remetente `nao-responda@trocatcg.com` e o domínio verificado — ver 11.3 da doc
técnica. O teto de envio do Supabase (100/hora desde 2026-08-21) continua sendo
o limite real no dia do lançamento.

`web/src/routes/Termos.tsx` ainda cita `contato@trocatcg.com.br`, que é de outra
pessoa. Com o `.com` na mão, esse endereço passa a ter para onde ir — está na
lista abaixo desde antes e agora deixa de depender de terceiro.

## A configurar ainda (Fase 1)

- [ ] **Empurrar o repo** — o `main` local está muito à frente do `origin`, e o
      Render lê o `render.yaml` do GitHub, não do disco
- [ ] Aplicar o Blueprint: https://dashboard.render.com/blueprint/new?repo=https://github.com/eduardowav/troca-tcg
- [ ] Preencher no painel o único `sync: false`: `DATABASE_URL` (pooler, porta
      5432) — já está pronta em `api/.env`
- [ ] Copiar o `JOB_SECRET` gerado pelo Render para os GitHub Secrets, junto com
      `API_URL` e `DATABASE_URL_DIRECT`
- [ ] Ícones `pwa-192.png` e `pwa-512.png` em `web/public/` — o manifesto já os
      referencia e eles não existem, então o app **não é instalável**
- [ ] Trocar `contato@trocatcg.com.br` (em `web/src/routes/Termos.tsx`) por uma
      caixa de verdade: é o canal do controlador na política de privacidade
- [ ] Autenticar o MCP do Render (`/mcp` > render) para inspecionar deploy e log
- [ ] Habilitar `pg_cron` no painel se for usar agendamento no banco (hoje os jobs
      rodam por GitHub Actions)
