# Frontend

Next.js 16 (App Router) + React 19 + TypeScript. Talks to the backend only through the API
contract (`../backend/openapi.json`) via a generated, typed client. Conventions:
[CLAUDE.md](CLAUDE.md), [docs/04](../docs/04-frontend-guidelines.md), ADR-0004 and ADR-0008.

## Quick start

```sh
cp .env.example .env      # defaults work for local development
pnpm install
pnpm dev                  # http://localhost:3000 (start the backend on :8000 first: make -C ../backend run)
```

Or from the repo root: `make setup` then `make dev` (both services). On Windows use Git Bash.

## How a request flows

```
Browser --/api/v1/health/ready--> Next.js :3000 --rewrite--> FastAPI :8000 --> SQLite
   ^ apiClient (same origin)                      Server Components: serverApiClient -> BACKEND_INTERNAL_URL
```

## Scripts

| Script                             | What                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev` / `build` / `start`     | Develop / production build (standalone output) / serve on :3000                                  |
| `pnpm lint`                        | ESLint: boundaries, a11y, strict TS, no raw `fetch`                                              |
| `pnpm format` / `format:check`     | Prettier (+ Tailwind class sorting)                                                              |
| `pnpm typecheck`                   | `next typegen && tsc --noEmit`                                                                   |
| `pnpm test`                        | Vitest + RTL + MSW, coverage gate 80%                                                            |
| `pnpm gen:client` / `check:client` | Generate / drift-check `src/shared/api-client/generated/schema.ts`                               |
| `pnpm mock:api`                    | Prism mock of the spec on :4010 (point `BACKEND_INTERNAL_URL` at it to work without the backend) |

## Layout

```
src/app/                    layout, page, loading, error, not-found, providers
src/features/system-status/ health/version card (proves browser -> proxy -> API -> DB)
src/features/_template/     copy to start a feature (README inside)
src/shared/api-client/      generated/ (never edit), client.ts, server-client.ts, api-error.ts
src/shared/{ui,lib,config}/ primitives, utilities, zod-validated env
src/test/                   MSW handlers + render helpers
```

## Environment (`.env.example`)

| Variable               | Scope         | Default                 | Notes                                                       |
| ---------------------- | ------------- | ----------------------- | ----------------------------------------------------------- |
| `APP_ENV`              | server, build | `local`                 | `staging`/`production` add HSTS + upgrade-insecure-requests |
| `BACKEND_INTERNAL_URL` | server, build | `http://localhost:8000` | proxy target; fixed at `next build`                         |
| `NEXT_PUBLIC_APP_NAME` | public, build | `Avengers Assemble`     | inlined into the bundle; never secrets                      |
