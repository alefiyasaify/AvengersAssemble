"""Claims: lifecycle, approval chain, delegation and sample audit (ARD sections 2, 4, 5, 6).

This service is the module's public interface. Other modules (approvals, payouts, reports) call
it; they never touch claim tables. Every state change bumps `claims.version` (optimistic lock),
checks the transition table and writes one audit event, all in the caller's transaction.
"""

import random
import secrets
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.core.auth import Principal
from app.core.clock import Clock
from app.core.db import utcnow
from app.core.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailed,
)
from app.core.pagination import Page, PageParams
from app.modules.audit.service import AuditService
from app.modules.claims import chain
from app.modules.claims.models import (
    ApprovalStep,
    Claim,
    ClaimComment,
    ClaimLine,
    Delegation,
    LineFinding,
    SampleAudit,
)
from app.modules.claims.repository import ClaimFilter, ClaimsRepository
from app.modules.claims.schemas import (
    Action,
    ApproveRequest,
    BulkApproveRequest,
    BulkApproveResult,
    BulkItemResult,
    ClaimCreate,
    ClaimDetail,
    ClaimPatch,
    ClaimScope,
    ClaimSummary,
    CommentCreate,
    CommentRead,
    CurrentStep,
    DelegationCreate,
    DelegationRead,
    FindingRead,
    InboxItem,
    LineAdd,
    LineCreate,
    LineRead,
    LineUpdate,
    PolicyPreview,
    PreviewLine,
    ReceiptMeta,
    RejectRequest,
    SampleAuditRead,
    SampleResolve,
    SendBackRequest,
    StepRead,
    TimelineEntry,
)
from app.modules.claims.state import EDITABLE, STATUS_FOR_ROLE, ensure_transition
from app.modules.org.service import APPROVER_ROLES, OrgService, Person, rank
from app.modules.policy.engine import ClaimContext, Evaluation, LineInput, normalise_vendor
from app.modules.policy.service import PolicyService
from app.modules.receipts.service import ReceiptService, StoredReceipt

SPLIT_RULE_TYPE = "split_window"
DUPLICATE_RULE = "DUPLICATE_LINE"
SYSTEM = None  # audit actor for system decisions (auto-approval, auto-rejection)


@dataclass(frozen=True)
class ReviewFilter:
    department_id: str | None = None
    category: str | None = None
    min_payable_paise: int | None = None
    max_payable_paise: int | None = None
    submitted_from: datetime | None = None
    submitted_to: datetime | None = None
    rule_code: str | None = None
    owner_id: str | None = None
    sample_audit: bool = False
    q: str | None = None


@dataclass(frozen=True)
class PayableClaim:
    id: str
    number: str
    owner_id: str
    payable_paise: int
    decided_at: datetime | None


@dataclass(frozen=True)
class PendingStepInfo:
    level_no: int
    role: str
    created_at: datetime


class ClaimsService:
    def __init__(
        self,
        repository: ClaimsRepository,
        audit: AuditService,
        org: OrgService,
        policy: PolicyService,
        receipts: ReceiptService,
        now: Clock = utcnow,
        rng: random.Random | None = None,
    ) -> None:
        self._repo = repository
        self._audit = audit
        self._org = org
        self._policy = policy
        self._receipts = receipts
        self._now = now
        # The sample draw uses a CSPRNG (ARD C11); tests inject a fixed generator.
        self._rng: random.Random = rng or secrets.SystemRandom()

    # ================================================================== helpers
    def _tz(self) -> ZoneInfo:
        return ZoneInfo(self._policy.config_values().timezone)

    def _today(self) -> date:
        return self._now().astimezone(self._tz()).date()

    def _record(
        self,
        actor_id: str | None,
        action: str,
        claim: Claim,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        on_behalf_of_id: str | None = None,
        entity_type: str = "claim",
        entity_id: str | None = None,
    ) -> None:
        self._audit.record(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id or claim.id,
            claim_id=claim.id,
            before=before,
            after=after,
            on_behalf_of_id=on_behalf_of_id,
        )

    def _lock(self, claim: Claim, expected_version: int) -> None:
        """Optimistic lock: UPDATE ... WHERE version = expected (ARD 7). 409 when stale."""
        if claim.version != expected_version or not self._repo.bump_version(
            claim.id, expected_version
        ):
            raise ConflictError(
                "This claim changed since you loaded it. Reload and try again.",
                code="CLAIM_VERSION_CONFLICT",
                details={"current_version": claim.version},
            )
        claim.version = expected_version + 1

    @staticmethod
    def _set_status(claim: Claim, target: str) -> None:
        ensure_transition(claim.status, target)
        claim.status = target

    def _active_delegations(self) -> list[chain.ActiveDelegation]:
        return [
            chain.ActiveDelegation(d.delegator_id, d.delegate_id, d.level_no)
            for d in self._repo.active_delegations(self._now())
        ]

    @staticmethod
    def _current_step(claim: Claim) -> ApprovalStep | None:
        return next(
            (
                s
                for s in claim.steps
                if s.status == "PENDING"
                and s.round == claim.round
                and s.level_no == claim.current_level
            ),
            None,
        )

    @staticmethod
    def _acted_ids(claim: Claim) -> set[str]:
        """People who approved a level of this claim in the current round (SoD, ARD rule 3)."""
        ids: set[str] = set()
        for s in claim.steps:
            if s.round == claim.round and s.status == "APPROVED":
                ids.update(i for i in (s.acted_by_id, s.on_behalf_of_id) if i)
        return ids

    # ================================================================== visibility
    def _can_view(self, principal: Principal, claim: Claim) -> bool:
        if claim.owner_id == principal.id or principal.is_finance:
            return True
        if claim.status == "DRAFT":
            return False
        for s in claim.steps:
            if principal.id in (s.assigned_to_id, s.acted_by_id, s.on_behalf_of_id):
                return True
        if any(
            d.delegate_id == principal.id
            and any(s.assigned_to_id == d.delegator_id for s in claim.steps)
            for d in self._active_delegations()
        ):
            return True
        return claim.owner_id in self._org.subordinate_ids(principal.id)

    def _load(self, principal: Principal, claim_id: str) -> Claim:
        """The claim if the caller may see it; 404 otherwise (never 403, ARD rule 1)."""
        claim = self._repo.get(claim_id)
        if claim is None or not self._can_view(principal, claim):
            raise NotFoundError("Claim was not found.", code="CLAIM_NOT_FOUND")
        return claim

    def _owned(self, principal: Principal, claim_id: str) -> Claim:
        claim = self._repo.get(claim_id)
        if claim is None or claim.owner_id != principal.id:
            raise NotFoundError("Claim was not found.", code="CLAIM_NOT_FOUND")
        return claim

    def _editable(self, principal: Principal, claim_id: str, expected_version: int) -> Claim:
        claim = self._owned(principal, claim_id)
        if claim.status not in EDITABLE:
            raise ConflictError(
                f"A {claim.status} claim cannot be edited.", code="ILLEGAL_TRANSITION"
            )
        self._lock(claim, expected_version)
        return claim

    # ================================================================== read models
    def _summaries(self, principal: Principal, claims: Sequence[Claim]) -> list[ClaimSummary]:
        people = self._org.people(
            {c.owner_id for c in claims}
            | {s.assigned_to_id for c in claims for s in c.steps if s.assigned_to_id}
        )
        samples = self._repo.samples_for([c.id for c in claims])
        return [self._summary(principal, c, people, samples) for c in claims]

    def _summary(
        self,
        principal: Principal,
        claim: Claim,
        people: dict[str, Person],
        samples: dict[str, SampleAudit],
    ) -> ClaimSummary:
        step = self._current_step(claim)
        sample = samples.get(claim.id)
        findings = [f for ln in claim.lines for f in ln.findings]
        assignee = people.get(step.assigned_to_id) if step and step.assigned_to_id else None
        return ClaimSummary(
            id=claim.id,
            claim_no=claim.number,
            title=claim.title,
            status=claim.status,  # type: ignore[arg-type]
            owner_id=claim.owner_id,
            owner_name=_name(people, claim.owner_id),
            department_id=claim.department_id,
            total_paise=claim.total_paise,
            payable_paise=claim.payable_paise,
            line_count=len(claim.lines),
            finding_codes=sorted({f.rule_code for f in findings}),
            has_high_severity=any(f.severity == "high" for f in findings),
            current_level=claim.current_level,
            current_step=(
                CurrentStep(
                    id=step.id,
                    level_no=step.level_no,
                    role=step.role,  # type: ignore[arg-type]
                    assigned_to=step.assigned_to_id,
                    assigned_to_name=assignee.full_name if assignee else None,
                    since=step.created_at,
                )
                if step
                else None
            ),
            # The claimant never learns whether a claim was sampled (ARD C11).
            sample_audit_pending=bool(
                principal.is_finance and sample and sample.status == "PENDING"
            ),
            submitted_at=claim.submitted_at,
            decided_at=claim.decided_at,
            version=claim.version,
            created_at=claim.created_at,
        )

    def _sample_read(
        self, sample: SampleAudit, claim: Claim, people: dict[str, Person]
    ) -> SampleAuditRead:
        return SampleAuditRead(
            id=sample.id,
            claim_id=claim.id,
            claim_number=claim.number,
            owner_name=_name(people, claim.owner_id),
            payable_paise=claim.payable_paise,
            selected_at=sample.selected_at,
            status=sample.status,  # type: ignore[arg-type]
            reviewer_id=sample.reviewer_id,
            outcome_note=sample.outcome_note,
            resolved_at=sample.resolved_at,
        )

    def _detail(self, principal: Principal, claim: Claim) -> ClaimDetail:
        comments = self._repo.comments(claim.id)
        ids = (
            {claim.owner_id}
            | {
                i
                for s in claim.steps
                for i in (s.assigned_to_id, s.acted_by_id, s.on_behalf_of_id)
                if i
            }
            | {c.author_id for c in comments}
        )
        people = self._org.people(ids)
        samples = self._repo.samples_for([claim.id])
        summary = self._summary(principal, claim, people, samples)
        receipts = self._receipts.info({ln.receipt_id for ln in claim.lines if ln.receipt_id})
        sample = samples.get(claim.id)
        return ClaimDetail(
            **summary.model_dump(),
            required_levels=list(claim.required_levels or []),
            round=claim.round,
            policy_version_id=claim.policy_version_id,
            auto_approved=claim.auto_approved,
            paid_at=claim.paid_at,
            payout_batch_id=claim.payout_batch_id,
            updated_at=claim.updated_at,
            rejection_reasons=[
                f.reason for ln in claim.lines for f in ln.findings if f.outcome == "REJECT"
            ],
            lines=[_line_read(ln, receipts) for ln in claim.lines],
            steps=[_step_read(s, people) for s in claim.steps],
            comments=[
                CommentRead(
                    id=c.id,
                    line_id=c.line_id,
                    author_id=c.author_id,
                    author_name=_name(people, c.author_id),
                    body=c.body,
                    created_at=c.created_at,
                )
                for c in comments
            ],
            sample_audit=(
                self._sample_read(sample, claim, people)
                if sample and principal.is_finance
                else None
            ),
            allowed_actions=self._allowed_actions(principal, claim),
        )

    def _allowed_actions(self, principal: Principal, claim: Claim) -> list[Action]:
        """Computed here so the UI renders buttons and never re-derives permissions (ARD 8)."""
        actions: list[Action] = []
        if claim.owner_id == principal.id:
            if claim.status == "DRAFT":
                actions += ["edit", "submit", "withdraw"]
            elif claim.status == "SENT_BACK":
                actions += ["edit", "resubmit", "withdraw"]
            elif claim.status == "PENDING_MANAGER" and not self._approved_this_round(claim):
                actions.append("withdraw")
        step = self._current_step(claim)
        if step is not None and self._authority(principal, claim, step) is not None:
            actions += ["approve", "reject", "send_back"]
        if claim.status != "DRAFT":
            actions.append("comment")
        return actions

    @staticmethod
    def _approved_this_round(claim: Claim) -> bool:
        return any(s.round == claim.round and s.status == "APPROVED" for s in claim.steps)

    # ================================================================== claims: read
    def list_claims(
        self,
        principal: Principal,
        page: PageParams,
        *,
        scope: ClaimScope = "mine",
        statuses: Collection[str] | None = None,
        submitted_from: datetime | None = None,
        submitted_to: datetime | None = None,
        q: str | None = None,
    ) -> Page[ClaimSummary]:
        """`mine`: own claims (the only scope an employee has); `team`: direct and indirect
        reports' submitted claims; `all`: finance only."""
        if scope == "mine":
            owners: Collection[str] | None = [principal.id]
        elif scope == "team":
            owners = sorted(self._org.subordinate_ids(principal.id))
            statuses = [s for s in (statuses or _ALL) if s != "DRAFT"]
        else:
            if not principal.is_finance:
                raise PermissionDeniedError("Finance role required.")
            owners = None
            statuses = [s for s in (statuses or _ALL) if s != "DRAFT"]
        rows, total = self._repo.page(
            ClaimFilter(
                owner_ids=owners,
                statuses=statuses,
                submitted_from=submitted_from,
                submitted_to=submitted_to,
                q=q,
            ),
            limit=page.limit,
            offset=page.offset,
        )
        return Page[ClaimSummary].of(self._summaries(principal, rows), total, page)

    def get(self, principal: Principal, claim_id: str) -> ClaimDetail:
        return self._detail(principal, self._load(principal, claim_id))

    def timeline(self, principal: Principal, claim_id: str) -> list[TimelineEntry]:
        claim = self._load(principal, claim_id)
        events = self._audit.for_claim(claim.id)
        if not principal.is_finance:  # sample draws stay hidden from claimants (C11)
            events = [e for e in events if not e.action.startswith("sample_audit.")]
        people = self._org.people({i for e in events for i in (e.actor_id, e.on_behalf_of_id) if i})
        return [
            TimelineEntry(
                id=e.id,
                ts=e.ts,
                action=e.action,
                actor_id=e.actor_id,
                actor_name=_name(people, e.actor_id) if e.actor_id else "System",
                on_behalf_of_name=(_name(people, e.on_behalf_of_id) if e.on_behalf_of_id else None),
                before=e.before_json,
                after=e.after_json,
            )
            for e in events
        ]

    def receipt_file(self, principal: Principal, receipt_id: str) -> StoredReceipt:
        """A receipt is readable by its uploader and by anyone who may view a claim using it."""
        stored = self._receipts.stored(receipt_id)
        if stored.owner_id != principal.id and not any(
            self._can_view(principal, c) for c in self._repo.claims_with_receipt(receipt_id)
        ):
            raise NotFoundError("Receipt was not found.", code="RECEIPT_NOT_FOUND")
        self._audit.record(
            actor_id=principal.id,
            action="receipt.downloaded",
            entity_type="receipt",
            entity_id=receipt_id,
        )
        return stored

    # ================================================================== claims: drafts
    def create(self, principal: Principal, data: ClaimCreate) -> ClaimDetail:
        me = self._org.person(principal.id)
        claim = Claim(
            number=self._repo.next_number(self._today().year),
            owner_id=me.id,
            department_id=me.department_id,
            title=data.title,
            status="DRAFT",
            version=1,
            round=0,
            required_levels=[],
        )
        self._repo.add(claim)
        for item in data.lines:
            claim.lines.append(self._new_line(principal, claim, item, len(claim.lines) + 1))
        self._repo.flush()
        self._record(principal.id, "claim.created", claim, after={"title": data.title})
        return self._detail(principal, claim)

    def patch(self, principal: Principal, claim_id: str, data: ClaimPatch) -> ClaimDetail:
        claim = self._editable(principal, claim_id, data.expected_version)
        before = {"title": claim.title}
        claim.title = data.title
        self._repo.flush()
        self._record(
            principal.id, "claim.updated", claim, before=before, after={"title": data.title}
        )
        return self._detail(principal, claim)

    def add_line(self, principal: Principal, claim_id: str, data: LineAdd) -> ClaimDetail:
        claim = self._editable(principal, claim_id, data.expected_version)
        if len(claim.lines) >= 50:
            raise ValidationFailed("A claim can have at most 50 lines.", code="TOO_MANY_LINES")
        position = max((ln.position for ln in claim.lines), default=0) + 1
        line = self._new_line(principal, claim, data, position)
        claim.lines.append(line)
        self._repo.flush()
        self._record(principal.id, "claim.line_added", claim, after=_line_audit(line))
        return self._detail(principal, claim)

    def update_line(
        self, principal: Principal, claim_id: str, line_id: str, data: LineUpdate
    ) -> ClaimDetail:
        claim = self._editable(principal, claim_id, data.expected_version)
        line = _find_line(claim, line_id)
        before = _line_audit(line)
        changes = data.model_dump(exclude_unset=True, exclude={"expected_version"})
        merged = LineCreate.model_validate({**_line_values(line), **changes})
        self._apply_line(principal, line, merged)
        self._repo.flush()
        self._record(
            principal.id, "claim.line_updated", claim, before=before, after=_line_audit(line)
        )
        return self._detail(principal, claim)

    def delete_line(
        self, principal: Principal, claim_id: str, line_id: str, expected_version: int
    ) -> ClaimDetail:
        claim = self._editable(principal, claim_id, expected_version)
        line = _find_line(claim, line_id)
        before = _line_audit(line)
        claim.lines.remove(line)
        self._repo.flush()
        self._record(principal.id, "claim.line_removed", claim, before=before)
        return self._detail(principal, claim)

    def _new_line(
        self, principal: Principal, claim: Claim, data: LineCreate, position: int
    ) -> ClaimLine:
        line = ClaimLine(owner_id=claim.owner_id, position=position, status="DRAFT")
        self._apply_line(principal, line, data)
        return line

    def _apply_line(self, principal: Principal, line: ClaimLine, data: LineCreate) -> None:
        if data.expense_date > self._today():  # ARD C14: no future-dated expenses
            raise ValidationFailed(
                "The expense date cannot be in the future.",
                code="FUTURE_EXPENSE_DATE",
                details={"fields": [{"field": "expense_date", "issue": "in the future"}]},
            )
        self._org.city_tier(data.city_id)  # 400 CITY_NOT_FOUND for an unknown city
        sha256: str | None = None
        if data.receipt_id is not None:
            receipt = self._receipts.info({data.receipt_id}).get(data.receipt_id)
            if receipt is None or receipt.owner_id != principal.id:
                raise NotFoundError("Receipt was not found.", code="RECEIPT_NOT_FOUND")
            sha256 = receipt.sha256
        line.category_code = data.category
        line.description = data.description
        line.vendor = data.vendor.strip()
        line.vendor_norm = normalise_vendor(data.vendor)
        line.amount_paise = data.amount_paise
        line.expense_date = data.expense_date
        line.city_id = data.city_id
        line.nights = data.nights
        line.receipt_id = data.receipt_id
        line.receipt_sha256 = sha256

    def comment(self, principal: Principal, claim_id: str, data: CommentCreate) -> CommentRead:
        claim = self._load(principal, claim_id)
        if claim.status == "DRAFT":
            raise ConflictError(
                "Submit the claim before starting a thread.", code="ILLEGAL_TRANSITION"
            )
        if data.line_id is not None:
            _find_line(claim, data.line_id)
        comment = self._repo.add_comment(
            ClaimComment(
                claim_id=claim.id,
                line_id=data.line_id,
                author_id=principal.id,
                body=data.body,
                created_at=self._now(),
            )
        )
        self._record(principal.id, "claim.commented", claim, after={"line_id": data.line_id})
        return CommentRead(
            id=comment.id,
            line_id=comment.line_id,
            author_id=principal.id,
            author_name=self._org.person(principal.id).full_name,
            body=comment.body,
            created_at=comment.created_at,
        )

    # ================================================================== policy evaluation
    def _evaluate(self, claim: Claim) -> Evaluation:
        snapshot = self._policy.snapshot()
        today = self._today()
        dates = {ln.expense_date for ln in claim.lines}
        window = max(
            (
                int(r.params["window_days"])
                for r in snapshot.rules
                if r.type == SPLIT_RULE_TYPE and r.active
            ),
            default=0,
        )
        inputs = [
            LineInput(
                key=ln.id,
                category=ln.category_code,
                amount_paise=ln.amount_paise,
                expense_date=ln.expense_date,
                vendor=ln.vendor,
                city_tier=self._org.city_tier(ln.city_id),
                nights=ln.nights,
                receipt_sha256=ln.receipt_sha256,
            )
            for ln in claim.lines
        ]
        context = ClaimContext(
            submitted_on=today,
            own_daily_totals=self._repo.own_daily_totals(claim.owner_id, dates, claim.id),
            duplicate_keys=self._repo.duplicate_keys(
                {(ln.vendor_norm, ln.amount_paise, ln.expense_date) for ln in claim.lines},
                claim.id,
            ),
            duplicate_hashes=self._repo.duplicate_hashes(
                {ln.receipt_sha256 for ln in claim.lines if ln.receipt_sha256}, claim.id
            ),
            recent_own_lines=(
                self._repo.recent_own_lines(
                    claim.owner_id,
                    min(dates) - timedelta(days=window),
                    max(dates) + timedelta(days=window),
                    claim.id,
                )
                if window and dates
                else []
            ),
        )
        return self._policy.evaluate(inputs, context, snapshot)

    def preview(self, principal: Principal, claim_id: str) -> PolicyPreview:
        """Advisory findings on a draft; nothing is stored (ARD 5)."""
        claim = self._owned(principal, claim_id)
        if claim.status not in EDITABLE:
            raise ConflictError("Only a draft can be previewed.", code="ILLEGAL_TRANSITION")
        if not claim.lines:
            return PolicyPreview(
                outcome="ROUTE", total_paise=0, payable_paise=0, required_levels=[], lines=[]
            )
        result = self._evaluate(claim)
        return PolicyPreview(
            outcome=result.outcome,
            total_paise=result.total_paise,
            payable_paise=result.payable_paise,
            required_levels=result.required_levels,
            lines=[
                PreviewLine(
                    line_id=r.key,
                    status=r.status,
                    findings=[
                        _finding_read(f.rule_code, f.outcome, f.severity, f.reason, f.details)
                        for f in r.findings
                    ],
                )
                for r in result.lines
            ],
        )

    # ================================================================== submit / resubmit
    def submit(self, principal: Principal, claim_id: str, expected_version: int) -> ClaimDetail:
        return self._submit(principal, claim_id, expected_version, "DRAFT", "claim.submitted")

    def resubmit(self, principal: Principal, claim_id: str, expected_version: int) -> ClaimDetail:
        return self._submit(principal, claim_id, expected_version, "SENT_BACK", "claim.resubmitted")

    def _submit(
        self, principal: Principal, claim_id: str, expected_version: int, source: str, action: str
    ) -> ClaimDetail:
        claim = self._owned(principal, claim_id)
        if claim.status != source:
            raise ConflictError(
                f"A {claim.status} claim cannot be {action.split('.')[1]}.",
                code="ILLEGAL_TRANSITION",
            )
        if not claim.lines:
            raise ValidationFailed("Add at least one line before submitting.", code="NO_LINES")
        for ln in claim.lines:
            if ln.expense_date > self._today():
                raise ValidationFailed(
                    "The expense date cannot be in the future.", code="FUTURE_EXPENSE_DATE"
                )
        self._lock(claim, expected_version)
        result = self._evaluate(claim)
        now = self._now()
        # A new round: earlier open steps are superseded, never deleted (ADR-001 / ARD 6).
        for step in claim.steps:
            if step.status == "PENDING":
                step.status = "SUPERSEDED"
        claim.round += 1
        claim.submitted_at = now
        claim.decided_at = None
        claim.department_id = self._org.person(claim.owner_id).department_id
        claim.policy_version_id = self._policy.snapshot().version_id
        claim.total_paise = result.total_paise
        claim.payable_paise = result.payable_paise
        claim.required_levels = result.required_levels
        claim.auto_approved = False
        by_id = {r.key: r for r in result.lines}
        for ln in claim.lines:
            res = by_id[ln.id]
            ln.status = res.status
            ln.findings.clear()
            ln.findings.extend(
                LineFinding(
                    rule_code=f.rule_code,
                    outcome=f.outcome,
                    severity=f.severity,
                    reason=f.reason,
                    details=f.details,
                    force_level=f.force_level,
                )
                for f in res.findings
            )
        self._record(
            principal.id,
            action,
            claim,
            after={
                "round": claim.round,
                "outcome": result.outcome,
                "total_paise": result.total_paise,
                "payable_paise": result.payable_paise,
                "required_levels": result.required_levels,
                "policy_version_id": claim.policy_version_id,
            },
        )
        if result.outcome == "REJECTED":
            self._set_status(claim, "REJECTED")
            claim.decided_at = now
            claim.current_level = None
            self._record(
                SYSTEM, "claim.auto_rejected", claim, after={"reasons": result.rejection_reasons}
            )
        elif result.outcome == "AUTO_APPROVED":
            self._set_status(claim, "APPROVED")
            claim.decided_at = now
            claim.current_level = None
            claim.auto_approved = True
            self._record(
                SYSTEM,
                "claim.auto_approved",
                claim,
                after={"policy_version_id": claim.policy_version_id},
            )
            self._draw_sample(claim)
        else:
            self._open_level(claim, result.required_levels[0])
        self._repo.flush()
        return self._detail(principal, claim)

    def _draw_sample(self, claim: Claim) -> None:
        """Independent 10% draw per auto-approved claim, same transaction (ARD 6, C11)."""
        rate = self._policy.config_values().sample_audit_rate
        draw = self._rng.random()
        selected = draw < rate
        if selected:
            sample = self._repo.add_sample(
                SampleAudit(claim_id=claim.id, selected_at=self._now(), draw_value=draw, rate=rate)
            )
            entity_id = sample.id
        else:
            entity_id = claim.id
        self._record(
            SYSTEM,
            "sample_audit.drawn",
            claim,
            entity_type="sample_audit" if selected else "claim",
            entity_id=entity_id,
            after={"draw_value": draw, "rate": rate, "selected": selected},
        )

    def _open_level(self, claim: Claim, level_no: int) -> ApprovalStep:
        """Create the single open step for `level_no` and move the claim to its PENDING state."""
        role = self._policy.level_roles()[level_no]
        owner = self._org.person(claim.owner_id)
        assignee = chain.resolve_assignee(
            role=role,
            level_no=level_no,
            owner=owner,
            owner_ancestors=self._org.ancestors(owner.id),
            heads=self._org.with_role("FINANCE_HEAD"),
            acted_ids=self._acted_ids(claim),
            delegations=self._active_delegations(),
        )
        step = ApprovalStep(
            claim_id=claim.id,
            round=claim.round,
            level_no=level_no,
            role=role,
            assigned_to_id=assignee,
            status="PENDING",
            created_at=self._now(),
        )
        claim.steps.append(step)
        claim.current_level = level_no
        self._set_status(claim, STATUS_FOR_ROLE[role])
        self._repo.flush()
        self._record(
            SYSTEM,
            "approval.step_opened",
            claim,
            entity_type="approval_step",
            entity_id=step.id,
            after={"level_no": level_no, "role": role, "assigned_to_id": assignee},
        )
        if assignee is None and role not in chain.POOL_ROLES:
            # Nobody may act (e.g. the finance head's own claim and no delegate): flag it.
            self._record(
                SYSTEM,
                "approval.needs_reassignment",
                claim,
                entity_type="approval_step",
                entity_id=step.id,
                after={"level_no": level_no, "role": role},
            )
        return step

    def withdraw(self, principal: Principal, claim_id: str, expected_version: int) -> ClaimDetail:
        claim = self._owned(principal, claim_id)
        allowed = claim.status in EDITABLE or (
            claim.status == "PENDING_MANAGER" and not self._approved_this_round(claim)
        )
        if not allowed:
            raise ConflictError(
                f"A {claim.status} claim cannot be withdrawn.", code="ILLEGAL_TRANSITION"
            )
        self._lock(claim, expected_version)
        before = claim.status
        for step in claim.steps:
            if step.status == "PENDING":
                step.status = "SUPERSEDED"
        self._set_status(claim, "WITHDRAWN")
        claim.current_level = None
        claim.decided_at = self._now()
        self._repo.flush()
        self._record(principal.id, "claim.withdrawn", claim, before={"status": before})
        return self._detail(principal, claim)

    # ================================================================== approvals
    def _authority(
        self, principal: Principal, claim: Claim, step: ApprovalStep
    ) -> chain.Authority | None:
        actor = self._org.people([principal.id]).get(principal.id)
        if actor is None:
            return None
        return chain.authority(
            actor=actor,
            owner_id=claim.owner_id,
            step_role=step.role,
            step_level=step.level_no,
            assigned_to_id=step.assigned_to_id,
            acted_ids=self._acted_ids(claim),
            delegations=self._active_delegations(),
        )

    def _actionable(
        self, principal: Principal, step_id: str, expected_version: int
    ) -> tuple[Claim, ApprovalStep, chain.Authority]:
        step = self._repo.get_step(step_id)
        if step is None:
            raise NotFoundError("Approval step was not found.", code="STEP_NOT_FOUND")
        claim = self._load(principal, step.claim_id)
        # Only the single open step is actionable (ARD C5): anything else is 409.
        if self._current_step(claim) is not step:
            raise ConflictError("This step is not open for a decision.", code="STEP_NOT_ACTIONABLE")
        authority = self._authority(principal, claim, step)
        if authority is None:
            raise PermissionDeniedError("You cannot act on this step.", code="NOT_YOUR_STEP")
        self._lock(claim, expected_version)
        return claim, step, authority

    def _decide(
        self,
        principal: Principal,
        claim: Claim,
        step: ApprovalStep,
        authority: chain.Authority,
        decision: str,
        comment: str | None,
    ) -> None:
        step.status = decision
        step.acted_by_id = principal.id
        step.on_behalf_of_id = authority.on_behalf_of_id
        step.acted_at = self._now()
        step.comment = comment
        self._record(
            principal.id,
            f"approval.{decision.lower()}",
            claim,
            entity_type="approval_step",
            entity_id=step.id,
            on_behalf_of_id=authority.on_behalf_of_id,
            after={"level_no": step.level_no, "comment": comment},
        )

    def _approve(
        self,
        principal: Principal,
        claim: Claim,
        step: ApprovalStep,
        authority: chain.Authority,
        comment: str | None,
    ) -> None:
        self._decide(principal, claim, step, authority, "APPROVED", comment)
        later = [lv for lv in claim.required_levels or [] if lv > step.level_no]
        if later:
            self._open_level(claim, later[0])
            return
        self._set_status(claim, "APPROVED")
        claim.current_level = None
        claim.decided_at = self._now()
        for ln in claim.lines:
            if ln.status in ("AUTO_APPROVED", "NEEDS_APPROVAL"):
                ln.status = "APPROVED"
        self._record(
            principal.id, "claim.approved", claim, on_behalf_of_id=authority.on_behalf_of_id
        )

    def approve(self, principal: Principal, step_id: str, data: ApproveRequest) -> ClaimDetail:
        claim, step, authority = self._actionable(principal, step_id, data.expected_version)
        self._approve(principal, claim, step, authority, data.comment)
        self._repo.flush()
        return self._detail(principal, claim)

    def reject(self, principal: Principal, step_id: str, data: RejectRequest) -> ClaimDetail:
        claim, step, authority = self._actionable(principal, step_id, data.expected_version)
        self._decide(principal, claim, step, authority, "REJECTED", data.comment)
        self._set_status(claim, "REJECTED")
        claim.current_level = None
        claim.decided_at = self._now()
        for ln in claim.lines:
            ln.status = "REJECTED"
        self._record(
            principal.id,
            "claim.rejected",
            claim,
            on_behalf_of_id=authority.on_behalf_of_id,
            after={"comment": data.comment},
        )
        self._repo.flush()
        return self._detail(principal, claim)

    def send_back(self, principal: Principal, step_id: str, data: SendBackRequest) -> ClaimDetail:
        claim, step, authority = self._actionable(principal, step_id, data.expected_version)
        for line_id in data.line_ids:
            _find_line(claim, line_id)
        self._decide(principal, claim, step, authority, "SENT_BACK", data.comment)
        self._set_status(claim, "SENT_BACK")
        claim.current_level = None
        self._repo.add_comment(
            ClaimComment(
                claim_id=claim.id,
                line_id=data.line_ids[0] if len(data.line_ids) == 1 else None,
                author_id=principal.id,
                body=data.comment,
                created_at=self._now(),
            )
        )
        self._record(
            principal.id,
            "claim.sent_back",
            claim,
            on_behalf_of_id=authority.on_behalf_of_id,
            after={"comment": data.comment, "line_ids": data.line_ids},
        )
        self._repo.flush()
        return self._detail(principal, claim)

    def inbox(self, principal: Principal, page: PageParams) -> Page[InboxItem]:
        """Open steps the caller may act on: assigned, delegated to them, or the auditor pool."""
        steps = self._repo.pending_steps()
        claims = {c.id: c for c in self._repo.get_many({s.claim_id for s in steps})}
        actionable: list[tuple[Claim, ApprovalStep, chain.Authority]] = []
        for step in steps:
            claim = claims.get(step.claim_id)
            if claim is None or self._current_step(claim) is not step:
                continue
            auth = self._authority(principal, claim, step)
            if auth is not None:
                actionable.append((claim, step, auth))
        window = actionable[page.offset : page.offset + page.limit]
        summaries = self._summaries(principal, [c for c, _, _ in window])
        people = self._org.people({a.on_behalf_of_id for _, _, a in window if a.on_behalf_of_id})
        items = [
            InboxItem(
                **summary.model_dump(),
                step_id=step.id,
                delegated_from_id=auth.on_behalf_of_id,
                delegated_from_name=(
                    _name(people, auth.on_behalf_of_id) if auth.on_behalf_of_id else None
                ),
            )
            for summary, (_, step, auth) in zip(summaries, window, strict=True)
        ]
        return Page[InboxItem].of(items, len(actionable), page)

    def reassign(self, principal: Principal, step_id: str, assignee_id: str) -> ClaimDetail:
        """Finance head moves an open step to another eligible approver (runbook action)."""
        if not principal.is_head:
            raise PermissionDeniedError("Finance head role required.")
        step = self._repo.get_step(step_id)
        if step is None:
            raise NotFoundError("Approval step was not found.", code="STEP_NOT_FOUND")
        claim = self._load(principal, step.claim_id)
        if self._current_step(claim) is not step:
            raise ConflictError("This step is not open.", code="STEP_NOT_ACTIONABLE")
        if claim.owner_id == principal.id:
            raise PermissionDeniedError("You cannot reassign a step on your own claim.")
        target = self._org.person(assignee_id)
        if (
            target.id == claim.owner_id
            or target.id in self._acted_ids(claim)
            or not target.is_active
            or rank(target.role) < rank(step.role)
        ):
            raise ValidationFailed(
                "That person cannot approve this step.", code="INELIGIBLE_ASSIGNEE"
            )
        before = {"assigned_to_id": step.assigned_to_id}
        step.assigned_to_id = target.id
        self._repo.flush()
        self._record(
            principal.id,
            "approval.reassigned",
            claim,
            entity_type="approval_step",
            entity_id=step.id,
            before=before,
            after={"assigned_to_id": target.id},
        )
        return self._detail(principal, claim)

    # ================================================================== auditor workflows
    def review_queue(
        self, principal: Principal, f: ReviewFilter, page: PageParams
    ) -> Page[ClaimSummary]:
        """Claims at the auditor level, or approved claims waiting on a sample audit."""
        if not principal.is_finance:
            raise PermissionDeniedError("Finance role required.")
        if f.sample_audit:
            claim_ids: Collection[str] | None = self._repo.pending_sample_claim_ids()
            statuses: Collection[str] = ["APPROVED"]
        else:
            claim_ids, statuses = None, ["PENDING_AUDITOR"]
        rows, total = self._repo.page(
            ClaimFilter(
                owner_ids=[f.owner_id] if f.owner_id else None,
                statuses=statuses,
                claim_ids=claim_ids,
                department_id=f.department_id,
                category=f.category,
                min_payable_paise=f.min_payable_paise,
                max_payable_paise=f.max_payable_paise,
                submitted_from=f.submitted_from,
                submitted_to=f.submitted_to,
                rule_code=f.rule_code,
                q=f.q,
            ),
            limit=page.limit,
            offset=page.offset,
            oldest_first=True,
        )
        return Page[ClaimSummary].of(self._summaries(principal, rows), total, page)

    def bulk_approve(self, principal: Principal, data: BulkApproveRequest) -> BulkApproveResult:
        """Auditor-level steps only; risky claims are skipped for individual review (C10)."""
        if not principal.is_finance:
            raise PermissionDeniedError("Finance role required.")
        claims = {c.id: c for c in self._repo.get_many({i.claim_id for i in data.items})}
        results = [
            self._bulk_one(
                principal, claims.get(i.claim_id), i.claim_id, i.expected_version, data.comment
            )
            for i in data.items
        ]
        return BulkApproveResult(
            approved=sum(r.result == "APPROVED" for r in results),
            skipped=sum(r.result == "SKIPPED" for r in results),
            failed=sum(r.result == "FAILED" for r in results),
            results=results,
        )

    def _bulk_one(
        self,
        principal: Principal,
        claim: Claim | None,
        claim_id: str,
        expected_version: int,
        comment: str | None,
    ) -> BulkItemResult:
        def skip(reason: str) -> BulkItemResult:
            return BulkItemResult(claim_id=claim_id, result="SKIPPED", reason=reason)

        if claim is None:
            return skip("Claim was not found.")
        step = self._current_step(claim)
        if step is None or step.role != "AUDITOR":
            return skip("Not at the auditor level.")
        findings = [f for ln in claim.lines for f in ln.findings]
        if any(f.rule_code == DUPLICATE_RULE for f in findings):
            return skip("Has a duplicate finding; review individually.")
        if any(f.severity == "high" for f in findings):
            return skip("Has a high-severity flag; review individually.")
        if claim.version != expected_version:
            return skip("The claim changed since it was loaded.")
        authority = self._authority(principal, claim, step)
        if authority is None:
            return skip("You cannot act on this step.")
        try:
            with self._repo.savepoint():
                self._lock(claim, expected_version)
                self._approve(principal, claim, step, authority, comment)
                self._repo.flush()
        except ConflictError as exc:
            return BulkItemResult(claim_id=claim_id, result="FAILED", reason=exc.message)
        return BulkItemResult(claim_id=claim_id, result="APPROVED", reason=None)

    def sample_audits(
        self, principal: Principal, status: str | None, page: PageParams
    ) -> Page[SampleAuditRead]:
        if not principal.is_finance:
            raise PermissionDeniedError("Finance role required.")
        rows, total = self._repo.samples_page(status, limit=page.limit, offset=page.offset)
        claims = {c.id: c for c in self._repo.get_many({s.claim_id for s in rows})}
        people = self._org.people({c.owner_id for c in claims.values()})
        return Page[SampleAuditRead].of(
            [self._sample_read(s, claims[s.claim_id], people) for s in rows], total, page
        )

    def resolve_sample(
        self, principal: Principal, sample_id: str, data: SampleResolve
    ) -> SampleAuditRead:
        if not principal.is_finance:
            raise PermissionDeniedError("Finance role required.")
        sample = self._repo.get_sample(sample_id)
        if sample is None:
            raise NotFoundError("Sample audit was not found.", code="SAMPLE_NOT_FOUND")
        claim = self._load(principal, sample.claim_id)
        if sample.status != "PENDING":
            raise ConflictError("This sample audit is already resolved.", code="SAMPLE_RESOLVED")
        if claim.owner_id == principal.id:
            raise PermissionDeniedError("You cannot audit your own claim.")
        if data.result == "FAILED" and not data.note:
            raise ValidationFailed("Say why the sample failed.", code="NOTE_REQUIRED")
        sample.status = data.result
        sample.reviewer_id = principal.id
        sample.outcome_note = data.note
        sample.resolved_at = self._now()
        self._record(
            principal.id,
            f"sample_audit.{data.result.lower()}",
            claim,
            entity_type="sample_audit",
            entity_id=sample.id,
            after={"note": data.note},
        )
        if data.result == "FAILED":
            # Transition 16: reopen the auto-approved claim at the auditor level.
            self._repo.bump_version(claim.id, claim.version)
            claim.version += 1
            claim.round += 1
            claim.auto_approved = False
            claim.decided_at = None
            auditor_levels = [
                lv for lv, role in self._policy.level_roles().items() if role == "AUDITOR"
            ]
            claim.required_levels = auditor_levels[:1]
            self._open_level(claim, auditor_levels[0])
            if data.note:
                self._repo.add_comment(
                    ClaimComment(
                        claim_id=claim.id,
                        author_id=principal.id,
                        body=data.note,
                        created_at=self._now(),
                    )
                )
        self._repo.flush()
        people = self._org.people({claim.owner_id})
        return self._sample_read(sample, claim, people)

    # ================================================================== delegation
    def delegations(self, principal: Principal) -> list[DelegationRead]:
        rows = self._repo.delegations_for(principal.id)
        return self._delegation_reads(rows)

    def _delegation_reads(self, rows: Iterable[Delegation]) -> list[DelegationRead]:
        rows = list(rows)
        people = self._org.people({i for d in rows for i in (d.delegator_id, d.delegate_id)})
        now = self._now()
        return [
            DelegationRead(
                id=d.id,
                delegator_id=d.delegator_id,
                delegator_name=_name(people, d.delegator_id),
                delegate_id=d.delegate_id,
                delegate_name=_name(people, d.delegate_id),
                level_no=d.level_no,
                starts_at=d.starts_at,
                ends_at=d.ends_at,
                revoked_at=d.revoked_at,
                is_active=chain.is_active_at(d.starts_at, d.ends_at, d.revoked_at, now),
            )
            for d in rows
        ]

    def create_delegation(self, principal: Principal, data: DelegationCreate) -> DelegationRead:
        """Leave cover (ARD 6.4, C4): time-boxed, per level, one active per approver+level."""
        me = self._org.person(principal.id)
        level_role = self._policy.level_roles().get(data.level_no)
        if level_role is None:
            raise ValidationFailed("Unknown approval level.", code="LEVEL_NOT_FOUND")
        can_hold = me.role in APPROVER_ROLES and rank(me.role) >= rank(level_role)
        if not can_hold:
            raise PermissionDeniedError("You do not approve at this level.", code="NOT_AN_APPROVER")
        delegate = self._org.person(data.delegate_id)
        if delegate.id == me.id or not delegate.is_active:
            raise ValidationFailed("Choose another, active colleague.", code="INVALID_DELEGATE")
        if not chain.delegate_may_cover(delegate.role, level_role):
            raise ValidationFailed(
                "The delegate must hold the same or a higher role.", code="DELEGATE_ROLE_TOO_LOW"
            )
        starts, ends = data.starts_at, data.ends_at
        max_days = self._policy.config_values().delegation_max_days
        if ends <= starts or ends <= self._now():
            raise ValidationFailed(
                "The end must be after the start and in the future.", code="INVALID_RANGE"
            )
        if ends - starts > timedelta(days=max_days):
            raise ValidationFailed(
                f"A delegation can last at most {max_days} days.", code="DELEGATION_TOO_LONG"
            )
        overlapping = [
            d
            for d in self._repo.delegations_for(me.id)
            if d.delegator_id == me.id
            and d.level_no == data.level_no
            and d.revoked_at is None
            and d.starts_at < ends
            and starts < d.ends_at
        ]
        if overlapping:
            raise ConflictError(
                "You already have a delegation for this level in that period.",
                code="DELEGATION_EXISTS",
            )
        row = self._repo.add_delegation(
            Delegation(
                delegator_id=me.id,
                delegate_id=delegate.id,
                level_no=data.level_no,
                starts_at=starts,
                ends_at=ends,
                created_at=self._now(),
            )
        )
        self._audit.record(
            actor_id=me.id,
            action="delegation.created",
            entity_type="delegation",
            entity_id=row.id,
            after={
                "delegate_id": delegate.id,
                "level_no": data.level_no,
                "starts_at": starts.isoformat(),
                "ends_at": ends.isoformat(),
            },
        )
        return self._delegation_reads([row])[0]

    def revoke_delegation(self, principal: Principal, delegation_id: str) -> DelegationRead:
        row = self._repo.get_delegation(delegation_id)
        if row is None or row.delegator_id != principal.id:
            raise NotFoundError("Delegation was not found.", code="DELEGATION_NOT_FOUND")
        if row.revoked_at is None:
            row.revoked_at = self._now()
            self._repo.flush()
            self._audit.record(
                actor_id=principal.id,
                action="delegation.revoked",
                entity_type="delegation",
                entity_id=row.id,
            )
        return self._delegation_reads([row])[0]

    # ================================================================== payouts support
    def payable_claims(self) -> list[PayableClaim]:
        """APPROVED, not in a batch, payable > 0, no pending sample audit (ARD 10.1)."""
        return [
            PayableClaim(c.id, c.number, c.owner_id, c.payable_paise, c.decided_at)
            for c in self._repo.payable()
        ]

    def attach_to_batch(self, claim_ids: Collection[str], batch_id: str) -> list[PayableClaim]:
        eligible = {c.id: c for c in self._repo.payable()}
        missing = [i for i in claim_ids if i not in eligible]
        if missing:
            raise ConflictError(
                "Some claims are not eligible for payout.",
                code="CLAIM_NOT_PAYABLE",
                details={"claim_ids": missing},
            )
        chosen = [eligible[i] for i in claim_ids]
        for claim in chosen:
            claim.payout_batch_id = batch_id
        self._repo.flush()
        return [
            PayableClaim(c.id, c.number, c.owner_id, c.payable_paise, c.decided_at) for c in chosen
        ]

    def claims_in_batch(self, batch_id: str) -> list[PayableClaim]:
        return [
            PayableClaim(c.id, c.number, c.owner_id, c.payable_paise, c.decided_at)
            for c in self._repo.in_batch(batch_id)
        ]

    def detach_batch(self, batch_id: str) -> None:
        for claim in self._repo.in_batch(batch_id):
            claim.payout_batch_id = None
        self._repo.flush()

    def mark_paid(self, actor_id: str, batch_id: str, batch_number: str) -> int:
        """All claims of an exported batch move to PAID in the caller's transaction."""
        now = self._now()
        claims = self._repo.in_batch(batch_id)
        for claim in claims:
            self._repo.bump_version(claim.id, claim.version)
            claim.version += 1
            self._set_status(claim, "PAID")
            claim.paid_at = now
            self._record(actor_id, "claim.paid", claim, after={"batch_no": batch_number})
        self._repo.flush()
        return len(claims)

    # ================================================================== reporting support
    def pending_steps(self) -> list[PendingStepInfo]:
        return [
            PendingStepInfo(s.level_no, s.role, s.created_at) for s in self._repo.pending_steps()
        ]

    # Read-only aggregates for the reports module (ARD 10 dashboard widgets).
    def spend_rows(
        self, owner_ids: Collection[str] | None, since: date, until: date
    ) -> list[tuple[str, str, date, int]]:
        return self._repo.spend_rows(owner_ids, since, until)

    def submitted_line_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[str, str, str]]:
        return self._repo.submitted_line_rows(owner_ids, since, until)

    def finding_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[str, str, str]]:
        return self._repo.finding_rows(owner_ids, since, until)

    def decision_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[datetime, datetime, bool]]:
        return self._repo.decision_rows(owner_ids, since, until)

    def sample_counts(self) -> dict[str, int]:
        return self._repo.sample_counts()


_ALL = (
    "DRAFT",
    "PENDING_MANAGER",
    "PENDING_AUDITOR",
    "PENDING_HEAD",
    "SENT_BACK",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    "PAID",
)


# ====================================================================== module helpers
def _name(people: dict[str, Person], user_id: str | None) -> str:
    person = people.get(user_id or "")
    return person.full_name if person else "Unknown"


def _find_line(claim: Claim, line_id: str) -> ClaimLine:
    for line in claim.lines:
        if line.id == line_id:
            return line
    raise NotFoundError("Line was not found.", code="LINE_NOT_FOUND")


def _line_values(line: ClaimLine) -> dict[str, Any]:
    return {
        "category": line.category_code,
        "description": line.description,
        "vendor": line.vendor,
        "amount_paise": line.amount_paise,
        "expense_date": line.expense_date,
        "city_id": line.city_id,
        "nights": line.nights,
        "receipt_id": line.receipt_id,
    }


def _line_audit(line: ClaimLine) -> dict[str, Any]:
    values = _line_values(line)
    values["expense_date"] = line.expense_date.isoformat()
    values["line_id"] = line.id
    return values


def _finding_read(
    rule_code: str, outcome: str, severity: str, reason: str, details: dict[str, Any]
) -> FindingRead:
    return FindingRead.model_validate(
        {
            "rule_code": rule_code,
            "outcome": outcome,
            "severity": severity,
            "reason": reason,
            "details": details,
        }
    )


def _line_read(line: ClaimLine, receipts: dict[str, StoredReceipt]) -> LineRead:
    receipt = receipts.get(line.receipt_id or "")
    return LineRead(
        id=line.id,
        position=line.position,
        category=line.category_code,  # type: ignore[arg-type]
        description=line.description,
        vendor=line.vendor,
        amount_paise=line.amount_paise,
        expense_date=line.expense_date,
        city_id=line.city_id,
        nights=line.nights,
        status=line.status,  # type: ignore[arg-type]
        receipt=(
            ReceiptMeta(id=receipt.id, mime=receipt.mime, original_name=receipt.original_name)
            if receipt
            else None
        ),
        findings=[
            _finding_read(f.rule_code, f.outcome, f.severity, f.reason, f.details)
            for f in line.findings
        ],
    )


def _step_read(step: ApprovalStep, people: dict[str, Person]) -> StepRead:
    def nm(uid: str | None) -> str | None:
        return _name(people, uid) if uid else None

    return StepRead(
        id=step.id,
        round=step.round,
        level_no=step.level_no,
        role=step.role,  # type: ignore[arg-type]
        status=step.status,  # type: ignore[arg-type]
        assigned_to_id=step.assigned_to_id,
        assigned_to_name=nm(step.assigned_to_id),
        acted_by_id=step.acted_by_id,
        acted_by_name=nm(step.acted_by_id),
        on_behalf_of_id=step.on_behalf_of_id,
        on_behalf_of_name=nm(step.on_behalf_of_id),
        comment=step.comment,
        created_at=step.created_at,
        acted_at=step.acted_at,
    )


def claims_service(
    session: Any,
    audit: AuditService,
    org: OrgService,
    policy: PolicyService,
    receipts: ReceiptService,
    now: Clock = utcnow,
    rng: random.Random | None = None,
) -> ClaimsService:
    """Factory for other modules and scripts (they may not import the repository)."""
    return ClaimsService(ClaimsRepository(session), audit, org, policy, receipts, now, rng)
