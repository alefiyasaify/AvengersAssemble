# Avengers Assemble

## Overview
**ExpenseFlow** - expense claims with policy-driven approvals for a mid-size services company. Employees capture claims (line items + receipts) on phone or desktop; a configurable policy engine auto-approves, routes or auto-rejects; claims route manager -> finance auditor -> finance head; auditors work a review queue with a 10% sample audit; the finance head exports payout batches as a bank CSV. Personas: employee, line manager, finance auditor, finance head (admin). **Contract: the ARD** (`ExpenseFlow-Architecture Requirements Document (ARD).pdf`, ADR-0011); gaps vs code: `docs/14-ard-alignment.md`.

Current state: see `PROGRESS.md` and `PLAN.md` (Phase 2: backend domain re-aligned to the ARD in A-0007; frontend features are Phase 3).

## Business rules (summary - the ARD is authoritative; never hard-code policy values)
- Money is INR in integer **paise**; "above X" means strictly greater; "up to X" means a value at X passes.
- Policy is data (ARD 5): versioned `policy_versions` + `policy_rules`, `approval_levels`, `app_config`, seeded from `backend/app/seeds/reference_data.json`. Meals <= 1,500/day (IST day, all claims), hotel <= 6,000/night tier-1 else 4,000, local cab <= 2,000/trip and receipt mandatory > 500 are REJECT; duplicates (vendor+amount+date or receipt SHA-256) ROUTE and force the auditor; weekend (Sat/Sun IST) FLAG; SPLIT_SUSPECT routes to the auditor; CLAIM_AGE_LIMIT is seeded inactive.
- Outcomes: a rejected line is excluded from the payable total; all lines rejected -> REJECTED; all lines clean and payable <= 5,000 -> APPROVED (independent 10% CSPRNG sample, held from payout until resolved); otherwise the chain.
- Chain (ADR-001 in the ARD): manager always; + auditor (pool) if payable > 25,000; + finance head if > 1,00,000; levels frozen on the claim at submit; one open step at a time. Send back -> new round on resubmit, earlier steps SUPERSEDED.
- Separation of duties: never act on your own claim (also as a delegate); one person approves at most one level per claim; delegation is per level, max 30 days, same-or-higher role. Gaps the ARD leaves are decided in docs/14 section E.
- Visibility: employees see only their own claims (404 otherwise); managers their direct and indirect reports' submitted claims; auditor/head all. Enforced in services, never only in the UI.
- Claim states and allowed transitions: ARD section 4, `claims/state.py`, and the `claim_transitions` DB trigger.
- Every state change writes one hash-chained `audit_events` row in the same transaction; DB triggers block update/delete.

## Repo map
- `frontend/` Next.js 16 (App Router, React 19, TypeScript) UI. See `frontend/CLAUDE.md`
- `backend/` FastAPI + SQLAlchemy + SQLite. See `backend/CLAUDE.md`
- `tests/` Playwright E2E + API contract tests (Python, pytest). See `tests/CLAUDE.md` (not scaffolded yet)
- `docs/` design docs (`00`..`12`), ADRs (`docs/adr/`), agent prompts (`docs/prompts/`). See `docs/CLAUDE.md`
- `scripts/` repo tooling: `install-prereqs.ps1` (Windows setup), `doctor.sh` (`make doctor`)
- Tracking: `PLAN.md` (intent), `ACTIONS.md` (log + action items), `PROGRESS.md` (status), `WORKFLOW.md` (rules), `SKILLS.md` (agent skills + team matrix)

## Boundaries (non-negotiable)
1. Frontend and backend talk ONLY through the HTTP API described by the OpenAPI spec (`backend/openapi.json`).
2. Frontend never imports backend code; backend never imports frontend code.
3. Only backend code touches the database. Schema changes only via Alembic migrations.
4. Generated code (`frontend/src/shared/api-client/generated/`, `backend/openapi.json`) is never edited by hand.
5. Each package owns its own dependencies, env file, Dockerfile and tests.

## Key decisions (ADRs in `docs/adr/`)
Monorepo (0001), contract-first OpenAPI (0002), SQLite (0003), Next.js `/api` rewrite proxy (0004), Python Playwright tests (0005), HttpOnly-cookie JWT auth (0006), UUIDv7 ids (0007), frontend API access paths + build-time config (0008).

## Ports and config
Frontend `3000`, backend `8000`. Each service has its own `.env` (gitignored) and a committed `.env.example`; `backend/.env` needs a `SECRET_KEY`.
Browser calls `/api/*` on the frontend origin; Next.js rewrites proxy it to the backend. Server components call `BACKEND_INTERNAL_URL` directly (ADR-0008). Frontend config is fixed at `next build`.

## Common commands (run from repo root; on Windows use Git Bash)
- `make doctor` check prerequisites (`scripts/install-prereqs.ps1` installs them on Windows)
- `make setup` install everything
- `make dev` run backend and frontend locally
- `make up` / `make down` run the full stack in Docker (after P1-06)
- `make test` / `make lint` / `make typecheck` run all checks
- `make gen-openapi` export the OpenAPI spec, `make gen-client` regenerate the TS client, `make gen-contract` both
- `make check-contract` fail if the spec or the TS client is out of sync with the backend code
- `make migrate` apply migrations, `make seed` load the demo data into an empty DB, `make e2e` start the e2e stack and run the Playwright smoke suite (after P1-05)

## Workflow
- Follow `WORKFLOW.md`: work from a `PLAN.md` task, log every PR/session in `ACTIONS.md`, update task status.
- Branches: `feat/<ticket>-<slug>`, `fix/...`, `chore/...`, `docs/...`. Short-lived, branch from `main`.
- Conventional Commits (`feat(backend): add order module`). Squash merge.
- Every PR: green CI, one approval, CODEOWNERS review, updated docs and `CLAUDE.md` if conventions changed.
- Contract changes (anything altering `openapi.json`) get label `contract-change` and need frontend AND backend approval. Run `make gen-contract` and fix what `make typecheck` reports in the same PR.

## Never do
- Commit `.env`, `*.db`, `*.db-wal`, `*.db-shm`, secrets or tokens.
- Edit an Alembic migration that has been merged to `main`; add a new one.
- Make a breaking change under `/api/v1`; add `/api/v2` or an additive change.
- Disable lint, type or test checks to get a PR green.
- Add a dependency without stating why in the PR description.

## Read before changing things
@docs/01-architecture.md
@docs/02-api-contract.md
@docs/10-definition-of-done.md
@WORKFLOW.md
