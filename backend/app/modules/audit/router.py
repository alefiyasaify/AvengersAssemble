from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.auth import PrincipalDep
from app.core.clock import ClockDep
from app.core.deps import DbSession, PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules.audit.repository import AuditFilter
from app.modules.audit.service import AuditEventRead, AuditService

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get(
    "",
    response_model=Page[AuditEventRead],
    status_code=status.HTTP_200_OK,
    operation_id="audit_list_events",
    summary="Auditor/head: read the append-only audit trail (no write endpoint exists)",
    responses=error_responses(400, 401, 403, 500),
)
def list_events(
    principal: PrincipalDep,
    session: DbSession,
    clock: ClockDep,
    page: PageDep,
    claim_id: Annotated[str | None, Query(max_length=36)] = None,
    actor_id: Annotated[str | None, Query(max_length=36)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    since: Annotated[datetime | None, Query(alias="from")] = None,
    until: Annotated[datetime | None, Query(alias="to")] = None,
) -> Page[AuditEventRead]:
    return AuditService(session, clock).search(
        principal, AuditFilter(claim_id, actor_id, action, since, until), page
    )
