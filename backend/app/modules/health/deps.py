from typing import Annotated

from fastapi import Depends

from app import __version__
from app.core.deps import DbSession, SettingsDep
from app.modules.health.repository import HealthRepository
from app.modules.health.service import HealthService, VersionService


def get_health_service(session: DbSession) -> HealthService:
    return HealthService(HealthRepository(session))


def get_version_service(settings: SettingsDep) -> VersionService:
    return VersionService(version=__version__, commit=settings.git_sha)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
VersionServiceDep = Annotated[VersionService, Depends(get_version_service)]
