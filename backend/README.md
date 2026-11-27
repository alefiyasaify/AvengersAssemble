# Backend

FastAPI + SQLAlchemy 2 (sync) + Alembic on SQLite. Conventions: [CLAUDE.md](CLAUDE.md),
[docs/02](../docs/02-api-contract.md), [docs/03](../docs/03-database.md),
[docs/05](../docs/05-backend-guidelines.md).

## Quick start
```sh
cp .env.example .env            # then set SECRET_KEY:
python -c "import secrets; print(secrets.token_urlsafe(48))"
make setup                      # uv sync --frozen
make migrate                    # alembic upgrade head -> ./data/app.db
make run                        # http://localhost:8000/docs
```
On Windows run `make` from Git Bash. `make help` lists all targets.

## Layout
```
app/
  main.py              create_app() factory: middleware, exception handlers, routers under /api/v1
  core/                config, db (engine, PRAGMAs, Base, UUIDv7 ids, UTC datetimes), errors
                       (envelope), logging (JSON), middleware (request id), security (Argon2, JWT),
                       pagination, deps
  modules/health/      GET /api/v1/health/live, /health/ready (checks DB), /version
  modules/_template/   copy to add a module (not registered, not tested, not covered)
  migrations/          Alembic env (batch mode) + versions/
  seeds/               explicit seed commands only
scripts/export_openapi.py   deterministic openapi.json (--check for drift)
tests/                 cross-cutting tests; module tests live in app/modules/<name>/tests/
conftest.py            shared fixtures: migrated temp DB, per-test rollback, TestClient
```

## Checks
| Command | What |
|---|---|
| `make lint` | ruff check, ruff format --check, import-linter (layering + module privacy) |
| `make typecheck` | mypy --strict |
| `make test` | pytest, coverage gate 85% |
| `make check-openapi` | fail if `openapi.json` is stale |
| `make audit` | pip-audit on locked dependencies |

## Endpoints
| Method | Path | operationId | Auth |
|---|---|---|---|
| GET | `/api/v1/health/live` | `health_get_live` | none |
| GET | `/api/v1/health/ready` | `health_get_ready` | none (503 if DB down) |
| GET | `/api/v1/version` | `health_get_version` | none |
