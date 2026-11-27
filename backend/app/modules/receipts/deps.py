from typing import Annotated

from fastapi import Depends

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.audit.service import AuditService
from app.modules.receipts.repository import ReceiptRepository
from app.modules.receipts.service import ReceiptService


def get_receipt_service(
    session: DbSession, settings: SettingsDep, clock: ClockDep
) -> ReceiptService:
    return ReceiptService(ReceiptRepository(session), AuditService(session, clock), settings)


ReceiptServiceDep = Annotated[ReceiptService, Depends(get_receipt_service)]
