# 05 Backend Guidelines (FastAPI)

## Stack
Python 3.12, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2.x, Alembic, uvicorn, pytest (+ httpx2 for Starlette's TestClient, pytest-cov), Ruff (lint + format), mypy (strict), import-linter, `uv` for dependencies and lockfile, stdlib JSON logging (`app/core/logging.py`), python-multipart (uploads). IDs: UUIDv7 (ADR-0007). Auth: ADR-0006 with the ARD parameters. Contract: the ARD (ADR-0011).

## Structure
```
backend/
  pyproject.toml  uv.lock  Makefile  Dockerfile  .env.example  alembic.ini
  app/
    main.py               app factory, middleware, router registration (MODULE_ROUTERS)
    core/                 config, db, security, auth (Principal, CSRF), clock, logging, middleware (request id),
                          errors, pagination (cursor), deps
    modules/<name>/       router, schemas, service, repository, models, deps, tests
                          health auth org audit policy receipts claims approvals payouts reports (+ _template)
    migrations/           Alembic env + versions
    seeds/                reference_data.json, rule_fixtures.json
  tests/                  cross-cutting tests (ARD E2E cases, admin/auth, errors, db, migrations, config, security)
  conftest.py             shared fixtures; at the backend root so app/modules/*/tests see them too
  scripts/                export_openapi.py (deterministic spec, --check for drift)
```

## Layering rules
1. **Router**: HTTP concerns only (parse, `PrincipalDep`, call service, return response model). No SQL, no business rules.
2. **Service**: business rules, authorisation, the transaction's intent and the audit write; raises domain exceptions.
3. **Repository**: all queries for the module; returns models or plain values; no HTTP types.
4. **Models**: SQLAlchemy tables. Never returned directly from routers; always map to Pydantic schemas.
5. Modules call each other via **services** only, using the other module's factory (`org_service(session, audit)`, `policy_service(...)`, `receipt_service(...)`, `claims_service(...)`). No importing another module's repository or models.
6. `core/` never imports from `modules/`. `policy/engine.py` is pure (no DB, no clock).
Enforced by `import-linter` contracts in `backend/pyproject.toml` (`make lint`, 13 contracts): `core` never imports `modules`; a `layers` contract over all modules (router -> deps -> service -> repository -> models -> schemas); and one `protected` contract per module so only the module itself (and `app.main` for its router) imports its router, deps, repository and models.

## API implementation rules
- Pydantic schemas separate for create, update and read; `extra="forbid"` on input schemas. Money fields end in `_paise`.
- Always set `response_model`, `status_code`, `operation_id` (`<module>_<verb>_<noun>`) and `tags`; document error responses with `responses=error_responses(...)`.
- One `APIRouter` per module, all mounted under `/api/v1` (ops paths `/healthz`, `/readyz` at the root).
- Use `def` endpoints with sync SQLAlchemy; use `async def` only when awaiting real async I/O, and never block the event loop inside it (the receipt upload is a sync endpoint on purpose).
- Dependency injection for DB session, current user (`PrincipalDep`), settings, clock. No globals; per-app state lives on `app.state`.
- Pagination, filtering, errors exactly as in `02-api-contract.md` (cursor pagination, 400/404/409 semantics).
- State-changing calls on a claim take `expected_version`; mutating endpoints will accept `Idempotency-Key` (AI-012).

## Error handling
Domain exceptions (`ValidationFailed` 400, `UnauthenticatedError` 401, `PermissionDeniedError` 403, `NotFoundError` 404, `ConflictError` 409, `PayloadTooLargeError` 413, `RateLimitedError` 429, `ServiceUnavailableError` 503, all subclasses of `AppError`) live in `core/errors.py`; pass a specific `UPPER_SNAKE` `code` (e.g. `CLAIM_VERSION_CONFLICT`) and an object `details`. Exception handlers map them, request validation errors (`details.fields`) and HTTP errors to the standard envelope with `request_id`. Unknown exceptions are caught by `RequestContextMiddleware` and become 500 `INTERNAL_ERROR` with a generic message; details go to logs only. Another user's resource is **404**, never 403. A failed sign-in is returned (not raised) so its audit event commits.

## Configuration
`pydantic-settings` `Settings` reads environment variables (full list in `docs/08` "Env var contract" and `backend/.env.example`). Fail fast on missing required values. No secrets in code or defaults. Business policy is **not** configuration in the environment: it lives in the database (`policy_*`, `approval_levels`, `app_config`).

## Logging, audit and observability
Structured JSON logs; request-id middleware (accept `X-Request-ID` or generate; echo in response); the client IP is captured for audit events only; never log secrets or PII. Every state change, approval action, policy/config publish, login and failed login, payout step and receipt/bank-file download writes an `audit_event` in the same transaction (`AuditService.record`; `actor_id=None` is SYSTEM). `/metrics`, the nightly audit-chain check and alerts are planned (P3-08).

## Security (see 12-security.md)
Argon2id password hashing, short-lived access JWT plus 8 h refresh in HttpOnly cookies with a CSRF header, lockout after 5 failures, authorisation checks in services, strict CORS (explicit origins), parameterised queries only (SQLAlchemy), receipts validated by magic bytes and size, CSV formula-injection guard.

## Code quality
- Type hints everywhere, `mypy --strict` clean. Ruff rules: `E,F,I,B,UP,SIM,S,C90,ASYNC,PT`. Max function complexity 10 (split helpers instead of suppressing).
- Small functions, explicit names, docstrings on public service methods, no business logic in schemas.
- No bare `except`, no mutable default args, no `print`.

## Testing
- The pure engine is tested table-driven from `app/seeds/rule_fixtures.json` (tests before the engine; boundaries at, below, above every limit). Services are exercised through the API against a real migrated SQLite DB with personas from `conftest.py` (`people`, `as_user`); DB-level rules are proven with direct SQL.
- Fixtures create a fresh migrated DB per test session (reference data seeded once) and roll back per test; module tests live in `app/modules/<name>/tests/`, cross-cutting tests in `backend/tests/`.
- Coverage target 85% lines (93.8% now), 100% on security-critical code. Tests named `test_<unit>_<behaviour>_<condition>`. The sample-audit draw and the clock are injectable.

## Adding a module (checklist)
1. Copy `app/modules/_template` to `app/modules/<name>` and rename (steps are in its `__init__.py`). 2. Models + migration (`make revision m="add_<name>_table"`, review by hand). 3. Schemas. 4. Repository + tests. 5. Service + tests. 6. Router + integration tests (`client` fixture). 7. Add the router to `MODULE_ROUTERS` in `app/main.py`. 8. Add a `protected` import-linter contract for the module and add it to the `layers` contract containers in `pyproject.toml`. 9. `make gen-contract` (spec + frontend client), fix what `make typecheck` reports, label the PR `contract-change`. 10. Update docs and the module table in `01-architecture.md`.

## Commands
`make run`, `make test`, `make lint` (ruff + import-linter), `make format`, `make typecheck`, `make migrate`, `make revision m="msg"`, `make gen-openapi`, `make check-openapi`, `make audit`.
