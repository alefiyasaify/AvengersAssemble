"""Request principal from the access JWT (cookie or Bearer) and CSRF protection (ADR-0006).

Lives in core so every module can require an authenticated user without importing the auth
module's internals. Role checks for business rules still happen in services.
"""

import hmac
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, Request

from app.core.config import Settings
from app.core.deps import SettingsDep
from app.core.errors import PermissionDeniedError, UnauthenticatedError
from app.core.security import decode_token

Role = Literal["EMPLOYEE", "MANAGER", "AUDITOR", "FINANCE_HEAD"]
ROLES: tuple[Role, ...] = ("EMPLOYEE", "MANAGER", "AUDITOR", "FINANCE_HEAD")

ACCESS_COOKIE = "ef_access"
REFRESH_COOKIE = "ef_refresh"
CSRF_COOKIE = "ef_csrf"
CSRF_HEADER = "X-CSRF-Token"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


@dataclass(frozen=True)
class Principal:
    """The authenticated caller. Business authorisation decisions are made in services."""

    id: str
    role: Role

    @property
    def is_finance(self) -> bool:
        return self.role in ("AUDITOR", "FINANCE_HEAD")

    @property
    def is_head(self) -> bool:
        return self.role == "FINANCE_HEAD"


def _token_from(request: Request) -> tuple[str, bool]:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip(), False
    cookie = request.cookies.get(ACCESS_COOKIE)
    if cookie:
        return cookie, True
    raise UnauthenticatedError("Authentication required.")


def _check_csrf(request: Request) -> None:
    """Double-submit check for cookie-authenticated, state-changing requests."""
    if request.method in _SAFE_METHODS:
        return
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not hmac.compare_digest(cookie, header):
        raise PermissionDeniedError("Missing or invalid CSRF token.", code="CSRF_FAILED")


def principal_from_request(request: Request, settings: Settings) -> Principal:
    token, from_cookie = _token_from(request)
    payload = decode_token(
        token, secret=settings.secret_key.get_secret_value(), expected_type="access"
    )
    if payload.role not in ROLES:
        raise UnauthenticatedError("Invalid or expired token.")
    if from_cookie:
        _check_csrf(request)
    role: Role = payload.role
    return Principal(id=payload.sub, role=role)


def get_principal(request: Request, settings: SettingsDep) -> Principal:
    return principal_from_request(request, settings)


PrincipalDep = Annotated[Principal, Depends(get_principal)]


def require_finance(principal: Principal) -> None:
    if not principal.is_finance:
        raise PermissionDeniedError("Finance role required.")


def require_head(principal: Principal) -> None:
    if not principal.is_head:
        raise PermissionDeniedError("Finance head role required.")
