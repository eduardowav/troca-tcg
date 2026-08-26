# TrocaTCG — Documentação Técnica

**Versão:** 2.3
**Data:** agosto de 2026
**Autor:** Eduardo
**Status:** Especificação para desenvolvimento

> **Mudanças da v2.2 → v2.3:** adicionada a [seção 22 — Vitrine e propostas](#22-vitrine-e-propostas). O motor de matching só funciona quando os dois lados declararam PROCURA, e boa parte das pessoas não sabe o que quer — sabe reconhecer quando vê. A vitrine é o caminho que funciona com um lado só declarado, que é o mínimo que existe no dia do lançamento. A seção fica no fim, e não entre a 9 e a 10, para não renumerar as seções 10–21, citadas por comentário de código e por commit.
>
> **Mudanças da v2.1 → v2.2:** adicionada a [seção 8 — Acabamentos](#8-acabamentos-finishes). O enum de variantes foi substituído por tabela de referência: sets recentes introduzem padrões inéditos a cada lançamento (Poké Ball, Master Ball, Quick Ball, Love Ball, Friend Ball, Dusk Ball, Team Rocket, vidro estilhaçado), e nenhuma API gratuita fornece essa taxonomia.
>
> **Mudanças da v2.0 → v2.1 (revisão de premissas externas, julho/2026):**
> - **Fonte de catálogo trocada** para TCGdex. A `pokemontcg.io` foi absorvida pela Scrydex, que não tem free tier ($29/mês mínimo). Ver [Apêndice A](#apêndice-a--fonte-do-catálogo).
> - **Hospedagem da API trocada** de Fly.io para Render. O Fly.io encerrou o free tier para contas novas em out/2024.
> - **Keep-alive obrigatório:** projetos Supabase free pausam após 7 dias sem atividade.
> - **Backup próprio obrigatório:** o free tier do Supabase não tem backup automático.
> - **Adicionado suporte a variantes** de acabamento no modelo de dados (expandido na v2.2).
>
> **Mudanças da v1.0:** escopo reduzido a Pokémon TCG; removido o conceito de gerenciador de coleção — a plataforma é exclusivamente um quadro de trocas; adicionada seção de isenção de responsabilidade.

---

## Sumário

1. [Decisão de produto: site, app ou PWA](#1-decisão-de-produto)
2. [Posicionamento: quadro de trocas, não gerenciador de coleção](#2-posicionamento)
3. [Escopo do MVP](#3-escopo-do-mvp)
4. [Isenção de responsabilidade](#4-isenção-de-responsabilidade)
5. [Arquitetura geral](#5-arquitetura-geral)
6. [Stack tecnológica](#6-stack-tecnológica)
7. [Modelo de dados](#7-modelo-de-dados)
8. [Acabamentos (finishes)](#8-acabamentos-finishes)
9. [Motor de matching](#9-motor-de-matching)
10. [API — contratos](#10-api--contratos)
11. [Autenticação e segurança](#11-autenticação-e-segurança)
12. [Notificações](#12-notificações)
13. [Reputação e ciclo de vida da troca](#13-reputação-e-ciclo-de-vida-da-troca)
14. [Frontend](#14-frontend)
15. [Custos operacionais](#15-custos-operacionais)
16. [Preparação para monetização](#16-preparação-para-monetização)
17. [Roadmap de desenvolvimento](#17-roadmap-de-desenvolvimento)
18. [Setup do ambiente](#18-setup-do-ambiente)
19. [Testes e CI/CD](#19-testes-e-cicd)
20. [Observabilidade e métricas](#20-observabilidade-e-métricas)
21. [Riscos e mitigações](#21-riscos-e-mitigações)
22. [Vitrine e propostas](#22-vitrine-e-propostas) — a troca que o matcher não enxerga

---

## 1. Decisão de produto

### Recomendação: **PWA (Progressive Web App)**

Não construa app nativo. Construa uma aplicação web responsiva, instalável, com service worker.

**Justificativa:**

| Critério | PWA | App nativo (iOS/Android) |
|---|---|---|
| Custo de publicação | R$ 0 | US$ 99/ano (Apple) + US$ 25 (Google) |
| Codebase | 1 | 2 (ou React Native + configuração de build) |
| Atualização | Instantânea, sem revisão | 1–7 dias de revisão por versão |
| Notificação push | Sim (Web Push, iOS 16.4+) | Sim |
| Instalável na home screen | Sim | Sim |
| Descoberta por link/WhatsApp | Direto | Fricção de download |
| Indexação no Google | Sim | Não |

O fator decisivo é a **distribuição**. O produto vive de efeito de rede em comunidade local: o crescimento vai acontecer por link compartilhado em grupo de WhatsApp da loja. Um link que abre e já funciona converte muito melhor que "baixe o app na loja".

O único recurso nativo relevante seria a câmera para escanear cartas — e a Web API `getUserMedia` cobre isso, se um dia entrar no escopo.

**Consequência prática:** mobile-first obrigatório. A maioria dos acessos será de celular, dentro da loja, com as cartas na mão.

---

## 2. Posicionamento

### O TrocaTCG não é um gerenciador de coleção

Essa é a decisão de produto mais importante do documento, e ela precisa estar visível em todas as camadas — modelo de dados, API, interface e texto.

**Todas as cartas cadastradas na plataforma estão disponíveis para troca.** Não existe "minha coleção" com cartas guardadas, decks montados, pastas ou binders virtuais. Existem duas listas, e só:

| Lista | Significado |
|---|---|
| **Ofereço** | Cartas que estou disposto a trocar, agora |
| **Procuro** | Cartas que quero receber em troca |

O usuário que cadastra uma carta está declarando intenção de negociar aquela carta. Não há estado intermediário.

### Por que isso importa

**Do ponto de vista de produto:** o mercado de apps de coleção está saturado (TCG Collector, Pokely, Dragon Shield Scanner, TCG Codex). Todos catalogam bem e nenhum resolve o problema de *fazer a troca acontecer*. Competir em catalogação é perder. Competir em matching é vencer num espaço vazio.

**Do ponto de vista técnico:** remover o conceito de coleção elimina uma quantidade enorme de complexidade — pastas, decks, estatísticas de valor total, histórico de aquisição, condição por cópia individual. Nada disso existe aqui. O modelo de dados fica com uma tabela central de anúncios, e o esforço todo vai para o motor de matching.

**Do ponto de vista do usuário:** ambiguidade mata matching. Se metade das cartas cadastradas fosse "coleção pessoal, não troco", cada match sugerido teria chance de ser falso, e o usuário perderia confiança no feed rapidamente. Aqui, se a carta está lá, ela está em jogo.

### Consequência de nomenclatura

Isso vale para o código e para a interface. Nunca use a palavra "coleção" no produto.

| Não use | Use |
|---|---|
| Coleção, collection | Minhas cartas, anúncios, listings |
| Tenho / HAVE | Ofereço / OFERTA |
| Quero / WANT | Procuro / PROCURA |
| Adicionar à coleção | Colocar para trocar |

### Rota de expansão futura (não construa agora)

Se algum dia o gerenciamento de coleção entrar no roadmap, o caminho é adicionar uma coluna `disponivel_para_troca boolean` em `listings` e filtrar o matching por ela. Uma migração, sem refatoração. Mas isso só se dados de uso mostrarem demanda real — e provavelmente não vão, porque os apps existentes já cobrem isso bem.

---

## 3. Escopo do MVP

### Jogo suportado: **Pokémon TCG, exclusivamente**

Um jogo só, na v1. Motivos:

- A comunidade local de Pokémon em Belém é maior que a de qualquer outro TCG, e matching precisa de densidade de usuários para funcionar
- Catálogo único simplifica sync, busca e modelo de dados
- Um segundo jogo divide a base de usuários pela metade justamente quando ela é pequena demais — é o pior momento possível para expandir

Lorcana e outros jogos ficam para depois de a taxa de conclusão de trocas estar estável e a base passar de ~500 usuários ativos.

### Dentro do escopo

- Cadastro e autenticação por e-mail
- Catálogo de cartas de Pokémon TCG importado de API pública
- Listas **Ofereço** e **Procuro** por usuário, com condição, **acabamento**, idioma e prioridade
- Catálogo próprio de acabamentos (Poké Ball, Master Ball, reverse, holo e afins), extensível sem migração
- Matching direto (1↔1) e múltiplo (várias cartas na mesma dupla)
- Matching triangular (A→B→C→A) — Fase 5
- Aceite / recusa / conclusão de troca dentro do app
- Sistema de reputação baseado em trocas concluídas e furadas
- Notificações in-app + Web Push quando alguém procura uma carta que você oferece
- Perfil público com reputação
- Aceite explícito dos termos de uso e isenção de responsabilidade

### Fora do escopo (v1)

- **Gerenciamento de coleção** — decks, pastas, binders, valor total de coleção
- **Outros jogos** — Lorcana, Magic, One Piece
- Chat interno (usuários combinam pelo contato revelado após aceite mútuo)
- Pagamentos, escrow, intermediação financeira, envio de cartas
- Scanner de carta por câmera
- Precificação própria (usa preço de referência da API externa, apenas para equilibrar sugestões)
- App nativo

### Regra de escopo

Qualquer funcionalidade que não aumente a taxa de **trocas concluídas** fica fora da v1. Essa é a métrica-mãe do produto.

---

## 4. Isenção de responsabilidade

A plataforma conecta pessoas. Ela não participa da negociação, não custodia cartas e não intermedia dinheiro. Isso precisa estar declarado de forma inequívoca, por dois motivos: proteção jurídica e clareza de expectativa do usuário.

### 4.1 Texto oficial

Use este texto, sem alteração, nos pontos indicados adiante:

> **Isenção de responsabilidade**
>
> O TrocaTCG é uma plataforma que apenas conecta pessoas interessadas em trocar cartas colecionáveis entre si.
>
> Não nos responsabilizamos por vendas de cartas, negociações financeiras, pagamentos de qualquer natureza ou pelo resultado dos encontros combinados entre usuários. Não participamos das negociações, não custodiamos cartas e não intermediamos valores.
>
> Toda combinação, encontro, conferência de autenticidade e conferência de estado das cartas é de responsabilidade exclusiva dos usuários envolvidos. Recomendamos encontros em locais públicos e movimentados, como lojas especializadas e eventos da comunidade.
>
> O TrocaTCG não é afiliado, patrocinado ou endossado por Nintendo, Creatures Inc., GAME FREAK inc. ou The Pokémon Company International. Todos os nomes, imagens e marcas de cartas pertencem a seus respectivos titulares.

### 4.2 Onde exibir

O disclaimer precisa aparecer em quatro momentos, e o mais importante é o terceiro.

| Momento | Formato | Bloqueante |
|---|---|---|
| Cadastro | Checkbox de aceite dos termos, com link para o texto completo | ✅ Sim |
| Rodapé de todas as telas | Link "Termos e isenção" | Não |
| **Antes de revelar o contato do parceiro** | Modal com resumo do disclaimer e botão "Entendi, quero ver o contato" | ✅ Sim |
| Página de termos | Texto completo | — |

O terceiro é o crítico. É o instante exato em que o usuário sai da plataforma e entra numa negociação pessoal, e é onde a fronteira de responsabilidade precisa ficar explícita. Registre o aceite:

> **Feito em 2026-08-15**, e o desenho merece registro porque a versão óbvia dele
> não funcionaria. Um modal do frontend cobrindo um contato que a API já mandou
> não esconde nada de quem abre as ferramentas do navegador, e o registro
> provaria que houve um clique, não que o texto foi mostrado antes do dado.
>
> Então **a trava é do servidor**. `obter_match` só serializa `contato_visivel`
> para quem já tem linha em `term_acceptances` com contexto `REVELACAO_CONTATO`
> **para aquele match**, e a única forma de criar essa linha é
> `POST /v1/me/matches/{id}/contato` — que grava versão, IP e `match_id`, e só
> então devolve a troca com o contato dentro. Antes disso o campo simplesmente
> não existe na resposta.
>
> **O aceite é por troca, não por pessoa.** Um aceite global seria assinado uma
> vez na vida e valeria para sempre; a isenção fala de *um* encontro, com *uma*
> pessoa. É o `match_id` que faz o documento significar algo no dia de mostrá-lo.
>
> A conferência da versão fica de fora de propósito: quem aceitou em julho e
> voltou ao mesmo match em agosto já leu a isenção naquele encontro, e reabrir a
> caixa por causa de uma vírgula puniria quem só quis reler um telefone. A versão
> gravada serve para provar **o que** foi aceito, não para decidir quem aceita de
> novo.
>
> A caixa não fecha no Esc, não fecha clicando fora e não tem X — as três saídas
> transformariam "aceito" em "consegui contornar". Recusar é possível pelo botão
> secundário, que devolve a pessoa à troca sem o contato: precisa ser possível,
> só não pode ser acidental.
>
> Efeito colateral que a tela precisou tratar: "aceito, mas sem contato" passou a
> ter **dois** significados — não li a isenção, ou o outro não cadastrou telefone.
> Mandar cadastrar contato quem só não leu o aviso seria mentir sobre de quem é a
> vez de agir. Ver o componente `Contato` em `web/src/routes/Match.tsx`.

```sql
create table term_acceptances (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  contexto    text not null,       -- 'CADASTRO' | 'REVELACAO_CONTATO'
  versao      text not null,       -- '2026-07-01'
  match_id    uuid references matches(id),
  ip          inet,
  aceito_em   timestamptz not null default now()
);

create index idx_termos_usuario on term_acceptances (user_id, contexto);
```

Versionar o texto importa: se você alterar os termos, precisa saber quem aceitou qual versão e pedir novo aceite.

### 4.3 Política contra venda na plataforma

O produto é de troca, não de venda. Isso precisa estar nos termos e ser reforçado na interface:

- Os termos proíbem uso da plataforma para anunciar venda de cartas
- Campos livres (bio, contato) passam por validação básica que sinaliza padrões de venda (`R$`, `vendo`, `pix`, `preço`)
- Denúncia de usuário com motivo "uso para venda"
- Reincidência leva a bloqueio manual

Não invista em moderação automática sofisticada agora. Denúncia manual resolve numa base pequena, e sobre-engenharia aqui é desperdício.

### 4.4 LGPD

Como a plataforma trata dados pessoais (e-mail, contato), a política de privacidade precisa declarar:

> A menção original a "localização em nível de bairro" saiu em 2026-08-14. O
> campo `bairro` existe em `profiles` e nenhuma tela o pede — o app não coleta
> localização nenhuma, e é isso que a política publicada diz. Ver o item 5 da
> fila (seção 17).


- Quais dados são coletados e para quê
- Que o contato só é compartilhado com outro usuário mediante aceite mútuo em uma troca
- Direito de exclusão de conta e dados, com fluxo funcional no app
- Base legal do tratamento: execução de contrato e legítimo interesse

O fluxo de exclusão de conta não é opcional — é exigência legal e precisa funcionar antes do lançamento.

---

## 5. Arquitetura geral

```
┌─────────────────────────────────────────────────────────┐
│  CLIENTE — PWA (React + Vite + TS)                      │
│  Cloudflare Pages · CDN global · service worker         │
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS + JWT (Bearer)
                ▼
┌─────────────────────────────────────────────────────────┐
│  API — FastAPI (Python 3.12)                            │
│  Render (free) · 1 instância · keep-alive por cron      │
│                                                          │
│  ├── routers/      endpoints REST                       │
│  ├── services/     regra de negócio                     │
│  ├── matching/     motor de matching                    │
│  └── core/         auth, config, deps                   │
└───────────────┬─────────────────────────────────────────┘
                │ postgres (asyncpg) + REST
                ▼
┌─────────────────────────────────────────────────────────┐
│  SUPABASE                                                │
│  ├── Postgres     dados + RLS + pg_cron                 │
│  ├── Auth         usuários, JWT                         │
│  └── Realtime     notificações in-app ao vivo           │
└─────────────────────────────────────────────────────────┘
                ▲
                │ cron
┌───────────────┴─────────────────────────────────────────┐
│  JOBS — GitHub Actions → POST /internal/jobs/*          │
│  · recomputar matches triangulares      (diário)        │
│  · sincronizar catálogo Pokémon         (semanal)       │
│  · expirar matches vencidos             (diário)        │
│  · notificar "procuram sua carta"       (15 em 15 min)  │
│  · KEEP-ALIVE API + banco               (10 em 10 min)  │
│  · backup do banco → GitHub             (diário)        │
└─────────────────────────────────────────────────────────┘

APIs externas (leitura, cache local):
  · tcgdex.dev         catálogo Pokémon TCG (PT-BR, sem key)
  · Resend             e-mail transacional
```

### Princípios arquiteturais

1. **O banco é a fonte da verdade.** Matching direto e múltiplo são resolvidos em SQL. Python só entra onde o SQL não alcança bem (ciclos triangulares).
2. **Stateless na API.** Nenhum estado em memória. Permite reiniciar/escalar sem perda.
3. **Jobs fora do request.** Nada que demore mais de 500 ms roda em requisição de usuário.
4. **Catálogo em cache local.** Nunca consulte a API externa durante uma requisição de usuário. O catálogo é sincronizado por job.

---

## 6. Stack tecnológica

### Backend

| Tecnologia | Versão | Papel | Por quê |
|---|---|---|---|
| Python | 3.12 | Linguagem | Sua stack de estudo |
| FastAPI | 0.115+ | Framework HTTP | Async nativo, OpenAPI automático, validação |
| Pydantic | v2 | Validação e schemas | Contratos de API tipados |
| SQLAlchemy | 2.0 (async) | ORM / query builder | Permite SQL cru onde precisa |
| asyncpg | — | Driver Postgres | Driver async mais rápido |
| Alembic | — | Migrations | Versionamento de schema |
| httpx | — | Cliente HTTP async | Sync do catálogo |
| uv | — | Gerenciador de pacotes | Muito mais rápido que pip |
| pytest + pytest-asyncio | — | Testes | — |
| ruff | — | Lint + format | Substitui black + flake8 + isort |

### Frontend

| Tecnologia | Papel | Por quê |
|---|---|---|
| React 18 + TypeScript | UI | Padrão de mercado, o que recrutador procura |
| Vite | Build | Build rápido, PWA plugin nativo |
| TailwindCSS | Estilo | Velocidade, consistência |
| TanStack Query | Estado de servidor | Cache, refetch, loading states de graça |
| React Router | Rotas | — |
| Zustand | Estado local | Leve; só para sessão e filtros |
| vite-plugin-pwa | Service worker + manifest | Instalável e push |
| Zod | Validação de forms | Espelha os schemas Pydantic |

### Infraestrutura

| Serviço | Plano | Papel |
|---|---|---|
| Supabase | Free | Postgres, Auth, Realtime |
| Cloudflare Pages | Free | Hospedagem do PWA, CDN, SSL |
| Render | Free (Hobby) | API FastAPI — exige keep-alive |
| GitHub Actions | Free (repo público) | CI + cron dos jobs + backup |
| Resend | Free (3.000 e-mails/mês) | E-mail transacional |
| Sentry | Free (5k eventos/mês) | Monitoramento de erro |

**Custo total do MVP: R$ 0/mês** (+ ~R$ 40/ano de domínio `.com.br`, opcional).

### Justificativa das escolhas contraintuitivas

**Por que FastAPI e não só Supabase?**
Supabase sozinho resolveria CRUD. Mas o matching triangular exige lógica de grafo em código, e o portfólio precisa mostrar backend próprio. A API também isola o cliente do banco — quando você monetizar, o gate de plano fica na API, não no frontend.

**Por que Render e não Fly.io?**
Porque o Fly.io deixou de ter free tier. Em outubro de 2024 os planos Hobby/Launch/Scale foram descontinuados e contas novas passaram a ser pay-as-you-go, com um crédito de teste e nada mais. Quem tem conta antiga mantém as isenções; quem cria hoje, não. Uma instância mínima sai por cerca de US$ 2/mês.

O Render mantém free tier de web service: 512 MB de RAM, 0,1 CPU, 750 horas/mês, 100 GB de banda, sem cartão de crédito. O problema conhecido é a hibernação após 15 min de inatividade, com cold start de 30–60 s — inaceitável para uso dentro da loja.

**A solução é o keep-alive**, e ela é obrigatória, não opcional:

```yaml
# .github/workflows/keepalive.yml
name: Keep-alive
on:
  schedule:
    - cron: '*/10 * * * *'   # a cada 10 min, dentro dos 15 do Render
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf "${{ secrets.API_URL }}/v1/health" || exit 1
```

Como 750 h/mês cobre as ~730 h de um mês inteiro, manter a instância acordada 24/7 cabe no free tier. O mesmo ping também resolve a pausa do Supabase (ver abaixo), desde que o endpoint `/health` faça uma consulta real ao banco — um `select 1` basta.

**Se o cold start virar problema real**, o plano pago do Render custa US$ 7/mês. Considere isso o primeiro custo inevitável do projeto, não uma falha de planejamento.

**Por que não Next.js?**
SEO não é fator relevante aqui (conteúdo é privado, atrás de login) e o SSR adiciona custo de servidor. SPA em CDN é mais barato e mais simples.

---

## 7. Modelo de dados

### Diagrama de relacionamento

```
auth.users (Supabase)
     │ 1:1
     ▼
  profiles ──────┬──────────────┐
     │ 1:N       │ N:M          │ 1:N
     ▼           ▼              ▼
  listings    matches ──── term_acceptances
     │           │
     ▼           ├──── match_items
   cards         ├──── match_participants
                 └──── match_events
```

Note que não existe tabela de coleção, deck ou pasta. `listings` é o centro do sistema, e cada linha é uma declaração de intenção de troca.

### DDL completo

```sql
-- ============================================
-- EXTENSÕES
-- ============================================
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;      -- busca por similaridade de nome
create extension if not exists pg_cron;      -- agendamento

-- ============================================
-- ENUMS
-- ============================================
create type card_condition as enum ('NM','LP','MP','HP','DMG');
create type listing_kind   as enum ('OFERTA','PROCURA');
-- Acabamento NÃO é enum. Ver seção 8 (Acabamentos) — é tabela de referência,
-- porque cada set novo pode introduzir padrões inéditos.
create type match_kind     as enum ('DIRETO','MULTIPLO','TRIANGULAR');
create type match_status   as enum (
  'SUGERIDO','PENDENTE','ACEITO','RECUSADO',
  'CONCLUIDO','FURADO','EXPIRADO'
);

-- ============================================
-- CATÁLOGO — Pokémon TCG
-- ============================================
-- Sem tabela de jogos: a v1 é exclusivamente Pokémon.
-- Para adicionar um segundo jogo no futuro:
--   alter table cards add column jogo text not null default 'pokemon';
--   alter table cards drop constraint cards_external_id_key;
--   alter table cards add unique (jogo, external_id);
-- Uma migração, sem refatoração de código.

-- Hierarquia da fonte: série (bloco) → set (expansão) → carta. As duas primeiras
-- vieram na migração 12; até lá o set era só um par de colunas em `cards`.
create table series (
  code        text primary key,             -- id no TCGdex (ex.: 'sv')
  nome        text not null,
  logo_url    text,
  criado_em   timestamptz not null default now()
);

create table sets (
  code           text primary key,          -- id no TCGdex (ex.: 'sv03')
  serie_code     text references series(code) on delete restrict,
  nome           text not null,
  sigla          text,                      -- abreviação impressa: 'OBF'
  total_oficial  integer,                   -- denominador impresso (197)
  total_impresso integer,                   -- com secretas (230)
  logo_url       text,
  simbolo_url    text,
  lancado_em     date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table cards (
  id            uuid primary key default uuid_generate_v4(),
  external_id   text not null unique,        -- id no TCGdex (ex.: 'sv3-125')
  set_code      text not null references sets(code) on delete restrict,
  numero        text not null,
  nome_pt       text,                        -- nome em português (Copag)
  nome_en       text not null,               -- fallback e busca cruzada
  raridade      text,
  imagem_url    text,                        -- URL externa, nunca binário
  preco_ref     numeric(10,2),               -- BRL, só para equilibrar sugestões
  preco_atualizado_em timestamptz,
  criado_em     timestamptz not null default now()
);

-- Busca trigram nos dois idiomas: o jogador brasileiro digita
-- "Pesquisa do Professor", não "Professor's Research".
create index idx_cards_busca_pt on cards using gin (nome_pt gin_trgm_ops);
create index idx_cards_busca_en on cards using gin (nome_en gin_trgm_ops);
create index idx_cards_set      on cards (set_code, numero);

-- ============================================
-- USUÁRIOS
-- ============================================
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text not null unique
                       check (username ~ '^[a-z0-9_]{3,20}$'),
  nome_exibicao      text not null,
  cidade             text not null default 'Belém',
  bairro             text,
  avatar_url         text,
  bio                text check (char_length(bio) <= 200),
  contato_visivel    text,                   -- revelado só após aceite mútuo
  trocas_concluidas  integer not null default 0,
  trocas_furadas     integer not null default 0,
  plano              text not null default 'FREE',
  onboarding_ok      boolean not null default false,
  bloqueado          boolean not null default false,
  criado_em          timestamptz not null default now(),
  ultimo_acesso_em   timestamptz
);

-- Reputação calculada, não armazenada: evita inconsistência
create or replace function reputacao(p profiles)
returns numeric language sql immutable as $$
  select case
    when p.trocas_concluidas + p.trocas_furadas = 0 then null
    else round(
      p.trocas_concluidas::numeric
      / (p.trocas_concluidas + p.trocas_furadas) * 100, 0)
  end
$$;

create index idx_profiles_cidade on profiles (cidade, bairro);

-- ============================================
-- ANÚNCIOS DE TROCA — o coração do sistema
-- ============================================
-- Toda linha aqui é uma carta disponível para troca ou procurada.
-- Não existe carta "guardada": se está cadastrada, está em negociação.
create table listings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  card_id     uuid not null references cards(id),
  tipo        listing_kind not null,
  quantidade  smallint not null default 1 check (quantidade between 1 and 99),
  condicao    card_condition not null default 'NM',
  finish_id   smallint not null references finishes(id),   -- ver seção 8
  idioma      char(2) not null default 'pt',
  prioridade  smallint not null default 2 check (prioridade between 1 and 3),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (user_id, card_id, tipo, condicao, finish_id, idioma)
);

-- Índices que sustentam o matching. Sem eles, a query degrada rápido.
-- O acabamento entra no índice: o matching casa carta E acabamento.
create index idx_listings_matching on listings (card_id, finish_id, tipo, user_id)
  where ativo = true;
create index idx_listings_usuario  on listings (user_id, tipo)
  where ativo = true;

-- ============================================
-- MATCHES
-- ============================================
create table matches (
  id         uuid primary key default uuid_generate_v4(),
  tipo       match_kind not null,
  status     match_status not null default 'SUGERIDO',
  score      numeric(6,2) not null default 0,
  hash_grupo text not null,        -- dedup: evita sugerir o mesmo match 2x
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '7 days',
  unique (hash_grupo)
);

create index idx_matches_status on matches (status, expira_em);

create table match_participants (
  match_id     uuid not null references matches(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  posicao      smallint not null,          -- 0,1,2 — ordem no ciclo
  respondeu_em timestamptz,
  aceitou      boolean,
  confirmou_conclusao boolean not null default false,
  primary key (match_id, user_id)
);

create index idx_mp_usuario on match_participants (user_id, match_id);

create table match_items (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  card_id       uuid not null references cards(id),
  de_user_id    uuid not null references profiles(id),
  para_user_id  uuid not null references profiles(id),
  condicao      card_condition not null,
  finish_id     smallint not null references finishes(id),
  check (de_user_id <> para_user_id)
);

create index idx_mi_match on match_items (match_id);

create table match_events (
  id        uuid primary key default uuid_generate_v4(),
  match_id  uuid not null references matches(id) on delete cascade,
  user_id   uuid references profiles(id),
  evento    text not null,      -- CRIADO, ACEITO, RECUSADO, CONCLUIDO, NOSHOW
  payload   jsonb,
  criado_em timestamptz not null default now()
);

-- ============================================
-- TERMOS E ISENÇÃO
-- ============================================
create table term_acceptances (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  contexto    text not null,       -- 'CADASTRO' | 'REVELACAO_CONTATO'
  versao      text not null,       -- '2026-07-01'
  match_id    uuid references matches(id),
  ip          inet,
  aceito_em   timestamptz not null default now()
);

create index idx_termos_usuario on term_acceptances (user_id, contexto);

-- ============================================
-- DENÚNCIAS
-- ============================================
create table user_reports (
  id            uuid primary key default uuid_generate_v4(),
  autor_id      uuid not null references profiles(id) on delete cascade,
  denunciado_id uuid not null references profiles(id) on delete cascade,
  match_id      uuid references matches(id),
  motivo        text not null,     -- NAO_APARECEU, USO_PARA_VENDA,
                                   -- CARTA_DIFERENTE, CONDUTA, OUTRO
  descricao     text,
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now(),
  check (autor_id <> denunciado_id)
);

-- ============================================
-- NOTIFICAÇÕES
-- ============================================
create table notifications (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references profiles(id) on delete cascade,
  tipo      text not null,      -- NOVO_MATCH, CARTA_PROCURADA, MATCH_ACEITO,
                                -- LEMBRETE_CONFIRMACAO, MATCH_EXPIRADO
  titulo    text not null,
  corpo     text not null,
  link      text,
  lida      boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_notif_usuario on notifications (user_id, lida, criado_em desc);

create table push_subscriptions (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references profiles(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);
```

### Row Level Security

RLS ativo em todas as tabelas de usuário. A API usa a `service_role` key e aplica autorização própria, mas o RLS é a rede de segurança caso alguém acesse o Postgres direto ou você exponha o client Supabase no frontend.

```sql
alter table profiles            enable row level security;
alter table listings            enable row level security;
alter table matches             enable row level security;
alter table match_participants  enable row level security;
alter table match_items         enable row level security;
alter table notifications       enable row level security;
alter table push_subscriptions  enable row level security;
alter table term_acceptances    enable row level security;
alter table user_reports        enable row level security;

-- Perfis são públicos para leitura (reputação precisa ser visível)
create policy "perfis publicos"
  on profiles for select using (true);

create policy "edita proprio perfil"
  on profiles for update using (auth.uid() = id);

-- Anúncios ativos são públicos: é isso que torna a troca possível
create policy "le anuncios ativos"
  on listings for select using (ativo = true);

create policy "gerencia proprios anuncios"
  on listings for all using (auth.uid() = user_id);

-- Matches: só participantes veem.
--
-- Escritas assim em julho e REESCRITAS em 2026-08-18 (32_rls_do_match_sem_recursao.sql):
-- a do meio protegia `match_participants` com uma subconsulta na própria
-- `match_participants`, e avaliá-la exigia avaliá-la de novo — as três
-- respondiam `infinite recursion detected in policy`. A versão que vale hoje
-- delega a uma função `security definer`, que roda como o dono e por isso não
-- redispara a policy:
--
--   create policy "ve proprios matches"
--     on matches for select using (public.participa_do_match(id));
--   create policy "ve propria participacao"
--     on match_participants for select using (public.participa_do_match(match_id));
--   create policy "ve itens dos proprios matches"
--     on match_items for select using (public.participa_do_match(match_id));
create policy "ve proprios matches"
  on matches for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = matches.id and mp.user_id = auth.uid()
    )
  );

create policy "ve propria participacao"
  on match_participants for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = match_participants.match_id
        and mp.user_id = auth.uid()
    )
  );

create policy "ve itens dos proprios matches"
  on match_items for select using (
    exists (
      select 1 from match_participants mp
      where mp.match_id = match_items.match_id and mp.user_id = auth.uid()
    )
  );

create policy "ve proprias notificacoes"
  on notifications for all using (auth.uid() = user_id);

create policy "gerencia propria inscricao push"
  on push_subscriptions for all using (auth.uid() = user_id);

create policy "ve proprios aceites"
  on term_acceptances for select using (auth.uid() = user_id);

create policy "cria propria denuncia"
  on user_reports for insert with check (auth.uid() = autor_id);
```

### Decisões de modelagem que valem defender em entrevista

- **Ausência de tabela de coleção** — decisão de produto codificada no schema. `listings` só contém intenção de troca, o que elimina ambiguidade no matching.
- **`hash_grupo` único em `matches`** — impede que o job recrie o mesmo match a cada execução. O hash é `sha256` dos IDs de usuário ordenados + IDs de carta ordenados.
- **Reputação como função, não coluna** — evita desincronização entre o contador e o valor derivado.
- **Índice parcial `where ativo = true`** — a maioria das linhas de `listings` fica inativa com o tempo (carta trocada). O índice parcial mantém o custo baixo.
- **`match_items` com `de`/`para` explícitos** — permite representar troca direta e triangular na mesma estrutura, sem tabela separada.
- **Sem tabela de jogos** — YAGNI aplicado com caminho de migração documentado. Adicionar Lorcana depois custa uma migração de três linhas.
- **Acabamento como tabela de referência, não enum nem carta separada** — decisão detalhada na [seção 8](#8-acabamentos-finishes). Resumo: enum exigiria migração a cada set novo; carta separada multiplicaria o catálogo por 4. A tabela `finishes` + `card_finishes` resolve os dois.
- **Nome em PT e EN no catálogo** — no Brasil a Copag distribui cartas traduzidas. O jogador busca "Pesquisa do Professor", não "Professor's Research". Sem o nome em português, a busca falha justamente nas cartas de treinador, que são as mais trocadas.

---

## 8. Acabamentos (finishes)

Esta seção existe porque a modelagem ingênua — um enum com `NORMAL / REVERSE / HOLO` — está errada, e errar aqui compromete o produto inteiro. No Pokémon TCG moderno, o acabamento é frequentemente o que **define** o valor da carta.

### 14.1 O problema, dimensionado

A mesma carta, mesmo número, mesmo set, existe em múltiplas versões que valem coisas radicalmente diferentes. Prismatic Evolutions (janeiro de 2025) foi o divisor de águas: foi o primeiro set em inglês com três padrões distintos de reverse holo — Poké Ball, Master Ball e o reverse tradicional com símbolos de tipo ao fundo. Um colecionador de master set precisa de quatro versões de cada comum, incomum e rara.

Em números: o set tem reverse comum (108 cartas), Poké Ball (100) e Master Ball (67). As versões Poké Ball e Master Ball ainda trazem textura e camada de vidro estilhaçado, como as japonesas.

E isso não foi pontual. Virou padrão da linha:

- **Black Bolt / White Flare** (2025): três conjuntos de reverse holo, incluindo padrões Poké Ball e Master Ball em versão arco-íris.
- **Ascended Heroes** (janeiro de 2026): dois reverse holo para cada Pokémon regular em vez do usual. Um traz o símbolo de energia do Pokémon; o outro exibe Love Ball, Quick Ball, Friend Ball, Dusk Ball ou o símbolo da Equipe Rocket.

Repare no que aconteceu em Ascended Heroes: **cinco padrões novos de uma vez**, nenhum previsível a partir dos sets anteriores. Qualquer enum escrito em 2025 já estaria quebrado em 2026.

A diferença de preço é o que torna isso obrigatório, não um refinamento. Um Umbreon Master Ball de Prismatic Evolutions é negociado na casa das dezenas de dólares, enquanto o mesmo Umbreon em reverse comum sai por uma fração disso. Tratar as duas versões como a mesma carta faria o app sugerir trocas absurdas — e uma sugestão absurda destrói a confiança no feed, que é o único ativo real do produto.

### 14.2 O que a API entrega (e o que não entrega)

A TCGdex expõe um campo `variants` por carta, mas ele é grosseiro:

```json
"variants": {
  "normal": true,
  "reverse": true,
  "holo": false,
  "firstEdition": false
}
```

Isso responde "existe reverse?", não "**qual** reverse". Poké Ball, Master Ball, Quick Ball, Dusk Ball e vidro estilhaçado ficam todos colapsados no mesmo booleano `reverse: true`.

A documentação da TCGdex confirma que um campo `variants_detailed`, com IDs de marketplace por variante, está em desenvolvimento — mas ainda não existe, e não há data de entrega. Nenhuma API gratuita hoje entrega a taxonomia completa de acabamentos.

**Conclusão: esse dado é nosso.** É preciso modelar, popular e manter por conta própria. E isso é uma vantagem: é a parte do sistema que nenhum concorrente gratuito tem, e é conteúdo defensável em entrevista.

### 14.3 Taxonomia

Compilada a partir de referências de colecionadores e do histórico de sets. Duas famílias.

**Família A — padrão de era.** Todo set tem um reverse holo "padrão", cujo desenho muda por série:

| Era | Padrão do reverse comum |
|---|---|
| WOTC (1999–2003) | Starlight / Starburst, depois Cosmos |
| Diamond & Pearl / Platinum | Brilho arco-íris vertical |
| HeartGold SoulSilver | Sheen com arco-íris vertical |
| Black & White | Símbolos de tipo em tamanhos variados |
| XY | Sheen diagonal |
| Sun & Moon | Water web (ondulado) |
| Sword & Shield | Chevrons ascendentes com símbolo de tipo |
| Scarlet & Violet | Símbolos de tipo com formas de seixo |

**Família B — padrões especiais.** Os que realmente movem preço:

| Código | Nome | Onde aparece |
|---|---|---|
| `POKEBALL` | Poké Ball reverse | Prismatic Evolutions, Black Bolt/White Flare |
| `MASTERBALL` | Master Ball reverse | Prismatic Evolutions, Black Bolt/White Flare |
| `QUICKBALL` | Quick Ball reverse | Ascended Heroes |
| `LOVEBALL` | Love Ball reverse | Ascended Heroes |
| `FRIENDBALL` | Friend Ball reverse | Ascended Heroes |
| `DUSKBALL` | Dusk Ball reverse | Ascended Heroes |
| `ROCKET` | Símbolo Equipe Rocket | Ascended Heroes |
| `SHATTERED` | Vidro estilhaçado / textura | Combinado com Poké/Master Ball |
| `COSMOS` | Cosmos / galaxy holo | Vintage e promos |
| `CRACKEDICE` | Cracked ice | Theme decks, promos |
| `SHEEN` | Sheen liso | Energias básicas de Prismatic |

Não trate essa lista como fechada. Ela **vai** crescer — esse é o ponto central da seção.

### 14.4 Modelo de dados

Três requisitos: adicionar acabamento novo sem migração de schema; saber quais acabamentos existem para cada carta; não multiplicar o catálogo por quatro.

```sql
-- ============================================
-- ACABAMENTOS
-- ============================================
create table finishes (
  id            smallint primary key,
  codigo        text not null unique,        -- 'MASTERBALL'
  nome_pt       text not null,               -- 'Master Ball reverse'
  nome_en       text not null,
  familia       text not null,               -- BASE | REVERSE | ESPECIAL
  multiplicador numeric(4,2) not null default 1.00,  -- peso de valor relativo
  ordem         smallint not null default 0, -- ordem de exibição na UI
  ativo         boolean not null default true
);

insert into finishes (id, codigo, nome_pt, nome_en, familia, multiplicador, ordem) values
  (1,  'NORMAL',     'Normal (sem foil)',   'Non-holo',            'BASE',      1.00, 10),
  (2,  'HOLO',       'Holo',                'Holofoil',            'BASE',      2.00, 20),
  (3,  'REVERSE',    'Reverse holo',        'Reverse holo',        'REVERSE',   1.50, 30),
  (10, 'POKEBALL',   'Poké Ball reverse',   'Poke Ball pattern',   'ESPECIAL',  4.00, 40),
  (11, 'MASTERBALL', 'Master Ball reverse', 'Master Ball pattern', 'ESPECIAL', 12.00, 50),
  (12, 'QUICKBALL',  'Quick Ball reverse',  'Quick Ball pattern',  'ESPECIAL',  4.00, 60),
  (13, 'LOVEBALL',   'Love Ball reverse',   'Love Ball pattern',   'ESPECIAL',  4.00, 61),
  (14, 'FRIENDBALL', 'Friend Ball reverse', 'Friend Ball pattern', 'ESPECIAL',  4.00, 62),
  (15, 'DUSKBALL',   'Dusk Ball reverse',   'Dusk Ball pattern',   'ESPECIAL',  4.00, 63),
  (16, 'ROCKET',     'Equipe Rocket',       'Team Rocket pattern', 'ESPECIAL',  5.00, 64),
  (20, 'SHATTERED',  'Vidro estilhaçado',   'Shattered glass',     'ESPECIAL',  3.00, 70),
  (21, 'COSMOS',     'Cosmos holo',         'Cosmos holo',         'ESPECIAL',  3.00, 71),
  (22, 'CRACKEDICE', 'Cracked ice',         'Cracked ice holo',    'ESPECIAL',  2.50, 72),
  (23, 'SHEEN',      'Sheen',               'Sheen holo',          'REVERSE',   1.20, 73);

-- Quais acabamentos existem para cada carta.
-- Sem isso, o app deixaria alguém anunciar um Master Ball
-- de uma carta que nunca foi impressa nesse padrão.
create table card_finishes (
  card_id     uuid not null references cards(id) on delete cascade,
  finish_id   smallint not null references finishes(id),
  origem      text not null default 'REGRA_SET',
              -- REGRA_SET | API | CURADORIA | COMUNIDADE
  confirmado  boolean not null default false,
  primary key (card_id, finish_id)
);

create index idx_cf_carta on card_finishes (card_id) where confirmado = true;

-- Regras por set: a base do povoamento automático
create table set_finish_rules (
  id          serial primary key,
  set_code    text not null,
  finish_id   smallint not null references finishes(id),
  aplica_a    text not null default 'TODOS',
              -- TODOS | POKEMON_REGULAR | TREINADOR | ENERGIA | RARIDADE:<x>
  observacao  text,
  unique (set_code, finish_id, aplica_a)
);
```

O `multiplicador` merece atenção. Ele não é preço — é **peso relativo** usado pelo matching para detectar troca desequilibrada. Um Master Ball vale muito mais que o reverse comum da mesma carta, e sem esse peso o app sugeriria a troca como se fossem equivalentes. Calibre os valores com dados reais depois do lançamento; comece com os da tabela acima.

### 8.5 Como popular `card_finishes`

Três camadas, em ordem de confiança.

**Camada 1 — regra por set (cobre a maioria).** Cada set declara quais acabamentos existem e para que tipo de carta:

```sql
-- Prismatic Evolutions (sv8pt5)
insert into set_finish_rules (set_code, finish_id, aplica_a, observacao) values
  ('sv8pt5',  3, 'TODOS',           'reverse comum: 108 cartas'),
  ('sv8pt5', 10, 'TODOS',           'Poké Ball: 100 cartas'),
  ('sv8pt5', 11, 'POKEMON_REGULAR', 'Master Ball: 67 cartas, exclui Pokémon ex'),
  ('sv8pt5', 23, 'ENERGIA',         'energias básicas apenas em sheen');
```

A exclusão dos Pokémon ex do Master Ball não é detalhe: apenas os Pokémon regulares do set principal, excluindo Pokémon ex, saíram em Master Ball reverse. Sem essa regra, o app ofereceria uma versão que não existe.

**Camada 2 — sinal da API.** Quando a TCGdex diz `reverse: false` para uma carta, remova dela os acabamentos de reverse, independentemente da regra do set. A API erra por omissão, raramente por excesso.

**Camada 3 — curadoria da comunidade.** Todo anúncio com acabamento não confirmado ganha um marcador discreto. Se três usuários diferentes anunciarem o mesmo par carta + acabamento, ele é promovido a `confirmado = true` com origem `COMUNIDADE`.

```python
async def promover_por_uso(session: AsyncSession, limiar: int = 3) -> int:
    # Acabamentos que a comunidade confirma na prática viram catálogo.
    # Roda no job diário. É o mecanismo que mantém o catálogo vivo
    # sem exigir curadoria manual a cada set novo.
    resultado = await session.execute(text("""
        update card_finishes cf
           set confirmado = true, origem = 'COMUNIDADE'
          from (
            select card_id, finish_id, count(distinct user_id) as n
              from listings
             where ativo
             group by 1, 2
            having count(distinct user_id) >= :limiar
          ) uso
         where uso.card_id = cf.card_id
           and uso.finish_id = cf.finish_id
           and cf.confirmado = false
        returning cf.card_id
    """), {"limiar": limiar})
    return resultado.rowcount
```

Essa terceira camada é o que faz o sistema envelhecer bem. Quando sair um set com um padrão "Heal Ball" em 2027, os usuários vão começar a anunciar antes de você atualizar qualquer regra — e o sistema aprende sozinho.

**Adicionar um acabamento novo custa um `insert`**, não uma migração. Essa é a diferença prática entre a tabela de referência e o enum, e é o motivo de toda a seção existir.

#### Como ficou na prática (implementado em `db/schema/19_acabamentos.sql`)

Três correções ao plano acima, todas descobertas ao executá-lo:

1. **Nasceu uma camada 0, mais barata e mais confiável que a camada 1: o preço.**
   `card_prices.tipo_tcgplayer` já diz, por evidência de mercado, quais impressões
   existem — se a TCGplayer publica preço de `reverse-holofoil` para uma carta,
   aquela carta foi impressa em reverse. Um `insert ... select` cobriu **14.316
   das 15.997 cartas** sem uma requisição de rede. A regra por set ficou só para
   o que preço nenhum revela: os padrões especiais.
2. **O vocabulário de `aplica_a` mudou porque metade dele era inavaliável.**
   `POKEMON_REGULAR`, `TREINADOR` e `ENERGIA` supõem uma coluna de categoria da
   carta que `cards` não tem — a normalização da migração 12 trouxe set e série,
   não supertipo. O que existe hoje: `TODOS`, `COM_REVERSE` (as cartas do set que
   já têm reverse — recorte natural dos padrões de bola, que são todos variação de
   reverse), `NUMERO:a-b` e `RARIDADE:x`. A exclusão dos Pokémon ex do Master Ball
   continua sendo feita, agora pela faixa de número.
3. **A ponte entre as duas taxonomias virou coluna:** `finishes.tipos_tcgplayer`
   diz quais baldes da TCGplayer representam cada acabamento. Ela serve nos dois
   sentidos — descobrir acabamento a partir de preço (o backfill) e escolher a
   linha de preço a partir do acabamento (a UI, ao mostrar o valor da carta
   anunciada). Duas cópias dessa tabela em lugares diferentes é como duas telas
   começam a discordar sobre quanto vale a mesma carta.

A camada 3 (curadoria da comunidade) continua não implementada, e `multiplicador`
segue sem uso: o preço mostrado é o do balde real quando existe, e o da impressão
de origem — marcado como aproximado — quando a fonte não separa. Multiplicar um
preço de mercado por um peso nosso daria falsa precisão a um número que já é
estimativa.

### 8.6 Efeito no matching

O matching passa a casar **carta + acabamento**, não só carta:

```sql
recebo as (
  select l.user_id as parceiro_id, l.card_id, l.finish_id, l.condicao,
         mp.prioridade
  from listings l
  join minhas_procuras mp
    on mp.card_id = l.card_id
   and mp.finish_id = l.finish_id      -- casamento exato de acabamento
  where l.tipo = 'OFERTA' and l.ativo and l.user_id <> :meu_id
),
```

Duas regras adicionais:

1. **Equilíbrio por multiplicador.** A penalidade de desequilíbrio usa `preco_ref × multiplicador`, não `preco_ref` puro. Sem isso, trocar um Master Ball por um reverse comum da mesma carta pareceria justo.

2. **Match aproximado, sempre rotulado.** Se o usuário marcar "aceito outros acabamentos" no anúncio de PROCURA (campo `aceita_qualquer_finish boolean default false`), o matcher pode sugerir acabamento diferente — com penalidade pesada no score e rótulo explícito no card: *"Acabamento diferente do que você procura"*. Nunca sugira acabamento divergente em silêncio.

### 8.7 Efeito na interface

O acabamento é decisão de primeira classe no cadastro, ao lado da condição — não um campo escondido em "opções avançadas".

- O seletor mostra **apenas os acabamentos que existem** para aquela carta (via `card_finishes`), impedindo anúncio impossível
- Acabamentos especiais têm destaque visual; um Master Ball no feed precisa ser reconhecível de relance
- No card de match, o acabamento aparece junto ao nome, sempre: **"Umbreon · Master Ball reverse · NM"**
- Acabamento não confirmado mostra marcador discreto "não verificado", sem bloquear o anúncio
- Use os nomes que a comunidade usa: "Master Ball", nunca "variante especial tipo 11"

### 8.8 Por que isso vale o esforço

Três razões, em ordem de importância:

1. **Sem isso o matching mente.** Sugerir troca de Master Ball por reverse comum é pior que não sugerir nada — o usuário perde a confiança no feed e não volta.
2. **É onde o colecionismo mora.** Quem persegue master set está atrás exatamente dessas variações. É o público que mais troca, e é ele que dá densidade à rede.
3. **Nenhuma API gratuita tem esse dado.** É a parte mais defensável do projeto tecnicamente, e a mais interessante de explicar numa entrevista: taxonomia própria, populada por regra, corrigida por API e mantida viva pela comunidade.

---

## 9. Motor de matching

### 9.1 Match direto e múltiplo (SQL, tempo real)

Roda na requisição do usuário. Retorna parceiros com reciprocidade.

```sql
-- Parâmetros: :meu_id, :meu_bairro, :limite
with minhas_procuras as (
  select card_id, prioridade
  from listings
  where user_id = :meu_id and tipo = 'PROCURA' and ativo
),
minhas_ofertas as (
  select card_id, condicao
  from listings
  where user_id = :meu_id and tipo = 'OFERTA' and ativo
),
-- cartas que EU recebo de cada parceiro
recebo as (
  select l.user_id as parceiro_id,
         l.card_id,
         l.condicao,
         mp.prioridade
  from listings l
  join minhas_procuras mp on mp.card_id = l.card_id
  where l.tipo = 'OFERTA' and l.ativo and l.user_id <> :meu_id
),
-- cartas que EU entrego para cada parceiro
entrego as (
  select l.user_id as parceiro_id,
         l.card_id,
         mo.condicao,
         l.prioridade
  from listings l
  join minhas_ofertas mo on mo.card_id = l.card_id
  where l.tipo = 'PROCURA' and l.ativo and l.user_id <> :meu_id
),
pares as (
  select coalesce(r.parceiro_id, e.parceiro_id) as parceiro_id,
         count(distinct r.card_id) as qtd_recebo,
         count(distinct e.card_id) as qtd_entrego,
         coalesce(sum(distinct c_r.preco_ref), 0) as valor_recebo,
         coalesce(sum(distinct c_e.preco_ref), 0) as valor_entrego,
         avg(r.prioridade) as prio_media
  from recebo r
  full outer join entrego e on e.parceiro_id = r.parceiro_id
  left join cards c_r on c_r.id = r.card_id
  left join cards c_e on c_e.id = e.card_id
  group by 1
)
select p.*,
       pr.username,
       pr.nome_exibicao,
       pr.bairro,
       reputacao(pr.*) as reputacao,
       -- SCORE
       (
         least(p.qtd_recebo, p.qtd_entrego) * 10          -- trocas efetivas
         + (4 - p.prio_media) * 5                         -- urgência da procura
         - abs(p.valor_recebo - p.valor_entrego) * 0.05   -- desequilíbrio
         + coalesce(reputacao(pr.*), 50) * 0.2            -- confiabilidade
         + case when pr.bairro = :meu_bairro then 8 else 0 end
       ) as score
from pares p
join profiles pr on pr.id = p.parceiro_id
where p.qtd_recebo > 0
  and p.qtd_entrego > 0
  and pr.bloqueado = false
order by score desc
limit :limite;
```

**Classificação do resultado:** `qtd_recebo = 1 and qtd_entrego = 1` → `DIRETO`. Qualquer valor maior → `MULTIPLO`.

**Performance esperada:** com 500 usuários e 200 anúncios cada (100 mil linhas em `listings`), essa query roda em ~30–80 ms com os índices definidos. Documente isso no README — mostra que você mediu.

### 9.2 Match triangular (Python, job diário)

Existe quando não há reciprocidade direta, mas o ciclo fecha: **A** oferece o que **B** procura, **B** oferece o que **C** procura, **C** oferece o que **A** procura.

**Por que não em SQL:** exigiria auto-join triplo com produto cartesiano intermediário. Em Python com estruturas de adjacência, é linear no número de arestas.

**Passo 1 — extrair arestas do grafo:**

```sql
-- Uma aresta A→B significa: A oferece uma carta que B procura
select distinct
  o.user_id as de_user,
  p.user_id as para_user,
  o.card_id,
  o.condicao
from listings o
join listings p
  on p.card_id = o.card_id
 and p.tipo = 'PROCURA'
 and p.ativo
where o.tipo = 'OFERTA'
  and o.ativo
  and o.user_id <> p.user_id;
```

**Passo 2 — detectar ciclos de tamanho 3:**

```python
# app/matching/triangular.py
from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class Aresta:
    de: UUID
    para: UUID
    card_id: UUID
    condicao: str


@dataclass
class Triangulo:
    ciclo: tuple[UUID, UUID, UUID]
    itens: list[Aresta]
    score: float


def detectar_triangulos(
    arestas: list[Aresta],
    max_por_usuario: int = 5,
) -> list[Triangulo]:
    """
    Encontra ciclos A→B→C→A no grafo de trocas.

    Complexidade: O(V * d²), onde d é o grau médio de saída.
    Para uma comunidade local (V ~ 500, d ~ 20) roda em menos de 1 s.
    Se V passar de ~5.000, particionar por cidade antes de rodar.
    """
    # adjacência: quem cada usuário consegue atender
    saida: dict[UUID, set[UUID]] = defaultdict(set)
    # índice de arestas para reconstruir os itens depois
    por_par: dict[tuple[UUID, UUID], list[Aresta]] = defaultdict(list)

    for a in arestas:
        saida[a.de].add(a.para)
        por_par[(a.de, a.para)].append(a)

    vistos: set[frozenset[UUID]] = set()
    resultado: list[Triangulo] = []
    contagem: dict[UUID, int] = defaultdict(int)

    for a in saida:
        for b in saida[a]:
            if b == a:
                continue
            for c in saida.get(b, ()):
                if c == a or c == b:
                    continue
                # fecha o ciclo?
                if a not in saida.get(c, ()):
                    continue

                chave = frozenset((a, b, c))
                if chave in vistos:
                    continue
                vistos.add(chave)

                # respeita limite por usuário para não inundar o feed
                if any(contagem[u] >= max_por_usuario for u in (a, b, c)):
                    continue

                itens = [
                    melhor_aresta(por_par[(a, b)]),
                    melhor_aresta(por_par[(b, c)]),
                    melhor_aresta(por_par[(c, a)]),
                ]
                tri = Triangulo(
                    ciclo=(a, b, c),
                    itens=itens,
                    score=calcular_score(itens),
                )
                resultado.append(tri)
                for u in (a, b, c):
                    contagem[u] += 1

    resultado.sort(key=lambda t: t.score, reverse=True)
    return resultado


def melhor_aresta(candidatas: list[Aresta]) -> Aresta:
    """Prefere a carta em melhor condição."""
    ordem = {"NM": 0, "LP": 1, "MP": 2, "HP": 3, "DMG": 4}
    return min(candidatas, key=lambda a: ordem.get(a.condicao, 9))
```

**Passo 3 — persistir** com `hash_grupo` para evitar duplicata, `status = 'SUGERIDO'` e `expira_em = now() + 7 dias`.

### 9.3 Fórmula de score

| Componente | Peso | Racional |
|---|---|---|
| `min(recebo, entrego) × 10` | Alto | Trocas efetivas são o que importa; 5 cartas de um lado e 1 do outro fecha só 1 troca |
| `(4 − prioridade_média) × 5` | Médio | Carta marcada como prioridade 1 vale mais que prioridade 3 |
| `−abs(valor_A − valor_B) × 0.05` | Penalidade | Troca desequilibrada é recusada; não vale sugerir |
| `reputação × 0.2` | Médio | Usuário confiável primeiro |
| `+8 se mesmo bairro` | Bônus | Escrito, mas **inerte**: nenhuma tela pede bairro, então o campo é nulo para todo mundo e o bônus nunca soma. Ver a decisão de 2026-08-14 no item 5 da fila (seção 17) — a troca acontece em loja e em evento, não por proximidade de endereço |
| `−25 se acabamento diferente` | Penalidade | Só entra se o usuário marcou "aceito outros acabamentos". Ver seção 8.6 |
| Desequilíbrio usa `preco_ref × multiplicador` | Correção | Um Master Ball não equivale ao reverse comum da mesma carta |

Deixe esses pesos em variáveis de configuração (`app/core/config.py`), não hardcoded. Você vai querer ajustar depois de ver dados reais.

### 9.4 Quando cada tipo roda

| Tipo | Gatilho | Onde |
|---|---|---|
| Direto / Múltiplo | Requisição `GET /matches` | SQL, tempo real |
| Triangular | Cron diário às 06:00 | Job Python |
| Notificação "procuram sua carta" | Novo anúncio de PROCURA | Job leve, a cada 15 min |

### 9.5 O que este motor não alcança

Tudo acima depende de os **dois** lados terem declarado PROCURA. Quem só
cadastrou o OFERTA — porque não sabe o que quer, o que é comum — fica invisível
para o matcher, por mais cartas que tenha. Esse caso é atendido pela vitrine e
pelas propostas, na [seção 22](#22-vitrine-e-propostas), que trabalha com um lado
só declarado e desemboca no mesmo `matches` deste motor.

---

## 10. API — contratos

Base: `https://api.trocatcg.com.br/v1`
Autenticação: `Authorization: Bearer <jwt>`

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/register` | Cria conta. Body: `email`, `senha`, `username`, `nome_exibicao`, `aceite_termos` |
| `POST` | `/auth/login` | Retorna `access_token`, `refresh_token` |
| `POST` | `/auth/refresh` | Renova token |
| `POST` | `/auth/logout` | Invalida refresh token |
| `DELETE` | `/auth/account` | Exclui conta e dados (LGPD) |

O campo `aceite_termos` é obrigatório e booleano. Sem ele, `422`.

### Catálogo

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/cards/search` | Query: `q`, `set`, `page`. Busca trigram por nome |
| `GET` | `/cards/{id}` | Detalhe da carta |
| `GET` | `/sets` | Sets (expansões) de Pokémon disponíveis para filtro |

### Anúncios de troca

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/me/listings` | Query: `tipo=OFERTA\|PROCURA` |
| `POST` | `/me/listings` | Coloca carta para trocar ou procurar |
| `PATCH` | `/me/listings/{id}` | Altera quantidade, condição, prioridade |
| `DELETE` | `/me/listings/{id}` | Remove (soft delete: `ativo = false`) |
| `POST` | `/me/listings/bulk` | Cadastro em massa via lista de códigos |

**Exemplo — `POST /me/listings`:**

```json
{
  "card_id": "9c4f...",
  "tipo": "PROCURA",
  "quantidade": 1,
  "condicao": "NM",
  "idioma": "pt",
  "prioridade": 1
}
```

Resposta `201`:
```json
{
  "id": "3ab1...",
  "card": { "nome": "Charizard ex", "set_code": "OBF", "numero": "125" },
  "tipo": "PROCURA",
  "prioridade": 1,
  "matches_imediatos": 3
}
```

O campo `matches_imediatos` é deliberado: dá feedback instantâneo de valor logo no cadastro. É o que faz o usuário continuar preenchendo as listas.

### Matches

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/matches` | Feed. Query: `tipo`, `status`, `page` |
| `GET` | `/matches/{id}` | Detalhe: quem entrega o quê para quem |
| `POST` | `/matches/{id}/accept` | Registra aceite deste usuário |
| `POST` | `/matches/{id}/decline` | Recusa e remove do feed |
| `POST` | `/matches/{id}/reveal-contact` | Exige aceite do disclaimer; retorna contato |
| `POST` | `/matches/{id}/complete` | Confirma conclusão (exige todos) |
| `POST` | `/matches/{id}/no-show` | Reporta que o outro não apareceu |

**Exemplo — `GET /matches/{id}` (triangular):**

```json
{
  "id": "7f2c...",
  "tipo": "TRIANGULAR",
  "status": "PENDENTE",
  "score": 68.5,
  "expira_em": "2026-08-01T12:00:00Z",
  "participantes": [
    { "username": "eduardo", "posicao": 0, "aceitou": true,  "reputacao": 100 },
    { "username": "marina",  "posicao": 1, "aceitou": null,  "reputacao": 92  },
    { "username": "rafa",    "posicao": 2, "aceitou": true,  "reputacao": 88  }
  ],
  "fluxo": [
    { "de": "eduardo", "para": "marina", "carta": "Pikachu VMAX",  "condicao": "NM" },
    { "de": "marina",  "para": "rafa",   "carta": "Mewtwo ex",     "condicao": "LP" },
    { "de": "rafa",    "para": "eduardo","carta": "Charizard ex",  "condicao": "NM" }
  ],
  "contatos_liberados": false
}
```

`contatos_liberados` vira `true` só quando **todos** aceitam **e** o usuário aceitou o disclaimer via `/reveal-contact`. É a regra de privacidade e de isenção combinadas.

As rotas de vitrine e proposta — `/vitrine` e `/me/propostas` — estão na
[seção 22.7](#227-api--contratos). Elas param no aceite: a partir dali a troca é
um `matches` comum e responde às rotas desta tabela.

### Perfil, denúncias e notificações

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/u/{username}` | Perfil público: reputação com os contadores, bairro, bio e antiguidade. Exige login |
| `GET` | `/me` | Perfil próprio |
| `PATCH` | `/me` | Atualiza perfil |
| `POST` | `/me/matches/{id}/denunciar` | Denuncia a outra pessoa **desta troca**. Motivos incluem `USO_PARA_VENDA` |
| `GET` | `/me/notifications` | Lista, com `?nao_lidas=true` e `?limite=` (teto de 100) |
| `GET` | `/me/notifications/nao-lidas` | Só a contagem — é o que a badge lê |
| `POST` | `/me/notifications/read` | Marca as do corpo, ou todas se vier vazio. Devolve a contagem restante |
| `POST` | `/me/push-subscription` | Registra o endpoint Web Push deste navegador. Idempotente: o upsert é por `endpoint` |
| `DELETE` | `/me/push-subscription` | Desliga o aviso **deste** navegador; os outros aparelhos continuam |

A contagem tem rota separada da lista porque são duas perguntas com frequências
muito diferentes: a badge pergunta em toda troca de tela e quer um inteiro; a
caixa pergunta quando alguém a abre e quer cinquenta linhas. `POST /read`
devolver a contagem que sobrou, em vez de quantas foram marcadas, é o que evita
a segunda chamada que o cliente faria logo em seguida.

Não há rota para **criar** notificação, e não haverá: quem cria é o evento, nos
serviços, dentro da mesma transação que gravou a proposta ou o match.

A denúncia é presa ao match, e não a `/reports` com um `denunciado_id` no corpo
como esta seção previa. O motivo é antiabuso e vale a mudança de rota: com o id
no corpo, participar de um match qualquer viraria licença para denunciar
qualquer pessoa iterando @s; preso ao match, denunciar custa ter cruzado com
quem se denuncia. O denunciado sai do banco, não do cliente.

**Não há rota de leitura de denúncias, e é de propósito.** A API grava e não lê;
`22_denuncias.sql` revoga `anon` e `authenticated` da tabela. Quem modera lê pelo
SQL Editor do Supabase com o runbook versionado em `db/queries/moderacao.sql` —
fila, contexto do match, reincidência dos dois lados, e as duas únicas ações
(marcar resolvida, `profiles.bloqueado`). Reputação não se mexe daí: ela é dos
desfechos do match, que exigem os dois lados, senão a denúncia viraria arma.
Quando a fila crescer a ponto de o SQL Editor incomodar, o caminho é uma rota
atrás do `X-Job-Secret`, no padrão dos internos abaixo.

### Públicos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/legal/terms` | Termos de uso e isenção, com versão vigente |
| `GET` | `/legal/privacy` | Política de privacidade |

### Internos (protegidos por header secreto)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/internal/jobs/triangular` | Recomputa triangulares |
| `POST` | `/internal/jobs/sync-catalog` | Sincroniza catálogo Pokémon |
| `POST` | `/internal/jobs/expire` | Expira matches e propostas vencidos |
| `POST` | `/internal/jobs/notify-wanted` | Notifica "procuram sua carta". Varre uma janela de 24h (`?horas=`), e o cron a chama a cada 15 min — a janela é maior que o intervalo de propósito, para uma execução perdida não deixar buraco |

### Padrão de erro

```json
{
  "erro": {
    "codigo": "CARTA_JA_ANUNCIADA",
    "mensagem": "Essa carta já está na sua lista de Procuro.",
    "campo": "card_id"
  }
}
```

Código em `SCREAMING_SNAKE` para o cliente tratar; mensagem em português pronta para exibir.

---

## 11. Autenticação e segurança

### Fluxo

1. Frontend chama Supabase Auth diretamente (`signUp` / `signInWithPassword`)
2. Supabase retorna JWT assinado (HS256, segredo do projeto)
3. Frontend envia JWT no header para a API FastAPI
4. FastAPI valida assinatura e extrai `sub` (user id)

```python
# app/core/auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from uuid import UUID

from app.core.config import settings

security = HTTPBearer()


async def usuario_atual(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> UUID:
    try:
        payload = jwt.decode(
            cred.credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida. Entre novamente.",
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token sem identificação.")
    return UUID(sub)
```

### Checklist de segurança

- [ ] `SUPABASE_SERVICE_ROLE_KEY` **nunca** no frontend — só no backend
- [ ] CORS restrito ao domínio do PWA
- [ ] Rate limit: 100 req/min por usuário (`slowapi`)
- [ ] Rotas `/internal/*` protegidas por header `X-Job-Secret`
- [ ] Contato do usuário nunca serializado antes do aceite mútuo **e** do aceite do disclaimer
- [ ] Validação de entrada por Pydantic em toda rota
- [ ] SQL sempre parametrizado (nunca f-string)
- [ ] HTTPS obrigatório; HSTS no Cloudflare
- [ ] Denúncia de usuário com bloqueio manual via flag `profiles.bloqueado`
- [ ] Exclusão de conta funcional (LGPD), com cascade em todas as tabelas

### Privacidade — regra de ouro

O contato (telefone/Instagram) é o ativo mais sensível. Ele só existe na resposta da API depois que todos os participantes aceitaram **e** o solicitante registrou aceite do disclaimer. Implemente com dois schemas Pydantic distintos:

```python
class ParticipanteResumo(BaseModel):
    username: str
    nome_exibicao: str
    reputacao: int | None
    bairro: str | None
    # sem contato

class ParticipanteCompleto(ParticipanteResumo):
    contato_visivel: str
```

O serviço escolhe qual usar. Assim é impossível vazar por engano — não depende de o frontend esconder nada.

### Quem pode moderar e mexer no app

Levantado em 2026-08-11 consultando cada console, não de memória. **Hoje é uma
pessoa só: o Eduardo.** Esta subseção existe para que isso seja uma afirmação
verificada e datada, e para que o dia em que deixar de ser verdade tenha um
lugar onde ser registrado.

O app não tem papel de administrador. Não há coluna de papel em `profiles`, não
há rota de admin, não há tela. Toda rota da API pergunta uma coisa só — quem é o
dono deste token — e nenhuma pergunta se essa pessoa pode mais que as outras. A
fronteira do poder não passa entre usuários do app: passa entre quem tem as
credenciais de infraestrutura e quem não tem.

| Onde | Quem | O que pode | Verificado por |
|---|---|---|---|
| GitHub `eduardowav/troca-tcg` | `eduardowav` (único colaborador, admin) | Alterar código, secrets e workflows — o que roda em produção | `gh api .../collaborators` |
| Supabase (org `eduardowav's Org`) | conta do Eduardo | Banco inteiro: ler contato e e-mail de todos, escrever qualquer linha | `list_organizations` |
| Render (workspace `My Workspace`) | `eduardowav@icloud.com` | Variáveis de ambiente e deploy da API e do PWA | `list_workspaces` |
| Moderação de denúncias | quem tem a connection string | Ler `user_reports` e bloquear perfil, à mão no SQL Editor | `db/queries/moderacao.sql` |

Quatro coisas que essa tabela deixa explícitas e que valem dizer em voz alta:

**Moderar hoje é ter o banco inteiro.** Não existe privilégio intermediário:
quem lê a fila de denúncias é quem pode ler o `contato_visivel` de toda a base.
Enquanto for uma pessoa e ela for a dona do projeto, isso é irrelevante. Deixa
de ser no instante em que alguém for convidado só para moderar — e aí o caminho
é o que o runbook já desenha, uma rota atrás do `X-Job-Secret`.

**O Claude Code não é uma segunda identidade.** Ele age com as credenciais do
Eduardo, na máquina do Eduardo: o `gh` autenticado como `eduardowav`, o git
assinando como ele, os MCP de Supabase e Render na sessão dele. Não há conta,
chave nem trilha de auditoria própria — o que o agente faz aparece nos consoles
como ação do Eduardo. O único rastro que separa os dois é o `Co-Authored-By` nos
commits, que é convenção de mensagem, não controle de acesso. Listar "o Claude
Code" como quem pode mexer no app é honesto na prática e falso no papel: o poder
é o do Eduardo, emprestado a cada sessão. A regra que decorre disso é a que já
vale — commit, push e qualquer ação irreversível são pedidos um de cada vez.

**Bloquear não bloqueia.** A única ação de moderação que existe,
`bloqueado = true`, tira a pessoa das listagens mas não a impede de criar
anúncio, abrir proposta ou aceitar match. É o item 3 do bloco de segurança da
seção 17.

**Ninguém tem cópia das chaves.** Uma pessoa só detém tudo: GitHub, Supabase,
Render e a senha do backup (`BACKUP_PASSPHRASE`, seção 15), que não existe em
lugar nenhum além do secret e de onde ele a guardou. Não é problema de segurança
— é de continuidade, e o remédio não é técnico.

---

## 12. Notificações

Sem Telegram. Três canais, todos gratuitos:

### 11.1 In-app (principal) — **feito em 2026-08-11**

Tabela `notifications` + badge no sino do cabeçalho + a caixa em `/notificacoes`.
Atualização por **Supabase Realtime** (incluído no free tier): o frontend assina
os INSERTs da tabela filtrados por `user_id`, em `hooks/useNotificacoes.ts`, e a
assinatura é montada uma vez no `LayoutApp`. Zero polling, zero custo.

**O motivo de tudo isto é uma frase:** uma proposta vence em 72 horas e, até
aqui, morria calada. Quem recebia só descobria abrindo o app por conta própria.
Os outros doze eventos entraram junto porque a mesma tabela e o mesmo caminho
servem a todos, não porque cada um valesse um sistema.

Três decisões que valem mais que o código:

**O texto mora no backend.** A tabela guarda `titulo` e `corpo` já escritos, e
não um par (tipo, payload) para o cliente traduzir. A linha precisa continuar
fazendo sentido daqui a um mês, com o app já mudado — e o Web Push entrega esses
dois campos direto ao sistema operacional, onde não existe tradução do lado do
cliente. `services/notificacoes.py` é o catálogo inteiro.

**Notificação é parte da transação do evento.** Nada em `notificacoes.py`
commita: cada função escreve na sessão de quem a chamou. Se a proposta não foi
gravada, o aviso de que ela chegou não pode existir.

**Ninguém é notificado do que fez.** O `_notificar` descarta em silêncio
qualquer escrita para quem disparou o evento. É guarda de verdade, não zelo:
quase toda função ali recebe os dois lados de uma troca.

O evento mais delicado é "troca nova". `sincronizar_matches` roda a cada escrita
de anúncio e reescreve os mesmos pares indefinidamente — avisar a cada passagem
transformaria a coisa mais útil do app na mais irritante. Quem separa o INSERT
do UPDATE do upsert é o `xmax = 0` no `returning` de `_gravar_match`.

O tipo `TRIANGULAR` já tem texto escrito e não dispara: o motor de ciclos é a
Fase 5 e não existe. Quando existir, ele chama `match_novo` com o tipo certo e
nada mais precisa mudar.

Segurança da leitura direta: esta é a **única** tabela que o frontend lê pelo
PostgREST (em todo o resto vale "escrita e leitura só pela API"). A migração
`24_notificacoes.sql`, aplicada em produção em 2026-08-11, acerta as três
pontas — policy `for select` no lugar da
`for all` do 09, `grant select` só para `authenticated`, e a tabela entrando na
publicação `supabase_realtime`. O filtro `user_id=eq.<id>` do cliente é para não
receber tráfego alheio; quem garante o isolamento é a policy, que o
`postgres_changes` aplica com o token de quem assinou.

### 11.2 Web Push (reengajamento) — **feito em 2026-08-11**

Service worker + VAPID, `pywebpush` no backend. Custo zero: quem entrega é o
serviço de push do sistema — APNs no iPhone, FCM no Android —, e não há servidor
nosso no meio. O aviso chega com o app **fechado**, que é a diferença inteira
para o canal in-app.

**O iPhone só recebe com o app instalado na tela de início** (iOS 16.4+). Em aba
do Safari o `PushManager` não existe, e não há contorno. É o que amarra esta
leva à página `/instalar` da fila de divulgação: sem ela, metade da base não tem
como chegar ao estado em que o push funciona. No Android o navegador comum
também recebe.

Cinco decisões que valem mais que o código:

**O push sai depois do commit, e fora da transação.** `services/notificacoes.py`
não manda nada: o `_notificar` põe o aviso numa fila presa à sessão
(`session.info`), e quem esvazia é o `get_session`, quando a requisição já
terminou. Uma proposta gravada com o FCM fora do ar continua sendo uma proposta
gravada; o contrário seria deixar a rede de terceiro derrubar a negociação. Um
`after_rollback` limpa a fila — a proposta que bate no índice de "uma por dupla"
faz rollback e devolve 409, e não pode avisar ninguém de algo que não existe.

**Enfileirar dentro do `_notificar` é o que faz as guardas valerem para os dois
canais.** Quem não recebe linha na caixa — porque foi quem agiu, ou porque a
dedupe de sete dias pegou — também não recebe vibração. Se cada evento
disparasse o push por conta própria, essa simetria dependeria de dezesseis lugares
lembrarem dela.

**Dez dos dezesseis eventos vibram**, e é a coluna Push da matriz abaixo: o que
espera resposta de alguém, mais as duas cartas e a queda de plano. O resto —
recusada, retirada, vencida, furada, cancelada — é registro do que aconteceu e
fica na caixa. Um app que vibra dezesseis vezes por dia perde a permissão que levou
meses para conseguir.

**Inscrição morta é apagada na hora.** 404 e 410 do serviço de push querem dizer
"esse navegador não existe mais" — desinstalou, limpou os dados, trocou de
aparelho. `services/push.py` apaga a linha em vez de tentar de novo amanhã.

**Inscrição viva sem permissão é outro caso, e faltava tratá-lo** (corrigido em
2026-08-16, depois de o erro aparecer no console em produção). Revogar o aviso
nas configurações do navegador não avisa o servidor: a inscrição continua
válida, o serviço de push aceita a entrega, o push chega ao worker — e o
`showNotification` estoura com *"No notification permission has been granted for
this origin"*. Como o 404/410 nunca chega, a linha ficaria no banco para sempre e
o envio seria repetido indefinidamente.

O worker passou a conferir a permissão antes de mostrar e, quando ela não existe
mais, **cancela a própria inscrição**. Isso provoca de propósito o 410 do envio
seguinte, que é o que faz `services/push.py` limpar o registro — em vez de
inventar uma segunda via de limpeza, usa-se a que já existe.

Não é só ruído de console: uma promessa rejeitada dentro do `waitUntil` faz o
navegador tratar o push como não atendido, e alguns mostram no lugar uma
notificação genérica de "este site foi atualizado em segundo plano" — pior que
não mostrar nada, porque não diz nada e ainda parece defeito.

Detalhe de tipagem que vale a linha: `Notification` é global no worker em
runtime, mas `lib.webworker` não a declara em `ServiceWorkerGlobalScope`. O
`npm run typecheck` solto não pegou; o `tsc -b` do build pegou. É o build que
manda aqui.

**O push leva só o título.** O `corpo` fica de fora do payload: na tela de
bloqueio o aviso é uma linha, e "@fulano propôs uma troca" já diz o que
aconteceu e o que fazer. A segunda frase — o prazo de 72 horas, o pedido de
confirmação — continua na caixa do app, onde há espaço e onde a pessoa está
lendo de fato. Decisão do Eduardo em 2026-08-11, vendo o primeiro push chegar no
iPhone.

**O service worker deixou de ser gerado.** O `vite-plugin-pwa` saiu de
`generateSW` para `injectManifest`, com o worker em `web/src/sw.ts`: evento
`push` não se declara em arquivo gerado. O que o modo automático dava — precache
com limpeza de versões velhas e o desvio de navegação da SPA — está escrito lá
dentro, e o pacote sai em `iife`, não em módulo ES, porque service worker como
módulo não roda em todo navegador. Tocar na notificação reaproveita a aba aberta
em vez de abrir uma segunda janela do mesmo PWA.

O interruptor mora em **Configurações → Avisos no celular**, e tem três estados
que não são dois: sem suporte (a linha vira instrução, e no iPhone a instrução é
"instale o app"), negado (beco — permissão recusada não pode ser pedida de novo
por código, só nas configurações do sistema) e ligado/desligado. O pedido de
permissão parte de um toque porque os navegadores recusam fora de gesto.

As chaves VAPID entraram em 2026-08-11: a pública vive no `render.yaml` e no
bundle (é o que o navegador guarda para reconhecer o remetente), a privada só no
painel do Render. **Trocar o par invalida toda inscrição existente** e obrigaria
cada pessoa a ligar o aviso de novo. Sem as duas, `push.ativo()` é falso e o app
segue inteiro — é assim que o ambiente de desenvolvimento roda.

### 11.3 E-mail (fallback)

**Sai pelo Resend desde 2026-08-25, por `nao-responda@trocatcg.com`.** Antes
disso, e desde 2026-08-14, saía pelo SMTP de uma conta Gmail dedicada — o plano
original era Resend e ele tinha caído em 14/08 junto com a descoberta de que o
`trocatcg.com.br` é de outra pessoa. Com o `trocatcg.com` registrado em 21/08, o
plano voltou a valer.

A ligação é Custom SMTP do Supabase apontando para `smtp.resend.com` porta 465,
usuário `resend`, senha sendo uma API key de `sending_access` presa ao domínio.
São 3.000 e-mails por mês no plano grátis, 100 por dia.

**O domínio está verificado no Resend na região `sa-east-1`**, com três registros
no DNS do Squarespace: o DKIM em `resend._domainkey`, o MX de `send` apontando
para `feedback-smtp.sa-east-1.amazonses.com`, e o SPF `v=spf1
include:amazonses.com ~all` em `send`. Mais dois nossos: o SPF do ápice e um
DMARC `p=none` em `_dmarc`, com relatório indo para
`trocatcg.contato@gmail.com` — relatório é XML diário que ninguém lê a olho, e
não merece uma caixa do domínio.

**O ápice recebe e-mail pelo iCloud desde 2026-08-25**, com o domínio
personalizado do iCloud+: MX para `mx01`/`mx02.mail.icloud.com`, o TXT
`apple-domain=…` de verificação e o DKIM da Apple em `sig1._domainkey`. Nada
disso encosta no Resend, que assina por `resend._domainkey` e usa
`send.trocatcg.com` como Return-Path.

**O SPF do ápice é um só, e é onde isto quebra.** A Apple manda criar um TXT com
`v=spf1 include:icloud.com ~all`; criado como registro novo, ficariam dois SPF no
domínio, e dois SPF invalidam os dois — o e-mail do app pararia de passar. O
certo é editar o que existe e somar:

```
v=spf1 include:amazonses.com include:icloud.com ~all
```

**A predefinição "Segurança dos e-mails" do Squarespace teve de sair.** Ela vem
ligada para domínio que não envia nada: SPF `v=spf1 -all`, DKIM nulo e DMARC
`p=reject` com alinhamento estrito nos dois. Com o Return-Path do Resend em
`send.trocatcg.com`, que não alinha estrito com o ápice, aquele `aspf=s`
derrubaria e-mail legítimo. O `p=none` é o começo, não o fim — endurecer para
`quarantine` depende de ver relatório limpo primeiro.

**E não use `@icloud.com` como remetente em esquema nenhum:** a Apple publica
`p=quarantine`, e o e-mail de recuperação cairia no spam de quem perdeu a senha
— a pessoa que menos vai procurar lá.

Dois detalhes de teto que ficam escritos:

- **O teto de envio muda de lugar quando o SMTP entra.** Com o remetente interno
  do Supabase são 2 e-mails por hora, fixos — a cota que estourou com três
  cadastros de teste. Com Custom SMTP o campo passa a ser editável em
  Authentication → Rate Limits, com 30 por hora de padrão. **Este projeto está
  em 100 por hora desde 2026-08-21**, subido para o lançamento — quarenta
  cadastros numa tarde, mais reenvios e recuperações de senha, saem todos do
  mesmo balde. Vale olhar em vez de supor: o valor não aparece em nenhuma API
  pública, só ali.
- **Quem aperta primeiro continua sendo o Supabase.** Os 100/hora dele cabem
  dentro dos 100/dia do Resend só se o dia inteiro não passar disso — no dia do
  lançamento é o número a vigiar, e o painel do Resend mostra cada envio.

### O link do e-mail não passa por `supabase.co`

Os templates montam `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`, e
quem troca o token por sessão é o app, em `web/src/lib/linkDeEmail.ts`. Até
2026-08-25 o botão era `{{ .ConfirmationURL }}`, que é o
`supabase.co/auth/v1/verify` redirecionando de volta para cá.

**Foi a diferença entre spam e caixa de entrada.** Medido no iCloud em 25/08: com
remetente em `trocatcg.com`, link em `supabase.co` e logo em `onrender.com`, a
mensagem foi para o lixo eletrônico mesmo entregue, com SPF, DKIM e DMARC os três
passando. Com tudo no mesmo domínio, chegou na caixa de entrada. Três domínios
numa mensagem que pede senha é a forma de um phishing, e é o que o filtro lê —
não o corpo, que já tirava 10/10 no mail-tester.

O ganho de tabela é um defeito que ninguém tinha ligado a isto: antivírus de
caixa de entrada abre os links da mensagem para inspecionar, e abrir o
`/auth/v1/verify` **consome** o token, que serve uma vez só. A pessoa clicava
depois e lia "este link não vale mais". A troca por `token_hash` só roda com
JavaScript, e scanner de e-mail não executa página.

O token sai da URL com `replaceState` assim que é lido: enquanto está na barra,
ele é uma senha à mostra — entra no histórico, no `Referer` de qualquer imagem da
página e em qualquer print pedido pelo suporte.

**Os templates moram no painel do Supabase.** `docs/emails/*.html` é cópia
versionada; trocar o arquivo não troca o e-mail que sai.

O e-mail serve hoje a dois casos: **recuperação de senha** e **confirmação de
cadastro** (ligada de novo em 2026-08-21). As notificações do app vivem em in-app
e push — ver a coluna E-mail da matriz abaixo.

### Matriz de notificação

In-app e push existem desde 2026-08-11; o e-mail entrou em 2026-08-14, só para
recuperação de senha. O `tipo`
gravado é a coluna do meio — é por ele que a caixa escolhe ícone e destaque, e é
ele que `TIPOS_COM_PUSH` consulta para decidir se o celular vibra.

| Evento | Tipo | In-app | Push | E-mail |
|---|---|:--:|:--:|:--:|
| Proposta recebida — **é a sua vez** | `PROPOSTA_RECEBIDA` | ✅ | ✅ | — |
| Contraproposta — a vez voltou | `PROPOSTA_SUA_VEZ` | ✅ | ✅ | — |
| Proposta aceita (vira troca) | `PROPOSTA_ACEITA` | ✅ | ✅ | — |
| Proposta recusada | `PROPOSTA_RECUSADA` | ✅ | — | — |
| Proposta retirada | `PROPOSTA_RETIRADA` | ✅ | — | — |
| Proposta vencida (72h) | `PROPOSTA_EXPIRADA` | ✅ | — | — |
| Troca nova sugerida pelo motor | `NOVO_MATCH` | ✅ | ✅ | — |
| Alguém aceitou a troca | `MATCH_ACEITO` | ✅ | ✅ | — |
| O outro confirmou — **falta você** | `MATCH_CONFIRME` | ✅ | ✅ | — |
| Os dois confirmaram: troca concluída | `MATCH_CONCLUIDO` | ✅ | ✅ | — |
| Troca marcada como furada | `MATCH_FURADO` | ✅ | — | — |
| Desistência | `MATCH_CANCELADO` | ✅ | — | — |
| Troca combinada venceu | `MATCH_EXPIRADO` | ✅ | — | — |
| Procuram uma carta que você oferece | `CARTA_PROCURADA` | ✅ | ✅ | — |
| Apareceu a carta que você pediu para vigiar | `CARTA_DISPONIVEL` | ✅ | ✅ | — |
| A carência acabou e as ofertas excedentes saíram do ar | `PLANO_EXPIROU` | ✅ | ✅ | — |
| Boas-vindas / senha | — | — | — | ✅ |

O `PLANO_EXPIROU` entrou em 2026-08-14 com o item 10 da seção 16, e é a única
linha da coluna Push que não espera resposta de ninguém. A regra que a colocou
lá não é "quem espera resposta vibra", é o que essa regra protegia: o aviso
descreve algo que **já mudou** na vitrine da pessoa sem ela ter feito nada, e o
que ela precisa fazer a respeito tem prazo. Descobrir dias depois, ao abrir o app
por outro motivo, é descobrir tarde.

Quatro eventos **não** notificam, e cada ausência é uma decisão:

- **Recusar uma sugestão do motor.** Não é responder a uma pessoa, é dispensar
  uma ideia do app — avisar transformaria "não quero" numa mensagem para quem
  não pediu nada. Recusar uma *proposta* avisa, porque ali havia alguém do outro
  lado esperando.
- **Prorrogar o prazo.** Um toque de um lado vale pelos dois; não é notícia.
- **Match reescrito pelo `sincronizar_matches`.** Só o inédito avisa.
- **A mesma carta procurada de novo.** Dedupe de sete dias em
  `carta_procurada` — é a única notificação que nasce de varredura, e o job roda
  a cada quinze minutos.

O furo é o único texto que não nomeia quem agiu: ele chega para quem acabou de
levar um furo no número, e nomear quem apertou o botão convida à represália
antes de a pessoa abrir a tela e ler o que aconteceu.

---

## 13. Reputação e ciclo de vida da troca

O problema real do nicho não é achar a troca — é a troca furar. A reputação é a funcionalidade central, não um extra.

### Máquina de estados

```
        job de matching
              │
              ▼
         ┌─────────┐
         │SUGERIDO │
         └────┬────┘
              │ 1º participante aceita
              ▼
         ┌─────────┐  algum recusa   ┌──────────┐
         │PENDENTE ├────────────────►│ RECUSADO │
         └────┬────┘                 └──────────┘
              │ TODOS aceitam
              │ → disclaimer → contatos liberados
              ▼
         ┌─────────┐  7 dias sem ação ┌──────────┐
         │ ACEITO  ├─────────────────►│ EXPIRADO │
         └────┬────┘                  └──────────┘
              │
      ┌───────┴────────┐
      │ todos confirmam│ alguém reporta no-show
      ▼                ▼
┌───────────┐    ┌──────────┐
│ CONCLUIDO │    │  FURADO  │
└───────────┘    └──────────┘
  +1 concluída     +1 furada (só para quem não apareceu)
```

### Regras

1. **Confirmação bilateral obrigatória.** Um lado sozinho não fecha. Impede auto-elogio.
2. **Prazo de 7 dias** após o aceite total. Sem confirmação → `EXPIRADO`, sem penalidade.
3. **No-show** exige que o reportante já tenha confirmado sua parte. Evita denúncia retaliatória.
4. **Badge só após 5 trocas.** Abaixo disso mostra "Novo por aqui" em vez de percentual — 1 troca furada não deve marcar alguém com 0%.
5. **Reputação afeta o ranking**, não o acesso. Ninguém é banido pelo score; só aparece mais abaixo.

### Implementação da conclusão

```python
# app/services/matches.py
async def confirmar_conclusao(
    session: AsyncSession, match_id: UUID, user_id: UUID
) -> MatchDetalhe:
    match = await _carregar_match(session, match_id, user_id)

    if match.status != MatchStatus.ACEITO:
        raise RegraNegocio(
            "MATCH_NAO_ACEITO",
            "A troca precisa estar aceita por todos antes de confirmar.",
        )

    await session.execute(
        update(MatchParticipant)
        .where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user_id,
        )
        .values(confirmou_conclusao=True)
    )

    total, confirmados = await _contar_confirmacoes(session, match_id)

    if confirmados == total:
        await session.execute(
            update(Match).where(Match.id == match_id)
            .values(status=MatchStatus.CONCLUIDO)
        )
        # incrementa reputação de todos
        ids = [p.user_id for p in match.participantes]
        await session.execute(
            update(Profile).where(Profile.id.in_(ids))
            .values(trocas_concluidas=Profile.trocas_concluidas + 1)
        )
        # desativa os anúncios das cartas trocadas
        await _desativar_anuncios_trocados(session, match_id)
        await registrar_evento(session, match_id, user_id, "CONCLUIDO")

    await session.commit()
    return await _carregar_match(session, match_id, user_id)
```

O que este esboço chamava de `_desativar_anuncios_trocados` é essencial: sem ele, a
carta trocada continua gerando matches fantasma. Ele nunca chegou a existir com esse
nome, e o que subiu em 2026-08-12 é uma versão melhor — `listings.baixar_por_troca`.

**Baixa por unidade, não desativação.** `quantidade` sempre esteve no cadastro e nunca
era consumida. Desativar o anúncio inteiro na primeira troca puniria quem tem três
cópias da mesma carta: entregou uma, sumiria com as outras duas. Agora cai **uma
unidade** da OFERTA de quem entregou e uma da PROCURA de quem recebeu, e a desativação
acontece só quando a contagem chega a zero. O piso zero exigiu a migração `27`, porque
o `check` da tabela começava em 1 — não havia caminho que zerasse.

A linha zerada fica, desativada, em vez de ser apagada: é ela que faz o recadastro cair
no upsert que reativa em vez de bater no índice único de (dono, carta, tipo, condição,
acabamento, idioma).

**Na conclusão, não no aceite.** Aceitar é combinar um encontro; até ele acontecer a
carta continua com o dono, e sumir da vitrine ali esconderia carta que ainda existe —
inclusive quando a troca fura, que é justamente quando ela precisa voltar a aparecer. O
preço é a janela entre aceite e conclusão, em que outra pessoa ainda pode propor pela
mesma carta; quem cobre esse intervalo é o prazo de 7 dias e o índice de uma negociação
aberta por dupla, não o estoque.

Os dois lados casam de formas diferentes, e isso é deliberado: a OFERTA casa por
igualdade de condição e acabamento, porque `match_items` copiou os dois do anúncio e é a
mesma carta física; a PROCURA casa por preferência (mesmo acabamento primeiro, depois
quem aceita qualquer um) e **ignora condição**, porque no Procuro a condição é mínimo
aceitável e `aceita_qualquer_finish` existe exatamente para fechar troca com acabamento
diferente. Casar por igualdade dos dois lados deixaria de baixar as trocas que o app foi
feito para permitir.

---

## 14. Frontend

### 13.1 Direção visual

O produto vive no mundo de carta física: sleeve, binder, playmat, foil holográfico. A identidade sai daí — não de dashboard SaaS genérico.

**Tokens de cor:**

| Token | Hex | Uso |
|---|---|---|
| `ink` | `#0E1116` | Fundo (grafite de playmat) |
| `surface` | `#171C24` | Cards, painéis |
| `edge` | `#252C38` | Bordas, divisórias |
| `paper` | `#E8ECF1` | Texto principal |
| `muted` | `#8A94A6` | Texto secundário, labels |
| `volt` | `#7C5CFF` | Ação primária |
| `holo` | gradiente `#5EE7DF → #B490CA → #FF9DC8` | **Só** no momento de match |
| `alert` | `#F2555A` | No-show, erro |

**Tipografia:**

- **Display:** Cabinet Grotesk (Fontshare, gratuita) — geométrica com personalidade, usada com contenção em títulos de tela
- **Corpo:** Satoshi (Fontshare) — legível em telas pequenas
- **Utilitária:** JetBrains Mono — códigos de set e número da carta (`OBF 125/197`). O mono aqui não é decoração: é o vernáculo do nicho, é como colecionador identifica carta

**Elemento-assinatura: a linha de troca.**

O momento memorável do produto é ver o match. Renderize o fluxo como conexão visual entre miniaturas de carta — no direto, uma linha horizontal com setas opostas; no triangular, um triângulo com as três cartas nos vértices e setas percorrendo o ciclo. O gradiente `holo` aparece **exclusivamente** nessa linha, com uma animação sutil de varredura no primeiro render. Todo o resto da interface fica quieto e disciplinado para que esse momento tenha peso.

Respeite `prefers-reduced-motion`: sem animação, gradiente estático.

### 13.2 Estrutura de pastas

```
src/
├── main.tsx
├── App.tsx
├── routes/
│   ├── Login.tsx
│   ├── Onboarding.tsx
│   ├── MinhasCartas.tsx
│   ├── Matches.tsx
│   ├── MatchDetalhe.tsx
│   ├── Perfil.tsx
│   ├── Notificacoes.tsx
│   └── Termos.tsx
├── components/
│   ├── ui/               # Botao, Input, Modal, Toast, Skeleton
│   ├── carta/            # CartaMini, CartaBusca, CartaSeletor
│   ├── match/            # LinhaTroca, TrianguloTroca, MatchCard
│   ├── legal/            # ModalDisclaimer, RodapeLegal
│   └── layout/           # Header, NavInferior, Container
├── hooks/
│   ├── useAuth.ts
│   ├── useListings.ts
│   ├── useMatches.ts
│   └── useNotificacoes.ts
├── lib/
│   ├── api.ts            # cliente HTTP + interceptor de token
│   ├── supabase.ts
│   └── schemas.ts        # Zod, espelhando o Pydantic
├── stores/
│   └── sessao.ts         # Zustand
└── styles/
    └── tokens.css
```

### 13.3 Telas, em ordem de construção

**1. Onboarding — a tela mais importante do produto**

Se cadastrar as cartas for chato, ninguém usa e não existe rede. Objetivo: 10 cartas cadastradas em menos de 2 minutos.

- Aceite dos termos no cadastro, com link para o texto completo
- Busca com autocomplete, debounce de 250 ms
- Um toque marca **Ofereço**, outro botão marca **Procuro**
- Contador de progresso visível: "7 cartas — faltam 3 para ver seus primeiros matches"
- Estado vazio que convida: "Comece pela carta que você mais quer conseguir."
- Texto de apoio deixando o modelo claro: "Tudo que você cadastrar aqui fica disponível para troca."

**2. Feed de matches — o momento "uau"**

- Lista de `MatchCard`, ordenada por score
- Cada card mostra: miniaturas das cartas, "Você entrega X · recebe Y", bairro e reputação do parceiro
- Triangular tem badge distinto e a visualização do ciclo
- Puxar para atualizar

**3. Detalhe do match**

- Fluxo completo renderizado com a linha de troca
- Estado de aceite de cada participante
- Botões: **Aceitar troca** / **Recusar**
- Após aceite total: **modal de disclaimer bloqueante** antes de revelar o contato
- Após encontro: **Confirmar troca** / **Não apareceu**

**4. Minhas cartas**

- Duas abas: **Ofereço** e **Procuro**
- Filtro por set
- Edição inline de quantidade, condição e prioridade
- Sem valor total, sem estatística de coleção — isso reforçaria o enquadramento errado

**5. Perfil público**

- Reputação, número de trocas, tempo de casa, bairro
- O que a pessoa oferece e o que procura
- Botão de denúncia

**6. Termos**

- Texto completo com versão e data
- Link no rodapé de todas as telas

### 13.4 Padrões de escrita na interface

- Nunca use a palavra "coleção". O usuário tem cartas para trocar, não uma coleção guardada
- Botão diz exatamente o que acontece: "Aceitar troca", não "Confirmar"
- O verbo se mantém no fluxo inteiro: botão "Aceitar troca" → toast "Troca aceita"
- Erro explica e orienta: "Essa carta já está na sua lista de Procuro." — não "Erro de validação"
- Tela vazia é convite: "Nenhum match ainda. Adicione mais cartas em Procuro — quanto maior a lista, mais rápido aparece."
- O disclaimer é escrito em linguagem direta, não em juridiquês: o objetivo é ser entendido, não parecer formal

### 14.5 Piso de qualidade

- [ ] Responsivo de 320 px para cima
- [ ] Foco de teclado visível em todo elemento interativo
- [ ] `prefers-reduced-motion` respeitado
- [ ] Contraste mínimo AA (4.5:1) em texto
- [ ] Skeleton em toda tela que carrega dados
- [ ] Funciona offline para leitura (service worker cacheia as listas)

### 14.6 Aviso de troca desigual

Reformulado em 2026-08-21, por decisão do Eduardo. Antes era uma cartela parada
no meio da tela da troca, com três parágrafos. Ela era honesta e era ignorada:
chegava junto com a tela, antes de a pessoa ter decidido qualquer coisa, e no
momento da decisão — o dedo em "Tenho interesse" — já tinha rolado para fora do
campo de visão. **Aviso que não está na frente na hora da decisão é rodapé.**

**A regra** mora em `web/src/lib/types.ts` (`desequilibrio` para a troca
sugerida, que é 1×1, e `desequilibrioDeValores` para a proposta, que compara o
total de dois lotes). São **duas faixas**, e qualquer uma delas basta:

| Faixa | Razão | Diferença | Para que serve |
|---|---|---|---|
| Dinheiro grande | ≥ 2x | ≥ US$ 10 | O dobro já é muito quando há dezenas de dólares em jogo |
| Dinheiro pequeno | ≥ 3x | ≥ US$ 5 | Abaixo disso, só o triplo justifica interromper alguém |

O que cada uma faz, com os casos que decidiram os números:

```
  0,05 x 0,20     4,0x     0,15    cala    (centavos, e é o caso do dia a dia)
  0,50 x 2,00     4,0x     1,50    cala
  2,00 x 6,00     3,0x     4,00    cala    (3x, mas quatro dólares)
  3,00 x 12,00    4,0x     9,00    AVISA   (faixa de baixo)
  8,00 x 16,00    2,0x     8,00    cala    (2x sem dinheiro suficiente)
 15,00 x 30,00    2,0x    15,00    AVISA   (faixa de cima)
300,00 x 600,00   2,0x   300,00    AVISA   (o buraco que existia)
```

Até 21/08 a regra era uma só — 3x **e** US$ 5 —, e ela tinha um buraco do
tamanho do produto: **US$ 300 por US$ 600 passava calado**, porque é "só" 2x.
Baixar tudo para 2x consertaria essa e criaria a praga oposta: US$ 5 por US$ 10
viraria alerta, e alerta que aparece em briga pequena é alerta que se aprende a
fechar sem ler.

Cala quando falta preço de qualquer lado. Na proposta isso é mais comum, porque
um lote de cinco cartas só precisa de uma sem cotação para o total virar chute —
e afirmar "você entrega 4x mais" com um lado incompleto é pior que não dizer
nada.

**As duas formas** ficam em `web/src/components/TrocaDesigual.tsx`, usadas pelo
detalhe da troca e pela proposta:

- `ResumoDesigual` — uma linha na página (`role="status"`), para quem só está
  olhando perceber o sinal. Não argumenta; aponta.
- `ModalTrocaDesigual` — a folha inferior que abre **no lugar** do aceite, com os
  dois valores lado a lado e o argumento inteiro, e exige um segundo clique.

O aceite é o que libera o contato e marca o encontro: é o último ponto barato de
arrependimento, porque desfazer depois custa uma conversa com um desconhecido.
Não bloqueia e não acusa — troca desigual é legítima, e preço da TCGplayer é
referência de mercado americano, não regra. O que muda é que o botão passa a ser
apertado com os dois números na frente.

A caixa **fecha no Esc e no clique fora**, ao contrário da `ModalIsencao`. Lá as
saídas fáceis transformariam "aceito" em "consegui contornar", porque o registro
é legal; aqui a saída fácil **é** a opção conservadora — fechar sem escolher
deixa a troca como estava.

Uma armadilha que ficou registrada: a pele brutal pinta de tinta o fundo de
qualquer `[aria-hidden]` dentro de `.folha-inferior` (é a regra do puxador e das
divisórias, no `index.css`). A razão ("30x") nasceu marcada como decorativa e
virou um retângulo preto na tela.

### 14.7 Como a pessoa lê preço: moeda e base

Decidido pelo Eduardo em 2026-08-21. Duas escolhas em Configurações, guardadas no
`localStorage` como o tema — preferência de leitura, resolvida antes da primeira
pintura, e uma ida ao banco para saber em que moeda escrever um número faria a
tela piscar dólar antes de virar real. Custo assumido: quem troca de aparelho
escolhe de novo.

**Base do preço.** A TCGplayer publica dois números por carta, e os dois já
estavam no banco desde a migração 15:

- `menor` (`lowPrice`) — o piso dos anúncios: o que custaria comprar a carta hoje.
- `medio` (`marketPrice`) — a média do que foi vendido: a referência conhecida.

O **padrão é `menor`**. Medido no catálogo inteiro em 21/08: o menor é, em média,
**metade** do médio (razão 0,502 sobre 24.607 linhas; `baixo` está em todas as
linhas, `mercado` falta em 17). Isso muda o aviso de troca desigual, e de
propósito — a razão entre as duas cartas quase não se mexe, mas a diferença
absoluta cai pela metade, e os pisos em dólar da regra filtram mais. Um aviso que
fala do preço médio enquanto a tela mostra o menor estaria discordando de si
mesmo.

A escolha vira um número só em `valorDoPreco` (`lib/types.ts`), com reserva
cruzada: quem pede "menor" e cai numa das 17 cartas sem `baixo` recebe o médio,
porque um número da outra base serve melhor que um traço.

**Moeda.** Dólar é a fonte; real é conversão pela PTAX do Banco Central, guardada
na tabela `cotacoes` (migração 35) e atualizada pelo job `cambio`, diário, na
janela das 11:30 BRT — mais tarde que os outros de propósito, porque o boletim do
dia só sai por volta das 13h UTC. Falha do Banco Central devolve `{"mantida": 1}`
e **não apaga** a linha anterior: câmbio de ontem serve, câmbio nenhum tiraria o
preço da tela de todo mundo.

O padrão é real, porque é nele que se julga se uma troca é justa por aqui. Sem
cotação carregada a tela cai para dólar sozinha, em vez de esconder o preço.

**A ressalva do 15 continua de pé, e virou texto na tela.** Aquele arquivo
decidiu manter dólar porque converter "daria falsa precisão a um número que já é
estimativa". A decisão foi revista, não revogada: preço da TCGplayer convertido
**não é preço brasileiro** — a Liga Pokémon costuma cobrar bem mais que a
conversão do dólar. Por isso Configurações e a tela da carta dizem "convertido do
dólar · câmbio de dd/mm/aaaa", com a data da cotação **na fonte** (a PTAX de
sábado é a de sexta), e não a do dia em que o job rodou.

**O que vem do banco continua em dólar.** A conversão acontece no último
instante, em `formatarMoeda`. Não é detalhe de implementação: os pisos da regra
de troca desigual são em dólar, e compará-los contra reais faria o alerta mudar
de comportamento conforme o câmbio do dia.

---

## 15. Custos operacionais

### MVP (0–500 usuários)

| Serviço | Plano | Limite | Custo |
|---|---|---|---|
| Cloudflare Pages | Free | Banda ilimitada | R$ 0 |
| Supabase | Free | 500 MB DB, 5 GB egress, 50k MAU | R$ 0 |
| Render | Free (Hobby) | 512 MB RAM, 750 h, 100 GB banda | R$ 0 |
| TCGdex | Aberta | Sem chave, sem limite publicado | R$ 0 |
| GitHub Actions | Free (repo público) | Ilimitado em repo público | R$ 0 |
| Resend | Free | 3.000 e-mails/mês | R$ 0 |
| Sentry | Free | 5k eventos/mês | R$ 0 |
| Web Push | — | Ilimitado | R$ 0 |
| Domínio `.com.br` | — | — | ~R$ 40/ano |
| **Total** | | | **~R$ 3,30/mês** |

### As condições que sustentam esse zero

O custo zero é real, mas condicional. Três armadilhas do free tier, todas resolvidas por automação:

| Armadilha | O que acontece | Solução |
|---|---|---|
| Render hiberna em 15 min | Cold start de 30–60 s para o próximo usuário | Cron de keep-alive a cada 10 min |
| **Supabase pausa em 7 dias** | Projeto sai do ar; volta só com religamento manual no painel | O mesmo ping, com `/health` consultando o banco |
| **Supabase free não tem backup** | Perda de dados é permanente | Dump diário via GitHub Actions para repositório privado |

A pausa do Supabase é a mais perigosa das três, porque é silenciosa: o app simplesmente para de responder num fim de semana parado e ninguém percebe até alguém reclamar. O keep-alive não é otimização, é requisito de funcionamento.

```yaml
# .github/workflows/backup.yml
name: Backup diário
on:
  schedule:
    - cron: '0 8 * * *'
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          pg_dump "${{ secrets.DATABASE_URL_DIRECT }}" \
            --no-owner -Fc -f backup.dump
      - uses: actions/upload-artifact@v4
        with:
          name: backup-${{ github.run_id }}
          path: backup.dump.gpg
          retention-days: 30
```

O arquivo de verdade tem mais que isto — o dump é cifrado com AES256 antes de
virar artifact, porque o repositório é público e artifact de repositório público
é baixável por qualquer um. O `.github/workflows/backup.yml` explica cada linha.

### A restauração, provada (item 14, 2026-08-20)

Um backup que nunca foi restaurado não é backup: é um arquivo com nome de
backup. Desde 2026-08-20 o mesmo workflow tem um segundo job, `restaurar`, que
roda logo depois do dump e **abre o artifact que acabou de ser gerado** num
Postgres 17 descartável (serviço do runner, morre com o job). Ele decifra com o
secret, restaura e confere: todas as tabelas de `db/schema` de volta, catálogo
com a mesma contagem de antes, RLS e policies nas nove tabelas de usuário,
`contato_visivel` fora do alcance da anon key e escrita direta pelo PostgREST
ainda fechada. As conferências estão em `db/restauracao/conferir.sql`.

**E foi ao escrever isso que apareceu o defeito que o item existia para
encontrar:** o dump saía com `--no-acl`, que manda o `pg_dump` não escrever
nenhum GRANT. Os dados voltavam, o esquema voltava, e a camada de permissão do
`db/schema/11_grants.sql` — que revoga `profiles` de `anon`/`authenticated` e
reconcede coluna a coluna — não voltava. Restaurado num projeto Supabase novo,
o banco nasceria com o default do Supabase (ALL para anon e authenticated em
tudo que o `postgres` cria em `public`): contato legível com a chave pública e
escrita direta em `profiles` e `listings` pelo PostgREST. O app subiria
funcionando e sem a proteção — no dia em que menos se olharia para isso.

A flag saiu. O preço é que restaurar passa a exigir os papéis existindo antes;
num projeto Supabase novo eles já existem, e `db/restauracao/preparo.sql` é o
que os cria num Postgres de fábrica.

### Onde o custo aparece primeiro

O gargalo do free tier do Supabase é o **banco (500 MB)**, e o maior consumidor seria o catálogo de cartas com imagens.

**Regra:** nunca armazene imagem de carta. Guarde apenas a URL da API de origem e sirva direto de lá. Com o catálogo Pokémon completo (~20 mil cartas) ocupando ~10 MB e `listings` com 100 mil linhas ocupando ~18 MB, o free tier aguenta muito além de 500 usuários.

O segundo gargalo é a **banda (5 GB de egress/mês)**, e ela é consumida principalmente por imagem de carta no feed. Como as imagens vêm direto do CDN do TCGdex, elas não passam pelo Supabase — mais um motivo para nunca hospedá-las. Use `loading="lazy"` e a versão pequena da imagem nas listas.

Restringir a v1 a um jogo só reduz o catálogo pela metade e deixa a busca trigram mais rápida — mais um argumento a favor do escopo enxuto.

### Projeção do primeiro custo real

| Usuários | Gargalo previsto | Ação | Custo/mês |
|---|---|---|---|
| 0–500 | Nenhum | — | R$ 0 |
| 500–2.000 | Egress Supabase (5 GB) | Supabase Pro (US$ 25) | ~R$ 140 |
| 500+ | Cold start incomoda | Render Starter (US$ 7) | ~R$ 40 |
| 2.000+ | RAM da API (512 MB) | Render Standard | ~R$ 140 |

Traduzindo: você só paga quando tiver ~500 usuários ativos. Nesse ponto, 20 assinantes a R$ 9,90 já cobrem a infraestrutura.

---

## 16. Preparação para monetização

Não cobre agora. Mas construa de forma que cobrar depois seja mudança de configuração, não refatoração.

### Quem tem o PRO sem pagar

São dois caminhos, e a diferença entre eles não é de grau.

**Parceiro** é `parceiro_motivo` preenchido — patrocínio, permuta, contrato. É
acordo comercial vigente, tem prazo e um dia acaba. Ver `36_parceiro.sql`.

**Fundador** é `selo = 'FOUNDER'`, e desde 2026-08-25 o selo carrega a isenção
junto: `plano_expira_em` fica nulo, o job de expiração não derruba, o aviso de
vencimento não avisa, `pode_renovar` é falso e a rota de pagamento **recusa**.
Ver `39_founder_nao_paga.sql`.

**Por que o selo e não uma coluna nova.** Ter ajudado a construir o app antes de
ele existir é fato passado, e fato passado não expira — escrever isso num campo
de acordo vigente seria guardar como contrato o que não é contrato. E deixaria a
regra "não paga" dependendo de alguém lembrar de preencher duas colunas.

**Isto tinha data marcada para dar errado.** A conta do Eduardo comprou o PRO de
verdade em 24/08, por R$ 14,90, para provar o Pix ponta a ponta; a compra gravou
`plano_expira_em = 2026-09-24` e o `parceiro_motivo` dele tinha sido zerado no
mesmo teste, para a tela desenhar o botão de comprar. Em 24/09 o job derrubaria o
dono do projeto para FREE com o selo de fundador intacto no perfil — o selo
dizendo uma coisa e o plano fazendo outra.

**A recusa vem antes da ida ao provedor.** A tela esconde o botão de quem não
paga, mas esconder botão não é fechar rota, e gerar o Pix para recusar depois
deixaria um código pagável no ar — dinheiro entrando sem nada para creditar.

**`vitalicio` sai como booleano derivado, e não como valor novo em `plano`.** Um
`plano = 'FOUNDER'` obrigaria todo lugar que compara com `'PRO'` — limites,
matching, vitrine, o `pro_publico` — a aprender outro nome, e cada um que
esquecesse trataria o fundador como conta grátis. O que a tela precisa saber é
"esta pessoa paga?", e isso é uma pergunta de sim ou não.

**As três consultas foram rodadas contra o Postgres de produção** antes do
commit, com a janela alargada para 60 dias de propósito, o que engloba a data de
24/09: nenhuma devolveu a linha do `@eduardowav`. Testar contra dublê prova que o
Python está certo, nunca que a consulta exclui quem deveria.

### O que fazer desde a v1

1. **Coluna `plano` em `profiles`** — já está no schema, default `FREE`
2. **Camada de limites centralizada:**

O arquivo é `api/app/core/limites.py`. Dois eixos moram lá, e confundi-los é o
erro que a estrutura previne:

- **Limites de plano** existem para vender o PRO. Passam por `plano_vigente()`,
  que devolve PRO para todo mundo enquanto `COBRANCA_ATIVA` for `False`.
- **Limites de antiabuso** (`propostas_por_dia`) não são disso: existem para o
  app não virar disparador em massa, valem desde o primeiro dia e por isso leem
  `limites_de()` direto, sem passar pelo portão.

3. **Toda regra de negócio consulta `limites_de(plano_vigente(plano))`** — nunca condicional espalhada
4. **Enquanto `COBRANCA_ATIVA` for `False`, todos recebem os limites PRO.** A regra está construída e testada, e o portão segue aberto: bloquear antes de existir meio de pagamento é pedágio, não oferta. Ligar é trocar uma linha.

### Modelo de cobrança — decidido em agosto de 2026

**PRO: R$ 19,90/mês ou R$ 199,90/ano** — o anual sai por dez meses, e numa base
pequena é ele que segura o caixa e corta churn. A posição é explícita: **o FREE é
o teste, o PRO é o app.**

| | Free | Pro — R$ 19,90/mês ou R$ 199,90/ano |
|---|---|---|
| Cartas anunciadas (**OFERTA**) | 20 | Ilimitado |
| Cartas procuradas (**PROCURA**) | Ilimitado | Ilimitado |
| Cadastro em massa (colar lista) | — | ✅ |
| Match triangular | — | ✅ |
| Alerta quando a carta aparecer | — | ✅ |
| Propostas por dia | 10 | 100 |
| Histórico de trocas | 30 dias | Completo |
| Selo PRO no perfil | — | ✅ |
| Matches visíveis | Todos | Todos |
| Ver vitrine, acervo, quem tem a carta | ✅ | ✅ |
| Abrir, aceitar, recusar, contrapropor | ✅ | ✅ |
| Concluir, avaliar, denunciar | ✅ | ✅ |

**Princípio de precificação:** nunca limite o que gera efeito de rede. Anunciar carta e concluir troca precisam ser sempre livres — são eles que fazem o app valer a pena para os outros. Cobre por **conveniência e alcance** (triangular, alertas, volume), não por participação.

#### Por que a tabela é essa

**OFERTA e PROCURA se separam.** Moram na mesma tabela (`listings.tipo`), mas são
coisas opostas. Procura é demanda: declarar o que se quer não custa nada ao
sistema e é o que faz o matcher achar par para os *outros* — limitar seria
limitar efeito de rede em estado puro. Oferta é alcance de quem anuncia, e
alcance é o que o princípio manda cobrar. Só OFERTA entra na conta do teto.

**Vinte, e não dez nem cento e cinquenta.** O post típico de grupo local de troca
raramente passa de dez cartas, então 20 não encosta no usuário mediano: o teto só
aperta quem tem coleção, que é exatamente quem tem por que assinar. Dez morreria
no onboarding — a pessoa abre a caixa, tem quarenta repetidas e bate no muro
antes de ter visto um único match. Cento e cinquenta não seria limite, seria
enfeite.

**`matches_visiveis` não é ligado.** É a alavanca clássica de marketplace e
também a única que reduz direto a métrica-mãe: esconder match é esconder o
produto, e o app ainda precisa provar que gera match. Reavaliar acima de ~500
usuários ativos.

**O ciclo do match é intocável.** Se um usuário FREE não pode aceitar ou
responder, a proposta de quem paga morre sem resposta — seria punir o assinante.
Reputação, denúncia e conclusão também ficam livres: são segurança, não
conveniência.

**Cadastro em massa é o melhor gate deste app.** Não limita *quanto* se cadastra,
limita o trabalho: FREE cadastra uma a uma, PRO cola a lista. Conveniência pura,
custo zero de rede — e a rota `POST /me/listings/bulk` já existe.

**Não haverá destaque pago na vitrine.** Degrada o feed para todo mundo e é a
porta de entrada do pay-to-win, que num app de comunidade local queima confiança
rápido.

### O caminho até cobrar, em três fases

**Fase A — ligar o que já existe.** Não depende de pagamento nem de decisão de
preço, e é onde a regra fica construída e desligada.

1. ✅ Teto de ofertas em `criar` e `criar_bulk`, contando só OFERTA, conferido
   *depois* do upsert e antes do commit — antes, a conta erraria o recadastro,
   porque `_UPSERT` reativa a carta que já existe em vez de duplicar.
2. ✅ `historico_dias` filtrando `listar_historico`. Esconde linha antiga, não
   apaga nada: reputação é contador em `profiles` e não sai desta lista.
3. ✅ `COBRANCA_ATIVA` e `plano_vigente()` — o portão, com teste que quebra de
   propósito no dia da virada, para ela ser decisão e não efeito colateral.

**Fase B — construir o valor do PRO.** Sem isso, R$ 19,90 compra a remoção de um
limite, o que lê como pedágio. **A cobrança não liga antes desta fase terminar.**

4. ✅ **Cadastro em massa** — feito em 2026-08-12. Colar a lista que a pessoa já
   tem escrita (post do grupo, bloco de notas, exportador de deck), conferir e
   cadastrar de uma vez.

   **A rota que existia não servia.** `POST /me/listings/bulk` é o onboarding:
   marca `onboarding_ok` e é por onde toda conta nova passa — travá-la por plano
   fecharia a porta de entrada do app. Entrou uma rota irmã,
   `POST /me/listings/importar`, com o portão do `cadastro_em_massa` e sem tocar
   no onboarding. O teto de OFERTA continua valendo nas duas: o portão é sobre
   *trabalho*, o teto é sobre *quantas cartas cabem*.

   **O reconhecimento mora no banco** (`resolver_lista`, migração `28`): uma
   chamada para a lista toda em vez de uma busca por linha. Reusa a
   `buscar_cartas` do 13 — acento, ordem das palavras, erro de digitação — e
   acrescenta o que só a lista colada tem: **quantidade na frente** (`4x`, `4 x`,
   `4 `) e **código do set no fim** (`OBF 125`). A sigla é validada contra a
   tabela `sets`, e não contra um padrão de texto: sem isso, "Iron Valiant 1"
   viraria busca pelo set "IRON". A carta apontada pelo código vem sempre como
   primeiro candidato — quem escreveu `OBF 125` já disse qual das 87 Charizards
   quer, e nenhuma relevância de texto sabe mais do que isso. Zero à esquerda
   não separa: o catálogo grava `054` e o jogador escreve `54`.

   **A segunda etapa é conferir, não escolher.** Cada linha já vem com um
   candidato marcado; trocar é um toque, e só nas poucas em que a busca errou.
   Pedir escolha em cinquenta linhas devolveria à pessoa o trabalho que ela veio
   evitar. Linha que não casou fica à vista, com o texto original, e **não
   entra** — nem silenciosamente nem travando o resto.

   Teto de 200 linhas por chamada, imposto no banco: a função é alcançável com a
   anon key, como toda leitura de catálogo, e sem limite uma chamada com dez mil
   termos seria dez mil buscas trigram numa transação só.
5. ✅ **Alerta de carta** — feito em 2026-08-12. "Avise quando aparecer",
   nascido do vazio: a pessoa abre a vitrine de uma carta, ninguém a oferece, e
   até aqui a tela só tinha a dizer "coloque no seu Procuro que a troca aparece
   sozinha" — promessa que **só vale com reciprocidade**. Se quem anunciar não
   quiser nada do que ela tem, o matcher não cria match e ninguém avisa nada. O
   alerta cobre essa espera de um lado só.

   Não confundir com o `CARTA_PROCURADA` que já existia: aquele corre no sentido
   contrário (avisa **quem oferece** que passaram a procurar). Este é o sentido
   que faltava, e são os dois lados da mesma novidade — o cron chama os dois no
   mesmo disparo de 15 minutos.

   Tabela `card_alerts` (migração `29`), um alerta por pessoa e carta, com
   acabamento opcional: nulo é "qualquer uma", que é o caso de quem pediu no
   vazio. Fechada para o navegador — quem escreve é a API, porque criar alerta
   passa pelo portão de plano, e portão que mora no cliente não é portão.

   **O aviso não consome o alerta.** Carta boa aparece e some no mesmo dia;
   apagar no primeiro aviso deixaria a pessoa sem vigilância por causa de uma
   oferta que ela não chegou a ver. Quem desliga é ela. O dedupe é de 24 horas —
   e não os sete dias da carta procurada — pelo mesmo motivo: aquilo é o app
   puxando alguém por algo que não pediu, isto é o cumprimento de um pedido
   explícito. É o décimo quarto evento, e vibra o celular.

   O interruptor vive em dois lugares: no detalhe da carta e no vazio da
   vitrine, que é o mesmo momento visto de dois ângulos.
6. **`triangular`** (Fase 5 do roadmap) — o carro-chefe. **Motor pronto e
   desligado em 2026-08-12**; falta a tela, e é ela que segura a chave.

   O que existe: `services/triangular.py` com a extração de arestas em SQL (a
   mesma regra de compatibilidade do motor direto, mais estoque, bloqueio e
   plano — filtrar o plano na origem é o que impede um triângulo de nascer
   dependendo de quem não pode participar dele), a detecção de ciclos em Python
   conforme a seção 9.2, a gravação com `hash_grupo` do trio e o aviso
   `NOVO_MATCH` com o texto triangular que já existia. Dezesseis testes cobrem o
   grafo: o trio contado uma vez só, a ordem do ciclo preservada (a posição é
   quem dá para quem — ordenar por id perderia a troca), caminho aberto e par
   recíproco não virando triângulo, e o teto de 5 por pessoa aplicado **depois**
   da ordenação por score.

   **O que falta é a interface, e ela não é pintura.** Toda a tela de troca
   deste app é escrita para duas pessoas e duas cartas — `ParDeCartas`, "você
   recebe / você dá", o aceite de dois lados, a conclusão que espera dois
   confirmarem. Num triângulo, quem me dá não é quem recebe de mim, e o aceite
   precisa dos três. Ligar o motor antes disso estrearia o carro-chefe quebrado,
   e por isso `TRIANGULAR_ATIVO` nasce falso: o cron já chama a rota, e ela
   responde `{"desligado": 1}` sem tocar no banco — o que é diferente de
   responder zero triângulos.

**Fase C — cobrar.**

7. **Mercado Pago** — o **backend saiu em 2026-08-13, construído e desligado**.
   O interruptor continua sendo `COBRANCA_ATIVA`; enquanto ele for falso, as
   rotas de assinatura respondem 503 e nenhuma tela as chama.

   > ### ⚠️ 2026-08-23: o PRO deixou de ser assinatura e virou Pix avulso
   >
   > **Tudo o que este item 7 descreve abaixo é história a partir daqui.** O
   > desenho de assinatura recorrente existiu de 13/08 a 23/08, funcionou, e foi
   > substituído. O que ficou desta parte é a validação HMAC do webhook, a
   > idempotência por id de notificação e a queda de plano com aparo das
   > ofertas; o resto saiu.
   >
   > **Por que trocou.** Recorrência no Mercado Pago é cartão de crédito e mais
   > nada: `POST /preapproval` engole `payment_methods_allowed` em silêncio e
   > devolve o recurso com `payment_method_id: null` — provado em 23/08, criando
   > uma assinatura que pedia só `bank_transfer`/`pix`. O público do TrocaTCG é
   > de Belém e é jovem; exigir cartão de crédito não é cobrar caro, é cobrar de
   > quem já tem banco. A decisão do Eduardo foi trocar a recorrência pelo
   > acesso: **o PRO vira tempo comprado por Pix**, com `POST /v1/payments`.
   >
   > O Asaas resolveria a recorrência por Pix (`billingType: PIX`, Pix
   > Automático com `paymentCreationMode: SUBSCRIPTION`) e continua sendo o
   > caminho do dia em que a renovação automática valer a reescrita. Não foi
   > escolhido agora porque o problema real era a **barreira de entrada**, não a
   > renovação, e ela se resolve sem trocar de provedor.
   >
   > **O que entrou.** A migração `38` (tabela `pro_pagamentos`;
   > `profiles.plano_expira_em` muda de significado), `services/pro.py` (a regra,
   > no lugar de `services/assinaturas.py`), `routers/pro.py` (`/v1/me/pro` GET e
   > `/v1/me/pro/pagamentos` POST), o webhook agora no tópico `payment`, e dois
   > jobs diários: `/internal/jobs/reconciliar-pagamentos` e
   > `/internal/jobs/avisar-vencimento`. No PWA, a folha do Pix em `Planos.tsx`
   > — copia e cola primeiro, QR desenhado no navegador a partir dele — e a data
   > de validade em Configurações. `tests/test_pro.py` cobre a decisão inteira.
   >
   > **`plano_expira_em` mudou de significado, e é a chave do desenho.** Era o
   > fim da carência de 7 dias depois de uma cobrança falhar; passou a ser **até
   > quando o PRO comprado vale**. O job que derruba quem passou da data é o
   > mesmo, com outro nome (`expirar_vencidos`), porque a pergunta é a mesma.
   >
   > **Comprar empilha.** `greatest(coalesce(plano_expira_em, now()), now()) +
   > make_interval(months => N)`. Quem renova faltando dez dias soma o período
   > novo aos dez que sobravam; quem voltou depois de ter caído soma a partir de
   > hoje. Sem o `greatest`, o único momento seguro de pagar seria o último dia
   > — justamente o dia em que se esquece.
   >
   > **Três travas que o Pix exige e a assinatura não exigia:**
   >
   > 1. *Crédito idempotente por transição.* `payment.created` e
   >    `payment.updated` são dois avisos legítimos do mesmo dinheiro, com ids de
   >    notificação diferentes: os dois passam pelo dedupe de `webhook_events`. O
   >    que impede o segundo de creditar outro mês é o `where status <>
   >    'approved'` do `update` — se ele não devolve linha, nada é creditado.
   > 2. *Cobrança viva é reaproveitada.* Quem fecha a folha e volta recebe o
   >    mesmo "copia e cola". Gerar outro deixaria dois códigos válidos na mão da
   >    mesma pessoa, e o Pix não pergunta se o outro já foi pago.
   > 3. *Chave de idempotência determinística.* `pro:<user>:<periodo>:<janela>`,
   >    com a janela do tamanho do QR. Um uuid por chamada não protegeria de
   >    nada: se o POST sai e a resposta se perde, não há linha local, a checagem
   >    de cobrança viva não acha nada, e a tentativa seguinte criaria a segunda
   >    cobrança.
   >
   > **O que sumiu, e por quê.** A carência de 7 dias existia porque cartão
   > recusa — o app entregava serviço não pago enquanto a pessoa resolvia. Pix ou
   > entrou ou não entrou. O cancelamento sumiu porque não há renovação a
   > cancelar, e com ele some o bug que retinha dez meses de quem pagava o anual
   > (corrigido em 22/08, agora impossível de reintroduzir). O
   > `cancelar_ao_sair` na exclusão de conta sumiu porque não há cobrança futura
   > a interromper. O `MERCADO_PAGO_BACK_URL` sumiu porque o Pix não leva ninguém
   > para fora do app.
   >
   > **O que entrou no lugar: o aviso de vencimento.** Sem renovação automática,
   > quem esquece cai — e cair sem aviso é a única forma de alguém perder algo
   > neste desenho. `TIPO_PRO_VENCENDO`, três dias antes, in-app e push, com
   > dedupe de 72 horas para o job diário não repetir o aviso nas três execuções
   > que a janela cobre.
   >
   > **Termos:** o §8 foi reescrito e a `VERSAO` subiu para `2026-08-23`, pela
   > mesma exceção declarada de 22/08 — nenhum direito encolhe, e nenhum pagante
   > existia na data.
   >
   > **O que falta, e não é código:** cadastrar o tópico `payment` no painel do
   > Mercado Pago (hoje só os dois de assinatura estão), conferir que a conta
   > vendedora tem chave Pix — sem ela o `POST /v1/payments` devolve 201 sem QR,
   > e `comprar` recusa com `PIX_INDISPONIVEL` —, aplicar a migração `38` no
   > Supabase e provar o pagamento ponta a ponta.

   **O que entrou.** A migração `30` (`profiles.plano_expira_em`, tabela
   `subscriptions`, tabela `webhook_events`), `services/mercado_pago.py` (o
   provedor inteiro atrás de um arquivo só), `services/assinaturas.py` (a
   regra), `routers/assinaturas.py` (`/v1/me/assinatura`, GET, POST e DELETE),
   `routers/webhooks.py` (`/v1/webhooks/mercadopago`) e o job diário
   `/internal/jobs/reconciliar-assinaturas`, já no cron. Vinte testes cobrem a
   decisão com a cobrança desligada.

   **`profiles.plano` é a verdade, e quem a escreve é o webhook.** Nenhuma regra
   pergunta ao Mercado Pago se alguém é PRO: `plano_vigente()` lê a coluna.
   Consultar o provedor a cada chamada amarraria o app à disponibilidade dele —
   uma instabilidade de um lado viraria queda de plano do outro. Pelo mesmo
   motivo a tela não promove ninguém: quem chega à tela de sucesso antes de a
   notificação chegar continua FREE por alguns segundos, e isso é correto. É o
   dinheiro que promove, não o redirecionamento.

   **O receptor tem três regras, e nenhuma é opcional.** Valida o `x-signature`
   por HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
   comparado por `compare_digest` — e **sem segredo configurado nada passa**,
   porque uma rota pública que aceitasse qualquer corpo seria um botão de virar
   PRO. Não confia no corpo: dele sai só o id, e o estado vem de uma consulta à
   API deles, o que torna inútil forjar corpo. E deduplica pelo id da
   *notificação*, não do recurso: o Mercado Pago reenvia quando não recebe 200 a
   tempo, e a mesma assinatura gera muitos avisos legítimos ao longo da vida —
   deduplicar por recurso engoliria mudança de estado de verdade.

   **O job de reconciliação existe porque webhook se perde.** Uma notificação
   que não chega deixa alguém PRO de graça, ou tira o PRO de quem pagou, e
   nenhum dos dois aparece como erro em lugar nenhum: o app fica errado em
   silêncio. A varredura diária confere no Mercado Pago toda assinatura viva
   cuja próxima cobrança já passou — recorte que mantém o trabalho proporcional
   ao que mudou, e não ao tamanho da base.

   **A queda passa pela carência**, conforme o item 10: assinatura que deixa de
   estar autorizada abre 7 dias com os limites do PRO, e a carência **não
   reinicia** a cada notificação do mesmo problema (uma assinatura que falha todo
   dia daria PRO para sempre). O que ainda não existe é a segunda metade do item
   10 — desativar os excedentes do mais recente para o mais antigo. Até ela
   entrar, um ex-assinante com 200 ofertas fica FREE com 200 ofertas ativas e só
   esbarra no teto ao cadastrar a próxima.

   **Sobre o Pix.** A documentação oficial lista, para assinaturas no Brasil, os
   meios `credit, mercadopago, boleto, pix`. O que ela **não** mostra é Pix
   Automático dentro de `preapproval`, e a API ignora em silêncio o
   `payment_methods_allowed` enviado na criação do plano — mandar `pix` ali é
   aceito e devolvido vazio. A leitura provável é que Pix e boleto funcionam como
   boleto sempre funcionou: a assinatura gera a cobrança a cada ciclo e a pessoa
   paga na mão, o que muda churn mas não muda uma linha do backend. Confirmar
   exige um pagador de teste — a conta dona do plano não assina o próprio plano.

   **A infraestrutura entrou em produção em 2026-08-14.** A migração `30` foi
   aplicada no Supabase, o código subiu no Render, e o webhook foi cadastrado no
   app TrocaTCG com a mesma URL em produção e sandbox, assinando exatamente os
   dois tópicos que `TOPICOS` trata (`subscription_preapproval` e
   `subscription_authorized_payment`) — assinar mais tópicos só gastaria
   requisição num receptor que os ignora. O segredo está na variável do Render.

   Duas coisas que custaram tempo e valem ficar escritas. **Variável com
   `sync: false` no `render.yaml` não é criada pelo `blueprint_sync`** — ela nem
   aparece no painel, e é preciso criá-la à mão em Environment. E **o 401 do
   receptor não distingue "sem segredo" de "assinatura errada"**, o que torna
   impossível provar de fora que a variável entrou. A prova é assinar uma
   notificação com um tópico **fora** de `TOPICOS`: ela atravessa a validação e
   para no `ignorado` sem precisar do access token e sem escrever no banco.
   Assinatura válida devolve `200 {"resultado":"ignorado"}`; a mesma requisição
   com a chave trocada devolve 401. O par prova as duas direções de uma vez.

   **O que falta para ligar**, e nada disso é código: ativar as credenciais de
   produção no painel, criar os dois planos com elas (plano de teste e de
   produção são objetos diferentes; os ids do `api/.env` não valem lá) e
   preencher as três variáveis `sync: false` que sobraram — o access token e os
   dois ids de plano. O item 1 do bloco de segurança (o rate limit que não roda)
   passa a valer de verdade aqui: o receptor é a rota pública que mais precisa
   dele.
8. ✅ **Tela de planos, estado do plano e o convite** — feito em 2026-08-13, com
   a cobrança ainda desligada.

   **Os números da tela vêm da API.** Entrou `GET /v1/planos` (pública, como o
   health), servindo `PLANOS` e `COBRANCA_ATIVA` direto de `core/limites.py`.
   Uma tabela de preço que promete 20 e um backend que barra em 15 é o defeito
   que só aparece **depois** de alguém pagar; com a rota existe uma fonte só, e
   mudar um teto continua sendo mudar uma linha. Cinco testes cobrem isso — e
   comparam contra `PLANOS`, nunca contra números escritos à mão, senão
   recriariam a divergência que a rota existe para evitar. O preço fica fora:
   não é regra de negócio hoje, e na Fase C quem manda nele é o Mercado Pago.

   **A tela diz na primeira linha que ninguém está sendo cobrado.** Enquanto
   `cobranca_ativa` for falso, `plano_vigente()` devolve PRO para todo mundo:
   uma tela vendendo assinatura nesse estado cobraria pelo que já está na mão.
   Ela existe agora para ser julgada e para o convite ter destino. Sem botão de
   assinar — ele chega com o Mercado Pago.

   **O convite mora no `useAvisoDeErro`**, que substituiu o
   `toast.error(erro.message)` repetido em seis telas. Quando o código do erro é
   de plano (`LIMITE_DE_ANUNCIOS`, `RECURSO_DO_PRO`, `LIMITE_DE_PROPOSTAS`), o
   mesmo aviso ganha um botão "Ver planos" e mais tempo na tela. A mensagem
   continua sendo a da API, que já explica a regra em português — o que faltava
   era ter para onde ir com ela. Faixa fixa dizendo "assine" é anúncio; a mesma
   frase no instante em que a pessoa quis fazer algo e não pôde é resposta.

   **O estado do plano vive em Configurações**, e o rótulo é "Liberado" — não
   "Free" — enquanto a cobrança estiver desligada: mostrar Free num app que não
   limita nada seria a tela contradizendo o produto. O selo PRO no perfil, que a
   tabela lista, ainda não existe: é cosmético e entra com a cobrança.

   **A linha do match triangular é a única marcada "em breve"** na comparação.
   Ver a decisão de 2026-08-13 na fila.
9. ✅ **Termos** — feito em 2026-08-14. Entraram duas seções: a **8**, com a
   assinatura (renovação automática, cancelamento a qualquer tempo sem multa e
   valendo até o fim do ciclo pago, arrependimento de 7 dias do art. 49 do CDC,
   mudança de preço só no ciclo seguinte, e o que acontece quando o pagamento
   falha), e a **9**, que separa o pagamento da troca — assinar não garante
   troca, não dá prioridade e não coloca o TrocaTCG dentro da negociação. A
   privacidade ganhou o dado da assinatura na lista do que se guarda e o Mercado
   Pago como operador de pagamento; a numeração da política andou duas casas.

   A `VERSAO` subiu para `2026-08-14` nos três lugares que precisam concordar:
   `Termos.tsx`, `render.yaml` e o default do `config.py` — que estava defasado
   em `2026-07-01` e registraria em `term_acceptances` o aceite de um texto que
   nunca existiu.

   **O novo aceite não entrou**, por decisão do Eduardo no mesmo dia: hoje o
   aceite só acontece no cadastro, e construir o re-aceite (rota que diz se a
   pessoa aceitou a versão vigente, tela bloqueante, contexto `REACEITE`) não se
   paga enquanto a base é de testadores e nenhum cliente pagante aceitou nada.
   Fica devendo à seção 8 do próprio texto, que promete pedir o aceite de novo —
   e vira pré-requisito no dia em que houver alguém pagando.

   **A conta apagada agora cancela a assinatura.** Não estava previsto aqui e
   apareceu ao escrever a cláusula: o `on delete cascade` de `subscriptions`
   apagava o lastro local sem falar com o Mercado Pago, e a pessoa seguiria sendo
   cobrada por um app onde não tem mais conta — com o `preapproval_id`, única
   chave para desfazer, apagado junto. `excluir_conta` cancela antes de apagar, e
   falha do provedor não interrompe a exclusão: apagar a conta é direito da LGPD
   e não pode depender de o Mercado Pago estar de pé. O que fica é o log com o
   id, que é o que permite cancelar na mão.
10. ✅ **Queda de plano** — feita em 2026-08-14, fechando a metade que faltava.
    Nada é apagado, nunca. São 7 dias de carência com os limites do PRO — tempo
    de resolver o pagamento; depois disso o job `encerrar_carencias` derruba para
    FREE e **desativa** os excedentes (`ativo = false`), da oferta mais recente
    para a mais antiga, e a pessoa escolhe quais 20 reativar. Congelar tudo ativo
    faria o teto virar decoração para todo ex-assinante.

    **As mais antigas é que ficam de pé**, e o `row_number` sobre `criado_em`
    crescente é o que garante isso: são as que a pessoa carrega desde sempre, e
    derrubar essas para manter as de ontem seria desfazer o acervo em vez de
    aparar o excesso. O corte é por pessoa — um `offset` numa consulta que mistura
    várias pularia as primeiras linhas da lista inteira.

    **O teto passa por `plano_vigente`, não por `limites_de` direto.** Enquanto
    `COBRANCA_ATIVA` for falso o vigente é PRO, o teto é `None` e nada é
    desativado: ninguém está pagando, e derrubar oferta de quem nunca foi cobrado
    seria punir pelo que o app ainda não vende. Mesmo portão de
    `_checar_teto_de_ofertas`, pelo mesmo motivo — e um teste quebra de propósito
    no dia da virada.

    **A queda avisa.** Entrou o tipo `PLANO_EXPIROU`, o décimo quinto da caixa e
    o nono com push. Ele não espera resposta de ninguém, o que normalmente o
    deixaria fora do push, mas é o único aviso do app que descreve algo que já
    mudou na vitrine da pessoa sem ela ter feito nada — e o que ela precisa fazer
    a respeito tem prazo. O texto diz o número ("3 ofertas saíram do ar") porque
    "seu plano mudou" obrigaria a abrir o acervo para descobrir o tamanho do
    estrago, e abre com **"nada foi apagado"**, que é a palavra que evita a
    leitura de que se perdeu o cadastro de 180 cartas. O link vai para o acervo,
    onde se reativa, e não para a tela de preço: mandar quem acabou de perder o
    plano direto para a página de assinatura é cobrar antes de consertar.

**Decisão ainda em aberto:** se o lançamento é só Belém ou aberto. Ela muda o
texto da vitrine e a expectativa de match de quem entra de fora.

### Alternativa de receita

Antes de assinatura individual, considere **patrocínio de loja local**: R$ 100–200/mês para a loja aparecer como ponto de encontro sugerido e ter selo no app. É mais fácil vender uma loja que 20 usuários, e conversa direto com seu objetivo de parceria com game store.

Atenção: patrocínio de loja aproxima o produto de um contexto comercial. Reforce nos termos que o TrocaTCG segue sem participar de qualquer negociação, e que o patrocínio se limita a espaço de divulgação e sugestão de local de encontro.

### Integração de pagamento (quando chegar)

Mercado Pago (assinatura recorrente, PIX) — taxa menor que Stripe no Brasil e PIX é o que a comunidade usa. Webhook `POST /webhooks/mercadopago` atualiza `profiles.plano`.

Esse pagamento é da assinatura da plataforma, entre usuário e você. Ele não tem nenhuma relação com as trocas, e essa separação precisa estar explícita nos termos.

---

### Levantamento da AbacatePay — 2026-08-21

Feito lendo a documentação pública, não conversando com eles. **Nada aqui está
confirmado pelo fornecedor** e as perguntas comerciais seguem abertas.

**Levantamento histórico — a disputa acabou em 22/08 e o Mercado Pago ficou.** O
que decidiu não foi nada do que está abaixo: a conta é PF, e PF não pode ser
recebedora no Pix Automático (regra do Banco Central). A AbacatePay saiu por
motivo próprio e mais duro — **não opera conta PF em produção**, CPF só no
sandbox. O registro completo está no item 2 da seção 17.

Fica escrito porque volta a valer no dia em que houver CNPJ com seis meses, e
porque a lição sobre ler changelog em vez de página de referência é boa para
qualquer fornecedor.

Contexto de então: o provedor havia mudado do Mercado Pago para o Asaas em 21/08
— por acreditar que a assinatura do Mercado Pago era só cartão, o que se provou
falso em 22/08 —, e no mesmo dia a
AbacatePay entrou na disputa: brasileira, Pix-first, taxa como diferencial.

**O que a documentação diz.**

| | |
|---|---|
| Assinatura recorrente | existe, cobrança automática, sem ação do cliente por ciclo |
| Ciclos | `WEEKLY`, `MONTHLY`, `SEMIANNUALLY`, `ANNUALLY` |
| Métodos | cartão **e Pix Automático** — ver a contradição abaixo |
| Retentativa | `retryPolicy` com `maxRetry` e `retryEvery` |
| Webhook | "Payloads assinados com HMAC usando o `secret` informado" |
| Status | `PENDING, EXPIRED, CANCELLED, PAID, REFUNDED` (herdados do checkout) |
| Saque | R$ 0,80 por saque, mínimo R$ 3,50, instantâneo 24/7 |

**A documentação se contradiz, e isso é o achado mais importante.** A página
`pages/subscriptions/create` afirma *"Assinaturas suportam apenas CARD"*. O
changelog de **15/05/2026** diz que existe **Pix Automático em assinaturas**, com
`methods: ["PIX"]`, *"disponível mediante habilitação no dashboard"* — e é Pix
Automático de verdade, a autorização recorrente do Banco Central, não um QR novo
a cada ciclo.

O changelog é mais novo e mais específico, então provavelmente é ele que vale. A
lição prática vale para a integração inteira: **a página de referência não é
contrato neste fornecedor.** Conferir comportamento contra o changelog ou contra
o suporte.

Sinal a favor: o changelog é ativo (04/08, 27/07, 09/06, 02/06). Para empresa
nova, produto mantido em ritmo diz mais que qualquer página institucional.

**As três incógnitas, em ordem de risco.**

1. **Como saber que o ciclo N foi pago.** É a única que pode obrigar a mudar
   arquitetura. `assinaturas.py` decide quem é PRO consultando o provedor, nunca
   pelo corpo do webhook — precisa existir endpoint que responda "esta assinatura
   está em dia hoje", e um evento de webhook por cobrança. Nenhum dos dois
   apareceu na documentação. O conjunto de status é herdado do *checkout*, o que
   descreve bem a primeira cobrança e mal as seguintes.
2. **Licença e custódia.** Nenhuma menção a autorização do Banco Central ou a
   instituição parceira em site, docs ou `llms.txt`. É a pergunta que sobra em
   fornecedor novo, porque entre a cobrança e o repasse o recebível fica com ele.
3. **A taxa por transação.** Quatro páginas, nenhum número; `/precos` responde
   404. Só *"Sem taxa mensal, sem surpresas"*.

**Por que Pix Automático importa mais que a taxa.** O público é jogador de TCG em
Belém, boa parte jovem: cartão de crédito não é universal, Pix é. E o cartão traz
o churn involuntário — vence, é reemitido, é bloqueado, e a pessoa sai sem saber
que saiu. Isso custa mais que qualquer percentual.

**Ação que não espera a decisão:** pedir a habilitação do Pix Automático no
dashboard. "Disponibilidade limitada" costuma significar fila, e descobrir isso
na hora de integrar é o erro que a conta Meta já ensinou.

### A reconstrução da camada de pagamento

Vale para qualquer provedor que ganhe — Asaas ou AbacatePay. O que muda é o
cliente HTTP; o resto do desenho é o mesmo, e foi construído para isto.

**O que não se toca.** A regra de negócio não é do provedor: quem vira PRO,
quando cai, e a carência de 7 dias vivem em `services/assinaturas.py`. Ela já
trata "cartão recusado" e "Pix não pago" como o mesmo evento, então trocar o
método de pagamento não mexe nela. `db/schema/30_assinaturas.sql`,
`routers/assinaturas.py` e a desativação em `profiles.py` também ficam.

**A superfície do provedor são seis funções e uma constante**, todas em
`services/mercado_pago.py` (211 linhas):

```
PERIODOS                    mapa nome -> meses
ativo()                     está configurado?
plano_do_periodo(periodo)   nome -> id do plano no provedor
criar_assinatura(...)       devolve a URL de checkout
buscar_assinatura(id)       a consulta que decide tudo
cancelar_assinatura(id)
assinatura_confere(...)     validação HMAC do webhook
```

Escrever o equivalente para o provedor novo é o trabalho. `routers/webhooks.py`
(91 linhas) muda o caminho da rota e a chamada de validação; o resto do fluxo —
idempotência por id de notificação em `webhook_events`, consulta, `_registrar` —
não muda.

**As duas costuras que vazam, e o que fazer com elas.** `aplicar_notificacao` lê
o JSON cru do provedor: `status`, `next_payment_date`, `external_reference`. E
`_periodo_do_recurso` lê `auto_recurring.frequency_type` / `frequency`, que é
formato do Mercado Pago dentro da camada de regra.

Isto é o que fez a primeira troca custar mais do que devia. **A reconstrução
corrige na raiz:** o módulo do provedor passa a devolver um objeto normalizado —
`status` já traduzido para o vocabulário do app, próxima cobrança como `date`,
`user_id` e `periodo` resolvidos — em vez de `dict`. Aí `assinaturas.py` deixa de
saber o nome de qualquer campo de qualquer fornecedor, e a terceira troca custa
só o cliente HTTP.

**O mapa de status é a decisão que sobra.** O `PENDING/EXPIRED/CANCELLED/PAID/
REFUNDED` da AbacatePay é mais pobre que o `preapproval` do Mercado Pago e não
distingue "em dia" de "pago uma vez". Enquanto a incógnita 1 acima não for
respondida, este mapa não pode ser escrito — e é por isso que a integração não
começa antes da resposta.

**Ordem de execução, quando chegar a hora.** Provedor decidido e as três
incógnitas respondidas → normalizar o retorno do módulo atual (refatoração pura,
com os 586 testes de `test_assinaturas.py` de rede) → escrever o cliente novo
contra a interface normalizada → validação do webhook, provada como a do Mercado
Pago foi: notificação assinada com tópico fora da lista atravessa e para no
`ignorado`; forjada devolve 401 → percorrer o fluxo inteiro com credencial de
teste, que é o caminho que nunca foi exercitado contra serviço nenhum.

**Nada disso bloqueia lançamento.** `COBRANCA_ATIVA` é falso, e a cobrança é Fase
5, atrás da triangulação.


## 17. Roadmap de desenvolvimento

### Fase 1 — Fundação (semana 1–2)

- Repositório com estrutura de pastas
- Projeto Supabase, schema completo, RLS, migrations Alembic
- FastAPI com healthcheck, config, auth
- Job de sync do catálogo Pokémon (TCGdex, PT + EN)
- **Keep-alive e backup diário rodando desde o primeiro dia**
- Páginas de termos e privacidade publicadas
- Deploy pipeline funcionando

**Entregável:** API no ar respondendo `/health` e catálogo Pokémon populado.

Keep-alive e backup entram na Fase 1 de propósito. São dois arquivos YAML de dez linhas, e deixá-los para depois é como o projeto morre em silêncio num fim de semana parado.

### Fase 2 — Anúncios (semana 3–4)

- CRUD de `listings`
- **Catálogo de acabamentos + regras por set dos sets em circulação** (seção 8)
- Busca de cartas com trigram
- Frontend: login com aceite de termos, onboarding, tela Minhas cartas
- PWA instalável

**Entregável:** usuário cria conta e cadastra o que oferece e o que procura, com acabamento correto.

Priorize as regras dos sets que a comunidade local realmente joga e troca hoje. Não tente cobrir 25 anos de sets antes de lançar — a camada de curadoria comunitária preenche o resto com o tempo.

### Fase 3 — Matching direto (semana 5–6) ⭐

- Query SQL de matching + scoring
- Endpoints `/matches`, accept, decline, reveal-contact
- Modal de disclaimer antes de revelar contato
- Feed e detalhe no frontend
- Linha de troca renderizada

**Entregável:** o app já é útil. **Solte para a comunidade aqui.** Não espere as fases seguintes.

### Fase 4 — Reputação (semana 7)

- Ciclo de vida completo do match
- Confirmação bilateral, no-show, expiração
- Perfil público com reputação
- Denúncia de usuário

**Entregável:** trocas param de furar.

### Fase 5 — Triangular (semana 8–9)

- Algoritmo de detecção de ciclos
- Job agendado
- Visualização do triângulo

**Entregável:** a funcionalidade que nenhum concorrente tem.

### Fase 6 — Notificações (semana 10)

- Tabela + Realtime in-app
- Web Push com VAPID
- Job "procuram sua carta"

**Entregável:** reengajamento sem custo.

### Fase 7 — Polimento (semana 11–12)

- Cadastro em massa
- Métricas e observabilidade
- Testes de carga
- README de portfólio com decisões de arquitetura documentadas

### Ordem de execução até o lançamento (2026-08-14)

Decidida pelo Eduardo em 2026-08-14, e ela reordena o que a fila abaixo lista por
assunto: **a segurança sai da frente e vai para imediatamente antes de abrir**, e
**a triangulação vai para depois do lançamento**. O que está escrito adiante
continua valendo como descrição de cada item; isto aqui é a sequência.

**Fase 1 — começar já, porque depende de terceiros e demora.** Corre em paralelo
com todo o resto.

1. Conta Meta Business e chip dedicado para o WhatsApp. A verificação de negócio
   leva dias e corre sozinha — adiar isto é criar o gargalo do fim.
2. Credenciais de produção do Mercado Pago e os dois planos criados com elas.

   **✅ A assinatura rodou ponta a ponta em 2026-08-22**, e o parágrafo que
   estava aqui — "nenhum `preapproval` criado de verdade, nenhuma notificação real
   no receptor" — deixa de valer. A passagem custou zero reais e **achou três bugs
   que a suíte inteira não pegava**, todos os três fatais para a cobrança:

   1. **`criar_assinatura` nunca funcionou.** Mandava `preapproval_plan_id` e o
      provedor recusava com `card_token_id is required`, sempre. Corrigido para
      assinatura sem plano associado.
   2. **O `external_reference` se perdia** pelo caminho do plano, e é ele que diz
      de quem é a assinatura. O webhook rodaria inteiro sem promover ninguém.
   3. **O `next_payment_date` derrubava o webhook com 500.** Ele chega como texto
      e o SQL fazia `cast(:prox as timestamptz)`, o que parecia bastar; o asyncpg
      confere o tipo Python antes da query e recusa `str` num parâmetro de
      timestamp, então o `cast` nunca roda. Ver `_quando` em `assinaturas.py`.

   **A lição de método é a mesma das outras três vezes** (rate limit, aceite,
   notificação de troca), e agora com uma forma nova: os testes dublavam
   `criar_assinatura` e `buscar_assinatura` inteiras, então o dublê aceitava o
   corpo que o provedor recusava e devolvia o tipo que o driver recusaria. **Dublê
   na borda prova o nosso lado, nunca o contrato.** Os testes que entraram descem
   um nível — dublam `_chamar`, e afirmam sobre o corpo enviado e sobre o tipo do
   parâmetro ligado ao SQL.

   **Como foi montado, para repetir:** dois usuários de teste do Mercado Pago
   (`/users/test_user`), um vendedor e um comprador. O vendedor precisa ter
   aplicação própria — dentro de conta de teste **não existe seção de credencial
   de teste**, e a que ela chama de produção é a de teste. Sem isso o checkout
   falha com "uma das partes é de teste", porque a conta real do Eduardo é o
   `collector` dos planos. O webhook chegou por um túnel do `cloudflared`
   (`cloudflared tunnel --url http://localhost:8000`, sem conta) apontado no
   painel do vendedor — `notification_url` por assinatura é aceito e **ignorado**.

   **O que ficou provado:** `criar_assinatura` nos dois períodos, `buscar_assinatura`
   e `cancelar_assinatura` contra assinatura real, `_periodo_do_recurso` contra
   payload real, e no receptor os seis caminhos — `aplicada`, `repetida`
   (idempotência), `ignorado` (tópico fora da lista) e 401 para assinatura
   forjada, ausente e com carimbo fora da janela.

   **✅ E o contrato do HMAC também está provado.** As notificações que nós mesmos
   assinamos provavam o receptor, não o contrato: a mesma fórmula dos dois lados é
   raciocínio circular, e manifesto errado significaria 401 em tudo, para sempre,
   sem nada no log explicando. O botão **Simular** do painel deles quebrou o
   círculo — a notificação chegou assinada pelo Mercado Pago e **passou** pelo
   `assinatura_confere` sem uma recusa no log.

   **E foi ela que achou o quarto bug.** O simulador manda `data.id=123456`, um id
   que não existe; o `buscar_assinatura` levava 404 e o receptor devolvia 500. Como
   o Mercado Pago reenvia tudo que não recebe 200, uma notificação assim seria
   reenviada **para sempre**. Agora existe `mercado_pago.RecursoInexistente`: 404 é
   fim de linha, responde `200 desconhecido`, e o evento fica gravado para o dedupe
   pegar o reenvio sem gastar outra ida à API. Qualquer outro erro continua subindo
   como 500 — provedor fora do ar merece retentativa, id inexistente não.

   Estado final do banco depois da passagem: `webhook_events` em zero, nenhum
   `profile` com carência aberta, `api/.env` restaurado com as credenciais do
   aplicativo real.

   **Decisão do Eduardo em 2026-08-16: ligar fica para o lançamento**, junto com o
   resto da ativação. Não bloqueia nada enquanto `COBRANCA_ATIVA` for falso.

   **Em 2026-08-21 o provedor mudou para o Asaas**, e com isso tudo o que está
   escrito acima sobre credencial de produção, `preapproval_plan_id` e segredo de
   webhook **caducou** — é todo do Mercado Pago. A regra de negócio não é do
   provedor e sobrevive à troca: quem decide quem é PRO, quando cai e como
   funciona a carência mora em `services/assinaturas.py`, alimentado por consulta
   ao provedor e nunca pelo corpo do webhook. Trocar é reescrever o cliente HTTP,
   a validação de assinatura e o mapa de status.

   **Por que o Mercado Pago saiu, e por que o motivo não existia — 2026-08-22.**
   A troca de 21/08 foi feita por acreditar que a assinatura recorrente do Mercado
   Pago é só cartão. **Ela não é.** O checkout do plano `TrocaTCG PRO mensal`,
   percorrido com credencial de teste em 22/08, oferece três opções: cartão de
   crédito, **boleto** e **Pix**.

   O que enganou foi o painel, e vale saber para não repetir: a tela de
   configuração do plano não é onde os meios aparecem. O plano tem
   `payment_methods_allowed: {}` — vazio significa *todos liberados*, não
   *nenhum*. Quem lê o painel procurando uma lista de meios encontra o vazio e
   conclui o contrário do que ele diz. **O checkout é a fonte da verdade, e ele só
   se lê percorrendo.**

   Fica registrado também o argumento que **não** vale, porque ele volta: "o
   pessoal já conhece o Mercado Pago". O checkout é hospedado pelo provedor em
   qualquer um dos candidatos — o app manda a pessoa para lá e ela volta.
   Reconhecer a marca não decide nada; o que decide é quem consegue pagar.

   **E aí a conta é PF, o que derruba a premissa da troca — 2026-08-22.** O
   Eduardo não tem CNPJ. Isso não é detalhe de cadastro: **pessoa física não pode
   ser recebedora no Pix Automático.** É regra do Banco Central, não política de
   fornecedor — PF entra na modalidade só como pagadora. O Asaas ainda soma
   exigência própria: CNPJ ativo há **no mínimo seis meses**, conta aprovada.

   O efeito é que o recurso pelo qual o Mercado Pago foi trocado não existe para
   este projeto hoje, em provedor nenhum, e não passa a existir antes de seis
   meses contados da abertura de um CNPJ. A **AbacatePay sai da disputa inteira**
   pelo mesmo motivo: ela não opera conta PF em produção — CPF só no sandbox.

   **O que resta, e é suficiente.** O objetivo nunca foi Pix Automático, foi
   *"quem não tem cartão consegue pagar"*. A assinatura comum do Asaas entrega
   isso: ele gera uma cobrança a cada ciclo e, com chave Pix na conta, embute um
   QR Code em cada fatura. A pessoa paga por Pix, todo mês, na mão. Perde-se a
   automação — o que custa churn, porque exige ação por ciclo — e ganha-se o
   alcance, que é o que estava em jogo.

   **Decisão do Eduardo em 2026-08-22: fica o Mercado Pago.** A troca de 21/08
   está desfeita, e o parágrafo acima que declara credencial de produção,
   `preapproval_plan_id` e segredo de webhook caducados **volta a valer** — são
   de novo o que precisa ser preenchido no painel do Render. Os dois planos já
   estão criados com credencial de produção; o `services/mercado_pago.py` e os
   testes de `test_assinaturas.py` nunca foram tocados. **A decisão custa zero
   linha de código**, e é essa a razão dela: o alternativo era escrever um cliente
   HTTP inteiro para comprar um Pix manual que o cartão já cobre em parte.

   **Como o Pix funciona aqui, que é o que se está comprando.** Não é Pix
   Automático: a cada ciclo o Mercado Pago emite um código Pix (ou boleto) e manda
   por e-mail na data da cobrança; ele vence em 7 dias e ainda tem 3 de prazo
   antes de expirar. A pessoa paga **na mão, todo mês**.

   Isso custa churn — toda cobrança que exige ação perde gente — e é o modelo
   realista para este projeto de qualquer forma: Pix Automático exige CNPJ, e a
   conta é PF. O que importava era o alcance, e o alcance está resolvido: quem não
   tem cartão paga por Pix ou boleto, sem trocar de provedor e sem uma linha de
   código.

   O gatilho de reavaliação continua valendo, só que agora é sobre conforto e não
   sobre alcance: MEI aberto, mais seis meses de CNPJ, é quando o Pix Automático
   entra em jogo e troca o pagamento manual por débito autorizado.

   **E a decisão que vale a pena tomar cedo é outra: abrir o MEI.** É gratuito,
   sai online em minutos, e é o único item desta lista cujo custo é *esperar* —
   os seis meses só começam a correr no dia em que o CNPJ existe. Não bloqueia
   lançamento nenhum; adiar só empurra a data em que o Pix Automático entra.

   **O que sobra como próximo passo real da Fase 5** não é escolher provedor, é o
   que já estava escrito acima e continua verdadeiro: a assinatura nunca rodou
   ponta a ponta. Isso agora é fazível de graça e hoje, porque o provedor voltou
   a ser aquele cujas credenciais de teste e `preapproval_plan_id` já estão no
   `api/.env`.

   **E a primeira receita provavelmente não passa por nada disso.** O patrocínio
   de loja local, registrado acima como alternativa, são uma a três lojas pagando
   R$ 100–200/mês. Isso é chave Pix e planilha — não precisa de provedor, de
   integração nem de CNPJ para começar.

**Fase 2 — o que falta para poder abrir.** Tudo código ou texto, nada bloqueado.

3. ✅ **Modal de disclaimer antes de revelar o contato** — feito em 2026-08-15.
   Detalhe na seção 4.2.
4. ✅ **Disclaimer de não-afiliação** com Nintendo, Creatures, GAME FREAK e The
   Pokémon Company — feito em 2026-08-15. Aparece no rodapé da Home, no fim de
   Configurações (a única tela "do app" que quem já entrou abre para ver coisas
   do app) e no fim dos termos, fora da numeração: não é cláusula que rege a
   relação com quem usa, é declaração sobre marcas de terceiros.
5. **Tela do código do WhatsApp** e o pedido no primeiro aceite. O backend está
   pronto e desligado desde 2026-08-12; a tela pode ser construída antes de o
   item 1 ficar de pé.
6. ✅ **Open Graph (1200×630), `twitter:card`** e os **screenshots do manifesto**
   — feitos em 2026-08-15, com a prévia confirmada num WhatsApp de verdade em
   2026-08-16.

   As três imagens saem de scripts, e não de um editor: `scripts/gerar-og.mjs` e
   `scripts/gerar-screenshots.mjs`, ao lado do `gerar-icones.mjs` que já existia
   e com a mesma técnica — o Chromium do Playwright rasterizando, sem sharp nem
   ImageMagick. Guardar arte solta em PNG é o que faz uma marca virar cinco
   marcas parecidas na primeira mudança.

   Duas armadilhas que ficam registradas. A `og:image` precisa ser **absoluta**:
   caminho relativo funciona no navegador e falha em todo raspador de prévia, que
   busca a imagem sem página base — e falha calada. E o Chrome exige os **dois**
   `form_factor` de screenshot: se faltar o do contexto, ele descarta os dois e
   volta para a caixa de instalação sem prévia nenhuma.

   As três ficaram **fora do precache** (`globIgnores`): nenhuma é exibida pelo
   app rodando. Quem lê a `og.png` é o raspador do WhatsApp, quem lê os
   screenshots é o Chrome ao montar a caixa — os dois buscam de fora, sem passar
   pelo service worker. Precacheá-las faria toda pessoa baixar 80 KB que nunca
   veria.

7. ✅ **Seletor de acabamento limitado ao que existe** — **já estava pronto**, e
   entrou na ordem por erro meu de verificação em 2026-08-14: procurei
   `card_finishes` nas rotas da API e não achei, sem notar que quem consulta é o
   frontend direto no Supabase. `useAcabamentosDaCarta` existe e é usado pelas
   quatro telas que oferecem a escolha — a folha de adicionar, a busca, o detalhe
   da carta e o acervo. A validação do outro lado também já existia, em
   `_resolver_acabamentos`.

   Fica a lição de método, que é o que interessa: conferir um item de checklist
   por um grep num diretório é o mesmo que não conferir.

**Fase 3 — segurança, imediatamente antes de abrir.** Na ordem de gravidade da
varredura de 2026-08-11, detalhada no bloco "Segurança do app" abaixo.

8. ✅ **Rate limit** — feito em 2026-08-16. Não bastou adicionar o middleware:
    ele libera toda requisição cuja rota não consegue resolver, e o FastAPI 0.140
    mudou a forma de incluir routers. O freio passou a ser do projeto, em
    `core/limitador.py`. Detalhe no bloco de segurança abaixo.
9. ✅ **Bloqueado continua agindo** — feito em 2026-08-16. A trava ficou em
    `usuario_atual`, com duas exceções declaradas (ver o próprio perfil e apagar
    a conta), para que rota nova nasça fechada.
10. ✅ **`/docs` e `/openapi.json` fechados em produção** — 2026-08-16.
11. ✅ **`JOB_SECRET` sem default publicado, com `compare_digest`** — 2026-08-16.
12. ✅ **CSP no PWA** — 2026-08-16, com o hash do script inline conferido no CI.
13. ✅ **Miúdos** — 2026-08-16.

    Junto deles saiu uma dívida que não estava na lista e valia mais que qualquer
    um: **o CI estava vermelho desde 2026-08-11**, por cinco erros de `ruff` em
    arquivos antigos. Eu os vi em 14/08 e decidi não mexer por serem "fora do
    escopo" — julgamento errado, porque um CI vermelho não protege nada, e o
    `conferir:csp` acrescentado hoje nasceria inútil atrás dele.

**Fase 4 — lançar.**

14. ✅ **Restauração do backup provada num banco descartável** — feita em
    2026-08-20, e não uma vez: virou o job `restaurar` do próprio workflow de
    backup, que todo dia abre o artifact recém-gerado num Postgres 17 vazio e
    confere esquema, dados, RLS e grants. Achou o que existia para achar — o
    dump saía com `--no-acl` e não trazia a camada de permissão. Detalhe na
    seção 15.
15. ✅ **Sentry recebendo eventos** — feito em 2026-08-20, backend e frontend,
    com `RegraNegocio` e 4xx fora do painel e o stack sem variáveis locais (o
    `Authorization` vazava por ali). **Provado em produção no mesmo dia**: os DSN
    entraram no Render e o PWA no ar enviou evento com `200` do ingest. Detalhe
    na seção 20.
16. **PWA instalada — iOS feito em 2026-08-21, Android pendente.** É o que
    sobra deste item.
17. 30+ usuários pré-cadastrados, com o lançamento tratado como evento e não como
    deploy — ver "O risco número um" na seção 21.

    **Decidido em 2026-08-21: o lançamento é só Belém.** A pergunta estava aberta
    desde 14/08, e a resposta fecha o escopo do item: uma comunidade que já se
    conhece, num dia de torneio, com os cadastros feitos no celular de cada
    pessoa e com ajuda ao lado. Não é limitação técnica — é a condição em que o
    início a frio se resolve, porque quarenta pessoas que se encontram
    presencialmente geram troca real, e quatrocentas espalhadas não.

    **A confirmação de e-mail fica ligada**, decidido no mesmo dia. Chegou a ser
    considerado desligá-la para o evento, pelo teto de envio; o teto subiu para
    100/hora e o argumento caiu. O que sobrava era atrito, e o preço de desligar
    era alto demais para pagá-lo por isso: além de reabrir o R-1 da
    `SEGURANCA.md`, e-mail digitado errado viraria conta que nunca recupera a
    senha — some da base no dia seguinte e ninguém descobre por quê.

    **Dois itens de divulgação entram aqui, pedidos pelo Eduardo em
    2026-08-25.** Ficam presos ao 17 e não viram fase própria, porque não são
    trabalho paralelo: existem para encher o evento, e um lançamento com trinta
    pessoas na sala não depende de alcance, depende de convite.

    17a. **Terminar o Instagram.** O perfil existe e está pela metade. O que
    fecha o item: bio, foto, destaque de "como funciona" e as primeiras
    publicações — o suficiente para quem receber o convite e for conferir quem
    somos não encontrar um perfil vazio. **Perfil vazio custa mais que perfil
    nenhum:** ele é a única prova pública de que o app tem gente atrás, e quem
    abre um feed em branco antes de se cadastrar não se cadastra.

    17b. **Fazer as imagens de divulgação.** Post e story para o convite,
    cartaz para o dia do torneio, e a arte que acompanha o link quando alguém
    manda no grupo. A prévia do link já funciona — a `og:image` é absoluta e
    aponta para `trocatcg.com` desde que o DNS resolveu —, então isto é peça
    de rede social, não meta tag.

    O texto delas não é decisão de engenharia: é voz de marca, e o Eduardo
    decide. O que a doc registra é que **os dois precisam existir antes do
    convite sair**, e não depois — convite mandado num grupo é uma bala só.

**Fase 5 — depois de lançar.**

18. Tela de três pontas da triangulação. O motor está pronto e desligado.

    **Decisão do Eduardo em 2026-08-22: um mês depois do lançamento.** O app abre
    sem triangulação, e ela chega com a base já rodando. Antes disto o item era
    "depois de lançar" sem data, o que na prática é "quando sobrar tempo".

    O prazo é a parte útil da decisão, e não por disciplina: a tela de três pontas
    é a peça de interface mais difícil do projeto — toda a UI de troca é escrita
    para duas pessoas e duas cartas, e um match de três chega nela torto. Um mês
    de base real antes de construí-la é um mês de gente usando a troca de dois
    lados, que é o material com que a de três se desenha direito.
19. Virar `COBRANCA_ATIVA`, que depende do 18: a tabela do PRO vende match
    triangular.

    **Com o 18 marcado para um mês depois do lançamento, esta é a data real da
    primeira receita: lançamento + um mês + o tempo de construir a tela.** Fica
    escrito porque a conta não é óbvia lendo a lista, e porque "o app não fatura
    nada há dois meses" é o tipo de coisa que assusta quando se descobre por
    acidente, e não quando se decidiu.

    Não é problema: cobrar antes de o app provar que gera troca é vender o que
    ainda não se entregou, e o princípio de precificação da seção 16 já diz isso.
    Mas se em algum momento a receita precisar vir antes, o caminho **não** é
    antecipar o 18 — é o patrocínio de loja, que não depende de recurso nenhum do
    app e está descrito em "Alternativa de receita".

    **O pré-requisito deste item está cumprido desde 2026-08-22.** Ele dizia
    "antes de virar, rodar a assinatura ponta a ponta com credenciais de teste,
    porque é o único caminho do app que nunca foi exercitado contra o serviço de
    verdade". Foi rodado, e achou quatro bugs fatais — ver o item 2.

    O que resta é operação de painel, no dia de ligar: pôr
    `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` **de produção** no
    Render, e cadastrar o webhook no painel do Mercado Pago apontando para
    `https://api.trocatcg.com/v1/webhooks/mercadopago`, com o evento "Planos e
    Assinaturas". Os ids de plano não entram mais — a assinatura é criada sem
    plano associado.
20. README de portfólio, que serve ao Eduardo e não ao app.

### O que entrou fora desta ordem, em 2026-08-21

Quatro coisas foram feitas num dia só e nenhuma estava na lista. Ficam
registradas aqui para que a ordem acima continue sendo a verdade e não uma
lembrança:

- **Domínio próprio.** O app mora em `trocatcg.com`, a API em
  `api.trocatcg.com`, e `www` redireciona para o apex. Feito antes do
  lançamento de propósito: PWA é presa à origem, e trocar o endereço depois não
  migra ninguém. Runbook e armadilhas em `docs/INFRA.md`.
- **Medidor de força de senha** no cadastro e na senha nova, com barreira contra
  o que é adivinhável — lista das mais usadas, vocabulário de carta, nome e @ da
  própria pessoa. Ver `lib/forcaSenha.ts`.
- **Mínimo de senha no servidor subiu de 6 para 8**, fechando o item 2 das
  pendências de painel da `SEGURANCA.md`. Medido contra a API, não lido no
  painel.
- **`robots.txt`**, com o app indexável e as telas de passagem fora da busca.

- **A base de contas foi zerada** para receber cadastros reais. Sobrou uma conta
  de teste. O estado de selagem que existia para exercitar o carimbo morreu
  junto e precisa ser remontado do zero.

Duas ressalvas sobre a própria ordem. O **rate limit (8)** sobe para antes do
item 5 se o WhatsApp ficar pronto cedo — cada mensagem custa dinheiro e queima
cota na Meta, e é ele que segura o abuso. E o **item 3 não desce**: é barato, e é
a exposição que menos se quer ter no primeiro dia com gente de verdade usando.

### Dívida aberta: a imagem que o sync não traz

Registrado em 2026-08-25, para ser consertado depois.

**O sync pede a listagem da expansão em português e aceita o `image` nulo.** O
`tcgdex.py` já sabe cair para o inglês, mas só em `obter_detalhe` — raridade e
preço. A imagem nunca herdou essa queda. Medido: **1.126 de 15.997 cartas sem
arte, 7% do catálogo**, quase todas promo (`swshp`, `smp`, `mep`, `svp`).

O `api/scripts/backfill_imagens.py` fechou **555** delas em 25/08, e o catálogo
caiu para **3,57%**. Ele é remendo: pega o que está no banco hoje, e carta nova
com o mesmo defeito entra sem arte de novo.

**O conserto é uma queda para o inglês em `montar_imagem`**, no mesmo espírito da
que já existe em `obter_detalhe`. Não foi feito em 25/08 porque não dava para
testar. Escrever a queda sem poder exercitá-la seria repetir o erro que a seção
16 registra três vezes — código que parece certo e não é.

#### O diagnóstico da TCGdex fora do ar, para não refazer

Em 2026-08-25 o `api.tcgdex.net` **recusava conexão**, e o que se sabe dele:

- **Não é rede de uma máquina só.** Três clientes independentes bateram na mesma
  parede — `curl` e o próprio sync do app, da máquina do Eduardo, e o navegador
  dele. O DNS resolve (`142.44.242.175`), o TCP é que não fecha.
- **Não é a TCGdex inteira.** O `assets.tcgdex.net` respondia **200** o tempo
  todo — é dele que saíram as 555 imagens do backfill —, e o site `tcgdex.dev`
  também abria. Só a API.
- **O sync falha limpo.** Rodado à mão contra um set pequeno (`dc1`), morreu na
  primeira chamada com `httpx.ConnectError: All connection attempts failed`,
  **antes de tocar no banco**: o set continuou com as mesmas 34 cartas e as
  mesmas 6 sem imagem. Ele busca antes de escrever, e sem resposta não há o que
  escrever. Catálogo pela metade não é um risco desta falha.
- **Nada em produção depende disso.** O `jobs.yml` agenda sete jobs
  (`notify-wanted`, `notify-alerts`, `triangular`, `expire`,
  `reconciliar-pagamentos`, `avisar-vencimento`, `cambio`) e **nenhum** toca a
  TCGdex. Sync e preços rodam à mão, pelo `run.py`. Não há alerta a esperar, e
  os logs da API confirmam: nenhuma linha de `tcgdex` desde 18/08.

Ou seja, a espera não custa nada — só adia. Quando a API voltar, as duas
pendências (a queda no `montar_imagem` e a confirmação carta a carta das
galerias) saem no mesmo dia.

**As galerias continuam sem arte, e de propósito.** `swsh9.5tg`, `swsh12.5gg`,
`swsh4.5sv` e as outras têm imagem sob o caminho da expansão-mãe (`swsh12.5/GG35`
responde 200), mas ali o 200 prova que existe *algo* naquele endereço, não que é
*aquela* carta. Num app onde se fecha troca olhando a imagem, arte errada é pior
que arte nenhuma. Confirmar carta a carta exige a API.

**As 571 restantes não têm arte em lugar nenhum**, conferido nos dois idiomas.
Para elas o `CartaThumb` continua sendo a resposta certa: nome, código do set e
número, e nunca uma caixa quebrada.

Uma coisa que a medição desfez: arte em inglês não é novidade deste remendo. O
catálogo já tinha **2.127 cartas** assim antes dele.

### O que entrou fora desta ordem, em 2026-08-25

**O e-mail transacional saiu do Gmail e passou a chegar na caixa de entrada.**
Não estava na lista porque a lista não sabia que havia um problema: o e-mail
"funcionava" desde 14/08 — era entregue, tirava 10/10 no mail-tester — e caía no
spam em todos os testes. Ver 11.3 para o arranjo e as armadilhas.

O que a passagem provou, e que é o motivo de estar registrado aqui:

- **Remetente próprio não bastou.** Com o Resend, o `trocatcg.com` verificado e
  SPF, DKIM e DMARC os três passando e alinhando, o primeiro e-mail **ainda** foi
  para o lixo eletrônico do iCloud.
- **O que tirou do spam foi o corpo apontar para um domínio só.** O link ia para
  `supabase.co/auth/v1/verify` e o logo vinha de `onrender.com`. Três domínios
  numa mensagem que pede senha é a forma de um phishing — e o filtro lê a forma,
  não o conteúdo, que já era bom havia onze dias.
- **De tabela, morreu um defeito antigo.** Antivírus de caixa de entrada abre os
  links da mensagem para inspecionar, e abrir o `/auth/v1/verify` **consome** o
  token, que serve uma vez só. Era parte dos "este link não vale mais" que
  ninguém conseguia reproduzir.

**Os dois fluxos foram percorridos no app em produção, não em teste.**
Recuperação de senha e cadastro novo: e-mail entregue, link em `trocatcg.com`,
clique criando sessão, `email_confirmed_at` gravado 33 segundos depois do
cadastro, token apagado da barra pelo `replaceState`, e as duas mensagens na
caixa de entrada. A conta de teste foi apagada em seguida.

**O que não está resolvido é reputação.** O domínio foi registrado em 21/08 e o
primeiro e-mail saiu dele em 25/08. Remetente novo cai no spam fazendo tudo
certo, e isso é tempo e volume. O DMARC está em `p=none` de propósito: endurecer
para `quarantine` depende de ver relatório limpo primeiro.

**O contato do projeto virou `contato@trocatcg.com`**, recebendo pelo domínio
personalizado do iCloud+ e provado com um e-mail saindo do próprio remetente do
app. Saiu do Gmail nos Termos, em Configurações, em Instalar, no `VAPID_SUBJECT`
e nos templates. Configurações e Instalar traziam o endereço **escrito à mão** e
passaram a usar a constante `CONTATO` dos Termos: três cópias de um canal de LGPD
é como as três passam a dizer endereços diferentes, e a desatualizada vira
promessa quebrada num documento que promete.

O rodapé dos cinco templates ganhou "Este endereço não recebe respostas". O nome
do remetente não conta como aviso — no celular o cliente de e-mail mostra
"TrocaTCG", não o endereço, e gente responde, principalmente ao de recuperação de
senha. É também o que dispensa `nao-responda@` de ser caixa de verdade.

### Os selos, decididos olhando rodando — 2026-08-25

Duas decisões do Eduardo no mesmo dia, e a segunda foi o que liberou a primeira.

**O PRO ficou azul** (`tom="acao"`). Ele nasceu `neutro` em `0c29af1` como
marcador de pendência, passou pelo âmbar por algumas horas e parou aqui. O azul é
o da ação primária, e o risco era o selo ser lido como "aqui se clica".

**Quem tem FOUNDER vê só o FOUNDER** — a regra é `pro && !definicao`, geral e não
exceção para a conta do dono. Quem tem selo de reconhecimento já tem o PRO junto,
então os dois lado a lado anunciavam a mesma coisa duas vezes. E foi isso que
tirou o risco do azul: sozinho na linha, sem nada azul por perto disputando, o
selo lê como identidade e não como botão.

O componente continua recebendo `selo` e `pro` **separados**. Coexistir no dado é
o que deixa esta ser escolha de desenho e não de modelagem — mesmo motivo de o
PRO nunca ter virado valor da coluna `selo`.

**O selo saiu de ao lado do nome e foi para cima dele**, na ficha do perfil. Lado
a lado ele comia a largura e o `truncate` cortava o resto — `@eduar…` num card
cuja função é dizer com quem se está falando.

### Três defeitos achados usando o app — 2026-08-25

Nenhum apareceu em teste; os três apareceram com o Eduardo mexendo no app.

**A busca trazia carta errada.** `snorlax` devolvia 46 acertos e 24 intrusos
(`snom`, `snorunt`). Ver a seção de busca do `INFRA.md`: a similaridade virou
rede, e só entra quando nada casou.

**O "Voltar" dos Termos jogava quem estava logado na tela de login.** Era
`<Link to="/entrar">`, endereço fixo — e quem abre os termos por Configurações
está dentro do app. Agora volta para onde a pessoa estava; o `location.key`
distingue quem chegou por link compartilhado, e para essa pessoa o destino
depende de haver sessão. Virou `<button>`, porque deixou de ser um endereço.

**A marca abria a primeira tela à esquerda.** Centralizada: ali o lockup não é
cabeçalho de navegação, é apresentação. O texto abaixo fica à esquerda — centrar
parágrafo de três linhas obriga o olho a procurar onde cada linha começa.


### Fila atual (agosto de 2026)

O roadmap acima é o plano original, e ele foi cumprido até a Fase 4 — com a
vitrine e as propostas (seção 22) entrando fora de ordem, porque o matcher
sozinho não atende quem só declarou um lado. Isto aqui descreve cada item; a
sequência de execução está logo acima.

**Produto**

1. ✅ **Notificar "é a sua vez"** (Fase 6, antecipada) — feito em 2026-08-11.
   Entrou o canal in-app inteiro, não só o aviso da proposta: treze eventos,
   Realtime no sino, caixa em `/notificacoes` e o job `notify-wanted` que o
   cron já chamava e recebia 404. Detalhes na
   [seção 12](#12-notificações). O **Web Push** entrou logo em seguida, no mesmo
   dia: sete dos treze eventos vibram o celular com o app fechado, o service
   worker passou a ser escrito à mão (`web/src/sw.ts`) e o interruptor mora em
   Configurações. No iPhone só funciona com o app instalado na tela de início,
   o que dá urgência à página `/instalar` lá embaixo.
2. ✅ **Vitrine como destino de quem não tem match** — feito em 2026-08-11. As
   três saídas da tela vazia de `/matches` apontavam para `/minhas-cartas`, ou
   seja, pediam mais digitação a quem tinha acabado de digitar. Agora a tela
   pergunta antes o que falta e responde com a vitrine dentro dela: quem tem
   Procuro vê uma amostra das próprias cartas procuradas que alguém está
   oferecendo (`?so_procuro=true` — trocas que só faltam de um lado, e a
   proposta resolve o que o motor não fecha); quem não tem Procuro vê o feed
   inteiro, porque para essa pessoa a pergunta ainda é "o que existe por aqui".
   Amostra com arte, e não só um botão: botão pede fé de que existe algo do
   outro lado, e quem está numa tela vazia acabou de aprender que talvez não
   exista. Quando há gente procurando o que a pessoa oferece, essa notícia
   continua vindo primeiro — metade da troca já existe —, e cada `@nome` agora
   leva ao acervo de quem quer a carta, que é onde a proposta é montada.
3. ✅ **Login e cadastro reformulados** e **modo escuro** — feitos em 2026-08-10
   (`78f8212`). O escuro passou por um laboratório de cinco peles antes de
   escolher: linha e degrau saem do mesmo token, o degrau sai do preto (senão
   vira buraco em vez de degrau), e a tinta deixou de ser borda para ser só
   texto. Seletor em Configurações, com "seguir o sistema" como padrão.
4. ✅ **A animação da troca fechando** — feita em 2026-08-10 (`8139fb7`). Selo
   COMBINADA no aceite; giro das cartas e selo TROCADO só na conclusão.
5. ❌ **Filtro por bairro** na vitrine — **descartado em 2026-08-14, por decisão
   do Eduardo.** A premissa que o justificava era "quem tem essa carta perto de
   mim decide mais que preço", e ela não descreve como a troca acontece de fato:
   as pessoas trocam **nas lojas locais e em eventos**, não na esquina de casa. O
   ponto de encontro é escolhido pela agenda da comunidade, não pela distância
   entre dois endereços — e um filtro que corta o feed por bairro esconderia
   justamente quem vai estar na mesma loja no sábado.

   Fica valendo o que já existe: a `cidade` continua sendo o recorte, e o bônus
   de `+8 se mesmo bairro` no matcher segue no lugar. Vale saber que ele **nunca
   dispara hoje** — nenhuma tela pede bairro, então o campo é nulo para todo
   mundo. Não é defeito a consertar: é a mesma leitura que descartou o filtro,
   registrada aqui para ninguém "corrigir" o matcher achando que achou um bug.
6. ✅ **Alerta de carta** ("avise quando aparecer") — feito em 2026-08-12, junto
   da Fase B da monetização, onde está o detalhe (item 5 da
   [seção 16](#16-preparação-para-monetização)). Nasceu do vazio da vitrine, que
   é onde a pessoa descobre que ninguém tem a carta.
7. ❌ **Medir de onde vem a troca** — **descartado em 2026-08-14, por decisão do
   Eduardo.** A medição existia para responder uma pergunta só: se a vitrine
   fecha mais troca que o motor, e portanto se ela fica. **A vitrine fica**, e
   com a pergunta respondida por decisão a consulta perde a função.

   O evento do aceite continua guardando o id da proposta — ele não custa nada e
   é o que permitiria reabrir a conta no dia em que a pergunta voltar. O que não
   entra é a consulta, o painel e o trabalho de manter os dois.

   A escolha tem um custo que vale escrever: o app deixa de ter número para
   comparar os dois caminhos, e uma decisão futura sobre qual deles priorizar
   será tomada no olho. É aceitável agora porque a base é pequena demais para o
   número significar alguma coisa — com oito perfis, qualquer proporção é ruído.
8. ✅ **"Esqueci minha senha"** — código em 2026-08-12, **funcionando em produção
   desde 2026-08-14**, quando a configuração que faltava entrou e o fluxo foi
   percorrido inteiro: e-mail recebido em menos de um minuto, link abrindo o
   formulário e a senha trocada com a pessoa caindo logada no app. Era o único
   defeito do app sem contorno nenhum do lado de quem usa: senha perdida era
   conta perdida.

   Duas telas públicas. `/recuperar` pede o e-mail e dispara o
   `resetPasswordForEmail` com `redirectTo` montado a partir da **origem atual**
   — não fixo no build, porque o mesmo app roda em `localhost`, no IP da rede
   local durante os testes e no domínio de produção, e um endereço fixo mandaria
   quem pediu do celular cair no computador de quem programou. `/nova-senha` é o
   destino do link.

   **A tela de sucesso não confirma que a conta existe** ("se houver uma conta
   com esse e-mail…"), e e-mail desconhecido é tratado como sucesso: a mensagem
   honesta transformaria a tela num verificador de quem tem conta no TrocaTCG.

   **A `/nova-senha` confere a sessão antes de mostrar o formulário.** Link
   vencido, já usado ou aberto noutro navegador chega sem sessão; pedir a senha
   para só então dizer "esse link não vale" cobraria o trabalho antes de
   conferir se ele serve. É também a única tela do app com senha repetida — um
   erro de digitação ali tranca a pessoa de novo, e desta vez com o link gasto.

   Não depende de a confirmação de e-mail voltar: o clique no link prova o
   domínio da caixa naquele momento. O que fica descoberto é o e-mail digitado
   errado no cadastro, que continua sem caminho automático de volta.

   **O fluxo está quebrado em produção, e a medição é de 2026-08-14.** O Supabase
   não recusa um `redirect_to` fora da lista: ele responde 200 e usa a Site URL no
   lugar, calado. Dá para descobrir qual URL ele resolveu de fato no
   `auth_logs` — o campo `referer` da linha de `/recover` guarda a decisão —, e
   foi assim que se mediu, disparando `POST /auth/v1/recover` para um e-mail
   inexistente (não envia nada, não gasta cota) com uma origem diferente a cada
   vez:

   | `redirect_to` enviado | O que o Supabase usou |
   |---|---|
   | `https://trocatcg-web.onrender.com/nova-senha` | `http://localhost:3000` |
   | `https://trocatcg-web.onrender.com` | `http://localhost:3000` |
   | `http://localhost:5173/nova-senha` | ele mesmo |
   | `http://localhost:5173/qualquer` | ele mesmo |
   | `http://192.168.100.6:5173/nova-senha` | `http://localhost:3000` |
   | `https://trocatcg.com.br/nova-senha` | `http://localhost:3000` |

   Duas coisas, e a segunda é pior. Só `localhost:5173` está nas **Redirect
   URLs** — produção e o IP da rede local ficaram de fora. E a **Site URL do
   projeto continua sendo `http://localhost:3000`**, o default de fábrica que
   nunca foi trocado: hoje, quem pedir a recuperação em produção recebe um link
   apontando para uma porta que não existe na máquina dela. Vale para todo e-mail
   com retorno, não só este.

   Não aparece em teste local justamente porque `localhost:5173` funciona.

   **Consertado e provado ponta a ponta no mesmo dia.** A Site URL passou a ser
   `https://trocatcg-web.onrender.com` e as Redirect URLs ganharam
   `https://trocatcg-web.onrender.com/**`; medindo de novo, o pedido feito em
   produção resolve para `/nova-senha`, e a troca de senha foi feita até o fim —
   a pessoa cai logada no app, como a tela promete. Falta só
   `http://192.168.100.6:5173/**`, que é conveniência para testar do celular na
   rede local e não afeta ninguém de fora.

   Duas coisas que confundem no teste e não são defeito:

   - **O link vale uma vez.** Clicar de novo num e-mail antigo devolve
     `One-time token not found` no `auth_logs`, que se lê como falha do fluxo
     quando é o contrário — é o uso único funcionando. Pedido novo, e-mail novo.
   - **Abrir no navegador do celular está certo.** O token viaja no fragmento do
     endereço (`#access_token=`), então o link não depende de ter sido pedido
     naquele navegador. Um PWA instalado não recebe o link, e não precisa: o que
     muda é a senha da conta, não o aparelho.

   E o remetente padrão libera poucos e-mails por hora — o mesmo teto que
   estourou nos testes de cadastro —, o que torna **SMTP próprio um pré-requisito
   de verdade** para abrir aos usuários de teste, já que agora existe um segundo
   e-mail transacional disputando a mesma cota.

   **O plano do SMTP mudou em 2026-08-14, e o motivo é que o domínio não é
   nosso.** `trocatcg.com.br` está registrado por outra pessoa desde março de
   2025 (consultado no RDAP do registro.br) — o Resend com domínio verificado,
   que a seção 11.3 supunha, não é possível sem registrar outro nome. O caminho
   escolhido foi **remetente verificado por endereço**, sem domínio: a Brevo (ou
   a SendGrid) confirma um e-mail individual e passa a enviar por ele, com 300
   e-mails por dia no plano gratuito.

   O endereço importa, e a escolha é medida, não preferência. O `icloud.com`
   publica `p=quarantine` no DMARC: mensagem que se diga @icloud.com e não venha
   dos servidores da Apple cai no spam do destinatário — e quem perdeu a senha é
   quem menos vai procurar lá. `gmail.com` e `outlook.com` publicam `p=none` e
   passam. Daí um Gmail dedicado ao projeto ser o remetente, e não a caixa
   pessoal.

   Um passo some fácil e vale escrito: **ligar o SMTP não levanta o teto**. Em
   Authentication → Rate Limits, "Emails per hour" continua em 2 até ser
   aumentado à mão.

   Fica registrado que isto é uma solução de rodada de testes, não de
   lançamento: sem SPF e DKIM alinhados a um domínio próprio, a entregabilidade é
   pior do que seria. O dia de registrar um domínio resolve isso, o `VAPID_SUBJECT`
   e o endereço público dos termos de uma vez.
9. **Confirmação de número por WhatsApp** — o **backend ficou pronto e desligado
   em 2026-08-12**; falta o que não é código. Estão no lugar: a migração `26`
   (coluna `contato_verificado_em` em `profiles` e a tabela
   `phone_verifications`, com RLS e sem grant nenhum para o navegador — nem o
   dono lê), `services/verificacao_telefone.py` (código de 6 dígitos de
   `secrets`, só o SHA-256 gravado, validade de 10 minutos, 60 segundos entre
   envios, 5 mensagens por número em 24h, 5 tentativas por código, comparação
   por `compare_digest`), `services/whatsapp.py` (Cloud API da Meta, template de
   autenticação, número mascarado no log) e as rotas `/v1/me/telefone`,
   registradas e respondendo 503 enquanto `VERIFICACAO_TELEFONE_ATIVA` for
   falso. Quinze testes cobrem a regra com o recurso desligado, que é o que faz
   o dia de ligar ser uma linha de ambiente.

   **Os limites moram no serviço, não no slowapi**, de propósito: o rate limit
   global não roda (item 1 do bloco de segurança) e, mesmo rodando, conta
   requisição por IP — o que precisa ser contado aqui é mensagem por número,
   porque cada uma custa dinheiro e queima cota na Meta.

   O que falta, em ordem: chip dedicado (o número registrado sai do WhatsApp
   comum), conta Meta Business com a verificação de negócio pedida — ela leva
   dias e corre sozinha —, template de autenticação aprovado, a tela de digitar
   o código, e ligar o pedido **no primeiro aceite de troca**, que é quando o
   número é revelado e quando a pessoa já tem motivo para completar. O item 1 da
   segurança continua sendo pré-requisito de ligar, não de construir.

**Segurança do app** — varredura de 2026-08-11 sobre API, banco, PWA e CI.
Decisão do Eduardo no mesmo dia: **este bloco é o último da fila, e fecha antes
de o app ir para os usuários de teste** — nada aqui bloqueia o trabalho de
produto que vem antes. A lista está em ordem de gravidade para ser atacada nessa
ordem quando a vez chegar. Uma ressalva que não é de segurança e por isso não
espera junto: o item 2 tem duas metades, e a metade do backup quebrado é perda
de dados hoje, com ou sem usuário no app.

1. ✅ **O rate limit não rodava** — resolvido em 2026-08-16, e a história vale
   mais que a correção.

   **O defeito original.** `main.py` criava o `Limiter` do slowapi com
   `default_limits` de 100/minuto, guardava em `app.state` e registrava o handler
   do 429 — mas nunca adicionava o `SlowAPIMiddleware`, e nenhuma rota usava
   `@limiter.limit`. Sem esse middleware o `default_limits` não vale, e o objeto
   existia sem contar nada. Medido em 2026-08-11: 120 chamadas em um minuto, 120
   respostas 200.

   **A correção óbvia não funcionou, e esse é o ponto.** Adicionado o middleware,
   a medição repetida deu 310 chamadas a `/v1/planos` em 0,4 segundo e 310
   respostas 200. O `SlowAPIMiddleware` descobre qual rota está sendo chamada
   varrendo `app.routes` atrás de um objeto com `.endpoint`, e **libera a
   requisição quando não acha** (`_should_exempt` devolve `True` para handler
   nulo). A partir do **FastAPI 0.140**, `include_router` não achata mais as
   rotas: cada inclusão vira um `_IncludedRouter` que guarda os caminhos sem o
   prefixo e resolve o casamento por conta própria. Nenhuma rota é encontrada,
   todas são tratadas como isentas — o mesmo defeito, numa forma nova e mais
   difícil de ver, porque agora a linha do middleware está lá.

   **O freio passou a ser escrito no projeto**, em `core/limitador.py`, sobre a
   `limits` — a biblioteca que o próprio slowapi usa por baixo. São quarenta
   linhas que não dependem de como o FastAPI monta a tabela de rotas, e essa
   independência é a decisão: a forma mudou uma vez e pode mudar de novo. O
   slowapi saiu das dependências.

   **A chave é a pessoa, não o endereço.** Contar por IP seria errado exatamente
   no dia que mais importa: o lançamento é um evento numa loja, com dezenas de
   pessoas no mesmo Wi-Fi e no mesmo IP público. Um balde por IP transformaria
   quarenta pessoas cadastrando cartas num cliente só estourando o limite, e o
   app cairia na frente de todas elas por causa de uma proteção contra abuso. O
   mesmo vale para o CGNAT das operadoras. Quem tem sessão é contado pelo `sub`
   do token, lido **sem validar assinatura** — forjar token não dá acesso a nada
   (quem valida é `usuario_atual`, com o JWKS), e o único ganho seria escapar do
   próprio balde, coisa que trocar de IP já permite.

   **O teto é 300 por minuto**, e não os 100 de antes. Estrear a proteção no
   número antigo seria estreá-la apertada: o feed, o acervo e a vitrine disparam
   várias requisições por abertura de tela. O alvo é raspagem — varrer a vitrine
   ou `/u/{username}` para montar uma base de contatos —, não uso intenso.

   **`/v1/health` é a única rota isenta**, e por caminho, não por decorador: é o
   que o Render consulta para decidir se o serviço está vivo, e um 429 ali não
   seria um pedido recusado, seria o deploy derrubado. As rotas internas seguem
   limitadas (o cron as chama poucas vezes por dia) e o receptor do Mercado Pago
   também — uma rajada dele que estourasse o teto receberia 429 e seria
   reenviada, comportamento que a idempotência de `webhook_events` já cobre.

   Verificado contra a API rodando, do mesmo jeito que o defeito foi descoberto:
   320 chamadas em 0,4 segundo, **300 respostas 200 e 20 respostas 429**; e 120
   chamadas a `/v1/health`, 120 respostas 200.

   **O teto é remendo, e o Eduardo apontou isso em 2026-08-16: a causa é o número
   de requisições por tela.** Um app que pede pouco não encosta em teto nenhum, e
   aí o freio volta a ser o que deveria ser — uma rede que só quem está raspando
   encontra. Enquanto as rotas não são enxugadas, 300 por minuto é folga
   suficiente para ninguém tropeçar. Fica como trabalho futuro, sem data: medir
   quantas requisições cada tela dispara e cortar as que existem só porque é mais
   fácil pedir de novo do que reaproveitar o que já veio.
2. ✅ **Backup quebrado, e o destino dele era público** — feito em 2026-08-11
   (`9ef33e1`), fora da ordem do resto do bloco porque não era sobre proteger
   usuário: era o trabalho sem cópia desde 07/08. Eram duas coisas que se
   agravavam juntas. O workflow falhava todo dia — cinco execuções seguidas com
   `pg_dump: aborting because of server version mismatch` (servidor 17.6,
   cliente 16.14): o passo instalava o client 17 do PGDG, mas o binário fica em
   `/usr/lib/postgresql/17/bin`, fora do PATH, e `pg_dump` seguia resolvendo
   para o 16 do sistema. O diretório passou a entrar no `GITHUB_PATH`. A outra
   metade era o destino: artifact do Actions num repositório **público** é
   baixável por qualquer um, e o dump traz o `contato_visivel` de toda a base e
   os e-mails da `auth.users` — consertar o cliente sem mexer no destino teria
   publicado a base no primeiro backup que desse certo. Agora o dump é cifrado
   com AES256 simétrico antes do upload, com a senha no secret
   `BACKUP_PASSPHRASE` e entrando por stdin, e sem esse secret o job falha
   antes de gerar dump nenhum. Verificado com um disparo manual: `pg_dump`
   17.10, artifact `backup.dump.gpg` de 1,8 MB, pacote OpenPGP tag 3 com cifra
   9 (AES256) e nenhum `PGDMP` legível no arquivo.

   O que sobra desta linha é operacional, e é do Eduardo: a senha não existe em
   lugar nenhum além do secret e de onde ele a guardou — se ela se perder, os
   backups viram lixo cifrado. Vale provar a restauração uma vez, num banco
   descartável, antes de precisar dela num dia ruim.
3. ✅ **Quem foi bloqueado continua agindo** — resolvido em 2026-08-16.

   `bloqueado` só filtrava listagem: perfil público, vitrine, acervo, matcher e
   demanda. Não havia checagem na autenticação nem nas escritas, então quem foi
   bloqueado continuava criando anúncio, abrindo proposta, aceitando match e
   denunciando. **Invisível, não impedido** — e invisível é a pior das duas,
   porque o outro lado da troca não vê com quem está lidando.

   **A trava ficou em `usuario_atual`, e não numa dependência aplicada às rotas
   de escrita**, por causa de como as duas falham. São mais de vinte rotas que
   escrevem; marcar uma a uma significa que esquecer uma abre um buraco
   silencioso — exatamente o defeito que este item existe para fechar. Invertendo
   (todos barrados, exceções se declaram), esquecer passa a ser seguro: rota nova
   nasce fechada. Um teste varre os routers e quebra se aparecer uma terceira
   exceção.

   Custa uma consulta por requisição autenticada, indexada pela chave primária —
   ruído perto das trinta que o feed já faz sozinho.

   **Duas rotas seguem abertas**, e nenhuma por conveniência. `GET /me`, porque
   quem foi bloqueado precisa poder descobrir isso: um app que só para de
   funcionar empurra a pessoa a criar uma segunda conta, que é o oposto do que o
   bloqueio quer. E `DELETE /me`, porque apagar os próprios dados é direito da
   LGPD, não recompensa por bom comportamento — condicioná-lo transformaria uma
   punição de comunidade em retenção de dado pessoal.

   **403, e não 401.** A sessão é válida e a pessoa é quem diz ser; o que não
   vale é o que ela quer fazer. Um 401 mandaria o app derrubar a sessão e pedir
   login, o login funcionaria, e a pessoa entraria num laço de entrar e ser
   deslogada sem nunca ler o motivo.

   **Conta sem perfil passa.** Quem criou a conta e ainda não completou o
   cadastro não tem linha em `profiles`; barrar ali trancaria justamente a tela
   de completar cadastro. Só bloqueio explícito barra.

   Do lado da tela, `bloqueado` entrou no `PerfilOut` — só para o dono, porque no
   perfil público seria delação — e Configurações mostra o aviso com o que ainda
   é possível fazer. Sem esse campo, manter `GET /me` aberto não serviria para
   nada: a pessoa veria o próprio perfil normal e concluiria que o app quebrou.
4. ✅ **`/docs` e `/openapi.json` abertos em produção** — fechados em 2026-08-16.
   O contrato inteiro, incluindo `/internal/jobs/*`, era o mapa que o atacante
   não precisaria levantar sozinho — e o `/docs` ainda dava o botão de disparar
   cada rota. Some por ambiente: `docs_url`, `redoc_url` e `openapi_url` viram
   `None` quando `ENVIRONMENT` é `production`, e a raiz para de anunciar `/docs`
   (endereço anunciado que responde 404 diz que existe algo ali).

   **Some a rota, não o documento.** `app.openapi()` continua funcionando, e é
   dele que os testes leem o contrato para provar coisas como "o feed não
   serializa contato". Fechar apagando o documento derrubaria essas provas
   justamente no ambiente que importa.
5. ✅ **`JOB_SECRET` tinha default no repositório** — resolvido em 2026-08-16.
   Era `dev-job-secret`, em `config.py`: bastava a variável faltar num ambiente
   novo para as rotas internas abrirem com um segredo publicado aqui. O default
   passou a ser vazio, e vazio recusa tudo com **503** — não é que o pedido está
   errado, é que o servidor não está em condição de atender.

   A comparação virou `secrets.compare_digest`. `!=` devolve no primeiro byte
   diferente, e essa diferença de tempo permite adivinhar o segredo byte a byte;
   a regra já valia no webhook do Mercado Pago e no código do WhatsApp, e
   faltava aqui.
6. ✅ **PWA sem Content-Security-Policy** — resolvido em 2026-08-16. A sessão do
   Supabase mora em `localStorage`, então um XSS não vaza uma tela: leva a conta
   inteira. Não há injeção conhecida (nem `dangerouslySetInnerHTML`, nem
   `innerHTML`, nem `eval` no `web/src`), e é justamente por isso que a rede
   valeu a pena agora, enquanto é barata.

   **`script-src` sem `'unsafe-inline'`**, com o script do tema autorizado por
   hash. Ele precisa ser inline — roda antes da primeira pintura, senão volta o
   flash branco no modo escuro — e liberar todo inline para acomodar um script
   desligaria a proteção inteira.

   **`style-src` com `'unsafe-inline'`**, e a assimetria é deliberada: o React e
   o motion escrevem `style=` em elemento, que o CSP trata como estilo inline.
   Sem isso, toda animação e todo estilo calculado somem. CSS injetado é
   problema de aparência; script injetado é a conta da pessoa.

   **O hash falha calado, então o CI confere.** Mudar o script do tema sem
   trocar o hash não quebra o app: o navegador bloqueia, e só volta o flash
   branco — meses depois, sem ninguém ligar uma coisa à outra. É o mesmo formato
   do rate limit que passou um mês inerte. `npm run conferir:csp` recalcula e
   quebra o CI dizendo qual é o hash novo.

   Uma armadilha que custou uma falsa falha na primeira execução: o script lê
   normalizando CRLF para LF. O repositório guarda o `index.html` em LF
   (`git ls-files --eol` diz `i/lf w/crlf`), a cópia no Windows fica em CRLF, e
   o SHA-256 muda inteiro com uma quebra de linha diferente — o verificador
   acusaria erro no Windows e passaria no Linux, que é onde o hash de verdade é
   construído.
7. ✅ **Miúdos** — resolvidos em 2026-08-16. `bairro` e `avatar_url` entravam sem
   limite de tamanho e sem validação, e o `avatar_url` é servido a terceiros no
   perfil público — o que a pessoa escreve ali é renderizado no navegador de
   outra. Os dois ganharam `max_length`, e o `avatar_url` passou a exigir
   `https://`: `javascript:` e `data:` com SVG são execução, não imagem, e
   `http://` é conteúdo misto. Nenhum tem uso legítimo — toda hospedagem de
   imagem serve por HTTPS. (A parte das policies saiu inteira em 2026-08-11:
   `24_notificacoes.sql` para `notifications` — `for select`, `revoke all` de
   `anon` e `authenticated`, `grant select` só para quem está logado — e
   `25_push_subscriptions.sql` para `push_subscriptions`, que perdeu o `for all`
   e todos os grants: ali o frontend não lê nada, quem escreve é a API.) E o
   evento de furo monta JSON com f-string em
   `matching.py`; o valor é um uuid vindo do banco, então não é explorável, é
   só frágil.

8. ✅ **A camada do banco, exercitada em vez de lida** — 2026-08-18. Item que não
   estava na varredura de 11/08 porque aquela varredura leu os arquivos; este
   saiu de rodar consulta com JWT de gente de verdade contra o banco de
   produção, e achou duas coisas que a leitura não acharia.

   **As policies do match recursavam infinito, desde julho.** A policy
   "ve propria participacao" protegia `match_participants` com uma subconsulta na
   própria `match_participants`; avaliá-la exigia avaliá-la de novo. Qualquer
   `select` pela anon key nas três tabelas do match respondia
   `infinite recursion detected in policy for relation "match_participants"` —
   e as outras duas policies caíam junto, porque as duas consultam
   `match_participants` para saber quem participa. Nada quebrou em produção
   porque nenhuma tela lê essas tabelas direto; a consequência é que **a rede de
   segurança que o `09_rls.sql` promete nunca existiu ali** — era um erro 500, e
   erro 500 é proteção por acidente. Corrigido no `32_rls_do_match_sem_recursao.sql`
   com uma função `security definer` que quebra o laço, e conferido nos três
   casos: participante vê o próprio match, quem não participa vê zero, `anon` vê
   zero.

   **Seis tabelas antigas ainda tinham `grant all` para `anon` e
   `authenticated`.** O `11_grants.sql` fechou `profiles` e `listings`, e todo
   arquivo posterior nasceu fechado — mas `cards`, `matches`,
   `match_participants`, `match_items`, `match_events` e `term_acceptances` são
   de julho e ficaram com o INSERT/UPDATE que o Supabase concede por padrão.
   Medido: a escrita era recusada, porque as policies do 09 são todas
   `for select` e tabela com RLS ligado e sem policy de escrita não aceita
   escrita. Ou seja, um buraco fechado por uma única camada — e a frágil, já que
   três policies deste mesmo schema são `for all` e trocar `for select` por
   `for all` numa dessas seis é uma edição de um segundo. Fechado no
   `31_grants_das_tabelas_antigas.sql`, que aproveita e inverte a causa: o
   `default privileges` de `public` deixou de conceder tudo, então **tabela nova
   nasce fechada** — a mesma inversão que o `core/auth.py` fez com o bloqueio de
   conta.

   O linter do Supabase, junto, parou de acusar `normaliza_busca` sem
   `search_path` fixo. Sobraram nele três INFO que são decisão declarada
   (`match_events`, `phone_verifications` e `webhook_events` têm RLS e nenhuma
   policy de propósito) e dois WARN que não são código: `pg_trgm` no schema
   `public`, que mover custa reconstruir os índices da busca por ganho nenhum, e
   a proteção contra senha vazada do Auth, que é um interruptor do painel.

9. ✅ **Pentest e hardening completos** — 2026-08-18, no mesmo dia e como
   continuação do item 8. **O relatório inteiro está em
   [`docs/SEGURANCA.md`](SEGURANCA.md)**: superfície, modelo de ameaças, os nove
   achados no formato longo, testes de regressão e riscos residuais. O que vale
   repetir aqui é só o que muda a decisão de quem lê esta seção.

   **Dois HIGH, e os dois eram de estado, não de injeção.** `responder` gravava o
   status do match sem olhar o status anterior: dava para ressuscitar uma troca
   `EXPIRADO` e para apagar do histórico uma `CONCLUIDO` mantendo os pontos de
   reputação que ela creditou. E `confirmar_conclusao` era uma corrida — dois
   cliques simultâneos creditavam +2 em `trocas_concluidas` e baixavam o estoque
   duas vezes. Os dois estão fechados, com guarda de estado no `update` e uma
   trava de linha em `_status_do_participante` que serializa os quatro desfechos
   (concluir, desistir, furar, prorrogar) de uma vez só.

   **A fronteira que faltava estar escrita: autenticação não é nossa.** Login,
   cadastro e recuperação falam direto com o Supabase, sem passar pela API — e
   portanto sem passar pelo rate limit, pelos logs e pelas regras daqui. Não é
   defeito; é o desenho. Mas a doc dava a entender que o freio cobria o app
   inteiro, e não cobre. Três ajustes ficaram no painel do Supabase, listados no
   §5 do relatório — entre eles o mínimo de senha, que hoje é conferido só no
   cliente e por isso não é conferido.

   **A lição de método, de novo, e é a mesma do item 7.** A varredura de 11/08
   leu os arquivos; esta rodou o sistema. Toda a diferença entre as duas listas
   veio daí. O que passou a rodar sozinho para não depender disso: o ruleset `S`
   do ruff (bandit) no `ruff check` que já existia — e que achou um ponto real na
   primeira execução —, `pip-audit --strict` no backend e `npm audit` no que vai
   para o navegador.

   Um risco fica **declarado e não resolvido**: a enumeração de e-mail no
   cadastro. A mensagem da tela foi neutralizada, mas a causa é a confirmação de
   e-mail estar desligada, e quem chamar o Supabase direto continua distinguindo
   "já existe" de "criado". O front não é a fronteira. Fechar isso é o mesmo
   interruptor que fecha o account squatting, e o custo é o funil do cadastro —
   decisão de produto, registrada em R-1 do relatório.

O que a varredura confirmou que está bem, para não se perder no meio da lista:
a validação do JWT lida pelo JWKS e imune à confusão de algoritmo; o grant por
coluna que tira `contato_visivel` do alcance da anon key; o contato revelado só
em `ACEITO`/`CONCLUIDO` e sempre depois de conferir participação; RLS ligado em
todas as tabelas, inclusive nas criadas depois do 09 — com a ressalva do item 8,
que é a diferença entre estar ligado e estar segurando; SQL sempre parametrizado,
com as interpolações restritas a constantes internas; `.env` nunca commitado; o
`bulk` travado em 300 itens; e o antiabuso de propostas por dia ativo desde o
começo.

**Planos pagos** — decidido e detalhado na
[seção 16](#16-preparação-para-monetização): FREE com 20 ofertas, PRO ilimitado
a R$ 19,90/mês ou R$ 199,90/ano, sem destaque pago. A Fase A está commitada e
desligada (`925fe9d`). A **Fase B saiu em 2026-08-12**: cadastro em massa e
alerta de carta funcionando, e o motor triangular pronto e desligado esperando a
tela de três pontas.

**A ordem mudou em 2026-08-13, por decisão do Eduardo: a triangulação sai da
frente da cobrança e vai para depois da abertura aos usuários.** A Fase C começou
sem ela — a tela de planos, o estado do plano e o convite estão no ar (item 8 da
seção 16), com `COBRANCA_ATIVA` ainda falso.

Isso muda uma coisa que a doc afirmava: a Fase B deixou de ser pré-requisito de
*construir* a Fase C, mas continua sendo pré-requisito de **ligar** a cobrança. A
tabela do PRO vende "match triangular", e cobrar por ele antes de a tela de três
pontas existir seria vender o que não se entrega. Por isso a linha aparece como
**"em breve"** na comparação, e a virada de `COBRANCA_ATIVA` continua depois da
triangulação — não antes.

**A Fase C está fechada em código desde 2026-08-14.** O **item 7 saiu em
2026-08-13** — o backend do Mercado Pago inteiro, construído e desligado: rotas
de assinatura, receptor de webhook com validação HMAC, carência de 7 dias e job
diário de reconciliação. Em **2026-08-14** ele entrou em produção (migração
aplicada, código no ar, webhook cadastrado e validando de verdade), e no mesmo
dia entraram os itens 9 e 10: a cláusula da assinatura nos termos, com a `VERSAO`
subida nos três lugares, e a segunda metade da queda de plano — a desativação dos
excedentes, da oferta mais recente para a mais antiga, com aviso na caixa.

O que falta para **cobrar** não é código, é painel: ativar as credenciais de
produção, criar os dois planos com elas e preencher as três variáveis que
sobraram no Render. E a virada de `COBRANCA_ATIVA`, que continua atrás da
triangulação.

Duas dívidas conhecidas ficaram registradas em vez de escondidas: o **novo
aceite** dos termos, que a seção 8 do próprio texto promete e que só se paga
quando houver cliente pagante, e o **rate limit** (item 1 da segurança), que é
pré-requisito de expor o receptor do webhook a sério.

**Cadastro sem verificação** — decisão do Eduardo em 2026-08-12. A confirmação
de e-mail sai (interruptor "Confirm email" do painel do Supabase, fora do
código), e **nenhuma verificação de número entra por enquanto**. O código
aguenta os dois estados sem mudança: sem confirmação o `signUp` volta com
sessão, o `if (data.session)` de `Entrar.tsx` manda direto para o app e a tela
`ConfirmeEmail` fica dormente — ela volta sozinha se o interruptor for religado.

O que isso custa hoje é nada: não existe fluxo de "esqueci minha senha" no app,
então o e-mail é só o login. Quando a recuperação subir (item 8), ela funciona
sem a confirmação de volta — o clique no link prova a caixa naquele momento. O
que fica descoberto é só o e-mail digitado errado, que vira caso de suporte.

**Revertido em 2026-08-21: a confirmação de e-mail voltou.** A decisão foi do
Eduardo, ao perguntar se dava para lançar sem a verificação de número. Dá — o
item 5 não trava nada, e nenhuma tela o chama —, mas as duas coisas não se
substituem: e-mail prova a **caixa**, e o que a troca usa é o **WhatsApp**. O que
a volta compra é o R-1 da `docs/SEGURANCA.md` (enumeração e squatting), e o que
custa é um passo a mais no cadastro — inclusive no dia do lançamento-evento, com
gente abrindo o e-mail no celular ali mesmo.

O que entrou junto, porque o estado ligado nunca tinha tido tela: `emailRedirectTo`
no `signUp` (montado da origem atual, como na recuperação de senha), a tela
"Confirme seu e-mail" com o endereço por extenso e um reenviar, a volta do link
tratada por evento `SIGNED_IN`, e a leitura do fragmento de erro para quem clica
num link vencido. Detalhe em `web/src/lib/confirmacao.ts`.

Três coisas medidas contra a API no dia, e não lidas na documentação: o
`redirect_to` é respeitado nos dois ambientes (`auth_logs`); o intervalo entre
dois envios é de **15 segundos**, não de uma hora — a frase do `authMensagens.ts`
mandava esperar uma hora e foi corrigida para repetir o número que o Supabase
manda; e o segundo cadastro no mesmo endereço **não** troca a senha nem o
metadata do primeiro, o que muda a forma do squatting (ver R-1).

**Histórico — feito em 2026-08-12.** O interruptor foi desligado no painel e a
tela `ConfirmeEmail` saiu do `Entrar.tsx` junto — cadastrar devolvia sessão e a
pessoa entrava direto. Verificado contra a API do Supabase com contas
descartáveis, apagadas em seguida: antes o cadastro voltava sem sessão e com
`confirmation_sent_at`; depois, com `access_token` no corpo.

Ficou uma guarda no lugar do desvio: `signUp` sem sessão passa a virar mensagem
("Conta criada. Confirme seu e-mail e volte para entrar.") em vez de tela
parada. Ela existe para o dia do item 8 — se a confirmação voltar, o pior
desfecho possível é a pessoa preencher tudo e a tela não dizer nada.

Duas coisas que a operação deixou aparecendo: o remetente padrão do Supabase
libera **2 e-mails por hora** (a cota estourou com três cadastros de teste), o
que teria quebrado qualquer rodada de testes com usuários reais — e é motivo
para SMTP próprio no dia em que o e-mail voltar a ser enviado. E resta uma conta
de 2026-07-30 que nunca confirmou o e-mail: ela não tem perfil e continua sem
conseguir entrar, porque o Supabase segue exigindo confirmação de quem já
nasceu esperando por ela.

**O login continua sendo e-mail e senha.** A troca por número de celular foi
levantada em 2026-08-14 — o número já é o que importa no app, e o e-mail é
burocracia — e descartada no mesmo dia, por três razões que só aparecem no
código:

- **A cobrança quebraria.** O `preapproval` do Mercado Pago exige `payer_email`,
  e ele sai de `auth.users.email` (`services/assinaturas.py`). Sem e-mail no
  cadastro não há o que mandar, e o e-mail voltaria pela porta dos fundos na
  tela de assinar.
- **O Supabase não fala com o WhatsApp que este projeto tem.** Login por
  telefone exige provedor de SMS (Twilio, MessageBird, Vonage); a Cloud API da
  Meta em `services/whatsapp.py` verifica contato, não autentica. O login
  passaria a depender do chip, da conta Meta verificada e do template aprovado —
  a lista inteira do item 9.
- **Cada entrada custaria dinheiro.** OTP por SMS no Brasil sai por volta de
  R$ 0,10–0,30; e-mail é grátis e ilimitado na prática.

O que fica: o número segue sendo o que o app entrega — revelado no aceite mútuo
— e a verificação por WhatsApp entra quando o chip existir. A decisão pode ser
reaberta depois disso, quando der para medir se vale.

A verificação de WhatsApp por código está **construída e desligada** desde
2026-08-12 — o que existe e o que falta está no item 9. Três decisões que
valem para quando ela for ligada: ela é da **Cloud API da
Meta**, não de biblioteca não oficial (número que manda mensagem automática para
desconhecido é banido, e a falha é silenciosa — o código para de chegar e o
cadastro morre sem erro em lugar nenhum); ela exige **chip dedicado**, porque um
número registrado na plataforma sai do WhatsApp comum; e o pedido do código não
fica no cadastro, fica **no primeiro aceite de troca** — que é quando o número é
revelado, quando a pessoa já tem motivo para completar, e quando se paga
mensagem só por quem troca de verdade. O pré-requisito é o item 1 do bloco de
segurança: endpoint que dispara mensagem paga sem rate limit é torneira aberta,
tanto para o saldo quanto para o limite diário da Meta.

**O que a passagem de 21/08 achou** — com a fila de código quase vazia, o
caminho crítico foi percorrido **contra a produção**, e não contra os dublês:
duas contas descartáveis (`@trocatcg.invalid`, criadas pela Admin API com o
e-mail já confirmado), o fluxo inteiro pela API — perfil, anúncios, match,
aceite dos dois lados, contato, conclusão, reputação, notificações, vitrine,
proposta — e depois o mesmo caminho pela tela, no navegador. Vinte e nove
verificações da API passaram, e a tela fez o aceite, revelou o contato e
confirmou a conclusão sem erro de console.

Duas coisas quebradas apareceram, e nenhuma delas era achável por leitura:

1. **Apagar a conta respondia 500** — o direito da LGPD, marcado como pronto no
   Apêndice C desde 14/08 porque tinha sido conferido no código. Duas chaves
   apontam sem `ON DELETE` para coisas que a própria exclusão derruba:
   `term_acceptances.match_id → matches` e `propostas.vez_de → profiles`. A
   primeira quebra em quem **revelou um contato**, a segunda em quem
   **negociou** — ou seja, as duas telas que mais provam que a pessoa usou o app
   eram as que a impediam de sair dele. Uma conta recém-criada apagava sem
   reclamar, e foi por isso que o item passou. Corrigido no `db/schema/34`
   (o aceite passa a soltar o match com `set null`, preservando o registro legal
   de quem fica) e em `profiles.excluir_conta`, que agora apaga as propostas
   antes dos matches. Provado nas duas pontas: com a FK velha, quatro contas de
   teste responderam 500; depois da migração e da ordem nova, 204.
2. **A troca concluída chegava marcada como "sua vez"** — `MATCH_CONCLUIDO`
   servia aos dois desfechos da confirmação ("falta você" e "os dois
   confirmaram"), e a caixa destaca o que pede ação lendo só o tipo. A última
   linha do fluxo, quando não falta nada a ninguém, pedia ação. Separado em
   `MATCH_CONFIRME` (pedido) e `MATCH_CONCLUIDO` (notícia); os dois continuam
   vibrando o celular.

A lição de método é a mesma que o bug do aceite deixou em 21/08: **item de
checklist conferido no código não está conferido.** O que os dois tinham em
comum é que a suíte cobria o caminho bom de uma conta nova e o caminho ruim
inteiro — e não o caminho bom de uma conta que já tinha vivido.

**Esperando o olho do Eduardo** — três coisas subiram sem ele ter visto rodando,
e nenhuma é bug conhecido; são julgamentos visuais:

- **O azul da marca escura.** `marca-escura.svg` usa `#1F4FFE`, que foi o azul
  que o Figma escolheu para fundo escuro. A interface voltou a `#0038ff` (o
  mesmo do claro), e os dois azuis ficaram levemente diferentes lado a lado.
  Saídas: aceitar, editar o SVG, ou levar a interface para `#1F4FFE`.
- **O próprio `#0038ff` no escuro.** Ele é mais legível que o azul clareado
  para o texto branco em cima (6,98:1 contra 4,52:1), mas separa menos a peça
  do papel escuro (2,82:1 contra 4,35:1) — o que só não é problema porque toda
  peça carrega borda de 2px. Se fechar demais na tela do celular à noite,
  voltar é uma linha.
- **A selagem da troca** (`8139fb7`), commitada antes da aprovação visual.

**Divulgação e lançamento**

10. ✅ **Página "Como instalar"** (`/instalar`) — feita em 2026-08-12. Pública,
    fora do `LayoutApp`, porque é o link para colar no grupo e quem chega por
    ele ainda não tem conta. Ela abre com a palavra que a pessoa vai procurar
    ("Baixar o TrocaTCG") e diz na primeira linha que não há loja onde procurar.
    Os três caminhos ficam escritos — iPhone, Android e computador —, com o
    detectado por `navigator.userAgent` na frente e marcado como "é o seu": um
    detector errado numa página de ajuda deixaria a pessoa sem a única instrução
    que ela veio buscar, e metade das vezes alguém lê isto no computador para
    dizer ao outro o que tocar no celular. Cada passo traz o **glifo** que a
    pessoa vai procurar na tela (o quadrado com a seta do Compartilhar, os três
    pontos do Chrome), desenhado na língua do mundo — nome de menu sem o desenho
    obriga a caçar. No Android, quando o Chrome oferece o `beforeinstallprompt`,
    um botão "Instalar agora" dispara o convite ali mesmo; o ouvinte mora em
    `web/src/lib/instalacao.ts` e é carregado pelo `main.tsx`, porque o evento
    chega uma vez só, logo na abertura, e quem assina depois não recebe nada.
    Quem já está com o app instalado não vê passo a passo nenhum: a tela vira
    confirmação e manda ligar os avisos. É esse o motivo de a página existir
    agora — desde o Web Push (2026-08-11), no iPhone **instalar é a condição
    para o aviso chegar**, e a linha "Avisos no celular" de Configurações deixou
    de repetir a instrução apertada e virou porta para cá.
11. **Imagem de compartilhamento** (Open Graph, 1200×630) e `twitter:card`. O
    `index.html` não tem nenhuma das duas: hoje um link do app colado no
    WhatsApp aparece sem imagem.
12. **Capturas no manifesto** (`screenshots`, com `form_factor` estreito e
    largo). É o que o Chrome mostra na caixa de instalação do Android, e hoje
    está vazio.
13. **Peças de divulgação**: a vitrine, uma troca fechando e a comparação de
    planos. Quando a animação estiver escolhida, um GIF da troca fechando é a
    melhor peça que este app tem para mostrar.

### Depois da v1 — em ordem de prioridade

1. Ajuste dos pesos de score com base em dados reais de conclusão
2. Ponto de encontro sugerido (loja parceira)
3. Segundo jogo (Lorcana) — só após base estável acima de 500 usuários ativos
4. Scanner de carta por câmera

---

## 18. Setup do ambiente

### Backend

```bash
# Instalar uv
curl -LsSf https://astral.sh/uv/install.sh | sh

mkdir trocatcg-api && cd trocatcg-api
uv init
uv add fastapi "uvicorn[standard]" sqlalchemy asyncpg alembic \
       pydantic pydantic-settings python-jose httpx pywebpush slowapi
uv add --dev pytest pytest-asyncio ruff httpx

# Migrations
uv run alembic init -t async migrations
uv run alembic revision --autogenerate -m "schema inicial"
uv run alembic upgrade head

# Rodar
uv run uvicorn app.main:app --reload
```

**Estrutura:**

```
app/
├── main.py
├── core/
│   ├── config.py        # Settings via pydantic-settings
│   ├── auth.py
│   ├── limites.py
│   ├── deps.py
│   └── errors.py        # exceções de domínio + handler
├── db/
│   ├── session.py
│   └── models/
├── schemas/             # Pydantic (entrada e saída)
├── routers/
│   ├── auth.py
│   ├── cards.py
│   ├── listings.py
│   ├── matches.py
│   ├── users.py
│   ├── reports.py
│   ├── legal.py
│   ├── notifications.py
│   └── internal.py
├── services/            # regra de negócio
├── matching/
│   ├── direto.py        # SQL
│   ├── triangular.py    # grafo
│   └── scoring.py
└── jobs/
    ├── sync_catalog.py
    ├── recompute.py
    └── notify.py
```

**Variáveis de ambiente (`.env`):**

```
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
TCGDEX_BASE_URL=https://api.tcgdex.net/v2
TCGDEX_IDIOMA=pt
RESEND_API_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
JOB_SECRET=...
CORS_ORIGINS=https://trocatcg.com.br
TERMOS_VERSAO=2026-07-01
ENVIRONMENT=development
```

### Frontend

```bash
npm create vite@latest trocatcg-web -- --template react-ts
cd trocatcg-web
npm i @tanstack/react-query react-router-dom zustand zod \
      @supabase/supabase-js
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa
npm run dev
```

### Deploy

**API (Render):** conecte o repositório, runtime Python, comando de start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Cadastre as variáveis de ambiente no painel.

**Obrigatório antes de considerar o deploy pronto:** ativar o workflow de keep-alive. Sem ele, a API hiberna em 15 min e o projeto Supabase pausa em 7 dias.

**Frontend (Cloudflare Pages):** conecte o repositório, build `npm run build`, output `dist`.

**Cron (GitHub Actions):**

```yaml
# .github/workflows/jobs.yml
name: Jobs agendados
on:
  schedule:
    - cron: '0 9 * * *'      # 06:00 BRT — triangular
    - cron: '*/15 * * * *'   # notificações
jobs:
  executar:
    runs-on: ubuntu-latest
    steps:
      - name: Recomputar matches
        run: |
          curl -X POST "${{ secrets.API_URL }}/v1/internal/jobs/triangular" \
               -H "X-Job-Secret: ${{ secrets.JOB_SECRET }}" \
               --fail
```

---

## 19. Testes e CI/CD

### Os comandos que valem, e um que mente

**Frontend: `cd web && npm run build`.** É o único que confere tipo, e é o que o
Render roda.

**`npx tsc --noEmit` dentro de `web/` não confere nada.** O `tsconfig.json` de lá
é arquivo de **referências de projeto**, sem `files`: o comando termina com
sucesso sem olhar uma linha. O build de verdade é `tsc -b && vite build`.

Isto custou caro em 2026-08-25. Três mudanças de tela foram anunciadas como "no
ar" apoiadas nesse typecheck falso, enquanto o deploy falhava com
`src/routes/LabPlanos.tsx(158,10): error TS2741: Property 'eFundador' is
missing` e o site seguia servindo o build anterior por uma hora e vinte. Quem
percebeu foi o Eduardo, olhando o app: "a logo não está centralizada".

**Um typecheck que sempre passa é pior que nenhum** — ele produz confiança e
some com o sinal.

Duas armadilhas de vizinhança que vieram no mesmo episódio:

- **O filtro de caminho do Render esconde a falha.** O site só constrói quando o
  commit toca `web/**`, e a API quando toca `api/**`. Depois do build quebrado,
  três commits de `docs/` passaram sem nova tentativa, e o deploy podre ficou
  parado sem emitir novo erro.
- **Quem espelha a tela também muda.** `LabPlanos.tsx` reusa o componente de topo
  da `Planos.tsx`. Mudar a prop de um sem o outro quebra o build — e passar
  `false` só para calar o compilador faz o laboratório mentir, que é exatamente o
  que ele existe para não fazer.

**Push não é deploy.** Antes de dizer que algo está no ar, conferir o `status`
do deploy no Render. `live` é o que vale.

**Backend: `pytest` e `ruff`** pelo interpretador-base do uv — o `.exe` dentro do
`.venv` cai na política de App Control desta máquina.

### Estratégia

| Camada | O que testar | Ferramenta |
|---|---|---|
| Unidade | Scoring, detecção de triângulos, limites de plano | pytest |
| Integração | Endpoints com banco de teste | pytest + httpx |
| Regra de negócio | Máquina de estados do match, aceite de termos | pytest |
| E2E | Fluxo cadastro → anúncios → match → conclusão | Playwright (opcional) |

**Prioridade:** o motor de matching e a máquina de estados precisam de cobertura alta. É onde o bug custa caro (usuário vê troca errada e perde confiança). CRUD pode ter cobertura baixa.

**Testes que não podem faltar:**

```python
def test_triangulo_nao_gera_duplicata():
    """O mesmo trio não pode ser sugerido duas vezes,
    independente da ordem em que os ciclos são encontrados."""
    arestas = [
        Aresta(A, B, c1, "NM"),
        Aresta(B, C, c2, "NM"),
        Aresta(C, A, c3, "NM"),
    ]
    resultado = detectar_triangulos(arestas)
    assert len(resultado) == 1


def test_no_show_exige_confirmacao_previa():
    """Quem não confirmou sua parte não pode reportar o outro."""
    with pytest.raises(RegraNegocio) as e:
        reportar_no_show(match_id, usuario_que_nao_confirmou)
    assert e.value.codigo == "CONFIRME_SUA_PARTE_ANTES"


def test_contato_nao_vaza_sem_aceite_total():
    """Nenhum caminho de serialização pode expor o contato
    antes do aceite de todos os participantes."""
    resposta = serializar_match(match_pendente, solicitante=A)
    assert "contato_visivel" not in json.dumps(resposta)


def test_nao_permite_acabamento_inexistente():
    """Não existe Master Ball de Pokémon ex em Prismatic Evolutions.
    O anúncio precisa ser rejeitado na API, não só escondido na UI."""
    with pytest.raises(RegraNegocio) as e:
        criar_anuncio(card_id=umbreon_ex_sv8pt5, finish="MASTERBALL")
    assert e.value.codigo == "ACABAMENTO_INDISPONIVEL"


def test_matching_nao_cruza_acabamentos():
    """Quem procura Master Ball não recebe match de reverse comum,
    a menos que tenha marcado 'aceito outros acabamentos'."""
    matches = buscar_matches(usuario_que_procura_masterball)
    assert all(m.finish == "MASTERBALL" for m in matches)


def test_contato_exige_aceite_do_disclaimer():
    """Aceite mútuo não basta: o solicitante precisa aceitar a isenção."""
    with pytest.raises(RegraNegocio) as e:
        revelar_contato(match_aceito, user_id=A, aceite_disclaimer=False)
    assert e.value.codigo == "ACEITE_TERMOS_NECESSARIO"
```

### Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        options: >-
          --health-cmd pg_isready --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -v --cov=app

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
```

---

## 20. Observabilidade e métricas

### Erros

Sentry no backend e no frontend, free tier — **feito em 2026-08-20** (item 15).
São dois projetos no painel, e não um: erro de navegador e erro de servidor na
mesma lista param de dizer de onde vieram.

O backend está em `api/app/core/monitoramento.py`, chamado na primeira linha do
`main.py` — antes de o `FastAPI(...)` existir, porque a integração entra na
construção da pilha de middlewares e um app já montado não é instrumentado.
`tests/test_monitoramento.py` prova essa ordem em vez de comentá-la.

O frontend está em `web/src/lib/erros.ts`, carregado sob demanda: sem
`VITE_SENTRY_DSN` o `import()` vira código morto e o Rollup remove o SDK inteiro
do bundle. Com DSN, são 28,5 KB comprimidos — foram 153,7 KB até o módulo parar
de ser guardado por inteiro (ver o docstring do arquivo).

**O que não vai para o painel**, e cada item custou uma decisão:

- **`RegraNegocio` não é erro.** É o app dizendo "não pode": limite de plano,
  anúncio repetido, proposta fora do prazo. São centenas por dia num app
  saudável, e o free tier são 5 mil eventos por mês — uma semana de uso normal
  gastaria a cota inteira em "não pode".
- **Resposta 4xx também não.** 404 e 401 são o servidor funcionando.
- **Nem as variáveis locais do stack.** Esta é a que não estava prevista: o
  scrubber do Sentry limpa por *nome de chave*, e o `Authorization` chegava
  inteiro por outro caminho — dentro do `scope` do ASGI, que é variável local de
  um middleware, os cabeçalhos são uma lista de pares de bytes, sem nome nenhum
  para uma denylist pegar. Com `include_local_variables=True` (o padrão), todo
  erro de produção publicaria o token de sessão de quem topou com ele num painel
  web. Medido e corrigido em 2026-08-20; o teste que pegou está em
  `test_segredo_de_cabecalho_nao_viaja`.

E o modo de falhar que este projeto já conhece: **painel vazio parece boa
notícia**. `npm run provar:sentry` sobe o `dist` com o CSP de verdade lido do
`render.yaml`, quebra a página de propósito e conta o que saiu pelo fio — com
controle negativo (sem os hosts no `connect-src`, o envio tem de ser bloqueado).
O `connect-src` importa: o host do ingest carrega o id da organização, e errá-lo
não quebra nada visível — só bloqueia o envio calado.

### No ar, e o que a ligação ensinou (2026-08-20)

Duas contas na organização `o4511945690447872`, região **US** — é o que o
`connect-src` autoriza por curinga. Os DSN vivem só no painel do Render
(`sync: false` nos dois serviços) e foram provados em produção no mesmo dia: o
PWA no ar quebrado de propósito, `200` do ingest, zero bloqueio de CSP.

Três armadilhas que custaram tempo e não são óbvias na segunda vez:

- **Variável `sync: false` não é criada pelo `blueprint_sync`** e nem aparece no
  painel — tem de ser criada à mão em Environment, no serviço certo. A mesma
  pegadinha do webhook do Mercado Pago (seção 16).
- **Cada serviço tem sua própria página de Environment**, e `VITE_SENTRY_DSN` no
  serviço da API não faz nada: variável `VITE_` só existe no instante em que o
  PWA é compilado, e quem compila o PWA é o outro serviço. O sinal de que o build
  pegou é o nome do arquivo em `dist/assets/index-*.js` **mudar** — o nome é
  derivado do conteúdo.
- **`DSN`, não `DNS`.** A chave nasceu como `VITE_SENTRY_DNS` e nada quebrou: sem
  a variável, o `import()` do SDK vira código morto, o Rollup o remove, e o
  painel fica vazio parecendo silêncio bom. É o mesmo modo de falhar do rate
  limit que passou um mês inerte, e é por isso que a conferência olha o fio e não
  a configuração.

**Bloqueador de anúncio derruba o envio, e isso é limitação do modelo.** Num dos
navegadores do teste, toda requisição para `ingest.us.sentry.io` voltava `503`
sintético — do mesmo computador, o terminal e um Chromium limpo recebiam `200`.
Quem usa o app com bloqueador não reporta erro, e nenhum ajuste nosso muda isso;
o contorno seria enviar o evento por uma rota da nossa API em vez do domínio do
Sentry, o que custa uma rota e não se paga antes de haver volume.

### Métricas de produto

Grave em `match_events` e consulte por SQL. Não precisa de ferramenta paga.

**As quatro métricas que importam:**

1. **Taxa de conclusão** = `CONCLUIDO / (CONCLUIDO + FURADO + EXPIRADO)` — a métrica-mãe
2. **Tempo até o primeiro match** — mede a qualidade do onboarding
3. **Anúncios por usuário ativo** — abaixo de 20 o matching não funciona
4. **Matches por usuário por semana** — mede a saúde da rede

```sql
-- Painel semanal
select
  date_trunc('week', criado_em) as semana,
  count(*) filter (where evento = 'CONCLUIDO') as concluidas,
  count(*) filter (where evento = 'NOSHOW')    as furadas,
  round(
    count(*) filter (where evento = 'CONCLUIDO')::numeric
    / nullif(count(*) filter (where evento in ('CONCLUIDO','NOSHOW')), 0)
    * 100, 1
  ) as taxa_conclusao
from match_events
group by 1
order by 1 desc;
```

### Logs

Log estruturado em JSON (`structlog`). Sempre inclua `user_id` e `request_id`. Nunca logue contato de usuário nem token.

---

## 21. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| **Problema do início a frio** — sem usuários, sem matches | Crítico | Alta | Lance só quando tiver 30–50 pessoas da comunidade local cadastradas. Faça cadastro assistido presencial na loja no dia do lançamento |
| Listas pequenas demais para gerar match | Alto | Alta | Cadastro em massa; meta de 20 cartas no onboarding; contador de "quanto falta" |
| Usuário acha que é gerenciador de coleção e se frustra | Médio | Média | Nomenclatura consistente em todo o produto; texto explícito no onboarding; nunca usar a palavra "coleção" |
| **Fonte de catálogo muda de dono, preço ou some** | Médio | **Alta** | Já aconteceu uma vez: a pokemontcg.io virou Scrydex (pago). Cache local completo, camada de abstração no sync, dump versionado. Ver Apêndice A |
| **Projeto Supabase pausa por inatividade (7 dias)** | Alto | Média | Cron de keep-alive a cada 10 min tocando o banco de verdade. Falha silenciosa se esquecido |
| **Perda de dados sem backup** | Crítico | Baixa | Free tier não tem backup. Dump diário via GitHub Actions desde o primeiro dia |
| Free tier de hospedagem encerrado | Médio | Média | Aconteceu com Fly.io em 2024 e com Heroku em 2022. A API é um container padrão: migrar custa horas, não semanas |
| Usuário fura troca repetidamente | Alto | Média | Sistema de reputação; ranking rebaixa; bloqueio manual em caso extremo |
| Vazamento de contato | Alto | Baixa | Schemas Pydantic separados; contato nunca serializado antes do aceite mútuo e do disclaimer; teste automatizado cobrindo isso |
| Uso da plataforma para venda | Médio | Média | Proibição nos termos; validação básica de campos livres; denúncia com motivo específico; bloqueio na reincidência |
| **Responsabilização por troca mal sucedida** | Alto | Baixa | Isenção aceita no cadastro e novamente antes de revelar contato, com registro em `term_acceptances` |
| Estouro do free tier | Médio | Baixa | Nunca armazenar imagens; um jogo só; monitorar tamanho do banco mensalmente |
| Questão de marca (Pokémon) | Médio | Baixa | Não usar logos oficiais nem "Pokémon" no nome do app; disclaimer de não-afiliação visível, como fazem os apps existentes |

### O risco número um

É o **início a frio**. Um app de matching com 5 usuários não gera nenhum match, e quem entra e não vê nada não volta.

Trate o lançamento como evento, não como deploy. Escolha um dia de torneio na loja, cadastre 40 pessoas presencialmente com ajuda, rode o matching na hora e mostre os primeiros resultados na tela para o grupo. Esse momento é o que faz o produto existir — e, para o portfólio, "20 trocas concluídas por usuários reais" vale mais numa entrevista que qualquer stack no currículo.

---

## 22. Vitrine e propostas

> Seção nova na v2.3. Ela fica no fim, e não entre a 9 e a 10 onde o assunto
> pediria, para não renumerar as seções 10–21 — a numeração é citada por
> comentário de código, por commit e pelo próprio texto em dezenas de lugares, e
> o custo de quebrar essas referências é maior que o de ler fora de ordem. Quem
> for da seção 9 (matching) para cá está seguindo o caminho certo.

**A vitrine é permanente desde 2026-08-14**, por decisão do Eduardo. Ela entrou
em 2026-08-11 com uma pergunta pendurada — se fecha mais troca que o motor, e
portanto se fica — e a pergunta foi respondida por decisão, não por número: fica.
A medição que existia para respondê-la saiu da fila junto (item 7). O que se lê
abaixo descreve um caminho definitivo do produto, não um experimento em
observação.

### 22.1 O problema que o matcher não resolve

O motor da seção 9 casa OFERTA com PROCURA. Isso exige que **os dois lados**
tenham declarado o que querem, e é exatamente aí que ele para: boa parte das
pessoas não sabe o que quer — sabe reconhecer quando vê. Quem nunca preencheu o
PROCURA não aparece no feed de ninguém e não recebe feed nenhum, por mais cartas
que tenha cadastrado no OFERTA.

Isso soma-se ao risco número um da seção 21. No início, sem densidade, quase
todo mundo está nessa situação: o matcher é excelente e chega tarde. A vitrine é
o caminho que funciona com **um** lado declarado, que é o mínimo que existe no
dia do lançamento.

O fluxo é o do balcão da loja, e nada além disso: B olha as cartas de A, aponta
uma, oferece algo em troca. A aceita, recusa, ou aponta outra coisa que B tem.

### 22.2 A reversão de uma decisão anterior

`services/matching.py`, em `mais_cartas_do_parceiro`, dizia que ver o acervo de
alguém é consequência de já ter dado match "porque o produto é um quadro de
trocas, não um diretório de pessoas". A vitrine derruba a segunda metade dessa
frase e mantém a primeira.

O que continua valendo: **não há diretório de pessoas.** Não existe busca por
usuário, não existe lista de membros, não existe mensagem. O que abre é o
acervo, alcançado a partir de uma carta — e anúncio ativo já era público por
policy desde `09_rls.sql` (`"le anuncios ativos"`). A vitrine não expõe dado
novo; expõe de outro ângulo o que já era legível.

O que muda de verdade é o contato, e ele **não** muda: continua saindo só depois
do aceite mútuo, agora dentro do match que a proposta gerou.

### 22.3 Modelo de dados

DDL completo e comentado em `db/schema/23_propostas.sql`. O resumo:

```
propostas
  id, autor_id, destinatario_id
  status     ABERTA | ACEITA | RECUSADA | RETIRADA | EXPIRADA
  rodada     1..4
  vez_de     de quem é a vez de responder
  match_id   preenchido só no aceite
  criada_em, respondida_em, expira_em

proposta_itens
  proposta_id, rodada
  listing_id (anulável — vínculo vivo)
  card_id, condicao, finish_id  (denormalizados — histórico)
  de_user_id, para_user_id, quantidade
```

Três decisões que valem o registro:

**Tabela nova em vez de campos em `matches`.** `matches.hash_grupo` é `unique` e
vale por par de pessoas (`DIRETO:{a}:{b}`, ver `_hash_grupo`) — existe para
deduplicar sugestão automática, que é uma por dupla. Proposta é humana: a mesma
dupla negocia hoje e de novo semana que vem, legitimamente. Além disso
`match_status` não tem estado de negociação e `match_items` não tem rodada.

**Não existe status `CONTRAPROPOSTA`.** Contrapropor não muda a situação da
proposta — ela segue aberta —, muda de quem é a vez. Virar status geraria a
pergunta impossível "aberta ou contraproposta?" toda vez que o app listasse o
que está pendente. Vez e rodada são colunas; status é desfecho.

**Item guarda `listing_id` e a cópia da carta.** Mesmo padrão de `match_items`,
pelo mesmo motivo: o anúncio é volátil e um histórico que depende dele se
reescreve sozinho. O `listing_id` anulável é o vínculo vivo — quando vira null,
a carta saiu do ar e a proposta caducou.

### 22.4 Máquina de estados

```
        B abre (rodada 1, vez de A)
                  │
                  ▼
             ┌─ ABERTA ─┐
   contrapõe │          │ aceita ──► ACEITA ──► vira match (seção 13)
  (rodada+1, │          │ recusa ──► RECUSADA
  vez troca) │          │ retira ──► RETIRADA   (quem fez a última jogada)
             └──────────┘ 72h ─────► EXPIRADA
```

**Aceitar, recusar e contrapropor são de quem tem a vez; retirar é de quem
*não* tem.** As três primeiras são respostas — só responde quem está devendo
resposta. Retirar é o oposto: é quem acabou de jogar puxando a jogada de volta
antes de a outra pessoa olhar (mandou a carta errada, vendeu a carta, mudou de
ideia). Para quem tem a vez, retirar seria um quarto botão dizendo o mesmo que
recusar; sem ele, quem se arrependeu só teria a saída de deixar as 72h vencerem
— e proposta pendurada tranca a dupla inteira, porque só existe uma negociação
aberta por par.

**Teto de 4 rodadas** (decisão do Eduardo, 2026-08-07). Com duas idas e voltas de
cada lado, quase toda negociação que tinha acordo possível acha o acordo. Acima
disso não há chat interno para sustentar a conversa e cada rodada custa um dia
parado. Na rodada 4 só restam aceitar e recusar.

**72h por rodada, e não os 7 dias do match.** Prazo de match é o tempo de marcar
um encontro presencial; prazo de proposta é o tempo de responder uma pergunta no
celular. Reinicia a cada rodada. O job `/internal/jobs/expire` passa a varrer as
duas coisas.

### 22.5 Antiabuso

**Uma negociação aberta por dupla**, garantida por índice único parcial
(`least/greatest` sobre os dois ids, `where status = 'ABERTA'`). Vitrine aberta
com proposta livre tem desfecho previsível: a carta mais cobiçada da cidade
recebe quarenta propostas, o dono não dá conta e desiste do app — perdendo o
acervo que fazia a vitrine valer a pena. Se B quer duas cartas de A, elas vão na
**mesma** proposta, que é multi-item por desenho.

**Teto diário de propostas abertas** por pessoa, em `core/limites.py` junto de
`max_ofertas` — é limite de plano, não constraint, porque constraint não
distingue FREE de PRO. Diferente dos outros, este **não passa pelo portão da
cobrança**: é antiabuso, e antiabuso vale desde o primeiro dia. O campo é
`propostas_por_dia` (10 no FREE, 100 no PRO) e
a janela é móvel, das últimas 24h: dia de calendário devolveria cota de presente
à meia-noite, que é justamente quando um disparo em massa passaria despercebido.
Ele não é o antiabuso principal — esse é o índice único acima —, e sim o teto de
quem abriria uma proposta para cada pessoa da base.

**Reputação não é tocada.** Recusar não é furar: é a resposta que o produto está
pedindo, e cobrá-la faria as pessoas pararem de responder. `RECUSADA` e
`EXPIRADA` ficam fora da métrica-mãe pelo mesmo motivo que sugestão ignorada já
fica — não houve encontro marcado, logo não houve encontro que deu errado.

### 22.6 O aceite vira match

No aceite, a API cria um `matches` com `tipo = 'PROPOSTA'`, `status = 'ACEITO'`,
os dois `match_participants` já com `aceitou = true`, e os `match_items` da
rodada corrente. `propostas.match_id` aponta para ele.

O `hash_grupo` desse match é `PROPOSTA:{proposta_id}` — nunca `DIRETO:{a}:{b}`.
Sem isso ele colidiria com a sugestão que o matcher mantém para a mesma dupla, e
o unique derrubaria o aceite. Como ele nunca é `SUGERIDO`, o
`sincronizar_matches` não o apaga na varredura de sugestões que não se sustentam.

Daí para frente **nada é novo** — e desde 2026-08-15 isso é verdade também para
o disclaimer, que até então a frase abaixo prometia sem que existisse:
prazo e prorrogação, disclaimer bloqueante,
revelação de contato, conclusão bilateral, `CANCELADO`, `FURADO`, denúncia e
reputação são os da seção 13, sem uma linha a mais.

A carta **não é reservada** durante a negociação: o anúncio segue na vitrine e
segue casável pelo matcher. Reservar seria mentir sobre disponibilidade em troca
de nada — não há custódia, a carta física está com a pessoa. Quem fechar primeiro
fecha; o outro lado vê o `listing_id` virar null e a proposta cair.

### 22.7 API — contratos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/vitrine` | Feed de OFERTA da base. Query: `q`, `set`, `serie`, `raridade`, `ordem`, `so_procuro`, `page`. Exclui o próprio usuário e quem está bloqueado |
| `GET` | `/vitrine/carta/{card_id}` | Quem tem esta carta, com acabamento e condição |
| `GET` | `/vitrine/acervo/{username}` | O OFERTA de uma pessoa. Alcançado a partir de uma carta, nunca de uma busca por gente |
| `GET` | `/me/propostas` | Query: `caixa=recebidas\|enviadas\|minha_vez\|historico` |
| `POST` | `/me/propostas` | Abre. Body: `para`, `quero[]`, `ofereco[]` (ids de `listings`) |
| `GET` | `/me/propostas/{id}` | Detalhe com todas as rodadas |
| `POST` | `/me/propostas/{id}/aceitar` | Aceita a rodada corrente. Cria o match e devolve o `match_id` |
| `POST` | `/me/propostas/{id}/recusar` | Encerra sem contraproposta |
| `POST` | `/me/propostas/{id}/contrapropor` | Nova rodada. Mesmo body do `POST`, sem `para` |
| `POST` | `/me/propostas/{id}/retirar` | Só quem fez a última jogada, e só antes de o outro responder |

**Exemplo — `POST /me/propostas`:**

```json
{
  "para": "marina",
  "quero":   ["3ab1...", "9f02..."],
  "ofereco": ["77c5..."]
}
```

Resposta `201`:

```json
{
  "id": "b41e...",
  "status": "ABERTA",
  "rodada": 1,
  "vez_de": "marina",
  "expira_em": "2026-08-10T14:00:00Z",
  "rodadas": [
    {
      "rodada": 1,
      "por": "eduardo",
      "quero":   [{ "carta": "Charizard ex", "condicao": "NM", "finish": "Master Ball" }],
      "ofereco": [{ "carta": "Mewtwo ex",    "condicao": "LP", "finish": "Normal" }]
    }
  ]
}
```

Os itens entram por `listing_id`, não por `card_id` solto. É o que garante que a
carta oferecida existe de verdade, com o acabamento e a condição que o dono
declarou — e é o que faz a proposta caducar sozinha quando o anúncio sai do ar.

**Erros específicos**, no padrão `{"erro": {"codigo", "mensagem"}}` da seção 10:

| Código | Situação |
|---|---|
| `PROPOSTA_JA_ABERTA` | Já existe negociação aberta com essa pessoa (409) |
| `NAO_E_SUA_VEZ` | Respondeu fora da vez (409) |
| `RODADA_ESGOTADA` | Tentou contrapropor na rodada 4 (409) |
| `ANUNCIO_INDISPONIVEL` | Algum `listing_id` saiu do ar entre montar e enviar (409) |
| `PROPOSTA_ENCERRADA` | Já aceita, recusada, retirada ou expirada (409) |
| `LIMITE_DE_PROPOSTAS` | Teto diário do plano (429) |
| `NAO_E_SUA_JOGADA` | Tentou retirar tendo a vez — ali a saída é recusar (409) |
| `PROPOSTA_PARA_SI_MESMO` | O `para` é o próprio @ (400) |

O feed de `/vitrine` é **por carta**, não por anúncio: cinco pessoas oferecendo
o mesmo Charizard são uma linha com `donos = 5`, e quem são as cinco é a
pergunta seguinte (`/vitrine/carta/{card_id}`). Sem isso a carta mais comum da
cidade ocuparia a primeira página inteira. A página tem 24 cartas, o mesmo
tamanho da busca de catálogo — as duas telas são a mesma grade.

**Ordens** (`ordem=`): `novidade` (padrão), `nome`, `preco_menor`, `preco_maior`
e `donos`. A lista é fechada dos dois lados — o valor entra no `order by` por
f-string, que é a única forma de ordenar por coluna variável, e o que impede
injeção é a chave ser procurada no dicionário `ORDENS` antes.

**Preço é o do acabamento anunciado**, não o da impressão comum: uma reverse não
vale o que a normal vale, e o que está na prateleira é o anúncio. Cada linha
resolve o próprio preço pela ordem de preferência de `finishes.tipos_tcgplayer`,
com `coalesce(mercado, baixo)` — a mesma escolha que o cliente já faz em
`formatarPreco`. Agregado por carta, vira duas pontas: `preco` é a oferta mais
barata (o que interessa a quem ordena por menor) e a ordenação por maior usa a
mais cara. Carta sem cotação vai para o fim nas duas, porque abrir a lista com o
que não tem preço é abrir com o que não responde à pergunta.

**`so_procuro=true`** recorta pelas cartas que estão no meu PROCURA. É a vitrine
virando matching manual, e é o filtro mais útil para quem já declarou o que quer
e ainda não deu match: o que aparece são as trocas que faltam só de um lado.

As listas de vitrine e de acervo saem com `listing_id` junto, e não só com
`card_id`: é ele que a proposta consome. Cartas saem por id, como no resto da
API — nome e imagem o cliente já lê do catálogo.

### 22.8 Interface

Aba própria na navegação, ao lado de Trocas (decisão do Eduardo, 2026-08-07).
Vitrine é porta de entrada: quem não tem match precisa achar sozinha, e enterrar
isso dentro de outra tela esconderia a vitrine justamente de quem tem o feed
vazio — que é quem mais precisa dela.

Badge na aba pelo `idx_proposta_minha_vez`: o que espera resposta **minha**.
Proposta enviada e ainda não respondida não gera badge — não é tarefa de quem
enviou.

A tela de detalhe mostra as rodadas em ordem, com a linguagem da seção 14: "você
pediu X, ela ofereceu Y no lugar". Contraproposta abre o acervo do outro lado
para escolher a substituição, que é a mesma consulta de
`mais_cartas_do_parceiro`, agora sem o gate de match.

### 22.9 O que fica de fora

- **Chat.** Continua não existindo. As rodadas são a conversa, e o teto de 4 é o
  que impede a proposta de virar chat mal feito.
- **Proposta com dinheiro por diferença.** A seção 4.3 proíbe venda; abrir espaço
  para "completo com R$ 20" seria construir a porta que os termos fecham.
- **Proposta triangular.** A seção 9.2 já cobre triângulo pelo matcher. Negociação
  humana a três, com vez e contraproposta, não fecha em 72h.
- **Reserva de carta.** Ver 22.6.

---

## Apêndice A — Fonte do catálogo

### Escolha: TCGdex (`api.tcgdex.net/v2/pt`)

| Fonte | Auth | Limite | PT-BR | Situação |
|---|---|---|---|---|
| **TCGdex** ✅ | Nenhuma | Sem limite publicado | ✅ 14 idiomas | Open source, ativa |
| pokemontcg.io | Chave gratuita | 20k req/dia | ❌ só EN | Em transição para Scrydex |
| Scrydex | Paga | 5k créditos | ❌ | US$ 29/mês mínimo |

**Por que não a pokemontcg.io, que era a escolha óbvia.** A equipe da pokemontcg.io lançou a **Scrydex**, um produto comercial multi-TCG, e migrou o foco para lá. A API antiga continua no ar e gratuita, mas o free tier está em vias de acabar e a confiabilidade medida por monitores externos já caiu bastante. Construir a base de um projeto sobre uma API cujo mantenedor lançou a versão paga é assumir uma migração forçada no meio do caminho. A Scrydex, por sua vez, não tem free tier — começa em US$ 29/mês, o que sozinho custaria mais que toda a infraestrutura do projeto.

**Por que TCGdex é melhor aqui, e não apenas mais barata:** ela é a única opção gratuita com **cobertura em português**. No Brasil o Pokémon TCG é distribuído pela Copag e boa parte das cartas em circulação está em português. Sem nome em PT-BR, a busca quebra exatamente nas cartas de treinador — que são das mais trocadas. É open source, sem chave de API, com REST e GraphQL.

### Estratégia contra dependência externa

O catálogo é a única dependência externa crítica do projeto, e o caso da pokemontcg.io mostra que ela pode mudar de dono ou de preço sem aviso. Três defesas, todas baratas:

1. **Cache local completo.** O app nunca consulta a API externa durante uma requisição de usuário. Se a TCGdex sair do ar hoje, o TrocaTCG continua funcionando; só para de receber sets novos.
2. **Camada de abstração no sync.** Isole o acesso em `app/jobs/catalog/tcgdex.py` implementando uma interface `FonteCatalogo`. Trocar de provedor vira escrever um arquivo novo, não refatorar o sistema.
3. **Dump versionado.** Guarde o JSON bruto de cada sync num repositório privado. É o seu seguro contra a fonte desaparecer.

### Operação do sync

Rode semanalmente. Sets novos saem a cada 2–3 meses; preços mudam mais rápido, mas preço aqui é referência para equilibrar sugestões, não funcionalidade crítica.

O sync precisa ser **idempotente**: `insert ... on conflict (external_id) do update`. Um job que roda duas vezes não pode duplicar catálogo.

Busque em português e caia para inglês quando a tradução não existir — nem toda carta tem versão PT:

```python
async def sincronizar_set(client: httpx.AsyncClient, set_id: str) -> None:
    pt = await client.get(f"{BASE}/pt/sets/{set_id}")
    en = await client.get(f"{BASE}/en/sets/{set_id}")

    nomes_en = {c["localId"]: c["name"] for c in en.json()["cards"]}

    for carta in pt.json()["cards"]:
        await upsert_carta(
            external_id=carta["id"],
            nome_pt=carta.get("name"),
            nome_en=nomes_en.get(carta["localId"], carta.get("name")),
            imagem_url=f"{carta['image']}/low.webp" if carta.get("image") else None,
        )
```

## Apêndice B — Convenções de código

- **Python:** ruff com `line-length = 88`; type hints obrigatórios em funções públicas; nomes de domínio em português (`anuncio`, `troca`, `carta`), termos técnicos em inglês (`session`, `router`, `schema`)
- **TypeScript:** `strict: true`; componentes em PascalCase; hooks com prefixo `use`
- **Vocabulário proibido no código e na UI:** `collection`, `coleção`, `deck`, `binder`, `pasta`. O domínio é troca
- **Acabamento é `finish`, nunca `variant`** — `variant` colide com o campo homônimo da TCGdex, que significa outra coisa (mais grosseira). Manter os nomes distintos evita bug de interpretação no sync
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`) — facilita gerar changelog e fica bem no perfil do GitHub
- **Branches:** `main` protegida; feature branches com PR e CI verde obrigatório

## Apêndice C — Checklist de lançamento

Conferido item a item no código em 2026-08-14. O que está marcado foi verificado,
não presumido; o que tem ressalva está escrito por quê.

- [x] Termos de uso com isenção de responsabilidade publicados e versionados — `web/src/routes/Termos.tsx`, versão `2026-08-14`
- [x] Política de privacidade publicada (LGPD) — no mesmo documento, seções 11 a 18
- [x] Aceite de termos obrigatório no cadastro, com registro em `term_acceptances` — contexto `CADASTRO`, com IP
- [x] Modal de disclaimer bloqueante antes de revelar contato, com registro — feito em 2026-08-15, com a trava no servidor e não no modal (seção 4.2)
- [x] Disclaimer de não-afiliação com Nintendo / Creatures / GAME FREAK / The Pokémon Company — rodapé da Home, fim de Configurações e fim dos termos
- [x] Fluxo de exclusão de conta funcionando (exigência da LGPD) — `profiles.excluir_conta`, e desde 2026-08-14 ele cancela a assinatura antes de apagar. **Estava quebrado em produção e foi consertado em 2026-08-21**: quem tinha revelado um contato ou aberto uma proposta recebia 500, e o item estava marcado porque tinha sido conferido no código e nunca contra uma conta que usou o app. Ver a seção 17, "O que a passagem de 21/08 achou"
- [x] Denúncia de usuário funcionando, com motivo `USO_PARA_VENDA`
- [x] Rate limit ativo — feito em 2026-08-16, e provado por rajada: 320 chamadas em 0,4 s, 300 passam e 20 recebem 429
- [x] Sentry recebendo eventos — backend e frontend desde 2026-08-20, com o filtro de `RegraNegocio` e o stack sem variáveis locais. DSN no Render e envio do PWA em produção provado no mesmo dia (`200` do ingest, zero bloqueio de CSP)
- [x] **Keep-alive rodando** (API + banco) — a cada ~50 min pelo Actions, devolvendo `{"status":"ok","db":"ok"}`. Verificado em 2026-08-14
- [x] **Backup diário do banco** rodando e restauração testada — o backup roda e é cifrado desde `9ef33e1`; desde 2026-08-20 a restauração é exercitada **todo dia**, no job `restaurar` do mesmo workflow, com conferência de esquema, dados, RLS e grants
- [x] Endpoint `/health` consultando o banco de verdade, não só retornando 200 — faz `select 1`
- [ ] Domínio com HTTPS e HSTS — o `trocatcg.com` foi **registrado em 2026-08-21** e derruba a decisão de custo zero de 14/08. O `render.yaml` já declara os três nomes; falta o DNS apontar e o Render emitir o certificado. Até lá o `onrender.com` serve por HTTPS, com o HSTS dele e não nosso
- [ ] PWA instalável testada em Android e iOS
- [x] Página "Como instalar" publicada, com o passo a passo dos dois sistemas — `/instalar`, desde 2026-08-12
- [x] Imagem de compartilhamento (Open Graph 1200×630) e `twitter:card` no `index.html` — feita em 2026-08-15, gerada por `scripts/gerar-og.mjs`
- [x] `screenshots` no manifesto (estreito e largo) — 720×1280 e 1280×720, por `scripts/gerar-screenshots.mjs`. Os dois formatos são obrigatórios: faltando um, o Chrome descarta os dois
- [x] Catálogo de acabamentos populado para os sets em circulação — 14 acabamentos e 24.813 vínculos em `card_finishes`
- [x] Seletor de acabamento limitado ao que existe para cada carta — já estava pronto (`useAcabamentosDaCarta`); marcado como pendente por erro de verificação em 2026-08-14
- [ ] 30+ usuários pré-cadastrados
- [ ] README de portfólio com diagrama de arquitetura e decisões justificadas
