"""Claim capture and read endpoints (ARD section 8: Claims, Receipts download)."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse

from app.core.auth import PrincipalDep
from app.core.deps import PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules.claims.deps import ClaimsServiceDep
from app.modules.claims.schemas import (
    ClaimCreate,
    ClaimDetail,
    ClaimPatch,
    ClaimScope,
    ClaimStatus,
    ClaimSummary,
    CommentCreate,
    CommentRead,
    LineAdd,
    LineUpdate,
    PolicyPreview,
    TimelineEntry,
    Versioned,
)
from app.modules.receipts.service import SAFE_FILE_HEADERS

router = APIRouter(tags=["claims"])

_MUTATION_ERRORS = error_responses(400, 401, 404, 409, 500)


@router.get(
    "/claims",
    response_model=Page[ClaimSummary],
    status_code=status.HTTP_200_OK,
    operation_id="claims_list_claims",
    summary="My claims (scope=mine), my reports' (team) or every claim (all, finance only)",
    responses=error_responses(400, 401, 403, 500),
)
def list_claims(
    principal: PrincipalDep,
    service: ClaimsServiceDep,
    page: PageDep,
    scope: ClaimScope = "mine",
    claim_status: Annotated[list[ClaimStatus] | None, Query(alias="status")] = None,
    submitted_from: datetime | None = None,
    submitted_to: datetime | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[ClaimSummary]:
    return service.list_claims(
        principal,
        page,
        scope=scope,
        statuses=claim_status,
        submitted_from=submitted_from,
        submitted_to=submitted_to,
        q=q,
    )


@router.post(
    "/claims",
    response_model=ClaimDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="claims_create_claim",
    summary="Create a DRAFT claim, optionally with lines",
    responses=error_responses(400, 401, 404, 500),
)
def create_claim(
    body: ClaimCreate, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.create(principal, body)


@router.get(
    "/claims/{claim_id}",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_get_claim",
    summary="Claim with lines, findings, steps, comments and allowed_actions (404 if not yours)",
    responses=error_responses(401, 404, 500),
)
def get_claim(claim_id: str, principal: PrincipalDep, service: ClaimsServiceDep) -> ClaimDetail:
    return service.get(principal, claim_id)


@router.patch(
    "/claims/{claim_id}",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_update_claim",
    summary="Edit the title (DRAFT or SENT_BACK only)",
    responses=_MUTATION_ERRORS,
)
def update_claim(
    claim_id: str, body: ClaimPatch, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.patch(principal, claim_id, body)


@router.post(
    "/claims/{claim_id}/lines",
    response_model=ClaimDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="claims_add_line",
    responses=_MUTATION_ERRORS,
)
def add_line(
    claim_id: str, body: LineAdd, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.add_line(principal, claim_id, body)


@router.patch(
    "/claims/{claim_id}/lines/{line_id}",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_update_line",
    responses=_MUTATION_ERRORS,
)
def update_line(
    claim_id: str,
    line_id: str,
    body: LineUpdate,
    principal: PrincipalDep,
    service: ClaimsServiceDep,
) -> ClaimDetail:
    return service.update_line(principal, claim_id, line_id, body)


@router.delete(
    "/claims/{claim_id}/lines/{line_id}",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_delete_line",
    responses=_MUTATION_ERRORS,
)
def delete_line(
    claim_id: str,
    line_id: str,
    expected_version: Annotated[int, Query(ge=1)],
    principal: PrincipalDep,
    service: ClaimsServiceDep,
) -> ClaimDetail:
    return service.delete_line(principal, claim_id, line_id, expected_version)


@router.post(
    "/claims/{claim_id}/policy-preview",
    response_model=PolicyPreview,
    status_code=status.HTTP_200_OK,
    operation_id="claims_preview_policy",
    summary="Advisory policy findings for a draft; nothing is stored",
    responses=error_responses(401, 404, 409, 500),
)
def preview_policy(
    claim_id: str, principal: PrincipalDep, service: ClaimsServiceDep
) -> PolicyPreview:
    return service.preview(principal, claim_id)


@router.post(
    "/claims/{claim_id}/submit",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_submit_claim",
    summary="Run the authoritative policy check; auto-approve, auto-reject or open the chain",
    responses=_MUTATION_ERRORS,
)
def submit_claim(
    claim_id: str, body: Versioned, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.submit(principal, claim_id, body.expected_version)


@router.post(
    "/claims/{claim_id}/resubmit",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_resubmit_claim",
    summary="After a send-back: new round, policy re-run, chain restarts at level 1",
    responses=_MUTATION_ERRORS,
)
def resubmit_claim(
    claim_id: str, body: Versioned, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.resubmit(principal, claim_id, body.expected_version)


@router.post(
    "/claims/{claim_id}/withdraw",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="claims_withdraw_claim",
    summary="Withdraw before the first approval of the round",
    responses=_MUTATION_ERRORS,
)
def withdraw_claim(
    claim_id: str, body: Versioned, principal: PrincipalDep, service: ClaimsServiceDep
) -> ClaimDetail:
    return service.withdraw(principal, claim_id, body.expected_version)


@router.get(
    "/claims/{claim_id}/timeline",
    response_model=list[TimelineEntry],
    status_code=status.HTTP_200_OK,
    operation_id="claims_get_timeline",
    summary="Human-readable audit events for this claim",
    responses=error_responses(401, 404, 500),
)
def get_timeline(
    claim_id: str, principal: PrincipalDep, service: ClaimsServiceDep
) -> list[TimelineEntry]:
    return service.timeline(principal, claim_id)


@router.post(
    "/claims/{claim_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="claims_add_comment",
    summary="Clarification thread (no state change)",
    responses=error_responses(400, 401, 404, 409, 500),
)
def add_comment(
    claim_id: str, body: CommentCreate, principal: PrincipalDep, service: ClaimsServiceDep
) -> CommentRead:
    return service.comment(principal, claim_id, body)


@router.get(
    "/receipts/{receipt_id}/file",
    response_class=FileResponse,
    status_code=status.HTTP_200_OK,
    operation_id="claims_download_receipt",
    tags=["receipts"],
    summary="Stream a receipt to its uploader or anyone who may view a claim using it",
    responses=error_responses(401, 404, 500),
)
def download_receipt(
    receipt_id: str, principal: PrincipalDep, service: ClaimsServiceDep
) -> FileResponse:
    stored = service.receipt_file(principal, receipt_id)
    return FileResponse(
        stored.path,
        media_type=stored.mime,
        filename=stored.original_name,
        content_disposition_type="inline",
        headers=SAFE_FILE_HEADERS,
    )
