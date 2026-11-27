from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditEvent


@dataclass(frozen=True)
class AuditFilter:
    claim_id: str | None = None
    actor_id: str | None = None
    action: str | None = None
    since: datetime | None = None
    until: datetime | None = None


class AuditRepository:
    """Insert and read only. Updates/deletes do not exist here and are blocked in the DB."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def last_hash(self) -> str | None:
        return self._session.execute(
            select(AuditEvent.row_hash).order_by(AuditEvent.id.desc()).limit(1)
        ).scalar_one_or_none()

    def add(self, event: AuditEvent) -> AuditEvent:
        self._session.add(event)
        self._session.flush()  # assigns the id and makes this row the next prev_hash
        return event

    def for_claim(self, claim_id: str) -> list[AuditEvent]:
        return list(
            self._session.execute(
                select(AuditEvent).where(AuditEvent.claim_id == claim_id).order_by(AuditEvent.id)
            ).scalars()
        )

    def page(self, f: AuditFilter, *, limit: int, offset: int) -> tuple[list[AuditEvent], int]:
        stmt = select(AuditEvent)
        if f.claim_id:
            stmt = stmt.where(AuditEvent.claim_id == f.claim_id)
        if f.actor_id:
            stmt = stmt.where(AuditEvent.actor_id == f.actor_id)
        if f.action:
            stmt = stmt.where(AuditEvent.action == f.action)
        if f.since:
            stmt = stmt.where(AuditEvent.ts >= f.since)
        if f.until:
            stmt = stmt.where(AuditEvent.ts <= f.until)
        total = self._session.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()
        rows = self._session.execute(
            stmt.order_by(AuditEvent.id.desc()).limit(limit).offset(offset)
        ).scalars()
        return list(rows), total

    def all_in_order(self, batch: int = 1000) -> Iterator[AuditEvent]:
        last_id = 0
        while True:
            rows = list(
                self._session.execute(
                    select(AuditEvent)
                    .where(AuditEvent.id > last_id)
                    .order_by(AuditEvent.id)
                    .limit(batch)
                ).scalars()
            )
            if not rows:
                return
            yield from rows
            last_id = rows[-1].id
