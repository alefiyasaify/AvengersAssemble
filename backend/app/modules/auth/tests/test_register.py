"""Self-registration: inactive EMPLOYEE only, head activation, no enumeration (ARD 11)."""

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import People

PASSWORD = "a-long-enough-password"


def _body(people: People, email: str = "new.joiner@example.test", **extra: Any) -> dict[str, Any]:
    return {
        "email": email,
        "full_name": "New Joiner",
        "password": PASSWORD,
        "department_id": people.department_id,
        "manager_id": people.manager,
        **extra,
    }


def _login(client: TestClient, email: str) -> int:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return r.status_code


def _find(client: TestClient, head_headers: dict[str, str], email: str) -> dict[str, Any]:
    users = client.get("/api/v1/admin/users", headers=head_headers, params={"q": email}).json()
    matches = [u for u in users["items"] if u["email"] == email]
    assert len(matches) == 1
    return dict(matches[0])


def test_register_creates_inactive_employee_until_head_activates(
    client: TestClient, people: People, as_user: Any
) -> None:
    r = client.post("/api/v1/auth/register", json=_body(people))
    assert r.status_code == 202
    assert r.json()["status"] == "PENDING_APPROVAL"
    head = as_user(people.head)
    user = _find(client, head, "new.joiner@example.test")
    assert user["role"] == "EMPLOYEE"
    assert user["is_active"] is False
    assert _login(client, "new.joiner@example.test") == 401  # inactive: same as a wrong password
    pending = client.get("/api/v1/admin/users", headers=head, params={"pending": "true"}).json()
    assert [u["id"] for u in pending["items"]] == [user["id"]]

    r = client.patch(f"/api/v1/admin/users/{user['id']}", headers=head, json={"is_active": True})
    assert r.status_code == 200
    assert _login(client, "new.joiner@example.test") == 200


def test_register_gives_same_answer_when_email_taken(
    client: TestClient, people: People, as_user: Any
) -> None:
    first = client.post("/api/v1/auth/register", json=_body(people))
    again = client.post(
        "/api/v1/auth/register", json=_body(people, email="NEW.JOINER@example.test")
    )
    assert again.status_code == first.status_code == 202
    assert again.json() == first.json()
    _find(client, as_user(people.head), "new.joiner@example.test")  # still exactly one


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"role": "FINANCE_HEAD"}, "VALIDATION_FAILED"),  # no role field: no escalation
        ({"password": "short"}, "VALIDATION_FAILED"),
        ({"email": "not-an-email"}, "VALIDATION_FAILED"),
        ({"department_id": "missing"}, "DEPARTMENT_NOT_FOUND"),
        ({"manager_id": "missing"}, "USER_NOT_FOUND"),
    ],
)
def test_register_rejects_invalid_input_when_given(
    client: TestClient, people: People, change: dict[str, Any], code: str
) -> None:
    r = client.post("/api/v1/auth/register", json={**_body(people), **change})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == code


def test_register_rejects_non_approver_manager_when_chosen(
    client: TestClient, people: People
) -> None:
    r = client.post("/api/v1/auth/register", json=_body(people, manager_id=people.peer))
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_MANAGER"


def test_register_is_refused_when_disabled(
    app: FastAPI, client: TestClient, people: People
) -> None:
    app.state.settings.self_registration_enabled = False
    try:
        r = client.post("/api/v1/auth/register", json=_body(people))
    finally:
        app.state.settings.self_registration_enabled = True
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "REGISTRATION_DISABLED"
