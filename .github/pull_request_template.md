## What and why
<!-- What does this change do, and why is it needed? -->

## Ticket / plan task
<!-- PLAN.md task ID (e.g. P2-01) and ACTIONS.md entry ID (e.g. A-0012); external ticket link if any -->

## Test evidence
<!-- Commands run and results (make lint typecheck test, e2e, screenshots of reports). -->

## Screenshots (UI changes)
<!-- Before / after. Delete if not applicable. -->

## Risk and rollback
- Risk: <!-- low / medium / high, and what could break -->
- Rollback: <!-- e.g. revert + redeploy previous tag; migrations are backwards compatible -->

## New dependencies
<!-- Name each new dependency and why it is needed. "None" if none. -->

## Checklist
- [ ] Follows `docs/10-definition-of-done.md` and the boundary rules in `CLAUDE.md`
- [ ] Tests added/updated; coverage gates met
- [ ] Relevant `docs/` updated; ADR added for architectural decisions
- [ ] Root or package `CLAUDE.md` updated if conventions or commands changed
- [ ] CHANGELOG entry for user-visible or contract changes
- [ ] `.env.example` updated for new config
- [ ] No `.env`, `*.db*`, secrets or tokens committed
- [ ] Tracking updated (ACTIONS.md entry appended, PLAN.md task status updated) per WORKFLOW.md

## Contract change
- [ ] This PR changes `backend/openapi.json` (label `contract-change`; frontend AND backend approval)
- [ ] `openapi.json` and the generated client are regenerated (`make gen-contract`) and committed; `make check-contract` passes
- [ ] UI code and MSW mocks updated for the new contract (`make typecheck` passes)
- [ ] Breaking-change check passed, or `breaking-approved` label with justification

## Security checklist
- [ ] Authorization enforced in the service layer (deny by default)
- [ ] All input validated (types, bounds, size); no raw SQL
- [ ] No secrets or PII in code, logs or error messages
- [ ] New dependencies reviewed (license, maintenance, audit clean)
- [ ] Threat model attached if this module handles sensitive data (docs/12)
