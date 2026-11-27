"""Shared pytest fixtures for `tests/` and `app/modules/*/tests/`.

Lives at the backend root (not in tests/) so module-local test packages see it too.
DB strategy (docs/03, docs/05): one temp-file SQLite DB per test session, built with the real
migrations (`alembic upgrade head`, never create_all); every test runs inside a transaction
that is rolled back.
"""

import random
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import get_db
from app.core.security import create_token, hash_password
from app.main import create_app
from app.modules.audit.service import AuditService
from app.modules.org.service import org_service
from app.modules.policy.service import policy_service

BACKEND_DIR = Path(__file__).resolve().parent
TEST_SECRET = "test-secret-key-for-pytest-only-0123456789"


def alembic_config(database_url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.attributes["configure_logger"] = False
    return cfg


def make_settings(database_url: str, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "test",
        "database_url": database_url,
        "secret_key": TEST_SECRET,
        "cors_origins": ["http://localhost:3000"],
        "log_level": "WARNING",
        "git_sha": "test-sha",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture(scope="session")
def database_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    url = f"sqlite:///{(tmp_path_factory.mktemp('db') / 'test.db').as_posix()}"
    command.upgrade(alembic_config(url), "head")
    return url


@pytest.fixture(scope="session")
def settings(database_url: str, tmp_path_factory: pytest.TempPathFactory) -> Settings:
    receipts = tmp_path_factory.mktemp("receipts").as_posix()
    return make_settings(database_url, receipts_dir=receipts)


class FixedRandom(random.Random):
    """random() returns a fixed value: 0.99 = never sampled for audit, 0.0 = always sampled."""

    def __init__(self, value: float) -> None:
        super().__init__(0)
        self.value = value

    def random(self) -> float:
        return self.value


@pytest.fixture(scope="session")
def app(settings: Settings) -> Iterator[FastAPI]:
    application = create_app(settings)
    application.state.rng = FixedRandom(0.99)
    with Session(application.state.engine) as session:  # policy v1 committed once per run
        policy_service(session, AuditService(session)).ensure_reference_data()
        session.commit()
    yield application
    application.state.engine.dispose()


@pytest.fixture
def sample_everything(app: FastAPI) -> Iterator[None]:
    """Make every auto-approved claim fall into the 10% sample audit."""
    app.state.rng = FixedRandom(0.0)
    try:
        yield
    finally:
        app.state.rng = FixedRandom(0.99)


@pytest.fixture(scope="session")
def engine(app: FastAPI) -> Engine:
    db_engine: Engine = app.state.engine
    return db_engine


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    """Session bound to an outer transaction that is always rolled back."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(app: FastAPI, db_session: Session) -> Iterator[TestClient]:
    def _override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------- personas
@dataclass(frozen=True)
class People:
    department_id: str
    other_department_id: str
    tier1_city: str
    tier2_city: str
    head: str  # finance head (admin), top of the org
    auditor: str  # finance auditor, reports to head
    auditor2: str
    manager: str  # line manager, reports to head
    manager2: str  # another line manager (delegation target), reports to head
    employee: str  # reports to manager
    peer: str  # reports to manager
    outsider: str  # reports to manager2, other department


TEST_PASSWORD = "correct horse battery staple"


@pytest.fixture(scope="session")
def password_hash() -> str:
    return hash_password(TEST_PASSWORD)


@pytest.fixture
def people(db_session: Session, password_hash: str) -> People:
    org = org_service(db_session)
    dept = org.create_department("ENG", "Engineering")
    other = org.create_department("SAL", "Sales")
    tier1 = org.create_city("Testpur", 1)
    tier2 = org.create_city("Smalltown", 2)
    counter = iter(range(1, 100))

    def user(name: str, role: str, manager: str | None, department: str = dept) -> str:
        n = next(counter)
        user_id = org.create_user(
            email=f"{name}@example.test",
            full_name=name.capitalize() + " Person",
            employee_code=f"T{n:04d}",
            role=role,
            department_id=department,
            manager_id=manager,
            password_hash=password_hash,
            is_active=True,
        )
        org.set_bank_account(user_id, f"00011122{n:04d}", "MOCK0001234", name.capitalize())
        return user_id

    head = user("head", "FINANCE_HEAD", None)
    auditor = user("auditor", "AUDITOR", head)
    auditor2 = user("auditor2", "AUDITOR", head)
    manager = user("manager", "MANAGER", head)
    manager2 = user("manager2", "MANAGER", head)
    employee = user("employee", "EMPLOYEE", manager)
    peer = user("peer", "EMPLOYEE", manager)
    outsider = user("outsider", "EMPLOYEE", manager2, other)
    return People(
        dept,
        other,
        tier1,
        tier2,
        head,
        auditor,
        auditor2,
        manager,
        manager2,
        employee,
        peer,
        outsider,
    )


@pytest.fixture
def as_user(settings: Settings, db_session: Session) -> "AsUser":
    return AsUser(settings, db_session)


class AsUser:
    """Bearer headers for a user (Bearer requests are exempt from CSRF, like API clients)."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self._secret = settings.secret_key.get_secret_value()
        self._session = session

    def __call__(self, user_id: str) -> dict[str, str]:
        role = org_service(self._session).person(user_id).role
        token = create_token(
            user_id, "access", secret=self._secret, ttl=timedelta(minutes=5), extra={"role": role}
        )
        return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------- API helper
FIXED_NOW = datetime(2026, 11, 27, 6, 0, tzinfo=UTC)  # a Friday, 11:30 in Asia/Kolkata
WEEKDAY = "2026-11-25"  # a Wednesday: never trips WEEKEND_SPEND
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@pytest.fixture
def fixed_clock(app: FastAPI) -> Iterator[datetime]:
    """Pin the service clock so date rules (future dates, IST day) are deterministic."""
    app.state.clock = lambda: FIXED_NOW
    try:
        yield FIXED_NOW
    finally:
        del app.state.clock


class Api:
    """Small façade over the HTTP API for readable integration tests."""

    def __init__(self, client: TestClient, as_user: "AsUser") -> None:
        self.client = client
        self.as_user = as_user
        self._receipt_n = 0

    def get(self, user: str, path: str, **kw: Any) -> Any:
        return self.client.get(f"/api/v1{path}", headers=self.as_user(user), **kw)

    def post(self, user: str, path: str, body: Any = None, **kw: Any) -> Any:
        return self.client.post(f"/api/v1{path}", headers=self.as_user(user), json=body, **kw)

    def receipt(self, user: str, content: bytes | None = None) -> str:
        self._receipt_n += 1
        data = content or PNG_MAGIC + f"receipt-{self._receipt_n}-{user}".encode()
        r = self.client.post(
            "/api/v1/receipts",
            headers=self.as_user(user),
            files={"file": ("r.png", data, "image/png")},
        )
        assert r.status_code == 201, r.text
        return str(r.json()["id"])

    def line(self, user: str, amount_paise: int, **overrides: Any) -> dict[str, Any]:
        self._receipt_n += 1
        line: dict[str, Any] = {
            "category": "OTHER",
            "description": "Test expense",
            "vendor": f"Vendor {self._receipt_n}",
            "amount_paise": amount_paise,
            "expense_date": WEEKDAY,
        }
        if amount_paise > 50_000 and "receipt_id" not in overrides:
            line["receipt_id"] = self.receipt(user)
        line.update(overrides)
        return line

    def draft(self, user: str, *lines: dict[str, Any], title: str = "Trip") -> dict[str, Any]:
        r = self.post(user, "/claims", {"title": title, "lines": list(lines)})
        assert r.status_code == 201, r.text
        return dict(r.json())

    def submit(self, user: str, claim: dict[str, Any]) -> dict[str, Any]:
        r = self.post(user, f"/claims/{claim['id']}/submit", {"expected_version": claim["version"]})
        assert r.status_code == 200, r.text
        return dict(r.json())

    def claim(self, user: str, *amounts: int, **line_overrides: Any) -> dict[str, Any]:
        """Create and submit a claim with one OTHER line per amount (receipts attached)."""
        return self.submit(
            user, self.draft(user, *(self.line(user, a, **line_overrides) for a in amounts))
        )

    def act(self, user: str, claim: dict[str, Any], decision: str = "approve", **body: Any) -> Any:
        step = claim["current_step"]["id"]
        return self.post(
            user,
            f"/approvals/{step}/{decision}",
            {"expected_version": claim["version"], **body},
        )

    def approve(self, user: str, claim: dict[str, Any]) -> dict[str, Any]:
        r = self.act(user, claim)
        assert r.status_code == 200, r.text
        return dict(r.json())


@pytest.fixture
def api(client: TestClient, as_user: AsUser, fixed_clock: datetime) -> Api:
    return Api(client, as_user)
