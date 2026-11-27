"""SQLAlchemy models. Never returned from routers; map to schemas."""

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

EXAMPLE_STATUSES = ("active", "archived")


class Example(IdMixin, TimestampMixin, Base):
    __tablename__ = "examples"
    __table_args__ = (
        # Enums as strings + CHECK constraint (docs/03).
        CheckConstraint(f"status IN {EXAMPLE_STATUSES}", name="status_valid"),
    )

    name: Mapped[str] = mapped_column(String(200), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    # Optimistic locking (docs/02): bumped on every update, checked against If-Match/version.
    version: Mapped[int] = mapped_column(default=1)
