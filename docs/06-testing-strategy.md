# 06 Testing Strategy

> **Stack note (2026-11-27, ADR-0012):** E2E and API tests are Playwright + TypeScript in `tests/` (BDD features, specs, Allure; guide `tests/README.md`, plan `tests/docs/TEST_PLAN.md`), not Python/pytest. The frontend has no unit tests yet (AI-017). Passages about Vitest, MSW, Schemathesis and `make e2e` describe the original plan.
> Reconciling the rest of this file is tracked as AI-018.

## Pyramid and ownership
| Layer | Tool | Location | Owner | Runs |
|---|---|---|---|---|
| Backend unit + integration | pytest, Starlette TestClient (httpx2), pytest-cov | `backend/` | Backend | every PR |
| Frontend unit + component | Vitest, RTL, MSW (handlers typed from the generated contract) | `frontend/` | Frontend | every PR |
| API contract / schema fuzz | Schemathesis against `openapi.json` | `tests/contract/` | QA + Backend | every PR |
| End-to-end UI | Playwright (Python, pytest-playwright) | `tests/e2e/` | QA | every PR (smoke), nightly (full) |
| Accessibility | axe-core inside E2E | `tests/e2e/` | QA + Frontend | every PR |
| Non-functional | Lighthouse CI, k6 (optional) | `tests/perf/` | QA | nightly |

Rule of thumb: roughly 70% unit/component, 20% integration/contract, 10% E2E. E2E covers critical user journeys only, not every permutation.

## Principles
- Tests are independent, order-agnostic and parallel-safe. No shared mutable state.
- Deterministic: freeze time, seed randomness, no real third-party calls.
- Test behaviour, not implementation details.
- A bug fix starts with a failing test.
- Tests are code: reviewed, linted, typed.

## Coverage and quality gates
Backend >= 85% lines (100% on `core/security.py`), frontend features/shared >= 80% lines, statements, functions and branches, patch coverage >= 90% on changed lines. Mutation testing (mutmut) optional on core services. CI blocks merges under the gates.

## E2E framework layout (`tests/`)
```
tests/
  pyproject.toml  Makefile  .env.example
  conftest.py            fixtures: base_url, api client, auth state, db reset
  e2e/
    pages/               Page Object Model classes (one per page/component)
    flows/               reusable multi-step actions
    specs/               test_*.py grouped by feature, markers: smoke, regression
  contract/              Schemathesis config and custom checks
  data/                  factories (polyfactory/faker) and static fixtures
  utils/                 helpers (waits, a11y, API seeding)
```
- Selectors: `get_by_role` / `get_by_label` first, `data-testid` only when needed. No XPath or CSS chains tied to layout.
- No `sleep`; use Playwright auto-waiting and web-first assertions (`expect(...).to_be_visible()`).
- Page objects hold locators and actions; assertions live in tests.
- Authenticate once per worker via saved `storage_state`, not per test.
- Capture trace, screenshot and video on first retry; upload as CI artifacts.

## Test data and isolation
- Test environment runs a **dedicated stack and database** (`docker compose --profile e2e`), never the dev DB.
- Seed through the public API or a backend test-only seed command guarded by `APP_ENV=test`.
- Reset between suites by recreating the volume or calling a guarded `/api/v1/test/reset` that exists only when `APP_ENV=test`.
- Each test creates the data it needs with unique names.

Backend integration tests use the `api` fixture in `backend/conftest.py`: a pinned clock (Friday 2026-11-27, so weekend and future-date rules are deterministic), the `people` personas (head, two auditors, two managers, employees, an outsider) and helpers that upload receipts, create, submit and decide claims through the HTTP API. Tests that need a sampled claim use `sample_everything`. `tests/test_seed.py` runs a small seed (80 claims) and asserts every planted case is detected.

## Flaky test policy
A flaky test is a bug. On first flake: quarantine with `@pytest.mark.flaky_quarantine`, open a ticket with an owner and a 5-working-day SLA, keep it out of the required gate but visible on a dashboard. Retries (max 1) exist to collect traces, not to hide problems.

## Environments and execution
Local: root `make e2e` (starts the isolated stack via `tests/` `make stack-up`, runs smoke); inside `tests/`, `make e2e` runs the full regression. CI: stack via compose, `pytest -n auto -m smoke` on PRs, full regression nightly. Cross-browser (Chromium, Firefox, WebKit) nightly; Chromium on PRs.

## Reporting
JUnit XML + HTML report + Playwright traces as artifacts; trend dashboard for pass rate, duration and flake rate.
