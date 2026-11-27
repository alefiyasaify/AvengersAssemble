# ACTIONS

> Two parts: **open action items** (things someone must do) and an **append-only action log** (things that were done).
> Rules are in `WORKFLOW.md`. Append at the **bottom** of the log. Never rewrite or delete old entries; correct them with a new entry.

## 1. Open action items
Status values: `todo`, `in-progress`, `blocked`, `done`, `dropped`. Move finished items to `done` (keep the row), then log the work below.

| ID | Action | Owner | Area | Due | Status | Link |
|---|---|---|---|---|---|---|
| AI-001 | Fill docs/00-project-overview.md and the Overview in CLAUDE.md | | docs | | done | Filled from UseCase.docx (A-0006) |
| AI-002 | Replace placeholder team names in .github/CODEOWNERS | | infra | | todo | |
| AI-003 | Decide hosting target for staging/production | | infra | | todo | PLAN D-002 |
| AI-004 | Recreate git history in the cloned repo: commit P1-01 (`chore(infra): bootstrap repository`) and P1-02 (`feat(backend): scaffold FastAPI service`) separately | | infra | | todo | A-0002, A-0003 |
| AI-005 | Add the tracking enforcement WORKFLOW.md describes but the repo lacks: `ACTIONS.md merge=union` in .gitattributes, "Tracking updated" PR-template checkbox, `scripts/check-tracking.sh`, tracking items in docs/10 | | infra | | in-progress | WORKFLOW.md s6. Done in A-0005: union merge, PR checkbox, docs/10 items. Left: `scripts/check-tracking.sh` + CI (Prompt 11, P1-07) |
| AI-006 | Install pnpm (`winget install pnpm.pnpm` or `scripts/install-prereqs.ps1`) before P1-03; start Docker Desktop before P1-06 | | infra | | in-progress | pnpm done (12.23); Docker daemon still stopped |
| AI-007 | Move the frontend CSP to per-request nonces (proxy.ts) and drop `'unsafe-inline'` scripts; requires dynamic rendering, measure the cost | | frontend | | todo | ADR-0008 |
| AI-009 | Implement `scripts/progress.py` + `make progress` so the PROGRESS.md snapshot is generated, not hand-written | | infra | | todo | Prompt 11, P1-09 |
| AI-010 | Re-align backend domain to the ARD (docs/14 section B), then write integration tests; coverage gate currently fails (63.96% < 85%) | | backend | | done | A-0007: 168 tests, coverage 86.97%; remaining gaps listed in docs/14 E |
| AI-012 | Regenerate the frontend client from the new `backend/openapi.json` (`make gen-contract`, fix `make typecheck`) in a frontend PR with label `contract-change` | | frontend | | todo | A-0007; `make check-contract` fails until then |
| AI-013 | Store `Idempotency-Key` + response for 24 h on mutating endpoints (ARD 7, C12) | | backend | | todo | A-0007, docs/14 E |
| AI-014 | Integration tests for auth (login/lockout/refresh), org admin and policy admin endpoints (coverage 33-52% in those services) | | backend | | todo | A-0007 |
| AI-015 | Team sign-off on docs/14 E1-E9 (rules built where the ARD is silent) | | docs | | todo | PLAN Q-04 |
| AI-011 | Frontend features per ARD section 9 after the API matches the ARD | | frontend | | todo | docs/14 section D |
| AI-008 | Real-browser check of the home page status card (deferred: Edge would not launch under automation here); cover it in the P1-05 smoke spec | | tests | | todo | A-0004 |

## 2. Action log (append-only, newest at the bottom)

### Entry format
```
### A-NNNN | YYYY-MM-DD | <area> | <short title>
- By: <human name> | agent (<tool/model>) on behalf of <human name>
- Type: feat | fix | refactor | docs | test | build | ci | chore | decision | contract | migration | incident
- Plan refs: <P1-02, D-001, ...>
- Branch / PR / commits: <branch>, #<PR>, <short SHAs>
- What changed: <1-4 lines, factual>
- Files/areas touched: <paths or modules>
- Contract impact: none | additive | breaking (describe)
- Migration: none | <revision id>
- Verification: <commands run and result, e.g. make test: pass>
- Follow-ups: <new AI-xxx items or "none">
```
`area` is one of: `frontend`, `backend`, `tests`, `docs`, `infra`, `contract`, `plan`.
IDs: take the next number after the last entry. If two entries collide after a merge, the later one is renumbered in a new correction entry.

---

### A-0001 | 2026-11-27 | docs | Guideline pack created
- By: agent (Claude) on behalf of <human name>
- Type: docs
- Plan refs: P0 (Phase 0)
- Branch / PR / commits: n/a (not yet in git)
- What changed: Created CLAUDE.md files (root, backend, frontend, tests, docs), docs 00-12, ADR template and ADR-0001 to 0005, agent prompts, and the tracking files PLAN.md, WORKFLOW.md, ACTIONS.md.
- Files/areas touched: whole pack
- Contract impact: none
- Migration: none
- Verification: files reviewed by author: pending
- Follow-ups: AI-001, AI-002, AI-003

### A-0002 | 2026-11-27 | infra | Repository bootstrap and developer prerequisites
- By: agent (Claude Code, claude-opus-5-5) on behalf of the project lead
- Type: chore
- Plan refs: P1-00, P1-01
- Branch / PR / commits: none. A local commit was made, then the user deleted `.git` on purpose (the repo will be cloned); see AI-004
- What changed: Moved the guideline pack to the repo root. Added .gitignore/.gitattributes/.editorconfig, root Makefile (delegating targets + `doctor`), .pre-commit-config.yaml, commitlint.config.js, .github (CODEOWNERS, PR and issue templates), README/CONTRIBUTING/CHANGELOG/SECURITY/LICENSE. Added `scripts/install-prereqs.ps1` (winget) and `scripts/doctor.sh`; documented Windows setup in docs/11. Installed GNU make (winget ezwinports.make) and pre-commit (uv tool) on the dev machine; `pip install make` is not GNU make.
- Files/areas touched: repo root, .github/, scripts/, docs/11, CLAUDE.md (commands)
- Contract impact: none
- Migration: none
- Verification: `make help`: lists all targets; `make lint` with no packages: TODO + exit 0; `pre-commit validate-config`: pass; `make doctor`: pass except pnpm missing and Docker daemon stopped (expected, AI-006)
- Follow-ups: AI-004, AI-005, AI-006

### A-0003 | 2026-11-27 | backend | Scaffold FastAPI service
- By: agent (Claude Code, claude-opus-5-5) on behalf of the project lead
- Type: feat
- Plan refs: P1-02, D-001, D-003
- Branch / PR / commits: none (no git; AI-004). Suggested commit: `feat(backend): scaffold FastAPI service`
- What changed: backend/ with uv project (locked), app factory, core (Settings, engine with WAL/foreign_keys/busy_timeout/synchronous PRAGMAs, UUIDv7 ids, UTC datetimes, error envelope, JSON logging, request-id middleware, Argon2 + JWT helpers, pagination), health module (live/ready/version), `_template` module, Alembic (batch mode, baseline a29597f219cf), deterministic OpenAPI export with `--check`, import-linter contracts, 63 tests. ADR-0006 (auth) and ADR-0007 (UUIDv7). Updated docs/02, 05, 08, backend/CLAUDE.md.
- Files/areas touched: backend/**, docs/adr/0006, docs/adr/0007, docs/02, docs/05, docs/08, CHANGELOG.md, .gitignore
- Contract impact: additive (`GET /api/v1/health/live`, `/health/ready`, `/version`; operationIds `health_get_*`)
- Migration: a29597f219cf (empty baseline)
- Verification: `make lint`: pass (ruff, format, 4/4 import contracts kept); `make typecheck`: pass (mypy strict, 46 files); `make test`: 63 passed, coverage 99.37% (gate 85%); `make migrate`: pass; `make gen-openapi` + `make check-openapi`: pass; `make audit`: no known vulnerabilities; server started, `/api/v1/health/ready` returned 200
- Deviations: `httpx2` instead of `httpx` (Starlette 1.10 deprecates httpx for TestClient); uvicorn started via `--factory app.main:create_app` (docs/08 updated); shared fixtures in `backend/conftest.py` instead of `backend/tests/conftest.py` (docs/05 updated)
- Follow-ups: none new


### A-0004 | 2026-11-27 | frontend | Scaffold Next.js app and contract sync
- By: agent (Claude Code, claude-opus-5-5) on behalf of the project lead
- Type: feat
- Plan refs: P1-03, D-004 (part of P1-04 pulled forward: contract-sync targets)
- Branch / PR / commits: none (no git; AI-004). Suggested commits: `feat(frontend): scaffold Next.js app`, `ci(contract): add gen-contract and check-contract targets`
- What changed: frontend/ on Next.js 16.4 + React 19 + TS strict + Tailwind v4 (pnpm 12, Node 24). Generated typed client from backend/openapi.json (`pnpm gen:client`, `--check` drift mode), `apiClient`/`serverApiClient`/`unwrap`/`ApiError`, zod-validated env, same-origin `/api` rewrite, security headers + CSP, QueryClient provider, `system-status` feature (live readiness + version), `_template` feature, shared/ui primitives, ESLint boundaries/a11y/strict-TS rules, Vitest + MSW typed fixtures (30 tests). Root `make gen-contract` / `make check-contract`. ADR-0008. Docs 01, 02, 04, 08, 09, 11, root/frontend CLAUDE.md and READMEs updated.
- Files/areas touched: frontend/**, Makefile, docs/01, docs/02, docs/04, docs/08, docs/09, docs/11, docs/adr/0008, CLAUDE.md, README.md, CHANGELOG.md, PLAN.md
- Contract impact: none (consumes existing `health_get_ready`, `health_get_version`; no backend change needed)
- Migration: none
- Verification: `make lint`: pass (backend ruff + 4/4 import contracts, frontend eslint 0 warnings + prettier); `make typecheck`: pass (mypy strict, next typegen + tsc); `make test`: backend 63 passed (99.37%), frontend 30 passed (100% lines, 93.5% branches; gate 80%); `make check-contract`: pass; `pnpm build`: pass (/ static); deliberate violations caught by ESLint (app -> feature internals, shared -> feature, `any`, raw `fetch`); contract drift demo: renaming a backend field failed check-openapi, then check:client, then `tsc` in the UI and MSW mocks, reverted; live run: backend :8000 + `pnpm start` :3000, `/api/v1/health/ready` via proxy 200, security headers present. NOT verified: rendering in a real browser (AI-008).
- Deviations: Next.js 16 instead of "current stable" assumptions in docs (error.tsx props `{error, retry}`, `next typegen`); MSW 3 `onUnhandledFrame`; `vite-tsconfig-paths` replaced by Vite's native `resolve.tsconfigPaths`; system font stack instead of next/font/google (offline builds); design tokens in globals.css `@theme` (Tailwind v4 has no tailwind.config).
- Follow-ups: AI-007, AI-008

### A-0005 | 2026-11-27 | docs | Sync all Markdown files with the implementation
- By: agent (Claude Code, claude-opus-5-5) on behalf of the project lead
- Type: docs
- Plan refs: P1-01..P1-03 (docs), P1-09, P1-10, AI-005
- Branch / PR / commits: none (no git; AI-004). Suggested commit: `docs(docs): sync guides and tracking files with the implementation`
- What changed: Root CLAUDE.md (name, status, repo map incl. tracking files and scripts, ADR summary, accurate command notes), README (status, tracking table), CONTRIBUTING (tracking, check-contract), PR template (plan/entry IDs, tracking and contract checkboxes); docs/02 (UUIDv7, 405/503, error codes, X-Request-ID), 03 (pysqlite BEGIN handling, engine on app.state, `scope="function"` sessions, mixins, fixtures), 05 (core modules, import-linter contracts, exceptions, module checklist), 06 (httpx2, typed MSW, make e2e root vs tests, coverage gates), 07 (required checks = docs/09 names, regenerate on conflict, union merge, .gitignore list), 10 (contract sync + tracking items), 11 (SECRET_KEY, realistic first-run checks), 12 (ADR-0006 helpers, header/CSP status), docs/CLAUDE.md (doc + ADR index); backend/tests CLAUDE.md; WORKFLOW (PROGRESS/SKILLS rows, verify step, honest status of slash commands and check-tracking); SKILLS (status, contract-sync outputs); PLAN (P1-04 note, P1-09 note, new P1-10, change history); PROGRESS (snapshot by hand, labelled as manual; focus, metrics, blockers, first weekly report); agent-prompts (new Prompt 11, which WORKFLOW/PLAN/SKILLS referenced but the pack lacked). `.gitattributes`: `ACTIONS.md merge=union`.
- Files/areas touched: *.md at root, .github/pull_request_template.md, docs/**, backend/CLAUDE.md, tests/CLAUDE.md, .gitattributes
- Contract impact: none
- Migration: none
- Verification: stale-term scan over all *.md (ULID, structlog, node:22, httpx, SQLAlchemy 2.0, tailwind.config, `<Project Name>`): only intentional mentions remain (ADR-0003/0007 history, ACTIONS log); `make lint` (includes frontend prettier check): see session summary; every command named in the updated docs exists in the Makefiles/package.json (checked with `make help` and package scripts)
- Not changed on purpose: docs/00 (needs product input, AI-001); accepted ADRs 0001-0005 (never rewritten); frontend/AGENTS.md (regenerated by Next.js); ACTIONS log entries A-0001..A-0004 (append-only)
- Follow-ups: AI-009; P1-10 needs plan-owner approval

### A-0006 | 2026-11-27 | backend | ExpenseFlow architecture and first-cut backend domain; ARD adopted
- By: agent (Claude Code, claude-opus-5-5) on behalf of the project lead
- Type: feat
- Plan refs: P2-01..P2-09, Q-01, AI-001
- Branch / PR / commits: none (no git; AI-004)
- What changed: docs/00 filled from UseCase.docx; docs/13 (containers, state machine, policy-as-config, bypass review); ADR-0009/0010; root CLAUDE.md business rules. Backend: policy engine written tests-first (35 rule tests), modules org, auth (login/refresh/logout/me, cookie JWT + CSRF, rate limit), audit (append-only, DB triggers verified), policy (versions), receipts (magic-byte check, 5 MB bounded read, SHA-256 storage, sandboxed serving), claims (lifecycle, steps, delegation, visibility), approvals (decisions, bulk, queue, sample audit), payouts (batch, CSV with formula-injection guard, paid), reports (dashboard); migration 5f26b26424cd (reviewed by hand). Mid-session the ARD arrived; adopted as the contract (ADR-0011, ADR-0009/0010 superseded) and every gap listed in docs/14.
- Files/areas touched: docs/00, docs/13, docs/14, docs/adr/0009-0011, docs/CLAUDE.md, CLAUDE.md, PLAN.md, backend/app/core (auth, clock, config, security), backend/app/modules/*, backend/app/seeds/policy_v1.json, backend/app/migrations, backend/conftest.py, backend/pyproject.toml (+python-multipart, 13 import contracts)
- Contract impact: additive in code, but NOT yet regenerated (openapi.json / TS client not updated on purpose: the API shape changes again for the ARD)
- Migration: 5f26b26424cd (will be replaced/extended for the ARD schema before it reaches main)
- Verification: policy tests 35 passed; `make lint` pass (ruff + 13/13 import contracts kept); `make typecheck` pass (mypy strict, 115 files); `make test` 98 passed but FAILS the coverage gate (63.96% < 85%) because the domain modules have no integration tests yet; migration upgrade/downgrade round trip pass; audit triggers block UPDATE/DELETE (checked with sqlite3)
- Follow-ups: P2-00 / Q-03 (ARD conflicts), AI-010, AI-011

### A-0007 | 2026-11-27 | backend | Backend re-aligned to the ARD: claims, approvals, payouts, reports, seed
- By: agent (Claude Code, claude-opus-5-5) on behalf of a team member
- Type: feat
- Plan refs: P2-00, P2-03..P2-10, AI-010, Q-03, Q-04
- Branch / PR / commits: branch `feat/P2-05-ard-backend-domain` (local, not committed or pushed)
- What changed: The pulled `main` (58e59e1) had the ARD schema, models and engine but no claims/approvals/payouts/reports services or routers, so `app.main` did not import and lint/mypy failed (21/23 errors). Added `claims/{service,chain,router,deps}.py` (lifecycle, submit/resubmit/withdraw, policy-preview, timeline, comments, receipt download with claim-based authorisation, chain with frozen levels, escalation, separation of duties, delegation, sample audit, bulk approve, review queue, reassign), `approvals/{service,router,deps}.py` (facade), `payouts/{schemas,repository,service,router,deps}.py` (maker-checker, ARD CSV, SHA-256, cancel), `reports/{schemas,service,router,deps}.py` (role-scoped dashboard), `/healthz` + `/readyz` (G5), `app/seeds/generate.py` + `seed_manifest.json` + `make seed`. Fixed stale code: offset pagination and lowercase error codes in `_template`/tests (G2/G4), `conftest.py` seeding call and roles, mypy errors in the claims repository and policy schemas, `policy.engine.evaluate` split for complexity. Added `tzdata` (Asia/Kolkata on Windows and slim images). Rules the ARD leaves open are recorded in docs/14 E. Deleted the agent's own duplicate scaffold `expenseflow/` and draft `docs/architecture/erd.md` (both untracked; the ARD and `backend/` supersede them).
- Files/areas touched: backend/app/modules/{claims,approvals,payouts,reports,health,_template,policy,audit,auth,org,receipts}, backend/app/core/{auth,middleware}.py, backend/app/main.py, backend/app/seeds, backend/conftest.py, backend/tests, backend/pyproject.toml, backend/uv.lock, backend/Makefile, backend/openapi.json, Makefile, CLAUDE.md, backend/CLAUDE.md, docs/01, 02, 06, 08, 11, 14, PLAN.md. `frontend/` not touched.
- Contract impact: additive and breaking-vs-committed-spec (the committed spec still had pre-ARD shapes): 53 paths now; needs label `contract-change`; frontend client NOT regenerated (AI-012)
- Migration: none (uses 0f946151ac98; single head)
- Dependencies: + `tzdata` (runtime): Python's zoneinfo has no timezone database on Windows or slim images, and the ARD's IST day/weekend rules need Asia/Kolkata
- Verification (run in backend/): `ruff check .`: pass; `ruff format --check .`: pass; `lint-imports`: 13 kept, 0 broken; `mypy`: no issues in 122 files; `pytest --cov`: 168 passed, coverage 86.97% (gate 85%); `python -m scripts.export_openapi --check`: up to date; `alembic heads`: one head; `pip-audit --skip-editable`: no known vulnerabilities; full seed on a scratch DB: 3,016 claims (2,064 PAID, 616 APPROVED, 275 REJECTED, 36 SENT_BACK, 25 pending), 9 batches, 383/383 planted cases detected, audit chain valid over 22,325 events, dashboard summary 166 ms. NOT run: `make` targets themselves (GNU make is not installed on this machine; the same commands were run with `uv run`), `make check-contract` (fails by design until AI-012), frontend checks, e2e (P1-05).
- Follow-ups: AI-012, AI-013, AI-014, AI-015 (PLAN Q-04); P3-08 for `/metrics` and the nightly audit-chain job

### A-0008 | 2026-11-27 | backend | requirements.txt for pip users
- By: agent (Claude Code, claude-opus-5-5) on behalf of a team member
- Type: chore
- Plan refs: P2-10 (demo setup)
- Branch / PR / commits: branch `feat/P2-05-ard-backend-domain` (local, not committed)
- What changed: `backend/requirements.txt` (runtime) and `backend/requirements-dev.txt` (runtime + dev) exported from `uv.lock`; `make requirements` target; plain venv + pip steps in docs/11; backend/CLAUDE.md command list.
- Contract impact: none
- Migration: none
- Verification: fresh Python 3.12 venv, `pip install -r requirements-dev.txt`: pass; `alembic upgrade head` on an empty DB: pass; in-process `/readyz` 200 with database ok, `/docs` 200, `/api/v1/claims` 401 unauthenticated; `pytest tests/test_app.py` in that venv: 6 passed
- Follow-ups: none

### A-0009 | 2026-11-27 | backend | Seed applies migrations itself
- By: agent (Claude Code, claude-opus-5-5) on behalf of a team member
- Type: fix
- Plan refs: P2-10
- Branch / PR / commits: branch `feat/P2-05-ard-backend-domain` (local, not committed)
- What changed: `python -m app.seeds.generate` failed with `no such table: users` on a database that had not been migrated (reported by a team member following the onboarding steps). The seed now runs `alembic upgrade head` first; docs/11 corrected.
- Contract impact: none
- Migration: none
- Verification: `migrate()` twice on a fresh SQLite file creates the tables and is idempotent; `pytest tests/test_seed.py`: 1 passed; `mypy`: no issues
- Follow-ups: none
