# Tests (Playwright + TypeScript, BDD features and specs)

Scope: everything under `tests/`. Root rules in `../CLAUDE.md` also apply. Full guide: `README.md`; plan and traceability: `docs/TEST_PLAN.md`.

Status: scaffolded and running against the real backend and frontend. This replaces the earlier Python/pytest plan (the team chose TypeScript).
The backend's own API-level cases (E2E01-E2E10, bypass controls C2-C13) in `../backend/tests` remain; this pack adds black-box API, UI and BDD coverage on top.

## Stack
Playwright (`@playwright/test`) + TypeScript, `playwright-bdd` (Gherkin features compiled to specs), `allure-playwright` (report), `winston` + `winston-daily-rotate-file` (logs), `dotenv`.

## Commands (run in `tests/`)
- `npm test` features + specs; `npm run test:features` / `npm run test:specs`; `npm run test:smoke`; `npm run test:regression`
- `npm run bddgen` regenerate specs from features (needed after editing a `.feature`; the npm scripts do it)
- `npm run typecheck`; `npm run allure:generate` then `allure:open`; `npm run clean`
- `TEST_ENV=local|qa|staging|demo` selects `env/<name>.env`

## Layout
`features/{api,ui,mobile}` Gherkin; `src/steps` step definitions; `specs/<suite>` hand-written tests; `src/pages` page objects; `src/api` typed services; `src/data` factories and scenarios; `src/core` fixtures, logger, allure helpers, scenario world; `config/environments.ts` env, personas, status names.

## Rules
- Tests follow the product: never edit `frontend/` or `backend/` to make a test pass. API shapes come from `backend/openapi.json`; UI selectors from the real components (roles, labels, visible text; the UI has no `data-testid`). Report missing labels as findings.
- Selectors live in `src/pages`, API calls in `src/api`, assertions in specs and steps. No `sleep`; use web-first assertions and `expect.poll`.
- Tests are independent and create their own uniquely named data. Employees and managers are provisioned per run through the head's admin API (`src/api/session.ts`); payout tests use seeded payable claims (the API cannot create bank accounts).
- Money is integer paise (`inr()`); boundary cases go at, just below, just above each limit. Never hard-code policy values in the UI or services; the boundary tables in specs and features are the only place.
- Logs: `logs/app-YYYY-MM-DD.log` (daily), `logs/execution.log` (latest run only), `logs/error.log` (all failures). Do not log secrets; `getLogger()` masks sensitive keys.
- Tag every test (`@smoke`, `@regression`, area tag); mark tests that only read data `@readonly` (the only ones that run when `EF_READ_ONLY=true`).
- Error responses must match the envelope in `docs/02` (`error.code` is `UPPER_SNAKE`, `error.request_id` equals `X-Request-ID`).

## Don'ts
- Never point the pack at the dev database; use a seeded throwaway database (it leaves `qa.*` users behind).
- Never rely on test order or data from other tests.
- Never hit third-party services.
- Never commit `env/*.env`, `logs/`, `allure-*`, `.features-gen/`.
