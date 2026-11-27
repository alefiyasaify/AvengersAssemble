from typing import Annotated

from fastapi import Depends

from app.core.clock import ClockDep
from app.core.deps import DbSession
from app.modules.audit.service import AuditService
from app.modules.org.repository import OrgRepository
from app.modules.org.service import OrgService


def get_org_service(session: DbSession, clock: ClockDep) -> OrgService:
    return OrgService(OrgRepository(session), AuditService(session, clock))


OrgServiceDep = Annotated[OrgService, Depends(get_org_service)]
