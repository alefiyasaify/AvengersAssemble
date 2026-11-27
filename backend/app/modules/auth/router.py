"""Sign-in endpoints. Tokens travel only in HttpOnly cookies (ADR-0006); the CSRF token is the
only readable cookie and must be echoed in X-CSRF-Token on state-changing requests."""

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.auth import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE
from app.core.deps import DbSession, SettingsDep
from app.core.errors import UnauthenticatedError, error_json, error_responses, request_id_of
from app.modules.auth.deps import AuthServiceDep
from app.modules.auth.schemas import LoginRequest
from app.modules.auth.service import IssuedTokens
from app.modules.org.schemas import MeRead
from app.modules.org.service import org_service

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_PATH = "/api/v1/auth"


def _set_cookies(response: Response, tokens: IssuedTokens, secure: bool) -> None:
    for name, value, max_age, http_only, path in (
        (ACCESS_COOKIE, tokens.access, tokens.access_max_age, True, "/"),
        (REFRESH_COOKIE, tokens.refresh, tokens.refresh_max_age, True, _REFRESH_PATH),
        (CSRF_COOKIE, tokens.csrf, tokens.refresh_max_age, False, "/"),
    ):
        response.set_cookie(
            name,
            value,
            max_age=max_age,
            httponly=http_only,
            path=path,
            secure=secure,
            samesite="lax",
        )


def _secure(app_env: str) -> bool:
    return app_env not in ("local", "test", "ci")


@router.post(
    "/login",
    response_model=MeRead,
    status_code=status.HTTP_200_OK,
    operation_id="auth_login",
    summary="Sign in; sets HttpOnly session cookies and a CSRF cookie (lockout after 5 failures)",
    responses=error_responses(400, 401, 429, 500),
)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: DbSession,
    settings: SettingsDep,
) -> MeRead | JSONResponse:
    client = request.client.host if request.client else "unknown"
    result = service.login(body.email, body.password, client)
    if result.error is not None or result.user_id is None or result.tokens is None:
        error = result.error or UnauthenticatedError("Email or password is incorrect.")
        # Returned, not raised: the failed-login audit event must commit (ARD 11).
        return error_json(
            error.status_code, error.code, error.message, request_id_of(request), error.details
        )
    _set_cookies(response, result.tokens, _secure(settings.app_env))
    return org_service(session).me(result.user_id)


@router.post(
    "/refresh",
    response_model=MeRead,
    status_code=status.HTTP_200_OK,
    operation_id="auth_refresh_session",
    summary="Rotate session cookies using the refresh cookie",
    responses=error_responses(401, 500),
)
def refresh(
    request: Request,
    response: Response,
    service: AuthServiceDep,
    session: DbSession,
    settings: SettingsDep,
) -> MeRead:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise UnauthenticatedError("Authentication required.")
    user_id, tokens = service.refresh(token)
    _set_cookies(response, tokens, _secure(settings.app_env))
    return org_service(session).me(user_id)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="auth_logout",
    responses=error_responses(500),
)
def logout(response: Response) -> Response:
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_PATH)
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response
