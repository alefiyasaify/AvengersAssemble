# 15 Runbook

Operations guide for ExpenseFlow: start, stop, check, back up, restore and fix the usual problems.
Written for whoever is on call. Facts here are taken from the code as of 2026-11-27 (last revised in
A-0014 after the close-out audit A-0013); where a capability is planned but not built, the text says so
(see section 12, "Known gaps").

## 0. Release status at a glance (2026-11-27)
| Area | State |
|---|---|
| Backend | Built to the ARD, merged to `main`. 177 tests pass, 89.99% coverage; ruff, mypy and the OpenAPI drift check are clean |
| Frontend | React 19 + Create React App + Ant Design 6 (ADR-0012). Built and merged. My spend, Team spend and Delegation are still placeholders (AI-016). No unit tests; `npm run lint` fails (no ESLint 9 config, AI-017) |
| Tests | `tests/` Playwright + TypeScript: 100 scenarios, 219 tests, 217 pass, 2 open defects (AI-019). Last run was A-0011 |
| Not built | Docker/compose, CI, `/metrics` and alerts, scheduled backups, scheduled audit-chain check, hosting target (AI-020) |
| Uncommitted | tests pack, this runbook and the doc updates are on branch `Testing` (AI-021) |
| Tracking | `PLAN.md` (phase 4, 56% of tasks done), `PROGRESS.md`, `ACTIONS.md` open items AI-016..AI-022 |

## 1. System at a glance
```
Browser -> frontend :3000 (React dev server / static build) --/api/* proxy--> backend :8000 (FastAPI, uvicorn, 1 worker) --> SQLite (data/app.db, WAL) + receipts dir (data/receipts)
```
| Item | Value |
|---|---|
| Backend | `backend/`, entry `app.main:create_app` (factory), Python 3.12 |
| Frontend | `frontend/`, React 19 + Ant Design 6 (`react-scripts`, npm); `/api` proxied by `src/setupProxy.js` to `BACKEND_INTERNAL_URL` |
| Database | SQLite, `DATABASE_URL` (default `sqlite:///./data/app.db`), WAL, `busy_timeout=5000`, FKs on |
| Receipts | files in `RECEIPTS_DIR` (default `./data/receipts`), 5 MB max, random keys |
| State to protect | the DB file **and** the receipts directory, always together |
| Hard rule | exactly **one** backend process per SQLite file (never two containers, never `--workers 2`) |
| Ports | frontend 3000, backend 8000 (fixed by design) |

## 2. Configuration (`backend/.env`, read only by `app/core/config.py`)
| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` | none, **required** | >= 32 chars; app refuses to start without it. Changing it logs everyone out (JWTs stop validating) |
| `APP_ENV` | `local` | `production` hides `/docs` and `/openapi.json` |
| `DATABASE_URL` | `sqlite:///./data/app.db` | |
| `CORS_ORIGINS` | empty | explicit list; `*` is rejected at startup |
| `LOG_LEVEL` | `INFO` | JSON logs on stdout |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_HOURS` | 15 / 8 | ranges 1-60 / 1-72 |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCKOUT_MINUTES` | 5 / 15 | |
| `SELF_REGISTRATION_ENABLED` | `true` | set `false` to stop public sign-up |
| `RECEIPTS_DIR`, `MAX_RECEIPT_BYTES` | `./data/receipts`, 5 MB | |
| `GIT_SHA` | `unknown` | shown by `/api/v1/version`; set it at deploy |
| `DEMO_PASSWORD` | unset | demo seed only; never set in production |

Frontend config is baked at build time: `REACT_APP_NAME` (public), `BACKEND_INTERNAL_URL` (dev proxy
target only). Never put secrets in `REACT_APP_*`.

Policy values (limits, thresholds, approval levels) are **data**, edited through the admin API
(`/api/v1/admin/policy/versions`, `/admin/config`, `/admin/approval-levels`), not code or env.

## 3. Start, stop, restart
Run from the repo root in Git Bash unless noted.

| Task | Command |
|---|---|
| First-time setup | `make setup`, then set `SECRET_KEY` in `backend/.env` |
| Apply migrations | `make migrate` (idempotent) |
| Empty DB with demo data (~4 min) | `make seed` (migrates, loads 150 users and 3,000 claims, prints one login per role once; needs `SEED_DEMO_PASSWORD` or generates one) |
| Run both services (dev) | `make dev` |
| Backend only | `cd backend && uv run uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000 --workers 1` |
| Backend without uv | `cd backend && .venv/Scripts/python -m uvicorn --factory app.main:create_app --port 8000` (venv per docs/11) |
| Frontend only | `cd frontend && npm start` (dev) or `npm run build` and serve `build/` behind a proxy that forwards `/api` to :8000 |
| Stop | Ctrl+C, or kill the uvicorn / node process. Safe at any time: every state change is one DB transaction |

Always run `alembic upgrade head` **before** starting a new backend version. Migrations are written to
be backwards compatible with the previous version, so a rollback of the app does not need a
downgrade. `make seed` refuses to run on a non-empty DB; never run it in production.

Docker (`make up`) is described in docs/08 but there is no `docker-compose.yml` or Dockerfile in the
repo yet (PLAN P1-06). Until then the services run directly on the host.

## 4. Health checks
| Check | Command | Healthy |
|---|---|---|
| Liveness | `curl -s localhost:8000/healthz` (alias `/api/v1/health/live`) | 200 |
| Readiness (DB) | `curl -s localhost:8000/readyz` (alias `/api/v1/health/ready`) | 200, database ok; **503** when the DB is unreachable |
| Version / build | `curl -s localhost:8000/api/v1/version` | expected `GIT_SHA` |
| Through the proxy | `curl -s localhost:3000/api/v1/health/ready` | 200 (proves the frontend can reach the backend) |
| UI | open http://localhost:3000, System status card says Operational | |
| Auth gate | `curl -s -o /dev/null -w "%{http_code}" localhost:8000/api/v1/claims` | 401 |

Every response has an `X-Request-ID`, and error bodies carry the same id in `error.request_id`.
Ask the reporter for it; grep the logs for it.

## 5. Logs
Backend logs are JSON lines on stdout (logger, level, message, request id). Redirect stdout to a file
or your process supervisor. Do not log or paste tokens, passwords or full bank account numbers.
Raise `LOG_LEVEL=DEBUG` briefly and restart only while diagnosing; set it back after.

Find one request: `grep <request_id> backend.log`.

## 6. Backup and restore
Needs `sqlite3` on the host. **Never `cp` a live WAL database.**

### Backup (DB and receipts together)
```sh
STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p backups/$STAMP
sqlite3 backend/data/app.db ".backup 'backups/$STAMP/app.db'"
cp -r backend/data/receipts backups/$STAMP/receipts
sqlite3 backups/$STAMP/app.db "PRAGMA integrity_check;"   # expect: ok
```
Encrypt backups and restrict access (docs/12). Schedule it (daily is the suggested minimum); the drill
under "Restore drill" below is PLAN P4-03. RPO and RTO per environment are not yet defined: record them in
docs/08 when agreed.

### Restore
1. Stop the backend.
2. Keep the damaged files: move `backend/data/app.db`, `app.db-wal`, `app.db-shm` aside.
3. Copy `app.db` from the chosen backup to `backend/data/app.db`; replace `backend/data/receipts` with the backup's copy.
4. `cd backend && uv run alembic upgrade head` (brings an older backup up to the current schema).
5. Start the backend; run the checks in section 4 and the audit-chain check in section 9.
6. Tell users the time window that was lost (everything after the backup).

### Restore drill (do quarterly, and before release)
Restore into a scratch directory with `DATABASE_URL`/`RECEIPTS_DIR` pointed there, run
`alembic upgrade head`, start on another port, log in, open a claim with a receipt, run the audit chain check (section 9). Log the result in `ACTIONS.md`.

## 7. Routine operations
| Task | How |
|---|---|
| Activate a self-registered user | head signs in: `GET /api/v1/admin/users?pending=true`, then `PATCH /api/v1/admin/users/{id}` (UI: user admin) |
| Create / deactivate users, change roles or manager | `POST` / `PATCH /api/v1/admin/users` (finance head only; audited) |
| Disable public sign-up | `SELF_REGISTRATION_ENABLED=false`, restart |
| Change a policy limit or threshold | create a new policy version, edit, then `POST .../versions/{id}/publish`. Already-submitted claims keep the version they were evaluated under; never edit seeds or code for this |
| Change approval levels / app config | `PUT /api/v1/admin/approval-levels`, `PUT /api/v1/admin/config` (levels are frozen on a claim at submit) |
| Unblock a stuck approval (nobody may act on it: approver left, only person is the claimant) | finance head: `POST /api/v1/approvals/{step_id}/reassign` (audited; never on their own claim) |
| Payout cycle | head: `GET /payouts/eligible`, `POST /payouts/batches`, a second person `verify`, `export` (bank CSV via `GET .../file`), then `mark-paid`; `cancel` to release a batch. Claims with an unresolved sample audit are held back |
| Rotate `SECRET_KEY` | update `.env`, restart; all users must sign in again |
| Release | `git pull`, `make migrate`, restart backend, rebuild/restart frontend, check section 4, run the smoke tests (section 8), set `GIT_SHA`. Do not release until AI-020, AI-021 and AI-022 are closed |

## 8. Running the test pack
Run it against a running backend and frontend on a **throwaway seeded database**, never the production or dev DB (it leaves `qa.*` users behind). `make e2e` does nothing yet (no `tests/Makefile`).
```sh
make seed && make dev                       # repo root: seed prints the demo password once
cd tests && npm install && npx playwright install chromium
cp env/local.env.example env/local.env      # set EF_DEMO_PASSWORD
npm run test:smoke                          # fast check
npm test                                    # everything: features and specs
npm run allure:generate && npm run allure:open   # report (needs Java 8+)
```
Other targets: `npm run test:qa`, `test:staging` (`env/qa.env`, `env/staging.env`), `TEST_ENV=...`. Logs: `tests/logs/error.log` (all failures), `execution.log` (latest run), `app-<date>.log`. Expected today: 217 of 219 pass; the two known failures are F-1 (SQLite lock not mapped to 409) and F-2 (Ant Design selects lack accessible names), see AI-019. Any other failure is new: investigate before release.

## 9. Integrity check: audit chain
`audit_events` is hash-chained and DB triggers block UPDATE/DELETE. There is no endpoint or scheduled job for verifying it yet, so run this on a schedule (and after any restore):
```sh
cd backend && uv run python - <<'EOF'
from app.core.config import get_settings
from app.core.db import create_db_engine, create_session_factory
from app.modules.audit.service import AuditService
with create_session_factory(create_db_engine(get_settings().database_url))() as s:
    print(AuditService(s).verify_chain())   # (valid, rows_checked, first_broken_id)
EOF
```
Expect `(True, N, None)`. `False` is a **security incident**: stop changes, preserve the file (copy it
and the WAL), compare with the latest good backup to find when the break appeared, and escalate to the finance head and security owner (SECURITY.md).

## 10. Troubleshooting
| Symptom | Likely cause | Action |
|---|---|---|
| Backend exits at start, validation error on `secret_key` | `SECRET_KEY` missing or < 32 chars | set it in `backend/.env` |
| Backend exits: CORS error | `CORS_ORIGINS` contains `*` | list explicit origins |
| `/readyz` 503, "no such table" | migrations not applied | `make migrate` |
| `/readyz` 503, "unable to open database file" | wrong `DATABASE_URL`, missing or read-only `data/` dir | fix path and permissions for the app user |
| `database is locked`, intermittent 500s, claim actions failing under load | second process on the same DB file, a long-running `sqlite3` shell, or heavy write burst (known: lock error is not yet mapped to 409, tests entry A-0011 F-1) | stop duplicates, close shells, retry; confirm one backend process |
| Users get 401 after a deploy | `SECRET_KEY` changed, or access token (15 min) expired and refresh (8 h) too | sign in again |
| 403 on a mutating browser call | CSRF header/cookie missing (ADR-0006) | reload; check the proxy forwards cookies and headers unchanged |
| "Account temporarily locked" | 5 failed sign-ins, locked 15 min | wait. The lockout and rate limit are held in process memory, so a backend restart clears them (also a reason to use it sparingly) |
| 429 on sign-in | per-client rate limit | wait; behind a proxy all users may appear as one client, check forwarded-IP handling |
| 404 on someone else's claim | by design (visibility rules) | not a bug; check the user's role and reporting line |
| 409 `CLAIM_VERSION_CONFLICT` | stale `expected_version` (two people acted) | reload the claim and retry |
| 409 `ILLEGAL_TRANSITION` | action not allowed in the claim's state | check `GET /claims/{id}/timeline` |
| Receipt upload 413 / 400 | over 5 MB, or wrong magic bytes (only real images/PDF) | resize/convert |
| Receipt file missing after a restore | DB and receipts restored from different times | restore both from the same backup |
| Frontend loads but all calls fail | proxy target wrong (`BACKEND_INTERNAL_URL`), backend down | check section 4 through-the-proxy test |
| `/docs` returns 404 | `APP_ENV=production` | expected |
| `make check-contract` fails in CI | spec or TS client drifted | `make gen-contract`, commit |
| `alembic heads` shows two heads | two migration branches | re-parent the later migration (docs/08) |

## 11. Incident handling
1. **Assess**: section 4 checks; note time, impact, request ids.
2. **Contain**: if data may be wrong or leaked, stop the backend rather than keep serving.
3. **Preserve**: copy the DB (with `.backup`) and logs before any repair.
4. **Fix or restore**: section 6 or the troubleshooting table.
5. **Verify**: health checks, audit-chain check, one claim submitted and approved end to end (smoke tests, section 8).
6. **Record**: add an `ACTIONS.md` entry (type incident) with cause, fix, and follow-up action items. Security or data-exposure incidents also follow SECURITY.md.

## 12. Known gaps (do not assume these exist)
- No Dockerfiles or compose file (PLAN P1-06); no CI workflows or deploy pipeline in the repo (P1-07). Tracked as AI-020.
- Three UI screens are placeholders: My spend, Team spend, Delegation (AI-016). The delegation API works (`/api/v1/delegations`) but has no screen.
- Frontend: no unit tests, lint broken (AI-017). Root `make gen-client`, `check-contract` (frontend half), `typecheck` and `e2e` point at things that do not exist (AI-018); use `make gen-openapi`, `make -C backend check-openapi` and `npm` in `tests/`.
- Security review, performance budget, restore drill and v1.0.0 are not done (AI-022).
- No `/metrics` endpoint, dashboards or alerting (PLAN P3-08). There is no alert on the oldest pending approval; check `GET /api/v1/dashboard/summary` or the inbox manually.
- No scheduled backup, no scheduled audit-chain verification, no automatic sample-audit hold report.
- `Idempotency-Key` is accepted but not stored (AI-013): retried POSTs can duplicate.
- No staging/production environment is defined yet; RPO/RTO are unset.
- Single-writer SQLite caps this at one instance. Scaling path is Postgres (docs/01).

Update this file whenever one of the above lands or a command changes.
