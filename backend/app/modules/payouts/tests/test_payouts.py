"""Payout batches, maker-checker and the mock bank CSV (ARD 10, C7)."""

import csv
import hashlib
import io
from datetime import date

import pytest

from app.modules.payouts.service import CsvLine, narration, render_csv, rupees, safe_cell
from conftest import Api, People


# ------------------------------------------------------------------ CSV rules (pure)
@pytest.mark.parametrize(
    ("paise", "text"), [(0, "0.00"), (5, "0.05"), (465000, "4650.00"), (128050, "1280.50")]
)
def test_rupees_formats_from_integer_paise_always(paise: int, text: str) -> None:
    assert rupees(paise) == text


@pytest.mark.parametrize(
    ("value", "expected"),
    [("=SUM(A1)", "'=SUM(A1)"), ("+1", "'+1"), ("-2", "'-2"), ("@x", "'@x"), ("Asha", "Asha")],
)
def test_safe_cell_prefixes_formula_starts_when_present(value: str, expected: str) -> None:
    assert safe_cell(value) == expected


def test_narration_keeps_30_safe_chars_when_long() -> None:
    assert (
        narration("EF-2026-004312; DROP TABLE x -- and more text")
        == "EF-2026-004312 DROP TABLE x --"
    )
    assert len(narration("x" * 50)) == 30


def test_render_csv_matches_ard_format_when_two_payments() -> None:
    lines = [
        CsvLine(
            "PB-2026-0007-0001",
            "Asha Verma",
            "001234567890",
            "MOCK0000123",
            465000,
            "EF-2026-004312",
            "E00417",
        ),
        CsvLine(
            "PB-2026-0007-0002",
            "Ravi Nair",
            "009876543210",
            "MOCK0000456",
            20_000_001,
            "EF-2026-004318",
            "E00092",
        ),
    ]
    text = render_csv("PB-2026-0007", date(2026, 11, 30), lines, imps_max_paise=20_000_000)
    assert "\r" not in text
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][0] == "record_type"
    assert len(rows) == 5
    assert rows[1][:3] == ["H", "PB-2026-0007", "ExpenseFlow Services Pvt Ltd"]
    assert rows[2][5:8] == ["4650.00", "INR", "IMPS"]
    assert rows[3][7] == "NEFT"  # above 2,00,000 INR
    assert rows[4] == [
        "T",
        "PB-2026-0007",
        "",
        "",
        "",
        "204650.01",
        "INR",
        "",
        "",
        "COUNT=2",
        "",
        "",
    ]
    assert (
        render_csv("PB-2026-0007", date(2026, 11, 30), lines, 20_000_000) == text
    )  # deterministic


# ------------------------------------------------------------------ batch flow (API)
def test_batch_flow_pays_claims_when_verified_and_exported(api: Api, people: People) -> None:
    """E2E-09: create, verify by another user, export, mark paid; trailer equals the total."""
    one = api.claim(people.employee, 40_000)
    two = api.approve(people.manager, api.claim(people.peer, 800_000))
    r = api.post(people.head, "/payouts/batches", {"claim_ids": [one["id"], two["id"]]})
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["status"] == "DRAFT"
    assert batch["claim_count"] == 2
    assert batch["total_paise"] == 840_000
    assert all(len(i["account_last4"]) == 4 for i in batch["items"])

    assert api.post(people.head, f"/payouts/batches/{batch['id']}/export").status_code == 409
    assert api.post(people.head, f"/payouts/batches/{batch['id']}/verify").status_code == 403
    verified = api.post(people.auditor, f"/payouts/batches/{batch['id']}/verify").json()
    assert verified["status"] == "VERIFIED"
    assert verified["verified_by_id"] == people.auditor

    exported = api.post(people.head, f"/payouts/batches/{batch['id']}/export").json()
    assert exported["status"] == "EXPORTED"
    assert exported["file_name"] == f"EXPFLOW_{batch['batch_no']}_20261127.csv"
    r = api.get(people.auditor, f"/payouts/batches/{batch['id']}/file")
    assert r.status_code == 200
    assert hashlib.sha256(r.content).hexdigest() == exported["file_sha256"]
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[-1][5] == "8400.00"
    assert rows[-1][9] == "COUNT=2"
    assert api.get(people.auditor, f"/payouts/batches/{batch['id']}/file").content == r.content

    paid = api.post(people.head, f"/payouts/batches/{batch['id']}/mark-paid").json()
    assert paid["status"] == "PAID"
    for claim_id in (one["id"], two["id"]):
        detail = api.get(people.head, f"/claims/{claim_id}").json()
        assert detail["status"] == "PAID"
        assert detail["paid_at"] is not None
    assert api.post(people.head, f"/payouts/batches/{batch['id']}/cancel").status_code == 409


def test_claim_cannot_be_in_two_batches_when_already_batched(api: Api, people: People) -> None:
    """A claim appears in at most one payout item: double payment is impossible."""
    claim = api.claim(people.employee, 40_000)
    assert (
        api.post(people.head, "/payouts/batches", {"claim_ids": [claim["id"]]}).status_code == 201
    )
    r = api.post(people.head, "/payouts/batches", {"claim_ids": [claim["id"]]})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CLAIM_NOT_PAYABLE"


def test_cancel_returns_claims_to_eligible_when_draft(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 40_000)
    batch = api.post(people.head, "/payouts/batches", {"claim_ids": [claim["id"]]}).json()
    cancelled = api.post(people.head, f"/payouts/batches/{batch['id']}/cancel").json()
    assert cancelled["status"] == "CANCELLED"
    assert claim["id"] in {e["claim_id"] for e in api.get(people.head, "/payouts/eligible").json()}
    again = api.post(people.head, "/payouts/batches", {"claim_ids": [claim["id"]]})
    assert again.status_code == 201


def test_payouts_are_role_restricted_when_called(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 40_000)
    assert api.get(people.auditor, "/payouts/eligible").status_code == 403
    assert (
        api.post(people.auditor, "/payouts/batches", {"claim_ids": [claim["id"]]}).status_code
        == 403
    )
    assert api.get(people.employee, "/payouts/batches").status_code == 403
    batch = api.post(people.head, "/payouts/batches", {"claim_ids": [claim["id"]]}).json()
    listed = api.get(people.auditor, "/payouts/batches").json()
    assert [b["id"] for b in listed["items"]] == [batch["id"]]
    assert api.get(people.auditor, f"/payouts/batches/{batch['id']}").status_code == 200
    assert api.get(people.auditor, f"/payouts/batches/{batch['id']}/file").status_code == 409
    assert api.get(people.head, "/payouts/batches/missing").status_code == 404
