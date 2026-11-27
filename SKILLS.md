# SKILLS

Two parts: **A) agent skills** (reusable procedures Claude Code loads on demand) and **B) team skills matrix** (what people on the project need to know). Skills complement `CLAUDE.md`: `CLAUDE.md` holds always-on rules, a skill holds a step-by-step procedure that is only loaded when relevant.

---

## A. Agent skills

Status: no skills exist yet in `.claude/skills/`; they are created by Prompt 11 (PLAN P1-10). Until then, the step lists live in `docs/05` ("Adding a module"), `frontend/src/features/_template/README.md`, `docs/02` ("Spec lifecycle") and `WORKFLOW.md`.

Location: `.claude/skills/<name>/SKILL.md` (frontmatter `name` and `description`, then instructions). Claude Code selects a skill from its `description`, so descriptions say *what it does* and *when to use it*. Skills are committed to git and reviewed like code (CODEOWNERS: architects).

### Catalog
| Skill | Use it when | Outputs | Owner area |
|---|---|---|---|
| `new-backend-module` | Adding a backend resource or endpoint group | Module, migration, tests, updated OpenAPI + client | backend |
| `new-frontend-feature` | Building a UI feature against existing endpoints | Feature folder, hooks, components, tests | frontend |
| `contract-sync` | After any API change, or when the client is stale | `make gen-contract`, `make check-contract`, `make typecheck` results (breaking-change check after P1-04) | contract |
| `db-migration` | Any schema change | Reviewed Alembic migration, single head | backend |
| `add-e2e-journey` | Automating a user journey | Page objects, specs, axe check | tests |
| `review-pr` | Reviewing a diff or pre-PR self-review | Structured review with file:line evidence | all |
| `tracking-update` | End of any session or PR | ACTIONS entry, PLAN statuses, refreshed PROGRESS | all |

### How skills and slash commands relate
- **Skill** = knowledge and procedure; Claude can pick it up automatically from context.
- **Slash command** (`.claude/commands/`, created by Prompts 8 and 11) = explicit trigger a human types. Commands such as `/session-end` simply invoke the matching skill's steps.

### Conventions for writing a skill
1. One skill, one job. Split if a skill exceeds ~60 lines.
2. `description` names triggers in plain words ("Use when asked to...").
3. List files to read first, then numbered steps, then explicit Don'ts.
4. Every skill ends with its verification commands and the tracking step.
5. Link to the docs instead of copying them; docs remain the source of truth.
6. Test a new skill on a real task before merging; record the result in `ACTIONS.md`.
7. Changing a convention means updating the doc, the package `CLAUDE.md` and any affected skill in the same PR.

### Candidate skills (add when the need appears)
`add-adr`, `dependency-upgrade`, `add-auth-protected-endpoint`, `debug-flaky-test`, `performance-investigation`, `release-checklist`, `incident-postmortem`.

---

## B. Team skills matrix

Rating: 0 none, 1 aware, 2 can do with help, 3 independent, 4 can teach. Target is the minimum per role; use the matrix to plan pairing and training. Fill the names in.

| Skill area | Frontend dev | Backend dev | QA automation | Tech lead / architect |
|---|---|---|---|---|
| Next.js App Router, server/client components | 3 | 1 | 1 | 3 |
| TypeScript strict, React Query, forms (zod) | 3 | 1 | 1 | 2 |
| Accessibility (WCAG 2.2 AA) | 3 | 1 | 3 | 2 |
| FastAPI, Pydantic v2, dependency injection | 1 | 3 | 2 | 3 |
| SQLAlchemy 2.x, Alembic, SQLite specifics | 0 | 3 | 1 | 3 |
| OpenAPI and contract-first workflow | 3 | 3 | 3 | 4 |
| Playwright (Python), pytest, page objects | 1 | 2 | 4 | 2 |
| Contract/API testing (Schemathesis) | 1 | 2 | 3 | 2 |
| Docker and Compose | 2 | 2 | 3 | 3 |
| CI (GitHub Actions) and trunk-based git | 2 | 2 | 3 | 4 |
| Security basics (OWASP, authN/authZ) | 2 | 3 | 2 | 4 |
| Working with Claude Code, skills and tracking files | 3 | 3 | 3 | 4 |

### Current team assessment
| Person | Role | Strongest areas | Gaps (rating < target) | Growth plan | Reviewed |
|---|---|---|---|---|---|
| <name> | | | | | |

### Skills health
- Review the matrix at each phase exit (see `PLAN.md`).
- Any area where nobody rates >= 3 is a project risk: add it to `PLAN.md` section 7.
- Pair a rating-4 with a rating-1 or 2 on the first task touching that area.
