# PROGRESS

> Status dashboard and weekly report. Answers: **how far along are we, and is it healthy?**
> The snapshot block is generated from `PLAN.md` and `ACTIONS.md` by `make progress` (`scripts/progress.py`). Do not edit inside the markers.
> Intent lives in `PLAN.md`, facts in `ACTIONS.md`, rules in `WORKFLOW.md`.

## 1. Snapshot (generated)
<!-- PROGRESS:START -->
_Updated MANUALLY 2026-11-27 after A-0013 (`scripts/progress.py` / `make progress` do not exist yet: P1-09, AI-009). Counts taken from PLAN.md._

| Phase | Done | In review | In progress | Blocked | To do | Total | Complete |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 1 | 0 | 5 | 11 | 36% |
| 2 | 11 | 0 | 0 | 0 | 0 | 11 | 100% |
| 3 | 4 | 3 | 1 | 0 | 0 | 8 | 50% |
| 4 | 0 | 0 | 0 | 0 | 4 | 4 | 0% |
| **All** | 19 | 4 | 2 | 0 | 9 | 34 | **56%** |

- Open action items: AI-002, 003, 005, 006, 009, 013, 014, 015 and AI-016 to AI-022 (see ACTIONS.md section 1)
- Blockers: none blocked; release is gated by AI-020 (no Docker, CI, metrics) and AI-021 (work not committed)
- Last log entry: A-0013 (2026-11-27, docs): Close-out audit and update of all tracking and status docs
- Note: backend and frontend are merged to `main` (PRs #1, #2); the tests pack, runbook and these updates are uncommitted on branch `Testing`.
<!-- PROGRESS:END -->

## 2. Current focus (manual, update at least weekly)
- Goal this week: close out development, then harden for release (Phase 4).
- In progress: P1-04 (contract pipeline), P3-08 (observability; runbook done), P3-03/P3-06 and P3-07 in review.
- Up next: AI-021 commit and review; AI-016 three missing screens; AI-017/AI-018 frontend tooling and doc/Makefile reconciliation; AI-019 test defects; AI-020 Docker + CI + metrics; AI-022 security review, performance, restore drill, v1.0.0.
- Demo / review planned: <date> - local run with `make seed`, one claim from submit to paid.

## 3. Milestones
| Milestone | Target | Forecast | Health | Note |
|---|---|---|---|---|
| M1 Foundation green on clean checkout | <date> | <date> | at risk | no Docker, no CI, contract pipeline backend-only (AI-020, AI-018) |
| M2 Vertical slice demo | 2026-11-27 | 2026-11-27 | done | backend domain built and verified |
| M3 v1 feature complete | <date> | <date> | at risk | 3 screens, metrics and alert missing (AI-016, AI-020) |
| M4 v1.0.0 release | <date> | <date> | not started | security review, performance, restore drill, hosting (AI-022, D-002) |

Health values: `on track`, `at risk` (a date or scope slip is likely, say why), `off track` (slipped, say the new date), `done`, `not started`.

## 4. Quality metrics
Fill from CI and tool output, with the date measured. Targets come from `docs/06`, `docs/04`, `docs/01`.

| Metric | Target | Current | Measured | Trend |
|---|---|---|---|---|
| Backend line coverage | >= 85% | 89.99% (177 tests pass) | 2026-11-27 | up from 86.97% |
| Backend lint, types, spec drift | clean | ruff, mypy (123 files), openapi drift: pass | 2026-11-27 | stable |
| Frontend coverage (features, shared) | >= 80% | none: no unit tests exist (AI-017) | 2026-11-27 | worse than plan |
| Frontend lint / build | pass | lint fails (no ESLint 9 config); build not runnable locally (AI-017) | 2026-11-27 | new |
| CI pass rate on `main` (last 20 runs) | >= 95% | n/a (no CI, AI-020) | | |
| E2E pass rate (tests/ pack) | 100% | 217 of 219 (2 open defects F-1, F-2, AI-019); from A-0011, not re-run | 2026-11-27 | new |
| Quarantined flaky tests | 0 | none recorded | | |
| Contract drift on `main` | none | backend spec in sync; no frontend client to drift | 2026-11-27 | |
| Open high/critical vulnerabilities | 0 | backend `pip-audit` not re-run; frontend `npm audit` never run (AI-022) | | |
| API p95 latency | < 300 ms | not measured (P4-02) | | |
| Frontend LCP (key pages) | < 2.5 s | not measured (P4-02) | | |
| Median PR open-to-merge time | < 2 days | | | |

## 5. Top blockers and risks
| # | Item | Impact | Owner | Needed to unblock | Ref |
|---|---|---|---|---|---|
| 1 | No Dockerfiles, compose or CI | Cannot run the stack in a container or gate PRs; release blocked | project lead | P1-06, P1-07; hosting decision | AI-020, D-002 |
| 2 | Tests pack, runbook and tracking updates uncommitted; ARD pdf and UseCase.docx deleted from the root | Work can be lost; ADR-0011 and CLAUDE.md cite the ARD file | project lead | Commit, review, confirm the deletions | AI-021 |
| 3 | Delegation, My spend, Team spend screens still "coming soon"; frontend has no unit tests and lint is broken | v1 scope not complete; no frontend quality gate | frontend | Build screens, add ESLint 9 config and tests | AI-016, AI-017 |
| 4 | Docs and Makefile describe Next.js/pnpm/pytest | New joiners and `make` targets fail | docs | Apply ADR-0012 across docs 04, 06, 08, 09, 11 | AI-018 |

## 6. Weekly status reports (append at the bottom)

### Template
```
### Week of YYYY-MM-DD
- Overall: green | amber | red (one-line reason)
- Completed: <task IDs / A-NNNN entries>
- In progress: <task IDs>
- Next week: <task IDs>
- Decisions made: <D-NNN / ADR-NNNN>
- Risks and blockers: <R-xx, blocked tasks>
- Metrics movement: <coverage, CI, flakes, anything notable>
- Asks: <what you need from whom>
```

## 7. Update rules
- **Snapshot:** run `make progress` (also run by `/session-end`) and commit the result. CI may fail PRs whose snapshot is stale (`python scripts/progress.py --check`).
- **Sections 2 to 5:** updated by the plan owner weekly; anyone may update the metrics row they own.
- **Section 6:** one report per week, appended at the bottom. Never rewrite old reports.
- Status colours: green = on track, amber = at risk with a mitigation, red = needs help or a date will slip.

### Week of 2026-11-23
- Overall: green (Phase 1 on track; git repo and Docker pending)
- Completed: P1-00; A-0002 to A-0005 (repo bootstrap, backend, frontend, docs sync)
- In progress: P1-01, P1-02, P1-03 (in review)
- Next week: P1-04, P1-05, P1-06
- Decisions made: D-001/ADR-0006, D-003/ADR-0007, D-004/ADR-0008
- Risks and blockers: R-04 (fast-moving toolchain); AI-004 (no git), AI-006 (Docker)
- Metrics movement: first measurements (backend 99.37%, frontend 100% lines)
- Asks: plan owner to approve P1-10 and fill docs/00

### Week of 2026-11-27
- Overall: amber (development complete per the teams; release gated by Docker, CI, three screens and uncommitted work)
- Completed: P2-00..P2-10 (backend, 177 tests, 89.99%), P1-01..P1-03, P3-01/02/04/05 (frontend), A-0008..A-0012 (requirements, seed fix, self-registration, tests pack, runbook)
- In progress: P1-04, P3-08; in review: P1-05, P3-03, P3-06, P3-07
- Next week: AI-021, AI-016, AI-017, AI-018, AI-019, AI-020
- Decisions made: ADR-0012 (as-built frontend and test stack), D-005
- Risks and blockers: see section 5; R-04 unchanged
- Metrics movement: backend coverage 86.97% to 89.99%; E2E pack 217/219; frontend coverage none
- Asks: plan owner to confirm ADR-0012, the deletion of the ARD pdf and UseCase.docx, the Phase 3 status calls (P3-03, P3-06 left in review) and a hosting target
