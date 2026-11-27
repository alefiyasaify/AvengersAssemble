# ADR-0002: Contract-first integration via OpenAPI

- Status: Accepted

## Context
Two teams need to evolve independently without runtime surprises.

## Decision
FastAPI generates `backend/openapi.json`, committed and drift-checked in CI. The frontend generates its typed client from it with `openapi-typescript`. Breaking changes are detected with `oasdiff` and require explicit approval.

## Consequences
Positive: type-safe client, early detection of breakage, mockable API. Negative: generated artefacts in git, extra CI steps.
