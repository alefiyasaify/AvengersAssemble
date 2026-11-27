"""People and reference data (ARD section 7, ERD 1): departments, employees, cities, categories,
mock bank accounts."""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

ROLES = ("EMPLOYEE", "MANAGER", "AUDITOR", "FINANCE_HEAD")
CATEGORY_CODES = ("MEALS", "HOTEL", "LOCAL_CAB", "TRAVEL", "OTHER")


class Department(IdMixin, TimestampMixin, Base):
    __tablename__ = "departments"

    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class City(IdMixin, Base):
    __tablename__ = "cities"
    __table_args__ = (CheckConstraint("tier IN (1, 2)", name="tier_valid"),)

    name: Mapped[str] = mapped_column(String(80), unique=True)
    tier: Mapped[int]


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(
            "code IN ('MEALS', 'HOTEL', 'LOCAL_CAB', 'TRAVEL', 'OTHER')", name="code_valid"
        ),
    )

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))


class User(IdMixin, TimestampMixin, Base):
    """ARD `employee`."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('EMPLOYEE', 'MANAGER', 'AUDITOR', 'FINANCE_HEAD')", name="role_valid"
        ),
        CheckConstraint("manager_id IS NULL OR manager_id <> id", name="not_own_manager"),
    )

    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    employee_code: Mapped[str] = mapped_column(String(16), unique=True)
    role: Mapped[str] = mapped_column(String(16), default="EMPLOYEE", index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), index=True
    )
    manager_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    home_city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id", ondelete="SET NULL"))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BankAccount(Base):
    """Mock beneficiary data; account numbers are fake and shown masked in the UI."""

    __tablename__ = "bank_accounts"

    employee_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    account_no: Mapped[str] = mapped_column(String(34))
    ifsc: Mapped[str] = mapped_column(String(11))
    holder_name: Mapped[str] = mapped_column(String(120))
