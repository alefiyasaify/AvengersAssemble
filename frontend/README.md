# Frontend

ExpenseFlow UI: React 19 (JavaScript) + Ant Design 6, built with Create React App. It talks to the
backend only through `/api/v1` (see `src/api/`). Conventions: [CLAUDE.md](CLAUDE.md).

## Quick start

```sh
cp .env.example .env              # defaults work for local development
npm install                       # on Windows, add --ignore-scripts if a postinstall step fails
npm start                         # http://localhost:3000
```

Start the backend on :8000 first (see `../backend/README.md`; `make seed` prints the demo logins).
Then sign in with one of those emails and the seed password.

## How a request flows

```
Browser --/api/v1/...--> CRA dev server :3000 --src/setupProxy.js--> FastAPI :8000 --> SQLite
         (cookies + X-CSRF-Token)
```

## Scripts

| Script                              | What                                            |
| ----------------------------------- | ----------------------------------------------- |
| `npm start`                         | Dev server on :3000 with the `/api` proxy       |
| `npm run build`                     | Production build into `build/`                  |
| `npm run lint`                      | ESLint (CRA config + jsx-a11y), zero warnings   |
| `npm run format` / `format:check`   | Prettier                                        |
| `npm test`                          | Jest via react-scripts (no tests yet)           |
| `npm run mock:api`                  | Prism mock of `../backend/openapi.json` on :4010 |

## Environment (`.env.example`)

| Variable               | Scope      | Default                 | Notes                                   |
| ---------------------- | ---------- | ----------------------- | --------------------------------------- |
| `BACKEND_INTERNAL_URL` | dev server | `http://localhost:8000` | target of the `/api` proxy              |
| `PORT`                 | dev server | `3000`                  |                                         |
| `REACT_APP_NAME`       | public     | `ExpenseFlow`           | inlined at build time; never secrets    |
