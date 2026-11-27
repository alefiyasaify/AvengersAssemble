# Feature template

Copy this folder to start a feature: `cp -r src/features/_template src/features/<kebab-name>`.
It is excluded from coverage and must never be imported.

```
api/         typed calls via the generated client: `unwrap(apiClient.GET("/api/v1/..."))`
hooks/       TanStack Query hooks (`useThing`, `useCreateThing`); components never call the client
components/  UI. Server components by default; `"use client"` only on interactive leaves
schemas/     zod schemas for forms (UX only - the backend is the validation authority)
types.ts     aliases of generated contract types (`components["schemas"]["ThingRead"]`)
index.ts     the ONLY public entry point; other code imports `@/features/<name>`
```

Checklist:

1. The endpoints exist in `backend/openapi.json`. If not, stop and request a contract change
   (backend adds it, runs `make gen-openapi`, then `make gen-client`) - never work around it.
2. Rename `example`/`Example` throughout; replace the endpoint in `api/`.
3. Every list has an empty state; every query a loading and error state; every mutation pending
   and failure feedback. Map `ApiError.fieldErrors()` onto form fields.
4. Tests next to the code (`*.test.tsx`), network mocked with MSW using the generated types.
5. Compose the feature in a route under `src/app/` (with `loading.tsx` and `error.tsx`).
