"""Dashboard summary (ARD 10): role scope and widget definitions."""

from app.modules.reports.service import p90
from conftest import Api, People


def test_p90_uses_nearest_rank_when_values_given() -> None:
    assert p90([]) is None
    assert p90([5.0]) == 5.0
    assert p90([float(i) for i in range(1, 11)]) == 9.0


def test_dashboard_scopes_spend_by_role_when_requested(api: Api, people: People) -> None:
    api.claim(people.employee, 120_000)  # auto-approved: counts as spend
    api.claim(people.outsider, 200_000, category="MEALS")  # 2,000 meals: rejected, no spend
    api.approve(people.manager, api.claim(people.peer, 800_000))  # chain-approved

    own = api.get(people.employee, "/dashboard/summary").json()
    assert own["scope"] == "own"
    assert own["spend_by_category"] == [{"category": "OTHER", "amount_paise": 120_000}]
    assert own["queue_health"] is None
    assert own["sample_audit"] is None

    team = api.get(people.manager, "/dashboard/summary").json()
    assert team["scope"] == "team"
    assert sum(c["amount_paise"] for c in team["spend_by_category"]) == 920_000

    company = api.get(people.head, "/dashboard/summary").json()
    assert company["scope"] == "company"
    assert company["spend_by_month"] == [
        {"month": "2026-11", "category": "OTHER", "amount_paise": 920_000}
    ]
    assert company["spend_by_department"][0]["department_name"] == "Engineering"
    meals = next(v for v in company["violations"]["by_rule"] if v["rule_code"] == "MEALS_DAILY_CAP")
    assert meals == {"rule_code": "MEALS_DAILY_CAP", "outcome": "REJECT", "count": 1}
    assert company["violations"]["submitted_lines"] == 3
    assert company["approval_time"]["auto_approved_count"] == 1
    assert company["approval_time"]["chain_count"] == 2  # the peer approval and the rejection
    assert {q["level_no"] for q in company["queue_health"]} == {1, 2, 3}
    assert company["sample_audit"] == {"pending": 0, "passed": 0, "failed": 0}


def test_dashboard_filters_by_category_and_rejects_bad_range_when_given(
    api: Api, people: People
) -> None:
    api.claim(people.employee, 120_000)
    r = api.get(people.head, "/dashboard/summary", params={"category": "MEALS"})
    assert r.json()["spend_by_category"] == []
    r = api.get(
        people.head, "/dashboard/summary", params={"from": "2026-11-30", "to": "2026-11-01"}
    )
    assert r.status_code == 400
