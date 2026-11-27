from typing import Annotated

from fastapi import Depends

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.audit.service import AuditService
from app.modules.claims.service import claims_service
from app.modules.org.service import org_service
from app.modules.policy.service import policy_service
from app.modules.receipts.service import receipt_service
from app.modules.reports.service import ReportsService


def get_reports_service(
    session: DbSession, settings: SettingsDep, clock: ClockDep
) -> ReportsService:
    audit = AuditService(session, clock)
    org = org_service(session, audit)
    policy = policy_service(session, audit, clock)
    claims = claims_service(
        session, audit, org, policy, receipt_service(session, audit, settings), clock
    )
    return ReportsService(claims, org, policy, clock)


ReportsServiceDep = Annotated[ReportsService, Depends(get_reports_service)]
