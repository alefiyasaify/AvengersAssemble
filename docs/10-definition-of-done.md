# 10 Definition of Done

A change is done only when ALL applicable items are true.

## Code
- [ ] Meets acceptance criteria of the ticket
- [ ] Follows the relevant guideline (`04` frontend / `05` backend) and respects module boundaries
- [ ] Lint, format, type checks pass with no new suppressions
- [ ] No dead code, TODOs without a ticket, or debug output

## Tests
- [ ] Unit/component tests added or updated; bug fixes include a regression test
- [ ] Coverage gates met (backend 85%, frontend 80%, patch 90%)
- [ ] E2E smoke updated if a critical journey changed
- [ ] Contract tests pass

## Contract and data
- [ ] `backend/openapi.json` and the generated client are in sync (`make check-contract` passes; regenerate with `make gen-contract`)
- [ ] UI code and MSW mocks match the contract (`make typecheck` passes after regeneration)
- [ ] Breaking-change check passed (or explicitly approved)
- [ ] Alembic migration added, reviewed, single head, backwards compatible; DB-level rules (triggers, constraints) proven by a test
- [ ] Rule or threshold changes start in `backend/app/seeds/rule_fixtures.json` (boundary cases at, below, above); nothing hard-coded in code or UI
- [ ] New or changed endpoint: role matrix checked (200/403/404), foreign resources return 404, state changes write an audit event in the same transaction
- [ ] No DB or env files committed

## Quality attributes
- [ ] Accessibility checked (keyboard, labels, contrast) for UI changes
- [ ] Security reviewed (authz, validation, no secrets, dependencies audited)
- [ ] Performance considered (no N+1 queries, no unbounded lists, bundle impact)
- [ ] Logging/error handling added; no PII in logs

## Documentation
- [ ] Relevant `docs/` file updated; ADR added for architectural decisions
- [ ] `CLAUDE.md` (root or package) updated if conventions or commands changed
- [ ] CHANGELOG entry for user-visible or contract changes

## Tracking (WORKFLOW.md)
- [ ] `ACTIONS.md` entry appended with the exact verification commands and results
- [ ] `PLAN.md` task status updated; new decisions, risks and follow-up action items recorded
- [ ] `PROGRESS.md` snapshot refreshed when task statuses changed
- [ ] README/`.env.example` updated for new config

## Delivery
- [ ] PR approved by code owners; CI green; squash-merged with a Conventional Commit title
- [ ] Docker images build; app runs via `docker compose up`
- [ ] Deployed to staging and verified (for releases)
