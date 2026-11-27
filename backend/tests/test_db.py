"""Mandatory SQLite PRAGMAs, UTC datetimes, ids and session lifecycle (docs/03)."""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import Request
from sqlalchemy import Engine, text

from app.core.db import UTCDateTime, create_db_engine, get_db, new_id, utcnow


@pytest.mark.parametrize(
    ("pragma", "expected"),
    [("journal_mode", "wal"), ("foreign_keys", 1), ("busy_timeout", 5000), ("synchronous", 1)],
)
def test_pragma_applied_when_connecting(engine: Engine, pragma: str, expected: object) -> None:
    with engine.connect() as connection:
        assert connection.exec_driver_sql(f"PRAGMA {pragma}").scalar_one() == expected


def test_create_db_engine_creates_parent_directory_when_missing(tmp_path: Any) -> None:
    db_file = tmp_path / "nested" / "dir" / "app.db"
    engine = create_db_engine(f"sqlite:///{db_file.as_posix()}")
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    finally:
        engine.dispose()
    assert db_file.exists()


def test_new_id_is_time_ordered_uuid7_always() -> None:
    first, second = new_id(), new_id()
    assert len(first) == 36
    assert first[14] == "7"
    assert first < second


def test_utc_datetime_normalises_to_utc_when_binding(engine: Engine) -> None:
    column = UTCDateTime()
    plus_two = datetime(2026, 1, 1, 12, tzinfo=timezone(timedelta(hours=2)))
    bound = column.process_bind_param(plus_two, engine.dialect)
    assert bound == datetime(2026, 1, 1, 10, tzinfo=UTC)
    assert column.process_bind_param(None, engine.dialect) is None


def test_utc_datetime_rejects_naive_when_binding(engine: Engine) -> None:
    with pytest.raises(ValueError, match="naive"):
        UTCDateTime().process_bind_param(datetime(2026, 1, 1), engine.dialect)


def test_utc_datetime_returns_aware_when_loading(engine: Engine) -> None:
    column = UTCDateTime()
    loaded = column.process_result_value(datetime(2026, 1, 1, 10), engine.dialect)
    assert loaded is not None
    assert loaded.tzinfo is UTC
    aware = datetime(2026, 1, 1, 12, tzinfo=timezone(timedelta(hours=2)))
    assert column.process_result_value(aware, engine.dialect) == aware
    assert column.process_result_value(None, engine.dialect) is None


class _RecordingSession:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def commit(self) -> None:
        self.calls.append("commit")

    def rollback(self) -> None:
        self.calls.append("rollback")

    def close(self) -> None:
        self.calls.append("close")


def _fake_request(session: _RecordingSession) -> Request:
    state = SimpleNamespace(session_factory=lambda: session)
    return cast(Request, SimpleNamespace(app=SimpleNamespace(state=state)))


def test_get_db_commits_and_closes_when_request_succeeds() -> None:
    session = _RecordingSession()
    generator: Generator[Any] = get_db(_fake_request(session))
    next(generator)
    with pytest.raises(StopIteration):
        next(generator)
    assert session.calls == ["commit", "close"]


def test_get_db_rolls_back_and_closes_when_request_fails() -> None:
    session = _RecordingSession()
    generator = get_db(_fake_request(session))
    next(generator)
    with pytest.raises(RuntimeError):
        generator.throw(RuntimeError("handler failed"))
    assert session.calls == ["rollback", "close"]


def test_utcnow_is_timezone_aware_utc_always() -> None:
    assert utcnow().tzinfo is UTC
