# 08 Docker and Environments

## Principles
One image per service, multi-stage builds, non-root runtime user, pinned base image versions (by digest in production), small images, health checks, no secrets baked into images.

## Services
| Service | Image build | Port | Volume |
|---|---|---|---|
| `backend` | `backend/Dockerfile` | 8000 | `backend-data:/app/data` (SQLite file) |
| `frontend` | `frontend/Dockerfile` | 3000 | none |
| `e2e` (profile `e2e`) | `tests/Dockerfile` | n/a | `./test-results` |

## Backend Dockerfile (pattern)
Stage 1 `builder`: `python:3.12-slim`, install `uv`, sync locked deps into a venv. Stage 2 `runtime`: copy venv and `app/`, create user `app`, `HEALTHCHECK` hitting `/api/v1/health/live`, entrypoint script runs `alembic upgrade head` then `uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000 --workers 1` (the app is built by a factory so settings are injected, not read at import).

## Frontend Dockerfile (pattern)
Stages: `deps` (pnpm install --frozen-lockfile), `build` (`next build` with `output: "standalone"`), `runtime` (`node:24-alpine`, Node 24 LTS matching `frontend/.nvmrc`; copy `.next/standalone`, `.next/static`, `public`, non-root user, `node server.js`). `BACKEND_INTERNAL_URL` is the rewrite target. Next.js 16 fixes rewrites, headers and `NEXT_PUBLIC_*` at `next build`, so pass `BACKEND_INTERNAL_URL`, `APP_ENV` and `NEXT_PUBLIC_*` as build args (one image per environment, ADR-0008). `next.config.ts` validates them with zod and fails the build if invalid.

## docker-compose.yml essentials
- `backend` with healthcheck; `frontend` `depends_on: backend: condition: service_healthy`.
- Named volume for SQLite; `restart: unless-stopped`.
- `env_file` per service (`backend/.env`, `frontend/.env`). No shared env file.
- Profiles: default = app, `e2e` = adds test runner and uses a separate volume/DB, `dev` = bind mounts and hot reload via `compose watch`.
- Override file `docker-compose.override.yml` for local developer tweaks (gitignored variant allowed).

## Environment matrix
| Env | Purpose | DB | Config source |
|---|---|---|---|
| local | developer machine | local file / volume | `.env` |
| ci | automated checks | ephemeral | CI variables |
| staging | pre-prod verification | persistent volume | secret store |
| production | users | persistent volume + backups | secret store |

## Env var contract
Backend: `APP_ENV`, `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `LOG_LEVEL`, `ACCESS_TOKEN_TTL_MIN`, `REFRESH_TOKEN_TTL_DAYS` (ADR-0006), `GIT_SHA` (build commit, set by CI/Docker), `RECEIPTS_DIR` (receipt file storage, a volume in Docker), `MAX_RECEIPT_BYTES` (default 5 MB). The seed command also reads `SEED_DEMO_PASSWORD` (demo login password; generated and printed once when unset, never stored). Frontend (all build-time, ADR-0008): `APP_ENV`, `BACKEND_INTERNAL_URL` (server-only), `NEXT_PUBLIC_APP_NAME`, other `NEXT_PUBLIC_*` (non-secret only). Every variable documented in its `.env.example`.

## `.dockerignore`
Exclude `.git`, `node_modules`, `.next`, `.venv`, `*.db*`, `.env*` (except examples), tests output, docs.

## Security and hygiene
Scan images with Trivy in CI, no `latest` tags, drop capabilities, read-only root filesystem where possible (writable `data/` and `/tmp` only), resource limits in compose, and one process per container.

## Persistence and ops
SQLite volume must survive redeploys. Back up with the `.backup` command (see `03-database.md`). Never run two backend containers against the same SQLite file.
