from collections.abc import Collection

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.modules.org.models import BankAccount, Category, City, Department, User


class OrgRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------ users
    def get_user(self, user_id: str) -> User | None:
        return self._session.get(User, user_id)

    def get_user_by_email(self, email: str) -> User | None:
        return self._session.execute(
            select(User).where(func.lower(User.email) == email.strip().lower())
        ).scalar_one_or_none()

    def users_by_ids(self, ids: Collection[str]) -> dict[str, User]:
        if not ids:
            return {}
        rows = self._session.execute(select(User).where(User.id.in_(ids))).scalars()
        return {u.id: u for u in rows}

    def has_reports(self, user_id: str) -> bool:
        return bool(
            self._session.execute(
                select(exists().where(User.manager_id == user_id, User.is_active.is_(True)))
            ).scalar()
        )

    def direct_report_ids(self, manager_ids: Collection[str]) -> list[str]:
        if not manager_ids:
            return []
        return list(
            self._session.execute(select(User.id).where(User.manager_id.in_(manager_ids))).scalars()
        )

    def users_with_role(self, role: str) -> list[User]:
        return list(
            self._session.execute(
                select(User).where(User.role == role, User.is_active.is_(True)).order_by(User.id)
            ).scalars()
        )

    def search_users(
        self,
        query: str,
        *,
        limit: int,
        offset: int,
        active_only: bool = True,
        inactive_only: bool = False,
        match_email: bool = False,
    ) -> tuple[list[User], int]:
        stmt = select(User)
        if active_only:
            stmt = stmt.where(User.is_active.is_(True))
        if inactive_only:
            stmt = stmt.where(User.is_active.is_(False))
        if query:
            like = f"%{query.strip().lower()}%"
            fields = [func.lower(User.full_name), func.lower(User.employee_code)]
            if match_email:  # admin search only: never let the public search probe emails
                fields.append(func.lower(User.email))
            stmt = stmt.where(or_(*(f.like(like) for f in fields)))
        total = self._session.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()
        rows = self._session.execute(
            stmt.order_by(User.full_name, User.id).limit(limit).offset(offset)
        ).scalars()
        return list(rows), total

    def add_user(self, user: User) -> User:
        self._session.add(user)
        self._session.flush()
        return user

    def flush(self) -> None:
        self._session.flush()

    # ------------------------------------------------------------------ reference data
    def departments(self) -> list[Department]:
        return list(self._session.execute(select(Department).order_by(Department.name)).scalars())

    def get_department(self, department_id: str) -> Department | None:
        return self._session.get(Department, department_id)

    def add_department(self, department: Department) -> Department:
        self._session.add(department)
        self._session.flush()
        return department

    def cities(self) -> list[City]:
        return list(self._session.execute(select(City).order_by(City.name)).scalars())

    def get_city(self, city_id: str) -> City | None:
        return self._session.get(City, city_id)

    def add_city(self, city: City) -> City:
        self._session.add(city)
        self._session.flush()
        return city

    def categories(self) -> list[Category]:
        return list(self._session.execute(select(Category).order_by(Category.name)).scalars())

    # ------------------------------------------------------------------ bank accounts
    def bank_accounts(self, ids: Collection[str]) -> dict[str, BankAccount]:
        if not ids:
            return {}
        rows = self._session.execute(
            select(BankAccount).where(BankAccount.employee_id.in_(ids))
        ).scalars()
        return {b.employee_id: b for b in rows}

    def upsert_bank_account(self, account: BankAccount) -> None:
        self._session.merge(account)
        self._session.flush()
