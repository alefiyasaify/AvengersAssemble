# Agent Prompts: scaffold the repo with Claude Code

## Status of these prompts (2026-11-27)
Prompts 0 to 3 are done (A-0001 to A-0004); the contract part of Prompt 4 is done (`make gen-contract`, `make check-contract`), the breaking-change and mock parts are open (P1-04). Prompts 5 to 8, 10 and 11 are open (PLAN P1-05..P1-10). Prompt 9 (vertical slice) was replaced by the ExpenseFlow domain, built to the ARD (A-0006, A-0007); when running the remaining prompts, treat the ARD, `docs/13` and `docs/14` as the domain source of truth.

## How to use
1. Create an empty folder, copy this pack into it (it already contains `CLAUDE.md`, `docs/`, and the package `CLAUDE.md` files), open Claude Code there.
2. Fill in `docs/00-project-overview.md` and the Overview section of `CLAUDE.md` first.
3. Run the prompts **in order**, one per session or one after another. Start each in plan mode (Shift+Tab) for a quick review, then approve.
4. After each prompt: run the stated checks, review the diff, commit with the suggested message. Do not batch prompts.
5. If the agent drifts from the guidelines, reply: "Re-read CLAUDE.md and the referenced docs, then fix the deviations."

Global rules the agent must follow in every prompt are in `CLAUDE.md`. Each prompt below also restates the essentials so it works standalone.

---

## Prompt 0: Orientation (read-only)
```
Read CLAUDE.md, docs/00 through docs/12, docs/adr/*, and the CLAUDE.md in each package folder.
Do NOT write any code yet.
Produce:
1. A summary of the architecture and boundaries in under 20 lines.
2. A list of any ambiguities, conflicts or gaps between the docs.
3. A proposed module breakdown (backend modules and frontend features) derived from docs/00-project-overview.md, with owners and dependencies between modules.
4. The exact order of files you will create in the next prompts.
Wait for my approval before proceeding.
```

## Prompt 1: Repository bootstrap and git
```
Follow CLAUDE.md and docs/07-git-workflow.md. Set up the repository foundation only (no app code).
Tasks:
1. `git init -b main`. Create `.gitignore` per docs/07 (includes .env, *.db, *.db-wal, *.db-shm, data/, node_modules, .next, .venv, caches, playwright-report, test-results, coverage, CLAUDE.local.md), `.gitattributes` (normalize line endings, mark generated files as `linguist-generated`), `.editorconfig`.
2. Create the folder skeleton: frontend/, backend/, tests/, docs/ (keep the existing docs and CLAUDE.md files; add `.gitkeep` only where needed).
3. Root `Makefile` with targets: setup, dev, up, down, test, lint, typecheck, gen-openapi, gen-client, migrate, e2e, mock-api. Each target delegates to the package Makefile or script; targets whose package is not scaffolded yet print a clear TODO and exit 0.
4. `.github/CODEOWNERS` (use the example in docs/07 with placeholder team names), `.github/pull_request_template.md` (what/why, ticket, test evidence, screenshots, risk, rollback, docs and CLAUDE.md updated, contract-change checkbox, security checklist), issue templates (bug, feature).
5. `.pre-commit-config.yaml` (ruff, ruff-format, eslint/prettier via local hooks that skip if the package is absent, commitlint, gitleaks, check-added-large-files, end-of-file-fixer, and a local hook that blocks committing *.db and .env files). Add `commitlint.config.js` with Conventional Commits and scopes frontend, backend, tests, docs, infra, contract.
6. Root `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md` (Keep a Changelog format), `SECURITY.md`, `LICENSE` placeholder.
Acceptance: `git status` clean after commit, `make help` lists targets, pre-commit config validates (`pre-commit validate-config` if installed).
Commit: `chore(infra): bootstrap repository`
```

## Prompt 2: Backend scaffold
```
Work only inside backend/ (plus the root Makefile delegation). Follow backend/CLAUDE.md, docs/03-database.md, docs/05-backend-guidelines.md, docs/02-api-contract.md.
Create a production-grade FastAPI skeleton:
1. `pyproject.toml` managed by uv (Python 3.12): fastapi, uvicorn[standard], pydantic v2, pydantic-settings, sqlalchemy>=2, alembic, argon2-cffi, pyjwt; dev: pytest, pytest-cov, httpx, ruff, mypy, import-linter, pip-audit. Configure ruff (rules E,F,I,B,UP,SIM,S,C90,ASYNC,PT), mypy strict, pytest, coverage gate 85%. Commit `uv.lock`.
2. `app/main.py` app factory: mounts routers under `/api/v1`, request-id middleware, JSON structured logging, CORS from settings (explicit origins), exception handlers producing the standard error envelope.
3. `app/core/`: `config.py` (Settings via pydantic-settings; APP_ENV, DATABASE_URL default sqlite:///./data/app.db, SECRET_KEY, CORS_ORIGINS, LOG_LEVEL), `db.py` (engine, session factory, connect-event setting WAL, foreign_keys=ON, busy_timeout=5000, synchronous=NORMAL; `get_db` dependency; MetaData naming convention; declarative Base with id/created_at/updated_at mixins), `errors.py` (domain exceptions + handlers), `logging.py`, `security.py` (argon2 hashing, JWT helpers), `deps.py`.
4. `app/modules/health/` implementing `GET /api/v1/health/live`, `/health/ready` (checks DB), and `GET /api/v1/version`, following the router/schemas/service layering.
5. `app/modules/_template/` with a documented skeleton (router, schemas, service, repository, models, deps, tests) used when adding modules; excluded from route registration.
6. Alembic configured with `render_as_batch=True`, env.py using app metadata and settings, an initial empty baseline migration.
7. `scripts/export_openapi.py` writing deterministic (sorted keys, indent 2) `backend/openapi.json`.
8. import-linter contracts enforcing: core never imports modules; modules import other modules only via `service`; no module imports another module's repository or models.
9. `tests/conftest.py` with a temp-file SQLite DB migrated via `alembic upgrade head`, per-test rollback, TestClient fixture; tests for health endpoints, error envelope, request-id header, PRAGMAs applied.
10. `Makefile` with run, test, lint, typecheck, migrate, revision, gen-openapi, audit. `.env.example` fully documented. `backend/README.md`.
Acceptance (run them and show output): `make lint`, `make typecheck`, `make test` (coverage >= 85%), `make migrate`, `make gen-openapi` produces openapi.json, `lint-imports` passes, server starts and `/api/v1/health/ready` returns 200.
Commit: `feat(backend): scaffold FastAPI service`
```

## Prompt 3: Frontend scaffold
```
Work only inside frontend/ (plus root Makefile delegation). Follow frontend/CLAUDE.md and docs/04-frontend-guidelines.md and docs/02-api-contract.md.
1. Create a Next.js (current stable) App Router project with TypeScript strict, `src/` dir, Tailwind, ESLint, pnpm, Node LTS (`.nvmrc`, `engines`). Commit lockfile.
2. Add: @tanstack/react-query, react-hook-form, zod, @hookform/resolvers, openapi-typescript, openapi-fetch, shadcn/ui setup; dev: vitest, @testing-library/react, @testing-library/jest-dom, msw, prettier, eslint-plugin-jsx-a11y, eslint-plugin-boundaries (or no-restricted-paths), @stoplight/prism-cli.
3. Structure: `src/app` (layout, page, loading, error, not-found), `src/features/` (empty, with a documented `_template/` feature), `src/shared/{ui,api-client,lib,hooks,config}`.
4. `next.config.ts`: `output: "standalone"`, `rewrites()` proxying `/api/:path*` to `${BACKEND_INTERNAL_URL}/api/:path*` (default http://localhost:8000), security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors).
5. `shared/config/env.ts` validating env with zod (server vs public split). `.env.example` documented.
6. API client: script `pnpm gen:client` runs openapi-typescript on `../backend/openapi.json` into `src/shared/api-client/generated/` (add a header "GENERATED - DO NOT EDIT"); `client.ts` creates the single openapi-fetch instance with baseUrl "" and an `ApiError` mapper for the backend error envelope; a React Query provider in `src/app/providers.tsx`.
7. ESLint boundary rules enforcing app -> features -> shared and features-only-via-index.ts; ban `any`; ban direct `fetch` to `/api` outside shared/api-client.
8. A home page that calls the health endpoint through a `features/system-status` feature (hook + component) to prove the stack end to end; tests with Vitest/RTL/MSW using generated types.
9. Scripts: dev, build, start, lint, typecheck, test, gen:client, mock:api (Prism on port 4010). Coverage gate 80% for features and shared. `frontend/README.md`.
Acceptance (run and show): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` succeed; with the backend running, the home page shows status through the proxy with no CORS configuration.
Commit: `feat(frontend): scaffold Next.js app`
```

## Prompt 4: Contract pipeline
```
Implement the contract tooling described in docs/02-api-contract.md. Touch only root Makefile, scripts/, .github/workflows/ (contract job file only), and package scripts already created.
1. `make gen-openapi` and `make gen-client` work from the repo root and are deterministic.
2. `scripts/check-contract-drift.sh`: regenerates openapi.json and the TS client into temp locations and fails with a clear message if either differs from what is committed.
3. `scripts/check-breaking.sh`: runs `oasdiff breaking` between `origin/main:backend/openapi.json` and the working copy; fails unless the PR has the `breaking-approved` label (read from an env var set by CI).
4. `make mock-api`: Prism serving the spec on :4010 so the frontend can work without the backend.
5. Document the workflow in docs/02-api-contract.md only if you find a mismatch with reality, and mention it in your summary.
Acceptance: introduce a temporary schema change, show that the drift check fails, regenerate, show it passes, then revert the temporary change.
Commit: `ci(contract): add spec drift and breaking-change checks`
```

## Prompt 5: Test automation framework
```
Work only inside tests/ (plus root Makefile delegation). Follow tests/CLAUDE.md, docs/06-testing-strategy.md and ADR-0005.
1. Python 3.12 project with uv: pytest, pytest-playwright, pytest-xdist, pytest-html, schemathesis, polyfactory, faker, axe-playwright-python, httpx, ruff, mypy. Install Chromium (and Firefox/WebKit via a separate target).
2. Layout exactly as in docs/06: `e2e/{pages,flows,specs}`, `contract/`, `data/`, `utils/`, `conftest.py`.
3. `conftest.py`: settings from env (BASE_URL default http://localhost:3000, API_URL default http://localhost:3000/api/v1), an API client fixture, authenticated `storage_state` fixture (skipped until auth exists), trace/screenshot/video on first retry, markers `smoke`, `regression`, `flaky_quarantine`, strict markers.
4. A BasePage class and `HomePage` page object; a smoke spec verifying the home page loads, shows system status, has no console errors, and passes an axe accessibility check with no serious violations.
5. Contract tests: Schemathesis run against `../backend/openapi.json` targeting API_URL with stateful links disabled for now; a custom check that all error responses match the standard error envelope.
6. Guarded test helpers: document (do not expose yet) the `APP_ENV=test` reset approach; no direct DB access from tests.
7. `Makefile`: stack-up, stack-down, e2e-smoke, e2e, contract, lint, typecheck. HTML + JUnit reports under `test-results/`. `.env.example`, `tests/README.md`.
Acceptance (run and show): with the stack running, `make e2e-smoke` and `make contract` pass; `make lint` and `make typecheck` pass.
Commit: `test(tests): add Playwright and contract test framework`
```

## Prompt 6: Docker and compose
```
Follow docs/08-docker-and-environments.md. Do not change application logic.
1. `backend/Dockerfile` multi-stage (builder with uv, slim runtime), non-root user, HEALTHCHECK on /api/v1/health/live, entrypoint script that runs `alembic upgrade head` then uvicorn with 1 worker. `backend/.dockerignore`.
2. `frontend/Dockerfile` multi-stage (deps, build, runtime) using Next standalone output, non-root user, `BACKEND_INTERNAL_URL` as ARG and ENV, HEALTHCHECK. `frontend/.dockerignore`.
3. `tests/Dockerfile` based on the official Playwright Python image for running the suites in the e2e profile.
4. Root `docker-compose.yml`: services backend and frontend (frontend depends_on backend healthy), named volume `backend-data` mounted at /app/data, per-service `env_file`, restart policy, resource limits, read-only root FS with tmpfs where required. Profiles: default (app), `dev` (bind mounts + `develop.watch` hot reload), `e2e` (separate volume, APP_ENV=test, test runner service).
5. Make targets `up`, `down`, `logs`, `e2e` (compose-based).
6. Pin base images to specific versions (note digests as a TODO for production).
Acceptance (run and show): `docker compose build`, `docker compose up -d --wait`, the home page works at http://localhost:3000 through the proxy, `docker compose down` and `up` again keeps the SQLite data (volume), containers run as non-root (`docker compose exec backend id`).
Commit: `build(infra): containerize services with compose`
```

## Prompt 7: CI workflows
```
Follow docs/09-ci-cd.md. Create GitHub Actions only.
1. `.github/workflows/ci.yml` with path-filtered jobs (changes, backend, frontend, contract, docker-build, e2e-smoke, security) exactly as described, with caching, concurrency cancellation, least-privilege `permissions`, and actions pinned by commit SHA (add a comment with the version).
2. `.github/workflows/nightly.yml`: full E2E on Chromium, Firefox, WebKit, dependency audits.
3. `.github/workflows/release.yml`: release-please driven changelog/tags, build and push images tagged with semver and SHA to GHCR.
4. `.github/dependabot.yml` for pip (backend, tests), npm (frontend), github-actions, docker.
5. Document required status checks and branch protection settings in `docs/07-git-workflow.md` only if something is missing, and list them in your summary.
Acceptance: validate YAML (`actionlint` if available), explain each job's trigger and what failure means. No secrets in files.
Commit: `ci(infra): add CI, nightly and release workflows`
```

## Prompt 8: Claude Code project configuration
```
Create the Claude Code project setup so every team member gets the same guardrails.
1. `.claude/settings.json`: allow common safe commands (make targets, pnpm scripts, uv run, pytest, ruff, mypy, git status/diff/log, docker compose ps/logs); deny reading or editing `.env*`, `*.db*`, `frontend/src/shared/api-client/generated/**` (edit), and applied migration files under `backend/app/migrations/versions/` that exist on main; deny `git push --force`, `rm -rf` outside build dirs.
2. Hooks: a PostToolUse hook running ruff format on edited Python files and prettier on edited frontend files; a PreToolUse hook blocking edits to generated client files and `.env` files with a clear message.
3. Slash commands in `.claude/commands/`: `new-module` (backend module from template + migration + tests + openapi + client regen), `new-feature` (frontend feature from template), `gen-contract` (regenerate openapi and client and run drift check), `review-pr` (review the current diff against docs/10-definition-of-done.md and the boundary rules), `add-adr` (create next ADR from the template).
4. Ensure `CLAUDE.local.md` is gitignored and add a note in docs/11-onboarding.md on personal overrides.
Acceptance: show each file and explain what each rule prevents.
Commit: `chore(infra): add Claude Code settings, hooks and commands`
```

## Prompt 9: Vertical slice (proves the architecture)
```
Implement ONE small end-to-end feature to validate all conventions. Use the first Must-have feature from docs/00-project-overview.md, or if none is defined, a simple "items" resource (id, name, description, status, created_at, updated_at) with list (paginated), get, create, update, delete.
Backend: new module from `_template` with models, Alembic migration, schemas (Create/Update/Read), repository, service, router following docs/02 and docs/05; tests at all three levels; coverage gate still met.
Contract: `make gen-openapi`, `make gen-client`, drift check passes.
Frontend: new feature folder with API hooks, list page with loading/error/empty states, create/edit form (react-hook-form + zod, field errors from the error envelope), delete with confirmation; component tests with MSW; accessible and keyboard-operable.
Tests: Page object and smoke + regression E2E specs for create/edit/delete, an axe check, and Schemathesis passing for the new endpoints.
Work in this order and commit each step separately: (1) backend, (2) contract, (3) frontend, (4) e2e. Stop and report if any guideline blocks you instead of bending it.
Acceptance: `make lint typecheck test`, `make up` then `make e2e` all pass.
```

## Prompt 10: Final audit
```
Act as a skeptical staff engineer. Audit the repository against CLAUDE.md, docs/01-architecture.md, docs/10-definition-of-done.md and the package CLAUDE.md files.
Check and report PASS/FAIL with evidence (file paths, command output) for:
- Boundaries: no cross-imports between frontend and backend; backend module layering enforced by import-linter; no DB access outside repositories; no shared env files.
- Contract: openapi.json and generated client in sync; operationIds unique and conventional; every endpoint has response models and error responses.
- Database: PRAGMAs applied, single Alembic head, migrations upgrade from empty DB, no *.db tracked by git.
- Quality gates: lint, typecheck, tests, coverage thresholds all pass.
- Containers: non-root, health checks, data persists across restarts, images build from clean checkout.
- Git: .gitignore completeness, hooks work, commit history follows Conventional Commits, CODEOWNERS covers every top-level path.
- CI: workflows valid, actions pinned, required checks documented.
- Docs: every command in the docs actually works as written; list any drift.
Fix trivial issues directly (separate commit each); list non-trivial ones with proposed solutions. Do not hide failures.
```

## Prompt 11: Tracking commands, progress snapshot and agent skills
```
Follow WORKFLOW.md, PROGRESS.md and SKILLS.md. Create tooling only; do not change app code.
1. `scripts/progress.py` (stdlib only): read the task tables in PLAN.md (IDs `P<phase>-<nn>`, ignore placeholder rows like `P3-xx`) and ACTIONS.md (open action items, last log entry) and rewrite the block between `<!-- PROGRESS:START -->` and `<!-- PROGRESS:END -->` in PROGRESS.md: per-phase counts by status, % done, open action items, blockers, last entry. `--check` exits 1 if the block is stale. Root `make progress` runs it.
2. `scripts/check-tracking.sh`: fail when a diff against the base branch touches `frontend/`, `backend/`, `tests/` or infra files without touching ACTIONS.md, unless the PR has the `skip-tracking` label (env var from CI).
3. Slash commands in `.claude/commands/`: `session-start` (read CLAUDE.md, PLAN.md, last 10 ACTIONS entries; state the task ID), `log-action` (append an ACTIONS entry in the documented format with exact commands and results), `session-end` (log-action + PLAN status + `make progress` + summary), `plan-status` (summarise PLAN/PROGRESS).
4. Skills in `.claude/skills/<name>/SKILL.md` for the SKILLS.md catalog: new-backend-module, new-frontend-feature, contract-sync, db-migration, add-e2e-journey, review-pr, tracking-update. Each: files to read, numbered steps, don'ts, verification commands, tracking step; link to docs instead of copying them.
5. Update SKILLS.md (status), WORKFLOW.md section 6 and docs/10 if anything differs from reality.
Acceptance (run and show): `make progress` updates PROGRESS.md and `python scripts/progress.py --check` passes; check-tracking fails on a code-only diff and passes with an ACTIONS entry; each skill and command file listed with its purpose.
Commit: `chore(infra): add tracking commands, progress snapshot and agent skills`
```

---

## Reusable prompts for day-to-day work

### Add a backend module
```
Add backend module `<name>` for <purpose>. Follow backend/CLAUDE.md and docs/05. Use modules/_template. Include models + Alembic migration (reviewed by hand), schemas, repository, service, router, tests at all layers. Then run make gen-openapi && make gen-client, run all checks, and summarize contract changes for the frontend team. Stay inside backend/ except generated artifacts.
```

### Add a frontend feature
```
Add frontend feature `<name>` for <purpose>, consuming these endpoints from backend/openapi.json: <operationIds>. Follow frontend/CLAUDE.md and docs/04. Use features/_template. Include hooks, components with loading/error/empty states, forms with zod, tests with MSW, accessibility checks. Do not touch backend/. If an endpoint is missing or wrong, stop and list the contract changes needed instead of working around them.
```

### Add E2E coverage for a journey
```
Add E2E coverage for journey "<journey>" in tests/. Follow tests/CLAUDE.md. Create or extend page objects, write independent specs with self-created data, mark smoke vs regression, include an axe check. Do not modify frontend or backend code; report any missing data-testid or accessibility gaps as findings.
```

### Code review
```
/review-pr: Review the current branch diff against docs/10-definition-of-done.md, the boundary rules in CLAUDE.md and the relevant package CLAUDE.md. Output: blocking issues, non-blocking suggestions, missing tests, contract and migration risks, security concerns. Be specific with file:line references.
```
