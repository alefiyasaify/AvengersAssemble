# 04 Frontend Guidelines (Next.js)

## Stack
Next.js 16 (App Router, Turbopack, Cache Components enabled), React 19, TypeScript `strict`, Tailwind CSS v4 + shadcn/ui conventions, TanStack Query, react-hook-form + zod, `openapi-typescript` + `openapi-fetch`, Vitest + React Testing Library + MSW, ESLint (with `eslint-plugin-boundaries`, `jsx-a11y`), Prettier. Node 24 LTS (`.nvmrc`), pnpm.

> Next.js 16 differs from older versions (e.g. `error.tsx` receives `{ error: unknown, retry }`). Check `frontend/node_modules/next/dist/docs/` before using an unfamiliar API (see `frontend/AGENTS.md`).

## Structure
```
src/
  app/                  routes, layouts, loading/error/not-found files, providers.tsx. Thin: compose features only
  features/<name>/      components/, hooks/, api/, schemas/, types.ts, index.ts (public exports only)
  features/_template/   documented copy-me feature (excluded from tests/coverage)
  shared/
    ui/                 design-system primitives (Button, Card, StatusBadge, Skeleton)
    api-client/         generated/schema.ts (NEVER edit), client.ts (browser), server-client.ts (server-only), api-error.ts
    lib/                pure utilities (cn)
    hooks/
    config/             env.ts (zod schemas), server-env.ts (server-only values)
  test/                 test support only: MSW handlers/server, render helpers
```
- A feature exposes only what its `index.ts` exports. Other features and routes import from that, never from its subfolders.
- Dependency direction: `app -> features -> shared`. `shared` imports nothing from `features` or `app`. Enforced by `eslint-plugin-boundaries` (`boundaries/dependencies`); violations fail `pnpm lint`.
- Co-locate tests (`Component.test.tsx`) next to the code.

## API access (ADR-0004, ADR-0008)
- No hand-written `fetch` to the backend (ESLint bans the global outside `shared/api-client`). Use the generated types and the configured clients.
- **Browser code**: `apiClient` from `@/shared/api-client` calls relative `/api/v1/...`; Next.js rewrites proxy it to the backend. Never hard-code backend URLs or ports.
- **Server code**: `serverApiClient` from `@/shared/api-client/server-client` (server-only) calls `BACKEND_INTERNAL_URL` directly.
- Wrap calls per feature in `features/<name>/api/` with `unwrap(client.GET(...))` and expose hooks (`useOrders`, `useCreateOrder`). Components never call the client directly.
- Every failure becomes one typed `ApiError` (`status`, `code`, `message`, `details`, `requestId`): backend envelopes, non-envelope proxy errors (`upstream_unavailable`) and network failures (`network_error`, status 0).
- Contract types are aliases of the generated schema (`components["schemas"]["ReadyRead"]`), never hand-written copies.

## Keeping the UI in sync with the backend
1. Backend changes routers/schemas -> `make gen-contract` (= `make gen-openapi` + `make gen-client`).
2. `pnpm typecheck` then flags every UI call, component and MSW mock that no longer matches the contract; fix them in the same PR.
3. `make check-contract` (CI) fails if `backend/openapi.json` or `generated/schema.ts` is stale.
4. If the UI needs an endpoint or field that does not exist, stop and request a contract change; do not work around it.

## Server vs client components
- Default to **server components**. Add `"use client"` only for interactivity, browser APIs or hooks, and push it to the smallest leaf component.
- Fetch data on the server where possible; use TanStack Query for client-side caching, mutations, polling and optimistic updates.
- With Cache Components, data access is dynamic by default; opt into caching explicitly with `"use cache"` and keep dynamic parts inside `<Suspense>`.
- Server-only code (secrets, `server-env.ts`, `server-client.ts`) is marked `import "server-only"`.
- Do not pass non-serializable props from server to client components.

## State
Prefer server state (TanStack Query) and URL state (search params) over global stores. Local `useState` for UI state. Introduce a global store (Zustand) only with justification in the PR. The `QueryClient` is created once per browser session in `app/providers.tsx`; 4xx errors are not retried.

## Forms and validation
react-hook-form with zod schemas. Client validation is for UX only; the backend is the authority. Show field-level errors from the error envelope `details` via `ApiError.fieldErrors()` (see `features/_template/components/ExampleForm.tsx`).

## Styling and UI
Tailwind v4 utility classes. Design tokens are CSS variables in `src/app/globals.css` exposed through `@theme` (`bg-surface`, `text-muted-foreground`, `bg-primary`, ...); there is no `tailwind.config`. shadcn/ui primitives go to `shared/ui` (`components.json` aliases). No inline styles, no ad-hoc colors. Dark mode through tokens (`prefers-color-scheme`). System font stack (no build-time font download).

## Accessibility (WCAG 2.2 AA)
Semantic HTML first, labelled controls, visible focus, keyboard operability, color contrast, `alt` text, ARIA only when native semantics are insufficient. Status is never conveyed by color alone; async regions use `role="status"`/`aria-live`. Skip link in the root layout. `jsx-a11y` recommended rules are errors; axe checks in E2E.

## Performance
Use `next/image`; code-split with dynamic imports for heavy client widgets; avoid client-side waterfalls; cache intentionally (`"use cache"`); budget: LCP < 2.5 s, CLS < 0.1, INP < 200 ms. Run Lighthouse CI on key pages.

## Error, loading and empty states
Every route segment that fetches has `loading.tsx` and `error.tsx` (`{ error: unknown, retry }`; show `error.digest` as a reference, never internals); every list has an empty state; every query shows loading and error states; every mutation shows pending and failure feedback.

## Config and env
Validated at startup with zod in `shared/config/env.ts` (`parseServerEnv`, `parsePublicEnv`); `next.config.ts` uses the same schema. Only `NEXT_PUBLIC_*` variables reach the browser and they never hold secrets. **Build-time:** rewrites, headers and `NEXT_PUBLIC_*` are fixed at `next build`, so `BACKEND_INTERNAL_URL`, `APP_ENV` and `NEXT_PUBLIC_*` must be set when building (ADR-0008). Variables are documented in `frontend/.env.example`.

## TypeScript rules
`strict` plus `noUncheckedIndexedAccess`. No `any` (use `unknown` and narrow), no non-null assertions, no `@ts-ignore` (use `@ts-expect-error` with a description), exhaustive `switch` on unions (`switch-exhaustiveness-check`), `import type` for types, named exports except for Next.js special files. All enforced by ESLint.

## Naming
Components `PascalCase.tsx`; hooks `useThing.ts`; utilities `kebab-case.ts`; folders `kebab-case`. One component per file.

## Security
No `dangerouslySetInnerHTML` (`react/no-danger` is an error); security headers in `next.config.ts`: CSP (currently without nonces, `'unsafe-inline'` scripts; nonces tracked as AI-007), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors 'none'`, and HSTS + `upgrade-insecure-requests` only when `APP_ENV` is `staging`/`production`. Never store tokens in `localStorage` (HttpOnly cookies, ADR-0006); validate and encode all user content.

## Testing
Unit-test hooks and utilities; component-test behaviour via Testing Library (query by role/label, not test ids unless needed); mock the network with MSW (`src/test/msw`) using fixtures typed with the generated schema (`satisfies components["schemas"][...]`). Unhandled requests fail the test. Coverage gate 80% (lines, statements, functions, branches) on `features/` and `shared/`.

## Definition of a good PR
Types pass, lint and format clean, contract in sync (`make check-contract`), tests added, no console errors, accessibility checked, screenshots for UI changes.
