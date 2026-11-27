"""Dashboard aggregates (ARD section 10). Scope follows the caller's role: an employee sees
their own spend, a manager their team (direct and indirect reports), auditor and head the
company. Spend counts lines whose final status is APPROVED or AUTO_APPROVED (PAID included),
grouped by the department stored on the claim at submission."""

import math
import statistics
from collections import Counter, defaultdict
from collections.abc import Collection
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.auth import Principal
from app.core.clock import Clock
from app.core.db import utcnow
from app.core.errors import ValidationFailed
from app.modules.claims.service import ClaimsService
from app.modules.org.service import OrgService
from app.modules.policy.service import PolicyService
from app.modules.reports.schemas import (
    ApprovalTime,
    CategorySpend,
    DashboardScope,
    DashboardSummary,
    DepartmentRate,
    DepartmentSpend,
    MonthSpend,
    QueueLevel,
    RuleViolations,
    SampleAuditCounts,
    Violations,
)

DEFAULT_WINDOW_DAYS = 365
MAX_WINDOW_DAYS = 366 * 2


def p90(values: list[float]) -> float | None:
    """Nearest-rank 90th percentile."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(math.ceil(0.9 * len(ordered)) - 1, 0)]


class ReportsService:
    def __init__(
        self,
        claims: ClaimsService,
        org: OrgService,
        policy: PolicyService,
        now: Clock = utcnow,
    ) -> None:
        self._claims = claims
        self._org = org
        self._policy = policy
        self._now = now

    def _scope(self, principal: Principal) -> tuple[DashboardScope, Collection[str] | None]:
        if principal.is_finance:
            return "company", None
        team = self._org.subordinate_ids(principal.id)
        if team:
            return "team", sorted(team | {principal.id})
        return "own", [principal.id]

    def summary(
        self,
        principal: Principal,
        date_from: date | None,
        date_to: date | None,
        department_id: str | None,
        category: str | None,
    ) -> DashboardSummary:
        tz = ZoneInfo(self._policy.config_values().timezone)
        today = self._now().astimezone(tz).date()
        until = date_to or today
        since = date_from or until - timedelta(days=DEFAULT_WINDOW_DAYS)
        if since > until or (until - since).days > MAX_WINDOW_DAYS:
            raise ValidationFailed(
                "Choose a date range of at most two years.", code="INVALID_RANGE"
            )
        start = datetime.combine(since, time.min, tz)
        end = datetime.combine(until, time.max, tz)
        scope, owners = self._scope(principal)
        names = self._org.department_names()

        spend = [
            row
            for row in self._claims.spend_rows(owners, since, until)
            if (department_id is None or row[0] == department_id)
            and (category is None or row[1] == category)
        ]
        by_category: Counter[str] = Counter()
        by_department: Counter[str] = Counter()
        by_month: Counter[tuple[str, str]] = Counter()
        for dept, cat, day, amount in spend:
            by_category[cat] += amount
            by_department[dept] += amount
            by_month[(f"{day:%Y-%m}", cat)] += amount

        return DashboardSummary(
            scope=scope,
            date_from=since,
            date_to=until,
            spend_by_category=[
                CategorySpend(category=c, amount_paise=a) for c, a in sorted(by_category.items())
            ],
            spend_by_department=[
                DepartmentSpend(department_id=d, department_name=names.get(d, d), amount_paise=a)
                for d, a in sorted(by_department.items(), key=lambda kv: -kv[1])
            ],
            spend_by_month=[
                MonthSpend(month=m, category=c, amount_paise=a)
                for (m, c), a in sorted(by_month.items())
            ],
            violations=self._violations(owners, start, end, department_id, category, names),
            approval_time=self._approval_time(owners, start, end),
            queue_health=self._queue_health() if principal.is_finance else None,
            sample_audit=self._samples() if principal.is_finance else None,
        )

    def _violations(
        self,
        owners: Collection[str] | None,
        start: datetime,
        end: datetime,
        department_id: str | None,
        category: str | None,
        names: dict[str, str],
    ) -> Violations:
        lines = {
            line_id: dept
            for line_id, dept, cat in self._claims.submitted_line_rows(owners, start, end)
            if (department_id is None or dept == department_id)
            and (category is None or cat == category)
        }
        by_rule: Counter[tuple[str, str]] = Counter()
        violating: set[str] = set()
        for line_id, rule, outcome in self._claims.finding_rows(owners, start, end):
            if line_id not in lines:
                continue
            by_rule[(rule, outcome)] += 1
            if outcome in ("REJECT", "FLAG"):
                violating.add(line_id)
        per_dept_total: Counter[str] = Counter(lines.values())
        per_dept_bad: Counter[str] = Counter(lines[i] for i in violating)
        top = sorted(
            (
                DepartmentRate(
                    department_id=d,
                    department_name=names.get(d, d),
                    rate=round(per_dept_bad[d] / n, 4),
                    lines=n,
                )
                for d, n in per_dept_total.items()
            ),
            key=lambda r: (-r.rate, r.department_name),
        )[:5]
        return Violations(
            by_rule=[
                RuleViolations(rule_code=r, outcome=o, count=n)
                for (r, o), n in sorted(by_rule.items(), key=lambda kv: (-kv[1], kv[0]))
            ],
            violation_rate=round(len(violating) / len(lines), 4) if lines else 0.0,
            submitted_lines=len(lines),
            top_departments=top,
        )

    def _approval_time(
        self, owners: Collection[str] | None, start: datetime, end: datetime
    ) -> ApprovalTime:
        rows = self._claims.decision_rows(owners, start, end)
        hours = [(d - s).total_seconds() / 3600 for s, d, auto in rows if not auto]
        return ApprovalTime(
            chain_count=len(hours),
            mean_hours=round(statistics.fmean(hours), 2) if hours else None,
            median_hours=round(statistics.median(hours), 2) if hours else None,
            p90_hours=round(v, 2) if (v := p90(hours)) is not None else None,
            auto_approved_count=sum(1 for _, _, auto in rows if auto),
        )

    def _queue_health(self) -> list[QueueLevel]:
        now = self._now()
        pending: dict[int, list[datetime]] = defaultdict(list)
        roles = self._policy.level_roles()
        for step in self._claims.pending_steps():
            pending[step.level_no].append(step.created_at)
        return [
            QueueLevel(
                level_no=level,
                role=role,
                pending=len(pending[level]),
                oldest_age_seconds=(
                    int((now - min(pending[level])).total_seconds()) if pending[level] else None
                ),
            )
            for level, role in sorted(roles.items())
        ]

    def _samples(self) -> SampleAuditCounts:
        counts = self._claims.sample_counts()
        return SampleAuditCounts(
            pending=counts.get("PENDING", 0),
            passed=counts.get("PASSED", 0),
            failed=counts.get("FAILED", 0),
        )
