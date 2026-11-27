"""Public interface of the audit module (ARD section 11): append, read, verify. No update/delete.

`row_hash = SHA-256(prev_hash || canonical JSON of the row)`; `verify_chain()` re-computes it
for every row (nightly job and the `expenseflow_audit_chain_valid` metric).
"""

import hashlib
import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.auth import Principal, require_finance
from app.core.clock import Clock
from app.core.db import utcnow
from app.core.logging import client_ip_var, request_id_var
from app.core.pagination import Page, PageParams
from app.modules.audit.models import AuditEvent
from app.modules.audit.repository import AuditFilter, AuditRepository

GENESIS = "0" * 64


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ts: datetime
    actor_id: str | None
    on_behalf_of_id: str | None
    action: str
    entity_type: str
    entity_id: str
    claim_id: str | None
    before_json: dict[str, Any] | None
    after_json: dict[str, Any] | None
    request_id: str | None


def _canonical(event: AuditEvent) -> str:
    return json.dumps(
        {
            "ts": event.ts.isoformat(),
            "actor_id": event.actor_id,
            "on_behalf_of_id": event.on_behalf_of_id,
            "action": event.action,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "claim_id": event.claim_id,
            "before": event.before_json,
            "after": event.after_json,
            "request_id": event.request_id,
            "ip": event.ip,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def row_hash(prev_hash: str, event: AuditEvent) -> str:
    return hashlib.sha256((prev_hash + _canonical(event)).encode()).hexdigest()


class AuditService:
    def __init__(self, session: Session, now: Clock = utcnow) -> None:
        self._repo = AuditRepository(session)
        self._now = now

    def record(
        self,
        *,
        actor_id: str | None,
        action: str,
        entity_type: str,
        entity_id: str,
        claim_id: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        on_behalf_of_id: str | None = None,
    ) -> None:
        """Append one event in the caller's transaction (commits or rolls back with it).
        `actor_id=None` means SYSTEM (e.g. auto-approval)."""
        event = AuditEvent(
            ts=self._now(),
            actor_id=actor_id,
            on_behalf_of_id=on_behalf_of_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            claim_id=claim_id,
            before_json=before,
            after_json=after,
            request_id=request_id_var.get(),
            ip=client_ip_var.get(),
        )
        prev = self._repo.last_hash() or GENESIS
        event.prev_hash = prev
        event.row_hash = row_hash(prev, event)
        self._repo.add(event)

    def for_claim(self, claim_id: str) -> list[AuditEventRead]:
        return [AuditEventRead.model_validate(e) for e in self._repo.for_claim(claim_id)]

    def search(
        self, principal: Principal, f: AuditFilter, page: PageParams
    ) -> Page[AuditEventRead]:
        require_finance(principal)
        rows, total = self._repo.page(f, limit=page.limit, offset=page.offset)
        return Page[AuditEventRead].of(
            [AuditEventRead.model_validate(r) for r in rows], total, page
        )

    def verify_chain(self) -> tuple[bool, int, int | None]:
        """(valid, rows checked, first broken id)."""
        prev, checked = GENESIS, 0
        for event in self._repo.all_in_order():
            checked += 1
            if event.prev_hash != prev or event.row_hash != row_hash(prev, event):
                return False, checked, event.id
            prev = event.row_hash
        return True, checked, None
