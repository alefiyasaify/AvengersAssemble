"""Payout API contract (ARD sections 8 and 10). Money is integer paise."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BatchStatus = Literal["DRAFT", "VERIFIED", "EXPORTED", "PAID", "CANCELLED"]


class BatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_ids: list[str] = Field(min_length=1, max_length=500)


class EligibleClaim(BaseModel):
    claim_id: str
    claim_no: str
    owner_id: str
    owner_name: str
    payable_paise: int
    decided_at: datetime | None


class BatchItemRead(BaseModel):
    seq: int
    claim_id: str
    employee_id: str
    employee_name: str
    amount_paise: int
    bank_ref: str
    account_last4: str


class BatchSummary(BaseModel):
    id: str
    batch_no: str
    status: BatchStatus
    created_by_id: str
    verified_by_id: str | None
    total_paise: int
    claim_count: int
    file_name: str | None
    file_sha256: str | None
    created_at: datetime
    verified_at: datetime | None
    exported_at: datetime | None
    paid_at: datetime | None
    cancelled_at: datetime | None


class BatchRead(BatchSummary):
    items: list[BatchItemRead]
