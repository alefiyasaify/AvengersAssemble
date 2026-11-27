"""JSON log format carries request id and extra fields; never free-form text."""

import json
import logging
import sys

import pytest

from app.core.logging import JsonFormatter, configure_logging, request_id_var


def _record(msg: str, **extra: object) -> logging.LogRecord:
    record = logging.LogRecord("app.test", logging.INFO, __file__, 1, msg, None, None)
    record.__dict__.update(extra)
    return record


def test_json_formatter_includes_request_id_and_extras_when_set() -> None:
    token = request_id_var.set("req-1")
    try:
        line = JsonFormatter().format(_record("hello", status=200))
    finally:
        request_id_var.reset(token)
    payload = json.loads(line)
    assert payload["message"] == "hello"
    assert payload["request_id"] == "req-1"
    assert payload["status"] == 200
    assert payload["ts"].endswith("Z")


def test_json_formatter_includes_exception_when_exc_info() -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord(
            "app.test", logging.ERROR, __file__, 1, "failed", None, sys.exc_info()
        )
    payload = json.loads(JsonFormatter().format(record))
    assert "ValueError: boom" in payload["exc_info"]
    assert "request_id" not in payload


def test_configure_logging_installs_single_json_handler_when_called(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = logging.getLogger()
    monkeypatch.setattr(root, "handlers", list(root.handlers))
    monkeypatch.setattr(root, "level", root.level)
    configure_logging("DEBUG")
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)
    assert root.level == logging.DEBUG
