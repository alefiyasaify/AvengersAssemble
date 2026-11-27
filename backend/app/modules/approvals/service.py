"""Approver-facing workflows (ARD section 6): inbox, decisions, delegation, auditor queue, bulk
approve and sample audits.

The claim tables belong to the claims module, so this service is a thin facade over
`claims.service.ClaimsService`; it adds no rules of its own. Keeping a separate module keeps the
HTTP surface for approvers apart from claim capture, as the ARD's API sections are split.
"""

from app.core.auth import Principal
from app.core.pagination import Page, PageParams
from app.modules.claims.schemas import (
    ApproveRequest,
    BulkApproveRequest,
    BulkApproveResult,
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
from app.modules.claims.service import ClaimsService, ReviewFilter

__all__ = ["ApprovalsService", "ReviewFilter"]


class ApprovalsService:
    def __init__(self, claims: ClaimsService) -> None:
        self._claims = claims

    def inbox(self, principal: Principal, page: PageParams) -> Page[InboxItem]:
        return self._claims.inbox(principal, page)

    def approve(self, principal: Principal, step_id: str, body: ApproveRequest) -> ClaimDetail:
        return self._claims.approve(principal, step_id, body)

    def reject(self, principal: Principal, step_id: str, body: RejectRequest) -> ClaimDetail:
        return self._claims.reject(principal, step_id, body)

    def send_back(self, principal: Principal, step_id: str, body: SendBackRequest) -> ClaimDetail:
        return self._claims.send_back(principal, step_id, body)

    def reassign(self, principal: Principal, step_id: str, assignee_id: str) -> ClaimDetail:
        return self._claims.reassign(principal, step_id, assignee_id)

    def delegations(self, principal: Principal) -> list[DelegationRead]:
        return self._claims.delegations(principal)

    def create_delegation(self, principal: Principal, body: DelegationCreate) -> DelegationRead:
        return self._claims.create_delegation(principal, body)

    def revoke_delegation(self, principal: Principal, delegation_id: str) -> DelegationRead:
        return self._claims.revoke_delegation(principal, delegation_id)

    def review_queue(
        self, principal: Principal, f: ReviewFilter, page: PageParams
    ) -> Page[ClaimSummary]:
        return self._claims.review_queue(principal, f, page)

    def bulk_approve(self, principal: Principal, body: BulkApproveRequest) -> BulkApproveResult:
        return self._claims.bulk_approve(principal, body)

    def sample_audits(
        self, principal: Principal, status: str | None, page: PageParams
    ) -> Page[SampleAuditRead]:
        return self._claims.sample_audits(principal, status, page)

    def resolve_sample(
        self, principal: Principal, sample_id: str, body: SampleResolve
    ) -> SampleAuditRead:
        return self._claims.resolve_sample(principal, sample_id, body)
