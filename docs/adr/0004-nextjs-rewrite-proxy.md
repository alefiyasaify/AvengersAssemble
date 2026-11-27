# ADR-0004: Browser talks to Next.js; `/api/*` is proxied to FastAPI

- Status: Superseded by ADR-0012

## Decision
Next.js `rewrites` forward `/api/:path*` to `BACKEND_INTERNAL_URL`. The browser sees a single origin, so no CORS in normal operation and cookies stay first-party. Backend CORS remains an explicit allow-list for tools and direct access.

## Consequences
Positive: no CORS complexity, backend not exposed publicly if desired. Negative: rewrite destination may be fixed at build time, so deployments must pass it as a build arg or use a runtime proxy (route handler or reverse proxy) if the target changes per environment.
