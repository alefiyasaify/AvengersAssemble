# 02 API Contract

The API contract is the **single source of truth** between frontend and backend. The ExpenseFlow ARD section 8 (ADR-0011) defines the endpoints; this doc holds the conventions (G2-G8 in docs/14 resolved in favour of the ARD).

## Conventions
- REST over HTTPS, JSON bodies, UTF-8. Base path `/api/v1`.
- Plural, lowercase, hyphenated resource names: `/api/v1/purchase-orders`.
- JSON fields in `snake_case`; enum values (statuses, roles, outcomes) in `UPPER_SNAKE` (`PENDING_MANAGER`). Money is integer paise in fields ending `_paise`.
- JSON fields in `snake_case`. Timestamps ISO 8601 UTC with `Z`. IDs are opaque strings: UUIDv7 in canonical 36-char form (ADR-0007); never expose autoincrement integers.
- Methods: `GET` read, `POST` create, `PUT` full replace, `PATCH` partial update, `DELETE` remove.
- Every operation has a unique, stable `operationId` of the form `<module>_<verb>_<noun>` (it becomes the TS client function name).
- Every operation declares response models for all documented statuses, and `tags` equal to the module name.

## Status codes
200 OK, 201 Created (with `Location`), 204 No Content, 400 validation or malformed request, 401 unauthenticated, 403 forbidden role, 404 not found **or not yours** (never 403 for another user's data), 405 method not allowed, 409 conflict, version conflict or illegal transition, 413 file too large, 429 rate limited, 500 unexpected, 503 dependency unavailable (readiness).

Stable `code` values are `UPPER_SNAKE`: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`; modules add their own (`CLAIM_NOT_FOUND`, `CLAIM_VERSION_CONFLICT`, `ILLEGAL_TRANSITION`). Every response carries `X-Request-ID` (echoed if the client sent a valid one), matching `error.request_id`.

## Error envelope (all non-2xx)
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "details": {"fields": [{"field": "lines.0.amount_paise", "issue": "must be > 0"}]},
    "request_id": "9f1c..."
  }
}
```
`code` is a stable machine-readable string. `message` is human-readable and safe to show. Never leak stack traces or SQL.

## Pagination, filtering, sorting
- Lists use cursor pagination: `?limit=<1..100, default 50>&cursor=<opaque>`. Response: `{"items": [...], "next_cursor": "..." | null, "total_estimate": 123}`. Treat the cursor as opaque.
- Filtering via explicit query params (`?status=open`). Sorting: `?sort=-created_at,name`.
- Unbounded lists are not allowed.

## Versioning and breaking changes
Breaking = removing/renaming a field, changing a type, making an optional field required, tightening validation, changing semantics or status codes.
Additive changes (new optional fields, new endpoints) are non-breaking. Breaking changes require `/api/v2` or a deprecation window (minimum two releases, `Deprecation` and `Sunset` headers, noted in CHANGELOG). Clients must ignore unknown response fields.

## Idempotency and concurrency
- `PUT` and `DELETE` are idempotent. `POST` for duplicate-sensitive resources accepts an `Idempotency-Key` header.
- Mutable resources support optimistic locking with a `version` field; every state-changing call on a claim sends `expected_version` and gets 409 `CLAIM_VERSION_CONFLICT` if it is stale.
- Mutating endpoints accept an `Idempotency-Key` header (ARD section 7).

## Auth
Decided in ADR-0006: HttpOnly cookies carrying short-lived JWTs for browsers (with CSRF protection on mutating requests); `Authorization: Bearer` accepted for non-browser clients. Unauthenticated endpoints are explicitly listed: `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1/version`.

`503 Service Unavailable` is used by `/health/ready` when a dependency (the database) is down.

## Required system endpoints
`GET /healthz` (liveness), `GET /readyz` (checks DB), `GET /metrics` (Prometheus, P3-08) at the service root; `GET /api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/version` remain as aliases. `GET /api/v1/me` returns the user, role and permissions the UI uses.

Additive endpoints beyond the ARD list: `POST /api/v1/auth/register` (public self-registration; always an inactive EMPLOYEE, same 202 answer whether or not the email exists, rate-limited, off with `SELF_REGISTRATION_ENABLED=false`; the head finds pending accounts with `GET /admin/users?pending=true` and activates them with `PATCH /admin/users/{id}`), and `POST /api/v1/approvals/{step_id}/reassign` (finance head only, audited, never on their own claim) unblocks a step nobody may act on (docs/14 E5). `Idempotency-Key` is accepted by CORS but not stored yet (AI-013).

## Spec lifecycle
1. Backend dev changes routers/schemas.
2. `make gen-openapi` writes `backend/openapi.json` (deterministic, sorted keys). Commit it.
3. CI fails if the committed spec differs from the generated one (drift check).
4. `make gen-client` regenerates `frontend/src/shared/api-client/generated/schema.ts` with `openapi-typescript` (deterministic, `GENERATED - DO NOT EDIT` header). Commit the result. `make gen-contract` runs steps 2 and 4 together; `pnpm typecheck` then shows every UI call and MSW mock that must change.
   `make check-contract` runs both drift checks (backend `check-openapi`, frontend `check:client`).
5. CI runs `oasdiff breaking` against `main`; a breaking diff fails unless the PR carries `breaking-approved`.
6. Frontend can develop against the spec with a mock server (Prism) before the backend is ready.

## Contract change PR checklist
- [ ] Label `contract-change`; both owners approved
- [ ] `openapi.json` and generated client updated
- [ ] Breaking-change check passed or approved
- [ ] CHANGELOG entry
