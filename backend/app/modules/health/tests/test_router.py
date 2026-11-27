"""Integration tests: health endpoints over HTTP against the migrated SQLite DB."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import __version__
from app.modules.health.deps import get_health_service
from app.modules.health.service import HealthService
from app.modules.health.tests.test_service import BrokenRepository


def test_get_live_returns_ok_always(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_ready_returns_ok_when_database_reachable(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}


def test_get_ready_returns_503_envelope_when_database_unreachable(
    app: FastAPI, client: TestClient
) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(BrokenRepository())
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "DATABASE_UNAVAILABLE"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_get_version_returns_version_and_commit_always(client: TestClient) -> None:
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    assert response.json() == {"version": __version__, "commit": "test-sha"}


def test_get_ready_uses_real_database_when_not_overridden(app: FastAPI) -> None:
    """No session override: exercises the real get_db dependency (commit + close)."""
    with TestClient(app) as raw_client:
        response = raw_client.get("/api/v1/health/ready")
    assert response.status_code == 200


def test_ard_probe_paths_answer_at_root_always(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200
