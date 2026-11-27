# ADR-0011: The ExpenseFlow ARD is the frontend/backend/database contract

- Status: Accepted (conflict resolutions G1-G8 in docs/14 pending sign-off)
- Date: 2026-11-27
- Deciders: project lead
- Supersedes: ADR-0009 and ADR-0010 where they differ from the ARD

## Context
The project lead issued the ExpenseFlow ARD (repo root PDF) as the single contract between the
frontend, backend and database teams. Earlier design work (docs/00 assumptions, docs/13,
ADR-0009, ADR-0010) predates it and differs in claim states, rule outcomes, policy storage,
chain mechanics, payout flow and API shape.

## Decision
Build to the ARD. Its state machine (section 4), policy model (5), chain/delegation/sample audit
(6), schema and constraints (7), API (8), frontend requirements (9), payout and dashboard (10),
controls C1-C14 (11) and operations (12) are authoritative. ADR-0009's materialised-steps idea
survives in the ARD's form (ADR-001 in the ARD: level configuration, frozen `required_levels`,
one open step at a time). ADR-0010's "rule types in code, parameters as data" survives with rule
instances as `policy_rule` rows instead of one JSON document. Gaps and the closing work are
tracked in `docs/14-ard-alignment.md`.

## Consequences
The backend domain from A-0006 is reworked before the frontend features start; infrastructure,
layering and tooling carry over. Guideline conflicts (pagination, status codes, error codes,
repo layout) are resolved once and the numbered docs updated in the same change.
