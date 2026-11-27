"""Dashboard contract (ARD section 10): pre-shaped series so the frontend only draws."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

DashboardScope = Literal["own", "team", "company"]


class CategorySpend(BaseModel):
    category: str
    amount_paise: int


class DepartmentSpend(BaseModel):
    department_id: str
    department_name: str
    amount_paise: int


class MonthSpend(BaseModel):
    month: str  # YYYY-MM of the expense date (Asia/Kolkata calendar)
    category: str
    amount_paise: int


class RuleViolations(BaseModel):
    rule_code: str
    outcome: str
    count: int


class DepartmentRate(BaseModel):
    department_id: str
    department_name: str
    rate: float
    lines: int


class Violations(BaseModel):
    by_rule: list[RuleViolations]
    violation_rate: float  # lines with a REJECT or FLAG finding / submitted lines
    submitted_lines: int
    top_departments: list[DepartmentRate]


class ApprovalTime(BaseModel):
    """Hours from (last) submission to the final decision; SENT_BACK time is not counted
    because resubmitting resets the submission time."""

    chain_count: int
    mean_hours: float | None
    median_hours: float | None
    p90_hours: float | None
    auto_approved_count: int


class QueueLevel(BaseModel):
    level_no: int
    role: str
    pending: int
    oldest_age_seconds: int | None


class SampleAuditCounts(BaseModel):
    pending: int
    passed: int
    failed: int


class DashboardSummary(BaseModel):
    scope: DashboardScope
    date_from: date
    date_to: date
    spend_by_category: list[CategorySpend]
    spend_by_department: list[DepartmentSpend]
    spend_by_month: list[MonthSpend]
    violations: Violations
    approval_time: ApprovalTime
    queue_health: list[QueueLevel] | None  # finance only
    sample_audit: SampleAuditCounts | None  # finance only
