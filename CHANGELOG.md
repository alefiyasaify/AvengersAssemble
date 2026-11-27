# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository foundation: git configuration, root Makefile, pre-commit hooks, commitlint,
  CODEOWNERS, PR and issue templates, contributor and security docs.
- Developer prerequisites: `scripts/install-prereqs.ps1` (Windows/winget) and `make doctor`.
- Backend service scaffold (FastAPI, SQLAlchemy, Alembic, SQLite) with system endpoints
  `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1/version` (contract: additive).
- ADR-0006 (auth: HttpOnly cookies with short-lived JWTs) and ADR-0007 (UUIDv7 ids).
- Frontend scaffold (Next.js 16, React 19, TypeScript, Tailwind v4, TanStack Query): typed API
  client generated from `backend/openapi.json`, same-origin `/api` proxy, security headers, home
  page with a live system-status card. ADR-0008 (frontend API access paths, build-time config).
- `make gen-contract` and `make check-contract` keep the spec and the frontend client in sync.
- Documentation synced with the implementation (all guides, tracking files, PR template); Prompt 11
  added to the agent prompts; `ACTIONS.md` uses the union merge driver.
