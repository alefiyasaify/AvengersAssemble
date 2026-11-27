# 14 ARD Alignment

The **ExpenseFlow ARD** (`/ExpenseFlow-Architecture Requirements Document (ARD).pdf`, 2026-11-27)
is the contract between frontend, backend and database (ADR-0011). Where it conflicts with
`docs/00`, `docs/13`, ADR-0009/0010 or earlier guideline docs, **the ARD wins** unless a row
below says otherwise. This doc lists every gap between the ARD and the code as of A-0006, and
the work to close it.

## A. Guideline conflicts (RESOLVED 2026-11-27: all proposals accepted by the project lead)
| # | Topic | Existing docs | ARD | Decision |
|---|---|---|---|---|
| G1 | Repo layout | `frontend/`, `backend/`, `tests/` (ADR-0001, all tooling) | `apps/api`, `apps/web`, `packages/contracts`, `seed/`, `e2e/`, `deploy/` | Keep current folders; map ARD names onto them (api=`backend`, web=`frontend`, e2e=`tests`); `deploy/` files go to repo root/`.github` as planned |
| G2 | List pagination | `limit`/`offset`, `{items,total,limit,offset}` (docs/02) | cursor: `{items, next_cursor, total_estimate}` | Adopt ARD; update docs/02 |
| G3 | Validation status | 422 (docs/02) | 400 | Adopt ARD (400 `VALIDATION_FAILED`) |
| G4 | Error code style | `snake_case` (`claim_not_found`) | `UPPER_SNAKE` (`CLAIM_VERSION_CONFLICT`); `details` is an object | Adopt ARD |
| G5 | Health paths | `/api/v1/health/live`, `/health/ready`, `/version` | `/healthz`, `/readyz`, `/metrics` | Add ARD paths; keep `/api/v1/health/*` as aliases until the frontend moves |
| G6 | Refresh token TTL | 14 days (ADR-0006) | 8 hours; lockout after 5 failures | Adopt ARD (config change) |
| G7 | `GET /me` | `/api/v1/auth/me` | `/me` with role, name and **permissions** | Adopt ARD |
| G8 | Status/enum casing | lowercase | UPPERCASE (`PENDING_MANAGER`) | Adopt ARD |

## B. Domain gaps in the backend built in A-0006 (all must change)
| Area | Built | ARD requires |
|---|---|---|
| Claim states | `pending_approval`, `clarification_requested`, `in_payout`, lowercase | 9 states: `DRAFT, PENDING_MANAGER, PENDING_AUDITOR, PENDING_HEAD, SENT_BACK, APPROVED, REJECTED, WITHDRAWN, PAID`; 16 transitions incl. #16 sample-audit FAILED -> `PENDING_AUDITOR`; `claim_transition` table + DB trigger |
| Line outcome | any rejected line rejects the claim | rejected lines are **excluded** from `payable_paise`; all rejected -> `REJECTED`; line statuses `DRAFT/AUTO_APPROVED/NEEDS_APPROVAL/AUTO_REJECTED/APPROVED/REJECTED` |
| Limit rules | breach -> route | meals/hotel/cab breach -> **REJECT**; duplicate -> ROUTE + `force_level=AUDITOR`; weekend -> FLAG; `SPLIT_SUSPECT` (ROUTE, force auditor); `CLAIM_AGE_LIMIT` 60 days **inactive** |
| Policy storage | one JSON document per version | `policy_version` (DRAFT/ACTIVE/RETIRED) + `policy_rule` rows (code, type, category, params, outcome, severity, force_level, message_template, active); `approval_level` rows; `app_config`; `city` (tier); `category` |
| Days / weekend | UTC date | Asia/Kolkata calendar day |
| Chain | all steps created at submit | `required_levels` frozen on claim; one step at a time; next step created on approve; `SUPERSEDED`/`SKIPPED`; assignee = claimant escalates to their manager (head at top) |
| Delegation | any active user, any length | per level, max 30 days, one active per approver+level, delegate same-or-higher role, not the claimant |
| Sample audit | flag on claim | `sample_audit` table (PENDING/PASSED/FAILED), CSPRNG draw value + rate audited, FAILED reopens at auditor level |
| Bulk approve | finance, max 100 | auditor-level only, max 50, result `APPROVED/SKIPPED/FAILED` + reason; skip duplicates, high severity, wrong level, version changed |
| Payout | head-only, draft->exported->paid, CRLF CSV | maker-checker: head creates, **different auditor verifies** (`VERIFIED`), export from VERIFIED stores file + SHA-256, `CANCELLED`; `payout_item` (unique claim) and `bank_account` tables; ARD CSV columns, LF, file name `EXPFLOW_<batch>_<YYYYMMDD>.csv`, IMPS <= 2,00,000 else NEFT, narration rules |
| Audit trail | uuid id, data JSON | bigint id, `claim_id`, `before_json`/`after_json`, `ip`, `prev_hash`/`row_hash` hash chain, nightly verifier + `expenseflow_audit_chain_valid` metric |
| Roles | employee / finance_auditor / finance_head (manager derived) | `EMPLOYEE, MANAGER, AUDITOR, FINANCE_HEAD`; managers see direct **and indirect** reports' claims in their step |
| API | `/claims` PUT replace, `/approvals/claims/{id}/decision` | ARD section 8 endpoint list (lines CRUD, `policy-preview`, `resubmit`, `/approvals/{step_id}/approve|reject|send-back`, `/review-queue`, `/sample-audits`, `/payouts/batches/...`, `/dashboard/summary`, `/audit-events`, `/admin/*`), `expected_version`, `Idempotency-Key`, `allowed_actions` |
| Dashboard | finance only | role-scoped (employee own, manager team, auditor/head company), p90, sample audit counts, violation rate |
| Seed | not built | deterministic seed via real services + `seed_manifest.json` with the planted cases (60 + 40 duplicates, 90 breaches, 50 missing receipts, 120 weekend lines, boundary cases, 15 split patterns); `make demo` |

## C. What carries over unchanged
Core infrastructure (config, db engine/PRAGMAs, error envelope mechanics, request id, JSON logs,
security helpers, clock, principal + CSRF), module layering and import-linter contracts,
receipt upload/validation/storage, the pure policy engine approach and its tests (rule params
and outcomes change), the append-only trigger approach, and the frontend scaffold.

## D. Frontend (ARD section 9) - new scope for Phase 3
Routes `/login, /claims, /claims/new, /claims/[id]/edit, /claims/[id], /approvals,
/approvals/[claimId], /review, /sample-audits, /payouts, /payouts/[batchId], /dashboard,
/admin/*, /delegations`; TanStack Table with virtualisation; pdf.js receipt viewer (55/45
split, J/K/A/R/S/C shortcuts, auto-advance, `review_duration_ms`); mobile-first capture with
camera input, client-side downscale to 1600 px, Indian number grouping, 2 s autosave and inline
`policy-preview`; buttons rendered only from `allowed_actions`; features `claims, approvals,
review, payouts, dashboard, admin`.

Table names stay plural `snake_case` (docs/03); ARD section 7 names map one-to-one (`claim` -> `claims`).

## E. Status after A-0007 (backend re-alignment, 2026-11-27)
Section B rows, as built and tested in `backend/` (168 tests, coverage 86.97%):

| Area | Status | Where |
|---|---|---|
| Claim states, 16 transitions, `claim_transitions` trigger | Done; trigger checked by a test | `claims/state.py`, migration `0f946151ac98` |
| Line outcome, payable excludes rejected lines | Done | `policy/engine.py`, `claims/service.py` |
| Limit rules REJECT / duplicate ROUTE+force AUDITOR / weekend FLAG / SPLIT_SUSPECT / CLAIM_AGE_LIMIT inactive | Done | `seeds/reference_data.json`, engine |
| Policy storage (versions, rule rows, approval levels, app_config, city, category) | Done | `policy/` |
| Asia/Kolkata day and weekend | Done (`tzdata` dependency added for Windows/slim images) | `claims/service.py` |
| Chain: frozen `required_levels`, one open step, SUPERSEDED, escalation | Done | `claims/chain.py`, `claims/service.py` |
| Delegation: per level, max 30 days, one active, same-or-higher role, not the claimant | Done | `claims/chain.py` |
| Sample audit table, CSPRNG draw audited, FAILED reopens at auditor | Done | `claims/service.py` |
| Bulk approve rules (auditor level, max 50, SKIPPED reasons) | Done | `claims/service.py` |
| Payout maker-checker, ARD CSV, SHA-256, cancel | Done | `payouts/` |
| Audit hash chain + verifier | Done (verifier is `AuditService.verify_chain`; nightly job and metric are P3-08) | `audit/` |
| Roles and team visibility | Done | `claims/service.py` |
| API (ARD section 8 list, `expected_version`, `allowed_actions`) | Done except `Idempotency-Key` (AI-013) | routers |
| Dashboard (role scope, p90, sample counts, violation rate) | Done; 166 ms on the seeded 3,016 claims (target 500 ms) | `reports/` |
| Seed + `seed_manifest.json` + `make seed` | Done; 383/383 planted cases detected | `app/seeds/generate.py` |
| `/healthz`, `/readyz` (G5) | Done; `/metrics` is P3-08 | `health/router.py` |

### Rules decided where the ARD is silent (need team sign-off)
| # | Topic | Built behaviour | Why |
|---|---|---|---|
| E1 | Mixed claim: one line AUTO_REJECTED, others clean | Goes to the manager for the payable amount; not auto-approved | ARD 5 rule 4 auto-approves only when **all** lines are auto-approved |
| E2 | Meals cap across several lines | Lines summed in order (earlier claims first); only the line that crosses 1,500/day is rejected; rejected lines do not count | Matches the test plan's assumption |
| E3 | Vendor normalisation | Case-insensitive, trimmed, inner whitespace collapsed | ARD 5 says case-insensitive and trimmed; collapsing spaces stops trivial evasion (C6) |
| E4 | Duplicate / split lookback | Submitted, non-rejected lines only; other people's drafts are ignored | A draft is not a claim yet |
| E5 | Finance head's own claim, or head level after the head approved level 1 | Assigned to the head's active level-3 delegate; otherwise unassigned and an `approval.needs_reassignment` audit event; the head can `POST /approvals/{step_id}/reassign` (not on their own claim) | ARD has one head (decision 10) and gives no approver |
| E6 | Who may cover the head level | An auditor or the head (exception to "same role") | With one head, nobody else could ever cover it |
| E7 | Head acting on auditor-pool steps | Allowed (same-or-higher role); separation of duties still applies | Lets the head clear the queue and use bulk approve |
| E8 | Bank file narration | Letters, digits, spaces **and hyphens**, max 30 | ARD's own sample narration is a claim number with hyphens |
| E10 | Self-registration (not in the ARD; requested by the team) | `POST /auth/register` creates an INACTIVE EMPLOYEE only (no role field), answers 202 the same for new and existing emails, is rate-limited, and is switched off by config; the head activates and fixes department/manager | ARD: users are admin-created (section 2); an open sign-up must not grant a role or an active account |
| E9 | Average approval time | Counts every chain decision (approved or rejected) from the last (re)submission | Resubmitting resets `submitted_at`, which removes SENT_BACK time as ARD 10 asks |

### Still open
- `Idempotency-Key` storage (24 h) is not implemented (AI-013).
- The frontend's generated client is out of date with `openapi.json`; regenerate with `make gen-contract` in a frontend PR (AI-012, contract-change label).
- `/metrics`, the nightly audit-chain job and alerts: P3-08.
