"""All database access for claims, lines, findings, steps, comments, delegations and sample
audits. SQLAlchemy constructs only (PostgreSQL-ready)."""

from collections.abc import Collection
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.modules.claims.models import (
    ApprovalStep,
    Claim,
    ClaimComment,
    ClaimLine,
    Delegation,
    LineFinding,
    SampleAudit,
)

NOT_SUBMITTED = ("DRAFT", "WITHDRAWN")
REJECTED_LINE = ("AUTO_REJECTED", "REJECTED", "DRAFT")


@dataclass(frozen=True)
class ClaimFilter:
    owner_ids: Collection[str] | None = None
    statuses: Collection[str] | None = None
    claim_ids: Collection[str] | None = None
    department_id: str | None = None
    category: str | None = None
    min_payable_paise: int | None = None
    max_payable_paise: int | None = None
    submitted_from: datetime | None = None
    submitted_to: datetime | None = None
    rule_code: str | None = None
    q: str | None = None


def _eager(stmt: Select[tuple[Claim]]) -> Select[tuple[Claim]]:
    return stmt.options(
        selectinload(Claim.lines).selectinload(ClaimLine.findings),
        selectinload(Claim.steps),
    )


class ClaimsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------ claims
    def get(self, claim_id: str) -> Claim | None:
        return self._session.execute(_eager(select(Claim).where(Claim.id == claim_id))).scalar_one_or_none()

    def get_many(self, claim_ids: Collection[str]) -> list[Claim]:
        if not claim_ids:
            return []
        return list(self._session.execute(_eager(select(Claim).where(Claim.id.in_(claim_ids)))).scalars())

    def add(self, claim: Claim) -> Claim:
        self._session.add(claim)
        self._session.flush()
        return claim

    def flush(self) -> None:
        self._session.flush()

    def refresh(self, claim: Claim) -> None:
        self._session.refresh(claim)

    def next_number(self, year: int) -> str:
        prefix = f"EF-{year}-"
        count = self._session.execute(
            select(func.count()).select_from(Claim).where(Claim.number.like(f"{prefix}%"))
        ).scalar_one()
        return f"{prefix}{count + 1:06d}"

    def bump_version(self, claim_id: str, expected: int) -> bool:
        """Optimistic lock (ARD 7): UPDATE ... WHERE id=? AND version=?; False if stale."""
        result = self._session.execute(
            update(Claim)
            .where(Claim.id == claim_id, Claim.version == expected)
            .values(version=expected + 1)
            .execution_options(synchronize_session=False)
        )
        return bool(getattr(result, "rowcount", 0) == 1)

    def _filtered(self, f: ClaimFilter) -> Select[tuple[Claim]]:
        stmt = select(Claim)
        if f.owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(f.owner_ids))
        if f.statuses:
            stmt = stmt.where(Claim.status.in_(f.statuses))
        if f.claim_ids is not None:
            stmt = stmt.where(Claim.id.in_(f.claim_ids))
        if f.department_id:
            stmt = stmt.where(Claim.department_id == f.department_id)
        if f.min_payable_paise is not None:
            stmt = stmt.where(Claim.payable_paise >= f.min_payable_paise)
        if f.max_payable_paise is not None:
            stmt = stmt.where(Claim.payable_paise <= f.max_payable_paise)
        if f.submitted_from is not None:
            stmt = stmt.where(Claim.submitted_at >= f.submitted_from)
        if f.submitted_to is not None:
            stmt = stmt.where(Claim.submitted_at <= f.submitted_to)
        if f.category:
            stmt = stmt.where(
                Claim.id.in_(select(ClaimLine.claim_id).where(ClaimLine.category_code == f.category))
            )
        if f.rule_code:
            stmt = stmt.where(
                Claim.id.in_(
                    select(ClaimLine.claim_id)
                    .join(LineFinding, LineFinding.line_id == ClaimLine.id)
                    .where(LineFinding.rule_code == f.rule_code)
                )
            )
        if f.q:
            like = f"%{f.q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(Claim.title).like(like), func.lower(Claim.number).like(like)))
        return stmt

    def page(
        self, f: ClaimFilter, *, limit: int, offset: int, oldest_first: bool = False
    ) -> tuple[list[Claim], int]:
        stmt = self._filtered(f)
        total = self._session.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
        order = (
            (Claim.submitted_at.asc(), Claim.id)
            if oldest_first
            else (Claim.updated_at.desc(), Claim.id)
        )
        rows = self._session.execute(_eager(stmt.order_by(*order).limit(limit).offset(offset))).scalars()
        return list(rows), total

    # ------------------------------------------------------------------ policy context lookups
    def own_daily_totals(
        self, owner_id: str, dates: Collection[date], exclude_claim_id: str
    ) -> dict[tuple[str, date], int]:
        if not dates:
            return {}
        rows = self._session.execute(
            select(ClaimLine.category_code, ClaimLine.expense_date, func.sum(ClaimLine.amount_paise))
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(
                ClaimLine.owner_id == owner_id,
                ClaimLine.expense_date.in_(dates),
                ClaimLine.claim_id != exclude_claim_id,
                ClaimLine.status.not_in(REJECTED_LINE),
                Claim.status.not_in(NOT_SUBMITTED),
            )
            .group_by(ClaimLine.category_code, ClaimLine.expense_date)
        ).all()
        return {(r[0], r[1]): int(r[2]) for r in rows}

    def duplicate_keys(
        self, keys: Collection[tuple[str, int, date]], exclude_claim_id: str
    ) -> set[tuple[str, int, date]]:
        if not keys:
            return set()
        vendors = {k[0] for k in keys}
        rows = self._session.execute(
            select(ClaimLine.vendor_norm, ClaimLine.amount_paise, ClaimLine.expense_date)
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(
                ClaimLine.vendor_norm.in_(vendors),
                ClaimLine.claim_id != exclude_claim_id,
                ClaimLine.status.not_in(REJECTED_LINE),
                Claim.status.not_in(NOT_SUBMITTED),
            )
        ).all()
        found = {(r[0], int(r[1]), r[2]) for r in rows}
        return found & set(keys)

    def duplicate_hashes(self, hashes: Collection[str], exclude_claim_id: str) -> set[str]:
        if not hashes:
            return set()
        rows = self._session.execute(
            select(ClaimLine.receipt_sha256)
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(
                ClaimLine.receipt_sha256.in_(hashes),
                ClaimLine.claim_id != exclude_claim_id,
                ClaimLine.status.not_in(REJECTED_LINE),
                Claim.status.not_in(NOT_SUBMITTED),
            )
        ).scalars()
        return {h for h in rows if h is not None}

    def recent_own_lines(
        self, owner_id: str, since: date, until: date, exclude_claim_id: str
    ) -> list[tuple[str, str, int, date]]:
        rows = self._session.execute(
            select(
                ClaimLine.vendor_norm,
                ClaimLine.category_code,
                ClaimLine.amount_paise,
                ClaimLine.expense_date,
            )
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(
                ClaimLine.owner_id == owner_id,
                ClaimLine.expense_date >= since,
                ClaimLine.expense_date <= until,
                ClaimLine.claim_id != exclude_claim_id,
                ClaimLine.status.not_in(REJECTED_LINE),
                Claim.status.not_in(NOT_SUBMITTED),
            )
        ).all()
        return [(r[0], r[1], int(r[2]), r[3]) for r in rows]

    # ------------------------------------------------------------------ steps
    def get_step(self, step_id: str) -> ApprovalStep | None:
        return self._session.get(ApprovalStep, step_id)

    def pending_steps(self) -> list[ApprovalStep]:
        return list(
            self._session.execute(
                select(ApprovalStep)
                .where(ApprovalStep.status == "PENDING")
                .order_by(ApprovalStep.created_at, ApprovalStep.id)
            ).scalars()
        )

    # ------------------------------------------------------------------ comments
    def add_comment(self, comment: ClaimComment) -> ClaimComment:
        self._session.add(comment)
        self._session.flush()
        return comment

    def comments(self, claim_id: str) -> list[ClaimComment]:
        return list(
            self._session.execute(
                select(ClaimComment)
                .where(ClaimComment.claim_id == claim_id)
                .order_by(ClaimComment.created_at, ClaimComment.id)
            ).scalars()
        )

    # ------------------------------------------------------------------ delegations
    def add_delegation(self, delegation: Delegation) -> Delegation:
        self._session.add(delegation)
        self._session.flush()
        return delegation

    def get_delegation(self, delegation_id: str) -> Delegation | None:
        return self._session.get(Delegation, delegation_id)

    def delegations_for(self, user_id: str) -> list[Delegation]:
        return list(
            self._session.execute(
                select(Delegation)
                .where(or_(Delegation.delegator_id == user_id, Delegation.delegate_id == user_id))
                .order_by(Delegation.starts_at.desc())
            ).scalars()
        )

    def active_delegations(self, at: datetime) -> list[Delegation]:
        return list(
            self._session.execute(
                select(Delegation).where(
                    Delegation.revoked_at.is_(None),
                    Delegation.starts_at <= at,
                    Delegation.ends_at > at,
                )
            ).scalars()
        )

    # ------------------------------------------------------------------ sample audits
    def add_sample(self, sample: SampleAudit) -> SampleAudit:
        self._session.add(sample)
        self._session.flush()
        return sample

    def get_sample(self, sample_id: str) -> SampleAudit | None:
        return self._session.get(SampleAudit, sample_id)

    def samples_for(self, claim_ids: Collection[str]) -> dict[str, SampleAudit]:
        if not claim_ids:
            return {}
        rows = self._session.execute(
            select(SampleAudit).where(SampleAudit.claim_id.in_(claim_ids))
        ).scalars()
        return {s.claim_id: s for s in rows}

    def samples_page(
        self, status: str | None, *, limit: int, offset: int
    ) -> tuple[list[SampleAudit], int]:
        stmt = select(SampleAudit)
        if status:
            stmt = stmt.where(SampleAudit.status == status)
        total = self._session.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
        rows = self._session.execute(
            stmt.order_by(SampleAudit.selected_at, SampleAudit.id).limit(limit).offset(offset)
        ).scalars()
        return list(rows), total

    def pending_sample_claim_ids(self) -> set[str]:
        return set(
            self._session.execute(
                select(SampleAudit.claim_id).where(SampleAudit.status == "PENDING")
            ).scalars()
        )

    def sample_counts(self) -> dict[str, int]:
        rows = self._session.execute(
            select(SampleAudit.status, func.count()).group_by(SampleAudit.status)
        ).all()
        return {r[0]: int(r[1]) for r in rows}

    # ------------------------------------------------------------------ payouts
    def payable(self) -> list[Claim]:
        pending = select(SampleAudit.claim_id).where(SampleAudit.status == "PENDING")
        return list(
            self._session.execute(
                select(Claim)
                .where(
                    Claim.status == "APPROVED",
                    Claim.payout_batch_id.is_(None),
                    Claim.payable_paise > 0,
                    Claim.id.not_in(pending),
                )
                .order_by(Claim.decided_at, Claim.id)
            ).scalars()
        )

    def in_batch(self, batch_id: str) -> list[Claim]:
        return list(
            self._session.execute(
                select(Claim).where(Claim.payout_batch_id == batch_id).order_by(Claim.number)
            ).scalars()
        )

    # ------------------------------------------------------------------ reporting
    def spend_rows(
        self, owner_ids: Collection[str] | None, since: date, until: date
    ) -> list[tuple[str, str, date, int]]:
        """(claim department snapshot, category, expense_date, amount) of approved spend."""
        stmt = (
            select(Claim.department_id, ClaimLine.category_code, ClaimLine.expense_date, ClaimLine.amount_paise)
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(
                Claim.status.in_(("APPROVED", "PAID")),
                ClaimLine.status.in_(("APPROVED", "AUTO_APPROVED")),
                ClaimLine.expense_date >= since,
                ClaimLine.expense_date <= until,
            )
        )
        if owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(owner_ids))
        return [(r[0], r[1], r[2], int(r[3])) for r in self._session.execute(stmt).all()]

    def submitted_line_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[str, str, str]]:
        """(line id, claim department snapshot, category) of lines submitted in range."""
        stmt = (
            select(ClaimLine.id, Claim.department_id, ClaimLine.category_code)
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(Claim.submitted_at >= since, Claim.submitted_at <= until)
        )
        if owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(owner_ids))
        return [(r[0], r[1], r[2]) for r in self._session.execute(stmt).all()]

    def finding_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[str, str, str]]:
        """(line id, rule code, outcome) of findings on lines submitted in range."""
        stmt = (
            select(LineFinding.line_id, LineFinding.rule_code, LineFinding.outcome)
            .join(ClaimLine, ClaimLine.id == LineFinding.line_id)
            .join(Claim, Claim.id == ClaimLine.claim_id)
            .where(Claim.submitted_at >= since, Claim.submitted_at <= until)
        )
        if owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(owner_ids))
        return [(r[0], r[1], r[2]) for r in self._session.execute(stmt).all()]

    def decision_rows(
        self, owner_ids: Collection[str] | None, since: datetime, until: datetime
    ) -> list[tuple[datetime, datetime, bool]]:
        """(submitted_at, decided_at, auto_approved) of claims decided in range."""
        stmt = select(Claim.submitted_at, Claim.decided_at, Claim.auto_approved).where(
            Claim.status.in_(("APPROVED", "PAID", "REJECTED")),
            Claim.decided_at >= since,
            Claim.decided_at <= until,
        )
        if owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(owner_ids))
        return [
            (r[0], r[1], bool(r[2]))
            for r in self._session.execute(stmt).all()
            if r[0] is not None and r[1] is not None
        ]

    def status_counts(self, owner_ids: Collection[str] | None) -> dict[str, int]:
        stmt = select(Claim.status, func.count()).group_by(Claim.status)
        if owner_ids is not None:
            stmt = stmt.where(Claim.owner_id.in_(owner_ids))
        return {r[0]: int(r[1]) for r in self._session.execute(stmt).all()}
