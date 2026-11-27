# ADR-0001: Single monorepo with hard package boundaries

- Status: Accepted

## Context
Several people will work in parallel on frontend, backend and tests and must not conflict at runtime or in review.

## Decision
One git repository with `frontend/`, `backend/`, `tests/`, `docs/`. Boundaries are enforced by CODEOWNERS, path-filtered CI, separate dependency manifests, separate env files and Dockerfiles.

## Options considered
1. Polyrepo: strongest isolation, but contract drift, harder atomic changes, more tooling.
2. Monorepo (chosen): atomic contract changes, shared CI and docs, one onboarding.

## Consequences
Positive: atomic cross-cutting PRs, single source of docs. Negative: needs discipline on boundaries and CI path filtering.
