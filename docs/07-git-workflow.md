# 07 Git Workflow

## Model
Trunk-based development. `main` is always releasable and protected. Work happens on short-lived branches (target < 2 days, always < 1 week). Feature flags for incomplete work.

## Branch naming
`feat/<ticket>-<slug>`, `fix/<ticket>-<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `release/<version>` (only if needed).

## Commits
Conventional Commits: `type(scope): subject`. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Scopes: `frontend`, `backend`, `tests`, `docs`, `infra`, `contract`. Imperative mood, subject <= 72 chars, `BREAKING CHANGE:` footer when applicable. Commits are validated by commitlint (pre-commit and CI).

## Pull requests
- Small and focused (< ~400 changed lines excluding generated files).
- Template requires: what/why, linked ticket, screenshots (UI), test evidence, risk, rollback note, doc and `CLAUDE.md` updates.
- Required: green CI, 1 approval (2 for `contract-change`), CODEOWNERS approval, conversations resolved, branch up to date.
- **Squash merge** with a Conventional Commit title. Delete branch after merge.
- No direct pushes to `main`. No force-push on shared branches.

## CODEOWNERS (example)
```
*                         @org/architects
/frontend/                @org/frontend-team
/backend/                 @org/backend-team
/backend/openapi.json     @org/backend-team @org/frontend-team
/frontend/src/shared/api-client/generated/  @org/frontend-team @org/backend-team
/tests/                   @org/qa-team
/docs/ /CLAUDE.md         @org/architects
/.github/ /docker-compose*.yml  @org/architects
```

## Branch protection on `main`
Require PR, the status checks listed in `docs/09` (`backend`, `frontend`, `contract`, `docker-build`, `e2e-smoke`, `security`, `commitlint`), linear history, signed commits (recommended), no bypass for admins.

## Hooks (pre-commit framework)
ruff, ruff-format, mypy (changed files), eslint, prettier, commitlint, gitleaks, check-added-large-files, end-of-file-fixer, a guard blocking `*.db` and `.env`.

## Versioning and releases
SemVer for the product. Release tags `vX.Y.Z` on `main`; changelog generated from Conventional Commits (release-please). Docker images tagged with the git SHA and the semver.

## Concurrency rules for parallel teams
- Backend and frontend teams work on separate directories; shared files (`openapi.json`, `frontend/src/shared/api-client/generated/schema.ts`, lockfiles) are regenerated, never hand-merged: on conflict, rebase and run `make gen-contract` (lockfiles: re-run install).
- `ACTIONS.md` uses the union merge driver (`.gitattributes`), so concurrent appends merge cleanly; renumber your entry if IDs collide (WORKFLOW.md).
- Alembic: one head only; later PR re-parents its migration.
- Lockfile conflicts: take main's lockfile, re-run install.

## .gitignore must include
`.env`, `.env.*` (except `.env.example`), `*.db`, `*.db-wal`, `*.db-shm`, `data/`, `node_modules/`, `.next/`, `__pycache__/`, `.venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `playwright-report/`, `test-results/`, `coverage/`, `coverage.xml`, `.coverage`, `docker-compose.override.yml`, `*.zip`, `CLAUDE.local.md`, `.claude/settings.local.json`.
