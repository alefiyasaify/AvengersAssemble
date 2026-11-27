# ExpenseFlow

Expense claims with a configurable policy engine, a threshold-based approval chain, an auditor review
queue, a payout export and an append-only audit trail. Built from `UseCase.docx` and the ExpenseFlow
ARD (the contract between frontend, backend and database; see [docs/adr/0011](docs/adr/0011-ard-is-the-contract.md)).

> Status: backend, frontend and the test pack are built (2026-11-27). Not yet release-ready: no Docker or CI, three screens still "coming soon", work on branch `Testing` uncommitted. See [PROGRESS.md](PROGRESS.md) and the open items in [ACTIONS.md](ACTIONS.md).

Monorepo with a React (Create React App + Ant Design) frontend, a FastAPI + SQLite backend, and a TypeScript Playwright test pack
(ADR-0012), integrated only through the HTTP API described by the OpenAPI contract.

```
Browser --> React app (:3000) --/api/* proxy--> FastAPI (:8000) --> SQLite (volume) + receipt files
```

## Repository layout
| Path | What | Status | Guide |
|---|---|---|---|
| `backend/` | FastAPI + SQLAlchemy + SQLite: 62 API operations, policy engine, approval chain, payouts, audit trail | **built to the ARD** (177 tests, 89.99% coverage) | [backend/README.md](backend/README.md), [backend/CLAUDE.md](backend/CLAUDE.md) |
| `frontend/` | React 19 (JavaScript) + Ant Design 6 on Create React App: sign-in, claims, approvals, review queue, payouts, dashboard, policy, audit trail | built; My spend, Team spend, Delegation still "coming soon" (AI-016); no unit tests yet (AI-017) | [frontend/README.md](frontend/README.md), [frontend/CLAUDE.md](frontend/CLAUDE.md) |
| `tests/` | Playwright + TypeScript: BDD features, specs, Allure, Winston logs (100 scenarios, 219 tests) | built (217 pass, 2 open defects, AI-019) | [tests/CLAUDE.md](tests/CLAUDE.md) |
| `docs/` | Design docs (`00`..`15`, incl. the [runbook](docs/15-runbook.md)), ADRs, agent prompts | | [docs/CLAUDE.md](docs/CLAUDE.md) |
| `scripts/` | Prerequisite installer (Windows) and `make doctor` | | |

## Quick start
Prerequisites: Git, Docker Desktop (Compose v2), Node 24 LTS + npm, Python 3.12 + uv, GNU make,
pre-commit. On Windows run `make` from Git Bash.

```sh
make doctor     # check prerequisites (Windows: scripts/install-prereqs.ps1 installs them)
make setup      # install deps and git hooks, create .env files from .env.example
make migrate    # apply database migrations (21 tables, DB-level rules)
make dev        # backend on :8000, frontend on :3000 -> open http://localhost:3000
make help       # list all targets
```
`backend/.env` needs a `SECRET_KEY` (see `backend/.env.example`). Demo users and 3,000 historical claims
come from `make seed` (run on an empty database; it prints one login per role once).

## What the backend does
Employees create claims with lines and receipts, preview policy findings, submit; the engine rejects,
routes or auto-approves each line. Claims then run manager -> auditor (above 25,000 INR) -> finance head
(above 1,00,000 INR) with comments, send-back, delegation and bulk approval for auditors; 10% of
auto-approved claims go to a sample audit. The head batches approved claims, an auditor verifies the
batch, the head exports the mock bank CSV and marks it paid. Every action is audited (hash-chained,
append-only). Full rules: [docs/00](docs/00-project-overview.md); implementation and proof: [docs/13](docs/13-domain-design.md).

## Keeping frontend and backend in sync
The backend owns `backend/openapi.json` (`make gen-openapi`; `make check-contract` fails if it is stale on the backend side).
The frontend is hand-written JavaScript in `frontend/src/api/` with no generated client (ADR-0012), so after an API change
update those modules and rerun the `tests/` pack, which is what catches contract drift.

## Project tracking
| File | Answers |
|---|---|
| [PLAN.md](PLAN.md) | What are we building, in what order? |
| [ACTIONS.md](ACTIONS.md) | What must be done, and what has been done? |
| [PROGRESS.md](PROGRESS.md) | How far along are we, and is it healthy? |
| [WORKFLOW.md](WORKFLOW.md) | How do we plan, change and track work? |
| [docs/15-runbook.md](docs/15-runbook.md) | How do we run, back up, restore and troubleshoot it? |
| [SKILLS.md](SKILLS.md) | Agent skills catalog and team skills matrix |
| [docs/adr/](docs/adr/) | Why did we decide this? |
| [docs/14-ard-alignment.md](docs/14-ard-alignment.md) | Where code and ARD still differ |

Full onboarding: [docs/11-onboarding.md](docs/11-onboarding.md).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).
