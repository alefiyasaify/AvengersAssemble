# ADR-0010: Expense policy as versioned JSON configuration evaluated by a pure engine

- Status: Superseded by ADR-0011 (ARD section 5: rules as policy_rule rows)
- Date: 2026-11-27
- Deciders: project lead

## Context
The use case requires policy rules to be "seeded as configuration, not hard-coded", and auditors
must be able to explain any past decision.

## Decision
Rules live in immutable `policy_versions` rows (JSON document validated by a Pydantic schema); one
version is active. Rule *types* (daily category limit, tiered limit, per-line limit, receipt
required, duplicate detection, weekend flag, stale expense) are small pure functions in
`modules/policy/rules.py`; the document chooses which rules run, their parameters and outcomes.
`PolicyEngine` takes the claim, the employee's relevant history and the document and returns
per-line flags and outcomes with no I/O. Claims store the version they were evaluated with.
The finance head creates new versions via the API; old versions are never modified.

## Options considered
1. Hard-coded rules - violates the requirement.
2. Generic rule DSL / expression language - flexible but hard to validate, test and secure.
3. Typed rule catalogue + JSON parameters (chosen) - every rule type has unit tests, documents are
   schema-validated, and decisions are reproducible from the stored version.

## Consequences
Positive: rule-by-rule unit tests independent of the DB; reproducible audits; safe edits.
Negative: a genuinely new kind of rule needs code (a new rule type) plus a config entry.
