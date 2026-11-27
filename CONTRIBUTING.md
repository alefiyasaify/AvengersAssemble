# Contributing

Read [CLAUDE.md](CLAUDE.md) first; its boundary rules are non-negotiable. How work is planned and
tracked: [WORKFLOW.md](WORKFLOW.md).

## Setup
`make doctor` checks prerequisites (Windows: `scripts/install-prereqs.ps1`), then `make setup`.
Details: [docs/11-onboarding.md](docs/11-onboarding.md).

## Workflow (summary of [docs/07](docs/07-git-workflow.md) and [WORKFLOW.md](WORKFLOW.md))
1. Pick a task from `PLAN.md` (or an open item in `ACTIONS.md`); set it to `in-progress` with your name.
2. Branch from `main`: `feat/<task>-<slug>`, `fix/<task>-<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`.
3. Keep branches short-lived (< 2 days) and PRs small (< ~400 changed lines excluding generated files).
4. Commit with Conventional Commits: `type(scope): subject`.
   - Types: `feat fix docs style refactor perf test build ci chore revert`
   - Scopes: `frontend backend tests docs infra contract`
   - Subject in imperative mood, max 72 chars; `BREAKING CHANGE:` footer when applicable.
5. Run `make lint typecheck test` (and `make check-contract` if the API changed) before pushing.
6. In the same PR: append an `ACTIONS.md` entry and update the task status in `PLAN.md`.
7. Open a PR using the template. Merge requires green CI, code-owner approval
   (two approvals and both teams for `contract-change`), resolved conversations. Squash merge.

## Git hooks
```sh
pre-commit install && pre-commit install --hook-type commit-msg
```
Hooks run ruff, eslint/prettier, gitleaks, commitlint, and block committing `.env` and `*.db` files.

## Rules that are easy to break
- Never edit generated code (`frontend/src/shared/api-client/generated/`, `backend/openapi.json`); regenerate it with `make gen-contract`.
- Never edit an Alembic migration merged to `main`; add a new one.
- Never make a breaking change under `/api/v1`.
- Never disable lint, type or test checks to get a PR green.
- State why in the PR description when adding a dependency.
- On conflicts in lockfiles or generated files: rebase, take `main`'s version, regenerate.

## Definition of done
[docs/10-definition-of-done.md](docs/10-definition-of-done.md).
