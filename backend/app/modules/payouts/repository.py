"""Database access for payout batches and items."""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.payouts.models import PayoutBatch, PayoutItem


class PayoutsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, batch: PayoutBatch) -> PayoutBatch:
        self._session.add(batch)
        self._session.flush()
        return batch

    def flush(self) -> None:
        self._session.flush()

    def get(self, batch_id: str) -> PayoutBatch | None:
        return self._session.execute(
            select(PayoutBatch)
            .where(PayoutBatch.id == batch_id)
            .options(selectinload(PayoutBatch.items))
        ).scalar_one_or_none()

    def next_number(self, year: int) -> str:
        prefix = f"PB-{year}-"
        count = self._session.execute(
            select(func.count())
            .select_from(PayoutBatch)
            .where(PayoutBatch.number.like(f"{prefix}%"))
        ).scalar_one()
        return f"{prefix}{count + 1:04d}"

    def page(self, *, limit: int, offset: int) -> tuple[list[PayoutBatch], int]:
        total = self._session.execute(select(func.count()).select_from(PayoutBatch)).scalar_one()
        rows = self._session.execute(
            select(PayoutBatch)
            .order_by(PayoutBatch.created_at.desc(), PayoutBatch.id)
            .limit(limit)
            .offset(offset)
        ).scalars()
        return list(rows), total

    def remove_items(self, batch: PayoutBatch) -> None:
        """Free the claims of a cancelled batch (payout_items.claim_id is unique)."""
        self._session.execute(delete(PayoutItem).where(PayoutItem.batch_id == batch.id))
        self._session.expire(batch, ["items"])

    def status_counts(self) -> dict[str, int]:
        rows = self._session.execute(
            select(PayoutBatch.status, func.count()).group_by(PayoutBatch.status)
        ).all()
        return {r[0]: int(r[1]) for r in rows}
