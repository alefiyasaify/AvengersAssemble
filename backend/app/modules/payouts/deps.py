import random
from typing import Annotated

from fastapi import Depends, Request

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.audit.service import AuditService
from app.modules.claims.service import claims_service
from app.modules.org.service import org_service
from app.modules.payouts.repository import PayoutsRepository
from app.modules.payouts.service import PayoutsService
from app.modules.policy.service import policy_service
from app.modules.receipts.service import receipt_service


def get_payouts_service(
    request: Request, session: DbSession, settings: SettingsDep, clock: ClockDep
) -> PayoutsService:
    audit = AuditService(session, clock)
    org = org_service(session, audit)
    policy = policy_service(session, audit, clock)
    rng: random.Random | None = getattr(request.app.state, "rng", None)
    claims = claims_service(
        session, audit, org, policy, receipt_service(session, audit, settings), clock, rng
    )
    return PayoutsService(PayoutsRepository(session), claims, org, policy, audit, clock)


PayoutsServiceDep = Annotated[PayoutsService, Depends(get_payouts_service)]
