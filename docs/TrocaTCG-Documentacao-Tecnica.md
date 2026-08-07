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

Como a plataforma trata dados pessoais (e-mail, contato, localização em nível de bairro), a política de privacidade precisa declarar:

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

-- Matches: só participantes veem
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
| `+8 se mesmo bairro` | Bônus | Proximidade é o maior preditor de troca concluída |
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
| `GET` | `/me/notifications` | Lista, com `?nao_lidas=true` |
| `POST` | `/me/notifications/read` | Marca como lidas |
| `POST` | `/me/push-subscription` | Registra endpoint Web Push |

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
| `POST` | `/internal/jobs/expire` | Expira matches vencidos |
| `POST` | `/internal/jobs/notify-wanted` | Notifica "procuram sua carta" |

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

---

## 12. Notificações

Sem Telegram. Três canais, todos gratuitos:

### 11.1 In-app (principal)

Tabela `notifications` + badge no header. Atualização por **Supabase Realtime** (incluído no free tier) — o frontend assina mudanças na tabela filtradas por `user_id`. Zero polling, zero custo.

```typescript
// src/hooks/useNotificacoes.ts
useEffect(() => {
  const canal = supabase
    .channel('notificacoes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}` },
      ({ new: nova }) => {
        queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
        toast(nova.titulo)
      })
    .subscribe()

  return () => { supabase.removeChannel(canal) }
}, [userId])
```

### 11.2 Web Push (reengajamento)

Service worker + VAPID. Funciona em Android, desktop e iOS 16.4+ (PWA instalado). Custo zero — o navegador entrega.

Envio pelo backend com `pywebpush`. Dispare **só** para eventos de alto valor:

- Alguém colocou na lista Procuro uma carta que você oferece
- Match novo com score acima do limiar
- Alguém aceitou seu match
- Lembrete de confirmação (48 h após aceite)

Nunca envie push de coisa genérica. Push irrelevante gera desinstalação.

### 11.3 E-mail (fallback)

Resend, free tier de 3.000/mês. Só para: confirmação de conta, recuperação de senha e resumo semanal opcional. Nada mais.

### Matriz de notificação

| Evento | In-app | Push | E-mail |
|---|:--:|:--:|:--:|
| Alguém procura uma carta que você oferece | ✅ | ✅ | — |
| Match novo (score alto) | ✅ | ✅ | — |
| Match novo (score baixo) | ✅ | — | — |
| Match aceito pelo outro | ✅ | ✅ | — |
| Lembrete de confirmação | ✅ | ✅ | — |
| Match expirado | ✅ | — | — |
| Boas-vindas / senha | — | — | ✅ |

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

O `_desativar_anuncios_trocados` é essencial: sem ele, a carta trocada continua gerando matches fantasma. Ele desativa tanto a OFERTA de quem entregou quanto a PROCURA de quem recebeu.

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
            --no-owner --no-acl -Fc -f backup.dump
      - uses: actions/upload-artifact@v4
        with:
          name: backup-${{ github.run_id }}
          path: backup.dump
          retention-days: 30
```

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

### O que fazer desde a v1

1. **Coluna `plano` em `profiles`** — já está no schema, default `FREE`
2. **Camada de limites centralizada:**

```python
# app/core/limites.py
from dataclasses import dataclass


@dataclass(frozen=True)
class Limites:
    max_anuncios: int
    matches_visiveis: int
    triangular: bool
    alerta_carta: bool
    historico_dias: int


PLANOS: dict[str, Limites] = {
    "FREE": Limites(
        max_anuncios=150,
        matches_visiveis=5,
        triangular=False,
        alerta_carta=False,
        historico_dias=30,
    ),
    "PRO": Limites(
        max_anuncios=10_000,
        matches_visiveis=999,
        triangular=True,
        alerta_carta=True,
        historico_dias=3650,
    ),
}


def limites_de(plano: str) -> Limites:
    return PLANOS.get(plano, PLANOS["FREE"])
```

3. **Toda regra de negócio consulta `limites_de(user.plano)`** — nunca condicional espalhada
4. **Na v1, todos os usuários recebem os limites PRO.** O gate existe no código mas está aberto. Ligar depois é trocar o default.

### Modelo de cobrança sugerido (v2)

| | Free | Pro — R$ 9,90/mês |
|---|---|---|
| Cartas anunciadas | 150 | Ilimitado |
| Matches visíveis por dia | 5 | Ilimitado |
| Match triangular | — | ✅ |
| Alerta quando alguém procura sua carta | — | ✅ |
| Histórico de trocas | 30 dias | Completo |
| Selo verificado no perfil | — | ✅ |

**Princípio de precificação:** nunca limite o que gera efeito de rede. Anunciar carta e concluir troca precisam ser sempre livres — são eles que fazem o app valer a pena para os outros. Cobre por **conveniência e alcance** (triangular, alertas, volume), não por participação.

### Alternativa de receita

Antes de assinatura individual, considere **patrocínio de loja local**: R$ 100–200/mês para a loja aparecer como ponto de encontro sugerido e ter selo no app. É mais fácil vender uma loja que 20 usuários, e conversa direto com seu objetivo de parceria com game store.

Atenção: patrocínio de loja aproxima o produto de um contexto comercial. Reforce nos termos que o TrocaTCG segue sem participar de qualquer negociação, e que o patrocínio se limita a espaço de divulgação e sugestão de local de encontro.

### Integração de pagamento (quando chegar)

Mercado Pago (assinatura recorrente, PIX) — taxa menor que Stripe no Brasil e PIX é o que a comunidade usa. Webhook `POST /webhooks/mercadopago` atualiza `profiles.plano`.

Esse pagamento é da assinatura da plataforma, entre usuário e você. Ele não tem nenhuma relação com as trocas, e essa separação precisa estar explícita nos termos.

---

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

Sentry no backend e frontend, free tier. Configure para não capturar exceções de regra de negócio (`RegraNegocio`) — essas são esperadas e vão poluir o painel.

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
`max_anuncios` — é limite de plano, não constraint, porque constraint não
distingue FREE de PRO. O campo é `propostas_por_dia` (10 no FREE, 100 no PRO) e
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

Daí para frente **nada é novo**: prazo e prorrogação, disclaimer bloqueante,
revelação de contato, conclusão bilateral, `CANCELADO`, `FURADO`, denúncia e
reputação são os da seção 13, sem uma linha a mais.

A carta **não é reservada** durante a negociação: o anúncio segue na vitrine e
segue casável pelo matcher. Reservar seria mentir sobre disponibilidade em troca
de nada — não há custódia, a carta física está com a pessoa. Quem fechar primeiro
fecha; o outro lado vê o `listing_id` virar null e a proposta cair.

### 22.7 API — contratos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/vitrine` | Feed de OFERTA da base. Query: `q`, `set`, `raridade`, `page`. Exclui o próprio usuário e quem está bloqueado |
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

- [ ] Termos de uso com isenção de responsabilidade publicados e versionados
- [ ] Política de privacidade publicada (LGPD)
- [ ] Aceite de termos obrigatório no cadastro, com registro em `term_acceptances`
- [ ] Modal de disclaimer bloqueante antes de revelar contato, com registro
- [ ] Disclaimer de não-afiliação com Nintendo / Creatures / GAME FREAK / The Pokémon Company
- [ ] Fluxo de exclusão de conta funcionando (exigência da LGPD)
- [ ] Denúncia de usuário funcionando, com motivo `USO_PARA_VENDA`
- [ ] Rate limit ativo
- [ ] Sentry recebendo eventos
- [ ] **Keep-alive rodando** (API + banco) e verificado por 2 dias seguidos
- [ ] **Backup diário do banco** rodando e restauração testada uma vez
- [ ] Endpoint `/health` consultando o banco de verdade, não só retornando 200
- [ ] Domínio com HTTPS e HSTS
- [ ] PWA instalável testada em Android e iOS
- [ ] Catálogo de acabamentos populado para os sets em circulação
- [ ] Seletor de acabamento limitado ao que existe para cada carta
- [ ] 30+ usuários pré-cadastrados
- [ ] README de portfólio com diagrama de arquitetura e decisões justificadas
