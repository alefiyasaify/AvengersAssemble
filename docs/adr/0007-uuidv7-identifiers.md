# ADR-0007: UUIDv7 strings as primary keys and public ids

- Status: Accepted
- Date: 2026-11-27
- Deciders: project lead

## Context
docs/02 and docs/03 require opaque string ids (UUIDv7 or ULID) and forbid exposing autoincrement
integers. One format must be picked before the first table exists.

## Decision
Every table's `id` is a **UUIDv7** (RFC 9562) rendered as the canonical 36-character lowercase
string, stored as `String(36)`, generated in Python by `app.core.db.new_id()` (library
`uuid-utils`, since Python 3.12's `uuid` module has no v7).

## Options considered
1. UUIDv7 (chosen) - IETF standard, time-ordered (good index locality), native `uuid` type in
   Postgres for the Stage 2 migration, recognisable in logs and tools.
2. ULID - also time-ordered and shorter (26 chars), but not an IETF standard and needs a custom
   type when moving to Postgres.

## Consequences
Positive: sortable by creation time, Postgres-ready, no enumeration of ids. Negative: one extra
dependency (`uuid-utils`) until Python 3.14's stdlib `uuid.uuid7()` can replace it; ids are
longer than ULIDs.
