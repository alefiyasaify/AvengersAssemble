"""Claim core (ARD section 7, ERD 2): claims, lines, findings, approval steps, comments,
delegations, sample audits and the claim_transitions table the DB trigger checks."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TimestampMixin, utcnow

CLAIM_STATUSES = (
    "DRAFT",
    "PENDING_MANAGER",
    "PENDING_AUDITOR",
    "PENDING_HEAD",
    "SENT_BACK",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    "PAID",
)
LINE_STATUSES = (
    "DRAFT",
    "AUTO_APPROVED",
    "NEEDS_APPROVAL",
    "AUTO_REJECTED",
    "APPROVED",
    "REJECTED",
)
STEP_STATUSES = ("PENDING", "APPROVED", "REJECTED", "SENT_BACK", "SKIPPED", "SUPERSEDED")
SAMPLE_STATUSES = ("PENDING", "PASSED", "FAILED")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Claim(IdMixin, TimestampMixin, Base):
    __tablename__ = "claims"
    __table_args__ = (
        CheckConstraint(_in("status", CLAIM_STATUSES), name="status_valid"),
        CheckConstraint("total_paise >= 0 AND payable_paise >= 0", name="amounts_non_negative"),
        Index("ix_claims_owner_status", "owner_id", "status"),
        Index("ix_claims_queue", "status", "current_level", "submitted_at"),
    )

    number: Mapped[str] = mapped_column(String(24), unique=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    total_paise: Mapped[int] = mapped_column(default=0)
    payable_paise: Mapped[int] = mapped_column(default=0)
    policy_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("policy_versions.id", ondelete="RESTRICT")
    )
    required_levels: Mapped[list[int]] = mapped_column(JSON, default=list)
    current_level: Mapped[int | None]
    round: Mapped[int] = mapped_column(default=0)
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(default=1)
    submitted_at: Mapped[datetime | None] = mapped_column(index=True)
    decided_at: Mapped[datetime | None]
    paid_at: Mapped[datetime | None]
    payout_batch_id: Mapped[str | None] = mapped_column(
        ForeignKey("payout_batches.id", ondelete="SET NULL"), index=True
    )

    lines: Mapped[list["ClaimLine"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan", order_by="ClaimLine.position"
    )
    steps: Mapped[list["ApprovalStep"]] = relationship(
        back_populates="claim",
        cascade="all, delete-orphan",
        order_by="(ApprovalStep.round, ApprovalStep.level_no, ApprovalStep.created_at)",
    )


class ClaimLine(IdMixin, Base):
    __tablename__ = "claim_lines"
    __table_args__ = (
        CheckConstraint(_in("status", LINE_STATUSES), name="status_valid"),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint("nights >= 1", name="nights_positive"),
        Index("ix_claim_lines_dup", "vendor_norm", "amount_paise", "expense_date"),
        Index("ix_claim_lines_daily", "owner_id", "category_code", "expense_date"),
    )

    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    position: Mapped[int]
    category_code: Mapped[str] = mapped_column(ForeignKey("categories.code", ondelete="RESTRICT"))
    description: Mapped[str] = mapped_column(String(500))
    vendor: Mapped[str] = mapped_column(String(120))
    vendor_norm: Mapped[str] = mapped_column(String(120))
    amount_paise: Mapped[int]
    expense_date: Mapped[date] = mapped_column(Date)
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    nights: Mapped[int] = mapped_column(default=1)
    receipt_id: Mapped[str | None] = mapped_column(
        ForeignKey("receipts.id", ondelete="RESTRICT"), index=True
    )
    receipt_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16), default="DRAFT")

    claim: Mapped[Claim] = relationship(back_populates="lines")
    findings: Mapped[list["LineFinding"]] = relationship(
        cascade="all, delete-orphan", order_by="LineFinding.rule_code"
    )


class LineFinding(IdMixin, Base):
    __tablename__ = "line_findings"
    __table_args__ = (
        CheckConstraint("outcome IN ('REJECT', 'ROUTE', 'FLAG')", name="outcome_valid"),
    )

    line_id: Mapped[str] = mapped_column(
        ForeignKey("claim_lines.id", ondelete="CASCADE"), index=True
    )
    rule_code: Mapped[str] = mapped_column(String(64), index=True)
    outcome: Mapped[str] = mapped_column(String(8))
    severity: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str] = mapped_column(String(500))
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    force_level: Mapped[int | None]


class ApprovalStep(IdMixin, Base):
    __tablename__ = "approval_steps"
    __table_args__ = (
        CheckConstraint(_in("status", STEP_STATUSES), name="status_valid"),
        # A level cannot have two open steps (ARD 7 constraint 3).
        Index(
            "uq_approval_steps_one_pending",
            "claim_id",
            "round",
            "level_no",
            unique=True,
            sqlite_where=text("status = 'PENDING'"),
            postgresql_where=text("status = 'PENDING'"),
        ),
        Index("ix_approval_steps_inbox", "assigned_to_id", "status", "created_at"),
    )

    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), index=True)
    round: Mapped[int]
    level_no: Mapped[int] = mapped_column(ForeignKey("approval_levels.level_no"))
    role: Mapped[str] = mapped_column(String(16))
    assigned_to_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    acted_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    on_behalf_of_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(12), default="PENDING", index=True)
    comment: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    acted_at: Mapped[datetime | None]

    claim: Mapped[Claim] = relationship(back_populates="steps")


class ClaimComment(IdMixin, Base):
    __tablename__ = "claim_comments"

    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), index=True)
    line_id: Mapped[str | None] = mapped_column(ForeignKey("claim_lines.id", ondelete="SET NULL"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Delegation(IdMixin, Base):
    """Leave cover for one approval level, time-boxed (ARD 6.4)."""

    __tablename__ = "delegations"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="range_valid"),
        CheckConstraint("delegator_id <> delegate_id", name="not_self"),
    )

    delegator_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    delegate_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    level_no: Mapped[int] = mapped_column(ForeignKey("approval_levels.level_no"))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class SampleAudit(IdMixin, Base):
    __tablename__ = "sample_audits"
    __table_args__ = (CheckConstraint(_in("status", SAMPLE_STATUSES), name="status_valid"),)

    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), unique=True)
    selected_at: Mapped[datetime] = mapped_column(default=utcnow)
    draw_value: Mapped[float]
    rate: Mapped[float]
    status: Mapped[str] = mapped_column(String(8), default="PENDING", index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    outcome_note: Mapped[str | None] = mapped_column(String(2000))
    resolved_at: Mapped[datetime | None]


class ClaimTransition(Base):
    """Allowed claim status transitions (ARD section 4). A trigger rejects any other update."""

    __tablename__ = "claim_transitions"

    from_status: Mapped[str] = mapped_column(String(20), primary_key=True)
    to_status: Mapped[str] = mapped_column(String(20), primary_key=True)
