"""Append-only, hash-chained audit trail (ARD sections 7 and 11).

`id` is an ordered integer; `row_hash = SHA-256(prev_hash || canonical JSON of the row)`.
UPDATE and DELETE are blocked by database triggers (migration).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utcnow

# BIGINT on PostgreSQL; INTEGER PRIMARY KEY on SQLite (the only autoincrementing form there).
_BIGINT_PK = BigInteger().with_variant(Integer(), "sqlite")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_events_claim", "claim_id", "id"),)

    id: Mapped[int] = mapped_column(_BIGINT_PK, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    # No foreign keys on purpose: the trail must outlive any row it mentions. None = SYSTEM.
    actor_id: Mapped[str | None] = mapped_column(String(36), index=True)
    on_behalf_of_id: Mapped[str | None] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str] = mapped_column(String(36))
    claim_id: Mapped[str | None] = mapped_column(String(36))
    before_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    request_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(45))
    prev_hash: Mapped[str] = mapped_column(String(64))
    row_hash: Mapped[str] = mapped_column(String(64), unique=True)
