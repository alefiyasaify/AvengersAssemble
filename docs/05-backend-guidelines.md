# 05 Backend Guidelines (FastAPI)

## Stack
Python 3.12, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2.x, Alembic, uvicorn, pytest (+ httpx2 for Starlette's TestClient, pytest-cov), Ruff (lint + format), mypy (strict), import-linter, `uv` for dependencies and lockfile, stdlib JSON logging (`app/core/logging.py`). IDs: UUIDv7 (ADR-0007). Auth: ADR-0006.

## Structure
```
backend/
  pyproject.toml  uv.lock  Makefile  Dockerfile  .env.example  alembic.ini
  app/
    main.py               app factory, middleware, router registration
    core/                 config.py, db.py, security.py, logging.py, middleware.py (request id), errors.py, pagination.py, deps.py
    modules/<name>/       router, schemas, service, repository, models, deps, tests
    migrations/           Alembic env + versions
    seeds/
  tests/                  cross-module and integration tests
  conftest.py             shared fixtures; at the backend root so app/modules/*/tests see them too
  scripts/                export_openapi.py (deterministic spec, --check for drift)
```

## Layering rules
1. **Router**: HTTP concerns only (parse, auth dependency, call service, return response model). No SQL, no business rules.
2. **Service**: business logic and transactions' intent; raises domain exceptions. Framework-agnostic where practical.
3. **Repository**: all queries for the module; returns models/DTOs; no HTTP types.
4. **Models**: SQLAlchemy tables. Never returned directly from routers; always map to Pydantic schemas.
5. Modules call each other via **services** only. No importing another module's repository or models.
6. `core/` never imports from `modules/`.
Enforced by `import-linter` contracts in `backend/pyproject.toml` (`make lint`): `core` never imports `modules`; a `layers` contract per module (router -> deps -> service -> repository -> models -> schemas); and one `protected` contract per module so only the module itself (and `app.main` for its router) imports its router, deps, repository and models.

## API implementation rules
- Pydantic schemas separate for create, update and read (`OrderCreate`, `OrderUpdate`, `OrderRead`). `extra="forbid"` on input schemas.
- Always set `response_model`, `status_code`, `operation_id` and `tags`; document error responses.
- Use `APIRouter(prefix=..., tags=[...])` per module, all mounted under `/api/v1`.
- Use `def` endpoints with sync SQLAlchemy; use `async def` only when awaiting real async I/O, and never block the event loop inside it.
- Dependency injection for DB session, current user, settings. No globals.
- Pagination, filtering, errors exactly as in `02-api-contract.md`.

## Error handling
Domain exceptions (`UnauthenticatedError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `ValidationFailed`, `ServiceUnavailableError`, all subclasses of `AppError`) live in `core/errors.py`; pass a specific `code` (e.g. `order_not_found`). Exception handlers map them, request validation errors and HTTP errors to the standard envelope with `request_id`. Unknown exceptions are caught by `RequestContextMiddleware` and become 500 `internal_error` with a generic message; details go to logs only. Document error statuses on each route with `responses=error_responses(...)`.

## Configuration
`pydantic-settings` `Settings` class reads environment variables (full list in `docs/08` "Env var contract" and `backend/.env.example`). Fail fast on missing required values. No secrets in code or defaults.

## Logging and observability
Structured JSON logs; request-id middleware (accept `X-Request-ID` or generate; echo in response); log method, path, status, latency; never log secrets or PII. Expose health endpoints; add OpenTelemetry hooks when needed.

## Security (see 12-security.md)
Argon2 password hashing, short-lived JWT access tokens, authorization checks in services, rate limiting on auth endpoints, strict CORS (explicit origins), parameterized queries only (via SQLAlchemy), input size limits.

## Code quality
- Type hints everywhere, `mypy --strict` clean. Ruff rules: `E,F,I,B,UP,SIM,S,C90,ASYNC,PT`. Max function complexity 10.
- Small functions, explicit names, docstrings on public service methods, no business logic in schemas.
- No bare `except`, no mutable default args, no `print`.

## Testing
- Unit tests for services (fake or in-memory repository), integration tests for routers with `TestClient` and a real migrated SQLite DB, repository tests against the DB.
- Fixtures (`backend/conftest.py`) create a fresh migrated DB per test session and roll back per test; module tests live in `app/modules/<name>/tests/`, cross-cutting tests in `backend/tests/`.
- Coverage target 85% lines, 100% on security-critical code. Tests named `test_<unit>_<behaviour>_<condition>`.

## Adding a module (checklist)
1. Copy `app/modules/_template` to `app/modules/<name>` and rename (steps are in its `__init__.py`). 2. Models + migration (`make revision m="add_<name>_table"`, review by hand). 3. Schemas. 4. Repository + tests. 5. Service + unit tests (fake repository). 6. Router + integration tests (`client` fixture). 7. Add the router to `MODULE_ROUTERS` in `app/main.py`. 8. Add a `protected` import-linter contract for the module and add it to the `layers` contract containers in `pyproject.toml`. 9. `make gen-contract` (spec + frontend client), fix what `make typecheck` reports, label the PR `contract-change`. 10. Update docs and the module table in `01-architecture.md`.

## Commands
`make run`, `make test`, `make lint` (ruff + import-linter), `make format`, `make typecheck`, `make migrate`, `make revision m="msg"`, `make gen-openapi`, `make check-openapi`, `make audit`.
