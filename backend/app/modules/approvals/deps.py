import random
from typing import Annotated

from fastapi import Depends, Request

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.approvals.service import ApprovalsService
from app.modules.audit.service import AuditService
from app.modules.claims.service import claims_service
from app.modules.org.service import org_service
from app.modules.policy.service import policy_service
from app.modules.receipts.service import receipt_service


def get_approvals_service(
    request: Request, session: DbSession, settings: SettingsDep, clock: ClockDep
) -> ApprovalsService:
    audit = AuditService(session, clock)
    rng: random.Random | None = getattr(request.app.state, "rng", None)
    return ApprovalsService(
        claims_service(
            session,
            audit,
            org_service(session, audit),
            policy_service(session, audit, clock),
            receipt_service(session, audit, settings),
            clock,
            rng,
        )
    )


ApprovalsServiceDep = Annotated[ApprovalsService, Depends(get_approvals_service)]
