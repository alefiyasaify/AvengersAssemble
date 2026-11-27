# 12 Security Guidelines

Baseline: OWASP ASVS Level 1 (Level 2 for auth and data handling), OWASP Top 10.

## Authentication and authorization
- Passwords hashed with Argon2id; enforce length (>= 12), no composition theatre, check against breached lists when feasible.
- Short-lived access tokens (15 min) plus refresh tokens with rotation; tokens in HttpOnly, Secure, SameSite=Lax cookies when browser-based (ADR-0006). Helpers: `backend/app/core/security.py` (Argon2id, JWT encode/decode with type and required-claim checks).
- Authorization enforced in the **service layer** per resource (deny by default); never rely on the UI to hide actions.
- Rate limit login, signup and password reset; lock out or slow down on repeated failures.

## Input and output
Validate all input with Pydantic (types, bounds, formats); limit body size; parameterized queries only; encode output; sanitize any rich text; validate file uploads by type, size and content.

## Transport and headers
HTTPS everywhere in non-local environments. Security headers via Next.js (`frontend/next.config.ts`): CSP, HSTS (staging/production only), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` + `frame-ancestors`. The CSP currently allows `'unsafe-inline'` scripts (no nonces, ADR-0008); moving to nonces is AI-007. CORS: explicit allow-list, no `*` with credentials. CSRF protection for cookie-authenticated mutating requests.

## Secrets and config
Secrets only in environment or a secret manager; never in git, images or logs. Rotate on exposure. `gitleaks` in pre-commit and CI.

## Dependencies and supply chain
Lockfiles committed; automated updates (Dependabot/Renovate); `pip-audit`, `pnpm audit`, CodeQL, Trivy in CI; pin GitHub Actions by SHA; review new dependencies (license, maintenance, size).

## Data protection
Minimize PII; classify data; encrypt backups; define retention; never log tokens, passwords or full PII; SQLite file permissions restricted to the app user.

## Logging and monitoring
Audit log for auth events and privileged actions; request IDs across tiers; alert on spikes in 401/403/5xx.

## Process
Threat model for every new module that handles sensitive data (STRIDE, short doc in the PR); security checklist in the PR template; responsible disclosure in `SECURITY.md`.
