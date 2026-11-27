"""The standard error envelope is produced for every kind of failure (docs/02)."""

from collections.abc import Iterator
from typing import Annotated

import pytest
from fastapi import FastAPI, HTTPException, Query
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import ConflictError, ErrorDetail, NotFoundError, error_responses
from app.main import create_app


@pytest.fixture(scope="module")
def error_client(settings: Settings) -> Iterator[TestClient]:
    app: FastAPI = create_app(settings)

    def raise_not_found() -> None:
        raise NotFoundError("Order 42 was not found.", code="order_not_found")

    def raise_conflict() -> None:
        raise ConflictError("Busy.", details=[ErrorDetail(field="version", issue="stale")])

    def raise_unexpected() -> None:
        raise RuntimeError("secret internals: SELECT * FROM users")

    def raise_http() -> None:
        raise HTTPException(status_code=429, detail="Slow down.", headers={"Retry-After": "5"})

    def raise_http_500() -> None:
        raise HTTPException(status_code=502, detail="upstream said: secret")

    def needs_int(quantity: Annotated[int, Query(gt=0)]) -> dict[str, int]:
        return {"quantity": quantity}

    app.add_api_route("/t/not-found", raise_not_found)
    app.add_api_route("/t/conflict", raise_conflict)
    app.add_api_route("/t/boom", raise_unexpected)
    app.add_api_route("/t/http", raise_http)
    app.add_api_route("/t/http-500", raise_http_500)
    app.add_api_route("/t/validate", needs_int)
    yield TestClient(app, raise_server_exceptions=False)
    app.state.engine.dispose()


def test_domain_error_maps_to_envelope_when_not_found_raised(error_client: TestClient) -> None:
    response = error_client.get("/t/not-found")
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "order_not_found",
            "message": "Order 42 was not found.",
            "details": [],
            "request_id": response.headers["X-Request-ID"],
        }
    }


def test_domain_error_includes_details_when_given(error_client: TestClient) -> None:
    body = error_client.get("/t/conflict").json()["error"]
    assert body["code"] == "conflict"
    assert body["details"] == [{"field": "version", "issue": "stale"}]


def test_validation_error_maps_to_422_with_field_details_when_query_invalid(
    error_client: TestClient,
) -> None:
    response = error_client.get("/t/validate", params={"quantity": 0})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_failed"
    assert error["details"][0]["field"] == "query.quantity"


def test_unknown_route_maps_to_404_envelope_always(error_client: TestClient) -> None:
    response = error_client.get("/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_wrong_method_maps_to_405_envelope_always(error_client: TestClient) -> None:
    response = error_client.post("/api/v1/health/live")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"


def test_http_exception_keeps_headers_when_raised(error_client: TestClient) -> None:
    response = error_client.get("/t/http")
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "5"
    assert response.json()["error"] == {
        "code": "rate_limited",
        "message": "Slow down.",
        "details": [],
        "request_id": response.headers["X-Request-ID"],
    }


def test_http_5xx_hides_detail_when_raised(error_client: TestClient) -> None:
    response = error_client.get("/t/http-500")
    assert response.status_code == 502
    assert response.json()["error"]["message"] == "Bad Gateway"


def test_unexpected_error_returns_generic_500_without_leaking_when_raised(
    error_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    response = error_client.get("/t/boom")
    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert "SELECT" not in response.text
    assert error["request_id"] == response.headers["X-Request-ID"]
    assert any(r.message == "unhandled_error" and r.exc_info for r in caplog.records)


def test_error_responses_documents_envelope_for_each_status() -> None:
    responses = error_responses(404, 503)
    assert set(responses) == {404, 503}
    assert responses[404]["description"] == "Not Found"
