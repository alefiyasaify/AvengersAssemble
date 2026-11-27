"""Pure policy engine (ARD section 5): no I/O, no clock, no database. Deterministic.

`evaluate(lines, context, snapshot)` returns per-line findings and statuses, the payable total
(rejected lines excluded) and the claim outcome with its frozen `required_levels`.

Outcome resolution (ARD 5):
1. any REJECT finding -> line AUTO_REJECTED (excluded from payable);
2. otherwise any ROUTE/FLAG finding -> NEEDS_APPROVAL;
3. otherwise AUTO_APPROVED if payable <= auto_approve_max_total, else NEEDS_APPROVAL;
4. claim: all lines rejected -> REJECTED; all AUTO_APPROVED -> AUTO_APPROVED; else ROUTE.
Required levels: every active level whose threshold the payable total is ABOVE, plus every
level up to the highest `force_level` among the findings of non-rejected lines.
"""

from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

from app.modules.policy.schemas import PolicyRuleConfig, PolicySnapshot

__all__ = [
    "ClaimContext",
    "Evaluation",
    "Finding",
    "LineInput",
    "LineResult",
    "PolicySnapshot",
    "evaluate",
    "inr",
    "normalise_vendor",
]

LineStatus = Literal["AUTO_APPROVED", "NEEDS_APPROVAL", "AUTO_REJECTED"]
ClaimOutcome = Literal["AUTO_APPROVED", "ROUTE", "REJECTED"]
_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


@dataclass(frozen=True)
class LineInput:
    key: str
    category: str
    amount_paise: int
    expense_date: date
    vendor: str
    city_tier: int | None = None
    nights: int = 1
    receipt_sha256: str | None = None


@dataclass(frozen=True)
class ClaimContext:
    """Read-only lookups prepared by the service (ARD: claim_context)."""

    submitted_on: date
    # (category, date) -> amount already claimed by this employee on other non-rejected lines
    own_daily_totals: dict[tuple[str, date], int] = field(default_factory=dict)
    # (vendor_norm, amount, date) of earlier non-rejected lines of ANY employee
    duplicate_keys: set[tuple[str, int, date]] = field(default_factory=set)
    # receipt SHA-256 of earlier non-rejected lines of ANY employee
    duplicate_hashes: set[str] = field(default_factory=set)
    # (vendor_norm, category, amount, date) of this employee's other recent non-rejected lines
    recent_own_lines: list[tuple[str, str, int, date]] = field(default_factory=list)


@dataclass(frozen=True)
class Finding:
    rule_code: str
    outcome: str
    severity: str
    reason: str
    details: dict[str, Any]
    force_level: int | None


@dataclass
class LineResult:
    key: str
    status: LineStatus = "AUTO_APPROVED"
    findings: list[Finding] = field(default_factory=list)


@dataclass
class Evaluation:
    outcome: ClaimOutcome
    total_paise: int
    payable_paise: int
    required_levels: list[int]
    lines: list[LineResult]

    @property
    def rejection_reasons(self) -> list[str]:
        return [f.reason for r in self.lines for f in r.findings if f.outcome == "REJECT"]


def normalise_vendor(vendor: str) -> str:
    """Contract (ARD 5): case-insensitive, whitespace-collapsed vendor name."""
    return " ".join(vendor.split()).casefold()


def inr(paise: int) -> str:
    """Indian grouping from integer paise (never floats): 10000000 -> '1,00,000.00 INR'."""
    rupees, rem = divmod(paise, 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join([*groups, tail])
    return f"{digits}.{rem:02d} INR"


# A checker returns {line key: (template values, details)} for the lines that breach the rule.
_Hit = dict[str, tuple[dict[str, str], dict[str, Any]]]
_Checker = Callable[[PolicyRuleConfig, Sequence[LineInput], ClaimContext, PolicySnapshot], _Hit]


def _daily_cap(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    """Lines are taken in order; the line that pushes the day over the cap is the breach."""
    cap = int(rule.params["cap"])
    running: dict[date, int] = defaultdict(int)
    hits: _Hit = {}
    for ln in lines:
        if ln.category != rule.category:
            continue
        earlier = ctx.own_daily_totals.get((ln.category, ln.expense_date), 0)
        total = earlier + running[ln.expense_date] + ln.amount_paise
        if total > cap:
            hits[ln.key] = (
                {"date": ln.expense_date.isoformat(), "total": inr(total), "cap": inr(cap)},
                {"day_total_paise": total, "cap_paise": cap},
            )
        else:
            running[ln.expense_date] += ln.amount_paise
    return hits


def _per_unit_cap_by_tier(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], _ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    caps: dict[str, int] = rule.params["cap_by_tier"]
    hits: _Hit = {}
    for ln in lines:
        if ln.category != rule.category:
            continue
        cap = int(caps.get(str(ln.city_tier), caps["default"]))
        nights = max(ln.nights, 1)
        if ln.amount_paise > cap * nights:
            per_night = ln.amount_paise // nights
            hits[ln.key] = (
                {"amount_per_night": inr(per_night), "cap": inr(cap)},
                {"per_night_paise": per_night, "cap_paise": cap, "city_tier": ln.city_tier},
            )
    return hits


def _per_line_cap(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], _ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    cap = int(rule.params["cap"])
    return {
        ln.key: ({"amount": inr(ln.amount_paise), "cap": inr(cap)}, {"cap_paise": cap})
        for ln in lines
        if ln.category == rule.category and ln.amount_paise > cap
    }


def _receipt_required_above(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], _ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    threshold = int(rule.params["threshold"])
    return {
        ln.key: ({"threshold": inr(threshold)}, {"threshold_paise": threshold})
        for ln in lines
        if ln.amount_paise > threshold and not ln.receipt_sha256
    }


def _duplicate(
    _rule: PolicyRuleConfig, lines: Sequence[LineInput], ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    seen_keys = set(ctx.duplicate_keys)
    seen_hashes = set(ctx.duplicate_hashes)
    hits: _Hit = {}
    for ln in lines:
        key = (normalise_vendor(ln.vendor), ln.amount_paise, ln.expense_date)
        if key in seen_keys:
            hits[ln.key] = (
                {"match": "same vendor, amount and date as an earlier line"},
                {"match": "vendor_amount_date"},
            )
        elif ln.receipt_sha256 and ln.receipt_sha256 in seen_hashes:
            hits[ln.key] = (
                {"match": "the same receipt file was used on an earlier line"},
                {"match": "receipt_sha256"},
            )
        seen_keys.add(key)
        if ln.receipt_sha256:
            seen_hashes.add(ln.receipt_sha256)
    return hits


def _weekend_flag(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], _ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    days = {int(d) for d in rule.params["weekend_days"]}
    return {
        ln.key: ({"weekday": _WEEKDAYS[ln.expense_date.weekday()]}, {})
        for ln in lines
        if ln.expense_date.weekday() in days
    }


def _split_window(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], ctx: ClaimContext, snap: PolicySnapshot
) -> _Hit:
    """C1: this claim stays under a level, but with the same employee's related spend (same
    vendor or category within the window) it would cross that level's threshold."""
    window = timedelta(days=int(rule.params["window_days"]))
    threshold = snap.level_threshold(int(rule.params["threshold_level"]))
    claim_total = sum(ln.amount_paise for ln in lines)
    if threshold is None or claim_total > threshold:
        return {}
    hits: _Hit = {}
    for ln in lines:
        vendor = normalise_vendor(ln.vendor)
        related = sum(
            o_amount
            for o_vendor, o_category, o_amount, o_date in ctx.recent_own_lines
            if (o_vendor == vendor or o_category == ln.category)
            and abs(o_date - ln.expense_date) <= window
        )
        combined = related + claim_total
        if related and combined > threshold:
            hits[ln.key] = (
                {"combined": inr(combined), "window_days": str(window.days)},
                {"combined_paise": combined, "threshold_paise": threshold},
            )
    return hits


def _max_age_days(
    rule: PolicyRuleConfig, lines: Sequence[LineInput], ctx: ClaimContext, _: PolicySnapshot
) -> _Hit:
    limit = int(rule.params["max_age_days"])
    return {
        ln.key: (
            {
                "age_days": str((ctx.submitted_on - ln.expense_date).days),
                "max_age_days": str(limit),
            },
            {},
        )
        for ln in lines
        if (ctx.submitted_on - ln.expense_date).days > limit
    }


RULE_TYPES: dict[str, _Checker] = {
    "daily_cap": _daily_cap,
    "per_unit_cap_by_tier": _per_unit_cap_by_tier,
    "per_line_cap": _per_line_cap,
    "receipt_required_above": _receipt_required_above,
    "duplicate": _duplicate,
    "weekend_flag": _weekend_flag,
    "split_window": _split_window,
    "max_age_days": _max_age_days,
}


def _reason(template: str, values: dict[str, str]) -> str:
    try:
        return template.format(**values)[:500]
    except (KeyError, IndexError, ValueError):
        return template[:500]


def _apply_rules(
    lines: Sequence[LineInput], context: ClaimContext, snapshot: PolicySnapshot
) -> dict[str, LineResult]:
    results = {ln.key: LineResult(key=ln.key) for ln in lines}
    for rule in snapshot.rules:
        if not rule.active:
            continue
        for key, (values, details) in RULE_TYPES[rule.type](rule, lines, context, snapshot).items():
            results[key].findings.append(
                Finding(
                    rule_code=rule.code,
                    outcome=rule.outcome,
                    severity=rule.severity,
                    reason=_reason(rule.message_template, values),
                    details=details,
                    force_level=rule.force_level,
                )
            )
    return results


def _resolve_statuses(
    results: dict[str, LineResult], amounts: dict[str, int], auto_approve_max: int
) -> int:
    """Set each line's status (ARD 5 steps 1-3) and return the payable total."""
    for res in results.values():
        if any(f.outcome == "REJECT" for f in res.findings):
            res.status = "AUTO_REJECTED"
        elif res.findings:
            res.status = "NEEDS_APPROVAL"
    payable = sum(amounts[k] for k, r in results.items() if r.status != "AUTO_REJECTED")
    if payable > auto_approve_max:
        for res in results.values():
            if res.status == "AUTO_APPROVED":
                res.status = "NEEDS_APPROVAL"
    return payable


def evaluate(
    lines: Sequence[LineInput], context: ClaimContext, snapshot: PolicySnapshot
) -> Evaluation:
    results = _apply_rules(lines, context, snapshot)
    amounts = {ln.key: ln.amount_paise for ln in lines}
    payable = _resolve_statuses(results, amounts, snapshot.auto_approve_max_total_paise)
    ordered = [results[ln.key] for ln in lines]
    total = sum(amounts.values())
    if ordered and all(r.status == "AUTO_REJECTED" for r in ordered):
        return Evaluation("REJECTED", total, 0, [], ordered)
    if all(r.status == "AUTO_APPROVED" for r in ordered):
        return Evaluation("AUTO_APPROVED", total, payable, [], ordered)
    levels = _required_levels(payable, ordered, snapshot)
    return Evaluation("ROUTE", total, payable, levels, ordered)


def _required_levels(payable: int, lines: list[LineResult], snapshot: PolicySnapshot) -> list[int]:
    active = sorted(lv.level_no for lv in snapshot.levels if lv.active)
    forced = max(
        (
            f.force_level
            for r in lines
            if r.status != "AUTO_REJECTED"
            for f in r.findings
            if f.force_level is not None
        ),
        default=0,
    )
    required = {
        lv.level_no
        for lv in snapshot.levels
        if lv.active and payable > lv.min_amount_paise_exclusive
    }
    required |= {n for n in active if n <= forced}
    return sorted(required) or active[:1]
