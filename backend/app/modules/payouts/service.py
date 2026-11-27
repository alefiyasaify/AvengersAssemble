"""Payout batches (ARD section 10): maker-checker flow and the mock bank CSV.

Approval decides that money is owed; a batch decides when and in which file it is paid.
DRAFT (head creates) -> VERIFIED (a different user, an auditor) -> EXPORTED (head; CSV frozen
with its SHA-256) -> PAID (head; every claim moves to PAID). DRAFT/VERIFIED can be CANCELLED.
"""

import csv
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.auth import Principal, require_finance, require_head
from app.core.clock import Clock
from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.core.pagination import Page, PageParams
from app.modules.audit.service import AuditService
from app.modules.claims.service import ClaimsService
from app.modules.org.service import OrgService
from app.modules.payouts.models import PayoutBatch, PayoutItem
from app.modules.payouts.repository import PayoutsRepository
from app.modules.payouts.schemas import (
    BatchItemRead,
    BatchRead,
    BatchSummary,
    EligibleClaim,
)
from app.modules.policy.service import PolicyService

# Mock remitter on the header row. The bank file is a demo artefact (ARD 10), so these are
# fixed fake values, not configuration that changes behaviour.
REMITTER_NAME = "ExpenseFlow Services Pvt Ltd"
REMITTER_ACCOUNT = "000123456789"
REMITTER_IFSC = "MOCK0000001"
CSV_HEADER = (
    "record_type",
    "txn_ref",
    "beneficiary_name",
    "beneficiary_account",
    "ifsc",
    "amount_inr",
    "currency",
    "payment_mode",
    "value_date",
    "narration",
    "claim_no",
    "employee_code",
)
_NARRATION = re.compile(r"[^A-Za-z0-9 \-]+")
_FORMULA_START = ("=", "+", "-", "@")


def rupees(paise: int) -> str:
    """Integer paise to '4650.00' with integer arithmetic only (never a float)."""
    whole, frac = divmod(paise, 100)
    return f"{whole}.{frac:02d}"


def safe_cell(value: str) -> str:
    """CSV injection guard: a cell starting with = + - @ is prefixed with a quote (ARD 10)."""
    return f"'{value}" if value.startswith(_FORMULA_START) else value


def narration(text: str) -> str:
    """At most 30 characters of letters, digits and spaces. Hyphens are kept so claim numbers
    like EF-2026-004312 survive, as in the ARD's sample file (noted in docs/14)."""
    return _NARRATION.sub("", text)[:30]


@dataclass(frozen=True)
class CsvLine:
    txn_ref: str
    name: str
    account: str
    ifsc: str
    amount_paise: int
    claim_no: str
    employee_code: str


def render_csv(batch_no: str, value_date: date, lines: list[CsvLine], imps_max_paise: int) -> str:
    """Deterministic bank file: header, one detail row per claim, trailer (ARD 10)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(CSV_HEADER)
    day = value_date.isoformat()
    writer.writerow(
        [
            "H",
            batch_no,
            REMITTER_NAME,
            REMITTER_ACCOUNT,
            REMITTER_IFSC,
            "",
            "INR",
            "",
            day,
            "Expense reimbursement batch",
            "",
            "",
        ]
    )
    for ln in lines:
        mode = "IMPS" if ln.amount_paise <= imps_max_paise else "NEFT"
        writer.writerow(
            [
                "D",
                safe_cell(ln.txn_ref),
                safe_cell(ln.name),
                safe_cell(ln.account),
                safe_cell(ln.ifsc),
                rupees(ln.amount_paise),
                "INR",
                mode,
                day,
                safe_cell(narration(ln.claim_no)),
                safe_cell(ln.claim_no),
                safe_cell(ln.employee_code),
            ]
        )
    total = sum(ln.amount_paise for ln in lines)
    writer.writerow(
        ["T", batch_no, "", "", "", rupees(total), "INR", "", "", f"COUNT={len(lines)}", "", ""]
    )
    return out.getvalue()


class PayoutsService:
    def __init__(
        self,
        repository: PayoutsRepository,
        claims: ClaimsService,
        org: OrgService,
        policy: PolicyService,
        audit: AuditService,
        now: Clock = utcnow,
    ) -> None:
        self._repo = repository
        self._claims = claims
        self._org = org
        self._policy = policy
        self._audit = audit
        self._now = now

    def _today(self) -> date:
        return self._now().astimezone(ZoneInfo(self._policy.config_values().timezone)).date()

    def _batch(self, batch_id: str) -> PayoutBatch:
        batch = self._repo.get(batch_id)
        if batch is None:
            raise NotFoundError("Payout batch was not found.", code="BATCH_NOT_FOUND")
        return batch

    def _record(
        self, principal: Principal, action: str, batch: PayoutBatch, **after: object
    ) -> None:
        self._audit.record(
            actor_id=principal.id,
            action=action,
            entity_type="payout_batch",
            entity_id=batch.id,
            after={"batch_no": batch.number, "status": batch.status, **after},
        )

    @staticmethod
    def _expect(batch: PayoutBatch, *statuses: str) -> None:
        if batch.status not in statuses:
            raise ConflictError(
                f"A {batch.status} batch cannot do that.", code="ILLEGAL_BATCH_TRANSITION"
            )

    def _read(self, batch: PayoutBatch) -> BatchRead:
        people = self._org.people({i.employee_id for i in batch.items})
        banks = self._org.bank_details({i.employee_id for i in batch.items})
        return BatchRead(
            **_summary(batch).model_dump(),
            items=[
                BatchItemRead(
                    seq=i.seq,
                    claim_id=i.claim_id,
                    employee_id=i.employee_id,
                    employee_name=people[i.employee_id].full_name
                    if i.employee_id in people
                    else "Unknown",
                    amount_paise=i.amount_paise,
                    bank_ref=i.bank_ref,
                    # Account numbers are fake and still shown masked (ARD 10).
                    account_last4=banks[i.employee_id].account_no[-4:]
                    if i.employee_id in banks
                    else "",
                )
                for i in batch.items
            ],
        )

    # ------------------------------------------------------------------ reads
    def eligible(self, principal: Principal) -> list[EligibleClaim]:
        require_head(principal)
        rows = self._claims.payable_claims()
        people = self._org.people({r.owner_id for r in rows})
        return [
            EligibleClaim(
                claim_id=r.id,
                claim_no=r.number,
                owner_id=r.owner_id,
                owner_name=people[r.owner_id].full_name if r.owner_id in people else "Unknown",
                payable_paise=r.payable_paise,
                decided_at=r.decided_at,
            )
            for r in rows
        ]

    def list_batches(self, principal: Principal, page: PageParams) -> Page[BatchSummary]:
        require_finance(principal)
        rows, total = self._repo.page(limit=page.limit, offset=page.offset)
        return Page[BatchSummary].of([_summary(b) for b in rows], total, page)

    def get(self, principal: Principal, batch_id: str) -> BatchRead:
        require_finance(principal)
        return self._read(self._batch(batch_id))

    # ------------------------------------------------------------------ maker-checker flow
    def create(self, principal: Principal, claim_ids: list[str]) -> BatchRead:
        require_head(principal)
        unique_ids = list(dict.fromkeys(claim_ids))
        batch = self._repo.add(
            PayoutBatch(
                number=self._repo.next_number(self._today().year),
                status="DRAFT",
                created_by_id=principal.id,
            )
        )
        chosen = sorted(self._claims.attach_to_batch(unique_ids, batch.id), key=lambda c: c.number)
        banks = self._org.bank_details({c.owner_id for c in chosen})
        missing = sorted({c.number for c in chosen if c.owner_id not in banks})
        if missing:
            raise ConflictError(
                "Some claimants have no bank account on file.",
                code="BANK_ACCOUNT_MISSING",
                details={"claim_nos": missing},
            )
        for seq, claim in enumerate(chosen, start=1):
            batch.items.append(
                PayoutItem(
                    seq=seq,
                    claim_id=claim.id,
                    employee_id=claim.owner_id,
                    amount_paise=claim.payable_paise,
                    bank_ref=f"{batch.number}-{seq:04d}",
                )
            )
        batch.claim_count = len(chosen)
        batch.total_paise = sum(c.payable_paise for c in chosen)
        self._repo.flush()
        self._record(
            principal,
            "payout.batch_created",
            batch,
            claim_ids=[c.id for c in chosen],
            total_paise=batch.total_paise,
        )
        return self._read(batch)

    def verify(self, principal: Principal, batch_id: str) -> BatchRead:
        """Checker: an auditor who did not create the batch (ARD C7)."""
        if principal.role != "AUDITOR":
            raise PermissionDeniedError("Only an auditor can verify a batch.")
        batch = self._batch(batch_id)
        self._expect(batch, "DRAFT")
        if batch.created_by_id == principal.id:
            raise PermissionDeniedError(
                "The creator cannot verify the same batch.", code="MAKER_CHECKER"
            )
        batch.status = "VERIFIED"
        batch.verified_by_id = principal.id
        batch.verified_at = self._now()
        self._repo.flush()
        self._record(principal, "payout.batch_verified", batch)
        return self._read(batch)

    def export(self, principal: Principal, batch_id: str) -> BatchRead:
        require_head(principal)
        batch = self._batch(batch_id)
        self._expect(batch, "VERIFIED")
        people = self._org.people({i.employee_id for i in batch.items})
        banks = self._org.bank_details({i.employee_id for i in batch.items})
        numbers = self._claim_numbers(batch)
        value_date = self._today()
        content = render_csv(
            batch.number,
            value_date,
            [
                CsvLine(
                    txn_ref=i.bank_ref,
                    name=banks[i.employee_id].holder_name,
                    account=banks[i.employee_id].account_no,
                    ifsc=banks[i.employee_id].ifsc,
                    amount_paise=i.amount_paise,
                    claim_no=numbers[i.claim_id],
                    employee_code=people[i.employee_id].employee_code,
                )
                for i in batch.items
            ],
            self._policy.config_values().imps_max_paise,
        )
        batch.file_name = f"EXPFLOW_{batch.number}_{value_date:%Y%m%d}.csv"
        batch.file_content = content
        batch.file_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
        batch.status = "EXPORTED"
        batch.exported_at = self._now()
        self._repo.flush()
        self._record(principal, "payout.batch_exported", batch, file_sha256=batch.file_sha256)
        return self._read(batch)

    def _claim_numbers(self, batch: PayoutBatch) -> dict[str, str]:
        return {c.id: c.number for c in self._claims.claims_in_batch(batch.id)}

    def file(self, principal: Principal, batch_id: str) -> tuple[str, bytes]:
        """Re-download returns the same bytes; the stored hash is re-checked first."""
        require_finance(principal)
        batch = self._batch(batch_id)
        if batch.file_content is None or batch.file_name is None:
            raise ConflictError("The batch has not been exported yet.", code="NOT_EXPORTED")
        data = batch.file_content.encode("utf-8")
        if hashlib.sha256(data).hexdigest() != batch.file_sha256:
            raise ConflictError(
                "The stored bank file fails its integrity check.", code="FILE_INTEGRITY"
            )
        self._record(principal, "payout.file_downloaded", batch)
        return batch.file_name, data

    def mark_paid(self, principal: Principal, batch_id: str) -> BatchRead:
        require_head(principal)
        batch = self._batch(batch_id)
        self._expect(batch, "EXPORTED")
        paid = self._claims.mark_paid(principal.id, batch.id, batch.number)
        batch.status = "PAID"
        batch.paid_at = self._now()
        self._repo.flush()
        self._record(principal, "payout.batch_paid", batch, claims_paid=paid)
        return self._read(batch)

    def cancel(self, principal: Principal, batch_id: str) -> BatchRead:
        require_head(principal)
        batch = self._batch(batch_id)
        self._expect(batch, "DRAFT", "VERIFIED")
        claim_ids = [i.claim_id for i in batch.items]
        self._claims.detach_batch(batch.id)
        self._repo.remove_items(batch)
        batch.status = "CANCELLED"
        batch.cancelled_at = self._now()
        self._repo.flush()
        self._record(principal, "payout.batch_cancelled", batch, released_claim_ids=claim_ids)
        return self._read(batch)

    def status_counts(self) -> dict[str, int]:
        return self._repo.status_counts()


def _summary(batch: PayoutBatch) -> BatchSummary:
    return BatchSummary(
        id=batch.id,
        batch_no=batch.number,
        status=batch.status,  # type: ignore[arg-type]
        created_by_id=batch.created_by_id,
        verified_by_id=batch.verified_by_id,
        total_paise=batch.total_paise,
        claim_count=batch.claim_count,
        file_name=batch.file_name,
        file_sha256=batch.file_sha256,
        created_at=batch.created_at,
        verified_at=batch.verified_at,
        exported_at=batch.exported_at,
        paid_at=batch.paid_at,
        cancelled_at=batch.cancelled_at,
    )


def payouts_service(
    session: Session,
    claims: ClaimsService,
    org: OrgService,
    policy: PolicyService,
    audit: AuditService,
    now: Clock = utcnow,
) -> PayoutsService:
    """Factory for scripts such as the seed (they may not import the repository)."""
    return PayoutsService(PayoutsRepository(session), claims, org, policy, audit, now)
