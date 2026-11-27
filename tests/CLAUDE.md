# Tests (Playwright E2E + contract)

Scope: everything under `tests/`. Root rules in `../CLAUDE.md` also apply.

Status: not scaffolded yet (PLAN P1-05). Until then this file is the spec for that step.

## Stack
Python 3.12, pytest, pytest-playwright, pytest-xdist, Schemathesis, polyfactory/faker, axe-playwright, uv, Ruff, mypy.

## Commands (run in `tests/`)
- `make e2e-smoke` run `-m smoke` against the running stack
- `make e2e` full regression (the ROOT `make e2e` instead runs `stack-up` + `e2e-smoke`), `make contract` Schemathesis against `../backend/openapi.json`
- `make stack-up` / `make stack-down` start/stop the isolated test stack (`docker compose --profile e2e`)
- `make lint`, `make typecheck`

## Layout
`e2e/pages` page objects, `e2e/flows` reusable actions, `e2e/specs` tests, `contract/`, `data/` factories, `utils/`, `conftest.py` fixtures.

## Rules
- Selectors: `get_by_role` / `get_by_label` first; `data-testid` only when necessary; no layout-bound CSS/XPath.
- No `sleep`; use web-first assertions and auto-waiting.
- Assertions live in tests, locators and actions in page objects.
- Tests are independent, parallel-safe and order-agnostic; each creates its own uniquely named data via API/seed helpers.
- Authenticate once via `storage_state`, not per test.
- Markers: `smoke`, `regression`, `flaky_quarantine`. Flaky test = bug: quarantine, ticket, 5-day SLA.
- Config via env (`BASE_URL` default `http://localhost:3000`, `API_URL` default `http://localhost:3000/api/v1`, i.e. through the frontend proxy like a browser); `.env.example` committed.
- Prefer accessible selectors that already exist in the UI (e.g. the home page `region` "System status" and its `Operational`/`Unavailable` badge); report missing labels as findings instead of adding test ids silently.
- Error responses must match the envelope in `docs/02` (`error.code`, `error.message`, `error.request_id` = `X-Request-ID`).
See `@../docs/06-testing-strategy.md`.

## Don'ts
- Never touch or point at the dev database; the e2e stack has its own volume.
- Never rely on test execution order or on data from other tests.
- Never hit third-party services; stub them.
- Never expose `/api/v1/test/*` helpers outside `APP_ENV=test`.
