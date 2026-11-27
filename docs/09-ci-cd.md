# 09 CI/CD (GitHub Actions)

> **Stack note (2026-11-27, ADR-0012):** there are no CI workflows in `.github/` yet (AI-020, P1-07). Steps that call pnpm, Vitest, `next build` or Python Playwright describe the plan; use `npm` for `frontend/` and `tests/`.
> Reconciling the rest of this file is tracked as AI-018.

## Workflows
| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR, push to main | changes (path filter), backend, frontend, contract, docker-build, e2e-smoke, security |
| `nightly.yml` | schedule | full E2E cross-browser, perf, dependency audit |
| `release.yml` | tag `v*` / release-please | build and push images, publish changelog, deploy to staging |
| `deploy-prod.yml` | manual approval | promote the staging-verified image |

## Job details
- **changes**: `dorny/paths-filter` so frontend-only PRs skip backend jobs (and vice versa), but contract changes trigger both.
- **backend**: setup `uv`, cache, `ruff check`, `ruff format --check`, `mypy`, `import-linter`, `pytest --cov` with the gate, `alembic heads` must be exactly one, migration up/down test on a fresh DB.
- **frontend**: pnpm cache, `eslint`, `tsc --noEmit`, `vitest --coverage`, `next build`.
- **contract**: `make check-contract` (generate OpenAPI and fail on drift vs committed `backend/openapi.json`; regenerate the TS client and fail on drift), then `pnpm typecheck` so UI code that no longer matches the contract fails; `oasdiff breaking` against `main`; Schemathesis run.
- **docker-build**: build both images with Buildx cache; Trivy scan; no push on PRs.
- **e2e-smoke**: `docker compose --profile e2e up -d --wait`, run `pytest -m smoke`, upload report and traces on failure.
- **security**: `gitleaks`, `pip-audit`, `pnpm audit`, CodeQL, dependency review action.

## Conventions
Pin actions by commit SHA, least-privilege `permissions:`, concurrency groups to cancel superseded runs, reusable workflows for repeated steps, secrets only via environment-scoped GitHub secrets, no secrets in logs.

## Required status checks on `main`
`backend`, `frontend`, `contract`, `docker-build`, `e2e-smoke`, `security`, `commitlint`.

## Delivery
Trunk-based continuous integration, automated deploy to staging on merge, manual approval to production, versioned image tags, documented rollback (redeploy previous tag; migrations are backwards compatible so the DB does not roll back).
