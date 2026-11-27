"""HTTP only: parse, call service, return schema. Unauthenticated by design (probes)."""

from fastapi import APIRouter, status

from app.core.errors import error_responses
from app.modules.health.deps import HealthServiceDep, VersionServiceDep
from app.modules.health.schemas import LiveRead, ReadyRead, VersionRead

router = APIRouter(tags=["health"])


@router.get(
    "/health/live",
    response_model=LiveRead,
    status_code=status.HTTP_200_OK,
    operation_id="health_get_live",
    summary="Liveness probe",
    responses=error_responses(500),
)
def get_live() -> LiveRead:
    return LiveRead()


@router.get(
    "/health/ready",
    response_model=ReadyRead,
    status_code=status.HTTP_200_OK,
    operation_id="health_get_ready",
    summary="Readiness probe (checks the database)",
    responses=error_responses(500, 503),
)
def get_ready(service: HealthServiceDep) -> ReadyRead:
    return service.check_ready()


@router.get(
    "/version",
    response_model=VersionRead,
    status_code=status.HTTP_200_OK,
    operation_id="health_get_version",
    summary="Service version and build commit",
    responses=error_responses(500),
)
def get_version(service: VersionServiceDep) -> VersionRead:
    return service.get_version()
