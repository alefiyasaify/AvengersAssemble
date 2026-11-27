from fastapi import APIRouter, UploadFile, status

from app.core.auth import PrincipalDep
from app.core.errors import error_responses
from app.modules.receipts.deps import ReceiptServiceDep
from app.modules.receipts.schemas import ReceiptRead

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post(
    "",
    response_model=ReceiptRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="receipts_upload_receipt",
    summary="Upload a receipt (PDF, JPEG or PNG checked by magic bytes, max 5 MB)",
    responses=error_responses(400, 401, 403, 413, 500),
)
def upload_receipt(
    file: UploadFile, principal: PrincipalDep, service: ReceiptServiceDep
) -> ReceiptRead:
    # Sync endpoint (threadpool): hashing and file I/O must not block the event loop.
    return service.upload(principal, file.filename or "receipt", file.file)
