"""Public interface of the health module."""

import logging
from typing import Protocol

from sqlalchemy.exc import SQLAlchemyError

from app.core.errors import ServiceUnavailableError
from app.modules.health.schemas import ReadyRead, VersionRead

logger = logging.getLogger(__name__)


class DatabasePinger(Protocol):
    def ping(self) -> None: ...


class HealthService:
    def __init__(self, repository: DatabasePinger) -> None:
        self._repository = repository

    def check_ready(self) -> ReadyRead:
        """Report readiness. Raises ServiceUnavailableError (503) if the database is unreachable."""
        try:
            self._repository.ping()
        except SQLAlchemyError as exc:
            logger.warning("readiness_db_check_failed", extra={"error": type(exc).__name__})
            raise ServiceUnavailableError(
                "The database is not reachable.", code="DATABASE_UNAVAILABLE"
            ) from exc
        return ReadyRead(checks={"database": "ok"})


class VersionService:
    def __init__(self, *, version: str, commit: str) -> None:
        self._version = version
        self._commit = commit

    def get_version(self) -> VersionRead:
        return VersionRead(version=self._version, commit=self._commit)
