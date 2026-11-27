"""Org lookups: which reference data is readable before sign-in (self-registration needs it)."""

from fastapi.testclient import TestClient

from conftest import People


def test_departments_are_listed_when_signed_out(client: TestClient, people: People) -> None:
    r = client.get("/api/v1/departments")
    assert r.status_code == 200
    names = {d["name"] for d in r.json()}
    assert {"Engineering", "Sales"} <= names
    assert set(r.json()[0]) == {"id", "code", "name"}


def test_cities_are_listed_when_signed_out(client: TestClient, people: People) -> None:
    r = client.get("/api/v1/cities")
    assert r.status_code == 200
    by_name = {c["name"]: c["tier"] for c in r.json()}
    assert by_name["Testpur"] == 1
    assert by_name["Smalltown"] == 2


def test_other_org_endpoints_still_require_sign_in_when_signed_out(
    client: TestClient, people: People
) -> None:
    for path in ("/api/v1/me", "/api/v1/categories", "/api/v1/users", "/api/v1/admin/users"):
        assert client.get(path).status_code == 401, path
