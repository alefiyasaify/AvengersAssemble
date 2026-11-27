# ExpenseFlow QA

Playwright + TypeScript test automation for ExpenseFlow. The same behaviour is covered two ways:

- **Feature files** (`features/**/*.feature`): Gherkin/Cucumber scenarios, run through
  [playwright-bdd](https://github.com/vitalets/playwright-bdd). Business-readable.
- **Spec files** (`specs/**/*.spec.ts`): hand-written Playwright tests. Faster to write for
  edge cases and API details.

Both run on the same runner, fixtures, Allure reporter and Winston logs. Nothing in `frontend/` or
`backend/` is changed by this pack: the tests follow the code, not the other way round.
Plan and traceability: [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Quick start

```bash
# 1. the stack (from the repo root): backend on :8000, frontend on :3000
make seed && make dev          # or start them your own way

# 2. this pack
cd tests
npm install
npx playwright install chromium
cp env/local.env.example env/local.env      # set EF_DEMO_PASSWORD (the seed prints it once)
npm run test:smoke                          # fast check
npm test                                    # features AND specs, everything
```

## Run it

| Command | What runs |
| --- | --- |
| `npm test` | generates specs from the features, then runs **everything** |
| `npm run test:features` | feature files only (`bdd-api`, `bdd-ui`, `bdd-mobile`) |
| `npm run test:specs` | spec files only (`api`, `ui-desktop`, `ui-mobile`) |
| `npm run test:api` / `npm run test:ui` | spec files, API or browser only |
| `npm run test:smoke` / `test:regression` | by tag, features and specs together |
| `npx playwright test --project=bdd-api -g "Meals"` | one scenario (run `npm run bddgen` once after editing a feature) |
| `npx playwright test specs/policy` | one folder |
| `npm run test:qa` / `test:staging` | another environment (`env/qa.env`, `env/staging.env`) |

Tags: `@smoke @regression @e2e @policy @approvals @payout @security @rbac @audit @ops @claims @ui @mobile @readonly`,
and severity tags on scenarios (`@blocker @critical`).

## Reports

**Allure** (needs Java 8+ for the CLI):

```bash
npm test
npm run allure:generate     # writes allure-report/
npm run allure:open         # or: npm run allure:serve
```

Every test is grouped by epic / feature / story, ranked by severity, carries a `traceability` label
(ARD section, user story or control id), shows the environment on the Overview page, and has its own
**test-log** attachment. Failures are sorted into categories (`allure/categories.json`).
Also written: `playwright-report/` (HTML with traces) and `cucumber-report/index.html` (Gherkin view).

## Logging (Winston): three files in `logs/`

| File | Content | Lifetime |
| --- | --- | --- |
| `app-YYYY-MM-DD.log` | every log line of that day, from every run | one file per day, 30 days kept (`LOG_RETENTION`) |
| `execution.log` | every log line of the **latest run only** | emptied when the next run starts |
| `error.log` | **every failure**: failed tests and steps (with file, project, error), HTTP 5xx, page errors, setup problems | never reset; rolls at 10 MB, 10 files kept |

Console output follows `LOG_LEVEL` (`error|warn|info|debug`, default `info`); `LOG_CONSOLE=false` silences it;
`LOG_DIR` moves the folder. Passwords, tokens, cookies, CSRF values and account numbers are masked.
`debug` adds request and response bodies. Get a logger anywhere with `getLogger('module')`.

## How the pack stays in step with the product

The tests read the product, they never edit it:

- **API shapes** come from `backend/openapi.json` (`src/api/*.service.ts`, `src/api/types.ts`).
  After a contract change, run `npm run typecheck` and fix what it reports.
- **UI selectors** use roles, labels and visible text (the frontend exposes no `data-testid`).
  They live in one place: `src/pages/*.page.ts`. Antd selects are the one exception (CSS class).
- **Rules and thresholds** are asserted from the ARD and `docs/14-ard-alignment.md`; values are not
  duplicated from code except in the boundary tables (at, just below, just above each limit).
- **Status names** (`STATUS`, `STATUS_LABEL`) and city names are in `config/environments.ts`.

## Test users

`auditor` and `head` are the seeded users (set `EF_DEMO_PASSWORD`). The seed does not link its demo
employee to its demo manager, so the pack **creates its own** `employee`, `employee2`, `manager`,
`manager2` and `delegate` through the head's admin API at the start of each run
(`qa.<run id>.<role>@...`, with the reporting lines the scenarios need). They stay in the database
afterwards; use a throwaway database. To use existing accounts instead, set `EF_<ROLE>_EMAIL` and
`EF_<ROLE>_PASSWORD`. Payout tests take their claims from the seed's payable list because the
API cannot create a bank account.

## Structure

```
features/api|ui|mobile/*.feature   Gherkin scenarios (BDD)
src/steps/*.steps.ts               step definitions (claims, approvals, payout-security, ui) + bdd.ts
specs/<suite>/*.spec.ts            hand-written tests: smoke, policy, claims, approvals, payout, security, audit, ops, ui
src/core/                          fixtures.ts, logger.ts (Winston), allure.ts, world.ts (scenario state)
src/api/                           HttpClient (CSRF, idempotency key, session refresh) + one service per area
src/pages/ + src/ui/app.ts         page objects
src/data/                          factories, scenarios, dates, money, receipts, bank-file parser
config/environments.ts             environments, personas, status names
global-setup.ts                    resets execution.log, logs the run header
env/*.env.example                  per-environment settings
```

Add a scenario: write it in a `.feature` file using existing steps (`grep -h "^\(Given\|When\|Then\)" src/steps/*.ts`),
add a step only when the sentence is new. Add a spec: copy a file in `specs/`, import `test`/`expect` from
`src/core/fixtures`, call `describeTest({...})` first for Allure grouping.

## Known product findings this pack reports

See the "Findings" section of [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## CI example (GitHub Actions)

```yaml
- run: npm ci
  working-directory: tests
- run: npx playwright install --with-deps chromium
  working-directory: tests
- run: npm run test:qa
  working-directory: tests
  env:
    EF_DEMO_PASSWORD: ${{ secrets.EF_DEMO_PASSWORD }}
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: reports, path: "tests/allure-results\ntests/playwright-report\ntests/logs" }
```
