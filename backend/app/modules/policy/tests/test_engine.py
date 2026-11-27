"""Policy engine tests, written before the engine (ARD sections 5 and 12).

Table-driven from `app/seeds/rule_fixtures.json`, the same fixture file the seed uses, so test
data and seed data cannot drift. Every rule has cases at, just below and just above its limit.
"""

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app.modules.policy.engine import ClaimContext, LineInput, PolicySnapshot, evaluate
from app.modules.policy.schemas import load_seed_snapshot

FIXTURES = Path(__file__).resolve().parents[3] / "seeds" / "rule_fixtures.json"
CASES: list[dict[str, Any]] = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"]


@pytest.fixture(scope="module")
def snapshot() -> PolicySnapshot:
    return load_seed_snapshot()


def _line(raw: dict[str, Any]) -> LineInput:
    key = raw["key"]
    return LineInput(
        key=key,
        category=raw.get("category", "OTHER"),
        amount_paise=raw.get("amount_paise", 10_000),
        expense_date=date.fromisoformat(raw.get("expense_date", "2026-11-25")),
        vendor=raw.get("vendor", f"Vendor {key}"),
        city_tier=raw.get("city_tier"),
        nights=raw.get("nights", 1),
        receipt_sha256=raw.get("receipt_sha256", hashlib.sha256(key.encode()).hexdigest()),
    )


def _context(raw: dict[str, Any]) -> ClaimContext:
    return ClaimContext(
        submitted_on=date.fromisoformat(raw.get("submitted_on", "2026-11-27")),
        own_daily_totals={
            (cat, date.fromisoformat(d)): amount
            for cat, d, amount in raw.get("own_daily_totals", [])
        },
        duplicate_keys={(v, a, date.fromisoformat(d)) for v, a, d in raw.get("duplicate_keys", [])},
        duplicate_hashes=set(raw.get("duplicate_hashes", [])),
        recent_own_lines=[
            (v, c, a, date.fromisoformat(d)) for v, c, a, d in raw.get("recent_own_lines", [])
        ],
    )


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_rule_fixture(case: dict[str, Any], snapshot: PolicySnapshot) -> None:
    result = evaluate(
        [_line(raw) for raw in case["lines"]], _context(case.get("context", {})), snapshot
    )
    by_key = {r.key: r for r in result.lines}
    expect = case["expect"]
    for key, codes in expect.get("findings", {}).items():
        assert sorted(f.rule_code for f in by_key[key].findings) == sorted(codes)
    for key, status in expect.get("status", {}).items():
        assert by_key[key].status == status
    if "outcome" in expect:
        assert result.outcome == expect["outcome"]
    if "required_levels" in expect:
        assert result.required_levels == expect["required_levels"]
    if "payable_paise" in expect:
        assert result.payable_paise == expect["payable_paise"]
    if "total_paise" in expect:
        assert result.total_paise == expect["total_paise"]


def test_every_active_rule_has_fixture_coverage(snapshot: PolicySnapshot) -> None:
    covered = {
        code
        for case in CASES
        for codes in case["expect"].get("findings", {}).values()
        for code in codes
    }
    active = {r.code for r in snapshot.rules if r.active}
    assert active <= covered


def test_findings_carry_reason_severity_and_outcome(snapshot: PolicySnapshot) -> None:
    line = LineInput("a", "LOCAL_CAB", 250_000, date(2026, 11, 21), "Ola", None, 1, None)
    result = evaluate([line], ClaimContext(submitted_on=date(2026, 11, 27)), snapshot)
    findings = {f.rule_code: f for f in result.lines[0].findings}
    assert set(findings) == {"CAB_TRIP_CAP", "RECEIPT_REQUIRED", "WEEKEND_SPEND"}
    assert findings["CAB_TRIP_CAP"].outcome == "REJECT"
    assert findings["CAB_TRIP_CAP"].severity == "high"
    assert "2,500.00" in findings["CAB_TRIP_CAP"].reason
    assert findings["WEEKEND_SPEND"].outcome == "FLAG"
    assert result.lines[0].status == "AUTO_REJECTED"


def test_inactive_rules_are_ignored(snapshot: PolicySnapshot) -> None:
    custom = snapshot.model_copy(deep=True)
    for rule in custom.rules:
        if rule.code == "WEEKEND_SPEND":
            rule.active = False
    line = LineInput("a", "OTHER", 10_000, date(2026, 11, 21), "V", None, 1, "x" * 64)
    result = evaluate([line], ClaimContext(submitted_on=date(2026, 11, 27)), custom)
    assert result.lines[0].findings == []
    assert result.outcome == "AUTO_APPROVED"
