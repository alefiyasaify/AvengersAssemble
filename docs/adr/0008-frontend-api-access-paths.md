# ADR-0008: Frontend API access paths and build-time configuration

- Status: Accepted
- Date: 2026-11-27
- Deciders: project lead (refines ADR-0004; resolves orientation gaps on server-side calls)

## Context
ADR-0004 routes browser calls through a Next.js rewrite (`/api/*` -> FastAPI). Two questions were
left open: (1) Server Components cannot use relative URLs, so how do they call the API?
(2) Next.js 16 fixes rewrites, `headers()` and `NEXT_PUBLIC_*` values when `next build` runs, so
per-environment values cannot be injected at container start.

## Decision
1. **Browser code** uses the single client `shared/api-client/client.ts`: same-origin requests to
   `/api/v1/...`, proxied by the rewrite. No CORS, cookies stay first-party (ADR-0006).
2. **Server code** (Server Components, Route Handlers) uses `shared/api-client/server-client.ts`
   (`import "server-only"`), which calls `BACKEND_INTERNAL_URL` directly with the same generated
   types. Auth cookies are forwarded explicitly once auth exists.
3. **Build-time configuration:** `BACKEND_INTERNAL_URL`, `APP_ENV` and `NEXT_PUBLIC_*` are build
   inputs. Docker builds pass them as build args; one image per environment (or per target
   backend URL). Revisit with a runtime route-handler proxy if one image must serve several
   environments.
4. **CSP** is set in `next.config.ts` without nonces so pages stay statically prerendered
   (`script-src 'self' 'unsafe-inline'`). Moving to per-request nonces is tracked as AI-007.

## Options considered
1. Route-handler proxy (`app/api/[...path]/route.ts`) reading the target at runtime - one image
   for all environments, but re-implements streaming/headers/body forwarding and adds a hop in
   our own code.
2. Rewrites + direct server client (chosen) - framework-native, minimal code; costs a build per
   environment.

## Consequences
Positive: one typed contract for both paths; no CORS; static shell stays cacheable.
Negative: images are environment-specific; `'unsafe-inline'` scripts until nonces land.
Follow-ups: Docker build args (P1-06), CSP nonces (AI-007).
