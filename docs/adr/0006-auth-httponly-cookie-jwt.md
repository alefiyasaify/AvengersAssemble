# ADR-0006: Browser auth via HttpOnly cookies carrying short-lived JWTs

- Status: Accepted. Parameters amended by ADR-0011 / ARD section 8 (2026-11-27): refresh token lifetime is 8 hours (not 14 days), accounts lock after 5 failed sign-ins (`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`), `GET /me` returns role and permissions. The transport decision is unchanged.
- Date: 2026-11-27
- Deciders: project lead (resolves PLAN D-001)

## Context
docs/02 left the auth transport open (Bearer header vs HttpOnly cookie). docs/04 and docs/12
require that browsers never hold tokens in JS-readable storage and that access tokens are
short-lived with rotating refresh tokens. ADR-0004 makes the browser talk to a single origin
(Next.js proxies `/api/*`), so cookies stay first-party.

## Decision
- The backend issues a 15-minute **access JWT** and a 14-day **refresh JWT** (HS256, signed with
  `SECRET_KEY`; claims `sub`, `type`, `iat`, `exp`, `jti`), set as `HttpOnly; Secure; SameSite=Lax`
  cookies (`Secure` off only for `APP_ENV=local`). Refresh tokens rotate on every use; reuse of a
  rotated token revokes the family.
- The backend also accepts `Authorization: Bearer <access token>` for non-browser clients (tools,
  contract tests). Browsers never see or store the token value.
- Cookie-authenticated mutating requests (`POST/PUT/PATCH/DELETE`) require CSRF protection:
  double-submit token (`csrf_token` cookie, non-HttpOnly, echoed in `X-CSRF-Token`), plus
  `SameSite=Lax`.
- Passwords: Argon2id, minimum length 12 (docs/12).
- Config: `ACCESS_TOKEN_TTL_MIN` (default 15), `REFRESH_TOKEN_TTL_DAYS` (default 14).

## Options considered
1. Bearer token held by the frontend - simple, but the token must live in JS memory/storage
   (XSS exposure, conflicts with docs/04/12) and needs custom refresh plumbing.
2. HttpOnly cookies set by the backend through the same-origin proxy (chosen) - no token in JS,
   works with server components (forward the cookie), needs CSRF protection.
3. Server-side sessions (opaque id + session table) - easy revocation, but adds a write per request
   on single-writer SQLite.

## Consequences
Positive: tokens unreachable from JS; same flow for browser and server components; stateless
access checks. Negative: CSRF handling required; refresh-token revocation needs a small store
(`jti` denylist/family table). Follow-ups: the auth module (login, refresh, logout, rate limiting
per docs/12) is built with the first protected feature; Step 2 ships only the hashing and JWT
helpers in `backend/app/core/security.py`.
