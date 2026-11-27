"""Claim state machine (ARD section 4). The same pairs are seeded into `claim_transitions`,
where a DB trigger rejects any other status update (the database backstop)."""

from app.core.errors import ConflictError

TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("DRAFT", "APPROVED"),
        ("DRAFT", "REJECTED"),
        ("DRAFT", "PENDING_MANAGER"),
        ("DRAFT", "WITHDRAWN"),
        ("PENDING_MANAGER", "PENDING_AUDITOR"),
        ("PENDING_MANAGER", "PENDING_HEAD"),
        ("PENDING_MANAGER", "APPROVED"),
        ("PENDING_MANAGER", "WITHDRAWN"),
        ("PENDING_AUDITOR", "PENDING_HEAD"),
        ("PENDING_AUDITOR", "APPROVED"),
        ("PENDING_HEAD", "APPROVED"),
        ("PENDING_MANAGER", "REJECTED"),
        ("PENDING_AUDITOR", "REJECTED"),
        ("PENDING_HEAD", "REJECTED"),
        ("PENDING_MANAGER", "SENT_BACK"),
        ("PENDING_AUDITOR", "SENT_BACK"),
        ("PENDING_HEAD", "SENT_BACK"),
        ("SENT_BACK", "PENDING_MANAGER"),
        ("SENT_BACK", "APPROVED"),
        ("SENT_BACK", "REJECTED"),
        ("SENT_BACK", "WITHDRAWN"),
        ("APPROVED", "PAID"),
        ("APPROVED", "PENDING_AUDITOR"),
    }
)
ALL_STATUSES = (
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
PENDING = frozenset({"PENDING_MANAGER", "PENDING_AUDITOR", "PENDING_HEAD"})
EDITABLE = frozenset({"DRAFT", "SENT_BACK"})
STATUS_FOR_ROLE = {
    "MANAGER": "PENDING_MANAGER",
    "AUDITOR": "PENDING_AUDITOR",
    "FINANCE_HEAD": "PENDING_HEAD",
}


def ensure_transition(current: str, target: str) -> None:
    if (current, target) not in TRANSITIONS:
        raise ConflictError(
            f"A claim cannot move from {current} to {target}.", code="ILLEGAL_TRANSITION"
        )
