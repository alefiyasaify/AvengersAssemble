# 12 Security Guidelines

Baseline: OWASP ASVS Level 1 (Level 2 for auth and data handling), OWASP Top 10. The ARD bypass threat model (section 11, controls C1-C14) is mapped to code and tests in `docs/13`.

## Authentication and authorization
- Passwords hashed with Argon2id; minimum length 12; an unknown email costs as much time as a wrong password (dummy hash); no default credentials outside the demo seed (`DEMO_PASSWORD`, printed only by the seed command).
- Access token 15 min plus refresh token 8 h with rotation, in HttpOnly, SameSite=Lax cookies (`Secure` outside local/test/ci) set by the backend (ADR-0006, ARD 8). `GET /me` returns the role and permissions; `Authorization: Bearer` is accepted for non-browser clients. Helpers: `backend/app/core/security.py` (Argon2id, JWT with type and required-claim checks, 100% covered) and `core/auth.py` (principal, CSRF).
- CSRF: cookie-authenticated mutating requests must echo the `ef_csrf` cookie in `X-CSRF-Token` (double submit); Bearer requests are exempt.
- Login is rate limited per client and locks an account for `LOGIN_LOCKOUT_MINUTES` after `LOGIN_MAX_FAILURES` (5) failures; failed and successful logins are audited. The limiter is in memory (single instance, ADR-0003).
- Authorization is enforced in the **service layer** per resource (deny by default), never by the UI. Employees only see their own claims; another user's claim or receipt is **404**, so existence is not leaked (C13). Nobody acts on their own claim; delegation, maker-checker and separation of duties are in `docs/13`.

## Input and output
Validate all input with Pydantic (types, bounds, formats, `extra="forbid"`); limit body size; parameterised queries only; encode output; no `dangerouslySetInnerHTML`. Receipts: PDF/JPEG/PNG decided by magic bytes (the client's type is ignored), 5 MB read bound, random storage keys, SHA-256 recorded, served inline only through an authorised endpoint with `nosniff` and `Content-Security-Policy: sandbox`, every download audited. The payout CSV prefixes cells starting `= + - @` with a quote (formula injection) and is re-hashed on download.

## Transport and headers
HTTPS everywhere in non-local environments. Security headers via Next.js (`frontend/next.config.ts`): CSP, HSTS (staging/production only), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` + `frame-ancestors`. The CSP currently allows `'unsafe-inline'` scripts (no nonces, ADR-0008); moving to nonces is AI-007. CORS: explicit allow-list, no `*` with credentials; `X-CSRF-Token` is an allowed header.

## Secrets and config
Secrets only in environment or a secret manager; never in git, images or logs. `SECRET_KEY` is required and must be 32+ characters. Rotate on exposure. `gitleaks` in pre-commit and CI.

## Dependencies and supply chain
Lockfiles committed; automated updates (Dependabot/Renovate); `pip-audit`, `pnpm audit`, CodeQL, Trivy in CI; pin GitHub Actions by SHA; review new dependencies (license, maintenance, size). Current audit: backend and frontend production dependencies have no known vulnerabilities; the frontend dev tool `@stoplight/prism-cli` carries 2 high and 2 moderate advisories (AI-016; CI should audit with `--prod`).

## Data protection
Minimise PII; never log tokens, passwords, emails or full account numbers (bank accounts are fake in the demo and masked to the last four digits in API responses); encrypt backups; define retention; SQLite file permissions restricted to the app user.

## Audit and monitoring
Every state change, approval action, policy or configuration publish, login and failed login, payout step, receipt and bank-file download writes an append-only, hash-chained `audit_events` row in the same transaction as the change (who, on behalf of, what, before/after, when, request id, IP). UPDATE/DELETE are blocked by triggers; `AuditService.verify_chain()` re-computes the chain (the nightly job and the `expenseflow_audit_chain_valid` metric are P3-08). Request IDs flow across tiers; alerts on 401/403/5xx spikes and on audit-chain failure (P3-08).

## Process
Threat model for every new module that handles sensitive data (STRIDE, short doc in the PR); the ARD bypass review is extended when new controls are found; security checklist in the PR template; the baseline checklist is run and recorded in the Testing phase (P3-07); responsible disclosure in `SECURITY.md`.
