# ADR-0009: Approval chains are materialised as ordered steps at submission

- Status: Superseded by ADR-0011 (ARD section 6 / ARD ADR-001)
- Date: 2026-11-27
- Deciders: project lead

## Context
ExpenseFlow needs manager -> finance auditor (> 25,000 INR) -> finance head (> 1,00,000 INR),
with comments, send-back, delegation while on leave, bulk approval, separation of duties and a
complete audit trail. Thresholds and the org chart can change while a claim is in flight.

## Decision
On submission the backend computes the required steps from the claim total and the active policy's
thresholds and inserts them as `approval_steps` rows (`round`, `sequence`, `kind`, `assignee_id` for
the manager step, role pool for finance steps). Only the lowest pending step of the current round is
actionable. Actions record `acted_by_id` and `on_behalf_of_id` (delegation). Send-back cancels the
open steps; resubmission starts a new `round`. Delegations are rows with a date range, resolved at
action time.

## Options considered
1. Compute the next approver on the fly from current rules - no stored chain, but in-flight claims
   change behaviour when thresholds or managers change, and "who must still approve" is not
   queryable for queues and SLA metrics.
2. Generic workflow/BPMN engine - flexible, but heavy for three fixed levels and hard to audit.
3. Materialised steps (chosen) - explicit, queryable (inbox, queue, oldest pending approval),
   stable for in-flight claims, simple to test and audit.

## Consequences
Positive: approver inboxes and the auditor queue are simple queries; approval age is
`now - step.created_at`; history per round is preserved. Negative: changing thresholds does not
affect claims already in flight (intended); org changes need a "reassign step" admin action
(follow-up). Separation of duties is enforced in `approvals.service`.
