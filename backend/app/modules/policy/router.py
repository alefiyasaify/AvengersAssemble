from fastapi import APIRouter, status

from app.core.auth import PrincipalDep
from app.core.errors import error_responses
from app.modules.policy.deps import PolicyServiceDep
from app.modules.policy.schemas import (
    AppConfigRead,
    AppConfigUpdate,
    ApprovalLevelConfig,
    ApprovalLevelsUpdate,
    PolicyVersionCreate,
    PolicyVersionRead,
    PolicyVersionUpdate,
)

router = APIRouter(tags=["policy"])


@router.get(
    "/policy/active",
    response_model=PolicyVersionRead,
    status_code=status.HTTP_200_OK,
    operation_id="policy_get_active",
    summary="The policy new submissions are evaluated against (read-only for everyone)",
    responses=error_responses(401, 500, 503),
)
def get_active(principal: PrincipalDep, service: PolicyServiceDep) -> PolicyVersionRead:
    return service.active_read()


@router.get(
    "/admin/policy/versions",
    response_model=list[PolicyVersionRead],
    status_code=status.HTTP_200_OK,
    operation_id="policy_list_versions",
    responses=error_responses(401, 403, 500),
)
def list_versions(principal: PrincipalDep, service: PolicyServiceDep) -> list[PolicyVersionRead]:
    return service.versions(principal)


@router.post(
    "/admin/policy/versions",
    response_model=PolicyVersionRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="policy_create_version",
    summary="Start a DRAFT version (copied from the active one unless rules are given)",
    responses=error_responses(400, 401, 403, 500),
)
def create_version(
    body: PolicyVersionCreate, principal: PrincipalDep, service: PolicyServiceDep
) -> PolicyVersionRead:
    return service.create_draft(principal, body.notes, body.rules)


@router.put(
    "/admin/policy/versions/{version_id}",
    response_model=PolicyVersionRead,
    status_code=status.HTTP_200_OK,
    operation_id="policy_update_version",
    summary="Edit a DRAFT version (published versions are immutable)",
    responses=error_responses(400, 401, 403, 404, 409, 500),
)
def update_version(
    version_id: str, body: PolicyVersionUpdate, principal: PrincipalDep, service: PolicyServiceDep
) -> PolicyVersionRead:
    return service.update_draft(principal, version_id, body.notes, body.rules)


@router.post(
    "/admin/policy/versions/{version_id}/publish",
    response_model=PolicyVersionRead,
    status_code=status.HTTP_200_OK,
    operation_id="policy_publish_version",
    summary="Atomically retire the active version and activate this draft (audited with a diff)",
    responses=error_responses(400, 401, 403, 404, 409, 500),
)
def publish_version(
    version_id: str, principal: PrincipalDep, service: PolicyServiceDep
) -> PolicyVersionRead:
    return service.publish(principal, version_id)


@router.get(
    "/admin/approval-levels",
    response_model=list[ApprovalLevelConfig],
    status_code=status.HTTP_200_OK,
    operation_id="policy_list_approval_levels",
    responses=error_responses(401, 403, 500),
)
def list_levels(principal: PrincipalDep, service: PolicyServiceDep) -> list[ApprovalLevelConfig]:
    return service.levels(principal)


@router.put(
    "/admin/approval-levels",
    response_model=list[ApprovalLevelConfig],
    status_code=status.HTTP_200_OK,
    operation_id="policy_update_approval_levels",
    summary="Change thresholds or levels (claims in flight keep their frozen levels)",
    responses=error_responses(400, 401, 403, 500),
)
def update_levels(
    body: ApprovalLevelsUpdate, principal: PrincipalDep, service: PolicyServiceDep
) -> list[ApprovalLevelConfig]:
    return service.set_levels(principal, body.levels)


@router.get(
    "/admin/config",
    response_model=AppConfigRead,
    status_code=status.HTTP_200_OK,
    operation_id="policy_get_config",
    responses=error_responses(401, 403, 500),
)
def get_config(principal: PrincipalDep, service: PolicyServiceDep) -> AppConfigRead:
    return service.config(principal)


@router.put(
    "/admin/config",
    response_model=AppConfigRead,
    status_code=status.HTTP_200_OK,
    operation_id="policy_update_config",
    responses=error_responses(400, 401, 403, 500),
)
def update_config(
    body: AppConfigUpdate, principal: PrincipalDep, service: PolicyServiceDep
) -> AppConfigRead:
    return service.set_config(principal, body)
