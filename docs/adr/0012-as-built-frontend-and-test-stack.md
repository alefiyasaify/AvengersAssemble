# ADR-0012: Frontend is React + Create React App + Ant Design; tests are Playwright + TypeScript

- Status: Accepted
- Date: 2026-11-27
- Deciders: project team (recorded by the close-out audit, A-0013)

## Context
The guideline pack planned a Next.js 16 + TypeScript frontend (ADR-0004, ADR-0008) and Python/pytest Playwright tests (ADR-0005). The teams built and shipped something else: a React 19 (JavaScript) single-page app on Create React App (`react-scripts` 5) with Ant Design 6, React Router 7 and TanStack Query, and a Playwright + TypeScript test pack with `playwright-bdd`, Allure and Winston. Backend, API contract, auth (ADR-0006) and the data rules are unchanged.

## Decision
Accept the stack as built.
- Frontend: `frontend/`, JavaScript, `npm`, dev proxy `src/setupProxy.js` forwards `/api` to `BACKEND_INTERNAL_URL` (browser calls stay same-origin, so cookies and CSRF work as in ADR-0006). There are no server components and no `serverApiClient`.
- Frontend API access is hand-written (`src/api/*`, one `fetch` wrapper). There is no generated TypeScript client; `backend/openapi.json` stays the contract and is checked for drift on the backend side only.
- Tests: `tests/` is TypeScript Playwright (BDD features + specs), not pytest.

## Supersedes
- ADR-0004 (Next.js rewrite proxy): replaced by the CRA dev proxy; a production deployment needs a reverse proxy that serves `build/` and forwards `/api` (not defined yet).
- ADR-0005 (Python Playwright): replaced by TypeScript Playwright.
- ADR-0008 (frontend API access paths and build-time config): the Next.js parts no longer apply. Build-time config is now `REACT_APP_*` (inlined by CRA).

## Consequences
Positive: matches the code and the team's skills.
Trade-offs: no generated types, so contract changes are caught by the E2E pack rather than the compiler; root `make gen-client`, `check-contract`, `typecheck` still point at pnpm scripts that do not exist (AI-018); docs 04, 06, 08, 09, 11 and the agent prompts still describe the old plan (AI-018); AI-007 (CSP nonces for Next.js) is dropped.
Follow-ups: AI-016..AI-022 in ACTIONS.md. The stack itself is not up for change.
