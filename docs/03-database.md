# 03 Database (SQLite)

## Ownership
Only the backend touches the database, and only through repositories. No other service, script or test reads or writes the DB file directly (tests use the API or fixtures that go through the backend layer; the only direct SQL in tests is to prove the DB-level rules).

## Stack
SQLAlchemy 2.x (typed `Mapped[]` style, synchronous sessions) + Alembic. Sync sessions are the right fit for SQLite; FastAPI runs `def` endpoints in a threadpool. The schema is PostgreSQL-compatible (ARD 7): moving is a connection-string change plus a migration review.

## Mandatory connection settings (applied on every connect)
```
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```
Set via a SQLAlchemy `connect` event listener in `core/db.py` (`create_db_engine`). The same listener disables pysqlite's implicit transaction handling and a `begin` listener emits `BEGIN`, so transactions, SAVEPOINTs and `BEGIN IMMEDIATE` behave correctly. One engine per process, created in the app factory and held on `app.state` (no module globals). Session-per-request via the `get_db` dependency, registered with `Depends(get_db, scope="function")` (`DbSession` in `core/deps.py`) so the commit happens before the response is sent (commit on success, rollback on error, always close).

## Single-writer reality
SQLite allows many readers and one writer. Therefore:
- Run **one backend container instance** with a small number of uvicorn workers (start with 1). The login lockout and rate limiter are in memory for the same reason.
- Keep write transactions short; no network calls inside a transaction.
- Use `BEGIN IMMEDIATE` for read-then-write sequences that must not interleave. Claim state changes use a conditional `UPDATE ... WHERE id=? AND version=?` (`ClaimsRepository.bump_version`), so two approvers or a double click cannot both succeed.
- If write contention appears in metrics, that is the trigger to open the Postgres ADR.

## Schema conventions
- Table names plural `snake_case`; column names `snake_case`.
- Business tables: `id` (UUIDv7 string from `new_id()`, `String(36)` primary key, ADR-0007), `created_at`/`updated_at` where needed (UTC, timezone-aware: `UTCDateTime` rejects naive datetimes and re-attaches UTC on load; use `IdMixin` and `TimestampMixin`), and `version` where optimistic locking is needed (`claims`). `audit_events.id` is an ordered integer (BIGINT on PostgreSQL) so the sequence is unambiguous. Lookup tables with natural keys (`categories.code`, `approval_levels.level_no`, `app_config.key`) use them.
- Explicit constraint naming convention in `MetaData(naming_convention=...)` so migrations are deterministic.
- Declare `NOT NULL`, `UNIQUE`, `CHECK` and foreign keys with explicit `ON DELETE` behaviour. Index every FK and every column used in filters or sorts (indexes follow ARD 7: approver inbox, review queue, duplicate lookup, daily totals).
- Money as integer paise, never floats. Enums as `UPPER_SNAKE` strings with a `CHECK` constraint.
- Soft delete only when a requirement says so; ExpenseFlow has none (claims are withdrawn or rejected, never deleted).

## Schema (21 tables, ARD section 7)
| Group | Tables |
|---|---|
| People and reference | `departments`, `cities` (tier 1/2), `categories` (fixed codes, seeded by the migration), `users` (role CHECK, `manager_id` self FK), `bank_accounts` (mock) |
| Policy configuration | `policy_versions` (DRAFT/ACTIVE/RETIRED), `policy_rules`, `approval_levels`, `app_config` |
| Claims | `claims`, `claim_lines`, `line_findings`, `approval_steps`, `claim_comments`, `delegations`, `sample_audits`, `claim_transitions`, `receipts` |
| Payout | `payout_batches`, `payout_items` |
| Audit | `audit_events` (append-only, hash chain) |

## Rules the database enforces itself (migration `0f946151ac98`)
| Rule | Mechanism |
|---|---|
| Only the ARD state transitions (23 pairs) | `claim_transitions` table + trigger on `claims.status` |
| Claims are created as DRAFT | insert trigger |
| A claim can be in at most one batch | unique `payout_items.claim_id` |
| Creator is not the verifier | CHECK `verified_by_id <> created_by_id` |
| A level has at most one open step per round | unique partial index on `approval_steps` where `status = 'PENDING'` |
| Exactly one ACTIVE policy version | unique partial index |
| Rules of a published version are immutable | triggers on `policy_rules` |
| Audit trail cannot change | triggers raise on UPDATE and DELETE of `audit_events`; `row_hash = SHA-256(prev_hash || canonical row JSON)` written by the audit service; `AuditService.verify_chain()` re-checks it |
| Amounts and statuses are valid | CHECK constraints on every status/outcome/role column and `amount_paise > 0` |
All of these are exercised on SQLite. PostgreSQL variants are written for the audit-immutability and claim-transition/insert triggers but are untested; the frozen-policy-rules trigger has no PostgreSQL variant yet (AI-019). On PostgreSQL the application role should also be limited to INSERT/SELECT on `audit_events` (ops task).

## Migrations (Alembic)
- `render_as_batch=True` in `env.py` (SQLite cannot alter most things in place); `env.py` imports every non-`_` module's `models`.
- One migration per PR that changes the schema; message states intent (`add_orders_table`).
- Autogenerate, then **review and edit by hand**: replace app types with plain SQLAlchemy types (migrations must not import app code), add triggers and seed rows, check creation order.
- Never edit a migration that has reached `main`. Fix forward with a new one. (`0f946151ac98` replaced an unmerged draft and is the ExpenseFlow baseline.)
- Migrations must be backwards compatible with the previous app version (expand, then contract across releases) so rollbacks stay safe.
- Conflict rule: if two PRs create migrations with the same parent, the later PR rebases and re-parents its migration (`alembic heads` must show exactly one head; CI enforces it).
- Migrations run at container start via an entrypoint step (`alembic upgrade head`) before uvicorn.

## Files, volumes, backups
- DB path comes from `DATABASE_URL` (default `sqlite:///./data/app.db`); receipts live in `RECEIPTS_DIR` (default `./data/receipts`, random keys, never user paths). The `data/` directory is a Docker volume and is gitignored.
- Back up with `sqlite3 app.db ".backup 'backup.db'"` (never copy a live WAL DB with `cp`) and copy the receipts directory at the same time. Schedule it, test restores.
- Reference data (policy version 1, approval levels, settings) comes from `backend/app/seeds/reference_data.json` through `PolicyService.ensure_reference_data()`; demo data is loaded by an explicit seed command (AI-013), never on import.

## Testing
Unit/integration tests use a temporary file DB with the same PRAGMAs and the real migrations (`alembic upgrade head`), never `create_all()`, so migrations and triggers are tested too. Fixtures live in `backend/conftest.py`: one migrated and seeded DB per test session, each test inside a rolled-back transaction (`db_session`, `client`). `tests/test_migrations.py` checks a single head and an upgrade/downgrade round trip; `tests/test_expenseflow.py` proves the transition and audit triggers.

## Postgres-readiness rules
No SQLite-only SQL in repositories; use SQLAlchemy constructs. No reliance on SQLite's loose typing. Keep types explicit. Partial indexes declare both `sqlite_where` and `postgresql_where`; trigger bodies are dialect-specific (see above).
