# TrocaTCG

> Plataforma de **trocas** de cartas de Pokémon TCG para comunidades locais.
> Não é um gerenciador de coleção — é um quadro de trocas com matching automático.

O TrocaTCG resolve um problema específico e mal atendido: colecionadores sabem o que
têm e o que querem, mas não conseguem descobrir **com quem** fechar troca. O sistema
calcula trocas recíprocas automaticamente — incluindo **triangulares** (A→B→C→A),
que nenhum concorrente oferece — e mantém reputação para reduzir trocas que furam.

**Status:** 🚧 Em desenvolvimento — Fase 1 (Fundação).

---

## Por que este projeto é diferente

- **Não é gerenciador de coleção.** Toda carta cadastrada está disponível para troca.
  Duas listas e só: **Ofereço** e **Procuro**. Essa decisão está codificada no schema.
- **Matching é o diferencial**, não a catalogação. SQL para trocas diretas/múltiplas,
  Python (detecção de ciclos em grafo) para triangulares.
- **Taxonomia de acabamentos própria** (`finishes`) — Master Ball, Poké Ball, Quick Ball…
  Um Master Ball vale múltiplos do reverse comum da mesma carta; nenhuma API gratuita
  entrega esse dado, então ele é nosso.
- **Custo de operação: ~R$ 3,30/mês** sobre camadas gratuitas, por decisão de arquitetura.

## Arquitetura

```
PWA (React + Vite + TS)  ──HTTPS+JWT──►  API (FastAPI, Python 3.12)  ──►  Supabase (Postgres + Auth + Realtime)
      Cloudflare Pages                        Render (free)                      RLS + pg_cron
                                                   ▲
                                     GitHub Actions (cron): keep-alive · backup · jobs de matching
```

Catálogo de cartas: **TCGdex** (PT-BR, open source, sem chave), em cache local.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `api/` | Backend FastAPI (routers, services, matching, jobs) |
| `web/` | Frontend PWA (React + TypeScript + Vite) |
| `db/schema/` | DDL versionado: tabelas, RLS, funções e seed de acabamentos |
| `docs/` | Documentação técnica e plano de investimento |
| `.github/workflows/` | CI, keep-alive, backup e jobs agendados |

## Documentação

- [Documentação Técnica](docs/TrocaTCG-Documentacao-Tecnica.md) — arquitetura, modelo de dados, matching, API, roadmap
- [Plano de Investimento](docs/TrocaTCG-Plano-de-Investimento.md) — quando e por que deixar o custo zero

## Stack

**Backend:** FastAPI · Pydantic v2 · SQLAlchemy 2.0 (async) · asyncpg · Alembic · uv · ruff · pytest
**Frontend:** React 18 · TypeScript · Vite · TailwindCSS · TanStack Query · Zustand · vite-plugin-pwa
**Infra:** Supabase (free) · Render (free) · Cloudflare Pages · GitHub Actions · Resend · Sentry

## Desenvolvimento

Pré-requisitos: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+.

```bash
# Backend
cd api
uv sync
cp .env.example .env      # preencha as variáveis
uv run uvicorn app.main:app --reload

# Frontend
cd web
npm install
npm run dev
```

### Skills de design (opcional)

O trabalho de frontend usa skills de design instaláveis (Refactoring UI, Emil
Kowalski, impeccable). O conteúdo fica fora do git; para restaurá-lo:

```bash
npx skills experimental_install   # lê skills-lock.json
```

## Roadmap

- [ ] **Fase 1 — Fundação:** schema, API `/health`, sync de catálogo, keep-alive, backup
- [ ] **Fase 2 — Anúncios:** CRUD de listings, acabamentos, busca, onboarding
- [ ] **Fase 3 — Matching direto** ⭐ (solta para a comunidade aqui)
- [ ] **Fase 4 — Reputação:** ciclo de vida do match, no-show, denúncia
- [ ] **Fase 5 — Triangular:** detecção de ciclos
- [ ] **Fase 6 — Notificações:** Realtime in-app + Web Push
- [ ] **Fase 7 — Polimento:** cadastro em massa, métricas, testes de carga

## Aviso legal

O TrocaTCG apenas conecta pessoas interessadas em trocar cartas. Não participa das
negociações, não custodia cartas e não intermedia valores. Não é afiliado, patrocinado
ou endossado por Nintendo, Creatures Inc., GAME FREAK inc. ou The Pokémon Company
International. Todas as marcas pertencem a seus respectivos titulares.

## Licença

[MIT](LICENSE).
