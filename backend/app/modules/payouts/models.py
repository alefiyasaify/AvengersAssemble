"""Payout (ARD section 10, ERD 3): maker-checker batches; one payout item per claim ever."""

from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TimestampMixin

BATCH_STATUSES = ("DRAFT", "VERIFIED", "EXPORTED", "PAID", "CANCELLED")


class PayoutBatch(IdMixin, TimestampMixin, Base):
    __tablename__ = "payout_batches"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'VERIFIED', 'EXPORTED', 'PAID', 'CANCELLED')",
            name="status_valid",
        ),
        CheckConstraint(
            "verified_by_id IS NULL OR verified_by_id <> created_by_id", name="maker_checker"
        ),
    )

    number: Mapped[str] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(String(10), default="DRAFT", index=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    verified_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    total_paise: Mapped[int] = mapped_column(default=0)
    claim_count: Mapped[int] = mapped_column(default=0)
    file_name: Mapped[str | None] = mapped_column(String(80))
    file_content: Mapped[str | None] = mapped_column(Text)
    file_sha256: Mapped[str | None] = mapped_column(String(64))
    verified_at: Mapped[datetime | None]
    exported_at: Mapped[datetime | None]
    paid_at: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]

    items: Mapped[list["PayoutItem"]] = relationship(
        cascade="all, delete-orphan", order_by="PayoutItem.seq"
    )


class PayoutItem(IdMixin, Base):
    __tablename__ = "payout_items"
    __table_args__ = (CheckConstraint("amount_paise > 0", name="amount_positive"),)

    batch_id: Mapped[str] = mapped_column(
        ForeignKey("payout_batches.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int]
    # Unique: a claim can never be in two batches (double payment impossible in the DB).
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="RESTRICT"), unique=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    amount_paise: Mapped[int]
    bank_ref: Mapped[str] = mapped_column(String(40))
