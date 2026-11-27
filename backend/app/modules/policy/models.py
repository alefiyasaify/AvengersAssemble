"""Policy as configuration (ARD sections 5 and 7): immutable versions, rule rows, approval
levels and scalar settings. Rules of a non-DRAFT version are immutable (DB trigger)."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, CheckConstraint, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, utcnow


class PolicyVersion(IdMixin, Base):
    __tablename__ = "policy_versions"
    __table_args__ = (
        CheckConstraint("status IN ('DRAFT', 'ACTIVE', 'RETIRED')", name="status_valid"),
        Index(
            "uq_policy_versions_single_active",
            "status",
            unique=True,
            sqlite_where=text("status = 'ACTIVE'"),
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    version_no: Mapped[int] = mapped_column(unique=True)
    status: Mapped[str] = mapped_column(String(10), default="DRAFT")
    notes: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    published_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    published_at: Mapped[datetime | None]

    rules: Mapped[list["PolicyRule"]] = relationship(
        cascade="all, delete-orphan", order_by="PolicyRule.position"
    )


class PolicyRule(IdMixin, Base):
    __tablename__ = "policy_rules"
    __table_args__ = (
        UniqueConstraint("policy_version_id", "code"),
        CheckConstraint("outcome IN ('REJECT', 'ROUTE', 'FLAG')", name="outcome_valid"),
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="severity_valid"),
    )

    policy_version_id: Mapped[str] = mapped_column(
        ForeignKey("policy_versions.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int]
    code: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(32))
    category_code: Mapped[str | None] = mapped_column(
        ForeignKey("categories.code", ondelete="RESTRICT")
    )
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    outcome: Mapped[str] = mapped_column(String(8))
    severity: Mapped[str] = mapped_column(String(8))
    force_level: Mapped[int | None]
    message_template: Mapped[str] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ApprovalLevel(Base):
    __tablename__ = "approval_levels"
    __table_args__ = (
        CheckConstraint("role IN ('MANAGER', 'AUDITOR', 'FINANCE_HEAD')", name="role_valid"),
        CheckConstraint("min_amount_paise_exclusive >= 0", name="min_non_negative"),
    )

    level_no: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    role: Mapped[str] = mapped_column(String(16))
    min_amount_paise_exclusive: Mapped[int]
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AppConfig(Base):
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
