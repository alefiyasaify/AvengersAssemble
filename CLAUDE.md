# Avengers Assemble

## Overview
**ExpenseFlow** - expense claims with policy-driven approvals for a mid-size services company. Employees capture claims (line items + receipts) on phone or desktop; a configurable policy engine auto-approves, routes or auto-rejects; claims route manager -> finance auditor -> finance head; auditors work a review queue with a 10% sample audit; the finance head exports payout batches as a bank CSV. Personas: employee, line manager, finance auditor, finance head (admin). **Contract: the ARD** (`ExpenseFlow-Architecture Requirements Document (ARD).pdf`, ADR-0011); gaps vs code: `docs/14-ard-alignment.md`.

Current state: see `PROGRESS.md` and `PLAN.md` (Phase 2: backend domain).

## Business rules (summary - the ARD is authoritative; never hard-code policy values)
> Being re-aligned to the ARD (docs/14). Where a line below differs from the ARD, the ARD wins.
- Money is INR in integer **paise**; "above X" means strictly greater.
- Policy rules live in versioned JSON (`policy_versions`, seed `backend/app/seeds/policy_v1.json`, ADR-0010): meals <= 1,500/day, hotel <= 6,000/night tier-1 else 4,000, local cab <= 2,000/trip, receipt mandatory > 500, duplicates (vendor+amount+date or receipt hash), weekend flag, stale > 90 days.
- Outcomes: any line auto-reject -> claim rejected; all clean and total <= auto-approve limit -> approved (10% sampled for audit, held from payout until cleared); otherwise routed.
- Chain (ADR-0009): manager always; + finance auditor if total > 25,000; + finance head if total > 1,00,000. Comment, send back (restarts chain on resubmit), delegate while on leave.
- Separation of duties: no self-approval (also via delegate); one person acts on at most one step per claim; only the lowest pending step is actionable.
- Visibility: employees see only their own claims; managers also their reports' and their inbox; auditor/head see all. Enforced in services, never only in the UI.
- Claim states and allowed transitions: `docs/13` (single transition table in `claims/state.py`).
- Every action appends to `audit_events`; no update/delete path (DB triggers block it).

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
- `make migrate` apply migrations, `make e2e` start the e2e stack and run the Playwright smoke suite (after P1-05)

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
