# 03 Database (SQLite)

## Ownership
Only the backend touches the database, and only through repositories. No other service, script or test reads or writes the DB file directly (tests use the API or fixtures that go through the backend layer).

## Stack
SQLAlchemy 2.x (typed `Mapped[]` style, synchronous sessions) + Alembic. Sync sessions are the right fit for SQLite; FastAPI runs `def` endpoints in a threadpool.

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
- Run **one backend container instance** with a small number of uvicorn workers (start with 1).
- Keep write transactions short; no network calls inside a transaction.
- Use `BEGIN IMMEDIATE` for read-then-write sequences that must not interleave.
- If write contention appears in metrics, that is the trigger to open the Postgres ADR.

## Schema conventions
- Table names plural `snake_case`; column names `snake_case`.
- Every table: `id` (UUIDv7 string from `new_id()`, `String(36)` primary key, ADR-0007), `created_at`, `updated_at` (UTC, timezone-aware: `UTCDateTime` rejects naive datetimes and re-attaches UTC on load), and `version` int where optimistic locking is needed. Use the `IdMixin` and `TimestampMixin` from `core/db.py`.
- Explicit constraint naming convention in `MetaData(naming_convention=...)` so migrations are deterministic.
- Declare `NOT NULL`, `UNIQUE`, `CHECK` and foreign keys with explicit `ON DELETE` behaviour. Index every FK and every column used in filters or sorts.
- Money as integer minor units, never floats. Enums as strings with a `CHECK` constraint.
- Soft delete only when a requirement says so (`deleted_at`), and then enforce it in the repository.

## Migrations (Alembic)
- `render_as_batch=True` in `env.py` (SQLite cannot alter most things in place).
- One migration per PR that changes the schema; message states intent (`add_orders_table`).
- Autogenerate, then **review and edit by hand**. Never trust autogenerate blindly.
- Never edit a migration that has reached `main`. Fix forward with a new one.
- Migrations must be backwards compatible with the previous app version (expand, then contract across releases) so rollbacks stay safe.
- Conflict rule: if two PRs create migrations with the same parent, the later PR rebases and re-parents its migration (`alembic heads` must show exactly one head; CI enforces it).
- Migrations run at container start via an entrypoint step (`alembic upgrade head`) before uvicorn.

## Files, volumes, backups
- DB path comes from `DATABASE_URL` (default `sqlite:///./data/app.db`). The `data/` directory is a Docker volume and is gitignored.
- Back up with `sqlite3 app.db ".backup 'backup.db'"` (never copy a live WAL DB with `cp`). Schedule it, test restores.
- Seed/demo data lives in `backend/app/seeds/` and is loaded by an explicit command, never on import.

## Testing
Unit/integration tests use a temporary file DB with the same PRAGMAs and the real migrations (`alembic upgrade head`), never `create_all()`, so migrations are tested too. Fixtures live in `backend/conftest.py`: one migrated DB per test session, each test inside a rolled-back transaction (`db_session`, `client`). `tests/test_migrations.py` checks a single head and an upgrade/downgrade round trip.

## Postgres-readiness rules
No SQLite-only SQL in repositories; use SQLAlchemy constructs. No reliance on SQLite's loose typing. Keep types explicit.
