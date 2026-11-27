# 11 Onboarding (target: productive in 15 minutes)

## Prerequisites
Git, Docker Desktop (Compose v2), Node LTS + pnpm, Python 3.12 + uv, GNU make, pre-commit. Optional: Claude Code.

| OS | Install |
|---|---|
| Windows | `powershell -ExecutionPolicy Bypass -File scripts/install-prereqs.ps1` (winget, user scope), then restart the terminal/VS Code |
| macOS | `xcode-select --install` (make, git), `brew install uv node pnpm pre-commit`, Docker Desktop |
| Linux | distro `make` + `git`, uv installer, Node LTS + `corepack enable pnpm`, `uv tool install pre-commit`, Docker Engine |

Windows notes:
- Run `make` from **Git Bash** (recipes need a POSIX shell). In VS Code set the default terminal profile to Git Bash.
- `pip install make` does **not** install GNU make (it is an unrelated template tool). Use `winget install ezwinports.make`.

## Steps
0. `make doctor` checks that every prerequisite is present and says how to fix anything missing.
1. `git clone <repo> && cd <repo>`
2. `make setup` (installs backend and frontend deps, installs pre-commit hooks, copies `.env.example` to `.env` in each package)
3. Put a `SECRET_KEY` in `backend/.env` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), then `make migrate` and `make dev` (backend on :8000, frontend on :3000). For demo data run `make seed` on an empty database instead of `make migrate`: it migrates, loads 150 employees and 3,000 claims through the real services (about 4 minutes), writes `backend/app/seeds/seed_manifest.json` and prints one demo login per role once
4. Open http://localhost:3000 (the System status card should say Operational) and http://localhost:8000/docs
5. `make lint typecheck test` and `make check-contract` to confirm your environment is healthy (`make e2e` once `tests/` exists, P1-05)
6. Full stack in containers: `make up` (once Docker files exist, P1-06)

### Backend without uv (plain venv + pip)
Python **3.12** is required. From `backend/`:
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1          # Git Bash: source .venv/Scripts/activate
pip install -r requirements-dev.txt     # runtime only: requirements.txt
copy .env.example .env                  # then set SECRET_KEY
alembic upgrade head                    # empty schema; or instead, for demo data:
$env:SEED_DEMO_PASSWORD = "..."         # python -m app.seeds.generate  (migrates itself, needs an empty DB)
uvicorn --factory app.main:create_app --reload --port 8000
```
`requirements*.txt` are generated from `uv.lock` (`make requirements`); never edit them by hand.

## Pick your lane
- Frontend dev: read `docs/04`, `frontend/CLAUDE.md`; develop against `backend/openapi.json` (mock with `make mock-api`) if the backend is not ready.
- Backend dev: read `docs/03`, `docs/05`, `backend/CLAUDE.md`.
- QA: read `docs/06`, `tests/CLAUDE.md`.

## First contribution
Pick a task in `PLAN.md`, create a branch, make a small change, run `make lint typecheck test`, append an `ACTIONS.md` entry (WORKFLOW.md), open a PR using the template.

## Troubleshooting
Port in use -> change nothing, stop the other process (ports are fixed by design). SQLite locked -> make sure only one backend instance uses the DB file. Client types stale / `make check-contract` fails -> `make gen-contract`, then fix what `pnpm typecheck` reports. Migration head conflict -> rebase and re-parent.
