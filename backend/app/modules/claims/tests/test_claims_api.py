"""Claim capture, policy outcome on submit, visibility and the state machine (ARD 4, 5, 8).

Case ids in docstrings refer to the ARD's 10 end-to-end cases (E2E-01..10) and controls (C1..14).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from conftest import WEEKDAY, Api, People


def test_create_draft_returns_detail_with_edit_actions_when_owner(api: Api, people: People) -> None:
    claim = api.draft(people.employee, api.line(people.employee, 120_000))
    assert claim["status"] == "DRAFT"
    assert claim["claim_no"].startswith("EF-2026-")
    assert claim["lines"][0]["status"] == "DRAFT"
    assert claim["lines"][0]["receipt"]["mime"] == "image/png"
    assert set(claim["allowed_actions"]) == {"edit", "submit", "withdraw"}


def test_submit_auto_approves_clean_claim_when_under_limit(api: Api, people: People) -> None:
    """E2E-01: a clean 1,200 INR claim is auto-approved and becomes payable."""
    claim = api.claim(people.employee, 120_000)
    assert claim["status"] == "APPROVED"
    assert claim["auto_approved"] is True
    assert claim["lines"][0]["status"] == "AUTO_APPROVED"
    assert claim["steps"] == []
    eligible = api.get(people.head, "/payouts/eligible").json()
    assert claim["id"] in {e["claim_id"] for e in eligible}


@pytest.mark.usefixtures("sample_everything")
def test_sampled_claim_is_held_from_payout_and_hidden_from_owner_when_drawn(
    api: Api, people: People
) -> None:
    """C11: a sampled claim is not payable, and the claimant never learns it was sampled."""
    claim = api.claim(people.employee, 120_000)
    assert claim["status"] == "APPROVED"
    assert claim["sample_audit"] is None
    assert claim["sample_audit_pending"] is False
    as_auditor = api.get(people.auditor, f"/claims/{claim['id']}").json()
    assert as_auditor["sample_audit"]["status"] == "PENDING"
    assert claim["id"] not in {
        e["claim_id"] for e in api.get(people.head, "/payouts/eligible").json()
    }
    timeline = api.get(people.employee, f"/claims/{claim['id']}/timeline").json()
    assert not any(e["action"].startswith("sample_audit.") for e in timeline)
    finance_timeline = api.get(people.auditor, f"/claims/{claim['id']}/timeline").json()
    drawn = [e for e in finance_timeline if e["action"] == "sample_audit.drawn"]
    assert drawn
    assert drawn[0]["after"]["rate"] == 0.1


def test_submit_rejects_line_with_reason_when_meals_over_daily_cap(
    api: Api, people: People
) -> None:
    """E2E-02: meals of 1,800 INR in one day are auto-rejected with the reason shown."""
    claim = api.claim(people.employee, 180_000, category="MEALS")
    assert claim["status"] == "REJECTED"
    assert claim["lines"][0]["status"] == "AUTO_REJECTED"
    assert claim["payable_paise"] == 0
    assert any("1,500" in r for r in claim["rejection_reasons"])


def test_submit_excludes_rejected_line_from_payable_when_others_are_clean(
    api: Api, people: People
) -> None:
    """ARD 13 decision 2: one auto-rejected line does not block the rest of the claim.
    ARD 5 rule 4: only an all-clean claim is auto-approved, so this one goes to the manager
    for the payable (non-rejected) amount."""
    draft = api.draft(
        people.employee,
        api.line(people.employee, 300_000, category="LOCAL_CAB"),  # over the 2,000 cab cap
        api.line(people.employee, 100_000),
    )
    claim = api.submit(people.employee, draft)
    statuses = sorted(ln["status"] for ln in claim["lines"])
    assert statuses == ["AUTO_APPROVED", "AUTO_REJECTED"]
    assert claim["total_paise"] == 400_000
    assert claim["payable_paise"] == 100_000
    assert claim["status"] == "PENDING_MANAGER"


def test_meals_at_exact_cap_pass_when_equal_to_limit(api: Api, people: People) -> None:
    """'Up to' means a value exactly at the cap passes."""
    claim = api.claim(people.employee, 150_000, category="MEALS")
    assert claim["lines"][0]["status"] == "AUTO_APPROVED"


def test_receipt_missing_rejects_line_when_above_500(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 50_001, receipt_id=None)
    assert claim["lines"][0]["findings"][0]["rule_code"] == "RECEIPT_REQUIRED"
    assert claim["status"] == "REJECTED"


def test_hotel_cap_uses_city_tier_when_city_given(api: Api, people: People) -> None:
    ok = api.claim(
        people.employee, 1_200_000, category="HOTEL", city_id=people.tier1_city, nights=2
    )
    assert all(f["rule_code"] != "HOTEL_NIGHT_CAP" for f in ok["lines"][0]["findings"])
    over = api.claim(people.peer, 500_000, category="HOTEL", city_id=people.tier2_city)
    assert over["lines"][0]["findings"][0]["rule_code"] == "HOTEL_NIGHT_CAP"


def test_weekend_spend_routes_to_manager_when_dated_saturday(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 40_000, expense_date="2026-11-21")
    assert claim["status"] == "PENDING_MANAGER"
    assert claim["lines"][0]["findings"][0]["rule_code"] == "WEEKEND_SPEND"


def test_preview_returns_findings_without_storing_when_draft(api: Api, people: People) -> None:
    draft = api.draft(people.employee, api.line(people.employee, 180_000, category="MEALS"))
    preview = api.post(people.employee, f"/claims/{draft['id']}/policy-preview").json()
    assert preview["outcome"] == "REJECTED"
    assert preview["lines"][0]["findings"][0]["rule_code"] == "MEALS_DAILY_CAP"
    again = api.get(people.employee, f"/claims/{draft['id']}").json()
    assert again["status"] == "DRAFT"
    assert again["lines"][0]["findings"] == []


def test_line_crud_bumps_version_when_draft(api: Api, people: People) -> None:
    draft = api.draft(people.employee)
    r = api.post(
        people.employee,
        f"/claims/{draft['id']}/lines",
        {**api.line(people.employee, 20_000), "expected_version": draft["version"]},
    )
    assert r.status_code == 201
    claim = r.json()
    line_id = claim["lines"][0]["id"]
    r = api.client.patch(
        f"/api/v1/claims/{claim['id']}/lines/{line_id}",
        headers=api.as_user(people.employee),
        json={"expected_version": claim["version"], "amount_paise": 25_000, "vendor": "  Café  "},
    )
    assert r.status_code == 200
    assert r.json()["lines"][0]["amount_paise"] == 25_000
    claim = r.json()
    r = api.client.patch(
        f"/api/v1/claims/{claim['id']}",
        headers=api.as_user(people.employee),
        json={"expected_version": claim["version"], "title": "Renamed"},
    )
    assert r.json()["title"] == "Renamed"
    claim = r.json()
    r = api.client.delete(
        f"/api/v1/claims/{claim['id']}/lines/{line_id}",
        headers=api.as_user(people.employee),
        params={"expected_version": claim["version"]},
    )
    assert r.status_code == 200
    assert r.json()["lines"] == []


def test_stale_version_returns_409_when_claim_changed(api: Api, people: People) -> None:
    """C12: optimistic lock; a double click cannot apply twice."""
    draft = api.draft(people.employee, api.line(people.employee, 20_000))
    api.submit(people.employee, draft)
    r = api.post(
        people.employee, f"/claims/{draft['id']}/submit", {"expected_version": draft["version"]}
    )
    assert r.status_code == 409


def test_submitted_claim_cannot_be_edited_when_approved(api: Api, people: People) -> None:
    """C2: lines are immutable once submitted; the only edit path is send-back."""
    claim = api.claim(people.employee, 20_000)
    r = api.post(
        people.employee,
        f"/claims/{claim['id']}/lines",
        {**api.line(people.employee, 1_000), "expected_version": claim["version"]},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "ILLEGAL_TRANSITION"


def test_future_expense_date_is_rejected_when_after_today(api: Api, people: People) -> None:
    """C14: validation rejects future-dated expenses."""
    r = api.post(
        people.employee,
        "/claims",
        {"title": "x", "lines": [api.line(people.employee, 1_000, expense_date="2026-12-31")]},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "FUTURE_EXPENSE_DATE"


def test_submit_without_lines_fails_when_empty(api: Api, people: People) -> None:
    draft = api.draft(people.employee)
    r = api.post(people.employee, f"/claims/{draft['id']}/submit", {"expected_version": 1})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "NO_LINES"


def test_other_users_claim_and_receipt_return_404_when_not_visible(
    api: Api, people: People
) -> None:
    """E2E-10 / C13: another employee's claim and receipt URLs both return 404."""
    claim = api.claim(people.employee, 120_000)
    receipt_id = claim["lines"][0]["receipt"]["id"]
    assert api.get(people.peer, f"/claims/{claim['id']}").status_code == 404
    assert api.get(people.outsider, f"/receipts/{receipt_id}/file").status_code == 404
    assert api.get(people.employee, f"/receipts/{receipt_id}/file").status_code == 200
    assert api.get(people.auditor, f"/receipts/{receipt_id}/file").status_code == 200


def test_receipt_of_someone_else_cannot_be_attached_when_not_owner(
    api: Api, people: People
) -> None:
    foreign = api.receipt(people.peer)
    r = api.post(
        people.employee,
        "/claims",
        {"title": "x", "lines": [api.line(people.employee, 60_000, receipt_id=foreign)]},
    )
    assert r.status_code == 404


def test_list_claims_scopes_by_role_when_listing(api: Api, people: People) -> None:
    mine = api.claim(people.employee, 20_000)
    api.draft(people.peer, api.line(people.peer, 1_000))  # a draft stays private
    own = api.get(people.employee, "/claims").json()
    assert [c["id"] for c in own["items"]] == [mine["id"]]
    team = api.get(people.manager, "/claims", params={"scope": "team"}).json()
    assert {c["id"] for c in team["items"]} == {mine["id"]}
    assert api.get(people.employee, "/claims", params={"scope": "all"}).status_code == 403
    assert api.get(people.auditor, "/claims", params={"scope": "all"}).json()["total_estimate"] >= 1
    assert (
        api.get(people.employee, "/claims", params={"status": "APPROVED"}).json()["total_estimate"]
        == 1
    )


def test_withdraw_allowed_before_first_approval_when_pending_manager(
    api: Api, people: People
) -> None:
    claim = api.claim(people.employee, 800_000)
    assert "withdraw" in claim["allowed_actions"]
    r = api.post(
        people.employee, f"/claims/{claim['id']}/withdraw", {"expected_version": claim["version"]}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "WITHDRAWN"
    assert r.json()["steps"][0]["status"] == "SUPERSEDED"


def test_withdraw_refused_after_manager_approval_when_pending_auditor(
    api: Api, people: People
) -> None:
    claim = api.approve(people.manager, api.claim(people.employee, 3_000_000))
    r = api.post(
        people.employee, f"/claims/{claim['id']}/withdraw", {"expected_version": claim["version"]}
    )
    assert r.status_code == 409


def test_comment_thread_visible_to_owner_and_approver_when_posted(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 800_000)
    r = api.post(people.manager, f"/claims/{claim['id']}/comments", {"body": "Which client?"})
    assert r.status_code == 201
    r = api.post(people.employee, f"/claims/{claim['id']}/comments", {"body": "Acme"})
    detail = api.get(people.employee, f"/claims/{claim['id']}").json()
    assert [c["body"] for c in detail["comments"]] == ["Which client?", "Acme"]
    assert (
        api.post(people.peer, f"/claims/{claim['id']}/comments", {"body": "x"}).status_code == 404
    )


def test_db_trigger_rejects_illegal_status_when_updated_directly(
    api: Api, people: People, db_session: Session
) -> None:
    """ARD 7 constraint 4: the database is the backstop for the state machine."""
    claim = api.claim(people.employee, 20_000)  # APPROVED
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.execute(
            text("UPDATE claims SET status = 'DRAFT' WHERE id = :id"), {"id": claim["id"]}
        )


def test_audit_events_cannot_be_deleted_when_written(
    api: Api, people: People, db_session: Session
) -> None:
    """C9: append-only trail."""
    api.claim(people.employee, 20_000)
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.execute(text("DELETE FROM audit_events"))


def test_resubmit_starts_new_round_when_sent_back(api: Api, people: People) -> None:
    """E2E-06: send back, edit, resubmit; the chain restarts at level 1."""
    claim = api.claim(people.employee, 800_000)
    r = api.act(people.manager, claim, "send-back", comment="Add the client name")
    assert r.status_code == 200
    sent = r.json()
    assert sent["status"] == "SENT_BACK"
    assert sent["steps"][0]["status"] == "SENT_BACK"
    assert "resubmit" not in sent["allowed_actions"]  # computed for the manager who acted
    owner_view = api.get(people.employee, f"/claims/{sent['id']}").json()
    assert {"edit", "resubmit", "withdraw"} <= set(owner_view["allowed_actions"])
    r = api.client.patch(
        f"/api/v1/claims/{sent['id']}",
        headers=api.as_user(people.employee),
        json={"expected_version": sent["version"], "title": "Trip for Acme"},
    )
    edited = r.json()
    r = api.post(
        people.employee, f"/claims/{edited['id']}/resubmit", {"expected_version": edited["version"]}
    )
    again = r.json()
    assert again["status"] == "PENDING_MANAGER"
    assert again["round"] == 2
    assert [s["round"] for s in again["steps"]] == [1, 2]
    assert again["current_step"]["level_no"] == 1


def test_split_suspect_forces_auditor_when_related_claims_cross_threshold(
    api: Api, people: People
) -> None:
    """C1: a 30,000 spend split into claims under 25,000 still reaches the auditor."""
    first = api.claim(people.employee, 2_000_000, vendor="Grand Event Co", expense_date=WEEKDAY)
    assert first["required_levels"] == [1]
    second = api.claim(
        people.employee, 1_000_000, vendor="Grand Event Co", expense_date="2026-11-24"
    )
    codes = {f["rule_code"] for f in second["lines"][0]["findings"]}
    assert "SPLIT_SUSPECT" in codes
    assert second["required_levels"] == [1, 2]
