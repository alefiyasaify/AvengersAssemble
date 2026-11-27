# Backend (FastAPI + SQLite)

Scope: everything under `backend/`. Root rules in `../CLAUDE.md` also apply.

## Stack
Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x (sync), Alembic, pytest (+ httpx2 TestClient), Ruff, mypy strict, import-linter, uv.

## Commands (run in `backend/`)
- `make setup` install locked deps (`uv sync --frozen`); needs `.env` with `SECRET_KEY` (see `.env.example`)
- `make run` dev server on :8000 with reload (`uvicorn --factory app.main:create_app`)
- `make test` pytest with coverage gate (85%)
- `make lint` ruff check + format check + import-linter, `make format` auto-fix, `make typecheck` mypy strict
- `make revision m="add_orders"` create migration, `make migrate` apply
- `make seed` migrate an empty DB and load the deterministic demo data (`app/seeds/generate.py`; prints demo logins once)
- `make gen-openapi` write `openapi.json` (commit it), `make check-openapi` drift check
- `make audit` pip-audit
- `make requirements` regenerate `requirements.txt` / `requirements-dev.txt` from `uv.lock` after any dependency change (pip users install from them; uv stays the source of truth)

## Layout and layering
`app/modules/<name>/{router,schemas,service,repository,models,deps}.py`
- router -> service -> repository -> models. No DB access in routers. No business rules in routers or schemas.
- Cross-module calls go through the other module's **service** only.
- `app/core/` (config, db, security, logging, errors) never imports from `modules/`.

## Rules
- Every endpoint: `response_model`, `status_code`, `operation_id` (`<module>_<verb>_<noun>`), `tags=[module]`.
- Input schemas use `extra="forbid"`; separate Create/Update/Read schemas.
- Errors: raise domain exceptions from `core/errors.py`; the handler produces the standard envelope (see `@../docs/02-api-contract.md`).
- Config only through `core/config.py` Settings. No `os.environ` elsewhere.
- DB: PRAGMAs (WAL, foreign_keys, busy_timeout) are set in `core/db.py`; sessions come from the `get_db` dependency. See `@../docs/03-database.md`.
- Migrations: autogenerate then hand-review; never edit a merged migration; exactly one Alembic head.
- Tests: unit (service), integration (router with migrated temp SQLite), named `test_<unit>_<behaviour>_<condition>`. Shared fixtures (`client`, `db_session`, `settings`) live in `backend/conftest.py`.
- New module: copy `app/modules/_template` (its `__init__.py` has the steps), register the router in `app/main.py` `MODULE_ROUTERS`, and add a `protected` import-linter contract in `pyproject.toml`.
- IDs: `new_id()` UUIDv7 (ADR-0007). Datetimes: timezone-aware UTC only (`UTCDateTime`). Auth helpers: `core/security.py` (ADR-0006).

## Adding a module
Follow the checklist in `@../docs/05-backend-guidelines.md`. Finish with `make gen-contract` from the repo root (spec + frontend client), fix what `make typecheck` reports, and label the PR `contract-change`.

## Don'ts
- No breaking changes under `/api/v1`.
- No returning SQLAlchemy models from routers.
- No `print`, bare `except`, blocking calls inside `async def`, or secrets in code.
- Do not run more than one backend instance against the same SQLite file.
