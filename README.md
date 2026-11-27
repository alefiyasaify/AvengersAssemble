# Avengers Assemble

> Project overview: see [docs/00-project-overview.md](docs/00-project-overview.md) (to be filled in).
> Status: Phase 1 (Foundation), see [PROGRESS.md](PROGRESS.md).

Monorepo with a Next.js frontend, a FastAPI + SQLite backend, and a Python Playwright test suite,
integrated only through an OpenAPI contract.

```
Browser --> Next.js (:3000) --/api/* rewrite--> FastAPI (:8000) --> SQLite (volume)
```

## Repository layout
| Path | What | Status | Guide |
|---|---|---|---|
| `frontend/` | Next.js 16 (App Router, React 19, TypeScript) UI | scaffolded | [frontend/README.md](frontend/README.md), [frontend/CLAUDE.md](frontend/CLAUDE.md) |
| `backend/` | FastAPI + SQLAlchemy + SQLite | scaffolded | [backend/README.md](backend/README.md), [backend/CLAUDE.md](backend/CLAUDE.md) |
| `tests/` | Playwright E2E + Schemathesis contract tests | planned (P1-05) | [tests/CLAUDE.md](tests/CLAUDE.md) |
| `docs/` | Design docs (`00`..`12`), ADRs, agent prompts | | [docs/CLAUDE.md](docs/CLAUDE.md) |
| `scripts/` | Prerequisite installer (Windows) and `make doctor` | | |

## Quick start
Prerequisites: Git, Docker Desktop (Compose v2), Node 24 LTS + pnpm, Python 3.12 + uv, GNU make,
pre-commit. On Windows run `make` from Git Bash.

```sh
make doctor     # check prerequisites (Windows: scripts/install-prereqs.ps1 installs them)
make setup      # install deps and git hooks, create .env files from .env.example
make migrate    # apply database migrations
make dev        # backend on :8000, frontend on :3000 -> open http://localhost:3000
make help       # list all targets
```
`backend/.env` needs a `SECRET_KEY` (see `backend/.env.example`).

## Keeping frontend and backend in sync
The backend owns `backend/openapi.json`; the frontend's typed client is generated from it.
After any API change: `make gen-contract` (spec + client), then fix whatever `make typecheck`
reports. `make check-contract` fails when either generated artefact is stale.

## Project tracking
| File | Answers |
|---|---|
| [PLAN.md](PLAN.md) | What are we building, in what order? |
| [ACTIONS.md](ACTIONS.md) | What must be done, and what has been done? |
| [PROGRESS.md](PROGRESS.md) | How far along are we, and is it healthy? |
| [WORKFLOW.md](WORKFLOW.md) | How do we plan, change and track work? |
| [SKILLS.md](SKILLS.md) | Agent skills catalog and team skills matrix |
| [docs/adr/](docs/adr/) | Why did we decide this? |

Full onboarding: [docs/11-onboarding.md](docs/11-onboarding.md).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).
