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
3. Put a `SECRET_KEY` in `backend/.env` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), then `make migrate` and `make dev` (backend on :8000, frontend on :3000)
4. Open http://localhost:3000 (the System status card should say Operational) and http://localhost:8000/docs
5. `make lint typecheck test` and `make check-contract` to confirm your environment is healthy (`make e2e` once `tests/` exists, P1-05)
6. Full stack in containers: `make up` (once Docker files exist, P1-06)

## Pick your lane
- Frontend dev: read `docs/04`, `frontend/CLAUDE.md`; develop against `backend/openapi.json` (mock with `make mock-api`) if the backend is not ready.
- Backend dev: read `docs/03`, `docs/05`, `backend/CLAUDE.md`.
- QA: read `docs/06`, `tests/CLAUDE.md`.

## First contribution
Pick a task in `PLAN.md`, create a branch, make a small change, run `make lint typecheck test`, append an `ACTIONS.md` entry (WORKFLOW.md), open a PR using the template.

## Troubleshooting
Port in use -> change nothing, stop the other process (ports are fixed by design). SQLite locked -> make sure only one backend instance uses the DB file. Client types stale / `make check-contract` fails -> `make gen-contract`, then fix what `pnpm typecheck` reports. Migration head conflict -> rebase and re-parent.
