"""Request-id middleware and structured request logging (docs/05 'Logging and observability')."""

import re

import pytest
from fastapi.testclient import TestClient


def test_request_id_generated_when_header_absent(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["X-Request-ID"])


def test_request_id_echoed_when_header_valid(client: TestClient) -> None:
    response = client.get("/api/v1/health/live", headers={"X-Request-ID": "abc-123.DEF_4"})
    assert response.headers["X-Request-ID"] == "abc-123.DEF_4"


@pytest.mark.parametrize("bad_id", ["x" * 65, "has space", "injecté"])
def test_request_id_replaced_when_header_invalid(client: TestClient, bad_id: str) -> None:
    response = client.get("/api/v1/health/live", headers={b"X-Request-ID": bad_id.encode()})
    assert response.headers["X-Request-ID"] != bad_id
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["X-Request-ID"])


def test_request_is_logged_with_status_and_latency_always(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="app.request")
    client.get("/api/v1/health/live")
    record = next(r for r in caplog.records if r.name == "app.request")
    assert record.__dict__["status"] == 200
    assert record.__dict__["path"] == "/api/v1/health/live"
    assert record.__dict__["duration_ms"] >= 0


def test_cors_allows_configured_origin_only(client: TestClient) -> None:
    allowed = client.options(
        "/api/v1/health/live",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    denied = client.options(
        "/api/v1/health/live",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in denied.headers
