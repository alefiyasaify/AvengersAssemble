# ADR-0005: Python (pytest) Playwright for E2E and contract tests

- Status: Accepted

## Decision
E2E and contract tests are written in Python with pytest-playwright and Schemathesis, in `tests/`, independent of the frontend toolchain.

## Consequences
Positive: independent QA ownership, shared language with backend tooling, no coupling to the frontend build. Negative: no direct reuse of TS types; mitigated by using the OpenAPI spec for API-level checks.
