"""Shared pytest fixtures for `tests/` and `app/modules/*/tests/`.

Lives at the backend root (not in tests/) so module-local test packages see it too.
DB strategy (docs/03, docs/05): one temp-file SQLite DB per test session, built with the real
migrations (`alembic upgrade head`, never create_all); every test runs inside a transaction
that is rolled back.
"""

import random
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

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
        policy_service(session, AuditService(session)).ensure_seeded()
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
    head: str  # finance head (admin), top of the org
    auditor: str  # finance auditor, reports to head
    auditor2: str
    manager: str  # line manager, reports to head
    employee: str  # reports to manager
    peer: str  # reports to manager
    outsider: str  # reports to head, other department


TEST_PASSWORD = "correct horse battery staple"


@pytest.fixture(scope="session")
def password_hash() -> str:
    return hash_password(TEST_PASSWORD)


@pytest.fixture
def people(db_session: Session, password_hash: str) -> People:
    org = org_service(db_session)
    dept = org.create_department("ENG", "Engineering")
    other = org.create_department("SAL", "Sales")
    counter = iter(range(1, 100))

    def user(name: str, role: str, manager: str | None, department: str = dept) -> str:
        n = next(counter)
        return org.create_user(
            email=f"{name}@example.test",
            full_name=name.capitalize() + " Person",
            employee_code=f"T{n:04d}",
            role=role,
            department_id=department,
            manager_id=manager,
            password_hash=password_hash,
            bank_account=f"00011122{n:04d}",
            ifsc="HDFC0001234",
            is_active=True,
        )

    head = user("head", "finance_head", None)
    auditor = user("auditor", "finance_auditor", head)
    auditor2 = user("auditor2", "finance_auditor", head)
    manager = user("manager", "employee", head)
    employee = user("employee", "employee", manager)
    peer = user("peer", "employee", manager)
    outsider = user("outsider", "employee", head, other)
    return People(dept, other, head, auditor, auditor2, manager, employee, peer, outsider)


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
