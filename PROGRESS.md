# PROGRESS

> Status dashboard and weekly report. Answers: **how far along are we, and is it healthy?**
> The snapshot block is generated from `PLAN.md` and `ACTIONS.md` by `make progress` (`scripts/progress.py`). Do not edit inside the markers.
> Intent lives in `PLAN.md`, facts in `ACTIONS.md`, rules in `WORKFLOW.md`.

## 1. Snapshot (generated)
<!-- PROGRESS:START -->
_Updated MANUALLY 2026-11-27 (`scripts/progress.py` / `make progress` do not exist yet: P1-09, AI-009). Counts taken from PLAN.md and ACTIONS.md as of A-0005._

| Phase | Done | In review | In progress | Blocked | To do | Total | Complete |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 3 | 0 | 0 | 7 | 11 | 9% |
| 2 | 0 | 0 | 0 | 0 | 4 | 4 | 0% |
| 4 | 0 | 0 | 0 | 0 | 4 | 4 | 0% |
| **All** | 1 | 3 | 0 | 0 | 15 | 19 | **5%** |

- Open action items: 9 (AI-001 to AI-009; AI-005 and AI-006 in progress)
- Blockers: no blocked tasks
- Last log entry: A-0005 (2026-11-27, docs): Sync all Markdown files with the implementation
- Note: placeholder rows like `P3-xx` are not counted until broken down into real task IDs. "In review" tasks have no PR yet (no git repo; AI-004).
<!-- PROGRESS:END -->

## 2. Current focus (manual, update at least weekly)
- Goal this week: finish Phase 1 scaffolding (backend, frontend, contract sync) with docs in sync.
- In progress: P1-01, P1-02, P1-03 in review (owner: project lead; agent-assisted)
- Up next: P1-04 (breaking-change check), P1-05 (tests/ + real-browser smoke, AI-008), P1-06 (Docker; start Docker Desktop first)
- Demo / review planned: <date> - local run of backend + frontend, System status card Operational

## 3. Milestones
| Milestone | Target | Forecast | Health | Note |
|---|---|---|---|---|
| M1 Foundation green on clean checkout | <date> | <date> | on track | 4/11 P1 tasks done or in review; git repo pending (AI-004) |
| M2 Vertical slice demo | <date> | <date> | not started | |
| M3 v1 feature complete | <date> | <date> | not started | |
| M4 v1.0.0 release | <date> | <date> | not started | |

Health values: `on track`, `at risk` (a date or scope slip is likely, say why), `off track` (slipped, say the new date), `done`, `not started`.

## 4. Quality metrics
Fill from CI and tool output, with the date measured. Targets come from `docs/06`, `docs/04`, `docs/01`.

| Metric | Target | Current | Measured | Trend |
|---|---|---|---|---|
| Backend line coverage | >= 85% | 99.37% | 2026-11-27 | new |
| Frontend coverage (features, shared) | >= 80% | 100% lines, 93.5% branches | 2026-11-27 | new |
| CI pass rate on `main` (last 20 runs) | >= 95% | n/a (no CI yet, P1-07) | | |
| E2E smoke pass rate | 100% | n/a (no tests/ yet, P1-05) | | |
| Quarantined flaky tests | 0 | | | |
| Contract drift on `main` | none | none (`make check-contract` local) | 2026-11-27 | new |
| Open high/critical vulnerabilities | 0 | 0 backend (`make audit`); frontend not audited yet | 2026-11-27 | new |
| API p95 latency | < 300 ms | | | |
| Frontend LCP (key pages) | < 2.5 s | | | |
| Median PR open-to-merge time | < 2 days | | | |

## 5. Top blockers and risks
| # | Item | Impact | Owner | Needed to unblock | Ref |
|---|---|---|---|---|---|
| 1 | No git repository yet; work cannot go through PRs/CI | Review and history | project lead | Clone the provided repo, recreate commits | AI-004 |
| 2 | Docker daemon not running | Blocks P1-06 and `make up`/`make e2e` | project lead | Start Docker Desktop | AI-006 |
| 3 | docs/00 empty: no domain, no Phase 3 backlog | Vertical slice falls back to generic "items" | project lead | Fill docs/00 | Q-01, AI-001 |

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
