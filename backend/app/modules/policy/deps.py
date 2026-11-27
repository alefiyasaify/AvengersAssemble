from typing import Annotated

from fastapi import Depends

from app.core.clock import ClockDep
from app.core.deps import DbSession
from app.modules.audit.service import AuditService
from app.modules.policy.repository import PolicyRepository
from app.modules.policy.service import PolicyService


def get_policy_service(session: DbSession, clock: ClockDep) -> PolicyService:
    return PolicyService(PolicyRepository(session), AuditService(session, clock), clock)


PolicyServiceDep = Annotated[PolicyService, Depends(get_policy_service)]
