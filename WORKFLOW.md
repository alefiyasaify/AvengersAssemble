# WORKFLOW

How we plan, change and track work, for humans and AI agents alike.

## 1. The tracking files and their roles
| File | Answers | Changes | Edited by |
|---|---|---|---|
| `PLAN.md` | What are we building, in what order, where are we? | When scope, order, status of tasks, risks or decisions change | Plan owner; anyone for status of their own tasks |
| `ACTIONS.md` | What must be done, and what has been done? | Every PR / agent session | The author of the change |
| `docs/adr/` | Why did we decide this? | On architectural decisions | Decision owner |
| `PROGRESS.md` | How far along are we, and is it healthy? | Snapshot when statuses change; sections 2-6 weekly | Plan owner (snapshot: anyone) |
| `SKILLS.md` | Which agent skills exist; who knows what? | When a skill is added or the team changes | Architects / plan owner |
| `CHANGELOG.md` | What changed for users and consumers of the API? | On release (generated from commits) | Release automation |
| `docs/00..12`, `CLAUDE.md` | How must we build things? | When conventions change | Architects, via PR |

Rule of thumb: **PLAN = intent, ACTIONS = reality, ADR = reasoning.**

## 2. Lifecycle of a change
1. **Pick a task** from `PLAN.md` (or an open item in `ACTIONS.md`). Set its status to `in-progress` and put your name in Owner.
2. **Branch** per `docs/07-git-workflow.md`. Include the task ID in the branch name (`feat/P2-01-items-module`).
3. **Do the work** following the package `CLAUDE.md` and guidelines. If you make an architectural decision, add an ADR and link it from `PLAN.md` section 6.
4. **Verify**: run the checks that apply (`make lint typecheck test`; for API changes `make gen-contract` then `make check-contract`; `make e2e` once `tests/` exists).
5. **Track, in the same PR**:
   - Append one entry to the bottom of `ACTIONS.md` (format inside that file).
   - Update `PLAN.md`: task status to `in-review`, new risks, decisions, or questions raised.
   - Add any follow-ups as new rows in the open action items.
6. **PR** with the task ID and entry ID in the description. Reviewers check the tracking entry as part of the Definition of Done.
7. **After merge**: set the task to `done` in `PLAN.md` and the entry's PR/commit fields are already final (squash SHA added by the author in a follow-up edit to their own entry only).

## 3. Rules for updating each file
**PLAN.md**
- Keep it short and current. A stale plan is worse than none.
- Statuses only move forward, except `blocked` and `dropped`, which require a one-line reason in Notes.
- Update "Last updated" and add a row to the plan change history for any change other than a status flip.
- Scope changes (adding, removing, re-ordering phases or features) need the plan owner's approval and, if architectural, an ADR.
- Review the whole plan once a week (15 minutes): dates, blockers, risks.

**ACTIONS.md**
- Append-only log. Never edit or delete another author's entry. Fix mistakes with a new entry that references the old ID ("Correction to A-0007").
- One entry per PR (or per agent session if no PR). Small related commits share one entry.
- Entries are factual: what changed, how it was verified, what is left. No opinions or marketing.
- Open action items are living: you may update the status of your own items and add new ones.
- Log everything that changes the system, including contract changes, migrations, config changes, dependency upgrades, and incidents.

## 4. Protocol for AI agents (Claude Code and others)
**At session start**
1. Read `CLAUDE.md`, `PLAN.md` (current phase and the task assigned), and the last ~10 entries of `ACTIONS.md`.
2. State the task ID you are working on. If the request does not map to a task, propose adding one to `PLAN.md` before starting.

**During the session**
- Stay within the scope of the task and the package; respect all boundary rules.
- If you find out-of-scope problems, do not fix them silently: add an open action item.
- If blocked or you must deviate from a guideline, stop and ask; record the outcome.

**At session end** (always, even if the work is partial)
1. Append an `ACTIONS.md` entry with `By: agent (<model/tool>) on behalf of <human>`, including the exact verification commands you ran and their results. Never claim a check passed if you did not run it.
2. Update task statuses in `PLAN.md`.
3. Summarize to the human: what changed, what was verified, what remains.

Slash commands (set up by Prompt 11 in `docs/prompts/agent-prompts.md`, PLAN P1-09; not created yet): `/session-start`, `/log-action`, `/session-end`, `/plan-status`. Until they exist, follow the steps above by hand.

## 5. Conflict avoidance (parallel teams)
- `ACTIONS.md` uses git's union merge driver (`.gitattributes`: `ACTIONS.md merge=union`), so concurrent appends at the bottom merge without conflicts. If you do get a conflict, keep both sides and renumber your entry.
- `PLAN.md` is edited by section: only touch the rows you own. Put one row per line so diffs stay small.
- Never reformat these files in unrelated PRs.

## 6. Enforcement
Status: the PR-template checkbox, the union merge driver and the `docs/10` tracking items are in place; `scripts/check-tracking.sh` and its CI job are planned (ACTIONS AI-005, P1-07).
- PR template has a "Tracking updated (ACTIONS.md, PLAN.md)" checkbox.
- `scripts/check-tracking.sh` runs in CI: PRs that change `frontend/`, `backend/`, `tests/` or infra files must also change `ACTIONS.md`. Escape hatch: label `skip-tracking` (typo fixes, dependency bumps by bot).
- Definition of Done (`docs/10`) includes the tracking items.

## 7. Hygiene and archiving
- Monthly: move log entries older than 60 days to `docs/archive/ACTIONS-YYYY-MM.md` in a single `docs:` PR. Keep the open action items and the last 60 days in `ACTIONS.md`.
- At each phase exit: record outcome in `PLAN.md` (status `Done`, date), review risks, and tag a git release if applicable.

## 8. Status vocabulary (shared)
`todo` not started | `in-progress` being worked | `blocked` waiting on something (say what) | `in-review` PR open | `done` merged and verified | `dropped` will not do (say why).

## 9. ID conventions
`P<phase>-<nn>` plan tasks, `A-NNNN` log entries, `AI-NNN` action items, `D-NNN` decisions (link to `ADR-NNNN`), `R-NN` risks, `Q-NN` questions, `M<n>` milestones.
