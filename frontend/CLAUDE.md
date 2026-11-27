# Frontend (Next.js)

Scope: everything under `frontend/`. Root rules in `../CLAUDE.md` also apply.

## Stack

Next.js 16 App Router (Turbopack, Cache Components), React 19, TypeScript strict, Tailwind v4 + shadcn/ui conventions, TanStack Query, react-hook-form + zod 4, openapi-typescript + openapi-fetch, Vitest 5 + RTL + MSW 3, ESLint (boundaries, jsx-a11y), Prettier, pnpm, Node 24 LTS.
Next.js 16 APIs differ from older versions: read `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`).

## Commands (run in `frontend/`)

- `pnpm dev` on :3000, `pnpm build`, `pnpm start`
- `pnpm test` (Vitest + coverage gate 80%), `pnpm lint`, `pnpm format` / `pnpm format:check`, `pnpm typecheck`
- `pnpm gen:client` regenerate API types from `../backend/openapi.json`; `pnpm check:client` drift check
- `pnpm mock:api` Prism mock server from the spec on :4010
- From the repo root: `make gen-contract` (spec + client), `make check-contract` (both drift checks)

## Layout

`src/app` thin routes -> `src/features/<name>` (components, hooks, api, schemas, types.ts, index.ts) -> `src/shared` (ui, api-client, lib, hooks, config). Test support in `src/test` (MSW, render helpers).
Dependency direction is one-way: app -> features -> shared. Features and routes import a feature only via its `index.ts`. Enforced by ESLint (`boundaries/dependencies`).
New feature: copy `src/features/_template` (its `README.md` has the checklist).

## Rules

- Server components by default; `"use client"` only on small interactive leaves.
- Browser calls: `apiClient` + `unwrap()` from `@/shared/api-client`, relative `/api/v1/...` (proxied). Server code: `serverApiClient` (server-only, `BACKEND_INTERNAL_URL`). Never hard-code backend host or port. ADR-0008.
- Contract types are aliases of the generated schema; after any backend API change run `make gen-contract` and fix what `pnpm typecheck` reports.
- Handle errors through the typed `ApiError` (maps the backend error envelope, proxy and network failures). Every fetching route has `loading.tsx` and `error.tsx` (props `{ error: unknown, retry }`).
- Server state via TanStack Query, URL state via search params; no global store without justification.
- Forms: react-hook-form + zod; backend remains the validation authority; map `ApiError.fieldErrors()` to fields.
- Styling: design tokens in `src/app/globals.css` (`@theme`), no ad-hoc colours.
- Accessibility is required: semantic HTML, labels, keyboard, contrast (WCAG 2.2 AA).
- Only `NEXT_PUBLIC_*` env vars reach the browser; never put secrets there. Rewrites, headers and `NEXT_PUBLIC_*` are fixed at build time.
- Tests: MSW handlers in `src/test/msw` typed with the generated schema; unhandled requests fail.
  See `@../docs/04-frontend-guidelines.md` for detail.

## Don'ts

- Never edit `src/shared/api-client/generated/`.
- No `any`, `@ts-ignore`, non-null assertions, or `dangerouslySetInnerHTML`.
- No hand-written `fetch` to the backend; no tokens in `localStorage`.
- No imports from `backend/`, and no imports from a feature's internals.
