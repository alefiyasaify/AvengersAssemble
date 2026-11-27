"""Claims, approvals, delegations and sample audits: API contract (ARD sections 4, 6 and 8).

Money is integer paise; enum values are UPPER_SNAKE; every state-changing call on a claim sends
`expected_version` (409 CLAIM_VERSION_CONFLICT when stale).
"""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["MEALS", "HOTEL", "LOCAL_CAB", "TRAVEL", "OTHER"]
ClaimStatus = Literal[
    "DRAFT",
    "PENDING_MANAGER",
    "PENDING_AUDITOR",
    "PENDING_HEAD",
    "SENT_BACK",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    "PAID",
]
LineStatus = Literal[
    "DRAFT", "AUTO_APPROVED", "NEEDS_APPROVAL", "AUTO_REJECTED", "APPROVED", "REJECTED"
]
StepStatus = Literal["PENDING", "APPROVED", "REJECTED", "SENT_BACK", "SKIPPED", "SUPERSEDED"]
LevelRole = Literal["MANAGER", "AUDITOR", "FINANCE_HEAD"]
FindingOutcome = Literal["REJECT", "ROUTE", "FLAG"]
SampleStatus = Literal["PENDING", "PASSED", "FAILED"]
Action = Literal[
    "edit", "submit", "resubmit", "withdraw", "approve", "reject", "send_back", "comment"
]
ClaimScope = Literal["mine", "team", "all"]

MAX_LINE_PAISE = 100_000_000  # 10,00,000 INR per line: input sanity bound, not a policy rule


# ------------------------------------------------------------------ requests
class Versioned(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)


class LineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    description: str = Field(min_length=1, max_length=500)
    vendor: str = Field(min_length=1, max_length=120)
    amount_paise: int = Field(gt=0, le=MAX_LINE_PAISE)
    expense_date: date
    city_id: str | None = Field(default=None, max_length=36)
    nights: int = Field(default=1, ge=1, le=60)
    receipt_id: str | None = Field(default=None, max_length=36)


class LineAdd(LineCreate):
    expected_version: int = Field(ge=1)


class LineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    category: Category | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    vendor: str | None = Field(default=None, min_length=1, max_length=120)
    amount_paise: int | None = Field(default=None, gt=0, le=MAX_LINE_PAISE)
    expense_date: date | None = None
    city_id: str | None = Field(default=None, max_length=36)
    nights: int | None = Field(default=None, ge=1, le=60)
    receipt_id: str | None = Field(default=None, max_length=36)


class ClaimCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    lines: list[LineCreate] = Field(default_factory=list, max_length=50)


class ClaimPatch(Versioned):
    title: str = Field(min_length=1, max_length=200)


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=1, max_length=2000)
    line_id: str | None = Field(default=None, max_length=36)


class ApproveRequest(Versioned):
    comment: str | None = Field(default=None, max_length=2000)


class RejectRequest(Versioned):
    comment: str = Field(min_length=1, max_length=2000)


class SendBackRequest(Versioned):
    comment: str = Field(min_length=1, max_length=2000)
    line_ids: list[str] = Field(default_factory=list, max_length=50)


class BulkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str = Field(max_length=36)
    expected_version: int = Field(ge=1)


class BulkApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[BulkItem] = Field(min_length=1, max_length=50)
    comment: str | None = Field(default=None, max_length=2000)


class SampleResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")

    result: Literal["PASSED", "FAILED"]
    note: str | None = Field(default=None, max_length=2000)


class DelegationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delegate_id: str = Field(max_length=36)
    level_no: int = Field(ge=1, le=10)
    starts_at: datetime
    ends_at: datetime


# ------------------------------------------------------------------ responses
class FindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_code: str
    outcome: FindingOutcome
    severity: Literal["low", "medium", "high"]
    reason: str
    details: dict[str, Any]


class ReceiptMeta(BaseModel):
    id: str
    mime: str
    original_name: str


class LineRead(BaseModel):
    id: str
    position: int
    category: Category
    description: str
    vendor: str
    amount_paise: int
    expense_date: date
    city_id: str | None
    nights: int
    status: LineStatus
    receipt: ReceiptMeta | None
    findings: list[FindingRead]


class StepRead(BaseModel):
    id: str
    round: int
    level_no: int
    role: LevelRole
    status: StepStatus
    assigned_to_id: str | None
    assigned_to_name: str | None
    acted_by_id: str | None
    acted_by_name: str | None
    on_behalf_of_id: str | None
    on_behalf_of_name: str | None
    comment: str | None
    created_at: datetime
    acted_at: datetime | None


class CurrentStep(BaseModel):
    id: str
    level_no: int
    role: LevelRole
    assigned_to: str | None
    assigned_to_name: str | None
    since: datetime


class CommentRead(BaseModel):
    id: str
    line_id: str | None
    author_id: str
    author_name: str
    body: str
    created_at: datetime


class SampleAuditRead(BaseModel):
    id: str
    claim_id: str
    claim_number: str
    owner_name: str
    payable_paise: int
    selected_at: datetime
    status: SampleStatus
    reviewer_id: str | None
    outcome_note: str | None
    resolved_at: datetime | None


class ClaimSummary(BaseModel):
    id: str
    claim_no: str
    title: str
    status: ClaimStatus
    owner_id: str
    owner_name: str
    department_id: str
    total_paise: int
    payable_paise: int
    line_count: int
    finding_codes: list[str]
    has_high_severity: bool
    current_level: int | None
    current_step: CurrentStep | None
    sample_audit_pending: bool
    submitted_at: datetime | None
    decided_at: datetime | None
    version: int
    created_at: datetime


class ClaimDetail(ClaimSummary):
    required_levels: list[int]
    round: int
    policy_version_id: str | None
    auto_approved: bool
    paid_at: datetime | None
    payout_batch_id: str | None
    updated_at: datetime
    rejection_reasons: list[str]
    lines: list[LineRead]
    steps: list[StepRead]
    comments: list[CommentRead]
    sample_audit: SampleAuditRead | None
    allowed_actions: list[Action]


class PreviewLine(BaseModel):
    line_id: str
    status: LineStatus
    findings: list[FindingRead]


class PolicyPreview(BaseModel):
    """Advisory only (nothing stored); the submit result is authoritative."""

    outcome: Literal["AUTO_APPROVED", "ROUTE", "REJECTED"]
    total_paise: int
    payable_paise: int
    required_levels: list[int]
    lines: list[PreviewLine]


class TimelineEntry(BaseModel):
    id: int
    ts: datetime
    action: str
    actor_id: str | None
    actor_name: str
    on_behalf_of_name: str | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None


class InboxItem(ClaimSummary):
    step_id: str
    delegated_from_id: str | None
    delegated_from_name: str | None


class BulkItemResult(BaseModel):
    claim_id: str
    result: Literal["APPROVED", "SKIPPED", "FAILED"]
    reason: str | None


class BulkApproveResult(BaseModel):
    approved: int
    skipped: int
    failed: int
    results: list[BulkItemResult]


class DelegationRead(BaseModel):
    id: str
    delegator_id: str
    delegator_name: str
    delegate_id: str
    delegate_name: str
    level_no: int
    starts_at: datetime
    ends_at: datetime
    revoked_at: datetime | None
    is_active: bool
