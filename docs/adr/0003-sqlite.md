# ADR-0003: SQLite as the database

- Status: Accepted

## Context
Requirement: SQLite. Simple ops, zero-dependency local development.

## Decision
SQLite via SQLAlchemy 2.0 + Alembic, WAL mode, FKs on, single backend instance, DB on a Docker volume, repository layer isolating all SQL.

## Consequences
Positive: simple, fast for read-heavy workloads, easy tests. Negative: single writer, no horizontal scaling, limited ALTER support (batch migrations). Trigger to revisit: sustained write contention or need for multiple backend instances -> ADR for Postgres.
