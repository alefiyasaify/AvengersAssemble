"""Unit tests: health service with fake repositories (no database)."""

import pytest
from sqlalchemy.exc import OperationalError

from app.core.errors import ServiceUnavailableError
from app.modules.health.service import HealthService, VersionService


class HealthyRepository:
    def ping(self) -> None:
        return None


class BrokenRepository:
    def ping(self) -> None:
        raise OperationalError("SELECT 1", {}, Exception("database is locked"))


def test_check_ready_reports_ok_when_database_reachable() -> None:
    result = HealthService(HealthyRepository()).check_ready()
    assert result.status == "ok"
    assert result.checks == {"database": "ok"}


def test_check_ready_raises_unavailable_when_database_unreachable() -> None:
    with pytest.raises(ServiceUnavailableError) as exc_info:
        HealthService(BrokenRepository()).check_ready()
    assert exc_info.value.code == "database_unavailable"
    assert exc_info.value.status_code == 503


def test_get_version_returns_configured_values_always() -> None:
    result = VersionService(version="1.2.3", commit="abc123").get_version()
    assert (result.version, result.commit) == ("1.2.3", "abc123")
