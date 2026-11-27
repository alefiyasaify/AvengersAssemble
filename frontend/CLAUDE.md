# Frontend (React + Ant Design)

Scope: everything under `frontend/`. Root rules in `../CLAUDE.md` also apply.

## Stack

React 19 in plain JavaScript, Create React App (`react-scripts` 5), Ant Design 6 + `@ant-design/icons`, React Router 7, TanStack Query 5, dayjs, npm, Node 24.
No TypeScript, no Next.js, no Tailwind. Tests are not written yet (Jest via `react-scripts test` when they are).

## Commands (run in `frontend/`)

- `npm start` dev server on :3000 (proxies `/api` to the backend, see `src/setupProxy.js`)
- `npm run build` production build into `build/`
- `npm run lint` (CRA ESLint config + jsx-a11y), `npm run format` / `npm run format:check`
- `npm test` (passes with no tests)
- Install with `npm install --ignore-scripts` on Windows if a postinstall script fails.

## Layout

```
src/
  index.js, App.jsx        entry + all routes
  setupProxy.js            dev proxy /api -> BACKEND_INTERNAL_URL (default http://localhost:8000)
  api/                     one module per backend area; httpClient.js is the only place that calls fetch
  context/AuthContext.jsx  signed-in user (GET /me), login/logout, ROLE_HOME
  hooks/                   useIsDesktop, useLookups (departments, cities, categories)
  utils/                   formatMoney, statusLabels, policyCheck (advisory live check)
  components/layout|common|charts
  pages/<role>/<Name>Page.jsx
```

## Rules

- Talk to the backend only through `src/api/*` -> `httpClient.js`, relative `/api/v1/...`. Never hard-code the backend host.
- Auth is the backend's HttpOnly cookie session (ADR-0006). `httpClient` echoes the `ef_csrf` cookie in `X-CSRF-Token` on every non-GET, adds `Idempotency-Key` on POST, and on a 401 calls `/auth/refresh` once and retries. Never store tokens in JS or localStorage.
- Every state-changing claim call sends `expected_version`; handle 409 `CLAIM_VERSION_CONFLICT` by reloading.
- Money is integer paise in the API; format only for display (`utils/formatMoney.js`).
- The backend is the authority for policy and permissions. `utils/policyCheck.js` is advisory only (rules from `GET /policy/active`); the approval route comes from `POST /claims/{id}/policy-preview`.
- Server state via TanStack Query; no other global store.
- Accessibility: real buttons/links/labels, keyboard support, WCAG 2.2 AA contrast.
- Pages adapt at 992px (`useIsDesktop`): sidebar layout on laptops, phone layout below.

## Don'ts

- No mock data in `src/`; no direct `fetch` outside `api/httpClient.js`.
- No imports from `backend/`.
- No `dangerouslySetInnerHTML`.
