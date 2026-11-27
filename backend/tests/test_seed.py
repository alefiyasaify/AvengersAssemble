"""The demo seed runs through the real services and its planted cases are all detected."""

from pathlib import Path
from typing import Any

import pytest
from alembic import command
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import create_db_engine
from app.modules.audit.service import AuditService
from app.seeds import generate
from conftest import alembic_config


@pytest.fixture
def seeded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    url = f"sqlite:///{(tmp_path / 'seed.db').as_posix()}"
    command.upgrade(alembic_config(url), "head")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("RECEIPTS_DIR", (tmp_path / "receipts").as_posix())
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-pytest-only-0123456789")
    get_settings.cache_clear()
    engine = create_db_engine(url)
    try:
        with Session(engine) as session:
            manifest = generate.seed(session, "pw-for-tests", total=80)
            assert AuditService(session).verify_chain()[0]
            with pytest.raises(RuntimeError):
                generate.seed(session, "again", total=1)
            session.rollback()
    finally:
        engine.dispose()
        get_settings.cache_clear()
    return manifest


def test_seed_detects_every_planted_case_when_run(seeded: dict[str, Any]) -> None:
    assert seeded["claims"] == 80
    assert seeded["planted"] > 0
    assert seeded["planted_detected"] == seeded["planted"]
    assert seeded["claim_statuses"].get("PAID", 0) > 0
    assert set(seeded["logins"]) == {"EMPLOYEE", "MANAGER", "AUDITOR", "FINANCE_HEAD"}
