"""Approval chain, delegation, auditor queue, bulk approve and sample audit (ARD 2, 4, 6, 11)."""

from datetime import timedelta
from typing import Any

import pytest

from conftest import FIXED_NOW, PNG_MAGIC, Api, People


def _delegate(api: Api, delegator: str, delegate: str, level: int, days: int = 5) -> Any:
    return api.post(
        delegator,
        "/delegations",
        {
            "delegate_id": delegate,
            "level_no": level,
            "starts_at": (FIXED_NOW - timedelta(hours=1)).isoformat(),
            "ends_at": (FIXED_NOW + timedelta(days=days)).isoformat(),
        },
    )


# ------------------------------------------------------------------ thresholds
def test_manager_alone_approves_when_payable_up_to_25000(api: Api, people: People) -> None:
    """E2E-03 and the boundary: exactly 25,000.00 INR needs the manager only."""
    claim = api.claim(people.employee, 2_500_000)
    assert claim["status"] == "PENDING_MANAGER"
    assert claim["required_levels"] == [1]
    assert claim["current_step"]["assigned_to"] == people.manager
    done = api.approve(people.manager, claim)
    assert done["status"] == "APPROVED"
    assert {ln["status"] for ln in done["lines"]} == {"APPROVED"}


def test_auditor_required_when_payable_above_25000(api: Api, people: People) -> None:
    """E2E-04: 25,000.01 also needs the auditor; the manager alone does not complete it."""
    claim = api.claim(people.employee, 2_500_001)
    assert claim["required_levels"] == [1, 2]
    after_manager = api.approve(people.manager, claim)
    assert after_manager["status"] == "PENDING_AUDITOR"
    assert after_manager["current_step"]["assigned_to"] is None  # auditor pool
    done = api.approve(people.auditor, after_manager)
    assert done["status"] == "APPROVED"


def test_three_levels_in_order_when_payable_above_100000(api: Api, people: People) -> None:
    """E2E-05: 1,20,000 INR goes manager, auditor, head, in that order."""
    claim = api.claim(people.employee, 6_000_000, 6_000_000)
    assert claim["required_levels"] == [1, 2, 3]
    claim = api.approve(people.manager, claim)
    claim = api.approve(people.auditor, claim)
    assert claim["status"] == "PENDING_HEAD"
    assert claim["current_step"]["assigned_to"] == people.head
    claim = api.approve(people.head, claim)
    assert claim["status"] == "APPROVED"
    assert [s["status"] for s in claim["steps"]] == ["APPROVED"] * 3


def test_cannot_skip_a_level_when_acting_on_closed_step(api: Api, people: People) -> None:
    """C5: only the single open step is actionable; anything else is 409."""
    claim = api.claim(people.employee, 3_000_000)
    first_step = claim["current_step"]["id"]
    claim = api.approve(people.manager, claim)
    r = api.post(
        people.auditor, f"/approvals/{first_step}/approve", {"expected_version": claim["version"]}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "STEP_NOT_ACTIONABLE"


def test_wrong_approver_gets_403_when_not_assigned(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 800_000)
    r = api.act(people.manager2, claim)
    assert r.status_code == 404  # manager2 cannot even see the claim
    r = api.act(people.auditor, claim)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "NOT_YOUR_STEP"


def test_reject_and_send_back_require_comment_when_called(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 800_000)
    assert api.act(people.manager, claim, "reject").status_code == 400
    r = api.act(people.manager, claim, "reject", comment="Personal expense")
    assert r.status_code == 200
    assert r.json()["status"] == "REJECTED"
    assert {ln["status"] for ln in r.json()["lines"]} == {"REJECTED"}


# ------------------------------------------------------------------ separation of duties
def test_manager_claim_escalates_to_their_manager_when_submitted(api: Api, people: People) -> None:
    """Rule 2: the manager's own claim goes to the manager's manager (here the head)."""
    claim = api.claim(people.manager, 800_000)
    assert claim["current_step"]["assigned_to"] == people.head
    assert api.act(people.manager, claim).status_code == 403


def test_same_person_cannot_approve_two_levels_when_head_was_manager(
    api: Api, people: People
) -> None:
    """Rule 3: the head approved level 1 of the auditor's claim, so level 3 needs someone else."""
    claim = api.claim(people.auditor, 6_000_000, 6_000_000)
    claim = api.approve(people.head, claim)  # level 1: the auditor's manager is the head
    claim = api.approve(people.auditor2, claim)  # level 2: another auditor
    assert claim["status"] == "PENDING_HEAD"
    assert claim["current_step"]["assigned_to"] is None  # head blocked, no delegate
    timeline = api.get(people.head, f"/claims/{claim['id']}/timeline").json()
    assert any(e["action"] == "approval.needs_reassignment" for e in timeline)
    assert api.act(people.head, claim).status_code == 403


def test_auditor_cannot_approve_own_claim_when_in_pool(api: Api, people: People) -> None:
    claim = api.approve(people.head, api.claim(people.auditor, 3_000_000))
    assert claim["status"] == "PENDING_AUDITOR"
    assert api.act(people.auditor, claim).status_code == 403
    assert api.approve(people.auditor2, claim)["status"] == "APPROVED"


def test_head_reassigns_stuck_step_when_nobody_eligible(api: Api, people: People) -> None:
    claim = api.claim(people.auditor, 6_000_000, 6_000_000)
    claim = api.approve(people.auditor2, api.approve(people.head, claim))
    step = claim["current_step"]["id"]
    r = api.post(people.head, f"/approvals/{step}/reassign", {"assignee_id": people.employee})
    assert r.status_code == 400  # an employee cannot approve the head level
    r = api.post(people.employee, f"/approvals/{step}/reassign", {"assignee_id": people.auditor2})
    assert r.status_code in (403, 404)


# ------------------------------------------------------------------ delegation
def test_delegate_approves_on_behalf_when_manager_on_leave(api: Api, people: People) -> None:
    """E2E-07: the delegate acts; the step and audit trail record both identities."""
    r = _delegate(api, people.manager, people.manager2, level=1)
    assert r.status_code == 201, r.text
    assert r.json()["is_active"] is True
    claim = api.claim(people.employee, 800_000)
    inbox = api.get(people.manager2, "/approvals/inbox").json()
    assert [i["delegated_from_id"] for i in inbox["items"]] == [people.manager]
    done = api.approve(people.manager2, claim)
    step = done["steps"][0]
    assert step["acted_by_id"] == people.manager2
    assert step["on_behalf_of_id"] == people.manager
    timeline = api.get(people.employee, f"/claims/{claim['id']}/timeline").json()
    approved = next(e for e in timeline if e["action"] == "approval.approved")
    assert approved["actor_name"] == "Manager2 Person"
    assert approved["on_behalf_of_name"] == "Manager Person"


@pytest.mark.parametrize(
    ("delegator", "delegate", "level", "days", "code"),
    [
        ("manager", "employee", 1, 5, "DELEGATE_ROLE_TOO_LOW"),
        ("manager", "manager", 1, 5, "INVALID_DELEGATE"),
        ("manager", "manager2", 1, 31, "DELEGATION_TOO_LONG"),
        ("employee", "manager", 1, 5, "NOT_AN_APPROVER"),
        ("manager", "manager2", 2, 5, "NOT_AN_APPROVER"),
    ],
)
def test_delegation_rules_refuse_when_invalid(
    api: Api, people: People, delegator: str, delegate: str, level: int, days: int, code: str
) -> None:
    """C4: same-or-higher role, not oneself, max 30 days, only for a level you approve."""
    r = _delegate(api, getattr(people, delegator), getattr(people, delegate), level, days)
    assert r.json()["error"]["code"] == code


def test_one_active_delegation_per_level_when_overlapping(api: Api, people: People) -> None:
    assert _delegate(api, people.manager, people.manager2, 1).status_code == 201
    r = _delegate(api, people.manager, people.head, 1)
    assert r.status_code == 409
    listed = api.get(people.manager, "/delegations").json()
    assert len(listed) == 1
    revoked = api.client.delete(
        f"/api/v1/delegations/{listed[0]['id']}", headers=api.as_user(people.manager)
    ).json()
    assert revoked["is_active"] is False
    assert _delegate(api, people.manager, people.head, 1).status_code == 201


def test_delegate_cannot_approve_own_claim_when_covering(api: Api, people: People) -> None:
    """The delegate is never the claimant: manager2 covers the head, but not on their own claim."""
    assert _delegate(api, people.manager, people.manager2, 1).status_code == 201
    claim = api.claim(people.manager2, 800_000)  # manager2 reports to the head
    assert api.act(people.manager2, claim).status_code == 403


# ------------------------------------------------------------------ auditor workflows
def test_duplicate_receipt_is_flagged_and_skipped_by_bulk_when_reused(
    api: Api, people: People
) -> None:
    """E2E-08: the same receipt file twice -> duplicate flag (forced to the auditor), and bulk
    approve skips it with a reason."""
    data = PNG_MAGIC + b"the-same-bytes"
    first = api.claim(people.employee, 300_000, receipt_id=api.receipt(people.employee, data))
    assert first["status"] == "APPROVED"
    second = api.claim(people.peer, 300_000, receipt_id=api.receipt(people.peer, data))
    finding = second["lines"][0]["findings"][0]
    assert finding["rule_code"] == "DUPLICATE_LINE"
    assert finding["severity"] == "high"
    assert second["required_levels"] == [1, 2]
    second = api.approve(people.manager, second)
    clean = api.approve(people.manager, api.claim(people.employee, 3_000_000))
    queue = api.get(people.auditor, "/review-queue").json()
    assert {second["id"], clean["id"]} <= {c["id"] for c in queue["items"]}
    flagged = api.get(people.auditor, "/review-queue", params={"flag": "DUPLICATE_LINE"}).json()
    assert [c["id"] for c in flagged["items"]] == [second["id"]]
    r = api.post(
        people.auditor,
        "/review-queue/bulk-approve",
        {
            "items": [
                {"claim_id": second["id"], "expected_version": second["version"]},
                {"claim_id": clean["id"], "expected_version": clean["version"]},
                {"claim_id": clean["id"], "expected_version": clean["version"]},
            ]
        },
    )
    body = r.json()
    results = {(x["claim_id"], x["result"]) for x in body["results"]}
    assert (second["id"], "SKIPPED") in results
    assert (clean["id"], "APPROVED") in results
    assert body["approved"] == 1
    assert body["skipped"] == 2
    assert api.get(people.employee, f"/claims/{clean['id']}").json()["status"] == "APPROVED"


def test_review_queue_and_bulk_are_finance_only_when_called(api: Api, people: People) -> None:
    assert api.get(people.manager, "/review-queue").status_code == 403
    r = api.post(
        people.manager,
        "/review-queue/bulk-approve",
        {"items": [{"claim_id": "x", "expected_version": 1}]},
    )
    assert r.status_code == 403
    assert api.get(people.employee, "/sample-audits").status_code == 403


def test_bulk_approve_caps_at_50_items_when_more_sent(api: Api, people: People) -> None:
    items = [{"claim_id": f"c{i}", "expected_version": 1} for i in range(51)]
    assert (
        api.post(people.auditor, "/review-queue/bulk-approve", {"items": items}).status_code == 400
    )


@pytest.mark.usefixtures("sample_everything")
def test_failed_sample_reopens_claim_at_auditor_when_resolved(api: Api, people: People) -> None:
    """Transition 16: a FAILED sample audit reopens the auto-approved claim at the auditor."""
    claim = api.claim(people.employee, 120_000)
    queue = api.get(people.auditor, "/review-queue", params={"sample_audit": "true"}).json()
    assert [c["id"] for c in queue["items"]] == [claim["id"]]
    samples = api.get(people.auditor, "/sample-audits", params={"status": "PENDING"}).json()
    sample_id = samples["items"][0]["id"]
    r = api.post(people.auditor, f"/sample-audits/{sample_id}/resolve", {"result": "FAILED"})
    assert r.status_code == 400  # a failure needs a note
    r = api.post(
        people.auditor,
        f"/sample-audits/{sample_id}/resolve",
        {"result": "FAILED", "note": "Fake bill"},
    )
    assert r.json()["status"] == "FAILED"
    reopened = api.get(people.auditor, f"/claims/{claim['id']}").json()
    assert reopened["status"] == "PENDING_AUDITOR"
    assert reopened["auto_approved"] is False
    r = api.post(people.auditor, f"/sample-audits/{sample_id}/resolve", {"result": "PASSED"})
    assert r.status_code == 409


@pytest.mark.usefixtures("sample_everything")
def test_passed_sample_releases_claim_for_payout_when_resolved(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 120_000)
    sample_id = api.get(people.auditor, "/sample-audits").json()["items"][0]["id"]
    api.post(people.auditor, f"/sample-audits/{sample_id}/resolve", {"result": "PASSED"})
    eligible = api.get(people.head, "/payouts/eligible").json()
    assert claim["id"] in {e["claim_id"] for e in eligible}


def test_inbox_lists_only_actionable_steps_when_called(api: Api, people: People) -> None:
    claim = api.claim(people.employee, 3_000_000)
    assert [i["id"] for i in api.get(people.manager, "/approvals/inbox").json()["items"]] == [
        claim["id"]
    ]
    assert api.get(people.auditor, "/approvals/inbox").json()["items"] == []
    api.approve(people.manager, claim)
    assert [i["id"] for i in api.get(people.auditor, "/approvals/inbox").json()["items"]] == [
        claim["id"]
    ]
    assert api.get(people.employee, "/approvals/inbox").json()["items"] == []
