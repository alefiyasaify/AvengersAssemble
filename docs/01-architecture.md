# 01 Architecture

## System context
```
Browser --HTTPS--> Next.js (3000) --/api/* rewrite--> FastAPI (8000) --> SQLite file (volume)
                      |                                    ^
                      +-- server components may call ------+  (server-side, same API contract)
```

## Principles
1. **Contract-first.** The OpenAPI spec is the only integration point between teams.
2. **Modular monolith per side.** Feature modules with explicit public interfaces; no cross-module reach-ins.
3. **Single owner per concern.** Backend owns data and business rules; frontend owns presentation and UX state.
4. **Replaceable infrastructure.** SQLite sits behind the repository layer so a move to Postgres is configuration plus a migration review, not a rewrite.
5. **12-factor config.** Behaviour changes through environment variables, never code edits.
6. **Everything reproducible.** One command builds and runs the whole system.

## Ownership and conflict avoidance
| Area | Owner | May be edited by others? |
|---|---|---|
| `frontend/` | Frontend team | PR with owner review |
| `backend/` | Backend team | PR with owner review |
| `backend/openapi.json` | Backend team | Generated; contract-change PR rules apply |
| `frontend/src/shared/api-client/generated/` | Generated | Never by hand |
| `tests/` | QA/Automation | PR with owner review |
| `docs/`, root config | Architects | PR with owner review |

Runtime conflict prevention: fixed ports, no shared files at runtime, no shared env file, DB accessed by exactly one process, each service containerized independently.

## Backend module model
```
modules/<name>/
  router.py       HTTP only: parse, call service, return schema
  schemas.py      Pydantic request/response models (the contract)
  service.py      Business rules; the module's public interface
  repository.py   All DB access for this module
  models.py       SQLAlchemy models
  deps.py         Module-specific FastAPI dependencies
  tests/
```
Allowed dependencies: `router -> service -> repository -> models`. A module may call another module's **service** only, never its repository or models.

## Frontend feature model
```
features/<name>/
  components/  hooks/  api/  schemas/  types.ts  index.ts (public exports only)
```
`app/` routes compose features. Features may import `shared/`, never each other's internals (use the feature's `index.ts`).

## Data flow (typical read)
- Browser (client component): feature hook -> feature `api/` function -> `apiClient` (generated types) -> same-origin `/api/v1/...` -> Next.js rewrite -> router -> service -> repository -> SQLite.
- Server component: feature `api/` function -> `serverApiClient` -> `BACKEND_INTERNAL_URL/api/v1/...` -> router -> service -> repository -> SQLite (ADR-0008).

## Current modules and features
| Side | Name | Purpose | Public interface |
|---|---|---|---|
| Backend | `modules/health` | liveness, readiness (DB check), version; `/healthz`, `/readyz` at the root | `health.service` (`HealthService`, `VersionService`) |
| Backend | `modules/auth` | login, refresh, logout; cookie JWT + CSRF; lockout | `auth.service` |
| Backend | `modules/org` | departments, users and hierarchy, cities, categories, bank accounts, `/me` | `org.service` (`OrgService`, `org_service()`) |
| Backend | `modules/audit` | append-only, hash-chained `audit_events` | `audit.service` (`AuditService`) |
| Backend | `modules/policy` | versioned rules, approval levels, app config; the pure engine | `policy.service`, `policy.engine` |
| Backend | `modules/receipts` | upload (magic bytes, 5 MB, SHA-256), storage interface | `receipts.service` |
| Backend | `modules/claims` | claims, lines, state machine, approval chain, delegation, sample audit; owns the claim tables | `claims.service` (`ClaimsService`, `claims_service()`) |
| Backend | `modules/approvals` | HTTP surface for approvers (inbox, decisions, delegations, review queue, bulk, sample audits); facade over `claims.service` | `approvals.service` |
| Backend | `modules/payouts` | maker-checker batches and the mock bank CSV | `payouts.service` (`payouts_service()`) |
| Backend | `modules/reports` | role-scoped dashboard summary | `reports.service` |
| Backend | `app/seeds` | deterministic demo seed (`make seed`) via the services above | `python -m app.seeds.generate` |
| Backend | `modules/_template` | copy-me skeleton (not registered) | - |
| Frontend | `features/system-status` | shows API/DB status and version | `features/system-status/index.ts` (`SystemStatusCard`, hooks) |
| Frontend | `features/_template` | copy-me skeleton (not imported) | - |

## Scaling path
- Stage 1: one backend container, SQLite on a volume (current).
- Stage 2: Postgres, same repositories, multiple instances behind a proxy.
- Stage 3: split modules into services only if team or load demands it (new ADR required).

## Non-functional targets
p95 API latency < 300 ms at expected load; frontend LCP < 2.5 s; availability, RPO and RTO documented per environment.
