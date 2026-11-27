"""Approvals, delegation, auditor review queue and sample audits (ARD section 8)."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import PrincipalDep
from app.core.deps import PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules.approvals.deps import ApprovalsServiceDep
from app.modules.approvals.service import ReviewFilter
from app.modules.claims.schemas import (
    ApproveRequest,
    BulkApproveRequest,
    BulkApproveResult,
    Category,
    ClaimDetail,
    ClaimSummary,
    DelegationCreate,
    DelegationRead,
    InboxItem,
    RejectRequest,
    SampleAuditRead,
    SampleResolve,
    SendBackRequest,
)

router = APIRouter(tags=["approvals"])

_DECISION_ERRORS = error_responses(400, 401, 403, 404, 409, 500)


class ReassignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_id: str = Field(max_length=36)


@router.get(
    "/approvals/inbox",
    response_model=Page[InboxItem],
    status_code=status.HTTP_200_OK,
    operation_id="approvals_list_inbox",
    summary="Open steps I may act on: assigned to me, delegated to me, or the auditor pool",
    responses=error_responses(401, 500),
)
def list_inbox(
    principal: PrincipalDep, service: ApprovalsServiceDep, page: PageDep
) -> Page[InboxItem]:
    return service.inbox(principal, page)


@router.post(
    "/approvals/{step_id}/approve",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_approve_step",
    summary="Approve the open step (optional comment); opens the next level or approves",
    responses=_DECISION_ERRORS,
)
def approve_step(
    step_id: str, body: ApproveRequest, principal: PrincipalDep, service: ApprovalsServiceDep
) -> ClaimDetail:
    return service.approve(principal, step_id, body)


@router.post(
    "/approvals/{step_id}/reject",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_reject_step",
    summary="Reject the claim (comment required)",
    responses=_DECISION_ERRORS,
)
def reject_step(
    step_id: str, body: RejectRequest, principal: PrincipalDep, service: ApprovalsServiceDep
) -> ClaimDetail:
    return service.reject(principal, step_id, body)


@router.post(
    "/approvals/{step_id}/send-back",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_send_back_step",
    summary="Send back for clarification (comment required; optional line ids)",
    responses=_DECISION_ERRORS,
)
def send_back_step(
    step_id: str, body: SendBackRequest, principal: PrincipalDep, service: ApprovalsServiceDep
) -> ClaimDetail:
    return service.send_back(principal, step_id, body)


@router.post(
    "/approvals/{step_id}/reassign",
    response_model=ClaimDetail,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_reassign_step",
    summary="Finance head moves an open step to another eligible approver (audited)",
    responses=_DECISION_ERRORS,
)
def reassign_step(
    step_id: str, body: ReassignRequest, principal: PrincipalDep, service: ApprovalsServiceDep
) -> ClaimDetail:
    return service.reassign(principal, step_id, body.assignee_id)


@router.get(
    "/delegations",
    response_model=list[DelegationRead],
    status_code=status.HTTP_200_OK,
    operation_id="approvals_list_delegations",
    summary="Delegations I gave or received",
    responses=error_responses(401, 500),
)
def list_delegations(principal: PrincipalDep, service: ApprovalsServiceDep) -> list[DelegationRead]:
    return service.delegations(principal)


@router.post(
    "/delegations",
    response_model=DelegationRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="approvals_create_delegation",
    summary="Leave cover for one level: max 30 days, same-or-higher role, one active per level",
    responses=error_responses(400, 401, 403, 404, 409, 500),
)
def create_delegation(
    body: DelegationCreate, principal: PrincipalDep, service: ApprovalsServiceDep
) -> DelegationRead:
    return service.create_delegation(principal, body)


@router.delete(
    "/delegations/{delegation_id}",
    response_model=DelegationRead,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_revoke_delegation",
    summary="Revoke a delegation I gave",
    responses=error_responses(401, 404, 500),
)
def revoke_delegation(
    delegation_id: str, principal: PrincipalDep, service: ApprovalsServiceDep
) -> DelegationRead:
    return service.revoke_delegation(principal, delegation_id)


@router.get(
    "/review-queue",
    response_model=Page[ClaimSummary],
    status_code=status.HTTP_200_OK,
    operation_id="approvals_list_review_queue",
    summary="Auditor queue (oldest first); sample_audit=true lists claims awaiting a sample audit",
    responses=error_responses(400, 401, 403, 500),
)
def list_review_queue(  # noqa: PLR0913 - one query parameter per ARD filter
    principal: PrincipalDep,
    service: ApprovalsServiceDep,
    page: PageDep,
    department_id: Annotated[str | None, Query(max_length=36)] = None,
    category: Category | None = None,
    min_payable_paise: Annotated[int | None, Query(ge=0)] = None,
    max_payable_paise: Annotated[int | None, Query(ge=0)] = None,
    submitted_from: datetime | None = None,
    submitted_to: datetime | None = None,
    flag: Annotated[str | None, Query(max_length=64, description="policy rule code")] = None,
    owner_id: Annotated[str | None, Query(max_length=36)] = None,
    sample_audit: bool = False,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[ClaimSummary]:
    return service.review_queue(
        principal,
        ReviewFilter(
            department_id=department_id,
            category=category,
            min_payable_paise=min_payable_paise,
            max_payable_paise=max_payable_paise,
            submitted_from=submitted_from,
            submitted_to=submitted_to,
            rule_code=flag,
            owner_id=owner_id,
            sample_audit=sample_audit,
            q=q,
        ),
        page,
    )


@router.post(
    "/review-queue/bulk-approve",
    response_model=BulkApproveResult,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_bulk_approve",
    summary="Up to 50 auditor-level claims; risky ones are SKIPPED with a reason",
    responses=error_responses(400, 401, 403, 500),
)
def bulk_approve(
    body: BulkApproveRequest, principal: PrincipalDep, service: ApprovalsServiceDep
) -> BulkApproveResult:
    return service.bulk_approve(principal, body)


@router.get(
    "/sample-audits",
    response_model=Page[SampleAuditRead],
    status_code=status.HTTP_200_OK,
    operation_id="approvals_list_sample_audits",
    responses=error_responses(400, 401, 403, 500),
)
def list_sample_audits(
    principal: PrincipalDep,
    service: ApprovalsServiceDep,
    page: PageDep,
    sample_status: Annotated[
        Literal["PENDING", "PASSED", "FAILED"] | None, Query(alias="status")
    ] = None,
) -> Page[SampleAuditRead]:
    return service.sample_audits(principal, sample_status, page)


@router.post(
    "/sample-audits/{sample_id}/resolve",
    response_model=SampleAuditRead,
    status_code=status.HTTP_200_OK,
    operation_id="approvals_resolve_sample_audit",
    summary="PASSED releases the claim for payout; FAILED reopens it at the auditor level",
    responses=error_responses(400, 401, 403, 404, 409, 500),
)
def resolve_sample_audit(
    sample_id: str, body: SampleResolve, principal: PrincipalDep, service: ApprovalsServiceDep
) -> SampleAuditRead:
    return service.resolve_sample(principal, sample_id, body)
