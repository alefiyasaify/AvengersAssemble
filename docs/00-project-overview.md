# 00 Project Overview: ExpenseFlow

> Source: `UseCase.docx` (Track A: ExpenseFlow - Expense Claims and Policy-Driven Approvals).
> **Superseded in detail by the ARD (ADR-0011).** Where this file and the ARD differ (rule outcomes,
> states, chain, payout), the ARD wins; see `docs/14-ard-alignment.md`. Assumptions A-1, A-3 and A-6
> are replaced by ARD decisions 2-5 (section 13).

## Problem statement
A mid-size services company reimburses expenses through email threads and Excel. Policy breaches slip
through, duplicate receipts get paid, and managers take days to respond. ExpenseFlow replaces this with
claim capture, a configurable policy engine, a multi-level approval chain, an auditor review queue, a
payout export and an append-only audit trail.

## Goals (measurable)
- 100% of claim lines evaluated by the policy engine before any approval; 0 claims paid without the approvals their amount requires.
- Duplicate lines (same vendor + amount + date, or same receipt file hash) are flagged before payout.
- Median approval time visible on the dashboard; oldest pending approval alerts (SRE phase).
- Payout batch exported as a bank CSV in one click; paid claims reconcile to the batch total.

## Non-goals (v1)
Multi-currency, mileage/per-diem calculators, OCR of receipts, real bank integration, SSO, email/push notifications (in-app only), mobile native apps.

## Personas
| Persona | Description | Main jobs to be done |
|---|---|---|
| Employee | Any of the 150 staff | Capture a claim with line items and receipts on a phone, save a draft, submit, answer clarification requests, track status |
| Line manager | Employee with direct reports | Approve, reject, comment, send back for clarification, delegate while on leave; see policy flags and the receipt side by side |
| Finance auditor | Finance team | Work the review queue (filters, bulk approve), review the random 10% sample of auto-approved claims |
| Finance head (admin) | Head of finance | Final approval above 1,00,000 INR, payout batches and export, dashboard, policy configuration, user admin |

## Feature list (v1)
| ID | Feature | Priority | Owner module (backend) | Owner feature (frontend) |
|---|---|---|---|---|
| F-001 | Sign-in, roles, own-data visibility | Must | `modules/auth`, `modules/org` | `features/auth` |
| F-002 | Claims with line items, receipt upload, draft, submit | Must | `modules/claims`, `modules/receipts` | `features/claims` |
| F-003 | Policy engine (auto-approve / route / auto-reject) from configuration | Must | `modules/policy` | `features/policy` (view) |
| F-004 | Approval chain: manager, auditor > 25,000, head > 1,00,000; comment, send back, delegate | Must | `modules/approvals` | `features/approvals` |
| F-005 | Auditor review queue with filters, bulk approve, 10% sample audit | Must | `modules/approvals` (queue), `modules/claims` | `features/audit-queue` |
| F-006 | Payout batch, CSV export (mock bank format), mark Paid | Must | `modules/payouts` | `features/payouts` |
| F-007 | Dashboard: spend by category/department/month, violations, avg approval time | Must | `modules/reports` | `features/dashboard` |
| F-008 | Append-only audit trail of every action | Must | `modules/audit` | `features/claims` (timeline) |
| F-009 | Synthetic data: 150 employees, 8 departments, hierarchy, 3,000 historical claims | Must | `app/seeds` | - |
| F-010 | Ops metrics (queue size, approval age, latency), alert, runbook | Should | `core` metrics | - |

## Business rules (authoritative)
**Money.** INR only, stored as integer paise. "Above X" means strictly greater than X.

**Policy rules (configuration, not code; seeded as policy version 1):**
| Rule | Default | Outcome when violated |
|---|---|---|
| Meals per day (sum of the employee's meal lines on one date, across all non-rejected claims) | <= 1,500 INR | route (violation shown to approvers) |
| Hotel per night, tier-1 city | <= 6,000 INR | route |
| Hotel per night, other cities | <= 4,000 INR | route |
| Local cab per trip | <= 2,000 INR | route |
| Receipt mandatory | line amount > 500 INR needs a receipt | auto-reject (reason: receipt missing) |
| Duplicate | same vendor + amount + date as an earlier line of the same employee, or same receipt file hash on any earlier line | route, flagged `duplicate` |
| Weekend spend | expense date on Saturday/Sunday | route, flagged for manager attention |
| Stale expense (A-7) | expense date more than 90 days before submission | route, flagged |

Expense dates in the future are invalid input (422).

- **Assumption A-1:** limit breaches route for approval (an approver may accept an exception) rather than auto-reject; only a missing mandatory receipt auto-rejects. Each rule's outcome is configurable.
- **Assumption A-2:** a claim auto-approves only if every line passes every rule AND the claim total is <= 5,000 INR (`auto_approve_max_total`, configurable). Otherwise it is routed. Without this, clean high-value claims would skip the manager.
- **Assumption A-3:** if any line auto-rejects, the whole claim is auto-rejected with every reason listed; the employee can copy it into a new draft.
- Tier-1 cities (A-4): Mumbai, Delhi, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad (configurable list).

**Approval chain** (materialised at submission from the claim total, ADR-0009):
1. Line manager - always, for routed claims.
2. Finance auditor - if total > 25,000 INR.
3. Finance head - if total > 1,00,000 INR.
- Approvers can approve, reject (comment required), comment, or send back for clarification (comment required). Send-back returns the claim to the employee; resubmission re-runs the policy engine and restarts the chain.
- Delegation: a user can delegate approvals to a colleague for a date range (leave). The delegate acts on behalf of the delegator; both names are recorded.
- Separation of duties (A-5): nobody approves their own claim (directly or as a delegate); one person cannot approve two steps of the same claim; delegation cannot be to the claimant or form a cycle.

**Sample audit.** 10% of auto-approved claims (random, seeded RNG, configurable rate) are flagged for sample audit. **Assumption A-6:** a sampled claim is held from payout until an auditor clears it.

**Payout.** The finance head creates a batch from approved, not-held, unbatched claims, exports a CSV (mock bank format, `docs/13`), then marks the batch paid; every claim in it moves to Paid. A batch is immutable once exported.

**Visibility.** An employee sees only their own claims. A manager also sees claims waiting for them (or their delegator) and their direct reports' claims. Auditors and the finance head see all claims.

**Audit trail.** Every state change, approval action, comment, delegation, policy change and payout action is appended to `audit_events` (actor, on-behalf-of, action, entity, before/after, timestamp, request id). No update or delete path exists; the database rejects them.

## Glossary
| Term | Meaning |
|---|---|
| Claim | A reimbursement request with one or more line items |
| Line item | One expense: category, amount, date, vendor, optional city/receipt |
| Policy version | An immutable snapshot of the rule configuration; each evaluation records which version it used |
| Violation / flag | A rule result attached to a line (limit breach, duplicate, weekend, missing receipt) |
| Approval step | One required decision in a claim's chain (manager, auditor, head) |
| Payout batch | A set of approved claims exported together to the bank file |

## Constraints and assumptions
- Single backend instance (SQLite). Expected load: 150 users, < 5 requests/sec peak.
- Supported browsers: latest 2 versions of Chrome, Edge, Firefox, Safari; claim capture must work on a phone.
- Accessibility target: WCAG 2.2 AA.
- Receipts: PDF, JPEG or PNG, max 5 MB, content-type checked by magic bytes, stored by SHA-256 hash.
- Demo sign-in: seeded users with one shared demo password (local/demo only); real SSO is a non-goal.

## Success metrics
Median submit-to-decision time, % claims auto-approved, violations caught per month, duplicate payouts (target 0), p95 API latency < 300 ms, oldest pending approval age.
