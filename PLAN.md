# PLAN

> Living roadmap. Answers: **what are we building, in what order, and where are we now?**
> Update rules are in `WORKFLOW.md`. Completed work is logged in `ACTIONS.md`, decisions in `docs/adr/`.

- Last updated: 2026-11-27 (A-0007)
- Current phase: **Phase 1: Foundation**
- Plan owner: <name/team>

## 1. Vision and scope (summary)
ExpenseFlow: employees submit expense claims with receipts; a configurable policy engine auto-approves, routes or auto-rejects each line; claims route manager -> finance auditor (> 25,000 INR) -> finance head (> 1,00,000 INR); auditors work a review queue with a 10% sample audit; approved claims are paid via an exported bank CSV; a dashboard and an append-only audit trail give visibility. Source: UseCase.docx, docs/00, docs/13.

## 2. Phase overview
| Phase | Goal | Exit criteria | Status |
|---|---|---|---|
| 0 | Planning and guidelines | Guideline pack, ADRs, prompts reviewed and approved | Done |
| 1 | Foundation | Repo, backend, frontend, contract pipeline, tests, Docker, CI all green from a clean checkout | In progress |
| 2 | Vertical slice | One feature works end to end (DB -> API -> UI -> E2E) and validates every convention | Not started |
| 3 | Feature delivery | v1 feature list from docs/00 delivered module by module | Not started |
| 4 | Hardening and release | Security review, performance budget met, backups tested, staging verified, v1.0.0 tagged | Not started |

## 3. Task board (Phase 1: Foundation)
Status values: `todo`, `in-progress`, `blocked`, `in-review`, `done`, `dropped`.

| ID | Task | Prompt | Owner | Status | Depends on | Notes |
|---|---|---|---|---|---|---|
| P1-00 | Orientation, plan approved | Prompt 0 | | done | | |
| P1-01 | Repository skeleton and git | Prompt 1 | | in-review | P1-00 | Files done (A-0002); git history to be recreated in the cloned repo (AI-004) |
| P1-02 | Backend skeleton | Prompt 2 | | in-review | P1-01 | A-0003; all acceptance checks pass |
| P1-03 | Frontend skeleton | Prompt 3 | | in-review | P1-01 | A-0004; all checks pass; real-browser check deferred to P1-05 (AI-008) |
| P1-04 | Contract pipeline | Prompt 4 | | todo | P1-02, P1-03 | Drift checks done early (A-0004: `make gen-contract`/`check-contract`); remaining: oasdiff breaking check, mock-api, CI job |
| P1-05 | Test automation framework | Prompt 5 | | todo | P1-04 | |
| P1-06 | Docker and compose | Prompt 6 | | todo | P1-02, P1-03 | |
| P1-07 | CI workflows | Prompt 7 | | todo | P1-05, P1-06 | |
| P1-08 | Claude Code settings, hooks, commands | Prompt 8 | | todo | P1-01 | |
| P1-09 | Tracking commands wired in (`make progress`, check-tracking, slash commands) | Prompt 11 | | todo | P1-08 | Prompt 11 added to docs/prompts (A-0005) |
| P1-10 | Agent skills from the SKILLS.md catalog | Prompt 11 | | todo | P1-08 | |

## 4. Phase 2 to 4 backlog
Break these down when the phase starts (use IDs `P2-xx`, `P3-xx`, `P4-xx`).

| ID | Item | Phase | Owner | Status |
|---|---|---|---|---|
| P2-01 | ExpenseFlow architecture: docs/00, docs/13, ADR-0009/0010, then ARD adopted (ADR-0011, docs/14) | 2 | | in-review |
| P2-00 | Resolve ARD vs guideline conflicts G1-G8 (docs/14 section A) (resolved 2026-11-27 by the project lead, docs/14 A) | 2 | | done |
| P2-02 | Backend org + auth: departments, users/roles, login/logout/me, cookie JWT + CSRF, rate limit (F-001) | 2 | | in-progress |
| P2-03 | Backend audit trail: append-only audit_events + DB triggers (F-008) (A-0007) | 2 | | in-review |
| P2-04 | Backend policy engine, tests first: rule catalogue, versioned config, evaluation (F-003) (A-0007) | 2 | | in-review |
| P2-05 | Backend claims + lines + receipts + state machine, own-data visibility (F-002) (A-0007) | 2 | | in-review |
| P2-06 | Backend approval chain: steps, comment, send back, delegation, separation of duties (F-004) (A-0007) | 2 | | in-review |
| P2-07 | Backend auditor queue: filters, bulk approve, 10% sample audit (F-005) (A-0007) | 2 | | in-review |
| P2-08 | Backend payout batches + mock bank CSV + mark paid (F-006) (A-0007) | 2 | | in-review |
| P2-09 | Backend reports API: spend by category/department/month, violations, avg approval time (F-007) (A-0007) | 2 | | in-review |
| P2-10 | Seed data: 150 employees, 8 departments, hierarchy, 3,000 historical claims with planted duplicates/breaches (F-009) (A-0007, `make seed`) | 2 | | in-review |
| P3-01 | Frontend auth + app shell + role-based navigation | 3 | | todo |
| P3-02 | Frontend claim capture (mobile-friendly), drafts, submit, clarification | 3 | | todo |
| P3-03 | Frontend approver inbox with side-by-side receipt viewer, delegation | 3 | | todo |
| P3-04 | Frontend auditor queue: dense table, filters, bulk approve, sample audit | 3 | | todo |
| P3-05 | Frontend payouts: batch, export CSV, mark paid | 3 | | todo |
| P3-06 | Frontend dashboard + policy view | 3 | | todo |
| P3-07 | 10 written E2E cases, defect log, security checklist run (Testing phase) | 3 | | todo |
| P3-08 | SRE: metrics (queue size, approval age, latency), dashboard, alert on oldest pending approval, runbook | 3 | | todo |
| P4-01 | Security review against docs/12 | 4 | | todo |
| P4-02 | Performance budget check (LCP, p95 latency) | 4 | | todo |
| P4-03 | Backup and restore drill for SQLite | 4 | | todo |
| P4-04 | Release v1.0.0 | 4 | | todo |

## 5. Milestones
| Milestone | Target date | Status | Linked tasks |
|---|---|---|---|
| M1 Foundation green on clean checkout | <date> | Not started | P1-* |
| M2 Vertical slice demo | <date> | Not started | P2-* |
| M3 v1 feature complete | <date> | Not started | P3-* |
| M4 v1.0.0 release | <date> | Not started | P4-* |

## 6. Open decisions
| ID | Decision needed | Options | Needed by | Owner | Outcome (ADR link) |
|---|---|---|---|---|---|
| D-001 | Auth approach (Bearer vs HttpOnly cookie via Next.js server) | A, B | before first protected feature | | HttpOnly cookie JWTs + Bearer for tools: [ADR-0006](docs/adr/0006-auth-httponly-cookie-jwt.md) |
| D-003 | Identifier format (UUIDv7 vs ULID) | A, B | before first table | | UUIDv7: [ADR-0007](docs/adr/0007-uuidv7-identifiers.md) |
| D-004 | Server-side API calls and build-time frontend config | rewrites + direct server client, runtime proxy | before P1-06 | | Rewrites + `serverApiClient`, build args: [ADR-0008](docs/adr/0008-frontend-api-access-paths.md) |
| D-002 | Hosting target for staging and production | <options> | before P1-07 release workflow | | |

## 7. Risks
| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | SQLite write contention as usage grows | Low | Med | One instance, short transactions, Postgres-ready repositories (ADR-0003) | | Open |
| R-02 | Contract drift between teams | Med | High | CI drift and breaking-change checks | | Open |
| R-03 | Two PRs create conflicting Alembic migrations | Med | Med | Single-head CI check, re-parent rule | | Open |
| R-04 | Fast-moving toolchain (Next.js 16, Vitest 5, MSW 3, Starlette 1.x) changes APIs under us | Med | Med | Lockfiles committed; read bundled docs (frontend/AGENTS.md); Dependabot PRs with CI | | Open |

## 8. Open questions
| ID | Question | Asked by | Answer | Date resolved |
|---|---|---|---|---|
| Q-01 | What does the application do (domain, features, users)? Needed to fill docs/00 and the Phase 3 backlog | | ExpenseFlow (UseCase.docx), docs/00 | 2026-11-27 |
| Q-03 | Resolve ARD conflicts G1-G8 (repo layout, cursor pagination, 400 vs 422, error code case, health paths, refresh TTL, /me, enum case) | agent | All ARD proposals accepted (docs/14 A) | 2026-11-27 |
| Q-04 | Sign off the rules built where the ARD is silent (docs/14 E1-E9), above all E5/E6: who approves the finance head's own claim | agent (A-0007) | | |
| Q-02 | (Superseded by the ARD section 13) Confirm assumptions A-1 to A-7 in docs/00 (limit breaches route, auto-approve max 5,000 INR, any reject rejects claim, tier-1 list, separation of duties, sample-audit hold, stale 90 days) | agent | | |

## 9. Change history of this plan
| Date | Change | By |
|---|---|---|
| 2026-11-27 | Initial plan created from the guideline pack | |
| 2026-11-27 | D-001 and D-003 decided (ADR-0006, ADR-0007); P1-00 done, P1-01/P1-02 in review | agent (Claude) |
| 2026-11-27 | D-004 decided (ADR-0008); P1-03 in review; contract-sync targets added ahead of P1-04 | agent (Claude) |
| 2026-11-27 | ExpenseFlow use case received: Phase 2/3 broken down into P2-01..P2-10, P3-01..P3-08 (replacing the generic vertical-slice rows) | agent (Claude) |
| 2026-11-27 | ARD received and adopted as the contract (ADR-0011); P2-02..P2-09 first cut built, being re-aligned to the ARD (docs/14 section B); P2-00 added for guideline conflicts | agent (Claude) |
| 2026-11-27 | A-0007: backend re-aligned to the ARD; P2-00 done; P2-03..P2-10 in review; Q-04 added for the rules decided where the ARD is silent | agent (Claude) |
| 2026-11-27 | Added P1-10 (agent skills, referenced by SKILLS.md and counted by PROGRESS.md); Prompt 11 written for P1-09/P1-10. Needs plan-owner approval (scope) | agent (Claude) |
