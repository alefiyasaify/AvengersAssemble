"""Approval-chain rules (ARD sections 2 and 6) as small functions over plain data.

Kept apart from the service so each rule is easy to read and test:
- who a new step is assigned to (with escalation when the natural assignee may not act);
- whether a given user may act on a given pending step (assignee, pool, or delegate).
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.modules.org.service import Person, rank

# The auditor level is a pool: any auditor may act, first one wins (ARD 6 step behaviour 1).
POOL_ROLES = frozenset({"AUDITOR"})
# A finance head may also act on auditor-pool steps (same-or-higher role, ARD C4); separation
# of duties still stops them approving a second level of the same claim.
POOL_ELIGIBLE = {"AUDITOR": frozenset({"AUDITOR", "FINANCE_HEAD"})}


@dataclass(frozen=True)
class ActiveDelegation:
    delegator_id: str
    delegate_id: str
    level_no: int


@dataclass(frozen=True)
class Authority:
    """Why `actor` may act on a step: directly, or on behalf of the delegator."""

    on_behalf_of_id: str | None


def resolve_assignee(
    *,
    role: str,
    level_no: int,
    owner: Person,
    owner_ancestors: Sequence[Person],
    heads: Sequence[Person],
    acted_ids: Collection[str],
    delegations: Sequence[ActiveDelegation],
) -> str | None:
    """The user a new step is assigned to, or None (auditor pool, or nobody eligible).

    - MANAGER: the claimant's direct manager; if that person may not act (the claimant or an
      earlier approver of this claim) it escalates up the hierarchy (ARD rule 2).
    - AUDITOR: None - the step is open to the auditor pool.
    - FINANCE_HEAD: the finance head; when the head may not act (their own claim, or they
      already approved a level) the step goes to the head's active delegate for that level.
    None for a non-pool role means nobody is eligible; the caller records NEEDS_REASSIGNMENT.
    """
    blocked = {owner.id, *acted_ids}
    if role in POOL_ROLES:
        return None
    if role == "MANAGER":
        return next((p.id for p in owner_ancestors if p.id not in blocked and p.is_active), None)
    for head in heads:
        if head.id not in blocked and head.is_active:
            return head.id
    head_ids = {h.id for h in heads}
    for d in delegations:
        if d.delegator_id in head_ids and d.level_no == level_no and d.delegate_id not in blocked:
            return d.delegate_id
    return None


def authority(
    *,
    actor: Person,
    owner_id: str,
    step_role: str,
    step_level: int,
    assigned_to_id: str | None,
    acted_ids: Collection[str],
    delegations: Sequence[ActiveDelegation],
) -> Authority | None:
    """None when `actor` may not act on the step.

    Never the claimant (also not as a delegate), never someone who already approved another
    level of this claim (separation of duties, ARD rule 3).
    """
    if actor.id == owner_id or actor.id in acted_ids or not actor.is_active:
        return None
    if assigned_to_id is None:
        if step_role in POOL_ROLES and actor.role in POOL_ELIGIBLE[step_role]:
            return Authority(on_behalf_of_id=None)
        return None
    if actor.id == assigned_to_id:
        return Authority(on_behalf_of_id=None)
    for d in delegations:
        if (
            d.delegate_id == actor.id
            and d.delegator_id == assigned_to_id
            and d.level_no == step_level
            and d.delegator_id != owner_id
        ):
            return Authority(on_behalf_of_id=d.delegator_id)
    return None


def delegate_may_cover(delegate_role: str, level_role: str) -> bool:
    """Delegate must hold the same or a higher role than the level needs (ARD C4).

    Exception (ARD section 13 decision 10: one finance head): the head level may be delegated
    to an auditor, otherwise the head could never be covered. Recorded in docs/14.
    """
    if level_role == "FINANCE_HEAD":
        return rank(delegate_role) >= rank("AUDITOR")
    return rank(delegate_role) >= rank(level_role)


def is_active_at(
    starts_at: datetime, ends_at: datetime, revoked_at: datetime | None, at: datetime
) -> bool:
    return revoked_at is None and starts_at <= at < ends_at
