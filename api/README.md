# TrocaTCG — API

Backend FastAPI (Python 3.12, async). Fonte da verdade do matching e gate de plano.

## Rodar localmente

```bash
uv sync
cp .env.example .env      # preencha DATABASE_URL, SUPABASE_JWT_SECRET, etc.
uv run uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Docs (OpenAPI): http://localhost:8000/docs
- Health: http://localhost:8000/v1/health

## Testes e lint

```bash
uv run pytest -v
uv run ruff check .
uv run ruff format --check .
```

## Estrutura

```
app/
├── main.py            # app, CORS, rate limit, handlers
├── core/
│   ├── config.py      # settings via pydantic-settings
│   ├── auth.py        # valida JWT do Supabase
│   ├── errors.py      # RegraNegocio + handler padrão
│   └── limites.py     # limites por plano (gate aberto na v1)
├── db/
│   └── session.py     # engine + sessão async
└── routers/
    └── health.py      # /v1/health (consulta o banco de verdade)
```

Próximos routers (por fase): `cards`, `listings`, `matches`, `users`, `reports`,
`legal`, `notifications`, `internal`. Ver roadmap na doc.

## Convenções

- ruff com `line-length = 88`; type hints em funções públicas.
- Nomes de domínio em português (`anuncio`, `carta`, `troca`); técnicos em inglês.
- SQL sempre parametrizado. Contato de usuário nunca serializado antes do aceite mútuo.
