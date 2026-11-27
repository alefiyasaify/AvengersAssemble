import random
from typing import Annotated

from fastapi import Depends, Request

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.audit.service import AuditService
from app.modules.claims.repository import ClaimsRepository
from app.modules.claims.service import ClaimsService
from app.modules.org.service import org_service
from app.modules.policy.service import policy_service
from app.modules.receipts.service import receipt_service


def get_claims_service(
    request: Request, session: DbSession, settings: SettingsDep, clock: ClockDep
) -> ClaimsService:
    audit = AuditService(session, clock)
    rng: random.Random | None = getattr(request.app.state, "rng", None)
    return ClaimsService(
        ClaimsRepository(session),
        audit,
        org_service(session, audit),
        policy_service(session, audit, clock),
        receipt_service(session, audit, settings),
        clock,
        rng,
    )


ClaimsServiceDep = Annotated[ClaimsService, Depends(get_claims_service)]
