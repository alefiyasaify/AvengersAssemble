"""Payout batches and the mock bank file (ARD sections 8 and 10)."""

from fastapi import APIRouter, Response, status

from app.core.auth import PrincipalDep
from app.core.deps import PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules.payouts.deps import PayoutsServiceDep
from app.modules.payouts.schemas import BatchCreate, BatchRead, BatchSummary, EligibleClaim

router = APIRouter(prefix="/payouts", tags=["payouts"])

_FLOW_ERRORS = error_responses(401, 403, 404, 409, 500)


@router.get(
    "/eligible",
    response_model=list[EligibleClaim],
    status_code=status.HTTP_200_OK,
    operation_id="payouts_list_eligible",
    summary="Approved claims not in a batch and not waiting on a sample audit",
    responses=error_responses(401, 403, 500),
)
def list_eligible(principal: PrincipalDep, service: PayoutsServiceDep) -> list[EligibleClaim]:
    return service.eligible(principal)


@router.post(
    "/batches",
    response_model=BatchRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="payouts_create_batch",
    summary="Finance head creates a DRAFT batch from eligible claims",
    responses=error_responses(400, 401, 403, 409, 500),
)
def create_batch(
    body: BatchCreate, principal: PrincipalDep, service: PayoutsServiceDep
) -> BatchRead:
    return service.create(principal, body.claim_ids)


@router.get(
    "/batches",
    response_model=Page[BatchSummary],
    status_code=status.HTTP_200_OK,
    operation_id="payouts_list_batches",
    responses=error_responses(400, 401, 403, 500),
)
def list_batches(
    principal: PrincipalDep, service: PayoutsServiceDep, page: PageDep
) -> Page[BatchSummary]:
    return service.list_batches(principal, page)


@router.get(
    "/batches/{batch_id}",
    response_model=BatchRead,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_get_batch",
    responses=error_responses(401, 403, 404, 500),
)
def get_batch(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> BatchRead:
    return service.get(principal, batch_id)


@router.post(
    "/batches/{batch_id}/verify",
    response_model=BatchRead,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_verify_batch",
    summary="Checker step: an auditor who is not the creator verifies count and total",
    responses=_FLOW_ERRORS,
)
def verify_batch(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> BatchRead:
    return service.verify(principal, batch_id)


@router.post(
    "/batches/{batch_id}/export",
    response_model=BatchRead,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_export_batch",
    summary="Generate the bank CSV from a VERIFIED batch; the file and its SHA-256 are frozen",
    responses=_FLOW_ERRORS,
)
def export_batch(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> BatchRead:
    return service.export(principal, batch_id)


@router.get(
    "/batches/{batch_id}/file",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_download_file",
    summary="Re-download the exported CSV (same bytes; hash verified)",
    responses={
        200: {"content": {"text/csv": {}}, "description": "The bank file"},
        **_FLOW_ERRORS,
    },
)
def download_file(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> Response:
    name, data = service.file(principal, batch_id)
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/batches/{batch_id}/mark-paid",
    response_model=BatchRead,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_mark_paid",
    summary="Simulated bank confirmation: every claim in the batch moves to PAID",
    responses=_FLOW_ERRORS,
)
def mark_paid(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> BatchRead:
    return service.mark_paid(principal, batch_id)


@router.post(
    "/batches/{batch_id}/cancel",
    response_model=BatchRead,
    status_code=status.HTTP_200_OK,
    operation_id="payouts_cancel_batch",
    summary="Cancel a DRAFT or VERIFIED batch; its claims become eligible again",
    responses=_FLOW_ERRORS,
)
def cancel_batch(batch_id: str, principal: PrincipalDep, service: PayoutsServiceDep) -> BatchRead:
    return service.cancel(principal, batch_id)
