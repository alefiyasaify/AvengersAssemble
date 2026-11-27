# ExpenseFlow test plan

Source of truth: the Architecture Requirements Document (ARD), `docs/14-ard-alignment.md` and the running
backend and frontend. This plan says what is tested, where, with which tool, and how results are reported.

## 1. Objectives

1. Prove the claim-to-payment flow works end to end for every persona, in the browser and through the API.
2. Prove the **policy engine** decides correctly at every limit (at, just below, just above).
3. Prove the **approval chain** routes by payable total and cannot be bypassed.
4. Prove **employee isolation**, **role access**, **separation of duties** and the **append-only audit trail**.
5. Give the team a repeatable regression pack that runs on any environment from one command.

## 2. Scope

| In scope | Out of scope (this pack) |
| --- | --- |
| Claims, receipts, drafts, submit, resubmit, withdraw | Real bank or SSO integration |
| Policy rules and outcome resolution | Load and soak testing |
| Approval chain, send-back, delegation, concurrency | Native mobile apps (responsive web only) |
| Auditor queue, bulk approve, sample audit access | Visual regression |
| Payout batch, mock bank CSV, Paid state | Penetration testing beyond the ARD checklist |
| RBAC matrix, visibility, CSRF, lockout, uploads | Screens still marked "coming soon" in the UI (My spend, Team spend, Delegation, Dashboard/Policy/Audit pages) |
| Audit timeline | `/metrics` (not implemented in the backend yet) |

## 3. How the tests are written and run

| Layer | Files | Projects in `playwright.config.ts` |
| --- | --- | --- |
| **BDD feature files** (Gherkin, readable by the business) | `features/api`, `features/ui`, `features/mobile` + `src/steps` | `bdd-api`, `bdd-ui`, `bdd-mobile` |
| **Spec files** (hand-written Playwright) | `specs/<suite>` | `api`, `ui-desktop`, `ui-mobile` |

`playwright-bdd` compiles every `.feature` into a spec under `.features-gen/`, so features and specs run
in the same Playwright run with the same fixtures, Allure report and Winston logs.
Reporting: **Allure** (epic / feature / story / severity / traceability), plus Playwright HTML and a Cucumber HTML report.
Logging: **Winston** to `logs/app-<date>.log`, `logs/execution.log` (latest run) and `logs/error.log` (all failures).
Environments: `TEST_ENV=local|qa|staging|demo`.

## 4. Suites and traceability

Counts are from `playwright test --list` (219 tests: 119 in spec files, 100 from feature files; every
Examples row of a Scenario Outline counts as a test).

| Suite | Spec files | Feature files | Tags | ARD / control |
| --- | --- | --- | --- | --- |
| Smoke | `specs/smoke` | `ui/sign-in` | `@smoke @readonly` | 8, AT-06 |
| Policy rules and outcomes | `specs/policy` | `api/policy-rules` | `@policy` | 5, PE-03 to PE-11 |
| Claim lifecycle and receipts | `specs/claims` | `api/claim-lifecycle` | `@claims` | CL-01 to CL-07, C8 |
| Approval chain, actions, delegation | `specs/approvals` | `api/approval-chain`, `approval-actions`, `delegation` | `@approvals` | 3, 6, 7, AP-01 to AP-14, C2 to C4, C12 |
| Payout | `specs/payout` | `api/payouts` | `@payout` | 3, 10, E2E09, C9 |
| Access control | `specs/security` | `api/access-control` | `@security @rbac` | 2, 11, E2E10, C5 |
| Audit trail and auditor queue | `specs/audit`, `specs/ops` | `api/audit-and-queue` | `@audit @approvals` | 7, 11, E2E08, C10, C11 |
| Browser journeys | `specs/ui/*` | `ui/*` | `@ui @e2e` | 9, E2E01 to E2E03, E2E06, E2E10, UX-01 to UX-07 |
| Phone layout | `specs/ui/claim-capture-mobile` | `mobile/mobile-capture` | `@mobile` | 9, UX-01 |

### The 10 end-to-end cases

| ID | Scenario | Covered by |
| --- | --- | --- |
| E2E01 | Clean 1,200 INR claim, drafted, saved, submitted | UI spec and feature (browser), policy spec |
| E2E02 | Meals of 1,800 INR: line rejected, reason shown | UI spec and feature, policy specs |
| E2E03 | 8,000 INR: manager approves, chain ends | UI spec and feature, approval-chain |
| E2E04 | 30,000 INR: manager then auditor | approval-chain (spec and feature) |
| E2E05 | 1,20,000 INR: manager, auditor, head in order | approval-chain (spec and feature) |
| E2E06 | Send back, edit, resubmit: new round | spec and feature, API and browser |
| E2E07 | Delegation: delegate approves, audit shows both | delegation (spec and feature) |
| E2E08 | Duplicate receipt: flagged, bulk approve skips it | audit-and-queue, auditor-queue UI |
| E2E09 | Batch, verify by another user, export, mark paid, CSV trailer | payout (spec and feature) |
| E2E10 | Another employee's claim and receipt: 404 | access-control, UI |

## 5. Test data and isolation

- `auditor` and `head` are seeded users. `employee`, `employee2`, `manager`, `manager2` and `delegate` are
  created per run through the head's admin API with known reporting lines (the seed does not link its demo
  employee to its demo manager). Their emails are `qa.<run id>.<role>@...`.
- Each test uses fresh vendors and a unique expense date older than the seeded history, so the daily meals cap
  and duplicate rules never see another test's data.
- Payout tests take payable claims from the seed because the API cannot create a bank account; every
  batch they create is finished or cancelled.
- Use a throwaway database: runs leave `qa.*` users and claims behind.

## 6. Entry and exit criteria

- Entry: backend migrated and seeded, frontend and backend running, `EF_DEMO_PASSWORD` set.
- Exit: all `@blocker` and `@critical` tests pass; every failure is either fixed or listed under Findings with an owner.
- `@readonly` tests are the only ones allowed on prod-like data (`EF_READ_ONLY=true`).

## 7. Findings (product behaviour the pack reports, not hides)

| # | Finding | Evidence | Test |
| --- | --- | --- | --- |
| F-1 | Two approvals of the same step at the same moment: one succeeds and the other returns **500** (`sqlite3.OperationalError: database is locked`) instead of the required **409** (ARD 7 / C12). A write-lock clash is not translated into a conflict. | backend log, `request_id` in `logs/error.log` | `AP-10` spec, "Two approvals at the same moment" feature (expected to fail until fixed) |
| F-2 | The frontend exposes no `data-testid` attributes; selectors use roles, labels and text. Ant Design selects need a CSS class selector because their options are not clickable by role. | `src/pages/base.page.ts` | UI suites |
| F-3 | `/healthz` and `/readyz` are not reachable through the frontend origin (the dev server returns its HTML page with status 200). Tests use `/api/v1/health/*` there, and the root probes only against `EF_BACKEND_URL`. | `specs/smoke` | smoke |
| F-4 | Draft claims report `total_paise` and `payable_paise` as 0 until submit (line amounts are present). | probe of `POST /claims` | `CL-01` |
| F-5 | `GET /metrics` returns 404 (planned P3-08); no test is written for it. | `curl` | none |

Behaviours checked and found to be by design (no finding): approved earlier-level steps stay `APPROVED` as history after a
send-back (only open steps become `SUPERSEDED`); a stale version in a bulk call is skipped, not failed; employees get an
empty (not forbidden) approvals inbox and delegation list.

## 8. Risks

- Shared SQLite means workers default to 1; raising `WORKERS` needs the database-lock finding (F-1) fixed first.
- The UI is still being built (several screens are "coming soon"); update `src/pages` and the features as screens land.
- Provisioned users accumulate; reseed between long campaigns.
