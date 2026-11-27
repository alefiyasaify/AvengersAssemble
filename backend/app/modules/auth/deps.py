from typing import Annotated

from fastapi import Depends, Request

from app.core.clock import ClockDep
from app.core.deps import DbSession, SettingsDep
from app.modules.audit.service import AuditService
from app.modules.auth.service import AuthService, LoginGuard
from app.modules.org.service import org_service


def _guard(request: Request, settings: SettingsDep) -> LoginGuard:
    """One guard per app instance, kept on app.state (not a module global)."""
    state = request.app.state
    if not hasattr(state, "login_guard"):
        state.login_guard = LoginGuard(
            settings.login_max_failures, settings.login_lockout_minutes * 60.0
        )
    guard: LoginGuard = state.login_guard
    return guard


def get_auth_service(
    request: Request, session: DbSession, settings: SettingsDep, clock: ClockDep
) -> AuthService:
    audit = AuditService(session, clock)
    return AuthService(org_service(session, audit), audit, settings, _guard(request, settings))


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
