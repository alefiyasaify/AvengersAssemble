"""Public interface of the org module: people, roles, reporting hierarchy, reference data,
mock bank accounts and user administration (ARD sections 2 and 7)."""

from collections.abc import Collection
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.auth import Principal, require_head
from app.core.errors import ConflictError, NotFoundError, ValidationFailed
from app.core.pagination import Page, PageParams
from app.core.security import hash_password
from app.modules.audit.service import AuditService
from app.modules.org.models import BankAccount, City, Department, User
from app.modules.org.repository import OrgRepository
from app.modules.org.schemas import (
    CategoryRead,
    CityRead,
    DepartmentRead,
    MeRead,
    UserCreate,
    UserRead,
    UserSummary,
    UserUpdate,
)

APPROVER_ROLES = ("MANAGER", "AUDITOR", "FINANCE_HEAD")
ROLE_RANK = {"EMPLOYEE": 0, "MANAGER": 1, "AUDITOR": 2, "FINANCE_HEAD": 3}


@dataclass(frozen=True)
class Person:
    """What other modules may know about a user."""

    id: str
    full_name: str
    employee_code: str
    role: str
    department_id: str
    manager_id: str | None
    is_active: bool


@dataclass(frozen=True)
class BankDetails:
    account_no: str
    ifsc: str
    holder_name: str


def _person(user: User) -> Person:
    return Person(
        id=user.id,
        full_name=user.full_name,
        employee_code=user.employee_code,
        role=user.role,
        department_id=user.department_id,
        manager_id=user.manager_id,
        is_active=user.is_active,
    )


def permissions_for(role: str, has_reports: bool) -> list[str]:
    """Capabilities the UI uses to show actions (ARD section 2). The API enforces each one."""
    perms = ["claims:own", "dashboard:own"]
    if role in APPROVER_ROLES or has_reports:
        perms += ["approvals:act", "delegations:manage", "dashboard:team"]
    if role in ("AUDITOR", "FINANCE_HEAD"):
        perms += [
            "claims:read_all",
            "review:act",
            "sample_audits:resolve",
            "audit:read",
            "dashboard:company",
            "payouts:read",
        ]
    if role == "AUDITOR":
        perms.append("payouts:verify")
    if role == "FINANCE_HEAD":
        perms += ["payouts:manage", "admin:manage"]
    return sorted(set(perms))


class OrgService:
    def __init__(self, repository: OrgRepository, audit: AuditService | None = None) -> None:
        self._repo = repository
        self._audit = audit

    # ------------------------------------------------------------------ people
    def person(self, user_id: str) -> Person:
        user = self._repo.get_user(user_id)
        if user is None:
            raise NotFoundError("User was not found.", code="USER_NOT_FOUND")
        return _person(user)

    def people(self, ids: Collection[str]) -> dict[str, Person]:
        return {uid: _person(u) for uid, u in self._repo.users_by_ids(ids).items()}

    def with_role(self, role: str) -> list[Person]:
        return [_person(u) for u in self._repo.users_with_role(role)]

    def subordinate_ids(self, manager_id: str) -> set[str]:
        """Direct and indirect reports (hierarchy is acyclic, ARD C3)."""
        found: set[str] = set()
        frontier = [manager_id]
        while frontier:
            nxt = [i for i in self._repo.direct_report_ids(frontier) if i not in found]
            found.update(nxt)
            frontier = nxt
        return found

    def ancestors(self, user_id: str) -> list[Person]:
        """Managers above the user, nearest first."""
        chain: list[Person] = []
        seen = {user_id}
        current = self._repo.get_user(user_id)
        while current is not None and current.manager_id and current.manager_id not in seen:
            seen.add(current.manager_id)
            current = self._repo.get_user(current.manager_id)
            if current is not None:
                chain.append(_person(current))
        return chain

    def bank_details(self, ids: Collection[str]) -> dict[str, BankDetails]:
        return {
            k: BankDetails(b.account_no, b.ifsc, b.holder_name)
            for k, b in self._repo.bank_accounts(ids).items()
        }

    def me(self, user_id: str) -> MeRead:
        user = self._repo.get_user(user_id)
        if user is None or not user.is_active:
            raise NotFoundError("User was not found.", code="USER_NOT_FOUND")
        has_reports = self._repo.has_reports(user.id)
        base = UserRead.model_validate(user)
        return MeRead(
            **base.model_dump(),
            has_reports=has_reports,
            permissions=permissions_for(user.role, has_reports),
        )

    def search(self, query: str, page: PageParams) -> Page[UserSummary]:
        rows, total = self._repo.search_users(query, limit=page.limit, offset=page.offset)
        return Page[UserSummary].of([UserSummary.model_validate(u) for u in rows], total, page)

    def credentials(self, email: str) -> tuple[str, str, str, bool] | None:
        """(user id, role, password hash, is_active) for a sign-in attempt, or None."""
        user = self._repo.get_user_by_email(email)
        if user is None:
            return None
        return user.id, user.role, user.password_hash, user.is_active

    # ------------------------------------------------------------------ reference data
    def departments(self) -> list[DepartmentRead]:
        return [DepartmentRead.model_validate(d) for d in self._repo.departments()]

    def department_names(self) -> dict[str, str]:
        return {d.id: d.name for d in self._repo.departments()}

    def cities(self) -> list[CityRead]:
        return [CityRead.model_validate(c) for c in self._repo.cities()]

    def city_tier(self, city_id: str | None) -> int | None:
        if city_id is None:
            return None
        city = self._repo.get_city(city_id)
        if city is None:
            raise ValidationFailed("Unknown city.", code="CITY_NOT_FOUND")
        return city.tier

    def categories(self) -> list[CategoryRead]:
        return [CategoryRead.model_validate(c) for c in self._repo.categories()]

    # ------------------------------------------------------------------ administration
    def admin_list(self, principal: Principal, query: str, page: PageParams) -> Page[UserRead]:
        require_head(principal)
        rows, total = self._repo.search_users(
            query, limit=page.limit, offset=page.offset, active_only=False
        )
        return Page[UserRead].of([UserRead.model_validate(u) for u in rows], total, page)

    def admin_create(self, principal: Principal, data: UserCreate) -> UserRead:
        require_head(principal)
        if self._repo.get_user_by_email(data.email):
            raise ConflictError("A user with this email already exists.", code="EMAIL_TAKEN")
        self._check_refs(data.department_id, data.manager_id, data.home_city_id)
        user = self._repo.add_user(
            User(
                email=data.email.strip().lower(),
                full_name=data.full_name.strip(),
                employee_code=data.employee_code.strip(),
                role=data.role,
                department_id=data.department_id,
                manager_id=data.manager_id,
                home_city_id=data.home_city_id,
                password_hash=hash_password(data.password),
                is_active=True,
            )
        )
        self._record(principal, "user.created", user, None)
        return UserRead.model_validate(user)

    def admin_update(self, principal: Principal, user_id: str, data: UserUpdate) -> UserRead:
        require_head(principal)
        user = self._repo.get_user(user_id)
        if user is None:
            raise NotFoundError("User was not found.", code="USER_NOT_FOUND")
        before = UserRead.model_validate(user).model_dump(mode="json")
        changes = data.model_dump(exclude_unset=True)
        if "manager_id" in changes and changes["manager_id"] is not None:
            self._check_acyclic(user.id, changes["manager_id"])
        self._check_refs(
            changes.get("department_id", user.department_id),
            changes.get("manager_id", user.manager_id),
            changes.get("home_city_id", user.home_city_id),
        )
        for field, value in changes.items():
            setattr(user, field, value)
        self._repo.flush()
        self._record(principal, "user.updated", user, before)
        return UserRead.model_validate(user)

    def _check_refs(self, department_id: str, manager_id: str | None, city_id: str | None) -> None:
        if self._repo.get_department(department_id) is None:
            raise ValidationFailed("Unknown department.", code="DEPARTMENT_NOT_FOUND")
        if manager_id is not None and self._repo.get_user(manager_id) is None:
            raise ValidationFailed("Unknown manager.", code="USER_NOT_FOUND")
        if city_id is not None and self._repo.get_city(city_id) is None:
            raise ValidationFailed("Unknown city.", code="CITY_NOT_FOUND")

    def _check_acyclic(self, user_id: str, new_manager_id: str) -> None:
        if new_manager_id == user_id or user_id in {p.id for p in self.ancestors(new_manager_id)}:
            raise ValidationFailed(
                "That manager change would create a cycle in the hierarchy.",
                code="HIERARCHY_CYCLE",
            )

    def _record(
        self, principal: Principal, action: str, user: User, before: dict[str, object] | None
    ) -> None:
        if self._audit is not None:
            after = UserRead.model_validate(user).model_dump(mode="json")
            self._audit.record(
                actor_id=principal.id,
                action=action,
                entity_type="user",
                entity_id=user.id,
                before=before,
                after=after,
            )

    # ------------------------------------------------------------------ seeding helpers
    def create_department(self, code: str, name: str) -> str:
        return self._repo.add_department(Department(code=code, name=name)).id

    def create_city(self, name: str, tier: int) -> str:
        return self._repo.add_city(City(name=name, tier=tier)).id

    def create_user(self, **fields: str | bool | None) -> str:
        return self._repo.add_user(User(**fields)).id

    def set_bank_account(self, employee_id: str, account_no: str, ifsc: str, holder: str) -> None:
        self._repo.upsert_bank_account(
            BankAccount(employee_id=employee_id, account_no=account_no, ifsc=ifsc, holder_name=holder)
        )


def rank(role: str) -> int:
    return ROLE_RANK.get(role, 0)


def org_service(session: Session, audit: AuditService | None = None) -> OrgService:
    """Factory for other modules (they may not import this module's repository)."""
    return OrgService(OrgRepository(session), audit)
